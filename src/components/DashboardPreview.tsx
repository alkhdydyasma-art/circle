import { CalendarDays, LayoutDashboard, MessageCircle, Settings, Stethoscope } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { Reveal } from "./Reveal";
import { Section, SectionHeading } from "./Section";

// Deterministic pseudo-random booking volume so server and client render the same grid.
const WEEKS = 20;
const heat = Array.from({ length: WEEKS * 7 }, (_, i) => {
  const wave = Math.sin(i * 0.37) + Math.sin(i * 0.11) + (i / (WEEKS * 7)) * 2.2;
  const weekend = i % 7 === 5;
  return weekend ? 0 : Math.max(0, Math.min(4, Math.round(wave + 1.2)));
});
const levels = [
  "bg-line",
  "bg-teal/25",
  "bg-teal/45",
  "bg-teal/70",
  "bg-teal",
];

export function DashboardPreview({ t }: { t: Dictionary }) {
  const d = t.dashboard;
  return (
    <Section id="dashboard">
      <SectionHeading eyebrow={d.eyebrow} title={d.title} subtitle={d.subtitle} />

      <Reveal delay={0.1}>
        <div className="mt-14 overflow-hidden rounded-xl border border-line bg-card shadow-2xl shadow-black/10">
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-3" dir="ltr">
            <span className="size-3 rounded-full bg-rose-400/80" />
            <span className="size-3 rounded-full bg-amber-400/80" />
            <span className="size-3 rounded-full bg-emerald-400/80" />
          </div>
          <div className="grid md:grid-cols-[4.5rem_1fr]">
            <aside className="hidden flex-col items-center gap-5 border-e border-line py-6 text-muted md:flex">
              <LayoutDashboard className="size-5 text-teal" />
              <CalendarDays className="size-5" />
              <Stethoscope className="size-5" />
              <MessageCircle className="size-5" />
              <Settings className="size-5" />
            </aside>
            <div className="space-y-5 p-5 md:p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {d.kpis.map((k) => (
                  <div key={k.label} className="rounded-lg border border-line bg-bg p-4">
                    <p className="text-sm text-muted">{k.label}</p>
                    <p className="mt-1 font-display text-2xl font-semibold">
                      <bdi>{k.value}</bdi>
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                <div className="rounded-lg border border-line bg-bg p-4">
                  <p className="text-sm font-medium">{d.heatmapTitle}</p>
                  <div className="mt-4 overflow-x-auto" dir="ltr">
                    <div className="grid w-max grid-flow-col grid-rows-7 gap-1">
                      {heat.map((v, i) => (
                        <span key={i} className={`size-3 rounded-[3px] ${levels[v]}`} />
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1 text-xs text-muted">
                    {d.less}
                    {levels.map((c) => (
                      <span key={c} className={`size-3 rounded-[3px] ${c}`} />
                    ))}
                    {d.more}
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-bg p-4">
                  <p className="text-sm font-medium">{d.listTitle}</p>
                  <ul className="mt-2 divide-y divide-line">
                    {d.rows.map((r) => (
                      <li key={r.name} className="flex items-center justify-between gap-3 py-3 text-sm">
                        <div>
                          <p className="font-medium">{r.name}</p>
                          <p className="text-muted">{r.service}</p>
                        </div>
                        <div className="text-end">
                          <p className="font-medium">{r.time}</p>
                          <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${
                              r.whatsapp ? "bg-whatsapp/15 text-emerald-600 dark:text-whatsapp" : "bg-brand/15 text-brand"
                            }`}
                          >
                            {r.source}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
