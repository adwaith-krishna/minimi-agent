import { afterEach, describe, expect, it, vi } from 'vitest'
import { chunkPersonalMessage, createMemoryEmbeddings } from '@/lib/agent/memory-embeddings'

describe('OpenRouter personal-memory embeddings', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('accepts the configured 2048-dimensional embedding model', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    vi.stubEnv('OPENROUTER_MEMORY_EMBEDDING_MODEL', 'nvidia/nemotron-3-embed-1b:free')
    const embedding = Array.from({ length: 2048 }, (_, index) => index / 2048)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'private/openrouter/nvidia/nemotron-3-embed-1b', data: [{ index: 0, embedding }] }), { status: 200 })))
    const result = await createMemoryEmbeddings(['November 23 exams'])
    expect(result?.embeddings[0]).toHaveLength(2048)
  })

  it('fails open for an incompatible embedding response', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    vi.stubEnv('OPENROUTER_MEMORY_EMBEDDING_MODEL', 'nvidia/nemotron-3-embed-1b:free')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'model', data: [{ index: 0, embedding: [0.1] }] }), { status: 200 })))
    await expect(createMemoryEmbeddings(['November 23 exams'])).resolves.toBeNull()
  })

  it('keeps short messages as one chunk and splits long messages', () => {
    expect(chunkPersonalMessage('I have exams on November 23.')).toEqual([{ chunkIndex: 0, content: 'I have exams on November 23.' }])
    expect(chunkPersonalMessage('word '.repeat(700), 240, 20).length).toBeGreaterThan(1)
  })
})
