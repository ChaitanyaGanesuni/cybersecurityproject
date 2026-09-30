# Gita inference service (FastAPI)

Hosts the ML-native workloads the Node API delegates to: **multilingual embeddings** for RAG and
**open-model TTS**. Only the Node API talks to this service; the app never does.

## Run

```bash
cd services/inference
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000
# → http://localhost:8000/health
```

Then point the API at it: `INFERENCE_URL=http://localhost:8000 npm run start -w @gita/api`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | status + active embedder/TTS |
| POST | `/embed` | `{texts:[...]}` → normalized embeddings (real model if installed, deterministic fallback otherwise) |
| POST | `/tts` | open-model synthesis (**501** until a provider is wired) |
| GET | `/tts/providers` | capability matrix |

## Models & licensing (verified Sept 2026)

**Embeddings.** Default target `intfloat/multilingual-e5-small` (MIT) — covers English/Telugu/Hindi
well. Alternatives: AI4Bharat encoders. Without the model installed the service uses a deterministic
fallback so the RAG pipeline still runs and is testable; **swap in the real model for production
semantic quality.**

**TTS (commercial-safe, open):**
- **English narration** → **Kokoro-82M** (Apache-2.0), CPU-capable.
- **Telugu & Sanskrit** → **AI4Bharat Indic-Parler-TTS** (Apache-2.0); transformer → GPU recommended.
- **Avoid in production:** Meta MMS-TTS (CC-BY-NC), Coqui XTTS (non-commercial). Piper is now GPL-3.0
  (run as a separate process; English only in practice).

Because audio is generated once and cached by the app's `audioHash`, TTS can run as an on-demand
batch job — GPU spun up only for generation, keeping steady-state cost low.
