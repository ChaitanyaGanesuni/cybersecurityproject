# October Arc — Architecture

October Arc is a personal accountability system for a 30/31-day fitness and wellness "arc". This document covers the ten technical decisions the brief asked for, in order.

## 1. Technology stack

| Layer | Choice | Why |
|---|---|---|
| App | **React 19 + TypeScript + Vite**, installable **PWA** | One codebase for phone and desktop. Installs to the home screen and works offline. Fast builds. |
| Local storage | **IndexedDB via Dexie** (+ `dexie-react-hooks` live queries) | Real offline-first storage. Every write lands on the device first, and the UI re-renders from live queries. |
| Business logic | **Pure TypeScript modules** in `src/domain/` | Scoring, streaks, reminders, insights and the assistant are plain functions: deterministic and unit-tested (Vitest). The server can reuse them. |
| Server (optional) | **Node 22, `node:http` + `node:sqlite`** | Accounts, encrypted sync, the Claude proxy and static hosting, with no framework and one small process. |
| AI | **Claude (`claude-opus-5-5`) via `@anthropic-ai/sdk`**, called only from the server | The API key never reaches the browser. |
| Native (future) | **Capacitor shell** around the same PWA | Needed only for Apple Health, Health Connect and background local notifications (see §5 and §4). |

## 2. Architecture

```
┌──────────────────────────── Device (works fully offline) ─────────────────────────────┐
│  UI pages (src/pages)  ──reads──▶  AppProvider (src/data/store.tsx)                   │
│        │                              │  derives: evaluations, streaks, nudges, risk  │
│        │ writes                       ▼                                               │
│        └──▶ repo.ts ──▶ IndexedDB (Dexie) ◀── live query ──┘                          │
│                  │          ▲                                                         │
│                  └─outbox───┤ sync.ts  ──HTTPS──┐                                     │
│  Reminder loop (App.tsx) ─▶ domain/reminders ─▶ integrations/notify (Notification API)│
│  Health bridge  (integrations/health.ts) ◀── window.OctoberArcHealth (native shell)   │
└───────────────────────────────────────────────────┼───────────────────────────────────┘
                                                    ▼
                         ┌──────── October Arc server (optional) ────────┐
                         │ /api/auth/*  scrypt + hashed session tokens   │
                         │ /api/sync    LWW merge, AES-256-GCM at rest   │
                         │ /api/assistant ─▶ Claude Messages API         │
                         │ static dist/ (the PWA)                        │
                         └───────────────────────────────────────────────┘
```

* **Single source of rules.** The UI never re-implements business logic. `store.tsx` loads raw records and calls the domain functions: `evaluateDay`, `computeAllStreaks`, `computeNudges`, `riskSummary`, `insights`, `arcScore`.
* **Routing** is hash-based (`#/today/water?add=500`), so it works offline from any static host. Nudge actions are deep links, so the next action is always one tap away.

## 3. Database structure

The same record shapes are used on the device (IndexedDB) and in sync payloads. Every synced record has `id` and `updatedAt`.

| Store | Key | Brief's entity | Notes |
|---|---|---|---|
| `settings` | `'settings'` | User | name, timezone, primaryGoal, **goals**, weights, streak policies, minDayScore, reminder prefs, wake/bed time |
| `arcs` | uuid | — | name, start/end date, goal snapshot, protectionsTotal, status |
| `water` | uuid, idx `date` | DailyLog.water | one row per drink (so undo works) |
| `steps` | date | DailyLog.steps | one total per day + `source` (manual / provider) |
| `sleep` | date (wake-up day) | DailyLog.sleep | bedtime, wakeTime, minutes, optional self-rated quality |
| `meals` | uuid, idx `date` | Meal | mealType, `items[]` (name, quantity, optional calories/protein/carbs/fat), notes, **local-only photo** |
| `mealTemplates` | uuid | — | quick-add meals |
| `quality` | date | — | food-quality flags (vegetables, junk, sugary drinks…) |
| `workouts` | uuid, idx `date` | Workout | type, duration, distance, calories burned, notes, start time |
| `habits` | uuid | Habit | target + unit, reminderTime, active, `createdDate`, `archivedDate` |
| `habitCompletions` | `habitId:date` | HabitCompletion | value (≥ target = completed) |
| `weights` | uuid | WeightEntry | weight, waist, chest, hip |
| `checkins` | date | — | mood, note (journal), score, reflection |
| `summaries` | date | DailyLog (finalized) | frozen `DayEval`: score, progress, completed goals, success. Device-local, derived. |
| `protections` | date | — | streak protection uses (explicit user action) |
| `notifications` | uuid | Notification | type, scheduledAt, sentAt, status. Device-local. |
| `outbox`, `meta` | — | — | sync queue and cursor |

