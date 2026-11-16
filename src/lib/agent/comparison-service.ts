import type { ClaimComparisonResult, EvidenceSource, ExtractedResearchClaim, HistoricalRetrieval, FinalAnswer } from './contracts'
import { compareHistoricalAndCurrent, composeDeterministicComparisonAnswer } from './comparison'

/** Compares current verified claims with the user's historical baseline. */
export interface ComparisonService {
  compare(history: HistoricalRetrieval, currentClaims: ExtractedResearchClaim[]): ClaimComparisonResult[]
  compose(comparisons: ClaimComparisonResult[], sources: EvidenceSource[]): FinalAnswer | null
}

export class BaselineComparisonService implements ComparisonService {
  compare(history: HistoricalRetrieval, currentClaims: ExtractedResearchClaim[]) {
    return compareHistoricalAndCurrent(history, currentClaims)
  }

  compose(comparisons: ClaimComparisonResult[], sources: EvidenceSource[]) {
    return composeDeterministicComparisonAnswer(comparisons, sources)
  }
}
