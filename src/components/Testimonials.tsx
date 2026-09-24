import { Quote } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { Reveal } from "./Reveal";
import { Section, SectionHeading } from "./Section";

// Set to false once `t.testimonials.items` holds real, approved customer quotes.
const IS_SAMPLE = true;

export function Testimonials({ t }: { t: Dictionary }) {
  const s = t.testimonials;
  return (
    <Section id="testimonials">
      <SectionHeading eyebrow={s.eyebrow} title={s.title} />
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {s.items.map((item, i) => (
          <Reveal key={item.quote} delay={0.08 * i}>
            <figure className="flex h-full flex-col rounded-xl border border-line bg-card p-7 transition duration-300 hover:border-teal/40">
              <Quote className="size-7 text-teal/70 rtl:-scale-x-100" />
              <blockquote className="mt-4 flex-1 leading-relaxed">{item.quote}</blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-line pt-5">
                <span className="bg-brand-gradient grid size-10 place-items-center rounded-full text-sm font-semibold text-white">
                  {item.role.charAt(0)}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{item.role}</span>
                  <span className="block text-sm text-muted">{item.city}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
      {IS_SAMPLE && <p className="mt-6 text-center text-xs text-muted">{s.sampleNote}</p>}
    </Section>
  );
}
