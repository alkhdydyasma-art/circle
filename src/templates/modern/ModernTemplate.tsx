/* eslint-disable @next/next/no-img-element -- clinic images are arbitrary https URLs */
import Link from "next/link";
import { CalendarCheck, Clock, MapPin, MessageCircle, Phone, Sparkles, Stethoscope } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import type { TemplateProps } from "../types";

// "Modern": airy white layout, brand colour for actions, soft brand-tinted panels.

const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-full bg-site-primary px-6 py-3 font-semibold text-site-primary-fg shadow-lg shadow-[color-mix(in_srgb,var(--c-primary)_30%,transparent)] transition hover:brightness-110";
const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-full border border-site-line bg-site-bg px-6 py-3 font-semibold transition hover:border-site-primary hover:text-site-primary";

function Monogram({ name, className = "" }: { name: string; className?: string }) {
  // "عيادة النور" → "ن", "د. سارة" → "س"
  const letter = name.replace(/^(عيادة|مركز|مجمع|د\.)\s*/, "").trim().replace(/^ال/, "").charAt(0);
  return (
    <span className={`grid place-items-center rounded-2xl bg-gradient-to-br from-site-primary to-site-accent font-bold text-site-primary-fg ${className}`}>
      {letter}
    </span>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Reveal className="max-w-2xl">
      <span className="mb-4 block h-1 w-12 rounded-full bg-gradient-to-r from-site-primary to-site-accent" />
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-3 text-lg text-site-muted">{subtitle}</p>
    </Reveal>
  );
}

