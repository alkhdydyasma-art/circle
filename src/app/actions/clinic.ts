"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasLocale, type Locale } from "@/i18n";
import { normalizeSaudiMobile, SAUDI_MOBILE } from "@/lib/lead-schema";
import { createClient } from "@/lib/supabase/server";
import { zonedToUtc } from "@/lib/time";
import { TEMPLATES } from "@/templates/theme";
import { FONTS } from "@/templates/fonts";

// Clinic dashboard mutations. They run as the signed-in user: Postgres RLS decides what is
// allowed (a doctor can't edit services, reception can't read clinical notes, nobody can touch
// another clinic). Validation here only produces friendly errors.

export type FormState = { ok?: boolean; error?: "invalid" | "denied" | "overlap" | "slug_taken" | "error" };

const uuid = z.string().uuid();
const lang = (fd: FormData): Locale => {
  const l = String(fd.get("lang") ?? "");
  return hasLocale(l) ? l : "ar";
};
const opt = (v: FormDataEntryValue | null) => (v == null || String(v).trim() === "" ? undefined : String(v).trim());
const refresh = (fd: FormData, clinicId: string) => revalidatePath(`/${lang(fd)}/portal/clinic/${clinicId}`, "layout");

function fail(err: { code?: string } | null): FormState {
  switch (err?.code) {
    case "23P01": return { error: "overlap" };      // exclusion constraint: doctor double-booked
    case "23505": return { error: "slug_taken" };   // unique violation (only slug is user-facing)
    case "42501": return { error: "denied" };
    case "23514": case "22023": case "23502": return { error: "invalid" };
    default: return { error: "error" };
  }
}

async function siteTimezone(clinicId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("clinic_sites").select("timezone").eq("clinic_id", clinicId).single();
  return data?.timezone ?? "Asia/Riyadh";
}

// ─── Appointments ────────────────────────────────────────────────────────────
const STATUSES = ["pending", "confirmed", "completed", "cancelled", "no_show"] as const;

export async function setAppointmentStatus(fd: FormData) {
  const p = z.object({ id: uuid, clinicId: uuid, status: z.enum(STATUSES) })
    .safeParse({ id: fd.get("id"), clinicId: fd.get("clinicId"), status: fd.get("status") });
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.from("appointments").update({ status: p.data.status }).eq("id", p.data.id);
  refresh(fd, p.data.clinicId);
}

export async function createAppointment(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({
    clinicId: uuid, serviceId: uuid, doctorId: uuid, branchId: uuid,
    name: z.string().trim().min(2).max(120),
    phone: z.string().transform((v) => v.replace(/[\s-]/g, "")).refine((v) => SAUDI_MOBILE.test(v)).transform(normalizeSaudiMobile),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^\d{2}:\d{2}$/),
    notes: z.string().trim().max(1000).optional(),
  }).safeParse({
    clinicId: fd.get("clinicId"), serviceId: fd.get("serviceId"), doctorId: fd.get("doctorId"), branchId: fd.get("branchId"),
    name: fd.get("name"), phone: fd.get("phone"), date: fd.get("date"), time: fd.get("time"), notes: opt(fd.get("notes")),
  });
  if (!p.success) return { error: "invalid" };
  const d = p.data;
  const supabase = await createClient();

  // Reuse the patient by phone within this clinic, or create them.
  let { data: patient } = await supabase.from("patients").select("id").eq("clinic_id", d.clinicId).eq("phone", d.phone).maybeSingle();
  if (!patient) {
    const res = await supabase.from("patients").insert({ clinic_id: d.clinicId, full_name: d.name, phone: d.phone, source: "dashboard" }).select("id").single();
    if (res.error) return fail(res.error);
    patient = res.data;
  }

  const { data: service } = await supabase.from("services").select("duration_minutes").eq("id", d.serviceId).single();
  if (!service) return { error: "invalid" };
  const startsAt = zonedToUtc(d.date, d.time, await siteTimezone(d.clinicId));
  const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60_000);

  const { error } = await supabase.from("appointments").insert({
    clinic_id: d.clinicId, branch_id: d.branchId, doctor_id: d.doctorId, service_id: d.serviceId, patient_id: patient.id,
    starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), status: "confirmed", source: "dashboard", notes: d.notes ?? null,
  });
  if (error) return fail(error);
  refresh(fd, d.clinicId);
  return { ok: true };
}

