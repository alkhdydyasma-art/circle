"use client";

import { useActionState } from "react";
import { recordPayment, type BillingState } from "@/app/actions/billing";
import { fill, type PortalDictionary } from "@/i18n/portal";
import type { Locale } from "@/i18n";
import { btnCls, fieldCls } from "./ui";

/** Staff record a bank transfer / manual payment; the subscription extends right away. */
export function RecordPaymentForm({ lang, t, clinicId, price }: { lang: Locale; t: PortalDictionary; clinicId: string; price: { monthly: number | null; yearly: number | null } }) {
  const [state, action, pending] = useActionState<BillingState, FormData>(recordPayment, {});
  const b = t.billing;
  const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium" });
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="clinic" value={clinicId} />
      <select name="provider" aria-label={b.provider} className={fieldCls} defaultValue="bank_transfer">
        {(Object.keys(b.providers) as (keyof typeof b.providers)[]).map((k) => <option key={k} value={k}>{b.providers[k]}</option>)}
      </select>
      <input required name="reference" maxLength={120} dir="ltr" placeholder={b.reference} aria-label={b.reference} className={`${fieldCls} w-36`} />
      <select name="cycle" aria-label={b.cycle.monthly} className={fieldCls}
        onChange={(e) => { const a = e.currentTarget.form?.elements.namedItem("amount") as HTMLInputElement | null; const v = price[e.currentTarget.value as "monthly" | "yearly"]; if (a && v) a.value = String(v / 100); }}>
        <option value="monthly">{b.cycle.monthly}</option>
        <option value="yearly">{b.cycle.yearly}</option>
      </select>
      <input required name="amount" type="number" min="1" step="0.01" dir="ltr" defaultValue={price.monthly ? price.monthly / 100 : undefined}
        placeholder={b.amount} aria-label={b.amount} className={`${fieldCls} w-28`} />
      <button disabled={pending} className={btnCls}>{b.record}</button>
      {state.ok && <p role="status" className="w-full text-sm text-teal">{state.duplicate ? b.duplicate : fill(b.recorded, { date: date.format(new Date(state.until!)) })}</p>}
      {state.error && <p role="alert" className="w-full text-sm text-rose-500">{state.error === "too_low" ? b.tooLow : b.failed}</p>}
    </form>
  );
}