**Streaks are derived, not stored.** They are recomputed from the day evaluations on every change, which is cheap for months of data, so they can never drift out of sync with the logs. The server holds the same records in `records(user_id, tbl, id, updated_at, deleted, payload BLOB, seq)`, plus `users` and `sessions`.

## 4. Notification architecture

1. **Planning is pure** (`domain/reminders.ts`). `dueNotifications()` takes settings, the time of day, today's evaluation, the current nudges, habits and today's notification log. It returns the messages that are due now. Its guarantees:
   * At most one message per slot (morning, afternoon, evening, night) and per habit per day.
   * Never during quiet hours, and never more than `maxPerDay` a day.
   * A slot fires only within 90 minutes of its time.
   * Nothing is sent when there is nothing useful to say: the evening nudge is skipped if the day is already complete.
2. **Delivery is a channel** (`integrations/notify.ts`, `NotificationChannel`). The web channel uses `ServiceWorkerRegistration.showNotification`. Every attempt is written to the `notifications` log, which is how deduplication works.
3. **Triggering.** While the app is open or resumed, the store's clock ticks every 30 s and `useReminders` re-plans.
4. **Background delivery** is not possible from a web page alone. It needs one of two things:
   * **Web Push:** the server stores a push subscription and pushes at planned slot times. This needs VAPID keys, and on iOS the PWA must be installed.
   * **Capacitor Local Notifications:** schedule the day's slots on the device.

   Both plug in as another `NotificationChannel` using the same planner. The in-app nudges on Home always work.

## 5. Health-platform integrations

`integrations/health.ts` defines `HealthProvider` (status, requestAccess, readSteps) and a `NativeHealthBridge` contract, which a native shell exposes as `window.OctoberArcHealth`. Nothing is faked:

* **Apple HealthKit** needs an iOS app with the HealthKit entitlement and `NSHealthShareUsageDescription`. A browser can't access it.
* **Android Health Connect** needs an Android app that declares `android.permission.health.READ_STEPS`, plus a privacy-policy activity and Google Play's health-permissions declaration.
* **Google Fit** REST APIs are deprecated in favour of Health Connect, so the app does not use them.

In the web build, both providers report "Not available" in Settings → Health data and the Steps card offers manual entry. When a bridge is present, a "Sync from …" button appears. It asks for permission and writes the day's total with `source` set to the provider.

## 6. Offline synchronization

* **Local first.** Every mutation goes through `repo.ts`. It writes the record and adds an outbox entry `{table:id, at}` in the same IndexedDB transaction. The UI updates immediately from the live query.
* **Sync** (`data/sync.ts`) runs after local writes (debounced 2 s), on the `online` event, every 5 minutes, and on sign-in. It pushes outbox records (a missing record becomes a tombstone) and pulls server changes with `seq > cursor`.
* **Conflict rule:** last write wins per record, based on `updatedAt`, on both server and client. A pending local edit is never overwritten by an older remote one. Outbox entries are cleared only if they weren't touched again during the sync.
* **First sign-in on a device** queues every local record, so nothing typed offline is lost. Signing in does **not** write settings, so a fresh device can't overwrite the synced settings with defaults.
* **Never synced:** meal photos, day summaries (derived) and the notification log.

## 7. Authentication and privacy

* **Accounts are optional.** The app is fully usable with no account.
* **Passwords:** scrypt (N = 16384, r = 8, p = 1) with a per-user salt. Verification is constant-time, and a dummy hash is checked for unknown emails, so response time doesn't reveal whether an email exists.
* **Sessions:** 32 random bytes, sent as a Bearer token. The server stores only the token's SHA-256 hash, with a 30-day expiry. Logout deletes the session.
* **Abuse limits:** auth attempts are rate-limited per IP and per email. Sync and assistant calls are rate-limited per user. Request sizes are capped and inputs validated (tables are whitelisted).
* **Encryption at rest:** every synced record is encrypted with AES-256-GCM before it is stored. The key comes from `OA_DATA_KEY` or a generated `0600` key file, and each record is bound to its user, table and id.
* **Headers:** a strict Content-Security-Policy, `nosniff`, `no-referrer`, and `frame-ancestors 'none'`. CORS is off unless `OA_CORS_ORIGIN` is set.
* **User control:** export everything as JSON, delete all device data, and delete the server account with all records (cascading delete).
* **Minimal data:** no analytics, trackers or ads. The cloud assistant sends a compact summary only (§8).
* **Known limitation:** device data sits in the browser's origin-sandboxed IndexedDB and relies on OS disk encryption. Passcode-based encryption of local data would be a later addition, for example SQLCipher in the native shell.

