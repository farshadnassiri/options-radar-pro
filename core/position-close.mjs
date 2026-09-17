// بستنِ موقعیت پیش از سررسید — و سودِ تحقق‌یافته‌ای که از آن می‌ماند.
//
// ═══ شکافی که این فایل پُر می‌کند ═══
//
// دفترِ موقعیت‌ها تا امروز فقط دو حالت می‌شناخت: «باز» و «سررسیدگذشته».
// موقعیتی که کاربر دو هفته پیش با سود بسته بود، تا روزِ سررسید «باز» می‌ماند
// و هر پانزده ثانیه با قیمتِ امروزِ بازار ارزش‌گذاری می‌شد — یعنی عددی که
// نمایش داده می‌شد، سود و زیانِ موقعیتی بود که دیگر وجود نداشت. و وقتی
// سررسید می‌رسید، همان موقعیت بی‌صدا به بایگانی می‌رفت و سودِ واقعیِ
// تحقق‌یافته‌اش هیچ‌جا ثبت نمی‌شد.
//
// ═══ چرا «قیمت خروج» ورودیِ کاربر است، نه قیمت بازار ═══
//
// وسوسه این بود که دکمهٔ «بستن» قیمتِ همین لحظهٔ تابلو را بردارد و ثبت کند.
// ولی سودِ تحقق‌یافته، ادعای **اجرا**ست: عددی که در دفترِ کارگزار نشسته و
// دیگر تغییر نمی‌کند. قیمتِ مظنهٔ لحظهٔ کلیک، قیمتِ پرشدنِ سفارش نیست — به
//‌ویژه در پایی که عمقِ دفترش کم است. پس قیمتِ خروجِ هر پا **پیش‌پر** می‌شود
// و کاربر تأیید یا اصلاح می‌کند؛ همان قاعده‌ای که ورودِ موقعیت هم دارد.
//
// ═══ و چرا تاریخِ خروج اجباری است ═══
//
// بی تاریخ، «چند روز نگه داشتم» و بازدهِ ماهانه ساخته نمی‌شوند. تاریخِ
// ساختگی — مثلاً «امروز» برای موقعیتی که هفتهٔ پیش بسته شده — مخرجِ بازده را
// جابه‌جا می‌کند، و همان یک عدد تا ابد در دفتر می‌ماند.

import { num } from './num.mjs';
import { daysBetween, normalizeHistoryDate, historyDateLabel } from './history.mjs';
import { parseJalali } from './jalali.mjs';
import { pnlFromPrices, positionOpenState, positionExpiry } from './position-track.mjs';

export const POSITION_CLOSE_VERSION = 1;

export const CLOSE_REASONS = {
  noPosition: 'موقعیتی برای بستن انتخاب نشده',
  noLegs: 'این موقعیت پایی ندارد',
  badDate: 'تاریخ خروج شمسی معتبر نیست',
  beforeEntry: 'تاریخ خروج نمی‌تواند پیش از تاریخ ورود باشد',
  afterExpiry: 'تاریخ خروج از سررسید گذشته است — آن موقعیت تسویه شده، نه بسته‌شده',
  missingPrice: 'قیمت خروج همهٔ پاها لازم است',
  notClosed: 'این موقعیت بسته نشده است',
};

/** تاریخ خروج به عدد فشردهٔ میلادی؛ صفر یعنی ثبت نشده. */
export function exitDateNumber(pos) {
  const date = parseJalali(pos?.exit?.date);
  if (!date) return 0;
  return (date.getUTCFullYear() * 10000) + ((date.getUTCMonth() + 1) * 100) + date.getUTCDate();
}

/** آیا این موقعیت بسته شده؟ فقط رکوردی که هم تاریخ خروج دارد هم قیمت خروجِ همهٔ پاها. */
export function isClosed(pos) {
  if (!exitDateNumber(pos)) return false;
  const prices = pos?.exit?.prices;
  const legs = pos?.legs || [];
  if (!Array.isArray(prices) || !legs.length || prices.length !== legs.length) return false;
  return prices.every((price) => num(price) > 0);
}

/**
 * وضعیت یک موقعیت در دفتر: بسته، سررسیدگذشته، یا باز.
 *
 * ترتیب اهمیت دارد و تصادفی نیست: **بسته‌شده** مقدم بر سررسیدگذشته است.
 * موقعیتی که اسفند بسته شده و خردادِ بعد سررسیدش رسیده، «بسته‌شده» است —
 * سودش تحقق یافته و سررسیدِ بعدی هیچ ربطی به آن ندارد. اگر وارونه بود، هر
 * موقعیتِ بسته‌شده با گذشتِ زمان بی‌صدا از فهرستِ «بسته‌ها» به «بایگانیِ
 * سررسید» می‌پرید و سودِ تحقق‌یافته‌اش از جمع می‌افتاد.
 */
export function positionStatus(pos, today = 0) {
  if (isClosed(pos)) {
    return { id: 'closed', open: false, closed: true, expired: false, label: 'بسته‌شده', exitDate: exitDateNumber(pos) };
  }
  const state = positionOpenState(pos, today);
  if (state.expired) {
    return { id: 'expired', open: false, closed: false, expired: true, label: 'سررسیدگذشته', exitDate: 0, expiry: state.expiry };
  }
  return { id: 'open', open: true, closed: false, expired: false, label: 'باز', exitDate: 0, daysToExpiry: state.daysToExpiry };
}

