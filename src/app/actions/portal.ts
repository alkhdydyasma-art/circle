"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasLocale, type Locale } from "@/i18n";
import { createClient, createServiceClient, getUser } from "@/lib/supabase/server";
import { hashToken, newToken } from "@/lib/tokens";
import { allowAction } from "@/lib/rate-limit";

// Every action runs as the signed-in user, so Postgres RLS is the final authority on
// what they may read or change. Inputs are still validated here for clean errors.

export type ActionState = { ok?: boolean; error?: "denied" | "invalid" | "error" | "exists" | "wrong_account" | "rate_limited" | "mismatch" | "expired"; link?: string };

const roleEnum = z.enum(["owner", "manager", "doctor", "reception"]);
const uuid = z.string().uuid();

const langOf = (fd: FormData): Locale => {
  const l = String(fd.get("lang") ?? "");
  return hasLocale(l) ? l : "ar";
};

async function siteOrigin() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

// Postgres permission/RLS errors → "denied"; anything else → generic error.
const fail = (err: { code?: string } | null): ActionState =>
  err?.code === "42501" || err?.code === "23514" ? { error: "denied" } : { error: "error" };

// ─── Session ─────────────────────────────────────────────────────────────────
export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langOf(fd);
  const parsed = z
    .object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) })
    .safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { error: "invalid" };
  if (!(await allowAction("signIn"))) return { error: "rate_limited" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "invalid" };

  // Only allow redirects back into this site's portal (no open redirect).
  const next = String(fd.get("next") ?? "");
  redirect(next.startsWith(`/${lang}/portal`) || next.startsWith(`/${lang}/invite/`) ? next : `/${lang}/portal`);
}

