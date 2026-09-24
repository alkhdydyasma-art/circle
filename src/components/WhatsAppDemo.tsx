"use client";

import { useEffect, useState } from "react";
import { Bot, CalendarCheck, CheckCheck } from "lucide-react";
import type { Dictionary } from "@/i18n";

type Chat = Dictionary["chat"];

// Each tick reveals one message; bot messages are preceded by a "typing" beat.
// After the last message the dashboard toast shows, then the loop restarts.
export function WhatsAppDemo({ t }: { t: Chat }) {
  const total = t.messages.length;
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (shown > total) {
      const reset = setTimeout(() => setShown(0), 3500);
      return () => clearTimeout(reset);
    }
    const next = t.messages[shown];
    if (next?.from === "bot" && !typing) {
      const id = setTimeout(() => setTyping(true), 500);
      return () => clearTimeout(id);
    }
    const id = setTimeout(
      () => {
        setTyping(false);
        setShown((n) => n + 1);
      },
      shown === 0 ? 700 : typing ? 1400 : 1100,
    );
    return () => clearTimeout(id);
  }, [shown, typing, total, t.messages]);

  const showToast = shown > total - 1 && shown > 0;

  return (
    <div className="relative w-full max-w-[19rem]">

      <div className="animate-float overflow-hidden rounded-[1.75rem] border border-line bg-bg shadow-2xl shadow-black/20">
        <div className="flex items-center gap-3 bg-[#075e54] px-4 dark:bg-[#202c33] py-3 text-white">
          <span className="flex size-9 items-center justify-center rounded-full bg-white/15">
            <Bot className="size-5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">{t.header}</p>
            <p className="text-xs text-white/75">{typing ? t.typing : t.status}</p>
          </div>
        </div>

        <div
          className="flex h-[20rem] flex-col gap-2 overflow-hidden bg-[#efeae2] p-3 dark:bg-[#0b141a]"
          aria-live="polite"
        >
          {t.messages.slice(0, shown).map((m, i) => {
            const mine = m.from === "patient";
            return (
              <div
                key={i}
                className={`animate-pop max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                  mine
                    ? "self-end rounded-ee-sm bg-[#d9fdd3] text-zinc-900 dark:bg-[#005c4b] dark:text-zinc-100"
                    : "self-start rounded-es-sm bg-white text-zinc-900 dark:bg-[#202c33] dark:text-zinc-100"
                }`}
              >
                {m.text}
                {mine && <CheckCheck className="ms-1 inline size-3.5 text-sky-500" />}
              </div>
            );
          })}
          {typing && (
            <div className="animate-pop flex gap-1 self-start rounded-2xl bg-white px-3 dark:bg-[#202c33] py-3 shadow-sm">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="size-1.5 animate-bounce rounded-full bg-muted/60"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className={`absolute inset-x-0 -bottom-7 mx-auto w-64 transition-all duration-500 ${
          showToast ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        }`}
      >
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-bg p-3 shadow-xl shadow-black/20">
          <span className="bg-brand-gradient flex size-9 shrink-0 items-center justify-center rounded-xl text-white">
            <CalendarCheck className="size-5" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold">{t.toast}</p>
            <p className="truncate text-xs text-muted">{t.toastDetail}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
