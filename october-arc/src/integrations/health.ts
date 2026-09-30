// Health-platform integration layer.
//
// Reality check (why this is an interface, not a fake integration):
//  - Browsers cannot read Apple Health or Android Health Connect. Both are
//    on-device APIs that need a native app with platform permissions.
//  - Apple HealthKit: requires an iOS app with the HealthKit entitlement and
//    NSHealthShareUsageDescription in Info.plist.
//  - Android Health Connect: requires an Android app declaring
//    android.permission.health.READ_STEPS plus a privacy-policy activity, and
//    Google Play's health-permissions declaration.
//  - Google Fit: the web build can import steps through the Fitness REST API
//    (see googleFit.ts) when a Google OAuth client ID is configured. Google
//    closed new sign-ups in May 2024 and plans to end the API in 2026, so
//    Health Connect is the long-term path on Android.
//
// The plan: ship this PWA inside a native shell (e.g. Capacitor). The shell
// exposes a tiny bridge at `window.OctoberArcHealth` implementing
// `NativeHealthBridge` using HealthKit / Health Connect. When the bridge is
// absent (plain web), providers report "unavailable" and the user enters steps
// manually. No data is ever fabricated.

import { googleFitProvider } from './googleFit';

export type HealthStatus = 'available' | 'unavailable' | 'denied';

export interface HealthProvider {
  id: string;
  name: string;
  /** What the user needs to know when it's not available. */
  requirement: string;
  status(): Promise<HealthStatus>;
  requestAccess(): Promise<boolean>;
  /** Total steps for a local calendar date, or null if unknown. */
  readSteps(date: string): Promise<number | null>;
}

/** Contract the native shell must implement. */
export interface NativeHealthBridge {
  platform: 'healthkit' | 'health-connect';
  isAvailable(): Promise<boolean>;
  requestAuthorization(scopes: ('steps' | 'sleep' | 'workouts')[]): Promise<boolean>;
  /** Sum of steps between two ISO timestamps. */
  getSteps(startISO: string, endISO: string): Promise<number>;
}

declare global {
  interface Window {
    OctoberArcHealth?: NativeHealthBridge;
  }
}

function bridgeProvider(platform: NativeHealthBridge['platform'], name: string, requirement: string): HealthProvider {
  const bridge = () => (window.OctoberArcHealth?.platform === platform ? window.OctoberArcHealth : undefined);
  return {
    id: platform,
    name,
    requirement,
    async status() {
      const b = bridge();
      return b && (await b.isAvailable()) ? 'available' : 'unavailable';
    },
    async requestAccess() {
      const b = bridge();
      return b ? b.requestAuthorization(['steps']) : false;
    },
    async readSteps(date) {
      const b = bridge();
      if (!b) return null;
      const [y, m, d] = date.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      const end = new Date(y, m - 1, d + 1);
      return b.getSteps(start.toISOString(), end.toISOString());
    },
  };
}

export const HEALTH_PROVIDERS: HealthProvider[] = [
  bridgeProvider(
    'health-connect',
    'Android Health Connect',
    'Needs the October Arc Android app (native shell) with Health Connect step-read permission. Not available in a browser.',
  ),
  bridgeProvider(
    'healthkit',
    'Apple Health',
    'Needs the October Arc iOS app (native shell) with the HealthKit entitlement. Not available in a browser.',
  ),
  googleFitProvider,
];

export async function availableHealthProvider(): Promise<HealthProvider | null> {
  for (const p of HEALTH_PROVIDERS) if ((await p.status()) === 'available') return p;
  return null;
}
