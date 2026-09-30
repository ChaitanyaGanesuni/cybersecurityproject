import React, { useMemo } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { buildMyGita, spacing } from "@gita/core";
import { getRepository } from "../src/data/content";
import { useUserStore } from "../src/state/user";
import { Screen, Card, Body, Muted, SectionLabel, Title } from "../src/components/ui";

export default function LibraryScreen() {
  const router = useRouter();
  const repo = getRepository();
  const user = useUserStore((s) => s.user);
  const myGita = useMemo(() => buildMyGita(repo, user), [repo, user]);

  const { counts } = myGita;

  return (
    <Screen>
      <Card>
        <SectionLabel>My Gita</SectionLabel>
        <Title>Your learning journey</Title>
        <Muted>
          {counts.bookmarks} bookmarks · {counts.notes} notes · {counts.highlights} highlights ·{" "}
          {counts.understood} understood · {counts.forRevision} to revise
        </Muted>
      </Card>

      {myGita.entries.length === 0 && (
        <Muted>Bookmark, highlight, or note a verse and it will appear here.</Muted>
      )}

      {myGita.entries.map((e) => (
        <Card key={e.key} onPress={() => router.push(`/verse/${e.ref.chapterNumber}/${e.ref.verseNumber}`)}>
          <SectionLabel>
            {e.key}
            {e.bookmarked ? " · ★" : ""}
            {e.highlighted ? " · ▍" : ""}
            {e.understood ? " · ✓" : ""}
            {e.forRevision ? " · ↻" : ""}
            {e.noteCount > 0 ? ` · ${e.noteCount} note${e.noteCount > 1 ? "s" : ""}` : ""}
          </SectionLabel>
          {e.snippet ? <Body>{e.snippet}</Body> : null}
        </Card>
      ))}

      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}
