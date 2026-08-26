// داشبورد تجمیعی — روی همهٔ جلسه‌ها.
//
// ═══ قاعده‌ای که کل این ماژول رویش ایستاده ═══
//
// تا شمار جلسه‌ها از آستانهٔ معناداری نگذشته، **هیچ عددی بدون برچسب
// «نمونه ناکافی» نمایش داده نمی‌شود**. سند این را خواسته و دلیلش هم روشن
// است: با سه جلسه، هر برشی یک داستان تعریف می‌کند و هیچ‌کدامشان راست
// نیست. بدتر، کاربر همان داستان را باور می‌کند و رفتارش را رویش می‌سازد.
//
// برچسب حذف نمی‌کند — عدد سر جایش می‌ماند و کنارش نوشته می‌شود چند تاست.
// حذف‌کردن، کاربر را وادار می‌کرد فکر کند داده‌ای نیست؛ در حالی که هست،
// فقط کم است.
//
// ═══ دو معیار کلیدی، و چرا از هم جدایند ═══
//
//   دقت پیش‌بینی    جهت را درست زدی یا نه — مستقل از نتیجهٔ مالی
//   کیفیت انتخاب    رتبهٔ میانگین انتخاب‌هایت در میان کاندیدها
//
// معامله‌گری که جهت را درست می‌زند و ساختار را غلط می‌چیند، با کسی که
// جهت را غلط می‌زند یکی نیست. یک عدد سود، هر دو را یک شکل نشان می‌دهد.

import { num } from './num.mjs';
import { REGIME_KEYS, regimeLabel } from './regime.mjs';

/** آستانهٔ معناداری. کمتر از این، هر عدد برچسب می‌گیرد. */
export const MIN_SAMPLE = 20;

/**
 * برش‌های داشبورد.
 *
 * `of` مقدار برش را از یک جلسهٔ خلاصه‌شده می‌گیرد. سطل‌بندی همین‌جاست تا
 * دو جای برنامه دو تعریف از «نزدیک سررسید» نداشته باشند.
 */
export const SLICES = [
  { key: 'structure', label: 'نوع استراتژی', of: (row) => row.defName || row.defId || 'نامعلوم' },
  { key: 'regime', label: 'رژیم بازار در زمان جلسه', of: (row) => regimeLabel(row.regime) },
  { key: 'dte', label: 'روز مانده تا سررسید در ورود', of: (row) => dteBucket(row.daysToExpiry) },
  { key: 'moneyness', label: 'فاصله از قیمت اعمال در ورود', of: (row) => moneynessBucket(row.moneynessPct) },
  { key: 'ivPercentile', label: 'صدک تلاطم ضمنی در ورود', of: (row) => percentileBucket(row.ivPercentile) },
  { key: 'confidence', label: 'درجهٔ اطمینان اعلامی', of: (row) => confidenceBucket(row.confidence) },
  { key: 'horizon', label: 'افق نگهداری', of: (row) => horizonBucket(row.holdDays) },
];

export const SLICE_BY_KEY = Object.fromEntries(SLICES.map((slice) => [slice.key, slice]));

export function dteBucket(days) {
  const value = num(days, NaN);
  if (!Number.isFinite(value)) return 'نامعلوم';
  if (value <= 7) return 'تا ۷ روز';
  if (value <= 21) return '۸ تا ۲۱ روز';
  if (value <= 45) return '۲۲ تا ۴۵ روز';
  return 'بیش از ۴۵ روز';
}

export function moneynessBucket(pct) {
  const value = num(pct, NaN);
  if (!Number.isFinite(value)) return 'نامعلوم';
  if (value < -10) return 'عمیقاً باارزش';
  if (value < -2) return 'باارزش';
  if (value <= 2) return 'روی پایه';
  if (value <= 10) return 'بی‌ارزش';
  return 'عمیقاً بی‌ارزش';
}

export function percentileBucket(pct) {
  const value = num(pct, NaN);
  if (!Number.isFinite(value)) return 'نامعلوم';
  if (value < 25) return 'پایین — زیر صدک ۲۵';
  if (value < 75) return 'میانه';
  return 'بالا — بالای صدک ۷۵';
}

