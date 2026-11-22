# Grounded AI — State-of-the-Art Chat Agent with Web Search

A fast, factually grounded AI chat agent with temporal memory and a single tool: **`web_search`**. Built to answer retrospective and comparative queries with sub-second retrieval, deep web scraping, and verifiable citations.

---

## ⚡ Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add **at least one** LLM API key. The agent automatically detects and routes to whichever model provider you provide:
```env
# Choose any ONE (OpenAI, Gemini, Anthropic, or Groq):
OPENAI_API_KEY=your_openai_key
# or GEMINI_API_KEY=your_gemini_key
# or ANTHROPIC_API_KEY=your_anthropic_key
# or GROQ_API_KEY=your_groq_key

# Web Search (Optional - uses built-in DuckDuckGo zero-config fallback if omitted):
TAVILY_API_KEY=your_tavily_key
```

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to chat with the agent.

---

## 🚀 Ways to Run & Evaluate

### Option A: Interactive Web UI (`npm run dev`)
- **Full visual chat interface** with real-time streaming tokens.
- **Collapsible Search Reasoning Drawer**: see queries executed, provider used, and latency in real-time.
- **Interactive Source Cards**: domain favicons, title, snippets, and verified URLs.
- **One-Click Benchmark Test Buttons**: click the prompt chips at the top to immediately test the dataset queries:
  1. *"On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"*
  2. *"What did I ask you on 3 November? Is your answer still correct today?"*
  3. *"Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"*

### Option B: Interactive Terminal CLI (`npm run cli`)
Chat with the agent directly in your command line:
```bash
npm run cli
```

### Option C: Automated Benchmark Test Suite (`npm test`)
Run the automated test runner to verify temporal resolution, persistent session memory retrieval, and web search execution:
```bash
npm test
```

---

## 🧠 Core Architecture Highlights

```
[User Query] 
     │
     ▼
[Temporal Context Engine] ──► Injects ISO timestamp, day of week, relative anchor dates
     │
     ▼
[Persistent Memory Store] ──► Resolves cross-session history (e.g. "Monday CRM shortlist")
     │
     ▼
[Agent Orchestrator]      ──► Formulates sub-queries, bounds reasoning budget (maxSteps: 6)
     │
     ├─► [web_search Tool]  (Multi-provider: Tavily / Brave / Serper / DuckDuckGo + Deep Reader)
     │         │
     │         └─► Crawls & extracts text from primary pricing & changelog URLs
     │
     ▼
[Delta Verification Engine]──► Compares Baseline Memory vs. Current Web State
     │
     ▼
[SSE Streaming Pipeline]  ──► Emits tool-call events, verified source cards, and token stream
```

1. **Temporal Context Engine**: Dynamically calculates current calendar date, day of week, and exact ISO timestamps for relative references ("Monday", "last Tuesday", "yesterday", "since then").
2. **Persistent Conversational Memory**: High-speed chronological session store supporting cross-session context retrieval and pre-seeded benchmark scenarios.
3. **The Single Tool (`web_search`)**:
   - Multi-provider abstraction: Tavily, Brave, Serper, and DuckDuckGo (zero-config fallback).
   - Deep DOM scraping: extracts clean text from primary pricing/changelog URLs to guarantee accurate numbers.
4. **The Delta Verification Protocol**: Computes an explicit delta between historical baseline and current web reality, with strict bracketed citations (`[1]`, `[2]`).

---

## 📄 Documentation

For an in-depth breakdown of architectural decisions, trade-offs, and what we considered and rejected, see [DESIGN.md](file:///./DESIGN.md).
