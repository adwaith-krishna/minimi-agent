'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Search,
  Clock,
  Layers,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { ChatSession, ChatMessage, SearchSource, ToolExecutionEvent } from '@/lib/types';
import { SourceCard } from './SourceCard';
import { ToolCallBadge } from './ToolCallBadge';

interface ChatAreaProps {
  session: ChatSession | null;
  onSendMessage: (text: string) => Promise<void>;
  isLoading: boolean;
  streamingText: string;
  streamingSources: SearchSource[];
  streamingToolCalls: ToolExecutionEvent[];
  todayDateStr: string;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  session,
  onSendMessage,
  isLoading,
  streamingText,
  streamingSources,
  streamingToolCalls,
  todayDateStr,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [session?.messages, streamingText, streamingToolCalls]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await onSendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  };

  const quickPrompts = [
    {
      title: 'CRM Shortlist Delta',
      query:
        'On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?',
    },
    {
      title: 'Postgres Hosting Changes',
      query:
        'Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?',
    },
    {
      title: '3 November Answer Verification',
      query:
        'What did I ask you on 3 November? Is your answer still correct today?',
    },
  ];

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden bg-white dark:bg-neutral-950">
      {/* Header */}
      <header className="px-6 py-3.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-white/70 dark:bg-neutral-950/70 backdrop-blur">
        <div>
          <h2 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <span>{session?.title || 'New Conversation'}</span>
            {session?.benchmarkId && (
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                Benchmark
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Anchor: {todayDateStr}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Search className="w-3 h-3" />
              Live Web Grounding
            </span>
          </div>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Quick Benchmark Prompt Pills */}
        {(!session?.messages || session.messages.length === 0 || session.benchmarkId) && (
          <div className="p-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 mb-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-900 dark:text-blue-200 mb-2.5">
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Benchmark Dataset Test Queries (Click to test):</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {quickPrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendMessage(p.query)}
                  disabled={isLoading}
                  className="text-left p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-blue-300 dark:hover:border-blue-700 transition-all text-xs group shadow-sm disabled:opacity-50"
                >
                  <div className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1 flex items-center justify-between">
                    <span>{p.title}</span>
                    <ArrowRight className="w-3 h-3 text-neutral-400 group-hover:text-blue-500 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <div className="text-neutral-500 dark:text-neutral-400 line-clamp-2 text-[11px]">
                    "{p.query}"
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Existing Messages */}
        {session?.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3.5 ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.role !== 'user' && (
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div
              className={`max-w-3xl space-y-3 ${
                msg.role === 'user'
                  ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-2xl rounded-tr-sm px-4 py-3 text-sm shadow-sm'
                  : 'bg-neutral-50/80 dark:bg-neutral-900/40 border border-neutral-200/80 dark:border-neutral-800/80 rounded-2xl rounded-tl-sm px-5 py-4 text-sm text-neutral-800 dark:text-neutral-200 w-full'
              }`}
            >
              {/* Tool Execution Badges if available */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="border-b border-neutral-200 dark:border-neutral-800/80 pb-2.5 mb-2">
                  <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 mb-1.5">
                    <Search className="w-3 h-3 text-emerald-500" />
                    <span>Web Search Reasoning Steps ({msg.toolCalls.length}):</span>
                  </div>
                  <div className="space-y-1">
                    {msg.toolCalls.map((tc, idx) => (
                      <ToolCallBadge key={idx} toolEvent={tc} />
                    ))}
                  </div>
                </div>
              )}

              {/* Message Content */}
              <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>

              {/* Cited Sources Card Grid */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                  <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 mb-2">
                    <Layers className="w-3 h-3 text-blue-500" />
                    <span>Verified Web Sources ({msg.sources.length}):</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {msg.sources.map((src) => (
                      <SourceCard key={src.id} source={src} />
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 text-right">
                {new Date(msg.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-lg bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-neutral-700 dark:text-neutral-300 flex-shrink-0 mt-0.5">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {/* Live Streaming Response Indicator */}
        {isLoading && (
          <div className="flex gap-3.5 justify-start">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white flex-shrink-0 mt-0.5 shadow-sm">
              <Bot className="w-4 h-4" />
            </div>

            <div className="max-w-3xl space-y-3 bg-neutral-50/80 dark:bg-neutral-900/40 border border-neutral-200/80 dark:border-neutral-800/80 rounded-2xl rounded-tl-sm px-5 py-4 text-sm text-neutral-800 dark:text-neutral-200 w-full animate-in fade-in duration-300">
              {/* Tool Execution Steps Stream */}
              {streamingToolCalls.length > 0 && (
                <div className="border-b border-neutral-200 dark:border-neutral-800/80 pb-2.5 mb-2">
                  <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 mb-1.5">
                    <Search className="w-3 h-3 text-blue-500" />
                    <span>Executing Live Search Steps ({streamingToolCalls.length}):</span>
                  </div>
                  <div className="space-y-1">
                    {streamingToolCalls.map((tc, idx) => (
                      <ToolCallBadge key={idx} toolEvent={tc} />
                    ))}
                  </div>
                </div>
              )}

              {/* Streaming Content */}
              {streamingText ? (
                <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {streamingText}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-neutral-500 text-xs py-2">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  <span>Consulting memory & searching web...</span>
                </div>
              )}

              {/* Real-time Sources Stream */}
              {streamingSources.length > 0 && (
                <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                  <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 mb-2">
                    <Layers className="w-3 h-3 text-blue-500" />
                    <span>Sources Found ({streamingSources.length}):</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {streamingSources.map((src) => (
                      <SourceCard key={src.id} source={src} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Footer Input Area */}
      <footer className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={handleTextareaInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything or test temporal delta (e.g. 'Has any pricing changed since then?')..."
            disabled={isLoading}
            className="w-full resize-none rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3.5 pr-14 text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm max-h-44 disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-2.5 bottom-2.5 p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-200 dark:disabled:bg-neutral-800 text-white disabled:text-neutral-400 transition-colors shadow-sm"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
        <div className="text-center mt-2 text-[11px] text-neutral-400">
          Press <kbd className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 rounded">Enter</kbd> to send, <kbd className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 rounded">Shift+Enter</kbd> for new line. Equipped with 1 tool: <code className="font-mono text-blue-600 dark:text-blue-400">web_search</code>.
        </div>
      </footer>
    </main>
  );
};
