/**
 * Audio engine tests — pure logic, no hardware. Run: `npm test -w @gita/audio`.
 */
import {
  audioHash,
  buildChunkPlan,
  chunkSentences,
  InMemoryAudioCache,
  normalizeText,
  ProviderRegistry,
  segmentSentences,
  synthesizePlan,
  playbackReducer,
  initialPlaybackState,
  elapsedSeconds,
  remainingSeconds,
  totalSeconds,
  deriveResume,
  applyResume,
  formatClock,
  expandRecitationQueue,
  SPEED_OPTIONS,
  UnsupportedSynthesisError,
  type AudioProvider,
  type PlaybackState,
  type QueueItem,
} from "../src/index.js";

let passed = 0;
const failures: string[] = [];
const ok = (c: boolean, m: string) => (c ? passed++ : failures.push(m));
const eq = <T,>(a: T, b: T, m: string) =>
  JSON.stringify(a) === JSON.stringify(b) ? passed++ : failures.push(`${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

/* ---- test providers ---- */
class FakeFileProvider implements AudioProvider {
  id = "fake-file";
  synthCalls = 0;
  getCapabilities() {
    return { producesData: true, streaming: true, local: false, free: true, maxChars: 40, languages: ["en", "sa", "te"] as const as any, supportsSanskrit: true };
  }
  getSupportedLanguages() { return ["en", "sa", "te"] as any; }
  getAvailableVoices() { return [{ id: "v1", name: "V1", lang: "en" as any }]; }
  async synthesize(req: any) {
    this.synthCalls++;
    return { uri: `mem://${req.text.length}`, mimeType: "audio/wav", durationSeconds: req.text.length / 10, bytes: req.text.length };
  }
}
class DeviceProvider implements AudioProvider {
  id = "device";
  getCapabilities() {
    return { producesData: false, streaming: false, local: true, free: true, maxChars: 4000, languages: ["en", "te"] as any, supportsSanskrit: false };
  }
  getSupportedLanguages() { return ["en", "te"] as any; }
  getAvailableVoices() { return []; }
  async synthesize(): Promise<any> { throw new UnsupportedSynthesisError(this.id); }
}

/* ---- segmentation ---- */
eq(normalizeText("  a   b \n c "), "a b c", "normalizeText collapses whitespace");
eq(segmentSentences("First one. Second two! Third?", "en").length, 3, "english sentence split");
eq(segmentSentences("e.g. this stays one sentence.", "en").length, 1, "abbreviation not split");
eq(segmentSentences("कर्मण्येवाधिकारस्ते।। मा फलेषु।।", "sa").length, 2, "danda split for Sanskrit");
eq(segmentSentences("", "en").length, 0, "empty text -> no sentences");

/* ---- chunking ---- */
const chunks = chunkSentences(["aaaa.", "bbbb.", "cccc."], 12);
ok(chunks.every((c) => c.length <= 12), "no chunk exceeds maxChars");
ok(chunks.length >= 1 && chunks.join(" ").includes("aaaa"), "chunks preserve content");
const longOne = chunkSentences(["this sentence is definitely longer than the limit"], 10);
ok(longOne.every((c) => c.length <= 10), "over-long sentence hard-split within maxChars");

/* ---- hashing ---- */
const base = { text: "hello", voiceId: "v1", providerId: "p", lang: "en", speed: 1 };
eq(audioHash(base), audioHash({ ...base }), "hash deterministic for identical input");
ok(audioHash(base) !== audioHash({ ...base, speed: 1.5 }), "speed changes hash");
ok(audioHash(base) !== audioHash({ ...base, voiceId: "v2" }), "voice changes hash");
ok(audioHash(base) !== audioHash({ ...base, lang: "te" }), "lang changes hash");
ok(/^[0-9a-f]{16}$/.test(audioHash(base)), "hash is 16 hex chars");

/* ---- pipeline + cache (generate once, reuse thereafter) ---- */
await (async () => {
  const provider = new FakeFileProvider();
  const cache = new InMemoryAudioCache();
  const text = "First sentence here. Second sentence here. Third one goes here too.";
  const plan = buildChunkPlan(text, provider, { lang: "en", voiceId: "v1", speed: 1, kind: "narration" });
  ok(plan.chunks.length >= 2, "plan produced multiple chunks");

  const r1 = await synthesizePlan(plan, provider, cache);
  eq(r1.reused, 0, "first run: nothing reused");
  eq(r1.generated, plan.chunks.length, "first run: all chunks generated");
  const callsAfterFirst = provider.synthCalls;

  const r2 = await synthesizePlan(plan, provider, cache);
  eq(r2.generated, 0, "second run: nothing regenerated (cache hit)");
  eq(r2.reused, plan.chunks.length, "second run: all reused");
  eq(provider.synthCalls, callsAfterFirst, "provider not called again on cache hit");

  // Device (no data) provider is rejected by the pipeline.
  const devPlan = buildChunkPlan("hi. there.", new DeviceProvider(), { lang: "en", voiceId: "d", speed: 1, kind: "narration" });
  let threw = false;
  try {
    await synthesizePlan(devPlan, new DeviceProvider(), cache);
  } catch (e) {
    threw = e instanceof UnsupportedSynthesisError;
  }
  ok(threw, "direct-speak provider rejected by data pipeline");
})();

