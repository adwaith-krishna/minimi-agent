import { createHash } from 'node:crypto'

export const PERSONAL_MEMORY_EMBEDDING_DIMENSIONS = 2048

function embeddingModel(): string | null {
  const value = process.env.OPENROUTER_MEMORY_EMBEDDING_MODEL
  return value?.trim() || null
}

export function memoryContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

type MemoryEmbeddingRow = { id: string; content: string }

export type PersonalMessageChunk = { chunkIndex: number; content: string }

export function chunkPersonalMessage(content: string, maxCharacters = 2400, overlap = 200): PersonalMessageChunk[] {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  if (normalized.length <= maxCharacters) return [{ chunkIndex: 0, content: normalized }]
  const chunks: PersonalMessageChunk[] = []
  let start = 0
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + maxCharacters)
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(' ', end)
      if (boundary > start + Math.floor(maxCharacters * 0.6)) end = boundary
    }
    chunks.push({ chunkIndex: chunks.length, content: normalized.slice(start, end).trim() })
    if (end >= normalized.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks
}

export async function createMemoryEmbeddings(texts: string[]): Promise<{ model: string; embeddings: number[][] } | null> {
  const key = process.env.OPENROUTER_API_KEY
  const model = embeddingModel()
  if (!key || !model || !texts.length || texts.length > 32) return null
  const timeoutValue = Number(process.env.OPENROUTER_MEMORY_EMBEDDING_TIMEOUT_MS)
  const timeout = Number.isFinite(timeoutValue) ? Math.min(10_000, Math.max(2_000, Math.floor(timeoutValue))) : 5_000
  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      signal: AbortSignal.timeout(timeout),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: texts }),
    })
    if (!response.ok) return null
    const payload = await response.json() as { model?: unknown; data?: Array<{ embedding?: unknown; index?: unknown }> }
    if (typeof payload.model !== 'string' || !Array.isArray(payload.data) || payload.data.length !== texts.length) return null
    const ordered = [...payload.data].sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0))
    const embeddings = ordered.map((item) => Array.isArray(item.embedding) ? item.embedding : null)
    if (embeddings.some((embedding) => !embedding || embedding.length !== PERSONAL_MEMORY_EMBEDDING_DIMENSIONS || embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value)))) return null
    return { model: payload.model, embeddings: embeddings as number[][] }
  } catch {
    return null
  }
}

/** Best-effort indexing keeps the normalized memory table as the source of truth. */
export async function indexMemoryRows(client: unknown, userId: string, rows: MemoryEmbeddingRow[]): Promise<void> {
  if (!rows.length) return
  const embeddings = await createMemoryEmbeddings(rows.slice(0, 32).map((row) => row.content))
  if (!embeddings) return
  try {
    const supabase = client as { from(table: string): { upsert(values: unknown[], options: { onConflict: string }): Promise<{ error: unknown }> } }
    const result = await supabase.from('memory_embeddings').upsert(rows.slice(0, 32).map((row, index) => ({
      user_id: userId,
      memory_item_id: row.id,
      embedding_model: embeddings.model,
      content_hash: memoryContentHash(row.content),
      embedding: `[${embeddings.embeddings[index].join(',')}]`,
    })), { onConflict: 'memory_item_id' })
    void result.error
  } catch {
    // Vector indexing is an optimization; normalized memory remains available.
  }
}

export async function indexPersonalMessage(client: unknown, input: { userId: string; conversationId: string; messageId: string; content: string }): Promise<void> {
  const chunks = chunkPersonalMessage(input.content)
  if (!chunks.length) return
  const embeddings = await createMemoryEmbeddings(chunks.map((chunk) => chunk.content))
  if (!embeddings) return
  try {
    const supabase = client as { from(table: string): { upsert(values: unknown[], options: { onConflict: string }): Promise<{ error: unknown }> } }
    const result = await supabase.from('personal_context_chunks').upsert(chunks.map((chunk, index) => ({
      user_id: input.userId,
      conversation_id: input.conversationId,
      message_id: input.messageId,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      content_hash: memoryContentHash(chunk.content),
      embedding_model: embeddings.model,
      embedding: `[${embeddings.embeddings[index].join(',')}]`,
    })), { onConflict: 'message_id,chunk_index' })
    void result.error
  } catch {
    // The messages table remains the source of truth if vector indexing fails.
  }
}
