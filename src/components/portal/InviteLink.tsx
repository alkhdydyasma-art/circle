"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";

export function InviteLink({ link, label, copy, copied, share }: {
  link: string; label: string; copy: string; copied: string; share: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-4 rounded-lg border border-teal/40 bg-teal/5 p-4 text-sm">
      <p className="text-muted">{label}</p>
      <code dir="ltr" className="mt-2 block break-all rounded bg-bg p-2 text-xs">{link}</code>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(link).then(() => setDone(true))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-3 py-1.5"
        >
          {done ? <Check className="size-4 text-teal" /> : <Copy className="size-4" />}
          {done ? copied : copy}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(link)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-whatsapp px-3 py-1.5 font-medium text-white"
        >
          <MessageCircle className="size-4" />
          {share}
        </a>
      </div>
    </div>
  );
}
