import { extractExplicitMemories, isPersonalMemoryRecall } from './memory'
import type { IntentResult } from './contracts'
import type { MemoryRoute } from './memory-rag'

export type RequestLane = 'capture' | 'personal' | 'web' | 'conversation'

export type RequestDecision = {
  lane: RequestLane
  reason: string
  needsMemoryFallback: boolean
}

/** Deterministic guardrails run before the model so obvious cases are stable. */
export function decideRequestLane(query: string, intent: IntentResult, modelRoute: MemoryRoute | null): RequestDecision {
  if (extractExplicitMemories(query).length) return { lane: 'capture', reason: 'Explicit user-provided information.', needsMemoryFallback: false }
  if (isPersonalMemoryRecall(query)) return { lane: 'personal', reason: 'The query asks about saved personal context.', needsMemoryFallback: true }
  if (modelRoute === 'web' || intent.intent === 'current_research' || intent.intent === 'historical_current_comparison') {
    return { lane: 'web', reason: 'The query requires current or source-backed information.', needsMemoryFallback: false }
  }
  if (modelRoute === 'personal' || intent.intent === 'historical_conversation_recall' || intent.intent === 'historical_research_recall') {
    return { lane: 'personal', reason: 'The query asks about prior user context or research.', needsMemoryFallback: true }
  }
  return { lane: 'conversation', reason: 'No memory or current-web requirement was detected.', needsMemoryFallback: false }
}
