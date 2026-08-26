// دروازهٔ زمان — تنها راهی که داده به موتور شبیه‌سازی می‌رسد.
//
// این فایل مهم‌ترین بند مشخصات را پیاده می‌کند: هیچ داده‌ای از بعد از
// لحظهٔ جاری، به هیچ شکلی، به کاربر یا موتور پیشنهاد نرسد. دلیل اهمیتش
// این نیست که نقضش بد است؛ این است که نقضش **بی‌صدا**ست. یک بک‌تست نشتی
// خطا نمی‌دهد، خالی نمی‌ماند، و کند هم نمی‌شود — فقط عددهایی می‌دهد که
// همیشه از واقعیت بهترند، و کسی که آن عددها را می‌بیند هیچ راهی ندارد
// بفهمد دروغ‌اند.
//
// ═══ چرا هم بریدن هست و هم پرتاب کردن ═══
//
// مشخصات می‌گوید «هر پرس‌وجویی که مهر زمانی بزرگ‌تر از now برگرداند باید
// خطا پرتاب کند — نه فیلتر شود». درست است، ولی نمی‌تواند در همه‌جا درست
// باشد: بالادست اصلاً «تا این لحظه» را نمی‌فهمد. `GetClosingPriceDailyList`
// کل سری را می‌دهد و `BestLimits/{date}` کل روز را. اگر همان‌جا هم پرتاب
// کنیم، هیچ‌وقت هیچ داده‌ای وارد نمی‌شود.
//
// پس دو لایه با دو کار متفاوت:
//
//   admit*  مرزِ ورود. یک بار، همان‌جا که داده خام از بالادست می‌آید.
//           می‌برد و **گزارش می‌دهد چقدر برید**.
//   assert* همه‌جای دیگر. پرتاب می‌کند.
//
// نکته‌ای که این دو را از تکرار جدا می‌کند: اگر `assert` جایی شلیک کند،
// یعنی مسیری از کنار `admit` رد شده. پس آن پرتاب، هشدارِ دور زدنِ دروازه
// است نه بررسی دوبارهٔ همان چیز. بدون آن، دور زدن دروازه هم بی‌صدا بود.
//
// ═══ ردیفِ روزِ جاری ═══
//
// خطرناک‌ترین ردیف کل داده، ردیف روزانهٔ **همان روزی است که در آن
// ایستاده‌ایم**. `close` و `high` و `low` آن ردیف، حاصل کل روزند. در ساعت
// ده و نیم، هیچ‌کدامشان هنوز اتفاق نیفتاده‌اند. ردیف نه بریده می‌شود و نه
// نصفه نگه داشته می‌شود: **کامل حذف می‌شود**، و وضعیت آن روز از نوار
// معاملات و دفتر سفارش بازسازی می‌شود. نگه‌داشتن نصفه‌اش یعنی جایی در
// برنامه، `close` روز جاری خوانده می‌شود و کسی متوجه نمی‌شود.

import { num } from './num.mjs';
import { normalizeHistoryDate } from './history.mjs';
import { tradeSecond } from './backtest.mjs';
import {
  moment, momentKey, laterThan, INTRADAY_START_SECOND, INTRADAY_END_SECOND,
  tradingDays, shiftTradingDays, stepMoment, momentsBetween, snapToTradingDay,
} from './trading-calendar.mjs';
import { normalizeBookEvents, bookAt, quoteFromBook } from './book-history.mjs';
import { markAt } from './intraday-mark.mjs';

/**
 * نشت داده از آینده.
 *
 * پیام فارسی است چون ممکن است به کاربر برسد، ولی مهم‌تر از پیام، میدان‌های
 * ساختاری‌اند: `kind` می‌گوید کدام مسیر داده، `found` می‌گوید تازه‌ترین
 * چیزی که دیده شد مال چه لحظه‌ای بود، و `now` می‌گوید کجا ایستاده بودیم.
 * بدون این سه، ردیابی نشت یعنی خواندن کل مسیر از اول.
 */
