"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { anonClient } from "@/lib/sites";
import { hashToken } from "@/lib/tokens";
import { allowAction } from "@/lib/rate-limit";

// Patient self-service actions. The link token is the only credential; the database
// functions check the clinic's cutoff and slot availability.

export type ManageResult = { ok: boolean; error?: "too_late" | "slot" | "error" };
export type ManageSlot = { doctor_id: string; branch_id: string; starts_at: string };

const token = z.string().regex(/^[0-9a-f]{64}$/);

async function call(fn: string, args: Record<string, unknown>): Promise<ManageResult> {
  if (!(await allowAction("manage"))) return { ok: false, error: "error" };
  const { error } = await anonClient().rpc(fn, args);
  if (!error) return { ok: true };
  if (error.message.includes("too_late_to_change")) return { ok: false, error: "too_late" };
  if (error.message.includes("slot_unavailable")) return { ok: false, error: "slot" };
  return { ok: false, error: "error" };
}

export async function manageConfirm(raw: string, lang: string): Promise<ManageResult> {
  const t = token.safeParse(raw);
  if (!t.success) return { ok: false, error: "error" };
  const r = await call("manage_confirm", { p_token_hash: hashToken(t.data) });
  revalidatePath(`/${lang}/a/${raw}`);
  return r;
}

export async function manageCancel(raw: string, lang: string): Promise<ManageResult> {
  const t = token.safeParse(raw);
  if (!t.success) return { ok: false, error: "error" };
  const r = await call("manage_cancel", { p_token_hash: hashToken(t.data) });
  revalidatePath(`/${lang}/a/${raw}`);
  return r;
}

export async function manageSlots(raw: string, day: string): Promise<ManageSlot[]> {
  const t = token.safeParse(raw);
  if (!t.success || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const { data } = await anonClient().rpc("manage_slots", { p_token_hash: hashToken(t.data), p_day: day });
  return (data ?? []) as ManageSlot[];
}

export async function manageReschedule(raw: string, lang: string, startsAt: string, branchId: string): Promise<ManageResult> {
  const p = z.object({ t: token, s: z.string().datetime({ offset: true }), b: z.string().uuid() }).safeParse({ t: raw, s: startsAt, b: branchId });
  if (!p.success) return { ok: false, error: "error" };
  const r = await call("manage_reschedule", { p_token_hash: hashToken(p.data.t), p_starts_at: p.data.s, p_branch: p.data.b });
  revalidatePath(`/${lang}/a/${raw}`);
  return r;
}
