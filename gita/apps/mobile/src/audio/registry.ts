import { ProviderRegistry } from "@gita/audio";
import { DeviceSpeechController, DeviceTtsProvider } from "./deviceTts";

/**
 * App audio wiring. Today only the device-native provider is registered (zero cost, offline).
 * Self-hosted open-model providers (Kokoro / Indic-TTS / Sanskrit recitation) register here in
 * Phase 10 — no screen code changes, since selection goes through the registry + router.
 */
export const deviceTts = new DeviceTtsProvider();
export const speech = new DeviceSpeechController();

export const audioRegistry = new ProviderRegistry().register(deviceTts);
