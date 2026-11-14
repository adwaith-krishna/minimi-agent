# Minimi design

Minimi is a temporal-memory research agent: it can answer from a user's saved conversation history, search the web when freshness matters, and compare an earlier finding with current evidence. The design is deliberately a deterministic orchestration pipeline rather than a multi-agent framework.

## How a turn works

1. The authenticated route validates the request, obtains the user's timezone, and resolves phrases such as “last Tuesday” or “3 November” against the server timestamp in that timezone. Ambiguous dates stop with a clarification instead of an invented interval.
2. Minimi retrieves owner-scoped messages, explicit memory items, and completed research snapshots before web search. Retrieval uses PostgreSQL full-text search plus bounded deterministic ranking; temporal filters distinguish recorded time from valid/event time.
3. A classifier chooses one intent: conversation recall, research recall, current research, historical/current comparison, or general conversation. A bounded search plan turns current questions into at most eight Tavily calls, with per-call and total timeouts.
4. Tavily is the only web-search tool. Results are normalized into evidence sources. The reasoning provider extracts source-backed claims, verifies findings against the cited snippets, and generates an answer whose factual statements must cite supplied evidence. Missing, conflicting, or incomplete evidence is stated explicitly.
5. Completed research is stored as an immutable snapshot containing the query, search execution, claims, and sources. Every turn also stores the user and assistant messages; explicit low-risk facts such as “my name is…” or “I prefer…” become searchable memory items. All writes are authenticated and owner-scoped.

## Why this architecture

The pipeline makes the important decisions inspectable: date resolution, retrieval, search planning, evidence normalization, verification, answer generation, and persistence are separate modules with typed contracts. This makes it possible to test temporal edge cases, provider failures, partial results, citation integrity, and ownership boundaries without relying on a hidden prompt or an opaque agent loop.

Supabase PostgreSQL provides durable conversation history, bi-temporal memory, immutable research snapshots, and row-level security. OpenRouter is the active reasoning path because it supports the structured JSON contracts used at each reasoning stage; Gemini remains a compatible server-only adapter. Tavily is isolated behind a small search interface so the agent has one auditable web tool and bounded external cost.

## Alternatives considered

- Multi-agent frameworks, LangChain/LangGraph, Redis, and vector databases were rejected: they add operational and reasoning opacity before the product has demonstrated a need for them.
- Pure recency retrieval was rejected because a remembered conversation can be old but highly relevant; PostgreSQL full-text retrieval and deterministic ranking are sufficient for the current scale.
- Uncited free-form model answers were rejected because temporal comparisons and pricing answers need provenance, not just plausible prose.
- Silent provider fallback or automatic model selection was rejected because it makes outages and answer-quality changes difficult to diagnose. Provider/model configuration is explicit and bounded.

## Known limits and next week

The current repository has unit coverage for temporal resolution, search planning/execution, claim comparison, provider boundaries, persistence payloads, authentication boundaries, explicit memory extraction, and failure states. Live provider checks and the production build are separate from the unit suite. PostgreSQL RLS/trigger verification still requires running `supabase/verification.sql` against a safe test database; no production migration is applied by the repository itself.

With another week I would add a safe end-to-end test environment with a seeded Supabase account, run the three evaluator-style scenarios as black-box tests, add durable request idempotency and deployment-level rate limits, improve memory extraction beyond explicit phrases, and add a ranked-retrieval projection once real history volume justifies it.
