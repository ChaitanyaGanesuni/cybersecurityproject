import Constants from "expo-constants";
import { createAiClient, type AiClient } from "./client";

export * from "./client";

/**
 * Backend URL comes from app config (expo `extra.aiBackendUrl`). When unset, the app uses the
 * honest offline grounded client — no key ever ships in the app (spec §24).
 */
const backendUrl = (Constants.expoConfig?.extra as { aiBackendUrl?: string } | undefined)?.aiBackendUrl;

let client: AiClient | null = null;
export function getAiClient(): AiClient {
  if (!client) client = createAiClient(backendUrl);
  return client;
}
