import type { EvidenceSource, FinalAnswer } from './contracts'
import { buildDeterministicWebAnswer } from './evidence'

export const NO_RELIABLE_ANSWER = 'I don’t have a reliable source-based answer for that.'

export interface ResponseComposer {
  rejection(): FinalAnswer
  webFallback(sources: EvidenceSource[]): FinalAnswer | null
}

export class EvidenceResponseComposer implements ResponseComposer {
  rejection(): FinalAnswer {
    return { text: NO_RELIABLE_ANSWER, citations: [], claims: [] }
  }

  webFallback(sources: EvidenceSource[]) {
    return buildDeterministicWebAnswer(sources)
  }
}
