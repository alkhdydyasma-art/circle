// Operations summary for the Circle founder (from the ops_summary SQL function).

type SourceStats = { ok: number; errors: number; healed_by_retry: number; fallbacks: number; error_rate: number | null };
export type OpsSummary = {
  from: string; to: string;
  by_source: Partial<Record<string, SourceStats>>;
  agent_latency_ms: { p50: number | null; p95: number | null };
  degraded_periods: number;
  auto_confirmed: number;
  incidents: {
    new: number; open: number;
    fixed: { source: string; message: string; pr: string | null; occurrences: number }[];
    awaiting_approval: { source: string; message: string; pr: string | null }[];
  };
};

const sum = (s: OpsSummary, k: keyof SourceStats) =>
  Object.values(s.by_source).reduce((n, v) => n + Number(v?.[k] ?? 0), 0);
const secs = (ms: number | null) => (ms === null ? "—" : `${(ms / 1000).toFixed(1)} ث`);

export function opsTotals(s: OpsSummary) {
  const handled = s.by_source.agent?.ok ?? 0;
  const ok = sum(s, "ok") + sum(s, "healed_by_retry");
  const errors = sum(s, "errors");
  return {
    handled, errors, healed: sum(s, "healed_by_retry"), fallbacks: sum(s, "fallbacks"),
    errorRate: ok + errors ? errors / (ok + errors) : 0,
  };
}

export function opsMessage(s: OpsSummary, days: number) {
  const t = opsTotals(s);
  const lines = [
    `📡 تقرير تشغيل سيركل — آخر ${days} أيام`,
    ``,
    `• رسائل واتساب ردّ عليها المساعد: ${t.handled} (الوسيط ${secs(s.agent_latency_ms.p50)}، 95% خلال ${secs(s.agent_latency_ms.p95)})`,
    `• نسبة الأخطاء: ${(t.errorRate * 100).toFixed(1)}%`,
    `• حجوزات تأكدت تلقائياً: ${s.auto_confirmed}`,
    `• أخطاء عالجها النظام بنفسه (إعادة المحاولة): ${t.healed}`,
    `• ردود بديلة للمرضى برابط الحجز: ${t.fallbacks}${s.degraded_periods ? ` · إيقاف مؤقت للمساعد: ${s.degraded_periods}` : ""}`,
    ``,
    `🔧 إصلاحات برمجية اعتمدتها ودُمجت: ${s.incidents.fixed.length}`,
    ...s.incidents.fixed.slice(0, 5).map((f) => `  - ${f.message.slice(0, 90)}${f.pr ? `\n    ${f.pr}` : ""}`),
    `⏳ إصلاحات جاهزة ومختبرة تنتظر موافقتك (ضغطة دمج): ${s.incidents.awaiting_approval.length}`,
    ...s.incidents.awaiting_approval.slice(0, 5).map((f) => `  - ${f.message.slice(0, 90)}${f.pr ? `\n    ${f.pr}` : ""}`),
    `🔎 مشاكل قيد المعالجة: ${s.incidents.open}`,
  ];
  return lines.join("\n");
}

/** Parameters of the "ops_summary" WhatsApp template (no line breaks allowed). */
export function opsTemplateParams(s: OpsSummary, days: number) {
  const t = opsTotals(s);
  return [
    String(days), String(t.handled), secs(s.agent_latency_ms.p95), `${(t.errorRate * 100).toFixed(1)}%`,
    String(s.auto_confirmed), String(t.healed), String(s.incidents.fixed.length), String(s.incidents.awaiting_approval.length),
  ];
}
