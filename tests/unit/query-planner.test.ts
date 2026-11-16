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

  it('plans one bounded query per tool for a five-tool shortlist', () => {
    const queries = buildEntityAwareSearchQueries('Have any of those tools changed pricing or released major features since Monday?', {
      ...emptyHistory,
      messages: [{ id: '00000000-0000-4000-8000-000000000001', conversationId: '00000000-0000-4000-8000-000000000002', role: 'user', content: 'On Monday, I shortlisted Notion, Asana, Linear, Trello, and ClickUp for a design team.', createdAt: '2026-11-10T10:00:00.000Z' }],
    })
    expect(queries.filter((query) => /Notion|Asana|Linear|Trello|ClickUp/.test(query)).length).toBe(5)
  })
})
