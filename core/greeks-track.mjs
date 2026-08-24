// مسیر یونانی‌ها در طول عمر استراتژی، در هر تایم‌فریم — و حساسیت موقعیت.
//
// `core/leg-iv.mjs` یونانی یک لحظه را می‌سازد. این فایل همان را در طول زمان
// می‌کشد: روزبه‌روز، ثانیه‌به‌ثانیه، و روی سطل هر تایم‌فریمی که کاربر
// انتخاب کند. سه مسیر جداگانه لازم است چون سه شکل داده داریم، ولی هر سه به
// یک تابعِ لحظه‌ای می‌رسند — نه سه محاسبهٔ موازی که با هم از هم دور بیفتند.
//
// قاعدهٔ ۲-۴ اینجا دو جا خودش را نشان می‌دهد:
//
//   • پایی که تلاطم ضمنی ندارد، یونانی هم ندارد. `null` می‌ماند و جمعِ
//     موقعیت پرچم `incomplete` می‌گیرد؛ عددِ جمع را با فرضِ صفر برای آن پا
//     نمی‌سازیم، چون آن عدد ظاهرِ کامل دارد و کامل نیست.
//   • شبکهٔ حساسیت **مدل** است نه مشاهده، و همین‌جا و در رابط با همین کلمه
//     گفته می‌شود. عددش از بلک‌شولز می‌آید، از دفتر سفارش نمی‌آید.

import { bsPrice } from './bs.mjs';
import { num } from './num.mjs';
import { signedQty } from './payoff.mjs';
import { legDaysToExpiry, legGreeksAt, legIvPct, positionGreeksAt } from './leg-iv.mjs';

/** یونانی‌هایی که در همه‌جای برنامه یک نام و یک ترتیب دارند. */
export const GREEKS = [
  { key: 'delta', label: 'دلتا', unit: 'به‌ازای یک ریال حرکت پایه' },
  { key: 'gamma', label: 'گاما', unit: 'تغییر دلتا به‌ازای یک ریال' },
  { key: 'vega', label: 'وگا', unit: 'ریال به‌ازای یک واحد درصد تلاطم' },
  { key: 'theta', label: 'تتا', unit: 'ریال در روز' },
  { key: 'rho', label: 'رو', unit: 'ریال به‌ازای یک درصد نرخ' },
];

const finite = (value) => Number.isFinite(Number(value));

/**
 * یونانی موقعیت را روی یک ردیف می‌نشاند.
 *
 * ردیف هر شکلی داشته باشد — روز، ثانیه، سطل — قیمت پاها و قیمت پایه و
 * تاریخِ همان ردیف را می‌دهد و بقیه یکی است. `pick` همین تفاوت شکل را
 * می‌گیرد تا سه بار یک بدنه نوشته نشود.
 */
function stamp(row, legs, pick, params) {
  const { spot, prices, date } = pick(row);
  const g = positionGreeksAt(legs, { spot, prices, date }, params);
  g.byLeg.forEach((value, index) => { if (row.perLeg?.[index]) row.perLeg[index].greeks = value; });
  row.greeks = g;
  return row;
}

/** مسیر درون‌روز را با یونانی هر پا و یونانی کل مهر می‌زند. */
export function annotateIntradayGreeks(points = [], { legs = [], date } = {}, params = {}) {
  for (const point of points) {
    stamp(point, legs, (row) => ({
      spot: row.basePrice,
      prices: (row.perLeg || []).map((leg) => leg.exitPrice),
      date,
    }), params);
  }
  return points;
}

/**
 * سطل‌های تایم‌فریم را مهر می‌زند.
 *
 * تاریخ از خودِ سطل می‌آید نه از یک تاریخ واحد: بازهٔ چندروزه، سطل‌هایی از
 * روزهای مختلف دارد و روز مانده تا سررسید هر سطل با سطل دیگر فرق می‌کند.
 */
export function annotateBucketGreeks(buckets = [], { legs = [] } = {}, params = {}) {
  for (const bucket of buckets) {
    stamp(bucket, legs, (row) => ({
      spot: row.basePrice,
      prices: (row.perLeg || []).map((leg) => leg.price),
      date: row.date,
    }), params);
  }
  return buckets;
}

/**
 * سری آمادهٔ نمودار از یک مسیر مهرخورده.
 *
 * هر یونانی یک ستون می‌شود و هر پا هم ستون خودش را دارد: `delta`،
 * `delta1`، `delta2`… تا نمودار بتواند هم کل موقعیت را بکشد هم تفکیک پاها
 * را، بی‌آنکه لازم باشد داده دوباره ساخته شود.
 */
