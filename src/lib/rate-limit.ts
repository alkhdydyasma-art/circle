import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";

// Fixed-window limits enforced in Postgres (public.rate_limit_hit), so they hold across
// server restarts and instances. IPs are hashed with a server secret: we never store them.

export const LIMITS = {
  lead: { limit: 5, window: 3600 },           // demo requests per IP per hour
  book: { limit: 10, window: 3600 },          // online bookings per IP per hour
  availability: { limit: 120, window: 60 },   // slot lookups per IP per minute
  signIn: { limit: 10, window: 900 },         // sign-in attempts per IP per 15 min
  invite: { limit: 10, window: 3600 },        // invitation redemptions per IP per hour
  manage: { limit: 30, window: 3600 },        // self-service link actions per IP per hour
  reset: { limit: 5, window: 3600 },          // password-reset emails per IP per hour
  api: { limit: 300, window: 60 },            // clinic API calls per key per minute
} as const;

export type LimitName = keyof typeof LIMITS;

const salt = () => process.env.RATE_LIMIT_SALT ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "circle";
const hash = (v: string) => createHash("sha256").update(`${salt()}:${v}`).digest("hex").slice(0, 32);

/** Client IP as seen by our reverse proxy (first X-Forwarded-For hop). */
export function ipOf(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * true = allowed. Fails open (allows) if the limiter itself errors, so an outage of the
 * counter never blocks patients from booking; the failure is logged.
 */
export async function allow(name: LimitName, subject: string): Promise<boolean> {
  const { limit, window } = LIMITS[name];
  try {
    const { data, error } = await createServiceClient().rpc("rate_limit_hit", {
      p_key: `${name}:${hash(subject)}`,
      p_limit: limit,
      p_window_seconds: window,
    });
    if (error) throw error;
    return data !== false;
  } catch (err) {
    console.error("[rate-limit] check failed, allowing", name, err);
    return true;
  }
}

/** For route handlers. */
export const allowRequest = (name: LimitName, request: Request) => allow(name, ipOf(request.headers));

/** For server actions (no Request object). */
export async function allowAction(name: LimitName) {
  return allow(name, ipOf(await headers()));
}

export const tooMany = () =>
  Response.json({ error: "too_many_requests" }, { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
