import { fold } from "@gita/core";

/**
 * A curated concept layer over the Gita (spec §9, §20). This is derived METADATA, not scripture —
 * it maps everyday vocabulary to the words that actually appear in the translations, so a natural
 * query ("I'm anxious about the outcome of my work") can reach the right verses without a neural
 * embedding model. It is deterministic, offline, and unit-testable. The embedding retriever is the
 * production upgrade for true semantic matching; this guarantees a sensible offline baseline.
 */

/** concept slug -> surface words that signal it (matched against folded translation text). */
export const CONCEPT_LEXICON: Record<string, string[]> = {
  detachment: ["attachment", "attached", "detach", "unattached", "cling", "clinging", "renounce"],
  results: ["fruit", "fruits", "result", "results", "reward", "gain", "outcome"],
  action: ["action", "act", "acts", "work", "works", "deed", "deeds", "duty", "karma"],
  fear: ["fear", "fears", "afraid", "dread", "anxiety", "anxious", "worry", "worried"],
  anger: ["anger", "angry", "wrath", "rage"],
  desire: ["desire", "desires", "craving", "lust", "want", "greed"],
  equanimity: ["steady", "equanimity", "calm", "tranquil", "even", "balanced", "poised"],
  self: ["self", "soul", "spirit", "eternal", "imperishable", "immortal", "atman"],
  death: ["death", "die", "dies", "dead", "born", "birth", "reborn"],
  knowledge: ["knowledge", "wisdom", "wise", "ignorance", "ignorant", "understanding"],
  devotion: ["devotion", "devoted", "worship", "faith", "surrender", "love"],
  meditation: ["meditation", "meditate", "yoga", "concentration", "mind"],
  duty: ["duty", "dharma", "righteous", "obligation"],
};

/**
 * Query-term expansion: bridge the user's words to the translation's vocabulary. Keys are folded
 * query tokens; values are extra search terms injected alongside the original query.
 */
export const QUERY_EXPANSION: Record<string, string[]> = {
  outcome: ["fruit", "fruits", "result"],
  outcomes: ["fruit", "fruits", "result"],
  result: ["fruit", "fruits"],
  results: ["fruit", "fruits"],
  anxious: ["fear"],
  anxiety: ["fear"],
  worried: ["fear"],
  worry: ["fear"],
  stress: ["fear"],
  stressed: ["fear"],
  attachment: ["fruit", "attached"],
  detachment: ["attachment", "fruit"],
  purpose: ["duty", "action"],
  job: ["work", "action"],
  career: ["work", "action"],
  meaning: ["duty", "self"],
  dying: ["death", "born"],
  grief: ["death", "sorrow"],
  sad: ["sorrow", "grief"],
  desire: ["craving"],
  discipline: ["steady", "yoga"],
  leadership: ["duty", "action"],
  failure: ["result", "fruit"],
  success: ["result", "fruit"],
};

export function tokenize(text: string): string[] {
  return fold(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

/** Expand a natural-language query into original + bridged terms (deduped). */
export function expandQuery(query: string): string[] {
  const base = tokenize(query);
  const expanded = new Set<string>(base);
  for (const tok of base) {
    for (const extra of QUERY_EXPANSION[tok] ?? []) expanded.add(extra);
  }
  return [...expanded];
}

/** Concepts present in a piece of text (used to tag documents' metadata). */
export function deriveConcepts(text: string): string[] {
  const folded = fold(text);
  const found: string[] = [];
  for (const [slug, words] of Object.entries(CONCEPT_LEXICON)) {
    if (words.some((w) => folded.includes(w))) found.push(slug);
  }
  return found;
}
