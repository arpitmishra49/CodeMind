"""
Code Ingestion Engine
Handles parsing, chunking, and embedding of codebases.
Supports: local zip uploads, GitHub URLs, directory paths.
"""
import os
import re
import zipfile
import tempfile
import shutil
import asyncio
import hashlib
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field

import httpx
import structlog
from git import Repo
from github import Github, GithubException
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()

# File extensions to process
SUPPORTED_EXTENSIONS = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".jsx": "javascript",
    ".tsx": "typescript",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".cpp": "cpp",
    ".c": "c",
    ".h": "c",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".r": "r",
    ".sql": "sql",
    ".sh": "bash",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
    ".toml": "toml",
    ".md": "markdown",
    ".txt": "text",
    ".env.example": "text",
    ".dockerfile": "dockerfile",
}

# Directories to skip
SKIP_DIRS = {
    ".git", "__pycache__", "node_modules", ".venv", "venv", "env",
    "dist", "build", ".next", ".nuxt", "coverage", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", "*.egg-info", ".DS_Store",
}


@dataclass
class IngestedFile:
    path: str
    language: str
    content: str
    size: int
    checksum: str


@dataclass 
class IngestionResult:
    session_id: str
    repo_name: str
    total_files: int
    total_chunks: int
    documents: List[Document]
    file_tree: Dict
    languages: Dict[str, int]
    errors: List[str] = field(default_factory=list)


class CodeSplitter:
    """Language-aware code splitter."""

    SEPARATORS_BY_LANG = {
        "python": ["\nclass ", "\ndef ", "\n\n", "\n", " ", ""],
        "javascript": ["\nfunction ", "\nclass ", "\nconst ", "\nlet ", "\nvar ", "\n\n", "\n", " ", ""],
        "typescript": ["\nfunction ", "\nclass ", "\ninterface ", "\ntype ", "\nconst ", "\n\n", "\n", " ", ""],
        "java": ["\nclass ", "\npublic ", "\nprivate ", "\nprotected ", "\n\n", "\n", " ", ""],
        "go": ["\nfunc ", "\ntype ", "\nvar ", "\n\n", "\n", " ", ""],
        "rust": ["\nfn ", "\nimpl ", "\nstruct ", "\nenum ", "\n\n", "\n", " ", ""],
    }

    DEFAULT_SEPARATORS = ["\n\n", "\n", " ", ""]

    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 200):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

    def split(self, content: str, language: str) -> List[str]:
        separators = self.SEPARATORS_BY_LANG.get(language, self.DEFAULT_SEPARATORS)
        splitter = RecursiveCharacterTextSplitter(
            separators=separators,
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            length_function=len,
            is_separator_regex=False,
        )
        return splitter.split_text(content)


