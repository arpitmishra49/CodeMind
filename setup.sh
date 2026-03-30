#!/usr/bin/env bash
# =============================================================================
# CodeMind AI — One-command setup script
# =============================================================================
set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

print_step() { echo -e "\n${CYAN}${BOLD}▸ $1${NC}"; }
print_ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
print_warn() { echo -e "  ${YELLOW}⚠${NC}  $1"; }
print_err()  { echo -e "  ${RED}✗${NC} $1"; }

echo -e "\n${BOLD}╔══════════════════════════════════════╗"
echo -e "║       CodeMind AI — Setup           ║"
echo -e "╚══════════════════════════════════════╝${NC}\n"

# ─── Check prerequisites ────────────────────────────────────────────────────
print_step "Checking prerequisites"

command -v python3 >/dev/null 2>&1 && print_ok "Python 3 found: $(python3 --version)" \
  || { print_err "Python 3 not found. Install from https://python.org"; exit 1; }

command -v node >/dev/null 2>&1 && print_ok "Node.js found: $(node --version)" \
  || { print_err "Node.js not found. Install from https://nodejs.org"; exit 1; }

command -v git >/dev/null 2>&1 && print_ok "Git found" \
  || { print_err "Git not found. Install git first."; exit 1; }

# ─── Backend setup ──────────────────────────────────────────────────────────
print_step "Setting up backend"

cd backend

# Create virtual environment
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  print_ok "Created Python virtual environment"
else
  print_ok "Virtual environment already exists"
fi

# Activate
source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate 2>/dev/null

# Install deps
echo "  Installing Python dependencies (this may take a minute)..."
pip install -r requirements.txt -q
print_ok "Python dependencies installed"

# Create data dirs
mkdir -p data/faiss_indexes data/temp
print_ok "Data directories created"

# Copy .env if not exists
if [ ! -f ".env" ]; then
  cp .env.example .env
  print_warn ".env created from template — ADD YOUR API KEYS to backend/.env"
else
  print_ok ".env already exists"
fi

deactivate
cd ..

# ─── Frontend setup ─────────────────────────────────────────────────────────
print_step "Setting up frontend"

cd frontend
npm install --silent
print_ok "Node.js dependencies installed"

if [ ! -f ".env.local" ]; then
  cp .env.example .env.local
  print_ok ".env.local created"
fi

cd ..

# ─── Summary ────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}${BOLD}✅ Setup complete!${NC}\n"
echo -e "${BOLD}Next steps:${NC}"
echo -e ""
echo -e "  1. ${YELLOW}Add your OpenAI API key:${NC}"
echo -e "     Edit ${BOLD}backend/.env${NC} and set OPENAI_API_KEY=sk-..."
echo -e ""
echo -e "  2. ${YELLOW}Start the backend:${NC}"
echo -e "     cd backend && source .venv/bin/activate && python run.py"
echo -e ""
echo -e "  3. ${YELLOW}Start the frontend${NC} (new terminal):"
echo -e "     cd frontend && npm run dev"
echo -e ""
echo -e "  4. ${YELLOW}Open the app:${NC}"
echo -e "     http://localhost:5173"
echo -e ""
echo -e "  📖 Full docs: README.md"
echo -e "  🔑 API keys guide: README.md#api-keys"
echo -e ""
