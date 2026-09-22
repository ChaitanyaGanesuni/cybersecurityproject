import type { LanguageCode } from "@gita/contracts";
import { ContentRepository, type SearchEngine } from "@gita/core";
import type { RetrievedVerse } from "@gita/ai";
import { expandQuery } from "./concepts.js";
import { makeRetrievedVerse, type RagDocument } from "./documents.js";
import type { VectorRecord, VectorStore } from "./vectorstore.js";

/** Anything that can turn a natural-language query into grounded verses for the tutor. */
export interface Retriever {
  retrieve(query: string, topK: number): Promise<RetrievedVerse[]>;
}

/** Minimal embedding capability (satisfied by @gita/ai's LLMProvider). */
export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

const keyOf = (r: { chapterNumber: number; verseNumber: number }) =>
  `${r.chapterNumber}.${r.verseNumber}`;

/**
 * Offline, deterministic retriever: expands the query with the concept lexicon, then runs the
 * lexical search engine. Handles the flagship example ("anxiety about results" → detachment
 * verses) with no model. This is the app's default retriever until a backend embedder is wired.
 */
export class LexicalConceptRetriever implements Retriever {
  constructor(
    private readonly repo: ContentRepository,
    private readonly engine: SearchEngine,
    private readonly lang: LanguageCode = "en",
  ) {}

  async retrieve(query: string, topK: number): Promise<RetrievedVerse[]> {
    const expanded = expandQuery(query).join(" ");
    const hits = this.engine.search(expanded, topK);
    return hits
      .map((h) => makeRetrievedVerse(this.repo, h.ref, this.lang))
      .filter((v): v is RetrievedVerse => v !== null);
  }
}

/**
 * Production semantic retriever: embeds the query, searches the vector store, groups documents back
 * to their verse (best score wins), and returns the top verses. Swap the store/embedder freely.
 */
export class EmbeddingRetriever implements Retriever {
  constructor(
    private readonly repo: ContentRepository,
    private readonly store: VectorStore,
    private readonly embedder: Embedder,
    private readonly lang: LanguageCode = "en",
  ) {}

  async retrieve(query: string, topK: number): Promise<RetrievedVerse[]> {
    const [vector] = await this.embedder.embed([query]);
    if (!vector) return [];
    // Over-fetch documents, then collapse to distinct verses by best score.
    const hits = await this.store.search(vector, topK * 4);
    const bestByVerse = new Map<string, number>();
    const order: string[] = [];
    for (const h of hits) {
      const k = keyOf(h.metadata.verseRef);
      if (!bestByVerse.has(k)) order.push(k);
      bestByVerse.set(k, Math.max(bestByVerse.get(k) ?? -Infinity, h.score));
    }
    return order
      .sort((a, b) => (bestByVerse.get(b) ?? 0) - (bestByVerse.get(a) ?? 0))
      .slice(0, topK)
      .map((k) => {
        const [c, v] = k.split(".");
        return makeRetrievedVerse(this.repo, { chapterNumber: Number(c), verseNumber: Number(v) }, this.lang);
      })
      .filter((v): v is RetrievedVerse => v !== null);
  }
}

/** Embed the documents and load them into the vector store (offline indexing job). */
export async function indexVerses(
  store: VectorStore,
  embedder: Embedder,
  docs: RagDocument[],
  batchSize = 64,
): Promise<number> {
  let indexed = 0;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const vectors = await embedder.embed(batch.map((d) => d.text));
    const records: VectorRecord[] = batch.map((d, j) => ({
      id: d.id,
      vector: vectors[j]!,
      text: d.text,
      metadata: { verseRef: d.verseRef, docType: d.docType, lang: d.lang, concepts: d.concepts },
    }));
    await store.upsert(records);
    indexed += records.length;
  }
  return indexed;
}
