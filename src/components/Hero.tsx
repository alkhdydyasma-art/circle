import { ArrowDown, ArrowUpLeft, Sparkles } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { HeroArt } from "./HeroArt";
import { Reveal } from "./Reveal";
import { WhatsAppDemo } from "./WhatsAppDemo";

export function Hero({ t }: { t: Dictionary }) {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 pt-20 pb-24 md:px-8 lg:grid-cols-[1.15fr_1fr] lg:pt-32">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-sm text-muted">
              <Sparkles className="size-4 text-teal" />
              {t.hero.badge}
            </span>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-6 text-4xl leading-tight font-semibold tracking-tight sm:text-5xl lg:text-[3.6rem] lg:leading-[1.15]">
              {t.hero.title} <span className="text-gradient">{t.hero.titleAccent}</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">{t.hero.subtitle}</p>
          </Reveal>
          <Reveal delay={0.16}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a
                href="#demo"
                className="group bg-brand-gradient inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white shadow-lg shadow-teal/20 transition hover:shadow-teal/40"
              >
                {t.hero.primary}
                <ArrowUpLeft className="size-4 transition group-hover:-translate-y-0.5 ltr:-scale-x-100" />
              </a>
              <a
                href="#how"
                className="inline-flex items-center gap-2 border-b border-line py-2 text-muted transition hover:border-ink hover:text-ink"
              >
                {t.hero.secondary}
                <ArrowDown className="size-4" />
              </a>
            </div>
          </Reveal>
          <Reveal delay={0.24}>
            <dl className="mt-14 flex max-w-lg">
              {t.hero.stats.map((s) => (
                <div key={s.label} className="flex flex-1 flex-col border-line px-5 first:ps-0 not-first:border-s">
                  <dt className="text-sm text-muted">{s.label}</dt>
                  <dd className="order-first font-display text-3xl font-semibold">
                    <bdi>{s.value}</bdi>
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
        <Reveal delay={0.2}>
          <div className="relative mx-auto grid aspect-square w-full max-w-[32rem] place-items-center">
            <HeroArt />
            <WhatsAppDemo t={t.chat} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
