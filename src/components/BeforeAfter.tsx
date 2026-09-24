import { Check, X } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { Section, SectionHeading } from "./Section";

export function BeforeAfter({ t }: { t: Dictionary }) {
  const c = t.compare;
  return (
    <Section>
      <SectionHeading eyebrow={c.eyebrow} title={c.title} />
      <div className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-2">
        <div className="rounded-3xl border border-line bg-surface p-8">
          <h3 className="font-semibold text-muted">{c.beforeTitle}</h3>
          <ul className="mt-6 space-y-4">
            {c.before.map((item) => (
              <li key={item} className="flex items-start gap-3 text-muted">
                <X className="mt-0.5 size-5 shrink-0 text-rose-400" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-brand-gradient rounded-3xl p-8 text-white shadow-xl shadow-brand/20">
          <h3 className="font-semibold">{c.afterTitle}</h3>
          <ul className="mt-6 space-y-4">
            {c.after.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <Check className="mt-0.5 size-5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}
