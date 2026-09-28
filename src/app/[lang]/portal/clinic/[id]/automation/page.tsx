import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { createApiKey, revokeApiKey, saveAutomation } from "@/app/actions/clinic";
import { deleteKnowledge, saveAgentSettings, saveKnowledge } from "@/app/actions/agent";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Field } from "@/components/portal/ActionForm";
import { Badge, Card, ghostBtnCls, inputCls } from "@/components/portal/ui";

type Settings = {
  reminders_enabled: boolean; reminder_hours_before: number; reschedule_cutoff_hours: number; auto_occasions: boolean;
  ai_agent_enabled: boolean; whatsapp_phone_number_id: string | null; ai_agent_instructions: string;
};
type Knowledge = { id: string; title: string; content: string; updated_at: string };
type Key = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

const ENDPOINTS = [
  ["GET", "/api/v1/clinic", "services, doctors & hours, branches, rules"],
  ["GET", "/api/v1/slots?service=…&day=YYYY-MM-DD", "open times"],
  ["POST", "/api/v1/appointments", "{ service_id, doctor_id, branch_id, starts_at, full_name, phone }"],
  ["GET", "/api/v1/appointments?phone=05…", "patient's upcoming visits"],
  ["POST", "/api/v1/appointments/{id}/reschedule", "{ phone, starts_at }"],
  ["POST", "/api/v1/appointments/{id}/cancel", "{ phone }"],
  ["GET", "/api/v1/reminders", "due reminders + message + link"],
  ["POST", "/api/v1/reminders/{id}/sent", "mark as sent"],
] as const;

