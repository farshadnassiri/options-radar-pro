// ————————————————————————————————————————————————————————————————
// عکس دیده‌بان: امضای تغییر، عکس نهایی پس از بستن بازار، و روزِ عکس
//
// ═══ چرا این سه با هم در یک ماژول خالص‌اند ═══
//
// گزارش صاحب پروژه (ضفزر729): «ارزش معاملات کندل امروز درست نیست.» سه
// علت فنی پیدا شد که هر سه در حلقهٔ دیده‌بانِ سرور بودند و هیچ‌کدام
// آزمون‌پذیر نبودند چون داخل `server.mjs` نوشته شده بودند:
//
// ۱. امضای ردیف (`rowSig`) ارزش و تعداد معامله را نداشت. اصلاحِ ارزش توسط
//    منبع، وقتی حجم ثابت می‌ماند، هیچ‌وقت به‌عنوان «تغییر» پخش نمی‌شد.
// ۲. پس از ساعت بستن، حلقه دیگر هیچ درخواستی نمی‌زد. عکس دیده‌بان همان
//    آخرین تیکِ پیش از ۱۲:۳۱ می‌ماند؛ ارزش/حجم/موقعیت باز «نهایی» نبودند
//    ولی قیمت پایانیِ کندل (از `/api/infos`) نهایی بود.
// ۳. همان عکس تا صبح روز بعد می‌ماند و زیر عنوان «امروز» نشان داده می‌شد.
//
// این ماژول هیچ درخواستی نمی‌زند و ساعت را تزریق‌پذیر می‌گیرد.
// ————————————————————————————————————————————————————————————————

import { liveDayOf, LIVE_SOURCE_BOARD } from './live-day.mjs';

/**
 * ستون‌هایی که تغییرشان یعنی «این ردیف عوض شد».
 *
 * `qTotCap_*` (ارزش) و `zTotTran_*` (تعداد معامله) عمداً اینجا هستند:
 * ارزش می‌تواند بی‌تغییرِ حجم اصلاح شود (ابطال یک معامله و ثبت دوباره با
 * قیمت دیگر)، و بدون آن‌ها مصرف‌کنندهٔ رویدادها عدد کهنه را نگه می‌داشت.
 */
export const WATCH_TRACK = Object.freeze([
  'pDrCotVal_UA', 'pClosing_UA',
  'pMeDem_C', 'qTitMeDem_C', 'pMeOf_C', 'qTitMeOf_C',
  'pDrCotVal_C', 'pClosing_C', 'oP_C', 'qTotTran5J_C', 'qTotCap_C', 'zTotTran_C',
  'pMeDem_P', 'qTitMeDem_P', 'pMeOf_P', 'qTitMeOf_P',
  'pDrCotVal_P', 'pClosing_P', 'oP_P', 'qTotTran5J_P', 'qTotCap_P', 'zTotTran_P',
]);

export const watchRowKey = (r) => `${r?.insCode_C ?? ''}|${r?.insCode_P ?? ''}`;
export const watchRowSig = (r) => WATCH_TRACK.map((k) => r?.[k] ?? '').join(',');

/** ردیف‌هایی از `rows` که امضایشان با `prevByKey` فرق دارد، به‌علاوهٔ نگاشت تازه. */
export function diffWatchRows(rows = [], prevByKey = new Map()) {
  const byKey = new Map();
  const changed = [];
  for (const r of rows || []) {
    const k = watchRowKey(r);
    const sig = watchRowSig(r);
    byKey.set(k, sig);
    if (prevByKey.get(k) !== sig) changed.push(r);
  }
  return { byKey, changed };
}

/**
 * آیا پس از بستن بازار، حلقه باید یک عکس دیگر بگیرد؟
 *
 * بازار ساعت بستن دارد، ولی ارقام نهایی تابلو (ارزش، حجم، موقعیت باز و
 * اصلاح‌های ناظر) لزوماً در همان دقیقه ثابت نمی‌شوند. پس در فاز `after`
 * هر `everySec` یک بار دوباره می‌پرسیم، تا وقتی که:
 *   - یک عکسِ پس از بستن دقیقاً مثل عکس قبلی درآمد (`finalDay === today`)، یا
 *   - `maxPulls` بار پرسیده‌ایم (سقف هزینه؛ بی‌انتها نمی‌پرسیم).
 *
 * عکسی که روزش امروز نیست (سرور بعد از بستن روشن شده، یا از دیروز مانده)
 * بی‌درنگ گرفته می‌شود — بدون آن، اصلاً عکسی از امروز نداریم.
 */
export function afterCloseDue({ phase, today, now = Date.now(), watch = {}, everySec = 300, maxPulls = 12 } = {}) {
  if (phase !== 'after' || !today) return false;
  if (Number(watch.day) !== Number(today)) return true;
  if (Number(watch.finalDay) === Number(today)) return false;
  if (Number(watch.afterPulls) >= Number(maxPulls)) return false;
  const at = Number(watch.at) || 0;
  return now - at >= Math.max(0, Number(everySec) || 0) * 1000;
}

/**
 * وضعیت «پس از بستن» بعد از یک دور موفق.
 *
 * `afterPulls` فقط برای همان روز شمرده می‌شود. عکسی که هیچ ردیفش عوض نشده
 * (و عکس قبلی هم مال همین روز بوده) عکس نهایی است.
 */
export function afterCloseState({ phase, today, prev = {}, changedCount = 0, first = false } = {}) {
  if (phase !== 'after') return { afterPulls: 0, finalDay: Number(prev.finalDay) || 0 };
  const sameDay = Number(prev.day) === Number(today);
  const afterPulls = (sameDay ? Number(prev.afterPulls) || 0 : 0) + 1;
  const settled = sameDay && !first && changedCount === 0;
  return { afterPulls, finalDay: settled ? Number(today) : (sameDay ? Number(prev.finalDay) || 0 : 0) };
}

/**
 * عکس دیده‌بان مال کدام جلسه است و آیا «امروز» است؟
 *
 * `phase` فازِ بازار **هنگام گرفتن عکس** است، نه الان. عکسی که پیش از
 * باز شدن یا در روز تعطیل گرفته شده، ارقام جلسهٔ قبل را دارد (قاعده: روز
 * جاری فقط در فاز open/after/ungated به امروز منتسب می‌شود). عکسی که در
 * فاز باز دیروز گرفته شده، مال دیروز است حتی اگر هنوز در حافظه مانده باشد.
 *
 * `current: false` یعنی «جلسهٔ قبل»؛ `date` اگر معلوم باشد روزِ همان عکس.
 */
export function watchSession({ phase = '', at = 0, today = 0 } = {}) {
  if (!(Number(at) > 0)) return { current: false, date: 0, why: 'عکسی از تابلو نداریم' };
  const day = liveDayOf({ phase }, Number(at), { source: LIVE_SOURCE_BOARD });
  if (!day.ok) {
    return { current: false, date: 0, why: phase === 'holiday' ? 'روز معاملاتی نیست؛ ارقام جلسهٔ قبل' : 'بازار هنوز باز نشده؛ ارقام جلسهٔ قبل' };
  }
  const current = Number(today) > 0 && day.date === Number(today);
  return { current, date: day.date, why: current ? '' : 'عکس از جلسهٔ قبل مانده است' };
}
