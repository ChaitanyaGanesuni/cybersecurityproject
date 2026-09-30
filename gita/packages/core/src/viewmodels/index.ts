import type { Verse } from "@gita/contracts";
import { verseKey } from "@gita/contracts";
import { ContentRepository } from "../repository.js";
import type { LanguagePrefs } from "../prefs.js";
import type { UserState } from "../progress.js";
import { versesReadInChapter } from "../progress.js";
import { dueItems } from "../revision.js";
import {
  chapterProgressLabel,
  chapterWordCount,
  estimateListeningMinutes,
  estimateReadingMinutes,
  formatMinutes,
  listeningProgressLabel,
  verseWordCount,
} from "../format.js";

/* ---------------- Verse ---------------- */

export interface SourcedBlock {
  text: string;
  lang: string;
  /** True when this text is AI-generated and must be visually marked (spec §2). */
  isAi: boolean;
  /** Human-readable attribution for the "Sources" line, or null for AI/none. */
  attribution: string | null;
}

export interface VerseViewModel {
  chapterNumber: number;
  verseNumber: number;
  key: string;
  sanskrit: SourcedBlock;
  transliteration: SourcedBlock;
  wordMeaning: SourcedBlock | null;
  translation: SourcedBlock | null; // null when unavailable in any language (no fabrication)
  simpleMeaning: SourcedBlock | null;
  deeperMeaning: SourcedBlock | null;
  practicalApplication: SourcedBlock | null;
  isBookmarked: boolean;
  isRead: boolean;
}

function block(
  repo: ContentRepository,
  st: { text: string; lang: string; contentType: string; sourceId: string } | null,
): SourcedBlock | null {
  if (!st) return null;
  const isAi = st.contentType === "ai";
  const src = repo.getSourceById(st.sourceId);
  return {
    text: st.text,
    lang: st.lang,
    isAi,
    attribution: isAi ? null : (src?.attribution ?? null),
  };
}

export function buildVerseViewModel(
  repo: ContentRepository,
  verse: Verse,
  prefs: LanguagePrefs,
  user: UserState,
): VerseViewModel {
  const key = verseKey(verse);
  const tr = repo.translationFor(verse, prefs.verseLang);
  return {
    chapterNumber: verse.chapterNumber,
    verseNumber: verse.verseNumber,
    key,
    sanskrit: block(repo, verse.sanskrit)!,
    transliteration: block(repo, verse.transliteration)!,
    wordMeaning: block(repo, verse.wordMeaning),
    translation: block(repo, tr),
    simpleMeaning: block(repo, verse.explanation),
    deeperMeaning: block(repo, verse.deeperMeaning),
    practicalApplication: block(repo, verse.practicalApplication),
    isBookmarked: user.bookmarks.includes(key),
    isRead: user.reading.readVerseKeys.includes(key),
  };
}

/* ---------------- Chapter ---------------- */

export interface ChapterCardViewModel {
  chapterNumber: number;
  nameTransliterated: string;
  nameSanskrit: string;
  nameTranslation: string;
  versesCount: number;
  versesRead: number;
  progressLabel: string;
  readingTime: string;
  listeningTime: string;
}

export function buildChapterCard(
  repo: ContentRepository,
  chapterNumber: number,
  user: UserState,
): ChapterCardViewModel | null {
  const ch = repo.getChapter(chapterNumber);
  if (!ch) return null;
  const verses = repo.getVersesForChapter(chapterNumber);
  const words = chapterWordCount(verses);
  const versesRead = versesReadInChapter(user.reading, chapterNumber);
  return {
    chapterNumber,
    nameTransliterated: ch.nameTransliterated,
    nameSanskrit: ch.nameSanskrit.text,
    nameTranslation: ch.nameTranslation,
    versesCount: ch.versesCount,
    versesRead,
    progressLabel: chapterProgressLabel(ch, versesRead),
    readingTime: formatMinutes(estimateReadingMinutes(words)),
    listeningTime: formatMinutes(estimateListeningMinutes(words)),
  };
}

export interface ChapterDetailViewModel extends ChapterCardViewModel {
  summary: string;
  theme: string | null;
  verses: VerseViewModel[];
}

export function buildChapterDetail(
  repo: ContentRepository,
  chapterNumber: number,
  prefs: LanguagePrefs,
  user: UserState,
): ChapterDetailViewModel | null {
  const card = buildChapterCard(repo, chapterNumber, user);
  const ch = repo.getChapter(chapterNumber);
  if (!card || !ch) return null;
  return {
    ...card,
    summary: ch.summary.text,
    theme: ch.theme,
    verses: repo
      .getVersesForChapter(chapterNumber)
      .map((v) => buildVerseViewModel(repo, v, prefs, user)),
  };
}

/* ---------------- Home ---------------- */

export interface HomeViewModel {
  continueLearning: {
    chapterNumber: number;
    verseNumber: number;
    label: string;
  } | null;
  todaysVerse: { chapterNumber: number; verseNumber: number };
  continueListening: {
    chapterNumber: number;
    verseNumber: number;
    label: string;
  } | null;
  totalChapters: number;
  totalVerses: number;
  bookmarkCount: number;
  dueRevisions: number;
}

/**
 * Deterministic "today's verse" so the whole app agrees for a given day without a server call.
 * dayIndex = days since epoch; picks a verse by modulo over the ordered verse list.
 */
export function todaysVerseRef(repo: ContentRepository, date: Date) {
  const all = repo
    .listChapters()
    .flatMap((c) => repo.getVersesForChapter(c.chapterNumber));
  const dayIndex = Math.floor(date.getTime() / 86_400_000);
  const v = all[dayIndex % all.length]!;
  return { chapterNumber: v.chapterNumber, verseNumber: v.verseNumber };
}

export function buildHome(
  repo: ContentRepository,
  user: UserState,
  now: Date,
): HomeViewModel {
  const last = user.reading.lastReadVerse;
  const listening = user.listening;
  return {
    continueLearning: last
      ? {
          chapterNumber: last.chapterNumber,
          verseNumber: last.verseNumber,
          label: `Chapter ${last.chapterNumber}, Verse ${last.verseNumber}`,
        }
      : null,
    todaysVerse: todaysVerseRef(repo, now),
    continueListening: listening
      ? {
          chapterNumber: listening.chapterNumber,
          verseNumber: listening.verseNumber,
          label: listeningProgressLabel(listening.fraction),
        }
      : null,
    totalChapters: repo.listChapters().length,
    totalVerses: repo.totalVerses(),
    bookmarkCount: user.bookmarks.length,
    dueRevisions: dueItems(user.revisionItems, now).length,
  };
}
