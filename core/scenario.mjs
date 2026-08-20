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
import { bsPrice, bsGreeks, probAbove, probBelow, priceQuantile } from './bs.mjs';
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
 * محورهای دوم شناخته‌شده، به‌ترتیب نمایش.
 *
 * `kind` جنس مقدار است و رابط از روی آن قالبش را انتخاب می‌کند. قالب‌بندی
 * عمداً اینجا نیست: هر عددی که به کاربر نشان داده می‌شود باید از
 * `ui/fmt.mjs` رد شود تا با رقم فارسی چاپ شود، و یک برچسبِ آماده در موتور
 * یعنی یک مسیر دوم که از آن قاعده فرار می‌کند.
 */
export const SENS_AXES = [
  { key: 'days', label: 'روز مانده', kind: 'days' },
  { key: 'sigma', label: 'تلاطم', kind: 'ratio' },
  { key: 'rFree', label: 'نرخ بهره بدون ریسک', kind: 'rate' },
  { key: 'divYield', label: 'بازده نقدی پایه', kind: 'rate' },
];

/** سنجه‌های هر خانه. جدول یکی را نشان می‌دهد، ولی همه محاسبه می‌شوند. */
export const SENS_METRICS = [
  { key: 'pnl', label: 'سود و زیان', fmt: 'money' },
  { key: 'retPct', label: 'بازده ٪ سرمایه', fmt: 'pct' },
  { key: 'value', label: 'ارزش موقعیت', fmt: 'money' },
  { key: 'delta', label: 'دلتا', fmt: 'num' },
  { key: 'gamma', label: 'گاما', fmt: 'num' },
  { key: 'vega', label: 'وگا', fmt: 'money' },
  { key: 'theta', label: 'تتا روزانه', fmt: 'money' },
  { key: 'rho', label: 'رو', fmt: 'money' },
];

const axisDef = (key) => SENS_AXES.find((a) => a.key === key) || SENS_AXES[0];

/**
 * مقدارهای محور دوم، وقتی کاربر فهرست صریح نداده.
 *
 * چهار محورند و سه جنس. یک قاعدهٔ واحد برای همه، برای دوتاشان بی‌معنی
 * می‌شود:
 *
 *   days    از «امروز» تا سررسید، خطی. دامنه اینجا معنی ندارد — بازهٔ
 *           طبیعی خودش از روز مانده تا صفر است، و صفر باید حتماً بیفتد.
 *   sigma   نسبی، چون تلاطم ۱۵٪ و ۹۰٪ با یک بازهٔ مطلق مقایسه‌پذیر نیستند:
 *           ‎±۴۰٪ یعنی ۰٫۹ تا ۲٫۱ برای یکی و ۰٫۰۹ تا ۰٫۲۱ برای دیگری.
 *   rFree   مطلق، بر حسب **واحد درصد**. نرخ می‌تواند صفر باشد و ضریب نسبی
 *   divYield  روی صفر هیچ بازه‌ای نمی‌سازد؛ «‎±۵ واحد درصد» همیشه معنی دارد.
 *
 * تعداد نقطه فرد می‌شود تا مقدار مبنا دقیقاً وسط بیفتد و ستون وسط، همان
 * «فرض‌های امروز» باشد — همان ستونی که تفکیک پا از آن خوانده می‌شود.
 */
export function sensitivityAxis(opt = {}) {
  const key = axisDef(opt.axis).key;
  let steps = Math.max(2, Math.min(11, Math.trunc(num(opt.steps, 5))));
  const range = Math.max(0, num(opt.range, key === 'sigma' ? 40 : 5));

  if (key === 'days') {
    const d = Math.max(0, num(opt.days));
    if (!(d > 0)) return [0];
    // از امروز تا سررسید، با صفرِ حتمی در انتها
    return Array.from({ length: steps }, (_, i) => Math.round((d * (steps - 1 - i)) / (steps - 1)))
      .sort((a, b) => b - a);
  }

  if (steps % 2 === 0) steps += 1;
  const half = (steps - 1) / 2;
  const base = key === 'sigma' ? num(opt.sigma)
    : key === 'rFree' ? num(opt.rFree) : num(opt.divYield);
  if (key === 'sigma') {
    if (!(base > 0)) return [];
    return Array.from({ length: steps }, (_, i) => base * (1 + ((i - half) / half) * (range / 100)))
      .filter((v) => v > 0);
  }
  // نرخ منفی معنی ندارد و بریده می‌شود، ولی خودِ صفر می‌ماند
  return Array.from({ length: steps }, (_, i) => base + ((i - half) / half) * (range / 100))
    .map((v) => Math.max(0, v));
}

