import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Eye } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getDraftSite } from "@/lib/site-preview";
import { getUser } from "@/lib/supabase/server";
import { ClinicSiteView } from "@/templates/ClinicSiteView";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Draft preview of a clinic website for its team — works before the site is published.
export default async function PreviewPage({ params }: PageProps<"/[lang]/preview/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang) || !/^[0-9a-f-]{36}$/.test(id)) notFound();
  if (!(await getUser())) redirect(`/${lang}/login`);
  const site = await getDraftSite(id);
  if (!site) notFound();
  return (
    <>
      <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-sm font-semibold text-amber-950">
        <Eye className="size-4" />
        {lang === "ar" ? "معاينة — هذه النسخة لا يراها الزوار" : "Preview — visitors can't see this version"}
      </div>
      <ClinicSiteView site={site} lang={lang} />
    </>
  );
}
