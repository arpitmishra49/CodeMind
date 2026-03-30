"""
Application configuration using Pydantic Settings.
All values are loaded from environment variables / .env file.
"""
from functools import lru_cache
from typing import List, Literal
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_name: str = "CodeMind AI"
    app_version: str = "1.0.0"
    debug: bool = False
    log_level: str = "INFO"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # LLM Provider — choose: "openai", "gemini", or "ollama"
    llm_provider: Literal["openai", "gemini", "ollama"] = "gemini"

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    # Gemini (FREE tier available)
    # Get key at: https://aistudio.google.com/app/apikey
    google_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    gemini_embedding_model: str = "models/gemini-embedding-001"

    # Ollama (local, completely free - no API key needed)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    # GitHub (optional - for private repos and higher rate limits)
    github_token: str = ""

    # Vector Store
    faiss_index_path: str = "./data/faiss_indexes"
    chunk_size: int = 1000
    chunk_overlap: int = 200
    max_chunks_per_file: int = 100
    retrieval_k: int = 8
    retrieval_score_threshold: float = 0.3

    # File Processing
    max_file_size_mb: int = 10
    temp_dir: str = "./data/temp"
    max_repo_size_mb: int = 500

    # Redis (optional)
    redis_url: str = "redis://localhost:6379/0"

    # Security
    secret_key: str = "change-this-in-production"
    rate_limit_per_minute: int = 60

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    @property
    def max_repo_size_bytes(self) -> int:
        return self.max_repo_size_mb * 1024 * 1024


@lru_cache()
def get_settings() -> Settings:
    return Settings()
