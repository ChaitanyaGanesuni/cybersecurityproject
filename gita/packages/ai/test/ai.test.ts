/**
 * AI layer tests — pure logic, deterministic mock provider. Run: `npm test -w @gita/ai`.
 * The most important checks here are the anti-hallucination guarantees:
 *  - citations are kept only if they were in the retrieved set;
 *  - Sources are built from retrieval, never from model free-text.
 */
import {
  AiTutorService,
  InMemoryAiCache,
  MockLLMProvider,
  buildExplanationMessages,
  buildTutorMessages,
  extractCitations,
  assembleSources,
  explanationCacheKey,
  trimHistory,
  MODES,
  MODE_ORDER,
  SYSTEM_PROMPT,
  pseudoVector,
  type LLMMessage,
  type RetrievedVerse,
} from "../src/index.js";

let passed = 0;
const failures: string[] = [];
const ok = (c: boolean, m: string) => (c ? passed++ : failures.push(m));
const eq = <T,>(a: T, b: T, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? passed++ : failures.push(`${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const V247: RetrievedVerse = {
  ref: { chapterNumber: 2, verseNumber: 47 },
  sanskrit: "कर्मण्येवाधिकारस्ते...",
  transliteration: "karmaṇy-evādhikāras te...",
  translation: "You have a right to your actions, but never to the fruits of your actions.",
  wordMeaning: "karmaṇi—in action; eva—only; adhikāraḥ—right",
  translationSource: "Shri Purohit Swami (1935); public domain",
};
const V248: RetrievedVerse = {
  ref: { chapterNumber: 2, verseNumber: 48 },
  sanskrit: "योगस्थः कुरु कर्माणि...",
  transliteration: "yoga-sthaḥ kuru karmāṇi...",
  translation: "Act steadfast in yoga, abandoning attachment.",
  translationSource: "Shri Purohit Swami (1935); public domain",
};

/* ---- modes ---- */
eq(MODE_ORDER.length, 7, "seven explanation modes (spec §16)");
ok(MODES.telugu.forceLang === "te", "telugu mode forces Telugu output");
ok(MODES.simple.forceLang === undefined, "simple mode uses the user's explanation language");

/* ---- prompt construction ---- */
const expMsgs = buildExplanationMessages(V247, "practical", "en");
eq(expMsgs[0]!.role, "system", "explanation prompt starts with system message");
eq(expMsgs[0]!.content, SYSTEM_PROMPT, "system message is the grounding contract");
ok(expMsgs[1]!.content.includes("[2.47]"), "explanation prompt tags the verse [2.47]");
ok(expMsgs[1]!.content.includes(MODES.practical.instruction), "explanation prompt carries mode instruction");
const teMsgs = buildExplanationMessages(V247, "telugu", "en");
ok(teMsgs[1]!.content.includes("Telugu"), "telugu mode asks for Telugu output despite en pref");

/* ---- citation extraction: the anti-hallucination guard ---- */
const allowed = new Set(["2.47", "2.48"]);
const ext = extractCitations(
  "As [2.47] teaches, act without attachment; see also Chapter 2, Verse 48. Unlike 9.99 which is invented.",
  allowed,
);
eq(ext.valid.map((r) => `${r.chapterNumber}.${r.verseNumber}`), ["2.47", "2.48"], "keeps only retrieved citations");
eq(ext.invalid, ["9.99"], "flags hallucinated citation 9.99 as invalid (dropped)");

const none = extractCitations("This answer cites nothing specific.", allowed);
eq(none.valid.length, 0, "no citations -> empty");

/* ---- sources built from retrieval, narrowed to cited ---- */
const sources = assembleSources([V247, V248], ext.valid);
eq(sources.length, 2, "sources for both cited verses");
ok(sources[0]!.attribution!.includes("Purohit Swami"), "source carries PD attribution");
const allSources = assembleSources([V247, V248]);
eq(allSources.length, 2, "no citedOnly -> all retrieved as sources");

/* ---- cache key stability ---- */
eq(explanationCacheKey("simple", "2.47", "en"), explanationCacheKey("simple", "2.47", "en"), "cache key stable");
ok(explanationCacheKey("simple", "2.47", "en") !== explanationCacheKey("deep", "2.47", "en"), "mode changes cache key");
ok(explanationCacheKey("simple", "2.47", "en") !== explanationCacheKey("simple", "2.47", "te"), "lang changes cache key");

/* ---- history trimming ---- */
const long: LLMMessage[] = Array.from({ length: 20 }, (_, i) => ({
  role: i % 2 === 0 ? "user" : "assistant",
  content: `m${i}`,
}));
eq(trimHistory(long, 3).length, 6, "trims to maxTurns*2 messages");
eq(trimHistory(long, 3)[0]!.content, "m14", "keeps the most recent turns");
eq(trimHistory([{ role: "user", content: "hi" }], 3).length, 1, "short history untouched");

/* ---- service: explain a verse, only its citation survives, then cache hit ---- */
await (async () => {
  // Responder that cites the correct verse AND a fabricated one — the service must drop the fake.
  const provider = new MockLLMProvider(() => "This verse [2.47] teaches detachment; ignore [7.77].");
  const cache = new InMemoryAiCache();
  const service = new AiTutorService(provider, cache);

  const a1 = await service.explainVerse(V247, "simple", "en");
  eq(a1.citations.map((r) => `${r.chapterNumber}.${r.verseNumber}`), ["2.47"], "only retrieved verse cited");
  eq(a1.droppedCitations, ["7.77"], "fabricated citation dropped by service");
  eq(a1.sources.length, 1, "one source (the explained verse)");
  eq(a1.fromCache, false, "first call not cached");

  const a2 = await service.explainVerse(V247, "simple", "en");
  eq(a2.fromCache, true, "second identical call served from cache");
  eq(cache.hits, 1, "cache recorded a hit");
})();

/* ---- service: tutor answer grounded on multiple retrieved verses ---- */
await (async () => {
  const provider = new MockLLMProvider(() => "Karma yoga means acting without attachment [2.47] and staying steady [2.48].");
  const service = new AiTutorService(provider);
  const ans = await service.ask("What is karma yoga?", [V247, V248]);
  eq(ans.citations.length, 2, "tutor cites both retrieved verses");
  eq(ans.sources.length, 2, "tutor sources from retrieval");
})();

/* ---- embeddings are deterministic (for RAG tests in Phase 7) ---- */
{
  const [a] = await new MockLLMProvider().embed(["attachment"]);
  const [b] = await new MockLLMProvider().embed(["attachment"]);
  eq(a, b, "embeddings deterministic");
  eq(pseudoVector("x", 16).length, 16, "pseudoVector dims");
}

if (failures.length) {
  console.error(`✗ ai tests FAILED: ${failures.length} failure(s), ${passed} passed`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ ai tests passed: ${passed} assertions`);
