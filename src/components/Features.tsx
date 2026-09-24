import { Bell, Bot, CalendarDays, Globe, LayoutDashboard, ShieldCheck } from "lucide-react";
import type { Dictionary } from "@/i18n";
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
      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {t.features.items.map((f, i) => {
          const Icon = icons[f.icon as keyof typeof icons];
          const highlight = i === 0;
          return (
            <article
              key={f.title}
              className={`group rounded-3xl border p-7 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-ink/5 ${
                highlight ? "border-teal/30 bg-teal/5" : "border-line bg-white"
              }`}
            >
              <span className="bg-brand-gradient flex size-11 items-center justify-center rounded-2xl text-white shadow-md shadow-brand/20">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{f.text}</p>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
