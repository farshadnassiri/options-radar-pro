// تاریخچهٔ فاصله — همان عدد، در طول زمان.
//
// ═══ چرا جدا از `spread-gap.mjs` ═══
//
// آن فایل یک لحظه را می‌سنجد و هیچ نمی‌داند زمان چیست. این یکی همان تابع
// را روی یک محورِ زمان می‌دواند و از نتیجه‌اش آمار می‌گیرد. جدا نگه‌داشتن،
// یعنی سنجهٔ لحظه‌ای یک تعریف دارد نه دو تا — و نموداری که رسم می‌شود
// دقیقاً همان عددی است که کارتِ بالای صفحه نشان می‌دهد.
//
// ═══ دو دانه‌بندی، یک تابع ═══
//
// روزانه از سری تاریخی می‌آید (`seriesByIns`) و درون‌روزی از ریزمعامله
// (`tapeByIns`). شکل ورودی فرق می‌کند، ولی از نقطهٔ ساختِ «قیمت هر پا در
// این لحظه» به بعد هر دو یکی‌اند. پس همان‌جا به هم می‌رسند و بقیهٔ مسیر
// یکی است.
//
// ═══ خانهٔ خالی، خالی می‌ماند ═══
//
// لحظه‌ای که حتی یک پایش معامله نشده، نقطه نمی‌سازد. با قیمت لحظهٔ قبل پر
// نمی‌شود. نمودارِ پرشده‌با‌حدس، دقیقاً همان نموداری است که «فاصله ثابت
// مانده» نشان می‌دهد در حالی که بازار بسته بوده.

import { num } from './num.mjs';
import { historyPrice, normalizeHistoryDate, historyDateLabel } from './history.mjs';
import { marksAt } from './intraday-mark.mjs';
import { momentsFor, momentLabel, momentKey, isIntradayGrain, normalizeGrain } from './intraday-grid.mjs';
import { DEFAULT_SCALE, measureGap } from './spread-gap.mjs';
// تقویم جلالی برای سطلِ ماهانه — سطلِ میلادی وسطِ ماهِ جلالی می‌شکند.
import { gregorianToJalali } from './jalali.mjs';

const finite = (value) => Number.isFinite(value);

/**
 * صدکِ یک مقدار در یک توزیع — «امروز کجای تاریخِ خودش ایستاده».
 *
 * روش «کمتر یا مساوی» است نه درون‌یابی: با ۴۰ نقطه، درون‌یابی دقتی ادعا
 * می‌کند که داده ندارد. صفر یعنی کمینهٔ تاریخی، صد یعنی بیشینه.
 */
export function percentileRank(values = [], value) {
  const list = values.filter(finite);
  if (!list.length || !finite(value)) return NaN;
  let below = 0;
  for (const item of list) if (item <= value) below += 1;
  return (below / list.length) * 100;
}

/** صدکِ p از یک توزیع، با درون‌یابی خطی میان دو همسایه. */
export function quantile(values = [], p) {
  const list = values.filter(finite).sort((a, b) => a - b);
  if (!list.length) return NaN;
  const at = (Math.min(100, Math.max(0, num(p, 0))) / 100) * (list.length - 1);
  const lo = Math.floor(at), hi = Math.ceil(at);
  return lo === hi ? list[lo] : list[lo] + ((list[hi] - list[lo]) * (at - lo));
}

