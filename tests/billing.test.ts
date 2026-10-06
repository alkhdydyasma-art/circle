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
