// Weeks run Monday to Sunday in the viewer's local time.
const pad = (n: number) => String(n).padStart(2, '0');

export function localDay(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfWeek(d: Date) {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
}

export function weekRange(weeksAgo: number) {
  const start = startOfWeek(new Date());
  start.setDate(start.getDate() - weeksAgo * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end, key: localDay(start) };
}

export function inRange(iso: string | null | undefined, start: Date, end: Date) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}
