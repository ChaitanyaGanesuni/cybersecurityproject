import React, { useMemo } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { buildChapterDetail, createTranslator, spacing } from "@gita/core";
import { getRepository } from "../../src/data/content";
import { useUserStore } from "../../src/state/user";
import { Screen, Card, Title, Body, Muted, SectionLabel } from "../../src/components/ui";

export default function ChapterScreen() {
  const { n } = useLocalSearchParams<{ n: string }>();
  const chapterNumber = Number(n);
  const router = useRouter();
  const repo = getRepository();
  const user = useUserStore((s) => s.user);
  const language = useUserStore((s) => s.language);
  const t = createTranslator(language.uiLang);

  const detail = useMemo(
    () => buildChapterDetail(repo, chapterNumber, language, user),
    [repo, chapterNumber, language, user],
  );

  if (!detail) {
    return (
      <Screen>
        <Muted>Chapter not found.</Muted>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: `Chapter ${detail.chapterNumber}` }} />

      <Card>
        <SectionLabel>Chapter {detail.chapterNumber} · {detail.nameSanskrit}</SectionLabel>
        <Title>{detail.nameTransliterated}</Title>
        <Muted>{detail.nameTranslation}</Muted>
        <Body>{detail.summary}</Body>
        <Muted>
          {detail.versesCount} verses · read {detail.readingTime} · listen {detail.listeningTime}
        </Muted>
      </Card>

      <Card onPress={() => router.push(`/verse/${detail.chapterNumber}/1`)} style={{ marginBottom: spacing.lg }}>
        <Title>{t("common.startReading")}</Title>
        <Muted>Begin at verse 1</Muted>
      </Card>

      {detail.verses.map((v) => (
        <Card key={v.key} onPress={() => router.push(`/verse/${v.chapterNumber}/${v.verseNumber}`)}>
          <SectionLabel>Verse {v.verseNumber}{v.isBookmarked ? " · ★" : ""}</SectionLabel>
          <Body>{v.transliteration.text.split("\n")[0]}</Body>
          {v.translation && <Muted>{v.translation.text}</Muted>}
        </Card>
      ))}
    </Screen>
  );
}
