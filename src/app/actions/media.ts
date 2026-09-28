"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasLocale } from "@/i18n";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { newToken } from "@/lib/tokens";
import { MAX_CASES, MEDIA_BUCKET, MAX_IMAGE_BYTES } from "@/lib/media";

// Clinic images. The browser sends the file to this action; the action checks the user may
// manage the clinic, identifies the file from its bytes (never trusting its name or type),
// and stores it with the service key under "<clinic id>/…". The URL is then saved through
// the user's own client, so Postgres RLS still decides what they may change.

export type MediaState = { ok?: boolean; error?: "invalid" | "too_big" | "type" | "denied" | "error" };

const uuid = z.string().uuid();
const KINDS = ["logo", "hero", "doctor", "case"] as const;

type Sniffed = { ext: "png" | "jpg" | "webp"; type: string };
function sniff(bytes: Uint8Array): Sniffed | null {
  const at = (i: number, sig: number[]) => sig.every((b, j) => bytes[i + j] === b);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", type: "image/png" };
  if (at(0, [0xff, 0xd8, 0xff])) return { ext: "jpg", type: "image/jpeg" };
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return { ext: "webp", type: "image/webp" };
  return null;
}

async function readImage(v: FormDataEntryValue | null): Promise<{ bytes: Uint8Array; kind: Sniffed } | "missing" | MediaState["error"]> {
  if (!(v instanceof File) || v.size === 0) return "missing";
  if (v.size > MAX_IMAGE_BYTES) return "too_big";
  const bytes = new Uint8Array(await v.arrayBuffer());
  const kind = sniff(bytes);
  return kind ? { bytes, kind } : "type";
}

