'use client';

import React from 'react';
import {
  MessageSquare,
  Plus,
  Compass,
  Database,
  History,
  RotateCcw,
  Sparkles,
  Bot,
  ExternalLink,
} from 'lucide-react';
import { ChatSession } from '@/lib/types';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onResetBenchmarks: () => void;
  statusInfo: {
    modelProvider: string;
    modelId: string;
    searchProvider: string;
    today: string;
  } | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onResetBenchmarks,
  statusInfo,
}) => {
  const benchmarkSessions = sessions.filter((s) => s.pinned || s.benchmarkId);
  const userSessions = sessions.filter((s) => !s.pinned && !s.benchmarkId);

  return (
    <aside className="w-80 flex-shrink-0 flex flex-col h-screen border-r border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/40 backdrop-blur">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
              Grounded AI
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono">
                v1.0
              </span>
            </h1>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              Web Search & Temporal Memory
            </p>
          </div>
        </div>

        <button
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 text-xs font-medium transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Benchmark Evaluation Scenarios */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
              <Compass className="w-3 h-3 text-blue-500" />
              Evaluation Scenarios
            </span>
            <button
              onClick={onResetBenchmarks}
              title="Reset evaluation benchmarks to initial state"
              className="text-[10px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 flex items-center gap-0.5"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              reset
            </button>
          </div>

          <div className="space-y-1">
            {benchmarkSessions.map((s) => {
              const isActive = s.id === activeSessionId;
              return (
                <button
                  key={s.id}
                  onClick={() => onSelectSession(s.id)}
                  className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors flex items-start gap-2.5 ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 border border-blue-200 dark:border-blue-900/50 shadow-sm'
                      : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  <Database className="w-3.5 h-3.5 mt-0.5 text-blue-500 flex-shrink-0" />
                  <div className="truncate">
                    <div className="font-medium truncate">{s.title}</div>
                    <div className="text-[10px] text-neutral-400">
                      Anchor:{' '}
                      {new Date(s.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* User Conversation History */}
        <div>
          <div className="px-2 mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
              <History className="w-3 h-3" />
              Recent Conversations
            </span>
          </div>

          {userSessions.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-neutral-400 dark:text-neutral-500">
              No recent conversations yet.
            </div>
          ) : (
            <div className="space-y-1">
              {userSessions.map((s) => {
                const isActive = s.id === activeSessionId;
                return (
                  <button
                    key={s.id}
                    onClick={() => onSelectSession(s.id)}
                    className={`w-full text-left p-2.5 rounded-lg text-xs transition-colors flex items-center gap-2.5 ${
                      isActive
                        ? 'bg-neutral-200/70 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 font-medium'
                        : 'hover:bg-neutral-100 dark:hover:bg-neutral-800/60 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer / Status Drawer */}
      <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-950/40 text-[11px] space-y-1.5">
        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
          <span className="flex items-center gap-1">
            <Bot className="w-3 h-3 text-emerald-500" />
            Model:
          </span>
          <span className="font-mono text-[10px] bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
            {statusInfo?.modelId || 'auto'}
          </span>
        </div>

        <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-400">
          <span>Search Engine:</span>
          <span className="font-mono text-[10px] bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
            {statusInfo?.searchProvider || 'duckduckgo'}
          </span>
        </div>

        <div className="flex items-center justify-between text-neutral-500 text-[10px] pt-1 border-t border-neutral-100 dark:border-neutral-800/60">
          <span>Today Anchor:</span>
          <span className="font-mono">{statusInfo?.today || 'today'}</span>
        </div>
      </div>
    </aside>
  );
};
