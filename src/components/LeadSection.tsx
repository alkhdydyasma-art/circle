"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Check, MessageCircle } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import {
  BOOKING_METHODS,
  CLINIC_TYPES,
  MONTHLY_PATIENTS,
  NEEDS,
  ROLES,
} from "@/lib/lead-schema";
import { whatsappUrl } from "@/lib/contact";
import { Reveal } from "./Reveal";

type Status = "idle" | "sending" | "success" | "error";

const input =
  "w-full rounded-lg border border-line bg-card px-4 py-2.5 outline-none transition focus:border-teal focus:ring-4 focus:ring-teal/10";
const chip =
  "cursor-pointer rounded-full border border-line bg-card px-3.5 py-1.5 text-sm text-muted transition has-checked:border-teal has-checked:bg-teal/10 has-checked:text-ink";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export function LeadSection({ lang, t }: { lang: Locale; t: Dictionary }) {
  const l = t.lead;
  const o = l.options;
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const steps = useRef<(HTMLFieldSetElement | null)[]>([]);
  const last = l.steps.length - 1;

  // Validate only the visible step's controls before moving on.
  function stepIsValid() {
    const controls = steps.current[step]?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "input, select",
    );
    return Array.from(controls ?? []).every((c) => c.reportValidity());
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stepIsValid()) return;
    if (step < last) return setStep(step + 1);

    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus("sending");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...Object.fromEntries(data),
          needs: data.getAll("needs"),
          consent: data.get("consent") === "on",
          lang,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      setStep(0);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section id="demo" className="scroll-mt-20 py-24 md:py-32">
      <Reveal className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-6 md:p-14">
          <div className="absolute -end-32 -top-32 size-96 rounded-full bg-teal/15 blur-3xl" aria-hidden />
          <div className="absolute -start-32 -bottom-32 size-96 rounded-full bg-brand/10 blur-3xl" aria-hidden />
          <div className="relative grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <p className="text-sm font-medium text-teal ltr:font-mono ltr:tracking-widest ltr:uppercase">{l.eyebrow}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{l.title}</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">{l.subtitle}</p>
              <a
                href={whatsappUrl(t.contact.whatsappMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-bg px-4 py-2 text-sm text-muted transition hover:text-ink"
              >
                <MessageCircle className="size-4 text-whatsapp" />
                {t.contact.whatsapp}
              </a>
              <p className="mt-3 text-sm text-muted">{l.note}</p>
            </div>

            <form
              onSubmit={onSubmit}
              noValidate
              className="rounded-xl border border-line bg-bg p-6 shadow-2xl shadow-black/10"
            >
              <ol className="mb-6 flex gap-2">
                {l.steps.map((label, i) => (
                  <li key={label} className="flex-1">
                    <span className={`block h-1 rounded-full transition ${i <= step ? "bg-teal" : "bg-line"}`} />
                    <span className={`mt-2 flex items-center gap-1 text-xs ${i === step ? "text-ink" : "text-muted"}`}>
                      {i < step && <Check className="size-3 text-teal" />}
                      {label}
                    </span>
                  </li>
                ))}
              </ol>

              <fieldset ref={(el) => { steps.current[0] = el; }} hidden={step !== 0} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={l.fields.clinic}>
                    <input required name="clinic" maxLength={120} autoComplete="organization" className={input} />
                  </Field>
                  <Field label={l.fields.city}>
                    <input required name="city" maxLength={80} autoComplete="address-level2" className={input} />
                  </Field>
                </div>
                <Field label={l.fields.clinicType}>
                  <select required name="clinicType" defaultValue="" className={input}>
                    <option value="" disabled>{l.select}</option>
                    {CLINIC_TYPES.map((v) => (
                      <option key={v} value={v}>{o.clinicType[v]}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  {(["branches", "chairs", "doctors"] as const).map((name) => (
                    <Field key={name} label={l.fields[name]}>
                      <input required name={name} type="number" min={1} max={500} inputMode="numeric" className={input} />
                    </Field>
                  ))}
                </div>
              </fieldset>

              <fieldset ref={(el) => { steps.current[1] = el; }} hidden={step !== 1} className="space-y-5">
                <div>
                  <p className="mb-2 text-sm font-medium text-muted">{l.fields.bookingMethod}</p>
                  <div className="flex flex-wrap gap-2">
                    {BOOKING_METHODS.map((v) => (
                      <label key={v} className={chip}>
                        <input required type="radio" name="bookingMethod" value={v} className="sr-only" />
                        {o.bookingMethod[v]}
                      </label>
                    ))}
                  </div>
                </div>
                <Field label={l.fields.monthlyPatients}>
                  <select required name="monthlyPatients" defaultValue="" className={input}>
                    <option value="" disabled>{l.select}</option>
                    {MONTHLY_PATIENTS.map((v) => (
                      <option key={v} value={v}>{o.monthlyPatients[v]}</option>
                    ))}
                  </select>
                </Field>
                <div>
                  <p className="mb-2 text-sm font-medium text-muted">{l.fields.needs}</p>
                  <div className="flex flex-wrap gap-2">
                    {NEEDS.map((v) => (
                      <label key={v} className={chip}>
                        <input type="checkbox" name="needs" value={v} className="sr-only" />
                        {o.needs[v]}
                      </label>
                    ))}
                  </div>
                </div>
              </fieldset>

              <fieldset ref={(el) => { steps.current[2] = el; }} hidden={step !== 2} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={l.fields.name}>
                    <input required name="name" maxLength={120} autoComplete="name" className={input} />
                  </Field>
                  <Field label={l.fields.role}>
                    <select required name="role" defaultValue="" className={input}>
                      <option value="" disabled>{l.select}</option>
                      {ROLES.map((v) => (
                        <option key={v} value={v}>{o.role[v]}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label={l.fields.phone}>
                  <input
                    required
                    name="phone"
                    type="tel"
                    dir="ltr"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="05XXXXXXXX"
                    pattern="^(\+?966|00966|0)?5[0-9]{8}$"
                    className={`${input} rtl:text-right`}
                  />
                </Field>
                <Field label={l.fields.email}>
                  <input name="email" type="email" dir="ltr" maxLength={160} autoComplete="email" className={`${input} rtl:text-right`} />
                </Field>
                <label className="flex items-start gap-3 text-sm text-muted">
                  <input required type="checkbox" name="consent" className="mt-1 size-4 accent-teal-500" />
                  {l.fields.consent}
                </label>
                {/* Honeypot: hidden from people, filled by bots. */}
                <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              </fieldset>

              <div className="mt-6 flex gap-3">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    className="rounded-lg border border-line px-5 py-3 font-medium text-muted transition hover:text-ink"
                  >
                    {l.back}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="bg-brand-gradient flex-1 rounded-lg py-3 font-semibold text-white shadow-lg shadow-teal/20 transition hover:shadow-teal/40 disabled:opacity-60"
                >
                  {step < last ? l.next : status === "sending" ? l.sending : l.submit}
                </button>
              </div>
              <p aria-live="polite" className="mt-3 text-sm">
                {status === "success" && <span className="text-emerald-600 dark:text-emerald-400">{l.success}</span>}
                {status === "error" && <span className="text-rose-500">{l.error}</span>}
              </p>
            </form>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
