import type { ComponentType } from "react";
import type { TemplateKey } from "./theme";
import type { TemplateProps } from "./types";
import { ModernTemplate } from "./modern/ModernTemplate";

// Template registry. The occasion themes share Modern's layout and add their own palette
// (theme.ts) and motifs (OccasionDecor.tsx).
export const templates: Record<TemplateKey, ComponentType<TemplateProps>> = {
  modern: ModernTemplate,
  founding_day: ModernTemplate,
  national_day: ModernTemplate,
};
