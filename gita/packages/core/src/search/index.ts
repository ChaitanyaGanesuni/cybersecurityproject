import type { VerseRef } from "@gita/contracts";
import { ContentRepository } from "../repository.js";

/**
 * Offline search over the Gita.
 *
 * DESIGN: search is defined by an interface so the implementation can be swapped without touching
 * callers. For 701 verses an in-memory lexical index (below) is instant, needs no native module,
 * and works fully offline — so it is the default. A SQLite FTS5 engine can implement the same
 * interface on-device if the corpus grows (multi-commentary, many languages). SEMANTIC search
 * ("anxiety about results" → detachment verses) is a separate engine added in Phase 7 (RAG),
 * also behind this interface.
 */
export interface SearchResult {
  ref: VerseRef;
  score: number;
  /** Which field(s) matched, for UI hinting. */
  matchedFields: string[];
  snippet: string;
}

export interface SearchEngine {
  search(query: string, limit?: number): SearchResult[];
}

/** Fold diacritics (ā, ṇ, ś, …) to ASCII so "krsna" matches "kṛṣṇa". */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function tokenize(s: string): string[] {
  return fold(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** Parse a verse-reference query like "2.47", "2:47", "chapter 2 verse 47", "ch 2 v 47". */
export function parseVerseRef(query: string): VerseRef | null {
  const q = query.trim().toLowerCase();
  const dotted = q.match(/^(\d{1,2})\s*[.:]\s*(\d{1,3})$/);
  if (dotted) {
    return { chapterNumber: Number(dotted[1]), verseNumber: Number(dotted[2]) };
  }
  const worded = q.match(/(?:chapter|ch)\s*(\d{1,2}).*?(?:verse|v)\s*(\d{1,3})/);
  if (worded) {
    return { chapterNumber: Number(worded[1]), verseNumber: Number(worded[2]) };
  }
  return null;
}

interface IndexedField {
  field: string;
  weight: number;
  tokens: string[];
  raw: string;
}

export class InMemorySearchEngine implements SearchEngine {
  /** verseKey -> indexed fields */
  private readonly docs = new Map<string, { ref: VerseRef; fields: IndexedField[] }>();
  /** token -> set of verseKeys (for fast candidate lookup) */
  private readonly inverted = new Map<string, Set<string>>();

  constructor(private readonly repo: ContentRepository) {
    for (const ch of repo.listChapters()) {
      for (const v of repo.getVersesForChapter(ch.chapterNumber)) {
        const key = `${v.chapterNumber}.${v.verseNumber}`;
        const fields: IndexedField[] = [];
        const add = (field: string, weight: number, raw: string | undefined | null) => {
          if (!raw) return;
          const tokens = tokenize(raw);
          fields.push({ field, weight, tokens, raw });
          for (const tok of new Set(tokens)) {
            const set = this.inverted.get(tok) ?? new Set<string>();
            set.add(key);
            this.inverted.set(tok, set);
          }
        };
        add("translation", 3, v.translations.map((t) => t.text).join(" "));
        add("wordMeaning", 2, v.wordMeaning?.text ?? null);
        add("transliteration", 2, v.transliteration.text);
        add("explanation", 2, v.explanation?.text ?? null);
        add("concepts", 3, [...v.importantConcepts, ...v.keywords].join(" "));
        add("chapter", 1, `${ch.nameTransliterated} ${ch.nameTranslation}`);
        this.docs.set(key, { ref: { chapterNumber: v.chapterNumber, verseNumber: v.verseNumber }, fields });
      }
    }
  }

  search(query: string, limit = 25): SearchResult[] {
    // 1) exact verse reference wins outright.
    const ref = parseVerseRef(query);
    if (ref && this.repo.getVerse(ref)) {
      const key = `${ref.chapterNumber}.${ref.verseNumber}`;
      const doc = this.docs.get(key)!;
      return [
        {
          ref,
          score: Number.MAX_SAFE_INTEGER,
          matchedFields: ["reference"],
          snippet: this.snippetFor(doc.fields),
        },
      ];
    }

    // 2) lexical scoring over candidate docs.
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return [];

    const candidates = new Set<string>();
    for (const tok of qTokens) {
      for (const key of this.inverted.get(tok) ?? []) candidates.add(key);
    }

    const results: SearchResult[] = [];
    for (const key of candidates) {
      const doc = this.docs.get(key)!;
      let score = 0;
      const matched = new Set<string>();
      for (const f of doc.fields) {
        const fieldTokenSet = new Set(f.tokens);
        for (const qt of qTokens) {
          if (fieldTokenSet.has(qt)) {
            score += f.weight;
            matched.add(f.field);
          }
        }
      }
      if (score > 0) {
        results.push({
          ref: doc.ref,
          score,
          matchedFields: [...matched],
          snippet: this.snippetFor(doc.fields),
        });
      }
    }

    results.sort(
      (a, b) =>
        b.score - a.score ||
        a.ref.chapterNumber - b.ref.chapterNumber ||
        a.ref.verseNumber - b.ref.verseNumber,
    );
    return results.slice(0, limit);
  }

  private snippetFor(fields: IndexedField[]): string {
    const tr = fields.find((f) => f.field === "translation");
    const raw = (tr ?? fields[0])?.raw ?? "";
    return raw.length > 140 ? raw.slice(0, 137).trimEnd() + "…" : raw;
  }
}
