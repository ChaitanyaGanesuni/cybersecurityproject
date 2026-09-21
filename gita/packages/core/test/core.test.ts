/**
 * Core layer tests — run against the REAL ingested dataset (no mocks).
 * Zero-dependency assert runner; exits non-zero on failure. Run: `npm test -w @gita/core`.
 */

import { loadDataset } from "@gita/content";
import {
  ContentRepository,
  buildHome,
  buildChapterCard,
  buildChapterDetail,
  buildVerseViewModel,
  chapterProgressLabel,
  listeningProgressLabel,
  createTranslator,
  emptyUserState,
  todaysVerseRef,
  InMemorySearchEngine,
  parseVerseRef,
  fold,
  buildMyGita,
  notesForVerse,
  hydrate,
  InMemoryPersistence,
  defaultPersistedState,
  type UserState,
} from "../src/index.js";

let passed = 0;
const failures: string[] = [];
function ok(cond: boolean, msg: string): void {
  if (cond) passed++;
  else failures.push(msg);
}
function eq<T>(a: T, b: T, msg: string): void {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
}

const repo = new ContentRepository(loadDataset());

// --- repository ---
eq(repo.listChapters().length, 18, "18 chapters");
eq(repo.totalVerses(), 701, "701 verses");
eq(repo.getVersesForChapter(2).length, 72, "chapter 2 has 72 verses");
ok(repo.getVerse({ chapterNumber: 2, verseNumber: 47 }) !== null, "2.47 exists");
ok(repo.getVerse({ chapterNumber: 99, verseNumber: 1 }) === null, "missing verse -> null");

// --- verse view-model: scripture vs AI vs missing ---
const v247 = repo.getVerse({ chapterNumber: 2, verseNumber: 47 })!;
const vm = buildVerseViewModel(repo, v247, { uiLang: "en", verseLang: "en", explanationLang: "en" }, emptyUserState);
ok(vm.sanskrit.text.includes("कर्मण्येवाधिकारस्ते"), "2.47 Sanskrit is the real Karma Yoga verse");
ok(vm.sanskrit.isAi === false, "Sanskrit is not marked AI");
ok(vm.translation !== null && vm.translation.attribution !== null, "translation carries attribution");
ok(vm.translation!.attribution!.includes("Purohit Swami"), "translation attributed to Purohit Swami");
ok(vm.simpleMeaning === null, "no fabricated AI explanation present at rest");

// --- missing Telugu translation degrades gracefully (no fabrication) ---
const teVm = buildVerseViewModel(repo, v247, { uiLang: "te", verseLang: "te", explanationLang: "te" }, emptyUserState);
ok(teVm.translation !== null, "falls back to available translation when Telugu absent");
ok(teVm.translation!.lang === "en", "fallback is the English translation, not invented Telugu");

// --- chapter card: progress + time estimates ---
const user: UserState = {
  ...emptyUserState,
  reading: {
    readVerseKeys: ["2.1", "2.2", "2.3"],
    lastReadVerse: { chapterNumber: 2, verseNumber: 3 },
    lastReadAt: new Date().toISOString(),
  },
  bookmarks: ["2.47"],
};
const card = buildChapterCard(repo, 2, user)!;
eq(card.versesRead, 3, "3 verses read in chapter 2");
eq(card.progressLabel, "Chapter 2 — 3 of 72 verses", "progress label format");
ok(/min|h/.test(card.readingTime), "reading time formatted");
ok(/min|h/.test(card.listeningTime), "listening time formatted");

// --- formatters ---
eq(chapterProgressLabel(repo.getChapter(2)!, 14), "Chapter 2 — 14 of 72 verses", "spec example label");
eq(listeningProgressLabel(0.37), "Listening progress: 37%", "spec example listening label");
eq(listeningProgressLabel(1.5), "Listening progress: 100%", "listening clamps to 100%");

// --- chapter detail ---
const detail = buildChapterDetail(repo, 2, { uiLang: "en", verseLang: "en", explanationLang: "en" }, user)!;
eq(detail.verses.length, 72, "chapter detail lists all verses");
ok(detail.summary.length > 0, "chapter summary present");
ok(detail.verses.find((x) => x.verseNumber === 47)!.isBookmarked, "2.47 shows as bookmarked");

// --- home ---
const home = buildHome(repo, user, new Date("2026-09-21T00:00:00Z"));
eq(home.totalChapters, 18, "home total chapters");
eq(home.totalVerses, 701, "home total verses");
eq(home.bookmarkCount, 1, "home bookmark count");
ok(home.continueLearning?.verseNumber === 3, "continue-learning points to last read");
const t1 = todaysVerseRef(repo, new Date("2026-09-21T00:00:00Z"));
const t2 = todaysVerseRef(repo, new Date("2026-09-21T23:59:00Z"));
eq(t1, t2, "today's verse stable within a day");

