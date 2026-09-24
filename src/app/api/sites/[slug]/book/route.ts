import { z } from "zod";
import { bookAppointment, notifyBooking } from "@/lib/booking";
import { getPublicSite } from "@/lib/sites";
import { normalizeSaudiMobile } from "@/lib/lead-schema";

const body = z.object({
  serviceId: z.string().uuid(),
  doctorId: z.string().uuid(),
  branchId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(20),
  notes: z.string().trim().max(500).optional(),
  consent: z.literal(true),
  website: z.string().optional(), // honeypot
});

const STATUS = { slot_unavailable: 409, too_many_bookings: 429, invalid_phone: 400, invalid_name: 400, clinic_not_found: 404, error: 502 } as const;

// POST /api/sites/{slug}/book — the database re-validates the slot and prevents double-booking.
export async function POST(request: Request, { params }: RouteContext<"/api/sites/[slug]/book">) {
  const { slug } = await params;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const input = parsed.data;
  if (input.website) return Response.json({ error: "slot_unavailable" }, { status: 409 }); // bot

  const result = await bookAppointment({ slug, ...input });
  if (!result.ok) return Response.json({ error: result.error }, { status: STATUS[result.error] });

  const site = await getPublicSite(slug);
  await notifyBooking({
    event: "appointment.booked",
    source: "website",
    clinic: { id: site?.clinic.id, name: site?.clinic.name, slug },
    appointment: result.booking,
    patient: { name: input.fullName, phone: normalizeSaudiMobile(input.phone) },
  });
  return Response.json({ booking: result.booking }, { status: 201 });
}
