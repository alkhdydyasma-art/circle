import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { createAppointment } from "@/app/actions/clinic";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { addDays, localDate, weekStart, zonedToUtc } from "@/lib/time";
import { ActionForm, Field } from "@/components/portal/ActionForm";
import { APPT_SELECT, AppointmentRow, type Appt } from "@/components/portal/AppointmentRow";
import { Card, fieldCls, inputCls } from "@/components/portal/ui";

type Named = { id: string; name?: string; full_name?: string };

export default async function AppointmentsPage({ params, searchParams }: PageProps<"/[lang]/portal/clinic/[id]/appointments">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const ctx = await getClinicContext(id);
  const t = getPortalDictionary(lang);
  const tz = ctx.site.timezone;
  const sp = await searchParams;
  const supabase = await createClient();

  const today = localDate(new Date(), tz);
  const week = weekStart(typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today);
  const doctor = typeof sp.doctor === "string" && /^[0-9a-f-]{36}$/.test(sp.doctor) ? sp.doctor : null;

  let q = supabase.from("appointments").select(APPT_SELECT).eq("clinic_id", id)
    .gte("starts_at", zonedToUtc(week, "00:00", tz).toISOString())
    .lt("starts_at", zonedToUtc(addDays(week, 7), "00:00", tz).toISOString())
    .order("starts_at");
  if (doctor) q = q.eq("doctor_id", doctor);

  const [{ data: appts }, { data: doctors }, { data: services }, { data: branches }] = await Promise.all([
    q.returns<Appt[]>(),
    supabase.from("doctors").select("id, full_name").eq("clinic_id", id).eq("is_active", true).order("sort").returns<Named[]>(),
    supabase.from("services").select("id, name").eq("clinic_id", id).eq("is_active", true).order("sort").returns<Named[]>(),
    supabase.from("branches").select("id, name").eq("clinic_id", id).eq("is_active", true).returns<Named[]>(),
  ]);

  const loc = lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB";
  const dayFmt = new Intl.DateTimeFormat(loc, { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" });
  const time = new Intl.DateTimeFormat(loc, { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const base = `/${lang}/portal/clinic/${id}/appointments`;
  const link = (w: string, d = doctor) => `${base}?week=${w}${d ? `&doctor=${d}` : ""}`;
  const byDay = Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((day) => ({
    day, items: (appts ?? []).filter((a) => localDate(new Date(a.starts_at), tz) === day),
  }));
  const m = { saved: t.dash.appt.created, invalid: t.dash.saveError, denied: t.clinic.denied, overlap: t.dash.appt.overlap, error: t.clinic.error };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.dash.appt.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={link(addDays(week, -7))} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 hover:text-teal">
            <ChevronRight className="size-4 ltr:rotate-180" />{t.dash.appt.prevWeek}
          </Link>
          <Link href={link(weekStart(today))} className="rounded-lg border border-line px-3 py-1.5 hover:text-teal">{t.dash.appt.thisWeek}</Link>
          <Link href={link(addDays(week, 7))} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 hover:text-teal">
            {t.dash.appt.nextWeek}<ChevronLeft className="size-4 ltr:rotate-180" />
          </Link>
        </div>
      </div>

      {ctx.frontDesk && (doctors?.length ?? 0) > 1 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={link(week, null)} className={`rounded-full border px-3 py-1 ${!doctor ? "border-teal bg-teal/10 text-teal" : "border-line text-muted"}`}>{t.dash.appt.allDoctors}</Link>
          {doctors!.map((d) => (
            <Link key={d.id} href={link(week, d.id)} className={`rounded-full border px-3 py-1 ${doctor === d.id ? "border-teal bg-teal/10 text-teal" : "border-line text-muted"}`}>{d.full_name}</Link>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {byDay.map(({ day, items }) => (
          <section key={day} className={`rounded-xl border bg-card ${day === today ? "border-teal/50" : "border-line"}`}>
            <h2 className="flex items-center justify-between border-b border-line px-5 py-3 text-sm font-semibold">
              {dayFmt.format(new Date(`${day}T12:00:00Z`))}
              <span className="text-muted">{items.length || ""}</span>
            </h2>
            {items.length ? (
              <ul className="divide-y divide-line px-5">
                {items.map((a) => (
                  <AppointmentRow key={a.id} a={a} t={t} lang={lang} clinicId={id} time={time.format(new Date(a.starts_at))}
                    patientHref={a.patients ? `/${lang}/portal/clinic/${id}/patients/${a.patients.id}` : undefined} />
                ))}
              </ul>
            ) : <p className="px-5 py-3 text-sm text-muted">{t.dash.appt.none}</p>}
          </section>
        ))}
      </div>

      {ctx.frontDesk && !!services?.length && !!doctors?.length && !!branches?.length && (
        <Card title={t.dash.appt.new}>
          <ActionForm action={createAppointment} hidden={{ lang, clinicId: id }} messages={m} submitLabel={t.dash.appt.create}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.dash.appt.patientName}><input required name="name" minLength={2} maxLength={120} className={inputCls} /></Field>
              <Field label={t.dash.appt.patientPhone}><input required name="phone" type="tel" dir="ltr" placeholder="05XXXXXXXX" className={`${inputCls} rtl:text-right`} /></Field>
              <Field label={t.dash.appt.service}>
                <select required name="serviceId" className={inputCls}>{services!.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
              </Field>
              <Field label={t.dash.appt.doctor}>
                <select required name="doctorId" defaultValue={doctor ?? undefined} className={inputCls}>{doctors!.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select>
              </Field>
              <Field label={t.dash.appt.branch}>
                <select required name="branchId" className={inputCls}>{branches!.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.dash.appt.date}><input required name="date" type="date" defaultValue={today} className={fieldCls + " w-full"} /></Field>
                <Field label={t.dash.appt.time}><input required name="time" type="time" step={300} className={fieldCls + " w-full"} /></Field>
              </div>
            </div>
            <Field label={t.dash.appt.notes}><input name="notes" maxLength={1000} className={inputCls} /></Field>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
