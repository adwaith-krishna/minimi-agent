import { AgentExecutionSchema, type AgentExecution } from './contracts'

export type ChatCitation = { id: string; title: string; url: string }
export type ChatMessage = { role: 'user' | 'assistant'; text: string; result?: AgentExecution }

export function parseChatResponse(payload: unknown): AgentExecution | null {
  const parsed = AgentExecutionSchema.safeParse(payload)
  return parsed.success ? parsed.data : null
}

export function safeCitationUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function citationLabel(citation: ChatCitation): string {
  try {
    return new URL(citation.url).hostname.replace(/^www\./, '')
  } catch {
    return 'Source'
  }
}

const internalHistoryReference = /\[(?:history-(?:message|memory|source|claim)):[^\]\n]+\]/gi

/** Keep stored provenance intact while removing internal references from dialogue. */
export function formatAssistantText(text: string): string {
  const listReadyText = (text.match(/\b\d+\.\s/g)?.length ?? 0) >= 3
    ? text.replace(/\s+(?=\d+\.\s)/g, '\n')
    : text
  const paragraphs = listReadyText
    .replace(internalHistoryReference, '')
    .replace(/New information\.\s*No matching historical proposition was found; absence does not prove the fact is new\.\s*Current evidence:/gi, 'Current evidence:')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t]+/g, ' ').replace(/\s+([,.;!?])/g, '$1').trim().replace(/^(?:insufficient evidence:\s*){2,}/i, 'Insufficient evidence: '))
    .filter(Boolean)

  const uniqueParagraphs: string[] = []
  for (const paragraph of paragraphs) {
    if (uniqueParagraphs.at(-1)?.toLocaleLowerCase() !== paragraph.toLocaleLowerCase()) uniqueParagraphs.push(paragraph)
  }
  return uniqueParagraphs.join('\n\n')
}

export function assistantText(result: AgentExecution): string {
  return formatAssistantText(result.answer?.text || result.error?.message || 'I could not produce a source-backed answer.')
}
