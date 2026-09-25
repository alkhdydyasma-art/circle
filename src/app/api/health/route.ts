import { createServiceClient } from "@/lib/supabase/server";

// GET /api/health → 200 when the app can reach the database, 503 otherwise.
// Used by the server's healthcheck and an external uptime monitor; reveals nothing else.
export async function GET() {
  try {
    const { error } = await createServiceClient().from("clinics").select("id", { head: true }).limit(1);
    if (error) throw new Error(error.message);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[health]", err instanceof Error ? err.message : err);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
