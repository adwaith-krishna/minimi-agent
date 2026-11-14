import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to view this conversation.' } }, { status: 401 })

  const { conversationId } = await params
  const conversation = await supabase
    .from('conversations')
    .select('id, title, summary, created_at, updated_at')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (conversation.error) return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Conversation could not be loaded.' } }, { status: 500 })
  if (!conversation.data) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found.' } }, { status: 404 })

  const messages = await supabase
    .from('messages')
    .select('id, role, content, metadata, created_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(200)
  if (messages.error) return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Conversation messages could not be loaded.' } }, { status: 500 })

  return NextResponse.json({ conversation: conversation.data, messages: messages.data ?? [] })
}