class CodeIngestionEngine:
    """Main ingestion engine for processing codebases."""

    def __init__(self):
        self.splitter = CodeSplitter(
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

    def _get_language(self, filepath: str) -> Optional[str]:
        path = Path(filepath)
        ext = path.suffix.lower()
        # Check full filename for special cases
        name = path.name.lower()
        if name == "dockerfile":
            return "dockerfile"
        return SUPPORTED_EXTENSIONS.get(ext)

    def _should_skip(self, path: Path) -> bool:
        parts = set(path.parts)
        return bool(parts & SKIP_DIRS)

    def _build_file_tree(self, files: List[IngestedFile], base_path: str) -> Dict:
        tree = {}
        for f in files:
            rel = f.path.replace(base_path, "").lstrip("/\\")
            parts = Path(rel).parts
            node = tree
            for part in parts[:-1]:
                node = node.setdefault(part, {})
            node[parts[-1]] = {"type": "file", "language": f.language, "size": f.size}
        return tree

    def _read_files(self, base_dir: str) -> Tuple[List[IngestedFile], List[str]]:
        files = []
        errors = []
        base = Path(base_dir)

        for filepath in base.rglob("*"):
            if not filepath.is_file():
                continue
            if self._should_skip(filepath):
                continue

            language = self._get_language(str(filepath))
            if not language:
                continue

            size = filepath.stat().st_size
            if size > settings.max_file_size_bytes:
                errors.append(f"Skipped {filepath.name}: exceeds {settings.max_file_size_mb}MB limit")
                continue
            if size == 0:
                continue

            try:
                content = filepath.read_text(encoding="utf-8", errors="replace")
                checksum = hashlib.md5(content.encode()).hexdigest()
                files.append(IngestedFile(
                    path=str(filepath),
                    language=language,
                    content=content,
                    size=size,
                    checksum=checksum,
                ))
            except Exception as e:
                errors.append(f"Error reading {filepath.name}: {str(e)}")

        return files, errors

    def _files_to_documents(
        self, files: List[IngestedFile], session_id: str, repo_name: str, base_dir: str
    ) -> List[Document]:
        documents = []
        for f in files:
            rel_path = f.path.replace(base_dir, "").lstrip("/\\")
            chunks = self.splitter.split(f.content, f.language)
            chunks = chunks[:settings.max_chunks_per_file]

            for i, chunk in enumerate(chunks):
                doc = Document(
                    page_content=chunk,
                    metadata={
                        "session_id": session_id,
                        "repo_name": repo_name,
                        "file_path": rel_path,
                        "language": f.language,
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                        "file_size": f.size,
                        "checksum": f.checksum,
                        "source": f"{repo_name}/{rel_path}",
                    },
                )
                documents.append(doc)

        return documents

    def _count_languages(self, files: List[IngestedFile]) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for f in files:
            counts[f.language] = counts.get(f.language, 0) + 1
        return dict(sorted(counts.items(), key=lambda x: x[1], reverse=True))

    async def ingest_directory(self, base_dir: str, session_id: str, repo_name: str) -> IngestionResult:
        logger.info("ingesting_directory", path=base_dir, session=session_id)
        files, errors = self._read_files(base_dir)
        documents = self._files_to_documents(files, session_id, repo_name, base_dir)
        file_tree = self._build_file_tree(files, base_dir)
        languages = self._count_languages(files)

        return IngestionResult(
            session_id=session_id,
            repo_name=repo_name,
            total_files=len(files),
            total_chunks=len(documents),
            documents=documents,
            file_tree=file_tree,
            languages=languages,
            errors=errors,
        )

    async def ingest_zip(self, zip_path: str, session_id: str) -> IngestionResult:
        """Process an uploaded ZIP file."""
        extract_dir = os.path.join(settings.temp_dir, session_id, "extracted")
        os.makedirs(extract_dir, exist_ok=True)

        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                total_size = sum(i.file_size for i in zf.infolist())
                if total_size > settings.max_repo_size_bytes:
                    raise ValueError(f"Repository too large: {total_size / 1024**2:.1f}MB")
                zf.extractall(extract_dir)

            # Find actual repo root (handle single top-level folder)
            entries = list(Path(extract_dir).iterdir())
            repo_root = str(entries[0]) if len(entries) == 1 and entries[0].is_dir() else extract_dir
            repo_name = Path(repo_root).name

            return await self.ingest_directory(repo_root, session_id, repo_name)
        finally:
            pass  # Cleanup handled by session manager

    async def ingest_github(self, github_url: str, session_id: str) -> IngestionResult:
        """Clone and process a GitHub repository."""
        # Parse URL
        match = re.match(
            r"https?://github\.com/([^/]+)/([^/]+?)(?:\.git)?(?:/.*)?$",
            github_url.strip(),
        )
        if not match:
            raise ValueError(f"Invalid GitHub URL: {github_url}")

        owner, repo_name = match.group(1), match.group(2)
        clone_dir = os.path.join(settings.temp_dir, session_id, "repo")

        try:
            logger.info("cloning_repo", owner=owner, repo=repo_name)
            env = {}
            if settings.github_token:
                clone_url = f"https://{settings.github_token}@github.com/{owner}/{repo_name}.git"
            else:
                clone_url = f"https://github.com/{owner}/{repo_name}.git"

            await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: Repo.clone_from(clone_url, clone_dir, depth=1),
            )
            return await self.ingest_directory(clone_dir, session_id, repo_name)

        except Exception as e:
            logger.error("github_clone_failed", error=str(e))
            raise


# Singleton
_engine: Optional[CodeIngestionEngine] = None


def get_ingestion_engine() -> CodeIngestionEngine:
    global _engine
    if _engine is None:
        _engine = CodeIngestionEngine()
    return _engine
