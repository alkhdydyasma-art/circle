import { redirect } from "next/navigation";
import { hasLocale } from "@/i18n";
import { createServiceClient } from "@/lib/supabase/server";
import { CHECKOUT_COLS, settleCheckout } from "@/lib/moyasar";

// GET /api/billing/moyasar/return?ref=<checkout id>&lang=ar — where Moyasar sends the payer
// after paying. Settles the checkout right away (the callback may arrive later) and goes
// back to the clinic dashboard.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang") ?? "ar";
  const l = hasLocale(lang) ? lang : "ar";
  const ref = url.searchParams.get("ref") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(ref)) redirect(`/${l}/portal`);

  const { data: c } = await createServiceClient().from("billing_checkouts").select(CHECKOUT_COLS).eq("id", ref).maybeSingle();
  if (!c) redirect(`/${l}/portal`);
  let status: string = "pending";
  try { status = await settleCheckout(c); } catch { /* callback / daily reconcile will settle it */ }
  redirect(`/${l}/portal/clinic/${c.clinic_id}?payment=${status}`);
}
