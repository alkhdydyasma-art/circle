import type { Dictionary } from "@/i18n";
import { Section, SectionHeading } from "./Section";

export function HowItWorks({ t }: { t: Dictionary }) {
  return (
    <Section id="how" className="bg-surface">
      <SectionHeading eyebrow={t.how.eyebrow} title={t.how.title} />
      <ol className="relative mt-14 grid gap-6 md:grid-cols-4">
        <div
          aria-hidden
          className="bg-brand-gradient absolute inset-x-[12%] top-6 hidden h-0.5 opacity-30 md:block"
        />
        {t.how.steps.map((s, i) => (
          <li key={s.title} className="relative text-center">
            <span className="bg-brand-gradient relative mx-auto flex size-12 items-center justify-center rounded-full text-lg font-bold text-white ring-8 ring-surface">
              {i + 1}
            </span>
            <h3 className="mt-5 font-semibold">{s.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
