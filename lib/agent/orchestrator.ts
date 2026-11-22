import { tool, streamText, generateText } from 'ai';
import { z } from 'zod';
import { resolveLanguageModel } from './llm-provider';
import { buildAgentSystemPrompt } from './prompts';
import { executeWebSearch } from '../search/web-search';
import { SearchSource, ToolExecutionEvent } from '../types';

export interface RunAgentOptions {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  sessionId?: string;
  provider?: string;
  model?: string;
  onToolCall?: (event: ToolExecutionEvent) => void;
  onSourcesFound?: (sources: SearchSource[]) => void;
}

/**
 * Creates the single web_search tool with tracking.
 */
export function createWebSearchTool(
  collectedSources: SearchSource[],
  toolEvents: ToolExecutionEvent[],
  callbacks?: {
    onToolCall?: (event: ToolExecutionEvent) => void;
    onSourcesFound?: (sources: SearchSource[]) => void;
  }
) {
  return {
    web_search: tool({
      description:
        'Search the live web for up-to-date information, current pricing, software updates, changelogs, news, or to verify if previous information is still accurate today. Formulate specific, targeted queries.',
      parameters: z.object({
        query: z.string().describe('The targeted search query, e.g. "HubSpot Sales Hub pricing changes 2024" or "Supabase pricing updates"'),
        filter: z.enum(['recent', 'pricing', 'changelog', 'all']).optional().describe('Optional focus area for the search'),
      }),
      execute: async ({ query, filter }) => {
        const startTime = new Date().toISOString();
        const event: ToolExecutionEvent = {
          toolName: 'web_search',
          args: { query, filter },
          status: 'running',
          timestamp: startTime,
        };
        toolEvents.push(event);
        if (callbacks?.onToolCall) callbacks.onToolCall(event);

        try {
          const searchResult = await executeWebSearch({
            query,
            maxResults: 5,
            deepRead: true,
          });

          // Offset source IDs so across multiple search calls each source has a unique [1], [2], [3]...
          const baseId = collectedSources.length;
          const mappedSources = searchResult.sources.map((src, idx) => ({
            ...src,
            id: baseId + idx + 1,
          }));

          collectedSources.push(...mappedSources);
          if (callbacks?.onSourcesFound) {
            callbacks.onSourcesFound(mappedSources);
          }

          event.status = 'completed';
          event.result = {
            query,
            provider: searchResult.provider,
            resultCount: mappedSources.length,
          };
          if (callbacks?.onToolCall) callbacks.onToolCall(event);

          // Return concise grounded text payload for LLM reasoning
          return {
            query,
            provider: searchResult.provider,
            results: mappedSources.map((s) => ({
              citationId: `[${s.id}]`,
              title: s.title,
              url: s.url,
              snippet: s.snippet,
              pageExcerpt: s.content ? s.content.slice(0, 1000) : undefined,
            })),
          };
        } catch (err: any) {
          event.status = 'failed';
          event.result = { error: err.message };
          if (callbacks?.onToolCall) callbacks.onToolCall(event);
          return { error: `Search failed: ${err.message}` };
        }
      },
    }),
  };
}

/**
 * Execute agent streaming response.
 */
export async function streamAgentChat(options: RunAgentOptions) {
  const model = resolveLanguageModel(options.provider, options.model);
  const lastUserMsg = options.messages.filter((m) => m.role === 'user').pop();
  const userQuery = lastUserMsg ? lastUserMsg.content : '';

  const systemPrompt = buildAgentSystemPrompt(userQuery, options.sessionId);

  const collectedSources: SearchSource[] = [];
  const toolEvents: ToolExecutionEvent[] = [];

  const tools = createWebSearchTool(collectedSources, toolEvents, {
    onToolCall: options.onToolCall,
    onSourcesFound: options.onSourcesFound,
  });

  const result = await streamText({
    model,
    system: systemPrompt,
    messages: options.messages,
    tools,
    maxSteps: 6, // Allows iterative multi-search query planning
  });

  return {
    result,
    collectedSources,
    toolEvents,
  };
}

/**
 * Execute synchronous agent response (useful for CLI or test scripts).
 */
export async function runAgentChat(options: RunAgentOptions) {
  const model = resolveLanguageModel(options.provider, options.model);
  const lastUserMsg = options.messages.filter((m) => m.role === 'user').pop();
  const userQuery = lastUserMsg ? lastUserMsg.content : '';

  const systemPrompt = buildAgentSystemPrompt(userQuery, options.sessionId);

  const collectedSources: SearchSource[] = [];
  const toolEvents: ToolExecutionEvent[] = [];

  const tools = createWebSearchTool(collectedSources, toolEvents, {
    onToolCall: options.onToolCall,
    onSourcesFound: options.onSourcesFound,
  });

  const result = await generateText({
    model,
    system: systemPrompt,
    messages: options.messages,
    tools,
    maxSteps: 6,
  });

  return {
    text: result.text,
    sources: collectedSources,
    toolCalls: toolEvents,
  };
}
