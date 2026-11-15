import type { HistoricalRetrieval } from './contracts'

const MAX_PLANNED_QUERIES = 8

function unique(values: string[]): string[] {
  return [...new Map(values.map((value) => [value.toLowerCase(), value])).values()]
}

function entitiesFrom(text: string): string[] {
  const known = text.match(/\b(?:Postgres(?:ql)?|Salesforce|HubSpot|Pipedrive|SugarCRM|Zoho|CRM|OpenAI|Supabase|AWS|Azure|GCP)\b/gi) ?? []
  const quoted = [...text.matchAll(/[“\"]([^”\"]{2,80})[”\"]/g)].map((match) => match[1])
  return unique([...known, ...quoted].map((value) => value.trim())).slice(0, 6)
}

export function buildEntityAwareSearchQueries(query: string, history: HistoricalRetrieval): string[] {
  const entities = unique([
    ...entitiesFrom(query),
    ...history.messages.flatMap((message) => entitiesFrom(message.content)),
    ...history.researchSnapshots.flatMap((snapshot) => entitiesFrom(snapshot.query)),
  ]).slice(0, 4)
  const comparison = /\b(?:changed|change|since|pricing|price|shipped|ship|release|released|updated|update)\b/i.test(query)
  if (!comparison || !entities.length) return [query.trim()]
  const queries = entities.flatMap((entity) => [`${entity} pricing current official`, `${entity} major product updates releases current official`])
  return unique([query.trim(), ...queries]).slice(0, MAX_PLANNED_QUERIES)
}
