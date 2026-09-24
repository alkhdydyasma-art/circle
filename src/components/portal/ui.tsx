import type { ReactNode } from "react";

// fieldCls has no width so it can sit inline; inputCls fills its container.
export const fieldCls =
  "rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none transition focus:border-teal focus:ring-4 focus:ring-teal/10";
export const inputCls = `w-full ${fieldCls}`;
export const btnCls =
  "bg-brand-gradient rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60";
export const ghostBtnCls =
  "rounded-lg border border-line px-3 py-1.5 text-sm text-muted transition hover:border-rose-400/60 hover:text-rose-500";

export function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-card">
      <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

const tones = {
  teal: "bg-teal/15 text-teal",
  amber: "bg-amber-400/15 text-amber-600 dark:text-amber-400",
  rose: "bg-rose-400/15 text-rose-600 dark:text-rose-400",
  muted: "bg-line text-muted",
} as const;

export function Badge({ tone = "muted", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export const statusTone = { active: "teal", pending: "amber", suspended: "rose" } as const;
