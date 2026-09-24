import { MessageCircle } from "lucide-react";
import { setAppointmentStatus } from "@/app/actions/clinic";
import type { PortalDictionary } from "@/i18n/portal";
import { Badge } from "./ui";

export type Appt = {
  id: string; starts_at: string; ends_at: string;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
  source: "website" | "whatsapp" | "dashboard" | "ai_agent";
  notes: string | null;
  patients: { id: string; full_name: string; phone: string } | null;
  services: { name: string } | null;
  doctors: { full_name: string } | null;
  branches: { name: string } | null;
};

export const APPT_SELECT =
  "id, starts_at, ends_at, status, source, notes, patients(id, full_name, phone), services(name), doctors(full_name), branches(name)";

const tone = { pending: "amber", confirmed: "teal", completed: "muted", cancelled: "rose", no_show: "rose" } as const;

// Next status actions per state. RLS/guards still decide if the user may apply them.
const NEXT: Record<Appt["status"], (keyof PortalDictionary["dash"]["actions"])[]> = {
  pending: ["confirm", "cancel"],
  confirmed: ["complete", "noShow", "cancel"],
  completed: [], cancelled: [], no_show: [],
};
const TO = { confirm: "confirmed", complete: "completed", noShow: "no_show", cancel: "cancelled" } as const;

export function AppointmentRow({ a, t, lang, clinicId, time, patientHref }: {
  a: Appt; t: PortalDictionary; lang: string; clinicId: string; time: string; patientHref?: string;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-start gap-4">
        <span className="min-w-16 shrink-0 pt-0.5 font-semibold tabular-nums"><bdi>{time}</bdi></span>
        <div className="min-w-0">
          <p className="font-medium">
            {patientHref && a.patients ? <a href={patientHref} className="hover:text-teal">{a.patients.full_name}</a> : a.patients?.full_name}
            {a.patients && (
              <a href={`https://wa.me/${a.patients.phone.slice(1)}`} target="_blank" rel="noopener noreferrer" className="ms-3 inline-flex items-center gap-1 align-middle text-xs font-normal text-muted hover:text-whatsapp" dir="ltr">
                <MessageCircle className="size-3" />{a.patients.phone}
              </a>
            )}
          </p>
          <p className="text-sm text-muted">{[a.services?.name, a.doctors?.full_name, a.branches?.name].filter(Boolean).join(" · ")}</p>
          {a.notes && <p className="mt-0.5 text-xs text-muted">“{a.notes}”</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone[a.status]}>{t.dash.status[a.status]}</Badge>
        <Badge>{t.dash.source[a.source]}</Badge>
        {NEXT[a.status].map((action) => (
          <form key={action} action={setAppointmentStatus}>
            <input type="hidden" name="lang" value={lang} />
            <input type="hidden" name="clinicId" value={clinicId} />
            <input type="hidden" name="id" value={a.id} />
            <input type="hidden" name="status" value={TO[action]} />
            <button className={`rounded-lg border px-2.5 py-1 text-xs transition ${
              action === "cancel" || action === "noShow" ? "border-line text-muted hover:border-rose-400 hover:text-rose-500" : "border-teal/40 text-teal hover:bg-teal/10"
            }`}>
              {t.dash.actions[action]}
            </button>
          </form>
        ))}
      </div>
    </li>
  );
}
