import { SearchExecutionSchema, SearchPlanSchema, WebSearchResultSchema, type SearchExecution, type SearchPlan, type WebSearchResult } from './contracts'
import { ProviderRequestError } from './provider-errors'

export interface TavilySearchClient {
  search(query: string, options: { maxResults: number; signal: AbortSignal }): Promise<WebSearchResult>
}

export type SearchExecutionLimits = { maxCalls: number; maxResultsPerCall: number; perCallTimeoutMs: number; totalTimeoutMs: number }

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = value && /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getSearchExecutionLimits(env: Record<string, string | undefined> = process.env): SearchExecutionLimits {
  return {
    maxCalls: Math.min(8, positiveInteger(env.AGENT_MAX_SEARCH_CALLS, 8)),
    maxResultsPerCall: Math.min(5, positiveInteger(env.AGENT_MAX_RESULTS_PER_CALL, 5)),
    perCallTimeoutMs: Math.min(8_000, positiveInteger(env.AGENT_SEARCH_CALL_TIMEOUT_MS, 8_000)),
    totalTimeoutMs: Math.min(30_000, positiveInteger(env.AGENT_SEARCH_TOTAL_TIMEOUT_MS, 30_000)),
  }
}

function safeFailure(error: unknown): { kind: 'rate_limited' | 'request_failed' | 'timeout'; retryAfterSeconds: number | null } {
  if (error instanceof ProviderRequestError) return { kind: error.kind, retryAfterSeconds: error.retryAfterSeconds }
  return { kind: 'request_failed', retryAfterSeconds: null }
}

export async function executeSearchPlan(
  untrustedPlan: SearchPlan,
  provider: TavilySearchClient,
  limits = getSearchExecutionLimits(),
  now: () => number = () => performance.now(),
): Promise<{ execution: SearchExecution; results: WebSearchResult[] }> {
  const plan = SearchPlanSchema.parse(untrustedPlan)
  const totalBudgetMs = Math.min(30_000, Math.max(0, Number.isFinite(limits.totalTimeoutMs) ? limits.totalTimeoutMs : 30_000))
  const perCallBudgetMs = Math.min(8_000, Math.max(1, Number.isFinite(limits.perCallTimeoutMs) ? limits.perCallTimeoutMs : 8_000))
  const startedAt = now()
  const queries = plan.shouldSearchWeb ? plan.currentQuestions.filter((query) => query.trim().length > 0) : []
  const maxCalls = Math.min(8, Math.max(0, Number.isFinite(limits.maxCalls) ? Math.floor(limits.maxCalls) : 8), plan.maxCalls, queries.length)
  const maxResults = Math.min(5, Math.max(1, Number.isFinite(limits.maxResultsPerCall) ? Math.floor(limits.maxResultsPerCall) : 5))
  const plannedQueries = queries.slice(0, maxCalls)
  const runSearch = async (query: string, index: number) => {
    const remainingMs = totalBudgetMs - Math.floor(now() - startedAt)
    if (remainingMs <= 0) return { index, query, result: null, outcome: { query, status: 'failed' as const, resultCount: 0, failure: { kind: 'timeout' as const, retryAfterSeconds: null } } }
    const timeoutMs = Math.max(1, Math.min(perCallBudgetMs, remainingMs))
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort(new DOMException('Search deadline exceeded.', 'TimeoutError'))
          reject(new ProviderRequestError('timeout'))
        }, timeoutMs)
      })
      const raw = await Promise.race([provider.search(query, { maxResults, signal: controller.signal }), timeout])
      const validated = WebSearchResultSchema.parse(raw)
      const bounded = WebSearchResultSchema.parse({ ...validated, query, results: validated.results.slice(0, maxResults) })
      return { index, query, result: bounded, outcome: { query, status: 'succeeded' as const, resultCount: bounded.results.length, failure: null } }
    } catch (error) {
      return { index, query, result: null, outcome: { query, status: 'failed' as const, resultCount: 0, failure: safeFailure(error) } }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  const executions: Array<Awaited<ReturnType<typeof runSearch>>> = []
  const parallelism = Math.min(3, Math.max(1, Math.floor(totalBudgetMs / perCallBudgetMs)))
  for (let offset = 0; offset < plannedQueries.length; offset += parallelism) {
    const batch = plannedQueries.slice(offset, offset + parallelism)
    executions.push(...await Promise.all(batch.map((query, index) => runSearch(query, offset + index))))
    if (totalBudgetMs - Math.floor(now() - startedAt) <= 0) break
  }
  const outcomes = executions.sort((a, b) => a.index - b.index).map(({ outcome }) => outcome)
  const results = executions.flatMap(({ result }) => result ? [result] : [])
  const attemptedCalls = executions.length
  const completedCalls = outcomes.length

  const budgetExhausted = outcomes.length < queries.length && (attemptedCalls >= maxCalls || totalBudgetMs - Math.floor(now() - startedAt) <= 0)
  const execution = SearchExecutionSchema.parse({ attemptedCalls, completedCalls, totalDurationMs: Math.max(0, Math.floor(now() - startedAt)), budgetExhausted, outcomes })
  return { execution, results }
}
