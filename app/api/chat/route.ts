import { NextRequest } from 'next/server';
import { streamText } from 'ai';
import { resolveLanguageModel } from '@/lib/agent/llm-provider';
import { buildAgentSystemPrompt } from '@/lib/agent/prompts';
import { createWebSearchTool } from '@/lib/agent/orchestrator';
import { appendMessage, getSessionById, createSession } from '@/lib/memory/session-store';
import { SearchSource, ToolExecutionEvent } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { message, sessionId, provider, model } = await req.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400 });
    }

    let currentSessionId = sessionId;
    if (!currentSessionId) {
      const newSession = createSession();
      currentSessionId = newSession.id;
    }

    // Save user message to session memory
    appendMessage(currentSessionId, {
      role: 'user',
      content: message,
    });

    const session = getSessionById(currentSessionId);
    const historyMessages = session
      ? session.messages.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        }))
      : [{ role: 'user' as const, content: message }];

    const systemPrompt = buildAgentSystemPrompt(message, currentSessionId);
    const selectedModel = resolveLanguageModel(provider, model);

    const collectedSources: SearchSource[] = [];
    const toolEvents: ToolExecutionEvent[] = [];

    // Create readable stream for Server-Sent Events
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: any) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const tools = createWebSearchTool(collectedSources, toolEvents, {
            onToolCall: (event) => {
              sendEvent('tool-call', event);
            },
            onSourcesFound: (newSources) => {
              sendEvent('sources', newSources);
            },
          });

          const result = await streamText({
            model: selectedModel,
            system: systemPrompt,
            messages: historyMessages,
            tools,
            maxSteps: 6,
          });

          let fullResponseText = '';

          for await (const chunk of result.textStream) {
            fullResponseText += chunk;
            sendEvent('text-delta', { chunk });
          }

          // Save assistant message to persistent memory
          appendMessage(currentSessionId, {
            role: 'assistant',
            content: fullResponseText,
            sources: collectedSources,
            toolCalls: toolEvents,
          });

          sendEvent('done', {
            sessionId: currentSessionId,
            fullText: fullResponseText,
            sources: collectedSources,
            toolCalls: toolEvents,
          });

          controller.close();
        } catch (err: any) {
          console.error('Agent chat streaming error:', err);
          sendEvent('error', { error: err.message || 'Stream processing failed' });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('API /api/chat error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
