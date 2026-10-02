import Link from "next/link";
import { Check } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { COMPANY } from "@/lib/company";
import { Reveal } from "./Reveal";
import { Section, SectionHeading } from "./Section";

export function Pricing({ t, lang }: { t: Dictionary; lang: Locale }) {
  const p = t.pricing;
  const price = new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US").format(COMPANY.priceMonthlySar);
  return (
    <Section id="pricing" className="border-t border-line">
      <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.1fr]">
        <SectionHeading eyebrow={p.eyebrow} title={p.title} subtitle={p.note} />
        <Reveal delay={0.1}>
          <article className="rounded-2xl border border-teal/40 bg-card p-8 shadow-xl shadow-teal/5">
            <h3 className="text-lg font-semibold">{p.plan}</h3>
            <p className="mt-4 flex items-baseline gap-2">
              <span className="text-5xl font-semibold tracking-tight tabular-nums">{price}</span>
              <span className="text-muted">{p.perMonth}</span>
            </p>
            <ul className="mt-8 space-y-3">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-teal" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <a href={`/${lang}#demo`} className="bg-brand-gradient mt-8 flex min-h-12 items-center justify-center rounded-xl px-6 font-semibold text-white transition hover:opacity-90">
              {p.cta}
            </a>
            <p className="mt-5 text-xs leading-relaxed text-muted">
              {p.fine}{" "}
              <Link href={`/${lang}/refund`} className="text-teal underline-offset-4 hover:underline">{p.refund}</Link>
            </p>
          </article>
        </Reveal>
      </div>
    </Section>
  );
}
