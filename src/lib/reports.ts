import { addDays, localDate, zonedToUtc } from "@/lib/time";

// Shape returned by the clinic_report / api_report SQL functions (counts only, no patient data).
export type Report = {
  clinic: string; from: string; to: string; timezone: string;
  totals: { total: number; pending: number; confirmed: number; completed: number; cancelled: number; no_show: number; revenue: number };
  no_show_rate: number | null; cancel_rate: number | null;
  by_source: Partial<Record<"website" | "whatsapp" | "dashboard" | "ai_agent", number>>;
  by_doctor: { name: string; total: number; completed: number; no_show: number; cancelled: number; revenue: number }[];
  by_service: { name: string; total: number; revenue: number }[];
  by_day: { day: string; total: number; missed: number }[];
  new_patients: number;
  conversations: { total: number; handed_off: number; waiting: number };
  upcoming_7d: number; unconfirmed_7d: number;
};

/** Report window in the clinic's local days: the last N days including today, or this month. */
export function reportPeriod(period: "7" | "30" | "90" | "month", tz: string) {
  const today = localDate(new Date(), tz);
  const first = period === "month" ? `${today.slice(0, 8)}01` : addDays(today, 1 - Number(period));
  return { from: zonedToUtc(first, "00:00", tz), to: zonedToUtc(addDays(today, 1), "00:00", tz) };
}

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 1000) / 10}%`);

/** Ready-to-send Arabic WhatsApp summary for the clinic owner (used by the weekly n8n report). */
export function reportMessage(r: Report) {
  const t = r.totals;
  const top = r.by_doctor.slice(0, 3).map((d) => `• ${d.name}: ${d.total} (تمت ${d.completed})`).join("\n");
  const ai = r.by_source.ai_agent ?? 0;
  return [
    `📊 ملخص الأسبوع — ${r.clinic}`,
    ``,
    `المواعيد: ${t.total} | تمت: ${t.completed}`,
    `ملغي: ${t.cancelled} (${pct(r.cancel_rate)}) | لم يحضر: ${t.no_show} (${pct(r.no_show_rate)})`,
    `الإيراد التقديري: ${Math.round(t.revenue).toLocaleString("en-US")} ر.س`,
    `مرضى جدد: ${r.new_patients}`,
    ai ? `حجوزات المساعد الذكي: ${ai}` : null,
    r.conversations.total ? `محادثات واتساب: ${r.conversations.total} (حُوّلت للاستقبال ${r.conversations.handed_off})` : null,
    top ? `\nالأطباء:\n${top}` : null,
    ``,
    `مواعيد الأسبوع القادم: ${r.upcoming_7d}${r.unconfirmed_7d ? ` (غير مؤكدة: ${r.unconfirmed_7d} ⚠️)` : ""}`,
  ].filter((l) => l !== null).join("\n");
}

/** Parameters for the "weekly_report" WhatsApp template (the owner is usually outside the
 *  24h window, so a pre-approved template is required). Params can't contain line breaks. */
export function reportTemplateParams(r: Report) {
  const t = r.totals;
  return [
    r.clinic,
    String(t.total),
    String(t.completed),
    pct(r.no_show_rate),
    `${Math.round(t.revenue).toLocaleString("en-US")} ر.س`,
    String(r.new_patients),
    String(r.upcoming_7d),
    String(r.unconfirmed_7d),
  ];
}
