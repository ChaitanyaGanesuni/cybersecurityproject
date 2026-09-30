// Android notifications: reminders are handed to the OS ahead of time with
// @capacitor/local-notifications, so they arrive on time even when the app is
// closed. The schedule is recomputed (domain/reminders.planSchedule) whenever
// the day's data changes.

import { LocalNotifications, type ActionPerformed } from '@capacitor/local-notifications';
import { db } from '../data/db';
import { addWater, uid } from '../data/repo';
import { toISODate } from '../domain/dates';
import type { PlannedNotification, Scheduled } from '../domain/reminders';
import type { NotificationChannel } from '../integrations/notify';

const CHANNEL = 'reminders';
const WATER_ACTIONS = 'WATER';

export const nativeChannel: NotificationChannel = {
  id: 'android',
  supported: () => true,
  permission: () => 'default', // real value is async; see nativePermission()
  async requestPermission() {
    const r = await LocalNotifications.requestPermissions();
    return r.display === 'granted';
  },
  async show(n) {
    await LocalNotifications.schedule({ notifications: [toNative(Math.floor(Math.random() * 1e9), n)] });
    return true;
  },
};

export async function nativePermission(): Promise<NotificationPermission> {
  const r = await LocalNotifications.checkPermissions();
  return r.display === 'granted' ? 'granted' : r.display === 'denied' ? 'denied' : 'default';
}

function toNative(id: number, n: PlannedNotification, at?: Date) {
  const water = n.type.startsWith('water');
  return {
    id,
    title: n.title,
    body: n.body,
    channelId: CHANNEL,
    smallIcon: 'ic_stat_arc',
    iconColor: '#FF7A1A',
    actionTypeId: water ? WATER_ACTIONS : undefined,
    group: water ? 'water' : undefined,
    extra: { type: n.type },
    schedule: at ? { at, allowWhileIdle: true } : undefined,
  };
}

let initialized = false;

/** One-time setup: channel, the +250/+500 ml buttons, and tap handling. */
export async function initNativeNotifications(navigate: (hash: string) => void, onWaterLogged: (ml: number) => void) {
  if (initialized) return;
  initialized = true;
  await LocalNotifications.createChannel({
    id: CHANNEL,
    name: 'Reminders',
    description: 'Water, steps, workout and check-in reminders',
    importance: 4,
    vibration: true,
  });
  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: WATER_ACTIONS,
        actions: [
          { id: 'water-add:250', title: '+250 ml' },
          { id: 'water-add:500', title: '+500 ml' },
        ],
      },
    ],
  });
  await LocalNotifications.addListener('localNotificationActionPerformed', (e: ActionPerformed) => {
    const m = /^water-add:(\d+)$/.exec(e.actionId);
    if (m) {
      const ml = Number(m[1]);
      void addWater(toISODate(new Date()), ml).then(() => onWaterLogged(ml));
      return;
    }
    const type = String(e.notification.extra?.type ?? '');
    navigate(type === 'night' ? '#/checkin' : type.startsWith('water') ? '#/today/water' : type.startsWith('habit') ? '#/today/habits' : '#/');
  });
}

let running = false;
let again = false;

/**
 * Replace every pending reminder with a fresh plan. Past scheduled entries in
 * the log count as delivered, so nothing fires twice after a re-plan.
 */
export async function reschedule(plan: () => Promise<Scheduled[]>) {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length) {
        await LocalNotifications.cancel({ notifications: pending.notifications.map((p) => ({ id: p.id })) });
      }
      const now = Date.now();
      const future = await db.notifications.filter((n) => n.status === 'scheduled' && n.scheduledAt > now).primaryKeys();
      await db.notifications.bulkDelete(future);
      const items = await plan();
      if (!items.length) continue;
      if ((await nativePermission()) !== 'granted') continue;
      const base = Math.floor(now / 1000) % 1_000_000_000; // ids only need to be unique among pending
      await LocalNotifications.schedule({ notifications: items.map((s, i) => toNative(base + i, s.n, s.at)) });
      await db.notifications.bulkPut(
        items.map((s) => ({
          id: uid(),
          updatedAt: now,
          date: s.date,
          type: s.n.type,
          scheduledAt: s.at.getTime(),
          sentAt: null,
          status: 'scheduled' as const,
          title: s.n.title,
          body: s.n.body,
        })),
      );
    } while (again);
  } finally {
    running = false;
  }
}
