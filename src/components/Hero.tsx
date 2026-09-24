import { ArrowDown, Sparkles } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { WhatsAppDemo } from "./WhatsAppDemo";

export function Hero({ t }: { t: Dictionary }) {
  return (
    <section className="bg-glow relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-20 lg:grid-cols-2 lg:pt-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-teal/30 bg-teal/5 px-3 py-1 text-sm font-medium text-teal">
            <Sparkles className="size-4" />
            {t.hero.badge}
          </span>
          <h1 className="mt-6 text-4xl leading-tight font-bold tracking-tight sm:text-5xl lg:text-[3.4rem]">
            {t.hero.title}
            <br />
            <span className="text-gradient">{t.hero.titleAccent}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">{t.hero.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#demo"
              className="bg-brand-gradient rounded-full px-6 py-3 font-semibold text-white shadow-lg shadow-brand/25 transition hover:opacity-90"
            >
              {t.hero.primary}
            </a>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-6 py-3 font-semibold text-ink transition hover:border-brand/40"
            >
              {t.hero.secondary}
              <ArrowDown className="size-4" />
            </a>
          </div>
          <dl className="mt-12 grid max-w-md grid-cols-3 gap-6">
            {t.hero.stats.map((s) => (
              <div key={s.label} className="flex flex-col">
                <dt className="text-sm text-muted">{s.label}</dt>
                <dd className="text-gradient order-first text-2xl font-bold" dir="ltr">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <WhatsAppDemo t={t.chat} />
      </div>
    </section>
  );
}
