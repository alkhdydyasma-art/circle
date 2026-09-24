"use client";

import { useState, type FormEvent } from "react";
import { MessageCircle } from "lucide-react";
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
    <section id="demo" className="scroll-mt-20 py-24">
      <div className="mx-auto max-w-6xl px-4">
        <div className="bg-brand-gradient relative overflow-hidden rounded-[2.5rem] p-8 text-white shadow-2xl shadow-brand/25 md:p-14">
          <div className="absolute -end-24 -top-24 size-72 rounded-full bg-white/10" aria-hidden />
          <div className="relative grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="text-sm font-semibold text-white/80">{l.eyebrow}</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{l.title}</h2>
              <p className="mt-4 text-lg text-white/85">{l.subtitle}</p>
              <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm">
                <MessageCircle className="size-4" />
                {l.note}
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-3 rounded-3xl bg-white p-6 text-ink shadow-xl">
              {fields.map((f) => (
                <label key={f.name} className="block">
                  <span className="mb-1 block text-sm font-medium text-muted">{f.label}</span>
                  <input
                    required
                    name={f.name}
                    type={f.type}
                    autoComplete={f.autoComplete}
                    dir={f.type === "tel" ? "ltr" : undefined}
                    className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10 rtl:text-right"
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
                  className="w-full rounded-xl border border-line bg-surface px-4 py-2.5 outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/10"
                />
              </label>
              {/* Honeypot: hidden from people, filled by bots. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              <button
                type="submit"
                disabled={status === "sending"}
                className="bg-brand-gradient mt-2 w-full rounded-xl py-3 font-semibold text-white shadow-lg shadow-brand/25 transition hover:opacity-90 disabled:opacity-60"
              >
                {status === "sending" ? l.sending : l.submit}
              </button>
              {status === "success" && <p className="text-sm text-emerald-700">{l.success}</p>}
              {status === "error" && <p className="text-sm text-rose-600">{l.error}</p>}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
