import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { allow } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { fromN8n } from "@/lib/whatsapp";

// POST /api/whatsapp/inbound — called by n8n for every WhatsApp message a patient sends to a
// clinic number. Records it, runs the AI assistant (unless staff took over or the clinic
// turned it off) and returns the reply for n8n to send. { reply: null } means "send nothing".

export const maxDuration = 60;

const body = z.object({
  phone_number_id: z.string().regex(/^\d{5,30}$/),
  from: z.string().min(8).max(20),
  name: z.string().max(120).optional().nullable(),
  message_id: z.string().min(1).max(200),
  type: z.string().max(30).default("text"),
  text: z.string().max(4096).optional().nullable(),
});

const PLACEHOLDER: Record<string, string> = { audio: "[voice]", voice: "[voice]", image: "[image]", video: "[video]", document: "[document]", sticker: "[sticker]", location: "[location]" };

export async function POST(request: Request) {
  if (!fromN8n(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const m = parsed.data;
  const text = m.type === "text" ? (m.text ?? "").trim() : PLACEHOLDER[m.type] ?? `[${m.type}]`;
  if (!text) return Response.json({ reply: null });

  const db = createServiceClient();
  const { data: conv, error } = await db.rpc("agent_inbound", {
    p_phone_number_id: m.phone_number_id, p_from: m.from, p_name: m.name ?? null, p_wa_message_id: m.message_id, p_body: text,
  });
  if (error) {
    const known = /unknown_number|invalid_phone/.exec(error.message)?.[0];
    if (!known) console.error("[whatsapp] inbound failed", error.message);
    return Response.json({ error: known ?? "error" }, { status: known ? 422 : 500 });
  }
  if (!conv) return Response.json({ reply: null, duplicate: true });
  const c = conv as { clinic_id: string; conversation_id: string; phone: string; status: string; ai_enabled: boolean };

  // Staff handles this chat, or the assistant is off: the message waits in the inbox.
  if (!c.ai_enabled || c.status === "human") return Response.json({ reply: null, conversation_id: c.conversation_id, handled_by: "staff" });
  if (!(await allow("whatsapp", `${c.clinic_id}:${c.phone}`))) {
    await db.rpc("agent_handoff", { p_conversation: c.conversation_id, p_reason: "Too many messages in an hour" });
    return Response.json({ reply: null, conversation_id: c.conversation_id, handled_by: "staff" });
  }

  try {
    const result = await runAgent({ clinicId: c.clinic_id, conversationId: c.conversation_id, phone: c.phone });
    if (result.reply) await db.rpc("agent_reply", { p_conversation: c.conversation_id, p_body: result.reply });
    return Response.json({ reply: result.reply || null, handoff: result.handoff, actions: result.actions, conversation_id: c.conversation_id });
  } catch (err) {
    console.error("[whatsapp] agent failed", err instanceof Error ? err.message : err);
    await db.rpc("agent_handoff", { p_conversation: c.conversation_id, p_reason: "Assistant error" });
    const reply = "المعذرة، بيتواصل معك أحد من فريق العيادة هنا قريباً 🌿";
    await db.rpc("agent_reply", { p_conversation: c.conversation_id, p_body: reply });
    return Response.json({ reply, handoff: true, conversation_id: c.conversation_id });
  }
}
