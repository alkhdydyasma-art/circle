import type { CSSProperties } from "react";
import { FONTS, type FontKey } from "./fonts";

export const TEMPLATES = ["modern", "founding_day", "national_day"] as const;
export type TemplateKey = (typeof TEMPLATES)[number];

export type Brand = { primary?: string; accent?: string; font?: string; logo_url?: string; hero_image_url?: string };

type Palette = Record<"bg" | "surface" | "ink" | "muted" | "line", string> & {
  /** Occasion themes fix the brand colours; the clinic keeps its logo and font. */
  primary?: string;
  accent?: string;
};

const PALETTES: Record<TemplateKey, Palette> = {
  modern: { bg: "#ffffff", surface: "#f5f7fa", ink: "#0f172a", muted: "#5b6474", line: "#e6e9ef" },
  // يوم التأسيس: Najdi earth — sand, mud-brick brown, desert gold.
  founding_day: {
    bg: "#faf4ea", surface: "#f1e6d3", ink: "#3a2718", muted: "#7a6552", line: "#e3d2b8",
    primary: "#7b4a26", accent: "#b8893b",
  },
  // اليوم الوطني: deep night with Saudi green.
  national_day: {
    bg: "#06110b", surface: "#0c1c13", ink: "#eef5f0", muted: "#9db3a5", line: "#1b3325",
    primary: "#169b52", accent: "#6fd69a",
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
    "--c-ink": p.ink,
    "--c-muted": p.muted,
    "--c-line": p.line,
    "--c-primary": primary,
    "--c-primary-fg": readableOn(primary),
    "--c-accent": accent,
    "--c-font": font,
  } as CSSProperties;
}
