import { useApp } from '../data/store';
import { addDays, dateRange, monthBounds, parseISODate, weekdayMon0 } from '../domain/dates';
import { dayStatus, emptyRawDay, evaluateDay } from '../domain/scoring';
import { reflection } from '../domain/analytics';
import { fmtDateLong, fmtDuration } from '../domain/format';
import { MEAL_LABELS, WORKOUT_TYPES } from '../domain/defaults';
import { GoalRow, goalLine, visibleKeys } from '../ui/goals';
import { useRoute } from '../ui/kit';

const MOODS: Record<string, string> = { great: '😀 Great', good: '🙂 Good', okay: '😐 Okay', tired: '😴 Tired', poor: '😞 Poor' };
const STATUS_LABEL = { excellent: '🟢 Excellent', partial: '🟡 Partial', missed: '🔴 Missed', protected: '🛡️ Protected', today: '⏳ In progress', future: '⚪ Future', before: '⚪ Before arc' };

export function Calendar() {
  const app = useApp();
  const route = useRoute();
  const anchor = route.query.get('m') ?? app.arc?.startDate ?? app.today;
  const { start, end } = monthBounds(anchor);
  const days = dateRange(start, end);
  const lead = weekdayMon0(start);
  const title = parseISODate(start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const arc = app.arc;
  const status = (d: string) => {
    if (arc && d < arc.startDate) return 'before';
    return dayStatus(app.evals.get(d), d, app.today, app.protectedDates);
  };
  const past = days.filter((d) => d < app.today && (!arc || d >= arc.startDate));
  const count = (k: string) => past.filter((d) => status(d) === k).length;

  return (
    <div className="fade-in">
      <div className="row between" style={{ marginTop: 4 }}>
        <a className="icon-btn" href={`#/calendar?m=${addDays(start, -1)}`} aria-label="Previous month">‹</a>
        <div className="center">
          <div className="eyebrow">{arc?.name ?? 'Calendar'}</div>
          <h1 style={{ fontSize: 24 }}>{title.toUpperCase()}</h1>
        </div>
        <a className="icon-btn" href={`#/calendar?m=${addDays(end, 1)}`} aria-label="Next month">›</a>
      </div>

      <div className="card section">
        <div className="cal">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="dow">{d}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={`x${i}`} />)}
          {days.map((d) => {
            const st = status(d);
            const clickable = d <= app.today;
            const content = (
              <>
                <span>{Number(d.slice(8))}</span>
                <i className="dot" />
              </>
            );
            return clickable ? (
              <a key={d} className={`cell ${st}`} href={`#/day/${d}`} aria-label={`${d}: ${STATUS_LABEL[st]}`}>{content}</a>
            ) : (
              <div key={d} className={`cell ${st}`} aria-label={`${d}: ${STATUS_LABEL[st]}`}>{content}</div>
            );
          })}
        </div>
        <div className="legend" style={{ marginTop: 14 }}>
          <span><i style={{ background: 'var(--good)' }} />Excellent</span>
          <span><i style={{ background: 'var(--warn)' }} />Partial</span>
          <span><i style={{ background: 'var(--bad)' }} />Missed</span>
          <span><i style={{ background: 'var(--sleep)' }} />Protected</span>
          <span><i style={{ background: 'var(--line)' }} />Future</span>
        </div>
      </div>

      {past.length > 0 && (
        <div className="grid3 section">
          <div className="stat"><div className="v">{count('excellent')}</div><div className="l">🟢 Excellent</div></div>
          <div className="stat"><div className="v">{count('partial')}</div><div className="l">🟡 Partial</div></div>
          <div className="stat"><div className="v">{count('missed') + count('protected')}</div><div className="l">🔴 Missed{count('protected') ? ` (${count('protected')} 🛡️)` : ''}</div></div>
        </div>
      )}
      <p className="tiny muted center">Excellent = the day counted toward your streak. Partial = score of at least 50%.</p>
    </div>
  );
}

export function DayDetail({ date }: { date: string }) {
  const app = useApp();
  const s = app.settings;
  const raw = app.raw.get(date) ?? emptyRawDay(date);
  const e = app.evals.get(date) ?? evaluateDay(raw, s, app.habits);
  const st = dayStatus(e, date, app.today, app.protectedDates);
  const ci = app.checkins.get(date);

  return (
    <div className="fade-in">
      <a className="small sub" href={`#/calendar?m=${date}`}>‹ Calendar</a>
      <h1 style={{ marginTop: 6 }}>{fmtDateLong(date)}</h1>
      <div className="row wrap small" style={{ gap: 8 }}>
        <span className="chip">{STATUS_LABEL[st]}</span>
        <span className="chip">Score {Math.round(e.score)}%</span>
        {app.protectedDates.has(date) && <span className="chip">🛡️ Streak protection used</span>}
      </div>

      <div className="card section">
        {visibleKeys(e, s).map((k) => <GoalRow key={k} line={goalLine(k, e, s)} />)}
      </div>

      {date < app.today && <div className="card small sub">📝 {reflection(e, s)}</div>}

      {ci && (
        <div className="card">
          <h2>Check-in</h2>
          {ci.mood && <div>{MOODS[ci.mood]}</div>}
          {ci.note && <p className="sub" style={{ marginBottom: 0 }}>“{ci.note}”</p>}
        </div>
      )}

      {raw.meals.length > 0 && (
        <div className="card">
          <h2>Meals</h2>
          {raw.meals.sort((a, b) => a.at - b.at).map((m) => (
            <div key={m.id} className="list-item small">
              <span>{MEAL_LABELS[m.mealType].emoji}</span>
              <div className="grow">{m.items.map((i) => i.name).join(', ')}</div>
              <span className="muted">{m.items.some((i) => i.calories != null) ? `${m.items.reduce((a, i) => a + (i.calories ?? 0), 0)} kcal` : ''}</span>
            </div>
          ))}
        </div>
      )}

      {raw.workouts.length > 0 && (
        <div className="card">
          <h2>Workouts</h2>
          {raw.workouts.map((w) => {
            const m = WORKOUT_TYPES.find((x) => x.id === w.type)!;
            return <div key={w.id} className="list-item small"><span>{m.emoji}</span><div className="grow">{m.label}</div><span>{w.durationMin} min{w.distanceKm ? ` · ${w.distanceKm} km` : ''}</span></div>;
          })}
        </div>
      )}

      {raw.sleep && (
        <div className="card small">
          😴 {fmtDuration(raw.sleep.minutes)} · {raw.sleep.bedtime} → {raw.sleep.wakeTime}
        </div>
      )}

      {date <= app.today && (
        <div className="grid2 section">
          <a className="btn" href={`#/today?date=${date}`}>✏️ Edit day</a>
          <a className="btn" href={`#/food?date=${date}`}>🍽️ Food</a>
        </div>
      )}
    </div>
  );
}
