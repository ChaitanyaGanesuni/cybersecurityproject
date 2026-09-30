import { useState } from 'react';
import { useApp } from '../data/store';
import { deleteMeal, deleteTemplate, saveMeal, saveTemplate, setFoodFlag } from '../data/repo';
import { FOOD_FLAGS, MEAL_LABELS } from '../domain/defaults';
import { dietProgress, emptyRawDay, aggregateDay } from '../domain/scoring';
import { addDays } from '../domain/dates';
import { fmtDateLong, fmtInt } from '../domain/format';
import { MEAL_TYPES, type FoodItem, type Meal, type MealType } from '../domain/types';
import { Bar, Field, Sheet, num, toast, useRoute } from '../ui/kit';

function defaultMealType(): MealType {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 18 ? 'snacks' : 'dinner';
}

const blankItem = (): ItemDraft => ({ name: '', quantity: '', calories: '', protein: '', carbs: '', fat: '' });
interface ItemDraft { name: string; quantity: string; calories: string; protein: string; carbs: string; fat: string }

const toItem = (d: ItemDraft): FoodItem => ({
  name: d.name.trim(),
  quantity: d.quantity.trim(),
  calories: num(d.calories),
  protein: num(d.protein),
  carbs: num(d.carbs),
  fat: num(d.fat),
});
const toDraft = (i: FoodItem): ItemDraft => ({
  name: i.name, quantity: i.quantity,
  calories: i.calories?.toString() ?? '', protein: i.protein?.toString() ?? '', carbs: i.carbs?.toString() ?? '', fat: i.fat?.toString() ?? '',
});

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
  const [editing, setEditing] = useState<Partial<Meal> | null>(null);

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
                    {meal.items.map((i, k) => <div key={k} className="small">{i.name}{i.quantity ? <span className="muted"> · {i.quantity}</span> : null}</div>)}
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

function MealEditor({ meal, onClose }: { meal: Partial<Meal>; onClose: () => void }) {
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
    await saveMeal({ id: meal.id, at: meal.at, date: meal.date!, mealType: type, items: clean, notes: notes || undefined, photo });
    if (asTemplate) await saveTemplate({ name: templateName.trim() || clean.map((c) => c.name).join(' + '), mealType: type, items: clean });
    toast('🍽️ Meal saved');
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={meal.id ? 'Edit meal' : 'Add meal'}>
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
          {items.length > 1 && <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setItems(items.filter((_, k) => k !== i))}>Remove item</button>}
        </div>
      ))}
      <p className="tiny muted">Leave nutrition blank if you don't know it — nothing is estimated for you.</p>
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
