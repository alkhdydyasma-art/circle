import { Cairo, Tajawal } from "next/font/google";

// Extra Arabic fonts a clinic can pick. IBM Plex Sans Arabic and Readex Pro are already
// loaded by the root layout. Browsers only download a font a page actually uses.
export const tajawal = Tajawal({ variable: "--font-tajawal", subsets: ["arabic", "latin"], weight: ["400", "500", "700", "800"] });
export const cairo = Cairo({ variable: "--font-cairo", subsets: ["arabic", "latin"] });

export const siteFontVariables = `${tajawal.variable} ${cairo.variable}`;

export const FONTS = {
  plex: "var(--font-plex-arabic), var(--font-inter), sans-serif",
  tajawal: "var(--font-tajawal), sans-serif",
  cairo: "var(--font-cairo), sans-serif",
  readex: "var(--font-readex), sans-serif",
} as const;
export type FontKey = keyof typeof FONTS;
