"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";

type Props = {
  p: Dictionary["pricing"]; lang: Locale;
  prices: Record<string, number | null>; freeMonths: number;
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

// Plan cards with a monthly / yearly switch (yearly = 12 months minus the free ones).
export function PricingPlans({ p, lang, prices, freeMonths }: Props) {
  const [yearly, setYearly] = useState(false);
  const fmt = new Intl.NumberFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-US");

  return (
    <>
      <div role="radiogroup" className="mx-auto mt-10 flex w-fit items-center gap-1 rounded-full border border-line bg-card p-1 text-sm">
        {[false, true].map((y) => (
          <button
            key={String(y)} type="button" role="radio" aria-checked={yearly === y} onClick={() => setYearly(y)}
            className={`flex min-h-10 items-center gap-2 rounded-full px-5 font-medium transition ${yearly === y ? "bg-brand-gradient text-white" : "text-muted hover:text-ink"}`}
          >
            {y ? p.yearly : p.monthly}
            {y && <span className={`rounded-full px-2 py-0.5 text-xs ${yearly ? "bg-white/20" : "bg-teal/15 text-teal"}`}>{p.yearlySave}</span>}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        {p.plans.map((plan) => {
          const month = prices[plan.id];
          const pro = plan.id === "pro";
          const shown = month === null ? null : yearly ? month * (12 - freeMonths) : month;
          return (
            <article
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border bg-card p-7 transition ${pro ? "border-teal/60 shadow-2xl shadow-teal/10 lg:-mt-4 lg:pb-11" : "border-line"}`}
            >
              {pro && <span className="bg-brand-gradient absolute -top-3 start-6 rounded-full px-3 py-1 text-xs font-semibold text-white">{p.popular}</span>}
              <h3 className="text-xl font-semibold">{plan.name}</h3>
              <p className="mt-2 min-h-12 text-sm leading-relaxed text-muted">{plan.text}</p>
              <div className="mt-5 min-h-20">
                {shown === null ? (
                  <p className="text-3xl font-semibold">{p.custom}</p>
                ) : (
                  <>
                    <p className="flex items-baseline gap-2">
                      <span className="text-4xl font-semibold tracking-tight tabular-nums">{fmt.format(shown)}</span>
                      <span className="text-sm text-muted">{yearly ? p.perYear : p.perMonth}</span>
                    </p>
                    <p className="mt-1.5 text-xs font-medium text-teal">
                      {yearly ? fill(p.saving, { amount: fmt.format(month! * freeMonths) }) : fill(p.perDay, { day: fmt.format(Math.round(month! / 30)) })}
                    </p>
                  </>
                )}
              </div>
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
                {shown === null ? p.contactCta : p.trialCta}
              </a>
              {shown !== null && <p className="mt-3 text-center text-xs text-muted">{p.reassure}</p>}
            </article>
          );
        })}
      </div>
    </>
  );
}
