export function monthDays(month: string): (string | null)[] {
  const [year, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => i >= offset && i < offset + count ? `${month}-${String(i - offset + 1).padStart(2, "0")}` : null);
}
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number), d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function orderedRange(a: string, b: string) { return a <= b ? { from: a, to: b } : { from: b, to: a }; }
