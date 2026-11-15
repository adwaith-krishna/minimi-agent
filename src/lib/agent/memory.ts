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

const memoryRecallPattern = /\b(?:remember|saved information|personal memory|upcoming events?|my schedule|my notes|my information)\b/i

export function isPersonalMemoryRecall(query: string): boolean {
  const personalCue = /\b(?:my|i|we|our|me|remember|saved|upcoming)\b/i.test(query)
  const memoryTopic = /\b(?:plan|planned|scheduled|schedule|meeting|appointment|calendar|events?)\b/i.test(query)
  return memoryRecallPattern.test(query) || (personalCue && memoryTopic)
    || /\bwhat(?:'s| is| are)\s+(?:on|planned|scheduled|my upcoming)\b/i.test(query)
}

function displayDateLabel(value: string): string {
  return value.replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|sept(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi, (month) => {
    const full = monthAliases[month.toLowerCase()] ?? month.toLowerCase()
    return full.charAt(0).toUpperCase() + full.slice(1)
  })
}

function displayMemoryFact(value: string): string {
  let fact = value.trim()
    .replace(/^The user noted a personal schedule:\s*/i, '')
    .replace(/^The user's planned and scheduled calendar note is:\s*/i, '')
    .replace(/\s+Event dates?:.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  fact = displayDateLabel(fact)
    .replace(/\bI have\b/gi, 'you have')
    .replace(/\bI am\b/gi, 'you are')
    .replace(/\bI'm\b/gi, "you're")
    .replace(/\bmy\b/gi, 'your')
    .replace(/\bI\b/g, 'you')
    .replace(/^(\w)/, (character) => character.toUpperCase())
    .replace(/^(On\s+\w+\s+\d+(?:st|nd|rd|th)?)(\s+)(you|your)\b/i, '$1, $3')
    .replace(/^(\w+\s+\d+(?:st|nd|rd|th)?)(\s+)(you|your)\b/i, '$1, $3')
  return /[.!?]$/.test(fact) ? fact : `${fact}.`
}

function eventEntityName(value: string): string {
  const match = value.match(/\b(exams?|tests?|meetings?|appointments?|calls?|interviews?|classes|lessons?|deadlines?|birthdays?|dates?|trips?|flights?|presentations?)\b/i)
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
  const hasEvent = /\b(meetings?|meet|appointments?|calls?|interviews?|exams?|tests?|classes|lessons?|予定|scheduled|schedule|agenda|founder|deadlines?|plans?|planned|birthdays?|trips?|flights?|presentations?)\b/i.test(value)
  if (hasDate && hasEvent && !isQuestion(value)) {
    const dates = eventDateLabels(value)
    if (dates.length <= 1) {
      const validFrom = firstEventDate(value, options.referenceYear)
      return [{ entityType: 'fact', entityName: eventEntityName(value), content: `The user noted a personal schedule: ${clean(value)}${dates.length ? ` Event date: ${dates[0]}.` : '.'}`, ...(validFrom ? { validFrom } : {}) }]
    }
    return dates.map((date, index) => {
      const start = value.toLowerCase().indexOf(date.toLowerCase())
      const next = index + 1 < dates.length ? value.toLowerCase().indexOf(dates[index + 1].toLowerCase(), start + date.length) : value.length
      const detail = clean(value.slice(start, next).replace(/^(?:and|then|[,;:])\s*/i, '').replace(/\s+(?:is\s+on|is|on|at|for)\s*$/i, ''))
      const validFrom = firstEventDate(date, options.referenceYear)
      return { entityType: 'fact', entityName: eventEntityName(detail), content: `The user noted a personal schedule: ${detail} Event date: ${date}.`, ...(validFrom ? { validFrom } : {}) }
    })
  }
  return []
}

export function buildDeterministicMemoryAnswer(query: string, history: HistoricalRetrieval): FinalAnswer | null {
  if (!isPersonalMemoryRecall(query)) return null
  const savedUserMessages = history.messages.filter((message) => message.role === 'user'
    && !isQuestion(message.content)
    && /\b(meetings?|appointments?|calls?|interviews?|exams?|tests?|classes|lessons?|schedule|scheduled|founder|deadlines?|plans?|planned|date|birthdays?|trips?|flights?|presentations?)\b/i.test(message.content))
  const savedMemories = history.memoryItems.filter((memory) => /\b(schedule|scheduled|meetings?|appointments?|calls?|interviews?|exams?|tests?|classes|lessons?|founder|deadlines?|plans?|planned|date|birthdays?|trips?|flights?|presentations?)\b/i.test(`${memory.entityName} ${memory.content}`))
  const requestedDates = dateKeys(query)
  if (!savedMemories.length && !savedUserMessages.length) {
    const requestedLabel = eventDateLabels(query)[0]
    return { text: requestedLabel ? `I don’t have anything recorded for ${displayDateLabel(requestedLabel)}.` : 'I don’t have any matching plans saved.', citations: [], claims: [] }
  }
  const candidates = [
    ...savedMemories.map((memory) => ({ content: memory.content, createdAt: memory.createdAt })),
    ...savedUserMessages.map((message) => ({ content: message.content, createdAt: message.createdAt })),
  ].filter((candidate, index, all) => {
    const canonical = displayMemoryFact(candidate.content).toLowerCase().replace(/(\d)(?:st|nd|rd|th)\b/g, '$1')
    return all.findIndex((item) => displayMemoryFact(item.content).toLowerCase().replace(/(\d)(?:st|nd|rd|th)\b/g, '$1') === canonical) === index
  })
    .filter((candidate) => !requestedDates.size || [...requestedDates].some((date) => dateKeys(candidate.content).has(date)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
  if (!candidates.length) {
    const requestedLabel = eventDateLabels(query)[0]
    return { text: requestedLabel ? `I don’t have anything recorded for ${displayDateLabel(requestedLabel)}.` : 'I don’t have any matching plans saved.', citations: [], claims: [] }
  }
  const rendered = candidates.map(({ content }) => displayMemoryFact(content))
    .filter((content, index, all) => all.findIndex((item) => item.toLocaleLowerCase() === content.toLocaleLowerCase()) === index)
  const content = rendered.map((item) => `• ${item}`).join('\n\n')
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