async function store(clinicId: string, name: string, img: { bytes: Uint8Array; kind: Sniffed }) {
  const path = `${clinicId}/${name}-${newToken().slice(0, 16)}.${img.kind.ext}`;
  const storage = createServiceClient().storage.from(MEDIA_BUCKET);
  const { error } = await storage.upload(path, img.bytes, { contentType: img.kind.type, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return storage.getPublicUrl(path).data.publicUrl;
}

// Deletes a file we stored for this clinic (ignores demo images and foreign URLs).
async function discard(clinicId: string, url: unknown) {
  if (typeof url !== "string") return;
  const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return;
  const path = url.slice(i + marker.length);
  if (!path.startsWith(`${clinicId}/`)) return;
  await createServiceClient().storage.from(MEDIA_BUCKET).remove([path]);
}

function refresh(fd: FormData, clinicId: string, slug?: string) {
  const l = String(fd.get("lang") ?? "");
  revalidatePath(`/${hasLocale(l) ? l : "ar"}/portal/clinic/${clinicId}`, "layout");
  if (slug) for (const lang of ["ar", "en"]) revalidatePath(`/${lang}/c/${slug}`);
}

type Site = { slug: string; brand: Record<string, unknown>; content: Record<string, unknown> };

export async function uploadMedia(_: MediaState, fd: FormData): Promise<MediaState> {
  const p = z.object({
    clinicId: uuid,
    kind: z.enum(KINDS),
    doctorId: uuid.optional(),
    title: z.string().trim().max(120).optional(),
  }).safeParse({
    clinicId: fd.get("clinicId"), kind: fd.get("kind"),
    doctorId: fd.get("doctorId") || undefined, title: fd.get("title") || undefined,
  });
  if (!p.success) return { error: "invalid" };
  const { clinicId, kind } = p.data;

  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_manage_clinic", { p_clinic: clinicId });
  if (!allowed) return { error: "denied" };

  try {
    if (kind === "doctor") {
      if (!p.data.doctorId) return { error: "invalid" };
      const img = await readImage(fd.get("file"));
      if (typeof img !== "object") return { error: img === "missing" ? "invalid" : img };
      const { data: doc } = await supabase.from("doctors").select("photo_url").eq("id", p.data.doctorId).eq("clinic_id", clinicId).maybeSingle();
      if (!doc) return { error: "denied" };
      const url = await store(clinicId, "doctor", img);
      const { error } = await supabase.from("doctors").update({ photo_url: url }).eq("id", p.data.doctorId).eq("clinic_id", clinicId);
      if (error) { await discard(clinicId, url); return { error: "error" }; }
      await discard(clinicId, doc.photo_url);
      const { data: s } = await supabase.from("clinic_sites").select("slug").eq("clinic_id", clinicId).single();
      refresh(fd, clinicId, s?.slug);
      return { ok: true };
    }

    const { data: site } = await supabase.from("clinic_sites").select("slug, brand, content").eq("clinic_id", clinicId).single<Site>();
    if (!site) return { error: "denied" };

    if (kind === "logo" || kind === "hero") {
      const img = await readImage(fd.get("file"));
      if (typeof img !== "object") return { error: img === "missing" ? "invalid" : img };
      const key = kind === "logo" ? "logo_url" : "hero_image_url";
      const url = await store(clinicId, kind, img);
      const { error } = await supabase.from("clinic_sites").update({ brand: { ...site.brand, [key]: url } }).eq("clinic_id", clinicId);
      if (error) { await discard(clinicId, url); return { error: "error" }; }
      await discard(clinicId, site.brand[key]);
      refresh(fd, clinicId, site.slug);
      return { ok: true };
    }

    // Before/after case: two images and a title.
    const cases = Array.isArray(site.content.cases) ? (site.content.cases as unknown[]) : [];
    if (cases.length >= MAX_CASES) return { error: "invalid" };
    if (!p.data.title) return { error: "invalid" };
    const before = await readImage(fd.get("before"));
    const after = await readImage(fd.get("after"));
    if (typeof before !== "object") return { error: before === "missing" ? "invalid" : before };
    if (typeof after !== "object") return { error: after === "missing" ? "invalid" : after };
    const beforeUrl = await store(clinicId, "case-before", before);
    const afterUrl = await store(clinicId, "case-after", after);
    const entry = { id: newToken().slice(0, 12), title: p.data.title, before: beforeUrl, after: afterUrl };
    const { error } = await supabase.from("clinic_sites").update({ content: { ...site.content, cases: [...cases, entry] } }).eq("clinic_id", clinicId);
    if (error) { await discard(clinicId, beforeUrl); await discard(clinicId, afterUrl); return { error: "error" }; }
    refresh(fd, clinicId, site.slug);
    return { ok: true };
  } catch (err) {
    console.error("[media]", err instanceof Error ? err.message : err);
    return { error: "error" };
  }
}

// Removes the logo, hero image, a doctor's photo, or one before/after case.
export async function removeMedia(fd: FormData) {
  const p = z.object({
    clinicId: uuid, kind: z.enum(KINDS), doctorId: uuid.optional(), caseId: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).optional(),
  }).safeParse({ clinicId: fd.get("clinicId"), kind: fd.get("kind"), doctorId: fd.get("doctorId") || undefined, caseId: fd.get("caseId") || undefined });
  if (!p.success) return;
  const { clinicId, kind } = p.data;
  const supabase = await createClient();
  const { data: allowed } = await supabase.rpc("can_manage_clinic", { p_clinic: clinicId });
  if (!allowed) return;

  if (kind === "doctor") {
    if (!p.data.doctorId) return;
    const { data: doc } = await supabase.from("doctors").select("photo_url").eq("id", p.data.doctorId).eq("clinic_id", clinicId).maybeSingle();
    if (!doc) return;
    const { error } = await supabase.from("doctors").update({ photo_url: null }).eq("id", p.data.doctorId).eq("clinic_id", clinicId);
    if (!error) await discard(clinicId, doc.photo_url);
    refresh(fd, clinicId);
    return;
  }

  const { data: site } = await supabase.from("clinic_sites").select("slug, brand, content").eq("clinic_id", clinicId).single<Site>();
  if (!site) return;
  if (kind === "logo" || kind === "hero") {
    const key = kind === "logo" ? "logo_url" : "hero_image_url";
    const { [key]: old, ...brand } = site.brand;
    const { error } = await supabase.from("clinic_sites").update({ brand }).eq("clinic_id", clinicId);
    if (!error) await discard(clinicId, old);
  } else {
    const cases = (Array.isArray(site.content.cases) ? site.content.cases : []) as { id?: string; before?: string; after?: string }[];
    const gone = cases.find((c) => c.id === p.data.caseId);
    if (!gone) return;
    const { error } = await supabase.from("clinic_sites")
      .update({ content: { ...site.content, cases: cases.filter((c) => c !== gone) } }).eq("clinic_id", clinicId);
    if (!error) { await discard(clinicId, gone.before); await discard(clinicId, gone.after); }
  }
  refresh(fd, clinicId, site.slug);
}
