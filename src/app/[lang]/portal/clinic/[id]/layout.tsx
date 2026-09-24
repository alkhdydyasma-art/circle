import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { hasLocale } from "@/i18n";
import { getPortalDictionary } from "@/i18n/portal";
import { getClinicContext } from "@/lib/clinic-context";
import { ClinicNav, type NavKey } from "@/components/portal/ClinicNav";
import { Badge, statusTone } from "@/components/portal/ui";

export default async function ClinicLayout({ children, params }: LayoutProps<"/[lang]/portal/clinic/[id]">) {
  const { lang, id } = await params;
  if (!hasLocale(lang)) notFound();
  const ctx = await getClinicContext(id);
  const t = getPortalDictionary(lang);
  const base = `/${lang}/portal/clinic/${id}`;

  // Menu mirrors what RLS allows each role to do.
  const keys: NavKey[] = ["today", "appointments", "patients", ...(ctx.canManage ? (["services", "doctors", "website", "team"] as const) : [])];
  const items = keys.map((key) => ({ key, label: t.dash.nav[key], href: key === "today" ? base : `${base}/${key}` }));

  return (
    <div className="grid gap-8 md:grid-cols-[13rem_1fr]">
      <aside className="md:sticky md:top-6 md:h-fit">
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
      <div className="min-w-0">{children}</div>
    </div>
  );
}