export function greekSeries(rows = [], { legCount = 0 } = {}) {
  return rows.map((row) => {
    const point = {
      date: row.date,
      dateLabel: row.dateLabel,
      second: row.second ?? row.startSecond,
      timeLabel: row.timeLabel,
      granularity: row.granularity,
      incomplete: row.greeks?.incomplete === true,
    };
    for (const { key } of GREEKS) point[key] = finite(row.greeks?.[key]) ? Number(row.greeks[key]) : NaN;
    for (let index = 0; index < legCount; index += 1) {
      const g = row.perLeg?.[index]?.greeks;
      const weight = row.perLeg?.[index]?.weight;
      for (const { key } of GREEKS) {
        // ستون پا، یونانی **وزن‌نخوردهٔ** خود پاست: عددی که مستقیم از
        // بلک‌شولز همان قرارداد آمده. وزن و علامت فقط در جمعِ موقعیت
        // اعمال می‌شود، و اگر اینجا هم اعمال می‌شد دو تعریف از یک نام
        // داشتیم.
        point[`${key}${index + 1}`] = finite(g?.[key]) ? Number(g[key]) : NaN;
      }
      point[`w${index + 1}`] = finite(weight) ? Number(weight) : NaN;
    }
    return point;
  });
}

/** خلاصهٔ یک سری عددی: چند مشاهده، چند جای خالی، و کجا بوده تا کجا رفته. */
export function trackSummary(values = []) {
  const list = values.map(Number);
  const good = list.filter(Number.isFinite);
  if (!good.length) return { samples: 0, gaps: list.length, first: NaN, last: NaN, min: NaN, max: NaN, mean: NaN, change: NaN };
  const first = good[0], last = good[good.length - 1];
  return {
    samples: good.length,
    gaps: list.length - good.length,
    first,
    last,
    min: Math.min(...good),
    max: Math.max(...good),
    mean: good.reduce((a, b) => a + b, 0) / good.length,
    change: last - first,
  };
}

/** خلاصهٔ هر پنج یونانی روی یک مسیر، برای کل موقعیت. */
export function greekSummary(rows = []) {
  const points = greekSeries(rows);
  return GREEKS.map(({ key, label, unit }) => ({
    key, label, unit, ...trackSummary(points.map((point) => point[key])),
  }));
}

/** خلاصهٔ هر پنج یونانی برای یک پای مشخص. */
export function legGreekSummary(rows = [], index = 0) {
  const values = rows.map((row) => row.perLeg?.[index]?.greeks);
  return GREEKS.map(({ key, label, unit }) => ({
    key, label, unit, ...trackSummary(values.map((g) => (finite(g?.[key]) ? Number(g[key]) : NaN))),
  }));
}

// ═══════════════════ حساسیت ═══════════════════
//
// این بخش **مدل** است، نه مشاهده. هیچ‌کدام از این عددها معامله نشده‌اند؛
// جواب این پرسش‌اند که «اگر پایه n درصد حرکت کند و تلاطم m واحد درصد جابه‌جا
// شود، بلک‌شولز چه می‌گوید». تفاوتش با بقیهٔ برنامه باید همیشه در برچسب
// بماند، وگرنه کاربر عددِ مدل را با عددِ بازار یکی می‌گیرد.

/** تلاطم ضمنی هر پا در یک لحظه — پایهٔ همهٔ سناریوها. */
export function ivSnapshot(legs = [], { spot, prices = [], date } = {}, params = {}) {
  return legs.map((leg, index) => legIvPct(leg, {
    spot, price: prices[index], days: legDaysToExpiry(leg, date),
  }, params));
}

/**
 * ارزش موقعیت در یک سناریو.
 *
 * پایی که تلاطم ضمنی‌اش را نمی‌دانیم، قابل بازقیمت‌گذاری نیست. در آن حالت
 * `NaN` برمی‌گردد و کل سناریو ناقص علامت می‌خورد — نه اینکه آن پا با قیمت
 * امروزش ثابت فرض شود، که یعنی ادعای «این پا حرکت نمی‌کند».
 */
