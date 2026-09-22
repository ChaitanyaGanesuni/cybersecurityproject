import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radii, spacing, typeScale } from "@gita/core";
import { useTheme } from "../theme/theme";

export function Screen({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Card({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  };
  const content = <View style={[base, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button">
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: typeScale.label,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        marginBottom: spacing.xs,
      }}
    >
      {children}
    </Text>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text style={{ color: colors.text, fontSize: typeScale.title, fontWeight: "600" }}>
      {children}
    </Text>
  );
}

export function Body({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text style={{ color: colors.text, fontSize: typeScale.body, lineHeight: 24 }}>
      {children}
    </Text>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>{children}</Text>
  );
}

/** A small pill toggle used across screens (modes, filters, study controls). */
export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
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

/** Non-negotiable marker for AI-generated content (spec §2). */
export function AiBadge() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: colors.aiTint,
        borderRadius: radii.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        marginBottom: spacing.xs,
      }}
    >
      <Text style={{ color: colors.aiText, fontSize: typeScale.label, fontWeight: "600" }}>
        ✦ AI — not scripture
      </Text>
    </View>
  );
}
