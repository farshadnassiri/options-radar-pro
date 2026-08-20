// تحلیل سناریو، حساسیت، و ریسک عمق دفتر سفارش.
//
// تب استراتژی تا امروز یک نقطه را می‌گفت: «اگر پایه همین‌جا بماند» و «بیشترین
// سود» و «بیشترین زیان». آن سه عدد سه گوشهٔ یک فضایند، نه خودِ فضا. این ماژول
// همان فضا را می‌سازد.
//
// سه قاعده در همهٔ توابع اینجا یکی است:
//
//   ۱. هیچ عددی ساخته نمی‌شود. ورودی که نباشد، خروجی خالی است نه صفر.
//   ۲. احتمال از همان توزیع لگاریتم-نرمالی می‌آید که «احتمال سود» از آن
//      می‌آید — نه یک مدل دوم که با ستون کناری‌اش نخواند.
//   ۳. تفکیک هر پا همیشه با جمع کل می‌خواند. اگر نخواند، یکی از دو عدد غلط
//      است و کاربر باید بتواند خودش وارسی کند.

import { legValueAtExpiry, legCashflow, signedQty } from './payoff.mjs';
import { bsPrice, probAbove, probBelow, priceQuantile } from './bs.mjs';
import { walkBook } from './exec.mjs';

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const ok = (v) => Number.isFinite(v);

/**
 * سود و زیان یک پا در قیمت پایهٔ `S`، در سررسید.
 *
 * دو تابع موتور، هر دو علامت و اندازه را از قبل درونشان دارند:
 * `legValueAtExpiry` در `signedQty` ضرب شده است و `legCashflow` هم
 * (`-signedQty × price`). پس سود و زیان فقط جمع همان دو است.
 *
 * جمع این مقدار روی همهٔ پاها، دقیقاً `pnlAtExpiry` موتور را می‌دهد —
 * که همان چیزی است که نمودار بازده می‌کشد. اگر این دو از هم جدا شوند،
 * جدول و نمودار دو حرف می‌زنند.
 */
function legPnlAtExpiry(leg, S) {
  return legValueAtExpiry(leg, S) + legCashflow(leg);
}

/**
 * نردبان سناریو: از بدترین تا بهترین.
 *
 * سطح‌ها از صدک‌های توزیع می‌آیند، نه از درصدهای گرد.
 *
 * چرا: «‎−۲۰٪ تا ‎+۲۰٪‎» برای نمادی با تلاطم ۱۵ درصد یعنی دو سر بازه عملاً
 * غیرممکن‌اند، و برای نمادی با تلاطم ۹۰ درصد یعنی وسط‌های توزیع را اصلاً
 * نمی‌بینی. صدک، همان بازه را برای هر نماد به اندازهٔ خودش می‌برد.
 *
 * قیمت پایه و صدک ۵۰ هر دو می‌آیند: صدک ۵۰ در توزیع لگاریتم-نرمال با روند
 * صفر، کمی زیر قیمت امروز است و این تفاوت واقعی است، نه خطای گرد کردن.
 */
