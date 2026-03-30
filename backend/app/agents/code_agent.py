"""
CodeMind AI Agent
LangGraph-powered agent with: Plan → Retrieve → Execute → Respond
Supports: OpenAI, Gemini (free), Ollama (local)
Query types: explanation, debugging, documentation, code review, search
"""
import json
import asyncio
import re
from typing import List, Dict, Any, Optional, AsyncGenerator, TypedDict, Annotated
from enum import Enum

import structlog
from langchain_core.documents import Document
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages

from app.config import get_settings
from app.core.vector_store import get_vector_store

logger = structlog.get_logger()
settings = get_settings()


class QueryType(str, Enum):
    EXPLAIN = "explain"
    DEBUG = "debug"
    DOCUMENT = "document"
    REVIEW = "review"
    SEARCH = "search"
    GENERAL = "general"


class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    session_id: str
    query: str
    query_type: Optional[str]
    retrieved_docs: List[Dict]
    plan: Optional[str]
    final_answer: Optional[str]
    repo_context: Optional[Dict]
    iteration: int


SYSTEM_PROMPT = """You are CodeMind AI, an expert developer assistant that deeply understands codebases.

You have access to the user's codebase via semantic search. Your job is to:
1. Understand the query intent (explain/debug/document/review/search)
2. Analyze the retrieved code context carefully
3. Provide precise, actionable answers grounded in the actual code

GUIDELINES:
- Always reference specific file paths when discussing code
- For debugging: identify root cause, explain why, provide fixed code
- For explanations: be clear, use analogies, show data flow
- For documentation: generate professional JSDoc/docstrings
- For reviews: identify issues by severity (critical/warning/suggestion)
- Always format code blocks with the correct language identifier
- Be concise but complete — developers value precision

When referencing code, use:
`file/path.py` for file references
```python for code blocks

Current codebase info: {repo_context}"""


PLANNER_PROMPT = """Analyze this developer query and create a retrieval plan.

Query: {query}

Respond in JSON format only, no other text:
{{
  "query_type": "explain|debug|document|review|search|general",
  "search_queries": ["query1", "query2", "query3"],
  "reasoning": "brief explanation of approach",
  "focus_areas": ["area1", "area2"]
}}

Rules:
- search_queries: 2-4 targeted queries to retrieve relevant code chunks
- Make queries specific and technical
- For debugging: include error terms and function names
- For explanation: focus on the concept/component being asked about"""


def get_llm(streaming: bool = False):
    """Return the configured LLM based on LLM_PROVIDER setting."""

    if settings.llm_provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.openai_model,
            openai_api_key=settings.openai_api_key,
            temperature=0.1,
            streaming=streaming,
        )

    elif settings.llm_provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=settings.gemini_model,
            google_api_key=settings.google_api_key,
            temperature=0.1,
            streaming=streaming,
            # Gemini safety settings — relaxed for code analysis
            convert_system_message_to_human=True,
        )

    else:
        # Ollama — local, free
        from langchain_community.llms import Ollama
        return Ollama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            temperature=0.1,
        )


