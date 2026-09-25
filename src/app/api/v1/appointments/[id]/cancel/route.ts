import { z } from "zod";
import { keyHash, json, rpc } from "@/lib/clinic-api";

// POST /api/v1/appointments/{id}/cancel  { phone } — the phone must match the appointment.
export async function POST(request: Request, { params }: RouteContext<"/api/v1/appointments/[id]/cancel">) {
  const key = await keyHash(request);
  if (key instanceof Response) return key;
  const { id } = await params;
  const p = z.object({ id: z.string().uuid(), phone: z.string().max(20) }).safeParse({ id, ...(await request.json().catch(() => ({}))) });
  if (!p.success) return json({ error: "invalid_request" }, 400);
  const res = await rpc("api_cancel", { p_key_hash: key, p_appt: p.data.id, p_phone: p.data.phone });
  return res instanceof Response ? res : json({ appointment: res.data });
}