/** آمارِ یک ستون از نقاط. میدانِ بی‌عدد، آمارِ بی‌عدد می‌دهد نه صفر. */
export function seriesStats(points = [], field = 'current') {
  const values = points.map((point) => num(point?.[field], NaN)).filter(finite);
  if (!values.length) {
    return { count: 0, min: NaN, max: NaN, mean: NaN, median: NaN, p25: NaN, p75: NaN, last: NaN, first: NaN, rank: NaN, range: NaN };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const last = values[values.length - 1];
  return {
    count: values.length,
    min: sorted[0], max: sorted[sorted.length - 1],
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    median: quantile(values, 50), p25: quantile(values, 25), p75: quantile(values, 75),
    first: values[0], last,
    rank: percentileRank(values, last),
    range: sorted[sorted.length - 1] - sorted[0],
  };
}

/**
 * تاریخچهٔ روزانهٔ فاصله.
 *
 * @param legs        پاهای ترکیب
 * @param seriesByIns سری روزانهٔ هر ابزار، به کلید `ins`
 * @param dates       روزهای معاملاتی، صعودی
 * @param basis       مبنای قیمت روزانه (CLOSE، LAST، …)
 * @param entry       ارزش خالصِ ورود، برای نسبتِ موقعیتی
 * @param expiry      تاریخ سررسید، برای «روز مانده» در هر نقطه
 */
export function dailyGapSeries({
  legs = [], seriesByIns = {}, dates = [], basis = 'CLOSE',
  strategyId = '', entry = NaN, expiry = NaN,
  scale = DEFAULT_SCALE, units = 1, baseIns = '',
} = {}) {
  const index = new Map();
  for (const leg of legs) {
    if (!leg || leg.kind === 'underlying') continue;
    const ins = String(leg.ins);
    if (index.has(ins)) continue;
    const rows = new Map((seriesByIns[ins] || []).map((row) => [normalizeHistoryDate(row.date), row]));
    index.set(ins, rows);
  }
  // سری خودِ دارایی پایه، برای «رفتار فاصله در برابر پایه».
  const baseRows = new Map((seriesByIns[String(baseIns)] || [])
    .map((row) => [normalizeHistoryDate(row.date), row]));
  const points = [];
  let missing = 0;
  const end = normalizeHistoryDate(expiry);
  for (const raw of dates) {
    const date = normalizeHistoryDate(raw);
    if (!date) continue;
    const prices = {};
    let complete = true;
    for (const [ins, rows] of index) {
      const price = historyPrice(rows.get(date), basis);
      if (!finite(price)) { complete = false; break; }
      prices[ins] = price;
    }
    if (!complete) { missing += 1; continue; }
    const daysLeft = end ? dayGap(date, end) : NaN;
    const gap = measureGap({ legs, prices, strategyId, entry, daysLeft, scale, units });
    if (!gap.ok) { missing += 1; continue; }
    // قیمت پایه در همان روز. نبودش نقطه را باطل نمی‌کند — فاصله بی آن هم
    // سنجیده می‌شود؛ فقط نمودارِ مقایسه با پایه آن نقطه را ندارد.
    const basePrice = historyPrice(baseRows.get(date), basis);
    points.push(toPoint(gap, {
      key: date, t: date, label: historyDateLabel(date), grain: 'day',
      basePrice: finite(basePrice) && basePrice > 0 ? basePrice : null,
    }));
  }
  return { points, missing, grain: 'day', scale, stats: seriesStats(points) };
}

/**
 * تاریخچهٔ درون‌روزیِ فاصله — یک روز، به دانهٔ یک تا شصت دقیقه.
 *
 * محدود به یک روز است و این محدودیت پنهان نمی‌شود: ریزمعاملهٔ هر ابزار
 * برای هر روز یک درخواست است، و ده روز در چهار پا یعنی چهل درخواست فقط
 * برای یک ترکیب. همان قاعده‌ای که `core/intraday-grid.mjs` از پیش دارد.
 */
export function intradayGapSeries({
  legs = [], tapeByIns = {}, date = 0, grain = 'm5',
  strategyId = '', entry = NaN, expiry = NaN,
  scale = DEFAULT_SCALE, units = 1, baseIns = '',
} = {}) {
  const id = normalizeGrain(grain);
  if (!isIntradayGrain(id)) return { points: [], missing: 0, grain: id, scale, stats: seriesStats([]) };
  const day = normalizeHistoryDate(date);
  const end = normalizeHistoryDate(expiry);
  const daysLeft = day && end ? dayGap(day, end) : NaN;
  const needed = [...new Set(legs.filter((leg) => leg && leg.kind !== 'underlying').map((leg) => String(leg.ins)))];
  const points = [];
  let missing = 0;
  for (const second of momentsFor(id)) {
    const marks = marksAt(tapeByIns, second);
    const prices = {};
    let complete = true;
    for (const ins of needed) {
      const price = num(marks[ins]?.price, NaN);
      if (!(price > 0)) { complete = false; break; }
      prices[ins] = price;
    }
    if (!complete) { missing += 1; continue; }
    const gap = measureGap({ legs, prices, strategyId, entry, daysLeft, scale, units });
    if (!gap.ok) { missing += 1; continue; }
    const basePrice = num(marks[String(baseIns)]?.price, NaN);
    points.push(toPoint(gap, {
      key: momentKey(day, second), t: second, second,
      label: momentLabel(second), grain: id,
      basePrice: finite(basePrice) && basePrice > 0 ? basePrice : null,
    }));
  }
  return { points, missing, grain: id, scale, day, stats: seriesStats(points) };
}

/**
 * تفاوتِ روز، تقویمی نه معاملاتی.
 *
 * سررسید یک تاریخ تقویمی است و روزِ مانده تا آن هم تقویمی. شمردنِ روز
 * معاملاتی اینجا، عددی می‌داد که با تاریخ سررسیدِ روی قرارداد نمی‌خواند.
 */
function dayGap(from, to) {
  const parse = (value) => Date.UTC(Math.trunc(value / 10000), (Math.trunc(value / 100) % 100) - 1, value % 100);
  return Math.round((parse(to) - parse(from)) / 86400000);
}

/** یک نقطهٔ نمودار از یک اندازه‌گیری. فقط میدان‌هایی که نمودار لازم دارد. */
function toPoint(gap, meta) {
  return {
    ...meta,
    current: gap.current, anchor: gap.anchor, anchored: gap.anchored,
    coveragePct: gap.coveragePct, roomPct: gap.roomPct,
    upsidePct: gap.upsidePct, filledPct: gap.filledPct,
    perDay: gap.perDay, side: gap.side, daysLeft: gap.daysLeft,
    // قیمتِ تک‌تکِ پاها همراه نقطه می‌ماند. بی این، «نمودار فاصله‌ای» —
    // دو خط و فضای میانشان — ساخته نمی‌شود و کاربر فقط حاصلِ تفریق را
    // می‌بیند نه دو عددی که از هم کم شده‌اند.
    legs: gap.perLeg.map((leg) => ({ ins: leg.ins, name: leg.name, side: leg.side, scaled: leg.scaled })),
  };
}

/**
 * خلاصهٔ «اکنون در برابر تاریخ» — همان یک نگاه که کاربر خواست.
 *
 * «فاصله در ۷۲ صدکِ تاریخِ خودش است» جمله‌ای است که بی نمودار هم تصمیم
 * می‌سازد: بالای صدک ۸۰ یعنی ساختار گران است و جا برای پر شدن کم.
 */
export function gapVerdict(series, gap) {
  const stats = series?.stats;
  if (!stats?.count || !gap?.ok) return { ok: false, why: 'تاریخچهٔ کافی برای مقایسه نیست', rank: NaN };
  // ── توزیعِ بی‌پراکندگی، حکمی ندارد ──────────────────────────────────
  //
  // وقتی همهٔ نقاط یک عددند، صدک هر مقداری بدهد بی‌معنی است:
  // `percentileRank` برای عددِ برابر، صد می‌دهد و صد یعنی «گران» — پس
  // ساختاری که اصلاً حرکت نکرده «گران» خوانده می‌شد. در اجرای آزمایشی
  // همین دیده شد و همان‌جا معلوم شد که ادعا از داده بزرگ‌تر است.
  if (!(stats.max > stats.min)) {
    return { ok: false, why: 'فاصله در کل این بازه ثابت مانده؛ توزیعی نیست که «اکنون» را در آن جا داد', rank: NaN, stats };
  }
  const rank = percentileRank(series.points.map((point) => point.current), gap.current);
  const tone = rank >= 80 ? 'گران' : rank <= 20 ? 'ارزان' : 'میانه';
  return {
    ok: true, rank, tone,
    vsMean: finite(stats.mean) && stats.mean !== 0 ? ((gap.current / stats.mean) - 1) * 100 : NaN,
    vsMin: finite(stats.min) && stats.min !== 0 ? ((gap.current / stats.min) - 1) * 100 : NaN,
    vsMax: finite(stats.max) && stats.max !== 0 ? ((gap.current / stats.max) - 1) * 100 : NaN,
    stats,
  };
}

// ═══════════════════════ تایم‌فریم ═══════════════════════
//
// «این فاصله در بازه‌های زمانی مختلف باید قابل نمایش باشد… در تایم‌فریم‌های
// مختلف… چه در بازه‌های زمانی گذشته چه حال.»
//
// بازه (از کِی تا کِی) را کنترل بازه می‌دهد و هر بازه‌ای — گذشته یا امروز
// — کار می‌کند. آنچه نبود، **دانه‌بندیِ بالاتر از روز** بود: روی یک سالِ
// معاملاتی، ۲۴۰ نقطهٔ روزانه روند را زیر نویز دفن می‌کند.
//
// چرا تجمیع و نه نمونه‌برداری: برداشتنِ «قیمتِ آخرین روزِ هر هفته» جهش‌های
// درون‌هفته را کاملاً گم می‌کند. سطلِ هفتگی هر چهار عدد را نگه می‌دارد —
// باز، بیشینه، کمینه، بسته — تا نمودار میله‌ای دامنه هم بتواند از همین
// ساخته شود.

export const GAP_TIMEFRAMES = [
  { id: 'day', label: 'روزانه', hint: 'یک نقطه برای هر روز معاملاتی' },
  { id: 'week', label: 'هفتگی', hint: 'سطل هفت‌روزه؛ برای بازه‌های چندماهه' },
  { id: 'month', label: 'ماهانه', hint: 'سطل جلالی؛ برای بازه‌های چندساله' },
];

const TIMEFRAME_IDS = new Set(GAP_TIMEFRAMES.map((row) => row.id));
export const normalizeTimeframe = (id) => (TIMEFRAME_IDS.has(String(id ?? '')) ? String(id) : 'day');

/**
 * کلیدِ سطل برای یک تاریخ هشت‌رقمی میلادی.
 *
 * ماه از تقویم **جلالی** گرفته می‌شود نه میلادی: کاربر بازه را جلالی
 * انتخاب می‌کند و برچسب‌ها جلالی‌اند؛ سطلِ میلادی وسطِ ماهِ جلالی می‌شکند
 * و «مهر» به دو ستون تقسیم می‌شود.
 */
function bucketOf(date, timeframe) {
  if (timeframe === 'week') {
    // شمارهٔ هفته از یک مبدأ ثابت. مبدأ اهمیتی ندارد، پیوستگی دارد.
    const at = Date.UTC(Math.trunc(date / 10000), (Math.trunc(date / 100) % 100) - 1, date % 100);
    return `w${Math.floor(at / (7 * 86400000))}`;
  }
  const [jy, jm] = gregorianToJalali(Math.trunc(date / 10000), Math.trunc(date / 100) % 100, date % 100);
  return `m${jy}-${String(jm).padStart(2, '0')}`;
}

/**
 * تجمیعِ نقاط روزانه به سطل‌های بزرگ‌تر.
 *
 * هر سطل چهار عددِ قیمتی نگه می‌دارد و برای بقیهٔ میدان‌ها مقدارِ **آخرین**
 * نقطهٔ سطل را می‌گیرد — نه میانگین. میانگینِ «روز تا سررسید» یا «درصد
 * پر شدن» عددی می‌سازد که در هیچ لحظه‌ای واقعاً وجود نداشته.
 */
export function resample(series, timeframe = 'day') {
  const id = normalizeTimeframe(timeframe);
  const points = series?.points || [];
  if (id === 'day' || points.length < 2) return { ...series, timeframe: 'day' };

  const buckets = new Map();
  for (const point of points) {
    const key = bucketOf(point.t, id);
    const bucket = buckets.get(key);
    if (!bucket) buckets.set(key, { key, first: point, last: point, lo: point, hi: point, count: 1 });
    else {
      bucket.last = point;
      bucket.count += 1;
      if (point.current < bucket.lo.current) bucket.lo = point;
      if (point.current > bucket.hi.current) bucket.hi = point;
    }
  }
  const out = [...buckets.values()].map((bucket) => ({
    ...bucket.last,
    key: bucket.key,
    label: bucket.last.label,
    open: bucket.first.current,
    close: bucket.last.current,
    low: bucket.lo.current,
    high: bucket.hi.current,
    days: bucket.count,
  }));
  return { ...series, points: out, timeframe: id, stats: seriesStats(out) };
}

// ═══════════════════ فاصله در برابر دارایی پایه ═══════════════════
//
// «رفتار این تفاوت یا جمع رو با دارایی پایه بسنج در نمودار.»
//
// دو عدد این را می‌گویند و هر دو لازم‌اند:
//
//   همبستگی   جهت و شدتِ رابطه. نزدیک ۱ یعنی فاصله با پایه بالا می‌رود،
//             نزدیک ۱− یعنی وارونه، نزدیک صفر یعنی رابطه‌ای نیست.
//   شیب       اندازهٔ رابطه: با هر یک ریال حرکتِ پایه، فاصله چند ریال.
//
// همبستگیِ تنها گمراه‌کننده است: همبستگیِ ۰٫۹ با شیبِ ۰٫۰۰۱ یعنی رابطه
// محکم است ولی عملاً بی‌اثر.

export function versusBase(series) {
  const rows = (series?.points || [])
    .filter((point) => finite(point.basePrice) && finite(point.current));
  if (rows.length < 3) {
    return { ok: false, why: 'برای سنجش رابطه با پایه دست‌کم سه نقطه با قیمت پایه لازم است', count: rows.length };
  }
  const xs = rows.map((row) => row.basePrice);
  const ys = rows.map((row) => row.current);
  const mx = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const my = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  const denom = Math.sqrt(sxx * syy);
  const r = denom > 0 ? sxy / denom : NaN;
  const slope = sxx > 0 ? sxy / sxx : NaN;
  return {
    ok: true, count: rows.length, r, slope,
    intercept: finite(slope) ? my - (slope * mx) : NaN,
    rows: rows.map((row) => ({ base: row.basePrice, gap: row.current, label: row.label })),
    tone: !finite(r) ? '—'
      : Math.abs(r) < 0.3 ? 'رابطهٔ ضعیف'
        : r > 0 ? 'هم‌جهت با پایه' : 'وارونهٔ پایه',
  };
}

/**
 * هر دو سری، نرمال‌شده به صد در نقطهٔ اول.
 *
 * فاصله به ریالِ قرارداد است و پایه به ریالِ سهم؛ روی یک محور، یکی از
 * دیگری چند مرتبه بزرگ‌تر است و خطِ کوچک‌تر صاف دیده می‌شود. نرمال‌کردن
 * هر دو را قابل مقایسه می‌کند و پرسشِ واقعی — «کدام بیشتر حرکت کرد» —
 * را جواب می‌دهد.
 */
export function indexedPair(series) {
  const points = (series?.points || []).filter((point) => finite(point.current));
  const firstGap = points.find((point) => point.current > 0)?.current;
  const firstBase = points.find((point) => finite(point.basePrice) && point.basePrice > 0)?.basePrice;
  return points.map((point) => ({
    label: point.label,
    gap: finite(firstGap) ? (point.current / firstGap) * 100 : null,
    base: finite(firstBase) && finite(point.basePrice) ? (point.basePrice / firstBase) * 100 : null,
  }));
}
