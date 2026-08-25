// بازسازی دفتر سفارش در یک لحظهٔ گذشته.
//
// تا امروز فرض برنامه این بود که دفتر سفارش تاریخی وجود ندارد — کامنت
// `core/backtest.mjs` هم همین را می‌گفت و به همین دلیل مسیر درون‌روزی
// «ارزش مشاهده‌شده» نام گرفت نه «قابل آفست». آن فرض غلط بود:
// `BestLimits/{insCode}/{date}` تاریخچهٔ همان روز را می‌دهد.
//
// ولی آنچه می‌دهد عکسِ کاملِ پنج‌سطحی در هر لحظه نیست. یک **دفتر رویداد**
// است: هر رکورد می‌گوید «در این ثانیه، سطح شمارهٔ n این شد». سطحی که تغییر
// نکرده، رکورد تازه‌ای هم ندارد. پس دفتر ساعت ۹:۳۵ از پنج رکوردِ متفاوت
// ساخته می‌شود که هر کدام می‌توانند ساعت‌های مختلفی داشته باشند.
//
// ═══ چرا این فایل این‌قدر دربارهٔ «ندانستن» حرف می‌زند ═══
//
// این ماژول تنها چیزی است که در کل برنامه ادعای **اجراپذیری در گذشته**
// دارد؛ یعنی عددی که از اینجا بیرون می‌رود می‌تواند به کاربر بگوید «آن روز
// ساعت ده و نیم می‌شد این موقعیت را با این قیمت بست». قاعدهٔ ۲-۴ اینجا
// سخت‌ترین آزمونش را می‌دهد، پس سه چیز جدا نگه داشته می‌شود:
//
//   سطحی که رکوردش هنوز نیامده  →  اصلاً ساخته نمی‌شود (نه صفر، نه خالی)
//   سطحی که رکوردش کهنه است     →  ساخته می‌شود ولی سنش گزارش می‌شود
//   دفتری که پشت‌ورو درآمده     →  با `sane: false` علامت می‌خورد
//
// سومی مهم‌ترین است. اگر ترتیب بازسازی غلط باشد، خروجی همچنان یک دفتر
// **به‌ظاهر معتبر** است: پنج سطح با عدد. هیچ خطایی پرتاب نمی‌شود و هیچ
// خانه‌ای خالی نمی‌ماند؛ فقط اعدادش دروغ‌اند. تنها نشانهٔ بیرونی‌اش شکستن
// یکنواختی است — قیمت تقاضا باید نزولی و قیمت عرضه صعودی باشد — و همین
// یک بررسی، تفاوت بین «خرابی بی‌صدا» و «خرابی دیده‌شده» است.

import { num } from './num.mjs';
import { tradeSecond, tradeTimeLabel } from './backtest.mjs';

/** تابلوی تهران پنج سطح می‌دهد. عدد اینجاست تا در کد پخش نشود. */
export const BOOK_LEVELS = 5;

/**
 * رکوردهای خام `bestLimitsHistory` را به رویدادهای مرتب تبدیل می‌کند.
 *
 * مرتب‌سازی با دو کلید است: اول ثانیه، بعد `refID`. دومی لازم است چون چند
 * سطح می‌توانند در یک ثانیه عوض شوند و ترتیبشان داخل همان ثانیه فقط از
 * `refID` معلوم می‌شود. اگر بالادست `refID` ندهد، ترتیب ورود آرایه جای آن
 * می‌نشیند — که برای رویدادهای هم‌ثانیه بهتر از هیچ است، و در
 * `refIdKnown` علامت می‌خورد تا مصرف‌کننده بداند این تکیه‌گاه چقدر محکم بود.
 */
