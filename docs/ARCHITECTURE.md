# Gita Learning Companion — Architecture Proposal (Phase 1)

> **Status: PROPOSAL — awaiting your approval before any application code is written.**
> Per your section 28, this document delivers the 20 required items. Nothing here is
> implemented yet. TTS/licensing facts were verified against current sources
> (Sept 2026); see [§20](#20-licensingcopyright-considerations) for citations.

---

## 0. A note on this repository (must resolve before Phase 2)

This repo (`cybersecurityproject`) currently contains an **unrelated FastAPI spam
classifier** (`app/main.py`, `spam_classifier.joblib`, `Dockerfile`). The active
branch is named for the Gita app. Before I write code I need one decision:

- **(A) New repo** for the Gita app (cleanest — recommended), or
- **(B) A subdirectory** here (e.g. `/gita`) leaving the spam classifier untouched, or
- **(C) Replace** the repo contents.

I will not touch the spam classifier without your say-so. **The rest of this document
assumes we get a clean project root** (option A or B).

---

## Design principles (the spine of every decision below)

1. **Scripture ≠ interpretation ≠ AI output.** Every piece of text carries an explicit
   `contentType` and `source`. The UI renders AI content with a persistent visual marker
   and never styles it like the verse itself.
2. **Offline-first & audio-first.** The reader and the downloaded audio must work with the
   radio off. AI features degrade gracefully when offline.
3. **Everything behind an interface.** `LLMProvider`, `TTSProvider`, `VectorStore`,
   `AudioProvider` are ports; concrete SDKs are adapters. Swapping a provider never touches
   UI or domain code.
4. **Cost hierarchy is a hard rule, not a preference:** device TTS → local open model →
   self-hosted → free tier → paid. Cache aggressively at every layer.
5. **No fabrication.** Content is only ever *ingested from a cited source*, never generated
   into the scripture tables. The AI is grounded (RAG) and must cite or say "uncertain".

---

## 1. Mobile technology stack (recommended)

**React Native + Expo (TypeScript), with a config-plugin/dev-client for native TTS.**

| Concern | Choice | Why |
|---|---|---|
| Framework | **React Native 0.7x + Expo (dev client)** | One codebase, iOS+Android, huge ecosystem, OTA updates. Expo dev-client (not "Expo Go") so we can link native TTS modules. |
| Language | TypeScript (strict) | Shared types with backend contract. |
| Navigation | `expo-router` (file-based) | Screen map maps 1:1 to files. |
| State | **Zustand** (UI/session) + **TanStack Query** (server cache) | Minimal boilerplate; Query gives caching/retry/offline for API. |
| Local DB | **WatermelonDB** (SQLite) or **op-sqlite + Drizzle** | Reactive, scales to thousands of verses; powers offline reader, notes, progress. Recommend **op-sqlite + Drizzle** for typed SQL + FTS5 full-text search on-device. |
| Audio playback | **`react-native-track-player`** | Background playback, lock-screen controls, queue = perfect for chunked long-form audio + resume. |
| Native TTS | **`expo-speech`** (baseline) + a thin native module wrapping Android `TextToSpeech` / iOS `AVSpeechSynthesizer` for voice/rate control | Free, offline, zero server cost — top of the cost hierarchy. |
| Secure storage | `expo-secure-store` (Keychain/Keystore) | Auth tokens only; never API keys. |
| File/offline assets | `expo-file-system` | Downloaded audio + verse packs. |
| i18n | `i18next` + `expo-localization` | UI language independent of content language. |
| Fonts | Noto Serif Devanagari (Sanskrit), Noto Sans/Serif Telugu, a calm serif for English | Correct rendering of all three scripts is non-negotiable. |

**Why not Flutter?** Flutter is a fine alternative (excellent rendering, `just_audio` +
`flutter_tts`). RN wins here on (a) sharing TS types with the Node backend, (b)
`react-native-track-player`'s maturity for gapless queued playback, and (c) OTA updates.
If you prefer Dart, the architecture below is identical — only the adapter code changes.

---

## 2. Backend technology stack

**Node.js + TypeScript, NestJS**, deployed as a modular monolith (split to services later
only if needed).

| Concern | Choice | Why |
|---|---|---|
| Runtime/framework | **NestJS (TypeScript)** | First-class modules = the bounded contexts in §22; DI makes the provider ports trivial; shares types with the RN app. |
| API style | REST + OpenAPI, plus **SSE** for LLM/token streaming and audio-chunk progress | SSE is simpler than WebSockets for one-way streams and works through the mobile HTTP stack. |
| Validation | `zod` (shared schemas app↔server) | Single source of truth for the verse contract. |
| Auth | **JWT access + rotating refresh**, provider-agnostic (email magic-link or OAuth). Consider a hosted option (Clerk/Auth0/Supabase Auth) to avoid rolling our own. | Section 24 requires secure auth; tokens in Keychain/Keystore only. |
| Background jobs | **BullMQ** (Redis) | TTS pre-generation, embedding indexing, spaced-repetition scheduling. |
| Caching | **Redis** | AI answer cache, audio-hash lookups, session/rate-limit. |
| Object storage | **S3-compatible** (AWS S3 / Cloudflare R2 / MinIO for dev) | Generated audio chunks + downloadable packs. R2 = no egress fees (cost rule). |

> **Python microservice for ML.** The Indic TTS models and embedding models are Python-native.
> A single **FastAPI "inference" service** (already the ecosystem this repo uses!) hosts the
> self-hosted TTS + embedding endpoints. NestJS orchestrates; FastAPI does the ML. This keeps
> heavy GPU/CPU workloads off the API tier.

---

## 3. Database

**PostgreSQL** (single source of truth). One instance, logical separation by schema/module.

- Content (chapters/verses/translations/commentaries) → Postgres, read-mostly, cacheable.
- User data (bookmarks/notes/progress/conversations/revision) → Postgres.
- On-device mirror → **SQLite** (op-sqlite) with **FTS5** for offline reader + keyword search.
- Migrations → **Drizzle Kit** (or Prisma Migrate). Full schema in [§23](#23-database-schemas).

Rationale: relational integrity for the content hierarchy + user relations; JSONB columns for
flexible fields (`wordMeaning`, `importantConcepts`) so new translation/commentary types need
**no migration** (extensibility requirement).

---

## 4. Vector database

**pgvector (Postgres extension)** for v1. Add a dedicated store only if scale demands it.

| Option | When | Notes |
|---|---|---|
| **pgvector** (recommended v1) | Now | The whole Gita is ~700 verses × a few doc types ≈ low thousands of vectors. pgvector handles this trivially; one DB to run, back up, and secure. |
| Qdrant / Weaviate | If corpus grows (multi-commentary, multi-lang chunks, hybrid search at scale) | Behind the same `VectorStore` port — swap without touching RAG logic. |

The `VectorStore` interface (`upsert/search/delete`) means this choice is reversible.

---

## 5. LLM architecture

**Provider-abstracted, RAG-grounded, cached.**

```
LLMProvider (port)
 ├─ generate(messages, opts)          → text
 ├─ stream(messages, opts)            → async token stream (→ SSE)
 ├─ generateStructured(schema, ...)   → JSON validated by zod (explanation modes, quiz gen)
 └─ embed(texts)                      → vectors (may route to a separate EmbeddingProvider)
```

- **Default adapter: Anthropic Claude** (latest available — e.g. Claude Sonnet class for
  chat, a smaller/cheaper model for structured/short tasks). Adapters for OpenAI, Gemini,
  and a **local Ollama** adapter (offline/dev/cost-zero path) all implement the same port.
- **Grounding is mandatory:** the tutor and "Ask about this verse" always run through the RAG
  pipeline (§9). The system prompt forbids inventing verses/citations and instructs the model
  to say "I'm not certain" rather than guess. Answers render a **Sources** block built from
  the *retrieved* verse IDs, not from model free-text (so citations can't be hallucinated).
- **Cost controls:** semantic + exact cache of common Q→A and per-mode explanations; trimmed
  conversation history (last N turns + a running summary); retrieve only top-k verses; short
  system prompt; structured outputs to avoid re-asking.
- **Keys never leave the backend** (§24). The app calls our API; our API calls the LLM.

---

## 6. TTS architecture

**Tiered `AudioProvider` registry** with capability-based routing. The player asks for
`(text, language, kind, voicePref)`; a **router** picks the best provider by capability +
cost hierarchy; output flows through the **chunker** and **audio cache** (§11, §14).

```
AudioProvider (port)
 ├─ synthesize(text, {voice, lang, speed})  → audio bytes/stream
 ├─ stream(text, opts)                       → chunked audio stream
 ├─ getAvailableVoices(lang?)                → Voice[]
 ├─ getSupportedLanguages()                  → Lang[]
 └─ getCapabilities()                        → { streaming, local, maxChars, sanskrit,... }
```

Routing order (the cost hierarchy, §25):
1. **Device-native** (`expo-speech`) — English/Telugu where the device supports it, $0, offline.
2. **Self-hosted open model** (FastAPI: Indic Parler-TTS / Indic-TTS / Kokoro) — for quality,
   Telugu, Sanskrit, and long-form pre-generation.
3. **Free-tier / paid cloud TTS** — only as fallback for coverage gaps.

`kind` distinguishes **`recitation`** (Sanskrit verse — §13, special path) from **`narration`**
(explanations/translations — normal TTS).

---

## 7. Current free/open-source TTS options (verified Sept 2026)

**Capability matrix** — this is the honest, current state, with licensing checked:

| Provider / Model | English | Telugu | Sanskrit | Streaming | Local (mobile) | Free & Commercial? | License | Notes |
|---|---|---|---|---|---|---|---|---|
| **Device-native** (Android `TextToSpeech`, iOS `AVSpeechSynthesizer`) | ✅ good | ⚠️ device-dependent (Google TTS `te-IN` on many Androids; iOS weak) | ❌ (no Sanskrit voice; mispronounces) | n/a (device) | ✅ **on-device, offline** | ✅ free, no license issue | Platform | Top of cost hierarchy. Use for English/Telugu narration when present. |
| **AI4Bharat Indic Parler-TTS** | ✅ | ✅ | ✅ **(Telugu + Sanskrit both listed)** | partial | ❌ (server/GPU) | ✅ **Apache-2.0** | Apache-2.0 | **Best commercial-safe option for Telugu & Sanskrit.** ~large transformer → self-host on GPU. |
| **AI4Bharat Indic-TTS** (FastPitch/VITS) | ✅ | ✅ | ✅ (13 Indic langs incl. Sanskrit) | ⚠️ | ⚠️ (server; lighter than Parler) | ✅ (verify per-checkpoint) | mixed/open | Lighter self-host; good CPU fallback for Indic. Confirm each checkpoint's license file. |
| **Kokoro-82M** | ✅ **excellent** | ❌ | ❌ | ✅ | ⚠️ (82M; server or strong device) | ✅ **Apache-2.0** | Apache-2.0 | Great English narration; **no Telugu/Sanskrit**. |
| **Piper** (`OHF-Voice/piper1-gpl`) | ✅ good | ❌ (no confirmed voice) | ❌ | ✅ | ✅ **CPU / even RPi** | ⚠️ **GPL-3.0** (engine) | GPL-3.0 | *Was* MIT (`rhasspy/piper` archived Oct 2025); fork is **GPL-3.0** → run as a separate server process (don't statically link into a closed app). English only in practice. |
| **Meta MMS-TTS** (`mms-tts-tel`) | ✅ | ✅ | ⚠️ (not confirmed) | ⚠️ | ❌ | ❌ **NON-COMMERCIAL** | **CC-BY-NC-4.0** | Telugu works well, but license blocks commercial use → **prototype/eval only**. |
| **Coqui XTTS-v2** | ✅ | ⚠️ | ❌ | ✅ | ❌ | ❌ non-commercial | **Coqui CPML** | Company defunct (Jan 2024); model license is non-commercial. Avoid. |
| Cloud (Google/Azure/ElevenLabs) | ✅ | ✅ | ❌/⚠️ | ✅ | ❌ | 💲 free tier then paid | commercial | Fallback only, per cost rule. |

**Net recommendation for the open self-hosted tier:**
- **English narration:** device-native first → **Kokoro** for premium quality.
- **Telugu narration:** device-native where present → **Indic Parler-TTS / Indic-TTS**.
- **Sanskrit:** see §8 — TTS is the *fallback*, recitation audio is primary.
- **Never ship MMS-TTS / XTTS in production** (license). Fine for internal A/B evaluation.

---

## 8. Sanskrit audio strategy

Sanskrit is treated as a **separate `kind: recitation`**, not run through English/generic TTS.

1. **Primary: curated pre-recorded recitation audio**, verse-by-verse, from a source we are
   **licensed** to use (public domain, Creative Commons, or explicitly permissioned — see §20).
   Pronunciation of chandas (metre) and sandhi matters; a real reciter beats any current TTS.
   Store as `AudioAsset(kind=recitation, source=...)` in object storage; downloadable offline.
2. **Fallback: Sanskrit-capable open TTS** — **Indic Parler-TTS** lists Sanskrit; expose it via
   a dedicated `SanskritRecitationProvider` adapter, clearly labelled "synthesized" in the UI.
3. **Never** let an English voice speak Devanagari.

Recitation controls (required): **repeat verse**, **repeat ×3**, **slow** vs **normal** speed
(separate from narration speed). Because recitations are pre-recorded/generated once, they are
fully cached and offline-friendly.

---

## 9. Telugu audio strategy

- **Narration/explanation in Telugu:** device-native `te-IN` (Google TTS) when available (free,
  offline) → else **Indic Parler-TTS / Indic-TTS** self-hosted (Apache-2.0, commercial-safe).
- **Telugu script rendering:** Noto Sans/Serif Telugu bundled with the app.
- Avoid MMS-TTS in production despite good Telugu quality (CC-BY-NC).

---

## 10. Long-form audio architecture

Never send a whole chapter to TTS in one call.

```
Text (verse | explanation | whole chapter)
  → normalize (expand abbreviations, handle Sanskrit/Telugu Unicode)
  → sentence segmentation (language-aware)
  → chunking (≤ provider maxChars, break on sentence boundaries)
  → per-chunk audioHash lookup (§14)
       ├─ hit  → reuse cached chunk from object storage
       └─ miss → synthesize → store → cache
  → ordered chunk manifest {chapterId, sectionId, [chunkIds], durations}
  → react-native-track-player queue → gapless sequential playback
```

- **Pre-generation as a background job** (BullMQ) so "play chapter" is instant after first run.
- Chunk manifest + per-chunk durations let us map playback position → verse for the "now
  playing" display and for resume.

Player controls (all required): play / pause / resume / **seek** / skip ±chunk /
**speed {0.75,1,1.25,1.5,1.75,2}** / **download for offline** / **resume from last position**.

**Resume persistence** (survives app close):
```
PlaybackState { userId, chapterId, sectionType, verseId, audioChunkId, positionSeconds, updatedAt }
```

---

## 11. Offline architecture

- **Content packs**: verse text + translations + explanations per chapter → written into the
  on-device SQLite mirror. FTS5 index built on-device for offline keyword search.
- **Audio packs**: chunk files downloaded to `expo-file-system`; a local manifest maps
  chunkId→file. Player checks local first, network second.
- **Download states** (required UI): `not_downloaded → queued → downloading → downloaded`
  (+ `failed`), tracked per chapter and per asset.
- **AI offline:** graceful degradation — cached explanations/answers are readable offline; the
  live tutor and new syntheses show a clear "needs connection" state (optionally a local Ollama
  path on capable devices, behind the same `LLMProvider`).
- Downloaded content requires **no network**; sync of user notes/progress happens opportunistically.

---

## 12. RAG architecture

```
App ──(query, optional verse context)──▶ Backend /ai
        │
        ▼
  Query builder (mode + selected verse + trimmed history)
        │
        ▼
  EmbeddingProvider.embed(query)
        │
        ▼
  VectorStore.search(topK, filters: {chapter?, concepts?, lang?})   ← pgvector
        │
        ▼
  Rerank + assemble grounded context (verses, translations, commentary — with IDs)
        │
        ▼
  LLMProvider.stream(system+context+query)   → grounded answer (SSE to app)
        │
        ▼
  Sources block built from RETRIEVED verse IDs (not model text)
```

**Indexing (offline job):** each verse becomes multiple retrievable documents — one per
`{sanskrit, translation, explanation, keywords, concepts}` — each with metadata
`{chapter, verse, chapterName, language, concepts[]}`. This is what lets *"I'm anxious about
the outcome of my work"* retrieve **2.47** even though the words differ.

**Anti-hallucination:** the model may only cite verses present in the retrieved context; the
Sources UI is generated from those IDs; low-confidence → explicit "uncertain" per your §2.

---

## 13. Complete system architecture diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  MOBILE APP (React Native + Expo, TypeScript)                      │
│  UI ▸ expo-router screens   State ▸ Zustand + TanStack Query       │
│  Reader/Player ▸ track-player   Offline ▸ SQLite(FTS5)+FileSystem  │
│  Device TTS ▸ expo-speech       Secure ▸ Keychain/Keystore         │
└───────────────┬──────────────────────────────────────────────────┘
                │ HTTPS (REST + SSE)   — tokens only, never keys
                ▼
┌──────────────────────────────────────────────────────────────────┐
│  API LAYER (NestJS)  ── OpenAPI, zod contracts, JWT auth           │
│  Modules (bounded contexts):                                       │
│   Auth │ Content │ Search │ AI/RAG │ Audio │ Progress │ Study │... │
└───┬─────────┬─────────┬─────────┬──────────┬───────────────────────┘
    │         │         │         │          │
    ▼         ▼         ▼         ▼          ▼
 Postgres  Redis    pgvector   LLM port   Audio Router
 (+Drizzle)(cache/  (RAG)      │           │
           queues)             ▼           ▼
                          LLM adapters   AudioProviders:
                          (Claude/OpenAI  device / self-host / cloud
                           /Gemini/Ollama)      │
                                                ▼
┌──────────────────────────────────────────────────────────────────┐
│  PYTHON INFERENCE SERVICE (FastAPI, GPU/CPU)                       │
│   • Embeddings (multilingual)   • Indic Parler-TTS / Indic-TTS     │
│   • Kokoro (EN)                 • Sanskrit recitation provider     │
└───────────────┬────────────────────────────────────────────────────┘
                ▼
        Object Storage (S3 / R2)  ── audio chunks + downloadable packs
```

---

## 14. Database ER diagram (conceptual)

```
User ──1:N── Bookmark ──N:1── Verse
User ──1:N── Note ──N:1── Verse
User ──1:N── Highlight ──N:1── Verse
User ──1:N── ReadingProgress ──N:1── Chapter/Verse
User ──1:N── ListeningProgress ──N:1── Chapter/Verse
User ──1:N── AIConversation ──1:N── AIMessage ──N:M── Verse (cited sources)
User ──1:N── DailyPractice (reflection/journal) ──N:1── Verse
User ──1:N── RevisionItem (SM-2 schedule) ──N:1── Verse

Chapter ──1:N── Verse
Verse ──1:N── Translation (lang, source, type)
Verse ──1:N── Commentary (lang, source, tradition)
Verse ──N:M── Concept        (keywords/themes; drives semantic filter)
Verse ──N:M── Verse (relatedVerses, self-join)

Verse/Chapter ──1:N── AudioAsset ──1:N── AudioChunk   (kind: recitation|narration; provider/voice/lang/speed)
Verse ──1:N── VerseEmbedding (docType, lang, vector)  ← pgvector

* CONTENT tables are read-mostly & shippable offline.
* All AI/derived text carries contentType + source and is NEVER mixed into scripture rows.
```

Full column-level schema in [§23](#23-database-schemas).

---

## 15. Mobile screen map

```
Onboarding / Auth
  └─ Language setup (UI lang ⟂ content lang ⟂ explanation lang)

Home  (Continue Learning • Today's Verse • Daily Reflection •
       Continue Listening • Chapters • Bookmarks • My Notes •
       AI Teacher • Search)   + progress widgets

Chapters ─▶ Chapter Detail (title/Sanskrit title/summary/theme/
             #verses/read+listen time • Start Reading • Start Listening)
             └─▶ Verse Reader  ★
                   Tabs/sections: Sanskrit • Transliteration • Translation •
                   Simple Meaning • Deeper Meaning • Practical Application
                   Actions: Ask about this verse • Explanation-mode switcher
                            (Simple/Deep/Practical/Story/Child/Telugu/Sanskrit-terms)
                            Bookmark • Highlight • Note • Mark understood/for revision
                   Audio: Read verse • Read explanation • Recite (Sanskrit) • Read chapter

AI Gita Teacher (chat, streaming, Sources block, verse-context aware)
Search (verse#/Sanskrit/EN/Te/concept/keyword + SEMANTIC)
My Gita (bookmarks • highlights • notes • understood • for-revision)
Daily Practice (Listen→Understand→Reflect→Apply→Journal)
Revision (spaced-repetition queue, recall prompts)
Now Playing / Player (chapter•verse•section•elapsed/remaining•speed•queue)
Downloads (per-chapter states) 
Settings (theme light/dark • text size • voices • languages • notifications)
```
★ = highest-priority screen.

---

## 16. Folder / project structure

```
gita/
├─ apps/
│  ├─ mobile/                 # React Native + Expo
│  │  ├─ app/                 # expo-router screens (mirror §15)
│  │  ├─ src/
│  │  │  ├─ features/         # reader, player, tutor, search, study, daily...
│  │  │  ├─ domain/           # entities + ports (TTS/LLM interfaces mirrored client-side)
│  │  │  ├─ data/             # SQLite (drizzle), API client, offline sync
│  │  │  ├─ audio/            # track-player setup, chunk queue, device-TTS adapter
│  │  │  ├─ i18n/  ui/  theme/
│  │  └─ ...
│  └─ api/                    # NestJS
│     ├─ src/modules/{auth,content,search,ai,audio,progress,study,notifications}/
│     ├─ src/ports/          # LLMProvider, TTSProvider, VectorStore, AudioProvider
│     ├─ src/adapters/       # claude/, openai/, ollama/, kokoro/, indic-tts/, pgvector/, s3/
│     └─ src/common/         # zod contracts, guards, config
├─ services/
│  └─ inference/             # FastAPI: embeddings + Indic/Kokoro/Sanskrit TTS
├─ packages/
│  ├─ contracts/             # zod schemas + generated TS types (shared app↔api)
│  └─ gita-content/          # ingestion scripts, source manifests, licenses
├─ infra/                    # docker-compose (dev), IaC, migrations
└─ docs/                     # this file, ADRs, provider matrix
```

Clean-architecture layering (§22): `domain` (pure) ← `application/services` ← `adapters/infra`.
Dependencies point inward; providers are injected.

---

## 17. Estimated infrastructure requirements

**Dev (docker-compose, $0):** Postgres+pgvector, Redis, MinIO, FastAPI inference (CPU),
Ollama optional, NestJS, Expo dev-client. Runs on a laptop.

**Small production (hundreds of users):**
- 1 small app server (NestJS) — ~1–2 vCPU / 2–4 GB.
- Managed Postgres (pgvector) — small tier.
- Redis — small managed tier.
- Object storage — **Cloudflare R2** (no egress) for audio.
- **Inference/TTS:** the only heavy piece.
  - Kokoro/Indic-TTS(VITS) run acceptably on **CPU**.
  - **Indic Parler-TTS wants a GPU** (e.g. one T4/L4) for reasonable latency. Because we
    **pre-generate and cache** audio (§14), we can run TTS as a **batch/on-demand job**, even
    spinning GPU up only for generation, keeping steady-state cost low.
- LLM: pay-per-token (cached) — dominant variable cost; mitigated by §25.

**Key cost insight:** thanks to the audio cache, the same verse/explanation is synthesized
**once ever**. Steady-state audio serving is just object-storage bandwidth (≈$0 on R2).

---

## 18. Development phases (maps to your §27)

| Phase | Deliverable | Exit test |
|---|---|---|
| **1** | *This document* + stack decisions + repo decision | You approve |
| 2 | Postgres schema + content model + **ingestion of a licensed source** (start: Ch.2) + contracts package | Verses queryable via API with correct contentType/source |
| 3 | Mobile shell: nav, theme (light/dark), fonts, i18n, Home | App runs on device; Home renders progress widgets |
| 4 | Chapter list + **Verse Reader** (all sections) + bookmarks/notes/highlights + on-device search (FTS5) | Read Ch.2 offline; bookmark+note persist |
| 5 | Audio: device-TTS adapter → chunker → track-player queue → cache → resume → downloads | Play/pause/seek/speed; resume after kill; offline playback |
| 6 | AI tutor + "Ask about this verse" + explanation modes (LLMProvider, streaming, cache) | Grounded answer with Sources; mode switch in reader |
| 7 | RAG: embeddings + pgvector index + semantic search + retrieval-grounded citations | "anxious about results" → returns 2.47 |
| 8 | Progress/My Gita, Daily Practice, Spaced Repetition (SM-2) | Revision queue schedules; journal saves privately |
| 9 | Offline packs (content+audio), download manager, sync | Airplane-mode chapter fully usable |
| 10 | Self-hosted Indic/Kokoro/Sanskrit providers, testing, perf/cost tuning, a11y pass | Telugu+Sanskrit audio; contrast/text-size; test suite green |

**Each phase:** explain → show file structure → implement → test → list problems → fix → proceed.

---

## 19. Risks and limitations

1. **Content licensing is the #1 risk** (not code). Most good modern translations/commentaries
   (e.g. Prabhupada "As It Is", Easwaran) are **copyrighted**. We must build on public-domain or
   openly-licensed sources, or obtain permission. See §20. *This gates Phase 2.*
2. **Sanskrit TTS quality** is still imperfect; hence recitation = pre-recorded primary (§8).
   Sourcing licensed recitation audio may take effort.
3. **Indic Parler-TTS needs GPU** — mitigated by pre-generation + caching (not real-time).
4. **Piper relicensed to GPL-3.0** — use as an isolated server process only; don't link into the
   app. (English-only anyway, so low impact.)
5. **AI hallucination** — mitigated by RAG grounding + citation-from-retrieval + "uncertain"
   behavior, but must be tested with adversarial theological questions.
6. **Semantic quality across 3 languages** depends on a good multilingual embedding model —
   needs evaluation in Phase 7.
7. **On-device storage** — full audio for 18 chapters in 3 languages is large; downloads are
   opt-in per chapter with clear size labels.
8. **iOS native TTS** for Indic languages is weak → rely on self-hosted for iOS Telugu/Sanskrit.
9. **Scope** — this is a large app; the phased plan exists precisely to ship value early
   (readable, listenable Ch.2) and avoid a 10k-line dump.

---

## 20. Licensing / copyright considerations

**a) Sanskrit source text** — The original Gita (Mahabharata, Bhishma Parva) is **public domain**.
Safe to include the Sanskrit and a scholarly transliteration.

**b) Translations & commentaries — the careful part.**
- **Copyrighted (do NOT copy):** Bhaktivedanta/ISKCON "Bhagavad-gītā As It Is", Eknath Easwaran,
  most 20th–21st-c. commercial translations, Gita Press modern editions.
- **Public domain / usable:** older translations out of copyright — e.g. **Kashinath Trimbak
  Telang (1882, Sacred Books of the East)**, **Edwin Arnold "The Song Celestial" (1885)**,
  **Annie Besant**. These are dated in language but legally clean.
- **Openly-licensed datasets:** some community Gita datasets/APIs publish verses under permissive
  or CC terms — **must verify the exact license and attribution terms of each before ingesting.**
- **Plan:** ingest a **known-clean source first**, store `source` + `license` per row, and design
  the schema so premium licensed translations can be added later under agreement. **Never**
  generate "translations" with the AI into the scripture tables.

**c) Telugu translation** — same rules; use PD/openly-licensed Telugu translations or commission one.

**d) Audio recordings (recitation)** — commercial recitation albums are copyrighted. Use
**public-domain / Creative-Commons recitations**, self-generated TTS (labelled), or licensed audio.
Record provenance per `AudioAsset`.

**e) TTS model licenses (verified Sept 2026):**
- ✅ **Apache-2.0 (commercial OK):** Kokoro-82M; AI4Bharat Indic Parler-TTS. Indic-TTS checkpoints —
  verify per file, generally open.
- ⚠️ **GPL-3.0:** current Piper fork (`OHF-Voice/piper1-gpl`) — isolate as a process.
- ❌ **Non-commercial (avoid in production):** Meta MMS-TTS (CC-BY-NC-4.0); Coqui XTTS-v2 (CPML).
- Device-native TTS: governed by OS terms, fine for app use.

**f) LLM outputs** — check the chosen LLM provider's commercial terms; keep AI content clearly
marked as AI-generated and non-scriptural (your §2).

---

### Sources (TTS/licensing, verified Sept 2026)
- Kokoro-82M — https://huggingface.co/hexgrad/Kokoro-82M
- AI4Bharat Indic Parler-TTS (Apache-2.0) — https://huggingface.co/ai4bharat/indic-parler-tts
- AI4Bharat Indic-TTS (Sanskrit+Telugu among 13 langs) — https://github.com/AI4Bharat/Indic-TTS
- AI4Bharat IndicF5 — https://huggingface.co/ai4bharat/IndicF5
- Piper (relicensing / GPL-3.0 fork) — https://awesome.ecosyste.ms/projects/github.com/rhasspy/piper and https://www.cekura.ai/discover/piper-tts
- Meta MMS-TTS Telugu (CC-BY-NC-4.0) — https://huggingface.co/facebook/mms-tts-tel

---

## What I need from you to start Phase 2

1. **Repo decision** (§0): new repo / subdirectory / replace?
2. **Stack sign-off:** React Native+Expo + NestJS + Postgres/pgvector + Python-FastAPI inference — OK, or do you prefer **Flutter** and/or a different backend?
3. **Default LLM provider** (Claude recommended) and whether an **offline Ollama** path matters to you.
4. **Content source** for Phase 2 ingestion — approve starting with a **public-domain translation**
   (Telang/Arnold) so we're legally clean, or do you have a specific licensed source in mind?
5. Anything to add/drop from the phase plan.

On approval I'll start **Phase 2** (schema + content model + ingestion of Chapter 2), and follow
your explain→build→test→fix loop each phase.
