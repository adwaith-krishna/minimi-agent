import { AgentExecutionSchema, ExecutionContextSchema, type AgentExecution, type AgentQuery, type ExecutionContext, type HistoricalRetrieval } from './contracts'
import { classifyIntent, classifyIntentDeterministically, type IntentClassifier } from './intent'
import { createTemporalRetrievalFilter, resolveTemporalReferences } from './temporal'
import { createSearchPlan } from './search-plan'
import type { HistoricalRepository } from './retrieval'
import { ProviderRequestError } from './provider-errors'
import type { ResearchReasoner, TavilyProvider } from './providers'
import { executeSearchPlan, getSearchExecutionLimits, type SearchExecutionLimits } from './search-executor'
import { buildDeterministicWebAnswer, buildHistoricalEvidence, buildWebEvidence } from './evidence'
import { compareHistoricalAndCurrent } from './comparison'
import type { ResearchPersistenceRepository } from './persistence'
import { buildDeterministicMemoryAcknowledgement, buildDeterministicMemoryAnswer } from './memory'
import { buildEntityAwareSearchQueries } from './query-planner'
import { composeDeterministicComparisonAnswer } from './comparison'

export interface AgentDependencies {
  classifier?: IntentClassifier
  repository: HistoricalRepository
  maxSearchCalls?: number
  reasoner?: ResearchReasoner
  tavily?: TavilyProvider
  persistence?: ResearchPersistenceRepository
  searchLimits?: SearchExecutionLimits
  planSearch?: typeof createSearchPlan
}

type AgentErrorCode = NonNullable<AgentExecution['error']>['code']
const errorValue = (code: AgentErrorCode, message: string, details: { cleanupAttempted?: boolean; cleanupSucceeded?: boolean } = {}) => ({ code, message, ...details })

