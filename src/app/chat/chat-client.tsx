'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { assistantText, citationLabel, formatAssistantText, parseChatResponse, safeCitationUrl, type ChatMessage } from '@/lib/agent/chat-response'
import type { AgentExecution } from '@/lib/agent/contracts'
import { createClient } from '@/lib/supabase/client'

const statusLabel: Record<AgentExecution['status'], string> = {
  needs_clarification: 'Needs more detail',
  no_search: 'Answered from saved context',
  completed: 'Research complete',
  partial: 'Partial result',
  failed: 'Research unavailable',
}

function PlusIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
}

function MenuIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
}

function SendIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 4 16 8-16 8 3-8-3-8Z" /><path d="M7 12h13" /></svg>
}

function TimelineIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M7 4v16M7 7h10M7 12h7M7 17h10" /><circle cx="7" cy="7" r="1.5" fill="currentColor" /><circle cx="7" cy="12" r="1.5" fill="currentColor" /><circle cx="7" cy="17" r="1.5" fill="currentColor" /></svg>
}

function MemoryIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M8 9h8M8 12h5M8 15h7" /></svg>
}

function SourcesIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 5h12v14H6zM9 8h6M9 12h6M9 16h4" /></svg>
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
}

function CopyIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="8" y="8" width="11" height="11" rx="1.5" /><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-10A1.5 1.5 0 0 0 3 5.5v10A1.5 1.5 0 0 0 4.5 17H8" /></svg>
}

function ThumbIcon({ down = false }: { down?: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"><path d={down ? 'M7 10v9M4 10h3v9H4zM7 10l3-6a2 2 0 0 1 2 2v3h5.4a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 16.2 19H7' : 'M7 14V5M4 14h3v-9H4zM7 14l3 6a2 2 0 0 0 2-2v-3h5.4a2 2 0 0 0 2-2.4l-1.2-6A2 2 0 0 0 16.2 5H7'} /></svg>
}

function BookmarkIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3-6 3z" /></svg>
}

