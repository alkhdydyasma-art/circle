import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, ChevronRight, CircleAlert, UserRound } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { sendStaffReply, setConversationStatus } from "@/app/actions/agent";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/portal/ActionForm";
import { AutoRefresh } from "@/components/portal/AutoRefresh";
import { Badge, Card, inputCls } from "@/components/portal/ui";

type Conv = { id: string; patient_phone: string; patient_name: string | null; status: "ai" | "human" | "closed"; needs_attention: boolean; handoff_reason: string | null; last_message_at: string };
type Msg = { id: number; role: "patient" | "agent" | "staff"; body: string; created_at: string };

// WhatsApp inbox: the assistant's chats, with take-over and staff replies.
export default async function ConversationsPage({ params, searchParams }: PageProps<"/[lang]/portal/clinic/[id]/conversations">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const ctx = await getClinicContext(id);
  if (!ctx.frontDesk) notFound();
  const t = getPortalDictionary(lang);
  const ib = t.dash.inbox;
  const selected = (await searchParams).c;
  const supabase = await createClient();

  const { data: convs } = await supabase.from("conversations")
    .select("id, patient_phone, patient_name, status, needs_attention, handoff_reason, last_message_at")
    .eq("clinic_id", id).order("needs_attention", { ascending: false }).order("last_message_at", { ascending: false }).limit(100).returns<Conv[]>();
  const conv = typeof selected === "string" ? (convs ?? []).find((c) => c.id === selected) : undefined;
  const { data: msgs } = conv
    ? await supabase.from("conversation_messages").select("id, role, body, created_at").eq("conversation_id", conv.id).order("id", { ascending: false }).limit(100).returns<Msg[]>()
    : { data: null };

  const tz = ctx.site.timezone;
  const when = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const tone = { ai: "teal", human: "amber", closed: "muted" } as const;
  const base = `/${lang}/portal/clinic/${id}/conversations`;
  const statusForm = (status: Conv["status"], label: string, primary = false) => (
    <form action={setConversationStatus}>
      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="clinicId" value={id} />
      <input type="hidden" name="id" value={conv!.id} /><input type="hidden" name="status" value={status} />
      <button className={`min-h-9 rounded-lg border px-3 text-sm transition ${primary ? "border-teal/50 text-teal hover:bg-teal/10" : "border-line text-muted hover:text-ink"}`}>{label}</button>
    </form>
  );

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={15} />
      <h1 className="text-2xl font-semibold">{ib.title}</h1>
      {!convs?.length ? <Card title={ib.title}><p className="text-muted">{ib.empty}</p></Card> : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ul className={`divide-y divide-line overflow-hidden rounded-xl border border-line bg-card ${conv ? "max-lg:hidden" : ""}`}>
            {convs.map((c) => (
              <li key={c.id}>
                <Link href={`${base}?c=${c.id}`} className={`flex min-h-16 items-center justify-between gap-3 px-4 py-3 transition hover:bg-bg ${conv?.id === c.id ? "bg-teal/10" : ""}`}>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-medium">
                      {c.needs_attention && <CircleAlert className="size-4 shrink-0 text-rose-500" aria-label={ib.attention} />}
                      <span className="truncate">{c.patient_name ?? c.patient_phone}</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted"><bdi dir="ltr">{c.patient_phone}</bdi> · {when.format(new Date(c.last_message_at))}</span>
                  </span>
                  <Badge tone={tone[c.status]}>{ib[c.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>

          {!conv ? <p className="hidden rounded-xl border border-dashed border-line p-8 text-center text-muted lg:block">{ib.pick}</p> : (
            <section className="flex min-h-[28rem] flex-col rounded-xl border border-line bg-card">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <Link href={base} className="mb-1 inline-flex items-center gap-1 text-xs text-muted lg:hidden"><ChevronRight className="size-3.5 ltr:rotate-180" />{ib.back}</Link>
                  <p className="font-semibold">{conv.patient_name ?? conv.patient_phone}</p>
                  <p className="text-xs text-muted">
                    <a href={`https://wa.me/${conv.patient_phone.slice(1)}`} target="_blank" rel="noopener noreferrer" className="hover:text-teal"><bdi dir="ltr">{conv.patient_phone}</bdi></a>
                    {conv.handoff_reason && conv.status === "human" && <> · {ib.reason}: {conv.handoff_reason}</>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {conv.status === "ai" && statusForm("human", ib.takeOver, true)}
                  {conv.status === "human" && statusForm("ai", ib.release, true)}
                  {conv.status !== "closed" ? statusForm("closed", ib.close) : statusForm("ai", ib.reopen)}
                </div>
              </header>
              <ol className="flex flex-1 flex-col-reverse gap-3 overflow-y-auto p-4" style={{ maxHeight: "32rem" }}>
                {(msgs ?? []).map((m) => (
                  <li key={m.id} className={`flex ${m.role === "patient" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${m.role === "patient" ? "rounded-ss-sm bg-bg" : m.role === "agent" ? "rounded-se-sm bg-teal/10" : "rounded-se-sm bg-amber-400/15"}`}>
                      {m.role !== "patient" && (
                        <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted">
                          {m.role === "agent" ? <Bot className="size-3.5" /> : <UserRound className="size-3.5" />}{m.role === "agent" ? ib.agent : ib.you}
                        </p>
                      )}
                      <p className="whitespace-pre-line leading-relaxed">{mediaLabel(m.body, lang)}</p>
                      <p className="mt-1 text-[11px] text-muted">{when.format(new Date(m.created_at))}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="border-t border-line p-3">
                <ActionForm action={sendStaffReply} hidden={{ lang, clinicId: id, id: conv.id }} submitLabel={ib.send} className="space-y-2"
                  messages={{ saved: ib.sent, invalid: ib.sendError, denied: t.clinic.denied, error: ib.sendError }}>
                  <textarea required name="body" rows={2} maxLength={4000} placeholder={ib.reply} className={inputCls} />
                </ActionForm>
                <p className="mt-2 text-xs text-muted">{ib.window}</p>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// Non-text WhatsApp messages are stored as "[voice]", "[image]"… — shown as readable labels.
const MEDIA: Record<string, [string, string]> = {
  "[voice]": ["🎤 رسالة صوتية", "🎤 Voice note"], "[image]": ["🖼️ صورة", "🖼️ Image"], "[video]": ["🎬 فيديو", "🎬 Video"],
  "[document]": ["📄 ملف", "📄 Document"], "[sticker]": ["ملصق", "Sticker"], "[location]": ["📍 موقع", "📍 Location"],
};
function mediaLabel(body: string, lang: string) {
  const l = MEDIA[body];
  return l ? (lang === "ar" ? l[0] : l[1]) : body;
}
