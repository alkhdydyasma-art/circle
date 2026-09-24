import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { getClinicContext } from "@/lib/clinic-context";
import { createClient } from "@/lib/supabase/server";
import { Card, inputCls } from "@/components/portal/ui";

type Patient = { id: string; full_name: string; phone: string; created_at: string; source: string };

export default async function PatientsPage({ params, searchParams }: PageProps<"/[lang]/portal/clinic/[id]/patients">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  await getClinicContext(id);
  const t = getPortalDictionary(lang);
  const raw = (await searchParams).q;
  // Strip PostgREST filter syntax characters from the search term.
  const q = typeof raw === "string" ? raw.replace(/[(),.*%\\]/g, " ").trim().slice(0, 60) : "";
  const supabase = await createClient();

  let query = supabase.from("patients").select("id, full_name, phone, created_at, source").eq("clinic_id", id).order("created_at", { ascending: false }).limit(100);
  if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q.replace(/^0/, "")}%`);
  const { data } = await query.returns<Patient[]>();
  const date = new Intl.DateTimeFormat(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t.dash.patients.title}</h1>
      <form className="relative max-w-md">
        <Search className="pointer-events-none absolute start-3 top-2.5 size-4 text-muted" />
        <input name="q" defaultValue={q} placeholder={t.dash.patients.search} className={`${inputCls} ps-9`} />
      </form>
      <Card title={`${t.dash.patients.title} (${data?.length ?? 0})`}>
        {!data?.length ? <p className="text-muted">{t.dash.patients.empty}</p> : (
          <ul className="divide-y divide-line">
            {data.map((p) => (
              <li key={p.id}>
                <Link href={`/${lang}/portal/clinic/${id}/patients/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-teal">
                  <span className="font-medium">{p.full_name}</span>
                  <span className="flex items-center gap-4 text-sm text-muted">
                    <span dir="ltr">{p.phone}</span>
                    <span>{t.dash.patients.since} {date.format(new Date(p.created_at))}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
