import type { Locale } from "@/i18n";
import type { PublicSite } from "@/lib/sites";
import { templates } from ".";
import { siteFontVariables } from "./fonts";
import { getSiteStrings } from "./strings";
import { safeHttpsUrl, themeStyle } from "./theme";

// Renders a clinic website. Shared by the public page and the dashboard preview.
export function ClinicSiteView({ site, lang }: { site: PublicSite; lang: Locale }) {
  const t = getSiteStrings(lang);
  const slug = site.site.slug;
  const brand = site.site.brand;
  const whatsappHref = site.site.whatsapp ? `https://wa.me/${site.site.whatsapp.slice(1)}` : undefined;
  const telHref = site.site.phone ? `tel:${site.site.phone.replace(/[^\d+]/g, "")}` : undefined;
  const sections = site.site.content.sections ?? {};
  const price = new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });
  const Template = templates[site.site.template];

  return (
    <div className={`clinic-site min-h-screen ${siteFontVariables}`} style={themeStyle(site.site.template, brand)}>
      <Template
        site={site}
        lang={lang}
        t={t}
        bookHref={`/${lang}/c/${slug}/book`}
        serviceBookHref={(id) => `/${lang}/c/${slug}/book?service=${id}`}
        whatsappHref={whatsappHref}
        telHref={telHref}
        logoUrl={safeHttpsUrl(brand.logo_url)}
        heroImageUrl={safeHttpsUrl(brand.hero_image_url)}
        show={{ services: sections.services !== false, doctors: sections.doctors !== false, branches: sections.branches !== false }}
        formatPrice={(v) => price.format(v)}
        occasion={site.site.template === "modern" ? undefined : site.site.template}
      />
    </div>
  );
}
