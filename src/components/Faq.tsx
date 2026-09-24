import { Plus } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { Reveal } from "./Reveal";
import { Section, SectionHeading } from "./Section";

export function Faq({ t }: { t: Dictionary }) {
  return (
    <Section id="faq" className="border-t border-line">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
        <SectionHeading eyebrow={t.faq.eyebrow} title={t.faq.title} />
        <Reveal delay={0.1}>
          <div className="divide-y divide-line border-y border-line">
            {t.faq.items.map((item, i) => (
              <details key={item.q} name="faq" open={i === 0} className="group py-2">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-lg font-medium transition hover:text-teal [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <Plus className="size-5 shrink-0 text-muted transition duration-300 group-open:rotate-45 group-open:text-teal" />
                </summary>
                <p className="pb-5 leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
