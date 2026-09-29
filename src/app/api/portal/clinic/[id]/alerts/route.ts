import { createClient } from "@/lib/supabase/server";

// GET — open emergency alerts and chats waiting for staff, for the dashboard's live watcher.
// Runs as the signed-in user: RLS returns nothing for other clinics or for doctors.
export async function GET(_: Request, { params }: RouteContext<"/api/portal/clinic/[id]/alerts">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "not_found" }, { status: 404 });
  const supabase = await createClient();
  const [{ data: urgent }, { data: waiting }] = await Promise.all([
    supabase.from("conversations").select("id").eq("clinic_id", id).not("emergency_at", "is", null).is("emergency_ack_at", null).limit(20),
    supabase.from("conversations").select("id").eq("clinic_id", id).eq("needs_attention", true).limit(99),
  ]);
  return Response.json({ emergencies: urgent?.length ?? 0, waiting: waiting?.length ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
