import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { addDays, localDate, weekStart, zonedToUtc } from "@/lib/time";
import { APPT_SELECT, AppointmentRow, type Appt } from "@/components/portal/AppointmentRow";
import Link from "next/link";
import { headers } from "next/headers";
import { CheckCircle2, Circle } from "lucide-react";
import { Card } from "@/components/portal/ui";
import { CopyLink } from "@/components/portal/CopyLink";

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

  // Setup checklist for owners/managers until the clinic is ready to take bookings.
  let setup: { key: keyof typeof t.dash.setup.steps; done: boolean; href: string }[] = [];
  if (ctx.canManage) {
    const [svc, doc, hrs, site] = await Promise.all([
      supabase.from("services").select("id").eq("clinic_id", id).limit(1),
      supabase.from("doctors").select("id").eq("clinic_id", id).limit(1),
      supabase.from("working_hours").select("doctor_id").eq("clinic_id", id).limit(1),
      supabase.from("clinic_sites").select("brand, whatsapp, published").eq("clinic_id", id).single<{ brand: { logo_url?: string }; whatsapp: string | null; published: boolean }>(),
    ]);
    const base = `/${lang}/portal/clinic/${id}`;
    setup = [
      { key: "services", done: !!svc.data?.length, href: `${base}/services` },
      { key: "doctors", done: !!doc.data?.length, href: `${base}/doctors` },
      { key: "hours", done: !!hrs.data?.length, href: `${base}/doctors` },
      { key: "logo", done: !!site.data?.brand.logo_url, href: `${base}/website` },
      { key: "whatsapp", done: !!site.data?.whatsapp, href: `${base}/website` },
      { key: "publish", done: !!site.data?.published, href: `${base}/website` },
    ];
  }
  const setupDone = setup.filter((s) => s.done).length;
  const h = await headers();
  const origin = process.env.SITE_URL?.replace(/\/$/, "") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const bookingUrl = `${origin}/${lang}/c/${ctx.site.slug}/book`;

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
      {setup.length > 0 && setupDone < setup.length && (
        <section className="rounded-xl border border-teal/40 bg-teal/5 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">{t.dash.setup.title}</h2>
            <span className="text-sm text-muted">{t.dash.setup.progress.replace("{done}", String(setupDone)).replace("{total}", String(setup.length))}</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="bg-brand-gradient h-full rounded-full" style={{ width: `${(setupDone / setup.length) * 100}%` }} /></div>
          <p className="mt-3 text-sm text-muted">{t.dash.setup.hint}</p>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {setup.map((s) => (
              <li key={s.key}>
                <Link href={s.href} className={`flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-sm transition hover:bg-card ${s.done ? "text-muted line-through decoration-muted/50" : "font-medium"}`}>
                  {s.done ? <CheckCircle2 className="size-5 shrink-0 text-teal" /> : <Circle className="size-5 shrink-0 text-muted" />}
                  {t.dash.setup.steps[s.key]}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-card p-4">
            <p className="text-sm text-muted">{k.label}</p>
            <p className="mt-1 font-display text-3xl font-semibold"><bdi>{k.value}</bdi></p>
          </div>
        ))}
      </div>

      <Card title={t.dash.today.title}>
        {!todays?.length ? (
          <div className="space-y-4">
            <p className="text-muted">{t.dash.today.empty}</p>
            {ctx.site.published && (
              <div className="space-y-2">
                <p className="text-sm">{t.dash.today.share}</p>
                <CopyLink url={bookingUrl} copy={t.dash.today.copy} copied={t.dash.today.copied} />
              </div>
            )}
          </div>
        ) : (
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
