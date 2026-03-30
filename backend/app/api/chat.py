"""
Chat API Routes
Handles: query, streaming, chat history
"""
from typing import Optional, List
import json

import structlog
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agents.code_agent import get_agent
from app.core.session_manager import get_session_manager

logger = structlog.get_logger()
router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    session_id: str
    message: str
    stream: bool = True


class ChatResponse(BaseModel):
    answer: str
    query_type: str
    sources: List[dict]
    session_id: str


@router.post("/query", response_model=ChatResponse)
async def query(request: ChatRequest):
    """Non-streaming query endpoint."""
    sm = get_session_manager()
    session = sm.get_session(request.session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found. Please ingest a repository first.")

    if session.status != "ready":
        raise HTTPException(status_code=400, detail=f"Session not ready: {session.status}")

    agent = get_agent()
    sm.add_message(request.session_id, "user", request.message)

    try:
        result = await agent.run(
            query=request.message,
            session_id=request.session_id,
            chat_history=sm.get_chat_history(request.session_id),
            repo_context={
                "repo_name": session.repo_name,
                "total_files": session.total_files,
                "languages": session.languages,
            },
        )

        sm.add_message(
            request.session_id,
            "assistant",
            result["answer"],
            metadata={"query_type": result["query_type"], "source_count": len(result["sources"])},
        )

        return ChatResponse(
            answer=result["answer"],
            query_type=result["query_type"],
            sources=result["sources"],
            session_id=request.session_id,
        )

    except Exception as e:
        logger.error("query_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")


@router.post("/stream")
async def stream_query(request: ChatRequest):
    """Server-Sent Events streaming query endpoint."""
    sm = get_session_manager()
    session = sm.get_session(request.session_id)

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status != "ready":
        raise HTTPException(status_code=400, detail=f"Session not ready: {session.status}")

    agent = get_agent()
    sm.add_message(request.session_id, "user", request.message)

    repo_context = {
        "repo_name": session.repo_name,
        "total_files": session.total_files,
        "languages": session.languages,
    }

    async def event_generator():
        full_response = ""
        try:
            async for chunk in agent.stream(
                query=request.message,
                session_id=request.session_id,
                chat_history=sm.get_chat_history(request.session_id),
                repo_context=repo_context,
            ):
                yield chunk
                # Track full response for history
                try:
                    data = json.loads(chunk.replace("data: ", "").strip())
                    if data.get("type") == "done":
                        full_response = data.get("full_response", "")
                except Exception:
                    pass

            # Save to history
            if full_response:
                sm.add_message(request.session_id, "assistant", full_response)

        except Exception as e:
            logger.error("stream_failed", error=str(e))
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history/{session_id}")
async def get_history(session_id: str):
    """Get chat history for a session."""
    sm = get_session_manager()
    if not sm.session_exists(session_id):
        raise HTTPException(status_code=404, detail="Session not found")
    return {"history": sm.get_chat_history(session_id)}


@router.delete("/history/{session_id}")
async def clear_history(session_id: str):
    """Clear chat history for a session."""
    sm = get_session_manager()
    session = sm.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.chat_history = []
    return {"message": "History cleared"}
