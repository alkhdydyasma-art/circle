import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { addDays, localDate, zonedToUtc } from "@/lib/time";
import { APPT_SELECT, type Appt } from "@/components/portal/AppointmentRow";
import { AutoRefresh } from "@/components/portal/AutoRefresh";

type Doctor = { id: string; full_name: string; user_id: string | null };
type Hours = { doctor_id: string; start_time: string; end_time: string };
type Off = { doctor_id: string | null; starts_at: string; ends_at: string };
type BoardAppt = Appt & { doctor_id: string };

const PX = 1.4; // pixels per minute (84px per hour)
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const HATCH = "bg-[repeating-linear-gradient(135deg,transparent_0_8px,var(--color-line)_8px_9px)]";

/** Parts of [start, end) not covered by any of `open` — the doctor's off time. */
function gaps(start: number, end: number, open: number[][]) {
  const out: number[][] = [];
  let at = start;
  for (const [a, b] of [...open].sort((x, y) => x[0] - y[0])) {
    if (a > at) out.push([at, Math.min(a, end)]);
    at = Math.max(at, b);
  }
  if (at < end) out.push([at, end]);
  return out.filter(([a, b]) => b > a);
}

const blockTone: Record<Appt["status"], string> = {
  pending: "border-amber-400/70 bg-amber-400/15",
  confirmed: "border-teal/70 bg-teal/15",
  completed: "border-line bg-line/60 text-muted",
  no_show: "border-rose-400/70 bg-rose-400/10 text-muted line-through",
  cancelled: "hidden",
};

