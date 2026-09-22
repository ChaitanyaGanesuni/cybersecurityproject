/**
 * Validation test for the generated dataset. This is the Phase 2 "test" step: it fails with a
 * non-zero exit code if any invariant is broken. Run: `npm run validate -w @gita/content`.
 *
 * Invariants enforced:
 *  - dataset parses against @gita/contracts
 *  - 18 chapters, with the canonical verse counts
 *  - every verse has non-empty Sanskrit + transliteration
 *  - PROVENANCE: every SourcedText.sourceId resolves to a declared Source, AND that source
 *    is actually allowed to provide that contentType
 *  - ANTI-FABRICATION: no verse ships an "ai" contentType field at ingest time
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GitaDataset, type SourcedText, verseKey } from "@gita/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data", "gita.json");

/** Canonical verse counts (as ingested from source; total 701 — see SOURCES.md). */
const EXPECTED_COUNTS: Record<number, number> = {
  1: 47, 2: 72, 3: 43, 4: 42, 5: 29, 6: 47, 7: 30, 8: 28, 9: 34,
  10: 42, 11: 55, 12: 20, 13: 35, 14: 27, 15: 20, 16: 24, 17: 28, 18: 78,
};

const errors: string[] = [];
const check = (cond: boolean, msg: string): void => {
  if (!cond) errors.push(msg);
};

function main(): void {
  const raw = JSON.parse(readFileSync(DATA, "utf8"));
  const ds = GitaDataset.parse(raw); // throws if structurally invalid

  const sourceById = new Map(ds.sources.map((s) => [s.id, s]));

  const checkSourced = (st: SourcedText | null, where: string): void => {
    if (!st) return;
    const src = sourceById.get(st.sourceId);
    check(!!src, `${where}: unknown sourceId "${st.sourceId}"`);
    if (src) {
      check(
        src.provides.includes(st.contentType),
        `${where}: source "${st.sourceId}" is not allowed to provide "${st.contentType}"`,
      );
    }
    check(
      st.contentType !== "ai",
      `${where}: an AI-generated field was shipped at ingest time (forbidden)`,
    );
  };

  // Chapters
  check(ds.chapters.length === 18, `expected 18 chapters, got ${ds.chapters.length}`);
  for (const ch of ds.chapters) {
    check(
      ch.versesCount === EXPECTED_COUNTS[ch.chapterNumber],
      `chapter ${ch.chapterNumber}: versesCount ${ch.versesCount} != expected ${EXPECTED_COUNTS[ch.chapterNumber]}`,
    );
    checkSourced(ch.nameSanskrit, `chapter ${ch.chapterNumber} nameSanskrit`);
    checkSourced(ch.summary, `chapter ${ch.chapterNumber} summary`);
  }

  // Verses
  const perChapter: Record<number, number> = {};
  const seen = new Set<string>();
  for (const v of ds.verses) {
    const key = verseKey(v);
    check(!seen.has(key), `duplicate verse ${key}`);
    seen.add(key);
    perChapter[v.chapterNumber] = (perChapter[v.chapterNumber] ?? 0) + 1;

    check(v.sanskrit.text.length > 0, `verse ${key}: empty Sanskrit`);
    check(v.transliteration.text.length > 0, `verse ${key}: empty transliteration`);

    checkSourced(v.sanskrit, `verse ${key} sanskrit`);
    checkSourced(v.transliteration, `verse ${key} transliteration`);
    checkSourced(v.wordMeaning, `verse ${key} wordMeaning`);
    for (const t of v.translations) checkSourced(t, `verse ${key} translation`);
    for (const c of v.commentaries) checkSourced(c, `verse ${key} commentary`);
    checkSourced(v.literalTranslation, `verse ${key} literalTranslation`);
    checkSourced(v.explanation, `verse ${key} explanation`);
    checkSourced(v.deeperMeaning, `verse ${key} deeperMeaning`);
    checkSourced(v.practicalApplication, `verse ${key} practicalApplication`);
  }
  for (const [num, expected] of Object.entries(EXPECTED_COUNTS)) {
    const got = perChapter[Number(num)] ?? 0;
    check(got === expected, `chapter ${num}: ${got} verses, expected ${expected}`);
  }

  const total = ds.verses.length;
  const withEn = ds.verses.filter((v) => v.translations.some((t) => t.lang === "en")).length;

  if (errors.length) {
    console.error(`✗ validation FAILED with ${errors.length} error(s):`);
    for (const e of errors.slice(0, 50)) console.error("  - " + e);
    process.exit(1);
  }
  console.log(
    `✓ validation passed: 18 chapters, ${total} verses, ${withEn} with English translation, ` +
      `all provenance + anti-fabrication invariants hold.`,
  );
}

main();
