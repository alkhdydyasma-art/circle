// Mirrors billing_price / billing_state in the database (20261004000000_billing.sql).
export type Plan = "starter" | "standard" | "pro";
export type BillingStatus = "trial" | "active" | "grace" | "expired" | "exempt";
export type BillingFields = { trial_ends_at: string | null; paid_until: string | null; billing_exempt: boolean };

export const GRACE_DAYS = 7;

/** Price in halalas, or null for a custom (Scale) price. Yearly = 10 months. */
export function planPrice(plan: Plan, cycle: "monthly" | "yearly", founder: boolean) {
  const m = plan === "starter" ? 79900 : plan === "standard" ? (founder ? 99900 : 129900) : null;
  return m === null ? null : m * (cycle === "yearly" ? 10 : 1);
}

export function billingStatus(c: BillingFields, now = Date.now()): { state: BillingStatus; ends: Date | null; daysLeft: number } {
  const paid = c.paid_until ? new Date(c.paid_until) : null;
  const trial = c.trial_ends_at ? new Date(c.trial_ends_at) : null;
  const ends = paid ?? trial;
  const daysLeft = ends ? Math.max(0, Math.ceil((ends.getTime() - now) / 86400_000)) : 0;
  if (c.billing_exempt) return { state: "exempt", ends, daysLeft };
  if (paid && paid.getTime() > now) return { state: "active", ends, daysLeft };
  if (!paid && trial && trial.getTime() > now) return { state: "trial", ends, daysLeft };
  const last = Math.max(paid?.getTime() ?? -Infinity, trial?.getTime() ?? -Infinity);
  if (last > now - GRACE_DAYS * 86400_000) return { state: "grace", ends, daysLeft };
  return { state: "expired", ends, daysLeft };
}

/**
 * What to do with a Moyasar invoice re-read for one of our checkouts. "paid" only when it is
 * paid in SAR, for at least the checkout amount. The invoice id itself was stored when Circle
 * created it, so metadata is a second check only when Moyasar returns it.
 */
export function invoiceVerdict(
  inv: { status: string; amount: number; currency: string; metadata?: Record<string, string> | null },
  c: { id: string; amount_halalas: number },
): "paid" | "pending" | "closed" | "mismatch" {
  if (inv.status === "expired" || inv.status === "canceled" || inv.status === "failed") return "closed";
  if (inv.status !== "paid") return "pending";
  if (inv.currency !== "SAR" || inv.amount < c.amount_halalas || (inv.metadata?.checkout && inv.metadata.checkout !== c.id)) return "mismatch";
  return "paid";
}

/** Invoice ids a Moyasar notification may carry: invoice callback (id) or payment webhook (data.invoice_id). */
export function notificationInvoiceIds(body: unknown): string[] {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const data = (b.data && typeof b.data === "object" ? b.data : {}) as Record<string, unknown>;
  return [data.invoice_id, b.invoice_id, b.id].filter((v): v is string => typeof v === "string" && /^[\w-]{6,64}$/.test(v));
}