// Day board: one column per doctor, appointments placed on a time axis, off-hours shaded.
// Front desk sees every doctor; a doctor sees their own column (RLS limits the rows anyway).
export default async function SchedulePage({ params, searchParams }: PageProps<"/[lang]/portal/clinic/[id]/schedule">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const ctx = await getClinicContext(id);
  const t = getPortalDictionary(lang);
  const s = t.dash.schedule;
  const tz = ctx.site.timezone;
  const sp = await searchParams;
  const today = localDate(new Date(), tz);
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const from = zonedToUtc(day, "00:00", tz), to = zonedToUtc(addDays(day, 1), "00:00", tz);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const supabase = await createClient();

  const [{ data: allDoctors }, { data: hours }, { data: off }, { data: appts }] = await Promise.all([
    supabase.from("doctors").select("id, full_name, user_id").eq("clinic_id", id).eq("is_active", true).order("sort").returns<Doctor[]>(),
    supabase.from("working_hours").select("doctor_id, start_time, end_time").eq("clinic_id", id).eq("weekday", weekday).returns<Hours[]>(),
    supabase.from("time_off").select("doctor_id, starts_at, ends_at").eq("clinic_id", id).lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString()).returns<Off[]>(),
    supabase.from("appointments").select(`doctor_id, ${APPT_SELECT}`).eq("clinic_id", id).neq("status", "cancelled")
      .gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString()).order("starts_at").returns<BoardAppt[]>(),
  ]);
  const doctors = ctx.frontDesk ? allDoctors ?? [] : (allDoctors ?? []).filter((d) => d.user_id === ctx.userId);

  // Minutes since local midnight for an instant on this day.
  const minsOf = (iso: string) => Math.max(0, Math.min(1440, (new Date(iso).getTime() - from.getTime()) / 60000));
  const spans = [
    ...(hours ?? []).map((h) => [toMin(h.start_time), toMin(h.end_time)]),
    ...(appts ?? []).map((a) => [minsOf(a.starts_at), minsOf(a.ends_at)]),
  ];
  const start = spans.length ? Math.floor(Math.min(...spans.map((x) => x[0])) / 60) * 60 : 9 * 60;
  const end = spans.length ? Math.ceil(Math.max(...spans.map((x) => x[1])) / 60) * 60 : 21 * 60;
  const height = (end - start) * PX;
  const y = (min: number) => (min - start) * PX;
  const nowMin = day === today ? minsOf(new Date().toISOString()) : null;

  const loc = lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB";
  const time = new Intl.DateTimeFormat(loc, { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const hourFmt = new Intl.DateTimeFormat(loc, { timeZone: "UTC", hour: "numeric" });
  const dayFmt = new Intl.DateTimeFormat(loc, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  const base = `/${lang}/portal/clinic/${id}/schedule`;
  const hoursAxis = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);

  return (
    <div className="space-y-5">
      <AutoRefresh seconds={60} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{ctx.frontDesk ? s.title : s.mine}</h1>
          <p className="mt-1 text-sm text-muted">{dayFmt.format(new Date(`${day}T12:00:00Z`))} · {(appts ?? []).length} {s.visits}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`${base}?day=${addDays(day, -1)}`} aria-label={s.prev} className="inline-flex min-h-9 items-center rounded-lg border border-line px-2.5 hover:text-teal">
            <ChevronRight className="size-4 ltr:rotate-180" />
          </Link>
          <Link href={base} className={`inline-flex min-h-9 items-center rounded-lg border px-3 ${day === today ? "border-teal text-teal" : "border-line hover:text-teal"}`}>{s.today}</Link>
          <Link href={`${base}?day=${addDays(day, 1)}`} aria-label={s.next} className="inline-flex min-h-9 items-center rounded-lg border border-line px-2.5 hover:text-teal">
            <ChevronLeft className="size-4 ltr:rotate-180" />
          </Link>
          <form className="contents">
            <input type="date" name="day" defaultValue={day} aria-label={s.title} className="min-h-9 rounded-lg border border-line bg-bg px-2 text-sm" />
            <button className="min-h-9 rounded-lg border border-line px-3 hover:text-teal">↵</button>
          </form>
        </div>
      </div>

      {!doctors.length ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">{s.noDoctors}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <div className="grid min-w-max" style={{ gridTemplateColumns: `3.5rem repeat(${doctors.length}, minmax(11rem, 1fr))` }}>
            {/* Header row */}
            <div className="sticky start-0 z-20 border-b border-line bg-card" />
            {doctors.map((d) => {
              const n = (appts ?? []).filter((a) => a.doctor_id === d.id).length;
              return (
                <div key={d.id} className="border-b border-s border-line px-3 py-2.5">
                  <p className="truncate text-sm font-semibold">{d.full_name}</p>
                  <p className="text-xs text-muted">{n} {s.visits}</p>
                </div>
              );
            })}

            {/* Time axis */}
            <div className="relative sticky start-0 z-10 bg-card" style={{ height }}>
              {hoursAxis.map((m) => (
                <span key={m} className="absolute end-2 mt-0.5 text-[11px] text-muted tabular-nums" style={{ top: y(m) }}>
                  {m < end ? hourFmt.format(new Date(Date.UTC(2026, 0, 1, m / 60))) : ""}
                </span>
              ))}
            </div>

            {doctors.map((d) => {
              const open = (hours ?? []).filter((h) => h.doctor_id === d.id);
              const away = (off ?? []).filter((o) => o.doctor_id === null || o.doctor_id === d.id);
              const mine = (appts ?? []).filter((a) => a.doctor_id === d.id);
              return (
                <div key={d.id} className="relative border-s border-line" style={{ height }}>
                  {[...gaps(start, end, open.map((h) => [toMin(h.start_time), toMin(h.end_time)])),
                    ...away.map((o) => [Math.max(start, minsOf(o.starts_at)), Math.min(end, minsOf(o.ends_at))])]
                    .filter(([a, b]) => b > a)
                    .map(([a, b], i) => (
                      <div key={i} title={s.off} className={`absolute inset-x-0 ${HATCH}`} style={{ top: y(a), height: (b - a) * PX }} />
                    ))}
                  {hoursAxis.slice(1, -1).map((m) => <div key={m} className="absolute inset-x-0 border-t border-dashed border-line/70" style={{ top: y(m) }} />)}
                  {mine.map((a) => {
                    const top = y(minsOf(a.starts_at)), h = Math.max(26, (minsOf(a.ends_at) - minsOf(a.starts_at)) * PX - 3);
                    const body = (
                      <>
                        <span className="block truncate font-semibold">{a.patients?.full_name ?? "—"}</span>
                        {h > 34 && <span className="block truncate opacity-80">{a.services?.name}</span>}
                        {h > 52 && <span className="block truncate text-[11px] opacity-70"><bdi>{time.format(new Date(a.starts_at))}</bdi> · {t.dash.status[a.status]}</span>}
                      </>
                    );
                    const cls = `absolute inset-x-1.5 z-10 overflow-hidden rounded-lg border-s-4 border px-2 py-1 text-xs leading-snug transition hover:shadow-md ${blockTone[a.status]}`;
                    return a.patients ? (
                      <Link key={a.id} href={`/${lang}/portal/clinic/${id}/patients/${a.patients.id}`} className={cls} style={{ top, height: h }}
                        title={`${time.format(new Date(a.starts_at))} · ${a.patients.full_name} · ${a.services?.name ?? ""} · ${t.dash.status[a.status]}`}>{body}</Link>
                    ) : <div key={a.id} className={cls} style={{ top, height: h }}>{body}</div>;
                  })}
                  {nowMin !== null && nowMin >= start && nowMin <= end && (
                    <div className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-rose-500" style={{ top: y(nowMin) }}>
                      <span className="absolute -top-1.5 start-0 size-3 rounded-full bg-rose-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
        {(["pending", "confirmed", "completed", "no_show"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className={`inline-block size-3 rounded border-s-4 border ${blockTone[k]}`} />{t.dash.status[k]}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded border border-line bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--color-line)_3px_4px)]" />{s.off}</span>
        <span>{s.live}</span>
      </div>
      {!(appts ?? []).length && !!doctors.length && <p className="text-sm text-muted">{s.empty}</p>}
    </div>
  );
}
