"use client";

import { useEffect, useState, type ReactNode } from "react";

// Submit button for destructive actions (cancel, no-show): the first tap arms it and shows
// "Sure? Tap again", the second tap submits. Disarms itself after a few seconds, so a stray
// tap on a busy front desk never cancels a patient's visit.
export function ConfirmButton({ children, sure, className }: { children: ReactNode; sure: string; className: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      onClick={(e) => { if (!armed) { e.preventDefault(); setArmed(true); } }}
      className={`${className} ${armed ? "border-rose-500 bg-rose-500 text-white hover:bg-rose-600 hover:text-white" : ""}`}
    >
      {armed ? sure : children}
    </button>
  );
}
