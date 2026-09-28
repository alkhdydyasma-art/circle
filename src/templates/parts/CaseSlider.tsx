"use client";

/* eslint-disable @next/next/no-img-element -- clinic images are uploaded files or bundled demo images */
import { useState } from "react";
import { MoveHorizontal } from "lucide-react";

// Drag-to-compare before/after. The "before" photo is clipped over the "after" photo;
// a native range input drives it, so it works with touch, mouse and keyboard.
export function CaseSlider({
  before, after, title, labels,
}: {
  before: string; after: string; title: string;
  labels: { before: string; after: string; slider: string };
}) {
  const [pos, setPos] = useState(50);
  return (
    <figure className="relative px-3 pb-3 sm:px-4 sm:pb-4">
      <div aria-hidden className="absolute inset-x-0 top-8 bottom-0 rotate-2 rounded-[1.75rem] border border-[color-mix(in_srgb,var(--c-primary)_18%,transparent)] bg-[color-mix(in_srgb,var(--c-primary)_9%,transparent)]" />
      <div className="relative overflow-hidden rounded-[1.5rem] border-[6px] border-site-card bg-site-card shadow-[0_24px_60px_-20px_rgb(0_0_0/0.25)] ring-1 ring-site-line">
        <div className="relative aspect-[8/5] overflow-hidden" dir="ltr">
          <img src={after} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
          <img src={before} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
          <span className="absolute top-3 left-3 rounded-lg bg-black/70 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">{labels.before}</span>
          <span className="absolute top-3 right-3 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-bold text-black backdrop-blur">{labels.after}</span>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/90" style={{ left: `${pos}%` }}>
            <span className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-site-primary text-site-primary-fg shadow-xl">
              <MoveHorizontal className="size-5" />
            </span>
          </span>
          <input
            type="range" min={2} max={98} value={pos} onChange={(e) => setPos(Number(e.target.value))}
            aria-label={`${labels.slider}: ${title}`}
            className="absolute inset-0 size-full cursor-ew-resize opacity-0"
          />
        </div>
      </div>
      <figcaption className="sr-only">{title}</figcaption>
    </figure>
  );
}
