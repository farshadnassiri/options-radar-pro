// ریزمعاملهٔ یک روز از کدام نقطهٔ پایانی می‌آید — و چند درخواست می‌شود.
//
// ═══ چرا این تصمیم از رابط بیرون کشیده شد ═══
//
// ممیزی (۱۴۰۵/۰۶/۲۴) ردیف ۱: «تاریخ امروز وارد بازه بک‌تست شده، اما گام
// سوم برای همه روزها — including امروز — از `/api/trades` تاریخی استفاده
// می‌کند. endpoint تاریخی امروز تا پایان روز خالی است؛ در حالی که داده
// امروز در `/api/live-trades` موجود است.»
//
// بازتولیدش هم در گزارش بود:
//
//   اهرم        `/api/trades` ۰   ·  `/api/live-trades` ۱۰٬۷۶۱
//   ضهرم۶۰۴۰    `/api/trades` ۰   ·  `/api/live-trades` ۱۲۲
//   طهرم۶۰۴۰    `/api/trades` ۰   ·  `/api/live-trades` ۱۱۴
//
// همان الگوی دفتر روزانه، یک لایه پایین‌تر: بالادست دادهٔ یک روز را تا
// پایان همان روز در مسیر تاریخی نمی‌گذارد. حالا که امروز وارد بازه شده،
// این شکاف مستقیم به کاربر می‌رسد — روزی که داده‌اش هست «بی‌معامله» دیده
// می‌شود.
//
// ═══ و ردیف ۴: تعداد درخواست ═══
//
// «به‌جای endpoint دسته‌ای موجود، برای هر روز و هر ابزار یک درخواست جدا
// ارسال می‌شود. برای استراتژی دوپا، ۴۵ روز یعنی حداقل ۱۳۵ درخواست مرورگر.»
// درست بود، و `/api/trades/batch` از قبل وجود داشت و استفاده نمی‌شد.
//
// هر دو تصمیم اینجا خالص‌اند تا مستقیم آزمون شوند: رابط نباید نسخهٔ خودش
// را داشته باشد، و «کدام روز از کدام منبع» نباید از دل `innerHTML` بیرون
// کشیده شود.

import { tehranDateNumber } from './tehran-day.mjs';

export const TRADES_LIVE = 'live';
export const TRADES_HISTORY = 'history';

/** سقف خودِ `/api/trades/batch` برای هر درخواست. */
export const BATCH_PAIR_CAP = 1200;
/** سقف خودِ `/api/live-trades` برای هر درخواست. */
export const LIVE_CODE_CAP = 24;

const day = (value) => {
  const x = Math.trunc(Number(value));
  return Number.isFinite(x) && x > 0 ? x : 0;
};

/**
 * ریزمعاملهٔ این روز از کجا می‌آید.
 *
 * ═══ چرا ورودی `liveDate` است، نه فازِ بازار ═══
 *
 * «نوار زنده مال امروز است یا جلسهٔ قبل؟» را قبلاً `liveDayOf` جواب داده:
 * فاز باید `open`/`after`/`ungated` باشد و منبعِ عکس هم تابلوی امروز، نه
 * بایگانی. خروجی‌اش همان `liveDate` است — صفر یعنی «نمی‌دانیم عکس مال کدام
 * روز است».
 *
 * پس اینجا آن قاعده **تکرار** نمی‌شود. تکرارش یعنی شش ماه بعد یکی‌شان
 * اصلاح شود و آن یکی نه، و هیچ‌کس نفهمد کدام درست است.
 */
export function tradesSourceFor(date, { liveDate = 0 } = {}) {
  const wanted = day(date), live = day(liveDate);
  return live && wanted === live ? TRADES_LIVE : TRADES_HISTORY;
}

/**
 * روزها را بین دو منبع تقسیم می‌کند.
 *
 * روزِ آینده اصلاً وارد هیچ‌کدام نمی‌شود: نه تاریخی دارد نه نواری، و
 * فرستادنش فقط یک درخواستِ حتماً‌خالی است. `ahead` جدا برمی‌گردد تا
 * فراخوان بتواند بگوید چرا آن روز در نتیجه نیست.
 */
