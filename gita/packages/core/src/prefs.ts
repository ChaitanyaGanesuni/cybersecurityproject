import type { LanguageCode } from "@gita/contracts";
import type { ColorScheme, TextScale } from "./theme.js";

/**
 * UI language and content language are INDEPENDENTLY configurable (spec §4).
 * e.g. uiLang="en", verseLang="sa", explanationLang="te".
 */
export interface LanguagePrefs {
  uiLang: Extract<LanguageCode, "en" | "te">; // UI chrome language (v1)
  verseLang: LanguageCode; // which translation to prefer for the verse
  explanationLang: LanguageCode; // language for meanings/explanations
}

export interface DisplayPrefs {
  colorScheme: ColorScheme | "system";
  textScale: TextScale;
  showTransliteration: boolean;
}

export const defaultLanguagePrefs: LanguagePrefs = {
  uiLang: "en",
  verseLang: "en",
  explanationLang: "en",
};

export const defaultDisplayPrefs: DisplayPrefs = {
  colorScheme: "system",
  textScale: 1,
  showTransliteration: true,
};
