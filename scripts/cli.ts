import * as readline from 'readline';
import dotenv from 'dotenv';
dotenv.config();

import { runAgentChat } from '../lib/agent/orchestrator';
import { getActiveModelProvider } from '../lib/agent/llm-provider';
import { getTemporalContext } from '../lib/temporal';
import { getAllSessions, getSessionById, createSession } from '../lib/memory/session-store';

async function main() {
  const temporal = getTemporalContext();
  const modelInfo = getActiveModelProvider();
  const searchProvider = process.env.TAVILY_API_KEY
    ? 'Tavily'
    : process.env.BRAVE_SEARCH_API_KEY
    ? 'Brave'
    : process.env.SERPER_API_KEY
    ? 'Serper'
    : 'DuckDuckGo (zero-config)';

  console.log('\n============================================================');
  console.log('🤖 GROUNDED AI AGENT (Interactive CLI)');
  console.log('============================================================');
  console.log(`Model Provider:  ${modelInfo.provider} (${modelInfo.modelId})`);
  console.log(`Search Engine:   ${searchProvider}`);
  console.log(`Temporal Anchor: ${temporal.isoDate} (${temporal.dayOfWeek})`);
  console.log(`Tool:            web_search`);
  console.log('============================================================');
  console.log('Available Benchmark Scenarios:');
  console.log('  1. CRM Shortlist (Monday discussion)');
  console.log('  2. Postgres Hosting (Last Tuesday discussion)');
  console.log('  3. Next.js 15 / React 19 (3 November discussion)');
  console.log('Type your message, or type "scenario 1/2/3" to switch session.');
  console.log('Type "exit" to quit.\n');

  let currentSessionId = 'benchmark-crm-shortlist';

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = () => {
    const session = getSessionById(currentSessionId);
    const sessionLabel = session?.title || 'Active Session';
    rl.question(`\n[${sessionLabel}] > `, async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        promptUser();
        return;
      }

      if (trimmed.toLowerCase() === 'exit') {
        rl.close();
        process.exit(0);
      }

      if (trimmed.toLowerCase() === 'scenario 1') {
        currentSessionId = 'benchmark-crm-shortlist';
        console.log('Switched to Scenario 1: CRM Shortlist (Monday)');
        promptUser();
        return;
      }
      if (trimmed.toLowerCase() === 'scenario 2') {
        currentSessionId = 'benchmark-postgres-hosting';
        console.log('Switched to Scenario 2: Postgres Hosting (Last Tuesday)');
        promptUser();
        return;
      }
      if (trimmed.toLowerCase() === 'scenario 3') {
        currentSessionId = 'benchmark-nov-3-tech';
        console.log('Switched to Scenario 3: Next.js 15 / React 19 (3 November)');
        promptUser();
        return;
      }

      console.log('\n🔍 Thinking & searching live web...');
      const startTime = Date.now();

      try {
        const session = getSessionById(currentSessionId);
        const history = session
          ? session.messages.map((m) => ({
              role: m.role as 'user' | 'assistant' | 'system',
              content: m.content,
            }))
          : [];

        history.push({ role: 'user', content: trimmed });

        const response = await runAgentChat({
          messages: history,
          sessionId: currentSessionId,
          onToolCall: (event) => {
            if (event.status === 'running') {
              console.log(`   [web_search] -> "${event.args?.query}"`);
            } else if (event.status === 'completed') {
              console.log(`   [web_search] ✓ found ${event.result?.resultCount ?? 0} sources`);
            }
          },
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n--- Agent Response (${elapsed}s) ---`);
        console.log(response.text);

        if (response.sources && response.sources.length > 0) {
          console.log('\n--- Sources Cited ---');
          response.sources.forEach((src) => {
            console.log(`[${src.id}] ${src.title}`);
            console.log(`    ${src.url}`);
          });
        }
      } catch (err: any) {
        console.error('Error during execution:', err.message || err);
      }

      promptUser();
    });
  };

  promptUser();
}

main().catch(console.error);
