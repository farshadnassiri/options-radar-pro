// تقویم معاملاتی — از خودِ داده، نه از جدول تعطیلات.
//
// بند «روز یعنی روز معاملاتی، طبق تقویم واقعی بورس تهران با تعطیلات» یک
// راه بدیهی دارد و یک راه درست. راه بدیهی، نوشتن جدول تعطیلات رسمی است؛
// و آن جدول از همان روزی که نوشته شود کهنه می‌شود، تعطیلی ناگهانی را
// نمی‌داند، و روزی را که بورس به دلیل دیگری بسته بوده اصلاً نمی‌بیند.
//
// راه درست این است که نپرسیم «آیا این روز تعطیل بود؟» بلکه بپرسیم «آیا در
// این روز معامله‌ای ثبت شد؟». سری قیمت روزانهٔ نماد پایه دقیقاً همین را
// می‌گوید: تاریخی که ردیف دارد، روز معاملاتی بوده. تقویم از داده می‌آید،
// پس هیچ‌وقت کهنه نمی‌شود و هیچ فرضی هم اضافه نمی‌کند.
//
// یک هزینه دارد و باید صریح گفته شود: تقویم به همان نمادی وابسته است که
// از آن ساخته شده. نمادی که خودش یک هفته متوقف بوده، آن هفته را «تعطیل»
// نشان می‌دهد. برای همین تقویم جلسه همیشه از **نماد پایه** ساخته می‌شود
// نه از قرارداد اختیار، و `gapsIn` روزهای مشکوک را جدا می‌شمارد تا اگر
// این اتفاق افتاد، دیده شود.

import { num } from './num.mjs';
import { normalizeHistoryDate, daysBetween } from './history.mjs';
import { INTRADAY_START_SECOND, INTRADAY_END_SECOND } from './backtest.mjs';

export { INTRADAY_START_SECOND, INTRADAY_END_SECOND };

/**
 * روزهای معاملاتی از یک سری روزانه.
 *
 * فقط ردیفی که قیمت پایانی مثبت دارد روز معاملاتی است. ردیفِ بی‌قیمت —
 * روزی که نماد بازگشایی نشد یا داده‌اش ناقص آمد — روز معاملاتی حساب
 * نمی‌شود، چون در آن روز نمی‌شد کاری کرد.
 */
export function tradingDays(rows = []) {
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = normalizeHistoryDate(row?.date);
    const close = num(row?.close, 0);
    if (!date || !(close > 0)) continue;
    seen.add(date);
  }
  return [...seen].sort((a, b) => a - b);
}

/** ایندکس تاریخ در تقویم، یا ۱- اگر روز معاملاتی نبوده. */
export function indexOfDay(days = [], date) {
  const want = normalizeHistoryDate(date);
  if (!want) return -1;
  let lo = 0, hi = days.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid] === want) return mid;
    if (days[mid] < want) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}

/**
 * نزدیک‌ترین روز معاملاتی در جهت خواسته‌شده.
 *
 * `dir` برابر ۱ یعنی «همین روز یا اولین روز معاملاتی بعدش»، و ۱- یعنی
 * «همین روز یا آخرین روز معاملاتی قبلش». برای وقتی لازم است که کاربر
 * تاریخی را دستی وارد کند که خودش تعطیل بوده.
 */
export function snapToTradingDay(days = [], date, dir = 1) {
  const want = normalizeHistoryDate(date);
  if (!want || !days.length) return 0;
  if (dir >= 0) {
    for (const day of days) if (day >= want) return day;
    return 0;
  }
  for (let at = days.length - 1; at >= 0; at -= 1) if (days[at] <= want) return days[at];
  return 0;
}

/**
 * جابه‌جایی به اندازهٔ n روز معاملاتی.
 *
 * صفر برمی‌گردد اگر از دو سر تقویم بیرون بزند — و این عمدی است: «آخرین
 * روزی که داریم» به‌جای «روزی که خواستی» نمی‌نشیند. اگر بنشیند، پرشِ یک
 * هفته‌ای که به انتهای داده می‌خورد بی‌صدا به پرش سه‌روزه تبدیل می‌شد.
 */
