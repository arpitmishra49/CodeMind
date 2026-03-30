"""
FAISS Vector Store Manager
Handles embedding generation, storage, retrieval, and persistence.
Supports: OpenAI embeddings, Gemini embeddings, Ollama embeddings.
"""
import os
from typing import List, Dict, Optional
from pathlib import Path

import structlog
from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


def get_embeddings():
    """Return the configured embeddings model based on LLM_PROVIDER."""

    if settings.llm_provider == "openai":
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(
            model=settings.openai_embedding_model,
            openai_api_key=settings.openai_api_key,
        )

    elif settings.llm_provider == "gemini":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        import google.generativeai as genai
        genai.configure(api_key=settings.google_api_key)
        return GoogleGenerativeAIEmbeddings(
            model=settings.gemini_embedding_model,
            google_api_key=settings.google_api_key,
            task_type="retrieval_document",
        )

    else:
        from langchain_community.embeddings import OllamaEmbeddings
        return OllamaEmbeddings(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
        )


def get_query_embeddings():
    """Separate embeddings for query time (task_type differs from indexing)."""

    if settings.llm_provider == "gemini":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        return GoogleGenerativeAIEmbeddings(
            model=settings.gemini_embedding_model,
            google_api_key=settings.google_api_key,
            task_type="retrieval_query",
        )

    return get_embeddings()


class VectorStoreManager:
    """Manages FAISS vector stores per session."""

    def __init__(self):
        self.index_path = Path(settings.faiss_index_path)
        self.index_path.mkdir(parents=True, exist_ok=True)
        self._stores: Dict[str, FAISS] = {}
        self._embeddings = get_embeddings()
        self._query_embeddings = get_query_embeddings()

    def _session_path(self, session_id: str) -> Path:
        return self.index_path / session_id

    async def build_index(
        self,
        documents: List[Document],
        session_id: str,
        on_progress=None,
    ) -> int:
        """Build FAISS index from documents. Returns chunk count."""
        if not documents:
            raise ValueError("No documents to index")

        logger.info("building_index", session=session_id, docs=len(documents))

        # Smaller batches for Gemini free tier rate limits
        BATCH_SIZE = 50 if settings.llm_provider == "gemini" else 100
        batches = [documents[i:i + BATCH_SIZE] for i in range(0, len(documents), BATCH_SIZE)]

        store = None
        for i, batch in enumerate(batches):
            if on_progress:
                progress = int((i / len(batches)) * 100)
                await on_progress(progress)

            if store is None:
                store = FAISS.from_documents(batch, self._embeddings)
            else:
                batch_store = FAISS.from_documents(batch, self._embeddings)
                store.merge_from(batch_store)

            # Delay between batches to respect Gemini free tier rate limits
            if settings.llm_provider == "gemini" and i < len(batches) - 1:
                import asyncio
                await asyncio.sleep(1)

        self._stores[session_id] = store

        # Persist to disk
        session_dir = self._session_path(session_id)
        session_dir.mkdir(parents=True, exist_ok=True)
        store.save_local(str(session_dir))

        logger.info("index_built", session=session_id, chunks=len(documents))
        return len(documents)

    def load_index(self, session_id: str) -> bool:
        """Load index from disk into memory cache."""
        if session_id in self._stores:
            return True

        session_dir = self._session_path(session_id)
        index_file = session_dir / "index.faiss"

        if not index_file.exists():
            return False

        try:
            store = FAISS.load_local(
                str(session_dir),
                self._embeddings,
                allow_dangerous_deserialization=True,
            )
            self._stores[session_id] = store
            logger.info("index_loaded", session=session_id)
            return True
        except Exception as e:
            logger.error("index_load_failed", session=session_id, error=str(e))
            return False

    def retrieve(
        self,
        query: str,
        session_id: str,
        k: int = None,
        filter_language: Optional[str] = None,
        filter_file: Optional[str] = None,
    ) -> List[Document]:
        """Retrieve relevant documents for a query."""
        k = k or settings.retrieval_k

        if not self.load_index(session_id):
            raise ValueError(f"No index found for session: {session_id}")

        store = self._stores[session_id]

        # Use query-specific embeddings for better retrieval
        if settings.llm_provider == "gemini":
            store.embedding_function = self._query_embeddings.embed_query

        filter_dict = {}
        if filter_language:
            filter_dict["language"] = filter_language
        if filter_file:
            filter_dict["file_path"] = filter_file

        try:
            if filter_dict:
                docs_with_scores = store.similarity_search_with_score(
                    query, k=k * 2, filter=filter_dict
                )
            else:
                docs_with_scores = store.similarity_search_with_score(query, k=k)

            results = [
                doc for doc, score in docs_with_scores
                if score <= (1 - settings.retrieval_score_threshold)
            ]
            return results[:k]

        except Exception as e:
            logger.error("retrieval_failed", error=str(e))
            return store.similarity_search(query, k=k)

    def delete_index(self, session_id: str):
        """Remove index from memory and disk."""
        self._stores.pop(session_id, None)
        session_dir = self._session_path(session_id)
        if session_dir.exists():
            import shutil
            shutil.rmtree(session_dir)
        logger.info("index_deleted", session=session_id)

    def session_exists(self, session_id: str) -> bool:
        if session_id in self._stores:
            return True
        return (self._session_path(session_id) / "index.faiss").exists()

    def get_index_stats(self, session_id: str) -> Dict:
        if not self.load_index(session_id):
            return {}
        store = self._stores[session_id]
        return {
            "total_vectors": store.index.ntotal,
            "dimension": store.index.d,
        }


# Singleton
_manager: Optional[VectorStoreManager] = None


def get_vector_store() -> VectorStoreManager:
    global _manager
    if _manager is None:
        _manager = VectorStoreManager()
    return _manager