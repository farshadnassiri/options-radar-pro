// سنجش در یک لحظهٔ درون‌روز — نه پایان روز، نه عکس تابلو.
//
// «آزمون همه استراتژی‌ها» تا اینجا دو حالت داشت: تا آخرین روز بسته‌شده، یا
// تا عکس لحظه‌ای تابلو. هر دو یک ردیفِ روزانه می‌سازند. آنچه نداشت این بود:
// «اگر ساعت ده و نیمِ همان روز می‌بستم چه می‌شد؟»
//
// راهش این نیست که موتور بازپخش عوض شود. کافی است ردیفِ **همان روز** در سری
// روزانه، قیمتِ آخرین معاملهٔ پیش از آن لحظه را بگیرد؛ بقیهٔ زنجیره —
// تولید ترکیب، بازپخش، رتبه‌بندی — دست‌نخورده می‌ماند و همان مسیری را
// می‌رود که برای پایان روز می‌رفت. یک موتور، دو ورودی.
//
// قاعدهٔ ۲-۴ اینجا سفت‌ترین شکلش را دارد: قراردادی که تا آن لحظه معامله
// نشده، ردیف آن روز را **از دست می‌دهد** — نه اینکه قیمت پایانی روز یا
// قیمت دیروز رویش بنشیند. نتیجه‌اش این است که ترکیب‌های وابسته به آن
// قرارداد از رتبه‌بندی بیرون می‌افتند، و همین درست است: در آن لحظه قیمتی
// برای بستنشان وجود نداشته.

import { num } from './num.mjs';
import { tradeSecond, tradeTimeLabel, inIntradaySession } from './backtest.mjs';
import { normalizeHistoryDate } from './history.mjs';

/** لحظه‌های پیشنهادی سنجش — نیم‌ساعتی، از بازگشایی تا پایان جلسه. */
export const MARK_MOMENTS = [
  [9 * 3600 + 1800, '۰۹:۳۰'],
  [10 * 3600, '۱۰:۰۰'],
  [10 * 3600 + 1800, '۱۰:۳۰'],
  [11 * 3600, '۱۱:۰۰'],
  [11 * 3600 + 1800, '۱۱:۳۰'],
  [12 * 3600, '۱۲:۰۰'],
  [12 * 3600 + 1800, '۱۲:۳۰'],
];

/**
 * آخرین معاملهٔ هر ابزار تا یک ثانیهٔ مشخص.
 *
 * ورودی همان چیزی است که `/api/trades` می‌دهد (خروجی `normalizeTrades`).
 * معاملهٔ باطل‌شده و معاملهٔ بیرون از جلسهٔ پیوسته وارد نمی‌شوند — همان دو
 * قاعده‌ای که `replayIntraday` هم دارد، تا دو مسیرِ درون‌روزیِ برنامه یک
 * تعریف از «معاملهٔ معتبر» داشته باشند.
 *
 * `volume` و `trades` تجمعی‌اند **تا همان لحظه**: عدد پایان روز، نقدشوندگیِ
 * ساعت ده و نیم را بیش‌برآورد می‌کند و غربال نقدشوندگی روی همان می‌نشیند.
 */
export function markAt(rows = [], second) {
  const cut = num(second, NaN);
  if (!Number.isFinite(cut)) return null;
  let last = null, volume = 0, trades = 0, value = 0;
  for (const row of rows || []) {
    const price = num(row?.price, NaN);
    if (!(price > 0) || row?.canceled || !inIntradaySession(row.time)) continue;
    const at = tradeSecond(row.time);
    if (at > cut) continue;
    const quantity = Math.max(0, num(row.quantity));
    volume += quantity;
    trades += 1;
    value += quantity * price;
    if (!last || at >= last.second) last = { price, second: at, timeLabel: tradeTimeLabel(row.time) };
  }
  if (!last) return null;
  return { ...last, volume, trades, value };
}