class CodeMindAgent:
    """LangGraph-based agentic RAG for code understanding."""

    def __init__(self):
        self.vector_store = get_vector_store()
        self.llm = get_llm(streaming=False)
        self.streaming_llm = get_llm(streaming=True)
        self.graph = self._build_graph()

    def _build_graph(self) -> Any:
        workflow = StateGraph(AgentState)
        workflow.add_node("planner", self._planner_node)
        workflow.add_node("retriever", self._retriever_node)
        workflow.add_node("responder", self._responder_node)
        workflow.set_entry_point("planner")
        workflow.add_edge("planner", "retriever")
        workflow.add_edge("retriever", "responder")
        workflow.add_edge("responder", END)
        return workflow.compile()

    async def _planner_node(self, state: AgentState) -> AgentState:
        """Plan the retrieval strategy based on query intent."""
        logger.info("agent_planning", query=state["query"][:100])

        prompt = PLANNER_PROMPT.format(query=state["query"])

        try:
            response = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.llm.invoke(prompt)
            )
            content = response.content if hasattr(response, "content") else str(response)

            # Extract JSON — handles cases where model wraps in markdown
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                plan_data = json.loads(json_match.group())
            else:
                raise ValueError("No JSON found in planner response")

        except Exception as e:
            logger.warning("planner_fallback", error=str(e))
            plan_data = {
                "query_type": "general",
                "search_queries": [state["query"]],
                "reasoning": "Direct search fallback",
                "focus_areas": [],
            }

        state["query_type"] = plan_data.get("query_type", "general")
        state["plan"] = json.dumps(plan_data)
        logger.info("agent_plan_created", type=state["query_type"])
        return state

    async def _retriever_node(self, state: AgentState) -> AgentState:
        """Retrieve relevant code chunks using planned queries."""
        plan = json.loads(state.get("plan", "{}"))
        search_queries = plan.get("search_queries", [state["query"]])

        all_docs: List[Document] = []
        seen_contents = set()

        for query in search_queries:
            try:
                docs = self.vector_store.retrieve(
                    query=query,
                    session_id=state["session_id"],
                    k=settings.retrieval_k,
                )
                for doc in docs:
                    content_hash = hash(doc.page_content[:200])
                    if content_hash not in seen_contents:
                        seen_contents.add(content_hash)
                        all_docs.append(doc)
            except Exception as e:
                logger.error("retrieval_error", query=query, error=str(e))

        # Sort by file path for coherence
        all_docs.sort(key=lambda d: (
            d.metadata.get("file_path", ""),
            d.metadata.get("chunk_index", 0)
        ))

        state["retrieved_docs"] = [
            {
                "content": doc.page_content,
                "file_path": doc.metadata.get("file_path", "unknown"),
                "language": doc.metadata.get("language", "text"),
                "chunk_index": doc.metadata.get("chunk_index", 0),
                "source": doc.metadata.get("source", ""),
            }
            for doc in all_docs[:15]
        ]

        logger.info("docs_retrieved", count=len(state["retrieved_docs"]))
        return state

    async def _responder_node(self, state: AgentState) -> AgentState:
        """Generate the final response using retrieved context."""
        repo_ctx = state.get("repo_context", {})
        repo_info = f"Repo: {repo_ctx.get('repo_name', 'unknown')}, Files: {repo_ctx.get('total_files', 0)}"

        # Build context from retrieved docs
        context_parts = []
        for doc in state["retrieved_docs"]:
            context_parts.append(
                f"### File: `{doc['file_path']}`\n"
                f"```{doc['language']}\n{doc['content']}\n```"
            )
        context = "\n\n".join(context_parts) if context_parts else "No relevant code found in the repository."

        query_type = state.get("query_type", "general")
        type_instructions = {
            "explain": "Provide a clear, comprehensive explanation with examples from the code.",
            "debug": "Identify the bug, explain the root cause, and provide a corrected version.",
            "document": "Generate professional documentation (docstrings, JSDoc, README sections).",
            "review": "Perform a code review with issues categorized as Critical/Warning/Suggestion.",
            "search": "Find and highlight all relevant code locations answering the query.",
            "general": "Answer the developer's question based on the codebase.",
        }.get(query_type, "Answer the question.")

        # For Gemini: combine system + user into a single human message
        # (Gemini handles system messages differently)
        if settings.llm_provider == "gemini":
            combined_prompt = f"""{SYSTEM_PROMPT.format(repo_context=repo_info)}

---
RETRIEVED CODE CONTEXT:
{context}

---
DEVELOPER QUERY: {state['query']}

TASK: {type_instructions}

Provide a detailed, actionable response grounded in the actual code above."""

            messages = [HumanMessage(content=combined_prompt)]

        else:
            system_msg = SystemMessage(
                content=SYSTEM_PROMPT.format(repo_context=repo_info)
            )
            user_content = f"""RETRIEVED CODE CONTEXT:
{context}

---
DEVELOPER QUERY: {state['query']}

TASK: {type_instructions}

Provide a detailed, actionable response grounded in the actual code above."""
            messages = [system_msg, HumanMessage(content=user_content)]

        response = await asyncio.get_event_loop().run_in_executor(
            None, lambda: self.llm.invoke(messages)
        )

        state["final_answer"] = response.content if hasattr(response, "content") else str(response)
        return state

    async def run(
        self,
        query: str,
        session_id: str,
        chat_history: Optional[List[Dict]] = None,
        repo_context: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Run the full agent pipeline and return complete response."""
        initial_state = AgentState(
            messages=[HumanMessage(content=query)],
            session_id=session_id,
            query=query,
            query_type=None,
            retrieved_docs=[],
            plan=None,
            final_answer=None,
            repo_context=repo_context or {},
            iteration=0,
        )

        result = await self.graph.ainvoke(initial_state)

        return {
            "answer": result["final_answer"],
            "query_type": result["query_type"],
            "sources": result["retrieved_docs"],
            "plan": json.loads(result.get("plan", "{}")),
        }

    async def stream(
        self,
        query: str,
        session_id: str,
        chat_history: Optional[List[Dict]] = None,
        repo_context: Optional[Dict] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream the response token by token via SSE."""
        initial_state = AgentState(
            messages=[HumanMessage(content=query)],
            session_id=session_id,
            query=query,
            query_type=None,
            retrieved_docs=[],
            plan=None,
            final_answer=None,
            repo_context=repo_context or {},
            iteration=0,
        )

        # Step 1 — Plan
        state = await self._planner_node(initial_state)
        yield f"data: {json.dumps({'type': 'plan', 'query_type': state['query_type']})}\n\n"

        # Step 2 — Retrieve
        state = await self._retriever_node(state)
        sources = [
            {"file_path": d["file_path"], "language": d["language"]}
            for d in state["retrieved_docs"]
        ]
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        # Step 3 — Stream the response
        repo_ctx = repo_context or {}
        repo_info = f"Repo: {repo_ctx.get('repo_name', 'unknown')}"

        context_parts = []
        for doc in state["retrieved_docs"]:
            context_parts.append(
                f"### File: `{doc['file_path']}`\n```{doc['language']}\n{doc['content']}\n```"
            )
        context = "\n\n".join(context_parts) if context_parts else "No relevant code found."

        query_type = state.get("query_type", "general")
        type_instructions = {
            "explain": "Provide a clear, comprehensive explanation with examples.",
            "debug": "Identify the bug, explain the root cause, provide corrected code.",
            "document": "Generate professional documentation.",
            "review": "Perform a code review with severity ratings.",
            "search": "Find and highlight all relevant code locations.",
            "general": "Answer the developer's question.",
        }.get(query_type, "Answer the question.")

        # Build messages (Gemini-compatible)
        if settings.llm_provider == "gemini":
            combined_prompt = f"""{SYSTEM_PROMPT.format(repo_context=repo_info)}

---
RETRIEVED CODE CONTEXT:
{context}

---
DEVELOPER QUERY: {query}

TASK: {type_instructions}"""
            messages = [HumanMessage(content=combined_prompt)]
        else:
            system_msg = SystemMessage(content=SYSTEM_PROMPT.format(repo_context=repo_info))
            user_content = f"""RETRIEVED CODE CONTEXT:
{context}

---
DEVELOPER QUERY: {query}

TASK: {type_instructions}"""
            messages = [system_msg, HumanMessage(content=user_content)]

        full_response = ""
        try:
            async for chunk in self.streaming_llm.astream(messages):
                token = chunk.content if hasattr(chunk, "content") else str(chunk)
                if token:
                    full_response += token
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

            yield f"data: {json.dumps({'type': 'done', 'full_response': full_response})}\n\n"

        except Exception as e:
            logger.error("stream_error", error=str(e))
            # Fallback: run non-streaming and emit as one block
            try:
                response = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: self.llm.invoke(messages)
                )
                full_response = response.content if hasattr(response, "content") else str(response)
                yield f"data: {json.dumps({'type': 'token', 'content': full_response})}\n\n"
                yield f"data: {json.dumps({'type': 'done', 'full_response': full_response})}\n\n"
            except Exception as e2:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e2)})}\n\n"


# Singleton
_agent: Optional[CodeMindAgent] = None


def get_agent() -> CodeMindAgent:
    global _agent
    if _agent is None:
        _agent = CodeMindAgent()
    return _agent
