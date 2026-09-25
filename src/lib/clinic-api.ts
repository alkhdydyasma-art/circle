import "server-only";
import { anonClient } from "@/lib/sites";
import { hashToken } from "@/lib/tokens";
import { allow, tooMany } from "@/lib/rate-limit";

// Shared plumbing for /api/v1/*: API-key auth, error mapping and link building.
// Every call goes to an api_* SQL function that resolves the clinic from the key hash,
// so a route can never reach another clinic's data.

const STATUS: Record<string, number> = {
  invalid_api_key: 401,
  appointment_not_found: 404,
  clinic_not_found: 404,
  slot_unavailable: 409,
  too_late_to_change: 409,
  too_many_bookings: 429,
  invalid_phone: 400,
  invalid_name: 400,
  invalid_notes: 400,
  invalid_source: 400,
};

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** SHA-256 of the bearer key, or a 401 / 429 response. */
export async function keyHash(request: Request): Promise<string | Response> {
  const key = request.headers.get("authorization")?.match(/^Bearer\s+(ck_[A-Za-z0-9_-]{20,80})$/)?.[1];
  if (!key) return json({ error: "invalid_api_key" }, 401);
  const hash = hashToken(key);
  return (await allow("api", hash)) ? hash : tooMany();
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ data: T } | Response> {
  const { data, error } = await anonClient().rpc(fn, args);
  if (error) {
    const code = Object.keys(STATUS).find((c) => error.message?.includes(c));
    if (!code) console.error(`[api] ${fn} failed`, error.message);
    return json({ error: code ?? "server_error" }, code ? STATUS[code] : 500);
  }
  return { data: data as T };
}

export function siteOrigin(request: Request) {
  return (process.env.SITE_URL ?? new URL(request.url).origin).replace(/\/$/, "");
}

/** Self-service link for a patient (confirm / cancel / reschedule). */
export const manageUrl = (request: Request, token: string, lang = "ar") => `${siteOrigin(request)}/${lang}/a/${token}`;

/** Replace the raw link token with a ready-to-send URL. */
export function withManageUrl<T extends { manage_token?: string }>(request: Request, row: T) {
  const { manage_token, ...rest } = row;
  return manage_token ? { ...rest, manage_url: manageUrl(request, manage_token) } : rest;
}
