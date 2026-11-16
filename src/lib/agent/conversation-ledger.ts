import type { HistoricalRetrieval, TemporalRetrievalFilter } from './contracts'
import type { HistoricalRepository } from './retrieval'
import type { ConversationTurnPersistenceRepository } from './persistence'
import type { RememberedMemory } from './memory'

export type LedgerQuery = {
  userId: string
  query: string
  conversationId?: string
  temporalFilter?: TemporalRetrievalFilter
  temporalTerms?: string[]
}

/** Authenticated conversation history boundary used by all agent lanes. */
export interface ConversationLedger {
  retrieve(input: LedgerQuery): Promise<HistoricalRetrieval>
  persistTurn(input: { userId: string; conversationId?: string; userContent: string; assistantContent: string; memories: RememberedMemory[] }): Promise<{ conversationId: string }>
}

export class SupabaseConversationLedger implements ConversationLedger {
  constructor(private readonly history: HistoricalRepository, private readonly turns: ConversationTurnPersistenceRepository) {}

  retrieve(input: LedgerQuery) {
    return this.history.retrieve(input)
  }

  persistTurn(input: Parameters<ConversationTurnPersistenceRepository['persistTurn']>[0]) {
    return this.turns.persistTurn(input)
  }
}
