// Notification delivery for the web build.
//
// What's possible on the web:
//  - While the app (or its service worker) is alive we can show system
//    notifications via ServiceWorkerRegistration.showNotification.
//  - Truly scheduled background notifications need either Web Push (a server
//    with VAPID keys sending pushes at the planned times) or a native shell
//    with local notifications. Both plug in behind `NotificationChannel`.
// The in-app nudges on the Home screen always work regardless.

import { db } from '../data/db';
import { uid } from '../data/repo';
import type { PlannedNotification } from '../domain/reminders';

export interface NotificationChannel {
  id: string;
  supported(): boolean;
  permission(): NotificationPermission | 'unsupported';
  requestPermission(): Promise<boolean>;
  show(n: PlannedNotification): Promise<boolean>;
}

export const webChannel: NotificationChannel = {
  id: 'web',
  supported: () => typeof window !== 'undefined' && 'Notification' in window,
  permission: () => ('Notification' in window ? Notification.permission : 'unsupported'),
  async requestPermission() {
    if (!('Notification' in window)) return false;
    return (await Notification.requestPermission()) === 'granted';
  },
  async show(n) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts: NotificationOptions = { body: n.body, tag: n.type, icon: '/icon.svg', badge: '/icon.svg' };
    if (reg) await reg.showNotification(n.title, opts);
    else new Notification(n.title, opts);
    return true;
  },
};

/** Deliver and record, so each slot fires at most once a day. */
export async function deliver(date: string, planned: PlannedNotification[], channel: NotificationChannel = webChannel) {
  for (const n of planned) {
    let ok = false;
    try {
      ok = await channel.show(n);
    } catch {
      ok = false;
    }
    await db.notifications.put({
      id: uid(),
      updatedAt: Date.now(),
      date,
      type: n.type,
      scheduledAt: Date.now(),
      sentAt: ok ? Date.now() : null,
      status: ok ? 'sent' : 'failed',
      title: n.title,
      body: n.body,
    });
  }
}
