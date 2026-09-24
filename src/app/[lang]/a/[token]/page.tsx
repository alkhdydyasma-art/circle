import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { anonClient } from "@/lib/sites";
import { hashToken } from "@/lib/tokens";
import { addDays, localDate } from "@/lib/time";
import { siteFontVariables } from "@/templates/fonts";
import { getSiteStrings } from "@/templates/strings";
import { TEMPLATES, themeStyle, type TemplateKey } from "@/templates/theme";
import { ManageAppointment, type ApptView } from "@/templates/booking/ManageAppointment";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

// Patient self-service page, reached from the booking confirmation or a WhatsApp reminder.
export default async function ManagePage({ params }: PageProps<"/[lang]/a/[token]">) {
  const { lang, token } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getSiteStrings(lang);
  const valid = /^[0-9a-f]{64}$/.test(token);
  const { data } = valid ? await anonClient().rpc("manage_appointment", { p_token_hash: hashToken(token) }) : { data: null };

  if (!data) {
    return (
      <main className="clinic-site grid min-h-screen place-items-center p-6" style={themeStyle("modern", {})}>
        <p className="text-site-muted">{t.manageAppt.invalid}</p>
      </main>
    );
  }
  const a = data as ApptView & { template: string; brand: Record<string, unknown> };
  const template: TemplateKey = (TEMPLATES as readonly string[]).includes(a.template) ? (a.template as TemplateKey) : "modern";
  const today = localDate(new Date(), a.timezone);

  return (
    <main className={`clinic-site min-h-screen px-5 py-12 ${siteFontVariables}`} style={themeStyle(template, a.brand)}>
      <ManageAppointment token={token} lang={lang} a={a} t={t} days={Array.from({ length: 14 }, (_, i) => addDays(today, i))} />
    </main>
  );
}
