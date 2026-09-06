// قیمت دستی — «اگر بتوانم این پا را با این قیمت بگیرم، چه می‌شود».
//
// ═══ خواستهٔ صاحب پروژه (بندِ ۱) ═══
//
// «بر اساس … حالتهای مختلف (دفتر سفارش، آخرین، پایانی، **دستی** و …)».
//
// سه حالت اول از قبل در `priceBasis` بودند. «دستی» نبود، و افزودنش به
// همان فهرست غلط می‌بود: مبنای قیمت روی **کلِ جدول** می‌نشیند و کاربر
// نمی‌تواند برای چند صد قرارداد قیمت تایپ کند. قیمت دستی ذاتاً برای یک
// ترکیب معنی دارد، نه برای یک جدول.
//
// پس اینجا یک «اگر… چه می‌شود» روی **ردیفِ انتخاب‌شده** است: برای هر پا
// قیمتی می‌گذاری و همان لحظه می‌بینی نقد خالص، سربه‌سری، بیشترین سود و
// بیشترین زیان چه می‌شوند.
//
// ═══ مرزی که رد نمی‌شود ═══
//
// عددِ دستی **فرضِ کاربر** است، نه دادهٔ بازار. پس:
//   · هرگز جای عددِ جدول را نمی‌گیرد؛ کنارش می‌نشیند و مقایسه می‌شود.
//   · هرگز «قابل اجرا» شمرده نمی‌شود — هیچ دفتری پشتش نیست.
//   · قیمتِ نامعتبر یا صفر یعنی «این پا را دست نزدم»، نه «صفر بگذار».
//
// ریاضی تکرار نمی‌شود: همان `grossCash`، `entryFees` و `analyzePayoff` که
// خودِ موتور به کار می‌برد.

import { num } from './num.mjs';
import { analyzePayoff, entryFees, grossCash } from './payoff.mjs';

const NO_FEES = { buyStock: 0, sellStock: 0, option: 0 };

/**
 * قیمتِ دستیِ یک پا، یا `null` وقتی گذاشته نشده.
 *
 * صفر و منفی قیمت نیستند. رشتهٔ خالی هم «صفر» نیست — همان تلهٔ
 * `Number('')` که در فیلترها هم بسته شد.
 */
export function manualPrice(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * پاها را با قیمت‌های دستی بازمی‌سازد.
 *
 * `prices` نگاشتِ `اندیسِ پا → قیمت` است. پایی که قیمت معتبر نگیرد،
 * **دست‌نخورده** می‌ماند و با قیمتِ واقعیِ خودش می‌آید — یعنی می‌شود فقط
 * یک پا را فرض کرد و بقیه را همان‌طور که هست نگه داشت.
 */
export function manualLegs(legs = [], prices = {}) {
  const changed = [];
  const out = (legs || []).map((leg, at) => {
    const price = manualPrice(prices?.[at] ?? prices?.[String(at)]);
    if (price === null) return leg;
    changed.push({ index: at, from: num(leg?.price, NaN), to: price, name: leg?.name || '' });
    return { ...leg, price };
  });
  return { legs: out, changed };
}

/** خلاصهٔ مالیِ یک مجموعه پای قیمت‌خورده. */
function summarize(legs, fees) {
  const gross = grossCash(legs);
  const netCash = gross - entryFees(legs, fees);
  const payoff = analyzePayoff(legs, netCash, { fees });
  const reward = Number.isFinite(payoff.maxProfit) && Number.isFinite(payoff.maxLoss)
    && Math.abs(payoff.maxLoss) > 0
    ? payoff.maxProfit / Math.abs(payoff.maxLoss)
    : NaN;
  return {
    grossCash: gross, netCash,
    breakevens: payoff.breakevens,
    maxProfit: payoff.maxProfit, maxLoss: payoff.maxLoss,
    rewardRisk: reward,
    approx: payoff.approx === true,
  };
}

/**
 * دو ستون کنار هم: عددِ بازار، و عددِ فرضِ تو.
 *
 * ═══ چرا مقایسه، نه جایگزینی ═══
 *
 * اگر عددِ دستی جای عددِ جدول می‌نشست، چند دقیقه بعد کسی نمی‌دانست کدام
 * عدد از بازار آمده و کدام را خودش تایپ کرده. کنارِ هم نشستن، هم فرض را
 * نگه می‌دارد هم واقعیت را.
 *
 * `anyManual: false` یعنی هیچ پایی دست نخورده — و آن‌وقت دو ستون عمداً
 * یکی‌اند، نه اینکه تفاوتی ساختگی نشان داده شود.
 */
export function manualCompare(legs = [], prices = {}, { fees = NO_FEES } = {}) {
  const applied = manualLegs(legs, prices);
  const base = summarize(legs, fees);
  const manual = applied.changed.length ? summarize(applied.legs, fees) : base;
  return {
    base, manual,
    legs: applied.legs,
    changed: applied.changed,
    anyManual: applied.changed.length > 0,
    // هیچ ادعای اجرایی. دفترِ سفارش پشتِ عددِ دستی نیست و هیچ‌وقت نخواهد بود.
    executable: false,
    netCashDelta: applied.changed.length ? manual.netCash - base.netCash : 0,
  };
}

/** جملهٔ صداقت زیر جدولِ مقایسه. */
export function manualNote(compare) {
  const fa = (value) => String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  if (!compare?.anyManual) {
    return 'برای هر پا قیمتی بگذار تا ببینی ترکیب با آن قیمت چه شکلی می‌شود. تا وقتی چیزی نگذاشته‌ای، دو ستون یکی‌اند.';
  }
  return `${fa(compare.changed.length)} پا با قیمتِ فرضیِ تو حساب شد. این عدد ادعای اجرا ندارد: هیچ دفتری پشتش نیست و «حجم قابل اجرا» با آن سنجیده نمی‌شود — فقط می‌گوید اگر با این قیمت پر می‌شد، ترکیب چه شکلی بود.`;
}
