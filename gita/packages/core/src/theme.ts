/**
 * Design tokens. Calm, contemplative, premium — not a generic ed-app.
 * Toolkit-agnostic plain objects so both RN StyleSheet and tests can consume them.
 */

export type ColorScheme = "light" | "dark";

export interface Palette {
  /** App background (warm, paper-like in light; deep ink in dark). */
  background: string;
  surface: string;
  surfaceAlt: string;
  /** Primary text. */
  text: string;
  textMuted: string;
  /** Saffron/ochre accent — restrained, spiritual without cliché. */
  accent: string;
  accentMuted: string;
  /** Distinct tint used ONLY to mark AI-generated content (spec §2). */
  aiTint: string;
  aiText: string;
  border: string;
  /** Sanskrit text color (slightly warmer/emphasized). */
  sanskrit: string;
  success: string;
  danger: string;
}

const light: Palette = {
  background: "#FAF6EF", // warm paper
  surface: "#FFFFFF",
  surfaceAlt: "#F3ECE0",
  text: "#2A2622",
  textMuted: "#6B635A",
  accent: "#C6672E", // deep saffron
  accentMuted: "#E8C9A8",
  aiTint: "#EAF1F4", // cool tint, clearly not scripture
  aiText: "#33566B",
  border: "#E5DCCF",
  sanskrit: "#7A3B12",
  success: "#3E7A52",
  danger: "#B23A38",
};

const dark: Palette = {
  background: "#14110D", // deep ink
  surface: "#1D1913",
  surfaceAlt: "#26211A",
  text: "#EDE6DA",
  textMuted: "#A79E90",
  accent: "#E08A4B",
  accentMuted: "#5A4126",
  aiTint: "#17262E",
  aiText: "#9DC3D4",
  border: "#332C22",
  sanskrit: "#E7B486",
  success: "#6FB187",
  danger: "#E07A78",
};

export const palettes: Record<ColorScheme, Palette> = { light, dark };

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radii = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

/** Font families per script. The RN app registers these; names must match the loaded assets. */
export const fonts = {
  sanskrit: "NotoSerifDevanagari",
  telugu: "NotoSerifTelugu",
  serif: "Lora", // calm reading serif for English body
  sans: "Inter", // UI chrome
} as const;

/** Base type scale (pt). Multiply by the user's textScale for accessibility. */
export const typeScale = {
  display: 30,
  title: 22,
  heading: 18,
  body: 16,
  sanskrit: 24, // large, readable Sanskrit (spec §21)
  caption: 13,
  label: 12,
} as const;

export type TextScale = 0.85 | 1 | 1.15 | 1.3 | 1.5;

export const scaled = (size: number, scale: TextScale = 1): number =>
  Math.round(size * scale);
