// تجزیهٔ سود و زیان به ریشه‌هایش.
//
// پرسشی که این فایل جواب می‌دهد: «این ۳۲۰ میلیون ریال سود از کجا آمد؟»
//
// جواب سه لایه دارد و هر لایه از لایهٔ بالاتر ساخته می‌شود:
//
//   لایهٔ ۱ — کدام پا؟ سود موقعیت جمع سود پاهاست. همین‌جا معلوم می‌شود
//             سود از یک پا آمده و پای دیگر آن را خورده، یا هر دو با هم.
//   لایهٔ ۲ — چرا آن پا؟ قیمت یک اختیار بی‌دلیل عوض نمی‌شود. تغییرش را
//             بلک‌شولز به چهار عامل می‌شکند: حرکت پایه (دلتا)، انحنای همان
//             حرکت (گاما)، جابه‌جایی تلاطم ضمنی (وگا) و گذر زمان (تتا).
//   لایهٔ ۳ — آن عامل کِی کار کرد؟ هر عامل هم سود ساخته و هم زیان؛ عدد
//             خالص، این دو را پنهان می‌کند. `driverPhases` دوباره بازشان
//             می‌کند.
//
// ═══ چرا «باقیمانده» ستون دارد و پنهان نمی‌شود ═══
//
// تقریب تیلور مرتبهٔ دوم است: یک گام بزرگ، یا گامی که تلاطم و پایه با هم در
// آن جابه‌جا شده‌اند، کامل توضیح داده نمی‌شود. آنچه توضیح داده نشده در
// «باقیمانده» می‌نشیند و دیده می‌شود. جمع‌کردنش داخل یکی از چهار عامل،
// عددی می‌ساخت که دقیق به‌نظر می‌رسد و نیست.
//
// ═══ رو چرا نیست ═══
//
// نرخ بدون ریسک در کل بازپخش یک پارامتر ثابت است، پس تغییرش صفر است و سهم
// رو دقیقاً صفر. ستونی که همیشه صفر است، ستون نیست.
//
// ═══ قاعدهٔ ۲-۴ ═══
//
// پایی که تلاطم ضمنی ندارد یونانی هم ندارد، پس تجزیه‌اش ممکن نیست. سود آن
// پا به «توضیح‌داده‌نشده» می‌رود و `coverage` می‌گوید چند درصد از حرکت
// اصلاً تجزیه شده. عددِ تجزیه با فرضِ صفر برای آن پا ساخته نمی‌شود.

import { daysBetween } from './history.mjs';
import { num } from './num.mjs';
import { signedQty } from './payoff.mjs';

/** چهار عامل، به‌علاوهٔ باقیمانده. یک ترتیب، در موتور و رابط و فایل. */
export const DRIVERS = [
  { key: 'delta', label: 'حرکت پایه', hint: 'دلتای پا × تغییر قیمت نماد پایه' },
  { key: 'gamma', label: 'انحنای حرکت', hint: 'نصف گاما × مربع تغییر قیمت پایه' },
  { key: 'vega', label: 'تغییر تلاطم', hint: 'وگا × تغییر تلاطم ضمنی همان پا (واحد درصد)' },
  { key: 'theta', label: 'گذر زمان', hint: 'تتا × روز سپری‌شده' },
  { key: 'rest', label: 'باقیمانده', hint: 'آنچه چهار عامل بالا توضیح نمی‌دهند — تقریب مرتبهٔ دوم' },
];

const KEYS = DRIVERS.map((driver) => driver.key);
const fin = (value) => (Number.isFinite(Number(value)) ? Number(value) : NaN);
const zero = () => Object.fromEntries(KEYS.map((key) => [key, 0]));

/**
 * فاصلهٔ زمانی دو نقطه بر حسب روز تقویمی.
 *
 * ثانیه هم حساب می‌شود: در تایم‌فریم یک‌دقیقه‌ای، دو نقطهٔ پشت سر هم یک روز
 * فاصله ندارند و تتای یک روز کامل برایشان، اثر زمان را ده‌ها برابر بزرگ
 * نشان می‌داد.
 */
