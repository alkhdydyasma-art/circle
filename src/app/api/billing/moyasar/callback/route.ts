import { createServiceClient } from "@/lib/supabase/server";
import { notificationInvoiceIds } from "@/lib/billing";
import { CHECKOUT_COLS, settleCheckout } from "@/lib/moyasar";

// POST /api/billing/moyasar/callback — Moyasar notifies here when an invoice is paid (the
// invoice's callback_url; a dashboard webhook with payment_paid works too). The body is only
// used to find which of OUR checkouts it is about; the payment itself is re-read from Moyasar.
export async function POST(request: Request) {
  const ids = notificationInvoiceIds(await request.json().catch(() => null));
  if (!ids.length) return Response.json({ ignored: true });

  const { data: c } = await createServiceClient().from("billing_checkouts").select(CHECKOUT_COLS).in("invoice_id", ids).maybeSingle();
  if (!c) return Response.json({ ignored: true });
  try {
    return Response.json({ status: await settleCheckout(c) });
  } catch {
    // Non-2xx so Moyasar retries; the daily reconcile also picks it up.
    return Response.json({ error: "retry" }, { status: 503 });
  }
}
