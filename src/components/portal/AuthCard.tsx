import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";

export function AuthCard({ lang, title, subtitle, children }: {
  lang: string; title: string; subtitle?: ReactNode; children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Link href={`/${lang}`} className="mb-8 flex justify-center"><Logo /></Link>
        <div className="rounded-xl border border-line bg-card p-7 shadow-2xl shadow-black/10">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
