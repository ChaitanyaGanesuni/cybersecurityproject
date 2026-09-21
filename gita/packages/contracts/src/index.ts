/**
 * @gita/contracts — the single source of truth for the Gita content model.
 *
 * DESIGN RULE (from the product spec, §2):
 * Scripture, translation, commentary and AI output are DIFFERENT KINDS of text and
 * must never be confused. Every piece of displayable text therefore carries an explicit
 * `contentType` and a `sourceId` pointing into the source registry. There is no field in
 * this model that can hold "text of unknown origin" — provenance is structurally required.
 *
 * Nothing here is ever generated/fabricated: content is only produced by ingesting a cited
 * source. AI-derived fields (simpleMeaning, deeperMeaning, practicalApplication, …) are
 * OPTIONAL and, when present, are always tagged contentType "ai" with the generating model
 * recorded as their source. They are populated at runtime by the AI service (Phase 6), never
 * written into the scripture tables by hand.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Enumerations                                                       */
/* ------------------------------------------------------------------ */

/** The seven distinct kinds of text the app distinguishes (spec §2). */
export const ContentType = z.enum([
  "sanskrit", // 1. original Sanskrit verse (Devanagari)
  "transliteration", // 2. scholarly romanization (IAST-style)
  "literalTranslation", // 3. word-for-word / literal rendering
  "translation", // 4. readable translation
  "explanation", // 5. meaning/explanation (human-authored)
  "commentary", // 6. traditional interpretation (a named commentator)
  "modernApplication", // (practical/modern human-authored interpretation)
  "ai", // 7. AI-generated interpretation (must be labelled as such in UI)
]);
export type ContentType = z.infer<typeof ContentType>;

/** Languages supported in v1. Architected so more can be added without code changes. */
export const LanguageCode = z.enum(["sa", "en", "te", "hi"]); // Sanskrit, English, Telugu, Hindi
export type LanguageCode = z.infer<typeof LanguageCode>;

/** SPDX-ish license identifiers we actually use, plus an escape hatch. */
export const License = z.enum([
  "public-domain",
  "CC0-1.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "Unlicense",
  "proprietary-licensed", // used under explicit permission/agreement
  "ai-generated", // output of an LLM; governed by that provider's terms
  "unknown",
]);
export type License = z.infer<typeof License>;

/* ------------------------------------------------------------------ */
/* Source registry                                                    */
/* ------------------------------------------------------------------ */

/**
 * A citable origin for content. Every SourcedText references one of these by id.
 * This is what powers the "Sources: Chapter X, Verse Y" and per-translation attribution.
 */
export const Source = z.object({
  id: z.string().min(1), // e.g. "sanskrit-classical", "purohit-swami-1935"
  title: z.string().min(1),
  author: z.string().nullable(),
  year: z.number().int().nullable(),
  license: License,
  /** Which content types this source can legitimately provide. */
  provides: z.array(ContentType).nonempty(),
  url: z.string().url().nullable(),
  /** Short human-readable provenance / copyright note shown in the UI. */
  attribution: z.string(),
});
export type Source = z.infer<typeof Source>;

/* ------------------------------------------------------------------ */
/* Sourced text — the atom of the content model                       */
/* ------------------------------------------------------------------ */

export const SourcedText = z.object({
  text: z.string().min(1),
  lang: LanguageCode,
  contentType: ContentType,
  /** MUST reference a Source.id. Provenance is not optional. */
  sourceId: z.string().min(1),
});
export type SourcedText = z.infer<typeof SourcedText>;

/* ------------------------------------------------------------------ */
/* Concepts / keywords (drive search + RAG filtering)                 */
/* ------------------------------------------------------------------ */

export const Concept = z.object({
  slug: z.string().min(1), // "detachment", "karma-yoga"
  label: z.string().min(1),
});
export type Concept = z.infer<typeof Concept>;

/* ------------------------------------------------------------------ */
/* Verse                                                              */
/* ------------------------------------------------------------------ */

export const VerseRef = z.object({
  chapterNumber: z.number().int().min(1).max(18),
  verseNumber: z.number().int().min(1),
});
export type VerseRef = z.infer<typeof VerseRef>;

/**
 * The verse content model. Mirrors the spec's conceptual shape but makes provenance
 * structural. Human/classical scripture fields are populated at ingest; AI fields are
 * optional and filled at runtime.
 */
export const Verse = z.object({
  chapterNumber: z.number().int().min(1).max(18),
  verseNumber: z.number().int().min(1),

  // --- Ingested, cited content ---
  sanskrit: SourcedText, // contentType: "sanskrit"
  transliteration: SourcedText, // contentType: "transliteration"
  wordMeaning: SourcedText.nullable(), // contentType: "transliteration"/"explanation"
  /** One or more translations, each independently attributed (multi-source, multi-lang). */
  translations: z.array(SourcedText).default([]),
  /** Optional traditional commentaries by named (usually classical, PD) commentators. */
  commentaries: z.array(SourcedText).default([]),

  // --- Derived / optional (AI or human, always tagged; may be absent) ---
  literalTranslation: SourcedText.nullable().default(null),
  explanation: SourcedText.nullable().default(null), // "simple meaning"
  deeperMeaning: SourcedText.nullable().default(null),
  practicalApplication: SourcedText.nullable().default(null),

  // --- Retrieval / navigation metadata ---
  importantConcepts: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  relatedVerses: z.array(VerseRef).default([]),
});
export type Verse = z.infer<typeof Verse>;

/* ------------------------------------------------------------------ */
/* Chapter                                                            */
/* ------------------------------------------------------------------ */

export const Chapter = z.object({
  chapterNumber: z.number().int().min(1).max(18),
  /** Romanized chapter name, e.g. "Sankhya Yoga". */
  nameTransliterated: z.string().min(1),
  /** Sanskrit (Devanagari) chapter title. */
  nameSanskrit: SourcedText, // contentType: "sanskrit"
  /** English meaning of the chapter name. */
  nameTranslation: z.string().min(1),
  summary: SourcedText, // contentType: "explanation"
  /** Central theme (short). */
  theme: z.string().nullable().default(null),
  versesCount: z.number().int().min(1),
});
export type Chapter = z.infer<typeof Chapter>;

/* ------------------------------------------------------------------ */
/* Top-level dataset                                                  */
/* ------------------------------------------------------------------ */

export const GitaDataset = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string(), // ISO timestamp
  sources: z.array(Source).nonempty(),
  chapters: z.array(Chapter).length(18),
  verses: z.array(Verse).nonempty(),
});
export type GitaDataset = z.infer<typeof GitaDataset>;

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

export const verseKey = (r: VerseRef | Verse): string =>
  `${r.chapterNumber}.${r.verseNumber}`;

/** Every content type except "ai" is considered non-AI (renders as scripture/human text). */
export const isAiContent = (t: ContentType): boolean => t === "ai";
