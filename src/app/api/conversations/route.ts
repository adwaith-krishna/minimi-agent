import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to view your conversations.' } }, { status: 401 })

  const result = await supabase
    .from('conversations')
    .select('id, title, summary, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(40)

  if (result.error) return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Conversation history could not be loaded.' } }, { status: 500 })
  return NextResponse.json({ conversations: result.data ?? [] })
}
