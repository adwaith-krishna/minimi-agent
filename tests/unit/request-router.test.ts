import { describe, expect, it } from 'vitest'
import { classifyIntentDeterministically } from '@/lib/agent/intent'
import { decideRequestLane } from '@/lib/agent/request-router'

describe('request lane router', () => {
  it('routes explicit facts to capture before any provider call', () => {
    const decision = decideRequestLane('My name is Ananya.', classifyIntentDeterministically('My name is Ananya.'), null)
    expect(decision.lane).toBe('capture')
  })

  it('routes personal recalls to memory with a web fallback', () => {
    const query = 'What do I do for work?'
    const decision = decideRequestLane(query, classifyIntentDeterministically(query), 'personal')
    expect(decision.lane).toBe('personal')
    expect(decision.needsMemoryFallback).toBe(true)
  })

  it('routes explicit current research to web', () => {
    const query = 'What are the latest MacBook Pro prices?'
    const decision = decideRequestLane(query, classifyIntentDeterministically(query), 'web')
    expect(decision.lane).toBe('web')
  })
})
