import { Bell, CalendarDays, LayoutDashboard, MessageCircle } from "lucide-react";

// Line-art backdrop in the spirit of the reference site's animated SVG: dashed
// strokes that flow slowly along concentric "circles" and spokes that carry data
// from each channel (WhatsApp, booking, reminders, dashboard) into the center.
const nodes = [
  { Icon: MessageCircle, x: 12, y: 22, color: "text-whatsapp" },
  { Icon: CalendarDays, x: 88, y: 22, color: "text-brand" },
  { Icon: Bell, x: 12, y: 78, color: "text-teal" },
  { Icon: LayoutDashboard, x: 88, y: 78, color: "text-brand" },
];

export function HeroArt() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <svg viewBox="0 0 500 500" className="size-full" fill="none">
        <defs>
          <linearGradient id="hero-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#60a5fa" />
            <stop offset="1" stopColor="#2dd4bf" />
          </linearGradient>
        </defs>
        {[220, 170, 120].map((r) => (
          <circle key={r} cx="250" cy="250" r={r} stroke="var(--line)" strokeWidth="1" />
        ))}
        {[220, 170, 120].map((r, i) => (
          <circle
            key={`f${r}`}
            cx="250"
            cy="250"
            r={r}
            stroke="url(#hero-stroke)"
            strokeWidth="1.5"
            className="flow-path animate-dash"
            style={{ animationDuration: `${50 + i * 25}s`, opacity: 0.55 - i * 0.1 }}
          />
        ))}
        {nodes.map(({ x, y }) => (
          <g key={`${x}${y}`}>
            <line x1={x * 5} y1={y * 5} x2="250" y2="250" stroke="var(--line)" />
            <line
              x1={x * 5}
              y1={y * 5}
              x2="250"
              y2="250"
              stroke="url(#hero-stroke)"
              strokeWidth="1.5"
              strokeDasharray="6 14"
              className="animate-dash"
              style={{ animationDuration: "40s", animationDirection: "reverse" }}
            />
          </g>
        ))}
      </svg>
      {nodes.map(({ Icon, x, y, color }) => (
        <span
          key={`n${x}${y}`}
          className="absolute grid size-11 -translate-1/2 place-items-center rounded-xl border border-line bg-bg shadow-lg"
          style={{ left: `${x}%`, top: `${y}%` }}
        >
          <Icon className={`size-5 ${color}`} />
        </span>
      ))}
    </div>
  );
}
