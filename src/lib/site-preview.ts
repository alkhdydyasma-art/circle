import "server-only";
import type { PublicSite } from "@/lib/sites";
import { createClient } from "@/lib/supabase/server";
import { TEMPLATES, type TemplateKey } from "@/templates/theme";

// Draft version of public_site() built from the clinic's own tables as the signed-in user.
// RLS makes it visible to that clinic's members (and Circle staff) only.
export async function getDraftSite(clinicId: string): Promise<PublicSite | null> {
  const supabase = await createClient();
  const [{ data: clinic }, { data: site }, { data: branches }, { data: doctors }, { data: services }, { data: links }] = await Promise.all([
    supabase.from("clinics").select("id, name, city").eq("id", clinicId).maybeSingle(),
    supabase.from("clinic_sites").select("*").eq("clinic_id", clinicId).maybeSingle(),
    supabase.from("branches").select("id, name, city, address, phone, maps_url").eq("clinic_id", clinicId).eq("is_active", true).order("created_at"),
    supabase.from("doctors").select("id, full_name, title, specialty, bio, photo_url").eq("clinic_id", clinicId).eq("is_active", true).order("sort"),
    supabase.from("services").select("id, name, description, duration_minutes, price").eq("clinic_id", clinicId).eq("is_active", true).order("sort"),
    supabase.from("doctor_services").select("doctor_id, service_id").eq("clinic_id", clinicId),
  ]);
  if (!clinic || !site) return null;

  const template: TemplateKey = (TEMPLATES as readonly string[]).includes(site.template) ? site.template : "modern";
  return {
    clinic,
    site: {
      slug: site.slug, template, brand: site.brand ?? {}, content: site.content ?? {},
      phone: site.phone, whatsapp: site.whatsapp, email: site.email,
      timezone: site.timezone, booking_days_ahead: site.booking_days_ahead,
    },
    branches: branches ?? [],
    doctors: (doctors ?? []).map((d) => ({
      ...d, service_ids: (links ?? []).filter((l) => l.doctor_id === d.id).map((l) => l.service_id),
    })),
    services: (services ?? []).map((s) => ({ ...s, price: s.price == null ? null : Number(s.price) })),
  } as PublicSite;
}
