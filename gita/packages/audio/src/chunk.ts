/**
 * Group sentences into chunks no larger than `maxChars`, breaking on sentence boundaries.
 * A single sentence longer than maxChars is hard-split on word boundaries (last resort).
 */
export function chunkSentences(sentences: string[], maxChars: number): string[] {
  if (maxChars <= 0) throw new Error("maxChars must be positive");
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      flush();
      chunks.push(...hardSplit(sentence, maxChars));
      continue;
    }
    if (current.length === 0) {
      current = sentence;
    } else if (current.length + 1 + sentence.length <= maxChars) {
      current += " " + sentence;
    } else {
      flush();
      current = sentence;
    }
  }
  flush();
  return chunks;
}

/** Split an over-long sentence on word boundaries, never exceeding maxChars. */
function hardSplit(sentence: string, maxChars: number): string[] {
  const words = sentence.split(/\s+/);
  const out: string[] = [];
  let buf = "";
  for (const w of words) {
    if (w.length > maxChars) {
      // A single token longer than maxChars: split by character as an absolute fallback.
      if (buf) {
        out.push(buf);
        buf = "";
      }
      for (let i = 0; i < w.length; i += maxChars) out.push(w.slice(i, i + maxChars));
      continue;
    }
    if (buf.length === 0) buf = w;
    else if (buf.length + 1 + w.length <= maxChars) buf += " " + w;
    else {
      out.push(buf);
      buf = w;
    }
  }
  if (buf) out.push(buf);
  return out;
}
