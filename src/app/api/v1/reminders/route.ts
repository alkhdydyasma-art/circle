import { keyHash, json, manageUrl, rpc } from "@/lib/clinic-api";
import { formatWhen } from "@/lib/booking";

type Due = {
  id: string; starts_at: string; service: string; doctor: string; branch: string; branch_address: string | null; maps_url: string | null;
  clinic: string; timezone: string; patient_name: string; patient_phone: string; manage_token: string;
};

// GET /api/v1/reminders — appointments due for a reminder (per the clinic's settings),
// each with a fresh self-service link and a ready-to-send Arabic message.
// After sending, call POST /api/v1/reminders/{id}/sent.
export async function GET(request: Request) {
  const key = keyHash(request);
  if (key instanceof Response) return key;
  const res = await rpc<Due[]>("api_due_reminders", { p_key_hash: key });
  if (res instanceof Response) return res;
  const reminders = res.data.map(({ manage_token, ...r }) => {
    const when = formatWhen(r.starts_at, r.timezone);
    const url = manageUrl(request, manage_token);
    return {
      ...r,
      manage_url: url,
      when,
      /** Free text: only deliverable inside WhatsApp's 24h window. Use a template otherwise. */
      message:
        `مرحباً ${r.patient_name} 👋\n` +
        `نذكّرك بموعدك في ${r.clinic}\n` +
        `🦷 ${r.service} مع ${r.doctor}\n📅 ${when}\n📍 ${r.branch}${r.maps_url ? `\n${r.maps_url}` : ""}\n\n` +
        `لتأكيد الحضور أو تغيير الموعد:\n${url}`,
    };
  });
  return json({ reminders });
}
