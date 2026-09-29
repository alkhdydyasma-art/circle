"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasLocale } from "@/i18n";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendWhatsApp } from "@/lib/whatsapp";
import type { FormState } from "./clinic";

// WhatsApp assistant settings, knowledge base and the conversations inbox. Reads and
// status changes run as the signed-in user (RLS: managers configure, front desk answers).

const uuid = z.string().uuid();
const refresh = (fd: FormData, clinicId: string, page: string) => {
  const l = String(fd.get("lang") ?? "");
  revalidatePath(`/${hasLocale(l) ? l : "ar"}/portal/clinic/${clinicId}/${page}`);
};
const fail = (err: { code?: string } | null): FormState =>
  err?.code === "42501" ? { error: "denied" } : err?.code === "23514" || err?.code === "22023" ? { error: "invalid" } : err?.code === "23505" ? { error: "slug_taken" } : { error: "error" };

export async function saveAgentSettings(_: FormState, fd: FormData): Promise<FormState> {
  // The WhatsApp number field is only rendered for Circle staff (the database enforces it too).
  const withNumber = fd.has("whatsapp_phone_number_id");
  const p = z.object({
    clinicId: uuid,
    ai_agent_enabled: z.boolean(),
    whatsapp_phone_number_id: z.string().regex(/^\d{5,30}$/).nullable(),
    ai_agent_instructions: z.string().trim().max(2000),
  }).safeParse({
    clinicId: fd.get("clinicId"), ai_agent_enabled: fd.get("ai_agent_enabled") === "on",
    whatsapp_phone_number_id: String(fd.get("whatsapp_phone_number_id") ?? "").trim() || null,
    ai_agent_instructions: fd.get("ai_agent_instructions") ?? "",
  });
  if (!p.success) return { error: "invalid" };
  const { clinicId, whatsapp_phone_number_id, ...rest } = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.from("clinic_sites")
    .update(withNumber ? { ...rest, whatsapp_phone_number_id } : rest)
    .eq("clinic_id", clinicId).select("clinic_id");
  if (error) return fail(error);
  if (!data?.length) return { error: "denied" };
  refresh(fd, clinicId, "automation");
  return { ok: true };
}

export async function saveKnowledge(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({
    clinicId: uuid, id: uuid.optional(),
    title: z.string().trim().min(2).max(120), content: z.string().trim().min(2).max(3000),
  }).safeParse({ clinicId: fd.get("clinicId"), id: fd.get("id") || undefined, title: fd.get("title"), content: fd.get("content") });
  if (!p.success) return { error: "invalid" };
  const { clinicId, id, ...row } = p.data;
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("clinic_knowledge").update(row).eq("id", id).eq("clinic_id", clinicId).select("id")
    : await supabase.from("clinic_knowledge").insert({ ...row, clinic_id: clinicId }).select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "denied" };
  refresh(fd, clinicId, "automation");
  return { ok: true };
}

export async function deleteKnowledge(fd: FormData) {
  const p = z.object({ clinicId: uuid, id: uuid }).safeParse({ clinicId: fd.get("clinicId"), id: fd.get("id") });
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("clinic_knowledge").delete().eq("id", p.data.id).eq("clinic_id", p.data.clinicId);
  refresh(fd, p.data.clinicId, "automation");
}

// Clears the red emergency alert once a staff member has handled it.
export async function acknowledgeEmergency(fd: FormData) {
  const p = z.object({ clinicId: uuid, id: uuid }).safeParse({ clinicId: fd.get("clinicId"), id: fd.get("id") });
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("conversations").update({ emergency_ack_at: new Date().toISOString(), needs_attention: false })
    .eq("id", p.data.id).eq("clinic_id", p.data.clinicId);
  const l = String(fd.get("lang") ?? "");
  revalidatePath(`/${hasLocale(l) ? l : "ar"}/portal/clinic/${p.data.clinicId}`, "layout");
}

// Take over (staff answers), hand back to the assistant, or close.
export async function setConversationStatus(fd: FormData) {
  const p = z.object({ clinicId: uuid, id: uuid, status: z.enum(["ai", "human", "closed"]) })
    .safeParse({ clinicId: fd.get("clinicId"), id: fd.get("id"), status: fd.get("status") });
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("conversations")
    .update({ status: p.data.status, needs_attention: p.data.status === "human" ? true : false })
    .eq("id", p.data.id).eq("clinic_id", p.data.clinicId);
  refresh(fd, p.data.clinicId, "conversations");
}

// Staff reply: sent on WhatsApp through n8n, then recorded. Replying takes the chat over
// from the assistant so the two never answer at the same time.
export async function sendStaffReply(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({ clinicId: uuid, id: uuid, body: z.string().trim().min(1).max(4000) })
    .safeParse({ clinicId: fd.get("clinicId"), id: fd.get("id"), body: fd.get("body") });
  if (!p.success) return { error: "invalid" };
  const supabase = await createClient();
  // RLS: only the clinic's front desk can read this conversation.
  const { data: conv } = await supabase.from("conversations").select("id, patient_phone").eq("id", p.data.id).eq("clinic_id", p.data.clinicId).maybeSingle();
  if (!conv) return { error: "denied" };
  const { data: site } = await supabase.from("clinic_sites").select("whatsapp_phone_number_id").eq("clinic_id", p.data.clinicId).single();
  if (!site?.whatsapp_phone_number_id) return { error: "invalid" };
  try {
    await sendWhatsApp(site.whatsapp_phone_number_id, conv.patient_phone, p.data.body, p.data.clinicId);
  } catch (err) {
    console.error("[inbox] send failed", err instanceof Error ? err.message : err);
    return { error: "error" };
  }
  await createServiceClient().rpc("staff_reply", { p_conversation: conv.id, p_body: p.data.body });
  await supabase.from("conversations").update({ status: "human", needs_attention: false }).eq("id", conv.id);
  refresh(fd, p.data.clinicId, "conversations");
  return { ok: true };
}
