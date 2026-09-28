"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Columns3, Globe, LayoutDashboard, MessagesSquare, Settings, Sparkles, Stethoscope, Users, Zap } from "lucide-react";

const ICONS = { today: LayoutDashboard, schedule: Columns3, appointments: CalendarDays, patients: Users, conversations: MessagesSquare, services: Sparkles, doctors: Stethoscope, website: Globe, automation: Zap, reports: BarChart3, team: Settings };
export type NavKey = keyof typeof ICONS;

export function ClinicNav({ base, items }: { base: string; items: { key: NavKey; label: string; href: string; badge?: number }[] }) {
  const path = usePathname();
  const nav = useRef<HTMLElement>(null);
  // On phones the menu is a scrolling strip: keep the current page's tab in view.
  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);
  return (
    <nav
      ref={nav}
      className="sticky top-0 z-30 -mx-4 flex gap-1 overflow-x-auto border-b border-line bg-bg/90 px-4 py-2 backdrop-blur-lg [scrollbar-width:none] md:static md:mx-0 md:flex-col md:overflow-visible md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
    >
      {items.map(({ key, label, href, badge }) => {
        const Icon = ICONS[key];
        const active = href === base ? path === base : path.startsWith(href);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
              active ? "bg-teal/10 font-semibold text-teal" : "text-muted hover:bg-card hover:text-ink"
            }`}
          >
            <Icon className="size-4" />
            {label}
            {!!badge && <span className="ms-auto rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white tabular-nums">{badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
