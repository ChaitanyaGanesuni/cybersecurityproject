/**
 * RAG tests against the REAL dataset. Run: `npm test -w @gita/rag`.
 * Flagship check (spec §9/§20): a natural query with none of the target words still retrieves the
 * detachment verse 2.47.
 */
import { loadDataset } from "@gita/content";
import { ContentRepository, InMemorySearchEngine } from "@gita/core";
import { MockLLMProvider } from "@gita/ai";
import {
  InMemoryVectorStore,
  cosineSimilarity,
  buildVerseDocuments,
  deriveConcepts,
  expandQuery,
  LexicalConceptRetriever,
  EmbeddingRetriever,
  indexVerses,
  makeRetrievedVerse,
} from "../src/index.js";

let passed = 0;
const failures: string[] = [];
const ok = (c: boolean, m: string) => (c ? passed++ : failures.push(m));
const eq = <T,>(a: T, b: T, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? passed++ : failures.push(`${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const has247 = (rs: { ref: { chapterNumber: number; verseNumber: number } }[]) =>
  rs.some((r) => r.ref.chapterNumber === 2 && r.ref.verseNumber === 47);

const repo = new ContentRepository(loadDataset());
const engine = new InMemorySearchEngine(repo);

/* ---- cosine sanity ---- */
eq(cosineSimilarity([1, 0], [1, 0]), 1, "cosine identical = 1");
eq(cosineSimilarity([1, 0], [0, 1]), 0, "cosine orthogonal = 0");
ok(cosineSimilarity([1, 1], [1, 0]) > 0 && cosineSimilarity([1, 1], [1, 0]) < 1, "cosine partial in (0,1)");

/* ---- concept derivation + query expansion ---- */
ok(deriveConcepts("You have a right to work but not to the fruit of it").includes("results"), "derives 'results' concept from 2.47 translation");
ok(deriveConcepts("You have a right to work but not to the fruit of it").includes("action"), "derives 'action' concept");
{
  const ex = expandQuery("I am anxious about the outcome of my work");
  ok(ex.includes("fear"), "expands 'anxious' -> fear");
  ok(ex.includes("fruit"), "expands 'outcome' -> fruit");
  ok(ex.includes("work"), "keeps original 'work'");
}

/* ---- FLAGSHIP: offline concept retriever finds 2.47 without the target words ---- */
await (async () => {
  const retriever = new LexicalConceptRetriever(repo, engine, "en");
  const results = await retriever.retrieve("I am anxious about the outcome of my work", 8);
  ok(results.length > 0, "concept retriever returns results");
  ok(has247(results), "‘anxiety about results’ retrieves 2.47 (detachment) offline");
  ok(results[0]!.translationSource !== null, "retrieved verse carries its PD attribution for Sources");
})();

/* ---- document builder (spec §9 multi-doc per verse + metadata) ---- */
{
  const docs = buildVerseDocuments(repo);
  ok(docs.length > repo.totalVerses(), "multiple documents per verse");
  const d247 = docs.find((d) => d.id === "2.47:translation")!;
  eq(d247.verseRef, { chapterNumber: 2, verseNumber: 47 }, "doc carries verse ref");
  ok(d247.concepts.includes("results"), "translation doc tagged with concepts");
  ok(docs.some((d) => d.docType === "sanskrit"), "sanskrit docs present");
}

/* ---- embedding pipeline: index + self-retrieval proves the vector path end-to-end ---- */
await (async () => {
  const store = new InMemoryVectorStore();
  const embedder = new MockLLMProvider(); // deterministic embeddings
  // Index a subset (chapter 2) for speed; the pipeline is identical at full scale.
  const docs = buildVerseDocuments(repo).filter((d) => d.verseRef.chapterNumber === 2 && d.docType === "translation");
  const n = await indexVerses(store, embedder, docs);
  eq(n, store.size(), "indexVerses upserts all documents");
  ok(store.size() === docs.length, "store holds one record per translation doc");

  // Query with 2.47's exact translation text → 2.47 must rank first (deterministic self-retrieval).
  const tr247 = repo.getVerse({ chapterNumber: 2, verseNumber: 47 })!.translations[0]!.text;
  const retriever = new EmbeddingRetriever(repo, store, embedder, "en");
  const results = await retriever.retrieve(tr247, 3);
  ok(results.length > 0, "embedding retriever returns results");
  eq(results[0]!.ref, { chapterNumber: 2, verseNumber: 47 }, "self-retrieval ranks the source verse first");

  // delete removes records.
  await store.delete(["2.47:translation"]);
  ok(store.size() === docs.length - 1, "vector store delete works");
})();

/* ---- makeRetrievedVerse maps content -> AI retrieval shape ---- */
{
  const rv = makeRetrievedVerse(repo, { chapterNumber: 2, verseNumber: 47 }, "en")!;
  ok(rv.sanskrit.includes("कर्मण्येवाधिकारस्ते"), "retrieved verse has real Sanskrit");
  ok(rv.translation !== null, "retrieved verse has translation");
  ok(makeRetrievedVerse(repo, { chapterNumber: 99, verseNumber: 1 }, "en") === null, "missing verse -> null");
}

if (failures.length) {
  console.error(`✗ rag tests FAILED: ${failures.length} failure(s), ${passed} passed`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ rag tests passed: ${passed} assertions`);
