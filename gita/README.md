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
│  ├─ audio/         @gita/audio     — TTS provider interface, segmentation, chunking, hash cache,
│  │                                   synthesis pipeline, playback/resume reducer, provider router
│  ├─ ai/            @gita/ai        — LLMProvider port, explanation modes, grounded prompts,
│  │                                   retrieval-based citation guard, answer cache, history trim
│  └─ rag/           @gita/rag       — VectorStore + cosine store, per-verse doc builder, concept
│                                      lexicon + query expander, lexical & embedding retrievers
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
- **Phase 6 — AI tutor:** **in progress (this commit).** `@gita/ai`: `LLMProvider` port
  (generate/stream/generateStructured/embed) with a deterministic mock; seven explanation modes
  (Simple/Deep/Practical/Story/Child/Telugu/Sanskrit-terms); a grounding system prompt that forbids
  fabrication; **citation guard** that keeps only references present in the retrieved set and drops
  invented ones; `AiTutorService` that assembles Sources from retrieval (never model free-text);
  answer cache + history trimming. 30 assertions pass, incl. the hallucination-drop guarantee.
  App: an `AiClient` (no keys in the app — HTTP to backend, or an honest offline grounded fallback
  that shows the real translation instead of a fake explanation), a tutor chat screen (lexical
  search stands in as the retriever until Phase 7), and an in-reader explanation-mode switcher with
  the AI badge + Sources.
- **Phase 7 — RAG:** **in progress (this commit).** `@gita/rag`: a `VectorStore` interface +
  in-memory cosine store (pgvector/Qdrant swap in behind it); per-verse multi-document builder with
  §9 metadata; a curated **concept lexicon + query expander**; and two retrievers behind one
  `Retriever` interface — a deterministic **offline concept retriever** (default) and a production
  **embedding retriever**. 23 assertions pass, including the flagship *"anxiety about the outcome of
  my work" → 2.47* with none of the target words, plus embedding self-retrieval end-to-end. App: the
  tutor now retrieves through the `Retriever`; Search gains a "By meaning" toggle.
- **Phase 8 — Progress, Daily Practice, Spaced Repetition:** done. SM-2 scheduler (Day 1→2→4/6→…,
  lapse resets), Daily Practice flow (Listen→Understand→Reflect→Apply→Journal with private journal),
  "for revision" enrolls verses in the schedule, Home surfaces due-count. +16 core assertions.
- Phases 9–10: in progress.

### A note on the two retrievers

True neural semantic matching needs an embedding model, which runs on the backend (no key in the
app). So the app ships a **deterministic, offline concept-expansion retriever** that bridges the
user's words to the translation's vocabulary (e.g. *outcome → fruit*, *anxious → fear*) and returns
sensible verses with no network. The **`EmbeddingRetriever`** (same `Retriever` interface, real
cosine `VectorStore`) is the production upgrade — swap it in `src/rag/retriever.ts` with zero tutor
changes once the backend embedder exists. Its full pipeline is verified here via deterministic
self-retrieval.

### Security note (spec §24)

The mobile app never holds an LLM/TTS API key. AI calls go to an `AiClient`; the real,
key-holding adapter runs on the backend. Until the backend exists, the app uses the offline
grounded client, which surfaces the public-domain translation and its source rather than inventing
an explanation.

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
