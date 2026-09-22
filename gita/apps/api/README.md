# @gita/api — backend

Thin HTTP layer over the tested `@gita/*` domain packages. Its job is to **hold the LLM/TTS keys**
(spec §24) and serve grounded AI, content, and a TTS proxy to the app. All the real logic
(grounding, citation guard, retrieval, caching) lives in `@gita/ai` / `@gita/rag` and is unit-tested;
this service just wires and exposes it.

> Framework note: implemented on **Fastify** so it boots and is verifiable in seconds; the routes are
> a thin adapter, so moving to NestJS modules (per the architecture doc) is a mechanical refactor
> that doesn't touch the domain packages.

## Run

```bash
cp apps/api/.env.example apps/api/.env    # optionally add GEMINI_API_KEY
npm run start -w @gita/api                # boots with mock provider if no key
# → http://localhost:8080/health
```

With no `GEMINI_API_KEY`, the server runs the **deterministic mock provider** (no network), so every
endpoint works offline for development. Add a free-tier Gemini key to get real answers.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | status + active provider |
| GET | `/content/chapters` | all chapters |
| GET | `/content/verse/:c/:v` | one verse |
| POST | `/ai/explain` | `{verse, mode, lang}` → grounded, cited explanation |
| POST | `/ai/ask` | `{question, retrieved?, lang}` → grounded answer (server retrieves if `retrieved` omitted) |
| POST | `/tts` | proxy to the FastAPI inference service (`501` until `INFERENCE_URL` is set) |

`/ai/*` responses always carry `citations` and `sources` built from the retrieved set — the model
cannot cite a verse that wasn't retrieved.

## Point the app at it

Set `expo.extra.aiBackendUrl` in `apps/mobile/app.json` (or via app config) to this server's URL.
When unset, the app uses its honest offline grounded client. The app never receives a key.
