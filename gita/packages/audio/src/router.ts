import type { LanguageCode } from "@gita/contracts";
import type { AudioKind, AudioProvider } from "./provider.js";

/**
 * Provider registry + selection (spec §10, §25). Chooses the best provider for a request by
 * capability, then by the cost hierarchy: device-native → local open model → cloud/paid.
 * Adding a provider is registering it here — no caller changes.
 */
export interface RouteRequest {
  lang: LanguageCode;
  kind: AudioKind;
  /** Caller needs cacheable/seekable/downloadable audio (long-form, offline). */
  needsData?: boolean;
}

/** Lower = preferred (cheaper). Device is cheapest, then local, then remote. */
function costTier(p: AudioProvider): number {
  const c = p.getCapabilities();
  if (c.local && !c.producesData) return 0; // device-native direct speak
  if (c.local && c.free) return 1; // on-device open model
  if (c.free) return 2; // self-hosted free/open (server)
  return 3; // paid cloud
}

export class ProviderRegistry {
  private readonly providers: AudioProvider[] = [];

  register(provider: AudioProvider): this {
    this.providers.push(provider);
    return this;
  }

  all(): readonly AudioProvider[] {
    return this.providers;
  }

  /** Providers that can satisfy a request, cheapest first. */
  candidates(req: RouteRequest): AudioProvider[] {
    return this.providers
      .filter((p) => {
        const c = p.getCapabilities();
        if (!c.languages.includes(req.lang)) return false;
        if (req.kind === "recitation" && req.lang === "sa" && !c.supportsSanskrit) return false;
        if (req.needsData && !c.producesData) return false;
        return true;
      })
      .sort((a, b) => costTier(a) - costTier(b));
  }

  /** The single best provider for a request, or null if none qualifies. */
  select(req: RouteRequest): AudioProvider | null {
    return this.candidates(req)[0] ?? null;
  }
}
