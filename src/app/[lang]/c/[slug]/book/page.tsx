import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPublicSite } from "@/lib/sites";
import { BookingWizard } from "@/templates/booking/BookingWizard";
import { siteFontVariables } from "@/templates/fonts";
import { getSiteStrings } from "@/templates/strings";
import { themeStyle } from "@/templates/theme";

export async function generateMetadata({ params }: PageProps<"/[lang]/c/[slug]/book">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) return {};
  const site = await getPublicSite(slug);
  if (!site) return { robots: { index: false } };
  return { title: `${getSiteStrings(lang).booking.title} | ${site.clinic.name}` };
}

export default async function BookPage({ params, searchParams }: PageProps<"/[lang]/c/[slug]/book">) {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) notFound();
  const site = await getPublicSite(slug);
  if (!site) notFound();
  const t = getSiteStrings(lang);
  const service = (await searchParams).service;

  return (
    <div className={`clinic-site min-h-screen ${siteFontVariables}`} style={themeStyle(site.site.template, site.site.brand)}>
      <header className="border-b border-site-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-5">
          <Link href={`/${lang}/c/${slug}`} className="inline-flex items-center gap-1.5 text-sm text-site-muted hover:text-site-primary">
            <ChevronRight className="size-4 ltr:rotate-180" />
            {t.booking.back}
          </Link>
          <span className="truncate font-bold">{site.clinic.name}</span>
        </div>
      </header>
      <main className="px-5 py-10 md:py-14">
        <h1 className="mx-auto mb-8 max-w-3xl text-3xl font-extrabold sm:text-4xl">{t.booking.title}</h1>
        <BookingWizard
          slug={slug}
          clinicName={site.clinic.name}
          lang={lang}
          t={t}
          timezone={site.site.timezone}
          services={site.services}
          doctors={site.doctors}
          branches={site.branches}
          initialServiceId={typeof service === "string" ? service : undefined}
          whatsappHref={site.site.whatsapp ? `https://wa.me/${site.site.whatsapp.slice(1)}` : undefined}
          remindersEnabled={site.site.reminders_enabled ?? false}
        />
      </main>
    </div>
  );
}
