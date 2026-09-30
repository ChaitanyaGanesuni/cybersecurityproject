import { useState } from 'react';
import { useApp } from '../data/store';
import { applyProtection } from '../data/repo';
import { daysBetween } from '../domain/dates';
import { fmtDateShort } from '../domain/format';
import { nextAction, sortNudges } from '../domain/nudges';
import { insights } from '../domain/analytics';
import { CATEGORY_META } from '../domain/defaults';
import { Bar, Ring, toast } from '../ui/kit';
import { GoalRow, goalLine, visibleKeys } from '../ui/goals';

export function Home() {
  const app = useApp();
  const { settings: s, arc, todayEval: e, streaks, risk, nudges, today } = app;
  const [dismissedProtect, setDismissed] = useState(() => sessionStorage.getItem('oa.noProtect') === app.protectable);

  if (!arc) {
    return (
      <div className="card hero center fade-in" style={{ marginTop: 20 }}>
        <div style={{ fontSize: 48 }}>🌱</div>
        <h1>No active arc</h1>
        <p className="sub">Start a new 30/31-day arc to track your consistency.</p>
        <a className="btn primary block" href="#/new-arc">Start an arc</a>
      </div>
    );
  }

  const keys = visibleKeys(e, s);
  const done = keys.filter((k) => e.complete[k]).length;
  const next = nextAction(nudges);
  const open = sortNudges(nudges.filter((n) => n.level !== 'done')).slice(0, 3);
  const arcPct = app.arcNotStarted ? 0 : Math.min(1, app.dayIndex / app.arcDays);
  const tips = insights(app.pastArcEvals.slice(-14), s).slice(0, 3);
  const o = streaks.overall;
  const evening = app.clock.dayFraction > 0.75;

  return (
    <div className="fade-in">
      <div className="row between" style={{ marginTop: 4 }}>
        <div>
          <div className="eyebrow">{arc.name}</div>
          <h1>
            {app.arcNotStarted
              ? `Starts in ${daysBetween(today, arc.startDate)} day${daysBetween(today, arc.startDate) > 1 ? 's' : ''}`
              : `Day ${Math.min(app.dayIndex, app.arcDays)} / ${app.arcDays}`}
          </h1>
        </div>
        <div className="streak-pill" title="Current overall streak">{o.current > 0 ? `🔥 ${o.current} DAY STREAK` : '🌱 NEW STREAK'}</div>
      </div>
      {app.arcNotStarted && <p className="small sub">Practice days before the start are tracked but don't count toward the arc.</p>}

      <div className="card hero section">
        <div className="row" style={{ gap: 18 }}>
          <Ring value={e.score / 100} size={132} stroke={12} color={e.success ? 'var(--good)' : 'var(--accent)'}>
            <div>
              <div className="big-num" style={{ fontSize: 32 }}>{Math.round(e.score)}%</div>
              <div className="tiny muted">today</div>
            </div>
          </Ring>
          <div className="grow">
            <div className="eyebrow">Today — {fmtDateShort(today)}</div>
            <div style={{ fontSize: 20, fontWeight: 800, margin: '4px 0' }}>{e.success ? 'Day complete 🔥' : `${Math.round(e.score)}% complete`}</div>
            <div className="small sub">{done} of {keys.length} goals done · {keys.length - done} remaining</div>
            <div className="small sub" style={{ marginTop: 6 }}>🏆 Longest {o.longest} · {o.current === 0 && o.previous > 0 ? `Previous 🔥 ${o.previous}` : `Min. day score ${s.minDayScore}%`}</div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <div className="row between small"><span className="sub">{arc.name} progress</span><b>{Math.round(arcPct * 100)}%</b></div>
          <div style={{ marginTop: 6 }}><Bar value={arcPct} thick /></div>
        </div>
      </div>

      {app.protectable && !dismissedProtect && (
        <div className="card risk">
          <b>🛡️ Yesterday didn't count toward your streak</b>
          <p className="small sub" style={{ margin: '6px 0 10px' }}>
            You can use a Streak Protection to keep your streak going. {app.protectionsLeft} / {arc.protectionsTotal} available — use only when necessary.
          </p>
          <div className="row">
            <button
              className="btn primary sm"
              onClick={async () => {
                await applyProtection(app.protectable!, arc);
                toast('🛡️ Streak protected. Onward!');
              }}
            >
              Use Streak Protection
            </button>
            <button
              className="btn ghost sm"
              onClick={() => {
                sessionStorage.setItem('oa.noProtect', app.protectable!);
                setDismissed(true);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <div className={`card ${risk.atRisk ? 'risk' : e.success ? 'ok' : ''}`}>
        <b style={{ fontSize: 17 }}>{risk.headline}</b>
        <p className="sub" style={{ margin: '6px 0 0' }}>{risk.detail}</p>
        {next && !e.success && (
          <a className="btn primary block" style={{ marginTop: 12 }} href={next.action!.href}>
            {next.emoji} {next.action!.label}
          </a>
        )}
      </div>

      <div className="card">
        {keys.map((k) => (
          <GoalRow key={k} line={goalLine(k, e, s)} href={CATEGORY_META[k].route} />
        ))}
      </div>

      {open.length > 0 && (
        <div className="section">
          <h2>What to do next</h2>
          {open.map((n, i) => (
            <div key={i} className="card tight">
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ fontSize: 22 }}>{n.emoji}</div>
                <div className="grow">
                  <b>{n.title}</b>
                  <div className="small sub">{n.body}</div>
                </div>
                {n.action && <a className="btn sm" href={n.action.href}>{n.action.label}</a>}
              </div>
            </div>
          ))}
        </div>
      )}

      {(evening || app.checkins.has(today)) && (
        <a className="card row section" href="#/checkin">
          <div style={{ fontSize: 26 }}>🌙</div>
          <div className="grow">
            <b>{app.checkins.has(today) ? "Today's check-in saved" : 'Daily check-in'}</b>
            <div className="small sub">{app.checkins.has(today) ? 'Tap to review or edit.' : 'How was today? Takes 20 seconds.'}</div>
          </div>
          <span>›</span>
        </a>
      )}

      {tips.length > 0 && (
        <div className="section">
          <h2>Insights</h2>
          <div className="card">
            {tips.map((t, i) => (
              <p key={i} className="small" style={{ margin: i ? '8px 0 0' : 0 }}>💡 {t}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
