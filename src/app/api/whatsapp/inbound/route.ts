import { z } from "zod";
import { runAgent } from "@/lib/agent";
import { agentDegraded, errorText, fallbackReply, recordOps } from "@/lib/ops";
import { detectEmergency, emergencyReply } from "@/lib/emergency";
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
    if (!known) {
      console.error("[whatsapp] inbound failed", error.message);
      await recordOps("whatsapp", "error", `agent_inbound: ${error.message}`);
    }
    return Response.json({ error: known ?? "error" }, { status: known ? 422 : 500 });
  }
  if (!conv) return Response.json({ reply: null, duplicate: true });
  const c = conv as { clinic_id: string; conversation_id: string; phone: string; status: string; ai_enabled: boolean };

  // Medical emergency protocol: checked before anything else and before any AI call.
  // Raises the red alert for the clinic, stops the assistant for this chat and sends the
  // fixed safety message (997 + clinic phone).
  const alarm = m.type === "text" ? detectEmergency(text) : null;
  if (alarm) {
    await db.rpc("agent_emergency", { p_conversation: c.conversation_id, p_reason: `«${alarm}»` });
    if (!c.ai_enabled) return Response.json({ reply: null, emergency: true, conversation_id: c.conversation_id });
    const { data: site } = await db.from("clinic_sites").select("phone").eq("clinic_id", c.clinic_id).maybeSingle();
    const reply = emergencyReply(site?.phone);
    await db.rpc("agent_reply", { p_conversation: c.conversation_id, p_body: reply });
    return Response.json({ reply, emergency: true, conversation_id: c.conversation_id });
  }

  // Staff handles this chat, or the assistant is off: the message waits in the inbox.
  if (!c.ai_enabled || c.status === "human") return Response.json({ reply: null, conversation_id: c.conversation_id, handled_by: "staff" });
  if (!(await allow("whatsapp", `${c.clinic_id}:${c.phone}`))) {
    await db.rpc("agent_handoff", { p_conversation: c.conversation_id, p_reason: "Too many messages in an hour" });
    return Response.json({ reply: null, conversation_id: c.conversation_id, handled_by: "staff" });
  }
  // Hard daily cost ceiling per clinic: past it, patients get the self-service booking link.
  if (!(await allow("agentDay", c.clinic_id))) {
    const reply = await fallbackReply(c.clinic_id);
    await db.rpc("agent_reply", { p_conversation: c.conversation_id, p_body: reply });
    await recordOps("agent", "degraded", null, c.clinic_id);
    return Response.json({ reply, capped: true, conversation_id: c.conversation_id });
  }

  // Circuit breaker: while the assistant keeps failing, patients get the self-service link
  // straight away; 1 in 5 messages still goes to the assistant to detect recovery.
  const started = Date.now();
  if ((await agentDegraded()) && Math.random() > 0.2) {
    const reply = await fallbackReply(c.clinic_id);
    await db.rpc("agent_reply", { p_conversation: c.conversation_id, p_body: reply });
    await recordOps("agent", "degraded", null, c.clinic_id);
    return Response.json({ reply, degraded: true, conversation_id: c.conversation_id });
  }

  try {
    const result = await runAgent({ clinicId: c.clinic_id, conversationId: c.conversation_id, phone: c.phone });
    if (result.reply) await db.rpc("agent_reply", { p_conversation: c.conversation_id, p_body: result.reply });
    await recordOps("agent", result.failed ? "fallback" : "ok", result.failed ?? null, c.clinic_id, Date.now() - started);
    return Response.json({ reply: result.reply || null, handoff: result.handoff, emergency: result.emergency, actions: result.actions, conversation_id: c.conversation_id });
  } catch (err) {
    console.error("[whatsapp] agent failed", errorText(err));
    await recordOps("agent", "error", errorText(err), c.clinic_id, Date.now() - started);
    // The patient can still book or change their visit themselves; the chat stays with the
    // assistant, which answers the next message once the error clears.
    const reply = await fallbackReply(c.clinic_id);
    await db.rpc("agent_reply", { p_conversation: c.conversation_id, p_body: reply });
    return Response.json({ reply, fallback: true, conversation_id: c.conversation_id });
  }
}
