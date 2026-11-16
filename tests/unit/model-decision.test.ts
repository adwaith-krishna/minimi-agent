import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeUserMessage } from '@/lib/agent/model-decision'

describe('model request decision', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  it('uses structured model output to capture every independent fact', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key')
    vi.stubEnv('OPENROUTER_ROUTER_MODEL', 'free-router-model')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: 'capture', memories: [{ entityType: 'fact', entityName: 'name', content: "The user's name is Ananya." }, { entityType: 'fact', entityName: 'location', content: 'The user lives in Hyderabad.' }], rationale: 'User supplied personal facts.' }) } }] }), { status: 200 })))
    await expect(analyzeUserMessage('My name is Ananya and I live in Hyderabad.')).resolves.toMatchObject({ action: 'capture', memories: [{ entityName: 'name' }, { entityName: 'location' }] })
  })

  it('supports Gemini JSON output when configured', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key')
    vi.stubEnv('GEMINI_ROUTER_MODEL', 'gemini-free-model')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ action: 'web', memories: [], rationale: 'Current prices require search.' }) }] } }] }), { status: 200 })))
    await expect(analyzeUserMessage('What are the latest MacBook prices?')).resolves.toMatchObject({ action: 'web' })
  })
})
