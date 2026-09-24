import { Check, X } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { Reveal } from "./Reveal";
import { Section, SectionHeading } from "./Section";

export function BeforeAfter({ t }: { t: Dictionary }) {
  const c = t.compare;
  return (
    <Section>
      <SectionHeading eyebrow={c.eyebrow} title={c.title} />
      <div className="mt-14 grid gap-5 md:grid-cols-2">
        <Reveal>
          <div className="h-full rounded-xl border border-line bg-card p-8">
            <h3 className="text-sm font-medium text-muted ltr:font-mono ltr:tracking-widest ltr:uppercase">{c.beforeTitle}</h3>
            <ul className="mt-6 space-y-4">
              {c.before.map((item) => (
                <li key={item} className="flex items-start gap-3 text-muted">
                  <X className="mt-0.5 size-5 shrink-0 text-rose-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="relative h-full overflow-hidden rounded-xl border border-teal/40 bg-card p-8">
            <div aria-hidden className="absolute -end-20 -top-20 size-56 rounded-full bg-teal/15 blur-3xl" />
            <h3 className="relative text-sm font-medium text-teal ltr:font-mono ltr:tracking-widest ltr:uppercase">{c.afterTitle}</h3>
            <ul className="relative mt-6 space-y-4">
              {c.after.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="mt-0.5 size-5 shrink-0 text-teal" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
