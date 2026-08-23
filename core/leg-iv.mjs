// تلاطم ضمنی هر پا، مستقل از تایم‌فریم.
//
// بک‌تست سریع سه تایم‌فریم دارد و هر سه یک چیز را می‌خواهند: «این پا در این
// لحظه با چه تلاطمی قیمت خورده است؟» دادهٔ خام هر سه هم‌شکل نیست — مسیر
// روزانه `exitPrice` و `baseClose` دارد، بازپخش ثانیه‌ای `exitPrice` و
// `basePrice`، و سطل‌های تایم‌فریم `price` و `basePrice` — ولی ورودی محاسبه
// در هر سه یکی است: قیمت پا، قیمت پایه، و روز مانده تا سررسیدِ **همان پا**.
//
// روز مانده باید per-leg باشد نه per-strategy. یک استراتژی تقویمی دو سررسید
// دارد و اگر هر دو پا با روزِ نزدیک‌ترین سررسید حساب شوند، پای دور تلاطمی
// می‌گیرد که هیچ‌جا وجود ندارد. این خطا هیچ عددی را NaN نمی‌کند و فقط یک
// عدد قابل‌قبولِ غلط می‌سازد — پس بدترین نوعش است.
//
// قاعدهٔ ۲-۴ اینجا سفت است: هر ورودیِ نبوده، خروجی را NaN می‌کند. تلاطمی که
// از قیمت واقعی درنیامده باشد، عدد نیست.

import { impliedVol } from './bs.mjs';
import { daysBetween } from './history.mjs';
import { num } from './num.mjs';

/**
 * پارامترهای محاسبه که کاربر می‌تواند دست ببرد.
 *
 * همه از تنظیمات عمومی می‌آیند تا رفتار پیش‌فرض با بقیهٔ برنامه یکی باشد،
 * ولی هر کدام در خود تب قابل بازنویسی است: کاربری که می‌خواهد اثر نرخ بدون
 * ریسک را روی همین یک بک‌تست ببیند، نباید مجبور شود تنظیمات سراسری را عوض
 * کند و بعد یادش برود برگرداند.
 */
export const IV_PARAMS = [
  { key: 'rFree', label: 'نرخ بدون ریسک سالانه', min: 0, max: 1.5, step: 0.005 },
  { key: 'divYield', label: 'بازده نقدی سالانه پایه', min: 0, max: 1, step: 0.005 },
  { key: 'ivLo', label: 'کف جست‌وجوی تلاطم', min: 0.001, max: 1, step: 0.01 },
  { key: 'ivHi', label: 'سقف جست‌وجوی تلاطم', min: 0.5, max: 20, step: 0.5 },
  { key: 'yearDays', label: 'روز سال — مخرج زمان', min: 1, max: 400, step: 1 },
];

/** پارامترهای مؤثر: پیش‌فرض تنظیمات، با بازنویسی موضعی همین تب. */
export function ivParams(settings = {}, override = {}) {
  const pick = (key, fallback) => {
    const raw = override[key];
    return Number.isFinite(Number(raw)) ? Number(raw) : num(fallback, NaN);
  };
  return {
    rFree: pick('rFree', settings.rFree),
    divYield: pick('divYield', settings.divYield),
    ivLo: pick('ivLo', settings.ivLo),
    ivHi: pick('ivHi', settings.ivHi),
    yearDays: pick('yearDays', settings.dayCountYear),
  };
}

/**
 * روز مانده تا سررسید همین پا، از روزِ مشاهده.
 *
 * سررسید روی پای قیمت‌گذاری‌شده نشسته (`leg.expiry`)؛ اگر نبود، `leg.days`
 * که روز ورود را می‌گوید کمکی نمی‌کند چون روز مشاهده جلوتر رفته است. پس
 * نبودِ سررسید یعنی ندانستن، نه صفر.
 */
export function legDaysToExpiry(leg, observedDate) {
  const expiry = num(leg?.expiry, NaN);
  if (!Number.isFinite(expiry) || expiry <= 0) return NaN;
  const days = daysBetween(observedDate, expiry);
  return Number.isFinite(days) ? Math.max(0, days) : NaN;
}

/**
 * تلاطم ضمنی یک پا، بر حسب **درصد**.
 *
 * پای سهم پایه تلاطم ضمنی ندارد — قرارداد اختیاری نیست که از قیمتش تلاطم
 * دربیاید. NaN می‌دهد، نه صفر و نه تلاطم پایه.
 */
export function legIvPct(leg, { spot, price, days }, params = {}) {
  if (!leg || (leg.kind !== 'call' && leg.kind !== 'put')) return NaN;
  const S = num(spot, NaN), K = num(leg.strike, NaN), P = num(price, NaN);
  const d = num(days, NaN), yearDays = num(params.yearDays, NaN);
  if (!(S > 0) || !(K > 0) || !(P > 0) || !(d >= 0) || !(yearDays > 0)) return NaN;
  const T = d / yearDays;
  if (!(T > 0)) return NaN;                    // روز سررسید: دیگر تلاطمی در کار نیست
  const sigma = impliedVol(leg.kind, P, S, K, T, num(params.rFree, 0), num(params.divYield, 0), {
    lo: num(params.ivLo, 0.01), hi: num(params.ivHi, 5),
  });
  return Number.isFinite(sigma) ? sigma * 100 : NaN;
}

