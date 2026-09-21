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

if (failures.length) {
  console.error(`✗ core tests FAILED: ${failures.length} failure(s), ${passed} passed`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ core tests passed: ${passed} assertions`);
