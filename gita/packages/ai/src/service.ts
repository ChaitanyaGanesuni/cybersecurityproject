import type { LanguageCode, VerseRef } from "@gita/contracts";
import type { LLMProvider, LLMMessage } from "./provider.js";
import type { AiCache } from "./cache.js";
import { explanationCacheKey } from "./cache.js";
import type { ExplanationMode } from "./modes.js";
import { MODES } from "./modes.js";
import {
  allowedKeys,
  assembleSources,
  extractCitations,
  type RetrievedVerse,
} from "./grounding.js";
import { buildExplanationMessages, buildTutorMessages } from "./prompt.js";
import { trimHistory } from "./history.js";

export interface AiAnswer {
  text: string;
  /** Verses actually cited AND present in the retrieved set. */
  citations: VerseRef[];
  sources: { ref: VerseRef; attribution: string | null }[];
  /** References the model emitted that were not retrieved (dropped) — surfaced for QA/telemetry. */
  droppedCitations: string[];
  fromCache: boolean;
}

/**
 * Orchestrates a grounded answer: build prompt → call provider → validate citations against the
 * retrieved set → assemble Sources. Shared by the backend endpoint and any client. Provider and
 * cache are injected, so the model can be swapped freely (spec §26) and answers cached (spec §25).
 */
export class AiTutorService {
  constructor(
    private readonly provider: LLMProvider,
    private readonly cache?: AiCache,
  ) {}

  async explainVerse(
    verse: RetrievedVerse,
    mode: ExplanationMode,
    explanationLang: LanguageCode,
  ): Promise<AiAnswer> {
    const lang = MODES[mode].forceLang ?? explanationLang;
    const vKey = `${verse.ref.chapterNumber}.${verse.ref.verseNumber}`;
    const cacheKey = explanationCacheKey(mode, vKey, lang);

    const cached = this.cache ? await this.cache.get(cacheKey) : null;
    const text = cached ?? (await this.provider.generate(buildExplanationMessages(verse, mode, explanationLang)));
    if (!cached && this.cache) await this.cache.set(cacheKey, text);

    return this.ground(text, [verse], cached !== null);
  }

  async ask(
    question: string,
    retrieved: RetrievedVerse[],
    history: LLMMessage[] = [],
    answerLang: LanguageCode = "en",
  ): Promise<AiAnswer> {
    const messages = buildTutorMessages(question, retrieved, trimHistory(history), answerLang);
    const text = await this.provider.generate(messages);
    return this.ground(text, retrieved, false);
  }

  /** Shared post-processing: keep only citations that were actually retrieved; build Sources. */
  private ground(text: string, retrieved: RetrievedVerse[], fromCache: boolean): AiAnswer {
    const { valid, invalid } = extractCitations(text, allowedKeys(retrieved));
    return {
      text,
      citations: valid,
      sources: assembleSources(retrieved, valid),
      droppedCitations: invalid,
      fromCache,
    };
  }
}
