import { describe, expect, it } from 'vitest'
import { extractExplicitMemories } from '@/lib/agent/memory'

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
})
