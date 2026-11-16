import type { HistoricalRetrieval } from './contracts'

const MAX_PLANNED_QUERIES = 8

function unique(values: string[]): string[] {
  return [...new Map(values.map((value) => [value.toLowerCase(), value])).values()]
}

function entitiesFrom(text: string): string[] {
  const known = text.match(/\b(?:Postgres(?:ql)?|Salesforce|HubSpot|Pipedrive|SugarCRM|Zoho|CRM|OpenAI|Supabase|AWS|Azure|GCP)\b/gi) ?? []
  const quoted = [...text.matchAll(/[“\"]([^”\"]{2,80})[”\"]/g)].map((match) => match[1])
  const shortlist = text.match(/\bshortlisted\s+(.+?)\s+for\b/i)?.[1]
    ?.split(/,|\band\b/i).map((value) => value.replace(/^\s*(?:the|a|an)\s+/i, '').trim()).filter((value) => value.length > 1 && value.length < 80) ?? []
  return unique([...known, ...quoted, ...shortlist].map((value) => value.trim())).slice(0, 6)
}

export function buildEntityAwareSearchQueries(query: string, history: HistoricalRetrieval): string[] {
  const entities = unique([
    ...entitiesFrom(query),
    ...history.messages.flatMap((message) => entitiesFrom(message.content)),
    ...history.researchSnapshots.flatMap((snapshot) => entitiesFrom(snapshot.query)),
  ]).slice(0, 6)
  const comparison = /\b(?:changed|change|since|pricing|price|shipped|ship|release|released|updated|update)\b/i.test(query)
  if (!comparison || !entities.length) return [query.trim()]
  const queries = entities.length > 3
    ? entities.map((entity) => `${entity} pricing major product updates current official`)
    : entities.flatMap((entity) => [`${entity} pricing current official`, `${entity} major product updates releases current official`])
  return unique([query.trim(), ...queries]).slice(0, MAX_PLANNED_QUERIES)
}
