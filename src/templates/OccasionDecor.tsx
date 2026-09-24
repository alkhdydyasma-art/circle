// Decorations for occasion themes. Original geometric motifs only: no flag, emblem or
// official occasion logos (the Saudi flag carries the Shahada and must not be used as
// commercial decoration; official identities have their own usage rules).

export type Occasion = "founding_day" | "national_day";

// Sadu-inspired weave: alternating triangles and diamonds, as used in Najdi textiles.
// `id` must be unique per page: each instance defines its own SVG <pattern>.
export function SaduBand({ id, className = "" }: { id: string; className?: string }) {
  return (
    <svg aria-hidden className={`block h-5 w-full ${className}`} preserveAspectRatio="none">
      <defs>
        <pattern id={id} width="40" height="20" patternUnits="userSpaceOnUse">
          <rect width="40" height="20" fill="var(--c-primary)" />
          <path d="M0 20 L10 0 L20 20 Z" fill="var(--c-accent)" />
          <path d="M20 20 L30 0 L40 20 Z" fill="#8c2f24" />
          <path d="M10 10 L15 5 L20 10 L15 15 Z M30 10 L35 5 L40 10 L35 15 Z" fill="var(--c-bg)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// Eight-pointed star lattice (two overlapping squares), a classic Islamic geometric motif.
export function StarPattern({ id, className = "" }: { id: string; className?: string }) {
  return (
    <svg aria-hidden className={`pointer-events-none absolute inset-0 size-full ${className}`}>
      <defs>
        <pattern id={id} width="56" height="56" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="var(--c-primary)" strokeWidth="1">
            <rect x="16" y="16" width="24" height="24" />
            <rect x="16" y="16" width="24" height="24" transform="rotate(45 28 28)" />
            <path d="M0 28 H8 M48 28 H56 M28 0 V8 M28 48 V56" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

// Thin greeting strip above the clinic header.
export function OccasionRibbon({ occasion, text }: { occasion: Occasion; text: string }) {
  return (
    <div className="relative overflow-hidden bg-site-primary text-site-primary-fg">
      {occasion === "national_day" && <StarPattern id="stars-ribbon" className="opacity-20 [--c-primary:var(--c-primary-fg)]" />}
      <p className="relative px-4 py-2 text-center text-sm font-semibold">{text}</p>
      {occasion === "founding_day" && <SaduBand id="sadu-ribbon" className="h-2" />}
    </div>
  );
}
