"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarPlus, Check, ChevronLeft, Clock, MapPin, MessageCircle, Stethoscope, UserRound } from "lucide-react";
import type { Locale } from "@/i18n";
import type { SiteStrings } from "../strings";

type Service = { id: string; name: string; description: string | null; duration_minutes: number; price: number | null };
type Doctor = { id: string; full_name: string; title: string | null; specialty: string | null; service_ids: string[] };
type Branch = { id: string; name: string };
type Slot = { doctor_id: string; branch_id: string; starts_at: string };
type Booked = { id: string; starts_at: string; service: string; doctor: string; branch: string; manage_url?: string };

type Props = {
  slug: string;
  clinicName: string;
  lang: Locale;
  t: SiteStrings;
  timezone: string;
  services: Service[];
  doctors: Doctor[];
  branches: Branch[];
  initialServiceId?: string;
  whatsappHref?: string;
  remindersEnabled?: boolean;
};

const card = "rounded-2xl border border-site-line bg-site-bg p-4 text-start transition hover:border-site-primary";
const selected = "border-site-primary ring-2 ring-[color-mix(in_srgb,var(--c-primary)_25%,transparent)]";
const input = "w-full rounded-xl border border-site-line bg-site-bg px-4 py-3 outline-none transition focus:border-site-primary focus:ring-4 focus:ring-[color-mix(in_srgb,var(--c-primary)_15%,transparent)]";
const btn = "inline-flex items-center justify-center gap-2 rounded-full bg-site-primary px-6 py-3 font-semibold text-site-primary-fg transition hover:brightness-110 disabled:opacity-50";

