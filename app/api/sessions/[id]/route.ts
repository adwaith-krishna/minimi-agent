import { NextRequest, NextResponse } from 'next/server';
import { getSessionById, getAllSessions } from '@/lib/memory/session-store';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionById(params.id);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  return NextResponse.json({ session });
}
