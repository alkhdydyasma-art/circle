import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { recordOps } from "@/lib/ops";
import { emergencyReply } from "@/lib/emergency";

// The clinic's WhatsApp assistant. One call handles one inbound patient message:
//   1. retrieval: the clinic's services, prices, doctors, hours, branches and knowledge base
//      are loaded fresh from the database into the (cached) system prompt;
//   2. a tool loop lets Claude look up the patient's appointments, search open times,
//      book, reschedule, cancel or confirm, or hand the chat to a human;
//   3. the final text is returned for n8n to send on WhatsApp.
// Every tool runs a database function scoped to this clinic AND the sender's phone, so the
// model can only ever act for the person it is talking to.

// Cost policy: routine WhatsApp chats run on the lightweight Haiku model. A heavier model can
// be set with AGENT_MODEL (e.g. claude-sonnet-5); effort and server-side refusal fallback are
// only sent to the models that use them.
const MODEL = process.env.AGENT_MODEL || "claude-haiku-4-5";
const LIGHT = MODEL.startsWith("claude-haiku");
const EFFORT = (process.env.AGENT_EFFORT || "low") as "low" | "medium" | "high";
// Hard caps per patient message: model calls, output tokens and conversation history.
const MAX_STEPS = 5;
const MAX_TOKENS = LIGHT ? 1024 : 4096;
const HISTORY = 12;

type Ctx = {
  clinic: { name: string; city: string | null; phone: string | null; whatsapp: string | null; timezone: string; about: string | null; website: string };
  rules: { booking_days_ahead: number; min_notice_minutes: number; reschedule_cutoff_hours: number };
  instructions: string;
  services: { id: string; name: string; description: string | null; duration_minutes: number; price: number | null }[];
  doctors: { id: string; name: string; title: string | null; specialty: string | null; service_ids: string[]; hours: { weekday: number; branch_id: string; start: string; end: string }[] }[];
  branches: { id: string; name: string; address: string | null; maps_url: string | null }[];
  knowledge: { title: string; content: string }[];
};