export function elapsedDays(a, b) {
  const days = Number.isFinite(a?.date) && Number.isFinite(b?.date) ? daysBetween(a.date, b.date) : 0;
  const seconds = (Number.isFinite(b?.second) ? b.second : 0) - (Number.isFinite(a?.second) ? a.second : 0);
  const total = num(days, 0) + seconds / 86400;
  return Number.isFinite(total) ? total : NaN;
}

// ═══════════════════ تبدیل مسیرها به یک شکل ═══════════════════
//
// سه مسیر داریم با سه نام میدان. تجزیه نباید سه بار نوشته شود، پس هر مسیر
// یک بار به یک شکل مشترک می‌آید و بعد یک تابع رویش کار می‌کند.

const point = (row, { spot, prices, pnl, label }) => ({
  date: row.date,
  second: row.second ?? row.startSecond,
  label,
  spot: fin(spot),
  prices,
  pnl,
  ivPct: (row.perLeg || []).map((leg) => fin(leg.ivPct)),
  greeks: (row.perLeg || []).map((leg) => leg.greeks || null),
  status: row.status,
});

/** مسیر روزانه — باید پیش‌تر با تلاطم و یونانی مهر خورده باشد. */
export function dailyTrack(replay) {
  return (replay?.rows || [])
    .filter((row) => row.status !== 'missing')
    .map((row) => point(row, {
      spot: row.baseClose,
      prices: (row.perLeg || []).map((leg) => fin(leg.exitPrice)),
      pnl: (row.perLeg || []).map((leg) => fin(leg.netPnl)),
      label: row.dateLabel,
    }));
}

/** مسیر سطل‌های تایم‌فریم. */
export function bucketTrack(buckets = []) {
  return buckets.map((row) => point(row, {
    spot: row.basePrice,
    prices: (row.perLeg || []).map((leg) => fin(leg.price)),
    pnl: (row.perLeg || []).map((leg) => fin(leg.netPnl)),
    label: row.label,
  }));
}

/** مسیر ثانیه‌به‌ثانیهٔ یک روز. */
export function intradayTrack(points = [], date) {
  return points.map((row) => ({
    ...point(row, {
      spot: row.basePrice,
      prices: (row.perLeg || []).map((leg) => fin(leg.exitPrice)),
      pnl: (row.perLeg || []).map((leg) => fin(leg.netPnl)),
      label: row.timeLabel,
    }),
    date: row.date ?? date,
  }));
}

// ═══════════════════ تجزیه ═══════════════════

/**
 * سهم هر عامل در تغییر یک پا، بین دو نقطهٔ پیاپی.
 *
 * یونانی‌های **ابتدای** گام استفاده می‌شوند، نه میانگین دو سر. دلیلش
 * پیش‌بینی‌پذیری است: جواب فقط به چیزی وابسته است که در ابتدای گام معلوم
 * بوده. خطای این انتخاب در «باقیمانده» دیده می‌شود، نه اینکه پنهان شود.
 */
