export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} dir="ltr">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="circle-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1d6fe0" />
            <stop offset="1" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="12" fill="none" stroke="url(#circle-logo)" strokeWidth="5" />
        <circle cx="16" cy="16" r="3.5" fill="#14b8a6" />
      </svg>
      <span className="text-lg font-bold tracking-tight text-ink">Circle</span>
    </span>
  );
}