export async function executeAgent(query: AgentQuery, executionContext: ExecutionContext, dependencies: AgentDependencies): Promise<AgentExecution> {
  let persistenceFailed = false
  let persistenceCleanupAttempted: boolean | undefined
  let persistenceCleanupSucceeded: boolean | undefined
  try {
    const context = ExecutionContextSchema.parse(executionContext)
    const temporal = resolveTemporalReferences(query.query, { timezone: context.timezone, referenceTimestamp: context.referenceTimestamp })
    if (temporal.references.some((item) => item.kind === 'ambiguous' || item.kind === 'unspecified')) {
      return AgentExecutionSchema.parse({ status: 'needs_clarification', intent: null, temporal, history: null, searchPlan: null, answer: null, error: null })
    }
    const explicitMemory = buildDeterministicMemoryAcknowledgement(query.query)
    if (explicitMemory) {
      const intent = classifyIntentDeterministically(query.query)
      const searchLimits = dependencies.searchLimits ?? getSearchExecutionLimits()
      const searchPlan = (dependencies.planSearch ?? createSearchPlan)({ intent: intent.intent, query: query.query, hasHistoricalContext: false, maxCalls: Math.min(dependencies.maxSearchCalls ?? searchLimits.maxCalls, searchLimits.maxCalls) })
      const emptyHistory: HistoricalRetrieval = { messages: [], memoryItems: [], researchSnapshots: [] }
      return AgentExecutionSchema.parse({ status: 'no_search', intent, temporal, history: emptyHistory, searchPlan, evidenceSources: [], answer: explicitMemory, error: null })
    }
    const intent = await classifyIntent(query.query, dependencies.classifier)
    const temporalFilter = createTemporalRetrievalFilter(temporal, intent.intent, query.query) ?? undefined
    const temporalTerms = temporal.references.filter((item) => item.start !== null && item.end !== null).map((item) => item.text)
    const history: HistoricalRetrieval = await dependencies.repository.retrieve({ userId: context.userId, query: query.query, conversationId: query.conversationId, temporalFilter, temporalTerms })
    const answerHistory: HistoricalRetrieval = intent.intent === 'general_conversational'
      ? { messages: [], memoryItems: [], researchSnapshots: [] }
      : history
    const hasHistoricalContext = history.messages.length + history.memoryItems.length + history.researchSnapshots.length > 0
    const searchLimits = dependencies.searchLimits ?? getSearchExecutionLimits()
    const searchPlan = (dependencies.planSearch ?? createSearchPlan)({ intent: intent.intent, query: query.query, hasHistoricalContext, maxCalls: Math.min(dependencies.maxSearchCalls ?? searchLimits.maxCalls, searchLimits.maxCalls), searchQueries: buildEntityAwareSearchQueries(query.query, history) })

    // A conversational or memory-only question only needs the reasoning provider.
    // Requiring web search and snapshot persistence here made ordinary questions
    // fail whenever Tavily was unavailable, even though no web call was planned.
    if (!dependencies.reasoner && !searchPlan.shouldSearchWeb) {
      // A new explicit note is an action, not a recall question. Acknowledge it
      // before looking at older memory so a fresh meeting/date cannot be
      // answered with a stale saved item.
      const memoryAnswer = buildDeterministicMemoryAcknowledgement(query.query) ?? buildDeterministicMemoryAnswer(query.query, answerHistory)
      if (memoryAnswer) {
        const evidenceSources = buildHistoricalEvidence(answerHistory)
        return AgentExecutionSchema.parse({ status: 'no_search', intent, temporal, history, searchPlan, evidenceSources, answer: memoryAnswer, error: null })
      }
      return AgentExecutionSchema.parse({ status: 'failed', intent, temporal, history, searchPlan, answer: null, error: errorValue('PROVIDER_ERROR', 'Research providers are not configured for this request.') })
    }

    if (searchPlan.shouldSearchWeb && !dependencies.tavily) {
      return AgentExecutionSchema.parse({ status: 'failed', intent, temporal, history, searchPlan, answer: null, error: errorValue('PROVIDER_ERROR', 'Web search is not configured.') })
    }

    if (!searchPlan.shouldSearchWeb) {
      const evidenceSources = buildHistoricalEvidence(answerHistory)
      const answer = buildDeterministicMemoryAcknowledgement(query.query)
        ?? buildDeterministicMemoryAnswer(query.query, answerHistory)
        ?? await dependencies.reasoner!.generateAnswer({ query: query.query, history: answerHistory, sources: evidenceSources, claims: [], comparisons: [] })
      return AgentExecutionSchema.parse({ status: 'no_search', intent, temporal, history, searchPlan, evidenceSources, answer, error: null })
    }

    const observedAt = new Date().toISOString()
    const search = await executeSearchPlan(searchPlan, dependencies.tavily!, searchLimits)
    const successes = search.execution.outcomes.filter((outcome) => outcome.status === 'succeeded').length
    const failures = search.execution.outcomes.filter((outcome) => outcome.status === 'failed').length
    const persist = async (claims: Parameters<ResearchPersistenceRepository['persist']>[0]['claims'], comparisons: Parameters<ResearchPersistenceRepository['persist']>[0]['comparisons'], evidenceSources: Parameters<ResearchPersistenceRepository['persist']>[0]['evidenceSources'], status?: 'completed' | 'failed' | 'partial') => {
      try {
        return await dependencies.persistence!.persist({ userId: context.userId, conversationId: query.conversationId, query: query.query, observedAt, searchExecution: search.execution, evidenceSources, claims, comparisons, status })
      } catch (error) {
        persistenceFailed = true
        if (error instanceof Error && 'cleanupAttempted' in error && typeof error.cleanupAttempted === 'boolean') persistenceCleanupAttempted = error.cleanupAttempted
        if (error instanceof Error && 'cleanupSucceeded' in error && typeof error.cleanupSucceeded === 'boolean') persistenceCleanupSucceeded = error.cleanupSucceeded
        return null
      }
    }
    const base = { intent, temporal, history, searchPlan, searchExecution: search.execution }
    if (search.execution.attemptedCalls === 0 || successes === 0) {
      const persisted = await persist([], [], [])
      return AgentExecutionSchema.parse({ status: 'failed', ...base, evidenceSources: [], extractedClaims: [], comparisons: [], snapshotId: persisted?.snapshotId ?? null, answer: null, error: errorValue(persistenceFailed ? 'PERSISTENCE_ERROR' : 'PROVIDER_ERROR', persistenceFailed ? 'Research could not be saved.' : 'All planned web searches failed.', { cleanupAttempted: persistenceCleanupAttempted, cleanupSucceeded: persistenceCleanupSucceeded }) })
    }

    const webSources = buildWebEvidence(search.results, observedAt)
    const evidenceSources = [...buildHistoricalEvidence(history), ...webSources]
    let extractedClaims: Awaited<ReturnType<ResearchReasoner['extractClaims']>> = []
    const deterministicWebAnswer = buildDeterministicWebAnswer(evidenceSources)
    if (!dependencies.reasoner) {
      const persisted = await persist([], [], evidenceSources, failures > 0 ? 'partial' : 'completed')
      const state = failures > 0 ? 'partial' : 'completed'
      return AgentExecutionSchema.parse({ status: state, ...base, evidenceSources, extractedClaims: [], comparisons: [], snapshotId: persisted?.snapshotId ?? null, conversationId: persisted?.conversationId ?? null, answer: deterministicWebAnswer, error: null })
    }
    try {
      extractedClaims = webSources.length ? await dependencies.reasoner.extractClaims(query.query, webSources) : []
    } catch {
      const persisted = await persist([], [], evidenceSources, 'partial')
      return AgentExecutionSchema.parse({ status: 'partial', ...base, evidenceSources, extractedClaims: [], comparisons: [], snapshotId: persisted?.snapshotId ?? null, conversationId: persisted?.conversationId ?? null, answer: deterministicWebAnswer, error: persistenceFailed ? errorValue('PERSISTENCE_ERROR', 'Search evidence was found but could not be saved.', { cleanupAttempted: persistenceCleanupAttempted, cleanupSucceeded: persistenceCleanupSucceeded }) : null })
    }
    const comparisons = intent.intent === 'historical_current_comparison' ? compareHistoricalAndCurrent(history, extractedClaims) : []
    const deterministicComparison = intent.intent === 'historical_current_comparison'
      ? composeDeterministicComparisonAnswer(comparisons, evidenceSources)
      : null
    if (deterministicComparison) {
      const persisted = await persist(extractedClaims, comparisons, evidenceSources, failures > 0 ? 'partial' : 'completed')
      const state = persistenceFailed || failures > 0 ? 'partial' : 'completed'
      return AgentExecutionSchema.parse({ status: state, ...base, evidenceSources, extractedClaims, comparisons, snapshotId: persisted?.snapshotId ?? null, conversationId: persisted?.conversationId ?? null, answer: deterministicComparison,
        error: persistenceFailed ? errorValue('PERSISTENCE_ERROR', 'Research results were generated but could not be saved.', { cleanupAttempted: persistenceCleanupAttempted, cleanupSucceeded: persistenceCleanupSucceeded }) : failures > 0 ? errorValue('PROVIDER_ERROR', 'Some planned web searches failed; this answer may be incomplete.') : null })
    }
    let answer: Awaited<ReturnType<ResearchReasoner['generateAnswer']>>
    try {
      answer = await dependencies.reasoner.generateAnswer({ query: query.query, history: answerHistory, sources: evidenceSources, claims: extractedClaims, comparisons })
    } catch {
      const persisted = await persist(extractedClaims, comparisons, evidenceSources, 'partial')
      return AgentExecutionSchema.parse({ status: 'partial', ...base, evidenceSources, extractedClaims, comparisons, snapshotId: persisted?.snapshotId ?? null, conversationId: persisted?.conversationId ?? null, answer: deterministicWebAnswer, error: persistenceFailed ? errorValue('PERSISTENCE_ERROR', 'Research findings were generated but could not be saved.', { cleanupAttempted: persistenceCleanupAttempted, cleanupSucceeded: persistenceCleanupSucceeded }) : null })
    }
    const persisted = await persist(extractedClaims, comparisons, evidenceSources, failures > 0 ? 'partial' : 'completed')
    const state = persistenceFailed || failures > 0 ? 'partial' : 'completed'
    return AgentExecutionSchema.parse({ status: state, ...base, evidenceSources, extractedClaims, comparisons, snapshotId: persisted?.snapshotId ?? null, conversationId: persisted?.conversationId ?? null, answer,
      error: persistenceFailed ? errorValue('PERSISTENCE_ERROR', 'Research results were generated but could not be saved.', { cleanupAttempted: persistenceCleanupAttempted, cleanupSucceeded: persistenceCleanupSucceeded }) : failures > 0 ? errorValue('PROVIDER_ERROR', 'Some planned web searches failed; this answer may be incomplete.') : null })
  } catch (error) {
    const providerError = error instanceof ProviderRequestError
    const isProvider = providerError || (error instanceof Error && /provider|gemini|tavily/i.test(error.message))
    const isRetrieval = error instanceof Error && /retrieval/i.test(error.message)
    const isPersistence = persistenceFailed || (error instanceof Error && /persistence/i.test(error.message))
    const safeError = {
      code: isProvider ? 'PROVIDER_ERROR' : isRetrieval ? 'RETRIEVAL_ERROR' : isPersistence ? 'PERSISTENCE_ERROR' : 'INTERNAL_ERROR',
      message: isProvider ? 'Research providers are temporarily unavailable.' : isRetrieval ? 'Historical context could not be retrieved.' : isPersistence ? 'Research could not be saved.' : 'Agent execution could not be completed.',
      ...(providerError && error.retryAfterSeconds !== null ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    } as const
    return AgentExecutionSchema.parse({ status: 'failed', intent: null, temporal: null, history: null, searchPlan: null, answer: null, error: safeError })
  }
}
