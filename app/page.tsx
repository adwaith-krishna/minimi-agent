'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ChatArea } from '@/components/ChatArea';
import { ChatSession, SearchSource, ToolExecutionEvent } from '@/lib/types';

export default function Home() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [streamingSources, setStreamingSources] = useState<SearchSource[]>([]);
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolExecutionEvent[]>([]);
  const [statusInfo, setStatusInfo] = useState<{
    modelProvider: string;
    modelId: string;
    searchProvider: string;
    today: string;
  } | null>(null);

  // Fetch status and initial sessions
  const loadSessions = async () => {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        if (data.sessions?.length > 0 && !activeSessionId) {
          setActiveSessionId(data.sessions[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  };

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatusInfo({
          modelProvider: data.model?.provider || 'auto',
          modelId: data.model?.modelId || 'auto',
          searchProvider: data.search?.activeProvider || 'duckduckgo',
          today: data.temporal?.today || '',
        });
      }
    } catch (err) {
      console.error('Failed to fetch status:', err);
    }
  };

  useEffect(() => {
    loadSessions();
    loadStatus();
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  const handleNewSession = async () => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setSessions((prev) => [data.session, ...prev]);
        setActiveSessionId(data.session.id);
      }
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const handleResetBenchmarks = async () => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_benchmarks' }),
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        if (data.sessions?.length > 0) {
          setActiveSessionId(data.sessions[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to reset benchmarks:', err);
    }
  };

  const handleSendMessage = async (text: string) => {
    if (isLoading || !text.trim()) return;

    setIsLoading(true);
    setStreamingText('');
    setStreamingSources([]);
    setStreamingToolCalls([]);

    // Optimistically add user message to UI
    let currentSession = activeSession;
    const userMsg = {
      id: `temp-${Date.now()}`,
      role: 'user' as const,
      content: text,
      createdAt: new Date().toISOString(),
    };

    if (currentSession) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSession!.id
            ? { ...s, messages: [...s.messages, userMsg] }
            : s
        )
      );
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId: activeSessionId,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat request failed: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.replace('event: ', '').trim();
          } else if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              if (currentEvent === 'tool-call') {
                setStreamingToolCalls((prev) => {
                  const existingIdx = prev.findIndex(
                    (e) => e.args?.query === data.args?.query
                  );
                  if (existingIdx >= 0) {
                    const copy = [...prev];
                    copy[existingIdx] = data;
                    return copy;
                  }
                  return [...prev, data];
                });
              } else if (currentEvent === 'sources') {
                setStreamingSources((prev) => {
                  const newOnes = data.filter(
                    (n: SearchSource) => !prev.some((p) => p.url === n.url)
                  );
                  return [...prev, ...newOnes];
                });
              } else if (currentEvent === 'text-delta') {
                setStreamingText((prev) => prev + data.chunk);
              } else if (currentEvent === 'done') {
                await loadSessions();
              } else if (currentEvent === 'error') {
                setStreamingText((prev) => prev + `\n\n[Error: ${data.error}]`);
              }
            } catch (jsonErr) {
              console.error('Failed to parse SSE JSON:', jsonErr);
            }
          }
        }
      }
    } catch (err: any) {
      console.error('Error during chat stream:', err);
      setStreamingText(`[Connection Error: ${err.message}]`);
    } finally {
      setIsLoading(false);
      setStreamingText('');
      setStreamingSources([]);
      setStreamingToolCalls([]);
      await loadSessions();
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-neutral-950">
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewSession={handleNewSession}
        onResetBenchmarks={handleResetBenchmarks}
        statusInfo={statusInfo}
      />
      <ChatArea
        session={activeSession}
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
        streamingText={streamingText}
        streamingSources={streamingSources}
        streamingToolCalls={streamingToolCalls}
        todayDateStr={statusInfo?.today || 'today'}
      />
    </div>
  );
}
