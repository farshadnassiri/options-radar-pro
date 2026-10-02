// ساعت تلاطم — زمان تا سررسید برای مسیر تلاطم درون‌روزی.
//
// ═══ چرا لازم شد ═══
//
// بقیهٔ برنامه زمان تا سررسید را «روز تقویمی صحیح ÷ روز سال» می‌گیرد (همان
// `remainedDay` تابلو). برای یک عدد در روز درست است؛ برای مسیر درون‌روزی دو
// اعوجاج می‌سازد:
//
//   ۱. درون روز، قیمت قرارداد فرسوده می‌شود ولی T ثابت می‌ماند؛ پس تلاطمِ
//      ضمنی سراشیبیِ ساختگی می‌گیرد — «اکنون در برابر بازگشایی» بیشترش
//      همین است.
//   ۲. شنبه T یک‌باره سه روز کم می‌شود، در حالی که از چهارشنبه تا شنبه هیچ
//      جلسه‌ای نگذشته. با ده روز مانده، پرشِ حدود ۲۰٪ نسبی بی هیچ خبری.
//
// اینجا T از «ثانیهٔ معاملاتیِ باقی‌مانده» هم ساخته می‌شود. این **پارامترِ
// همین مسیر** است: موتور بلک‌شولز، `dayCountYear` و شاخص روزانهٔ موجود
// (`core/vol-rank.mjs`) دست نمی‌خورند؛ پیش‌فرض آن‌ها همان روز تقویمی است.
//
// خالص است: تقویم آینده (تعطیلات) ورودی است و نبودنش با پرچم
// `assumedCalendar` گفته می‌شود، نه حدس بی‌صدا.

import { dateUtc, daysBetween, normalizeHistoryDate } from './history.mjs';

export const VOL_CLOCK_VERSION = 1;

export const VOL_TIME_BASES = [
  ['tradingSeconds', 'ثانیهٔ معاملاتی'],
  ['tradingPlusOffDay', 'ثانیهٔ معاملاتی + وزن روز تعطیل'],
  ['calendarSeconds', 'ثانیهٔ تقویمی'],
  ['calendarDays', 'روز تقویمی صحیح (رفتار پیشین برنامه)'],
];
export const VOL_EXPIRY_MOMENTS = [
  ['sessionEnd', 'پایان جلسهٔ روز سررسید'],
  ['sessionStart', 'آغاز جلسهٔ روز سررسید'],
];

const WEEKDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** «۱۴۰۵/۰۷/۱۳»، «2026-10-21» یا ۸ رقم → تاریخ میلادی فشرده؛ نامعتبر صفر. */
const compactDate = (value) => normalizeHistoryDate(String(value ?? '')
  .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[^\d]/g, ''));
const finite = (value) => {
  const out = Number(value);
  return value === null || value === '' || value === undefined || !Number.isFinite(out) ? NaN : out;
};

const hhmm = (text, fallback) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? '').trim());
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 : fallback;
};

/** جلسه از تنظیمات «ساعات بازار»: آغاز، پایان، طول، و روزهای هفته. */
export function sessionOf(settings = {}) {
  const open = hhmm(settings.openHHMM, 9 * 3600);
  const close = hhmm(settings.closeHHMM, 12 * 3600 + 30 * 60);
  const days = String(settings.tradeDays ?? 'Sat,Sun,Mon,Tue,Wed')
    .split(/[,\s]+/).map((d) => WEEKDAYS[d.slice(0, 3).toLowerCase()]).filter((d) => d !== undefined);
  return { open, close, length: Math.max(1, close - open), weekdays: new Set(days.length ? days : [6, 0, 1, 2, 3]) };
}

/**
 * تقویم: روز کاریِ هفته منهای تعطیلات رسمی.
 *
 * `holidays` فهرست روزهای تعطیل (میلادی یا جلالی؛ هر دو نرمال می‌شوند).
 * `known: false` یعنی فهرستی نداریم و تقویم آینده **فرضی** است — رابط باید
 * این را بگوید.
 */
export function volCalendar({ settings = {}, holidays = [], known = false } = {}) {
  const session = sessionOf(settings);
  const off = new Set((holidays || []).map((d) => compactDate(d?.date ?? d)).filter(Boolean));
  const memo = new Map();
  const isTradingDay = (date) => {
    const d = normalizeHistoryDate(date);
    const utc = dateUtc(d);
    return !!utc && session.weekdays.has(utc.getUTCDay()) && !off.has(d);
  };
  /** شمار روزهای معاملاتی و تعطیلِ **میان** دو تاریخ (هر دو سر بیرون). */
  const between = (a, b) => {
    const key = `${a}|${b}`;
    if (memo.has(key)) return memo.get(key);
    const start = dateUtc(a), span = daysBetween(a, b);
    let trading = 0, offDays = 0;
    for (let i = 1; i < span; i += 1) {
      const t = new Date(start.getTime() + i * 86400000);
      const d = t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
      if (isTradingDay(d)) trading += 1; else offDays += 1;
    }
    const out = { trading, offDays };
    memo.set(key, out);
    return out;
  };
  return { session, isTradingDay, between, assumed: !known, holidays: off.size };
}

