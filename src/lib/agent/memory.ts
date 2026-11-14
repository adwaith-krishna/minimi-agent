export type RememberedMemory = {
  entityType: 'fact' | 'preference'
  entityName: string
  content: string
}

const MAX_MEMORY_VALUE = 240

function clean(value: string): string {
  return value.replace(/[\s.]+$/, '').trim().slice(0, MAX_MEMORY_VALUE)
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
  return []
}
