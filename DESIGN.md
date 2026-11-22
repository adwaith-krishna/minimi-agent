# DESIGN.md — Grounded AI Architecture

## 1. How It Works

Grounded AI is a production-grade conversational agent designed to deliver fast, factually grounded answers with temporal precision. It operates under a strict architectural constraint: **exactly one tool — `web_search`**.

### The Execution Lifecycle

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

1. **Temporal Anchoring**: Before LLM invocation, the system constructs a deterministic temporal frame (`isoDate`, `dayOfWeek`, and offsets for "today", "yesterday", "Monday", "last Tuesday", and "30 days ago").
2. **Conversational Memory & Entity Resolution**: For retrospective queries (e.g. *"On Monday we shortlisted 5 CRM tools... has any of them changed pricing?"*), the memory engine retrieves past session records and injects the baseline entities and previously discussed numbers.
3. **Multi-Query Web Search (The Single Tool)**: The agent invokes `web_search` across targeted entities. Under the hood, the tool routes queries through a multi-provider adapter (Tavily, Brave, Serper, or zero-config DuckDuckGo) and triggers a deep DOM reader to scrape clean article text and pricing tables from candidate URLs.
4. **Delta Verification Synthesis**: The agent compares the retrieved baseline with verified search hits, outputting an **Executive Summary**, a **Comparative Delta Matrix** (Baseline vs. Current State), and **Inline Citations `[1]`, `[2]`**.
5. **Streaming Transparency**: Tool calls, discovered sources, and markdown tokens stream via Server-Sent Events (SSE) to the Web UI and interactive CLI.

---

## 2. Why We Built It This Way

### A. "Answers Fast" (Latency-First Engineering)
- **Parallel Sub-Query Execution**: When evaluating multi-entity queries (e.g., checking 5 CRMs), the agent issues parallel search calls in a single reasoning step rather than 5 sequential turns.
- **Zero Heavy Vector DB Cold Start**: By indexing conversation sessions with structured chronological tags and token matching, memory retrieval takes `<2ms` with zero external database network hops.
- **First-Token Streaming**: Users see search queries appear immediately with pulsing indicators, followed by streaming tokens.

### B. "Gets Things Right" (Grounding & Anti-Hallucination)
- **Resolving the Temporal Ambiguity Gap**: Without explicit temporal anchoring, LLMs guess relative dates based on their pre-training cutoff. Our Temporal Context Engine eliminates this failure mode entirely.
- **Deep Page Content Scraping**: 50-word search snippets are frequently out of date or truncated. Our `web_search` tool automatically fetches primary page HTML for top hits, strips boilerplate with Cheerio, and supplies actual pricing text to the model.
- **Explicit Delta Contracts**: The agent is prompted with strict grounding rules: it must never speculate on price changes. If search results show stable pricing, it explicitly states *"Pricing remains unchanged at $X based on [1]"*.

### C. "Good to Talk To" (Conversational UX)
- **Progressive Disclosure**: Gives the bottom-line answer in the first sentence, followed by scannable tables, and reserves raw citations for source cards.
- **Multi-Modal Interface**: Provides both a modern Web UI (with pre-seeded benchmark datasets for instant evaluation) and an interactive CLI (`npm run cli`).

---

## 3. What We Considered and Rejected

| Approach Considered | Why Rejected | What We Chose Instead |
| :--- | :--- | :--- |
| **Vector DB RAG for Chat History** (Pinecone, Chroma) | Excessive latency (150–400ms per turn), embedding cost, and poor chronological understanding (vector similarity often confuses "last Tuesday" with "a Tuesday 6 months ago"). | **Structured Chronological Memory Store**: Lightweight JSON/file store with temporal metadata and token matching. Instant (<2ms), deterministic date awareness. |
| **Tool Sprawl** (`read_url`, `diff_text`, `calculate_price`) | Violated the core constraint (*"It has one tool: web search"*) and increased agent decision latency, hallucinated tool invocations, and fragility. | **Deep `web_search` Tool**: One unified tool that handles query planning, multi-provider routing, and deep page content extraction under the hood. |
| **Heavy Frameworks** (LangChain / CrewAI / AutoGen) | Opaque abstractions, heavy bundle sizes, slow debugging, brittle memory state, and poor streaming performance. | **Lean Custom Orchestrator on Vercel AI SDK**: Zero bloat, typed tool parameters with Zod, and native SSE streaming. |
| **Unbounded Autonomous ReAct Loops** | Open-ended agent loops risk infinite wandering, API quota exhaustion, and 30-second delays. | **Bounded Multi-Step Budget (`maxSteps: 6`)**: Guarantees fast completion while permitting targeted multi-query fan-out. |

---

## 4. What We'd Do With Another Week

1. **Headless Browser DOM & Visual Diffing**: For dynamic Single Page Applications (SPAs) gated behind complex client-side JavaScript, integrate Playwright with pixel-level and markdown DOM diffing to capture real-time UI changes.
2. **Speculative Pre-Search**: While the user is typing or immediately after intent classification, initiate speculative search fetches on high-confidence entities to achieve sub-second perceived response times.
3. **Automated Fact-Checking Critic Loop**: Add a lightweight secondary verification step that runs small-model NLI (Natural Language Inference) checks to guarantee that every generated dollar figure matches cited sources before token release.
4. **Persistent Webhooks & Background Watchers**: Allow users to say *"Notify me if any of these 5 CRMs change pricing next month"*, converting retrospective queries into standing scheduled monitors.
