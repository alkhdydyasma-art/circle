/* eslint-disable @next/next/no-img-element -- clinic images are uploaded files or bundled demo images */
import Link from "next/link";
import {
  ArrowUpLeft, BellRing, CalendarCheck, ChevronDown, Clock, MapPin, MessageCircle, Phone, ScanLine,
  ShieldCheck, Sparkles, Stethoscope,
} from "lucide-react";
import { Reveal } from "@/components/Reveal";
import type { TemplateProps } from "../types";
import { Crenellation, NajdiArch, OccasionRibbon, SaduBand, StarPattern } from "../OccasionDecor";
import { CaseSlider } from "../parts/CaseSlider";

// The clinic website. Warm neutral canvas, the clinic's colour for actions and accents,
// a floating 3D tooth in the hero, before/after sliders and a dark "how booking works"
// band. Occasion themes (Founding Day, National Day) reuse the layout with their own
// palette (theme.ts) and motifs (OccasionDecor.tsx).

const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-site-primary px-7 py-3.5 font-semibold text-site-primary-fg shadow-[0_14px_34px_-12px_color-mix(in_srgb,var(--c-primary)_70%,transparent)] transition hover:-translate-y-0.5 hover:brightness-110";
const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-site-line bg-[color-mix(in_srgb,var(--c-card)_75%,transparent)] px-7 py-3.5 font-semibold backdrop-blur transition hover:border-site-primary hover:text-site-primary";
const eyebrowCls = "text-sm font-bold text-site-primary";
const h2Cls = "mt-3 text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl";

