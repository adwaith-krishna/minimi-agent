import { NextResponse } from 'next/server'
import { AgentQuerySchema } from '@/lib/agent/contracts'
import { executeAgent } from '@/lib/agent/orchestrator'
import { OpenRouterHttpProvider, TavilyHttpProvider } from '@/lib/agent/providers'
import { readAgentRequestBody, getMaxAgentRequestBytes } from '@/lib/agent/request-body'
import { SupabaseHistoricalRepository } from '@/lib/agent/retrieval'
import { SupabaseConversationTurnPersistenceRepository, SupabaseResearchPersistenceRepository } from '@/lib/agent/persistence'
import { extractExplicitMemories } from '@/lib/agent/memory'
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
    const result = await executeAgent(parsed.data, {
      userId: user.id,
      timezone,
      referenceTimestamp,
    }, {
      repository: new SupabaseHistoricalRepository(supabase),
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
      const persistedTurn = await new SupabaseConversationTurnPersistenceRepository(supabase).persistTurn({
        userId: user.id,
        conversationId: result.conversationId ?? parsed.data.conversationId,
        userContent: parsed.data.query,
        assistantContent,
        memories: extractExplicitMemories(parsed.data.query, { referenceYear: new Date(referenceTimestamp).getUTCFullYear() }),
      })
      responseResult = { ...result, conversationId: result.conversationId ?? persistedTurn.conversationId }
    } catch {
      responseResult = {
        ...result,
        error: result.error ?? { code: 'PERSISTENCE_ERROR', message: 'Minimi answered, but could not save this conversation.' },
      }
    }
    return NextResponse.json(responseResult, { status: responseResult.status === 'failed' ? 503 : 200 })
  } catch {
    return errorResponse(500, 'INTERNAL_ERROR', 'Minimi could not process this request.')
  }
}
