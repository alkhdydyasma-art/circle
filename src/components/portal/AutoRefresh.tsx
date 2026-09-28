"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Re-renders the page's server data every `seconds` while the tab is visible,
// so new WhatsApp messages show up without a manual reload.
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
