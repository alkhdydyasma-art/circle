import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { harden, SESSION_COOKIE, supabaseEnv } from "@/lib/supabase/cookies";

// Guards /{lang}/portal/* and /{lang}/preview/*: refreshes the Supabase session (rewriting the HttpOnly
// cookies) and sends signed-out visitors to the login page.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = supabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: SESSION_COOKIE,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list, headers) {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, harden(options));
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    const lang = request.nextUrl.pathname.split("/")[1] || "ar";
    const login = new URL(`/${lang}/login`, request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/(ar|en)/portal/:path*", "/(ar|en)/preview/:path*"],
};
