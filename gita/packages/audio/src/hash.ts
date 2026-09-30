/**
 * Deterministic, cross-platform audio cache key (spec §14):
 *   audioHash = hash(text + voice + provider + language + speed)
 * Identical inputs => identical key => the same audio is never generated twice.
 *
 * Uses FNV-1a (two seeds) to produce a 64-bit-ish hex key. No node:crypto dependency, so it
 * runs identically in Node tests and in React Native.
 */

function fnv1a(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts to stay in 32-bit range.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const toHex8 = (n: number): string => n.toString(16).padStart(8, "0");

export interface AudioHashInput {
  text: string;
  voiceId: string;
  providerId: string;
  lang: string;
  speed: number;
}

export function audioHash(input: AudioHashInput): string {
  // Use a delimiter that cannot appear in the fields to avoid boundary collisions.
  const material = [
    input.providerId,
    input.lang,
    input.voiceId,
    String(input.speed),
    input.text,
  ].join("\u0000");
  return toHex8(fnv1a(material, 0x811c9dc5)) + toHex8(fnv1a(material, 0x9e3779b1));
}