/**
 * تلاطم همهٔ پاهای یک لحظه.
 *
 * خروجی هم‌اندازه و هم‌ترتیبِ `legs` است تا شمارهٔ پا در جدول و نمودار جابه‌جا
 * نشود؛ پای سهم پایه هم جای خودش را با NaN نگه می‌دارد.
 */
export function legIvList(legs = [], { spot, prices = [], date }, params = {}) {
  return legs.map((leg, index) => legIvPct(leg, {
    spot, price: prices[index], days: legDaysToExpiry(leg, date),
  }, params));
}

/**
 * میانگین سادهٔ تلاطم پاهای اختیار یک لحظه.
 *
 * وزن‌دهی عمداً نیست: وزنِ ارزش معامله، «تلاطم بازار» را می‌سازد نه «تلاطم
 * این موقعیت»، و پای پرگردش موقعیت را هم‌اندازهٔ کل بازار نشان می‌دهد. برای
 * یک خط مرجع کنار خط‌های هر پا، میانگین ساده همان چیزی است که خوانده می‌شود.
 */
export function meanIvPct(list = []) {
  const values = list.filter((v) => Number.isFinite(v));
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}

/**
 * مسیر روزانه را با تلاطم هر پا مهر می‌زند.
 *
 * ردیف‌های `missing` هم رد می‌شوند چون `perLeg` آن‌ها قیمت خروج ندارد؛ ولی
 * ساختارشان دست نمی‌خورد تا شمارهٔ ردیف در جدول جابه‌جا نشود.
 */
export function annotateDailyIv(replay, params = {}) {
  if (!replay?.ok) return replay;
  const legs = replay.priced || [];
  for (const row of replay.rows || []) {
    const prices = (row.perLeg || []).map((leg) => leg.exitPrice);
    const list = legIvList(legs, { spot: row.baseClose, prices, date: row.date }, params);
    list.forEach((value, index) => { if (row.perLeg?.[index]) row.perLeg[index].ivPct = value; });
    row.legIvPct = list;
    row.meanIvPct = meanIvPct(list);
  }
  return replay;
}

/** نقاط ثانیه‌ای بازپخش درون‌روز را با تلاطم هر پا مهر می‌زند. */
export function annotateIntradayIv(points = [], { legs = [], date }, params = {}) {
  for (const point of points) {
    const prices = (point.perLeg || []).map((leg) => leg.exitPrice);
    const list = legIvList(legs, { spot: point.basePrice, prices, date }, params);
    list.forEach((value, index) => { if (point.perLeg?.[index]) point.perLeg[index].ivPct = value; });
    point.legIvPct = list;
    point.meanIvPct = meanIvPct(list);
  }
  return points;
}

/**
 * سطل‌های تایم‌فریم را با تلاطم هر پا مهر می‌زند.
 *
 * هر سطل تاریخ خودش را دارد (`bucket.date`), چون بازهٔ تایم‌فریم چند روز را
 * می‌پوشاند و روز مانده تا سررسید بین اولین و آخرین سطل عوض می‌شود. گرفتن
 * یک تاریخ برای کل بازه، تلاطم روزهای دور را به‌اندازهٔ چند درصد جابه‌جا
 * می‌کرد بی‌آنکه هیچ‌جا خطایی دیده شود.
 */
export function annotateBucketIv(buckets = [], { legs = [] }, params = {}) {
  for (const bucket of buckets) {
    const prices = (bucket.perLeg || []).map((leg) => leg.price);
    const list = legIvList(legs, { spot: bucket.basePrice, prices, date: bucket.date }, params);
    list.forEach((value, index) => { if (bucket.perLeg?.[index]) bucket.perLeg[index].ivPct = value; });
    bucket.legIvPct = list;
    bucket.meanIvPct = meanIvPct(list);
  }
  return buckets;
}

/**
 * خلاصهٔ تلاطم یک پا در طول یک مسیر: دامنه، میانگین، و تغییر سرتاسری.
 *
 * برای جدول «تلاطم ضمنی پاها» و برای خروجی اکسل، هر دو. نقاط بی‌تلاطم اصلاً
 * وارد نمی‌شوند؛ شمارشان جدا گزارش می‌شود تا معلوم باشد خلاصه روی چند
 * مشاهده ایستاده است.
 */
export function ivSummary(series = []) {
  const values = series.filter((v) => Number.isFinite(v));
  if (!values.length) {
    return { samples: 0, gaps: series.length, first: NaN, last: NaN, min: NaN, max: NaN, mean: NaN, changePp: NaN };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    samples: values.length, gaps: series.length - values.length,
    first: values[0], last: values.at(-1),
    min: Math.min(...values), max: Math.max(...values),
    mean: sum / values.length,
    changePp: values.at(-1) - values[0],
  };
}