// Downloadable calendar entry for the booked visit.
function icsHref(b: Booked, durationMin: number, clinic: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(b.starts_at);
  const end = new Date(start.getTime() + durationMin * 60_000);
  const esc = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`);
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Circle//Booking//AR", "BEGIN:VEVENT",
    `UID:${b.id}@circle`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(`${b.service} — ${clinic}`)}`, `LOCATION:${esc(`${clinic} — ${b.branch}`)}`,
    `DESCRIPTION:${esc(b.doctor)}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

export function BookingWizard(p: Props) {
  const t = p.t.booking;
  const locale = p.lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB";
  const fmtDay = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }), [locale]);
  const fmtTime = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: p.timezone, hour: "numeric", minute: "2-digit" }), [locale, p.timezone]);
  const fmtFull = useMemo(() => new Intl.DateTimeFormat(locale, { timeZone: p.timezone, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }), [locale, p.timezone]);

  const initial = p.services.some((s) => s.id === p.initialServiceId) ? p.initialServiceId! : null;
  const [step, setStep] = useState(initial ? 1 : 0);
  const [serviceId, setServiceId] = useState<string | null>(initial);
  const [doctorId, setDoctorId] = useState<string>("any");
  // Availability is cached per query; `reload` bumps after a lost race to refetch.
  const [avail, setAvail] = useState<{ key: string; days: Record<string, Slot[]> } | null>(null);
  const [reload, setReload] = useState(0);
  const [pickedDay, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [status, setStatus] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<keyof typeof t.errors | null>(null);
  const [booked, setBooked] = useState<Booked | null>(null);

  const service = p.services.find((s) => s.id === serviceId) ?? null;
  const doctorsForService = p.doctors.filter((d) => serviceId && d.service_ids.includes(serviceId));
  const doctorName = (id: string) => p.doctors.find((d) => d.id === id)?.full_name ?? "";
  const branchName = (id: string) => p.branches.find((b) => b.id === id)?.name ?? "";

  // Load 14 days of availability whenever the service or doctor changes.
  const query = serviceId ? new URLSearchParams({ service: serviceId, ...(doctorId !== "any" && { doctor: doctorId }) }).toString() : "";
  const key = `${query}#${reload}`;
  const days = avail?.key === key ? avail.days : null;
  const firstOpenDay = days ? (Object.keys(days).find((d) => days[d].length > 0) ?? null) : null;
  const day = pickedDay && days?.[pickedDay] ? pickedDay : firstOpenDay;

  useEffect(() => {
    if (step !== 2 || !query) return;
    let cancelled = false;
    fetch(`/api/sites/${p.slug}/availability?${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(({ days }: { days: Record<string, Slot[]> }) => !cancelled && setAvail({ key, days }))
      .catch(() => {
        if (cancelled) return;
        setAvail({ key, days: {} });
        setError("error");
      });
    return () => {
      cancelled = true;
    };
  }, [step, query, key, p.slug]);

  // With "any doctor", show each start time once (first free doctor wins).
  const times = useMemo(() => {
    const list = (day && days?.[day]) || [];
    const seen = new Set<string>();
    return list.filter((s) => (seen.has(s.starts_at) ? false : (seen.add(s.starts_at), true)));
  }, [day, days]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slot || !serviceId) return;
    const fd = new FormData(e.currentTarget);
    setStatus("sending");
    setError(null);
    const res = await fetch(`/api/sites/${p.slug}/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId, doctorId: slot.doctor_id, branchId: slot.branch_id, startsAt: slot.starts_at,
        fullName: fd.get("fullName"), phone: fd.get("phone"), notes: fd.get("notes") || undefined,
        consent: fd.get("consent") === "on", website: fd.get("website") || undefined,
      }),
    }).catch(() => null);
    setStatus("idle");
    const json = await res?.json().catch(() => null);
    if (res?.ok && json?.booking) return setBooked(json.booking);
    const code = (json?.error in t.errors ? json.error : "error") as keyof typeof t.errors;
    setError(code);
    if (code === "slot_unavailable") {
      setSlot(null);
      setReload((n) => n + 1);
      setStep(2);
    }
  }

  if (booked && service) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-site-line bg-site-bg p-8 text-center shadow-xl">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-site-primary text-site-primary-fg">
          <Check className="size-8" />
        </span>
        <h2 className="mt-5 text-2xl font-bold">{t.done}</h2>
        <p className="mt-2 text-site-muted">{p.remindersEnabled ? t.doneHintReminders : t.doneHint}</p>
        <dl className="mt-6 space-y-2 rounded-2xl bg-site-surface p-5 text-start text-sm">
          <div className="flex justify-between gap-4"><dt className="text-site-muted">{t.steps[0]}</dt><dd className="font-semibold">{booked.service}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-site-muted">{t.steps[2]}</dt><dd className="font-semibold">{fmtFull.format(new Date(booked.starts_at))}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-site-muted">{t.steps[1]}</dt><dd className="font-semibold">{booked.doctor}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-site-muted">{t.branch}</dt><dd className="font-semibold">{booked.branch}</dd></div>
        </dl>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a href={icsHref(booked, service.duration_minutes, p.clinicName)} download="appointment.ics" className={btn}>
            <CalendarPlus className="size-5" />
            {t.addToCalendar}
          </a>
          {booked.manage_url && (
            <a href={booked.manage_url} className="rounded-full border border-site-line px-6 py-3 font-semibold">{t.manage}</a>
          )}
          <button type="button" onClick={() => { setBooked(null); setStep(0); setServiceId(null); setSlot(null); }} className="rounded-full border border-site-line px-6 py-3 font-semibold">
            {t.another}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Progress */}
      <ol className="mb-8 grid grid-cols-4 gap-2">
        {t.steps.map((label, i) => (
          <li key={label}>
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              className="block w-full text-start disabled:cursor-default"
            >
              <span className={`block h-1.5 rounded-full ${i <= step ? "bg-site-primary" : "bg-site-line"}`} />
              <span className={`mt-2 block text-xs sm:text-sm ${i === step ? "font-semibold" : "text-site-muted"}`}>{label}</span>
            </button>
          </li>
        ))}
      </ol>

      {error && step !== 3 && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{t.errors[error]}</p>}

      {/* 1. Service */}
      {step === 0 && (
        <section>
          <h2 className="mb-5 text-2xl font-bold">{t.chooseService}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {p.services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { setServiceId(s.id); setDoctorId("any"); setError(null); setStep(1); }}
                className={`${card} ${serviceId === s.id ? selected : ""}`}
              >
                <span className="block font-semibold">{s.name}</span>
                <span className="mt-1 flex items-center gap-1.5 text-sm text-site-muted">
                  <Clock className="size-3.5" /> {s.duration_minutes} {p.t.services.minutes}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 2. Doctor */}
      {step === 1 && service && (
        <section>
          <h2 className="mb-5 text-2xl font-bold">{t.chooseDoctor}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => { setDoctorId("any"); setStep(2); }} className={`${card} ${doctorId === "any" ? selected : ""}`}>
              <span className="flex items-center gap-2 font-semibold"><UserRound className="size-4 text-site-primary" />{t.anyDoctor}</span>
              <span className="mt-1 block text-sm text-site-muted">{t.anyDoctorHint}</span>
            </button>
            {doctorsForService.map((d) => (
              <button key={d.id} type="button" onClick={() => { setDoctorId(d.id); setStep(2); }} className={`${card} ${doctorId === d.id ? selected : ""}`}>
                <span className="flex items-center gap-2 font-semibold"><Stethoscope className="size-4 text-site-primary" />{d.full_name}</span>
                <span className="mt-1 block text-sm text-site-muted">{[d.title, d.specialty].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 3. Day & time */}
      {step === 2 && (
        <section>
          <h2 className="mb-5 text-2xl font-bold">{t.chooseTime}</h2>
          {!days ? (
            <p className="animate-pulse text-site-muted">{t.loading}</p>
          ) : !Object.values(days).some((d) => d.length) ? (
            <div className="rounded-2xl bg-site-surface p-6 text-center">
              <p className="text-site-muted">{t.noDays}</p>
              {p.whatsappHref && (
                <a href={p.whatsappHref} target="_blank" rel="noopener noreferrer" className={`${btn} mt-4`}>
                  <MessageCircle className="size-5" /> {p.t.whatsapp}
                </a>
              )}
            </div>
          ) : (
            <>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
                {Object.entries(days).map(([d, slots]) => (
                  <button
                    key={d}
                    type="button"
                    disabled={!slots.length}
                    onClick={() => { setDay(d); setSlot(null); }}
                    className={`min-w-[5.5rem] shrink-0 rounded-2xl border px-3 py-3 text-center text-sm transition disabled:opacity-35 ${
                      day === d ? "border-site-primary bg-site-primary text-site-primary-fg" : "border-site-line bg-site-bg hover:border-site-primary"
                    }`}
                  >
                    {fmtDay.format(new Date(`${d}T12:00:00Z`))}
                  </button>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {times.length === 0 && <p className="col-span-full text-site-muted">{t.noTimes}</p>}
                {times.map((s) => (
                  <button
                    key={s.starts_at}
                    type="button"
                    onClick={() => { setSlot(s); setError(null); setStep(3); }}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                      slot?.starts_at === s.starts_at ? "border-site-primary bg-site-primary text-site-primary-fg" : "border-site-line bg-site-bg hover:border-site-primary"
                    }`}
                  >
                    <bdi>{fmtTime.format(new Date(s.starts_at))}</bdi>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* 4. Details */}
      {step === 3 && service && slot && (
        <section className="grid gap-6 md:grid-cols-[1fr_17rem]">
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-2xl font-bold">{t.yourDetails}</h2>
            <label className="block">
              <span className="mb-1.5 block text-sm text-site-muted">{t.name}</span>
              <input required name="fullName" minLength={2} maxLength={120} autoComplete="name" className={input} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm text-site-muted">{t.phone}</span>
              <input required name="phone" type="tel" inputMode="tel" dir="ltr" autoComplete="tel" placeholder="05XXXXXXXX"
                pattern="^(\+?966|00966|0)?5[0-9]{8}$" className={`${input} rtl:text-right`} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm text-site-muted">{t.notes}</span>
              <textarea name="notes" maxLength={500} rows={3} className={input} />
            </label>
            <label className="flex items-start gap-3 text-sm text-site-muted">
              <input required type="checkbox" name="consent" className="mt-1 size-4 accent-[var(--c-primary)]" />
              {t.consent}
            </label>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{t.errors[error]}</p>}
            <button disabled={status === "sending"} className={`${btn} w-full`}>
              {status === "sending" ? t.sending : t.confirm}
            </button>
          </form>

          <aside className="h-fit rounded-2xl bg-site-surface p-5 text-sm">
            <p className="font-semibold">{t.summary}</p>
            <ul className="mt-4 space-y-3">
              <li className="flex items-start gap-2"><Check className="mt-0.5 size-4 text-site-primary" />{service.name}</li>
              <li className="flex items-start gap-2"><Clock className="mt-0.5 size-4 text-site-primary" />{fmtFull.format(new Date(slot.starts_at))}</li>
              <li className="flex items-start gap-2"><Stethoscope className="mt-0.5 size-4 text-site-primary" />{doctorName(slot.doctor_id)}</li>
              <li className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 text-site-primary" />{branchName(slot.branch_id)}</li>
            </ul>
            <button type="button" onClick={() => setStep(2)} className="mt-4 inline-flex items-center gap-1 text-site-primary">
              <ChevronLeft className="size-4 ltr:rotate-180" /> {t.change}
            </button>
          </aside>
        </section>
      )}
    </div>
  );
}
