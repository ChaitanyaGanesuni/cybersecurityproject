import type { GitaDataset } from "@gita/contracts";
import { ContentRepository, InMemorySearchEngine, type SearchEngine } from "@gita/core";
// Metro bundles JSON imports. The dataset was validated at build time (ingest + validate),
// so we skip re-parsing 701 verses with zod on every cold start.
import datasetJson from "@gita/content/data/gita.json";

const dataset = datasetJson as unknown as GitaDataset;

let repo: ContentRepository | null = null;
let engine: SearchEngine | null = null;

/** Singleton content repository backed by the bundled, pre-validated dataset. */
export function getRepository(): ContentRepository {
  if (!repo) repo = new ContentRepository(dataset);
  return repo;
}

/** Singleton offline search engine (lexical + verse-reference). */
export function getSearchEngine(): SearchEngine {
  if (!engine) engine = new InMemorySearchEngine(getRepository());
  return engine;
}
