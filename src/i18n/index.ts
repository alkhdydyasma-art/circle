import ar from "./ar";
import en from "./en";
import type { Locale } from "./config";

export * from "./config";
export type { Dictionary } from "./ar";

const dictionaries = { ar, en };

export const getDictionary = (locale: Locale) => dictionaries[locale];
