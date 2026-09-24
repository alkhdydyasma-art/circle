import type { ComponentType } from "react";
import type { TemplateKey } from "./theme";
import type { TemplateProps } from "./types";
import { ModernTemplate } from "./modern/ModernTemplate";

// Template registry. "calm" and "premium" reuse Modern's layout for now and differ only by
// palette (theme.ts) until their own layouts land.
export const templates: Record<TemplateKey, ComponentType<TemplateProps>> = {
  modern: ModernTemplate,
  calm: ModernTemplate,
  premium: ModernTemplate,
};
