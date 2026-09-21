import React, { useMemo } from "react";
import { View } from "react-native";
import { Link, useRouter } from "expo-router";
import {
  buildHome,
  createTranslator,
  spacing,
  type HomeViewModel,
} from "@gita/core";
import { getRepository } from "../src/data/content";
import { useUserStore } from "../src/state/user";
import { Screen, Card, Title, Body, Muted, SectionLabel } from "../src/components/ui";

export default function HomeScreen() {
  const router = useRouter();
  const repo = getRepository();
  const user = useUserStore((s) => s.user);
  const uiLang = useUserStore((s) => s.language.uiLang);
  const t = useMemo(() => createTranslator(uiLang), [uiLang]);
  const home: HomeViewModel = useMemo(() => buildHome(repo, user, new Date()), [repo, user]);

  const go = (c: number, v: number) => router.push(`/verse/${c}/${v}`);

  return (
    <Screen>
      {home.continueLearning && (
        <Card onPress={() => go(home.continueLearning!.chapterNumber, home.continueLearning!.verseNumber)}>
          <SectionLabel>{t("home.continueLearning")}</SectionLabel>
          <Title>{home.continueLearning.label}</Title>
        </Card>
      )}

      <Card onPress={() => go(home.todaysVerse.chapterNumber, home.todaysVerse.verseNumber)}>
        <SectionLabel>{t("home.todaysVerse")}</SectionLabel>
        <Title>
          Chapter {home.todaysVerse.chapterNumber}, Verse {home.todaysVerse.verseNumber}
        </Title>
      </Card>

      {home.continueListening && (
        <Card onPress={() => go(home.continueListening!.chapterNumber, home.continueListening!.verseNumber)}>
          <SectionLabel>{t("home.continueListening")}</SectionLabel>
          <Body>{home.continueListening.label}</Body>
        </Card>
      )}

      <Card onPress={() => router.push("/chapters")}>
        <SectionLabel>{t("home.chapters")}</SectionLabel>
        <Title>All 18 chapters</Title>
        <Muted>
          {home.totalChapters} chapters · {home.totalVerses} verses
        </Muted>
      </Card>

      <Card onPress={() => router.push("/search")}>
        <SectionLabel>{t("home.search")}</SectionLabel>
        <Muted>Find a verse, a concept, or a reference like 2.47</Muted>
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Card onPress={() => router.push("/library")}>
            <SectionLabel>{t("home.bookmarks")}</SectionLabel>
            <Title>{home.bookmarkCount}</Title>
          </Card>
        </View>
        <View style={{ flex: 1 }}>
          <Card onPress={() => router.push("/library")}>
            <SectionLabel>{t("home.notes")}</SectionLabel>
            <Body>My Gita →</Body>
          </Card>
        </View>
      </View>

      <Card>
        <SectionLabel>{t("home.aiTeacher")}</SectionLabel>
        <Muted>Grounded AI tutor arrives in Phase 6.</Muted>
      </Card>

      <Muted>
        Or{" "}
        <Link href="/chapters" style={{ textDecorationLine: "underline" }}>
          browse all chapters
        </Link>
      </Muted>
    </Screen>
  );
}