/* ---- router: cost hierarchy + capability ---- */
{
  const reg = new ProviderRegistry().register(new FakeFileProvider()).register(new DeviceProvider());
  // English narration, no data needed -> device (cheapest) wins.
  eq(reg.select({ lang: "en", kind: "narration" })?.id, "device", "device chosen for cheap EN narration");
  // Needs cacheable data -> device excluded, file provider chosen.
  eq(reg.select({ lang: "en", kind: "narration", needsData: true })?.id, "fake-file", "data need -> file provider");
  // Sanskrit recitation -> only Sanskrit-capable provider.
  eq(reg.select({ lang: "sa", kind: "recitation" })?.id, "fake-file", "sanskrit recitation -> capable provider");
  // Telugu supported by both; cheapest (device) wins.
  eq(reg.select({ lang: "te", kind: "narration" })?.id, "device", "telugu -> device cheapest");
}

/* ---- playback reducer ---- */
{
  const queue: QueueItem[] = [
    { index: 0, hash: "a", durationSeconds: 10 },
    { index: 1, hash: "b", durationSeconds: 20 },
    { index: 2, hash: "c", durationSeconds: 5 },
  ];
  let s: PlaybackState = playbackReducer(initialPlaybackState, {
    type: "load", queue, chapterNumber: 2, verseNumber: null, sectionType: "chapter",
  });
  eq(s.status, "playing", "load starts playing");
  eq(totalSeconds(s), 35, "total duration");

  s = playbackReducer(s, { type: "tick", deltaSeconds: 12 }); // crosses chunk 0 (10s) into chunk 1 (+2s)
  eq(s.currentIndex, 1, "tick advances across chunk boundary");
  eq(s.positionSeconds, 2, "position within new chunk");
  eq(elapsedSeconds(s), 12, "elapsed across queue");
  eq(remainingSeconds(s), 23, "remaining across queue");

  s = playbackReducer(s, { type: "setSpeed", speed: 1.5 });
  eq(s.speed, 1.5, "speed set");
  ok(SPEED_OPTIONS.includes(s.speed), "speed is a valid option");

  const skipped = playbackReducer(s, { type: "skipNext" });
  eq(skipped.currentIndex, 2, "skipNext advances");
  eq(skipped.positionSeconds, 0, "skipNext resets position");

  // skipPrev restarts current chunk when >3s in.
  const back = playbackReducer({ ...s, positionSeconds: 5 }, { type: "skipPrev" });
  eq(back.positionSeconds, 0, "skipPrev restarts chunk when >3s in");
  eq(back.currentIndex, 1, "skipPrev keeps index when restarting");

  // tick past the end pauses at the final position.
  const ended = playbackReducer(s, { type: "tick", deltaSeconds: 999 });
  eq(ended.status, "paused", "ends paused at queue end");
  eq(ended.currentIndex, 2, "ends on last chunk");

  // resume snapshot round-trip
  const snap = deriveResume(s)!;
  eq(snap.audioChunkId, "b", "resume snapshot captures current chunk hash");
  eq(snap.positionSeconds, 2, "resume snapshot captures position");
  const applied = applyResume(queue, snap);
  eq(applied, { startIndex: 1, startPosition: 2 }, "applyResume finds the chunk by hash");
  const missing = applyResume([{ index: 0, hash: "z", durationSeconds: 1 }], snap);
  eq(missing, { startIndex: 0, startPosition: 0 }, "applyResume falls back when chunk absent");
}

/* ---- recitation repeat + clock formatting ---- */
{
  const base: QueueItem[] = [{ index: 0, hash: "r", durationSeconds: 8 }];
  eq(expandRecitationQueue(base, 3).length, 3, "repeat 3x expands queue");
  eq(expandRecitationQueue(base, 1).length, 1, "repeat 1x unchanged");
  eq(expandRecitationQueue(base, 3).map((x) => x.index), [0, 1, 2], "repeated items reindexed");
  eq(formatClock(0), "0:00", "clock 0");
  eq(formatClock(75), "1:15", "clock mm:ss");
}

if (failures.length) {
  console.error(`✗ audio tests FAILED: ${failures.length} failure(s), ${passed} passed`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`✓ audio tests passed: ${passed} assertions`);
