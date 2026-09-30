import type { LanguageCode } from "@gita/contracts";
import type { LLMMessage } from "./provider.js";
import { MODES, type ExplanationMode } from "./modes.js";
import { buildContextBlock, type RetrievedVerse } from "./grounding.js";

/** Bump when the system prompt changes so cached answers are invalidated. */
export const PROMPT_VERSION = 1;

/**
 * The grounding contract (spec §2). This is the single most important prompt in the app: it forbids
 * fabrication, requires citations to come only from the provided verses, and requires the model to
 * admit uncertainty rather than guess.
 */
export const SYSTEM_PROMPT = [
  "You are a knowledgeable, humble teacher of the Bhagavad Gita.",
  "You are given a fixed set of verses, each tagged like [2.47], with Sanskrit, transliteration, translation and word meanings.",
  "RULES:",
  "1. Base your answer ONLY on the provided verses. Do not use outside quotations or introduce verses that are not provided.",
  "2. Never invent Sanskrit words, verse numbers, chapter numbers, or scriptural references.",
  "3. Cite verses you rely on using their tag, e.g. [2.47], and cite only verses from the provided set.",
  "4. Clearly separate the text's meaning from your own interpretation. Your interpretation is guidance, not scripture.",
  "5. If the provided verses do not answer the question, say so plainly. If you are unsure of a factual/scriptural detail, say you are uncertain rather than guessing.",
].join("\n");

const LANG_NAME: Record<LanguageCode, string> = {
  en: "English",
  te: "Telugu",
  sa: "Sanskrit",
  hi: "Hindi",
};

/** Messages for a single-verse explanation in a chosen mode. */
export function buildExplanationMessages(
  verse: RetrievedVerse,
  mode: ExplanationMode,
  explanationLang: LanguageCode,
): LLMMessage[] {
  const spec = MODES[mode];
  const lang = spec.forceLang ?? explanationLang;
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        `Verse to explain:`,
        ``,
        buildContextBlock([verse]),
        ``,
        `Task: ${spec.instruction}`,
        `Write the explanation in ${LANG_NAME[lang]}.`,
        `Cite the verse as [${verse.ref.chapterNumber}.${verse.ref.verseNumber}].`,
      ].join("\n"),
    },
  ];
}

/** Messages for a tutor turn, grounded on retrieved verses, with trimmed prior history. */
export function buildTutorMessages(
  question: string,
  retrieved: RetrievedVerse[],
  history: LLMMessage[],
  answerLang: LanguageCode = "en",
): LLMMessage[] {
  const context = retrieved.length
    ? buildContextBlock(retrieved)
    : "(no verses were retrieved for this question)";
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    {
      role: "user",
      content: [
        `Relevant verses:`,
        ``,
        context,
        ``,
        `Question: ${question}`,
        `Answer in ${LANG_NAME[answerLang]}, citing the verses you use.`,
      ].join("\n"),
    },
  ];
}
