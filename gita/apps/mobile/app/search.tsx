import React, { useMemo, useState } from "react";
import { TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { spacing, radii, typeScale } from "@gita/core";
import { getSearchEngine } from "../src/data/content";
import { useTheme } from "../src/theme/theme";
import { Screen, Card, Body, Muted, SectionLabel } from "../src/components/ui";

export default function SearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const engine = getSearchEngine();
  const [query, setQuery] = useState("");

  const results = useMemo(() => (query.trim() ? engine.search(query, 40) : []), [engine, query]);

  return (
    <Screen>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search verses, concepts, or 2.47"
        placeholderTextColor={colors.textMuted}
        autoFocus
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radii.md,
          padding: spacing.md,
          color: colors.text,
          fontSize: typeScale.body,
          marginBottom: spacing.md,
        }}
      />

      {query.trim().length > 0 && results.length === 0 && (
        <Muted>No matches. Try a keyword like “duty”, “anger”, or a reference like “2.47”.</Muted>
      )}

      {results.map((r) => (
        <Card
          key={`${r.ref.chapterNumber}.${r.ref.verseNumber}`}
          onPress={() => router.push(`/verse/${r.ref.chapterNumber}/${r.ref.verseNumber}`)}
        >
          <SectionLabel>
            {r.ref.chapterNumber}.{r.ref.verseNumber} · {r.matchedFields.join(", ")}
          </SectionLabel>
          <Body>{r.snippet}</Body>
        </Card>
      ))}

      <View style={{ marginTop: spacing.md }}>
        <Muted>Semantic search (“anxiety about results”) arrives with the RAG tutor in Phase 7.</Muted>
      </View>
    </Screen>
  );
}
