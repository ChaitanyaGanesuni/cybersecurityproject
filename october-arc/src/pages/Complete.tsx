import { useApp } from '../data/store';
import { arcDatesFor, completeArc, startArc } from '../data/repo';
import { arcSummary } from '../domain/analytics';
import { monthName } from '../domain/dates';
import { fmtDuration, fmtInt, fmtLiters } from '../domain/format';
import { computeStreak } from '../domain/streaks';
import { ArcPicker } from './Onboarding';
import { Ring, celebrate, go } from '../ui/kit';

export function Complete() {
  const app = useApp();
  const arc = app.arc!;
  const evals = app.arcDates.map((d) => app.evals.get(d)!);
  // Longest streak within this arc only (a sentinel end date makes every arc day a finished day).
  const longest = computeStreak([...app.arcDates, '9999-12-31'], (d) => !!app.evals.get(d)?.success || app.protectedDates.has(d)).longest;
  const used = arc.protectionsTotal - app.protectionsLeft;
  const sum = arcSummary(arc.name, evals, app.settings, app.habits, longest, used);
  const nextName = `${monthName(arcDatesFor('nextMonth', arc.endDate).start)} Arc`;

  return (
    <div className="fade-in">
      <div className="center section">
        <div style={{ fontSize: 60 }}>🎉</div>
        <div className="eyebrow">{arc.name.toUpperCase()} COMPLETE</div>
        <h1>You showed up.</h1>
      </div>

      <div className="card hero center section">
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <Ring value={sum.score / 100} size={150}>
            <div><div className="big-num">{Math.round(sum.score)}%</div><div className="tiny muted">Arc Score</div></div>
          </Ring>
        </div>
      </div>

      <div className="grid2 section">
        <Stat v={`${sum.daysCompleted} / ${sum.days}`} l="Days completed" />
        <Stat v={`🔥 ${sum.longestStreak}`} l="Longest streak" />
        <Stat v={fmtInt(sum.stats.totalSteps)} l="Total steps" />
        <Stat v={fmtInt(sum.stats.avgSteps)} l="Average steps" />
        <Stat v={fmtLiters(sum.stats.totalWaterMl)} l="Total water" />
        <Stat v={fmtLiters(sum.stats.avgWaterMl)} l="Average water" />
        <Stat v={sum.sleep.nights ? fmtDuration(sum.sleep.avgMin) : '–'} l="Average sleep" />
        <Stat v={fmtDuration(sum.stats.totalExerciseMin)} l="Exercise time" />
        <Stat v={`${Math.round((sum.stats.dietDays / Math.max(1, sum.days)) * 100)}%`} l="Diet consistency" />
        <Stat v={`${used}`} l="Recovery days used" />
        <Stat v={sum.best?.label ?? '–'} l="Best habit" />
        <Stat v={sum.hardest?.label ?? '–'} l="Most difficult" />
      </div>

      <div className="card section">
        <h2>Your {arc.name} summary</h2>
        <p className="sub" style={{ marginBottom: 0 }}>{sum.text.replace(`${arc.name}: `, '')}</p>
      </div>

      <div className="card section">
        <h2>🍂 {nextName}</h2>
        <p className="small sub">Carry your goals forward. Adjust anything in Settings first if you'd like — your history stays intact.</p>
        <a className="btn ghost block" href="#/settings/goals">Review goals & habits</a>
        <ArcPicker
          after={arc.endDate}
          onPick={async (start, end) => {
            await completeArc(arc);
            await startArc(start, end, app.settings);
            celebrate('🔥', `${monthName(start)} Arc begins!`);
            go('#/');
          }}
        />
      </div>
    </div>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return <div className="stat"><div className="v" style={{ fontSize: 17 }}>{v}</div><div className="l">{l}</div></div>;
}

export function NewArc() {
  const app = useApp();
  return (
    <div className="fade-in">
      <a className="small sub" href="#/settings/arc">‹ Settings</a>
      <p className="small sub">Your current goals and habits carry over. Past arcs and streak history are kept.</p>
      <ArcPicker
        onPick={async (start, end) => {
          await startArc(start, end, app.settings);
          celebrate('🔥', `${monthName(start)} Arc begins!`);
          go('#/');
        }}
      />
    </div>
  );
}