## 8. AI integration

* **On-device assistant** (`domain/assistant.ts`, the default). It answers the common questions from the user's logs with no network: water left, steps needed, why the streak broke, the week's performance, tomorrow's focus, a dinner idea based on remaining protein and calories, a 20-minute workout, and an arc summary. It never invents nutrition values.
* **Cloud assistant** (opt-in, and requires an account). The client sends the chat plus `contextForCloud()`:
  * Sent: goals, streak rules and counts, today's totals, meal names, open items, and a 14-day summary.
  * Not sent: photos, notes, journal entries or body measurements.

  The server calls `claude-opus-5-5` with `effort: "low"`. It uses server-side refusal fallbacks (`fallbacks: "default"`), puts the stable system prompt first so it can be cached, and handles a `refusal` stop reason and typed SDK errors.
* **Safety.** The medical guardrail is enforced in two places:
  * The local assistant detects medical topics and recommends a qualified professional.
  * The system prompt forbids diagnosis, supplement doses and aggressive deficits, requires data-grounded answers, and bans shaming language.

## 9. How streak calculations work (`domain/scoring.ts`, `domain/streaks.ts`)

1. **Category progress** runs from 0 to 1 and a category is complete at 1:
   * **Water, steps, exercise:** amount logged ÷ target.
   * **Sleep:** last night's minutes ÷ target. Sleep is logged on the day you wake up.
   * **Habits:** the mean of each applicable habit's value ÷ its target.
   * **Diet:** the mean of whichever parts the user set:
     * Calories count as complete when they are within [70 % of target, target + tolerance]. Below 70 % the day simply isn't fully logged yet, so it earns partial credit and never a penalty for eating less.
     * Protein: amount ÷ target.
     * Avoid flags (junk food, sugary drinks…): 0 if ticked, 1 otherwise.
     * With no numeric nutrition targets, "logged at least one meal" is the diet goal.
2. **Each category's policy** is chosen by the user:
   * `breaks`: it must be complete for the overall streak.
   * `score`: it only affects the score.
   * `none`: no effect at all.
3. **Daily score** is the weighted mean of progress over categories whose policy isn't `none` and whose weight is above 0. Weights are editable and normalised.
4. **Day success** means every `breaks` category is complete **and** the score is at least `minDayScore`.
5. **Category streaks** count consecutive days with that category complete. **Habit streaks** only count days on or after the habit was created.
6. **Overall streak** counts consecutive success days, plus days the user **explicitly** protected.
7. **Today never breaks a streak.** While today is unfinished the streak stays alive from yesterday and is flagged `atRisk`.
8. **Streak Protection** is offered only for yesterday, when it broke a running streak, and is limited per arc. It is never applied automatically, and it doesn't affect category streaks.
9. **End of day.** Finished days are frozen into `summaries`, so later goal changes don't rewrite history. A summary is recomputed only if that day's own data is edited.
10. **Nothing is deleted when a streak breaks.** The app keeps current, previous and longest streaks.

## 10. How reminder logic works (`domain/nudges.ts`)

For each category the engine works out what is done, what remains, the time left, whether the streak is at risk, and the smallest next action:

* **Time left** is measured against the user's own waking day (wake time to bedtime). "Expected so far" is target × fraction of the day elapsed.
* **Water:** "behind" means more than 250 ml under the expected pace. The plan is "500 ml now, then about X ml per hour", sized to the hours left.
* **Steps:** remaining ÷ 90–110 steps per minute gives "a 25–30 minute walk could get you there". If even that won't fit before bedtime, it suggests a shorter walk instead.
* **Exercise:** "even a short 15-minute workout…". If the user usually trains later in the day (the median start time over the last 14 days), the nudge mentions it.
* **Sleep:** asks the user to log last night. In the evening, it recommends a bedtime based on the usual wake time and the sleep target: "Protect tomorrow's streak."
* **Diet:** points out any protein gap with protein-forward options. Being over calories is framed as "no problem, tomorrow is a fresh day".
* **Levels:** `risk` means a `breaks` category is open, 60 % or more of the day has passed, and a streak is alive. Then come `behind`, `info` and `done`.
* **Next action:** the first open item with an action, sorted by level and then by effort. The Home screen shows it as the one big button.
* **Tone:** a unit test enforces supportive language. Messages must not contain "fail", "lazy", "bad" and similar words.
