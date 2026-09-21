import React, { useEffect, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  buildVerseViewModel,
  createTranslator,
  spacing,
  typeScale,
  type SourcedBlock,
} from "@gita/core";
import { getRepository } from "../../../src/data/content";
import { useUserStore } from "../../../src/state/user";
import { useTheme } from "../../../src/theme/theme";
import { Screen, Card, Body, Muted, SectionLabel, AiBadge } from "../../../src/components/ui";

/** One labelled section of the verse. Renders the AI badge + omits attribution for AI content. */
function VerseSection({
  label,
  block,
  emphasize,
}: {
  label: string;
  block: SourcedBlock | null;
  emphasize?: "sanskrit";
}) {
  const { colors } = useTheme();
  if (!block) return null;
  return (
    <Card>
      <SectionLabel>{label}</SectionLabel>
      {block.isAi && <AiBadge />}
      <Text
        style={{
          color: emphasize === "sanskrit" ? colors.sanskrit : colors.text,
          fontSize: emphasize === "sanskrit" ? typeScale.sanskrit : typeScale.body,
          lineHeight: emphasize === "sanskrit" ? 40 : 26,
        }}
      >
        {block.text}
      </Text>
      {block.attribution && (
        <View style={{ marginTop: spacing.sm }}>
          <Muted>Source: {block.attribution}</Muted>
        </View>
      )}
    </Card>
  );
}

export default function VerseScreen() {
  const { c, v } = useLocalSearchParams<{ c: string; v: string }>();
  const chapterNumber = Number(c);
  const verseNumber = Number(v);
  const router = useRouter();
  const repo = getRepository();
  const { colors } = useTheme();

  const language = useUserStore((s) => s.language);
  const user = useUserStore((s) => s.user);
  const markRead = useUserStore((s) => s.markRead);
  const toggleBookmark = useUserStore((s) => s.toggleBookmark);
  const t = createTranslator(language.uiLang);

  const verse = repo.getVerse({ chapterNumber, verseNumber });

  // Mark as read when opened.
  useEffect(() => {
    if (verse) markRead(chapterNumber, verseNumber);
  }, [chapterNumber, verseNumber, verse, markRead]);

  const vm = useMemo(
    () => (verse ? buildVerseViewModel(repo, verse, language, user) : null),
    [repo, verse, language, user],
  );

  if (!vm) {
    return (
      <Screen>
        <Muted>Verse not found.</Muted>
      </Screen>
    );
  }

  const chapterVerses = repo.getVersesForChapter(chapterNumber);
  const hasNext = verseNumber < chapterVerses.length;
  const hasPrev = verseNumber > 1;

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: `${chapterNumber}.${verseNumber}`,
          headerRight: () => (
            <Pressable onPress={() => toggleBookmark(chapterNumber, verseNumber)}>
              <Text style={{ color: colors.accent, fontSize: 20 }}>
                {vm.isBookmarked ? "★" : "☆"}
              </Text>
            </Pressable>
          ),
        }}
      />

      <VerseSection label={t("verse.sanskrit")} block={vm.sanskrit} emphasize="sanskrit" />
      <VerseSection label={t("verse.transliteration")} block={vm.transliteration} />

      {vm.translation ? (
        <VerseSection label={t("verse.translation")} block={vm.translation} />
      ) : (
        <Card>
          <SectionLabel>{t("verse.translation")}</SectionLabel>
          <Muted>{t("verse.noTranslationYet")}</Muted>
        </Card>
      )}

      {/* AI-derived sections — populated at runtime in Phase 6; shown as pending until then. */}
      {vm.simpleMeaning ? (
        <VerseSection label={t("verse.simpleMeaning")} block={vm.simpleMeaning} />
      ) : (
        <Card>
          <SectionLabel>{t("verse.simpleMeaning")}</SectionLabel>
          <AiBadge />
          <Muted>Generated on demand by the AI tutor (Phase 6).</Muted>
        </Card>
      )}

      <Card onPress={() => router.push("/chapters")}>
        <SectionLabel>{t("verse.askAboutThis")}</SectionLabel>
        <Muted>Opens the grounded AI tutor with this verse as context (Phase 6).</Muted>
      </Card>

      <View style={{ flexDirection: "row", gap: spacing.md }}>
        {hasPrev && (
          <View style={{ flex: 1 }}>
            <Card onPress={() => router.replace(`/verse/${chapterNumber}/${verseNumber - 1}`)}>
              <Body>← Previous</Body>
            </Card>
          </View>
        )}
        {hasNext && (
          <View style={{ flex: 1 }}>
            <Card onPress={() => router.replace(`/verse/${chapterNumber}/${verseNumber + 1}`)}>
              <Body>Next →</Body>
            </Card>
          </View>
        )}
      </View>
    </Screen>
  );
}
