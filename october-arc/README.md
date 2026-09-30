# October Arc 🔥

A mobile-first, offline-first personal fitness and wellness accountability tracker for a 30/31-day "arc". It tracks water, steps, sleep, exercise, food, habits, body measurements, streaks and daily check-ins. It is built around consistency and quick recovery rather than perfection.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the stack, data model, sync, auth, notifications, health integrations, AI, streak rules and reminder logic.

## Run it

```bash
cd october-arc
npm install
npm run dev          # app on http://localhost:5173 (fully usable offline, no server needed)
npm test             # domain unit tests
npm run build        # production PWA -> dist/

# Optional server: accounts, encrypted sync, cloud assistant, and it serves dist/
npm run build && npm run server            # http://localhost:8787
ANTHROPIC_API_KEY=... npm run server       # enables the Claude-powered assistant
```

Server environment variables: `PORT`, `OA_DATA_DIR`, `OA_DATA_KEY` (base64, 32 bytes), `OA_CORS_ORIGIN` (comma-separated; `https://localhost` for the Android app), `ANTHROPIC_API_KEY`, `OA_MODEL`. If `OA_DATA_KEY` is not set, the server generates a key file in the data dir. Back it up.

## What's in the MVP

* **Onboarding:** primary goal, daily targets, optional nutrition targets, food-quality flags, habits, and the arc start date.
* **Home:** Day N/31 and streak, today's score ring, arc progress, "is my streak at risk?" with the single next action, goal list, "what to do next", insights, and the evening check-in prompt.
* **Today:**
  * Water: quick-add buttons, an animated glass, undo.
  * Steps: manual entry and milestone toasts, plus a health-sync button when a native bridge exists.
  * Sleep: bedtime and wake time, optional quality rating, and a 7-night chart.
  * Workouts and habits (yes/no or counted). Any past day can be edited.
* **Food:**
  * Meals with items and optional macros; unknown values stay unknown.
  * Photos, stored on the device only.
  * Quick-add meals, daily totals, food-quality flags.
* **Calendar:** month view with Excellent / Partial / Missed / Protected days. Tap a day for its full record.
* **Progress:** arc score with editable weights, per-category and per-habit streaks (current, longest, previous), weekly and arc stats, charts, sleep statistics. There is also a weight and body page.
* **Check-in:** goals ✓/○, score, streak message, mood and a journal note, plus an auto-generated reflection.
* **Streak rules:** each category can be set to "Breaks streak", "Reduces score" or "No effect", with a minimum day score. Streak Protection is manual only and limited per arc.
* **Reminders:** a smart reminder engine with quiet hours and a daily cap, delivered through the Notification API. Recurring **water reminders** (every 1–3 h while the goal is open) suggest an amount that keeps you on pace and have **+250 ml** buttons that log water without opening the app.
* **Arc complete:** summary stats and a written summary from your data, then carry your goals into the next arc.
* **Assistant:** answers on the device by default; opt in to Claude through your own server.
* **Privacy:** export, delete device data, delete server account. No trackers.

## Android app

The `android/` folder is a Capacitor project that wraps this same app as a native Android app (Android 8.0+). On top of the web version it adds:

* **Health Connect**, read-only: today's steps and last night's sleep import automatically when the app opens and every 15 minutes. Google Fit, Samsung Health and most watches write into Health Connect.
* **Reminders that arrive with the app closed.** The rest of the day's reminders are scheduled on the phone, using the same rules as the web app. They are re-planned whenever you log something.
* **+250 ml / +500 ml** buttons on water reminders.

**Get the APK without installing anything:**

1. Open the repository's **Actions** tab and choose the latest **October Arc — Android APK** run. Every push that touches `october-arc/` triggers it; you can also start one with **Run workflow**.
2. Download the **october-arc-debug-apk** artifact and unzip it.
3. Copy `app-debug.apk` to your phone and open it. Allow "install unknown apps" for your file manager or browser when Android asks.

**Build it yourself** (needs Android Studio or the Android SDK, and JDK 21):

```bash
npm run build && npx cap sync android
cd android && ./gradlew assembleDebug      # -> app/build/outputs/apk/debug/app-debug.apk
# or: npx cap open android                 # opens Android Studio
```

**First run on the phone:**

1. Settings → Reminders → Enable. Android asks for notification permission.
2. Settings → Health data → Connect Health Connect, and allow Steps and Sleep.
3. For sync, run the server with `OA_CORS_ORIGIN=https://localhost` (the Android app's origin), enter its `https://` address in Settings, and sign in.

The debug APK is fine for personal use. A Play Store release would need a signing key and Google's Health Connect permission declaration.

## Google Fit step import

Build with a Google OAuth **Web application** client ID from a Google Cloud project that has the **Fitness API** enabled:

```bash
VITE_GOOGLE_FIT_CLIENT_ID=1234-abc.apps.googleusercontent.com npm run build
```

In Google Cloud Console:

* Add the app's origin (e.g. `http://localhost:5173`, your deployed URL) under **Authorized JavaScript origins**.
* Add your Google account as a **test user** on the OAuth consent screen.

Then use **Settings → Health data → Connect Google Fit**, and **Sync from Google Fit** on the Steps card.

⚠️ Google stopped accepting new Fit API developers on May 1, 2024, and has announced the Fit APIs end in 2026. This only works with a project that already had access, and only until Google switches it off. Health Connect is the long-term replacement.

## Needs platform setup (interfaces are in place, not faked)

* **Apple Health:** needs an iOS build (Capacitor iOS plus a HealthKit plugin implementing `window.OctoberArcHealth`). The Android app already covers Health Connect.
* **Background notifications in the web version:** need Web Push (VAPID keys plus server scheduling). The Android app already schedules them on the phone; in the web version, reminders fire while the app is open or recently used.
