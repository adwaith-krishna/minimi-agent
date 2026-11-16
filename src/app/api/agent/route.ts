import { NextResponse } from 'next/server'
import { AgentQuerySchema } from '@/lib/agent/contracts'
import { executeAgent } from '@/lib/agent/orchestrator'
import { OpenRouterHttpProvider, TavilyHttpProvider } from '@/lib/agent/providers'
import { readAgentRequestBody, getMaxAgentRequestBytes } from '@/lib/agent/request-body'
import { SupabaseHistoricalRepository } from '@/lib/agent/retrieval'
import { SupabaseConversationTurnPersistenceRepository, SupabaseResearchPersistenceRepository } from '@/lib/agent/persistence'
import { PersonalMemoryService } from '@/lib/agent/memory-service'
import { modelMemoriesOrFallback } from '@/lib/agent/model-decision'
import { SupabaseConversationLedger } from '@/lib/agent/conversation-ledger'
import { getSearchExecutionLimits } from '@/lib/agent/search-executor'
import { createClient } from '@/lib/supabase/server'
import { sanitizeTimezone } from '@/lib/utils/timezone'

function errorResponse(status: number, code: 'INVALID_REQUEST' | 'PAYLOAD_TOO_LARGE' | 'UNAUTHENTICATED' | 'INTERNAL_ERROR', message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

function authProviderUnavailable(error: unknown): boolean {
  if (!error) return false
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : Number.NaN
  const name = error instanceof Error ? error.name : ''
  return name.includes('Retryable') || !Number.isFinite(status) || status === 429 || status >= 500
}

export async function POST(request: Request) {
  const requestStartedAt = performance.now()
  try {
    const referenceTimestamp = new Date().toISOString()
    const bodyResult = await readAgentRequestBody(request, getMaxAgentRequestBytes())
    if (!bodyResult.ok) {
      if (bodyResult.reason === 'too_large') return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the allowed size.')
      return errorResponse(400, 'INVALID_REQUEST', 'Request body must be valid JSON.')
    }
    const supabase = await createClient()
    const authResult = await supabase.auth.getUser()
    const user = authResult.data.user
    if (authResult.error && authProviderUnavailable(authResult.error)) {
      return errorResponse(500, 'INTERNAL_ERROR', 'Minimi could not verify your session.')
    }
    if (!user) {
      return errorResponse(401, 'UNAUTHENTICATED', 'Sign in to use Minimi.')
    }

    const parsed = AgentQuerySchema.safeParse(bodyResult.value)
    if (!parsed.success) return errorResponse(400, 'INVALID_REQUEST', 'The request did not match the expected format.')

    let timezone = 'Asia/Kolkata'
    const profile = await supabase.from('profiles').select('timezone').eq('id', user.id).maybeSingle() as unknown as { data: { timezone: string } | null; error: unknown }
    if (!profile.error && profile.data?.timezone) timezone = sanitizeTimezone(profile.data.timezone)

    const hasReasoningProvider = Boolean(process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY)
    const hasTavily = Boolean(process.env.TAVILY_API_KEY)
    const repository = new SupabaseHistoricalRepository(supabase)
    const memory = new PersonalMemoryService(repository)
    const turns = new SupabaseConversationTurnPersistenceRepository(supabase)
    const ledger = new SupabaseConversationLedger(repository, turns)
    const modelDecision = await memory.analyze(parsed.data.query)
    const result = await executeAgent(parsed.data, {
      userId: user.id,
      timezone,
      referenceTimestamp,
    }, {
      repository,
      memory,
      ledger,
      modelDecision,
      classifier: hasReasoningProvider ? { classify: (query) => new OpenRouterHttpProvider().classifyIntent(query) } : undefined,
      reasoner: hasReasoningProvider ? new OpenRouterHttpProvider() : undefined,
      tavily: hasTavily ? new TavilyHttpProvider() : undefined,
      persistence: hasTavily ? new SupabaseResearchPersistenceRepository(supabase) : undefined,
      searchLimits: getSearchExecutionLimits(),
      maxSearchCalls: getSearchExecutionLimits().maxCalls,
    })
    const assistantContent = result.answer?.text ?? result.error?.message ?? (result.status === 'needs_clarification'
      ? 'I need a little more detail before I can answer that.'
      : 'Minimi could not complete that request.')
    let responseResult = result
    try {
      const persistedTurn = await ledger.persistTurn({
        userId: user.id,
        conversationId: result.conversationId ?? parsed.data.conversationId,
        userContent: parsed.data.query,
        assistantContent,
        memories: modelMemoriesOrFallback(modelDecision, memory.extract(parsed.data.query, new Date(referenceTimestamp).getUTCFullYear())),
      })
      responseResult = { ...result, conversationId: result.conversationId ?? persistedTurn.conversationId }
    } catch {
      responseResult = {
        ...result,
        error: result.error ?? { code: 'PERSISTENCE_ERROR', message: 'Minimi answered, but could not save this conversation.' },
      }
    }
    // A user-facing rejection is a valid completed interaction. Reserve 503
    // for failures that produced no safe answer at all.
    const responseStatus = responseResult.status === 'failed' && !responseResult.answer ? 503 : 200
    const response = NextResponse.json(responseResult, { status: responseStatus })
    const totalDurationMs = Math.round(performance.now() - requestStartedAt)
    const searchDurationMs = responseResult.searchExecution?.totalDurationMs ?? 0
    response.headers.set('Server-Timing', `agent;dur=${totalDurationMs}, search;dur=${searchDurationMs}`)
    console.info('[agent.metrics]', JSON.stringify({ status: responseResult.status, intent: responseResult.intent?.intent ?? null, totalDurationMs, searchDurationMs, attemptedSearches: responseResult.searchExecution?.attemptedCalls ?? 0, completedSearches: responseResult.searchExecution?.completedCalls ?? 0 }))
    return response
  } catch {
    console.warn('[agent.metrics]', JSON.stringify({ status: 'internal_error', totalDurationMs: Math.round(performance.now() - requestStartedAt) }))
    return errorResponse(500, 'INTERNAL_ERROR', 'Minimi could not process this request.')
  }
}
