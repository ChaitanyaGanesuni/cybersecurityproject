import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import type { TextScale } from "@gita/core";
import { spacing } from "@gita/core";
import type { LanguageCode } from "@gita/contracts";
import { useUserStore } from "../src/state/user";
import { Screen, Card, Muted, SectionLabel, Chip } from "../src/components/ui";

const TEXT_SCALES: TextScale[] = [0.85, 1, 1.15, 1.3, 1.5];
const UI_LANGS: ("en" | "te")[] = ["en", "te"];
const VERSE_LANGS: LanguageCode[] = ["en", "sa", "te", "hi"];

export default function SettingsScreen() {
  const router = useRouter();
  const display = useUserStore((s) => s.display);
  const language = useUserStore((s) => s.language);
  const setDisplay = useUserStore((s) => s.setDisplay);
  const setLanguage = useUserStore((s) => s.setLanguage);

  const Row = ({ children }: { children: React.ReactNode }) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
      {children}
    </View>
  );

  return (
    <Screen>
      <Card>
        <SectionLabel>Appearance</SectionLabel>
        <Muted>Theme</Muted>
        <Row>
          {(["system", "light", "dark"] as const).map((c) => (
            <Chip key={c} label={c} active={display.colorScheme === c} onPress={() => setDisplay({ colorScheme: c })} />
          ))}
        </Row>
        <Muted>Text size</Muted>
        <Row>
          {TEXT_SCALES.map((s) => (
            <Chip key={s} label={`${Math.round(s * 100)}%`} active={display.textScale === s} onPress={() => setDisplay({ textScale: s })} />
          ))}
        </Row>
        <Muted>Transliteration</Muted>
        <Row>
          <Chip label="Shown" active={display.showTransliteration} onPress={() => setDisplay({ showTransliteration: true })} />
          <Chip label="Hidden" active={!display.showTransliteration} onPress={() => setDisplay({ showTransliteration: false })} />
        </Row>
      </Card>

      <Card>
        <SectionLabel>Languages</SectionLabel>
        <Muted>App language (UI)</Muted>
        <Row>
          {UI_LANGS.map((l) => (
            <Chip key={l} label={l === "en" ? "English" : "తెలుగు"} active={language.uiLang === l} onPress={() => setLanguage({ uiLang: l })} />
          ))}
        </Row>
        <Muted>Verse translation language</Muted>
        <Row>
          {VERSE_LANGS.map((l) => (
            <Chip key={l} label={l.toUpperCase()} active={language.verseLang === l} onPress={() => setLanguage({ verseLang: l })} />
          ))}
        </Row>
        <Muted>Explanation language</Muted>
        <Row>
          {UI_LANGS.map((l) => (
            <Chip key={l} label={l === "en" ? "English" : "తెలుగు"} active={language.explanationLang === l} onPress={() => setLanguage({ explanationLang: l })} />
          ))}
        </Row>
        <Muted>UI, verse, and explanation languages are independent (spec §4).</Muted>
      </Card>

      <Card onPress={() => router.push("/downloads")}>
        <SectionLabel>Offline & downloads</SectionLabel>
        <Muted>Manage offline content and audio packs →</Muted>
      </Card>

      <Card>
        <SectionLabel>About the content</SectionLabel>
        <Muted>
          Sanskrit (public domain) · transliteration & summaries (Unlicense, gita/gita) · English
          translation by Shri Purohit Swami, 1935 (public domain). AI explanations are labelled and
          are not scripture.
        </Muted>
      </Card>
    </Screen>
  );
}
