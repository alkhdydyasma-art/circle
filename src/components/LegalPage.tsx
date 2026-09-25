import type { Dictionary, Locale } from "@/i18n";
import { COMPANY } from "@/lib/company";
import { LAST_UPDATED, type LegalDoc } from "@/legal/content";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function LegalPage({ doc, lang, t }: { doc: LegalDoc; lang: Locale; t: Dictionary }) {
  const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "long" }).format(new Date(LAST_UPDATED));
  const legalId = lang === "ar" ? COMPANY.legalIdAr : COMPANY.legalIdEn;
  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        <h1 className="text-4xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="mt-3 text-sm text-muted">{t.legal.updated}: {date}</p>
        <p className="mt-8 text-lg leading-relaxed text-muted">{doc.intro}</p>
        <nav className="mt-8 rounded-xl border border-line bg-card p-5 text-sm">
          <ol className="grid gap-1.5 sm:grid-cols-2">
            {doc.sections.map((s, i) => (
              <li key={s.id}><a href={`#${s.id}`} className="text-muted hover:text-teal">{i + 1}. {s.title}</a></li>
            ))}
          </ol>
        </nav>
        {doc.sections.map((s, i) => (
          <section key={s.id} id={s.id} className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-semibold">{i + 1}. {s.title}</h2>
            <div className="mt-4 space-y-4 leading-loose text-muted">
              {s.body.map((b, j) =>
                Array.isArray(b) ? (
                  <ul key={j} className="list-disc space-y-2 ps-6">{b.map((li) => <li key={li}>{li}</li>)}</ul>
                ) : <p key={j}>{b}</p>,
              )}
            </div>
          </section>
        ))}
        <section className="mt-12 rounded-xl border border-line bg-card p-6 text-sm leading-relaxed">
          <p className="font-semibold text-ink">{lang === "ar" ? COMPANY.nameAr : COMPANY.nameEn}</p>
          {legalId && <p className="text-muted">{legalId}</p>}
          <p className="text-muted">{COMPANY.city[lang]}</p>
          <p className="mt-2 text-muted">{t.legal.contact}</p>
        </section>
      </main>
      <SiteFooter t={t} lang={lang} />
    </>
  );
}
