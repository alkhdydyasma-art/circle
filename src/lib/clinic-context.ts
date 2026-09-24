import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";

export type Role = "owner" | "manager" | "doctor" | "reception";

export type ClinicContext = {
  clinic: {
    id: string; name: string; city: string; status: "pending" | "active" | "suspended";
    plan: "starter" | "standard" | "pro"; platform: "smart_clinic" | "medent"; platform_url: string | null;
  };
  site: { slug: string; published: boolean; timezone: string };
  role: Role | null;
  isAdmin: boolean;
  userId: string;
  /** Owner, manager or Circle staff. */
  canManage: boolean;
  /** Owner, manager, reception or staff: patients & appointments. */
  frontDesk: boolean;
};

// Loads the clinic for the signed-in user. RLS returns nothing for clinics they don't belong
// to, which becomes a 404 — so a guessed clinic id reveals nothing.
export const getClinicContext = cache(async (id: string): Promise<ClinicContext> => {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const user = await getUser();
  if (!user) notFound();

  const [{ data: clinic }, { data: site }, { data: isAdmin }, { data: role }] = await Promise.all([
    supabase.from("clinics").select("id, name, city, status, plan, platform, platform_url").eq("id", id).maybeSingle(),
    supabase.from("clinic_sites").select("slug, published, timezone").eq("clinic_id", id).maybeSingle(),
    supabase.rpc("is_platform_admin"),
    supabase.rpc("clinic_role_of", { p_clinic: id }),
  ]);
  if (!clinic || !site) notFound();

  const r = (role as Role | null) ?? null;
  const admin = Boolean(isAdmin);
  return {
    clinic: clinic as ClinicContext["clinic"],
    site: site as ClinicContext["site"],
    role: r,
    isAdmin: admin,
    userId: user.id,
    canManage: admin || r === "owner" || r === "manager",
    frontDesk: admin || r === "owner" || r === "manager" || r === "reception",
  };
});