export function scenarioLadder(opt = {}) {
  const legs = opt.legs || [];
  const S = num(opt.spot);
  const T = Math.max(0, num(opt.days) / Math.max(1, num(opt.yearDays, 365)));
  const sigma = num(opt.sigma);
  if (!legs.length || !(S > 0)) return [];

  const pcts = Array.isArray(opt.percentiles) && opt.percentiles.length
    ? opt.percentiles : [1, 5, 10, 25, 50, 75, 90, 95, 99];

  const levels = [];
  for (const p of pcts) {
    const level = priceQuantile(S, p / 100, T, sigma);
    if (ok(level) && level > 0) levels.push({ level, pct: p, kind: 'percentile' });
  }
  // قیمت امروز همیشه در فهرست است، حتی اگر تلاطم نداشته باشیم.
  levels.push({ level: S, pct: NaN, kind: 'spot' });

  const seen = new Set();
  const rows = [];
  for (const item of levels) {
    const key = Math.round(item.level);
    if (seen.has(key)) continue;
    seen.add(key);
    const perLeg = legs.map((leg, index) => ({
      index, kind: leg.kind, side: leg.side, strike: num(leg.strike),
      name: leg.name || '', pnl: legPnlAtExpiry(leg, item.level),
    }));
    const total = perLeg.reduce((a, l) => a + (ok(l.pnl) ? l.pnl : 0), 0);
    rows.push({
      ...item,
      movePct: ((item.level - S) / S) * 100,
      pnl: total,
      perLeg,
      // احتمال اینکه پایه در سررسید زیر/بالای این سطح بنشیند
      probBelow: probBelow(S, item.level, T, sigma),
      probAbove: probAbove(S, item.level, T, sigma),
    });
  }
  // مرتب‌سازی دوم روی قیمت لازم است: در ترکیب‌های سقف‌دار، همهٔ سناریوهای
  // بالای سقف دقیقاً یک عدد می‌دهند و ترتیبشان بین خودشان دلبخواه می‌شود —
  // «صدک ۹۵» بعد از «صدک ۹۹» می‌نشیند و جدول بی‌نظم به نظر می‌رسد.
  return rows.sort((a, b) => a.pnl - b.pnl || a.level - b.level);
}

/**
 * جدول حساسیت: قیمت پایه در یک محور، پارامتر دلخواه در محور دیگر.
 *
 * محور دوم یکی از این سه است و هر سه چیزِ متفاوتی می‌پرسند:
 *
 *   days    اگر زودتر ببندی چه؟ — ارزش زمانی هنوز هست
 *   sigma   اگر تلاطم عوض شود چه؟ — همان که وگا می‌سنجد، ولی در اندازهٔ واقعی
 *   rFree   اگر نرخ عوض شود چه؟ — برای موقعیت‌های بلندمدت
 *
 * روی محور `days`، مقدار صفر یعنی سررسید و آن‌جا عمداً از ارزش‌گذاری مدل به
 * ارزش ذاتی سوییچ می‌شود؛ بلک‌شولز در `T=0` تعریف‌نشده است و اگر با تی خیلی
 * کوچک حساب شود، عددی می‌دهد که شبیه درست است ولی نیست.
 */
export function sensitivityGrid(opt = {}) {
  const legs = opt.legs || [];
  const S = num(opt.spot);
  const yearDays = Math.max(1, num(opt.yearDays, 365));
  const sigma = num(opt.sigma);
  const rFree = num(opt.rFree);
  const divYield = num(opt.divYield);
  const axis = ['days', 'sigma', 'rFree'].includes(opt.axis) ? opt.axis : 'days';
  const moves = Array.isArray(opt.moves) && opt.moves.length ? opt.moves : [-20, -10, -5, 0, 5, 10, 20];
  const axisValues = Array.isArray(opt.axisValues) && opt.axisValues.length
    ? opt.axisValues
    : (axis === 'days' ? [num(opt.days), Math.round(num(opt.days) / 2), 0]
      : axis === 'sigma' ? [sigma * 0.7, sigma, sigma * 1.3]
        : [rFree * 0.5, rFree, rFree * 1.5]);
  if (!legs.length || !(S > 0)) return { axis, axisValues: [], rows: [] };

  const rows = moves.map((mv) => {
    const level = S * (1 + mv / 100);
    const cells = axisValues.map((av) => {
      const days = axis === 'days' ? num(av) : num(opt.days);
      const sg = axis === 'sigma' ? num(av) : sigma;
      const rf = axis === 'rFree' ? num(av) : rFree;
      const T = Math.max(0, days) / yearDays;
      const perLeg = legs.map((leg) => (T > 0 && leg.kind !== 'underlying'
        ? modelLegPnl(leg, level, T, rf, divYield, sg)
        : legPnlAtExpiry(leg, level)));
      const bad = perLeg.some((v) => !ok(v));
      return {
        axisValue: num(av), days, sigma: sg, rFree: rf,
        pnl: bad ? NaN : perLeg.reduce((a, v) => a + v, 0),
        perLeg,
      };
    });
    return { movePct: mv, level, cells };
  });
  return { axis, axisValues: axisValues.map(num), moves, rows };
}

