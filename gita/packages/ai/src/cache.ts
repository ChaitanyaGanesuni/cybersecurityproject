import type { LanguageCode } from "@gita/contracts";
import type { ExplanationMode } from "./modes.js";
import { PROMPT_VERSION } from "./prompt.js";

/**
 * AI answer cache (spec §25). Common explanations are cached so the same verse+mode+language is
 * not paid for twice. The prompt version is baked into the key so a prompt change invalidates
 * stale answers automatically.
 */
export interface AiCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export function explanationCacheKey(
  mode: ExplanationMode,
  verseKey: string,
  lang: LanguageCode,
): string {
  return `exp:v${PROMPT_VERSION}:${mode}:${verseKey}:${lang}`;
}

export class InMemoryAiCache implements AiCache {
  private readonly map = new Map<string, string>();
  hits = 0;
  misses = 0;
  async get(key: string): Promise<string | null> {
    const v = this.map.get(key) ?? null;
    if (v !== null) this.hits++;
    else this.misses++;
    return v;
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
}
