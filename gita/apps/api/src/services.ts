import { loadDataset } from "@gita/content";
import { ContentRepository, InMemorySearchEngine } from "@gita/core";
import { AiTutorService, InMemoryAiCache, MockLLMProvider, type LLMProvider } from "@gita/ai";
import { LexicalConceptRetriever, type Retriever } from "@gita/rag";
import { GeminiLLMProvider } from "./providers/gemini.js";
import type { Config } from "./config.js";

/**
 * Composition root (clean architecture): wires content, provider, retriever and the AI service.
 * The HTTP layer depends only on these; swapping the LLM or retriever happens here alone.
 */
export interface Services {
  repo: ContentRepository;
  tutor: AiTutorService;
  retriever: Retriever;
  providerName: string;
}

export function buildServices(config: Config): Services {
  const repo = new ContentRepository(loadDataset());
  const engine = new InMemorySearchEngine(repo);

  // Real Gemini when a key is present; otherwise the deterministic mock so the server still runs.
  const provider: LLMProvider = config.geminiApiKey
    ? new GeminiLLMProvider(config.geminiApiKey, config.geminiModel, config.geminiEmbedModel)
    : new MockLLMProvider();

  const tutor = new AiTutorService(provider, new InMemoryAiCache());

  // Default retriever is the free, deterministic concept retriever. The EmbeddingRetriever (over a
  // vector store filled via the provider's embeddings) can replace this here with no route changes.
  const retriever: Retriever = new LexicalConceptRetriever(repo, engine, "en");

  return { repo, tutor, retriever, providerName: provider.id };
}
