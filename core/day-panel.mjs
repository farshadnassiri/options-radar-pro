// قیمت پایانیِ همهٔ ابزارهای یک روز — از همان پاسخی که دفتر قراردادها می‌خواند.
//
//     /ClosingPrice/GetInstrmentsHistoryInDay/{YYYYMMDD}
//
// ═══ چرا این ماژول لازم شد ═══
//
// رتبه و صدک تلاطم ضمنی، تلاطمِ **هر روز** یک سال گذشته را می‌خواهد، و
// تلاطم هر روز از قیمت قراردادهای همان روز درمی‌آید. قراردادی که سررسید
// شده از تابلو حذف می‌شود و `GetClosingPriceDailyList` برایش خالی برمی‌گردد
// (همان سوگیری بقایی که دفتر قراردادها برایش ساخته شد). این پاسخ تنها جایی
// است که با **یک** درخواست، پایانیِ همهٔ ابزارهای معامله‌شدهٔ آن روز را
// می‌دهد — سررسیدشده‌ها هم.
//
// `core/roster-scan.mjs` از همین پاسخ فقط هویت را برمی‌دارد؛ اینجا قیمت.
// شکل پاسخ در طول سال‌ها ثابت نمانده، پس مثل آنجا دفاعی خوانده می‌شود:
// شیءِ تودرتویی که بیشترین میدانِ قیمت را دارد، منبع قیمت است.
//
// شبکه نمی‌زند؛ سرور پاسخ را می‌دهد و این ماژول فقط استخراج می‌کند.

import { deepObjects, instrumentFields, unwrapDay } from './roster-scan.mjs';
import { SIDE_CALL, SIDE_PUT, contractSide } from './option-roster.mjs';

export const DAY_PANEL_VERSION = 1;

/** ترتیب ستون‌های هر ابزار در پرونده — فشرده، چون یک سال ۲۴۰ پرونده است. */
export const DAY_PANEL_COLUMNS = ['close', 'last', 'vol', 'trades', 'value', 'low', 'high'];

const PRICE_KEYS = ['pClosing', 'pDrCotVal', 'priceYesterday', 'priceFirst', 'priceMin', 'priceMax', 'qTotTran5J', 'zTotTran', 'qTotCap'];

const n = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : 0;
};

/**
 * یک ردیفِ خام → `{ ins, values }`، یا `null` اگر قیمتی نداشت.
 *
 * شناسه از شیءِ قیمت خوانده می‌شود اگر داشت (همان رکوردِ پایانی)، وگرنه از
 * هویتِ ابزار. ردیفِ بی‌پایانی و بی‌آخرین کنار می‌رود — صفر قیمت نیست.
 */
export function dayPriceRow(row) {
  let best = null, bestScore = 1;
  for (const obj of deepObjects(row)) {
    const score = PRICE_KEYS.reduce((sum, key) => sum + (key in obj ? 1 : 0), 0);
    if (score > bestScore) { best = obj; bestScore = score; }
  }
  if (!best) return null;
  const identity = instrumentFields(row);
  const ins = String(best.insCode ?? best.InsCode ?? identity?.ins ?? '').trim();
  if (!ins) return null;
  const close = n(best.pClosing), last = n(best.pDrCotVal);
  if (!(close > 0) && !(last > 0)) return null;
  return {
    ins, side: contractSide(identity?.name || '', identity?.symbol || ''),
    values: [close, last, n(best.qTotTran5J), n(best.zTotTran), n(best.qTotCap), n(best.priceMin), n(best.priceMax)],
  };
}

/**
 * پاسخ یک روز → پروندهٔ قیمت همان روز.
 *
 * فقط کال و پوتِ استاندارد نگه داشته می‌شود (`contractSide`، همان قاعدهٔ
 * دفتر قراردادها): قیمت پایه از سری روزانهٔ خودش می‌آید و نگه‌داشتنِ هزاران
 * سهم و اوراق، پروندهٔ هر روز را چند برابر می‌کرد. اختیار تبعی بیرون است.
 *
 * `instruments` شمار ردیف‌های پاسخ است و `priced` شمار آن‌هایی که قیمت
 * داشتند. صفر بودنِ `priced` با ردیفِ ناصفر یعنی شکل پاسخ عوض شده — همان
 * چیزی که باید دیده شود، نه اینکه پرونده‌ای خالی و بی‌صدا نوشته شود.
 */
export function panelFromDay(payload, date) {
  const day = Number(String(date ?? '').replace(/[^\d]/g, '')) || 0;
  const rows = unwrapDay(payload);
  const prices = {};
  let priced = 0;
  for (const row of rows) {
    const got = dayPriceRow(row);
    if (!got || (got.side !== SIDE_CALL && got.side !== SIDE_PUT)) continue;
    if (!prices[got.ins]) priced += 1;
    prices[got.ins] = got.values;
  }
  return { version: DAY_PANEL_VERSION, date: day, columns: DAY_PANEL_COLUMNS, instruments: rows.length, priced, prices };
}

/** برش پرونده برای یک مجموعه ابزار. */
export function panelSlice(panel, wanted) {
  const set = wanted instanceof Set ? wanted : new Set((wanted || []).map(String));
  const out = {};
  for (const [ins, values] of Object.entries(panel?.prices || {})) {
    if (set.has(ins)) out[ins] = values;
  }
  return out;
}
