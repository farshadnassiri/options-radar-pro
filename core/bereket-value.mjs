// ارزش‌گذاری یک موقعیت در یک لحظه.
//
// نقطهٔ اتصال چهار موتوری که از قبل هستند: قیمت‌گذاری و یونانی
// (`core/monitor.mjs`)، وجه تضمین (`core/margin.mjs`)، نیم‌رخ بازده
// (`core/payoff.mjs`) و تجزیهٔ سود و زیان (`core/attribution.mjs`).
//
// خروجی عمداً **دقیقاً همان شکلی** است که `attribution` می‌خواهد:
// `{ label, date, second, spot, pnl[], greeks[], ivPct[] }`. اگر شکل تازه‌ای
// می‌ساختیم، یک مبدل هم لازم می‌شد و مبدل جایی است که واحدها بی‌صدا
// جابه‌جا می‌شوند. همان شکل یعنی مسیر ارزش‌گذاری و مسیر تجزیه هرگز از هم
// جدا نمی‌افتند.
//
// ═══ سود و زیان هر پا نسبت به ورود ═══
//
// `pnl[i]` باید طوری تعریف شود که تفاضلش با تغییر قیمت بخواند، چون
// `attributeLegStep` دقیقاً همین را با `signedQty × Δقیمت` مقایسه می‌کند:
//
//   pnl[i] = signedQty(پا) × (قیمت اکنون − قیمت ورود)
//
// این ناخالص است — کارمزد و اسپرد اینجا نیستند و نباید باشند. آن‌ها از
// حرکت بازار نمی‌آیند و `core/bereket-pnl.mjs` جداگانه کمشان می‌کند.
// آمیختنشان اینجا، هزینهٔ ورود را به «زیان دلتا» تبدیل می‌کرد.

import { num } from './num.mjs';
import { signedQty, grossCash, analyzePayoff } from './payoff.mjs';
import { strategyMargin, capitalBase } from './margin.mjs';
import { monitorSnapshot } from './monitor.mjs';
import { tradeTimeLabel } from './backtest.mjs';
import { secondToHms } from './book-history.mjs';

/**
 * سیاست وجه تضمین اسپرد بستانکار.
 *
 * سه گزینه، چون عدد واقعی هنوز با صورتحساب تطبیق داده نشده. هر سه یک
 * چیز مشترک دارند: خروجی `estimated` را حمل می‌کند و رابط موظف است
 * نشانش بدهد. عددی که تخمینی است و برچسبش را ندارد، از عددِ نداشتن بدتر
 * است — چون کاربر رویش حساب می‌کند.
 */
export const CREDIT_MARGIN_POLICIES = {
  maxOfLossAndShortLeg: 'بیشینهٔ زیان حداکثر و وجه تضمین پای فروش',
  maxLoss: 'زیان حداکثر',
  shortLeg: 'وجه تضمین کامل پای فروش',
};

export function creditSpreadMargin({ marginNet = 0, maxLoss = NaN, policy = 'maxOfLossAndShortLeg' } = {}) {
  const blocked = num(marginNet, 0);
  const loss = Number.isFinite(num(maxLoss, NaN)) ? num(maxLoss) : NaN;
  if (policy === 'shortLeg') return { value: blocked, label: CREDIT_MARGIN_POLICIES.shortLeg, estimated: true };
  if (policy === 'maxLoss') {
    return Number.isFinite(loss)
      ? { value: loss, label: CREDIT_MARGIN_POLICIES.maxLoss, estimated: true }
      : { value: blocked, label: `${CREDIT_MARGIN_POLICIES.maxLoss} — نامعلوم بود، وجه تضمین پای فروش نشست`, estimated: true };
  }
  const value = Number.isFinite(loss) ? Math.max(loss, blocked) : blocked;
  return { value, label: CREDIT_MARGIN_POLICIES.maxOfLossAndShortLeg, estimated: true };
}

/**
 * یک نقطه از مسیر ارزش‌گذاری.
 *
 * `prices` قیمت **اکنون** هر پاست و `entryPrices` قیمت ورود. اگر قیمت
 * ورود ندهند، از `leg.price` خوانده می‌شود — همان جایی که موتور پی‌آف هم
 * می‌خواندش، تا دو تعریف از «ورود» در برنامه نچرخد.
 *
 * پایی که قیمت اکنونش نیست، `pnl` نمی‌گیرد: `NaN` می‌ماند. `attribution`
 * همان را می‌بیند و آن گام را «ناقص» می‌شمارد و در `coverage` کم می‌کند.
 * صفر گذاشتن، آن پا را «بی‌حرکت» اعلام می‌کرد، که ندیده‌ایم.
 */
