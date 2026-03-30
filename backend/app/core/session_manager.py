"""
Session Manager
Tracks active sessions, repo metadata, and chat history.
In-memory for simplicity; can be backed by Redis for production scaling.
"""
import uuid
import time
import shutil
import os
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field

import structlog

from app.config import get_settings

logger = structlog.get_logger()
settings = get_settings()


@dataclass
class ChatMessage:
    role: str  # "user" | "assistant"
    content: str
    timestamp: float = field(default_factory=time.time)
    metadata: Dict = field(default_factory=dict)


@dataclass
class Session:
    session_id: str
    repo_name: str
    total_files: int
    total_chunks: int
    languages: Dict[str, int]
    file_tree: Dict
    created_at: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)
    chat_history: List[ChatMessage] = field(default_factory=list)
    status: str = "ready"  # indexing | ready | error
    temp_dir: Optional[str] = None
    errors: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict:
        return {
            "session_id": self.session_id,
            "repo_name": self.repo_name,
            "total_files": self.total_files,
            "total_chunks": self.total_chunks,
            "languages": self.languages,
            "file_tree": self.file_tree,
            "created_at": self.created_at,
            "last_active": self.last_active,
            "status": self.status,
            "errors": self.errors,
            "message_count": len(self.chat_history),
        }


class SessionManager:
    """Manages user sessions and chat history."""

    SESSION_TTL = 3600 * 24  # 24 hours

    def __init__(self):
        self._sessions: Dict[str, Session] = {}

    def create_session(self) -> str:
        session_id = str(uuid.uuid4())
        return session_id

    def save_session(self, session: Session):
        self._sessions[session.session_id] = session
        logger.info("session_saved", session_id=session.session_id)

    def get_session(self, session_id: str) -> Optional[Session]:
        session = self._sessions.get(session_id)
        if session:
            session.last_active = time.time()
        return session

    def session_exists(self, session_id: str) -> bool:
        return session_id in self._sessions

    def add_message(self, session_id: str, role: str, content: str, metadata: Dict = None):
        session = self.get_session(session_id)
        if session:
            session.chat_history.append(ChatMessage(
                role=role,
                content=content,
                metadata=metadata or {},
            ))
            # Keep last 50 messages
            if len(session.chat_history) > 50:
                session.chat_history = session.chat_history[-50:]

    def get_chat_history(self, session_id: str) -> List[Dict]:
        session = self.get_session(session_id)
        if not session:
            return []
        return [
            {"role": m.role, "content": m.content, "timestamp": m.timestamp}
            for m in session.chat_history
        ]

    def delete_session(self, session_id: str):
        session = self._sessions.pop(session_id, None)
        if session and session.temp_dir and os.path.exists(session.temp_dir):
            shutil.rmtree(session.temp_dir, ignore_errors=True)
        logger.info("session_deleted", session_id=session_id)

    def cleanup_expired(self):
        """Remove sessions older than TTL."""
        now = time.time()
        expired = [
            sid for sid, s in self._sessions.items()
            if now - s.last_active > self.SESSION_TTL
        ]
        for sid in expired:
            self.delete_session(sid)
        if expired:
            logger.info("sessions_cleaned", count=len(expired))

    def list_sessions(self) -> List[Dict]:
        return [s.to_dict() for s in self._sessions.values()]


# Singleton
_manager: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    global _manager
    if _manager is None:
        _manager = SessionManager()
    return _manager
