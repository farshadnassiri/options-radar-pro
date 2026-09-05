// سنجه‌های کاملِ یک ترکیب رادار — همان ستون‌هایی که جدول باید داشته باشد.
//
// ═══ چرا این فایل هست ═══
//
// جدول رادار تا امروز فقط «فاصله» را می‌گفت: لنگر، تفاضل، پر شده، باقی‌مانده.
// گزارش صاحب پروژه این بود: «تمامی ایتمهای تاثیر گذار داخل جدول بیار و
// قابلیت حذف و اضافه داشته باشن (حداکثر سود، زیان، درصد سود، زیان و …) با
// الهام از سایر جداول برنامه.»
//
// «با الهام از سایر جداول» بندِ مهمِ آن جمله است. تب استراتژی و تب تاریخچه
// این عددها را از سال‌ها پیش دارند و از یک خطِ لوله می‌گیرند:
//
//   grossCash → analyzePayoff → strategyMargin → capitalBase → بازده
//
// اگر رادار برای خودش دوباره حساب می‌کرد، روزی دو جدول از یک ترکیب دو
// «بیشترین زیان» متفاوت نشان می‌دادند و هیچ‌کدام غلط به نظر نمی‌رسید. پس
// اینجا هیچ ریاضیِ تازه‌ای نیست؛ همان خط لوله است، بسته‌بندی‌شده برای رادار.
//
// ═══ دو اندازه، عمداً ═══
//
// کاربر مقیاس نمایش را انتخاب می‌کند (قیمت خام تابلو، ×اندازهٔ قرارداد،
// ×اندازه×تعداد). ولی وجه تضمین عددی مقرراتی است و فقط با اندازهٔ **واقعی**
// قرارداد معنی دارد؛ «وجه تضمینِ قیمت خام» چیزی نیست.
//
// پس هر چیزی دو بار حساب می‌شود:
//
//   نمایشی   با ضریبِ مقیاسِ انتخابی — عددهای ریالیِ روی جدول، هم‌مقیاس با
//            خودِ فاصله، تا کنار هم خوانده شوند.
//   واقعی    با اندازهٔ واقعیِ قرارداد — پایهٔ وجه تضمین، سرمایه، و هر
//            **درصدی**.
//
// درصد از هر دو یکی درمی‌آید (صورت و مخرج با هم بزرگ می‌شوند)، ولی فقط اگر
// از یک اندازه بیایند. همین است که نمی‌گذارد «بازده» با عوض‌شدنِ مقیاسِ
// نمایش تکان بخورد.
//
// ═══ نامحدود، صفر نیست ═══
//
// استرانگل فروش زیانِ نامحدود دارد. `analyzePayoff` این را با `Infinity`
// می‌گوید و ما همان را حمل می‌کنیم. تبدیلش به یک عددِ بزرگ، ردیفی می‌سازد
// که در ستون «بیشترین زیان» قابل مرتب‌سازی است و دروغ می‌گوید.

import { num } from './num.mjs';
import { analyzePayoff, grossCash } from './payoff.mjs';
import { capitalBase, strategyMargin } from './margin.mjs';
import { feesOf, marginParamsOf } from './settings.mjs';
import { gapMultiplier } from './spread-gap.mjs';
import { historyMarketMetrics } from './history.mjs';

const finite = (value) => Number.isFinite(value);
const positive = (value) => finite(value) && value > 0;

/** پاهای قیمت‌خورده با یک اندازهٔ معین؛ `null` اگر پایی قیمت ندارد. */
function priceLegsAt(legs, prices, size) {
  const out = [];
  for (const leg of legs) {
    if (!leg) continue;
    const price = num(prices[String(leg.ins)], NaN);
    if (!finite(price)) return null;
    out.push({ ...leg, price, size });
  }
  return out;
}