export function attributeLegStep(leg, before, after, index) {
  const weight = signedQty(leg);
  const actual = fin(after.pnl[index]) - fin(before.pnl[index]);
  const dSpot = fin(after.spot) - fin(before.spot);
  const out = {
    index, weight, actual: Number.isFinite(actual) ? actual : NaN,
    ...zero(), explained: NaN, incomplete: true,
  };
  for (const key of KEYS) out[key] = NaN;

  if (leg.kind === 'underlying') {
    // سهم پایه هیچ ابهامی ندارد: کل حرکتش دلتاست، چون دلتایش یک است.
    if (!Number.isFinite(dSpot) || !Number.isFinite(actual)) return out;
    out.delta = weight * dSpot;
    out.gamma = 0; out.vega = 0; out.theta = 0;
    out.explained = out.delta;
    out.rest = actual - out.explained;
    out.incomplete = false;
    return out;
  }

  const g = before.greeks[index];
  if (!g || !Number.isFinite(g.delta) || !Number.isFinite(dSpot) || !Number.isFinite(actual)) return out;

  const dVol = fin(after.ivPct[index]) - fin(before.ivPct[index]);
  const days = elapsedDays(before, after);
  out.delta = weight * g.delta * dSpot;
  out.gamma = 0.5 * weight * fin(g.gamma) * dSpot * dSpot;
  // تلاطمِ نبوده یعنی سهم وگا **نامعلوم** است، نه صفر. صفر گذاشتن یعنی
  // ادعای «تلاطم تکان نخورد»، که ندیده‌ایم.
  out.vega = Number.isFinite(dVol) ? weight * fin(g.vega) * dVol : NaN;
  out.theta = Number.isFinite(days) ? weight * fin(g.theta) * days : NaN;

  const parts = [out.delta, out.gamma, out.vega, out.theta];
  if (parts.some((value) => !Number.isFinite(value))) return out;
  out.explained = parts.reduce((a, b) => a + b, 0);
  out.rest = actual - out.explained;
  out.incomplete = false;
  return out;
}

/** یک گام کامل: همهٔ پاها، به‌علاوهٔ جمعِ موقعیت. */
export function attributeStep(legs = [], before, after) {
  const byLeg = legs.map((leg, index) => attributeLegStep(leg, before, after, index));
  const total = { actual: 0, ...zero(), explained: 0 };
  let incomplete = false, unexplainedPnl = 0;
  for (const item of byLeg) {
    if (item.incomplete) {
      incomplete = true;
      if (Number.isFinite(item.actual)) unexplainedPnl += item.actual;
      continue;
    }
    total.actual += item.actual;
    total.explained += item.explained;
    for (const key of KEYS) total[key] += item[key];
  }
  return {
    from: before.label, to: after.label,
    date: after.date, second: after.second,
    spot: after.spot,
    spotChange: fin(after.spot) - fin(before.spot),
    spotPct: fin(before.spot) > 0 ? ((fin(after.spot) - fin(before.spot)) / fin(before.spot)) * 100 : NaN,
    days: elapsedDays(before, after),
    byLeg, ...total, incomplete, unexplainedPnl,
  };
}

/** همهٔ گام‌های یک مسیر. */
export function attributeTrack(legs = [], track = []) {
  const steps = [];
  for (let index = 1; index < track.length; index += 1) steps.push(attributeStep(legs, track[index - 1], track[index]));
  return steps;
}

// ═══════════════════ جمع‌بندی ═══════════════════

/**
 * جمع سهم هر عامل در کل عمر موقعیت، و اینکه چقدرش اصلاً تجزیه شده.
 *
 * `coverage` مهم‌ترین عدد این خروجی است: اگر ۶۰٪ باشد، یعنی ۴۰ درصد حرکت
 * روی پاهایی افتاده که تلاطم ضمنی نداشتند و دربارهٔ آن‌ها هیچ ادعایی
 * نمی‌شود. بی این عدد، جمعِ عوامل کامل به‌نظر می‌رسد.
 */
export function driverTotals(steps = []) {
  const total = { actual: 0, explained: 0, ...zero() };
  let unexplainedPnl = 0, incompleteSteps = 0;
  for (const step of steps) {
    total.actual += Number.isFinite(step.actual) ? step.actual : 0;
    total.explained += Number.isFinite(step.explained) ? step.explained : 0;
    for (const key of KEYS) total[key] += Number.isFinite(step[key]) ? step[key] : 0;
    unexplainedPnl += step.unexplainedPnl || 0;
    if (step.incomplete) incompleteSteps += 1;
  }
  const moved = Math.abs(total.actual) + Math.abs(unexplainedPnl);
  return {
    ...total,
    steps: steps.length,
    incompleteSteps,
    unexplainedPnl,
    coverage: moved > 0 ? (Math.abs(total.actual) / moved) * 100 : NaN,
  };
}

