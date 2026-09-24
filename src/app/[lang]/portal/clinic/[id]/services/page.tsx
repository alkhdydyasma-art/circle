import { notFound } from "next/navigation";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { deleteService, saveService } from "@/app/actions/clinic";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Field } from "@/components/portal/ActionForm";
import { Card, ghostBtnCls, inputCls } from "@/components/portal/ui";

type Service = { id: string; name: string; description: string | null; duration_minutes: number; price: number | null; is_active: boolean };

function ServiceFields({ s, t }: { s?: Service; t: ReturnType<typeof getPortalDictionary>["dash"]["services"] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
      <Field label={t.name}><input required name="name" maxLength={120} defaultValue={s?.name} className={inputCls} /></Field>
      <Field label={t.duration}><input required name="duration_minutes" type="number" min={5} max={480} step={5} defaultValue={s?.duration_minutes ?? 30} className={inputCls} /></Field>
      <Field label={t.price}><input name="price" type="number" min={0} step="any" defaultValue={s?.price ?? ""} className={inputCls} /></Field>
      <Field label={t.description} className="sm:col-span-3"><input name="description" maxLength={600} defaultValue={s?.description ?? ""} className={inputCls} /></Field>
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <input type="checkbox" name="is_active" defaultChecked={s?.is_active ?? true} className="size-4 accent-teal-500" />{t.active}
      </label>
    </div>
  );
}

export default async function ServicesPage({ params }: PageProps<"/[lang]/portal/clinic/[id]/services">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const ctx = await getClinicContext(id);
  if (!ctx.canManage) notFound();
  const t = getPortalDictionary(lang);
  const st = t.dash.services;
  const supabase = await createClient();
  const { data } = await supabase.from("services").select("id, name, description, duration_minutes, price, is_active").eq("clinic_id", id).order("sort").order("name").returns<Service[]>();
  const m = { saved: t.dash.patients.saved, invalid: t.dash.saveError, denied: t.clinic.denied, error: t.clinic.error };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{st.title}</h1>
      {(data ?? []).map((s) => (
        <Card key={s.id} title={s.name} action={
          <form action={deleteService}>
            <input type="hidden" name="lang" value={lang} /><input type="hidden" name="clinicId" value={id} /><input type="hidden" name="id" value={s.id} />
            <button className={ghostBtnCls}>{st.remove}</button>
          </form>
        }>
          <ActionForm version={JSON.stringify(s)} action={saveService} hidden={{ lang, clinicId: id, id: s.id }} messages={m} submitLabel={st.save}>
            <ServiceFields s={s} t={st} />
          </ActionForm>
        </Card>
      ))}
      <Card title={st.add}>
        <ActionForm action={saveService} hidden={{ lang, clinicId: id }} messages={m} submitLabel={st.add}>
          <ServiceFields t={st} />
        </ActionForm>
      </Card>
    </div>
  );
}
