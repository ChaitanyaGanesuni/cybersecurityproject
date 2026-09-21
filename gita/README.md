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
│  └─ gita-content/  @gita/content   — verified public-domain source ingestion + validation
└─ (apps/, services/ — added in later phases; see ARCHITECTURE.md §16)
```

## Phase status

- **Phase 1 — Architecture:** done (`docs/ARCHITECTURE.md`).
- **Phase 2 — Content model & ingestion:** **in progress (this commit).**
  Provenance-tracked content model; ingestion of the verified public-domain source; validation
  test passing (18 chapters, 701 verses, English by Shri Purohit Swami).
- Phases 3–10: not started.

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
npm run ingest     # raw/ (verified snapshot) -> data/gita.json + per-chapter files
npm run validate   # asserts structure, verse counts, provenance, and anti-fabrication
npx tsc -p tsconfig.json   # typecheck
```

## Content & licensing

See [`packages/gita-content/SOURCES.md`](packages/gita-content/SOURCES.md). Summary: Sanskrit
(public domain) + transliteration/word-meanings/chapter summaries (Unlicense `gita/gita`) +
English translation by **Shri Purohit Swami, 1935** (public domain). Telugu translation, classical
commentaries, and AI explanations are deliberate, documented gaps to be filled from verified
sources later — never fabricated.
