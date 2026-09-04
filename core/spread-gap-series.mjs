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
import { measureGap } from './spread-gap.mjs';

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
} = {}) {
  const index = new Map();
  for (const leg of legs) {
    if (!leg || leg.kind === 'underlying') continue;
    const ins = String(leg.ins);
    if (index.has(ins)) continue;
    const rows = new Map((seriesByIns[ins] || []).map((row) => [normalizeHistoryDate(row.date), row]));
    index.set(ins, rows);
  }
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
    const gap = measureGap({ legs, prices, strategyId, entry, daysLeft });
    if (!gap.ok) { missing += 1; continue; }
    points.push(toPoint(gap, { key: date, t: date, label: historyDateLabel(date), grain: 'day' }));
  }
  return { points, missing, grain: 'day', stats: seriesStats(points) };
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
} = {}) {
  const id = normalizeGrain(grain);
  if (!isIntradayGrain(id)) return { points: [], missing: 0, grain: id, stats: seriesStats([]) };
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
    const gap = measureGap({ legs, prices, strategyId, entry, daysLeft });
    if (!gap.ok) { missing += 1; continue; }
    points.push(toPoint(gap, {
      key: momentKey(day, second), t: second, second,
      label: momentLabel(second), grain: id,
    }));
  }
  return { points, missing, grain: id, stats: seriesStats(points) };
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
    current: gap.current, anchor: gap.anchor,
    coveragePct: gap.coveragePct, roomPct: gap.roomPct,
    upsidePct: gap.upsidePct, filledPct: gap.filledPct,
    perDay: gap.perDay, side: gap.side, daysLeft: gap.daysLeft,
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
