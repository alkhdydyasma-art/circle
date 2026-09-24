"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Globe, LayoutDashboard, Settings, Sparkles, Stethoscope, Users } from "lucide-react";

const ICONS = { today: LayoutDashboard, appointments: CalendarDays, patients: Users, services: Sparkles, doctors: Stethoscope, website: Globe, team: Settings };
export type NavKey = keyof typeof ICONS;

export function ClinicNav({ base, items }: { base: string; items: { key: NavKey; label: string; href: string }[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
      {items.map(({ key, label, href }) => {
        const Icon = ICONS[key];
        const active = href === base ? path === base : path.startsWith(href);
        return (
          <Link
            key={key}
            href={href}
            className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
              active ? "bg-teal/10 font-semibold text-teal" : "text-muted hover:bg-card hover:text-ink"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
