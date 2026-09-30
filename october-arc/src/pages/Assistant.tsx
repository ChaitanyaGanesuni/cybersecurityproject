import { useEffect, useRef, useState } from 'react';
import { useApp, type AppState } from '../data/store';
import { api, getSession } from '../data/api';
import { contextForCloud, localAnswer, type AssistantContext } from '../domain/assistant';
import { MEAL_LABELS } from '../domain/defaults';

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'How much water do I have left?',
  'How many steps do I need?',
  'What should I eat for dinner based on what I ate today?',
  'Why did my streak break?',
  'How did I perform this week?',
  'What should I focus on tomorrow?',
  'Give me a simple 20-minute workout',
  'Summarize my arc',
];

export function buildContext(app: AppState): AssistantContext {
  return {
    settings: app.settings,
    habits: app.habits,
    arcName: app.arc?.name ?? 'Arc',
    dayIndex: app.dayIndex,
    arcDays: app.arcDays,
    today: app.todayEval,
    past: app.pastArcEvals,
    streaks: app.streaks,
    nudges: app.nudges,
    protectedDates: [...app.protectedDates],
    protectionsLeft: app.protectionsLeft,
    todayMeals: (app.raw.get(app.today)?.meals ?? []).map((m) => ({ mealType: MEAL_LABELS[m.mealType].label, items: m.items.map((i) => `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`) })),
  };
}

export function Assistant() {
  const app = useApp();
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('oa.chat') ?? '[]'); } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const cloud = app.settings.assistant.cloudEnabled && !!getSession();

  useEffect(() => {
    sessionStorage.setItem('oa.chat', JSON.stringify(msgs.slice(-30)));
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q.trim() }];
    setMsgs(next);
    setInput('');
    const ctx = buildContext(app);
    if (!cloud || !navigator.onLine) {
      setMsgs([...next, { role: 'assistant', content: localAnswer(q, ctx) }]);
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ reply: string }>('/api/assistant', { messages: next.slice(-12), context: contextForCloud(ctx) });
      setMsgs([...next, { role: 'assistant', content: r.reply }]);
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: `${localAnswer(q, ctx)}\n\n(Cloud assistant unavailable: ${(e as Error).message}. Answered on-device.)` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in">
      <div className="eyebrow" style={{ marginTop: 4 }}>Assistant {cloud ? '· Cloud (Claude)' : '· On-device'}</div>
      <h1>Ask about your arc</h1>
      <p className="tiny muted">
        {cloud
          ? 'Your question plus a compact summary of your goals and recent logs is sent to your October Arc server, which asks Claude. Turn this off in Settings → Assistant.'
          : 'Answers come from your logs on this device. Nothing is sent anywhere. Enable the cloud assistant in Settings for open-ended questions.'}{' '}
        Not medical advice.
      </p>

      <div className="chat section">
        {msgs.length === 0 && (
          <div className="chips">
            {SUGGESTIONS.map((q) => <button key={q} className="chip" onClick={() => void ask(q)}>{q}</button>)}
          </div>
        )}
        {msgs.map((m, i) => <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'bot'}`}>{m.content}</div>)}
        {busy && <div className="msg bot muted">Thinking…</div>}
        <div ref={end} />
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); void ask(input); }}>
        <input type="text" placeholder="Ask anything about your progress…" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Message" />
        <button className="btn primary" disabled={busy || !input.trim()}>Send</button>
        {msgs.length > 0 && <button type="button" className="btn ghost" onClick={() => setMsgs([])} aria-label="Clear chat">↺</button>}
      </form>
    </div>
  );
}
