'use client'

import { FormEvent, useRef, useState } from 'react'
import { assistantText, citationLabel, parseChatResponse, safeCitationUrl, type ChatMessage } from '@/lib/agent/chat-response'
import type { AgentExecution } from '@/lib/agent/contracts'
import { researchBenefits, researchNavItems } from '@/lib/ui/meta-design'

const statusLabel: Record<AgentExecution['status'], string> = {
  needs_clarification: 'Needs a little more detail',
  no_search: 'Answered from your saved context',
  completed: 'Research complete',
  partial: 'Partial result',
  failed: 'Research unavailable',
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
}

function MenuIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
}

function UserIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3" /><path d="M5 20c.8-3.2 3.1-5 7-5s6.2 1.8 7 5" /></svg>
}

export default function ChatClient({ email }: { email: string | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [query, setQuery] = useState('')
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
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
      const payload: unknown = await response.json()
      const result = parseChatResponse(payload)
      if (!result) throw new Error('Minimi could not complete that request.')
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
    inputRef.current?.focus()
  }

  return (
    <main className="minimi-shell">
      <div className="promo-banner">
        <span>Research with memory, grounded in the sources that matter.</span>
        <a href="#how-it-works">See how it works</a>
      </div>

      <header className="site-nav">
        <a className="wordmark" href="/chat" aria-label="Minimi home">minimi</a>
        <nav className="nav-tabs" aria-label="Primary navigation">
          {researchNavItems.map((item) => <button key={item} type="button" className={item === 'Research' ? 'pill-tab pill-tab-active' : 'pill-tab'} onClick={() => item === 'Research' && document.getElementById('conversation')?.scrollIntoView({ behavior: 'smooth' })}>{item}</button>)}
        </nav>
        <div className="nav-actions">
          <div className="search-pill" aria-label="Search is available through the prompt below"><SearchIcon /><span>Search memory</span></div>
          <button type="button" className="icon-button" aria-label={email ? 'Signed in account' : 'Account'} title={email ?? 'Account'}><UserIcon /></button>
          <button type="button" className="icon-button menu-button" aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen((open) => !open)}><MenuIcon /></button>
        </div>
      </header>
      <nav id="mobile-menu" className={menuOpen ? 'mobile-menu mobile-menu-open' : 'mobile-menu'} aria-label="Mobile navigation">
        {researchNavItems.map((item) => <button key={item} type="button" className={item === 'Research' ? 'pill-tab pill-tab-active' : 'pill-tab'} onClick={() => { setMenuOpen(false); document.getElementById('conversation')?.scrollIntoView({ behavior: 'smooth' }) }}>{item}</button>)}
      </nav>

      <section className="hero" aria-labelledby="hero-title">
        <p className="hero-eyebrow">Temporal memory research agent</p>
        <h1 id="hero-title">Look back. Check what changed. Move forward.</h1>
        <p>Minimi brings your earlier conversations into the present, then searches current sources when the answer needs a fresh check.</p>
        <div className="hero-actions">
          <button type="button" className="button button-primary" onClick={() => inputRef.current?.focus()}>Start an investigation</button>
          <button type="button" className="button button-secondary" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>Explore the approach</button>
        </div>
      </section>

      <section id="how-it-works" className="content-wrap" aria-labelledby="approach-title">
        <div className="section-heading">
          <h2 id="approach-title">A better way to ask what changed</h2>
          <p>Memory, time, web research, and evidence work together as one conversational flow.</p>
        </div>
        <div className="benefit-grid">
          {researchBenefits.map(([number, title, description]) => <article className="benefit-card" key={number}><span className="benefit-number">{number}</span><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </section>

      <section id="conversation" className="content-wrap chat-stage" aria-label="Minimi conversation">
        <div className="conversation-panel">
          <p className="panel-kicker">Your research desk</p>
          <h2>What would you like to investigate?</h2>
          {messages.length === 0 ? (
            <div className="empty-state">
              <div>
                <div className="empty-state-mark" aria-hidden="true">✦</div>
                <h3>Ask a question in your own words.</h3>
                <p>Try “What did I ask you on 3 November?” or “Has the pricing changed since we compared those tools?”</p>
              </div>
            </div>
          ) : (
            <div className="message-list" aria-live="polite">
              {messages.map((message, index) => (
                <article key={message.role + '-' + index} className={message.role === 'user' ? 'message message-user' : 'message message-assistant'}>
                  <p>{message.text}</p>
                  {message.result && <div className="message-meta">
                    <p>{statusLabel[message.result.status]}</p>
                    {message.result.searchExecution && <p>{message.result.searchExecution.completedCalls} of {message.result.searchExecution.attemptedCalls} source searches returned evidence.</p>}
                    {message.result.error && message.result.status !== 'failed' && <p>Limitation: {message.result.error.message}</p>}
                    {message.result.answer?.citations.length ? <div className="citation-list" aria-label="Sources">{message.result.answer.citations.map((citation) => { const url = safeCitationUrl(citation.url); return url ? <a key={citation.id} href={url} target="_blank" rel="noreferrer" className="citation" title={citation.title}>{citationLabel(citation)} · {citation.title}</a> : null })}</div> : null}
                  </div>}
                </article>
              ))}
              {loading && <div className="message message-assistant" role="status">Searching sources and checking evidence…</div>}
            </div>
          )}

          <form onSubmit={submit} className="composer">
            <label htmlFor="query" className="sr-only">Ask Minimi</label>
            <div className="composer-row">
              <textarea ref={inputRef} id="query" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(event) } }} rows={2} maxLength={4000} placeholder="Ask a research question…" disabled={loading} />
              <button type="submit" disabled={loading || !query.trim()} className="button button-buy">{loading ? 'Working…' : 'Ask Minimi'}</button>
            </div>
            <p className="composer-hint">Enter to send · Shift + Enter for a new line · Your sources stay private</p>
          </form>
        </div>

        <aside className="memory-panel" aria-labelledby="memory-title">
          <p className="panel-kicker">Designed for continuity</p>
          <h2 id="memory-title">The answer keeps the trail.</h2>
          <div className="memory-list">
            <div className="memory-item"><strong>Past conversations</strong><span>Retrieve the right date and context before searching.</span></div>
            <div className="memory-item"><strong>Research snapshots</strong><span>Preserve what was previously found instead of overwriting it.</span></div>
            <div className="memory-item"><strong>Evidence signals</strong><span>Separate supported findings from uncertainty.</span></div>
          </div>
          <button type="button" className="button button-primary" style={{ marginTop: 24, width: '100%' }} onClick={reset}>New conversation</button>
        </aside>
      </section>

      <footer className="footer-region">
        <div><h2>minimi</h2><p>Research that remembers what came before.</p></div>
        <div><h3>Product</h3><div className="footer-links"><a href="#conversation">Research desk</a><a href="#how-it-works">How it works</a></div></div>
        <div><h3>Memory</h3><div className="footer-links"><a href="#conversation">Historical context</a><a href="#conversation">Saved research</a></div></div>
        <div><h3>Evidence</h3><div className="footer-links"><a href="#conversation">Current sources</a><a href="#conversation">Citations</a></div></div>
        <div><h3>Principles</h3><div className="footer-links"><a href="#how-it-works">Privacy first</a><a href="#how-it-works">Honest uncertainty</a></div></div>
        <div><h3>Account</h3><div className="footer-links"><a href="/login">Sign in</a><a href="/signup">Create account</a></div></div>
        <div className="footer-bottom"><span>© 2026 Minimi</span><span>{email ?? 'Authenticated research workspace'} · Sources are shown with each answer</span></div>
      </footer>
    </main>
  )
}
