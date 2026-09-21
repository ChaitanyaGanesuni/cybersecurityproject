import React, { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "../src/theme/theme";
import { useUserStore } from "../src/state/user";
import { deviceTts } from "../src/audio/registry";

export default function RootLayout() {
  const { colors, isDark } = useTheme();
  const hydrated = useUserStore((s) => s.hydrated);
  const init = useUserStore((s) => s.init);

  useEffect(() => {
    void init();
    void deviceTts.loadVoices();
  }, [init]);

  // Avoid a flash of empty/unpersisted state before storage loads.
  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

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
        <Stack.Screen name="search" options={{ title: "Search" }} />
        <Stack.Screen name="library" options={{ title: "My Gita" }} />
        <Stack.Screen name="chapter/[n]" options={{ title: "" }} />
        <Stack.Screen name="verse/[c]/[v]" options={{ title: "" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