// --- i18n: UI lang independent of content lang ---
const tEn = createTranslator("en");
const tTe = createTranslator("te");
eq(tEn("home.aiTeacher"), "AI Gita Teacher", "english UI string");
ok(tTe("home.aiTeacher") !== tEn("home.aiTeacher"), "telugu UI string differs");
// content (Sanskrit) is unaffected by UI language choice:
const vmTeUi = buildVerseViewModel(repo, v247, { uiLang: "te", verseLang: "sa", explanationLang: "en" }, emptyUserState);
eq(vmTeUi.sanskrit.text, vm.sanskrit.text, "Sanskrit content identical regardless of UI language");

// --- search: verse-reference parsing ---
eq(parseVerseRef("2.47"), { chapterNumber: 2, verseNumber: 47 }, "parse '2.47'");
eq(parseVerseRef("2:47"), { chapterNumber: 2, verseNumber: 47 }, "parse '2:47'");
eq(parseVerseRef("chapter 2 verse 47"), { chapterNumber: 2, verseNumber: 47 }, "parse worded ref");
eq(parseVerseRef("attachment"), null, "non-ref query -> null");
eq(fold("kṛṣṇa"), "krsna", "diacritic folding");

// --- search: reference query returns exactly that verse ---
const search = new InMemorySearchEngine(repo);
const refHits = search.search("2.47");
eq(refHits.length, 1, "reference search returns one hit");
eq(refHits[0]!.ref, { chapterNumber: 2, verseNumber: 47 }, "reference search returns 2.47");

// --- search: lexical query finds the verse containing a known word (derived from data) ---
const trText = repo.getVerse({ chapterNumber: 2, verseNumber: 47 })!.translations[0]!.text;
const distinctiveWord = trText.split(/\s+/).find((w) => w.replace(/[^a-zA-Z]/g, "").length >= 6)!
  .replace(/[^a-zA-Z]/g, "");
const lex = search.search(distinctiveWord);
ok(lex.length > 0, `lexical search for '${distinctiveWord}' returns results`);
ok(
  lex.some((r) => r.ref.chapterNumber === 2 && r.ref.verseNumber === 47),
  `lexical search for '${distinctiveWord}' includes 2.47`,
);
ok(lex[0]!.score >= lex[lex.length - 1]!.score, "results are ranked by score (desc)");
eq(search.search("").length, 0, "empty query -> no results (no fabrication)");

// --- search: transliteration is diacritic-insensitive (query derived from real data) ---
const translit247 = repo.getVerse({ chapterNumber: 2, verseNumber: 47 })!.transliteration.text;
const diacriticWord = translit247
  .split(/[\s-]+/) // split the way the tokenizer does (whitespace AND hyphens)
  .map((w) => w.replace(/[^\p{L}]/gu, ""))
  .find((w) => /[^\u0000-\u007f]/.test(w) && w.length >= 4)!;
const foldedQuery = fold(diacriticWord); // ASCII-only form of a word that has diacritics
ok(/^[a-z0-9]+$/.test(foldedQuery), "folded query is ASCII-only");
ok(
  search.search(foldedQuery).some((r) => r.ref.chapterNumber === 2 && r.ref.verseNumber === 47),
  `diacritic-insensitive search '${foldedQuery}' matches transliteration of 2.47`,
);

// --- study: My Gita aggregation ---
const studyUser: UserState = {
  ...emptyUserState,
  bookmarks: ["2.47"],
  notes: [
    { id: "n1", verseKey: "2.47", text: "act without attachment", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    { id: "n2", verseKey: "3.5", text: "no one is ever inactive", createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" },
  ],
  highlights: [{ id: "h1", verseKey: "2.47", color: "saffron", createdAt: "2026-01-01T00:00:00Z" }],
  understood: ["2.47"],
  forRevision: ["3.5"],
};
const myGita = buildMyGita(repo, studyUser);
eq(myGita.entries.length, 2, "My Gita aggregates distinct verses (2.47, 3.5)");
eq(myGita.counts, { bookmarks: 1, notes: 2, highlights: 1, understood: 1, forRevision: 1 }, "My Gita counts");
const e247 = myGita.entries.find((x) => x.key === "2.47")!;
ok(e247.bookmarked && e247.highlighted && e247.understood && e247.noteCount === 1, "2.47 entry flags");
ok(myGita.entries[0]!.key === "2.47", "entries sorted by chapter.verse");
eq(notesForVerse(studyUser, "2.47").length, 1, "notesForVerse filters by verse");

// --- persistence: hydrate merges partial/old blobs onto defaults ---
eq(hydrate(null), defaultPersistedState, "hydrate(null) -> defaults");
const hydrated = hydrate({ user: { bookmarks: ["1.1"] } });
eq(hydrated.user.bookmarks, ["1.1"], "hydrate keeps provided fields");
eq(hydrated.user.notes, [], "hydrate fills missing fields from defaults");
eq(hydrated.language.uiLang, "en", "hydrate fills default prefs");

// --- persistence: in-memory round-trip ---
const store = new InMemoryPersistence();
await (async () => {
  ok((await store.load()) === null, "empty persistence loads null");
  await store.save({ ...defaultPersistedState, user: studyUser });
  const back = await store.load();
  eq(back!.user.bookmarks, ["2.47"], "persistence round-trips user state");
})();

if (failures.length) {
  console.error(`✗ core tests FAILED: ${failures.length} failure(s), ${passed} passed`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ core tests passed: ${passed} assertions`);
