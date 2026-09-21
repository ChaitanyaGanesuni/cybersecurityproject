import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "../src/theme/theme";

export default function RootLayout() {
  const { colors, isDark } = useTheme();
  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTitleStyle: { color: colors.text },
          headerTintColor: colors.accent,
          contentStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: "Gita Companion" }} />
        <Stack.Screen name="chapters" options={{ title: "Chapters" }} />
        <Stack.Screen name="chapter/[n]" options={{ title: "" }} />
        <Stack.Screen name="verse/[c]/[v]" options={{ title: "" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
