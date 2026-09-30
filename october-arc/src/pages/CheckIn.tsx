import { useState } from 'react';
import { useApp } from '../data/store';
import { saveCheckIn } from '../data/repo';
import { reflection } from '../domain/analytics';
import type { Mood } from '../domain/types';
import { celebrate, go, toast } from '../ui/kit';
import { goalLine, visibleKeys } from '../ui/goals';

const MOODS: { id: Mood; e: string; l: string }[] = [
  { id: 'great', e: '😀', l: 'Great' },
  { id: 'good', e: '🙂', l: 'Good' },
  { id: 'okay', e: '😐', l: 'Okay' },
  { id: 'tired', e: '😴', l: 'Tired' },
  { id: 'poor', e: '😞', l: 'Poor' },
];

export function CheckIn() {
  const app = useApp();
  const { todayEval: e, settings: s, today } = app;
  const existing = app.checkins.get(today);
  const [mood, setMood] = useState<Mood | null>(existing?.mood ?? null);
  const [note, setNote] = useState(existing?.note ?? '');
  const o = app.streaks.overall;
  const refl = reflection(e, s);

  return (
    <div className="fade-in">
      <div className="eyebrow" style={{ marginTop: 4 }}>{app.arc?.name ?? 'October Arc'} check-in</div>
      <h1>How was today?</h1>

      <div className="card section">
        {visibleKeys(e, s).map((k) => {
          const l = goalLine(k, e, s);
          return (
            <div key={k} className="row between" style={{ padding: '6px 0' }}>
              <span>{l.emoji} {l.label}</span>
              <span style={{ color: l.done ? 'var(--good)' : 'var(--muted)', fontWeight: 700 }}>{l.done ? '✓' : '○'}</span>
            </div>
          );
        })}
        <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '10px 0' }} />
        <div className="row between"><b>Overall score</b><b>{Math.round(e.score)}%</b></div>
        <p className="sub" style={{ marginBottom: 0 }}>
          {e.success
            ? `🔥 Streak continues! ${o.current} day${o.current === 1 ? '' : 's'}.`
            : o.current > 0
              ? `🔥 Your ${o.current}-day streak is still alive until midnight — ${app.risk.detail.charAt(0).toLowerCase()}${app.risk.detail.slice(1)}`
              : 'Every day is a fresh start. Tomorrow can be day one of a new streak.'}
        </p>
      </div>

      <div className="card small sub">📝 {refl}</div>

      <div className="section">
        <h2>How did you feel today?</h2>
        <div className="grid3" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {MOODS.map((m) => (
            <button key={m.id} className={`mood${mood === m.id ? ' on' : ''}`} onClick={() => setMood(m.id)} aria-pressed={mood === m.id}>
              {m.e}<span>{m.l}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <textarea placeholder="Anything you want to remember about today?" value={note} onChange={(ev) => setNote(ev.target.value)} />
      </div>

      <button
        className="btn primary block section"
        onClick={async () => {
          await saveCheckIn(today, mood, note.trim(), Math.round(e.score), refl);
          if (e.success) celebrate('🔥', 'Day Complete!');
          else toast('Check-in saved. Rest well 🌙');
          go('#/');
        }}
      >
        Save check-in
      </button>
    </div>
  );
}