/**
 * اندازهٔ واقعیِ قرارداد این ترکیب.
 *
 * از خودِ پاها می‌آید و فقط اگر هیچ پایی اندازه نداشت به تنظیمات برمی‌گردد.
 * کوچک‌ترین گرفته می‌شود، به همان دلیلِ `strikeAnchor`: همان است که پوشش را
 * محدود می‌کند.
 */
export function contractSizeOf(legs = [], settings = {}) {
  const sizes = legs.filter((leg) => leg && leg.kind !== 'underlying' && num(leg.size, 0) > 0)
    .map((leg) => num(leg.size, 0));
  if (sizes.length) return Math.min(...sizes);
  return Math.max(1, num(settings.contractSize, 1000));
}

/**
 * سنجه‌های کاملِ یک ترکیب در یک روز.
 *
 * @param legs     پاهای ترکیب (بی قیمت)
 * @param prices   نگاشت شناسهٔ ابزار به قیمت همان روز
 * @param spot     قیمت پایه در همان روز — مبنای وجه تضمین و فاصلهٔ سربه‌سری
 * @param rowByIns سطرِ روزانهٔ هر ابزار، برای ارزش و حجم معامله
 * @param scale    مقیاس نمایش: raw | size | qty
 * @param units    تعداد موقعیت — فقط در مقیاس qty
 */
