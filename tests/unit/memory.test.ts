import { describe, expect, it } from 'vitest'
import { buildDeterministicMemoryAnswer, extractExplicitMemories } from '@/lib/agent/memory'

describe('explicit personal memory extraction', () => {
  it('captures a user-provided fact for later retrieval', () => {
    expect(extractExplicitMemories('My name is Uday')).toEqual([
      { entityType: 'fact', entityName: 'name', content: "The user's name is Uday." },
    ])
  })

  it('captures preferences and does not persist credential-like content', () => {
    expect(extractExplicitMemories('I prefer dark mode')).toEqual([
      { entityType: 'preference', entityName: 'preference', content: 'The user prefers dark mode.' },
    ])
    expect(extractExplicitMemories('My password is secret123')).toEqual([])
  })

  it('leaves ordinary questions for conversation history without inventing a memory', () => {
    expect(extractExplicitMemories('What is the latest news about AI?')).toEqual([])
  })

  it('captures dated meeting notes for later calendar-style follow-ups', () => {
    expect(extractExplicitMemories('November 2 I had a meeting and the next meeting with the founder is on November 17th 2pm')).toEqual([
      { entityType: 'fact', entityName: 'meeting', content: 'The user noted a personal schedule: November 2 I had a meeting and the next meeting with the founder is on November 17th 2pm Event dates: November 2, November 17th.' },
    ])
  })

  it('does not save a calendar question as a new memory when punctuation is missing', () => {
    expect(extractExplicitMemories('whats planned for november 17th\\')).toEqual([])
  })

  it('stores dated exams and other personal schedule items with event-date context', () => {
    expect(extractExplicitMemories('December 2nd I have an exam', { referenceYear: 2026 })).toEqual([{
      entityType: 'fact', entityName: 'exam', content: 'The user noted a personal schedule: December 2nd I have an exam Event date: December 2nd.', validFrom: '2026-12-02T00:00:00.000Z',
    }])
  })

  it('answers from the earlier factual message instead of echoing the recall question', () => {
    const answer = buildDeterministicMemoryAnswer('what is planned for nov 17?', {
      messages: [
        { id: '00000000-0000-4000-8000-000000000001', conversationId: '00000000-0000-4000-8000-000000000002', role: 'user', content: 'November 12 I have a date and November 17th I have a founders meeting.', createdAt: '2026-11-14T10:00:00.000Z' },
        { id: '00000000-0000-4000-8000-000000000003', conversationId: '00000000-0000-4000-8000-000000000002', role: 'user', content: 'what is planned for nov 17?', createdAt: '2026-11-14T10:01:00.000Z' },
      ],
      memoryItems: [], researchSnapshots: [],
    })
    expect(answer?.text).toContain('founders meeting')
    expect(answer?.text).not.toContain('what is planned for nov 17')
  })

  it('returns all matching saved events for an upcoming-events question', () => {
    const answer = buildDeterministicMemoryAnswer('What are my upcoming events?', {
      messages: [],
      memoryItems: [
        { id: '00000000-0000-4000-8000-000000000001', entityName: 'meeting', content: 'The user noted a personal schedule: November 24th I have a PTA meeting. Event date: November 24th.', validFrom: null, validTo: null, createdAt: '2026-11-15T10:00:00.000Z' },
        { id: '00000000-0000-4000-8000-000000000002', entityName: 'exam', content: 'The user noted a personal schedule: December 2nd I have an exam. Event date: December 2nd.', validFrom: null, validTo: null, createdAt: '2026-11-15T10:01:00.000Z' },
      ], researchSnapshots: [],
    })
    expect(answer?.text).toContain('November 24th')
    expect(answer?.text).toContain('December 2nd')
  })
})
