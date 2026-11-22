'use client';

import React from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { SearchSource } from '@/lib/types';

interface SourceCardProps {
  source: SearchSource;
}

export const SourceCard: React.FC<SourceCardProps> = ({ source }) => {
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(source.domain)}&sz=32`;

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex flex-col justify-between p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 hover:bg-neutral-100 dark:hover:bg-neutral-800/80 transition-all text-xs max-w-xs shadow-sm hover:shadow"
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-mono text-[10px] font-bold">
          {source.id}
        </span>
        <img
          src={faviconUrl}
          alt=""
          className="w-3.5 h-3.5 rounded-sm"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
        <span className="font-medium text-neutral-600 dark:text-neutral-400 truncate max-w-[140px]">
          {source.domain}
        </span>
        <ExternalLink className="w-3 h-3 ml-auto text-neutral-400 group-hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100" />
      </div>

      <div className="font-medium text-neutral-900 dark:text-neutral-100 line-clamp-1 mb-1">
        {source.title}
      </div>

      <div className="text-neutral-500 dark:text-neutral-400 line-clamp-2 text-[11px] leading-relaxed">
        {source.snippet}
      </div>
    </a>
  );
};
