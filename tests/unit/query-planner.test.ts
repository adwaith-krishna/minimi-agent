import { describe, expect, it } from 'vitest'
import { buildEntityAwareSearchQueries } from '@/lib/agent/query-planner'

const emptyHistory = { messages: [], memoryItems: [], researchSnapshots: [] }

describe('entity-aware search planning', () => {
  it('splits comparison research into bounded entity and evidence queries', () => {
    const queries = buildEntityAwareSearchQueries('Has any pricing changed since then?', {
      ...emptyHistory,
      messages: [{ id: '00000000-0000-4000-8000-000000000001', conversationId: '00000000-0000-4000-8000-000000000002', role: 'user', content: 'We shortlisted Salesforce and HubSpot for the team.', createdAt: '2026-11-10T10:00:00.000Z' }],
    })
    expect(queries).toContain('Salesforce pricing current official')
    expect(queries).toContain('HubSpot major product updates releases current official')
    expect(queries.length).toBeLessThanOrEqual(8)
  })

  it('keeps ordinary research as one direct query', () => {
    expect(buildEntityAwareSearchQueries('What is the latest weather forecast?', emptyHistory)).toEqual(['What is the latest weather forecast?'])
  })
})
