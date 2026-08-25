// رصد موقعیت با یونانی و تلاطم — یک لایه، برای همهٔ تب‌ها.
//
// چرا این فایل هست: تا پیش از این، یونانی و تلاطم فقط در «آزمایشگاه آپشن»
// بود و هر مصرف‌کنندهٔ تازه باید شش تابع را به ترتیب درست صدا می‌زد
// (`annotateDailyIv` بعد `annotateDailyGreeks`، و دو نسخهٔ دیگر برای درون‌روز
// و سطل). نتیجه‌اش این می‌شد که هر تب کمی متفاوت مهر بزند و همان عدد در دو
// جای برنامه دو رقم داشته باشد.
//
// اینجا یک ورودی هست: `annotateTrack`. شکل داده را می‌گیرد، نه سه تابع.
// و بر خلاف مسیر قبلی، تلاطم را **یک بار** درمی‌آورد و یونانی را از همان
// می‌سازد؛ ریشه‌یابی نیوتن برای هر پا در هر نقطه یک بار اجرا می‌شود نه دو
// بار.
//
// سه قاعده که در همهٔ توابع این فایل یکی است:
//
//   ۱. پایی که تلاطم ضمنی ندارد یونانی هم ندارد و جمعِ موقعیت `incomplete`
//      می‌خورد. عددِ جمع با فرض صفر برای آن پا ساخته نمی‌شود.
//   ۲. تلاطم تاریخی، تلاطمِ **پایه** است نه پا: یک عدد برای کل موقعیت.
//      اگر داده کافی نبود، اعلام دستی کاربر می‌نشیند و برچسبش می‌ماند.
//   ۳. یونانیِ ستونِ هر پا، یونانی وزن‌نخوردهٔ خود قرارداد است؛ وزن و علامت
//      فقط در سطر جمع اعمال می‌شود. دو تعریف از یک نام نداریم.

import { num } from './num.mjs';
import { signedQty } from './payoff.mjs';
import { positionGreeks } from './payoff.mjs';
import {
  legDaysToExpiry, legIvPct, greeksFromIvPct, meanIvPct, ivSummary,
} from './leg-iv.mjs';
import { GREEKS, trackSummary } from './greeks-track.mjs';
import { ivHvSpread } from './hist-vol.mjs';

export { GREEKS };

const finite = (value) => Number.isFinite(Number(value));

/**
 * شکل داده در سه تایم‌فریم. تفاوت این سه فقط در نام سه میدان است و همین
 * جدول، تنها جایی است که آن تفاوت نوشته می‌شود.
 *
 *   daily     مسیر روزانهٔ `replayHistory` — قیمت پایانی پایه و قیمت خروج پا
 *   intraday  بازپخش ثانیه‌ای — قیمت لحظه‌ای پایه، تاریخ از بیرون می‌آید
 *   bucket    سطل تایم‌فریم — هر سطل تاریخ خودش را دارد
 */
export const TRACK_SHAPES = {
  daily: {
    label: 'روزانه',
    spot: (row) => row.baseClose,
    prices: (row) => (row.perLeg || []).map((leg) => leg.exitPrice),
    date: (row) => row.date,
  },
  intraday: {
    label: 'درون‌روز',
    spot: (row) => row.basePrice,
    prices: (row) => (row.perLeg || []).map((leg) => leg.exitPrice),
    date: (row, ctx) => ctx.date,
  },
  bucket: {
    label: 'سطل تایم‌فریم',
    spot: (row) => row.basePrice,
    prices: (row) => (row.perLeg || []).map((leg) => leg.price),
    date: (row) => row.date,
  },
};

/**
 * عکس یک لحظه: تلاطم ضمنی هر پا، یونانی هر پا، سهم هر پا از یونانی موقعیت،
 * و جمع موقعیت.
 *
 * این تابع هستهٔ هر چیز دیگری در این فایل است. رصد زنده، ردیف جدول
 * موقعیت‌های من، و هر نقطه از یک مسیر تاریخی، همگی همین را صدا می‌زنند —
 * پس عددِ «دلتای این موقعیت» در تب زنده و در بک‌تست، از یک بدنه می‌آید.
 */
