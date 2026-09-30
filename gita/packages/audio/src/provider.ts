import type { LanguageCode } from "@gita/contracts";

/**
 * The audio engine is provider-agnostic (spec §10, §26). Concrete TTS engines — device-native,
 * self-hosted open models (Piper/Kokoro/Indic-TTS), cloud — are adapters implementing
 * `AudioProvider`. Nothing outside the adapters knows which engine is in use.
 *
 * Two provider shapes exist in reality and the model reflects that honestly:
 *  - DATA-producing providers return audio bytes that can be cached, seeked and downloaded.
 *  - DIRECT-SPEAK providers (device native TTS) stream straight to the speaker — no bytes to
 *    cache or seek. Their capability flag `producesData` is false and the caching pipeline skips
 *    them; the app drives them through a simple speak/stop controller instead.
 */

/** Sanskrit recitation is treated separately from ordinary narration (spec §13). */
export type AudioKind = "narration" | "recitation";

export interface Voice {
  id: string;
  name: string;
  lang: LanguageCode;
  /** True if this voice is intended/suitable for Sanskrit recitation. */
  sanskrit?: boolean;
}

export interface AudioCapabilities {
  /** Returns cacheable audio bytes (true) vs. speaks directly to the device (false). */
  producesData: boolean;
  streaming: boolean;
  /** Runs on-device with no server. */
  local: boolean;
  /** Free / open-source (no per-call cost). */
  free: boolean;
  /** Max characters per synthesis request (drives chunk sizing). */
  maxChars: number;
  languages: LanguageCode[];
  /** Provider can render Sanskrit acceptably. */
  supportsSanskrit: boolean;
}

export interface SynthesisRequest {
  text: string;
  lang: LanguageCode;
  voiceId: string;
  /** Playback speed baked into synthesis (some engines), else applied at playback. */
  speed: number;
  kind: AudioKind;
}

export interface SynthesizedAudio {
  /** Opaque handle to the produced audio (file uri / base64 / blob key) — adapter-defined. */
  uri: string;
  mimeType: string;
  durationSeconds: number | null;
  bytes: number | null;
}

export interface AudioProvider {
  readonly id: string;
  getCapabilities(): AudioCapabilities;
  getSupportedLanguages(): LanguageCode[];
  getAvailableVoices(lang?: LanguageCode): Voice[];
  /**
   * Produce audio data for the request. Providers whose capabilities report producesData=false
   * throw `UnsupportedSynthesisError` — callers must check capabilities first.
   */
  synthesize(req: SynthesisRequest): Promise<SynthesizedAudio>;
}

export class UnsupportedSynthesisError extends Error {
  constructor(providerId: string) {
    super(`Provider "${providerId}" does not produce cacheable audio data (direct-speak only).`);
    this.name = "UnsupportedSynthesisError";
  }
}