/**
 * سنجشِ یک برگهٔ خروج پیش از نشستن روی رکورد.
 *
 * هر ردِ این تابع یک عددِ غلط است که اگر می‌گذشت، تا ابد در دفتر می‌ماند —
 * برخلافِ ارزش‌گذاریِ لحظه‌ای که رفرشِ بعدی اصلاحش می‌کند.
 */
export function validateExit(pos, exit) {
  const legs = pos?.legs || [];
  if (!pos) return { ok: false, reason: CLOSE_REASONS.noPosition };
  if (!legs.length) return { ok: false, reason: CLOSE_REASONS.noLegs };
  const parsed = parseJalali(exit?.date);
  if (!parsed) return { ok: false, reason: CLOSE_REASONS.badDate };
  const date = (parsed.getUTCFullYear() * 10000) + ((parsed.getUTCMonth() + 1) * 100) + parsed.getUTCDate();

  const entry = parseJalali(pos.entryDate);
  if (entry) {
    const entryDate = (entry.getUTCFullYear() * 10000) + ((entry.getUTCMonth() + 1) * 100) + entry.getUTCDate();
    if (date < entryDate) return { ok: false, reason: CLOSE_REASONS.beforeEntry };
  }
  // سررسید مرزِ سخت است: پس از آن، موقعیت **تسویه** می‌شود نه بسته. ثبتِ
  // «بستن» برای روزِ بعد از سررسید یعنی ادعای معامله‌ای که ممکن نبوده.
  const expiry = positionExpiry(pos);
  if (expiry > 0 && date > expiry) return { ok: false, reason: CLOSE_REASONS.afterExpiry };

  const prices = Array.isArray(exit?.prices) ? exit.prices : [];
  if (prices.length !== legs.length || prices.some((price) => !(num(price) > 0))) {
    return { ok: false, reason: CLOSE_REASONS.missingPrice };
  }
  return {
    ok: true, reason: '',
    exit: {
      version: POSITION_CLOSE_VERSION,
      date: String(exit.date).trim(),
      prices: prices.map((price) => num(price)),
      note: String(exit?.note || '').trim(),
    },
  };
}

/**
 * سود و زیانِ تحقق‌یافته — عددی که دیگر تکان نمی‌خورد.
 *
 * از همان `pnlFromPrices` می‌آید که روندِ لحظه‌ای از آن ساخته می‌شود، فقط با
 * قیمتِ خروجِ ثبت‌شده به‌جای قیمتِ بازار. یک موتور، دو ورودی — وگرنه
 * «سودِ لحظه‌ای» و «سودِ نهایی» دو تعریفِ کارمزد پیدا می‌کردند و در روزِ بستن
 * با هم نمی‌خواندند.
 */
export function realizedPnl(pos, { fees } = {}) {
  if (!isClosed(pos)) return { available: false, reason: CLOSE_REASONS.notClosed, pnl: NaN, pnlTotal: NaN };
  const mark = pnlFromPrices(pos, pos.exit.prices, { fees });
  if (!mark.available) return { available: false, reason: mark.reason, pnl: NaN, pnlTotal: NaN };
  const held = daysBetween(
    normalizeHistoryDate(entryNumberOf(pos)),
    exitDateNumber(pos),
  );
  const capital = num(pos?.entryRisk?.capital, NaN);
  const retPct = capital > 0 ? (mark.pnl / capital) * 100 : NaN;
  return {
    available: true, reason: '',
    pnl: mark.pnl, pnlTotal: mark.pnlTotal,
    entryNet: mark.entryNet, exitNet: mark.closeNet,
    daysHeld: Number.isFinite(held) ? held : NaN,
    capital, retPct,
    // بازده ماهانه بی روزِ نگه‌داری ساخته نمی‌شود، و روزِ صفر هم مخرج نیست:
    // موقعیتی که همان روز باز و بسته شده «بازده ماهانهٔ بی‌نهایت» ندارد.
    retMonthPct: capital > 0 && Number.isFinite(held) && held > 0 ? ((mark.pnl / capital) * 100 * 30) / held : NaN,
    exitDate: exitDateNumber(pos),
    exitLabel: historyDateLabel(exitDateNumber(pos)),
  };
}

function entryNumberOf(pos) {
  const entry = parseJalali(pos?.entryDate);
  if (!entry) return 0;
  return (entry.getUTCFullYear() * 10000) + ((entry.getUTCMonth() + 1) * 100) + entry.getUTCDate();
}

/**
 * جمعِ دفترِ بسته‌شده‌ها.
 *
 * `available:false` در هر ردیف، کلِ جمع را نامعلوم می‌کند — نه اینکه آن ردیف
 * صفر شمرده شود. جمعِ نصفه، عددی می‌سازد که کوچک‌تر از واقعیت است و هیچ‌جا
 * نمی‌گوید چرا.
 */
export function realizedSummary(list = [], { fees } = {}) {
  const rows = list.map((pos) => ({ pos, realized: realizedPnl(pos, { fees }) }));
  const complete = rows.length > 0 && rows.every((row) => row.realized.available);
  const total = complete ? rows.reduce((sum, row) => sum + row.realized.pnlTotal, 0) : NaN;
  const wins = rows.filter((row) => row.realized.available && row.realized.pnlTotal > 0).length;
  const losses = rows.filter((row) => row.realized.available && row.realized.pnlTotal < 0).length;
  return {
    rows, complete, total, count: rows.length, wins, losses,
    winRatePct: wins + losses > 0 ? (wins / (wins + losses)) * 100 : NaN,
  };
}