/** همان جمع، ولی به تفکیک پا — لایهٔ اول جواب. */
export function legTotals(legs = [], steps = []) {
  return legs.map((leg, index) => {
    const out = { index, leg, name: leg?.name || '', actual: 0, explained: 0, ...zero(), gaps: 0, samples: 0 };
    for (const step of steps) {
      const item = step.byLeg[index];
      if (!item) continue;
      if (item.incomplete) { out.gaps += 1; continue; }
      out.samples += 1;
      out.actual += item.actual;
      out.explained += item.explained;
      for (const key of KEYS) out[key] += item[key];
    }
    return out;
  });
}

/**
 * هر عامل چقدر سود ساخت و چقدر زیان — لایهٔ سوم.
 *
 * عاملی که خالصش نزدیک صفر است، ممکن است اصلاً بی‌اثر نبوده باشد: شاید
 * نصف عمر موقعیت را ساخته و نصف دیگر را خورده. آن دو عدد، الگوی رفتار
 * استراتژی‌اند و خالص، پنهانشان می‌کند.
 */
export function driverPhases(steps = []) {
  return DRIVERS.map(({ key, label, hint }) => {
    let gain = 0, loss = 0, gainSteps = 0, lossSteps = 0, best = null, worst = null;
    for (const step of steps) {
      const value = step[key];
      if (!Number.isFinite(value) || value === 0) continue;
      if (value > 0) { gain += value; gainSteps += 1; if (!best || value > best.value) best = { value, step }; }
      else { loss += value; lossSteps += 1; if (!worst || value < worst.value) worst = { value, step }; }
    }
    return { key, label, hint, gain, loss, net: gain + loss, gainSteps, lossSteps, best, worst };
  });
}

/** پررنگ‌ترین عامل یک گام: کدام‌یک بیشترین قدر مطلق را دارد. */
export function dominantDriver(step) {
  let winner = null;
  for (const { key, label } of DRIVERS) {
    const value = step?.[key];
    if (!Number.isFinite(value)) continue;
    if (!winner || Math.abs(value) > Math.abs(winner.value)) winner = { key, label, value };
  }
  if (!winner) return null;
  const scale = DRIVERS.reduce((sum, { key }) => sum + (Number.isFinite(step[key]) ? Math.abs(step[key]) : 0), 0);
  return { ...winner, sharePct: scale > 0 ? (Math.abs(winner.value) / scale) * 100 : NaN };
}

/**
 * بزرگ‌ترین جهش‌های سود و زیان، هرکدام با عاملی که ساختش.
 *
 * سود یک استراتژی معمولاً در چند گام معدود ساخته می‌شود، نه یکنواخت در کل
 * بازه. این فهرست همان چند گام است — جایی که باید نگاه کرد.
 */
export function turningPoints(steps = [], count = 12) {
  return steps
    .filter((step) => Number.isFinite(step.actual) && step.actual !== 0)
    .slice()
    .sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual))
    .slice(0, count)
    .map((step) => ({ step, driver: dominantDriver(step) }));
}

/**
 * تجزیهٔ کامل یک مسیر، آمادهٔ نمایش.
 *
 * `cumulative` مسیر تجمعی هر عامل است: نمودارِ «سود از کجا آمد» دقیقاً همین
 * است — پنج خط که با هم، منحنی سود و زیان را می‌سازند.
 */
export function analyzeAttribution(legs = [], track = [], { turning = 12 } = {}) {
  const steps = attributeTrack(legs, track);
  const running = zero();
  let actual = 0;
  const cumulative = steps.map((step) => {
    for (const key of KEYS) running[key] += Number.isFinite(step[key]) ? step[key] : 0;
    actual += Number.isFinite(step.actual) ? step.actual : 0;
    return {
      date: step.date, second: step.second, dateLabel: step.to, timeLabel: step.to,
      granularity: Number.isFinite(step.second) ? 'trade' : 'day',
      actual, ...running,
    };
  });
  return {
    steps,
    cumulative,
    totals: driverTotals(steps),
    byLeg: legTotals(legs, steps),
    phases: driverPhases(steps),
    turningPoints: turningPoints(steps, turning),
  };
}
