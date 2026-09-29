import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

// Operations log and runtime self-healing.
// Every outcome that matters (agent replies, bookings, WhatsApp sends, n8n calls) is recorded
// in ops_events; errors are grouped into ops_incidents by signature. The database scrubs
// phone numbers, e-mails and ids from messages, so nothing here identifies a patient.
// Recording never throws: monitoring must not break the thing it monitors.

export type OpsSource = "agent" | "booking" | "whatsapp" | "n8n" | "reminders" | "api" | "deploy";
export type OpsKind = "ok" | "error" | "retry_ok" | "fallback" | "degraded";

export async function recordOps(source: OpsSource, kind: OpsKind, message?: string | null, clinicId?: string | null, latencyMs?: number) {
  try {
    const { error } = await createServiceClient().rpc("ops_record", {
      p_source: source, p_kind: kind, p_message: message ? message.slice(0, 2000) : null,
      p_clinic: clinicId ?? null, p_latency_ms: latencyMs === undefined ? null : Math.max(0, Math.round(latencyMs)),
    });
    if (error) console.error("[ops] record failed", error.message);
  } catch (err) {
    console.error("[ops] record failed", err instanceof Error ? err.message : err);
  }
}

export const errorText = (err: unknown) =>
  err instanceof Error ? `${err.name}: ${err.message}` : typeof err === "string" ? err : JSON.stringify(err);

/**
 * Runs `fn`, retrying transient failures with backoff (default 3 attempts: 0.5s, 1.5s).
 * A success after a retry is recorded as healed (`retry_ok`); the final failure as an error.
 */
export async function withRetry<T>(
  source: OpsSource, what: string, fn: () => Promise<T>,
  { attempts = 3, baseMs = 500, clinicId }: { attempts?: number; baseMs?: number; clinicId?: string | null } = {},
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const out = await fn();
      if (i > 0) await recordOps(source, "retry_ok", `${what} recovered after ${i} retr${i === 1 ? "y" : "ies"}`, clinicId);
      return out;
    } catch (err) {
      last = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseMs * 3 ** i));
    }
  }
  await recordOps(source, "error", `${what}: ${errorText(last)}`, clinicId);
  throw last;
}

/** Circuit breaker state for the AI agent (see ops_agent_degraded in the database). */
export async function agentDegraded() {
  try {
    const { data } = await createServiceClient().rpc("ops_agent_degraded");
    return data === true;
  } catch {
    return false;
  }
}

/**
 * Reply the patient gets when the assistant can't answer (error or circuit open): a direct
 * link to book or change their visit themselves, so nobody is left waiting.
 */
export async function fallbackReply(clinicId: string) {
  let link = "";
  try {
    const { data } = await createServiceClient().from("clinic_sites").select("slug, published").eq("clinic_id", clinicId).maybeSingle();
    const site = (process.env.SITE_URL ?? "").replace(/\/$/, "");
    if (data?.published && site) link = `${site}/ar/c/${data.slug}/book`;
  } catch { /* the reply below still works without the link */ }
  return link
    ? `المعذرة، المساعد متوقف لحظياً 🌿\nتقدر تحجز أو تختار موعدك مباشرة من هنا:\n${link}\nولتعديل موعد قائم استخدم الرابط اللي وصلك مع تأكيد الحجز.`
    : "المعذرة، المساعد متوقف لحظياً 🌿 بنرد عليك هنا بأقرب وقت.";
}
