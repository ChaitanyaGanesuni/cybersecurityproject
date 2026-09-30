import Fastify from "fastify";
import { z } from "zod";
import type { RetrievedVerse } from "@gita/ai";
import { loadConfig } from "./config.js";
import { buildServices } from "./services.js";

const config = loadConfig();
const services = buildServices(config);
const app = Fastify({ logger: true });

/* ---- CORS (mobile app origin) ---- */
app.addHook("onRequest", async (req, reply) => {
  reply.header("access-control-allow-origin", config.corsOrigin);
  reply.header("access-control-allow-headers", "content-type");
  reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") reply.code(204).send();
});

/* ---- schemas mirror the app's AiClient contract ---- */
const retrievedVerse = z.object({
  ref: z.object({ chapterNumber: z.number(), verseNumber: z.number() }),
  sanskrit: z.string(),
  transliteration: z.string(),
  translation: z.string().nullable(),
  wordMeaning: z.string().nullable().optional(),
  translationSource: z.string().nullable().optional(),
});
const explainBody = z.object({
  verse: retrievedVerse,
  mode: z.enum(["simple", "deep", "practical", "story", "child", "telugu", "sanskritContext"]),
  lang: z.enum(["sa", "en", "te", "hi"]),
});
const askBody = z.object({
  question: z.string().min(1),
  retrieved: z.array(retrievedVerse).optional(),
  lang: z.enum(["sa", "en", "te", "hi"]).default("en"),
});

/* ---- routes ---- */
app.get("/health", async () => ({ status: "ok", provider: services.providerName }));

app.get("/content/chapters", async () => services.repo.listChapters());

app.get<{ Params: { c: string; v: string } }>("/content/verse/:c/:v", async (req, reply) => {
  const verse = services.repo.getVerse({
    chapterNumber: Number(req.params.c),
    verseNumber: Number(req.params.v),
  });
  if (!verse) return reply.code(404).send({ error: "verse not found" });
  return verse;
});

app.post("/ai/explain", async (req, reply) => {
  const parsed = explainBody.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const { verse, mode, lang } = parsed.data;
  return services.tutor.explainVerse(verse as RetrievedVerse, mode, lang);
});

app.post("/ai/ask", async (req, reply) => {
  const parsed = askBody.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
  const { question, retrieved, lang } = parsed.data;
  // Retrieve server-side when the client didn't (keeps retrieval logic centralised).
  const verses = retrieved ?? (await services.retriever.retrieve(question, 5));
  return services.tutor.ask(question, verses as RetrievedVerse[], [], lang);
});

app.post("/tts", async (_req, reply) => {
  if (!config.inferenceUrl) {
    return reply.code(501).send({ error: "TTS inference service not configured (set INFERENCE_URL)" });
  }
  // Thin proxy to the FastAPI inference service.
  const res = await fetch(`${config.inferenceUrl}/tts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(_req.body),
  });
  reply.code(res.status);
  return res.json();
});

app
  .listen({ port: config.port, host: config.host })
  .then((addr) => app.log.info(`Gita API on ${addr} (provider: ${services.providerName})`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
