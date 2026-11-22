import dotenv from 'dotenv';
dotenv.config();

import { getTemporalContext } from '../lib/temporal';
import { executeWebSearch } from '../lib/search/web-search';
import { getAllSessions, searchConversationMemory, resetToBenchmarkDefaults } from '../lib/memory/session-store';
import { getActiveModelProvider } from '../lib/agent/llm-provider';
import { runAgentChat } from '../lib/agent/orchestrator';

async function runTests() {
  console.log('============================================================');
  console.log('🧪 RUNNING AGENT ARCHITECTURE & BENCHMARK TEST SUITE');
  console.log('============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName} ${details ? `- ${details}` : ''}`);
    }
  }

  // -------------------------------------------------------------
  // Test 1: Temporal Context Engine
  // -------------------------------------------------------------
  console.log('--- 1. Testing Temporal Context Engine ---');
  const temporal = getTemporalContext();
  assert(!!temporal.isoDate, 'Temporal engine produces valid ISO date', temporal.isoDate);
  assert(!!temporal.relativeDates.thisMonday, 'Resolves relative Monday', temporal.relativeDates.thisMonday);
  assert(!!temporal.relativeDates.lastTuesday, 'Resolves relative last Tuesday', temporal.relativeDates.lastTuesday);
  console.log(`   Anchor Date: ${temporal.isoDate} (${temporal.dayOfWeek})\n`);

  // -------------------------------------------------------------
  // Test 2: Persistent Session Store & Benchmark Seeding
  // -------------------------------------------------------------
  console.log('--- 2. Testing Persistent Memory & Benchmark Seeding ---');
  resetToBenchmarkDefaults();
  const sessions = getAllSessions();
  assert(sessions.length >= 3, 'Pre-seeded benchmark sessions initialized', `Found ${sessions.length} sessions`);

  const crmSession = sessions.find((s) => s.benchmarkId === 'crm-shortlist');
  assert(!!crmSession, 'Monday CRM shortlist scenario present');
  assert(crmSession?.messages.length === 2, 'CRM scenario has user query + assistant baseline shortlist');

  const pgSession = sessions.find((s) => s.benchmarkId === 'postgres-hosting');
  assert(!!pgSession, 'Last Tuesday Postgres hosting scenario present');

  const nov3Session = sessions.find((s) => s.benchmarkId === 'nov-3-tech');
  assert(!!nov3Session, '3 November tech question scenario present');
  console.log('');

  // -------------------------------------------------------------
  // Test 3: Cross-Session Memory Retrieval
  // -------------------------------------------------------------
  console.log('--- 3. Testing Temporal & Semantic Memory Retrieval ---');
  const crmQuery = 'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?';
  const crmHits = searchConversationMemory(crmQuery);
  assert(crmHits.length > 0, 'Retrieves Monday CRM shortlist from memory for benchmark query 1');
  assert(crmHits[0]?.matchedSessionTitle.includes('CRM'), 'Top memory match is CRM shortlist session');

  const novQuery = 'What did I ask you on 3 November? Is your answer still correct today?';
  const novHits = searchConversationMemory(novQuery);
  assert(novHits.length > 0, 'Retrieves 3 November conversation for benchmark query 2');

  const pgQuery = 'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?';
  const pgHits = searchConversationMemory(pgQuery);
  assert(pgHits.length > 0, 'Retrieves Last Tuesday Postgres hosting conversation for benchmark query 3');
  console.log('');

  // -------------------------------------------------------------
  // Test 4: Web Search Tool Execution (Single Tool)
  // -------------------------------------------------------------
  console.log('--- 4. Testing Single Tool: web_search Execution ---');
  const searchStartTime = Date.now();
  const searchResult = await executeWebSearch({
    query: 'HubSpot Sales Hub pricing changes',
    maxResults: 3,
  });
  const searchDuration = Date.now() - searchStartTime;

  assert(searchResult.sources.length > 0, 'web_search returns sources', `Found ${searchResult.sources.length} sources`);
  assert(searchDuration < 10000, 'web_search completes fast', `${searchDuration}ms`);
  console.log(`   Provider: ${searchResult.provider} (${searchDuration}ms)`);
  console.log(`   Top Result: "${searchResult.sources[0]?.title}" (${searchResult.sources[0]?.url})\n`);

  // -------------------------------------------------------------
  // Test 5: End-to-End Benchmark Execution (if LLM Key is configured)
  // -------------------------------------------------------------
  console.log('--- 5. End-to-End LLM Agent Verification ---');
  const modelInfo = getActiveModelProvider();
  console.log(`   Active Model Provider: ${modelInfo.provider} (${modelInfo.modelId})`);

  if (modelInfo.provider === 'unconfigured') {
    console.log('ℹ️  No LLM API key detected in .env. Skipping live LLM call.');
    console.log('   (To test live LLM execution, add OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY to .env)');
  } else {
    console.log(`   Testing benchmark prompt 1: "${crmQuery.slice(0, 50)}..."`);
    const agentStart = Date.now();
    try {
      const response = await runAgentChat({
        messages: [{ role: 'user', content: crmQuery }],
        sessionId: 'benchmark-crm-shortlist',
      });
      const agentDuration = ((Date.now() - agentStart) / 1000).toFixed(2);
      assert(!!response.text && response.text.length > 50, 'Agent generates comprehensive response');
      assert(response.sources.length > 0, 'Agent executed web_search tool during reasoning');
      console.log(`   Agent finished in ${agentDuration}s with ${response.sources.length} cited sources.`);
      console.log(`   Preview of response:\n   ${response.text.slice(0, 200)}...\n`);
    } catch (err: any) {
      console.warn(`   Agent call failed: ${err.message}`);
    }
  }

  console.log('============================================================');
  console.log(`📊 TEST SUMMARY: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('============================================================\n');
}

runTests().catch(console.error);
