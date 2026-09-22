import type { VerseRef } from "@gita/contracts";

/**
 * Grounding + citation safety (spec §2, §8, §9). The model is only ever given a fixed set of
 * retrieved verses, and any citation it emits is validated against THAT set — references the model
 * invents are dropped. The UI's "Sources" list is built from the retrieved set, never from the
 * model's free text, so a citation can never point at a verse that wasn't actually retrieved.
 */

export interface RetrievedVerse {
  ref: VerseRef;
  sanskrit: string;
  transliteration: string;
  translation: string | null;
  wordMeaning?: string | null;
  /** Attribution string for the translation, surfaced in Sources. */
  translationSource?: string | null;
}

const key = (r: VerseRef) => `${r.chapterNumber}.${r.verseNumber}`;

/** Render the retrieved verses as an explicit, tagged context block for the prompt. */
export function buildContextBlock(retrieved: RetrievedVerse[]): string {
  return retrieved
    .map((v) => {
      const lines = [
        `[${key(v.ref)}]`,
        `Sanskrit: ${v.sanskrit}`,
        `Transliteration: ${v.transliteration}`,
      ];
      if (v.translation) lines.push(`Translation: ${v.translation}`);
      if (v.wordMeaning) lines.push(`Word meanings: ${v.wordMeaning}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function allowedKeys(retrieved: RetrievedVerse[]): Set<string> {
  return new Set(retrieved.map((v) => key(v.ref)));
}

export interface CitationExtraction {
  valid: VerseRef[];
  /** References the model emitted that were NOT in the retrieved set (dropped). */
  invalid: string[];
}

/**
 * Pull chapter.verse references out of model text and split them into those allowed (present in
 * the retrieved set) and those not. Matches "2.47", "2:47", and "Chapter 2, Verse 47".
 */
export function extractCitations(text: string, allowed: Set<string>): CitationExtraction {
  const found = new Map<string, VerseRef>();

  const addRef = (c: number, v: number) => {
    if (c >= 1 && c <= 18 && v >= 1) found.set(`${c}.${v}`, { chapterNumber: c, verseNumber: v });
  };

  for (const m of text.matchAll(/\b(\d{1,2})[.:](\d{1,3})\b/g)) {
    addRef(Number(m[1]), Number(m[2]));
  }
  for (const m of text.matchAll(/chapter\s*(\d{1,2})[,\s]+verse\s*(\d{1,3})/gi)) {
    addRef(Number(m[1]), Number(m[2]));
  }

  const valid: VerseRef[] = [];
  const invalid: string[] = [];
  for (const [k, ref] of found) {
    if (allowed.has(k)) valid.push(ref);
    else invalid.push(k);
  }
  valid.sort((a, b) => a.chapterNumber - b.chapterNumber || a.verseNumber - b.verseNumber);
  return { valid, invalid };
}

/** The Sources list for an answer — built from retrieval, optionally narrowed to cited verses. */
export function assembleSources(
  retrieved: RetrievedVerse[],
  citedOnly?: VerseRef[],
): { ref: VerseRef; attribution: string | null }[] {
  const wanted = citedOnly && citedOnly.length ? new Set(citedOnly.map(key)) : null;
  return retrieved
    .filter((v) => !wanted || wanted.has(key(v.ref)))
    .map((v) => ({ ref: v.ref, attribution: v.translationSource ?? null }));
}
