import type { FinalAnswer, HistoricalRetrieval } from './contracts'

export type RememberedMemory = {
  entityType: 'fact' | 'preference'
  entityName: string
  content: string
}

const MAX_MEMORY_VALUE = 240

function clean(value: string): string {
  return value.replace(/[\s.]+$/, '').trim().slice(0, MAX_MEMORY_VALUE)
}

function isQuestion(value: string): boolean {
  return /^(?:what|whats|when|where|who|why|how|can|could|would|is|are|do|does|did|has|have|will)\b/i.test(value.trim())
    || /\?\s*\\?\s*$/.test(value)
}

/**
 * Extracts only explicit, low-risk facts. The complete turn is still saved in
 * messages, while these records make common personal-assistant lookups fast.
 */
export function extractExplicitMemories(query: string): RememberedMemory[] {
  const value = query.trim()
  if (!value || /(password|passcode|otp|one[- ]time code|api key|secret)/i.test(value)) return []

  const patterns: Array<{ expression: RegExp; entityName: string; prefix: string; entityType?: 'fact' | 'preference' }> = [
    { expression: /^my name is\s+(.+)$/i, entityName: 'name', prefix: 'The user\'s name is' },
    { expression: /^i live in\s+(.+)$/i, entityName: 'location', prefix: 'The user lives in' },
    { expression: /^i am from\s+(.+)$/i, entityName: 'origin', prefix: 'The user is from' },
    { expression: /^i work (?:at|for)\s+(.+)$/i, entityName: 'work', prefix: 'The user works at' },
    { expression: /^i study at\s+(.+)$/i, entityName: 'education', prefix: 'The user studies at' },
    { expression: /^i prefer\s+(.+)$/i, entityName: 'preference', prefix: 'The user prefers', entityType: 'preference' },
    { expression: /^remember that\s+(.+)$/i, entityName: 'user-provided fact', prefix: 'The user asked Minimi to remember that' },
  ]

  for (const pattern of patterns) {
    const match = value.match(pattern.expression)
    const detail = match?.[1] ? clean(match[1]) : ''
    if (detail) return [{ entityType: pattern.entityType ?? 'fact', entityName: pattern.entityName, content: `${pattern.prefix} ${detail}.` }]
  }

  // Calendar notes are user-provided facts even when they are not phrased as
  // “remember that”. Keep the original wording so a later question can match
  // names, dates, times, and the event relationship without guessing.
  const hasDate = /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\b\d{4}-\d{2}-\d{2}\b/i.test(value)
  const hasEvent = /\b(meeting|meet|appointment|call|interview|予定|scheduled|schedule|agenda|founder|deadline|plan|planned)\b/i.test(value)
  if (hasDate && hasEvent && !isQuestion(value)) {
    return [{ entityType: 'fact', entityName: 'calendar note', content: `The user's planned and scheduled calendar note is: ${clean(value)}.` }]
  }
  return []
}

export function buildDeterministicMemoryAnswer(query: string, history: HistoricalRetrieval): FinalAnswer | null {
  const saved = history.memoryItems.at(-1)
  // Never use the current recall question as its own answer. This matters for
  // older conversations that were saved before calendar memory extraction was
  // introduced and therefore have only message rows available.
  const savedUserMessage = [...history.messages].reverse().find((message) => message.role === 'user'
    && !isQuestion(message.content)
    && /\b(meeting|appointment|call|interview|schedule|scheduled|founder|deadline|plan|planned|date)\b/i.test(message.content))
  if (!saved && !savedUserMessage) return null
  const isRecall = /\b(what|when|where|who|which|tell|planned|plan|scheduled|schedule|meeting|remember|recall|note|said|asked)\b/i.test(query)
  if (!isRecall) return null
  const content = saved?.content ?? savedUserMessage?.content ?? ''
  return {
    text: `I found this in your saved information: ${content}`,
    citations: [],
    claims: [],
  }
}

export function buildDeterministicMemoryAcknowledgement(query: string): FinalAnswer | null {
  if (!extractExplicitMemories(query).length) return null
  return { text: `I’ve noted this in your personal memory: ${clean(query)}.`, citations: [], claims: [] }
}
