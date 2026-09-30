import type { LanguageCode, Verse, VerseRef } from "@gita/contracts";
import {
  assembleSources,
  type AiAnswer,
  type ExplanationMode,
  type RetrievedVerse,
} from "@gita/ai";
import type { ContentRepository } from "@gita/core";

/**
 * The app NEVER holds LLM API keys (spec §24). It talks to an `AiClient`:
 *  - `HttpAiClient` posts to the backend, which runs the grounded AiTutorService with a real model.
 *  - `OfflineGroundedClient` is the no-network fallback. It does NOT fabricate an explanation — it
 *    surfaces the actual (public-domain) translation and its source, clearly labelled, so the user
 *    still gets grounded value offline without any invented interpretation.
 */

/** Map a content Verse into the retrieval shape the AI layer expects. */
export function toRetrievedVerse(
  repo: ContentRepository,
  verse: Verse,
  lang: LanguageCode,
): RetrievedVerse {
  const tr = repo.translationFor(verse, lang);
  const src = tr ? repo.getSourceById(tr.sourceId) : null;
  return {
    ref: { chapterNumber: verse.chapterNumber, verseNumber: verse.verseNumber },
    sanskrit: verse.sanskrit.text,
    transliteration: verse.transliteration.text,
    translation: tr?.text ?? null,
    wordMeaning: verse.wordMeaning?.text ?? null,
    translationSource: src?.attribution ?? null,
  };
}

export interface AiClient {
  explain(verse: RetrievedVerse, mode: ExplanationMode, lang: LanguageCode): Promise<AiAnswer>;
  ask(question: string, retrieved: RetrievedVerse[], lang: LanguageCode): Promise<AiAnswer>;
}

/** Honest offline fallback: shows the real translation + source, never an invented explanation. */
export class OfflineGroundedClient implements AiClient {
  async explain(verse: RetrievedVerse, _mode: ExplanationMode, _lang: LanguageCode): Promise<AiAnswer> {
    const body = verse.translation
      ? `“${verse.translation}”\n\n(Offline: showing the translation and its source. Connect for the AI teacher’s explanation.)`
      : "No translation is available offline for this verse yet.";
    return {
      text: body,
      citations: [verse.ref],
      sources: assembleSources([verse], [verse.ref]),
      droppedCitations: [],
      fromCache: false,
    };
  }

  async ask(question: string, retrieved: RetrievedVerse[], _lang: LanguageCode): Promise<AiAnswer> {
    const cited: VerseRef[] = retrieved.map((v) => v.ref);
    const list = retrieved
      .filter((v) => v.translation)
      .map((v) => `[${v.ref.chapterNumber}.${v.ref.verseNumber}] “${v.translation}”`)
      .join("\n\n");
    return {
      text:
        (list || "No matching verses are available offline.") +
        "\n\n(Offline: these are the most relevant verses and their translations. Connect for a synthesized, grounded answer.)",
      citations: cited,
      sources: assembleSources(retrieved),
      droppedCitations: [],
      fromCache: false,
    };
  }
}

/** Talks to the backend AI endpoint. Backend arrives in a later phase; guarded until configured. */
export class HttpAiClient implements AiClient {
  constructor(private readonly baseUrl: string) {}

  private async post<T>(path: string, payload: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`AI backend error ${res.status}`);
    return (await res.json()) as T;
  }

  explain(verse: RetrievedVerse, mode: ExplanationMode, lang: LanguageCode): Promise<AiAnswer> {
    return this.post<AiAnswer>("/ai/explain", { verse, mode, lang });
  }
  ask(question: string, retrieved: RetrievedVerse[], lang: LanguageCode): Promise<AiAnswer> {
    return this.post<AiAnswer>("/ai/ask", { question, retrieved, lang });
  }
}

/** Choose the client from configuration: backend if set, else the honest offline fallback. */
export function createAiClient(backendUrl?: string): AiClient {
  return backendUrl ? new HttpAiClient(backendUrl) : new OfflineGroundedClient();
}