/** همان `markAt` برای همهٔ ابزارها. ابزارِ بی‌معامله اصلاً کلید نمی‌گیرد. */
export function marksAt(tapeByIns = {}, second) {
  const out = {};
  for (const [ins, rows] of Object.entries(tapeByIns || {})) {
    const mark = markAt(rows, second);
    if (mark) out[ins] = mark;
  }
  return out;
}

/**
 * ردیف روزِ سنجش را با قیمت لحظه‌ای جایگزین می‌کند.
 *
 * `first` و `low` و `high` **صفر** می‌شوند نه اینکه از ردیف روزانه بمانند:
 * آن سه، دامنهٔ کل روز را می‌گویند و در ساعت ده و نیم هنوز کاملشان اتفاق
 * نیفتاده. نگه‌داشتنشان یعنی مبنای «کمترین قیمت روز» عددی می‌داد که هنوز
 * وجود نداشت — دقیقاً همان جنس خطایی که این ماژول برای جلوگیری از آن
 * نوشته شده.
 *
 * خروجی می‌گوید چند ابزار قیمت لحظه‌ای گرفتند و چند تا ردیفشان افتاد، تا
 * رابط بتواند صریح بگوید دامنهٔ آزمون کوچک‌تر شده.
 */
export function applyIntradayMark(seriesByIns = {}, marks = {}, { date, second } = {}) {
  const day = normalizeHistoryDate(date);
  const series = {};
  let marked = 0, dropped = 0, untouched = 0;
  if (!day) return { series: seriesByIns, marked, dropped, untouched, date: 0, second };
  for (const [ins, rows] of Object.entries(seriesByIns || {})) {
    const list = rows || [];
    const rest = list.filter((row) => normalizeHistoryDate(row.date) !== day);
    const official = list.find((row) => normalizeHistoryDate(row.date) === day) || null;
    const mark = marks?.[ins];
    if (!mark) {
      // قیمتی تا آن لحظه نبوده: ردیف آن روز اصلاً ساخته نمی‌شود.
      if (official) dropped += 1; else untouched += 1;
      series[ins] = rest;
      continue;
    }
    marked += 1;
    series[ins] = [...rest, {
      ...(official || {}),
      date: day,
      close: mark.price, last: mark.price,
      yday: num(official?.yday, 0),
      first: 0, low: 0, high: 0,
      vol: mark.volume, trades: mark.trades, value: mark.value,
      intradayMark: true, markSecond: mark.second, markTimeLabel: mark.timeLabel,
    }].sort((a, b) => normalizeHistoryDate(a.date) - normalizeHistoryDate(b.date));
  }
  return { series, marked, dropped, untouched, date: day, second: num(second, NaN) };
}

/**
 * جمله‌ای که کاربر می‌خواند.
 *
 * جدا و خالص است چون تنها چیزی است که از صحت این مسیر می‌بیند، و هرگز
 * بیش از عدد ادعا نمی‌کند: اگر هیچ ابزاری تا آن لحظه معامله نشده باشد،
 * همین را می‌گوید نه «آماده شد».
 */
export function markNote(result, { label = '', total = 0 } = {}) {
  const faInt = (n) => String(Math.max(0, Math.trunc(num(n)))).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  if (!result?.marked) {
    return `تا ساعت ${label} هیچ‌کدام از ${faInt(total)} ابزار معامله‌ای نداشتند؛ سنجش در این لحظه ممکن نیست.`;
  }
  const parts = [`${faInt(result.marked)} ابزار قیمت ساعت ${label} گرفتند`];
  if (result.dropped) parts.push(`${faInt(result.dropped)} ابزار ردیف آن روز را از دست دادند چون تا آن لحظه معامله نشده بودند`);
  return `${parts.join(' · ')}. این قیمت‌ها میان‌روزی‌اند و پایانِ روز نیستند؛ ترکیبی که پایش قیمت نداشته از رتبه‌بندی بیرون است.`;
}
