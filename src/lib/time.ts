// Timezone helpers for clinic-local dates (no external date library).

const parts = (date: Date, timeZone: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
function offsetMs(date: Date, timeZone: string) {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** "2026-09-26" + "10:30" in Asia/Riyadh → the matching UTC instant. */
export function zonedToUtc(day: string, time: string, timeZone: string) {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  return new Date(guess.getTime() - offsetMs(guess, timeZone));
}

/** YYYY-MM-DD of `date` in `timeZone`. */
export function localDate(date: Date, timeZone: string) {
  const p = parts(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Sunday of the week containing `day` (Saudi work week starts on Sunday). */
export const weekStart = (day: string) => addDays(day, -new Date(`${day}T12:00:00Z`).getUTCDay());
