import React, { useEffect, useState } from "react";
import { TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { radii, spacing, typeScale } from "@gita/core";
import { getSearchEngine } from "../src/data/content";
import { getRetriever } from "../src/rag/retriever";
import { useTheme } from "../src/theme/theme";
import { Screen, Card, Body, Muted, SectionLabel } from "../src/components/ui";
import { Chip } from "../src/components/ui";

interface Row {
  chapterNumber: number;
  verseNumber: number;
  snippet: string;
  hint: string;
}

export default function SearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const engine = getSearchEngine();
  const [query, setQuery] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const q = query.trim();
      if (!q) {
        setRows([]);
        return;
      }
      if (semantic) {
        const verses = await getRetriever().retrieve(q, 40);
        if (!cancelled)
          setRows(
            verses.map((v) => ({
              chapterNumber: v.ref.chapterNumber,
              verseNumber: v.ref.verseNumber,
              snippet: v.translation ?? v.transliteration,
              hint: "meaning",
            })),
          );
      } else {
        const hits = engine.search(q, 40);
        if (!cancelled)
          setRows(
            hits.map((r) => ({
              chapterNumber: r.ref.chapterNumber,
              verseNumber: r.ref.verseNumber,
              snippet: r.snippet,
              hint: r.matchedFields.join(", "),
            })),
          );
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [query, semantic, engine]);

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

      <View style={{ flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md }}>
        <Chip label="Keyword" active={!semantic} onPress={() => setSemantic(false)} />
        <Chip label="By meaning" active={semantic} onPress={() => setSemantic(true)} />
      </View>

      {semantic && (
        <Muted>
          Try “anxiety about results”, “how to face fear”, or “my duty at work”.
        </Muted>
      )}

      {query.trim().length > 0 && rows.length === 0 && (
        <Muted>No matches. Try another word or a reference like “2.47”.</Muted>
      )}

      {rows.map((r) => (
        <Card
          key={`${r.chapterNumber}.${r.verseNumber}`}
          onPress={() => router.push(`/verse/${r.chapterNumber}/${r.verseNumber}`)}
        >
          <SectionLabel>
            {r.chapterNumber}.{r.verseNumber} · {r.hint}
          </SectionLabel>
          <Body>{r.snippet}</Body>
        </Card>
      ))}
    </Screen>
  );
}
