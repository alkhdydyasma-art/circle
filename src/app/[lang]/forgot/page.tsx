import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { AuthCard } from "@/components/portal/AuthCard";
import { ForgotForm } from "@/components/portal/Forms";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ForgotPage({ params }: PageProps<"/[lang]/forgot">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getPortalDictionary(lang);
  return (
    <AuthCard lang={lang} title={t.reset.title} subtitle={t.reset.subtitle}>
      <ForgotForm lang={lang} t={t} />
      <Link href={`/${lang}/login`} className="mt-6 block text-center text-sm text-muted hover:text-teal">{t.reset.back}</Link>
    </AuthCard>
  );
}
