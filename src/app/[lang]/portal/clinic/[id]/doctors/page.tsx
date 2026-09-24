import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { saveBranch, saveDoctor, saveHours } from "@/app/actions/clinic";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Field } from "@/components/portal/ActionForm";
import { HoursEditor } from "@/components/portal/HoursEditor";
import { Card, inputCls } from "@/components/portal/ui";

type Doctor = { id: string; full_name: string; title: string | null; specialty: string | null; bio: string | null; photo_url: string | null; user_id: string | null; is_active: boolean };
type Branch = { id: string; name: string; city: string | null; address: string | null; phone: string | null; maps_url: string | null; is_active: boolean };
type Member = { user_id: string; email: string; role: string };
type Dict = ReturnType<typeof getPortalDictionary>["dash"]["doctors"];

function DoctorFields({ d, t, services, linked, members }: { d?: Doctor; t: Dict; services: { id: string; name: string }[]; linked: Set<string>; members: Member[] }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t.name}><input required name="full_name" maxLength={120} defaultValue={d?.full_name} className={inputCls} /></Field>
        <Field label={t.titleField}><input name="title" maxLength={80} defaultValue={d?.title ?? ""} className={inputCls} /></Field>
        <Field label={t.specialty}><input name="specialty" maxLength={120} defaultValue={d?.specialty ?? ""} className={inputCls} /></Field>
      </div>
      <Field label={t.bio}><input name="bio" maxLength={1000} defaultValue={d?.bio ?? ""} className={inputCls} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.photo}><input name="photo_url" type="url" dir="ltr" defaultValue={d?.photo_url ?? ""} placeholder="https://" className={inputCls} /></Field>
        <Field label={t.account}>
          <select name="user_id" defaultValue={d?.user_id ?? ""} className={inputCls}>
            <option value="">{t.noAccount}</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
          </select>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm text-muted">{t.services}</legend>
        <div className="flex flex-wrap gap-2">
          {services.map((s) => (
            <label key={s.id} className="cursor-pointer rounded-full border border-line px-3 py-1 text-sm has-checked:border-teal has-checked:bg-teal/10 has-checked:text-teal">
              <input type="checkbox" name="services" value={s.id} defaultChecked={linked.has(s.id)} className="sr-only" />{s.name}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={d?.is_active ?? true} className="size-4 accent-teal-500" />{t.active}</label>
    </div>
  );
}

export default async function DoctorsPage({ params }: PageProps<"/[lang]/portal/clinic/[id]/doctors">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const ctx = await getClinicContext(id);
  if (!ctx.canManage) notFound();
  const t = getPortalDictionary(lang);
  const dt = t.dash.doctors;
  const supabase = await createClient();

  const [{ data: doctors }, { data: services }, { data: branches }, { data: links }, { data: hours }, { data: team }] = await Promise.all([
    supabase.from("doctors").select("id, full_name, title, specialty, bio, photo_url, user_id, is_active").eq("clinic_id", id).order("sort").returns<Doctor[]>(),
    supabase.from("services").select("id, name").eq("clinic_id", id).order("sort").returns<{ id: string; name: string }[]>(),
    supabase.from("branches").select("id, name, city, address, phone, maps_url, is_active").eq("clinic_id", id).order("created_at").returns<Branch[]>(),
    supabase.from("doctor_services").select("doctor_id, service_id").eq("clinic_id", id).returns<{ doctor_id: string; service_id: string }[]>(),
    supabase.from("working_hours").select("doctor_id, weekday, branch_id, start_time, end_time").eq("clinic_id", id).order("weekday").returns<{ doctor_id: string; weekday: number; branch_id: string; start_time: string; end_time: string }[]>(),
    supabase.rpc("clinic_team", { p_clinic: id }),
  ]);
  const doctorMembers = ((team ?? []) as Member[]).filter((m) => m.role === "doctor");
  const linkedOf = (doctorId: string) => new Set((links ?? []).filter((l) => l.doctor_id === doctorId).map((l) => l.service_id));
  const activeBranches = (branches ?? []).filter((b) => b.is_active);
  const m = { saved: t.dash.patients.saved, invalid: t.dash.saveError, denied: t.clinic.denied, error: t.clinic.error };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{dt.title}</h1>

      {(doctors ?? []).map((d) => (
        <Card key={d.id} title={d.full_name}>
          <ActionForm version={JSON.stringify([d, [...linkedOf(d.id)]])} action={saveDoctor} hidden={{ lang, clinicId: id, id: d.id }} messages={m} submitLabel={dt.save}>
            <DoctorFields d={d} t={dt} services={services ?? []} linked={linkedOf(d.id)} members={doctorMembers} />
          </ActionForm>
          <div className="mt-6 border-t border-line pt-5">
            <p className="mb-3 text-sm font-semibold">{dt.hours}</p>
            <ActionForm version={JSON.stringify((hours ?? []).filter((h) => h.doctor_id === d.id))} action={saveHours} hidden={{ lang, clinicId: id, doctorId: d.id }} messages={m} submitLabel={dt.save}>
              <HoursEditor initial={(hours ?? []).filter((h) => h.doctor_id === d.id)} branches={activeBranches} weekdays={t.dash.weekdays} addLabel={dt.addHours} />
            </ActionForm>
          </div>
        </Card>
      ))}

      <Card title={dt.add}>
        <ActionForm action={saveDoctor} hidden={{ lang, clinicId: id }} messages={m} submitLabel={dt.add}>
          <DoctorFields t={dt} services={services ?? []} linked={new Set()} members={doctorMembers} />
        </ActionForm>
      </Card>

      <h2 className="pt-4 text-xl font-semibold">{dt.branches}</h2>
      {[...(branches ?? []), null].map((b) => (
        <Card key={b?.id ?? "new"} title={b?.name ?? dt.addBranch}>
          <ActionForm version={b ? JSON.stringify(b) : undefined} action={saveBranch} hidden={{ lang, clinicId: id, ...(b && { id: b.id }) }} messages={m} submitLabel={b ? dt.save : dt.addBranch}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={dt.branchName}><input required name="name" maxLength={120} defaultValue={b?.name} className={inputCls} /></Field>
              <Field label={dt.phone}><input name="phone" maxLength={30} dir="ltr" defaultValue={b?.phone ?? ""} className={`${inputCls} rtl:text-right`} /></Field>
              <Field label={dt.address}><input name="address" maxLength={300} defaultValue={b?.address ?? ""} className={inputCls} /></Field>
              <Field label={dt.maps}><input name="maps_url" type="url" dir="ltr" defaultValue={b?.maps_url ?? ""} placeholder="https://" className={inputCls} /></Field>
            </div>
            <input type="hidden" name="city" value={b?.city ?? ctx.clinic.city} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={b?.is_active ?? true} className="size-4 accent-teal-500" />{t.dash.services.active}</label>
          </ActionForm>
        </Card>
      ))}
    </div>
  );
}
