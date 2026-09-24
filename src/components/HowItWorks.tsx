import type { Dictionary } from "@/i18n";
import { Reveal } from "./Reveal";
import { Section, SectionHeading } from "./Section";

// Vertical timeline, echoing the reference site's work-experience list.
export function HowItWorks({ t }: { t: Dictionary }) {
  return (
    <Section id="how" className="border-y border-line">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
        <SectionHeading eyebrow={t.how.eyebrow} title={t.how.title} />
        <ol className="relative">
          <span aria-hidden className="absolute start-7 top-4 bottom-4 w-px bg-line" />
          {t.how.steps.map((s, i) => (
            <Reveal key={s.title} delay={0.08 * i}>
              <li className="relative flex items-start gap-6 pb-10 last:pb-0">
                <span className="relative grid size-14 shrink-0 place-items-center rounded-lg border border-line bg-bg font-mono text-lg text-teal">
                  0{i + 1}
                </span>
                <div className="pt-2">
                  <h3 className="text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{s.text}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}
