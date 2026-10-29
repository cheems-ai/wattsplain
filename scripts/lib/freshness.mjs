// Pure date helpers for scripts/ops/data-freshness.mjs.

/** Whole calendar months from `period` ("YYYY-MM") to the month of `now` (UTC). */
export function monthsBehind(period, now) {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`not a YYYY-MM period: ${period}`);
  return (now.getUTCFullYear() - Number(m[1])) * 12 + now.getUTCMonth() + 1 - Number(m[2]);
}

/** Whole weeks from `week` ("YYYY-MM-DD") to `now`. */
export function weeksOld(week, now) {
  const t = Date.parse(`${week}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error(`not a YYYY-MM-DD date: ${week}`);
  return Math.floor((now.getTime() - t) / (7 * 864e5));
}
