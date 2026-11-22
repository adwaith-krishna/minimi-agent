import { NextResponse } from 'next/server';
import { getActiveModelProvider } from '@/lib/agent/llm-provider';
import { getTemporalContext } from '@/lib/temporal';

export async function GET() {
  const modelInfo = getActiveModelProvider();
  const temporal = getTemporalContext();

  const searchProvider = process.env.TAVILY_API_KEY
    ? 'tavily'
    : process.env.BRAVE_SEARCH_API_KEY
    ? 'brave'
    : process.env.SERPER_API_KEY
    ? 'serper'
    : 'duckduckgo (zero-config)';

  return NextResponse.json({
    status: 'ok',
    model: modelInfo,
    search: {
      activeProvider: searchProvider,
      hasTavily: !!process.env.TAVILY_API_KEY,
      hasBrave: !!process.env.BRAVE_SEARCH_API_KEY,
      hasSerper: !!process.env.SERPER_API_KEY,
    },
    temporal: {
      today: temporal.isoDate,
      dayOfWeek: temporal.dayOfWeek,
      relativeMap: temporal.relativeDates,
    },
  });
}
