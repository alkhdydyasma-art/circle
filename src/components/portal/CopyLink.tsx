"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

// Read-only link with a one-tap copy button.
export function CopyLink({ url, copy, copied }: { url: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-stretch gap-2">
      <code dir="ltr" className="min-w-0 flex-1 truncate rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm select-all">{url}</code>
      <button
        type="button"
        onClick={async () => { await navigator.clipboard.writeText(url).catch(() => {}); setDone(true); setTimeout(() => setDone(false), 2000); }}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 text-sm transition hover:border-teal hover:text-teal"
      >
        {done ? <Check className="size-4 text-teal" /> : <Copy className="size-4" />}{done ? copied : copy}
      </button>
    </div>
  );
}
