import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { getUser } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/portal";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PortalLayout({ children, params }: LayoutProps<"/[lang]/portal">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const user = await getUser();
  if (!user) redirect(`/${lang}/login`); // proxy.ts also guards this; defence in depth
  const t = getPortalDictionary(lang);

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-bg/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
          <Link href={`/${lang}/portal`} className="flex items-center gap-3">
            <Logo />
            <span className="hidden text-sm text-muted sm:inline">{t.meta}</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span dir="ltr" className="hidden text-muted md:inline">{user.email}</span>
            <ThemeToggle label={lang === "ar" ? "تبديل الوضع الليلي" : "Toggle dark mode"} />
            <form action={signOut}>
              <input type="hidden" name="lang" value={lang} />
              <button className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-muted transition hover:text-ink">
                <LogOut className="size-4 rtl:-scale-x-100" />
                {t.signOut}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">{children}</main>
    </div>
  );
}