/** `failed` explains why the assistant fell back to a safe reply (recorded as an incident). */
export type AgentResult = { reply: string; handoff: boolean; actions: string[]; failed?: string; emergency?: boolean };

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const INPUTS = {
  find_my_appointments: z.object({}),
  find_available_times: z.object({
    service_id: uuid.optional(), appointment_id: uuid.optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.number().int().min(1).max(7).optional(),
    doctor_id: uuid.optional(), branch_id: uuid.optional(),
  }).refine((v) => v.service_id || v.appointment_id, "service_id or appointment_id is required"),
  book_appointment: z.object({
    service_id: uuid, doctor_id: uuid, branch_id: uuid, starts_at: iso,
    patient_name: z.string().trim().min(2).max(120), notes: z.string().max(300).optional(),
  }),
  reschedule_appointment: z.object({ appointment_id: uuid, starts_at: iso, doctor_id: uuid.optional(), branch_id: uuid.optional() }),
  cancel_appointment: z.object({ appointment_id: uuid }),
  confirm_appointment: z.object({ appointment_id: uuid }),
  request_human: z.object({ reason: z.string().min(2).max(300) }),
  report_emergency: z.object({ reason: z.string().min(2).max(300) }),
} as const;
type ToolName = keyof typeof INPUTS;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "find_my_appointments",
    description: "List the upcoming (pending or confirmed) appointments of the patient you are chatting with. Call this before changing, cancelling or confirming anything.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "find_available_times",
    description: "Search open appointment times. For a new booking pass service_id; to reschedule pass appointment_id (its service is used and its current slot doesn't block the search). Searches `days` days starting at `date` (clinic local date YYYY-MM-DD). Optionally limit to a doctor or branch. Only offer times returned by this tool.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "Service id from the clinic data" },
        appointment_id: { type: "string", description: "For rescheduling: the appointment id" },
        date: { type: "string", description: "First day to search, YYYY-MM-DD in clinic time" },
        days: { type: "integer", description: "How many days to search (1-7, default 3)" },
        doctor_id: { type: "string" },
        branch_id: { type: "string" },
      },
      required: ["date"],
      additionalProperties: false,
    },
  },
  {
    name: "book_appointment",
    description: "Book a new appointment for this patient. Use exactly the doctor_id, branch_id and starts_at of a time returned by find_available_times, and only after the patient clearly agreed to that time.",
    input_schema: {
      type: "object",
      properties: {
        service_id: { type: "string" }, doctor_id: { type: "string" }, branch_id: { type: "string" },
        starts_at: { type: "string", description: "starts_at exactly as returned by find_available_times" },
        patient_name: { type: "string", description: "Patient's full name as they gave it" },
        notes: { type: "string" },
      },
      required: ["service_id", "doctor_id", "branch_id", "starts_at", "patient_name"],
      additionalProperties: false,
    },
  },
  {
    name: "reschedule_appointment",
    description: "Move one of the patient's appointments to a new time returned by find_available_times (with appointment_id), after the patient agreed.",
    input_schema: {
      type: "object",
      properties: { appointment_id: { type: "string" }, starts_at: { type: "string" }, doctor_id: { type: "string" }, branch_id: { type: "string" } },
      required: ["appointment_id", "starts_at"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_appointment",
    description: "Cancel one of the patient's appointments, only after they explicitly confirmed they want to cancel it.",
    input_schema: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"], additionalProperties: false },
  },
  {
    name: "confirm_appointment",
    description: "Mark one of the patient's appointments as confirmed when they say they will attend.",
    input_schema: { type: "object", properties: { appointment_id: { type: "string" } }, required: ["appointment_id"], additionalProperties: false },
  },
  {
    name: "report_emergency",
    description: "Call IMMEDIATELY, instead of replying, when the patient describes a possible medical emergency or severe symptoms: difficulty breathing or swallowing, swelling spreading to the face, eye or neck, bleeding that won't stop, facial trauma or a knocked-out tooth, fainting, high fever with swelling, or anything that sounds urgent and beyond routine dental care. The system then sends the patient emergency instructions (997) and alerts the clinic; you will not reply.",
    input_schema: { type: "object", properties: { reason: { type: "string", description: "The symptoms described, in a few words" } }, required: ["reason"], additionalProperties: false },
  },
  {
    name: "request_human",
    description: "Hand the conversation to the clinic staff: complaints, billing or insurance disputes, medical questions, anything you can't do with your tools, or when the patient asks for a person. Tell the patient a team member will reply.",
    input_schema: { type: "object", properties: { reason: { type: "string", description: "Short reason for the staff" } }, required: ["reason"], additionalProperties: false },
  },
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function systemPrompt(ctx: Ctx) {
  const data = {
    clinic: ctx.clinic,
    booking_rules: ctx.rules,
    services: ctx.services,
    doctors: ctx.doctors.map((d) => ({ ...d, hours: d.hours.map((h) => ({ ...h, weekday: WEEKDAYS[h.weekday] })) })),
    branches: ctx.branches,
  };
  return `You are the WhatsApp assistant of ${ctx.clinic.name}, a dental clinic in Saudi Arabia. You help patients book, reschedule, confirm or cancel appointments and answer questions about the clinic.

How to talk:
- Reply in the patient's language. For Arabic, use warm, simple Saudi-friendly Arabic. Keep messages short, like a helpful receptionist on WhatsApp: a few lines, no markdown headings or tables. Use at most a couple of emojis.
- When offering times, give at most 5 options as a short numbered list with day, date and time (clinic local time) and the doctor.

How to work:
- Facts about the clinic (services, prices, doctors, hours, branches, policies) come only from the clinic data and knowledge base below. If something isn't there, say you'll check with the team and use request_human; never invent prices, doctors, times or policies.
- Times: always search with find_available_times and offer only what it returns. Before booking, rescheduling or cancelling, restate the exact choice (service, doctor, day, time, branch) and get a clear yes. After the tool succeeds, confirm the result in one short message. Bookings and changes are normally confirmed instantly (status "confirmed"): tell the patient their appointment is confirmed. Only if the status is "pending" say the clinic will confirm it.
- For a new booking you need the patient's full name; ask for it if you don't have it.
- You can only see and change the appointments of the person writing to you. Never discuss anyone else's appointments.
- No diagnosis or medical advice. If the patient describes severe symptoms or a possible emergency, call report_emergency right away and do not write a reply yourself. For other medical questions, use request_human.
- If the patient sends a voice note, image or file (shown as [voice], [image], [document]), ask them kindly to write their request as text.
- Changes are allowed up to ${ctx.rules.reschedule_cutoff_hours} hours before the appointment; closer than that, use request_human.

Clinic data (JSON):
${JSON.stringify(data)}

Knowledge base from the clinic:
${ctx.knowledge.length ? ctx.knowledge.map((k) => `## ${k.title}\n${k.content}`).join("\n\n") : "(empty)"}
${ctx.instructions ? `\nClinic's own instructions (follow them unless they conflict with the rules above):\n${ctx.instructions}` : ""}`;
}

function localLabel(isoTime: string, tz: string) {
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(isoTime));
}

const ERROR_HINTS: Record<string, string> = {
  slot_unavailable: "That time is no longer available. Search again and offer other times.",
  too_late_to_change: "Too close to the appointment (or already closed) to change it online. Offer to connect them with the clinic (request_human).",
  too_many_bookings: "This patient already has several upcoming bookings. Offer to change an existing one or connect them with the clinic.",
  invalid_name: "Ask for the patient's full name.",
  appointment_not_found: "No such appointment for this patient. Call find_my_appointments.",
};

export async function runAgent(input: { clinicId: string; conversationId: string; phone: string }): Promise<AgentResult> {
  const db = createServiceClient();
  const [{ data: ctx, error: ctxErr }, { data: history, error: histErr }] = await Promise.all([
    db.rpc("agent_context", { p_clinic: input.clinicId }),
    db.rpc("agent_history", { p_conversation: input.conversationId, p_limit: HISTORY }),
  ]);
  if (ctxErr || histErr || !ctx) throw new Error(`agent context: ${ctxErr?.message ?? histErr?.message}`);
  const c = ctx as Ctx;
  const tz = c.clinic.timezone;
  const actions: string[] = [];
  let handoff = false;

  // Conversation so far: patient → user, agent/staff → assistant (must start with the patient).
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of history as { role: string; body: string }[]) {
    const role = m.role === "patient" ? "user" : "assistant";
    if (!messages.length && role === "assistant") continue;
    messages.push({ role, content: m.body });
  }
  if (!messages.length) return { reply: "", handoff: false, actions };

  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const nowLine = `Now: ${WEEKDAYS[new Date(`${today}T12:00:00Z`).getUTCDay()]} ${today}, ${new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(now)} (${tz}). Patient's WhatsApp number: ${input.phone}.`;

  async function run(name: ToolName, raw: unknown): Promise<unknown> {
    const parsed = INPUTS[name].safeParse(raw);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      await recordOps("agent", "error", `invalid ${name} input: ${details.join("; ")}`, input.clinicId);
      return { error: "invalid_input", details };
    }
    const a = parsed.data as Record<string, string | number | undefined>;
    const call = async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await db.rpc(fn, args);
      if (error) {
        const code = Object.keys(ERROR_HINTS).find((k) => error.message.includes(k)) ?? "error";
        // Business outcomes (slot taken, too late…) are normal; anything else is a bug to fix.
        if (code === "error") await recordOps("booking", "error", `${fn}: ${error.message}`, input.clinicId);
        return { error: code, hint: ERROR_HINTS[code] ?? "Something went wrong. Apologise and offer to connect them with the clinic." };
      }
      return data;
    };
    const view = (v: unknown) => {
      const x = v as { id: string; starts_at: string; status: string; service: string; doctor: string; branch: string; can_change: boolean };
      return x && typeof x === "object" && "starts_at" in x
        ? { id: x.id, when: localLabel(x.starts_at, tz), status: x.status, service: x.service, doctor: x.doctor, branch: x.branch, can_change: x.can_change }
        : x;
    };
    switch (name) {
      case "find_my_appointments": {
        const r = await call("agent_find_appointments", { p_clinic: input.clinicId, p_phone: input.phone });
        return Array.isArray(r) ? r.map(view) : r;
      }
      case "find_available_times": {
        const r = await call("agent_slots", {
          p_clinic: input.clinicId, p_phone: input.phone, p_service: a.service_id ?? null, p_from: a.date,
          p_days: a.days ?? 3, p_doctor: a.doctor_id ?? null, p_branch: a.branch_id ?? null, p_appt: a.appointment_id ?? null,
        });
        if (!Array.isArray(r)) return r;
        const doctor = (id: string) => c.doctors.find((d) => d.id === id)?.name;
        const branch = (id: string) => c.branches.find((b) => b.id === id)?.name;
        const slots = (r as { doctor_id: string; branch_id: string; starts_at: string }[]).slice(0, 15)
          .map((s) => ({ starts_at: s.starts_at, local: localLabel(s.starts_at, tz), doctor_id: s.doctor_id, doctor: doctor(s.doctor_id), branch_id: s.branch_id, branch: branch(s.branch_id) }));
        return slots.length ? { slots, more: r.length > slots.length } : { slots: [], note: "No open times in this range. Try later dates or another doctor." };
      }
      case "book_appointment": {
        const r = await call("agent_book", {
          p_clinic: input.clinicId, p_phone: input.phone, p_full_name: a.patient_name, p_service: a.service_id,
          p_doctor: a.doctor_id, p_branch: a.branch_id, p_starts_at: a.starts_at, p_notes: a.notes ?? null,
        }) as { id?: string; starts_at?: string; status?: string; service?: string; doctor?: string; branch?: string; error?: string };
        if (r.id) actions.push(`booked:${r.id}`);
        return r.id ? { booked: true, id: r.id, status: r.status, when: localLabel(r.starts_at!, tz), service: r.service, doctor: r.doctor, branch: r.branch } : r;
      }
      case "reschedule_appointment": {
        const r = await call("agent_reschedule", {
          p_clinic: input.clinicId, p_phone: input.phone, p_appt: a.appointment_id, p_starts_at: a.starts_at,
          p_doctor: a.doctor_id ?? null, p_branch: a.branch_id ?? null,
        });
        if (r && typeof r === "object" && "id" in r) actions.push(`rescheduled:${a.appointment_id}`);
        return view(r);
      }
      case "cancel_appointment": {
        const r = await call("agent_cancel", { p_clinic: input.clinicId, p_phone: input.phone, p_appt: a.appointment_id });
        if (r && typeof r === "object" && "id" in r) actions.push(`cancelled:${a.appointment_id}`);
        return view(r);
      }
      case "confirm_appointment": {
        const r = await call("agent_confirm", { p_clinic: input.clinicId, p_phone: input.phone, p_appt: a.appointment_id });
        if (r && typeof r === "object" && "id" in r) actions.push(`confirmed:${a.appointment_id}`);
        return view(r);
      }
      case "report_emergency": {
        emergency = true;
        await db.rpc("agent_emergency", { p_conversation: input.conversationId, p_reason: String(a.reason) });
        actions.push("emergency");
        return { ok: true };
      }
      case "request_human": {
        handoff = true;
        await db.rpc("agent_handoff", { p_conversation: input.conversationId, p_reason: String(a.reason) });
        actions.push("handoff");
        return { ok: true, note: "Staff notified. Tell the patient a team member will reply here soon." };
      }
    }
  }

  // Transient API errors (overload, rate limit, network) are retried by the SDK with backoff.
  const anthropic = new Anthropic({ maxRetries: 3, timeout: 40_000 });
  let failed: string | undefined;
  let emergency = false;
  let reply = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      ...(!LIGHT && {
        output_config: { effort: EFFORT },
        // Server-side fallback: if a safety classifier declines, the API retries on a suitable model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default" as const,
      }),
      // Stable prefix (tools + clinic prompt) is cached; the clock line changes every call.
      system: [
        { type: "text", text: systemPrompt(c), cache_control: { type: "ephemeral" } },
        { type: "text", text: nowLine },
      ],
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === "refusal") {
      handoff = true;
      await db.rpc("agent_handoff", { p_conversation: input.conversationId, p_reason: "Assistant declined this request" });
      reply = "شكراً لتواصلك 🌿 بيرد عليك أحد من فريق العيادة هنا قريباً.";
      failed = "model declined the request (refusal)";
      break;
    }
    const text = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !calls.length) {
      reply = text;
      break;
    }
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const out = call.name in INPUTS
        ? await run(call.name as ToolName, call.input)
        : (await recordOps("agent", "error", `unknown tool ${call.name}`, input.clinicId), { error: "unknown_tool" });
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out), is_error: !!(out as { error?: string })?.error });
    }
    messages.push({ role: "user", content: results });
    // Emergency: stop the normal conversation and send the fixed safety message.
    if (emergency) {
      handoff = true;
      reply = emergencyReply(c.clinic.phone);
      break;
    }
  }

  if (!reply) {
    handoff = true;
    failed = `no reply after ${MAX_STEPS} steps`;
    await db.rpc("agent_handoff", { p_conversation: input.conversationId, p_reason: "Assistant could not finish" });
    reply = "المعذرة، بيتواصل معك أحد من فريق العيادة هنا قريباً 🌿";
  }
  return { reply, handoff, actions, failed, emergency };
}
