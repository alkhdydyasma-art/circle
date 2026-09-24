import { z } from "zod";

export const CLINIC_TYPES = ["general", "ortho", "cosmetic", "pediatric", "multi"] as const;
export const BOOKING_METHODS = ["phone", "whatsapp", "software", "paper"] as const;
export const MONTHLY_PATIENTS = ["lt200", "200_500", "500_1000", "gt1000"] as const;
export const NEEDS = ["whatsapp", "noshows", "booking", "dashboard", "website"] as const;
export const ROLES = ["owner", "manager", "doctor", "reception"] as const;

// Saudi mobile: 05XXXXXXXX, 5XXXXXXXX, +9665XXXXXXXX or 009665XXXXXXXX → normalized to +9665XXXXXXXX.
export const SAUDI_MOBILE = /^(?:\+?966|00966|0)?5\d{8}$/;
export const normalizeSaudiMobile = (raw: string) =>
  `+966${raw.replace(/[\s-]/g, "").slice(-9)}`;

const text = (max: number) => z.string().trim().min(1).max(max);
const count = z.coerce.number().int().min(1).max(500);

export const leadSchema = z.object({
  clinic: text(120),
  city: text(80),
  clinicType: z.enum(CLINIC_TYPES),
  branches: count,
  chairs: count,
  doctors: count,
  bookingMethod: z.enum(BOOKING_METHODS),
  monthlyPatients: z.enum(MONTHLY_PATIENTS),
  needs: z.array(z.enum(NEEDS)).max(NEEDS.length).default([]),
  name: text(120),
  role: z.enum(ROLES),
  phone: z
    .string()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .refine((v) => SAUDI_MOBILE.test(v), "invalid_phone")
    .transform(normalizeSaudiMobile),
  email: z.union([z.literal(""), z.string().trim().email().max(160)]).default(""),
  consent: z.literal(true),
  lang: z.enum(["ar", "en"]).default("ar"),
});

export type Lead = z.infer<typeof leadSchema>;
