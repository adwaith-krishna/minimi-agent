export interface SearchSource {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  content?: string;
  publishedDate?: string;
}

export interface WebSearchResult {
  query: string;
  provider: 'tavily' | 'brave' | 'serper' | 'duckduckgo' | 'mock';
  sources: SearchSource[];
  summary?: string;
  executionTimeMs: number;
}

export interface ToolExecutionEvent {
  toolName: string;
  args: Record<string, any>;
  result?: any;
  status: 'running' | 'completed' | 'failed';
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string; // ISO timestamp
  sources?: SearchSource[];
  toolCalls?: ToolExecutionEvent[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  messages: ChatMessage[];
  pinned?: boolean;
  benchmarkId?: string; // e.g. 'crm-shortlist', 'postgres-hosting', 'nov-3-tech'
}

export interface ModelProviderInfo {
  provider: 'openai' | 'gemini' | 'anthropic' | 'groq' | 'custom' | 'unconfigured';
  modelId: string;
  availableProviders: string[];
}
