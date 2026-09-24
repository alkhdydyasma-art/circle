import { CalendarDays, LayoutDashboard, MessageCircle, Settings, Stethoscope } from "lucide-react";
import type { Dictionary } from "@/i18n";
import { Section, SectionHeading } from "./Section";

const bars = [38, 52, 44, 70, 62, 84, 76];

export function DashboardPreview({ t }: { t: Dictionary }) {
  const d = t.dashboard;
  return (
    <Section id="dashboard" className="bg-surface">
      <SectionHeading eyebrow={d.eyebrow} title={d.title} subtitle={d.subtitle} />

      <div className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-3xl border border-line bg-white shadow-2xl shadow-ink/10">
        <div className="flex items-center gap-1.5 border-b border-line px-4 py-3" dir="ltr">
          <span className="size-3 rounded-full bg-rose-300" />
          <span className="size-3 rounded-full bg-amber-300" />
          <span className="size-3 rounded-full bg-emerald-300" />
        </div>
        <div className="grid md:grid-cols-[4.5rem_1fr]">
          <aside className="hidden flex-col items-center gap-5 border-e border-line py-6 text-muted md:flex">
            <LayoutDashboard className="size-5 text-brand" />
            <CalendarDays className="size-5" />
            <Stethoscope className="size-5" />
            <MessageCircle className="size-5" />
            <Settings className="size-5" />
          </aside>
          <div className="space-y-6 p-6">
            <div className="grid gap-4 sm:grid-cols-3">
              {d.kpis.map((k) => (
                <div key={k.label} className="rounded-2xl border border-line p-4">
                  <p className="text-sm text-muted">{k.label}</p>
                  <p className="mt-1 text-2xl font-bold" dir="ltr">
                    {k.value}
                  </p>
                </div>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
              <div className="flex h-48 items-end gap-2 rounded-2xl border border-line p-4" dir="ltr">
                {bars.map((h, i) => (
                  <div
                    key={i}
                    className="bg-brand-gradient flex-1 rounded-t-lg opacity-80"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <div className="rounded-2xl border border-line p-4">
                <p className="font-semibold">{d.listTitle}</p>
                <ul className="mt-3 divide-y divide-line">
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
                            r.whatsapp
                              ? "bg-whatsapp/15 text-emerald-700"
                              : "bg-brand/10 text-brand"
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
    </Section>
  );
}
