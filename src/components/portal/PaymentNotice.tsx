"use client";

import { useSearchParams } from "next/navigation";
import type { PortalDictionary } from "@/i18n/portal";

/** Result of an online payment (?payment=… set by the Moyasar return route). */
export function PaymentNotice({ t, contactHref }: { t: PortalDictionary["billing"]; contactHref: string }) {
  const p = useSearchParams().get("payment");
  if (!p) return null;
  const tone = p === "paid" ? "border-teal/60 bg-teal/10" : p === "pending" ? "border-amber-400/70 bg-amber-400/10" : "border-rose-500/60 bg-rose-500/10";
  const text = p === "paid" ? t.paid : p === "pending" ? t.pending : p === "failed" ? t.payFailed : t.payError;
  return (
    <div role="status" className={`mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ${tone}`}>
      <p>{text}</p>
      {(p === "error" || p === "contact") && <a href={contactHref} target="_blank" rel="noopener noreferrer" className="text-teal underline">{t.contact}</a>}
    </div>
  );
}
