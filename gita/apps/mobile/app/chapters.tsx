import React, { useMemo } from "react";
import { useRouter } from "expo-router";
import { buildChapterCard } from "@gita/core";
import { getRepository } from "../src/data/content";
import { useUserStore } from "../src/state/user";
import { Screen, Card, Title, Muted, SectionLabel } from "../src/components/ui";

export default function ChaptersScreen() {
  const router = useRouter();
  const repo = getRepository();
  const user = useUserStore((s) => s.user);

  const cards = useMemo(
    () =>
      repo
        .listChapters()
        .map((c) => buildChapterCard(repo, c.chapterNumber, user))
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [repo, user],
  );

  return (
    <Screen>
      {cards.map((c) => (
        <Card key={c.chapterNumber} onPress={() => router.push(`/chapter/${c.chapterNumber}`)}>
          <SectionLabel>
            Chapter {c.chapterNumber} · {c.nameSanskrit}
          </SectionLabel>
          <Title>{c.nameTransliterated}</Title>
          <Muted>{c.nameTranslation}</Muted>
          <Muted>
            {c.progressLabel} · read {c.readingTime} · listen {c.listeningTime}
          </Muted>
        </Card>
      ))}
    </Screen>
  );
}
