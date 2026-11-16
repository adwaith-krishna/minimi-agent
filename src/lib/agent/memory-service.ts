import type { FinalAnswer, HistoricalRetrieval } from './contracts'
import type { HistoricalRepository } from './retrieval'
import { buildDeterministicMemoryAnswer, extractExplicitMemories } from './memory'
import { answerFromPersonalMemory, type MemoryRoute } from './memory-rag'
import { analyzeUserMessage, type ModelDecision } from './model-decision'

/**
 * One application-level boundary for personal context.
 *
 * The database keeps structured memory and message chunks as separate indexes
 * for compatibility and retrieval quality, but callers must use this facade.
 * This prevents new features from inventing a third memory path.
 */
export interface MemoryService {
  retrieve(input: Parameters<HistoricalRepository['retrieve']>[0]): Promise<HistoricalRetrieval>
  extract(query: string, referenceYear?: number): ReturnType<typeof extractExplicitMemories>
  answer(query: string, history: HistoricalRetrieval, route?: MemoryRoute): Promise<FinalAnswer | null>
  analyze(query: string, memoryMiss?: boolean): Promise<ModelDecision | null>
}

export class PersonalMemoryService implements MemoryService {
  constructor(private readonly repository: HistoricalRepository) {}

  retrieve(input: Parameters<HistoricalRepository['retrieve']>[0]): Promise<HistoricalRetrieval> {
    return this.repository.retrieve(input)
  }

  extract(query: string, referenceYear?: number) {
    return extractExplicitMemories(query, referenceYear === undefined ? {} : { referenceYear })
  }

  async answer(query: string, history: HistoricalRetrieval, route?: MemoryRoute): Promise<FinalAnswer | null> {
    // Exact facts, dates, and user-owned ledger records should remain
    // available even while an embedding or answer model is temporarily down.
    return buildDeterministicMemoryAnswer(query, history) ?? answerFromPersonalMemory(query, history, route)
  }

  analyze(query: string, memoryMiss = false) {
    return analyzeUserMessage(query, memoryMiss)
  }
}
