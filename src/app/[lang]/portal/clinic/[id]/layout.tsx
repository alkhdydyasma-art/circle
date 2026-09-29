import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, Phone, Siren } from "lucide-react";
import { acknowledgeEmergency } from "@/app/actions/agent";
import { AlertWatcher } from "@/components/portal/AlertWatcher";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { ClinicNav, type NavKey } from "@/components/portal/ClinicNav";
import { Badge, statusTone } from "@/components/portal/ui";

export default async function ClinicLayout({ children, params }: LayoutProps<"/[lang]/portal/clinic/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const ctx = await getClinicContext(id);
  const t = getPortalDictionary(lang);
  const base = `/${lang}/portal/clinic/${id}`;

  // Menu mirrors what RLS allows each role to do.
  const keys: NavKey[] = [
    "today", "schedule", "appointments", "patients",
    ...(ctx.frontDesk ? (["conversations"] as const) : []),
    ...(ctx.canManage ? (["reports", "services", "doctors", "website", "automation", "team"] as const) : []),
  ];
  // Chats waiting for a person (handed off by the assistant or new while it's off).
  let waiting = 0;
  let urgent: { id: string; patient_name: string | null; patient_phone: string; handoff_reason: string | null; emergency_at: string }[] = [];
  if (ctx.frontDesk) {
    const supabase = await createClient();
    const [{ data }, { data: e }] = await Promise.all([
      supabase.from("conversations").select("id").eq("clinic_id", id).eq("needs_attention", true).limit(99),
      supabase.from("conversations").select("id, patient_name, patient_phone, handoff_reason, emergency_at")
        .eq("clinic_id", id).not("emergency_at", "is", null).is("emergency_ack_at", null).order("emergency_at", { ascending: false }).limit(5),
    ]);
    waiting = data?.length ?? 0;
    urgent = (e ?? []) as typeof urgent;
  }
  const em = t.dash.emergency;
  const ago = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const items = keys.map((key) => ({
    key, label: key === "schedule" && !ctx.frontDesk ? t.dash.schedule.mine : t.dash.nav[key], href: key === "today" ? base : `${base}/${key}`, badge: key === "conversations" ? waiting : undefined,
  }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
      <aside className="max-md:contents md:sticky md:top-6 md:h-fit">
        <div className="mb-4 px-1">
          <p className="truncate font-semibold">{ctx.clinic.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={statusTone[ctx.clinic.status]}>{t.clinicStatus[ctx.clinic.status]}</Badge>
            {ctx.role && <Badge>{t.roles[ctx.role]}</Badge>}
          </div>
          {ctx.site.published && (
            <a href={`/${lang}/c/${ctx.site.slug}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-teal">
              {t.dash.viewSite} <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        <ClinicNav base={base} items={items} />
      </aside>
      <div className="min-w-0">
        {ctx.frontDesk && <AlertWatcher clinicId={id} emergencies={urgent.length} waiting={waiting} />}
        {urgent.length > 0 && (
          <div role="alert" className="mb-6 space-y-3">
            {urgent.map((u) => (
              <div key={u.id} className="rounded-xl border-2 border-rose-500 bg-rose-500/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-bold text-rose-600 dark:text-rose-400">
                      <Siren className="size-5 shrink-0 animate-pulse" />{em.title} — {u.patient_name ?? u.patient_phone}
                    </p>
                    <p className="mt-1 text-sm">{u.handoff_reason?.replace(/^EMERGENCY:\s*/, "")}</p>
                    <p className="mt-1 text-xs text-muted">{em.help} · {em.since} {ago.format(-minutesSince(u.emergency_at), "minute")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <a href={`tel:${u.patient_phone}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3 font-semibold text-white"><Phone className="size-4" />{em.call}</a>
                    <Link href={`${base}/conversations?c=${u.id}`} className="inline-flex min-h-9 items-center rounded-lg border border-rose-500/60 px-3">{em.open}</Link>
                    <form action={acknowledgeEmergency}>
                      <input type="hidden" name="lang" value={lang} /><input type="hidden" name="clinicId" value={id} /><input type="hidden" name="id" value={u.id} />
                      <button className="min-h-9 rounded-lg border border-line px-3 text-muted hover:text-teal">{em.ack}</button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const minutesSince = (iso: string) => Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
