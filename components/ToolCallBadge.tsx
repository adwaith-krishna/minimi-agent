'use client';

import React, { useState } from 'react';
import { Search, CheckCircle2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { ToolExecutionEvent } from '@/lib/types';

interface ToolCallBadgeProps {
  toolEvent: ToolExecutionEvent;
}

export const ToolCallBadge: React.FC<ToolCallBadgeProps> = ({ toolEvent }) => {
  const [isOpen, setIsOpen] = useState(false);

  const isRunning = toolEvent.status === 'running';
  const isCompleted = toolEvent.status === 'completed';

  return (
    <div className="inline-block my-1.5 w-full max-w-xl">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-100/70 dark:bg-neutral-900/60 hover:bg-neutral-200/60 dark:hover:bg-neutral-800/80 cursor-pointer transition-colors"
      >
        {isRunning ? (
          <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin flex-shrink-0" />
        ) : (
          <Search className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
        )}

        <span className="text-neutral-500 dark:text-neutral-400 font-mono text-[11px]">
          web_search
        </span>

        <span className="text-neutral-700 dark:text-neutral-300 font-medium truncate max-w-sm">
          "{toolEvent.args?.query || 'searching...'}"
        </span>

        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {isCompleted && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              <span>verified</span>
            </span>
          )}
          {isOpen ? (
            <ChevronUp className="w-3 h-3 text-neutral-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-neutral-400" />
          )}
        </div>
      </div>

      {isOpen && (
        <div className="mt-1 p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-xs font-mono text-neutral-600 dark:text-neutral-400 space-y-1 shadow-sm">
          <div>
            <strong className="text-neutral-700 dark:text-neutral-300">Target Query:</strong>{' '}
            {toolEvent.args?.query}
          </div>
          {toolEvent.args?.filter && (
            <div>
              <strong className="text-neutral-700 dark:text-neutral-300">Filter:</strong>{' '}
              {toolEvent.args.filter}
            </div>
          )}
          {toolEvent.result && (
            <div>
              <strong className="text-neutral-700 dark:text-neutral-300">Provider:</strong>{' '}
              {toolEvent.result.provider || 'default'} (
              {toolEvent.result.resultCount ?? 0} hits)
            </div>
          )}
          <div className="text-[10px] text-neutral-400">
            Timestamp: {new Date(toolEvent.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
};
