import { describe, expect, it, vi } from 'vitest'
import { executeAgent } from '@/lib/agent/orchestrator'
import type { HistoricalRepository } from '@/lib/agent/retrieval'
import type { ResearchPersistenceRepository } from '@/lib/agent/persistence'
import type { ResearchReasoner, TavilyProvider } from '@/lib/agent/providers'
import type { EvidenceSource } from '@/lib/agent/contracts'

const userId = 'b879e41c-5110-485f-a9be-7cd85a2b8ad9'
const context = { userId, timezone: 'UTC', referenceTimestamp: '2026-11-15T12:00:00.000Z' }
const source = (query: string) => ({ query, results: [{ title: `${query} official`, url: `https://example.com/${encodeURIComponent(query)}`, snippet: `${query} evidence`, publishedAt: null, score: 0.9 }] })

function dependencies(history: Awaited<ReturnType<HistoricalRepository['retrieve']>>) {
  const repository: HistoricalRepository = { retrieve: vi.fn(async () => history) }
  const tavily: TavilyProvider = { search: vi.fn(async (query) => source(query)) }
  const reasoner: ResearchReasoner = {
    classifyIntent: vi.fn(),
    extractClaims: vi.fn(async (_query: string, sources: EvidenceSource[]) => sources.slice(0, 1).map((item) => ({ entityName: 'CRM', claimType: 'pricing' as const, claimText: 'The current price is $15 per seat.', claimValue: '15', currency: 'USD', billingPeriod: 'monthly', region: 'US', planOrVersion: 'standard', effectiveAt: null, proposition: 'CRM standard plan price', priceType: 'standard' as const, discountConditions: null, temporalStatus: 'current' as const, confidence: 'high' as const, verification: 'supported' as const, sourceIds: [item.id] }))),
    generateAnswer: vi.fn(async () => ({ text: 'Answer', citations: [], claims: [] })),
  }
  const persistence: ResearchPersistenceRepository = { persist: vi.fn(async () => ({ snapshotId: '8d1e4570-f5e5-4e55-a8f7-65791122a2fb', conversationId: '4e63cb00-88fd-4bb5-b271-e6a00e146a2b' })) }
  return { repository, tavily, reasoner, persistence }
}

describe('authenticated selection scenarios at the agent boundary', () => {
  it('plans entity-aware web research for the CRM comparison prompt', async () => {
    const deps = dependencies({ messages: [{ id: '00000000-0000-4000-8000-000000000001', conversationId: '4e63cb00-88fd-4bb5-b271-e6a00e146a2b', role: 'user', content: 'On Monday we shortlisted Salesforce and HubSpot CRM tools.', createdAt: '2026-11-10T10:00:00.000Z' }], memoryItems: [], researchSnapshots: [] })
    const result = await executeAgent({ query: 'Has any of them changed pricing or shipped something big since?' }, context, deps)
    expect(result.intent?.intent).toBe('historical_current_comparison')
    expect(result.searchPlan?.currentQuestions.length).toBeGreaterThan(1)
    expect(result.answer?.citations.length).toBeGreaterThan(0)
  })

  it('answers the dated conversation-recall prompt from authenticated history', async () => {
    const deps = dependencies({ messages: [{ id: '00000000-0000-4000-8000-000000000001', conversationId: '4e63cb00-88fd-4bb5-b271-e6a00e146a2b', role: 'user', content: 'I asked about Postgres hosting.', createdAt: '2026-11-03T10:00:00.000Z' }], memoryItems: [], researchSnapshots: [] })
    deps.reasoner.generateAnswer = vi.fn(async ({ history }) => ({ text: `You asked about ${history.messages[0]?.content ?? 'nothing'}.`, citations: [], claims: [] }))
    const result = await executeAgent({ query: 'What did I ask you on 3 November?' }, context, deps)
    expect(result.intent?.intent).toBe('historical_conversation_recall')
    expect(result.searchPlan?.shouldSearchWeb).toBe(false)
    expect(result.answer?.text).toContain('Postgres hosting')
  })

  it('searches and compares the Postgres pricing follow-up', async () => {
    const deps = dependencies({ messages: [{ id: '00000000-0000-4000-8000-000000000001', conversationId: '4e63cb00-88fd-4bb5-b271-e6a00e146a2b', role: 'user', content: 'Last Tuesday I asked you about Postgres hosting pricing.', createdAt: '2026-11-10T10:00:00.000Z' }], memoryItems: [], researchSnapshots: [] })
    const result = await executeAgent({ query: 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?' }, context, deps)
    expect(result.intent?.intent).toBe('historical_current_comparison')
    expect(result.searchExecution?.attemptedCalls).toBeGreaterThan(0)
    expect(result.answer?.text).toContain('comparison')
  })
})
