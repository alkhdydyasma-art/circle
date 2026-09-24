import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import { Logo } from "./Logo";

export function SiteHeader({ lang, t }: { lang: Locale; t: Dictionary }) {
  const other = lang === "ar" ? "en" : "ar";
  const links = [
    { href: "#features", label: t.nav.features },
    { href: "#how", label: t.nav.how },
    { href: "#dashboard", label: t.nav.dashboard },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href={`/${lang}`} aria-label="Circle">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href={`/${other}`}
            hrefLang={other}
            className="rounded-full px-3 py-1.5 text-sm text-muted transition hover:bg-surface hover:text-ink"
          >
            {t.nav.switchLang}
          </Link>
          <a
            href="#demo"
            className="bg-brand-gradient rounded-full px-4 py-2 text-sm font-semibold text-white shadow-md shadow-brand/20 transition hover:opacity-90"
          >
            {t.nav.cta}
          </a>
        </div>
      </div>
    </header>
  );
}
