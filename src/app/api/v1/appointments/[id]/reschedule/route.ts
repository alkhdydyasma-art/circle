import { z } from "zod";
import { keyHash, json, rpc } from "@/lib/clinic-api";

const body = z.object({
  id: z.string().uuid(),
  phone: z.string().max(20),
  starts_at: z.string().datetime({ offset: true }),
  doctor_id: z.string().uuid().optional(),
  branch_id: z.string().uuid().optional(),
});

// POST /api/v1/appointments/{id}/reschedule  { phone, starts_at, doctor_id?, branch_id? }
export async function POST(request: Request, { params }: RouteContext<"/api/v1/appointments/[id]/reschedule">) {
  const key = await keyHash(request);
  if (key instanceof Response) return key;
  const { id } = await params;
  const p = body.safeParse({ id, ...(await request.json().catch(() => ({}))) });
  if (!p.success) return json({ error: "invalid_request" }, 400);
  const res = await rpc("api_reschedule", {
    p_key_hash: key, p_appt: p.data.id, p_phone: p.data.phone, p_starts_at: p.data.starts_at,
    p_doctor: p.data.doctor_id ?? null, p_branch: p.data.branch_id ?? null,
  });
  return res instanceof Response ? res : json({ appointment: res.data });
}