export function monitorSnapshot(legs = [], { spot, prices = [], date } = {}, params = {}, extra = {}) {
  const days = legs.map((leg) => legDaysToExpiry(leg, date));
  const ivPct = legs.map((leg, index) => legIvPct(leg, {
    spot, price: prices[index], days: days[index],
  }, params));
  const byLeg = legs.map((leg, index) => (
    leg?.kind === 'underlying'
      ? { delta: 1, gamma: 0, vega: 0, theta: 0, rho: 0 }
      : greeksFromIvPct(leg, { spot, days: days[index] }, ivPct[index], params)
  ));
  const totals = positionGreeks(legs, byLeg);
  // جمعِ ناقص، جمع نیست.
  //
  // `positionGreeks` از صفر شروع می‌کند و پایی که یونانی ندارد را رد
  // می‌کند. یعنی موقعیتی که هیچ پایش تلاطم نداده، «دلتا ۰» می‌گیرد — عددی
  // که دقیقاً شبیه «این موقعیت خنثای جهت است» خوانده می‌شود، در حالی که
  // حرفش «نمی‌دانیم» است. پرچم `incomplete` کنارش هست ولی چشم اول به عدد
  // می‌افتد نه به پرچم.
  //
  // پس جمعِ ناقص عدد نمی‌دهد. یونانی پاهایی که درآمده‌اند سر جایشان
  // می‌مانند و در جدول تفکیک دیده می‌شوند؛ چیزی که ساخته نمی‌شود فقط
  // ادعای «یونانی کل موقعیت این است» است.
  if (totals.incomplete) {
    for (const { key } of GREEKS) totals[key] = NaN;
    totals.deltaShares = NaN;
  }
  const hvPct = num(extra.hvPct, NaN);
  const meanIv = meanIvPct(ivPct);
  return {
    spot: num(spot, NaN), date,
    ivPct, days, byLeg,
    // سهم هر پا از یونانی موقعیت: وزن علامت‌دار ضربدر یونانی خودش. جمعش
    // دقیقاً `greeks` می‌شود، پس جدول تفکیک و سطر جمع هیچ‌وقت واگرا نمی‌شوند.
    share: legs.map((leg, index) => {
      const weight = signedQty(leg);
      const g = byLeg[index];
      const out = { index, weight };
      for (const { key } of GREEKS) out[key] = finite(g?.[key]) ? weight * Number(g[key]) : NaN;
      return out;
    }),
    greeks: { ...totals, byLeg },
    meanIvPct: meanIv,
    hvPct,
    hvSource: extra.hvSource || (Number.isFinite(hvPct) ? 'series' : 'none'),
    ivHvSpreadPp: ivHvSpread(meanIv, hvPct),
    incomplete: totals.incomplete === true,
  };
}

/**
 * یک مسیر را — در هر تایم‌فریمی — با تلاطم و یونانی مهر می‌زند.
 *
 * ردیف‌ها **در جا** عوض می‌شوند و همان آرایه برمی‌گردد، چون مصرف‌کننده‌ها
 * (جدول، نمودار، خروجی اکسل) همان شیء ردیف را دست‌به‌دست می‌کنند و کپی‌کردن
 * یعنی دو نسخه که یکی‌شان کهنه می‌شود.
 *
 * `hvPct` — تلاطم تاریخی پایه — روی همهٔ ردیف‌ها یکی می‌نشیند مگر
 * `hvSeries` داده شود؛ آن‌وقت هر ردیف عدد پنجرهٔ خودش را می‌گیرد.
 */
export function annotateTrack(rows = [], { legs = [], shape = 'daily', date, hvPct = NaN, hvSeries = null, hvSource = '' } = {}, params = {}) {
  const pick = TRACK_SHAPES[shape] || TRACK_SHAPES.daily;
  const ctx = { date };
  rows.forEach((row, at) => {
    const hv = Array.isArray(hvSeries) ? num(hvSeries[at], NaN) : num(hvPct, NaN);
    const snap = monitorSnapshot(legs, {
      spot: pick.spot(row, ctx), prices: pick.prices(row, ctx), date: pick.date(row, ctx),
    }, params, { hvPct: hv, hvSource });
    snap.byLeg.forEach((value, index) => { if (row.perLeg?.[index]) row.perLeg[index].greeks = value; });
    snap.ivPct.forEach((value, index) => { if (row.perLeg?.[index]) row.perLeg[index].ivPct = value; });
    row.greeks = snap.greeks;
    row.legIvPct = snap.ivPct;
    row.meanIvPct = snap.meanIvPct;
    row.hvPct = snap.hvPct;
    row.hvSource = snap.hvSource;
    row.ivHvSpreadPp = snap.ivHvSpreadPp;
    row.monitor = snap;
  });
  return rows;
}

/** همان `annotateTrack` روی یک نتیجهٔ `replayHistory`. ردیف‌های بی‌قیمت رد نمی‌شوند تا شمارهٔ ردیف جابه‌جا نشود. */
export function annotateReplay(replay, options = {}, params = {}) {
  if (!replay?.ok) return replay;
  annotateTrack(replay.rows || [], { ...options, legs: replay.priced || [], shape: 'daily' }, params);
  return replay;
}

