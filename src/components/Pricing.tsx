import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { COMPANY } from "@/lib/company";
import { Reveal } from "./Reveal";
import { Section, SectionHeading } from "./Section";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

export function Pricing({ t, lang }: { t: Dictionary; lang: Locale }) {
  const p = t.pricing;
  const fmt = new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US");
  const prices: Record<string, number | null> = { basic: COMPANY.plans.basic, pro: COMPANY.plans.pro, branches: null };
  const vars = { trial: COMPANY.trialDays, seats: COMPANY.founders.seats, price: fmt.format(COMPANY.founders.price) };

  return (
    <Section id="pricing" className="border-t border-line">
      <SectionHeading eyebrow={p.eyebrow} title={p.title} subtitle={fill(p.note, vars)} />

      <Reveal delay={0.05}>
        <p className="mt-10 flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-5 py-4 text-sm leading-relaxed">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <span><strong className="font-semibold">{fill(p.founders, vars)}</strong> {p.annual}</span>
        </p>
      </Reveal>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {p.plans.map((plan, i) => {
          const price = prices[plan.id];
          const pro = plan.id === "pro";
          return (
            <Reveal key={plan.id} delay={0.06 * i}>
              <article className={`relative flex h-full flex-col rounded-2xl border bg-card p-7 ${pro ? "border-teal/60 shadow-xl shadow-teal/10" : "border-line"}`}>
                {pro && <span className="bg-brand-gradient absolute -top-3 start-6 rounded-full px-3 py-1 text-xs font-semibold text-white">{p.popular}</span>}
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                <p className="mt-2 min-h-12 text-sm leading-relaxed text-muted">{plan.text}</p>
                <p className="mt-5 flex items-baseline gap-2">
                  {price === null ? (
                    <span className="text-3xl font-semibold">{p.custom}</span>
                  ) : (
                    <>
                      <span className="text-4xl font-semibold tracking-tight tabular-nums">{fmt.format(price)}</span>
                      <span className="text-sm text-muted">{p.perMonth}</span>
                    </>
                  )}
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <Check className="mt-0.5 size-4 shrink-0 text-teal" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={`/${lang}#demo`}
                  className={`mt-7 flex min-h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition ${pro ? "bg-brand-gradient text-white hover:opacity-90" : "border border-line hover:border-teal hover:text-teal"}`}
                >
                  {price === null ? p.contactCta : p.trialCta}
                </a>
              </article>
            </Reveal>
          );
        })}
      </div>

      <p className="mt-6 text-xs leading-relaxed text-muted">
        {p.fine}{" "}
        <Link href={`/${lang}/refund`} className="text-teal underline-offset-4 hover:underline">{p.refund}</Link>
      </p>
    </Section>
  );
}
