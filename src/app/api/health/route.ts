import { createServiceClient } from "@/lib/supabase/server";
import { anonClient } from "@/lib/sites";

// GET /api/health → 200 when the app can reach the database, 503 otherwise.
// Used by the server's healthcheck and an external uptime monitor; reveals nothing else.
export async function GET() {
  try {
    // A table read with the service key and a function call with the public key: together they
    // cover every way the app talks to the database.
    const { error } = await createServiceClient().from("clinics").select("id").limit(1);
    if (error) throw new Error(error.message);
    const rpc = await anonClient().rpc("public_site", { p_slug: "health-check" });
    if (rpc.error) throw new Error(rpc.error.message);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[health]", err instanceof Error ? err.message : err);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
