"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasLocale } from "@/i18n";
import { createClient } from "@/lib/supabase/server";

// Subscriptions: Circle staff only. The database re-checks is_platform_admin() and the
// clinic guard trigger blocks anyone else from touching billing fields.

export type BillingState = { ok?: boolean; until?: string; duplicate?: boolean; error?: "invalid" | "too_low" | "failed" };

const langOf = (fd: FormData) => { const l = String(fd.get("lang") ?? ""); return hasLocale(l) ? l : "ar"; };

export async function recordPayment(_: BillingState, fd: FormData): Promise<BillingState> {
  const parsed = z.object({
    clinic: z.string().uuid(),
    provider: z.enum(["bank_transfer", "manual", "tap", "paytabs", "moyasar"]),
    reference: z.string().trim().min(1).max(120),
    amount: z.coerce.number().positive().max(1_000_000),
    cycle: z.enum(["monthly", "yearly"]),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "invalid" };
  const p = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_record_payment", {
    p_clinic: p.clinic, p_provider: p.provider, p_reference: p.reference,
    p_amount_halalas: Math.round(p.amount * 100), p_cycle: p.cycle,
  });
  if (error) return { error: error.message.includes("amount_too_low") ? "too_low" : "failed" };
  revalidatePath(`/${langOf(fd)}/portal`, "layout");
  const r = data as { duplicate: boolean; paid_until: string };
  return { ok: true, duplicate: r.duplicate, until: r.paid_until };
}

export async function updateBillingAdmin(fd: FormData) {
  const parsed = z.object({
    id: z.string().uuid(),
    trial: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  }).safeParse({ id: fd.get("id"), trial: fd.get("trial") ?? "" });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.from("clinics").update({
    founder: fd.get("founder") === "on",
    billing_exempt: fd.get("exempt") === "on",
    ...(parsed.data.trial && { trial_ends_at: `${parsed.data.trial}T23:59:59+03:00` }),
  }).eq("id", parsed.data.id);
  revalidatePath(`/${langOf(fd)}/portal`, "layout");
}
