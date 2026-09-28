import Image from "next/image";
import { ArrowUpLeft } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { Reveal } from "./Reveal";
import { Section, SectionHeading } from "./Section";

const SHOTS = ["/showcase/modern.webp", "/showcase/founding-day.webp", "/showcase/national-day.webp"];

// Real screenshots of the clinic website templates (the demo clinic at /c/noor).
export function TemplatesShowcase({ t, lang }: { t: Dictionary; lang: Locale }) {
  const s = t.showcase;
  return (
    <Section id="websites">
      <SectionHeading eyebrow={s.eyebrow} title={s.title} subtitle={s.subtitle} />
      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {s.items.map(([name, note], i) => (
          <Reveal key={name} delay={0.06 * i}>
            <figure className="group overflow-hidden rounded-xl border border-line bg-card shadow-xl shadow-black/5 transition duration-300 hover:-translate-y-1">
              <div className="flex items-center gap-1.5 border-b border-line px-3 py-2" dir="ltr">
                <span className="size-2.5 rounded-full bg-rose-400/80" /><span className="size-2.5 rounded-full bg-amber-400/80" /><span className="size-2.5 rounded-full bg-emerald-400/80" />
              </div>
              <div className="relative aspect-[8/5] overflow-hidden">
                <Image src={SHOTS[i]} alt={name} fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover object-top transition duration-700 group-hover:scale-[1.03]" />
              </div>
              <figcaption className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-semibold">{name}</span><span className="text-muted">{note}</span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
      <Reveal delay={0.2}>
        <a href={`/${lang}/c/noor`} target="_blank" rel="noopener noreferrer" className="mt-10 inline-flex items-center gap-2 font-semibold text-teal hover:underline">
          {s.demo}<ArrowUpLeft className="size-4 ltr:-scale-x-100" />
        </a>
      </Reveal>
    </Section>
  );
}
