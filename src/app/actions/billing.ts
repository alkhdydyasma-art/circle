"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasLocale } from "@/i18n";
import { getClinicContext } from "@/lib/clinic-context";
import { planPrice } from "@/lib/billing";
import { createInvoice, moyasarConfigured } from "@/lib/moyasar";
import { recordOps } from "@/lib/ops";
import { createClient, createServiceClient } from "@/lib/supabase/server";

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

async function siteOrigin() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/** Owner/manager pays online: creates a Moyasar invoice for the plan price and opens it. */
export async function startCheckout(fd: FormData) {
  const lang = langOf(fd);
  const parsed = z.object({ clinic: z.string().uuid(), cycle: z.enum(["monthly", "yearly"]) })
    .safeParse({ clinic: fd.get("clinic"), cycle: fd.get("cycle") });
  if (!parsed.success || !moyasarConfigured()) redirect(`/${lang}/portal`);
  const { clinic, cycle } = parsed.data;
  const ctx = await getClinicContext(clinic);
  if (!ctx.canManage) redirect(`/${lang}/portal`);

  const db = createServiceClient();
  const { data: c } = await db.from("clinics").select("name, plan, founder").eq("id", clinic).single();
  const amount = c ? planPrice(c.plan, cycle, c.founder) : null;
  if (!c || amount === null) redirect(`/${lang}/portal/clinic/${clinic}?payment=contact`);

  const { data: row, error } = await db.from("billing_checkouts")
    .insert({ clinic_id: clinic, cycle, amount_halalas: amount, created_by: ctx.userId }).select("id").single();
  if (error || !row) redirect(`/${lang}/portal/clinic/${clinic}?payment=error`);

  const site = await siteOrigin();
  let payUrl: string;
  try {
    const inv = await createInvoice({
      amount,
      description: `Circle — ${c.name} — ${c.plan} (${cycle})`.slice(0, 250),
      successUrl: `${site}/api/billing/moyasar/return?ref=${row.id}&lang=${lang}`,
      backUrl: `${site}/${lang}/portal/clinic/${clinic}`,
      callbackUrl: `${site}/api/billing/moyasar/callback`,
      metadata: { checkout: row.id, clinic_id: clinic, cycle },
    });
    await db.from("billing_checkouts").update({ invoice_id: inv.id }).eq("id", row.id);
    payUrl = inv.url;
  } catch (err) {
    await recordOps("api", "error", `moyasar create invoice: ${err instanceof Error ? err.message : err}`, clinic);
    redirect(`/${lang}/portal/clinic/${clinic}?payment=error`);
  }
  redirect(payUrl);
}