export function splitTradeDays(dates = [], { liveDate = 0, today = tehranDateNumber() } = {}) {
  const live = [], history = [], ahead = [];
  const now = day(today);
  for (const value of dates || []) {
    const wanted = day(value);
    if (!wanted) continue;
    if (now && wanted > now) { ahead.push(wanted); continue; }
    if (tradesSourceFor(wanted, { liveDate }) === TRADES_LIVE) live.push(wanted);
    else history.push(wanted);
  }
  return { live, history, ahead };
}

/**
 * جفت‌های (ابزار، روز) برای مسیر دسته‌ای، تکه‌تکه تا سقف هر درخواست.
 *
 * ترتیب، روز-به-روز است نه ابزار-به-ابزار: اگر درخواستی وسط کار شکست
 * بخورد، روزهای کامل دست‌نخورده می‌مانند و روزِ ناقص صریح شناخته می‌شود —
 * به‌جای اینکه همهٔ روزها یک پای گم‌شده داشته باشند.
 */
export function tradeBatches(dates = [], codes = [], { cap = BATCH_PAIR_CAP } = {}) {
  const list = [...new Set((codes || []).map((code) => String(code || '')).filter(Boolean))];
  const size = Math.max(1, Math.trunc(Number(cap) || BATCH_PAIR_CAP));
  const out = [];
  let current = [];
  for (const value of dates || []) {
    const date = day(value);
    if (!date || !list.length) continue;
    // یک روز هیچ‌وقت بین دو درخواست نصف نمی‌شود
    if (current.length && current.length + list.length > size) { out.push(current); current = []; }
    for (const ins of list) current.push({ ins, date });
  }
  if (current.length) out.push(current);
  return out;
}

/** کلید پاسخ دسته‌ای، همان شکلی که سرور می‌سازد. */
export const batchKey = (ins, date) => `${day(date)}:${String(ins)}`;

/**
 * پاسخ دسته‌ای را به همان شکلی درمی‌آورد که مسیر تک‌روزه می‌دهد.
 *
 * ═══ ردیف ۵ ممیزی ═══
 *
 * «خطای دریافت یک یا چند پا مستقل گزارش نمی‌شود. روز خراب فقط در شمارندهٔ
 * `empty` می‌رود… در نتیجه خرابی شبکه با واقعیت "قرارداد معامله نشده"
 * اشتباه می‌شود.»
 *
 * پس `failed` همیشه پر می‌شود: ابزاری که پاسخش خطا داشت یا اصلاً در پاسخ
 * نبود، «بدون معامله» فرض نمی‌شود. ردیف ۶ هم همین را می‌خواهد — شکاف
 * واقعیِ بالادست باید از خرابیِ ما جدا دیده شود.
 */
export function dayFromBatch(items = {}, date, codes = []) {
  const wanted = day(date);
  const byIns = {}, failed = [];
  for (const code of codes || []) {
    const ins = String(code);
    const hit = items?.[batchKey(ins, wanted)];
    // ردیفِ رسیده کافی نیست: نوارِ ناقص یا تأییدنشده می‌تواند نمودار بسازد
    // ولی نمایندهٔ همهٔ معامله‌های آن روز نیست. خالیِ سالم هم complete=true دارد.
    if (!hit || hit.error || hit.throttled || hit.complete !== true || !Array.isArray(hit.rows)) {
      failed.push(ins); continue;
    }
    byIns[ins] = hit.rows;
  }
  return { byIns, failed, date: wanted, source: TRADES_HISTORY };
}

/** همان، برای پاسخ نوار زنده. */
export function dayFromLiveTape(items = {}, date, codes = []) {
  const wanted = day(date);
  const byIns = {}, failed = [];
  for (const code of codes || []) {
    const ins = String(code);
    const hit = items?.[ins];
    if (!hit || hit.error || !Array.isArray(hit.rows)) { failed.push(ins); continue; }
    byIns[ins] = hit.rows;
  }
  return { byIns, failed, date: wanted, source: TRADES_LIVE };
}
