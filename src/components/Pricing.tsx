import Link from "next/link";
import { Crown, ShieldCheck } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { COMPANY } from "@/lib/company";
import { PricingPlans } from "./PricingPlans";
import { Reveal } from "./Reveal";
import { Section, SectionHeading } from "./Section";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export function Pricing({ t, lang }: { t: Dictionary; lang: Locale }) {
  const p = t.pricing;
  const fmt = new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US");
  const vars = { trial: COMPANY.trialDays, seats: COMPANY.founders.seats, price: fmt.format(COMPANY.founders.price) };

  return (
    <Section id="pricing" className="border-t border-line">
      <SectionHeading eyebrow={p.eyebrow} title={p.title} subtitle={fill(p.note, vars)} />

      <PricingPlans p={p} lang={lang} prices={{ basic: COMPANY.plans.basic, pro: COMPANY.plans.pro, branches: null }} freeMonths={COMPANY.annualFreeMonths} />

      <Reveal delay={0.05}>
        <div className="mt-10 grid items-center gap-6 rounded-2xl border border-amber-400/50 bg-gradient-to-br from-amber-400/15 via-amber-400/5 to-transparent p-7 md:grid-cols-[1fr_auto]">
          <div>
            <p className="flex items-center gap-2 text-lg font-semibold">
              <Crown className="size-5 text-amber-500" />{fill(p.foundersTitle, vars)}
            </p>
            <p className="mt-2 leading-relaxed text-muted">{fill(p.foundersText, vars)}</p>
          </div>
          <a href={`/${lang}#demo`} className="flex min-h-12 items-center justify-center rounded-xl bg-amber-500 px-6 font-semibold text-black transition hover:bg-amber-400">
            {p.foundersCta}
          </a>
        </div>
      </Reveal>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <p className="flex items-start gap-3 rounded-xl border border-line bg-card p-5 text-sm leading-relaxed">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-teal" />{p.guarantee}
        </p>
        <p className="rounded-xl border border-line bg-card p-5 text-sm leading-relaxed text-muted">{p.anchor}</p>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        {p.fine}{" "}
        <Link href={`/${lang}/refund`} className="text-teal underline-offset-4 hover:underline">{p.refund}</Link>
      </p>
    </Section>
  );
}
