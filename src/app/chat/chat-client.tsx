'use client'

import { FormEvent, useRef, useState } from 'react'
import { assistantText, citationLabel, parseChatResponse, safeCitationUrl, type ChatMessage } from '@/lib/agent/chat-response'
import type { AgentExecution } from '@/lib/agent/contracts'

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

function SparkIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m12 3 1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Z" /><path d="m19 3 .6 2.4L22 6l-2.4.6L19 9l-.6-2.4L16 6l2.4-.6L19 3Z" /></svg>
}

export default function ChatClient({ email }: { email: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [query, setQuery] = useState('')
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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

  return (
    <div className="minimi-research-shell">
      <aside className={sidebarOpen ? 'chat-sidebar chat-sidebar-open' : 'chat-sidebar'} aria-label="Chat history">
        <div className="chat-sidebar-header">
          <a href="/chat" className="chat-brand"><span className="brand-mark">m</span><span>minimi</span></a>
          <button type="button" className="chat-icon-button sidebar-close" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}><MenuIcon /></button>
        </div>
        <button type="button" className="new-chat-button" onClick={reset}><PlusIcon /> <span>New investigation</span></button>
        <div className="chat-history">
          <p className="chat-history-label">Research trail</p>
          <button type="button" className={messages.length ? 'chat-history-item chat-history-item-active' : 'chat-history-item'} onClick={() => inputRef.current?.focus()}>
            <span>{messages.length ? 'Current investigation' : 'Start a new trail'}</span>
          </button>
        </div>
        <div className="chat-sidebar-footer">
          <div className="chat-account"><span className="chat-avatar">{(email?.[0] ?? 'M').toUpperCase()}</span><span className="chat-account-email">{email ?? 'Research workspace'}</span></div>
          <p><span className="status-dot" /> Memory and source grounding are on.</p>
        </div>
      </aside>

      <main className="chat-main">
        <header className="chat-topbar">
          <button type="button" className="chat-icon-button sidebar-toggle" aria-label="Open chat history" onClick={() => setSidebarOpen(true)}><MenuIcon /></button>
          <div className="chat-model-label"><span>Research desk</span><small><span className="status-dot" /> live evidence mode</small></div>
          <button type="button" className="chat-icon-button topbar-new-chat" aria-label="Start a new chat" onClick={reset}><PlusIcon /></button>
        </header>

        <div className="chat-content">
          {messages.length === 0 ? (
            <section className="chat-empty-state" aria-labelledby="chat-heading">
              <div className="chat-empty-icon"><SparkIcon /></div>
              <p className="chat-kicker">A memory-first research desk</p>
              <h1 id="chat-heading">Bring a question.<br /><em>Leave with a trail.</em></h1>
              <p>Minimi connects what you asked before with fresh evidence, so every answer has a visible path back to its sources.</p>
              <div className="chat-suggestions" aria-label="Suggested prompts">
                <button type="button" onClick={() => selectSuggestion('What changed in artificial intelligence this week?')}><span>01</span> What changed this week?</button>
                <button type="button" onClick={() => selectSuggestion('What did I research in our previous conversations?')}><span>02</span> Find a thread from memory</button>
                <button type="button" onClick={() => selectSuggestion('Compare the current pricing of the leading project management tools.')}><span>03</span> Compare what matters now</button>
              </div>
            </section>
          ) : (
            <section className="chat-message-list" aria-live="polite" aria-label="Conversation">
              {messages.map((message, index) => (
                <article key={message.role + '-' + index} className={message.role === 'user' ? 'chat-message chat-message-user' : 'chat-message chat-message-assistant'}>
                  <div className="chat-message-avatar">{message.role === 'user' ? (email?.[0] ?? 'Y').toUpperCase() : <SparkIcon />}</div>
                  <div className="chat-message-body">
                    <p className="chat-message-author">{message.role === 'user' ? 'You' : 'Minimi'}</p>
                    <p className="chat-message-text">{message.text}</p>
                    {message.result && <div className="message-meta">
                      <span>{statusLabel[message.result.status]}</span>
                      {message.result.searchExecution && <span>{message.result.searchExecution.completedCalls} of {message.result.searchExecution.attemptedCalls} searches returned evidence.</span>}
                      {message.result.error && message.result.status !== 'failed' && <span>Limitation: {message.result.error.message}</span>}
                      {message.result.answer?.citations.length ? <div className="citation-list" aria-label="Sources">{message.result.answer.citations.map((citation) => { const url = safeCitationUrl(citation.url); return url ? <a key={citation.id} href={url} target="_blank" rel="noreferrer" className="citation" title={citation.title}>{citationLabel(citation)} · {citation.title}</a> : null })}</div> : null}
                    </div>}
                  </div>
                </article>
              ))}
              {loading && <div className="chat-message chat-message-assistant" role="status"><div className="chat-message-avatar"><SparkIcon /></div><div className="chat-message-body"><p className="chat-message-author">Minimi</p><p className="chat-typing">Researching<span>.</span><span>.</span><span>.</span></p></div></div>}
            </section>
          )}

          <form onSubmit={submit} className="chat-composer">
            <label htmlFor="query" className="sr-only">Message Minimi</label>
            <textarea ref={inputRef} id="query" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(event) } }} rows={1} maxLength={4000} placeholder="Message Minimi" disabled={loading} />
            <button type="submit" className="chat-send-button" aria-label="Send message" disabled={loading || !query.trim()}><SendIcon /></button>
          </form>
          <p className="chat-disclaimer">Minimi can make mistakes. Check important information in the cited sources.</p>
        </div>
      </main>
    </div>
  )
}
