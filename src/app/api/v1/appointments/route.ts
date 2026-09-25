import { z } from "zod";
import { keyHash, json, rpc, withManageUrl } from "@/lib/clinic-api";
import { normalizeSaudiMobile } from "@/lib/lead-schema";
import { formatWhen, notifyBooking } from "@/lib/booking";

const body = z.object({
  service_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20),
  source: z.enum(["ai_agent", "whatsapp"]).default("ai_agent"),
  notes: z.string().trim().max(500).optional(),
});

// POST /api/v1/appointments — book on behalf of a patient (AI agent / WhatsApp).
export async function POST(request: Request) {
  const key = await keyHash(request);
  if (key instanceof Response) return key;
  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return json({ error: "invalid_request", issues: p.error.issues.map((i) => i.path.join(".")) }, 400);
  const d = p.data;
  const res = await rpc<{ id: string; starts_at: string; manage_token: string }>("api_book", {
    p_key_hash: key, p_service: d.service_id, p_doctor: d.doctor_id, p_branch: d.branch_id, p_starts_at: d.starts_at,
    p_full_name: d.full_name, p_phone: d.phone, p_source: d.source, p_notes: d.notes ?? null,
  });
  if (res instanceof Response) return res;
  const appointment = withManageUrl(request, res.data);
  const info = await rpc<{ clinic: { name: string } }>("api_clinic_info", { p_key_hash: key });
  await notifyBooking({
    event: "appointment.booked", source: d.source,
    clinic: { name: info instanceof Response ? "" : info.data.clinic.name },
    appointment: { ...appointment, when: formatWhen(res.data.starts_at) },
    patient: { name: d.full_name, phone: normalizeSaudiMobile(d.phone) },
  });
  return json({ appointment }, 201);
}

// GET /api/v1/appointments?phone=05… — the patient's upcoming appointments.
export async function GET(request: Request) {
  const key = await keyHash(request);
  if (key instanceof Response) return key;
  const phone = new URL(request.url).searchParams.get("phone");
  if (!phone) return json({ error: "invalid_request", issues: ["phone"] }, 400);
  const res = await rpc("api_find_appointments", { p_key_hash: key, p_phone: phone });
  return res instanceof Response ? res : json({ appointments: res.data });
}
