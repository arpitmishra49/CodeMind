# 🧠 CodeMind AI

> **Agentic RAG-powered developer assistant** — query, debug, document, and understand any codebase using AI.

![CodeMind AI](https://img.shields.io/badge/CodeMind-AI-6366f1?style=for-the-badge)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react)
![LangGraph](https://img.shields.io/badge/LangGraph-Agent-orange?style=flat-square)
![FAISS](https://img.shields.io/badge/FAISS-VectorDB-blue?style=flat-square)

---

## ✨ What is CodeMind AI?

CodeMind AI lets developers upload any repository (via ZIP or GitHub URL) and **instantly chat with their codebase**. Under the hood, it:

1. **Parses & chunks** every code file (language-aware splitting)
2. **Embeds** them into a FAISS vector database
3. Uses a **LangGraph agent** that plans → retrieves → generates:
   - 📖 **Explain** — Architecture, data flow, component behavior
   - 🐛 **Debug** — Root cause analysis + fixed code
   - 📝 **Document** — JSDoc, docstrings, README sections
   - 👁️ **Review** — Code quality, security, anti-patterns
   - 🔍 **Search** — Find any pattern across the entire repo

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 20+
- Git

### 1. Clone & enter the project

```bash
git clone https://github.com/yourname/codemind-ai.git
cd codemind-ai
```

### 2. Set up the backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# ← Edit .env and add your API keys (see section below)

# Create data directories
mkdir -p data/faiss_indexes data/temp

# Run the server
python run.py
# → Backend running at http://localhost:8000
# → API docs at http://localhost:8000/api/docs
```

### 3. Set up the frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure (optional — Vite proxy handles /api by default)
cp .env.example .env.local

# Start dev server
npm run dev
# → Frontend running at http://localhost:5173
```

### 4. Open the app

Navigate to **http://localhost:5173**, paste a GitHub URL or upload a ZIP, and start chatting!

---

## 🔑 API Keys — Exactly What You Need & Where

### Required: OpenAI API Key

**Where to get it:**
1. Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click **"Create new secret key"**
4. Copy the key (starts with `sk-...`)

**Where to put it:** `backend/.env`

```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o-mini          # cheapest & fast; use gpt-4o for best quality
OPENAI_EMBEDDING_MODEL=text-embedding-3-small   # cheapest embeddings
```

**Cost estimate:**
- `text-embedding-3-small`: ~$0.02 per 1M tokens (indexing a 1000-file repo ≈ $0.05)
- `gpt-4o-mini`: ~$0.15/$0.60 per 1M input/output tokens (per query ≈ $0.001–0.01)

---

### Optional: GitHub Personal Access Token

**Why you need it:**
- Ingest **private** repositories
- Avoid GitHub rate limits (60 req/hr unauthenticated → 5000 req/hr authenticated)

**Where to get it:**
1. Go to [https://github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **"Generate new token (classic)"**
3. Required scopes:
   - `repo` — for private repositories
   - `public_repo` — for public repositories only
4. Copy the token (starts with `ghp_...`)

**Where to put it:** `backend/.env`

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### Alternative: Ollama (Free, Local, No API Key)

If you want **100% free, offline** operation using local LLMs:

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model (choose one)
ollama pull llama3          # General purpose, 4.7GB
ollama pull codellama       # Code-specialized, 3.8GB
ollama pull mistral         # Fast and capable, 4.1GB
```

Then set in `backend/.env`:

```env
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3
OLLAMA_BASE_URL=http://localhost:11434
```

> ⚠️ Ollama quality is lower than GPT-4o for complex reasoning. Recommended only for development/testing.

---

## 📁 Project Structure

```
codemind-ai/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + middleware
│   │   ├── config.py            # Settings (Pydantic)
│   │   ├── api/
│   │   │   ├── ingest.py        # /api/ingest/* routes
│   │   │   └── chat.py          # /api/chat/* routes (+ SSE streaming)
│   │   ├── core/
│   │   │   ├── ingestion.py     # File parsing, chunking engine
│   │   │   ├── vector_store.py  # FAISS manager
│   │   │   └── session_manager.py
│   │   └── agents/
│   │       └── code_agent.py    # LangGraph agent (Plan→Retrieve→Respond)
│   ├── requirements.txt
│   ├── .env.example             # ← All env vars documented here
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── store/index.ts       # Zustand global state
│   │   ├── services/api.ts      # Axios + SSE streaming client
│   │   └── components/
│   │       ├── layout/
│   │       │   ├── Header.tsx
│   │       │   └── Sidebar.tsx  # File tree + repo stats
│   │       └── chat/
│   │           ├── ChatView.tsx      # Message list + streaming
│   │           ├── ChatMessage.tsx   # Markdown + code rendering
│   │           ├── ChatInput.tsx     # Textarea + quick actions
│   │           └── IngestionPanel.tsx # Upload/GitHub form
│   ├── .env.example
│   └── Dockerfile
│
├── docker-compose.yml
└── README.md
```

---

## 🐳 Docker Deployment (Production)

```bash
# Create root .env
cat > .env << EOF
OPENAI_API_KEY=sk-your-key-here
GITHUB_TOKEN=ghp_optional-token
LLM_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini
EOF

# Build and start everything
docker compose up --build -d

# View logs
docker compose logs -f backend

# Stop
docker compose down
```

Frontend → `http://localhost:3000`  
Backend API → `http://localhost:8000`  
Swagger Docs → `http://localhost:8000/api/docs`

---

## 🔧 Configuration Reference

All settings live in `backend/.env`. Every option has a sensible default.

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | *required* | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` | LLM model |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `LLM_PROVIDER` | `openai` | `openai` or `ollama` |
| `GITHUB_TOKEN` | *empty* | GitHub PAT for private repos |
| `CHUNK_SIZE` | `1000` | Characters per chunk |
| `CHUNK_OVERLAP` | `200` | Overlap between chunks |
| `RETRIEVAL_K` | `8` | Top-K chunks to retrieve |
| `MAX_FILE_SIZE_MB` | `10` | Skip files larger than this |
| `MAX_REPO_SIZE_MB` | `500` | Reject repos larger than this |
| `FAISS_INDEX_PATH` | `./data/faiss_indexes` | Where indexes are stored |
| `PORT` | `8000` | Backend server port |

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **LLM** | OpenAI GPT-4o / Ollama | Response generation |
| **Embeddings** | text-embedding-3-small | Semantic search |
| **Agent** | LangGraph | Plan → Retrieve → Respond |
| **RAG** | LangChain | Orchestration pipeline |
| **Vector DB** | FAISS | Fast similarity search |
| **API** | FastAPI + SSE | Streaming responses |
| **Frontend** | React + Vite | UI |
| **State** | Zustand | Global app state |
| **Styling** | Tailwind CSS | Design system |

---

## 🧠 How the Agent Works

```
User Query
    │
    ▼
┌─────────────┐
│   PLANNER   │  LLM analyzes intent → explain/debug/doc/review/search
│             │  Generates 2-4 targeted search queries
└─────┬───────┘
      │
      ▼
┌─────────────┐
│  RETRIEVER  │  Runs all search queries against FAISS
│             │  Deduplicates and ranks chunks
└─────┬───────┘
      │
      ▼
┌─────────────┐
│  RESPONDER  │  Assembles context window
│             │  Generates streamed answer grounded in code
└─────┬───────┘
      │
      ▼
Streamed Response (SSE) → UI
```

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit changes: `git commit -m 'feat: add my feature'`
4. Push and open a Pull Request

---

## 📄 License

MIT — see [LICENSE](LICENSE)
