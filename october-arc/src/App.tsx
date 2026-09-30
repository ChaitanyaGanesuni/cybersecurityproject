import { useEffect, useRef } from 'react';
import { AppProvider, useApp } from './data/store';
import { db } from './data/db';
import { startSyncLoop } from './data/sync';
import { deliver } from './integrations/notify';
import { dueNotifications } from './domain/reminders';
import { SCORE_KEYS, type ScoreKey } from './domain/types';
import { Overlays, celebrate, useRoute } from './ui/kit';
import { Home } from './pages/Home';
import { Today } from './pages/Today';
import { Food } from './pages/Food';
import { Calendar, DayDetail } from './pages/Calendar';
import { Progress } from './pages/Progress';
import { Body } from './pages/Body';
import { CheckIn } from './pages/CheckIn';
import { Assistant } from './pages/Assistant';
import { SettingsPage } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';
import { Complete, NewArc } from './pages/Complete';

const TABS = [
  { href: '#/', id: '', icon: '🔥', label: 'Home' },
  { href: '#/today', id: 'today', icon: '✅', label: 'Today' },
  { href: '#/food', id: 'food', icon: '🍽️', label: 'Food' },
  { href: '#/calendar', id: 'calendar', icon: '🗓️', label: 'Calendar' },
  { href: '#/progress', id: 'progress', icon: '📈', label: 'Progress' },
];

const CELEBRATIONS: Record<ScoreKey, [string, string]> = {
  water: ['🎉', 'Daily hydration goal completed!'],
  steps: ['🚶', 'Step goal reached!'],
  sleep: ['😴', 'Sleep target met!'],
  exercise: ['🏃', 'Workout completed!'],
  diet: ['🥗', 'Diet goals met!'],
  habits: ['✅', 'All habits done!'],
};

/** Celebrate the moment a goal (or the whole day) flips to complete. */
function useCelebrations() {
  const { todayEval, today } = useApp();
  const prev = useRef<{ date: string; complete: Record<string, boolean>; success: boolean } | null>(null);
  useEffect(() => {
    const p = prev.current;
    if (p && p.date === today) {
      if (todayEval.success && !p.success) celebrate('🔥', 'Day Complete!');
      else {
        const k = SCORE_KEYS.find((k) => todayEval.scored.includes(k) && todayEval.complete[k] && !p.complete[k]);
        if (k) celebrate(...CELEBRATIONS[k]);
      }
    }
    prev.current = { date: today, complete: { ...todayEval.complete }, success: todayEval.success };
  }, [todayEval, today]);
}

/** Checks for due reminders whenever the clock ticks (every ~30s while open). */
function useReminders() {
  const app = useApp();
  const { settings, clock, todayEval, nudges, activeHabits, streaks, today, now } = app;
  useEffect(() => {
    if (!settings.reminders.enabled) return;
    let cancelled = false;
    void (async () => {
      const sentToday = await db.notifications.where('date').equals(today).toArray();
      const due = dueNotifications({ settings, clock, today: todayEval, nudges, habits: activeHabits, sentToday, streak: streaks.overall.current });
      if (!cancelled && due.length) await deliver(today, due);
    })();
    return () => {
      cancelled = true;
    };
    // `now` drives re-evaluation each tick.
  }, [now, settings, clock, todayEval, nudges, activeHabits, streaks.overall.current, today]);
}

function Shell() {
  const app = useApp();
  const route = useRoute();
  useCelebrations();
  useReminders();
  const top = route.path[0] ?? '';

  if (!app.settings.onboarded) {
    return (
      <div className="app">
        <Onboarding />
        <Overlays />
      </div>
    );
  }

  let page;
  switch (top) {
    case '': page = app.arcEnded ? <Complete /> : <Home />; break;
    case 'today': page = <Today />; break;
    case 'food': page = <Food />; break;
    case 'calendar': page = <Calendar />; break;
    case 'day': page = <DayDetail date={route.path[1]} />; break;
    case 'progress': page = <Progress />; break;
    case 'body': page = <Body />; break;
    case 'checkin': page = <CheckIn />; break;
    case 'assistant': page = <Assistant />; break;
    case 'settings': page = <SettingsPage />; break;
    case 'new-arc': page = <NewArc />; break;
    case 'complete': page = app.arc ? <Complete /> : <Home />; break;
    default: page = <Home />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand">{app.settings.name ? <>HI, <b>{app.settings.name.toUpperCase()}</b></> : <><b>ARC</b> TRACKER</>}</a>
        <div className="top-actions">
          <a className="icon-btn" href="#/assistant" aria-label="Assistant">✨</a>
          <a className="icon-btn" href="#/settings" aria-label="Settings">⚙️</a>
        </div>
      </header>
      <main key={top}>{page}</main>
      <div className="tabbar">
        <nav>
          {TABS.map((t) => (
            <a key={t.id} href={t.href} className={`tab${top === t.id ? ' active' : ''}`} aria-current={top === t.id ? 'page' : undefined}>
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </a>
          ))}
        </nav>
      </div>
      <Overlays />
    </div>
  );
}

export function App() {
  useEffect(() => startSyncLoop(), []);
  return (
    <AppProvider fallback={<div className="app center" style={{ paddingTop: 80 }}><div style={{ fontSize: 40 }}>🔥</div></div>}>
      <Shell />
    </AppProvider>
  );
}
