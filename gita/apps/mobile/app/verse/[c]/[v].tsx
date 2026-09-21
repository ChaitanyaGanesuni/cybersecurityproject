import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  buildVerseViewModel,
  createTranslator,
  highlightForVerse,
  notesForVerse,
  radii,
  spacing,
  typeScale,
  type HighlightColor,
  type SourcedBlock,
} from "@gita/core";
import { getRepository } from "../../../src/data/content";
import { useUserStore } from "../../../src/state/user";
import { useTheme } from "../../../src/theme/theme";
import { Screen, Card, Body, Muted, SectionLabel, AiBadge } from "../../../src/components/ui";

const HIGHLIGHT_COLORS: HighlightColor[] = ["saffron", "green", "blue"];

/** A small pill toggle used by the study controls. */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        backgroundColor: active ? colors.accent : colors.surfaceAlt,
        borderRadius: radii.pill,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <Text style={{ color: active ? "#fff" : colors.text, fontSize: typeScale.caption, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

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
  const setHighlight = useUserStore((s) => s.setHighlight);
  const toggleUnderstood = useUserStore((s) => s.toggleUnderstood);
  const toggleForRevision = useUserStore((s) => s.toggleForRevision);
  const addNote = useUserStore((s) => s.addNote);
  const deleteNote = useUserStore((s) => s.deleteNote);
  const t = createTranslator(language.uiLang);

  const [draftNote, setDraftNote] = useState("");

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

      {/* Personal study controls (spec §17) */}
      <Card>
        <SectionLabel>Study</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md }}>
          <Chip
            label={vm.isBookmarked ? "★ Bookmarked" : "☆ Bookmark"}
            active={vm.isBookmarked}
            onPress={() => toggleBookmark(chapterNumber, verseNumber)}
          />
          <Chip
            label="Understood"
            active={user.understood.includes(vm.key)}
            onPress={() => toggleUnderstood(chapterNumber, verseNumber)}
          />
          <Chip
            label="For revision"
            active={user.forRevision.includes(vm.key)}
            onPress={() => toggleForRevision(chapterNumber, verseNumber)}
          />
        </View>

        <Muted>Highlight</Muted>
        <View style={{ flexDirection: "row", gap: spacing.sm, marginVertical: spacing.sm }}>
          {HIGHLIGHT_COLORS.map((c) => {
            const current = highlightForVerse(user, vm.key)?.color;
            return (
              <Chip
                key={c}
                label={c}
                active={current === c}
                onPress={() => setHighlight(chapterNumber, verseNumber, current === c ? null : c)}
              />
            );
          })}
        </View>

        <Muted>Notes</Muted>
        {notesForVerse(user, vm.key).map((n) => (
          <Pressable key={n.id} onLongPress={() => deleteNote(n.id)}>
            <View
              style={{
                backgroundColor: colors.surfaceAlt,
                borderRadius: radii.sm,
                padding: spacing.sm,
                marginTop: spacing.sm,
              }}
            >
              <Body>{n.text}</Body>
              <Muted>long-press to delete</Muted>
            </View>
          </Pressable>
        ))}
        <TextInput
          value={draftNote}
          onChangeText={setDraftNote}
          placeholder="Add a private note…"
          placeholderTextColor={colors.textMuted}
          multiline
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radii.sm,
            padding: spacing.sm,
            color: colors.text,
            marginTop: spacing.sm,
            minHeight: 44,
          }}
        />
        <Pressable
          onPress={() => {
            if (draftNote.trim()) {
              addNote(chapterNumber, verseNumber, draftNote);
              setDraftNote("");
            }
          }}
          style={{ alignSelf: "flex-start", marginTop: spacing.sm }}
        >
          <Text style={{ color: colors.accent, fontWeight: "600" }}>Save note</Text>
        </Pressable>
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
