import type { CSSProperties } from "react";
import { FONTS, type FontKey } from "./fonts";

export const TEMPLATES = ["modern", "founding_day", "national_day"] as const;
export type TemplateKey = (typeof TEMPLATES)[number];

export type Brand = { primary?: string; accent?: string; font?: string; logo_url?: string; hero_image_url?: string };

type Palette = Record<"bg" | "surface" | "card" | "ink" | "muted" | "line" | "deep" | "deepFg", string> & {
  /** Occasion themes fix the brand colours; the clinic keeps its logo and font. */
  primary?: string;
  accent?: string;
};

const PALETTES: Record<TemplateKey, Palette> = {
  // Warm, calm neutrals (sand and ink) so any clinic colour sits well on top.
  modern: {
    bg: "#f7f6f2", surface: "#eeede7", card: "#ffffff", ink: "#1b1c19", muted: "#666760", line: "#dfddd4",
    deep: "color-mix(in srgb, var(--c-primary) 22%, #0d1111)", deepFg: "#f4f3ee",
  },
  // يوم التأسيس: Najdi earth — sand, mud-brick brown and desert gold.
  founding_day: {
    bg: "#f7f0e4", surface: "#eee2cd", card: "#fffaf1", ink: "#2d1d12", muted: "#7a6450", line: "#e0cfb3",
    deep: "#3b2415", deepFg: "#f7efe2", primary: "#6e3f1f", accent: "#b98a3e",
  },
  // اليوم الوطني: bright and celebratory — white, Saudi green and a touch of gold.
  national_day: {
    bg: "#f4f8f5", surface: "#e3eee6", card: "#ffffff", ink: "#0d1e15", muted: "#52695b", line: "#cfdfd3",
    deep: "#053b21", deepFg: "#eef6f0", primary: "#00733b", accent: "#c7a04a",
  },
};

const HEX = /^#[0-9a-f]{6}$/i;
export const safeColor = (value: unknown, fallback: string) =>
  typeof value === "string" && HEX.test(value) ? value : fallback;

// WCAG relative luminance → pick readable text on top of the brand colour.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Text colour for a brand-coloured background: whichever of white / near-black has the
// higher WCAG contrast ratio (so gold gets dark text, deep teal gets white).
const DARK_TEXT = "#0b1320";
function readableOn(bg: string) {
  const l = luminance(bg);
  const onWhite = 1.05 / (l + 0.05);
  const onDark = (l + 0.05) / (luminance(DARK_TEXT) + 0.05);
  return onDark > onWhite ? DARK_TEXT : "#ffffff";
}

export const safeHttpsUrl = (value: unknown) =>
  typeof value === "string" && /^https:\/\/[^\s"'<>]+$/.test(value) ? value : undefined;

/** Clinic images: uploaded files (https Storage URLs) or the demo images shipped in /public/demo. */
export const safeImageUrl = (value: unknown) =>
  typeof value === "string" && (/^https:\/\/[^\s"'<>]+$/.test(value) || /^\/demo\/[a-z0-9-]+\.(webp|jpg|png)$/.test(value))
    ? value
    : undefined;

export const primaryOf = (template: TemplateKey, brand: Brand) =>
  PALETTES[template].primary ?? safeColor(brand.primary, "#0e7490");

export function themeStyle(template: TemplateKey, brand: Brand): CSSProperties {
  const p = PALETTES[template];
  const primary = primaryOf(template, brand);
  const accent = p.accent ?? safeColor(brand.accent, "#14b8a6");
  const font = FONTS[(brand.font as FontKey) in FONTS ? (brand.font as FontKey) : "plex"];
  return {
    "--c-bg": p.bg,
    "--c-surface": p.surface,
    "--c-card": p.card,
    "--c-deep": p.deep,
    "--c-deep-fg": p.deepFg,
    "--c-ink": p.ink,
    "--c-muted": p.muted,
    "--c-line": p.line,
    "--c-primary": primary,
    "--c-primary-fg": readableOn(primary),
    "--c-accent": accent,
    "--c-font": font,
  } as CSSProperties;
}
