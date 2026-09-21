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
│  ├─ core/          @gita/core      — framework-agnostic theme, repository, view-models, i18n
│  └─ audio/         @gita/audio     — TTS provider interface, segmentation, chunking, hash cache,
│                                      synthesis pipeline, playback/resume reducer, provider router
├─ apps/
│  └─ mobile/        @gita/mobile    — Expo / React Native shell (expo-router)
└─ (services/ — added in later phases; see ARCHITECTURE.md §16)
```

## Phase status

- **Phase 1 — Architecture:** done (`docs/ARCHITECTURE.md`).
- **Phase 2 — Content model & ingestion:** done. Provenance-tracked content model; ingestion of
  the verified public-domain source; validation passing (18 chapters, 701 verses, English by
  Shri Purohit Swami).
- **Phase 3 — Mobile shell:** done. `@gita/core` (theme, content repository, view-models, i18n);
  Expo/expo-router app with Home, Chapters, Chapter detail, Verse Reader; light/dark theming; and
  an AI-content badge enforcing the scripture/AI distinction.
- **Phase 4 — Reader depth, personal study & offline search:** **in progress (this commit).**
  Notes / highlights / bookmarks / mark-understood / mark-for-revision, aggregated into a
  "My Gita" library; **offline search** (lexical + verse-reference, diacritic-insensitive) behind
  a `SearchEngine` interface (SQLite FTS5 is the documented scale path; semantic search is Phase 7);
  a `StatePersistence` port with an AsyncStorage adapter so bookmarks/notes/progress survive
  restart. 54 core assertions pass; packages + app typecheck clean.
- **Phase 5 — Audio system:** **in progress (this commit).** `@gita/audio`: `AudioProvider`
  interface + capability model (data-producing vs. direct-speak), language-aware sentence
  segmentation (incl. Devanagari danda), sentence-boundary chunking, deterministic `audioHash`
  cache key, a synthesis pipeline that generates each chunk once and reuses thereafter, a pure
  play/pause/seek/skip/speed **playback reducer with resume snapshots**, Sanskrit recitation
  controls (repeat / 3× / slow), and a capability+cost provider router. 47 audio assertions pass.
  App: device-native TTS adapter (expo-speech) implementing the port, provider registry, and
  Read/Stop/speed controls in the Verse Reader (Sanskrit deliberately not spoken by the English
  voice). Self-hosted Kokoro/Indic-TTS/Sanskrit providers register in Phase 10 with no UI change.
- Phases 6–10: not started.

### A note on the search decision

For 701 verses an in-memory lexical index is instant, needs no native module, works fully
offline, and is unit-testable — so it is the default `SearchEngine`. SQLite **FTS5** implements
the same interface on-device if the corpus grows (multi-commentary, many languages), and the
**semantic** engine ("anxiety about results" → detachment verses) is added in Phase 7 behind the
same interface. Swapping engines touches no screen code.

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