export function repriceAt(legs = [], { spot, prices = [], ivPct = [], date }, shift = {}, params = {}) {
  const spotMul = 1 + num(shift.spotPct, 0) / 100;
  const volShift = num(shift.volPp, 0);
  const dayShift = num(shift.days, 0);
  const yearDays = num(params.yearDays, 365);
  const newSpot = num(spot) * spotMul;
  let value = 0, base = 0, incomplete = false;

  legs.forEach((leg, index) => {
    const weight = signedQty(leg);
    const now = num(prices[index], NaN);
    if (leg.kind === 'underlying') {
      value += weight * newSpot;
      base += weight * num(spot);
      return;
    }
    const sigma = num(ivPct[index], NaN);
    const days = legDaysToExpiry(leg, date) - dayShift;
    if (!Number.isFinite(sigma) || !Number.isFinite(now) || !(days > 0)) { incomplete = true; return; }
    const priced = bsPrice(leg.kind, newSpot, num(leg.strike), days / yearDays,
      num(params.rFree, 0), num(params.divYield, 0), Math.max(0.0001, (sigma + volShift) / 100));
    if (!Number.isFinite(priced)) { incomplete = true; return; }
    value += weight * priced;
    // مبنا هم با همان مدل حساب می‌شود، نه با قیمت مشاهده‌شده: اختلاف دو
    // عدد باید فقط از سناریو بیاید. اگر مبنا مشاهده باشد و سناریو مدل،
    // خطای برازش مدل داخل «اثر سناریو» می‌نشیند و صفرِ شبکه صفر نمی‌شود.
    const at0 = bsPrice(leg.kind, num(spot), num(leg.strike), legDaysToExpiry(leg, date) / yearDays,
      num(params.rFree, 0), num(params.divYield, 0), Math.max(0.0001, sigma / 100));
    base += weight * (Number.isFinite(at0) ? at0 : NaN);
  });

  const change = value - base;
  return { value, base, change: Number.isFinite(change) ? change : NaN, incomplete };
}

export const SPOT_STEPS = [-20, -15, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3, 5, 7, 10, 15, 20];
export const VOL_STEPS = [-20, -15, -10, -5, -2, 0, 2, 5, 10, 15, 20];

/**
 * شبکهٔ حساسیت: حرکت پایه در یک محور، جابه‌جایی تلاطم در محور دیگر.
 *
 * `days` روزهای گذشتِ زمان است — با آن، همان شبکه «اگر سه روز دیگر هم
 * بگذرد» را نشان می‌دهد و اثر تتا داخل هر خانه دیده می‌شود.
 */
export function positionSensitivityGrid(legs = [], snapshot = {}, params = {}, options = {}) {
  const spots = options.spotSteps || SPOT_STEPS;
  const vols = options.volSteps || VOL_STEPS;
  const days = num(options.days, 0);
  const ivPct = snapshot.ivPct || ivSnapshot(legs, snapshot, params);
  const rows = spots.map((spotPct) => ({
    spotPct,
    spot: num(snapshot.spot) * (1 + spotPct / 100),
    cells: vols.map((volPp) => {
      const out = repriceAt(legs, { ...snapshot, ivPct }, { spotPct, volPp, days }, params);
      return { volPp, change: out.change, incomplete: out.incomplete };
    }),
  }));
  return { spots, vols, days, ivPct, rows };
}

/**
 * حساسیت تک‌محوره: یک عامل حرکت می‌کند و بقیه سر جایشان می‌مانند.
 *
 * شبکه نشان می‌دهد دو عامل با هم چه می‌کنند؛ این نشان می‌دهد سهم هر عامل
 * به‌تنهایی چقدر است — همان چیزی که برای رتبه‌بندی محرک‌ها لازم است.
 */
export function positionSensitivityAxis(legs = [], snapshot = {}, params = {}, options = {}) {
  const ivPct = snapshot.ivPct || ivSnapshot(legs, snapshot, params);
  const at = (shift) => repriceAt(legs, { ...snapshot, ivPct }, shift, params);
  return {
    spot: (options.spotSteps || SPOT_STEPS).map((spotPct) => ({ step: spotPct, ...at({ spotPct }) })),
    vol: (options.volSteps || VOL_STEPS).map((volPp) => ({ step: volPp, ...at({ volPp }) })),
    time: (options.daySteps || [0, 1, 2, 3, 5, 7, 10, 14, 21, 30]).map((days) => ({ step: days, ...at({ days }) })),
  };
}

/**
 * یونانی موقعیت در یک لحظه، با تفکیک سهم هر پا.
 *
 * سهم پا = وزن علامت‌دار ضربدر یونانی خودش. همان چیزی که `positionGreeks`
 * جمع می‌زند، ولی اینجا پیش از جمع نگه داشته می‌شود تا معلوم باشد کدام پا
 * وگای موقعیت را ساخته.
 */
export function greekContribution(legs = [], snapshot = {}, params = {}) {
  const { spot, prices = [], date } = snapshot;
  return legs.map((leg, index) => {
    const weight = signedQty(leg);
    const g = leg.kind === 'underlying'
      ? { delta: 1, gamma: 0, vega: 0, theta: 0, rho: 0 }
      : legGreeksAt(leg, { spot, price: prices[index], days: legDaysToExpiry(leg, date) }, params);
    const share = {};
    for (const { key } of GREEKS) share[key] = finite(g?.[key]) ? weight * Number(g[key]) : NaN;
    return { index, leg, weight, greeks: g, share };
  });
}
