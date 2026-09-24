import "server-only";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { TEMPLATES } from "@/templates/theme";
import { supabaseEnv } from "@/lib/supabase/cookies";

// Shape of public.public_site(slug). Parsed defensively: whatever is stored in the DB,
// the templates only ever receive validated, typed data.
const siteSchema = z.object({
  clinic: z.object({ id: z.string().uuid(), name: z.string(), city: z.string().nullable() }),
  site: z.object({
    slug: z.string(),
    template: z.enum(TEMPLATES).catch("modern"),
    brand: z.record(z.string(), z.unknown()).catch({}),
    content: z
      .object({
        tagline: z.string().max(160).optional().catch(undefined),
        about: z.string().max(1200).optional().catch(undefined),
        sections: z.record(z.string(), z.boolean()).optional().catch(undefined),
      })
      .catch({}),
    phone: z.string().nullable(),
    whatsapp: z.string().nullable(),
    email: z.string().nullable(),
    timezone: z.string(),
    booking_days_ahead: z.number(),
    reminders_enabled: z.boolean().optional().catch(false),
  }),
  branches: z.array(z.object({
    id: z.string().uuid(), name: z.string(), city: z.string().nullable(), address: z.string().nullable(),
    phone: z.string().nullable(), maps_url: z.string().nullable(),
  })),
  doctors: z.array(z.object({
    id: z.string().uuid(), full_name: z.string(), title: z.string().nullable(), specialty: z.string().nullable(),
    bio: z.string().nullable(), photo_url: z.string().nullable(), service_ids: z.array(z.string().uuid()),
  })),
  services: z.array(z.object({
    id: z.string().uuid(), name: z.string(), description: z.string().nullable(),
    duration_minutes: z.number(), price: z.number().nullable(),
  })),
});

export type PublicSite = z.infer<typeof siteSchema>;

// Anonymous client: the public site only ever uses the SECURITY DEFINER functions.
export const anonClient = () => {
  const { url, anonKey } = supabaseEnv();
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
};

export const getPublicSite = cache(async (slug: string): Promise<PublicSite | null> => {
  if (!/^[a-z0-9](-?[a-z0-9])*$/.test(slug) || slug.length > 40) return null;
  const { data, error } = await anonClient().rpc("public_site", { p_slug: slug });
  if (error) throw new Error(`public_site failed: ${error.message}`);
  if (!data) return null;
  const parsed = siteSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[sites] invalid public_site payload", slug, parsed.error.issues.slice(0, 3));
    return null;
  }
  return parsed.data;
});
