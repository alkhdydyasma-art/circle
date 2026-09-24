import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { getPublicSite, type PublicSite } from "@/lib/sites";
import { templates } from "@/templates";
import { siteFontVariables } from "@/templates/fonts";
import { getSiteStrings } from "@/templates/strings";
import { primaryOf, safeHttpsUrl, themeStyle } from "@/templates/theme";

// Public clinic websites are rebuilt at most once a minute.
export const revalidate = 60;

export async function generateMetadata({ params }: PageProps<"/[lang]/c/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) return {};
  const site = await getPublicSite(slug);
  if (!site) return { title: "Not found", robots: { index: false } };
  const title = site.site.content.tagline ? `${site.clinic.name} | ${site.site.content.tagline}` : site.clinic.name;
  const description = site.site.content.about?.slice(0, 160);
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    other: { "theme-color": primaryOf(site.site.template, site.site.brand) },
  };
}

// schema.org/Dentist so search engines understand the clinic, its branches and services.
function jsonLd(site: PublicSite) {
  return {
    "@context": "https://schema.org",
    "@type": "Dentist",
    name: site.clinic.name,
    description: site.site.content.about,
    telephone: site.site.phone ?? undefined,
    email: site.site.email ?? undefined,
    address: site.branches[0]?.address
      ? { "@type": "PostalAddress", streetAddress: site.branches[0].address, addressLocality: site.branches[0].city ?? site.clinic.city, addressCountry: "SA" }
      : undefined,
    department: site.branches.map((b) => ({ "@type": "Dentist", name: b.name, telephone: b.phone ?? undefined })),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      itemListElement: site.services.map((s) => ({
        "@type": "Offer",
        itemOffered: { "@type": "MedicalProcedure", name: s.name },
        ...(s.price != null && { price: s.price, priceCurrency: "SAR" }),
      })),
    },
  };
}

export default async function ClinicSitePage({ params }: PageProps<"/[lang]/c/[slug]">) {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) notFound();
  const site = await getPublicSite(slug);
  if (!site) notFound();

  const t = getSiteStrings(lang);
  const brand = site.site.brand;
  const whatsappHref = site.site.whatsapp ? `https://wa.me/${site.site.whatsapp.slice(1)}` : undefined;
  const telHref = site.site.phone ? `tel:${site.site.phone.replace(/[^\d+]/g, "")}` : undefined;
  const sections = site.site.content.sections ?? {};
  const price = new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });
  const Template = templates[site.site.template];

  return (
    <div className={`clinic-site min-h-screen ${siteFontVariables}`} style={themeStyle(site.site.template, brand)}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(site)).replace(/</g, "\\u003c") }}
      />
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
        show={{
          services: sections.services !== false,
          doctors: sections.doctors !== false,
          branches: sections.branches !== false,
        }}
        formatPrice={(v) => price.format(v)}
        occasion={site.site.template === "modern" ? undefined : site.site.template}
      />
    </div>
  );
}