/**
 * زمان تا سررسید در یک لحظه.
 *
 * `at`: `{ date, second }` (ثانیه از نیمه‌شب تهران). `expiry`: تاریخ سررسید.
 * پایان عمر قرارداد `expiryMoment` است (پیش‌فرض پایان جلسهٔ روز سررسید) —
 * تنظیمی صریح که باید با مشخصات رسمی قرارداد تطبیق داده شود.
 *
 * خروجی: `years` (مخرج T در بلک‌شولز)، `tradingSeconds`، `calendarSeconds`،
 * `days` (روز تقویمی صحیح)، `assumedCalendar`، و `why` اگر ساخته نشد.
 */
export function volTime(at, expiry, {
  basis = 'tradingSeconds', settings = {}, calendar = null, offDayWeight = 0, expiryMoment = 'sessionEnd',
} = {}) {
  const cal = calendar || volCalendar({ settings });
  const date = normalizeHistoryDate(at?.date);
  const end = normalizeHistoryDate(expiry);
  const second = finite(at?.second);
  const { open, close, length } = cal.session;
  const dayCountYear = finite(settings.dayCountYear) > 0 ? finite(settings.dayCountYear) : 365;
  const tdy = finite(settings.tradingDaysYr) > 0 ? finite(settings.tradingDaysYr) : 240;
  const days = daysBetween(date, end);
  const base = { basis, days, assumedCalendar: cal.assumed, years: NaN, tradingSeconds: NaN, calendarSeconds: NaN };
  if (!date || !end || !Number.isFinite(days) || days < 0) return { ...base, why: 'input' };
  const sec = Number.isFinite(second) ? Math.min(86400, Math.max(0, second)) : close;
  const endSecond = expiryMoment === 'sessionStart' ? open : close;
  const calendarSeconds = days * 86400 + (endSecond - sec);
  if (!(calendarSeconds > 0)) return { ...base, calendarSeconds, why: 'expired' };

  // ثانیهٔ معاملاتی: باقیِ جلسهٔ امروز + جلسه‌های کامل میانی + بخشِ روز سررسید.
  const clampToSession = (s) => Math.min(close, Math.max(open, s));
  let tradingSeconds;
  if (days === 0) {
    tradingSeconds = cal.isTradingDay(date) ? Math.max(0, clampToSession(endSecond) - clampToSession(sec)) : 0;
  } else {
    const today = cal.isTradingDay(date) ? close - clampToSession(sec) : 0;
    const mid = cal.between(date, end).trading * length;
    const last = cal.isTradingDay(end) ? clampToSession(endSecond) - open : 0;
    tradingSeconds = today + mid + last;
  }
  const offDays = days > 0 ? cal.between(date, end).offDays + (cal.isTradingDay(end) ? 0 : 1) : 0;

  let years;
  if (basis === 'calendarDays') years = days / dayCountYear;
  else if (basis === 'calendarSeconds') years = calendarSeconds / (dayCountYear * 86400);
  else if (basis === 'tradingPlusOffDay') {
    const w = Math.min(1, Math.max(0, finite(offDayWeight) || 0));
    years = (tradingSeconds + w * offDays * length) / ((tdy + w * Math.max(0, dayCountYear - tdy)) * length);
  } else years = tradingSeconds / (tdy * length);

  return {
    ...base, years, tradingSeconds, calendarSeconds, offDays,
    why: years > 0 ? '' : 'noTradingTime',
  };
}

/** پارامترهای ساعت از تنظیمات — یک جا، تا هر مصرف‌کننده همان را بخواند. */
export function volClockParams(settings = {}) {
  const basis = VOL_TIME_BASES.some(([id]) => id === settings.volTimeBasis) ? settings.volTimeBasis : 'tradingSeconds';
  const expiryMoment = VOL_EXPIRY_MOMENTS.some(([id]) => id === settings.volExpiryMoment) ? settings.volExpiryMoment : 'sessionEnd';
  const w = finite(settings.volOffDayWeight);
  return { basis, expiryMoment, offDayWeight: Number.isFinite(w) ? Math.min(1, Math.max(0, w)) : 0 };
}

/**
 * فهرست تعطیلات از `data/holidays.json`.
 *
 * دو شکل پذیرفته می‌شود: آرایهٔ تاریخ، یا `{ holidays: [{ date, name }] }`.
 * تاریخ میلادی یا جلالی، با خط‌تیره یا اسلش یا بی‌جداکننده. ردیفِ
 * نامعتبر کنار می‌رود و شمرده می‌شود — بی‌صدا نیفتد.
 */
export function parseHolidays(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.holidays) ? json.holidays : null;
  if (!list) return { holidays: [], dropped: 0, ok: false };
  const out = new Set();
  let dropped = 0;
  for (const item of list) {
    const d = compactDate(typeof item === 'object' && item ? item.date : item);
    if (d) out.add(d); else dropped += 1;
  }
  return { holidays: [...out].sort((a, b) => a - b), dropped, ok: true };
}