// Always answers the same way whether or not the email exists (no account enumeration).
export async function requestPasswordReset(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langOf(fd);
  const email = z.string().trim().toLowerCase().email().safeParse(fd.get("email"));
  if (!email.success) return { error: "invalid" };
  if (!(await allowAction("reset"))) return { error: "rate_limited" };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/${lang}/reset-password`,
  });
  if (error) console.error("[auth] reset email failed", error.message);
  return { ok: true };
}

export async function updatePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8 || password.length > 200) return { error: "invalid" };
  if (password !== String(fd.get("confirm") ?? "")) return { error: "mismatch" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "expired" };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "error" };
  redirect(`/${langOf(fd)}/portal`);
}

export async function signOut(fd: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`/${langOf(fd)}/login`);
}

// ─── Invitations ─────────────────────────────────────────────────────────────
export async function acceptInvite(_: ActionState, fd: FormData): Promise<ActionState> {
  const lang = langOf(fd);
  const token = String(fd.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { error: "invalid" };
  if (!(await allowAction("invite"))) return { error: "rate_limited" };
  const tokenHash = hashToken(token);

  const supabase = await createClient();
  const { data: invite } = await supabase.rpc("peek_invitation", { p_token_hash: tokenHash }).maybeSingle<{
    email: string;
  }>();
  if (!invite) return { error: "invalid" };

  let user = await getUser();
  if (!user) {
    // New member: the valid token is the proof of invitation, so the account is
    // created pre-confirmed for exactly the invited email.
    const password = String(fd.get("password") ?? "");
    if (password.length < 8 || password.length > 200) return { error: "invalid" };

    const admin = createServiceClient();
    const { error: createError } = await admin.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    });
    if (createError) return { error: createError.status === 422 ? "exists" : "error" };

    const { data, error } = await supabase.auth.signInWithPassword({ email: invite.email, password });
    if (error) return { error: "error" };
    user = data.user;
  }

  if (user?.email?.toLowerCase() !== invite.email) return { error: "wrong_account" };

  const { data: clinicId, error } = await supabase.rpc("accept_invitation", { p_token_hash: tokenHash });
  if (error) return fail(error);
  redirect(`/${lang}/portal/clinic/${clinicId}`);
}

export async function inviteMember(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z
    .object({ clinicId: uuid, email: z.string().trim().toLowerCase().email().max(160), role: roleEnum })
    .safeParse({ clinicId: fd.get("clinicId"), email: fd.get("email"), role: fd.get("role") });
  if (!parsed.success) return { error: "invalid" };
  const user = await getUser();
  if (!user) return { error: "denied" };

  const token = newToken();
  const supabase = await createClient();
  const { error } = await supabase.from("clinic_invitations").insert({
    clinic_id: parsed.data.clinicId,
    email: parsed.data.email,
    role: parsed.data.role,
    token_hash: hashToken(token),
    invited_by: user.id,
  });
  if (error) return fail(error);

  revalidatePath(`/${langOf(fd)}/portal/clinic/${parsed.data.clinicId}`);
  return { ok: true, link: `${await siteOrigin()}/${langOf(fd)}/invite/${token}` };
}

export async function revokeInvite(fd: FormData) {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("clinic_invitations").delete().eq("id", id.data);
  revalidatePath(`/${langOf(fd)}/portal/clinic/${fd.get("clinicId")}`);
}

// ─── Team ────────────────────────────────────────────────────────────────────
export async function changeRole(fd: FormData) {
  const parsed = z
    .object({ clinicId: uuid, userId: uuid, role: roleEnum })
    .safeParse({ clinicId: fd.get("clinicId"), userId: fd.get("userId"), role: fd.get("role") });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase
    .from("clinic_members")
    .update({ role: parsed.data.role })
    .eq("clinic_id", parsed.data.clinicId)
    .eq("user_id", parsed.data.userId);
  revalidatePath(`/${langOf(fd)}/portal/clinic/${parsed.data.clinicId}`);
}

export async function removeMember(fd: FormData) {
  const parsed = z.object({ clinicId: uuid, userId: uuid }).safeParse({
    clinicId: fd.get("clinicId"),
    userId: fd.get("userId"),
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase
    .from("clinic_members")
    .delete()
    .eq("clinic_id", parsed.data.clinicId)
    .eq("user_id", parsed.data.userId);
  revalidatePath(`/${langOf(fd)}/portal/clinic/${parsed.data.clinicId}`);
}

// ─── Clinic ──────────────────────────────────────────────────────────────────
export async function updateClinic(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z
    .object({ id: uuid, name: z.string().trim().min(1).max(120), city: z.string().trim().min(1).max(80) })
    .safeParse({ id: fd.get("id"), name: fd.get("name"), city: fd.get("city") });
  if (!parsed.success) return { error: "invalid" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clinics")
    .update({ name: parsed.data.name, city: parsed.data.city })
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "denied" }; // filtered out by RLS
  revalidatePath(`/${langOf(fd)}/portal`, "layout");
  return { ok: true };
}

// ─── Circle staff ────────────────────────────────────────────────────────────
export async function updateLeadStatus(fd: FormData) {
  const parsed = z
    .object({ id: uuid, status: z.enum(["new", "contacted", "demo_scheduled", "won", "lost"]) })
    .safeParse({ id: fd.get("id"), status: fd.get("status") });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.from("leads").update({ status: parsed.data.status }).eq("id", parsed.data.id);
  revalidatePath(`/${langOf(fd)}/portal/admin`);
}

export async function activateLead(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z
    .object({
      leadId: uuid,
      ownerEmail: z.string().trim().toLowerCase().email().max(160),
    })
    .safeParse({ leadId: fd.get("leadId"), ownerEmail: fd.get("ownerEmail") });
  if (!parsed.success) return { error: "invalid" };

  const token = newToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_lead", {
    p_lead: parsed.data.leadId,
    p_owner_email: parsed.data.ownerEmail,
    p_token_hash: hashToken(token),
  });
  if (error) return fail(error);

  revalidatePath(`/${langOf(fd)}/portal/admin`);
  return { ok: true, link: `${await siteOrigin()}/${langOf(fd)}/invite/${token}` };
}

export async function updateClinicAdmin(fd: FormData) {
  const parsed = z
    .object({
      id: uuid,
      status: z.enum(["pending", "active", "suspended"]),
      plan: z.enum(["starter", "standard", "pro"]),
    })
    .safeParse({
      id: fd.get("id"),
      status: fd.get("status"),
      plan: fd.get("plan"),
    });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase
    .from("clinics")
    .update({
      status: parsed.data.status,
      plan: parsed.data.plan,
    })
    .eq("id", parsed.data.id);
  revalidatePath(`/${langOf(fd)}/portal`, "layout");
}
