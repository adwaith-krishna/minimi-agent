import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createClient } from '@supabase/supabase-js'
import { executeAgent } from '@/lib/agent/orchestrator'
import { OpenRouterHttpProvider, TavilyHttpProvider } from '@/lib/agent/providers'
import { SupabaseHistoricalRepository } from '@/lib/agent/retrieval'
import { SupabaseConversationTurnPersistenceRepository } from '@/lib/agent/persistence'
import { extractExplicitMemories } from '@/lib/agent/memory'

const live = process.env.RUN_LIVE_E2E === '1'
const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'LIVE_TEST_EMAIL', 'LIVE_TEST_PASSWORD', 'OPENROUTER_API_KEY', 'TAVILY_API_KEY']
const configured = required.every((key) => Boolean(process.env[key]))

describe.skipIf(!live || !configured)('live authenticated agent path', () => {
  it('authenticates, stores personal context, and answers it through the agent boundary', async () => {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const signIn = await supabase.auth.signInWithPassword({ email: process.env.LIVE_TEST_EMAIL!, password: process.env.LIVE_TEST_PASSWORD! })
    expect(signIn.error).toBeNull()
    expect(signIn.data.user?.id).toBeTruthy()

    const userId = signIn.data.user!.id
    const provider = new OpenRouterHttpProvider()
    const result = await executeAgent({ query: 'My name is Live Test User.' }, { userId, timezone: 'Asia/Kolkata', referenceTimestamp: new Date().toISOString() }, {
      repository: new SupabaseHistoricalRepository(supabase),
      reasoner: provider,
      classifier: { classify: (query: string) => provider.classifyIntent(query) },
      tavily: new TavilyHttpProvider(),
      maxSearchCalls: 1,
    })
    expect(result.status).toBe('no_search')

    const persisted = await new SupabaseConversationTurnPersistenceRepository(supabase).persistTurn({
      userId,
      userContent: 'My name is Live Test User.',
      assistantContent: result.answer?.text ?? 'Saved.',
      memories: extractExplicitMemories('My name is Live Test User.'),
    })
    expect(persisted.conversationId).toBeTruthy()

    const recall = await executeAgent({ query: 'What is my name?' }, { userId, timezone: 'Asia/Kolkata', referenceTimestamp: new Date().toISOString() }, {
      repository: new SupabaseHistoricalRepository(supabase),
      reasoner: provider,
      classifier: { classify: (query: string) => provider.classifyIntent(query) },
      tavily: new TavilyHttpProvider(),
      maxSearchCalls: 1,
    })
    expect(recall.answer?.text.toLowerCase()).toContain('live test user')
  }, 45_000)
})
