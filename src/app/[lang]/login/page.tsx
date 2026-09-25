import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { getUser } from "@/lib/supabase/server";
import { AuthCard } from "@/components/portal/AuthCard";
import { LoginForm } from "@/components/portal/Forms";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LoginPage({ params, searchParams }: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  if (await getUser()) redirect(`/${lang}/portal`);
  const t = getPortalDictionary(lang);
  const next = (await searchParams).next;

  return (
    <AuthCard lang={lang} title={t.login.title} subtitle={t.login.subtitle}>
      <LoginForm lang={lang} t={t} next={typeof next === "string" ? next : undefined} />
      <Link href={`/${lang}/forgot`} className="mt-4 block text-center text-sm text-muted hover:text-teal">{t.login.forgot}</Link>
      <p className="mt-6 text-center text-xs text-muted">{t.login.noAccount}</p>
    </AuthCard>
  );
}
