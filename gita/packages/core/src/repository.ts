import type {
  Chapter,
  GitaDataset,
  LanguageCode,
  SourcedText,
  Verse,
  VerseRef,
} from "@gita/contracts";
import { verseKey } from "@gita/contracts";

/**
 * Read access to Gita content. The dataset is INJECTED (not loaded here) so this layer is
 * environment-agnostic: the RN app passes a bundled JSON import, the backend/tests pass the
 * fs-loaded dataset. Same code path everywhere.
 */
export class ContentRepository {
  private readonly chaptersByNumber = new Map<number, Chapter>();
  private readonly versesByKey = new Map<string, Verse>();
  private readonly versesByChapter = new Map<number, Verse[]>();

  constructor(private readonly dataset: GitaDataset) {
    for (const c of dataset.chapters) this.chaptersByNumber.set(c.chapterNumber, c);
    for (const v of dataset.verses) {
      this.versesByKey.set(verseKey(v), v);
      const list = this.versesByChapter.get(v.chapterNumber) ?? [];
      list.push(v);
      this.versesByChapter.set(v.chapterNumber, list);
    }
    for (const list of this.versesByChapter.values()) {
      list.sort((a, b) => a.verseNumber - b.verseNumber);
    }
  }

  getSourceById(id: string) {
    return this.dataset.sources.find((s) => s.id === id) ?? null;
  }

  listChapters(): Chapter[] {
    return [...this.chaptersByNumber.values()].sort(
      (a, b) => a.chapterNumber - b.chapterNumber,
    );
  }

  getChapter(chapterNumber: number): Chapter | null {
    return this.chaptersByNumber.get(chapterNumber) ?? null;
  }

  getVersesForChapter(chapterNumber: number): Verse[] {
    return this.versesByChapter.get(chapterNumber) ?? [];
  }

  getVerse(ref: VerseRef): Verse | null {
    return this.versesByKey.get(`${ref.chapterNumber}.${ref.verseNumber}`) ?? null;
  }

  totalVerses(): number {
    return this.versesByKey.size;
  }

  /**
   * Pick the best translation for a verse in the preferred language, falling back to any
   * available translation. Returns null (not a fabricated string) when none exists — e.g.
   * Telugu, which we do not yet have.
   */
  translationFor(verse: Verse, lang: LanguageCode): SourcedText | null {
    return (
      verse.translations.find((t) => t.lang === lang) ??
      verse.translations.find((t) => t.lang === "en") ??
      verse.translations[0] ??
      null
    );
  }
}
