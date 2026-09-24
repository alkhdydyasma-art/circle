import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { harden, SESSION_COOKIE, supabaseEnv } from "./cookies";

// Per-request client acting as the signed-in user; every query is subject to RLS.
export async function createClient() {
  const store = await cookies(); // first: marks the route as dynamic (never prerendered)
  const { url, anonKey } = supabaseEnv();
  return createServerClient(url, anonKey, {
    cookieOptions: SESSION_COOKIE,
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, harden(options));
        } catch {
          // Called from a Server Component, where cookies are read-only; proxy.ts refreshes them.
        }
      },
    },
  });
}

// Verified user for this request (validated with Supabase Auth, not just decoded).
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

// Service-role client: bypasses RLS. Only for the narrow server tasks that need it
// (creating an invited user's account). Never pass its results to the browser as-is.
export function createServiceClient() {
  const { url } = supabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set");
  return createAdminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
