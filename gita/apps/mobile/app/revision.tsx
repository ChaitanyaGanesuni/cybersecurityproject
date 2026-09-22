import React, { useMemo } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { dueItems, nextDue, spacing, type ReviewGrade } from "@gita/core";
import { getRepository } from "../src/data/content";
import { useUserStore } from "../src/state/user";
import { Screen, Card, Body, Muted, SectionLabel, Chip } from "../src/components/ui";

const GRADES: ReviewGrade[] = ["again", "hard", "good", "easy"];

export default function RevisionScreen() {
  const router = useRouter();
  const repo = getRepository();
  const now = useMemo(() => new Date(), []);
  const items = useUserStore((s) => s.user.revisionItems);
  const reviewRevision = useUserStore((s) => s.reviewRevision);

  const due = dueItems(items, now);
  const upcoming = nextDue(items.filter((i) => !due.includes(i)));

  const verseFor = (key: string) => {
    const [c, v] = key.split(".");
    return repo.getVerse({ chapterNumber: Number(c), verseNumber: Number(v) });
  };

  return (
    <Screen>
      <Card>
        <SectionLabel>Revision</SectionLabel>
        <Muted>
          {items.length === 0
            ? "Mark verses “for revision” and they’ll be scheduled here (Day 1 → 2 → 4 → 7 → 14…)."
            : `${due.length} due now · ${items.length} in your schedule`}
        </Muted>
      </Card>

      {due.map((item) => {
        const verse = verseFor(item.verseKey);
        const tr = verse ? repo.translationFor(verse, "en") : null;
        return (
          <Card key={item.verseKey}>
            <SectionLabel>{item.verseKey}</SectionLabel>
            <Muted>What does this verse teach? Recall, then reveal.</Muted>
            {tr && <Body>{tr.text}</Body>}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
              {GRADES.map((g) => (
                <Chip key={g} label={g} active={false} onPress={() => reviewRevision(item.verseKey, g)} />
              ))}
            </View>
          </Card>
        );
      })}

      {due.length === 0 && items.length > 0 && upcoming && (
        <Muted>
          Nothing due right now. Next review: {upcoming.verseKey} on{" "}
          {new Date(upcoming.dueAt).toLocaleDateString()}.
        </Muted>
      )}

      {items.length > 0 && (
        <Card onPress={() => router.push("/library")} style={{ marginTop: spacing.md }}>
          <Muted>Manage marked verses in My Gita →</Muted>
        </Card>
      )}
    </Screen>
  );
}
