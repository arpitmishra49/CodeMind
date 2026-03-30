#!/usr/bin/env python3
"""Run CodeMind AI backend server."""
import uvicorn
from app.config import get_settings

settings = get_settings()

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
        access_log=False,  # We handle logging ourselves
    )
