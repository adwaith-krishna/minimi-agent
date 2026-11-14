import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/types'
import type { ClaimComparisonResult, EvidenceSource, ExtractedResearchClaim, SearchExecution } from './contracts'
import type { RememberedMemory } from './memory'

export class ResearchPersistenceError extends Error {
  constructor(readonly cleanupAttempted = false, readonly cleanupSucceeded = true) { super('Research snapshot persistence failed.'); this.name = 'ResearchPersistenceError' }
}

export interface ResearchPersistenceRepository {
  persist(input: {
    userId: string; conversationId?: string; query: string; observedAt: string; searchExecution: SearchExecution;
    evidenceSources: EvidenceSource[]; claims: ExtractedResearchClaim[]; comparisons: ClaimComparisonResult[]; status?: 'completed' | 'failed' | 'partial'
  }): Promise<{ snapshotId: string; conversationId: string }>
}

export interface ConversationTurnPersistenceRepository {
  persistTurn(input: {
    userId: string
    conversationId?: string
    userContent: string
    assistantContent: string
    memories: RememberedMemory[]
  }): Promise<{ conversationId: string }>
}

export class SupabaseResearchPersistenceRepository implements ResearchPersistenceRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async persist(input: Parameters<ResearchPersistenceRepository['persist']>[0]): Promise<{ snapshotId: string; conversationId: string }> {
    const client = this.supabase as unknown as SupabaseClient
    try {
      const searchParams = {
        observationTime: input.observedAt,
        queries: input.searchExecution.outcomes.map(({ query }) => query),
        attemptedCalls: input.searchExecution.attemptedCalls,
        completedCalls: input.searchExecution.completedCalls,
        totalDurationMs: input.searchExecution.totalDurationMs,
        budgetExhausted: input.searchExecution.budgetExhausted,
        outcomes: input.searchExecution.outcomes,
        sourcePublicationDates: input.evidenceSources.filter((source) => source.kind === 'web' && source.publishedAt).map((source) => ({ sourceId: source.id, url: source.url, publishedAt: source.publishedAt })),
        comparisons: input.comparisons,
      } satisfies Json
      const sourceById = new Map(input.evidenceSources.map((source) => [source.id, source]))
      const claims = input.claims.map((claim) => ({
        entity_name: claim.entityName,
        claim_type: claim.claimType,
        claim_text: claim.claimText,
        claim_value: claim.claimValue,
        valid_at: claim.effectiveAt?.precision === 'instant' ? claim.effectiveAt.value : null,
        structured_data: {
          proposition: claim.proposition, currency: claim.currency, billingPeriod: claim.billingPeriod, region: claim.region,
          planOrVersion: claim.planOrVersion, priceType: claim.priceType, discountConditions: claim.discountConditions,
          effectiveDate: claim.effectiveAt, temporalStatus: claim.temporalStatus, confidence: claim.confidence,
          verification: claim.verification, sourceIds: claim.sourceIds,
          comparisons: input.comparisons.filter((comparison) => comparison.currentClaim === claim.claimText),
        },
        sources: claim.sourceIds.flatMap((sourceId) => {
          const source = sourceById.get(sourceId)
          if (!source || source.kind !== 'web' || !source.url) return []
          return [{ url: source.url, title: source.title, snippet: source.snippet, domain: source.domain, score: source.score, published_at: source.publishedAt?.precision === 'instant' ? source.publishedAt.value : null }]
        }),
      })) satisfies Json
      const failedCalls = input.searchExecution.outcomes.some((outcome) => outcome.status === 'failed')
      const successfulCalls = input.searchExecution.outcomes.some((outcome) => outcome.status === 'succeeded')
      const status = input.status ?? (input.searchExecution.attemptedCalls === 0 || !successfulCalls ? 'failed' : failedCalls ? 'partial' : 'completed')
      const persisted = await client.rpc('persist_research_snapshot', {
        p_conversation_id: input.conversationId ?? null,
        p_query: input.query,
        p_search_params: searchParams,
        p_claims: claims,
        p_status: status,
        p_completed_at: new Date().toISOString(),
      }).single() as unknown as { data: { snapshot_id: string; conversation_id: string } | null; error: unknown }
      if (persisted.error || !persisted.data) throw new ResearchPersistenceError()
      return { snapshotId: persisted.data.snapshot_id, conversationId: persisted.data.conversation_id }
    } catch {
      throw new ResearchPersistenceError(false, true)
    }
  }
}

export class SupabaseConversationTurnPersistenceRepository implements ConversationTurnPersistenceRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async persistTurn(input: Parameters<ConversationTurnPersistenceRepository['persistTurn']>[0]): Promise<{ conversationId: string }> {
    const client = this.supabase as unknown as SupabaseClient
    const persisted = await client.rpc('persist_conversation_turn', {
      p_conversation_id: input.conversationId ?? null,
      p_user_content: input.userContent,
      p_assistant_content: input.assistantContent,
      p_memories: input.memories.map(({ validFrom, validTo, ...memory }) => ({ ...memory, ...(validFrom ? { valid_from: validFrom } : {}), ...(validTo ? { valid_to: validTo } : {}) })),
    }).single() as unknown as { data: { conversation_id: string } | null; error: unknown }
    if (persisted.data?.conversation_id) return { conversationId: persisted.data.conversation_id }
    if (persisted.error && this.isMissingTurnFunction(persisted.error)) return this.persistDirectly(input)
    throw new Error('Conversation turn persistence failed.')
  }

  private isMissingTurnFunction(error: unknown): boolean {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : ''
    const message = error instanceof Error ? error.message : JSON.stringify(error)
    return code === '42883' || /persist_conversation_turn|function .* does not exist|could not find the function/i.test(message)
  }

  private async persistDirectly(input: Parameters<ConversationTurnPersistenceRepository['persistTurn']>[0]): Promise<{ conversationId: string }> {
    type InsertQuery = PromiseLike<{ data: unknown; error: unknown }> & { select(columns: string): { single(): Promise<{ data: { id: string } | null; error: unknown }> } }
    const client = this.supabase as unknown as { from(table: string): { insert(values: unknown): InsertQuery } }
    let conversationId = input.conversationId
    if (!conversationId) {
      const created = await client.from('conversations').insert({ user_id: input.userId, title: input.userContent.slice(0, 120) }).select('id').single()
      if (created.error || !created.data) throw new Error('Conversation turn persistence failed.')
      conversationId = created.data.id
    }
    const resolvedConversationId = conversationId
    if (!resolvedConversationId) throw new Error('Conversation turn persistence failed.')
    const userMessage = await client.from('messages').insert({ conversation_id: resolvedConversationId, user_id: input.userId, role: 'user', content: input.userContent }).select('id').single()
    if (userMessage.error || !userMessage.data) throw new Error('Conversation turn persistence failed.')
    const userMessageId = userMessage.data.id
    const assistantMessage = await client.from('messages').insert({ conversation_id: resolvedConversationId, user_id: input.userId, role: 'assistant', content: input.assistantContent }).select('id').single()
    if (assistantMessage.error) throw new Error('Conversation turn persistence failed.')
    if (input.memories.length) {
      const memories = await client.from('memory_items').insert(input.memories.map((memory) => ({ user_id: input.userId, conversation_id: resolvedConversationId, message_id: userMessageId, entity_type: memory.entityType, entity_name: memory.entityName, content: memory.content, valid_from: memory.validFrom ?? null, valid_to: memory.validTo ?? null })))
      if (memories.error) throw new Error('Conversation turn persistence failed.')
    }
    return { conversationId: resolvedConversationId }
  }
}
