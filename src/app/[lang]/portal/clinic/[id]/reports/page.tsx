import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { reportPeriod, type Report } from "@/lib/reports";
import { Card } from "@/components/portal/ui";

const PERIODS = ["7", "30", "90", "month"] as const;

export default async function ReportsPage({ params, searchParams }: PageProps<"/[lang]/portal/clinic/[id]/reports">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const ctx = await getClinicContext(id);
  if (!ctx.canManage) notFound();
  const t = getPortalDictionary(lang);
  const r = t.dash.reports;
  const sp = await searchParams;
  const period = PERIODS.find((p) => p === sp.period) ?? "30";
  const { from, to } = reportPeriod(period, ctx.site.timezone);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clinic_report", { p_clinic: id, p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) console.error("[reports]", error.message);
  const rep = data as Report | null;

  const loc = lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB";
  const num = new Intl.NumberFormat(loc);
  const pct = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat(loc, { style: "percent", maximumFractionDigits: 1 }).format(v));
  const money = (v: number) => `${num.format(Math.round(v))} ${r.sar}`;
  const dayFmt = new Intl.DateTimeFormat(loc, { timeZone: "UTC", day: "numeric", month: "short" });
  const dayNum = new Intl.DateTimeFormat(loc, { timeZone: "UTC", day: "numeric" });
  const base = `/${lang}/portal/clinic/${id}/reports`;
  const labels = { "7": r.days7, "30": r.days30, "90": r.days90, month: r.month };

  const tot = rep?.totals;
  const maxDay = Math.max(1, ...(rep?.by_day ?? []).map((d) => d.total));
  const sources = Object.entries(rep?.by_source ?? {}).sort((a, b) => b[1] - a[1]);
  const sourceTotal = sources.reduce((n, [, v]) => n + v, 0) || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{r.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {PERIODS.map((p) => (
            <Link key={p} href={`${base}?period=${p}`} className={`rounded-full border px-3 py-1 ${p === period ? "border-teal bg-teal/10 text-teal" : "border-line text-muted hover:text-teal"}`}>{labels[p]}</Link>
          ))}
          <a href={`${base}/export?period=${period}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 hover:border-teal hover:text-teal">
            <Download className="size-4" />{r.export}
          </a>
        </div>
      </div>

      {!rep || !tot ? <p className="text-sm text-muted">{r.none}</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 [&>*:last-child]:max-lg:col-span-2">
            <Kpi label={r.total} value={num.format(tot.total)} />
            <Kpi label={r.completed} value={num.format(tot.completed)} />
            <Kpi label={r.noShowRate} value={pct(rep.no_show_rate)} warn={(rep.no_show_rate ?? 0) > 0.1} />
            <Kpi label={r.cancelRate} value={pct(rep.cancel_rate)} warn={(rep.cancel_rate ?? 0) > 0.15} />
            <Kpi label={r.revenue} value={money(tot.revenue)} hint={r.revenueHint} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi label={r.newPatients} value={num.format(rep.new_patients)} />
            <Kpi label={r.upcoming} value={num.format(rep.upcoming_7d)} />
            <div className="col-span-2 sm:col-span-1"><Kpi label={r.unconfirmed} value={num.format(rep.unconfirmed_7d)} warn={rep.unconfirmed_7d > 0} /></div>
          </div>

          <Card title={r.byDay}>
            {!rep.by_day.length ? <p className="text-sm text-muted">{r.none}</p> : (
              <div className="overflow-x-auto">
                <div className="flex h-44 min-w-max items-end gap-1.5" role="img" aria-label={r.byDay}>
                  {rep.by_day.map((d) => (
                    <div key={d.day} className="flex w-7 flex-col items-center gap-1" title={`${dayFmt.format(new Date(`${d.day}T12:00:00Z`))}: ${d.total} (${r.missed}: ${d.missed})`}>
                      <span className="text-[10px] text-muted tabular-nums">{d.total}</span>
                      <div className="flex w-full flex-col-reverse overflow-hidden rounded-md" style={{ height: `${(d.total / maxDay) * 120}px` }}>
                        <div className="bg-brand-gradient" style={{ height: `${((d.total - d.missed) / d.total) * 100}%` }} />
                        <div className="bg-rose-400/60" style={{ height: `${(d.missed / d.total) * 100}%` }} />
                      </div>
                      <span className="text-[10px] text-muted tabular-nums">{dayNum.format(new Date(`${d.day}T12:00:00Z`))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-3 flex items-center gap-2 text-xs text-muted"><span className="inline-block size-3 rounded bg-rose-400/60" />{r.missed}</p>
          </Card>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            <Card title={r.byDoctor}>
              <Table
                head={[r.doctor, r.total, r.completed, t.dash.status.no_show, r.revenue]}
                rows={rep.by_doctor.map((d) => [d.name, num.format(d.total), num.format(d.completed), num.format(d.no_show), money(d.revenue)])}
                empty={r.none}
              />
            </Card>
            <Card title={r.byService}>
              <Table
                head={[r.service, r.count, r.revenue]}
                rows={rep.by_service.map((s) => [s.name, num.format(s.total), money(s.revenue)])}
                empty={r.none}
              />
            </Card>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            <Card title={r.bySource}>
              {!sources.length ? <p className="text-sm text-muted">{r.none}</p> : (
                <ul className="space-y-3">
                  {sources.map(([k, v]) => (
                    <li key={k} className="text-sm">
                      <div className="mb-1 flex justify-between"><span>{t.dash.source[k as keyof typeof t.dash.source] ?? k}</span><span className="tabular-nums text-muted">{num.format(v)} · {pct(v / sourceTotal)}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-line"><div className="bg-brand-gradient h-full rounded-full" style={{ width: `${(v / sourceTotal) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={r.whatsapp}>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Stat label={r.chats} value={num.format(rep.conversations.total)} />
                <Stat label={r.aiBookings} value={num.format(rep.by_source.ai_agent ?? 0)} />
                <Stat label={r.handedOff} value={num.format(rep.conversations.handed_off)} />
                <Stat label={r.waiting} value={num.format(rep.conversations.waiting)} />
              </dl>
            </Card>
          </div>

          <Card title={r.auto}><p className="text-sm text-muted">{r.autoHelp}</p></Card>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4" title={hint}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums ${warn ? "text-rose-500" : ""}`}>{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-muted">{head.map((h, i) => <th key={i} className={`pb-2 font-medium whitespace-nowrap ${i ? "ps-4 text-end" : "text-start"}`}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, i) => (
            <tr key={i}>{row.map((c, j) => <td key={j} className={`py-2 whitespace-nowrap ${j ? "ps-4 text-end tabular-nums" : "pe-2 font-medium"}`}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
