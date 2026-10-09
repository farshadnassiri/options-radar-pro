// تابلوی کاملِ آخرین جلسه، روی دیسک (۱۴۰۵/۰۷/۱۷).
//
// پرسش صاحب پروژه: «اگر قراردادی در آخرین روز کاری سررسید شده باشد و امروز
// تعطیل باشد، در محاسبات برنامه لحاظ می‌شود؟ قراردادی چهارشنبه سررسید شده
// ولی امروز در اطلاعات بازار نمی‌آید.» علت: عکسِ پس از بستن فقط در حافظه
// بود. سرورِ تازه‌روشن در روز تعطیل تابلوی امروزِ بالادست را می‌گرفت که
// قراردادِ سررسیدشده را دیگر ندارد — و همان را «ارقام جلسهٔ قبل» می‌نامید.
// پس جمع‌های چهارشنبه (ارزش، سهم کال و پوت، جهت، «ترین»ها) بی معاملاتِ
// روزِ آخرِ همان قرارداد بود.
//
// حالا سرور تابلوی هر جلسه را در طول جلسه و پس از بستن ذخیره می‌کند و اگر
// بیرون از جلسه روشن شود، همان را پیش از هر چیز بار می‌کند. این ماژول خالص
// است: کِی ذخیره شود، کدام پرونده بار شود، و کدام قرارداد در همان جلسه
// سررسید شد.

const n = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : 0;
};

/** در جلسه هر چند دقیقه یک بار؛ پس از بستن هر دور (تا عکس نهایی ثابت شود). */
export const SESSION_BOARD_EVERY_MS = 5 * 60_000;
export const SESSION_BOARD_KEEP = 5;
const SAVE_PHASES = new Set(['open', 'after', 'ungated']);

export function sessionBoardDue({ phase, today, now = Date.now(), last = {} } = {}) {
  if (!SAVE_PHASES.has(phase) || !(n(today) > 0)) return false;
  if (n(last.day) !== n(today)) return true;
  if (phase === 'after') return true;
  return now - n(last.at) >= SESSION_BOARD_EVERY_MS;
}

/** پروندهٔ ذخیره‌شده. `final` یعنی عکسِ نهاییِ پس از بستن ثابت شده بود. */
export function sessionBoardRecord({ day, at, phase, final = false, rows = [] } = {}) {
  return { version: 1, day: n(day), at: n(at), phase: String(phase || ''), final: Boolean(final), count: rows.length, rows };
}

/**
 * کدام پرونده بار شود؟ فقط بیرون از جلسهٔ باز: تازه‌ترین روزِ پیش از امروز،
 * یا خودِ امروز اگر بازار امروز باز بوده و حالا بسته است.
 * `days` نام پرونده‌های موجود (عدد روز) است.
 */
export function seedDay({ phase, today, days = [] } = {}) {
  if (!['holiday', 'before', 'after'].includes(phase)) return 0;
  const usable = days.map(n).filter((day) => day > 0 && (day < n(today) || (phase === 'after' && day === n(today))));
  return usable.length ? Math.max(...usable) : 0;
}

/** پرونده‌ای که بار شدنی است: شکل درست و ردیف‌دار. */
export function validSessionBoard(record) {
  return Boolean(record && record.version === 1 && n(record.day) > 0 && n(record.at) > 0
    && Array.isArray(record.rows) && record.rows.length > 0);
}

/** تاریخ سررسید ردیفِ خام تابلو (میلادی، `yyyymmdd`). */
export const rowExpiry = (row) => n(row?.expiryGregorian) || n(row?.endDate);

/**
 * قراردادهایی که در همان جلسه آخرین روزشان بود: روزِ ماندهٔ صفر یا کمتر، یا
 * سررسیدِ هم‌روز یا پیش از روزِ جلسه. هر ردیف تابلو یک جفت کال و پوت است.
 */
export function expiringRows(rows = [], day = 0) {
  return (rows || []).filter((row) => {
    const left = Number(row?.remainedDay);
    if (Number.isFinite(left) && row?.remainedDay !== '' && row?.remainedDay !== null && left <= 0) return true;
    const expiry = rowExpiry(row);
    return n(day) > 0 && expiry > 0 && expiry <= n(day);
  });
}

/** شمار قراردادهای (نه ردیف‌های) سررسیدشده در همان جلسه. */
export function expiringCount(rows = [], day = 0) {
  return expiringRows(rows, day).reduce((sum, row) => sum + (row.insCode_C ? 1 : 0) + (row.insCode_P ? 1 : 0), 0);
}
