import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
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
import type { LanguageCode } from "@gita/contracts";
import { SPEED_OPTIONS, type Speed } from "@gita/audio";
import { MODE_ORDER, MODES, type AiAnswer, type ExplanationMode } from "@gita/ai";
import { getRepository } from "../../../src/data/content";
import { getAiClient, toRetrievedVerse } from "../../../src/ai";
import { speech } from "../../../src/audio/registry";
import { useUserStore } from "../../../src/state/user";
import { useTheme } from "../../../src/theme/theme";
import { Screen, Card, Body, Muted, SectionLabel, AiBadge, Chip } from "../../../src/components/ui";

const HIGHLIGHT_COLORS: HighlightColor[] = ["saffron", "green", "blue"];

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
  const showTransliteration = useUserStore((s) => s.display.showTransliteration);
  const markRead = useUserStore((s) => s.markRead);
  const toggleBookmark = useUserStore((s) => s.toggleBookmark);
  const setHighlight = useUserStore((s) => s.setHighlight);
  const toggleUnderstood = useUserStore((s) => s.toggleUnderstood);
  const toggleForRevision = useUserStore((s) => s.toggleForRevision);
  const addNote = useUserStore((s) => s.addNote);
  const deleteNote = useUserStore((s) => s.deleteNote);
  const t = createTranslator(language.uiLang);

  const [draftNote, setDraftNote] = useState("");
  const [speed, setSpeed] = useState<Speed>(1);
  const [mode, setMode] = useState<ExplanationMode | null>(null);
  const [answer, setAnswer] = useState<AiAnswer | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const explain = async (m: ExplanationMode) => {
    if (!verse) return;
    setMode(m);
    setAiBusy(true);
    setAnswer(null);
    try {
      const retrieved = toRetrievedVerse(repo, verse, language.explanationLang);
      setAnswer(await getAiClient().explain(retrieved, m, language.explanationLang));
    } catch {
      setAnswer(null);
    } finally {
      setAiBusy(false);
    }
  };

  const readAloud = (text: string | undefined, lang: LanguageCode | string | undefined) => {
    if (!text) return;
    // Device TTS handles English/Telugu narration only; never Sanskrit (spec §8).
    const l: LanguageCode = lang === "te" ? "te" : "en";
    speech.speak(text, { lang: l, rate: speed });
  };

  // Stop any speech when leaving the verse.
  useEffect(() => () => speech.stop(), []);

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
      {showTransliteration && (
        <VerseSection label={t("verse.transliteration")} block={vm.transliteration} />
      )}

      {vm.translation ? (
        <VerseSection label={t("verse.translation")} block={vm.translation} />
      ) : (
        <Card>
          <SectionLabel>{t("verse.translation")}</SectionLabel>
          <Muted>{t("verse.noTranslationYet")}</Muted>
        </Card>
      )}

      {/* Audio (spec §12) — device-native narration for EN/TE; Sanskrit recitation is a
          dedicated provider added in Phase 10, so it is not spoken by the English voice here. */}
      <Card>
        <SectionLabel>Audio</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {vm.translation && (
            <Chip label="▶ Read translation" active={false} onPress={() => readAloud(vm.translation!.text, vm.translation!.lang)} />
          )}
          {vm.simpleMeaning && (
            <Chip label="▶ Read meaning" active={false} onPress={() => readAloud(vm.simpleMeaning!.text, vm.simpleMeaning!.lang)} />
          )}
          <Chip label="■ Stop" active={false} onPress={() => speech.stop()} />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Muted>Speed</Muted>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
            {SPEED_OPTIONS.map((sp) => (
              <Chip key={sp} label={`${sp}x`} active={speed === sp} onPress={() => setSpeed(sp)} />
            ))}
          </View>
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Muted>
            Sanskrit recitation uses a dedicated voice (Phase 10) — it is not read by the English
            device voice, to avoid mispronunciation.
          </Muted>
        </View>
      </Card>

      {/* Explanation-mode switcher (spec §16): AI-generated, grounded on THIS verse, cited. */}
      <Card>
        <SectionLabel>Understand</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {MODE_ORDER.map((m) => (
            <Chip key={m} label={MODES[m].label} active={mode === m} onPress={() => explain(m)} />
          ))}
        </View>

        {aiBusy && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.md }} />}

        {answer && !aiBusy && (
          <View style={{ marginTop: spacing.md }}>
            <AiBadge />
            <Body>{answer.text}</Body>
            {answer.sources.length > 0 && (
              <View style={{ marginTop: spacing.sm }}>
                <Muted>
                  Sources:{" "}
                  {answer.sources.map((s) => `${s.ref.chapterNumber}.${s.ref.verseNumber}`).join(", ")}
                </Muted>
              </View>
            )}
          </View>
        )}

        {!answer && !aiBusy && <Muted>Choose a way to understand this verse.</Muted>}
      </Card>

      <Card onPress={() => router.push(`/tutor?c=${chapterNumber}&v=${verseNumber}`)}>
        <SectionLabel>{t("verse.askAboutThis")}</SectionLabel>
        <Muted>Open the AI teacher with this verse as context.</Muted>
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
