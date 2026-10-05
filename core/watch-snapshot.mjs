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
 *
 * ممیزی ۳۰ سپتامبر `yesterdayOP_*` را هم کم یافت: منبع موقعیت باز دیروز را
 * پس از بستن به‌روز می‌کند و «تغییر موقعیت باز» کهنه می‌ماند. حالا فهرست
 * **هر** میدانی است که `buildChain` می‌خواند؛ دستهٔ ۳۰۴ همین را از متنِ
 * `core/chain.mjs` می‌سنجد تا فهرست و خواننده از هم جدا نیفتند.
 */
const SIDE_FIELDS = [
  'lVal18AFC', 'pMeDem', 'qTitMeDem', 'pMeOf', 'qTitMeOf',
  'pDrCotVal', 'pClosing', 'priceYesterday',
  'oP', 'yesterdayOP', 'qTotTran5J', 'qTotCap', 'zTotTran',
];
export const WATCH_TRACK = Object.freeze([
  'lval30_UA', 'pDrCotVal_UA', 'pClosing_UA', 'priceYesterday_UA',
  'qTotTran5J_UA', 'qTotCap_UA', 'zTotTran_UA',
  'strikePrice', 'remainedDay', 'contractSize', 'endDate',
  ...SIDE_FIELDS.map((f) => `${f}_C`),
  ...SIDE_FIELDS.map((f) => `${f}_P`),
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
//
// ═══ دقیقه‌های نخستِ پس از بستن، تند ═══
//
// گزارش صاحب پروژه (۱۴۰۵/۰۷/۱۳، ساعت ۱۲:۳۵): «رصد لحظه‌ای اطلاعات را الان
// درست نشان نمی‌دهد… خیلی دیر به‌روز شد.» علت: پس از ۱۲:۳۰ فقط هر ۳۰۰
// ثانیه می‌پرسیدیم، پس عکسِ پیش از بستن تا حدود ۱۲:۳۵ روی صفحه می‌ماند در
// حالی که تابلو قیمت پایانی و ارزش نهایی را همان دقیقه‌ها منتشر می‌کرد. حالا
// تا `settleMin` دقیقه پس از بستن هر `fastSec` ثانیه می‌پرسیم (بی سقف
// شمار، چون پنجره کوتاه است) و پس از آن همان آهنگ کُند. پیش‌فرض‌های این
// دو صفر است تا رفتار پیشین برای صداکنندهٔ قدیمی بماند.
export function afterCloseDue({ phase, today, now = Date.now(), watch = {}, everySec = 300, maxPulls = 12, minutesSinceClose = Infinity, fastSec = 0, settleMin = 0 } = {}) {
  if (phase !== 'after' || !today) return false;
  if (Number(watch.day) !== Number(today)) return true;
  if (Number(watch.finalDay) === Number(today)) return false;
  const at = Number(watch.at) || 0;
  if (Number(fastSec) > 0 && minutesSinceClose < Number(settleMin)) return now - at >= Number(fastSec) * 1000;
  if (Number(watch.afterPulls) >= Number(maxPulls)) return false;
  return now - at >= Math.max(0, Number(everySec) || 0) * 1000;
}

/**
 * وضعیت «پس از بستن» بعد از یک دور موفق.
 *
 * `afterPulls` فقط برای همان روز شمرده می‌شود. عکسی که هیچ ردیفش عوض نشده
 * (و عکس قبلی هم مال همین روز بوده) عکس نهایی است.
 */
export function afterCloseState({ phase, today, prev = {}, changedCount = 0, first = false, minutesSinceClose = Infinity, settleMin = 0 } = {}) {
  if (phase !== 'after') return { afterPulls: 0, finalDay: Number(prev.finalDay) || 0 };
  const sameDay = Number(prev.day) === Number(today);
  // پنجرهٔ تند شمرده نمی‌شود: سقف `maxPulls` فقط برای آهنگ کُندِ پس از آن است.
  const inFast = minutesSinceClose < Number(settleMin);
  const afterPulls = (sameDay ? Number(prev.afterPulls) || 0 : 0) + (inFast ? 0 : 1);
  // دو عکسِ یکسانِ پشت‌سرِهم در دقیقه‌های نخست هنوز «نهایی» نیست: تابلو قیمت
  // پایانی را دسته‌دسته منتشر می‌کند. نهایی فقط پس از پنجرهٔ تند.
  const settled = sameDay && !first && changedCount === 0 && !inFast;
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
