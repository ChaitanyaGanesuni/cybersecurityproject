import { useColorScheme } from "react-native";
import { palettes, type Palette } from "@gita/core";
import { useUserStore } from "../state/user";

export interface ActiveTheme {
  colors: Palette;
  isDark: boolean;
}

/** Resolves the active palette from the user's preference, falling back to the OS setting. */
export function useTheme(): ActiveTheme {
  const system = useColorScheme();
  const pref = useUserStore((s) => s.display.colorScheme);
  const scheme = pref === "system" ? (system ?? "light") : pref;
  return { colors: palettes[scheme], isDark: scheme === "dark" };
}
