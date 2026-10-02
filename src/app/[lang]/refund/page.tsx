import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, hasLocale } from "@/i18n";
import { getLegal } from "@/legal/content";
import { LegalPage } from "@/components/LegalPage";

export async function generateMetadata({ params }: PageProps<"/[lang]/refund">): Promise<Metadata> {
  const { lang } = await params;
  return hasLocale(lang) ? { title: `${getLegal("refund", lang).title} | Circle` } : {};
}

export default async function Page({ params }: PageProps<"/[lang]/refund">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  return <LegalPage doc={getLegal("refund", lang)} lang={lang} t={getDictionary(lang)} />;
}
