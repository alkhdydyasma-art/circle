import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { getPublicSite, type PublicSite } from "@/lib/sites";
import { ClinicSiteView } from "@/templates/ClinicSiteView";
import { primaryOf } from "@/templates/theme";

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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(site)).replace(/</g, "\\u003c") }}
      />
      <ClinicSiteView site={site} lang={lang} />
    </>
  );
}
