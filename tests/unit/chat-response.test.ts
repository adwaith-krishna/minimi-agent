import { describe, expect, it } from 'vitest'
import { assistantText, citationLabel, formatAssistantText, parseChatResponse, safeCitationUrl } from '@/lib/agent/chat-response'

const base = {
  intent: null, temporal: null, history: null, searchPlan: null, searchExecution: null,
  evidenceSources: [], extractedClaims: [], comparisons: [], snapshotId: null,
  conversationId: '8d1e4570-f5e5-4e55-a8f7-65791122a2fb', error: null,
}

describe('chat response boundary', () => {
  it('hides internal history identifiers without hiding web citations', () => {
    expect(formatAssistantText('You mentioned this before. [history-message:abc] See [web-1].')).toBe('You mentioned this before. See [web-1].')
  })

  it('keeps repeated personal-context paragraphs concise', () => {
    expect(formatAssistantText('From your saved context, you chose the simpler option.\n\nfrom your saved context, you chose the simpler option.')).toBe('From your saved context, you chose the simpler option.')
  })

  it('normalizes conversational spacing and punctuation', () => {
    expect(formatAssistantText('You said   this  ,  and I found it.')).toBe('You said this, and I found it.')
  })

  it('turns long numbered research lists into readable lines', () => {
    expect(formatAssistantText('Here are apps: 1. Invoice2go 2. FreshBooks 3. Zoho Invoice [web-1]')).toContain('Invoice2go\n2. FreshBooks\n3. Zoho Invoice [web-1]')
  })

  it('cleans legacy repeated comparison prefixes without touching web citations', () => {
    expect(formatAssistantText('• New information. No matching historical proposition was found; absence does not prove the fact is new. Current evidence: Pricing changed. [web-2]')).toBe('• Current evidence: Pricing changed. [web-2]')
  })

  it('keeps citations and follow-up identifiers for a completed synthetic fixture', () => {
    // Synthetic fixture: no historical user record is implied by this test data.
    const result = parseChatResponse({ ...base, status: 'completed', answer: { text: 'Supported answer.', claims: [], citations: [{ id: 'source-1', title: 'Example source', url: 'https://example.com/article' }] } })
    expect(result?.conversationId).toBe(base.conversationId)
    expect(result?.answer?.citations[0].url).toBe('https://example.com/article')
    expect(assistantText(result!)).toBe('Supported answer.')
  })

  it('preserves a partial synthetic fixture as an answer with a visible limitation', () => {
    // Synthetic fixture: models an incomplete provider run without claiming live generation.
    const result = parseChatResponse({ ...base, status: 'partial', answer: { text: 'Partial answer.', claims: [], citations: [] }, error: { code: 'PROVIDER_ERROR', message: 'Some searches failed; this may be incomplete.' } })
    expect(result?.status).toBe('partial')
    expect(result?.error?.message).toContain('incomplete')
  })

  it('keeps clarification and failed synthetic fixtures safe and non-leaky', () => {
    // Synthetic fixtures: these represent boundary states, not fabricated user history.
    const clarification = parseChatResponse({ ...base, status: 'needs_clarification', answer: null })
    const failed = parseChatResponse({ ...base, status: 'failed', answer: null, error: { code: 'PROVIDER_ERROR', message: 'Research providers are temporarily unavailable.' } })
    expect(assistantText(clarification!)).toContain('source-backed')
    expect(assistantText(failed!)).not.toContain('token')
    expect(safeCitationUrl('javascript:alert(1)')).toBeNull()
    expect(citationLabel({ id: 'x', title: 'Example', url: 'https://www.example.com/a' })).toBe('example.com')
  })
})
