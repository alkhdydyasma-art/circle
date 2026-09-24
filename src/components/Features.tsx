import { Bell, Bot, CalendarDays, Globe, LayoutDashboard, ShieldCheck } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { Reveal } from "./Reveal";
import { Section, SectionHeading } from "./Section";

const icons = {
  bot: Bot,
  calendar: CalendarDays,
  bell: Bell,
  layout: LayoutDashboard,
  globe: Globe,
  shield: ShieldCheck,
} as const;

export function Features({ t }: { t: Dictionary }) {
  return (
    <Section id="features">
      <SectionHeading {...t.features} />
      <div className="mt-16 grid gap-x-12 gap-y-4 md:grid-cols-2">
        {t.features.items.map((f, i) => {
          const Icon = icons[f.icon as keyof typeof icons];
          return (
            <Reveal key={f.title} delay={0.06 * i}>
              <article className="group flex items-start gap-5 rounded-xl border border-transparent p-4 transition duration-300 hover:border-line hover:bg-card">
                <span className="grid size-14 shrink-0 place-items-center rounded-lg border border-line bg-card transition duration-300 group-hover:border-teal/50">
                  <Icon className="size-6 text-muted transition duration-300 group-hover:text-teal" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{f.text}</p>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
