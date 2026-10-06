import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/i18n";
import { fill, getPortalDictionary } from "@/i18n/portal";
import { createClient } from "@/lib/supabase/server";
import { updateClinicAdmin, updateLeadStatus } from "@/app/actions/portal";
import { updateBillingAdmin } from "@/app/actions/billing";
import { ActivateLeadForm } from "@/components/portal/Forms";
import { RecordPaymentForm } from "@/components/portal/BillingForms";
import { billingStatus, planPrice } from "@/lib/billing";
import { Badge, Card, btnCls, statusTone, fieldCls } from "@/components/portal/ui";

const LEAD_STATUSES = ["new", "contacted", "demo_scheduled", "won", "lost"] as const;

type Lead = {
  id: string; created_at: string; status: (typeof LEAD_STATUSES)[number];
  clinic: string; city: string; clinic_type: string; branches: number; chairs: number; doctors: number;
  contact_name: string; phone: string; email: string | null;
};
type Clinic = {
  id: string; name: string; city: string; status: "pending" | "active" | "suspended";
  plan: "starter" | "standard" | "pro";
  trial_ends_at: string | null; paid_until: string | null; billing_cycle: "monthly" | "yearly";
  founder: boolean; billing_exempt: boolean;
};
const billTone = { trial: "amber", active: "teal", grace: "amber", expired: "rose", exempt: "muted" } as const;

export default async function AdminPage({ params }: PageProps<"/[lang]/portal/admin">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getPortalDictionary(lang);
  const supabase = await createClient();

  // UI guard only — RLS returns nothing to non-staff even if they reach this page.
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect(`/${lang}/portal`);

  const [{ data: leads }, { data: clinics }] = await Promise.all([
    supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(200).returns<Lead[]>(),
    supabase.from("clinics").select("*").order("created_at", { ascending: false }).returns<Clinic[]>(),
  ]);
  const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium" });
  const b = t.billing;
  const ymd = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10) : "");

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold">{t.admin.title}</h1>

      <Card title={`${t.admin.clinics} (${clinics?.length ?? 0})`}>
        {!clinics?.length ? <p className="text-muted">{t.admin.empty}</p> : (
          <ul className="divide-y divide-line">
            {clinics.map((c) => (
              <li key={c.id} className="space-y-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link href={`/${lang}/portal/clinic/${c.id}`} className="font-medium hover:text-teal">
                      {c.name} <span className="text-sm text-muted">· {c.city}</span>
                    </Link>
                    {(() => {
                      const s = billingStatus(c);
                      return (
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                          <Badge tone={billTone[s.state]}>{b.state[s.state]}</Badge>
                          {s.ends && s.state !== "exempt" && <span>{s.state === "trial" ? b.trialUntil : b.until} {date.format(s.ends)}</span>}
                          {c.founder && <Badge tone="teal">{b.founder}</Badge>}
                        </p>
                      );
                    })()}
                  </div>
                  <form key={`${c.status}-${c.plan}`} action={updateClinicAdmin} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="id" value={c.id} />
                    <Badge tone={statusTone[c.status]}>{t.clinicStatus[c.status]}</Badge>
                    <select name="status" defaultValue={c.status} aria-label={t.admin.cols.status} className={fieldCls}>
                      {(["pending", "active", "suspended"] as const).map((s) => <option key={s} value={s}>{t.clinicStatus[s]}</option>)}
                    </select>
                    <select name="plan" defaultValue={c.plan} aria-label={t.admin.cols.plan} className={fieldCls}>
                      {(["starter", "standard", "pro"] as const).map((p) => <option key={p} value={p}>{t.plans[p]}</option>)}
                    </select>
                    <button className={btnCls}>{t.admin.save}</button>
                  </form>
                </div>
                <form key={`${c.founder}-${c.billing_exempt}-${c.trial_ends_at}`} action={updateBillingAdmin} className="flex flex-wrap items-center gap-3 text-sm">
                  <input type="hidden" name="lang" value={lang} />
                  <input type="hidden" name="id" value={c.id} />
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="founder" defaultChecked={c.founder} />{b.founder}</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" name="exempt" defaultChecked={c.billing_exempt} />{b.exempt}</label>
                  <label className="flex items-center gap-1.5">{b.trialEnds}<input type="date" name="trial" defaultValue={ymd(c.trial_ends_at)} className={fieldCls} /></label>
                  <button className={btnCls}>{t.admin.save}</button>
                </form>
                {!c.billing_exempt && (
                  <RecordPaymentForm lang={lang} t={t} clinicId={c.id}
                    price={{ monthly: planPrice(c.plan, "monthly", c.founder), yearly: planPrice(c.plan, "yearly", c.founder) }} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`${t.admin.leads} (${leads?.length ?? 0})`}>
        {!leads?.length ? <p className="text-muted">{t.admin.empty}</p> : (
          <ul className="divide-y divide-line">
            {leads.map((l) => (
              <li key={l.id} className="space-y-3 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{l.clinic} <span className="text-sm text-muted">· {l.city}</span></p>
                    <p className="text-sm text-muted">
                      {fill(t.admin.detail, { branches: l.branches, chairs: l.chairs, doctors: l.doctors })} · {date.format(new Date(l.created_at))}
                    </p>
                    <p className="text-sm">
                      {l.contact_name} · <a dir="ltr" href={`https://wa.me/${l.phone.slice(1)}`} target="_blank" rel="noopener noreferrer" className="text-teal">{l.phone}</a>
                      {l.email && <> · <span dir="ltr">{l.email}</span></>}
                    </p>
                  </div>
                  <form key={l.status} action={updateLeadStatus} className="flex items-center gap-2">
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="id" value={l.id} />
                    <select name="status" defaultValue={l.status} aria-label={t.admin.cols.status} className={fieldCls}>
                      {LEAD_STATUSES.map((s) => <option key={s} value={s}>{t.leadStatus[s]}</option>)}
                    </select>
                    <button className={btnCls}>{t.admin.save}</button>
                  </form>
                </div>
                <ActivateLeadForm lang={lang} t={t} leadId={l.id} activated={l.status === "won"} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