export function markMoment({
  legs = [], prices = [], entryPrices = null, spot, date, second,
  days = null, params = {}, closes = null, marginCtx = {},
} = {}) {
  const entries = legs.map((leg, at) => {
    const given = Number(entryPrices?.[at]);
    return Number.isFinite(given) ? given : num(leg?.price, NaN);
  });
  const snapshot = monitorSnapshot(legs, { spot, prices, date, days }, params);

  const pnl = legs.map((leg, at) => {
    const now = Number(prices[at]);
    const entry = entries[at];
    if (!Number.isFinite(now) || !Number.isFinite(entry)) return NaN;
    return signedQty(leg) * (now - entry);
  });

  const label = Number.isFinite(second)
    ? `${date} ${tradeTimeLabel(secondToHms(second))}`
    : String(date ?? '');

  return {
    label, date, second: Number.isFinite(second) ? second : undefined,
    spot: num(spot, NaN),
    pnl,
    greeks: snapshot.byLeg,
    ivPct: snapshot.ivPct,
    days: snapshot.days,
    totals: snapshot.greeks,
    meanIvPct: snapshot.meanIvPct,
    incomplete: snapshot.incomplete,
    grossPnl: pnl.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0),
    marked: pnl.filter(Number.isFinite).length,
    legCount: legs.length,
  };
}

/**
 * وجه تضمین و سرمایهٔ درگیر یک موقعیت در یک لحظه.
 *
 * پاها با قیمت **همان لحظه** به موتور وجه تضمین می‌روند، نه با قیمت
 * ورود: وجه تضمین نگهداری با قیمت روز قرارداد بالا و پایین می‌شود و
 * همین است که کال مارجین را می‌سازد. اگر قیمت ورود می‌رفت، موقعیتی که
 * دارد به کال مارجین نزدیک می‌شود، تا آخر جلسه هم آرام به‌نظر می‌رسید.
 */
export function marginAt({ legs = [], prices = [], spot, params = {}, contractSize = 1000, creditPolicy = 'maxOfLossAndShortLeg', fees = null } = {}) {
  const marked = legs.map((leg, at) => {
    const now = Number(prices[at]);
    return Number.isFinite(now) ? { ...leg, price: now } : { ...leg };
  });
  const closes = Object.fromEntries(marked.map((leg, at) => [at, num(leg.price, 0)]));
  const margin = strategyMargin(marked, { S: spot, params, closes, contractSize });
  // پارامتر دومِ `analyzePayoff` **نقد خالص** است، نه شیء تنظیمات. نسخهٔ
  // اول شیء می‌داد و حساب داخلی به `NaN` می‌رفت؛ نتیجه‌اش «بیشترین زیانِ
  // صفر» بود برای هر ساختاری — عددی که هیچ جدولی به آن مشکوک نمی‌شود و
  // درست همان‌جا در مخرج سرمایه و در آزمون مقاومت می‌نشیند. راستی‌آزمایی
  // مرورگری گرفتش، نه آزمون واحد: ستون «بیشترین زیان» برای هر سه کاندید
  // صفر بود.
  const netCash = grossCash(marked);
  const payoff = analyzePayoff(marked, netCash, { fees });
  const maxLoss = Number.isFinite(payoff?.maxLoss) ? Math.abs(payoff.maxLoss) : NaN;
  // میدان خالصِ وجه تضمین در `strategyMargin` نامش `marginNet` است، نه
  // `net`. نسخهٔ اول اینجا `margin.net` می‌خواند و `undefined` می‌گرفت،
  // پس هر عدد بلوکه‌شده صفر می‌شد و اسپرد بستانکار «بدون وجه تضمین»
  // به‌نظر می‌رسید — خرابیِ بی‌صدا، چون صفر عددی است که جدول با آن مشکلی
  // ندارد. آزمونِ «وجه تضمین با قیمت همان لحظه حساب می‌شود» گرفتش.
  const marginNet = num(margin?.marginNet, 0);
  const base = capitalBase({ legs: marked, netCash, marginNet, maxLoss });

  const isCredit = netCash > 0;
  const credit = isCredit
    ? creditSpreadMargin({ marginNet, maxLoss, policy: creditPolicy })
    : null;

  return {
    margin, payoff, netCash, maxLoss, marginNet,
    capital: base,
    isCredit,
    creditEstimate: credit,
    // اسپرد بدهکار وجه تضمین نمی‌گیرد. ملاک بستانکاری است نه جهت.
    blocked: isCredit ? num(credit?.value, marginNet) : 0,
    estimated: !!credit?.estimated,
  };
}

/**
 * مسیر کامل ارزش‌گذاری روی چند لحظه.
 *
 * `feed(momentIndex)` باید `{ spot, prices, date, second, days }` بدهد.
 * تزریق است چون `core/` به شبکه دست نمی‌زند و چون همین تزریق، آزمونِ
 * «باقی‌ماندهٔ کوچک» را ممکن می‌کند: دنیایی می‌سازیم که قیمت‌هایش را
 * خودِ بلک-شولز ساخته، و انتظار داریم تجزیه تقریباً کاملش کند.
 */
export function valuationTrack({ legs = [], moments = [], feed, entryPrices = null, params = {} } = {}) {
  if (typeof feed !== 'function') return [];
  const out = [];
  for (let at = 0; at < moments.length; at += 1) {
    const point = feed(at, moments[at]);
    if (!point) continue;
    out.push(markMoment({
      legs, entryPrices, params,
      prices: point.prices || [], spot: point.spot,
      date: point.date ?? moments[at]?.date,
      second: point.second ?? moments[at]?.second,
      days: point.days || null,
    }));
  }
  return out;
}
