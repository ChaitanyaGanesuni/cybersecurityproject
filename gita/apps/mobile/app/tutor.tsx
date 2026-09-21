import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { radii, spacing, typeScale } from "@gita/core";
import type { AiAnswer, RetrievedVerse } from "@gita/ai";
import { getRepository, getSearchEngine } from "../src/data/content";
import { getAiClient, toRetrievedVerse } from "../src/ai";
import { useUserStore } from "../src/state/user";
import { useTheme } from "../src/theme/theme";
import { Screen, Card, Body, Muted, SectionLabel, AiBadge } from "../src/components/ui";

interface Turn {
  role: "user" | "assistant";
  text: string;
  sources?: AiAnswer["sources"];
}

export default function TutorScreen() {
  const { c, v } = useLocalSearchParams<{ c?: string; v?: string }>();
  const { colors } = useTheme();
  const repo = getRepository();
  const engine = getSearchEngine();
  const client = getAiClient();
  const lang = useUserStore((s) => s.language.explanationLang);

  const contextVerse = useMemo(() => {
    if (!c || !v) return null;
    return repo.getVerse({ chapterNumber: Number(c), verseNumber: Number(v) });
  }, [repo, c, v]);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setTurns((t) => [...t, { role: "user", text: q }]);
    setBusy(true);
    try {
      // Retrieval: the anchored verse if present, else lexical search stands in for RAG (Phase 7).
      let retrieved: RetrievedVerse[];
      if (contextVerse) {
        retrieved = [toRetrievedVerse(repo, contextVerse, lang)];
      } else {
        retrieved = engine
          .search(q, 5)
          .map((r) => repo.getVerse(r.ref))
          .filter((x): x is NonNullable<typeof x> => x !== null)
          .map((verse) => toRetrievedVerse(repo, verse, lang));
      }
      const answer = await client.ask(q, retrieved, lang);
      setTurns((t) => [...t, { role: "assistant", text: answer.text, sources: answer.sources }]);
    } catch {
      setTurns((t) => [...t, { role: "assistant", text: "Sorry — the teacher is unavailable right now." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {contextVerse && (
        <Card>
          <SectionLabel>Context</SectionLabel>
          <Muted>Anchored to verse {contextVerse.chapterNumber}.{contextVerse.verseNumber}</Muted>
        </Card>
      )}

      {turns.length === 0 && (
        <Card>
          <SectionLabel>AI Gita Teacher</SectionLabel>
          <Muted>
            Ask about a teaching, a concept, or how to apply it. Answers are grounded in the verses
            and cite their sources.
          </Muted>
        </Card>
      )}

      {turns.map((turn, i) => (
        <Card key={i}>
          <SectionLabel>{turn.role === "user" ? "You" : "Teacher"}</SectionLabel>
          {turn.role === "assistant" && <AiBadge />}
          <Body>{turn.text}</Body>
          {turn.sources && turn.sources.length > 0 && (
            <View style={{ marginTop: spacing.sm }}>
              <Muted>
                Sources:{" "}
                {turn.sources.map((s) => `${s.ref.chapterNumber}.${s.ref.verseNumber}`).join(", ")}
              </Muted>
            </View>
          )}
        </Card>
      ))}

      {busy && <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.md }} />}

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask the Gita teacher…"
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={send}
          style={{
            flex: 1,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radii.md,
            padding: spacing.md,
            color: colors.text,
            fontSize: typeScale.body,
          }}
        />
        <Pressable
          onPress={send}
          disabled={busy}
          style={{ justifyContent: "center", paddingHorizontal: spacing.md }}
        >
          <Text style={{ color: colors.accent, fontWeight: "700" }}>Send</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
