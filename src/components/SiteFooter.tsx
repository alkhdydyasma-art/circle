import type { Dictionary } from "@/i18n";
import { Logo } from "./Logo";

export function SiteFooter({ t }: { t: Dictionary }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 text-sm text-muted sm:flex-row">
        <div className="flex items-center gap-3">
          <Logo />
          <span>{t.footer.tagline}</span>
        </div>
        <p>
          © {new Date().getFullYear()} Circle. {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
