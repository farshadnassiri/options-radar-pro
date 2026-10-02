// زمینهٔ تلاطم در یک روزِ گذشته — برای هر نمایی که دادهٔ تاریخی دارد.
//
// آزمایشگاه، تحلیل تاریخی، آزمون همه استراتژی‌ها، خروجی دیتا و موقعیت‌ها
// همه یک پرسش دارند: «وقتی وارد شدم، تلاطم ضمنی کجا بود؟» جواب از همان
// تاریخچهٔ روزانهٔ `buildVolHistory` (`core/vol-rank.mjs`) می‌آید که تب
// «رتبه و صدک تلاطم» می‌سازد؛ یک موتور، یک عدد.
//
// ═══ قاعدهٔ «تا همان روز» ═══
//
// رتبه و صدک هر ردیف از قبل فقط با روزهای پیش از خودش ساخته شده‌اند
// (`volRankSeries`). اینجا فقط ردیفِ همان روز — یا آخرین ردیفِ **پیش** از آن،
// با برچسب «حمل‌شده» — خوانده می‌شود؛ هیچ ردیفی از بعد. تحقق‌یافتهٔ روزهای
// **بعد** (`fwdRv`) جدا در `hindsight` می‌ماند و رابط باید آن را «پس‌نگری»
// بنامد: در لحظهٔ ورود معلوم نبود.

import { volRegime, VOL_REGIMES } from './vol-rank.mjs';
import { normalizeHistoryDate } from './history.mjs';

export const VOL_CONTEXT_VERSION = 1;
export const VOL_HINDSIGHT_LABEL = 'پس‌نگری';
export const VOL_HINDSIGHT_NOTE = 'تحقق‌یافتهٔ روزهای بعد از این تاریخ — در همان روز معلوم نبود و در هیچ تصمیمِ شبیه‌سازی‌شده‌ای وارد نمی‌شود.';
const isNum = (value) => Number.isFinite(value);
const MAX_CARRY_DAYS = 7;

/** فاصلهٔ تقویمی دو تاریخ هشت‌رقمی. */
function gapDays(a, b) {
  const t = (d) => Date.UTC(Math.trunc(d / 10000), Math.trunc((d % 10000) / 100) - 1, d % 100);
  return Math.round((t(b) - t(a)) / 86400000);
}

/**
 * زمینهٔ تلاطم در `date`: ردیف همان روز، یا آخرین ردیف دارای شاخص تا هفت
 * روز تقویمی پیش از آن (حمل‌شده). بی ردیف، `null` با علت.
 */
export function volContextAt(history, date) {
  const asked = normalizeHistoryDate(date);
  const rows = history?.rows || [];
  if (!asked) return { asked: 0, ok: false, why: 'noDate' };
  let row = null;
  for (const candidate of rows) {
    if (candidate.date > asked) break;
    if (isNum(candidate.ivPct)) row = candidate;
  }
  if (!row) return { asked, ok: false, why: rows.length ? 'noIndexBefore' : 'noHistory' };
  const age = gapDays(row.date, asked);
  if (age > MAX_CARRY_DAYS) return { asked, ok: false, why: 'tooOld', lastDate: row.date };
  const params = history.params || {};
  return {
    asked, ok: true, date: row.date, carried: row.date !== asked, ageDays: age,
    ivPct: row.ivPct, ivr: row.ivr, ivp: row.ivp,
    hvPct: row.hvMatch, hvWindow: params.hvWindow || 0, hvp: row.hvp,
    spread: row.spread, ratio: row.ratio, spot: row.spot,
    regime: volRegime(row.ivp, row.ivr),
    flags: row.flags || [],
    hindsight: { fwdRv: row.fwdRv, fwdEdge: row.fwdEdge },
  };
}

export const VOL_CONTEXT_WHY = {
  noDate: 'تاریخ معتبر نیست',
  noHistory: 'تاریخچهٔ تلاطم این نماد هنوز ساخته نشده (تب «رتبه و صدک تلاطم»)',
  noIndexBefore: 'تا این روز هیچ روزی شاخص تلاطم نداشت',
  tooOld: 'آخرین شاخص پیش از این روز بیش از یک هفته کهنه است',
};

/** ورود و خروج و تغییر میانشان. */
export function volContextBetween(history, entry, exit) {
  const a = volContextAt(history, entry);
  const b = volContextAt(history, exit);
  return {
    entry: a, exit: b,
    ivChange: a.ok && b.ok ? b.ivPct - a.ivPct : NaN,
    ivpChange: a.ok && b.ok ? b.ivp - a.ivp : NaN,
  };
}

/**
 * گروه‌بندی نتیجه‌ها با پلهٔ تلاطمِ ورود: برای هر پله شمار، میانگین بازده و
 * درصد سودده. `rows`: `[{ regimeId, value }]`.
 */
export function regimeBuckets(rows = []) {
  const order = [...VOL_REGIMES.map((r) => r.id), 'unknown'];
  const groups = new Map(order.map((id) => [id, []]));
  for (const row of rows) {
    const id = groups.has(row.regimeId) ? row.regimeId : 'unknown';
    if (isNum(row.value)) groups.get(id).push(row.value);
  }
  return order.map((id) => {
    const list = groups.get(id);
    const meta = VOL_REGIMES.find((r) => r.id === id);
    return {
      id, label: meta?.label || 'نامعلوم', tone: meta?.tone || 'neutral', n: list.length,
      mean: list.length ? list.reduce((s, v) => s + v, 0) / list.length : NaN,
      winPct: list.length ? (list.filter((v) => v > 0).length / list.length) * 100 : NaN,
    };
  }).filter((row) => row.n > 0);
}
