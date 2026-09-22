/**
 * Ingestion: transform the verified public-domain upstream snapshot in `raw/` into our
 * provenance-tracked GitaDataset, validate it against @gita/contracts, and write it to `data/`.
 *
 * This script NEVER invents content. It only maps fields from the cited source and stamps each
 * with a sourceId. Run: `npm run ingest -w @gita/content`.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  GitaDataset,
  type Source,
  type Chapter,
  type Verse,
  type SourcedText,
} from "@gita/contracts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = join(__dirname, "..", "raw");
const OUT = join(__dirname, "..", "data");

/** Author id in the upstream translation.json that maps to our public-domain translator. */
const PUROHIT_SWAMI_AUTHOR_ID = 21;

/* ---- Source registry (mirrors SOURCES.md) ---- */
const SOURCES: Source[] = [
  {
    id: "sanskrit-classical",
    title: "Bhagavad Gita (Sanskrit)",
    author: null,
    year: null,
    license: "public-domain",
    provides: ["sanskrit"],
    url: null,
    attribution: "Original Sanskrit text — ancient work, public domain.",
  },
  {
    id: "gita-gita-editorial",
    title: "gita/gita editorial content (transliteration, word meanings, chapter summaries)",
    author: "gita/gita contributors",
    year: null,
    license: "Unlicense",
    provides: ["transliteration", "explanation"],
    url: "https://github.com/gita/gita",
    attribution:
      "Romanization, word meanings and chapter summaries from the Unlicense-dedicated gita/gita dataset.",
  },
  {
    id: "purohit-swami-1935",
    title: "The Geeta: The Gospel of the Lord Shri Krishna",
    author: "Shri Purohit Swami",
    year: 1935,
    license: "public-domain",
    provides: ["translation"],
    url: "https://github.com/gita/gita",
    attribution: "English translation by Shri Purohit Swami (1882–1941); public domain.",
  },
];

/* ---- Raw upstream shapes (only the fields we read) ---- */
interface RawVerse {
  id: number;
  chapter_number: number;
  verse_number: number;
  text: string;
  transliteration: string;
  word_meanings: string;
}
interface RawTranslation {
  verse_id: number;
  author_id: number;
  lang: string;
  description: string;
}
interface RawChapter {
  chapter_number: number;
  name: string; // Sanskrit (Devanagari)
  name_transliterated: string;
  name_translation: string;
  chapter_summary: string;
  verses_count: number;
}

const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(join(RAW, name), "utf8")) as T;

const clean = (s: string): string => s.replace(/\r/g, "").trim();

function main(): void {
  const rawVerses = readJson<RawVerse[]>("verse.json");
  const rawTranslations = readJson<RawTranslation[]>("translation.json");
  const rawChapters = readJson<RawChapter[]>("chapters.json");

  // verse_id -> Purohit Swami English translation text
  const enByVerseId = new Map<number, string>();
  for (const t of rawTranslations) {
    if (t.lang === "english" && t.author_id === PUROHIT_SWAMI_AUTHOR_ID) {
      enByVerseId.set(t.verse_id, clean(t.description));
    }
  }

  const chapters: Chapter[] = rawChapters
    .slice()
    .sort((a, b) => a.chapter_number - b.chapter_number)
    .map((c) => ({
      chapterNumber: c.chapter_number,
      nameTransliterated: clean(c.name_transliterated),
      nameSanskrit: {
        text: clean(c.name),
        lang: "sa",
        contentType: "sanskrit",
        sourceId: "sanskrit-classical",
      } satisfies SourcedText,
      nameTranslation: clean(c.name_translation),
      summary: {
        text: clean(c.chapter_summary),
        lang: "en",
        contentType: "explanation",
        sourceId: "gita-gita-editorial",
      } satisfies SourcedText,
      theme: null,
      versesCount: c.verses_count,
    }));

  const verses: Verse[] = rawVerses
    .slice()
    .sort((a, b) =>
      a.chapter_number - b.chapter_number || a.verse_number - b.verse_number,
    )
    .map((v) => {
      const translations: SourcedText[] = [];
      const en = enByVerseId.get(v.id);
      if (en) {
        translations.push({
          text: en,
          lang: "en",
          contentType: "translation",
          sourceId: "purohit-swami-1935",
        });
      }
      const wm = clean(v.word_meanings);
      return {
        chapterNumber: v.chapter_number,
        verseNumber: v.verse_number,
        sanskrit: {
          text: clean(v.text),
          lang: "sa",
          contentType: "sanskrit",
          sourceId: "sanskrit-classical",
        },
        transliteration: {
          text: clean(v.transliteration),
          lang: "en",
          contentType: "transliteration",
          sourceId: "gita-gita-editorial",
        },
        wordMeaning: wm
          ? {
              text: wm,
              lang: "en",
              contentType: "transliteration",
              sourceId: "gita-gita-editorial",
            }
          : null,
        translations,
        commentaries: [],
        literalTranslation: null,
        explanation: null,
        deeperMeaning: null,
        practicalApplication: null,
        importantConcepts: [],
        keywords: [],
        relatedVerses: [],
      };
    });

  const dataset: GitaDataset = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: SOURCES as GitaDataset["sources"],
    chapters,
    verses: verses as GitaDataset["verses"],
  };

  // Validate before writing — fail loudly if the shape drifts.
  const parsed = GitaDataset.parse(dataset);

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "gita.json"), JSON.stringify(parsed, null, 2), "utf8");

  // Also emit per-chapter files (used later for offline content packs).
  mkdirSync(join(OUT, "chapters"), { recursive: true });
  for (const ch of parsed.chapters) {
    const chVerses = parsed.verses.filter((x) => x.chapterNumber === ch.chapterNumber);
    const pad = String(ch.chapterNumber).padStart(2, "0");
    writeFileSync(
      join(OUT, "chapters", `ch-${pad}.json`),
      JSON.stringify({ chapter: ch, verses: chVerses }, null, 2),
      "utf8",
    );
  }

  const withEn = parsed.verses.filter((v) => v.translations.length > 0).length;
  console.log(
    `Ingested ${parsed.chapters.length} chapters, ${parsed.verses.length} verses ` +
      `(${withEn} with English translation). Wrote data/gita.json + per-chapter files.`,
  );
}

main();