export function comboMetrics({
  legs = [], prices = {}, spot = NaN, rowByIns = {},
  settings = {}, daysLeft = NaN, scale = 'raw', units = 1,
} = {}) {
  const empty = {
    ok: false, why: 'سنجه‌ها ساخته نشد',
    netCash: NaN, side: '', cost: NaN,
    maxProfit: NaN, maxLoss: NaN, unlimitedProfit: false, unlimitedLoss: false,
    breakevens: [], beLow: NaN, beHigh: NaN, beLowPct: NaN, beHighPct: NaN, beWidthPct: NaN,
    marginNet: NaN, capital: NaN, capitalLabel: '',
    returnPct: NaN, lossPct: NaN, rewardRisk: NaN, perDayPct: NaN, monthlyPct: NaN,
    legValue: NaN, legVolume: NaN, legTrades: NaN, thinLegs: 0,
    baseValue: NaN, baseVolume: NaN,
  };
  const options = legs.filter((leg) => leg && leg.kind !== 'underlying');
  if (!options.length) return { ...empty, why: 'این ترکیب پای اختیاری ندارد' };

  const size = contractSizeOf(legs, settings);
  const mult = gapMultiplier({ scale, size, units });
  const real = priceLegsAt(legs, prices, size * Math.max(1, Math.trunc(num(units, 1))));
  if (!real) return { ...empty, why: 'دست‌کم یک پا در این روز قیمت ندارد' };
  const shown = priceLegsAt(legs, prices, mult);

  const fees = feesOf(settings);
  const realCash = grossCash(real);
  const realPayoff = analyzePayoff(real, realCash, { fees });
  const shownCash = grossCash(shown);
  const shownPayoff = analyzePayoff(shown, shownCash, { fees });

  // ── وجه تضمین و سرمایه: فقط با اندازهٔ واقعی ────────────────────────
  const closes = Object.fromEntries(real.map((leg, index) => [index, leg.price]));
  const margin = positive(spot)
    ? strategyMargin(real, {
      S: spot, closes, params: marginParamsOf(settings),
      creditMode: settings.creditSpreadMargin, capitalMode: settings.capitalMode,
      contractSize: size,
    })
    : null;
  const capital = capitalBase({
    legs: real, netCash: realCash,
    marginNet: margin ? margin.marginNet : NaN, maxLoss: realPayoff.maxLoss,
  });

  const cap = num(capital.value, NaN);
  const pct = (value) => (positive(cap) && finite(value) ? (value / cap) * 100 : NaN);
  const days = num(daysLeft, NaN);
  const monthDays = Math.max(1, num(settings.daysPerMonth, 30));

  // ── ارزش و حجمِ معاملهٔ پاها ────────────────────────────────────────
  //
  // «ارزش معامله» به فیلترها اضافه شد چون ترکیبی که روی کاغذ هست و در
  // بازار نیست، ردیفِ گمراه‌کننده‌ای است. کمترینِ پاها ملاک است نه جمعشان:
  // ترکیبی که یک پایش ده میلیارد و پای دیگرش صفر خورده، اجرا نمی‌شود.
  const markets = options.map((leg) => historyMarketMetrics(rowByIns[String(leg.ins)]));
  const values = markets.map((row) => num(row.value, 0));
  const volumes = markets.map((row) => num(row.volume, 0));
  const trades = markets.map((row) => num(row.trades, 0));

  const beLow = realPayoff.breakevens[0];
  const beHigh = realPayoff.breakevens[realPayoff.breakevens.length - 1];

  return {
    ok: true, why: '',
    size, units: Math.max(1, Math.trunc(num(units, 1))), mult,
    netCash: shownCash, side: shownCash > 0 ? 'credit' : shownCash < 0 ? 'debit' : 'flat',
    cost: Math.abs(shownCash),
    maxProfit: shownPayoff.maxProfit, maxLoss: shownPayoff.maxLoss,
    unlimitedProfit: shownPayoff.unlimitedProfit, unlimitedLoss: shownPayoff.unlimitedLoss,
    breakevens: realPayoff.breakevens,
    beLow, beHigh,
    beLowPct: positive(spot) && positive(beLow) ? ((beLow / spot) - 1) * 100 : NaN,
    beHighPct: positive(spot) && positive(beHigh) ? ((beHigh / spot) - 1) * 100 : NaN,
    beWidthPct: positive(spot) && positive(beLow) && positive(beHigh) && beHigh > beLow
      ? ((beHigh - beLow) / spot) * 100 : NaN,
    marginNet: margin ? margin.marginNet : NaN,
    capital: cap, capitalLabel: capital.label,
    returnPct: pct(realPayoff.maxProfit), lossPct: pct(realPayoff.maxLoss),
    rewardRisk: finite(realPayoff.maxProfit) && positive(realPayoff.maxLoss)
      ? realPayoff.maxProfit / realPayoff.maxLoss : NaN,
    perDayPct: positive(days) && finite(pct(realPayoff.maxProfit))
      ? pct(realPayoff.maxProfit) / days : NaN,
    monthlyPct: positive(days) && finite(pct(realPayoff.maxProfit))
      ? (pct(realPayoff.maxProfit) / days) * monthDays : NaN,
    legValue: values.length ? Math.min(...values) : NaN,
    legValueSum: values.reduce((a, b) => a + b, 0),
    legVolume: volumes.length ? Math.min(...volumes) : NaN,
    legTrades: trades.length ? Math.min(...trades) : NaN,
    thinLegs: values.filter((value) => !(value > 0)).length,
  };
}

/**
 * آیا این ترکیب از پالایهٔ نقدشوندگی رد می‌شود؟
 *
 * صفرِ آستانه یعنی «قید نگذاشته‌ام»، پس همه رد می‌شوند. عددِ نداشته
 * (`NaN`) با صفر یکی نیست و ردیف را کنار نمی‌گذارد مگر آستانه‌ای باشد —
 * همان قاعدهٔ «خالی، صفر نیست» که در `core/combo-filter.mjs` نوشته شده.
 */
export function passesValueFilter(metrics, { minLegValue = 0, minLegVolume = 0 } = {}) {
  const wantValue = Math.max(0, num(minLegValue, 0));
  const wantVolume = Math.max(0, num(minLegVolume, 0));
  if (wantValue > 0) {
    const value = num(metrics?.legValue, NaN);
    if (!finite(value) || value < wantValue) return false;
  }
  if (wantVolume > 0) {
    const volume = num(metrics?.legVolume, NaN);
    if (!finite(volume) || volume < wantVolume) return false;
  }
  return true;
}
