import type { CSSProperties } from "react";
import { FONTS, type FontKey } from "./fonts";

export const TEMPLATES = ["modern", "calm", "premium"] as const;
export type TemplateKey = (typeof TEMPLATES)[number];

export type Brand = { primary?: string; accent?: string; font?: string; logo_url?: string; hero_image_url?: string };

// Base palettes per template; the clinic's brand colours are layered on top.
const PALETTES: Record<TemplateKey, Record<"bg" | "surface" | "ink" | "muted" | "line", string>> = {
  modern: { bg: "#ffffff", surface: "#f5f7fa", ink: "#0f172a", muted: "#5b6474", line: "#e6e9ef" },
  calm: { bg: "#fbf8f4", surface: "#f3eee7", ink: "#2b2724", muted: "#6f665e", line: "#e8e0d6" },
  premium: { bg: "#0d1117", surface: "#151b23", ink: "#f0f3f6", muted: "#9aa4b2", line: "#262d36" },
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

export function themeStyle(template: TemplateKey, brand: Brand): CSSProperties {
  const p = PALETTES[template];
  const primary = safeColor(brand.primary, "#0e7490");
  const accent = safeColor(brand.accent, "#14b8a6");
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
