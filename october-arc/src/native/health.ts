// Android Health Connect, via the app's own Capacitor plugin
// (android/app/src/main/java/app/octoberarc/HealthConnectPlugin.kt).

import { registerPlugin } from '@capacitor/core';
import { db } from '../data/db';
import { setSleep, setSteps } from '../data/repo';
import { addDays, toISODate } from '../domain/dates';
import { localMidnight, pickNight } from '../domain/sleep';

interface HealthConnectPlugin {
  isAvailable(): Promise<{ available: boolean; status: 'available' | 'update_required' | 'unavailable' }>;
  hasPermissions(): Promise<{ steps: boolean; sleep: boolean }>;
  requestAuthorization(o: { scopes: string[] }): Promise<{ granted: boolean }>;
  getSteps(o: { start: string; end: string }): Promise<{ steps: number | null }>;
  getSleepSessions(o: { start: string; end: string }): Promise<{ sessions: { start: string; end: string }[] }>;
  openHealthConnect(): Promise<void>;
}

export const HealthConnect = registerPlugin<HealthConnectPlugin>('HealthConnect');

/** Expose Health Connect through the generic bridge used by integrations/health.ts. */
export function installHealthBridge() {
  window.OctoberArcHealth = {
    platform: 'health-connect',
    isAvailable: async () => (await HealthConnect.isAvailable()).available,
    requestAuthorization: async (scopes) => (await HealthConnect.requestAuthorization({ scopes })).granted,
    getSteps: async (start, end) => (await HealthConnect.getSteps({ start, end })).steps,
  };
}

let importing = false;

/**
 * Pull today's steps and last night's sleep from Health Connect, if the user
 * granted access. Never overwrites a larger manual step count or a manually
 * logged night.
 */
export async function autoImportHealth(): Promise<void> {
  if (importing) return;
  importing = true;
  try {
    if (!(await HealthConnect.isAvailable()).available) return;
    const perms = await HealthConnect.hasPermissions();
    const today = toISODate(new Date());
    if (perms.steps) {
      const { steps } = await HealthConnect.getSteps({
        start: localMidnight(today).toISOString(),
        end: localMidnight(today, 1).toISOString(),
      });
      const cur = await db.steps.get(today);
      const replace = !cur || (cur.source !== 'manual' ? cur.steps !== steps : (steps ?? 0) > cur.steps);
      if (steps != null && replace) await setSteps(today, steps, 'health-connect');
    }
    if (perms.sleep && !(await db.sleep.get(today))) {
      const { sessions } = await HealthConnect.getSleepSessions({
        start: new Date(localMidnight(addDays(today, -1)).getTime() + 12 * 3600_000).toISOString(),
        end: new Date(localMidnight(today).getTime() + 14 * 3600_000).toISOString(),
      });
      const night = pickNight(today, sessions);
      if (night) await setSleep(today, night.bedtime, night.wakeTime);
    }
  } catch (e) {
    console.warn('[health-connect] import failed', e);
  } finally {
    importing = false;
  }
}