/**
 * سود و زیان یک پا با ارزش‌گذاری مدل، پیش از سررسید.
 *
 * `bsPrice` قیمت هر سهم را می‌دهد، پس اینجا خودمان در `signedQty` ضرب
 * می‌کنیم — برخلاف `legValueAtExpiry` که این کار را کرده است.
 */
function modelLegPnl(leg, S, T, rFree, divYield, sigma) {
  const unit = bsPrice(leg.kind, S, num(leg.strike), T, rFree, divYield, sigma);
  if (!ok(unit)) return NaN;
  return signedQty(leg) * unit + legCashflow(leg);
}

/**
 * ریسک عمق دفتر سفارش — هزینهٔ *بستن* موقعیت، نه باز کردنش.
 *
 * تب استراتژی هزینهٔ ورود را از قبل می‌سنجید. چیزی که نمی‌سنجید این بود:
 * وقتی بخواهی از این موقعیت بیرون بیایی، دفتر سفارش چقدر کشش دارد؟ برای
 * موقعیتی که سود روی کاغذش خوب است ولی بیرون‌آمدنش نصف آن سود را می‌خورد،
 * این تنها عددی است که تصمیم را عوض می‌کند.
 *
 * بستن یعنی جهت معکوس: پای خرید فروخته می‌شود (به تقاضا می‌خورد) و پای فروش
 * خریده می‌شود (به عرضه). پس عمق مهم، همان سمتی است که امروز به آن نگاه
 * نمی‌کنی.
 *
 * پای دارایی پایه کنار گذاشته می‌شود: دفتر سفارش سهم در دیده‌بان اختیار
 * نیست، و «عمق نامعلوم» را نباید با «عمق صفر» یکی گرفت.
 */
export function bookDepthRisk(opt = {}) {
  const legs = opt.legs || [];
  const quotes = opt.quotes || [];
  const units = Math.max(1, num(opt.units, 1));
  const perLeg = [];
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.kind === 'underlying') continue;
    const q = quotes[i] || {};
    const closeSide = leg.side === 'buy' ? 'sell' : 'buy';
    const want = units * num(leg.ratio, 1);
    const book = Array.isArray(q.book) ? q.book : [];
    const walk = walkBook(book, want, closeSide);
    const size = num(leg.size, 1000);
    // ارزش بستن در بهترین مظنه، در برابر ارزش بستن با پیمایش دفتر
    const topValue = walk.top > 0 ? walk.top * walk.filled * size : NaN;
    const realValue = walk.filled > 0 ? walk.vwap * walk.filled * size : NaN;
    const cost = ok(topValue) && ok(realValue)
      ? (closeSide === 'buy' ? realValue - topValue : topValue - realValue)
      : NaN;
    perLeg.push({
      index: i, kind: leg.kind, side: leg.side, closeSide,
      name: leg.name || '', strike: num(leg.strike),
      want, filled: walk.filled, short: walk.short, levels: walk.levels,
      full: walk.full, top: walk.top, vwap: walk.vwap, slipPct: walk.slipPct,
      exitCost: cost, hasBook: book.length > 0,
    });
  }
  const known = perLeg.filter((l) => l.hasBook);
  const blocked = perLeg.filter((l) => l.hasBook && !l.full);
  return {
    perLeg,
    // جمع فقط از پاهایی که دفتر دارند. پای بی‌دفتر، خالی است نه صفر.
    exitCostTotal: known.length ? known.reduce((a, l) => a + (ok(l.exitCost) ? l.exitCost : 0), 0) : NaN,
    worstSlipPct: known.length
      ? known.reduce((a, l) => (ok(l.slipPct) && Math.abs(l.slipPct) > Math.abs(a) ? l.slipPct : a), 0) : NaN,
    blockedLegs: blocked.length,
    unknownLegs: perLeg.filter((l) => !l.hasBook).length,
    // بیشترین تعدادی که هر سه پا با هم از دفتر درمی‌آید
    closableUnits: known.length
      ? Math.min(...known.map((l) => Math.floor(l.filled / Math.max(1, l.want / units)))) : NaN,
  };
}
