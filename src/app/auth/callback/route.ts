import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase email links (password reset) land here with a one-time ?code=… that is exchanged
// for a session (HttpOnly cookies), then the user continues to `next`.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "";
  // Only same-site paths under a locale — never an open redirect.
  const next = /^\/(ar|en)\/[a-z0-9/_-]*$/i.test(nextParam) ? nextParam : "/ar/portal";
  const lang = next.slice(1, 3);
  // Behind the reverse proxy request.url carries the container's address, so build redirects
  // from the public SITE_URL.
  const origin = process.env.SITE_URL?.replace(/\/$/, "") ?? url.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL(`/${lang}/reset-password`, origin));
}