export function normalizeBookEvents(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  for (let index = 0; index < list.length; index += 1) {
    const row = list[index] || {};
    const level = Math.trunc(num(row.number, 0));
    const time = Math.trunc(num(row.hEven, 0));
    if (!(level >= 1 && level <= BOOK_LEVELS) || !(time > 0)) continue;
    const refRaw = row.refID ?? row.refId;
    const refId = Number.isFinite(Number(refRaw)) ? Number(refRaw) : NaN;
    out.push({
      level, time, second: tradeSecond(time), timeLabel: tradeTimeLabel(time),
      refId: Number.isFinite(refId) ? refId : index,
      refIdKnown: Number.isFinite(refId),
      bid: num(row.pMeDem, 0), bidQty: num(row.qTitMeDem, 0), bidOrd: num(row.zOrdMeDem, 0),
      ask: num(row.pMeOf, 0), askQty: num(row.qTitMeOf, 0), askOrd: num(row.zOrdMeOf, 0),
    });
  }
  out.sort((a, b) => a.second - b.second || a.refId - b.refId || a.level - b.level);
  return out;
}

/**
 * یکنواختی دفتر — تنها راه دیدنِ بازسازی غلط.
 *
 * تقاضا از سطح یک به پایین ارزان‌تر می‌شود و عرضه گران‌تر. سطح خالی (قیمت
 * صفر) از این بررسی بیرون است، چون نبودن سفارش خودش قاعده را نمی‌شکند.
 *
 * `crossed` جدا گزارش می‌شود: بهترین تقاضا بالاتر از بهترین عرضه یعنی دفتر
 * قفل یا متقاطع است. در لحظهٔ صف و بازگشایی، تابلو واقعاً می‌تواند چنین
 * چیزی نشان دهد، پس این خطا نیست — ولی هر عددی که رویش ساخته شود باید
 * برچسبش را داشته باشد.
 */
export function bookSanity(book = []) {
  const rows = (book || []).filter((row) => row && Number.isFinite(row.level))
    .slice().sort((a, b) => a.level - b.level);
  let bidsOk = true, asksOk = true;
  for (let at = 1; at < rows.length; at += 1) {
    const prev = rows[at - 1], cur = rows[at];
    if (num(prev.bid) > 0 && num(cur.bid) > 0 && num(cur.bid) > num(prev.bid)) bidsOk = false;
    if (num(prev.ask) > 0 && num(cur.ask) > 0 && num(cur.ask) < num(prev.ask)) asksOk = false;
  }
  const top = rows.find((row) => row.level === 1) || null;
  const crossed = !!top && num(top.bid) > 0 && num(top.ask) > 0 && num(top.bid) > num(top.ask);
  return { sane: bidsOk && asksOk, bidsOk, asksOk, crossed };
}

/**
 * دفتر سفارش در یک ثانیهٔ مشخص، از دفتر رویداد.
 *
 * برای هر سطح، تازه‌ترین رویدادِ **در آن ثانیه یا پیش از آن** برداشته
 * می‌شود. سطحی که تا آن لحظه هیچ رویدادی نداشته، در خروجی نیست — نه با
 * قیمت صفر پر می‌شود و نه از رویداد بعدی‌اش وام می‌گیرد. هر دو کار، دفتری
 * می‌ساختند که در آن لحظه وجود نداشت.
 *
 * خروجی `null` است اگر هیچ سطحی رکوردی تا آن لحظه نداشته باشد: پیش از
 * اولین رویداد روز، دفتری نبوده که بشود گزارشش کرد.
 */
export function bookAt(events = [], second) {
  const cut = num(second, NaN);
  if (!Number.isFinite(cut)) return null;
  const list = Array.isArray(events) ? events : [];
  const byLevel = new Map();
  for (const event of list) {
    if (event.second > cut) break;              // رویدادها مرتب‌اند
    byLevel.set(event.level, event);
  }
  if (!byLevel.size) return null;
  const book = [...byLevel.values()]
    .sort((a, b) => a.level - b.level)
    .map((event) => ({
      level: event.level,
      bid: event.bid, bidQty: event.bidQty, bidOrd: event.bidOrd,
      ask: event.ask, askQty: event.askQty, askOrd: event.askOrd,
      second: event.second, timeLabel: event.timeLabel,
    }));
  const newest = book.reduce((best, row) => (row.second > best ? row.second : best), -Infinity);
  const oldest = book.reduce((best, row) => (row.second < best ? row.second : best), Infinity);
  return {
    book, at: newest, atLabel: tradeTimeLabel(secondToHms(newest)),
    second: cut,
    levelsKnown: book.length, levelsTotal: BOOK_LEVELS,
    complete: book.length === BOOK_LEVELS,
    ageSec: Math.max(0, cut - newest),          // سن تازه‌ترین سطح
    oldestAgeSec: Math.max(0, cut - oldest),    // سن کهنه‌ترین سطح زنده
    refIdKnown: list.every((event) => event.refIdKnown),
    ...bookSanity(book),
  };
}

