import type { SearchExecutionLimits } from './search-executor'
import { executeSearchPlan, type TavilySearchClient } from './search-executor'
import type { SearchPlan, WebSearchResult } from './contracts'

/** Small boundary around Tavily so orchestration does not own provider mechanics. */
export interface ResearchService {
  search(plan: SearchPlan, limits?: SearchExecutionLimits): Promise<{ execution: Awaited<ReturnType<typeof executeSearchPlan>>['execution']; results: WebSearchResult[] }>
}

export class TavilyResearchService implements ResearchService {
  constructor(private readonly provider: TavilySearchClient) {}

  search(plan: SearchPlan, limits?: SearchExecutionLimits) {
    return executeSearchPlan(plan, this.provider, limits)
  }
}
