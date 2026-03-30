"""
CodeMind AI - FastAPI Application
Production-ready agentic RAG for developer codebases.
"""
import os
import time
import structlog
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.api.ingest import router as ingest_router
from app.api.chat import router as chat_router

# Configure structured logging
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO level
)

logger = structlog.get_logger()
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    # Startup
    logger.info("codemind_starting", version=settings.app_version, provider=settings.llm_provider)
    
    # Create required directories
    os.makedirs(settings.faiss_index_path, exist_ok=True)
    os.makedirs(settings.temp_dir, exist_ok=True)

    # Warm up embeddings (optional)
    try:
        from app.core.vector_store import get_vector_store
        vs = get_vector_store()
        logger.info("vector_store_initialized")
    except Exception as e:
        logger.warning("vector_store_warmup_failed", error=str(e))

    logger.info("codemind_ready", host=settings.host, port=settings.port)
    yield

    # Shutdown
    logger.info("codemind_shutting_down")


app = FastAPI(
    title="CodeMind AI",
    description="Agentic RAG-based developer assistant for codebase understanding",
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 2)
    logger.info(
        "http_request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=duration,
    )
    return response


# Routes
app.include_router(ingest_router)
app.include_router(chat_router)


@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "version": settings.app_version,
        "llm_provider": settings.llm_provider,
        "model": settings.openai_model if settings.llm_provider == "openai" else settings.ollama_model,
    }


@app.get("/")
async def root():
    return {"message": "CodeMind AI API", "docs": "/api/docs"}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("unhandled_exception", error=str(exc), path=request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "message": str(exc)},
    )