export function confidenceBucket(confidence) {
  const value = num(confidence, NaN);
  if (!Number.isFinite(value)) return 'نامعلوم';
  const pct = value <= 1 ? value * 100 : value;
  if (pct < 40) return 'کم — زیر ۴۰٪';
  if (pct < 70) return 'میانه — ۴۰ تا ۷۰٪';
  return 'زیاد — بالای ۷۰٪';
}

export function horizonBucket(days) {
  const value = num(days, NaN);
  if (!Number.isFinite(value)) return 'نامعلوم';
  if (value <= 1) return 'درون‌روز تا یک روز';
  if (value <= 5) return 'تا یک هفته';
  if (value <= 20) return 'تا یک ماه';
  return 'بیش از یک ماه';
}

/**
 * آمار یک گروه از جلسه‌ها.
 *
 * `excessMeanPct` اول می‌آید و بازده مطلق بعد — همان ترتیبی که گزارش
 * پایان جلسه دارد و به همان دلیل: بدون معیار مقایسه، در بازاری با روند
 * اسمی بزرگ همه‌چیز سودده به‌نظر می‌رسد.
 */
export function groupStats(rows = [], { minSample = MIN_SAMPLE } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const excess = list.map((row) => num(row.excessBuyHoldPct, NaN)).filter(Number.isFinite);
  const returns = list.map((row) => num(row.returnPct, NaN)).filter(Number.isFinite);
  const hits = list.filter((row) => row.forecastHit === true).length;
  const graded = list.filter((row) => typeof row.forecastHit === 'boolean').length;
  const ranks = list.map((row) => num(row.myRank, NaN)).filter(Number.isFinite);
  const totals = list.map((row) => num(row.candidateCount, NaN)).filter(Number.isFinite);
  const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);

  const count = list.length;
  return {
    count,
    enough: count >= Math.max(1, num(minSample, MIN_SAMPLE)),
    needed: Math.max(1, num(minSample, MIN_SAMPLE)),
    excessMeanPct: mean(excess),
    returnMeanPct: mean(returns),
    winRatePct: returns.length ? (returns.filter((value) => value > 0).length / returns.length) * 100 : NaN,
    forecastAccuracyPct: graded ? (hits / graded) * 100 : NaN,
    forecastGraded: graded,
    meanRank: mean(ranks),
    meanCandidates: mean(totals),
    abandoned: list.filter((row) => row.state === 'abandoned').length,
    manual: list.filter((row) => row.manualStart).length,
  };
}

/**
 * برش‌بندی مجموعه‌ای از جلسه‌ها.
 *
 * جلسه‌های تمرینی وارد نمی‌شوند — بند ضد تقلب. جلسه‌های رهاشده **وارد
 * می‌شوند** و جدا شمرده می‌شوند: رها کردن جلسه‌ای که دارد بد پیش می‌رود،
 * خودش یک الگوی رفتاری است و حذفش آمار را خوش‌بین می‌کند.
 */
export function sliceSessions(rows = [], sliceKey, options = {}) {
  const slice = SLICE_BY_KEY[sliceKey];
  if (!slice) return { ok: false, why: 'برش ناشناخته', groups: [] };
  const counted = (rows || []).filter((row) => !row?.practice);
  const byKey = new Map();
  for (const row of counted) {
    const key = slice.of(row);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }
  const groups = [...byKey.entries()]
    .map(([key, list]) => ({ key, ...groupStats(list, options) }))
    .sort((a, b) => b.count - a.count);
  return {
    ok: true, slice: slice.label, groups,
    total: counted.length,
    excluded: (rows || []).length - counted.length,
  };
}

/**
 * نمودار کالیبراسیون: اطمینان اعلامی در برابر دقت واقعی.
 *
 * تنها جایی که کاربر می‌بیند «مطمئنم» یعنی چه. اگر خط از قطر بالاتر
 * باشد، کم‌اعتماد است؛ اگر پایین‌تر، بیش‌اعتماد — و بیش‌اعتمادی، خطای
 * گران‌تری است چون اندازهٔ موقعیت را بزرگ می‌کند.
 */
