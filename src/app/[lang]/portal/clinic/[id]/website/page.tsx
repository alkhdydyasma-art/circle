import { notFound } from "next/navigation";
import { Eye, Globe } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { saveSite, setPublished } from "@/app/actions/clinic";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Field } from "@/components/portal/ActionForm";
import { Badge, Card, inputCls } from "@/components/portal/ui";
import { FONTS } from "@/templates/fonts";
import { TEMPLATES, safeColor } from "@/templates/theme";

type Site = {
  slug: string; published: boolean; template: string;
  brand: { primary?: string; accent?: string; font?: string; logo_url?: string; hero_image_url?: string };
  content: { tagline?: string; about?: string; sections?: Record<string, boolean> };
  phone: string | null; whatsapp: string | null; email: string | null;
  slot_minutes: number; booking_days_ahead: number; min_notice_minutes: number;
};

const FONT_LABELS: Record<keyof typeof FONTS, string> = { plex: "IBM Plex Sans Arabic", tajawal: "Tajawal", cairo: "Cairo", readex: "Readex Pro" };

export default async function WebsitePage({ params }: PageProps<"/[lang]/portal/clinic/[id]/website">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const ctx = await getClinicContext(id);
  if (!ctx.canManage) notFound();
  const t = getPortalDictionary(lang);
  const w = t.dash.website;
  const supabase = await createClient();
  const { data: site } = await supabase.from("clinic_sites").select("*").eq("clinic_id", id).single<Site>();
  if (!site) notFound();

  const sections = site.content.sections ?? {};
  const canPublish = ctx.clinic.status === "active";
  const m = { saved: w.saved, invalid: t.dash.saveError, denied: t.clinic.denied, slugTaken: w.slugTaken, error: t.clinic.error };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{w.title}</h1>
        <a href={`/${lang}/preview/${id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm hover:text-teal">
          <Eye className="size-4" />{w.preview}
        </a>
      </div>

      <Card title={site.published ? w.published : w.draft} action={site.published ? <Badge tone="teal">{w.published}</Badge> : <Badge tone="amber">{w.draft}</Badge>}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p dir="ltr" className="flex items-center gap-2 text-sm text-muted"><Globe className="size-4" />/{lang}/c/{site.slug}</p>
          {canPublish ? (
            <form action={setPublished}>
              <input type="hidden" name="lang" value={lang} /><input type="hidden" name="clinicId" value={id} />
              <input type="hidden" name="published" value={String(!site.published)} />
              <button className={site.published ? "rounded-lg border border-line px-4 py-2 text-sm" : "bg-brand-gradient rounded-lg px-4 py-2 text-sm font-semibold text-white"}>
                {site.published ? w.unpublish : w.publish}
              </button>
            </form>
          ) : <p className="text-sm text-muted">{w.publishNeedsActive}</p>}
        </div>
      </Card>

      <ActionForm version={JSON.stringify(site)} action={saveSite} hidden={{ lang, clinicId: id }} messages={m} submitLabel={w.save} className="space-y-6">
        <Card title={w.template}>
          <div className="grid gap-3 sm:grid-cols-3">
            {TEMPLATES.map((k) => (
              <label key={k} className="cursor-pointer rounded-xl border border-line p-4 text-sm has-checked:border-teal has-checked:bg-teal/10">
                <input type="radio" name="template" value={k} defaultChecked={site.template === k} className="sr-only" />
                <span className="font-semibold">{w.templates[k]}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label={w.primary}><input type="color" name="primary" defaultValue={safeColor(site.brand.primary, "#0e7490")} className="h-10 w-full cursor-pointer rounded-lg border border-line bg-bg" /></Field>
            <Field label={w.accent}><input type="color" name="accent" defaultValue={safeColor(site.brand.accent, "#14b8a6")} className="h-10 w-full cursor-pointer rounded-lg border border-line bg-bg" /></Field>
            <Field label={w.font}>
              <select name="font" defaultValue={site.brand.font ?? "plex"} className={inputCls}>
                {(Object.keys(FONTS) as (keyof typeof FONTS)[]).map((f) => <option key={f} value={f}>{FONT_LABELS[f]}</option>)}
              </select>
            </Field>
            <Field label={w.logo} className="sm:col-span-3"><input name="logo_url" type="url" dir="ltr" defaultValue={site.brand.logo_url ?? ""} placeholder="https://" className={inputCls} /></Field>
            <Field label={w.hero} className="sm:col-span-3"><input name="hero_image_url" type="url" dir="ltr" defaultValue={site.brand.hero_image_url ?? ""} placeholder="https://" className={inputCls} /></Field>
          </div>
        </Card>

        <Card title={w.content}>
          <div className="space-y-3">
            <Field label={w.slug}>
              <div className="flex items-center gap-2" dir="ltr">
                <span className="text-sm text-muted">/{lang}/c/</span>
                <input required name="slug" defaultValue={site.slug} pattern="[a-z0-9](-?[a-z0-9])*" minLength={3} maxLength={40} className={inputCls} />
              </div>
            </Field>
            <Field label={w.tagline}><input name="tagline" maxLength={160} defaultValue={site.content.tagline ?? ""} className={inputCls} /></Field>
            <Field label={w.about}><textarea name="about" rows={3} maxLength={1200} defaultValue={site.content.about ?? ""} className={inputCls} /></Field>
            <fieldset>
              <legend className="mb-1.5 text-sm text-muted">{w.sections}</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {(["services", "doctors", "branches"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="checkbox" name={`s_${k}`} defaultChecked={sections[k] !== false} className="size-4 accent-teal-500" />
                    {w.sectionNames[k]}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Card>

        <Card title={w.contact}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={w.phone}><input name="phone" dir="ltr" maxLength={30} defaultValue={site.phone ?? ""} className={inputCls} /></Field>
            <Field label={w.whatsapp}><input name="whatsapp" dir="ltr" defaultValue={site.whatsapp ?? ""} placeholder="05XXXXXXXX" className={inputCls} /></Field>
            <Field label={w.email}><input name="email" type="email" dir="ltr" defaultValue={site.email ?? ""} className={inputCls} /></Field>
          </div>
        </Card>

        <Card title={w.booking}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={w.slot}>
              <select name="slot_minutes" defaultValue={site.slot_minutes} className={inputCls}>
                {[10, 15, 20, 30, 60].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
            <Field label={w.daysAhead}><input name="booking_days_ahead" type="number" min={1} max={180} defaultValue={site.booking_days_ahead} className={inputCls} /></Field>
            <Field label={w.notice}><input name="min_notice_minutes" type="number" min={0} max={10080} step={15} defaultValue={site.min_notice_minutes} className={inputCls} /></Field>
          </div>
        </Card>
      </ActionForm>
    </div>
  );
}
