// Decorations for occasion themes. Original geometric motifs only: no flag, emblem or
// official occasion logos (the Saudi flag carries the Shahada and must not be used as
// commercial decoration; official identities have their own usage rules).

export type Occasion = "founding_day" | "national_day";

// Sadu weave (Najdi textile): alternating triangles and diamonds.
// `id` must be unique per page: each instance defines its own SVG <pattern>.
export function SaduBand({ id, className = "" }: { id: string; className?: string }) {
  return (
    <svg aria-hidden className={`block h-4 w-full ${className}`} preserveAspectRatio="none">
      <defs>
        <pattern id={id} width="32" height="16" patternUnits="userSpaceOnUse">
          <rect width="32" height="16" fill="var(--c-deep)" />
          <path d="M0 16 L8 0 L16 16 Z" fill="var(--c-accent)" />
          <path d="M16 16 L24 0 L32 16 Z" fill="#8c3a26" />
          <path d="M8 8 L12 4 L16 8 L12 12 Z M24 8 L28 4 L32 8 L28 12 Z" fill="var(--c-bg)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// Stepped triangular crenellations, as on the rooftops of Najdi mud-brick houses (Diriyah).
export function Crenellation({ id, className = "" }: { id: string; className?: string }) {
  return (
    <svg aria-hidden className={`block h-3.5 w-full ${className}`} preserveAspectRatio="none">
      <defs>
        <pattern id={id} width="26" height="14" patternUnits="userSpaceOnUse">
          <path d="M0 14 L10 4 V1 H16 V4 L26 14 Z" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// A Najdi doorway arch drawn in hairlines, framing the hero artwork on Founding Day.
export function NajdiArch({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 300 380" className={`pointer-events-none absolute inset-0 m-auto h-full ${className}`} fill="none">
      <path d="M24 380 V170 C24 80 80 22 150 14 C220 22 276 80 276 170 V380" stroke="var(--c-accent)" strokeWidth="2" />
      <path d="M44 380 V176 C44 98 92 46 150 38 C208 46 256 98 256 176 V380" stroke="var(--c-primary)" strokeOpacity=".35" strokeWidth="1.5" strokeDasharray="2 6" />
      <g fill="var(--c-accent)">
        <path d="M132 8 L141 0 L150 8 L159 0 L168 8 Z" />
        <circle cx="150" cy="60" r="3" />
      </g>
    </svg>
  );
}

// Eight-pointed star lattice (two overlapping squares), a classic Islamic geometric motif.
export function StarPattern({ id, className = "", color = "var(--c-primary)" }: { id: string; className?: string; color?: string }) {
  return (
    <svg aria-hidden className={`pointer-events-none absolute inset-0 size-full ${className}`}>
      <defs>
        <pattern id={id} width="64" height="64" patternUnits="userSpaceOnUse">
          <g fill="none" stroke={color} strokeWidth="1">
            <rect x="18" y="18" width="28" height="28" />
            <rect x="18" y="18" width="28" height="28" transform="rotate(45 32 32)" />
            <circle cx="32" cy="32" r="5" />
            <path d="M0 32 H9 M55 32 H64 M32 0 V9 M32 55 V64" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// Greeting strip above the clinic header.
export function OccasionRibbon({ occasion, text }: { occasion: Occasion; text: string }) {
  if (occasion === "founding_day") {
    return (
      <div className="bg-site-deep text-site-deep-fg">
        <p className="flex items-center justify-center gap-3 px-4 py-2 text-center text-sm font-semibold">
          <span aria-hidden className="size-1.5 rotate-45 bg-site-accent" />
          {text}
          <span aria-hidden className="size-1.5 rotate-45 bg-site-accent" />
        </p>
        <SaduBand id="sadu-ribbon" className="h-2" />
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden bg-gradient-to-l from-site-deep via-site-primary to-site-deep text-white">
      <StarPattern id="stars-ribbon" color="#ffffff" className="opacity-[0.12]" />
      <p className="relative flex items-center justify-center gap-3 px-4 py-2 text-center text-sm font-semibold">
        <span aria-hidden className="size-1.5 rounded-full bg-site-accent" />
        {text}
        <span aria-hidden className="size-1.5 rounded-full bg-site-accent" />
      </p>
    </div>
  );
}
