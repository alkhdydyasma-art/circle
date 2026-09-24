"use client";

import { useState, type FormEvent } from "react";
import { MessageCircle } from "lucide-react";
import { Reveal } from "./Reveal";
import type { Dictionary, Locale } from "@/i18n";

type Status = "idle" | "sending" | "success" | "error";

export function LeadSection({ lang, t }: { lang: Locale; t: Dictionary }) {
  const l = t.lead;
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setStatus("sending");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), lang }),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  const fields = [
    { name: "clinic", label: l.fields.clinic, type: "text", autoComplete: "organization" },
    { name: "name", label: l.fields.name, type: "text", autoComplete: "name" },
    { name: "phone", label: l.fields.phone, type: "tel", autoComplete: "tel" },
    { name: "city", label: l.fields.city, type: "text", autoComplete: "address-level2" },
  ] as const;

  return (
    <section id="demo" className="scroll-mt-20 py-24 md:py-32">
      <Reveal className="mx-auto max-w-6xl px-6 md:px-8">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-card p-8 md:p-14">
          <div className="absolute -end-32 -top-32 size-96 rounded-full bg-teal/15 blur-3xl" aria-hidden />
          <div className="absolute -start-32 -bottom-32 size-96 rounded-full bg-brand/10 blur-3xl" aria-hidden />
          <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-medium text-teal ltr:font-mono ltr:tracking-widest ltr:uppercase">{l.eyebrow}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{l.title}</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted">{l.subtitle}</p>
              <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-bg px-4 py-2 text-sm text-muted">
                <MessageCircle className="size-4 text-whatsapp" />
                {l.note}
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-line bg-bg p-6 shadow-2xl shadow-black/10">
              {fields.map((f) => (
                <label key={f.name} className="block">
                  <span className="mb-1 block text-sm font-medium text-muted">{f.label}</span>
                  <input
                    required
                    name={f.name}
                    type={f.type}
                    autoComplete={f.autoComplete}
                    dir={f.type === "tel" ? "ltr" : undefined}
                    className="w-full rounded-lg border border-line bg-card px-4 py-2.5 outline-none transition focus:border-teal focus:ring-4 focus:ring-teal/10 rtl:text-right"
                  />
                </label>
              ))}
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-muted">{l.fields.chairs}</span>
                <input
                  required
                  name="chairs"
                  type="number"
                  min={1}
                  className="w-full rounded-lg border border-line bg-card px-4 py-2.5 outline-none transition focus:border-teal focus:ring-4 focus:ring-teal/10"
                />
              </label>
              {/* Honeypot: hidden from people, filled by bots. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              <button
                type="submit"
                disabled={status === "sending"}
                className="bg-brand-gradient mt-2 w-full rounded-lg py-3 font-semibold text-white shadow-lg shadow-teal/20 transition hover:shadow-teal/40 disabled:opacity-60"
              >
                {status === "sending" ? l.sending : l.submit}
              </button>
              {status === "success" && <p className="text-sm text-emerald-600 dark:text-emerald-400">{l.success}</p>}
              {status === "error" && <p className="text-sm text-rose-500">{l.error}</p>}
            </form>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