/** ثانیه از ابتدای روز → HHMMSS، معکوسِ `tradeSecond`. */
export function secondToHms(second) {
  const total = Math.max(0, Math.trunc(num(second, 0)));
  const h = Math.trunc(total / 3600), m = Math.trunc((total % 3600) / 60), s = total % 60;
  return h * 10000 + m * 100 + s;
}

/**
 * دفتر در چند لحظه، با یک بار پیمایش.
 *
 * ساده‌ترین پیاده‌سازی `bookAt` را در حلقه صدا می‌زد و برای هر لحظه کل
 * دفتر رویداد را از اول می‌خواند. با ده‌ها هزار رویداد در روز و ده‌ها
 * لحظهٔ سنجش، همان حلقه تب را قفل می‌کرد — و بند «تب نباید فریز کند» یک
 * خواسته نیست، شرط استفاده است.
 */
export function bookPath(events = [], seconds = []) {
  const list = Array.isArray(events) ? events : [];
  const cuts = (Array.isArray(seconds) ? seconds : [])
    .map((value) => num(value, NaN)).filter(Number.isFinite)
    .slice().sort((a, b) => a - b);
  const out = [];
  const byLevel = new Map();
  let at = 0;
  for (const cut of cuts) {
    while (at < list.length && list[at].second <= cut) {
      byLevel.set(list[at].level, list[at]);
      at += 1;
    }
    if (!byLevel.size) { out.push({ second: cut, book: null }); continue; }
    const book = [...byLevel.values()]
      .sort((a, b) => a.level - b.level)
      .map((event) => ({
        level: event.level,
        bid: event.bid, bidQty: event.bidQty, bidOrd: event.bidOrd,
        ask: event.ask, askQty: event.askQty, askOrd: event.askOrd,
        second: event.second, timeLabel: event.timeLabel,
      }));
    const newest = book.reduce((best, row) => (row.second > best ? row.second : best), -Infinity);
    out.push({
      second: cut, book, at: newest,
      levelsKnown: book.length, complete: book.length === BOOK_LEVELS,
      ageSec: Math.max(0, cut - newest),
      ...bookSanity(book),
    });
  }
  return out;
}

/**
 * دفتر بازسازی‌شده را به شکلی می‌دهد که `resolvePrice` و `walkBook` می‌فهمند.
 *
 * `core/exec.mjs` تا امروز فقط دفتر زنده را می‌دید. این تابع پل است، و
 * عمداً برچسب‌های صداقت را همراه می‌برد: `asOf` می‌گوید عدد مال چه ساعتی
 * است و `stale` می‌گوید چقدر کهنه. مصرف‌کننده‌ای که این دو را دور بریزد،
 * عددِ ساعت نه صبح را به اسم ساعت دوازده نشان می‌دهد.
 */
export function quoteFromBook(snapshot) {
  if (!snapshot?.book?.length) return null;
  const top = snapshot.book.find((row) => row.level === 1) || snapshot.book[0];
  return {
    bid: num(top.bid), bidQty: num(top.bidQty),
    ask: num(top.ask), askQty: num(top.askQty),
    book: snapshot.book,
    asOf: snapshot.at, asOfLabel: snapshot.atLabel || tradeTimeLabel(secondToHms(snapshot.at)),
    stale: num(snapshot.ageSec, 0),
    complete: !!snapshot.complete, sane: !!snapshot.sane, crossed: !!snapshot.crossed,
  };
}
