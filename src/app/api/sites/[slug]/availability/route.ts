import { z } from "zod";
import { getAvailability, localDay } from "@/lib/booking";
import { getPublicSite } from "@/lib/sites";

const query = z.object({
  service: z.string().uuid(),
  doctor: z.string().uuid().optional(),
});

// GET /api/sites/{slug}/availability?service=…&doctor=… → { days: { "YYYY-MM-DD": Slot[] } }
export async function GET(request: Request, { params }: RouteContext<"/api/sites/[slug]/availability">) {
  const { slug } = await params;
  const url = new URL(request.url);
  const parsed = query.safeParse({
    service: url.searchParams.get("service"),
    doctor: url.searchParams.get("doctor") || undefined,
  });
  if (!parsed.success) return Response.json({ error: "invalid_query" }, { status: 400 });

  const site = await getPublicSite(slug);
  if (!site) return Response.json({ error: "clinic_not_found" }, { status: 404 });

  const days = await getAvailability({
    slug,
    serviceId: parsed.data.service,
    doctorId: parsed.data.doctor,
    from: localDay(site.site.timezone),
    days: Math.min(14, site.site.booking_days_ahead + 1),
  });
  return Response.json({ days }, { headers: { "Cache-Control": "no-store" } });
}