export function calibration(rows = [], { minSample = MIN_SAMPLE } = {}) {
  const counted = (rows || []).filter((row) => !row?.practice && typeof row?.forecastHit === 'boolean');
  const buckets = [
    { key: 'کم — زیر ۴۰٪', lo: 0, hi: 40, mid: 25 },
    { key: 'میانه — ۴۰ تا ۷۰٪', lo: 40, hi: 70, mid: 55 },
    { key: 'زیاد — بالای ۷۰٪', lo: 70, hi: 101, mid: 85 },
  ];
  const points = buckets.map((bucket) => {
    const list = counted.filter((row) => {
      const raw = num(row.confidence, NaN);
      const pct = raw <= 1 ? raw * 100 : raw;
      return Number.isFinite(pct) && pct >= bucket.lo && pct < bucket.hi;
    });
    const hits = list.filter((row) => row.forecastHit).length;
    return {
      bucket: bucket.key, statedPct: bucket.mid,
      actualPct: list.length ? (hits / list.length) * 100 : NaN,
      count: list.length,
      enough: list.length >= Math.max(1, num(minSample, MIN_SAMPLE)),
    };
  });
  const usable = points.filter((point) => point.enough && Number.isFinite(point.actualPct));
  const gap = usable.length
    ? usable.reduce((sum, point) => sum + (point.actualPct - point.statedPct), 0) / usable.length
    : NaN;
  return {
    points, total: counted.length,
    enough: counted.length >= Math.max(1, num(minSample, MIN_SAMPLE)),
    gapPp: gap,
    note: !Number.isFinite(gap)
      ? 'برای نمودار کالیبراسیون، هنوز جلسهٔ کافی در سطل‌های اطمینان نیست.'
      : gap < -10
        ? 'بیش‌اعتمادی: دقت واقعی از اطمینان اعلامی عقب‌تر است. این خطا گران‌تر از قرینه‌اش است، چون اندازهٔ موقعیت را بزرگ می‌کند.'
        : gap > 10
          ? 'کم‌اعتمادی: دقت واقعی از اطمینان اعلامی جلوتر است. اندازهٔ موقعیت‌هایت احتمالاً کوچک‌تر از چیزی است که تحلیلت اجازه می‌دهد.'
          : 'اطمینان اعلامی با دقت واقعی تقریباً می‌خواند.',
  };
}

/**
 * جملهٔ «نمونه ناکافی» — یک متن، همه‌جا.
 *
 * صادراتی است چون اگر هر جدول جملهٔ خودش را می‌ساخت، یکی‌شان روزی از قلم
 * می‌افتاد و همان یک عدد بی‌برچسب، باورپذیرتر از بقیه به‌نظر می‌رسید.
 */
export function sampleNote(stats) {
  const fa = (n) => String(Math.round(num(n, 0))).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  if (!stats) return '';
  return stats.enough
    ? `${fa(stats.count)} جلسه — از آستانهٔ معناداری گذشته.`
    : `نمونه ناکافی: ${fa(stats.count)} جلسه از ${fa(stats.needed)} تای لازم. عددها نمایش داده می‌شوند ولی هنوز حرف قابل اتکایی نمی‌زنند.`;
}

/** دو معیار کلیدی روی کل مجموعه. */
export function headlineMetrics(rows = [], options = {}) {
  const stats = groupStats((rows || []).filter((row) => !row?.practice), options);
  return {
    ...stats,
    selectionNote: Number.isFinite(stats.meanRank) && Number.isFinite(stats.meanCandidates)
      ? `رتبهٔ میانگین انتخاب‌هایت ${stats.meanRank.toFixed(1).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]).replace(/\./g, '٫')} از ${String(Math.round(stats.meanCandidates)).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])} کاندید.`
      : 'برای کیفیت انتخاب، رتبهٔ انتخاب در جلسه‌ها لازم است.',
    regimeKeys: REGIME_KEYS,
  };
}
