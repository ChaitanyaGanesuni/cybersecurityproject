import type { LanguageCode, VerseRef } from "@gita/contracts";
import { ContentRepository } from "@gita/core";
import type { RetrievedVerse } from "@gita/ai";
import type { VectorRecord } from "./vectorstore.js";
import { deriveConcepts } from "./concepts.js";

/**
 * Turn each verse into multiple retrievable documents (spec §9): one per field
 * (translation, transliteration, sanskrit, word meanings), each carrying metadata
 * {chapter, verse, chapterName, language, concepts}. Concepts are derived from the translation.
 */
export interface RagDocument {
  id: string;
  verseRef: VerseRef;
  docType: "translation" | "transliteration" | "sanskrit" | "wordMeaning";
  lang: LanguageCode;
  text: string;
  concepts: string[];
}

export function buildVerseDocuments(repo: ContentRepository): RagDocument[] {
  const docs: RagDocument[] = [];
  for (const chapter of repo.listChapters()) {
    for (const v of repo.getVersesForChapter(chapter.chapterNumber)) {
      const ref = { chapterNumber: v.chapterNumber, verseNumber: v.verseNumber };
      const id = (t: string) => `${v.chapterNumber}.${v.verseNumber}:${t}`;
      const tr = repo.translationFor(v, "en");
      const concepts = tr ? deriveConcepts(tr.text) : [];

      if (tr) docs.push({ id: id("translation"), verseRef: ref, docType: "translation", lang: tr.lang, text: tr.text, concepts });
      docs.push({ id: id("transliteration"), verseRef: ref, docType: "transliteration", lang: v.transliteration.lang, text: v.transliteration.text, concepts });
      docs.push({ id: id("sanskrit"), verseRef: ref, docType: "sanskrit", lang: v.sanskrit.lang, text: v.sanskrit.text, concepts });
      if (v.wordMeaning) docs.push({ id: id("wordMeaning"), verseRef: ref, docType: "wordMeaning", lang: v.wordMeaning.lang, text: v.wordMeaning.text, concepts });
    }
  }
  return docs;
}

/** Build the AI-layer RetrievedVerse for a ref (translation + attribution), or null if missing. */
export function makeRetrievedVerse(
  repo: ContentRepository,
  ref: VerseRef,
  lang: LanguageCode,
): RetrievedVerse | null {
  const verse = repo.getVerse(ref);
  if (!verse) return null;
  const tr = repo.translationFor(verse, lang);
  const src = tr ? repo.getSourceById(tr.sourceId) : null;
  return {
    ref,
    sanskrit: verse.sanskrit.text,
    transliteration: verse.transliteration.text,
    translation: tr?.text ?? null,
    wordMeaning: verse.wordMeaning?.text ?? null,
    translationSource: src?.attribution ?? null,
  };
}
