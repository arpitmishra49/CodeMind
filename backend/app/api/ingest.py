"""
Ingestion API Routes
Handles: ZIP upload, GitHub URL ingestion, session management
"""
import os
import time
import shutil
import asyncio
import tempfile
from typing import Optional

import structlog
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel, HttpUrl

from app.config import get_settings
from app.core.ingestion import get_ingestion_engine
from app.core.vector_store import get_vector_store
from app.core.session_manager import get_session_manager, Session

logger = structlog.get_logger()
settings = get_settings()
router = APIRouter(prefix="/api/ingest", tags=["ingestion"])


class GitHubIngestRequest(BaseModel):
    github_url: str
    session_id: Optional[str] = None


class IngestResponse(BaseModel):
    session_id: str
    repo_name: str
    total_files: int
    total_chunks: int
    languages: dict
    status: str
    message: str


async def _run_ingestion(base_dir: str, session_id: str, source: str, temp_dir: str):
    """Background task: ingest repo and build vector index."""
    sm = get_session_manager()
    engine = get_ingestion_engine()
    vs = get_vector_store()

    try:
        logger.info("ingestion_started", session=session_id, source=source)

        # Ingest files
        result = await engine.ingest_directory(base_dir, session_id, source)

        if not result.documents:
            raise ValueError("No processable files found in repository")

        # Build vector index
        await vs.build_index(result.documents, session_id)

        # Save session
        session = Session(
            session_id=session_id,
            repo_name=result.repo_name,
            total_files=result.total_files,
            total_chunks=result.total_chunks,
            languages=result.languages,
            file_tree=result.file_tree,
            status="ready",
            temp_dir=temp_dir,
            errors=result.errors,
        )
        sm.save_session(session)
        logger.info("ingestion_complete", session=session_id, files=result.total_files, chunks=result.total_chunks)

    except Exception as e:
        logger.error("ingestion_failed", session=session_id, error=str(e))
        # Create failed session record
        session = Session(
            session_id=session_id,
            repo_name=source,
            total_files=0,
            total_chunks=0,
            languages={},
            file_tree={},
            status="error",
            errors=[str(e)],
        )
        sm.save_session(session)


@router.post("/zip", response_model=IngestResponse)
async def ingest_zip(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Upload a ZIP file of a repository for ingestion."""
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are supported")

    sm = get_session_manager()
    engine = get_ingestion_engine()
    vs = get_vector_store()
    session_id = sm.create_session()

    # Save upload to temp dir
    temp_dir = os.path.join(settings.temp_dir, session_id)
    os.makedirs(temp_dir, exist_ok=True)

    zip_path = os.path.join(temp_dir, "upload.zip")
    try:
        content = await file.read()
        if len(content) > settings.max_repo_size_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Max: {settings.max_repo_size_mb}MB"
            )

        with open(zip_path, "wb") as f:
            f.write(content)

        # Extract
        import zipfile
        extract_dir = os.path.join(temp_dir, "extracted")
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        # Find repo root
        from pathlib import Path
        entries = list(Path(extract_dir).iterdir())
        repo_root = str(entries[0]) if len(entries) == 1 and entries[0].is_dir() else extract_dir
        repo_name = Path(repo_root).name

        # Quick ingest (synchronous for small repos, background for large)
        result = await engine.ingest_directory(repo_root, session_id, repo_name)

        if not result.documents:
            raise HTTPException(status_code=400, detail="No processable code files found")

        await vs.build_index(result.documents, session_id)

        from app.core.session_manager import Session
        session = Session(
            session_id=session_id,
            repo_name=result.repo_name,
            total_files=result.total_files,
            total_chunks=result.total_chunks,
            languages=result.languages,
            file_tree=result.file_tree,
            status="ready",
            temp_dir=temp_dir,
            errors=result.errors,
        )
        sm.save_session(session)

        return IngestResponse(
            session_id=session_id,
            repo_name=result.repo_name,
            total_files=result.total_files,
            total_chunks=result.total_chunks,
            languages=result.languages,
            status="ready",
            message=f"Successfully indexed {result.total_files} files ({result.total_chunks} chunks)",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("zip_ingest_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")


@router.post("/github", response_model=IngestResponse)
async def ingest_github(request: GitHubIngestRequest):
    """Ingest a GitHub repository by URL."""
    sm = get_session_manager()
    engine = get_ingestion_engine()
    vs = get_vector_store()
    session_id = request.session_id or sm.create_session()

    try:
        result = await engine.ingest_github(request.github_url, session_id)

        if not result.documents:
            raise HTTPException(status_code=400, detail="No processable code files found")

        await vs.build_index(result.documents, session_id)

        from app.core.session_manager import Session
        temp_dir = os.path.join(settings.temp_dir, session_id)
        session = Session(
            session_id=session_id,
            repo_name=result.repo_name,
            total_files=result.total_files,
            total_chunks=result.total_chunks,
            languages=result.languages,
            file_tree=result.file_tree,
            status="ready",
            temp_dir=temp_dir,
            errors=result.errors,
        )
        sm.save_session(session)

        return IngestResponse(
            session_id=session_id,
            repo_name=result.repo_name,
            total_files=result.total_files,
            total_chunks=result.total_chunks,
            languages=result.languages,
            status="ready",
            message=f"Successfully indexed {result.total_files} files ({result.total_chunks} chunks)",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("github_ingest_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"GitHub ingestion failed: {str(e)}")


@router.get("/session/{session_id}")
async def get_session(session_id: str):
    """Get session info and status."""
    sm = get_session_manager()
    session = sm.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.to_dict()


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a session and its index."""
    sm = get_session_manager()
    vs = get_vector_store()
    sm.delete_session(session_id)
    vs.delete_index(session_id)
    return {"message": "Session deleted"}
