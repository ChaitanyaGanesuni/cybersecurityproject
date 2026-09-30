import React, { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  DAILY_STEPS,
  buildVerseViewModel,
  findDailyEntry,
  radii,
  spacing,
  todaysVerseRef,
  typeScale,
} from "@gita/core";
import { getRepository } from "../src/data/content";
import { speech } from "../src/audio/registry";
import { useUserStore } from "../src/state/user";
import { useTheme } from "../src/theme/theme";
import { Screen, Card, Body, Muted, SectionLabel, Chip } from "../src/components/ui";

const STEP_LABEL: Record<(typeof DAILY_STEPS)[number], string> = {
  listen: "Listen",
  understand: "Understand",
  reflect: "Reflect",
  apply: "Apply",
  journal: "Journal",
};

export default function DailyScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const repo = getRepository();
  const now = useMemo(() => new Date(), []);
  const ref = useMemo(() => todaysVerseRef(repo, now), [repo, now]);
  const language = useUserStore((s) => s.language);
  const user = useUserStore((s) => s.user);
  const updateDaily = useUserStore((s) => s.updateDaily);

  const verse = repo.getVerse(ref)!;
  const vm = buildVerseViewModel(repo, verse, language, user);
  const entry = findDailyEntry(user.dailyEntries, now);
  const done = (s: (typeof DAILY_STEPS)[number]) => entry?.completedSteps.includes(s) ?? false;

  const [reflection, setReflection] = useState(entry?.reflection ?? "");
  const [application, setApplication] = useState(entry?.application ?? "");

  return (
    <Screen>
      <Card onPress={() => router.push(`/verse/${ref.chapterNumber}/${ref.verseNumber}`)}>
        <SectionLabel>Today’s verse · {ref.chapterNumber}.{ref.verseNumber}</SectionLabel>
        {vm.translation && <Body>{vm.translation.text}</Body>}
      </Card>

      <Card>
        <SectionLabel>Practice · {entry?.completedSteps.length ?? 0} of {DAILY_STEPS.length}</SectionLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
          {DAILY_STEPS.map((s) => (
            <Chip key={s} label={`${done(s) ? "✓ " : ""}${STEP_LABEL[s]}`} active={done(s)} onPress={() => {
              if (s === "listen" && vm.translation) speech.speak(vm.translation.text, { lang: "en" });
              if (s === "understand") { router.push(`/verse/${ref.chapterNumber}/${ref.verseNumber}`); }
              updateDaily(ref, { step: s });
            }} />
          ))}
        </View>
      </Card>

      <Card>
        <SectionLabel>Reflect</SectionLabel>
        <Muted>What does this teaching mean to you today?</Muted>
        <TextInput
          value={reflection}
          onChangeText={setReflection}
          onEndEditing={() => updateDaily(ref, { reflection, step: "reflect" })}
          multiline
          placeholder="Your private reflection…"
          placeholderTextColor={colors.textMuted}
          style={inputStyle(colors)}
        />
      </Card>

      <Card>
        <SectionLabel>Apply</SectionLabel>
        <Muted>One situation today where you can practice this teaching.</Muted>
        <TextInput
          value={application}
          onChangeText={setApplication}
          onEndEditing={() => updateDaily(ref, { application, step: "apply" })}
          multiline
          placeholder="Where will you apply it?"
          placeholderTextColor={colors.textMuted}
          style={inputStyle(colors)}
        />
      </Card>

      <Chip
        label="Save to journal"
        active={done("journal")}
        onPress={() => updateDaily(ref, { reflection, application, step: "journal" })}
      />
    </Screen>
  );
}

const inputStyle = (colors: { surface: string; border: string; text: string }) => ({
  backgroundColor: colors.surface,
  borderColor: colors.border,
  borderWidth: 1,
  borderRadius: radii.sm,
  padding: spacing.sm,
  color: colors.text,
  marginTop: spacing.sm,
  minHeight: 60,
  fontSize: typeScale.body,
});
