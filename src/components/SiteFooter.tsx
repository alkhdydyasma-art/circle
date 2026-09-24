import { MessageCircle, Phone } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { PHONE_DISPLAY, telUrl, whatsappUrl } from "@/lib/contact";
import { Logo } from "./Logo";

export function SiteFooter({ t }: { t: Dictionary }) {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 text-sm text-muted md:grid-cols-[1fr_auto] md:px-8">
        <div className="space-y-3">
          <Logo />
          <p>{t.footer.tagline}</p>
          <p>
            © {new Date().getFullYear()} Circle. {t.footer.rights}
          </p>
        </div>
        <div className="space-y-3">
          <p className="font-medium text-ink">{t.footer.contact}</p>
          <a href={telUrl} className="flex items-center gap-2 transition hover:text-ink">
            <Phone className="size-4" />
            <bdi dir="ltr">{PHONE_DISPLAY}</bdi>
          </a>
          <a
            href={whatsappUrl(t.contact.whatsappMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 transition hover:text-ink"
          >
            <MessageCircle className="size-4 text-whatsapp" />
            {t.contact.whatsapp}
          </a>
        </div>
      </div>
    </footer>
  );
}
