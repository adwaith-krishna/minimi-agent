import type { FinalAnswer, HistoricalRetrieval } from './contracts'

export type RememberedMemory = {
  entityType: 'fact' | 'preference'
  entityName: string
  content: string
  validFrom?: string | null
  validTo?: string | null
}

const MAX_MEMORY_VALUE = 240
const monthAliases: Record<string, string> = { jan: 'january', feb: 'february', mar: 'march', apr: 'april', jun: 'june', jul: 'july', aug: 'august', sep: 'september', sept: 'september', oct: 'october', nov: 'november', dec: 'december' }

function clean(value: string): string {
  return value.replace(/[\s.]+$/, '').trim().slice(0, MAX_MEMORY_VALUE)
}

function isQuestion(value: string): boolean {
  return /^(?:what|whats|when|where|who|why|how|can|could|would|is|are|do|does|did|has|have|will)\b/i.test(value.trim())
    || /\?\s*\\?\s*$/.test(value)
}

function eventDateLabels(value: string): string[] {
  const labels = value.match(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\b\d{4}-\d{2}-\d{2}\b/gi) ?? []
  return [...new Set(labels.map((label) => label.replace(/\s+/g, ' ').trim()))]
}

function firstEventDate(value: string, referenceYear?: number): string | null {
  const label = eventDateLabels(value)[0]
  if (!label) return null
  const iso = label.match(/^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$/i)
  if (!iso) return /^\d{4}-\d{2}-\d{2}$/.test(label) ? `${label}T00:00:00.000Z` : null
  const months: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 }
  const month = months[monthAliases[iso[1].toLowerCase()] ?? iso[1].toLowerCase()]
  const year = iso[3] ? Number(iso[3]) : referenceYear
  if (!month || !year) return null
  const date = new Date(Date.UTC(year, month - 1, Number(iso[2])))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function dateKeys(value: string): Set<string> {
  const keys = new Set<string>()
  for (const label of eventDateLabels(value)) {
    const match = label.match(/^(\w+)\s+(\d{1,2})/i)
    if (match) keys.add(`${monthAliases[match[1].toLowerCase()] ?? match[1].toLowerCase()}-${Number(match[2])}`)
    else if (/^\d{4}-\d{2}-\d{2}$/.test(label)) keys.add(label)
  }
  return keys
}

function eventEntityName(value: string): string {
  const match = value.match(/\b(exam|test|meeting|appointment|call|interview|class|lesson|deadline|birthday|date|trip|flight|presentation)\b/i)
  return match?.[1]?.toLowerCase() ?? 'personal schedule'
}

/**
 * Extracts only explicit, low-risk facts. The complete turn is still saved in
 * messages, while these records make common personal-assistant lookups fast.
 */
export function extractExplicitMemories(query: string, options: { referenceYear?: number } = {}): RememberedMemory[] {
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
  const hasEvent = /\b(meeting|meet|appointment|call|interview|exam|test|class|lesson|予定|scheduled|schedule|agenda|founder|deadline|plan|planned|birthday|trip|flight|presentation)\b/i.test(value)
  if (hasDate && hasEvent && !isQuestion(value)) {
    const dates = eventDateLabels(value)
    const validFrom = firstEventDate(value, options.referenceYear)
    return [{ entityType: 'fact', entityName: eventEntityName(value), content: `The user noted a personal schedule: ${clean(value)}${dates.length ? ` Event date${dates.length === 1 ? '' : 's'}: ${dates.join(', ')}.` : '.'}`, ...(validFrom ? { validFrom } : {}) }]
  }
  return []
}

export function buildDeterministicMemoryAnswer(query: string, history: HistoricalRetrieval): FinalAnswer | null {
  const savedUserMessages = history.messages.filter((message) => message.role === 'user'
    && !isQuestion(message.content)
    && /\b(meeting|appointment|call|interview|exam|test|class|lesson|schedule|scheduled|founder|deadline|plan|planned|date|birthday|trip|flight|presentation)\b/i.test(message.content))
  const savedMemories = history.memoryItems.filter((memory) => /\b(schedule|scheduled|meeting|appointment|call|interview|exam|test|class|lesson|founder|deadline|plan|planned|date|birthday|trip|flight|presentation)\b/i.test(`${memory.entityName} ${memory.content}`))
  if (!savedMemories.length && !savedUserMessages.length) return null
  const isRecall = /\b(what|when|where|who|which|tell|planned|plan|scheduled|schedule|meeting|remember|recall|note|said|asked|upcoming|events?)\b/i.test(query)
  if (!isRecall) return null
  const requestedDates = dateKeys(query)
  const candidates = [
    ...savedMemories.map((memory) => ({ content: memory.content, createdAt: memory.createdAt })),
    ...savedUserMessages.map((message) => ({ content: message.content, createdAt: message.createdAt })),
  ].filter((candidate, index, all) => all.findIndex((item) => item.content.toLowerCase() === candidate.content.toLowerCase()) === index)
    .filter((candidate) => !requestedDates.size || [...requestedDates].some((date) => dateKeys(candidate.content).has(date)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
  if (!candidates.length) return null
  const content = candidates.map(({ content }) => `• ${content}`).join('\n\n')
  return {
    text: `Here’s what I found in your saved information:\n\n${content}`,
    citations: [],
    claims: [],
  }
}

export function buildDeterministicMemoryAcknowledgement(query: string): FinalAnswer | null {
  if (!extractExplicitMemories(query).length) return null
  return { text: `I’ve noted this in your personal memory: ${clean(query)}.`, citations: [], claims: [] }
}