export class FutureDataLeakError extends Error {
  constructor({ kind = 'داده', found = null, now = null, count = 0, where = '' } = {}) {
    const at = found ? `${found.date} ${secondLabel(found.second)}` : 'نامعلوم';
    const cut = now ? `${now.date} ${secondLabel(now.second)}` : 'نامعلوم';
    super(`نشت داده از آینده در «${kind}»: ${count} ردیف پس از لحظهٔ جاری. تازه‌ترین ${at}، لحظهٔ جاری ${cut}.${where ? ` مسیر: ${where}` : ''}`);
    this.name = 'FutureDataLeakError';
    this.kind = kind; this.found = found; this.now = now; this.count = count; this.where = where;
  }
}

function secondLabel(second) {
  const total = Math.max(0, Math.trunc(num(second, 0)));
  const h = String(Math.trunc(total / 3600)).padStart(2, '0');
  const m = String(Math.trunc((total % 3600) / 60)).padStart(2, '0');
  return `${h}:${m}`;
}

// ═════════════════════ مرزِ ورود ═════════════════════

/**
 * سری روزانه تا لحظهٔ جاری.
 *
 * ردیف روزهای پس از امروز حذف می‌شود، و ردیف **خودِ امروز** هم — مگر
 * وقتی جلسه تمام شده باشد. `partialDay` می‌گوید ردیف امروز کنار گذاشته
 * شد تا مصرف‌کننده بداند باید از نوار معاملات بسازدش، نه اینکه فکر کند
 * امروز اصلاً معامله‌ای نشده.
 */
export function admitDaily(rows = [], now) {
  const cut = moment(now?.date, now?.second);
  const out = [];
  let future = 0, latest = null, partialDay = false;
  for (const row of Array.isArray(rows) ? rows : []) {
    const date = normalizeHistoryDate(row?.date);
    if (!date) continue;
    if (date > cut.date) {
      future += 1;
      if (!latest || date > latest.date) latest = { date, second: INTRADAY_END_SECOND };
      continue;
    }
    if (date === cut.date) {
      // روز جاری فقط وقتی کامل است که جلسه تمام شده باشد.
      if (cut.second >= INTRADAY_END_SECOND) { out.push(row); continue; }
      partialDay = true;
      future += 1;
      if (!latest || date > latest.date) latest = { date, second: INTRADAY_END_SECOND };
      continue;
    }
    out.push(row);
  }
  out.sort((a, b) => normalizeHistoryDate(a.date) - normalizeHistoryDate(b.date));
  return { rows: out, dropped: future, partialDay, latestDropped: latest, now: cut };
}

/** ریزمعامله‌های همان روز تا لحظهٔ جاری. روزِ دیگر اصلاً وارد نمی‌شود. */
export function admitIntraday(rows = [], now, date) {
  const cut = moment(now?.date, now?.second);
  const day = normalizeHistoryDate(date) || cut.date;
  if (day > cut.date) return { rows: [], dropped: (rows || []).length, wrongDay: true, now: cut };
  const limit = day < cut.date ? INTRADAY_END_SECOND : cut.second;
  const out = [];
  let dropped = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const second = Number.isFinite(row?.second) ? row.second : tradeSecond(row?.time);
    if (second > limit) { dropped += 1; continue; }
    out.push(row);
  }
  return { rows: out, dropped, wrongDay: false, now: cut, limit, date: day };
}

/** رویدادهای دفتر سفارش همان روز تا لحظهٔ جاری. */
export function admitBookEvents(events = [], now, date) {
  const cut = moment(now?.date, now?.second);
  const day = normalizeHistoryDate(date) || cut.date;
  if (day > cut.date) return { events: [], dropped: (events || []).length, wrongDay: true, now: cut };
  const limit = day < cut.date ? INTRADAY_END_SECOND : cut.second;
  const out = [];
  let dropped = 0;
  for (const event of Array.isArray(events) ? events : []) {
    if (num(event?.second, Infinity) > limit) { dropped += 1; continue; }
    out.push(event);
  }
  return { events: out, dropped, wrongDay: false, now: cut, limit, date: day };
}

// ═════════════════════ نگهبان ═════════════════════

/**
 * هیچ ردیفی نباید از لحظهٔ جاری جلوتر باشد.
 *
 * `at` می‌گوید مهر زمانی هر ردیف کجاست. پیش‌فرضش هم ردیف روزانه را
 * می‌فهمد و هم ردیف درون‌روزی: نبودن `second` یعنی ردیفِ کل روز، و کل
 * روز تا پایان جلسه ادامه دارد — پس محافظه‌کارانه با پایان جلسه سنجیده
 * می‌شود، نه با ابتدای آن.
 */
