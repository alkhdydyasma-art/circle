import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { saveClinical, updatePatient } from "@/app/actions/clinic";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Field } from "@/components/portal/ActionForm";
import { APPT_SELECT, AppointmentRow, type Appt } from "@/components/portal/AppointmentRow";
import { Card, inputCls } from "@/components/portal/ui";

type Patient = { id: string; full_name: string; phone: string; email: string | null; gender: "male" | "female" | null; birth_date: string | null; notes: string | null };
type Clinical = { medical_history: string | null; allergies: string | null };

export default async function PatientPage({ params }: PageProps<"/[lang]/portal/clinic/[id]/patients/[pid]">) {
  const { lang, id, pid } = await params;
  if (!hasLocale(lang) || !/^[0-9a-f-]{36}$/.test(pid)) notFound();
  const ctx = await getClinicContext(id);
  const t = getPortalDictionary(lang);
  const pt = t.dash.patients;
  const supabase = await createClient();

  // RLS: front desk sees every patient; a doctor only patients they treat.
  const { data: patient } = await supabase.from("patients").select("id, full_name, phone, email, gender, birth_date, notes")
    .eq("id", pid).eq("clinic_id", id).maybeSingle<Patient>();
  if (!patient) notFound();

  const showClinical = ctx.canManage || ctx.role === "doctor"; // RLS also limits doctors to their patients
  const [{ data: appts }, { data: clinical }] = await Promise.all([
    supabase.from("appointments").select(APPT_SELECT).eq("patient_id", pid).order("starts_at", { ascending: false }).limit(50).returns<Appt[]>(),
    showClinical
      ? supabase.from("patient_clinical").select("medical_history, allergies").eq("patient_id", pid).maybeSingle<Clinical>()
      : Promise.resolve({ data: null }),
  ]);
  const when = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { timeZone: ctx.site.timezone, dateStyle: "medium", timeStyle: "short" });
  const m = { saved: pt.saved, invalid: t.dash.saveError, denied: t.clinic.denied, error: t.clinic.error };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{patient.full_name}</h1>

      <Card title={pt.details}>
        <ActionForm version={JSON.stringify(patient)} action={updatePatient} hidden={{ lang, clinicId: id, id: pid }} messages={m} submitLabel={pt.save}>
          <fieldset disabled={!ctx.frontDesk} className="grid gap-3 sm:grid-cols-2">
            <Field label={pt.name}><input required name="full_name" defaultValue={patient.full_name} className={inputCls} /></Field>
            <Field label={pt.phone}><input required name="phone" type="tel" dir="ltr" defaultValue={patient.phone} className={`${inputCls} rtl:text-right`} /></Field>
            <Field label={pt.email}><input name="email" type="email" dir="ltr" defaultValue={patient.email ?? ""} className={`${inputCls} rtl:text-right`} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={pt.gender}>
                <select name="gender" defaultValue={patient.gender ?? ""} className={inputCls}>
                  <option value="">—</option><option value="male">{pt.male}</option><option value="female">{pt.female}</option>
                </select>
              </Field>
              <Field label={pt.birth}><input name="birth_date" type="date" defaultValue={patient.birth_date ?? ""} className={inputCls} /></Field>
            </div>
            <Field label={pt.notes} className="sm:col-span-2"><textarea name="notes" rows={2} maxLength={2000} defaultValue={patient.notes ?? ""} className={inputCls} /></Field>
          </fieldset>
        </ActionForm>
      </Card>

      {showClinical && (
        <Card title={pt.clinical} action={<span className="flex items-center gap-1 text-xs text-muted"><ShieldCheck className="size-3.5 text-teal" />{pt.clinicalHint}</span>}>
          <ActionForm version={JSON.stringify(clinical)} action={saveClinical} hidden={{ lang, clinicId: id, patientId: pid }} messages={m} submitLabel={pt.save}>
            <Field label={pt.allergies}><input name="allergies" maxLength={1000} defaultValue={clinical?.allergies ?? ""} className={inputCls} /></Field>
            <Field label={pt.history}><textarea name="medical_history" rows={4} maxLength={5000} defaultValue={clinical?.medical_history ?? ""} className={inputCls} /></Field>
          </ActionForm>
        </Card>
      )}

      <Card title={`${pt.visits} (${appts?.length ?? 0})`}>
        <ul className="divide-y divide-line">
          {(appts ?? []).map((a) => <AppointmentRow key={a.id} a={a} t={t} lang={lang} clinicId={id} time={when.format(new Date(a.starts_at))} />)}
        </ul>
      </Card>
    </div>
  );
}
