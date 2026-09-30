import * as Speech from "expo-speech";
import type { LanguageCode } from "@gita/contracts";
import {
  UnsupportedSynthesisError,
  type AudioCapabilities,
  type AudioProvider,
  type Voice,
} from "@gita/audio";

const LANG_TAG: Record<LanguageCode, string> = { sa: "hi-IN", en: "en-US", te: "te-IN", hi: "hi-IN" };

/**
 * Device-native TTS via expo-speech (Android TextToSpeech / iOS AVSpeechSynthesizer).
 * DIRECT-SPEAK: it streams to the speaker and returns no bytes, so producesData=false and the
 * caching pipeline skips it. It is the cheapest tier for English/Telugu narration (spec §25).
 * It is intentionally NOT offered for Sanskrit recitation (spec §8/§13) — a dedicated Sanskrit
 * provider handles that, so we never mispronounce Devanagari through an English voice.
 */
export class DeviceTtsProvider implements AudioProvider {
  readonly id = "device-tts";
  private voices: Voice[] = [];

  getCapabilities(): AudioCapabilities {
    return {
      producesData: false,
      streaming: true,
      local: true,
      free: true,
      maxChars: 3900, // Android TextToSpeech per-utterance limit is ~4000
      languages: ["en", "te"],
      supportsSanskrit: false,
    };
  }

  getSupportedLanguages(): LanguageCode[] {
    return ["en", "te"];
  }

  getAvailableVoices(lang?: LanguageCode): Voice[] {
    return lang ? this.voices.filter((v) => v.lang === lang) : this.voices;
  }

  /** Populate the voice list from the OS (call once at startup). */
  async loadVoices(): Promise<void> {
    try {
      const raw = await Speech.getAvailableVoicesAsync();
      this.voices = raw
        .map((v): Voice | null => {
          const code = v.language?.toLowerCase() ?? "";
          const lang: LanguageCode | null = code.startsWith("en")
            ? "en"
            : code.startsWith("te")
              ? "te"
              : null;
          return lang ? { id: v.identifier, name: v.name ?? v.identifier, lang } : null;
        })
        .filter((v): v is Voice => v !== null);
    } catch {
      this.voices = [];
    }
  }

  synthesize(): Promise<never> {
    // Direct-speak provider: use DeviceSpeechController.speak instead.
    return Promise.reject(new UnsupportedSynthesisError(this.id));
  }
}

/** Imperative controller for direct device speech (play/stop + speed). */
export class DeviceSpeechController {
  speak(
    text: string,
    opts: { lang: LanguageCode; rate?: number; voiceId?: string; onDone?: () => void },
  ): void {
    Speech.stop();
    Speech.speak(text, {
      language: LANG_TAG[opts.lang],
      rate: opts.rate ?? 1,
      voice: opts.voiceId,
      onDone: opts.onDone,
    });
  }
  stop(): void {
    Speech.stop();
  }
  async isSpeaking(): Promise<boolean> {
    try {
      return await Speech.isSpeakingAsync();
    } catch {
      return false;
    }
  }
}