export function assertNoFuture(rows = [], now, { kind = 'داده', where = '', at = defaultAt } = {}) {
  const cut = moment(now?.date, now?.second);
  const cutKey = momentKey(cut);
  if (!Number.isFinite(cutKey)) {
    throw new FutureDataLeakError({ kind, now: cut, where, count: 0 });
  }
  let count = 0, latest = null;
  for (const row of Array.isArray(rows) ? rows : []) {
    const point = at(row);
    const key = momentKey(point);
    if (!Number.isFinite(key) || key <= cutKey) continue;
    count += 1;
    if (!latest || key > momentKey(latest)) latest = point;
  }
  if (count) throw new FutureDataLeakError({ kind, found: latest, now: cut, count, where });
  return rows;
}

function defaultAt(row) {
  const date = normalizeHistoryDate(row?.date);
  if (!date) return { date: 0, second: 0 };
  const second = Number.isFinite(row?.second) ? row.second
    : (row?.time !== undefined ? tradeSecond(row.time) : INTRADAY_END_SECOND);
  return { date, second };
}

// ═════════════════════ دروازه ═════════════════════

/**
 * منبع دادهٔ زمان‌بند.
 *
 * `load` توابع دریافت را از بیرون می‌گیرد، چون `core/` به شبکه دست
 * نمی‌زند. همین تزریق، آزمون را هم ممکن می‌کند: آزمون پذیرشِ نشت، همان
 * جلسه را یک بار با دادهٔ کامل و یک بار با دادهٔ بریده اجرا می‌کند و
 * انتظار دارد خروجی **ذره‌ای** فرق نکند.
 *
 * دروازه **تغییرناپذیر** است. `advance` دروازهٔ تازه‌ای در لحظهٔ جدید
 * می‌سازد و به عقب هم نمی‌رود. سند می‌گوید «هیچ دکمهٔ بازگشت به عقب وجود
 * ندارد، زمان یک‌طرفه است»؛ اگر این را فقط رابط رعایت کند، یک فراخوانی
 * اشتباه در موتور کافی است تا نقض شود.
 */
