"use client";

import { Fragment, useActionState, type ReactNode } from "react";
import type { FormState } from "@/app/actions/clinic";

type Messages = { saved: string; invalid: string; denied: string; overlap?: string; slugTaken?: string; error: string };

// Wraps a server action with pending state and a status line. Hidden fields go in `hidden`.
// `version` should change when the saved data changes: the fields remount with the fresh
// values while the form (and its status message) stays mounted.
export function ActionForm({
  action, hidden, messages, submitLabel, children, className = "space-y-3", version, secretLabel,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  messages: Messages;
  submitLabel: string;
  children: ReactNode;
  className?: string;
  version?: string;
  /** Shown above a one-time secret returned by the action (e.g. a new API key). */
  secretLabel?: string;
}) {
  const [state, run, pending] = useActionState(action, {});
  const msg = state.ok
    ? messages.saved
    : state.error === "overlap" ? messages.overlap ?? messages.error
    : state.error === "slug_taken" ? messages.slugTaken ?? messages.error
    : state.error ? messages[state.error === "invalid" ? "invalid" : state.error === "denied" ? "denied" : "error"]
    : null;

  return (
    <form action={run} className={className}>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Fragment key={version}>{children}</Fragment>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="bg-brand-gradient rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
          {submitLabel}
        </button>
        {msg && <span role="status" className={`text-sm ${state.ok ? "text-teal" : "text-rose-500"}`}>{msg}</span>}
      </div>
      {state.secret && (
        <div className="rounded-lg border border-amber-400/50 bg-amber-400/10 p-3 text-sm">
          <p className="text-muted">{secretLabel}</p>
          <code dir="ltr" className="mt-2 block break-all rounded bg-bg p-2 font-mono text-xs select-all">{state.secret}</code>
        </div>
      )}
    </form>
  );
}

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block text-muted">{label}</span>
      {children}
    </label>
  );
}
