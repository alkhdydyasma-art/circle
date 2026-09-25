import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { getUser } from "@/lib/supabase/server";
import { AuthCard } from "@/components/portal/AuthCard";
import { NewPasswordForm } from "@/components/portal/Forms";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Reached from the reset email via /auth/callback, which signs the user in first.
export default async function ResetPasswordPage({ params }: PageProps<"/[lang]/reset-password">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getPortalDictionary(lang);
  const user = await getUser();
  return (
    <AuthCard lang={lang} title={t.reset.newTitle} subtitle={user ? undefined : t.reset.expired}>
      {user ? (
        <NewPasswordForm lang={lang} t={t} />
      ) : (
        <Link href={`/${lang}/forgot`} className="block text-center text-sm text-teal">{t.reset.title}</Link>
      )}
    </AuthCard>
  );
}
