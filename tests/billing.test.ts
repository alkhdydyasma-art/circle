import { test } from "node:test";
import assert from "node:assert/strict";
import { billingStatus, planPrice } from "../src/lib/billing";

const now = Date.parse("2026-10-06T12:00:00Z");
const day = 86400_000;
const iso = (ms: number) => new Date(ms).toISOString();

test("plan prices match the website (halalas)", () => {
  assert.equal(planPrice("starter", "monthly", false), 79900);
  assert.equal(planPrice("standard", "monthly", false), 129900);
  assert.equal(planPrice("standard", "monthly", true), 99900);
  assert.equal(planPrice("standard", "yearly", false), 1299000);
  assert.equal(planPrice("pro", "monthly", false), null);
});

test("billing states", () => {
  const s = (trial: number | null, paid: number | null, exempt = false) =>
    billingStatus({ trial_ends_at: trial === null ? null : iso(trial), paid_until: paid === null ? null : iso(paid), billing_exempt: exempt }, now);
  assert.deepEqual([s(now + 5 * day, null).state, s(now + 5 * day, null).daysLeft], ["trial", 5]);
  assert.equal(s(now - 2 * day, null).state, "grace");
  assert.equal(s(now - 8 * day, null).state, "expired");
  assert.equal(s(now - 30 * day, now + 20 * day).state, "active");
  assert.equal(s(now + 5 * day, now - 1 * day).state, "grace");
  assert.equal(s(now - 30 * day, now - 10 * day).state, "expired");
  assert.equal(s(null, null, true).state, "exempt");
});

test("Moyasar invoice is accepted only when paid in full, in SAR, for this checkout", async () => {
  const { invoiceVerdict } = await import("../src/lib/billing");
  const c = { id: "chk-1", amount_halalas: 99900 };
  const inv = { status: "paid", amount: 99900, currency: "SAR", metadata: { checkout: "chk-1" } };
  assert.equal(invoiceVerdict(inv, c), "paid");
  assert.equal(invoiceVerdict({ ...inv, status: "initiated" }, c), "pending");
  assert.equal(invoiceVerdict({ ...inv, status: "expired" }, c), "closed");
  assert.equal(invoiceVerdict({ ...inv, amount: 100 }, c), "mismatch");
  assert.equal(invoiceVerdict({ ...inv, currency: "USD" }, c), "mismatch");
  assert.equal(invoiceVerdict({ ...inv, metadata: { checkout: "other" } }, c), "mismatch");
  assert.equal(invoiceVerdict({ ...inv, metadata: null }, c), "paid");
});

test("callback ids come from invoice callbacks and payment webhooks only", async () => {
  const { notificationInvoiceIds } = await import("../src/lib/billing");
  assert.deepEqual(notificationInvoiceIds({ id: "inv_123456" }), ["inv_123456"]);
  assert.deepEqual(notificationInvoiceIds({ type: "payment_paid", data: { id: "pay_1", invoice_id: "inv_999999" } }), ["inv_999999"]);
  assert.deepEqual(notificationInvoiceIds({ id: "x'; drop" }), []);
  assert.deepEqual(notificationInvoiceIds(null), []);
});
