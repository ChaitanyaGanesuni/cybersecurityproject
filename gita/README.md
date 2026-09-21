# Gita Learning Companion

An AI-powered Bhagavad Gita learning companion (read · listen · understand · question ·
revise · apply). Architecture: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

> **Repo note:** this app lives in the `gita/` folder of `cybersecurityproject` only because
> that is the repository this session can push to. It is a **self-contained monorepo** and is
> intended to be lifted out into its own repository. It does not touch the unrelated spam
> classifier at the repo root.

## Monorepo layout (current)

```
gita/
├─ packages/
│  ├─ contracts/     @gita/contracts — zod content model (single source of truth)
│  ├─ gita-content/  @gita/content   — verified public-domain source ingestion + validation
│  └─ core/          @gita/core      — framework-agnostic theme, repository, view-models, i18n
├─ apps/
│  └─ mobile/        @gita/mobile    — Expo / React Native shell (expo-router)
└─ (services/ — added in later phases; see ARCHITECTURE.md §16)
```

## Phase status

- **Phase 1 — Architecture:** done (`docs/ARCHITECTURE.md`).
- **Phase 2 — Content model & ingestion:** done. Provenance-tracked content model; ingestion of
  the verified public-domain source; validation passing (18 chapters, 701 verses, English by
  Shri Purohit Swami).
- **Phase 3 — Mobile shell:** **in progress (this commit).** `@gita/core` (theme, content
  repository, view-models, i18n) with 30 passing tests; Expo/expo-router app (`@gita/mobile`)
  with Home, Chapters, Chapter detail, and Verse Reader screens, light/dark theming, and an
  AI-content badge enforcing the scripture/AI distinction. All packages + the app typecheck clean.
- Phases 4–10: not started.

## Core design rule (anti-fabrication)

Every displayable text carries an explicit `contentType` and a `sourceId` into a source
registry — there is no field that can hold text of unknown origin. AI-derived fields are
optional, always tagged `contentType: "ai"`, and are **empty at ingest**; they are filled at
runtime by the AI service (Phase 6) and visually marked as AI in the UI. Nothing is invented at
ingest time.

## Build & test

```bash
cd gita
npm install
npm run ingest              # raw/ (verified snapshot) -> data/gita.json + per-chapter files
npm run validate            # asserts structure, verse counts, provenance, anti-fabrication
npm test -w @gita/core      # 30 assertions against the real dataset
npx tsc -p tsconfig.json    # typecheck packages
npm run typecheck -w @gita/mobile   # typecheck the RN app

# Run the app (needs a machine with the Expo toolchain + a device/simulator):
npm start -w @gita/mobile   # then press i (iOS) / a (Android)
```

> The mobile app is a reviewed, type-checked scaffold. It cannot be launched in a headless CI
> container — it requires the Expo dev client on a real device or simulator. App icons/splash
> images and the bundled Noto fonts (Devanagari/Telugu) are wired in configuration and added as
> assets in Phase 3 polish / Phase 4.

## Content & licensing

See [`packages/gita-content/SOURCES.md`](packages/gita-content/SOURCES.md). Summary: Sanskrit
(public domain) + transliteration/word-meanings/chapter summaries (Unlicense `gita/gita`) +
English translation by **Shri Purohit Swami, 1935** (public domain). Telugu translation, classical
commentaries, and AI explanations are deliberate, documented gaps to be filled from verified
sources later — never fabricated.
