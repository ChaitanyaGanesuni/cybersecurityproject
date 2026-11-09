import { useState } from 'react';
import { useApp } from '../data/store';
import { deleteMeal, deleteTemplate, saveMeal, saveTemplate, saveWorkout, setFoodFlag } from '../data/repo';
import { aiLoggingAvailable, analyzeEntry, toFoodItems, type FoodAnalysis } from '../data/ai';
import { FOOD_FLAGS, MEAL_LABELS, WORKOUT_TYPES } from '../domain/defaults';
import { dietProgress, emptyRawDay, aggregateDay } from '../domain/scoring';
import { addDays, minutesOfDay, minutesToHM } from '../domain/dates';
import { fmtDateLong, fmtInt } from '../domain/format';
import { MEAL_TYPES, type FoodItem, type Meal, type MealType } from '../domain/types';
import { Bar, Field, Ring, Sheet, num, toast, useRoute } from '../ui/kit';

function defaultMealType(): MealType {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snacks' : 'dinner';
}

const blankItem = (): ItemDraft => ({ name: '', quantity: '', calories: '', protein: '', carbs: '', fat: '' });
interface ItemDraft {
  name: string; quantity: string; calories: string; protein: string; carbs: string; fat: string;
  // Carried through unchanged from an AI estimate (not edited in the form).
  nutrients?: FoodItem['nutrients'];
  estimated?: boolean;
}

const toItem = (d: ItemDraft): FoodItem => ({
  name: d.name.trim(),
  quantity: d.quantity.trim(),
  calories: num(d.calories),
  protein: num(d.protein),
  carbs: num(d.carbs),
  fat: num(d.fat),
  ...(d.nutrients ? { nutrients: d.nutrients } : {}),
  ...(d.estimated ? { estimated: true } : {}),
});
const toDraft = (i: FoodItem): ItemDraft => ({
  name: i.name, quantity: i.quantity,
  calories: i.calories?.toString() ?? '', protein: i.protein?.toString() ?? '', carbs: i.carbs?.toString() ?? '', fat: i.fat?.toString() ?? '',
  nutrients: i.nutrients, estimated: i.estimated,
});

/** A meal being edited, optionally pre-filled by the AI estimator. */
type MealDraft = Partial<Meal> & { aiNote?: string };

async function resizePhoto(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 720 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.75);
}

