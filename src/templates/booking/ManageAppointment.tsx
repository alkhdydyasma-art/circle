"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarClock, Check, MapPin, MessageCircle, Stethoscope, X } from "lucide-react";
import { manageCancel, manageConfirm, manageReschedule, manageSlots, type ManageSlot } from "@/app/actions/manage";
import type { SiteStrings } from "../strings";

export type ApptView = {
  starts_at: string; status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
  service: string; doctor: string; branch: string; branch_address: string | null; maps_url: string | null;
  clinic: string; timezone: string; whatsapp: string | null; can_change: boolean; cutoff_hours: number; patient_name: string;
};

const btn = "inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 font-semibold transition disabled:opacity-50";

export function ManageAppointment({ token, lang, a, t, days }: {
  token: string; lang: string; a: ApptView; t: SiteStrings; days: string[];
}) {
  const m = t.manageAppt;
  const loc = lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB";
  const fmtFull = useMemo(() => new Intl.DateTimeFormat(loc, { timeZone: a.timezone, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }), [loc, a.timezone]);
  const fmtTime = useMemo(() => new Intl.DateTimeFormat(loc, { timeZone: a.timezone, hour: "numeric", minute: "2-digit" }), [loc, a.timezone]);
  const fmtDay = useMemo(() => new Intl.DateTimeFormat(loc, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }), [loc]);

  const [mode, setMode] = useState<"view" | "cancel" | "reschedule">("view");
  const [notice, setNotice] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<ManageSlot[] | null>(null);
  const [pending, start] = useTransition();
  const active = a.status === "pending" || a.status === "confirmed";
  const wa = a.whatsapp ? `https://wa.me/${a.whatsapp.slice(1)}` : null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      setNotice(r.ok ? okMsg : r.error === "too_late" ? m.tooLate.replace("{hours}", String(a.cutoff_hours)) : r.error === "slot" ? m.slotTaken : m.error);
      if (r.ok) setMode("view");
    });

  const pickDay = (d: string) => {
    setDay(d);
    setSlots(null);
    start(async () => setSlots(await manageSlots(token, d)));
  };

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="rounded-3xl border border-site-line bg-site-bg p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">{m.title}</h1>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${active ? "bg-site-primary text-site-primary-fg" : "bg-site-surface text-site-muted"}`}>
            {m.status[a.status]}
          </span>
        </div>
        <p className="mt-1 text-site-muted">{a.clinic}</p>
        <ul className="mt-5 space-y-3">
          <li className="flex items-start gap-3"><CalendarClock className="mt-0.5 size-5 text-site-primary" /><span className="font-semibold">{fmtFull.format(new Date(a.starts_at))}</span></li>
          <li className="flex items-start gap-3"><Stethoscope className="mt-0.5 size-5 text-site-primary" />{a.service} — {a.doctor}</li>
          <li className="flex items-start gap-3"><MapPin className="mt-0.5 size-5 text-site-primary" />
            <span>{a.branch}{a.branch_address && <span className="block text-sm text-site-muted">{a.branch_address}</span>}
              {a.maps_url && <a href={a.maps_url} target="_blank" rel="noopener noreferrer" className="block text-sm text-site-primary">{m.directions}</a>}
            </span>
          </li>
        </ul>
      </div>

      {notice && <p role="status" className="rounded-2xl bg-site-surface p-4 text-center font-medium">{notice}</p>}

      {active && mode === "view" && (
        <div className="grid gap-3">
          {a.status === "pending" && (
            <button disabled={pending} onClick={() => run(() => manageConfirm(token, lang), m.confirmed)} className={`${btn} bg-site-primary text-site-primary-fg`}>
              <Check className="size-5" />{m.confirm}
            </button>
          )}
          {a.can_change ? (
            <div className="grid grid-cols-2 gap-3">
              <button disabled={pending} onClick={() => { setMode("reschedule"); setNotice(null); }} className={`${btn} border border-site-line`}>{m.reschedule}</button>
              <button disabled={pending} onClick={() => { setMode("cancel"); setNotice(null); }} className={`${btn} border border-site-line text-rose-600`}>{m.cancel}</button>
            </div>
          ) : (
            <p className="rounded-2xl bg-site-surface p-4 text-center text-sm text-site-muted">{m.tooLate.replace("{hours}", String(a.cutoff_hours))}</p>
          )}
        </div>
      )}

      {mode === "cancel" && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center text-rose-900">
          <p className="font-semibold">{m.cancelAsk}</p>
          <div className="mt-4 flex justify-center gap-3">
            <button disabled={pending} onClick={() => run(() => manageCancel(token, lang), m.cancelled)} className={`${btn} bg-rose-600 text-white`}><X className="size-5" />{m.cancelYes}</button>
            <button onClick={() => setMode("view")} className={`${btn} border border-rose-200`}>{m.back}</button>
          </div>
        </div>
      )}

      {mode === "reschedule" && (
        <div className="rounded-3xl border border-site-line bg-site-bg p-5">
          <p className="mb-3 font-semibold">{m.pickTime}</p>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
            {days.map((d) => (
              <button key={d} onClick={() => pickDay(d)}
                className={`min-w-[5.5rem] shrink-0 rounded-2xl border px-3 py-2.5 text-sm ${day === d ? "border-site-primary bg-site-primary text-site-primary-fg" : "border-site-line"}`}>
                {fmtDay.format(new Date(`${d}T12:00:00Z`))}
              </button>
            ))}
          </div>
          {day && (
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots === null ? <p className="col-span-full animate-pulse text-site-muted">…</p>
                : slots.length === 0 ? <p className="col-span-full text-site-muted">{m.noTimes}</p>
                : slots.map((s) => (
                  <button key={s.starts_at + s.branch_id} disabled={pending || s.starts_at === a.starts_at}
                    onClick={() => run(() => manageReschedule(token, lang, s.starts_at, s.branch_id), m.rescheduled)}
                    className="rounded-xl border border-site-line px-2 py-2.5 text-sm font-medium hover:border-site-primary disabled:opacity-40">
                    <bdi>{fmtTime.format(new Date(s.starts_at))}</bdi>
                  </button>
                ))}
            </div>
          )}
          <button onClick={() => setMode("view")} className="mt-4 text-sm text-site-muted">{m.back}</button>
        </div>
      )}

      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={`${btn} w-full border border-site-line`}>
          <MessageCircle className="size-5 text-[#25d366]" />{m.contact}
        </a>
      )}
    </div>
  );
}