/**
 * جدول حساسیت: قیمت پایه در یک محور، پارامتر بازار در محور دیگر.
 *
 * محور دوم یکی از اینهاست و هرکدام چیزِ متفاوتی می‌پرسند:
 *
 *   days      اگر زودتر ببندی چه؟ — ارزش زمانی هنوز هست
 *   sigma     اگر تلاطم عوض شود چه؟ — همان که وگا می‌سنجد، ولی در اندازهٔ واقعی
 *   rFree     اگر نرخ عوض شود چه؟ — برای موقعیت‌های بلندمدت
 *   divYield  اگر سود نقدی پایه عوض شود چه؟ — پیش از مجمع، روی پاهای بلند
 *
 * پارامترهایی که محور دوم نیستند، ثابت‌اند و مقدارشان از همین `opt` می‌آید.
 * یعنی کاربر می‌تواند هم‌زمان تلاطم را دستی بگذارد و محور را روی نرخ ببرد —
 * «اگر فرض‌ها عوض شوند» بدون این، فقط یک فرض را هم‌زمان عوض می‌کرد.
 *
 * روی محور `days`، مقدار صفر یعنی سررسید و آن‌جا عمداً از ارزش‌گذاری مدل به
 * ارزش ذاتی سوییچ می‌شود؛ بلک‌شولز در `T=0` تعریف‌نشده است و اگر با تی خیلی
 * کوچک حساب شود، عددی می‌دهد که شبیه درست است ولی نیست. یونانی‌ها همان‌جا
 * خالی می‌مانند نه صفر: دلتای سررسید سر قیمت اعمال اصلاً تعریف ندارد و
 * «صفر» ادعایی است که مدل نمی‌کند.
 *
 * هر خانه همهٔ سنجه‌ها را دارد (`SENS_METRICS`)، نه فقط سود و زیان. جدول
 * یکی را نشان می‌دهد؛ محاسبهٔ هر هشت‌تا از یک بار قیمت‌گذاری همان پاها
 * می‌آید، پس گرفتن همه ارزان‌تر از دوباره ساختن جدول به‌ازای هر انتخاب است.
 */
export function sensitivityGrid(opt = {}) {
  const legs = opt.legs || [];
  const S = num(opt.spot);
  const yearDays = Math.max(1, num(opt.yearDays, 365));
  const sigma = num(opt.sigma);
  const rFree = num(opt.rFree);
  const divYield = num(opt.divYield);
  const capital = num(opt.capital);
  const axis = axisDef(opt.axis).key;
  const moves = Array.isArray(opt.moves) && opt.moves.length ? opt.moves : [-20, -10, -5, 0, 5, 10, 20];
  const axisValues = Array.isArray(opt.axisValues) && opt.axisValues.length
    ? opt.axisValues.map(num)
    : sensitivityAxis({ ...opt, axis });
  const base = { days: num(opt.days), sigma, rFree, divYield, capital, yearDays };
  if (!legs.length || !(S > 0) || !axisValues.length) {
    return { axis, axisValues: [], moves: [], rows: [], base };
  }

  const rows = moves.map((mv) => {
    const level = S * (1 + mv / 100);
    const cells = axisValues.map((av) => cellAt(legs, level, {
      days: axis === 'days' ? num(av) : num(opt.days),
      sigma: axis === 'sigma' ? num(av) : sigma,
      rFree: axis === 'rFree' ? num(av) : rFree,
      divYield: axis === 'divYield' ? num(av) : divYield,
      yearDays, capital, axisValue: num(av),
    }));
    return { movePct: mv, level, cells };
  });
  return { axis, axisValues, moves, rows, base };
}

