import "server-only";
import { anonClient } from "@/lib/sites";

export type Slot = { doctor_id: string; branch_id: string; starts_at: string };

// YYYY-MM-DD for "now" (+ offset days) in the clinic's timezone.
export function localDay(timeZone: string, offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Open slots for each of the next `days` days, fetched in parallel from available_slots().
export async function getAvailability(opts: {
  slug: string; serviceId: string; doctorId?: string; from: string; days: number;
}): Promise<Record<string, Slot[]>> {
  const supabase = anonClient();
  const dates = Array.from({ length: opts.days }, (_, i) => addDays(opts.from, i));
  const results = await Promise.all(
    dates.map((day) =>
      supabase.rpc("available_slots", {
        p_slug: opts.slug,
        p_service: opts.serviceId,
        p_day: day,
        p_doctor: opts.doctorId ?? null,
        p_branch: null,
      }),
    ),
  );
  const out: Record<string, Slot[]> = {};
  results.forEach(({ data, error }, i) => {
    if (error) throw new Error(`available_slots failed: ${error.message}`);
    out[dates[i]] = (data ?? []) as Slot[];
  });
  return out;
}

export const BOOKING_ERRORS = ["slot_unavailable", "too_many_bookings", "invalid_phone", "invalid_name", "clinic_not_found"] as const;
export type BookingError = (typeof BOOKING_ERRORS)[number] | "error";

export type Booked = { id: string; starts_at: string; service: string; doctor: string; branch: string; manage_token?: string };

export async function bookAppointment(input: {
  slug: string; serviceId: string; doctorId: string; branchId: string; startsAt: string;
  fullName: string; phone: string; notes?: string;
}): Promise<{ ok: true; booking: Booked } | { ok: false; error: BookingError }> {
  const { data, error } = await anonClient().rpc("book_appointment", {
    p_slug: input.slug,
    p_service: input.serviceId,
    p_doctor: input.doctorId,
    p_branch: input.branchId,
    p_starts_at: input.startsAt,
    p_full_name: input.fullName,
    p_phone: input.phone,
    p_notes: input.notes ?? null,
  });
  if (error) {
    const known = BOOKING_ERRORS.find((e) => error.message?.includes(e));
    if (!known) console.error("[booking] book_appointment failed", error.message);
    return { ok: false, error: known ?? "error" };
  }
  return { ok: true, booking: data as Booked };
}

/** "السبت، 26 سبتمبر في 10:00 ص" — for WhatsApp template parameters. */
export const formatWhen = (iso: string, timeZone = "Asia/Riyadh") =>
  new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { timeZone, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso));

// Optional: tell n8n about the booking so it can send the WhatsApp confirmation.
export async function notifyBooking(payload: Record<string, unknown>) {
  const url = process.env.N8N_BOOKING_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET && { "x-circle-secret": process.env.N8N_WEBHOOK_SECRET }),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    });
  } catch (err) {
    console.error("[booking] n8n notify failed", err); // the booking itself is already saved
  }
}
