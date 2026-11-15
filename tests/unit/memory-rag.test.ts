import { afterEach, describe, expect, it, vi } from 'vitest'
import { answerFromPersonalMemory, classifyPersonalQuery } from '@/lib/agent/memory-rag'

const history = {
  messages: [{ id: '00000000-0000-4000-8000-000000000002', conversationId: '00000000-0000-4000-8000-000000000003', role: 'user' as const, content: 'I prefer concise answers.', createdAt: '2026-11-15T10:00:00.000Z' }],
  memoryItems: [{ id: '00000000-0000-4000-8000-000000000001', entityName: 'preference', content: 'The user prefers concise answers.', validFrom: null, validTo: null, createdAt: '2026-11-15T10:00:00.000Z' }],
  researchSnapshots: [],
}

describe('optional personal-memory RAG', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('answers from bounded memory context and does not expose internal IDs', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    vi.stubEnv('OPENROUTER_MEMORY_MODEL', 'small/free-model')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 'You prefer concise answers.', memoryIds: [history.memoryItems[0].id] }) } }] }), { status: 200 })))
    const answer = await answerFromPersonalMemory('What do I prefer?', history)
    expect(answer?.text).toBe('You prefer concise answers.')
    expect(answer?.text).not.toContain(history.memoryItems[0].id)
  })

  it('fails open when OpenRouter is unavailable', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    vi.stubEnv('OPENROUTER_MEMORY_MODEL', 'small/free-model')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')))
    await expect(answerFromPersonalMemory('What do I prefer?', history)).resolves.toBeNull()
  })

  it('uses the same small model as a structured personal/web/conversation router', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    vi.stubEnv('OPENROUTER_MEMORY_MODEL', 'liquid/lfm-3-1.7b:free')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ route: 'personal' }) } }] }), { status: 200 })))
    await expect(classifyPersonalQuery('What exams do I have saved?')).resolves.toBe('personal')
  })
})
