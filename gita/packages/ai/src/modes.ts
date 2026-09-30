import type { LanguageCode } from "@gita/contracts";

/** Explanation modes the user can switch between without leaving the verse (spec §16). */
export type ExplanationMode =
  | "simple"
  | "deep"
  | "practical"
  | "story"
  | "child"
  | "telugu"
  | "sanskritContext";

export interface ModeSpec {
  id: ExplanationMode;
  label: string;
  /** Instruction injected into the prompt for this mode. */
  instruction: string;
  /** Fixes the output language regardless of the user's explanation-language pref, if set. */
  forceLang?: LanguageCode;
}

export const MODES: Record<ExplanationMode, ModeSpec> = {
  simple: {
    id: "simple",
    label: "Simple",
    instruction:
      "Explain this verse plainly, as if to someone encountering the Gita for the first time. Short sentences, no jargon.",
  },
  deep: {
    id: "deep",
    label: "Deep",
    instruction:
      "Explain the philosophical implications of this verse. You may discuss concepts like the self, action, and duty, but stay grounded in the provided text.",
  },
  practical: {
    id: "practical",
    label: "Practical",
    instruction:
      "Explain how this teaching could apply to daily life — work, relationships, stress, decisions, failure, success. Give one concrete, everyday example.",
  },
  story: {
    id: "story",
    label: "Story",
    instruction: "Explain the teaching of this verse using a short, simple analogy or story.",
  },
  child: {
    id: "child",
    label: "For a teen",
    instruction: "Explain this verse for a 12–15 year old, warmly and simply.",
  },
  telugu: {
    id: "telugu",
    label: "Telugu",
    instruction: "Explain this verse in natural, clear Telugu.",
    forceLang: "te",
  },
  sanskritContext: {
    id: "sanskritContext",
    label: "Sanskrit terms",
    instruction:
      "Explain the important Sanskrit terms in this verse (e.g. karma, dharma, yoga), using ONLY terms that appear in the provided word-by-word meanings. Do not introduce Sanskrit words that are not present.",
  },
};

export const MODE_ORDER: ExplanationMode[] = [
  "simple",
  "deep",
  "practical",
  "story",
  "child",
  "telugu",
  "sanskritContext",
];
