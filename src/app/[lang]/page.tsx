import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n";
import { SiteHeader } from "@/components/SiteHeader";
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { HowItWorks } from "@/components/HowItWorks";
import { BeforeAfter } from "@/components/BeforeAfter";
import { DashboardPreview } from "@/components/DashboardPreview";
import { LeadSection } from "@/components/LeadSection";
import { Testimonials } from "@/components/Testimonials";
import { Faq } from "@/components/Faq";
import { WhatsAppFab } from "@/components/WhatsAppFab";
import { SiteFooter } from "@/components/SiteFooter";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getDictionary(lang);

  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main>
        <Hero t={t} />
        <Features t={t} />
        <HowItWorks t={t} />
        <BeforeAfter t={t} />
        <DashboardPreview t={t} />
        <Testimonials t={t} />
        <LeadSection lang={lang} t={t} />
        <Faq t={t} />
      </main>
      <SiteFooter t={t} />
      <WhatsAppFab t={t} />
    </>
  );
}