function Monogram({ name, className = "" }: { name: string; className?: string }) {
  // "عيادة النور" → "ن", "د. سارة" → "س"
  const letter = name.replace(/^(عيادة|مركز|مجمع|د\.)\s*/, "").trim().replace(/^ال/, "").charAt(0);
  return (
    <span className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-site-primary to-site-accent font-bold text-site-primary-fg ${className}`}>
      {letter}
    </span>
  );
}

// Highlights the end of the headline in the clinic colour: "ابتسامتك تستحق <رعاية هادئة ودقيقة>".
function Headline({ text, onDark = false }: { text: string; onDark?: boolean }) {
  const words = text.trim().split(/\s+/);
  if (words.length < 4) return <>{text}</>;
  const cut = words.length - Math.min(3, Math.ceil(words.length / 2));
  return (
    <>
      {words.slice(0, cut).join(" ")}{" "}
      <span className={`bg-clip-text text-transparent ${onDark ? "bg-gradient-to-l from-site-accent to-[#f3e3b3]" : "bg-gradient-to-l from-site-primary to-site-accent"}`}>{words.slice(cut).join(" ")}</span>
    </>
  );
}

function Header({ p }: { p: TemplateProps }) {
  const { site, t } = p;
  const nav = [
    p.show.services && site.services.length > 0 && { href: "#services", label: t.nav.services },
    p.show.doctors && site.doctors.length > 0 && { href: "#doctors", label: t.nav.doctors },
    p.cases.length > 0 && { href: "#results", label: t.nav.results },
    p.show.branches && site.branches.length > 0 && { href: "#branches", label: t.nav.branches },
    { href: "#contact", label: t.nav.contact },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <header className="sticky top-0 z-40 border-b border-site-line bg-[color-mix(in_srgb,var(--c-bg)_82%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-5 lg:px-10">
        <a href="#top" className="flex min-w-0 items-center gap-3">
          {p.logoUrl ? (
            <img src={p.logoUrl} alt={site.clinic.name} className="h-11 w-auto max-w-40 object-contain" />
          ) : (
            <Monogram name={site.clinic.name} className="size-11 text-lg" />
          )}
          <span className="truncate font-bold">{site.clinic.name}</span>
        </a>
        <nav className="hidden items-center gap-7 text-sm font-medium text-site-muted lg:flex">
          {nav.map((n) => <a key={n.href} href={n.href} className="transition hover:text-site-primary">{n.label}</a>)}
        </nav>
        <a href={p.bookHref} className={`${btnPrimary} shrink-0 px-5 py-2.5 text-sm`}>
          <CalendarCheck className="size-4" />
          <span className="hidden sm:inline">{t.book}</span>
        </a>
      </div>
      {p.occasion === "founding_day" && <Crenellation id="cren-header" className="-mb-px text-site-deep" />}
    </header>
  );
}

function Hero({ p }: { p: TemplateProps }) {
  const { site, t } = p;
  const { clinic } = site;
  const content = site.site.content;
  const national = p.occasion === "national_day";
  const stats = [
    { value: String(site.doctors.length), label: t.facts.doctors, show: site.doctors.length > 0 },
    { value: String(site.services.length), label: t.facts.services, show: site.services.length > 0 },
    { value: String(site.branches.length), label: t.facts.branches, show: site.branches.length > 1 },
    { value: "24/7", label: t.hero.online, show: true },
  ].filter((s) => s.show).slice(0, 3);

  return (
    <section className={`relative isolate overflow-hidden ${national ? "bg-site-deep text-site-deep-fg" : "border-b border-site-line"}`}>
      {p.heroImageUrl && !national && (
        <img src={p.heroImageUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-20" />
      )}
      {national ? (
        <>
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,color-mix(in_srgb,var(--c-primary)_55%,transparent),transparent_65%)]" />
          <StarPattern id="stars-hero" color="#ffffff" className="-z-10 opacity-[0.07] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        </>
      ) : (
        <>
          <div aria-hidden className="absolute inset-0 -z-10 bg-[color-mix(in_srgb,var(--c-bg)_76%,transparent)] backdrop-blur-[2px]" />
          <div aria-hidden className="absolute inset-x-[-8%] top-[16%] -z-10 h-[60%] -rotate-3 border-y border-[color-mix(in_srgb,var(--c-card)_70%,transparent)] bg-[color-mix(in_srgb,var(--c-card)_45%,transparent)] backdrop-blur-xl" />
        </>
      )}

      <div className="mx-auto flex max-w-7xl flex-col items-center px-5 pt-10 pb-12 text-center sm:pt-14 sm:pb-16 lg:px-10 lg:pt-16">
        <Reveal>
          <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold ${national ? "border-white/20 bg-white/10 text-site-accent" : "border-[color-mix(in_srgb,var(--c-primary)_22%,transparent)] bg-[color-mix(in_srgb,var(--c-surface)_70%,transparent)] text-site-primary"}`}>
            {p.occasion ? <Sparkles className="size-4" /> : <ShieldCheck className="size-4" />}
            {p.occasion ? t.occasion[p.occasion] : clinic.city ? `${clinic.name} · ${clinic.city}` : clinic.name}
          </span>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="mt-7 max-w-5xl text-4xl leading-[1.25] font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            <Headline text={content.tagline ?? clinic.name} onDark={national} />
          </h1>
        </Reveal>

        <div className="relative my-6 h-44 w-44 sm:my-8 sm:h-56 sm:w-56">
          {p.occasion === "founding_day" && <NajdiArch className="-top-6 -bottom-2 h-[118%] w-auto" />}
          <div aria-hidden className={`absolute inset-3 rounded-full blur-2xl ${national ? "bg-site-accent/25" : "bg-[color-mix(in_srgb,var(--c-primary)_22%,transparent)]"}`} />
          <img src="/demo/tooth-3d.webp" alt="" width={900} height={900} className="site-float relative size-full object-contain drop-shadow-2xl" />
          {t.hero.chips.map(([title, text], i) => (
            <span
              key={title}
              className={`absolute hidden rounded-xl border px-4 py-3 text-start text-xs shadow-xl backdrop-blur-xl sm:block ${i === 0 ? "-end-44 top-6" : "-start-48 bottom-6"} ${national ? "border-white/15 bg-white/10" : "border-[color-mix(in_srgb,var(--c-card)_70%,transparent)] bg-[color-mix(in_srgb,var(--c-card)_78%,transparent)]"}`}
            >
              <b className="block text-sm">{title}</b>
              <span className={national ? "text-site-deep-fg/70" : "text-site-muted"}>{text}</span>
            </span>
          ))}
        </div>

        {content.about && (
          <Reveal>
            <p className={`max-w-2xl text-base leading-8 sm:text-lg ${national ? "text-site-deep-fg/75" : "text-site-muted"}`}>{content.about}</p>
          </Reveal>
        )}
        <Reveal delay={0.08}>
          <div className="mt-8 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <a href={p.bookHref} className={national ? "inline-flex items-center justify-center gap-2 rounded-xl bg-site-accent px-7 py-3.5 font-semibold text-[#1a1406] shadow-[0_14px_34px_-12px_rgb(199_160_74/0.6)] transition hover:-translate-y-0.5 hover:brightness-105" : btnPrimary}>
              <CalendarCheck className="size-5" />{t.book}
            </a>
            {p.whatsappHref && (
              <a href={p.whatsappHref} target="_blank" rel="noopener noreferrer" className={national ? "inline-flex items-center justify-center gap-2 rounded-xl border border-white/25 px-7 py-3.5 font-semibold transition hover:bg-white/10" : btnGhost}>
                <MessageCircle className="size-5 text-[#25d366]" />{t.whatsapp}
              </a>
            )}
          </div>
        </Reveal>
        <Reveal delay={0.12} className="w-full">
          <dl className={`mx-auto mt-10 grid w-full max-w-3xl border-t pt-6 ${national ? "border-white/15" : "border-site-line"}`} style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
            {stats.map((s, i) => (
              <div key={s.label} className={`flex flex-col ${i > 0 ? `border-s ${national ? "border-white/15" : "border-site-line"}` : ""}`}>
                <dt className={`text-xs sm:text-sm ${national ? "text-site-deep-fg/65" : "text-site-muted"}`}>{s.label}</dt>
                <dd className="order-first text-2xl font-extrabold sm:text-3xl"><bdi>{s.value}</bdi></dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
      {p.occasion === "founding_day" && <SaduBand id="sadu-hero" className="h-3" />}
    </section>
  );
}

export function ModernTemplate(p: TemplateProps) {
  const { site, t } = p;
  const why = t.why.items.map((item, i) => (i === 2 && !p.remindersEnabled ? t.why.noReminders : item));
  const steps = p.remindersEnabled ? t.how.steps : t.how.steps.slice(0, 2);

  return (
    <>
      {p.occasion && <OccasionRibbon occasion={p.occasion} text={t.occasion[p.occasion]} />}
      <Header p={p} />

      <main id="top">
        <Hero p={p} />

        {/* Why us */}
        <section className="bg-[color-mix(in_srgb,var(--c-surface)_55%,var(--c-bg))] py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-10">
            <Reveal className="max-w-2xl">
              <p className={eyebrowCls}>{t.why.eyebrow}</p>
              <h2 className={h2Cls}>{t.why.title}</h2>
            </Reveal>
            <div className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-site-line sm:grid-cols-2 lg:grid-cols-4">
              {why.map(([title, text], i) => (
                <Reveal key={title} delay={0.05 * i}>
                  <article className="h-full bg-site-bg p-7 transition duration-300 hover:bg-site-card">
                    <span className="text-sm font-bold text-site-primary"><bdi>{String(i + 1).padStart(2, "0")}</bdi></span>
                    <h3 className="mt-5 text-lg font-bold">{title}</h3>
                    <p className="mt-3 text-sm leading-7 text-site-muted">{text}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Services */}
        {p.show.services && site.services.length > 0 && (
          <section id="services" className="scroll-mt-20 py-20 md:py-24">
            <div className="mx-auto max-w-7xl px-5 lg:px-10">
              <Reveal className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className={eyebrowCls}>{t.nav.services}</p>
                  <h2 className={h2Cls}>{t.services.subtitle}</h2>
                </div>
              </Reveal>
              <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {site.services.map((s, i) => (
                  <Reveal key={s.id} delay={0.04 * (i % 3)}>
                    <article className="group flex h-full flex-col rounded-2xl border border-site-line bg-site-card p-6 transition duration-300 hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--c-primary)_45%,transparent)] hover:shadow-[0_20px_50px_-24px_rgb(0_0_0/0.3)]">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="text-lg font-bold">{s.name}</h3>
                        {s.price != null && (
                          <span className="shrink-0 text-end text-sm">
                            <span className="block text-xs text-site-muted">{t.services.from}</span>
                            <span className="font-bold text-site-primary">{p.formatPrice(s.price)}</span>
                          </span>
                        )}
                      </div>
                      {s.description && <p className="mt-3 flex-1 text-sm leading-7 text-site-muted">{s.description}</p>}
                      <div className="mt-5 flex items-center justify-between gap-3 border-t border-site-line pt-4 text-sm">
                        <span className="flex items-center gap-1.5 text-site-muted"><Clock className="size-4" />{s.duration_minutes} {t.services.minutes}</span>
                        <a href={p.serviceBookHref(s.id)} className="inline-flex items-center gap-1 font-semibold text-site-primary">
                          {t.services.bookThis}<ArrowUpLeft className="size-4 transition group-hover:-translate-x-0.5 ltr:-scale-x-100" />
                        </a>
                      </div>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* How booking works */}
        <section className="relative overflow-hidden bg-site-deep py-20 text-site-deep-fg md:py-24">
          {p.occasion === "national_day" && <StarPattern id="stars-how" color="#ffffff" className="opacity-[0.05]" />}
          <div className="relative mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[.8fr_1.2fr] lg:px-10">
            <Reveal>
              <p className="text-sm font-bold text-site-accent">{t.how.eyebrow}</p>
              <h2 className={h2Cls}>{t.how.title}</h2>
              <p className="mt-5 leading-8 text-site-deep-fg/75">{t.how.text}</p>
              <a href={p.bookHref} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-site-deep-fg px-6 py-3 font-semibold text-site-deep transition hover:opacity-90">
                <CalendarCheck className="size-5" />{t.book}
              </a>
            </Reveal>
            <ol className={`grid gap-4 ${steps.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              {steps.map(([title, text], i) => {
                const Icon = [CalendarCheck, ShieldCheck, BellRing][i];
                return (
                  <Reveal key={title} delay={0.06 * i}>
                    <li className="h-full rounded-2xl border border-white/12 bg-white/[0.04] p-6">
                      <span className="text-xs text-site-deep-fg/45"><bdi>{String(i + 1).padStart(2, "0")}</bdi></span>
                      <Icon className="mt-8 size-6 text-site-accent" />
                      <h3 className="mt-4 font-bold">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-site-deep-fg/65">{text}</p>
                    </li>
                  </Reveal>
                );
              })}
            </ol>
          </div>
        </section>

        {/* Doctors */}
        {p.show.doctors && site.doctors.length > 0 && (
          <section id="doctors" className="scroll-mt-20 py-20 md:py-24">
            <div className="mx-auto max-w-7xl px-5 lg:px-10">
              <Reveal className="max-w-2xl">
                <p className={eyebrowCls}>{t.doctors.title}</p>
                <h2 className={h2Cls}>{t.doctors.subtitle}</h2>
              </Reveal>
              <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {site.doctors.map((d, i) => {
                  const photo = p.imageUrl(d.photo_url);
                  return (
                    <Reveal key={d.id} delay={0.05 * (i % 3)}>
                      <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-site-line bg-site-card transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_60px_-28px_rgb(0_0_0/0.35)]">
                        {photo ? (
                          <div className="overflow-hidden">
                            <img src={photo} alt={d.full_name} loading="lazy" className="aspect-[4/3] w-full object-cover object-top transition duration-700 group-hover:scale-[1.04]" />
                          </div>
                        ) : (
                          <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-[color-mix(in_srgb,var(--c-primary)_16%,var(--c-card))] to-[color-mix(in_srgb,var(--c-accent)_16%,var(--c-card))]">
                            <Monogram name={d.full_name} className="size-20 rounded-full text-3xl" />
                          </div>
                        )}
                        <div className="flex flex-1 flex-col p-6">
                          <h3 className="text-xl font-bold">{d.full_name}</h3>
                          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-site-primary">
                            <Stethoscope className="size-4" />{[d.title, d.specialty].filter(Boolean).join(" · ")}
                          </p>
                          {d.bio && <p className="mt-4 flex-1 text-sm leading-7 text-site-muted">{d.bio}</p>}
                          <a href={p.doctorBookHref(d.id)} className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-site-ink px-5 py-3 text-sm font-semibold text-site-bg transition hover:opacity-90">
                            {t.doctors.bookWith}<ArrowUpLeft className="size-4 ltr:-scale-x-100" />
                          </a>
                        </div>
                      </article>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Before / after */}
        {p.cases.length > 0 && (
          <section id="results" className="relative isolate scroll-mt-20 overflow-hidden border-y border-site-line py-20 md:py-28">
            <div aria-hidden className="absolute inset-0 -z-10 bg-[color-mix(in_srgb,var(--c-surface)_60%,var(--c-bg))]" />
            <div aria-hidden className="absolute inset-x-[-8%] top-[18%] -z-10 h-[54%] -rotate-3 border-y border-[color-mix(in_srgb,var(--c-card)_70%,transparent)] bg-[color-mix(in_srgb,var(--c-card)_45%,transparent)] backdrop-blur-xl" />
            <div className="mx-auto max-w-7xl px-5 lg:px-10">
              <Reveal className="mx-auto max-w-3xl text-center">
                <span className="inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--c-primary)_22%,transparent)] bg-[color-mix(in_srgb,var(--c-bg)_70%,transparent)] px-4 py-2 text-xs font-bold text-site-primary backdrop-blur">
                  <ScanLine className="size-4" />{t.cases.eyebrow}
                </span>
                <h2 className="mt-5 text-3xl leading-tight font-extrabold sm:text-5xl">{t.cases.title}</h2>
                <p className="mx-auto mt-4 max-w-2xl leading-8 text-site-muted">{t.cases.subtitle}</p>
              </Reveal>
              <div className="mt-14 space-y-16 md:space-y-20">
                {p.cases.map((c, i) => (
                  <Reveal key={c.id}>
                    <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
                      <div className={i % 2 ? "lg:order-2" : ""}>
                        <CaseSlider before={p.imageUrl(c.before)!} after={p.imageUrl(c.after)!} title={c.title} labels={t.cases} />
                      </div>
                      <div className="max-w-xl">
                        <p className="flex items-center gap-2 text-sm font-bold text-site-primary"><Sparkles className="size-4" /><bdi>{String(i + 1).padStart(2, "0")}</bdi></p>
                        <h3 className="mt-3 text-2xl leading-tight font-extrabold sm:text-3xl">{c.title}</h3>
                        <a href={p.bookHref} className={`${btnPrimary} mt-6 px-6 py-3 text-sm`}>{t.book}<ArrowUpLeft className="size-4 ltr:-scale-x-100" /></a>
                      </div>
                    </article>
                  </Reveal>
                ))}
              </div>
              <p className="mt-12 text-center text-xs text-site-muted">{t.cases.note}</p>
            </div>
          </section>
        )}

        {/* Branches */}
        {p.show.branches && site.branches.length > 0 && (
          <section id="branches" className="scroll-mt-20 py-20 md:py-24">
            <div className="mx-auto max-w-7xl px-5 lg:px-10">
              <Reveal className="max-w-2xl">
                <p className={eyebrowCls}>{t.branches.title}</p>
                <h2 className={h2Cls}>{t.branches.subtitle}</h2>
              </Reveal>
              <div className="mt-10 grid gap-4 md:grid-cols-2">
                {site.branches.map((b) => (
                  <Reveal key={b.id}>
                    <article className="flex h-full flex-col gap-4 rounded-2xl border border-site-line bg-site-card p-6 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-4">
                        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--c-primary)_10%,transparent)] text-site-primary"><MapPin className="size-5" /></span>
                        <div>
                          <h3 className="text-lg font-bold">{b.name}</h3>
                          {b.address && <p className="mt-1 text-site-muted">{b.address}</p>}
                          {b.phone && (
                            <a href={`tel:${b.phone}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-site-muted hover:text-site-primary">
                              <Phone className="size-3.5" /><bdi dir="ltr">{b.phone}</bdi>
                            </a>
                          )}
                        </div>
                      </div>
                      {b.maps_url?.startsWith("https://") && (
                        <a href={b.maps_url} target="_blank" rel="noopener noreferrer" className={`${btnGhost} shrink-0 px-4 py-2 text-sm`}>{t.branches.map}</a>
                      )}
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="border-t border-site-line bg-[color-mix(in_srgb,var(--c-surface)_55%,var(--c-bg))] py-20 md:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[.75fr_1.25fr] lg:px-10">
            <Reveal>
              <p className={eyebrowCls}>{t.faq.eyebrow}</p>
              <h2 className={h2Cls}>{t.faq.title}</h2>
            </Reveal>
            <div className="divide-y divide-site-line border-y border-site-line">
              {t.faq.items.map(([q, a]) => (
                <details key={q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold [&::-webkit-details-marker]:hidden">
                    {q}<ChevronDown className="size-5 shrink-0 text-site-muted transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 leading-8 text-site-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Call to action */}
        <section id="contact" className="scroll-mt-20 py-20 md:py-24">
          <Reveal className="mx-auto max-w-7xl px-5 lg:px-10">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-site-primary to-[color-mix(in_srgb,var(--c-primary)_55%,var(--c-deep))] p-10 text-site-primary-fg md:p-14">
              {p.occasion === "national_day" && <StarPattern id="stars-cta" color="#ffffff" className="opacity-[0.08]" />}
              <div aria-hidden className="absolute -end-24 -top-24 size-80 rounded-full bg-white/10" />
              <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                  <h2 className="text-3xl font-extrabold sm:text-4xl">{t.cta.title}</h2>
                  <p className="mt-3 text-lg opacity-90">{t.cta.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a href={p.bookHref} className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 font-semibold text-slate-900 transition hover:bg-white/90">
                    <CalendarCheck className="size-5" />{t.book}
                  </a>
                  {p.telHref && (
                    <a href={p.telHref} className="inline-flex items-center gap-2 rounded-xl border border-white/40 px-6 py-3.5 font-semibold transition hover:bg-white/10">
                      <Phone className="size-5" />{t.call}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {p.occasion === "founding_day" && <SaduBand id="sadu-footer" />}
      <footer className={`border-t border-site-line ${p.occasion === "national_day" ? "bg-site-deep text-site-deep-fg" : ""}`}>
        <div className={`mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 text-sm sm:flex-row sm:items-center sm:justify-between lg:px-10 ${p.occasion === "national_day" ? "text-site-deep-fg/75" : "text-site-muted"}`}>
          <div className="flex items-center gap-3">
            {p.logoUrl ? <img src={p.logoUrl} alt="" className="h-9 w-auto max-w-32 object-contain" /> : <Monogram name={site.clinic.name} className="size-9 text-sm" />}
            <span>© {new Date().getFullYear()} {site.clinic.name}. {t.footer.rights}</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            {site.site.phone && (
              <a href={p.telHref} className="flex items-center gap-1.5 hover:text-site-primary"><Phone className="size-4" /><bdi dir="ltr">{site.site.phone}</bdi></a>
            )}
            <Link href={`/${p.lang}`} className="opacity-70 transition hover:opacity-100">
              {t.footer.poweredBy} <span className="font-semibold">Circle</span>
            </Link>
          </div>
        </div>
      </footer>

      {p.whatsappHref && (
        <a
          href={p.whatsappHref} target="_blank" rel="noopener noreferrer" aria-label={t.whatsapp}
          className="fixed end-5 bottom-5 z-40 grid size-14 place-items-center rounded-full bg-[#25d366] text-white shadow-xl transition hover:scale-105"
        >
          <MessageCircle className="size-7" />
        </a>
      )}
    </>
  );
}