export function Food() {
  const app = useApp();
  const route = useRoute();
  const date = route.query.get('date') ?? app.today;
  const s = app.settings;
  const raw = app.raw.get(date) ?? emptyRawDay(date);
  const t = aggregateDay(raw);
  const diet = dietProgress(t, s);
  const [editing, setEditing] = useState<MealDraft | null>(null);

  const byType = (m: MealType) => raw.meals.filter((x) => x.mealType === m).sort((a, b) => a.at - b.at);
  const mealTotals = (m: Meal) => m.items.reduce((a, i) => ({ cal: a.cal + (i.calories ?? 0), p: a.p + (i.protein ?? 0) }), { cal: 0, p: 0 });

  return (
    <div className="fade-in">
      <div className="eyebrow" style={{ marginTop: 4 }}>Food diary</div>
      <h1>{date === app.today ? 'Today' : fmtDateLong(date)}</h1>
      <div className="row small" style={{ marginTop: 6 }}>
        <a className="chip" href={`#/food?date=${addDays(date, -1)}`}>‹ Prev</a>
        {date !== app.today && <a className="chip" href="#/food">Today</a>}
        {date < app.today && <a className="chip" href={`#/food?date=${addDays(date, 1)}`}>Next ›</a>}
      </div>

      <AiLogBox date={date} onMeal={setEditing} />

      <div className="card section">
        <div className="row between"><h2>Daily totals</h2><span className="small sub">{diet.progress >= 1 ? '✓ Diet goal met' : t.mealsLogged ? 'In progress' : 'Nothing logged yet'}</span></div>
        {s.goals.calories ? (
          <>
            <div className="row between small"><span>Calories</span><b>{fmtInt(t.calories)} / {fmtInt(s.goals.calories)} kcal</b></div>
            <div style={{ margin: '6px 0 12px' }}><Bar value={t.calories / s.goals.calories} color="var(--diet)" /></div>
          </>
        ) : (
          <div className="row between small"><span>Calories</span><b>{fmtInt(t.calories)} kcal</b></div>
        )}
        {s.goals.proteinG ? (
          <>
            <div className="row between small"><span>Protein</span><b>{Math.round(t.protein)} / {s.goals.proteinG} g</b></div>
            <div style={{ margin: '6px 0 12px' }}><Bar value={t.protein / s.goals.proteinG} color="var(--steps)" /></div>
          </>
        ) : (
          <div className="row between small"><span>Protein</span><b>{Math.round(t.protein)} g</b></div>
        )}
        <div className="row between small"><span>Carbs · Fat</span><b>{Math.round(t.carbs)} g · {Math.round(t.fat)} g</b></div>
        <MacroRings calories={t.calories} protein={t.protein} carbs={t.carbs} fat={t.fat} calorieGoal={s.goals.calories} proteinGoal={s.goals.proteinG} />
        <a className="btn ghost block sm" style={{ marginTop: 12 }} href={`#/nutrition?date=${date}`}>View full nutrition ›</a>
        {t.itemsMissingCalories > 0 && (
          <p className="tiny muted" style={{ marginBottom: 0 }}>{t.itemsMissingCalories} item(s) have no nutrition info, so totals may be lower than what you ate. Add values when you know them — we never guess.</p>
        )}
      </div>

      {s.trackedFoodFlags.length > 0 && (
        <div className="card">
          <h2>Food quality</h2>
          <div className="chips">
            {FOOD_FLAGS.filter((f) => s.trackedFoodFlags.includes(f.id)).map((f) => {
              const on = !!t.flags[f.id];
              return (
                <button key={f.id} className={`chip${on ? ' on' : ''}`} style={on && f.avoid ? { borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 14%, var(--surface))' } : undefined} onClick={() => void setFoodFlag(date, f.id, !on)}>
                  {f.emoji} {f.label}{on ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>Tap what today included. Items like junk food count against the diet goal only if you track them.</p>
        </div>
      )}

      {app.templates.length > 0 && (
        <div className="section">
          <h2>Quick add</h2>
          <div className="chips">
            {app.templates.map((tp) => (
              <button
                key={tp.id}
                className="chip"
                onClick={() => void saveMeal({ date, mealType: tp.mealType, items: tp.items }).then(() => toast(`Added ${tp.name}`))}
                onContextMenu={(e) => { e.preventDefault(); if (confirm(`Remove quick-add "${tp.name}"?`)) void deleteTemplate(tp.id); }}
              >
                {MEAL_LABELS[tp.mealType].emoji} {tp.name}
              </button>
            ))}
          </div>
          <p className="tiny muted">Long-press a quick-add to remove it.</p>
        </div>
      )}

      {MEAL_TYPES.map((m) => {
        const meals = byType(m);
        return (
          <div key={m} className="card">
            <div className="row between">
              <h2 style={{ margin: 0 }}>{MEAL_LABELS[m].emoji} {MEAL_LABELS[m].label}</h2>
              <button className="btn sm" onClick={() => setEditing({ date, mealType: m, items: [] })}>+ Add</button>
            </div>
            {meals.map((meal) => {
              const tot = mealTotals(meal);
              return (
                <div key={meal.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => setEditing(meal)}>
                  {meal.photo && <img src={meal.photo} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 10 }} />}
                  <div className="grow">
                    {meal.title && <div className="small"><b>{meal.title}</b></div>}
                    {meal.items.map((i, k) => <div key={k} className="small">{i.name}{i.quantity ? <span className="muted"> · {i.quantity}</span> : null}</div>)}
                    {meal.items.some((i) => i.estimated) && <span className="tiny" style={{ color: 'var(--accent)' }}>✨ AI estimate</span>}
                    <div className="tiny muted">{tot.cal ? `${fmtInt(tot.cal)} kcal` : 'kcal unknown'}{tot.p ? ` · ${Math.round(tot.p)} g protein` : ''}{meal.notes ? ` · ${meal.notes}` : ''}</div>
                  </div>
                  <span className="muted">›</span>
                </div>
              );
            })}
          </div>
        );
      })}

      {editing && <MealEditor meal={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function MealEditor({ meal, onClose }: { meal: MealDraft; onClose: () => void }) {
  const [type, setType] = useState<MealType>(meal.mealType ?? defaultMealType());
  const [items, setItems] = useState<ItemDraft[]>(meal.items?.length ? meal.items.map(toDraft) : [blankItem()]);
  const [notes, setNotes] = useState(meal.notes ?? '');
  const [photo, setPhoto] = useState<string | undefined>(meal.photo);
  const [asTemplate, setAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const update = (i: number, p: Partial<ItemDraft>) => setItems(items.map((x, k) => (k === i ? { ...x, ...p } : x)));

  async function save() {
    const clean = items.filter((i) => i.name.trim()).map(toItem);
    if (!clean.length) return toast('Add at least one food');
    await saveMeal({
      id: meal.id, at: meal.at, date: meal.date!, mealType: type, items: clean, notes: notes || undefined, photo,
      ...(meal.source ? { source: meal.source } : {}), ...(meal.input ? { input: meal.input } : {}), ...(meal.title ? { title: meal.title } : {}),
    });
    if (asTemplate) await saveTemplate({ name: templateName.trim() || clean.map((c) => c.name).join(' + '), mealType: type, items: clean });
    toast('🍽️ Meal saved');
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={meal.id ? 'Edit meal' : meal.aiNote != null ? `✨ ${meal.title ?? 'Review meal'}` : 'Add meal'}>
      {meal.aiNote != null && (
        <div className="card tight" style={{ boxShadow: 'none', marginBottom: 12, borderColor: 'var(--accent)' }}>
          <div className="small"><b>AI estimate — check it before saving.</b> Adjust any portion or number that looks off.</div>
          {meal.aiNote && <div className="tiny muted" style={{ marginTop: 4 }}>Assumed: {meal.aiNote}</div>}
        </div>
      )}
      <div className="chips">
        {MEAL_TYPES.map((m) => (
          <button key={m} className={`chip${type === m ? ' on' : ''}`} onClick={() => setType(m)}>{MEAL_LABELS[m].emoji} {MEAL_LABELS[m].label}</button>
        ))}
      </div>
      {items.map((it, i) => (
        <div key={i} className="card tight" style={{ marginTop: 12, boxShadow: 'none', background: 'var(--surface-2)' }}>
          <div className="grid2">
            <Field label="Food"><input type="text" placeholder="e.g. Paneer sandwich" value={it.name} onChange={(e) => update(i, { name: e.target.value })} /></Field>
            <Field label="Quantity"><input type="text" placeholder="e.g. 2 eggs, 1 bowl" value={it.quantity} onChange={(e) => update(i, { quantity: e.target.value })} /></Field>
          </div>
          <div className="grid2" style={{ marginTop: 8, gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <Field label="kcal"><input type="number" inputMode="decimal" placeholder="?" value={it.calories} onChange={(e) => update(i, { calories: e.target.value })} /></Field>
            <Field label="Protein g"><input type="number" inputMode="decimal" placeholder="?" value={it.protein} onChange={(e) => update(i, { protein: e.target.value })} /></Field>
            <Field label="Carbs g"><input type="number" inputMode="decimal" placeholder="?" value={it.carbs} onChange={(e) => update(i, { carbs: e.target.value })} /></Field>
            <Field label="Fat g"><input type="number" inputMode="decimal" placeholder="?" value={it.fat} onChange={(e) => update(i, { fat: e.target.value })} /></Field>
          </div>
          {it.estimated && <div className="tiny muted" style={{ marginTop: 6 }}>✨ Estimated{it.nutrients && Object.keys(it.nutrients).length ? ` · includes ${Object.keys(it.nutrients).length} detailed nutrients` : ''}</div>}
          {items.length > 1 && <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setItems(items.filter((_, k) => k !== i))}>Remove item</button>}
        </div>
      ))}
      <p className="tiny muted">{meal.aiNote != null ? 'Detailed vitamins and minerals are kept as estimated for the original portions.' : "Leave nutrition blank if you don't know it — nothing is estimated for you unless you use AI logging."}</p>
      <button className="btn ghost block" onClick={() => setItems([...items, blankItem()])}>+ Another item</button>
      <div style={{ marginTop: 12 }}><Field label="Notes"><input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
      <div className="row" style={{ marginTop: 12 }}>
        <label className="btn ghost sm" style={{ cursor: 'pointer' }}>
          📷 {photo ? 'Change photo' : 'Add photo'}
          <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await resizePhoto(f)); }} />
        </label>
        {photo && <img src={photo} alt="Meal" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />}
        {photo && <button className="btn ghost sm" onClick={() => setPhoto(undefined)}>Remove</button>}
      </div>
      <p className="tiny muted">Photos stay on this device and are never synced.</p>
      <label className="row small" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={asTemplate} onChange={(e) => setAsTemplate(e.target.checked)} /> Save as a quick-add meal
      </label>
      {asTemplate && <input type="text" style={{ marginTop: 8 }} placeholder="Quick-add name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />}
      <div className="row" style={{ marginTop: 14 }}>
        {meal.id && <button className="btn danger" onClick={() => void deleteMeal(meal.id!).then(onClose)}>Delete</button>}
        <button className="btn primary grow" onClick={() => void save()}>Save meal</button>
      </div>
    </Sheet>
  );
}

/** Calories/protein rings against the user's own targets, carbs/fat as grams. */
function MacroRings({ calories, protein, carbs, fat, calorieGoal, proteinGoal }: { calories: number; protein: number; carbs: number; fat: number; calorieGoal: number | null; proteinGoal: number | null }) {
  const tile = (label: string, value: string, sub: string, ratio: number | null, color: string) => (
    <div className="center" style={{ display: 'grid', placeItems: 'center' }}>
      <Ring value={ratio ?? 0} size={64} stroke={7} color={ratio == null ? 'var(--line)' : color}>
        <b style={{ fontSize: 13 }}>{value}</b>
      </Ring>
      <div className="tiny" style={{ marginTop: 4 }}>{label}</div>
      <div className="tiny muted">{sub}</div>
    </div>
  );
  return (
    <div className="grid2" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 14 }}>
      {tile('Calories', fmtInt(calories), calorieGoal ? `of ${fmtInt(calorieGoal)}` : 'kcal', calorieGoal ? calories / calorieGoal : null, 'var(--diet)')}
      {tile('Protein', `${Math.round(protein)}g`, proteinGoal ? `of ${proteinGoal} g` : 'no target', proteinGoal ? protein / proteinGoal : null, 'var(--steps)')}
      {tile('Carbs', `${Math.round(carbs)}g`, 'no target', null, 'var(--water)')}
      {tile('Fat', `${Math.round(fat)}g`, 'no target', null, 'var(--exercise)')}
    </div>
  );
}

/**
 * "What did you eat or exercise?" — describe it or snap a photo, and the AI
 * returns an estimate to review: a pre-filled meal, or a workout to confirm.
 */
function AiLogBox({ date, onMeal }: { date: string; onMeal: (m: MealDraft) => void }) {
  const app = useApp();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [workout, setWorkout] = useState<FoodAnalysis | null>(null);
  const available = aiLoggingAvailable();
  const latestWeight = [...app.weights].reverse().find((w) => w.weightKg)?.weightKg;

  async function submit() {
    if (!text.trim() && !photo) return;
    setBusy(true);
    try {
      const a = await analyzeEntry({ text: text.trim(), photoDataUrl: photo, weightKg: latestWeight });
      if (a.kind === 'meal' && a.items.length) {
        onMeal({ date, mealType: a.meal_type ?? defaultMealType(), items: toFoodItems(a), photo, title: a.title, input: text.trim() || undefined, source: 'ai', aiNote: a.assumptions });
        setText('');
        setPhoto(undefined);
      } else if (a.kind === 'exercise' && a.exercise) {
        setWorkout(a);
        setText('');
      } else {
        toast(a.assumptions || "Couldn't tell what that was — try adding a little more detail.");
      }
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!available) {
    return (
      <div className="card section tight">
        <b className="small">✨ AI logging</b>
        <div className="tiny muted">Type "3 boiled eggs, 2 bread slices" or snap a photo and get calories, macros and vitamins estimated. Needs your October Arc server with an AI key — sign in under <a href="#/settings/account" style={{ color: 'var(--accent)' }}>Settings → Sync</a>.</div>
      </div>
    );
  }

  return (
    <div className="card section tight">
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input type="text" placeholder="What did you eat or exercise?" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} aria-label="What did you eat or exercise?" />
        <label className="icon-btn" style={{ cursor: 'pointer', flex: '0 0 auto' }} aria-label="Add a photo">
          📷
          <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await resizePhoto(f)); e.target.value = ''; }} />
        </label>
        <button className="btn primary sm" disabled={busy || (!text.trim() && !photo)}>{busy ? '…' : 'Log'}</button>
      </form>
      {photo && (
        <div className="row small" style={{ marginTop: 8 }}>
          <img src={photo} alt="Meal to analyse" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
          <span className="muted grow">Photo attached</span>
          <button className="btn ghost sm" onClick={() => setPhoto(undefined)}>Remove</button>
        </div>
      )}
      {busy && <div className="small" style={{ marginTop: 8 }}>⚡ Analysing…</div>}
      <div className="tiny muted" style={{ marginTop: 6 }}>Estimates from AI — you review them before anything is saved. Photos are sent once for analysis and not stored on the server.</div>
      {workout?.exercise && (() => {
        const w = workout.exercise;
        const meta = WORKOUT_TYPES.find((x) => x.id === w.type) ?? WORKOUT_TYPES[WORKOUT_TYPES.length - 1];
        return (
          <div className="card tight" style={{ boxShadow: 'none', marginTop: 10, background: 'var(--surface-2)' }}>
            <b>{meta.emoji} {workout.title || meta.label}</b>
            <div className="small sub">{Math.round(w.duration_min)} min{w.distance_km ? ` · ${w.distance_km} km` : ''}{w.calories_burned ? ` · ~${Math.round(w.calories_burned)} kcal (estimate)` : ''}</div>
            {workout.assumptions && <div className="tiny muted">Assumed: {workout.assumptions}</div>}
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="btn primary sm"
                onClick={async () => {
                  await saveWorkout({
                    date, type: meta.id, durationMin: Math.max(1, Math.round(w.duration_min)),
                    distanceKm: w.distance_km ?? undefined, caloriesBurned: w.calories_burned ? Math.round(w.calories_burned) : undefined,
                    notes: workout.title, startTime: minutesToHM(Math.max(0, minutesOfDay(new Date()) - Math.round(w.duration_min))),
                  });
                  setWorkout(null);
                  toast('🏃 Workout logged');
                }}
              >
                Save workout
              </button>
              <button className="btn ghost sm" onClick={() => setWorkout(null)}>Discard</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