/**
 * سری آمادهٔ نمودار. هر یونانی یک ستون برای کل موقعیت و یک ستون برای هر پا،
 * به‌علاوهٔ تلاطم ضمنی هر پا، میانگین ضمنی، تاریخی، و فاصلهٔ این دو.
 *
 * نام ستون‌ها همان الگوی `greekSeries` را نگه می‌دارد (`delta`، `delta1`…)
 * تا نمودارهای موجودِ آزمایشگاه بدون تغییر با این سری هم کار کنند.
 */
export function monitorSeries(rows = [], { legCount = 0 } = {}) {
  return rows.map((row) => {
    const point = {
      date: row.date,
      dateLabel: row.dateLabel,
      second: row.second ?? row.startSecond,
      timeLabel: row.timeLabel,
      granularity: row.granularity,
      incomplete: row.greeks?.incomplete === true,
      // سطل تایم‌فریم `netPnl` ندارد؛ ارزش پایانِ سطل را `closePnl` می‌گوید.
      // هر دو یک چیزند — «موقعیت در آن لحظه چقدر می‌ارزید» — و ستون یکی
      // است، پس نامشان اینجا یکی می‌شود نه در سه مصرف‌کننده.
      netPnl: finite(row.netPnl) ? Number(row.netPnl) : (finite(row.closePnl) ? Number(row.closePnl) : NaN),
      returnPct: finite(row.returnPct) ? Number(row.returnPct) : NaN,
      spot: finite(row.baseClose) ? Number(row.baseClose) : (finite(row.basePrice) ? Number(row.basePrice) : NaN),
      ivMean: finite(row.meanIvPct) ? Number(row.meanIvPct) : NaN,
      hv: finite(row.hvPct) ? Number(row.hvPct) : NaN,
      ivHv: finite(row.ivHvSpreadPp) ? Number(row.ivHvSpreadPp) : NaN,
    };
    for (const { key } of GREEKS) point[key] = finite(row.greeks?.[key]) ? Number(row.greeks[key]) : NaN;
    for (let index = 0; index < legCount; index += 1) {
      const g = row.perLeg?.[index]?.greeks;
      for (const { key } of GREEKS) {
        point[`${key}${index + 1}`] = finite(g?.[key]) ? Number(g[key]) : NaN;
      }
      const iv = row.legIvPct?.[index];
      point[`iv${index + 1}`] = finite(iv) ? Number(iv) : NaN;
    }
    return point;
  });
}

/** خلاصهٔ هر پنج یونانی روی یک مسیر، برای کل موقعیت. */
export function monitorGreekSummary(rows = []) {
  const points = monitorSeries(rows);
  return GREEKS.map(({ key, label, unit }) => ({
    key, label, unit, ...trackSummary(points.map((point) => point[key])),
  }));
}

/** خلاصهٔ هر پنج یونانی برای یک پای مشخص. */
export function monitorLegGreekSummary(rows = [], index = 0) {
  const values = rows.map((row) => row.perLeg?.[index]?.greeks);
  return GREEKS.map(({ key, label, unit }) => ({
    key, label, unit, ...trackSummary(values.map((g) => (finite(g?.[key]) ? Number(g[key]) : NaN))),
  }));
}

/**
 * خلاصهٔ تلاطم: هر پا، میانگین موقعیت، و تاریخی — در یک جدول.
 *
 * تاریخی هم ردیف خودش را دارد حتی وقتی ثابت است؛ خالی‌گذاشتنش کاربر را
 * وامی‌دارد جای دیگری دنبالش بگردد، و ثابت‌بودن خودش یک خبر است.
 */
export function monitorVolSummary(rows = [], { legs = [] } = {}) {
  // برچسب پا اینجا ساخته نمی‌شود. شمارهٔ پا عددی است که کاربر می‌بیند و
  // باید رقم فارسی بگیرد؛ فارسی‌سازی کارِ `ui/fmt.mjs` است و هسته به رابط
  // وابسته نمی‌شود. پس `index` برمی‌گردد و رابط با همان نامی که در نمودار
  // و جدول‌های دیگرش به کار می‌برد برچسب می‌زند — یک نام، نه دو.
  const out = legs.map((leg, index) => ({
    kind: 'leg', index, leg, label: '',
    ...ivSummary(rows.map((row) => row.legIvPct?.[index])),
  }));
  out.push({
    kind: 'mean', index: -1, leg: null, label: 'میانگین ضمنی موقعیت',
    ...ivSummary(rows.map((row) => row.meanIvPct)),
  });
  out.push({
    kind: 'hv', index: -2, leg: null, label: 'تلاطم تاریخی پایه',
    ...ivSummary(rows.map((row) => row.hvPct)),
  });
  out.push({
    kind: 'spread', index: -3, leg: null, label: 'ضمنی منهای تاریخی',
    ...ivSummary(rows.map((row) => row.ivHvSpreadPp)),
  });
  return out;
}