// ─── Patients ────────────────────────────────────────────────────────────────
export async function updatePatient(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({
    id: uuid, clinicId: uuid,
    full_name: z.string().trim().min(2).max(120),
    phone: z.string().transform((v) => v.replace(/[\s-]/g, "")).refine((v) => SAUDI_MOBILE.test(v)).transform(normalizeSaudiMobile),
    email: z.union([z.literal(""), z.string().trim().email().max(160)]).optional(),
    gender: z.enum(["male", "female"]).optional(),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notes: z.string().trim().max(2000).optional(),
  }).safeParse({
    id: fd.get("id"), clinicId: fd.get("clinicId"), full_name: fd.get("full_name"), phone: fd.get("phone"),
    email: opt(fd.get("email")), gender: opt(fd.get("gender")), birth_date: opt(fd.get("birth_date")), notes: opt(fd.get("notes")),
  });
  if (!p.success) return { error: "invalid" };
  const { id, clinicId, ...fields } = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.from("patients")
    .update({ ...fields, email: fields.email || null, gender: fields.gender ?? null, birth_date: fields.birth_date ?? null, notes: fields.notes ?? null })
    .eq("id", id).select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "denied" };
  refresh(fd, clinicId);
  return { ok: true };
}

export async function saveClinical(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({
    patientId: uuid, clinicId: uuid,
    medical_history: z.string().trim().max(5000).optional(),
    allergies: z.string().trim().max(1000).optional(),
  }).safeParse({ patientId: fd.get("patientId"), clinicId: fd.get("clinicId"), medical_history: opt(fd.get("medical_history")), allergies: opt(fd.get("allergies")) });
  if (!p.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("patient_clinical").upsert({
    patient_id: p.data.patientId, clinic_id: p.data.clinicId,
    medical_history: p.data.medical_history ?? null, allergies: p.data.allergies ?? null,
    updated_by: user?.id ?? null, updated_at: new Date().toISOString(),
  });
  if (error) return fail(error);
  refresh(fd, p.data.clinicId);
  return { ok: true };
}

// ─── Services ────────────────────────────────────────────────────────────────
export async function saveService(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({
    id: uuid.optional(), clinicId: uuid,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(600).optional(),
    duration_minutes: z.coerce.number().int().min(5).max(480),
    price: z.coerce.number().min(0).max(1_000_000).optional(),
    is_active: z.boolean(),
  }).safeParse({
    id: opt(fd.get("id")), clinicId: fd.get("clinicId"), name: fd.get("name"), description: opt(fd.get("description")),
    duration_minutes: fd.get("duration_minutes"), price: opt(fd.get("price")), is_active: fd.get("is_active") === "on",
  });
  if (!p.success) return { error: "invalid" };
  const { id, clinicId, ...f } = p.data;
  const row = { ...f, description: f.description ?? null, price: f.price ?? null };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("services").update(row).eq("id", id)
    : await supabase.from("services").insert({ ...row, clinic_id: clinicId });
  if (error) return fail(error);
  refresh(fd, clinicId);
  return { ok: true };
}

export async function deleteService(fd: FormData) {
  const p = z.object({ id: uuid, clinicId: uuid }).safeParse({ id: fd.get("id"), clinicId: fd.get("clinicId") });
  if (!p.success) return;
  const supabase = await createClient();
  const { error } = await supabase.from("services").delete().eq("id", p.data.id);
  // Services with booking history can't be deleted; hide them from booking instead.
  if (error?.code === "23503") await supabase.from("services").update({ is_active: false }).eq("id", p.data.id);
  refresh(fd, p.data.clinicId);
}

// ─── Doctors, hours, branches ────────────────────────────────────────────────
export async function saveDoctor(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({
    id: uuid.optional(), clinicId: uuid,
    full_name: z.string().trim().min(2).max(120),
    title: z.string().trim().max(80).optional(),
    specialty: z.string().trim().max(120).optional(),
    bio: z.string().trim().max(1000).optional(),
    photo_url: z.string().trim().url().startsWith("https://").max(500).optional(),
    user_id: uuid.optional(),
    is_active: z.boolean(),
    services: z.array(uuid),
  }).safeParse({
    id: opt(fd.get("id")), clinicId: fd.get("clinicId"), full_name: fd.get("full_name"), title: opt(fd.get("title")),
    specialty: opt(fd.get("specialty")), bio: opt(fd.get("bio")), photo_url: opt(fd.get("photo_url")), user_id: opt(fd.get("user_id")),
    is_active: fd.get("is_active") === "on", services: fd.getAll("services").map(String),
  });
  if (!p.success) return { error: "invalid" };
  const { id, clinicId, services, ...f } = p.data;
  const row = { ...f, title: f.title ?? null, specialty: f.specialty ?? null, bio: f.bio ?? null, photo_url: f.photo_url ?? null, user_id: f.user_id ?? null };
  const supabase = await createClient();

  let doctorId = id;
  if (id) {
    const { error } = await supabase.from("doctors").update(row).eq("id", id);
    if (error) return fail(error);
  } else {
    const { data, error } = await supabase.from("doctors").insert({ ...row, clinic_id: clinicId }).select("id").single();
    if (error) return fail(error);
    doctorId = data.id;
  }

  // Replace the doctor's service list.
  const del = await supabase.from("doctor_services").delete().eq("doctor_id", doctorId!);
  if (del.error) return fail(del.error);
  if (services.length) {
    const ins = await supabase.from("doctor_services").insert(services.map((s) => ({ clinic_id: clinicId, doctor_id: doctorId, service_id: s })));
    if (ins.error) return fail(ins.error);
  }
  refresh(fd, clinicId);
  return { ok: true };
}

export async function saveHours(_: FormState, fd: FormData): Promise<FormState> {
  const clinicId = uuid.safeParse(fd.get("clinicId"));
  const doctorId = uuid.safeParse(fd.get("doctorId"));
  if (!clinicId.success || !doctorId.success) return { error: "invalid" };
  const weekdays = fd.getAll("weekday"), branches = fd.getAll("branch"), starts = fd.getAll("start"), ends = fd.getAll("end");
  const rows = z.array(z.object({
    clinic_id: uuid, doctor_id: uuid, branch_id: uuid,
    weekday: z.coerce.number().int().min(0).max(6),
    start_time: z.string().regex(/^\d{2}:\d{2}$/), end_time: z.string().regex(/^\d{2}:\d{2}$/),
  }).refine((r) => r.end_time > r.start_time)).safeParse(
    weekdays.map((w, i) => ({ clinic_id: clinicId.data, doctor_id: doctorId.data, branch_id: branches[i], weekday: w, start_time: starts[i], end_time: ends[i] })),
  );
  if (!rows.success) return { error: "invalid" };

  const supabase = await createClient();
  const del = await supabase.from("working_hours").delete().eq("doctor_id", doctorId.data);
  if (del.error) return fail(del.error);
  if (rows.data.length) {
    const { error } = await supabase.from("working_hours").insert(rows.data);
    if (error) return fail(error);
  }
  refresh(fd, clinicId.data);
  return { ok: true };
}

export async function saveBranch(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({
    id: uuid.optional(), clinicId: uuid,
    name: z.string().trim().min(1).max(120),
    city: z.string().trim().max(80).optional(),
    address: z.string().trim().max(300).optional(),
    phone: z.string().trim().max(30).optional(),
    maps_url: z.string().trim().url().startsWith("https://").max(500).optional(),
    is_active: z.boolean(),
  }).safeParse({
    id: opt(fd.get("id")), clinicId: fd.get("clinicId"), name: fd.get("name"), city: opt(fd.get("city")), address: opt(fd.get("address")),
    phone: opt(fd.get("phone")), maps_url: opt(fd.get("maps_url")), is_active: fd.get("is_active") === "on",
  });
  if (!p.success) return { error: "invalid" };
  const { id, clinicId, ...f } = p.data;
  const row = { ...f, city: f.city ?? null, address: f.address ?? null, phone: f.phone ?? null, maps_url: f.maps_url ?? null };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("branches").update(row).eq("id", id) : await supabase.from("branches").insert({ ...row, clinic_id: clinicId });
  if (error) return fail(error);
  refresh(fd, clinicId);
  return { ok: true };
}

// ─── Website ─────────────────────────────────────────────────────────────────
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const https = z.string().trim().url().startsWith("https://").max(500);

export async function saveSite(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({
    clinicId: uuid,
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](-?[a-z0-9])*$/).min(3).max(40),
    template: z.enum(TEMPLATES),
    primary: hex, accent: hex,
    font: z.enum(Object.keys(FONTS) as [keyof typeof FONTS, ...(keyof typeof FONTS)[]]),
    logo_url: https.optional(), hero_image_url: https.optional(),
    tagline: z.string().trim().max(160).optional(),
    about: z.string().trim().max(1200).optional(),
    sections: z.object({ services: z.boolean(), doctors: z.boolean(), branches: z.boolean() }),
    phone: z.string().trim().max(30).optional(),
    whatsapp: z.string().transform((v) => v.replace(/[\s-]/g, "")).refine((v) => SAUDI_MOBILE.test(v)).transform(normalizeSaudiMobile).optional(),
    email: z.string().trim().email().max(160).optional(),
    slot_minutes: z.coerce.number().refine((n) => [10, 15, 20, 30, 60].includes(n)),
    booking_days_ahead: z.coerce.number().int().min(1).max(180),
    min_notice_minutes: z.coerce.number().int().min(0).max(10080),
  }).safeParse({
    clinicId: fd.get("clinicId"), slug: fd.get("slug"), template: fd.get("template"),
    primary: fd.get("primary"), accent: fd.get("accent"), font: fd.get("font"),
    logo_url: opt(fd.get("logo_url")), hero_image_url: opt(fd.get("hero_image_url")),
    tagline: opt(fd.get("tagline")), about: opt(fd.get("about")),
    sections: { services: fd.get("s_services") === "on", doctors: fd.get("s_doctors") === "on", branches: fd.get("s_branches") === "on" },
    phone: opt(fd.get("phone")), whatsapp: opt(fd.get("whatsapp")), email: opt(fd.get("email")),
    slot_minutes: fd.get("slot_minutes"), booking_days_ahead: fd.get("booking_days_ahead"), min_notice_minutes: fd.get("min_notice_minutes"),
  });
  if (!p.success) return { error: "invalid" };
  const d = p.data;
  const supabase = await createClient();
  const { data: before } = await supabase.from("clinic_sites").select("slug").eq("clinic_id", d.clinicId).single();
  const { data, error } = await supabase.from("clinic_sites").update({
    slug: d.slug, template: d.template,
    brand: { primary: d.primary, accent: d.accent, font: d.font, ...(d.logo_url && { logo_url: d.logo_url }), ...(d.hero_image_url && { hero_image_url: d.hero_image_url }) },
    content: { ...(d.tagline && { tagline: d.tagline }), ...(d.about && { about: d.about }), sections: d.sections },
    phone: d.phone ?? null, whatsapp: d.whatsapp ?? null, email: d.email ?? null,
    slot_minutes: d.slot_minutes, booking_days_ahead: d.booking_days_ahead, min_notice_minutes: d.min_notice_minutes,
  }).eq("clinic_id", d.clinicId).select("clinic_id");
  if (error) return fail(error);
  if (!data?.length) return { error: "denied" };
  for (const l of ["ar", "en"]) for (const s of new Set([before?.slug, d.slug])) if (s) revalidatePath(`/${l}/c/${s}`);
  refresh(fd, d.clinicId);
  return { ok: true };
}

export async function setPublished(fd: FormData) {
  const p = z.object({ clinicId: uuid, published: z.enum(["true", "false"]) }).safeParse({ clinicId: fd.get("clinicId"), published: fd.get("published") });
  if (!p.success) return;
  const supabase = await createClient();
  const { data } = await supabase.from("clinic_sites").update({ published: p.data.published === "true" }).eq("clinic_id", p.data.clinicId).select("slug").single();
  if (data) for (const l of ["ar", "en"]) revalidatePath(`/${l}/c/${data.slug}`);
  refresh(fd, p.data.clinicId);
}
