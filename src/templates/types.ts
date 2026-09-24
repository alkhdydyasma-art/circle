import type { Locale } from "@/i18n";
import type { PublicSite } from "@/lib/sites";
import type { SiteStrings } from "./strings";
import type { Occasion } from "./OccasionDecor";

// Everything a template receives. Templates are pure presentation: they never fetch.
export type TemplateProps = {
  site: PublicSite;
  lang: Locale;
  t: SiteStrings;
  /** Where "Book" buttons go (booking page, or WhatsApp until booking is enabled). */
  bookHref: string;
  /** Booking link preselecting one service. */
  serviceBookHref: (serviceId: string) => string;
  whatsappHref?: string;
  telHref?: string;
  logoUrl?: string;
  heroImageUrl?: string;
  show: { services: boolean; doctors: boolean; branches: boolean };
  formatPrice: (value: number) => string;
  /** Set for occasion themes: adds the greeting ribbon and occasion motifs. */
  occasion?: Occasion;
};
