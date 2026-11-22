import { NextRequest, NextResponse } from 'next/server';
import { getAllSessions, createSession, resetToBenchmarkDefaults } from '@/lib/memory/session-store';

export async function GET() {
  const sessions = getAllSessions();
  return NextResponse.json({ sessions });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  
  if (body.action === 'reset_benchmarks') {
    const benchmarks = resetToBenchmarkDefaults();
    return NextResponse.json({ sessions: benchmarks });
  }

  const session = createSession(body.title);
  return NextResponse.json({ session });
}
