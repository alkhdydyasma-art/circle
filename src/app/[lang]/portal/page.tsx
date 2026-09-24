import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { createClient, getUser } from "@/lib/supabase/server";
import { Badge, Card, statusTone } from "@/components/portal/ui";

type Row = { role: "owner" | "manager" | "doctor" | "reception"; clinics: { id: string; name: string; status: "pending" | "active" | "suspended" } };

// Sends staff to the admin view and single-clinic members straight to their clinic.
export default async function PortalHome({ params }: PageProps<"/[lang]/portal">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getPortalDictionary(lang);
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (isAdmin) redirect(`/${lang}/portal/admin`);

  // RLS also exposes teammates' rows, so narrow to this user's own memberships.
  const user = await getUser();
  const { data } = await supabase
    .from("clinic_members")
    .select("role, clinics(id, name, status)")
    .eq("user_id", user!.id)
    .returns<Row[]>();
  const rows = data ?? [];
  if (rows.length === 1) redirect(`/${lang}/portal/clinic/${rows[0].clinics.id}`);

  return (
    <Card title={t.home.chooseClinic}>
      {rows.length === 0 ? (
        <p className="text-muted">{t.home.noClinic}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(({ role, clinics: c }) => (
            <li key={c.id}>
              <Link href={`/${lang}/portal/clinic/${c.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-teal">
                <span className="font-medium">{c.name}</span>
                <span className="flex items-center gap-2">
                  <Badge>{t.roles[role]}</Badge>
                  <Badge tone={statusTone[c.status]}>{t.clinicStatus[c.status]}</Badge>
                  <ChevronLeft className="size-4 ltr:rotate-180" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
