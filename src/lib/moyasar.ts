import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { recordOps } from "@/lib/ops";
import { invoiceVerdict } from "@/lib/billing";

// Moyasar hosted invoices. Circle never trusts what a browser or a callback says about a
// payment: it re-reads the invoice from Moyasar with the secret key and only then records it
// (billing_record_payment is idempotent per provider + invoice id and rejects short amounts).

const API = "https://api.moyasar.com/v1";

export const moyasarConfigured = () => Boolean(process.env.MOYASAR_SECRET_KEY?.trim());

export type MoyasarInvoice = {
  id: string; status: string; amount: number; currency: string; url: string;
  metadata?: Record<string, string> | null;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.MOYASAR_SECRET_KEY?.trim();
  if (!key) throw new Error("MOYASAR_SECRET_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`moyasar ${path.split("/")[1]} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

export function createInvoice(p: { amount: number; description: string; successUrl: string; backUrl: string; callbackUrl: string; metadata: Record<string, string> }) {
  return call<MoyasarInvoice>("/invoices", {
    method: "POST",
    body: JSON.stringify({
      amount: p.amount, currency: "SAR", description: p.description,
      success_url: p.successUrl, back_url: p.backUrl, callback_url: p.callbackUrl, metadata: p.metadata,
    }),
  });
}

export const fetchInvoice = (id: string) => call<MoyasarInvoice>(`/invoices/${encodeURIComponent(id)}`);

type Checkout = { id: string; clinic_id: string; invoice_id: string | null; cycle: "monthly" | "yearly"; amount_halalas: number; status: string };

/**
 * Settles one checkout: reads its invoice from Moyasar and, if paid in full, records the
 * payment. Safe to call any number of times (return page, callback, daily reconcile).
 */
export async function settleCheckout(c: Checkout): Promise<"paid" | "pending" | "failed"> {
  if (c.status === "paid") return "paid";
  if (!c.invoice_id) return "pending";
  const db = createServiceClient();
  const inv = await fetchInvoice(c.invoice_id);
  const verdict = invoiceVerdict(inv, c);
  if (verdict === "pending") return "pending";
  if (verdict === "closed") {
    await db.from("billing_checkouts").update({ status: inv.status === "expired" ? "expired" : "failed" }).eq("id", c.id).eq("status", "pending");
    return "failed";
  }
  if (verdict === "mismatch") {
    await recordOps("api", "error", `moyasar invoice mismatch for checkout ${c.id}`, c.clinic_id);
    return "failed";
  }
  const { error } = await db.rpc("billing_record_payment", {
    p_clinic: c.clinic_id, p_provider: "moyasar", p_reference: inv.id, p_amount_halalas: inv.amount, p_cycle: c.cycle,
  });
  if (error) {
    await recordOps("api", "error", `billing_record_payment (moyasar): ${error.message}`, c.clinic_id);
    throw new Error(error.message);
  }
  await db.from("billing_checkouts").update({ status: "paid", settled_at: new Date().toISOString() }).eq("id", c.id);
  await recordOps("api", "ok", "moyasar payment recorded", c.clinic_id);
  return "paid";
}

export const CHECKOUT_COLS = "id, clinic_id, invoice_id, cycle, amount_halalas, status";
