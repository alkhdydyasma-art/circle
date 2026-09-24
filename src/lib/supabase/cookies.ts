import type { CookieOptions } from "@supabase/ssr";

// Session cookies are HttpOnly: page scripts (and any injected script) can never read
// the tokens. That's possible because Circle never uses Supabase from the browser —
// every query runs on the server with the user's session.
export const SESSION_COOKIE: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax", // lax, not strict: invite links opened from WhatsApp must keep the session
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};

// Applied to every cookie Supabase writes; keeps its maxAge so sign-out (maxAge 0) still clears.
export const harden = (options: CookieOptions): CookieOptions => ({
  ...options,
  httpOnly: true,
  secure: SESSION_COOKIE.secure,
  sameSite: SESSION_COOKIE.sameSite,
  path: "/",
});

export function supabaseEnv() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  return { url, anonKey };
}
