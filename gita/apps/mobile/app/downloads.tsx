import React, { useMemo } from "react";
import { initialDownloadState, summarize } from "@gita/core";
import { getRepository } from "../src/data/content";
import { Screen, Card, Body, Muted, SectionLabel } from "../src/components/ui";

/**
 * Text content ships bundled, so every chapter is available offline from first launch — the app
 * needs no network for reading, search, notes, or study. This screen reflects that honestly and
 * previews the audio-pack download states (spec §15) that activate once server/open-model TTS
 * produces cacheable files; device-native narration is realtime and needs no download.
 */
export default function DownloadsScreen() {
  const repo = getRepository();
  const state = useMemo(() => initialDownloadState(repo), [repo]);
  const counts = summarize(state);

  return (
    <Screen>
      <Card>
        <SectionLabel>Offline</SectionLabel>
        <Body>All text content is available offline.</Body>
        <Muted>
          {counts.downloaded} of {repo.listChapters().length} chapters bundled — reading, search,
          notes, and study work with no connection.
        </Muted>
      </Card>

      <Card>
        <SectionLabel>Audio packs</SectionLabel>
        <Muted>
          Device narration plays in realtime and needs no download. Downloadable offline audio
          (states: not downloaded · queued · downloading · downloaded) activates when a server/
          open-model TTS provider produces cacheable files — the queue is already implemented.
        </Muted>
      </Card>

      {repo.listChapters().map((ch) => (
        <Card key={ch.chapterNumber}>
          <SectionLabel>Chapter {ch.chapterNumber} · {ch.nameTransliterated}</SectionLabel>
          <Body>Content: ✓ Downloaded (bundled)</Body>
          <Muted>Audio: realtime device voice · offline pack coming with server TTS</Muted>
        </Card>
      ))}
    </Screen>
  );
}
