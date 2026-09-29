"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Polls the clinic's alert counts every 20s while the tab is visible and refreshes the page
// only when they change, so a new emergency shows up on every dashboard page within seconds.
export function AlertWatcher({ clinicId, emergencies, waiting }: { clinicId: string; emergencies: number; waiting: number }) {
  const router = useRouter();
  const last = useRef(`${emergencies}:${waiting}`);
  useEffect(() => { last.current = `${emergencies}:${waiting}`; }, [emergencies, waiting]);
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/portal/clinic/${clinicId}/alerts`, { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as { emergencies: number; waiting: number };
        if (`${d.emergencies}:${d.waiting}` !== last.current) {
          last.current = `${d.emergencies}:${d.waiting}`;
          router.refresh();
        }
      } catch { /* offline: try again next tick */ }
    };
    const t = setInterval(tick, 20_000);
    return () => clearInterval(t);
  }, [clinicId, router]);
  useEffect(() => {
    if (!emergencies) return;
    const base = document.title;
    let on = false;
    const t = setInterval(() => { on = !on; document.title = on ? "🚨 " + base : base; }, 1000);
    return () => { clearInterval(t); document.title = base; };
  }, [emergencies]);
  return null;
}
