import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { createClient, getUser } from "@/lib/supabase/server";
import { changeRole, removeMember, revokeInvite } from "@/app/actions/portal";
import { ClinicDetailsForm, InviteMemberForm } from "@/components/portal/Forms";
import { Badge, Card, ghostBtnCls, statusTone, fieldCls } from "@/components/portal/ui";

type Role = "owner" | "manager" | "doctor" | "reception";
const ALL_ROLES: Role[] = ["owner", "manager", "doctor", "reception"];

type Clinic = {
  id: string; name: string; city: string; status: "pending" | "active" | "suspended";
  plan: "starter" | "standard" | "pro"; platform: "smart_clinic" | "medent"; platform_url: string | null;
};
type Member = { user_id: string; email: string; role: Role; created_at: string };
type Invite = { id: string; email: string; role: Role; expires_at: string };
type Audit = { id: number; created_at: string; action: string };

export default async function ClinicPage({ params }: PageProps<"/[lang]/portal/clinic/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = getPortalDictionary(lang);
  const supabase = await createClient();
  const user = await getUser();

  // RLS: returns the row only if this user belongs to the clinic (or is Circle staff).
  const { data: clinic } = await supabase.from("clinics").select("*").eq("id", id).maybeSingle<Clinic>();
  if (!clinic) notFound();

  const [{ data: isAdmin }, { data: myRole }, { data: teamData }] = await Promise.all([
    supabase.rpc("is_platform_admin"),
    supabase.rpc("clinic_role_of", { p_clinic: id }),
    supabase.rpc("clinic_team", { p_clinic: id }),
  ]);
  const team = (teamData ?? []) as Member[];
  const role = myRole as Role | null;
  const canManage = Boolean(isAdmin) || role === "owner" || role === "manager";
  // Roles this user may hand out — mirrors public.can_assign_role in the database.
  const assignable: Role[] = isAdmin || role === "owner" ? ALL_ROLES : role === "manager" ? ["doctor", "reception"] : [];

  const [{ data: invites }, { data: audit }] = canManage
    ? await Promise.all([
        supabase.from("clinic_invitations").select("id, email, role, expires_at").eq("clinic_id", id).is("accepted_at", null).order("created_at").returns<Invite[]>(),
        supabase.from("audit_log").select("id, created_at, action").eq("clinic_id", id).order("created_at", { ascending: false }).limit(15).returns<Audit[]>(),
      ])
    : [{ data: [] as Invite[] }, { data: [] as Audit[] }];

  const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{clinic.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone={statusTone[clinic.status]}>{t.clinicStatus[clinic.status]}</Badge>
            {t.platforms[clinic.platform]} · {t.plans[clinic.plan]}
            {role && <Badge>{t.roles[role]}</Badge>}
          </p>
        </div>
        {clinic.status === "active" && clinic.platform_url ? (
          <a href={clinic.platform_url} target="_blank" rel="noopener noreferrer" className="bg-brand-gradient inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold text-white">
            {t.clinic.openPlatform}
            <ExternalLink className="size-4" />
          </a>
        ) : (
          <p className="text-sm text-muted">{t.clinic.notActive}</p>
        )}
      </div>

      <Card title={t.clinic.details}>
        <ClinicDetailsForm lang={lang} t={t} clinic={clinic} canEdit={canManage} />
      </Card>

      <Card title={`${t.clinic.team} (${team.length})`}>
        <ul className="divide-y divide-line">
          {team.map((m) => {
            const editable = assignable.includes(m.role) && m.user_id !== user?.id;
            return (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span dir="ltr" className="text-sm">
                  {m.email} {m.user_id === user?.id && <span className="text-muted">({t.clinic.you})</span>}
                </span>
                {editable ? (
                  <div className="flex items-center gap-2">
                    <form action={changeRole} className="flex items-center gap-2">
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="clinicId" value={id} />
                      <input type="hidden" name="userId" value={m.user_id} />
                      <select name="role" defaultValue={m.role} aria-label={t.clinic.changeRole} className={fieldCls}>
                        {assignable.map((r) => <option key={r} value={r}>{t.roles[r]}</option>)}
                      </select>
                      <button className="rounded-lg border border-line px-3 py-1.5 text-sm">{t.admin.save}</button>
                    </form>
                    <form action={removeMember}>
                      <input type="hidden" name="lang" value={lang} />
                      <input type="hidden" name="clinicId" value={id} />
                      <input type="hidden" name="userId" value={m.user_id} />
                      <button className={ghostBtnCls}>{t.clinic.remove}</button>
                    </form>
                  </div>
                ) : (
                  <Badge>{t.roles[m.role]}</Badge>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {assignable.length > 0 && (
        <Card title={t.clinic.invite}>
          <InviteMemberForm lang={lang} t={t} clinicId={id} roles={assignable} />
          {!!invites?.length && (
            <div className="mt-6">
              <p className="mb-2 text-sm font-medium text-muted">{t.clinic.pending}</p>
              <ul className="divide-y divide-line">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <span dir="ltr">{inv.email}</span>
                    <span className="flex items-center gap-3">
                      <Badge>{t.roles[inv.role]}</Badge>
                      <span className="text-muted">{t.clinic.expires} {date.format(new Date(inv.expires_at))}</span>
                      <form action={revokeInvite}>
                        <input type="hidden" name="lang" value={lang} />
                        <input type="hidden" name="clinicId" value={id} />
                        <input type="hidden" name="id" value={inv.id} />
                        <button className={ghostBtnCls}>{t.clinic.revoke}</button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card title={t.clinic.permissions}>
        <dl className="grid gap-3 sm:grid-cols-2">
          {ALL_ROLES.map((r) => (
            <div key={r} className="rounded-lg border border-line bg-bg p-3">
              <dt className="text-sm font-semibold">{t.roles[r]}</dt>
              <dd className="mt-1 text-sm text-muted">{t.clinic.permissionsHelp[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {canManage && !!audit?.length && (
        <Card title={t.clinic.audit}>
          <ul className="space-y-2 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex justify-between gap-4">
                <span>{t.clinic.auditActions[a.action] ?? a.action}</span>
                <span className="text-muted">{date.format(new Date(a.created_at))}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
