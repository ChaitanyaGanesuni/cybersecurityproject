import type { VerseRef } from "@gita/contracts";

/**
 * VectorStore port (spec §26). In-memory cosine store here; production swaps in pgvector/Qdrant
 * behind the same interface with no caller change. Each record is one retrievable document.
 */
export interface VectorMetadata {
  verseRef: VerseRef;
  docType: string; // "translation" | "sanskrit" | ...
  lang: string;
  concepts: string[];
}

export interface VectorRecord {
  id: string;
  vector: number[];
  metadata: VectorMetadata;
  /** Original text (kept for snippet/debug; production may store separately). */
  text: string;
}

export interface VectorSearchHit {
  id: string;
  score: number;
  metadata: VectorMetadata;
  text: string;
}

export interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>;
  search(vector: number[], topK: number): Promise<VectorSearchHit[]>;
  delete(ids: string[]): Promise<void>;
  size(): number;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export class InMemoryVectorStore implements VectorStore {
  private readonly records = new Map<string, VectorRecord>();

  async upsert(records: VectorRecord[]): Promise<void> {
    for (const r of records) this.records.set(r.id, r);
  }

  async search(vector: number[], topK: number): Promise<VectorSearchHit[]> {
    const hits: VectorSearchHit[] = [];
    for (const r of this.records.values()) {
      hits.push({
        id: r.id,
        score: cosineSimilarity(vector, r.vector),
        metadata: r.metadata,
        text: r.text,
      });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) this.records.delete(id);
  }

  size(): number {
    return this.records.size;
  }
}
