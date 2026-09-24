import type { Locale } from "@/i18n";
import type { PublicSite } from "@/lib/sites";
import type { SiteStrings } from "./strings";

// Everything a template receives. Templates are pure presentation: they never fetch.
export type TemplateProps = {
  site: PublicSite;
  lang: Locale;
  t: SiteStrings;
  /** Where "Book" buttons go (booking page, or WhatsApp until booking is enabled). */
  bookHref: string;
  whatsappHref?: string;
  telHref?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  show: { services: boolean; doctors: boolean; branches: boolean };
  formatPrice: (value: number) => string;
};