export function shiftTradingDays(days = [], date, count = 1) {
  const at = indexOfDay(days, date);
  if (at < 0) return 0;
  const to = at + Math.trunc(num(count, 0));
  return to >= 0 && to < days.length ? days[to] : 0;
}

/** شمار روزهای معاملاتی بین دو تاریخ، هر دو سر شمرده نمی‌شوند. */
export function tradingDaysBetween(days = [], from, to) {
  const a = indexOfDay(days, from), b = indexOfDay(days, to);
  return a < 0 || b < 0 ? NaN : b - a;
}

/**
 * روزهایی که در تقویم نیستند ولی تقویمی‌شان فاصلهٔ مشکوک دارد.
 *
 * تعطیلی عادی آخر هفته دو روز است. فاصلهٔ بلندتر یا تعطیلات رسمی است یا
 * توقف نماد — و این دو یکی نیستند. تفکیکشان از این داده ممکن نیست، پس
 * تفکیک نمی‌کنیم؛ فقط جای مشکوک را نشان می‌دهیم تا کسی که تقویم را از
 * نماد اشتباهی ساخته، متوجه شود.
 */
export function gapsIn(days = [], { maxGapDays = 4 } = {}) {
  const out = [];
  for (let at = 1; at < days.length; at += 1) {
    const gap = daysBetween(days[at - 1], days[at]);
    if (Number.isFinite(gap) && gap > maxGapDays) out.push({ from: days[at - 1], to: days[at], gap });
  }
  return out;
}

// ═════════════════════ لحظه: تاریخ به‌علاوهٔ ثانیه ═════════════════════
//
// «روز» برای پرش روزانه کافی است و برای پرش پانزده‌دقیقه‌ای نیست. هر جای
// این ماژول که از زمان حرف می‌زند با همین جفت کار می‌کند تا دو مفهوم
// زمان در برنامه نچرخد.

/** لحظه‌ای نرمال‌شده. ثانیهٔ بیرون از جلسه به مرز نزدیک‌ترش می‌چسبد. */
export function moment(date, second = INTRADAY_START_SECOND) {
  const day = normalizeHistoryDate(date);
  const raw = num(second, INTRADAY_START_SECOND);
  const clamped = Math.min(INTRADAY_END_SECOND, Math.max(INTRADAY_START_SECOND, Math.trunc(raw)));
  return { date: day, second: clamped };
}

/** کلید مرتب‌شدنی یک لحظه. مقایسهٔ دو لحظه یعنی مقایسهٔ دو عدد. */
export function momentKey(point) {
  const day = normalizeHistoryDate(point?.date);
  if (!day) return NaN;
  return day * 100000 + Math.max(0, Math.trunc(num(point?.second, 0)));
}

/** آیا `a` از `b` جلوتر است. `NaN` هرگز جلوتر نیست. */
export function laterThan(a, b) {
  const ka = momentKey(a), kb = momentKey(b);
  return Number.isFinite(ka) && Number.isFinite(kb) && ka > kb;
}

export function sameMoment(a, b) {
  const ka = momentKey(a), kb = momentKey(b);
  return Number.isFinite(ka) && Number.isFinite(kb) && ka === kb;
}

/**
 * نردبان پیش‌فرض پرش. عدد `seconds` یعنی پرش درون‌روزی و `days` یعنی
 * روز معاملاتی. `endOfDay` و `expiry` دو حالت خاص‌اند.
 */
export const STEPS = [
  { key: 'm15', label: '۱۵ دقیقه', seconds: 15 * 60 },
  { key: 'h1', label: '۱ ساعت', seconds: 60 * 60 },
  { key: 'eod', label: 'پایان روز', endOfDay: true },
  { key: 'd1', label: '۱ روز', days: 1 },
  { key: 'd3', label: '۳ روز', days: 3 },
  { key: 'w1', label: '۱ هفته', days: 5 },
  { key: 'expiry', label: 'تا سررسید', expiry: true },
];

export const STEP_BY_KEY = Object.fromEntries(STEPS.map((step) => [step.key, step]));