export default async function AutomationPage({ params }: PageProps<"/[lang]/portal/clinic/[id]/automation">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const ctx = await getClinicContext(id);
  if (!ctx.canManage) notFound();
  const t = getPortalDictionary(lang);
  const au = t.dash.automation;
  const supabase = await createClient();
  const [{ data: s }, { data: keys }, { data: knowledge }] = await Promise.all([
    supabase.from("clinic_sites").select("reminders_enabled, reminder_hours_before, reschedule_cutoff_hours, auto_occasions, ai_agent_enabled, whatsapp_phone_number_id, ai_agent_instructions").eq("clinic_id", id).single<Settings>(),
    supabase.from("clinic_api_keys").select("id, name, prefix, created_at, last_used_at, revoked_at").eq("clinic_id", id).order("created_at", { ascending: false }).returns<Key[]>(),
    supabase.from("clinic_knowledge").select("id, title, content, updated_at").eq("clinic_id", id).order("created_at").returns<Knowledge[]>(),
  ]);
  if (!s) notFound();
  const h = await headers();
  const origin = process.env.SITE_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  const m = { saved: t.dash.patients.saved, invalid: t.dash.saveError, denied: t.clinic.denied, error: t.clinic.error };
  const ag = t.dash.agent;
  const kb = knowledge ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{au.title}</h1>

      <Card title={au.settings}>
        <ActionForm version={JSON.stringify(s)} action={saveAutomation} hidden={{ lang, clinicId: id }} messages={m} submitLabel={au.save}>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reminders_enabled" defaultChecked={s.reminders_enabled} className="size-4 accent-teal-500" />{au.reminders}</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={au.hoursBefore}><input name="reminder_hours_before" type="number" min={1} max={72} defaultValue={s.reminder_hours_before} className={inputCls} /></Field>
            <Field label={au.cutoff}><input name="reschedule_cutoff_hours" type="number" min={0} max={168} defaultValue={s.reschedule_cutoff_hours} className={inputCls} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="auto_occasions" defaultChecked={s.auto_occasions} className="size-4 accent-teal-500" />{au.autoOccasions}</label>
        </ActionForm>
      </Card>

      <Card title={ag.title}>
        <p className="mb-4 text-sm text-muted">{ag.help}</p>
        <ActionForm
          version={`${s.ai_agent_enabled}|${s.whatsapp_phone_number_id}|${s.ai_agent_instructions}`}
          action={saveAgentSettings} hidden={{ lang, clinicId: id }} messages={m} submitLabel={ag.save}
        >
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="ai_agent_enabled" defaultChecked={s.ai_agent_enabled} className="size-4 accent-teal-500" />{ag.enabled}</label>
          <Field label={ag.phoneNumberId}>
            {ctx.isAdmin ? (
              <input name="whatsapp_phone_number_id" dir="ltr" inputMode="numeric" pattern="[0-9]{5,30}" defaultValue={s.whatsapp_phone_number_id ?? ""} className={inputCls} />
            ) : (
              <span dir="ltr" className={`${inputCls} block text-muted`}>{s.whatsapp_phone_number_id ?? "—"}</span>
            )}
            <span className="mt-1 block text-xs text-muted">{ag.phoneHint}</span>
          </Field>
          <Field label={ag.instructions}>
            <textarea name="ai_agent_instructions" rows={3} maxLength={2000} defaultValue={s.ai_agent_instructions} placeholder={ag.instructionsPlaceholder} className={inputCls} />
          </Field>
          <p className="flex gap-2 rounded-lg bg-bg p-3 text-xs text-muted"><ShieldCheck className="size-4 shrink-0 text-teal" />{ag.privacy}</p>
        </ActionForm>
      </Card>

      <Card title={ag.knowledge}>
        <p className="mb-4 text-sm text-muted">{ag.knowledgeHelp}</p>
        <ul className="mb-5 space-y-3">
          {kb.map((k) => (
            <li key={k.id} className="rounded-xl border border-line p-3">
              <ActionForm version={k.updated_at} action={saveKnowledge} hidden={{ lang, clinicId: id, id: k.id }} messages={m} submitLabel={ag.save}>
                <input required name="title" minLength={2} maxLength={120} defaultValue={k.title} aria-label={ag.kTitle} className={`${inputCls} font-medium`} />
                <textarea required name="content" rows={3} minLength={2} maxLength={3000} defaultValue={k.content} aria-label={ag.kContent} className={inputCls} />
              </ActionForm>
              <form action={deleteKnowledge} className="mt-2 flex justify-end">
                <input type="hidden" name="lang" value={lang} /><input type="hidden" name="clinicId" value={id} /><input type="hidden" name="id" value={k.id} />
                <button className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted transition hover:border-rose-400/60 hover:text-rose-500"><Trash2 className="size-3.5" />{ag.remove}</button>
              </form>
            </li>
          ))}
        </ul>
        {kb.length >= 40 ? <p className="text-sm text-muted">{ag.limit}</p> : (
          <ActionForm version={String(kb.length)} action={saveKnowledge} hidden={{ lang, clinicId: id }} messages={m} submitLabel={ag.add} className="space-y-3 rounded-xl border border-dashed border-line p-3">
            <Field label={ag.kTitle}><input required name="title" minLength={2} maxLength={120} className={inputCls} /></Field>
            <Field label={ag.kContent}><textarea required name="content" rows={3} minLength={2} maxLength={3000} className={inputCls} /></Field>
          </ActionForm>
        )}
      </Card>

      <Card title={au.keys}>
        <p className="mb-4 text-sm text-muted">{au.keysHelp}</p>
        {!!keys?.length && (
          <ul className="mb-5 divide-y divide-line">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <KeyRound className="size-4 text-muted" />
                  <span className="font-medium">{k.name}</span>
                  <code dir="ltr" className="text-xs text-muted">{k.prefix}…</code>
                </span>
                <span className="flex items-center gap-3 text-muted">
                  {au.lastUsed}: {k.last_used_at ? date.format(new Date(k.last_used_at)) : au.never}
                  {k.revoked_at ? <Badge tone="rose">{au.revoked}</Badge> : (
                    <form action={revokeApiKey}>
                      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="clinicId" value={id} /><input type="hidden" name="id" value={k.id} />
                      <button className={ghostBtnCls}>{au.revoke}</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={createApiKey} hidden={{ lang, clinicId: id }} messages={m} submitLabel={au.create} secretLabel={au.created}>
          <Field label={au.keyName}><input required name="name" maxLength={60} defaultValue="n8n" className={inputCls} /></Field>
        </ActionForm>
      </Card>

      <Card title={au.api}>
        <p className="mb-3 text-sm text-muted">{au.apiHelp}</p>
        <ul dir="ltr" className="space-y-1.5 text-left font-mono text-xs">
          {ENDPOINTS.map(([method, path, note]) => (
            <li key={method + path} className="flex flex-wrap gap-2">
              <span className={method === "GET" ? "text-teal" : "text-amber-500"}>{method}</span>
              <span>{origin}{path}</span>
              <span className="text-muted">— {note}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