export default function ChatClient({ email }: { email: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; updated_at: string }>>([])
  const [query, setQuery] = useState('')
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  async function refreshConversations() {
    const response = await fetch('/api/conversations', { cache: 'no-store' })
    if (!response.ok) return
    const payload = await response.json() as { conversations?: Array<{ id: string; title: string; updated_at: string }> }
    setConversations(payload.conversations ?? [])
  }

  useEffect(() => {
    void refreshConversations()
  }, [])

  async function openConversation(id: string) {
    const response = await fetch(`/api/conversations/${id}`, { cache: 'no-store' })
    if (!response.ok) return
    const payload = await response.json() as { conversation?: { id: string }; messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> }
    setConversationId(payload.conversation?.id ?? id)
    setMessages((payload.messages ?? []).filter((message) => message.role === 'user' || message.role === 'assistant').map((message) => ({ role: message.role as 'user' | 'assistant', text: message.role === 'assistant' ? formatAssistantText(message.content) : message.content })))
    setSidebarOpen(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed || loading) return
    setMessages((current) => [...current, { role: 'user', text: trimmed }])
    setQuery('')
    setLoading(true)
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: trimmed, ...(conversationId ? { conversationId } : {}) }),
      })
      const payload: unknown = await response.json().catch(() => null)
      const result = parseChatResponse(payload)
      if (!result) {
        const message = payload && typeof payload === 'object' && 'error' in payload
          && payload.error && typeof payload.error === 'object' && 'message' in payload.error
          && typeof payload.error.message === 'string'
          ? payload.error.message
          : response.status === 401 ? 'Your session has expired. Sign in again to continue.' : `Minimi could not complete that request (${response.status}).`
        throw new Error(message)
      }
      setConversationId(result.conversationId ?? conversationId)
      setMessages((current) => [...current, { role: 'assistant', text: assistantText(result), result }])
      void refreshConversations()
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', text: error instanceof Error ? error.message : 'Minimi could not complete that request.' }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function reset() {
    setMessages([])
    setConversationId(undefined)
    setQuery('')
    setSidebarOpen(false)
    inputRef.current?.focus()
  }

  function selectSuggestion(value: string) {
    setQuery(value)
    inputRef.current?.focus()
  }

  function copyAnswer(value: string) {
    void navigator.clipboard?.writeText(value)
  }

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  return (
    <div className={messages.length ? 'minimi-research-shell chat-with-messages' : 'minimi-research-shell'}>
      <aside className={sidebarOpen ? 'chat-sidebar chat-sidebar-open' : 'chat-sidebar'} aria-label="Chat history">
        <div className="chat-sidebar-header">
          <a href="/chat" className="chat-brand"><span className="brand-mark">◐</span><span>Minimi</span><span className="brand-chevron">⌄</span></a>
          <div className="sidebar-tools"><button type="button" className="chat-icon-button" aria-label="Search chats" onClick={() => inputRef.current?.focus()}><SearchIcon /></button><button type="button" className="chat-icon-button sidebar-close" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}><MenuIcon /></button></div>
        </div>
        <button type="button" className="new-chat-button" onClick={reset}><PlusIcon /> <span>New chat</span></button>
        <nav className="desk-nav" aria-label="Workspace">
          <button type="button" className="desk-nav-item desk-nav-item-active" onClick={() => inputRef.current?.focus()}><TimelineIcon /><span>Home</span></button>
          <button type="button" className="desk-nav-item" onClick={() => inputRef.current?.focus()}><SourcesIcon /><span>Campaigns</span></button>
          <button type="button" className="desk-nav-item" onClick={() => inputRef.current?.focus()}><MemoryIcon /><span>Analytics</span></button>
          <button type="button" className="desk-nav-item" onClick={() => inputRef.current?.focus()}><MemoryIcon /><span>Campaigns</span></button>
          <button type="button" className="desk-nav-item" onClick={() => inputRef.current?.focus()}><span className="more-dots">···</span><span>More</span></button>
        </nav>
        <div className="sidebar-group">
          <p className="sidebar-group-label">Tools</p>
          <button type="button" className="sidebar-tool-item" onClick={() => inputRef.current?.focus()}><span className="tool-badge tool-orange">◈</span>Campaign</button>
          <button type="button" className="sidebar-tool-item" onClick={() => inputRef.current?.focus()}><span className="tool-badge tool-blue">✣</span>Creatives</button>
          <button type="button" className="sidebar-tool-item" onClick={() => inputRef.current?.focus()}><span className="tool-badge tool-green">▤</span>Briefs</button>
          <button type="button" className="sidebar-tool-item" onClick={() => inputRef.current?.focus()}><span className="tool-badge tool-purple">✦</span>Workflows</button>
        </div>
        <div className="sidebar-group sidebar-pinned">
          <p className="sidebar-group-label">Pinned</p>
          <button type="button" className="sidebar-chat-item" onClick={() => inputRef.current?.focus()}><MemoryIcon /> Make a new creative for t...</button>
          <button type="button" className="sidebar-chat-item" onClick={() => inputRef.current?.focus()}><SourcesIcon /> Campaign here</button>
        </div>
        <div className="chat-history">
          <p className="chat-history-label">Chat history</p>
          {conversations.length ? conversations.map((conversation) => <button key={conversation.id} type="button" className={conversation.id === conversationId ? 'chat-history-item chat-history-item-active' : 'chat-history-item'} onClick={() => void openConversation(conversation.id)}>{conversation.title || 'New conversation'}</button>) : <p className="chat-history-empty">Your saved conversations will appear here.</p>}
        </div>
        <div className="chat-sidebar-footer">
          <div className="chat-account"><span className="chat-avatar">{(email?.[0] ?? 'M').toUpperCase()}</span><span className="chat-account-email">{email ?? 'Research workspace'}</span></div>
        </div>
      </aside>

      <main className="chat-main">
        <header className="chat-topbar">
          <button type="button" className="chat-icon-button sidebar-toggle" aria-label="Open chat history" onClick={() => setSidebarOpen(true)}><MenuIcon /></button>
          <div className="chat-model-label"><span className="chat-app-name">Minimi Agent</span></div>
          <div className="chat-header-actions"><button type="button" className="chat-header-new" onClick={reset}><PlusIcon /> New chat</button><button type="button" className="chat-icon-button topbar-new-chat" aria-label="Start a new chat" onClick={reset}><PlusIcon /></button><div className="user-menu"><button type="button" className="user-menu-trigger" aria-label="Open account menu" aria-expanded={userMenuOpen} onClick={() => setUserMenuOpen((open) => !open)}>{(email?.[0] ?? 'U').toUpperCase()}</button>{userMenuOpen && <div className="user-menu-popover"><span>{email ?? 'Account'}</span><button type="button" onClick={() => void signOut()}>Sign out</button></div>}</div></div>
        </header>

        <div className={messages.length ? 'chat-content' : 'chat-content chat-content-empty'}>
          {messages.length === 0 ? (
            <section className="chat-empty-state" aria-labelledby="chat-heading">
              <div className="chat-empty-icon"><span className="agent-mark">M</span></div>
              <p className="chat-kicker">Minimi Agent</p>
              <h1 id="chat-heading">Ask or search anything</h1>
              <p>Ask Minimi to investigate a question, retrieve your past context, or find what changed on the web.</p>
              <div className="chat-suggestions" aria-label="Suggested prompts">
                <button type="button" onClick={() => selectSuggestion('What changed in artificial intelligence this week?')}><span>◌</span> What changed this week?</button>
                <button type="button" onClick={() => selectSuggestion('What did I research in our previous conversations?')}><span>◌</span> Find a thread from memory</button>
                <button type="button" onClick={() => selectSuggestion('Compare the current pricing of the leading project management tools.')}><span>◌</span> Compare what matters now</button>
              </div>
            </section>
          ) : (
            <section className="chat-message-list" aria-live="polite" aria-label="Conversation">
              {messages.map((message, index) => (
                <article key={message.role + '-' + index} className={message.role === 'user' ? 'chat-message chat-message-user' : 'chat-message chat-message-assistant'}>
                  <div className="chat-message-avatar">{message.role === 'user' ? (email?.[0] ?? 'Y').toUpperCase() : 'M'}</div>
                  <div className="chat-message-body">
                    {message.role === 'assistant' ? <p className="chat-message-author agent-badge"><span className="agent-mark">M</span> Minimi Agent</p> : <p className="chat-message-author">You</p>}
                    <p className="chat-message-text">{message.text}</p>
                    {message.role === 'assistant' && <div className="message-actions" aria-label="Answer actions"><button type="button" aria-label="Copy answer" onClick={() => copyAnswer(message.text)}><CopyIcon /></button><button type="button" aria-label="Helpful"><ThumbIcon /></button><button type="button" aria-label="Not helpful"><ThumbIcon down /></button><button type="button" aria-label="Save answer"><BookmarkIcon /></button></div>}
                    {message.result && <div className="message-meta">
                      <div className="orchestrator-summary"><span className="orchestrator-chevron">⌄</span><span>{statusLabel[message.result.status]}</span></div>
                      {message.result.searchExecution && <div className="orchestrator-step"><span className="orchestrator-step-icon">◎</span><span>Searched</span><div className="source-chip-row">{message.result.answer?.citations.slice(0, 5).map((citation) => { const url = safeCitationUrl(citation.url); return url ? <a key={citation.id} href={url} target="_blank" rel="noreferrer" className="source-chip" title={citation.title}><span className="source-chip-dot" />{citationLabel(citation)}</a> : null })}</div><span className="source-more">{message.result.searchExecution.completedCalls} + more</span></div>}
                      <div className="orchestrator-line"><span className="orchestrator-node" />Reviewed your saved context</div>
                      <div className="orchestrator-line"><span className="orchestrator-node" />Compared the most relevant evidence</div>
                      <div className="orchestrator-line orchestrator-line-complete"><span className="orchestrator-node">✓</span>{statusLabel[message.result.status]}</div>
                      {message.result.error && message.result.status !== 'failed' && <span>Limitation: {message.result.error.message}</span>}
                      {message.result.answer?.citations.length ? <div className="citation-list" aria-label="Sources">{message.result.answer.citations.map((citation) => { const url = safeCitationUrl(citation.url); return url ? <a key={citation.id} href={url} target="_blank" rel="noreferrer" className="citation" title={citation.title}>{citationLabel(citation)} · {citation.title}</a> : null })}</div> : null}
                    </div>}
                  </div>
                </article>
              ))}
              {loading && <div className="chat-message chat-message-assistant" role="status"><div className="chat-message-avatar">M</div><div className="chat-message-body"><p className="chat-message-author agent-badge"><span className="agent-mark">M</span> Minimi Agent</p><p className="chat-typing">Researching<span>.</span><span>.</span><span>.</span></p></div></div>}
            </section>
          )}

          <form onSubmit={submit} className="chat-composer">
            <label htmlFor="query" className="sr-only">Message Minimi</label>
            <div className="chat-composer-input"><textarea ref={inputRef} id="query" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(event) } }} rows={1} maxLength={4000} placeholder="Ask or search anything" disabled={loading} /></div>
            <div className="chat-composer-toolbar">
              <button type="button" className="composer-attach" aria-label="Add context">＋</button>
              <button type="button" className="composer-mode composer-mode-active"><MemoryIcon /> Browse prompts</button>
              <button type="button" className="composer-mode"><span className="status-dot" /> Web search</button>
              <span className="composer-provider">Minimi Agent <span>⌄</span></span>
              <button type="submit" className="chat-send-button" aria-label="Send message" disabled={loading || !query.trim()}><SendIcon /></button>
            </div>
          </form>
          <p className="chat-disclaimer">Minimi can make mistakes. Check important information in the cited sources.</p>
        </div>
      </main>
    </div>
  )
}