/**
 * یک پله جلو.
 *
 * قاعدهٔ صریحی که سند خواسته: **پله‌ای که از پایان جلسه رد شود، به ابتدای
 * جلسهٔ بعد منتقل می‌شود** — نه به «۱۲:۳۰ همان روز» و نه به «همان ساعت
 * فردا». دلیلش این است که بین ۱۲:۳۰ و ۹:۰۰ بازاری نیست؛ باقی‌ماندهٔ پله
 * زمانی است که در آن هیچ اتفاقی نمی‌افتد، پس حمل نمی‌شود.
 *
 * خروجی می‌گوید چه شد: `rolled` یعنی به جلسهٔ بعد منتقل شد، و `end` یعنی
 * تقویم تمام شد. لحظهٔ تهی برنمی‌گردد بدون اینکه دلیلش گفته شود.
 */
export function stepMoment(days = [], from, step, { expiryDate = 0 } = {}) {
  const start = moment(from?.date, from?.second);
  if (!start.date) return { ...start, ok: false, why: 'لحظهٔ شروع معتبر نیست' };
  const spec = typeof step === 'string' ? STEP_BY_KEY[step] : step;
  if (!spec) return { ...start, ok: false, why: 'پلهٔ ناشناخته' };

  if (spec.expiry) {
    const target = snapToTradingDay(days, expiryDate, -1);
    if (!target) return { ...start, ok: false, why: 'سررسید در تقویم نیست' };
    return { date: target, second: INTRADAY_END_SECOND, ok: true, rolled: false, end: false };
  }

  if (spec.endOfDay) {
    if (start.second < INTRADAY_END_SECOND) {
      return { date: start.date, second: INTRADAY_END_SECOND, ok: true, rolled: false, end: false };
    }
    const next = shiftTradingDays(days, start.date, 1);
    return next
      ? { date: next, second: INTRADAY_END_SECOND, ok: true, rolled: true, end: false }
      : { ...start, ok: false, end: true, why: 'روز معاملاتی بعدی در تقویم نیست' };
  }

  if (spec.days) {
    const next = shiftTradingDays(days, start.date, spec.days);
    return next
      ? { date: next, second: start.second, ok: true, rolled: false, end: false }
      : { ...start, ok: false, end: true, why: 'تقویم به انتها رسید' };
  }

  const ahead = start.second + Math.max(0, Math.trunc(num(spec.seconds, 0)));
  if (ahead <= INTRADAY_END_SECOND) {
    return { date: start.date, second: ahead, ok: true, rolled: false, end: false };
  }
  const next = shiftTradingDays(days, start.date, 1);
  return next
    ? { date: next, second: INTRADAY_START_SECOND, ok: true, rolled: true, end: false }
    : { ...start, ok: false, end: true, why: 'روز معاملاتی بعدی در تقویم نیست' };
}

/**
 * همهٔ لحظه‌های میانی بین دو لحظه، با دانه‌بندی خواسته‌شده.
 *
 * بند «پرش هرگز واقعاً پرش نیست» به این تکیه می‌کند: موتور باید قدم‌به‌قدم
 * جلو برود و در هر قدم کال مارجین و سررسید و توقف را ببیند. سقف `limit`
 * هست چون «تا سررسید» با دانهٔ یک‌دقیقه‌ای ده‌ها هزار قدم می‌شود و همان
 * حلقه تب را می‌بندد؛ رسیدن به سقف در `truncated` علامت می‌خورد و پنهان
 * نمی‌ماند.
 */
export function momentsBetween(days = [], from, to, { seconds = 15 * 60, limit = 4000 } = {}) {
  const out = [];
  const target = moment(to?.date, to?.second);
  let cur = moment(from?.date, from?.second);
  if (!cur.date || !target.date) return { moments: out, truncated: false, ok: false };
  const grain = Math.max(60, Math.trunc(num(seconds, 900)));
  let guard = 0;
  while (laterThan(target, cur)) {
    if (out.length >= limit) return { moments: out, truncated: true, ok: true };
    const next = stepMoment(days, cur, { seconds: grain });
    if (!next.ok) return { moments: out, truncated: false, ok: false, why: next.why };
    cur = laterThan(next, target) ? target : { date: next.date, second: next.second };
    out.push({ ...cur });
    guard += 1;
    if (guard > limit * 2) return { moments: out, truncated: true, ok: true };
  }
  return { moments: out, truncated: false, ok: true };
}
