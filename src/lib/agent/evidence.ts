import { EvidenceSourceSchema, PublishedDateSchema, type EvidenceSource, type HistoricalRetrieval, type PublishedDate, type ResearchClaim, type WebSearchResult } from './contracts'
import type { FinalAnswer } from './contracts'

function instantDate(value: string | null): PublishedDate | null {
  return value ? { precision: 'instant', value } : null
}

export function buildWebEvidence(results: WebSearchResult[], observedAt: string): EvidenceSource[] {
  const sources: EvidenceSource[] = []
  const seen = new Set<string>()
  for (const result of results) {
    for (const item of result.results) {
      if (seen.has(item.url)) continue
      seen.add(item.url)
      const url = new URL(item.url)
      sources.push(EvidenceSourceSchema.parse({
        id: `web-${sources.length + 1}`, kind: 'web', url: item.url, title: item.title, snippet: item.snippet.slice(0, 4_000),
        domain: url.hostname, publishedAt: item.publishedAt, observedAt, score: item.score, effectiveAt: null,
      }))
    }
  }
  return sources
}

/**
 * Safe provider-independent fallback. Search results are already bounded and
 * validated by Tavily; when claim extraction or answer generation is down we
 * still return the retrieved snippets with explicit source references instead
 * of throwing away useful evidence.
 */
export function buildDeterministicWebAnswer(sources: EvidenceSource[]): FinalAnswer | null {
  const webSources = sources.filter((source) => source.kind === 'web' && source.url)
    .filter((source, index, all) => all.findIndex((candidate) => candidate.url === source.url) === index)
    .slice(0, 6)
  if (!webSources.length) return null
  const text = webSources.map((source) => {
    const snippet = source.snippet.trim()
      .replace(/^(?:insufficient evidence|current evidence|new information)\s*:\s*/i, '')
      .replace(/\s+/g, ' ')
      .slice(0, 420)
    return `• ${source.title ?? source.domain ?? 'Source'} — ${snippet} [${source.id}]`
  }).join('\n')
  return {
    text: `Here’s the clearest current evidence I found:\n\n${text}\n\nThese are source-backed findings, not a definitive ranking or recommendation.`,
    citations: webSources.map((source) => ({ id: source.id, title: source.title ?? source.domain ?? 'Source', url: source.url! })),
    claims: [],
  }
}

export function buildHistoricalEvidence(history: HistoricalRetrieval): EvidenceSource[] {
  const sources: EvidenceSource[] = []
  for (const message of history.messages) sources.push(EvidenceSourceSchema.parse({ id: `history-message:${message.id}`, kind: 'historical_message', url: null, title: 'Historical conversation', snippet: message.content.slice(0, 4_000), domain: null, publishedAt: null, observedAt: message.createdAt, score: null, effectiveAt: null }))
  for (const memory of history.memoryItems) sources.push(EvidenceSourceSchema.parse({ id: `history-memory:${memory.id}`, kind: 'historical_memory', url: null, title: memory.entityName, snippet: memory.content.slice(0, 4_000), domain: null, publishedAt: null, observedAt: memory.createdAt, score: null, effectiveAt: instantDate(memory.validFrom) }))
  for (const snapshot of history.researchSnapshots) {
    for (const claim of snapshot.claims) {
      const effectiveDate = PublishedDateSchema.safeParse(claim.structuredData.effectiveDate)
      const effectiveAt = effectiveDate.success ? effectiveDate.data : instantDate(claim.validAt)
      for (const source of claim.sources) sources.push(EvidenceSourceSchema.parse({
        id: `history-source:${source.id}`, kind: 'historical_research', url: source.url, title: source.title,
        snippet: source.snippet ?? '', domain: new URL(source.url).hostname,
        publishedAt: source.publishedAt, observedAt: source.retrievedAt,
        score: source.score, effectiveAt,
      }))
    }
  }
  return sources
}

export function historicalClaimSources(claim: ResearchClaim): string[] {
  return claim.sources.length ? claim.sources.map((source) => `history-source:${source.id}`) : [`history-claim:${claim.id}`]
}