/** یونانی‌های یک پا در یک حالت بازار. پای سهم فقط دلتا دارد، به اندازهٔ خودش. */
function legGreeksAt(leg, S, T, rFree, divYield, sigma, yearDays) {
  const q = signedQty(leg);
  if (leg.kind === 'underlying') {
    return { delta: q, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }
  // تقویم از تنظیمات می‌آید نه ۳۶۵ سخت‌کد؛ تتا «روزانه» است و اگر شمار روزِ
  // سال اینجا با ستون «تتا روزانه» جدول فرق کند، دو عدد برای یک چیز می‌ماند.
  const g = bsGreeks(leg.kind, S, num(leg.strike), T, rFree, divYield, sigma, yearDays);
  if (!ok(g.delta)) return null;
  return {
    delta: q * g.delta, gamma: q * g.gamma, vega: q * g.vega,
    theta: q * g.theta, rho: q * g.rho,
  };
}

/**
 * یک خانهٔ جدول حساسیت — همهٔ سنجه‌ها در یک حالت بازار.
 *
 * قاعدهٔ «هیچ عددی ساخته نمی‌شود» اینجا هم برقرار است: اگر ارزش‌گذاری یک پا
 * جواب ندهد، سود و زیان کل خالی می‌ماند نه اینکه آن پا صفر گرفته شود.
 */
function cellAt(legs, S, ctx) {
  const T = Math.max(0, num(ctx.days)) / Math.max(1, num(ctx.yearDays, 365));
  const live = T > 0;
  const perLeg = legs.map((leg) => (live && leg.kind !== 'underlying'
    ? modelLegPnl(leg, S, T, ctx.rFree, ctx.divYield, ctx.sigma)
    : legPnlAtExpiry(leg, S)));
  const bad = perLeg.some((v) => !ok(v));
  const pnl = bad ? NaN : perLeg.reduce((a, v) => a + v, 0);

  // ارزش موقعیت = ارزش پاها به قیمت روز، بدون خاطرهٔ قیمت ورود. مثبت یعنی
  // اگر همین حالا با همین مدل ببندی، بستانکار می‌شوی.
  let value = 0;
  let valueKnown = true;
  for (const leg of legs) {
    if (!live || leg.kind === 'underlying') { value += legValueAtExpiry(leg, S); continue; }
    const unit = bsPrice(leg.kind, S, num(leg.strike), T, ctx.rFree, ctx.divYield, ctx.sigma);
    if (ok(unit)) value += signedQty(leg) * unit; else valueKnown = false;
  }

  // یونانی فقط پیش از سررسید معنی دارد. سرِ سررسید خالی می‌ماند، نه صفر.
  const g = { delta: NaN, gamma: NaN, vega: NaN, theta: NaN, rho: NaN };
  if (live) {
    const each = legs.map((leg) => legGreeksAt(
      leg, S, T, ctx.rFree, ctx.divYield, ctx.sigma, Math.max(1, num(ctx.yearDays, 365))));
    if (each.every(Boolean)) {
      for (const k of Object.keys(g)) g[k] = each.reduce((a, x) => a + x[k], 0);
    }
  }

  const cap = num(ctx.capital);
  return {
    axisValue: num(ctx.axisValue), days: num(ctx.days), sigma: num(ctx.sigma),
    rFree: num(ctx.rFree), divYield: num(ctx.divYield), atExpiry: !live,
    pnl, perLeg,
    value: valueKnown ? value : NaN,
    retPct: cap > 0 && ok(pnl) ? (pnl / cap) * 100 : NaN,
    ...g,
  };
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
 *
 * `legUnits` می‌گوید پاهای ورودی خودشان چند واحد استراتژی‌اند. ردیف غربال
 * پاهایش را در تعداد قرارداد کاربر ضرب کرده تحویل می‌دهد (تا نمودار و نقد
 * خالص یک مقیاس داشته باشند)، پس نسبتِ هر پا دیگر «به‌ازای یک واحد» نیست.
 * بدون این، خواسته دوبار در حجم ضرب می‌شد: ۳۰۰ قرارداد از پاهایی که خودشان
 * ۳۰۰تایی‌اند، یعنی ۹۰٬۰۰۰ — عمقی که هیچ دفتری ندارد و هر ردیف را «قفل»
 * نشان می‌داد.
 */
export function bookDepthRisk(opt = {}) {
  const legs = opt.legs || [];
  const quotes = opt.quotes || [];
  const units = Math.max(1, num(opt.units, 1));
  const legUnits = Math.max(1, num(opt.legUnits, 1));
  const perLeg = [];
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (leg.kind === 'underlying') continue;
    const q = quotes[i] || {};
    const closeSide = leg.side === 'buy' ? 'sell' : 'buy';
    const want = (units * num(leg.ratio, 1)) / legUnits;
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
