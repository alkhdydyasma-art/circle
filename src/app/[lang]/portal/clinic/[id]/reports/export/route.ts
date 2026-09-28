import { createClient } from "@/lib/supabase/server";
import { reportPeriod } from "@/lib/reports";
import { localDate } from "@/lib/time";

type Row = {
  starts_at: string; status: string; source: string;
  services: { name: string; price: number | null } | null; doctors: { full_name: string } | null; branches: { name: string } | null;
};

const cell = (v: unknown) => {
  const s = String(v ?? "");
  // Quote, and neutralise spreadsheet formulas (CSV injection).
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

// CSV of the period's appointments for owners and managers: date, time, doctor, service,
// branch, status, source, price. No patient names or phone numbers leave the system here.
export async function GET(request: Request, { params }: RouteContext<"/[lang]/portal/clinic/[id]/reports/export">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const supabase = await createClient();
  const [{ data: canManage }, { data: site }] = await Promise.all([
    supabase.rpc("can_manage_clinic", { p_clinic: id }),
    supabase.from("clinic_sites").select("timezone, slug").eq("clinic_id", id).maybeSingle(),
  ]);
  if (!canManage || !site) return new Response("Not found", { status: 404 });

  const p = new URL(request.url).searchParams.get("period");
  const period = p === "7" || p === "90" || p === "month" ? p : "30";
  const { from, to } = reportPeriod(period, site.timezone);
  const { data, error } = await supabase.from("appointments")
    .select("starts_at, status, source, services(name, price), doctors(full_name), branches(name)")
    .eq("clinic_id", id).gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString())
    .order("starts_at").limit(20000).returns<Row[]>();
  if (error) return new Response("Error", { status: 500 });

  const time = new Intl.DateTimeFormat("en-GB", { timeZone: site.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const lines = [
    ["date", "time", "doctor", "service", "branch", "status", "source", "price"].map(cell).join(","),
    ...(data ?? []).map((a) => [
      localDate(new Date(a.starts_at), site.timezone), time.format(new Date(a.starts_at)),
      a.doctors?.full_name, a.services?.name, a.branches?.name, a.status, a.source, a.services?.price ?? "",
    ].map(cell).join(",")),
  ];
  // BOM so Excel opens Arabic text correctly.
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${site.slug}-appointments-${period}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
