import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { addDays, localDate, weekStart, zonedToUtc } from "@/lib/time";
import { APPT_SELECT, AppointmentRow, type Appt } from "@/components/portal/AppointmentRow";
import { Card } from "@/components/portal/ui";

// "Today": the front desk's home screen. Doctors automatically see only their own
// appointments (RLS), so the same page serves every role.
export default async function TodayPage({ params }: PageProps<"/[lang]/portal/clinic/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const ctx = await getClinicContext(id);
  const t = getPortalDictionary(lang);
  const tz = ctx.site.timezone;
  const supabase = await createClient();

  const today = localDate(new Date(), tz);
  const start = zonedToUtc(today, "00:00", tz).toISOString();
  const end = zonedToUtc(addDays(today, 1), "00:00", tz).toISOString();
  const wStart = zonedToUtc(weekStart(today), "00:00", tz).toISOString();
  const wEnd = zonedToUtc(addDays(weekStart(today), 7), "00:00", tz).toISOString();

  const [{ data: todays }, { data: week }, { data: upcoming }] = await Promise.all([
    supabase.from("appointments").select(APPT_SELECT).eq("clinic_id", id).gte("starts_at", start).lt("starts_at", end).order("starts_at").returns<Appt[]>(),
    supabase.from("appointments").select("status, source").eq("clinic_id", id).gte("starts_at", wStart).lt("starts_at", wEnd).returns<Pick<Appt, "status" | "source">[]>(),
    supabase.from("appointments").select(APPT_SELECT).eq("clinic_id", id).eq("status", "pending").gte("starts_at", end).order("starts_at").limit(10).returns<Appt[]>(),
  ]);

  const active = (week ?? []).filter((a) => a.status !== "cancelled");
  const kpis = [
    { label: t.dash.today.kpis.today, value: (todays ?? []).filter((a) => a.status !== "cancelled").length },
    { label: t.dash.today.kpis.pending, value: (todays ?? []).filter((a) => a.status === "pending").length + (upcoming?.length ?? 0) },
    { label: t.dash.today.kpis.week, value: active.length },
    { label: t.dash.today.kpis.website, value: `${active.length ? Math.round((active.filter((a) => a.source === "website").length / active.length) * 100) : 0}%` },
  ];
  const time = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn" : "en-GB", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const dayTime = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const patientHref = (a: Appt) => (a.patients ? `/${lang}/portal/clinic/${id}/patients/${a.patients.id}` : undefined);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-card p-4">
            <p className="text-sm text-muted">{k.label}</p>
            <p className="mt-1 font-display text-3xl font-semibold"><bdi>{k.value}</bdi></p>
          </div>
        ))}
      </div>

      <Card title={t.dash.today.title}>
        {!todays?.length ? <p className="text-muted">{t.dash.today.empty}</p> : (
          <ul className="divide-y divide-line">
            {todays.map((a) => <AppointmentRow key={a.id} a={a} t={t} lang={lang} clinicId={id} time={time.format(new Date(a.starts_at))} patientHref={patientHref(a)} />)}
          </ul>
        )}
      </Card>

      {!!upcoming?.length && (
        <Card title={`${t.dash.today.upcoming} · ${t.dash.status.pending}`}>
          <ul className="divide-y divide-line">
            {upcoming.map((a) => <AppointmentRow key={a.id} a={a} t={t} lang={lang} clinicId={id} time={dayTime.format(new Date(a.starts_at))} patientHref={patientHref(a)} />)}
          </ul>
        </Card>
      )}
    </div>
  );
}
