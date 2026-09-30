import type { LanguageCode } from "@gita/contracts";

/**
 * Language-aware sentence segmentation for long-form audio (spec §11). Handles Latin
 * punctuation and the Devanagari danda (। and ॥) used in Sanskrit/Hindi.
 */

/** Collapse whitespace; keep meaningful punctuation. */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const DANDA = /[।॥]/; // Devanagari single/double danda

export function segmentSentences(text: string, lang: LanguageCode): string[] {
  const norm = normalizeText(text);
  if (!norm) return [];

  if (lang === "sa" || lang === "hi") {
    // Split on a run of dandas (। or ॥, incl. the doubled ।।), dropping the marker itself.
    return norm
      .split(/[।॥]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Latin-script languages: split after . ! ? followed by space, avoiding common abbreviations.
  const parts: string[] = [];
  let buf = "";
  const tokens = norm.split(/(\s+)/);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    buf += tok;
    if (/[.!?]["')\]]?$/.test(tok.trim()) && !isAbbrev(tok.trim())) {
      parts.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.filter(Boolean);
}

const ABBREV = new Set(["e.g.", "i.e.", "mr.", "mrs.", "dr.", "vs.", "st.", "no.", "fig."]);
function isAbbrev(token: string): boolean {
  return ABBREV.has(token.toLowerCase());
}

export { DANDA };