/**
 * وضعیت پوشش: از چند نقطهٔ مسیر، یونانیِ کامل درآمد.
 *
 * بدون این عدد، نموداری با نیمی از نقاط خالی همان‌قدر معتبر به نظر می‌رسد
 * که نموداری کامل — و همین‌جاست که کاربر روی چیزی تصمیم می‌گیرد که نیست.
 */
export function monitorCoverage(rows = []) {
  const total = rows.length;
  let complete = 0, partial = 0, none = 0;
  for (const row of rows) {
    const g = row.greeks;
    // ترتیب مهم است: از وقتی جمعِ ناقص عدد نمی‌دهد، «دلتا متناهی نیست»
    // دیگر «هیچ‌چیز درنیامد» را نمی‌گوید — پرچم `incomplete` می‌گوید.
    // سنجیدن دلتا پیش از پرچم، هر نقطهٔ نیمه‌کامل را «بی‌یونانی» می‌شمرد.
    if (!g) { none += 1; continue; }
    if (g.incomplete) { partial += 1; continue; }
    if (!Number.isFinite(g.delta)) { none += 1; continue; }
    complete += 1;
  }
  return {
    total, complete, partial, none,
    coveragePct: total ? (complete / total) * 100 : NaN,
  };
}

/**
 * لحظه‌های شاخصِ عمر موقعیت: اول، آخر، و جایی که هر یونانی به انتهای دامنهٔ
 * خودش رسیده.
 *
 * پرسشی که این جدول جواب می‌دهد: «کِی این موقعیت بیشترین ریسک جهت را
 * داشت؟» — و جوابش تاریخ است، نه عدد.
 */
export function monitorExtremes(rows = []) {
  const points = monitorSeries(rows);
  const stamped = points.filter((point) => Number.isFinite(point.delta) || Number.isFinite(point.ivMean));
  if (!stamped.length) return [];
  const at = (point) => point.timeLabel || point.dateLabel || String(point.date ?? '');
  const pickBy = (key, want) => {
    const usable = stamped.filter((point) => Number.isFinite(point[key]));
    if (!usable.length) return null;
    return usable.reduce((best, point) => (
      want === 'max' ? (point[key] > best[key] ? point : best) : (point[key] < best[key] ? point : best)
    ), usable[0]);
  };
  const rowsOut = [];
  for (const { key, label } of [...GREEKS, { key: 'ivMean', label: 'تلاطم ضمنی موقعیت' }]) {
    const hi = pickBy(key, 'max');
    const lo = pickBy(key, 'min');
    if (!hi || !lo) continue;
    rowsOut.push({
      key, label,
      maxValue: hi[key], maxAt: at(hi),
      minValue: lo[key], minAt: at(lo),
      firstValue: stamped.find((point) => Number.isFinite(point[key]))?.[key] ?? NaN,
      lastValue: [...stamped].reverse().find((point) => Number.isFinite(point[key]))?.[key] ?? NaN,
    });
  }
  return rowsOut;
}

/**
 * جای موقعیت روی چهار محور، در یک جمله.
 *
 * «دلتا ۱٫۲− است» برای کسی که هر روز با این عدد کار نمی‌کند چیزی نمی‌گوید.
 * این تابع همان عدد را به جهت ترجمه می‌کند و مرزها را صریح می‌گذارد تا
 * قابل بحث باشند — عمداً از تنظیمات نمی‌آیند چون آستانهٔ «خنثی» سلیقهٔ
 * رابط است نه پارامتر مالی.
 */
export function monitorStance(greeks = {}, { deltaFlat = 0.05 } = {}) {
  const of = (key) => (finite(greeks[key]) ? Number(greeks[key]) : NaN);
  const d = of('delta'), g = of('gamma'), v = of('vega'), t = of('theta');
  const word = (value, up, down, flat = 'خنثی', eps = 0) => {
    if (!Number.isFinite(value)) return '—';
    if (Math.abs(value) <= eps) return flat;
    return value > 0 ? up : down;
  };
  return {
    delta: word(d, 'صعودی', 'نزولی', 'خنثای جهت', deltaFlat),
    gamma: word(g, 'دوست حرکت بزرگ', 'دشمن حرکت بزرگ'),
    vega: word(v, 'خریدار تلاطم', 'فروشندهٔ تلاطم'),
    theta: word(t, 'زمان به سودت کار می‌کند', 'زمان علیه توست'),
  };
}
