import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader({ lang, t }: { lang: Locale; t: Dictionary }) {
  const other = lang === "ar" ? "en" : "ar";
  const links = [
    { href: "#features", label: t.nav.features },
    { href: "#how", label: t.nav.how },
    { href: "#dashboard", label: t.nav.dashboard },
    { href: "#faq", label: t.nav.faq },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-lg">
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-6 md:px-8">
        <Link href={`/${lang}`} aria-label="Circle">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 font-display md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-muted transition duration-300 hover:text-teal">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href={`/${other}`}
            hrefLang={other}
            className="rounded-full px-3 py-1.5 text-sm text-muted transition hover:text-ink"
          >
            {t.nav.switchLang}
          </Link>
          <ThemeToggle label={t.nav.theme} />
          <a
            href="#demo"
            className="hidden rounded-full bg-ink px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-85 sm:inline-block"
          >
            {t.nav.cta}
          </a>
        </div>
      </div>
    </header>
  );
}