export function createTimeGate({ sessionId = '', now, load = {}, days = [], referee = false } = {}) {
  const at = moment(now?.date, now?.second);
  if (!at.date) throw new Error('دروازهٔ زمان بدون لحظهٔ جاری ساخته نمی‌شود');
  const calendar = Array.isArray(days) ? days.slice() : [];

  const guard = (rows, options) => (referee ? rows : assertNoFuture(rows, at, options));

  return {
    sessionId,
    referee,
    now: () => ({ ...at }),
    days: () => calendar.slice(),

    /**
     * سری روزانهٔ یک ابزار تا لحظهٔ جاری.
     *
     * `lookback` شمار روز معاملاتی است، نه روز تقویمی. صفر یعنی همه.
     */
    async history(ins, { lookback = 0 } = {}) {
      if (typeof load.dailies !== 'function') return { rows: [], ins, partialDay: false };
      const raw = await load.dailies(ins, { until: at.date });
      const kept = referee
        ? (raw || []).slice().sort((a, b) => normalizeHistoryDate(a.date) - normalizeHistoryDate(b.date))
        : admitDaily(raw, at).rows;
      guard(kept, { kind: `سری روزانهٔ ${ins}`, where: 'history' });
      const span = Math.max(0, Math.trunc(num(lookback, 0)));
      const rows = span > 0 ? kept.slice(-span) : kept;
      // `partialDay` از **لحظه** می‌آید نه از داده.
      //
      // نسخهٔ اول این را از خود سری می‌گرفت: «ردیف امروز بود و کنارش
      // گذاشتم». آن جمله دربارهٔ داده حرف می‌زند، پس روی دادهٔ کامل درست
      // و روی دادهٔ بریده غلط درمی‌آمد — و همین یک بولین کافی بود تا
      // خروجیِ دو جلسه فرق کند. آزمون پذیرش نشت همین را گرفت. شمار ردیفِ
      // بریده‌شده هم به همین دلیل اصلاً بیرون نمی‌رود: عددی که می‌گوید
      // «سه ردیف دیگر هم بود»، خودش خبری از آینده است.
      return { rows, ins, partialDay: at.second < INTRADAY_END_SECOND };
    },

    /**
     * وضعیت یک ابزار در همین لحظه: آخرین معامله، دفتر بازسازی‌شده، و
     * آمار تجمعی تا همین ثانیه.
     *
     * هر سه از داده‌های تاریخ‌دار همان روز ساخته می‌شوند. هیچ‌کدام از
     * ردیف روزانه نمی‌آیند، چون ردیف روزانه کل روز را می‌گوید.
     */
    async snapshot(ins) {
      const out = { ins, date: at.date, second: at.second, trade: null, quote: null, why: '' };
      // عکسِ لحظه، ذاتاً به همان ثانیه بریده می‌شود: `markAt` و `bookAt`
      // خودشان تا آن ثانیه می‌خوانند. پس اینجا حتی دروازهٔ داوری هم چیز
      // بیشتری نمی‌بیند — داوری قدرتش روی **روزهای بعد** است، و آن را با
      // ساختن دروازه در لحظهٔ دیگری به دست می‌آورد، نه با دیدنِ آیندهٔ
      // همین لحظه.
      if (typeof load.trades === 'function') {
        const raw = await load.trades(ins, at.date);
        const admitted = admitIntraday(raw, at, at.date);
        guard(admitted.rows, { kind: `ریزمعاملهٔ ${ins}`, where: 'snapshot' });
        out.trade = markAt(admitted.rows, at.second);
      }
      if (typeof load.book === 'function') {
        const raw = await load.book(ins, at.date);
        const events = normalizeBookEvents(raw);
        const admitted = admitBookEvents(events, at, at.date);
        guard(admitted.events, { kind: `دفتر سفارش ${ins}`, where: 'snapshot' });
        out.quote = quoteFromBook(bookAt(admitted.events, at.second));
      }
      if (!out.trade && !out.quote) out.why = 'تا این لحظه نه معامله‌ای بود نه سفارشی';
      return out;
    },

    /**
     * یک پله جلو. دروازهٔ تازه برمی‌گرداند، نه همین دروازه را عوض می‌کند.
     *
     * `moments` قدم‌های میانی است — همان چیزی که موتور رویداد باید تک‌تک
     * ببیند تا کال مارجین و سررسید و توقف از قلم نیفتند.
     */
    advance(step, { expiryDate = 0, grainSeconds = 15 * 60, limit = 4000 } = {}) {
      const next = stepMoment(calendar, at, step, { expiryDate });
      if (!next.ok) return { ok: false, why: next.why, end: !!next.end, gate: null, moments: [] };
      if (!laterThan(next, at)) {
        return { ok: false, why: 'زمان یک‌طرفه است؛ پله به عقب یا در جا پذیرفته نمی‌شود', gate: null, moments: [] };
      }
      const path = momentsBetween(calendar, at, next, { seconds: grainSeconds, limit });
      return {
        ok: true, rolled: !!next.rolled, truncated: !!path.truncated,
        moments: path.moments,
        gate: createTimeGate({ sessionId, now: next, load, days: calendar, referee }),
      };
    },
  };
}

/**
 * دروازهٔ داوری — تنها استثنای مجاز.
 *
 * پس از بسته‌شدن جلسه، برای مقایسه با معیار و برای گزارش پایانی، باید به
 * آنچه واقعاً بعداً رخ داد دسترسی داشت. این تابع همان دسترسی را می‌دهد و
 * نامش هم همین را می‌گوید: هر جای کد که این را صدا بزند، در دیف پیداست.
 * نه پرچمی در پیکربندی، نه پارامتری با پیش‌فرض خاموش.
 */
export function createRefereeGate({ sessionId = '', now, load = {}, days = [] } = {}) {
  return createTimeGate({ sessionId, now, load, days, referee: true });
}

export { moment, momentKey, laterThan, tradingDays, shiftTradingDays, snapToTradingDay };
export { INTRADAY_START_SECOND, INTRADAY_END_SECOND };