export function ModernTemplate(p: TemplateProps) {
  const { site, t } = p;
  const { clinic, content } = { clinic: site.clinic, content: site.site.content };
  const nav = [
    p.show.services && { href: "#services", label: t.nav.services },
    p.show.doctors && { href: "#doctors", label: t.nav.doctors },
    p.show.branches && { href: "#branches", label: t.nav.branches },
    { href: "#contact", label: t.nav.contact },
  ].filter(Boolean) as { href: string; label: string }[];

  const facts = [
    { value: site.doctors.length, label: t.facts.doctors },
    { value: site.services.length, label: t.facts.services },
    { value: site.branches.length, label: t.facts.branches },
  ].filter((f) => f.value > 0);

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-site-line bg-[color-mix(in_srgb,var(--c-bg)_85%,transparent)] backdrop-blur-lg">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-5">
          <a href="#top" className="flex items-center gap-3">
            {p.logoUrl ? (
              <img src={p.logoUrl} alt={clinic.name} className="h-10 w-auto" />
            ) : (
              <Monogram name={clinic.name} className="size-10 text-lg" />
            )}
            <span className="max-w-[12rem] truncate font-bold sm:max-w-none">{clinic.name}</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm text-site-muted md:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="transition hover:text-site-primary">{n.label}</a>
            ))}
          </nav>
          <a href={p.bookHref} className={`${btnPrimary} px-5 py-2.5 text-sm`}>
            <CalendarCheck className="size-4" />
            <span className="hidden sm:inline">{t.book}</span>
          </a>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="absolute -end-40 -top-40 size-[34rem] rounded-full bg-site-primary opacity-[0.08] blur-3xl" />
          <div aria-hidden className="absolute -start-40 top-40 size-[28rem] rounded-full bg-site-accent opacity-[0.08] blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pt-16 pb-20 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
            <div>
              <Reveal>
                {clinic.city && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-site-surface px-3 py-1 text-sm text-site-muted">
                    <MapPin className="size-4 text-site-primary" />
                    {clinic.city}
                  </span>
                )}
                <h1 className="mt-5 text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl lg:text-[3.4rem]">
                  {content.tagline ?? clinic.name}
                </h1>
                {content.about && <p className="mt-5 max-w-xl text-lg leading-relaxed text-site-muted">{content.about}</p>}
              </Reveal>
              <Reveal delay={0.1}>
                <div className="mt-8 flex flex-wrap gap-3">
                  <a href={p.bookHref} className={btnPrimary}>
                    <CalendarCheck className="size-5" />
                    {t.book}
                  </a>
                  {p.whatsappHref && (
                    <a href={p.whatsappHref} target="_blank" rel="noopener noreferrer" className={btnGhost}>
                      <MessageCircle className="size-5 text-[#25d366]" />
                      {t.whatsapp}
                    </a>
                  )}
                </div>
              </Reveal>
              {facts.length > 0 && (
                <Reveal delay={0.18}>
                  <dl className="mt-12 flex gap-8">
                    {facts.map((f) => (
                      <div key={f.label} className="flex flex-col">
                        <dt className="text-sm text-site-muted">{f.label}</dt>
                        <dd className="order-first text-3xl font-extrabold text-site-primary">{f.value}</dd>
                      </div>
                    ))}
                  </dl>
                </Reveal>
              )}
            </div>

            <Reveal delay={0.15}>
              {p.heroImageUrl ? (
                <img src={p.heroImageUrl} alt="" className="aspect-[4/5] w-full rounded-[2rem] object-cover shadow-2xl" />
              ) : (
                <div className="relative rounded-[2rem] bg-gradient-to-br from-[color-mix(in_srgb,var(--c-primary)_14%,var(--c-bg))] to-[color-mix(in_srgb,var(--c-accent)_14%,var(--c-bg))] p-6 sm:p-8">
                  <div className="flex items-center gap-3">
                    <Monogram name={clinic.name} className="size-12 text-xl" />
                    <div>
                      <p className="font-bold">{clinic.name}</p>
                      <p className="text-sm text-site-muted">{t.heroCard}</p>
                    </div>
                  </div>
                  <ul className="mt-6 space-y-3">
                    {site.services.slice(0, 4).map((s, i) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-site-bg p-4 shadow-sm"
                        style={{ marginInlineStart: `${(i % 2) * 1.5}rem` }}
                      >
                        <span className="flex items-center gap-3">
                          <span className="grid size-9 place-items-center rounded-xl bg-site-surface text-site-primary">
                            <Sparkles className="size-4" />
                          </span>
                          <span className="font-medium">{s.name}</span>
                        </span>
                        <span className="flex items-center gap-1 text-sm text-site-muted">
                          <Clock className="size-3.5" />
                          {s.duration_minutes} {t.services.minutes}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Reveal>
          </div>
        </section>

        {/* Services */}
        {p.show.services && site.services.length > 0 && (
          <section id="services" className="scroll-mt-20 bg-site-surface py-20 md:py-28">
            <div className="mx-auto max-w-6xl px-5">
              <SectionTitle title={t.services.title} subtitle={t.services.subtitle} />
              <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {site.services.map((s, i) => (
                  <Reveal key={s.id} delay={0.05 * (i % 3)}>
                    <article className="group flex h-full flex-col rounded-3xl border border-site-line bg-site-bg p-6 transition hover:-translate-y-1 hover:border-site-primary hover:shadow-xl">
                      <span className="grid size-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--c-primary)_10%,transparent)] text-site-primary">
                        <Sparkles className="size-5" />
                      </span>
                      <h3 className="mt-5 text-xl font-bold">{s.name}</h3>
                      {s.description && <p className="mt-2 flex-1 leading-relaxed text-site-muted">{s.description}</p>}
                      <div className="mt-5 flex items-center justify-between border-t border-site-line pt-4 text-sm">
                        <span className="flex items-center gap-1.5 text-site-muted">
                          <Clock className="size-4" />
                          {s.duration_minutes} {t.services.minutes}
                        </span>
                        {s.price != null && (
                          <span>
                            <span className="text-site-muted">{t.services.from} </span>
                            <span className="font-bold text-site-primary">{p.formatPrice(s.price)}</span>
                          </span>
                        )}
                      </div>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Doctors */}
        {p.show.doctors && site.doctors.length > 0 && (
          <section id="doctors" className="scroll-mt-20 py-20 md:py-28">
            <div className="mx-auto max-w-6xl px-5">
              <SectionTitle title={t.doctors.title} subtitle={t.doctors.subtitle} />
              <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {site.doctors.map((d, i) => (
                  <Reveal key={d.id} delay={0.06 * (i % 3)}>
                    <article className="h-full overflow-hidden rounded-3xl border border-site-line bg-site-bg">
                      {d.photo_url?.startsWith("https://") ? (
                        <img src={d.photo_url} alt={d.full_name} className="aspect-[4/3] w-full object-cover" />
                      ) : (
                        <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-[color-mix(in_srgb,var(--c-primary)_16%,var(--c-bg))] to-[color-mix(in_srgb,var(--c-accent)_16%,var(--c-bg))]">
                          <Monogram name={d.full_name} className="size-20 rounded-full text-3xl" />
                        </div>
                      )}
                      <div className="p-6">
                        <h3 className="text-lg font-bold">{d.full_name}</h3>
                        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-site-primary">
                          <Stethoscope className="size-4" />
                          {[d.title, d.specialty].filter(Boolean).join(" · ")}
                        </p>
                        {d.bio && <p className="mt-3 text-sm leading-relaxed text-site-muted">{d.bio}</p>}
                      </div>
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Branches */}
        {p.show.branches && site.branches.length > 0 && (
          <section id="branches" className="scroll-mt-20 bg-site-surface py-20 md:py-28">
            <div className="mx-auto max-w-6xl px-5">
              <SectionTitle title={t.branches.title} subtitle={t.branches.subtitle} />
              <div className="mt-12 grid gap-5 md:grid-cols-2">
                {site.branches.map((b) => (
                  <Reveal key={b.id}>
                    <article className="flex h-full flex-col gap-4 rounded-3xl border border-site-line bg-site-bg p-6 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-4">
                        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--c-primary)_10%,transparent)] text-site-primary">
                          <MapPin className="size-5" />
                        </span>
                        <div>
                          <h3 className="text-lg font-bold">{b.name}</h3>
                          {b.address && <p className="mt-1 text-site-muted">{b.address}</p>}
                          {b.phone && (
                            <a href={`tel:${b.phone}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-site-muted hover:text-site-primary">
                              <Phone className="size-3.5" />
                              <bdi dir="ltr">{b.phone}</bdi>
                            </a>
                          )}
                        </div>
                      </div>
                      {b.maps_url?.startsWith("https://") && (
                        <a href={b.maps_url} target="_blank" rel="noopener noreferrer" className={`${btnGhost} shrink-0 px-4 py-2 text-sm`}>
                          {t.branches.map}
                        </a>
                      )}
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Call to action */}
        <section id="contact" className="scroll-mt-20 py-20 md:py-28">
          <Reveal className="mx-auto max-w-6xl px-5">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-site-primary to-site-accent p-10 text-site-primary-fg md:p-14">
              <div aria-hidden className="absolute -end-20 -top-20 size-72 rounded-full bg-white/10" />
              <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                  <h2 className="text-3xl font-bold sm:text-4xl">{t.cta.title}</h2>
                  <p className="mt-3 text-lg opacity-90">{t.cta.subtitle}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a href={p.bookHref} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-white/90">
                    <CalendarCheck className="size-5" />
                    {t.book}
                  </a>
                  {p.telHref && (
                    <a href={p.telHref} className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 font-semibold transition hover:bg-white/10">
                      <Phone className="size-5" />
                      {t.call}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-site-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 text-sm text-site-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {p.logoUrl ? <img src={p.logoUrl} alt="" className="h-8 w-auto" /> : <Monogram name={clinic.name} className="size-8 text-sm" />}
            <span>© {new Date().getFullYear()} {clinic.name}. {t.footer.rights}</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            {site.site.phone && (
              <a href={p.telHref} className="flex items-center gap-1.5 hover:text-site-primary">
                <Phone className="size-4" /> <bdi dir="ltr">{site.site.phone}</bdi>
              </a>
            )}
            <Link href={`/${p.lang}`} className="opacity-70 transition hover:opacity-100">
              {t.footer.poweredBy} <span className="font-semibold">Circle</span>
            </Link>
          </div>
        </div>
      </footer>

      {p.whatsappHref && (
        <a
          href={p.whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.whatsapp}
          className="fixed end-5 bottom-5 z-40 grid size-14 place-items-center rounded-full bg-[#25d366] text-white shadow-xl transition hover:scale-105"
        >
          <MessageCircle className="size-7" />
        </a>
      )}
    </>
  );
}
