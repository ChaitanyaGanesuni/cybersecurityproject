import { LexicalConceptRetriever, type Retriever } from "@gita/rag";
import type { LanguageCode } from "@gita/contracts";
import { getRepository, getSearchEngine } from "../data/content";

/**
 * The app's retriever. Today: the offline concept-expansion retriever (deterministic, no network).
 * When a backend embedder is available, swap in EmbeddingRetriever here — the tutor is unchanged
 * because both implement the same `Retriever` interface.
 */
let retriever: Retriever | null = null;

export function getRetriever(lang: LanguageCode = "en"): Retriever {
  if (!retriever) {
    retriever = new LexicalConceptRetriever(getRepository(), getSearchEngine(), lang);
  }
  return retriever;
}
