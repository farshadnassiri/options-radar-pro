// از تحلیل تا نمودار — سازندهٔ گزینه‌های ECharts.
//
// این فایل عمداً از DOM جداست: ورودی‌اش خروجی `analyzePortfolio` است و
// خروجی‌اش شیء گزینه. پس می‌شود بدون مرورگر سنجیدش، و رابط فقط کارِ
// سوارکردن را می‌کند.
//
// یک قاعده در همهٔ نمودارها: خانهٔ بی‌داده رسم نمی‌شود. `null` در سری
// ECharts یعنی «اینجا نقطه‌ای نیست» و خط را می‌شکند — دقیقاً همان چیزی که
// می‌خواهیم. صفرگذاشتن جای نبودِ داده، نمودار را به دروغ‌گو تبدیل می‌کند.

import { fmt, faDigits } from '/ui/fmt.mjs';
import { chartFormat } from '/ui/chart-host.mjs';
import { heatmapMeta } from '/core/portfolio-report.mjs';

export const PORTFOLIO_VIEW_VERSION = 1;

/** شش پله در هر جهت — به‌جای چهار پلهٔ قبلی، تا رنگ به عدد حساس‌تر باشد. */
export const HEAT_STEPS = 6;

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

/**
 * شدت رنگ یک عدد نسبت به بزرگ‌ترین قدر مطلق مجموعه.
 *
 * صفر پلهٔ خودش را دارد (`flat`، پلهٔ صفر) چون «سر به سر» یک مشاهده است نه
 * یک سود کوچک. نامعلوم هیچ پله‌ای نمی‌گیرد.
 */
export function heatLevel(value, scale) {
  const number = finite(value);
  const bound = finite(scale);
  if (number === null) return { level: null, tone: '' };
  if (number === 0) return { level: 0, tone: 'flat' };
  const tone = number > 0 ? 'gain' : 'loss';
  if (bound === null || !(bound > 0)) return { level: 1, tone };
  const share = Math.min(1, Math.abs(number) / bound);
  return { level: Math.max(1, Math.ceil(share * HEAT_STEPS)), tone };
}

/** بزرگ‌ترین قدر مطلقِ مجموعه — مقیاس رنگ. نامعلوم‌ها شمرده نمی‌شوند. */
export function heatScale(values) {
  const list = (Array.isArray(values) ? values : []).map(finite).filter((value) => value !== null);
  if (!list.length) return null;
  const bound = Math.max(...list.map(Math.abs));
  return bound > 0 ? bound : null;
}

const pctText = (value) => (finite(value) === null ? '—' : `${fmt.pct(value)}٪`);
const rankText = (value) => (finite(value) === null ? '—' : `رتبه ${fmt.int(value)}`);

/** مقدار یک خانهٔ نقشه در حالت خواسته‌شده. */
export function heatCell(path, column, mode) {
  if (!path) return null;
  if (mode === 'step') return finite(path.step?.[column]);
  if (mode === 'drawdown') return finite(path.drawdown?.[column]);
  if (mode === 'winPct') return finite(path.winPct?.[column]);
  if (mode === 'rank') return finite(path.rank?.[column]);
  return finite(path.cumulative?.[column]);
}

/**
 * نقشهٔ حرارتی — استراتژی در سطر، روز در ستون.
 *
 * رنگ پیوسته است نه پله‌ای: `visualMap` خودِ عدد را به رنگ می‌برد، پس دو
 * خانه با اختلاف کم، دو رنگ نزدیک می‌گیرند. پلهٔ گسسته این تفاوت را از بین
 * می‌برد و همان چیزی بود که کاربر خواست حساس‌تر شود.
 */
export const HEAT_SORTS = [
  { id: 'score', label: 'نمرهٔ ترکیبی', hint: 'همان ترتیب جدول رتبه‌بندی' },
  { id: 'return', label: 'بازده', hint: 'پرسودترین بالا' },
  { id: 'swing', label: 'پایداری رتبه', hint: 'کم‌نوسان‌ترین بالا؛ برای دیدن اینکه چه کسی سرِ جایش می‌ماند' },
  { id: 'similar', label: 'خوشهٔ شباهت', hint: 'استراتژی‌های هم‌مسیر کنار هم می‌نشینند؛ نوارهای هم‌رنگ یعنی تنوع دروغین' },
  { id: 'name', label: 'نام', hint: 'برای پیداکردن یک استراتژی مشخص' },
];
const SORT_IDS = new Set(HEAT_SORTS.map((row) => row.id));
export const normalizeHeatSort = (id) => (SORT_IDS.has(String(id ?? '')) ? String(id) : 'score');

export const HEAT_PALETTES = [
  { id: 'signed', label: 'سود و زیان', hint: 'سبز و قرمز؛ صفر در وسط' },
  { id: 'cool', label: 'سرد و گرم', hint: 'آبی تا نارنجی — برای کسی که سبز و قرمز را سخت تشخیص می‌دهد' },
  { id: 'mono', label: 'تک‌رنگ', hint: 'فقط شدت؛ علامت از خودِ عدد خوانده می‌شود' },
];
const PALETTE_IDS = new Set(HEAT_PALETTES.map((row) => row.id));
export const normalizeHeatPalette = (id) => (PALETTE_IDS.has(String(id ?? '')) ? String(id) : 'signed');

const paletteRange = (palette, tokens, reversed = false) => {
  const base = palette === 'cool' ? [tokens.series[2], tokens.panel2, tokens.series[1]]
    : palette === 'mono' ? [tokens.panel, tokens.panel2, tokens.accent]
      : [tokens.loss, tokens.panel2, tokens.gain];
  return reversed ? [...base].reverse() : base;
};

/**
 * ترتیب سطرهای نقشه.
 *
 * «خوشهٔ شباهت» ساده و صریح است: از بهترین شروع می‌کنیم و هر بار شبیه‌ترین
 * استراتژیِ باقی‌مانده را کنارش می‌گذاریم. خوشه‌بندی کاملِ سلسله‌مراتبی
 * دقیق‌تر است ولی برای بیست سطر، این کار را می‌کند و می‌شود در یک جمله
 * توضیحش داد — که خودش یک ویژگی است.
 */
export function sortStrategies(strategies, sort) {
  const rows = [...(strategies || [])];
  const mode = normalizeHeatSort(sort);
  if (mode === 'return') return rows.sort((a, b) => (b.metrics.return ?? -Infinity) - (a.metrics.return ?? -Infinity));
  if (mode === 'swing') return rows.sort((a, b) => (a.metrics.rankSwing ?? Infinity) - (b.metrics.rankSwing ?? Infinity));
  if (mode === 'name') return rows.sort((a, b) => String(a.strategyName).localeCompare(String(b.strategyName), 'fa'));
  if (mode !== 'similar') return rows.sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  const pool = rows.filter((row) => (row.path?.cumulative || []).some((value) => value !== null));
  const rest = rows.filter((row) => !pool.includes(row));
  if (pool.length < 3) return [...pool, ...rest];
  const ordered = [pool.shift()];
  while (pool.length) {
    const last = ordered.at(-1);
    let bestIndex = 0, bestScore = -Infinity;
    for (let index = 0; index < pool.length; index++) {
      const value = pearson(last.path.cumulative, pool[index].path.cumulative);
      const score = value === null ? -Infinity : value;
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    }
    ordered.push(pool.splice(bestIndex, 1)[0]);
  }
  return [...ordered, ...rest];
}

/** همبستگی پیرسون روی نقطه‌های هم‌زمان. نقطهٔ ناقص شمرده نمی‌شود. */
function pearson(a = [], b = []) {
  const pairs = [];
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const left = finite(a[index]), right = finite(b[index]);
    if (left !== null && right !== null) pairs.push([left, right]);
  }
  if (pairs.length < 3) return null;
  const meanA = pairs.reduce((sum, row) => sum + row[0], 0) / pairs.length;
  const meanB = pairs.reduce((sum, row) => sum + row[1], 0) / pairs.length;
  let top = 0, da = 0, db = 0;
  for (const [left, right] of pairs) {
    top += (left - meanA) * (right - meanB);
    da += (left - meanA) ** 2; db += (right - meanB) ** 2;
  }
  const bottom = Math.sqrt(da) * Math.sqrt(db);
  return bottom > 1e-12 ? top / bottom : null;
}

export function heatmapOption(analysis, mode, dateLabels, tokens, { sort = 'score', palette = 'signed' } = {}) {
  const meta = heatmapMeta(mode);
  const strategies = sortStrategies(analysis?.strategies || [], sort);
  const columns = analysis?.dates?.length || 0;
  if (!strategies.length || !columns) return null;

  const cells = [];
  const values = [];
  strategies.forEach((row, y) => {
    for (let x = 0; x < columns; x++) {
      const value = heatCell(row.path, x, mode);
      if (value === null) continue;
      cells.push([x, y, value]);
      values.push(value);
    }
  });
  if (!cells.length) return null;

  const signed = meta?.signed !== false && mode !== 'winPct' && mode !== 'rank';
  const bound = heatScale(values);
  const low = signed ? -(bound ?? 1) : Math.min(...values);
  const high = signed ? (bound ?? 1) : Math.max(...values);
  // رتبه وارونه است: عدد کوچک‌تر بهتر، پس رنگ «خوب» باید سمت کوچک بنشیند.
  const range = paletteRange(normalizeHeatPalette(palette), tokens, mode === 'rank');

  return {
    grid: { left: 8, right: 24, top: 12, bottom: 72, containLabel: true },
    tooltip: {
      formatter: (params) => {
        const [x, y, value] = params.value;
        const unit = mode === 'rank' ? rankText(value) : pctText(value);
        return `<b>${faDigits(strategies[y]?.strategyName || '')}</b><br>${faDigits(dateLabels[x] || '')}<br>${meta?.label || ''}: <b>${unit}</b>`;
      },
    },
    xAxis: {
      type: 'category', data: dateLabels.map(faDigits), splitArea: { show: false },
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: {
      type: 'category', data: strategies.map((row) => faDigits(row.strategyName)), inverse: true,
      axisLabel: { color: tokens.muted, width: 150, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    visualMap: {
      min: low, max: high, calculable: true, orient: 'horizontal',
      left: 'center', bottom: 8, itemWidth: 14, itemHeight: 160,
      textStyle: { color: tokens.muted },
      formatter: (value) => (mode === 'rank' ? chartFormat.int(value) : chartFormat.pct(value)),
      inRange: { color: range },
    },
    series: [{
      type: 'heatmap', data: cells, progressive: 2000,
      emphasis: { itemStyle: { borderColor: tokens.ink, borderWidth: 1 } },
      itemStyle: { borderColor: tokens.panel, borderWidth: 1 },
    }],
  };
}

/**
 * نمودار جابه‌جایی رتبه — همان «bump chart».
 *
 * خط رو به بالا یعنی رتبهٔ بهتر، پس محور وارونه است. برچسب پایانی، نام
 * استراتژی را کنار آخرین نقطه می‌گذارد تا خواندن نمودار به راهنمای کناری
 * وابسته نباشد.
 */
export function bumpOption(analysis, dateLabels, tokens) {
  const strategies = (analysis?.strategies || []).filter((row) => row.path?.rank?.some((value) => value !== null));
  if (strategies.length < 2 || (analysis?.dates?.length || 0) < 2) return null;
  const maxRank = Math.max(...strategies.flatMap((row) => row.path.rank.filter((value) => value !== null)));
  return {
    grid: { left: 56, right: 180, top: 24, bottom: 56, containLabel: true },
    tooltip: { trigger: 'item', formatter: (params) => `<b>${faDigits(params.seriesName)}</b><br>${faDigits(dateLabels[params.dataIndex] || '')}<br>${rankText(params.value)}` },
    xAxis: {
      type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: {
      type: 'value', inverse: true, min: 1, max: maxRank, interval: Math.max(1, Math.round(maxRank / 5)),
      axisLabel: { color: tokens.muted, formatter: chartFormat.int },
      splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    series: strategies.map((row) => ({
      name: row.strategyName, type: 'line', data: row.path.rank,
      smooth: true, symbolSize: 7, connectNulls: false,
      emphasis: { focus: 'series' },
      endLabel: { show: true, color: tokens.ink, formatter: (params) => faDigits(params.seriesName), distance: 8 },
      lineStyle: { width: 2 },
    })),
  };
}

/**
 * مسابقهٔ بازده — همان مسیر تجمعی، ولی متحرک.
 *
 * `line-race` در ECharts با انیمیشن سریِ نموداری ساخته می‌شود؛ هر سری با
 * تأخیرِ اندیس نقطه رسم می‌شود تا خط‌ها با هم جلو بروند و کاربر ببیند
 * کدام استراتژی کِی از بقیه جدا شد.
 */
export function raceOption(analysis, dateLabels, tokens, { pick = [] } = {}) {
  const all = analysis?.strategies || [];
  const chosen = pick.length ? all.filter((row) => pick.includes(row.strategyId)) : all.slice(0, 8);
  if (!chosen.length || (analysis?.dates?.length || 0) < 2) return null;
  const basisLabel = analysis?.basis?.label || '';
  return {
    animationDuration: 1400,
    animationEasing: 'quarticOut',
    grid: { left: 64, right: 170, top: 24, bottom: 56, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => `<b>${faDigits(dateLabels[rows[0]?.dataIndex] || '')}</b><br>`
        + rows.filter((row) => row.value !== null && row.value !== undefined)
          .sort((a, b) => b.value - a.value)
          .map((row) => `${row.marker} ${faDigits(row.seriesName)} <b>${pctText(row.value)}</b>`).join('<br>'),
    },
    xAxis: {
      type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: {
      type: 'value', name: `بازده روی ${basisLabel}`, nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    series: chosen.map((row) => ({
      name: row.strategyName, type: 'line', data: row.path.cumulative,
      smooth: true, showSymbol: false, connectNulls: false,
      emphasis: { focus: 'series' },
      endLabel: { show: true, color: tokens.ink, distance: 8, formatter: (params) => faDigits(params.seriesName) },
      lineStyle: { width: 2 },
      // تأخیر به‌ازای اندیس: خط‌ها با هم از چپ به راست جلو می‌روند.
      animationDelay: (index) => index * 12,
    })),
  };
}

/**
 * روند یک یا چند استراتژی، در کنار مسیر خودِ نماد پایه.
 *
 * مقایسه با نماد پایه عمداً همیشه هست: «۱۲٪ سود» وقتی خود سهم ۲۰٪ بالا
 * رفته، سود نیست.
 */
export function trendOption(analysis, dateLabels, tokens, { pick = [], showBase = true, area = false } = {}) {
  const all = analysis?.strategies || [];
  const chosen = pick.length ? all.filter((row) => pick.includes(row.strategyId)) : all.slice(0, 5);
  if (!chosen.length) return null;
  const series = chosen.map((row) => ({
    name: row.strategyName, type: 'line', data: row.path.cumulative,
    smooth: true, showSymbol: false, connectNulls: false,
    emphasis: { focus: 'series' },
    lineStyle: { width: 2 },
    ...(area ? { areaStyle: { opacity: 0.12 } } : {}),
  }));
  if (showBase && Array.isArray(analysis?.baseSeries)) {
    series.push({
      name: 'خود نماد پایه', type: 'line', data: analysis.baseSeries,
      smooth: true, showSymbol: false, connectNulls: false,
      lineStyle: { width: 2, type: 'dashed', color: tokens.muted },
      itemStyle: { color: tokens.muted },
    });
  }
  return {
    legend: { top: 0, textStyle: { color: tokens.muted }, formatter: faDigits, type: 'scroll' },
    grid: { left: 64, right: 28, top: 44, bottom: 68, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => `<b>${faDigits(dateLabels[rows[0]?.dataIndex] || '')}</b><br>`
        + rows.map((row) => `${row.marker} ${faDigits(row.seriesName)} <b>${pctText(row.value)}</b>`).join('<br>'),
    },
    dataZoom: [
      { type: 'inside', throttle: 50 },
      { type: 'slider', height: 18, bottom: 8, borderColor: tokens.line, textStyle: { color: tokens.muted } },
    ],
    xAxis: {
      type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: {
      type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    series,
  };
}

/**
 * درخت‌نقشه: خانواده ← نوع استراتژی. اندازه از ارزش معامله، رنگ از بازده.
 *
 * همان «از کل به جزء» است، در یک نگاه: مستطیل بزرگ یعنی پول آنجاست، سبز
 * یعنی سود داد.
 */
export function treemapOption(analysis, tokens) {
  const groups = analysis?.groups || [];
  if (!groups.length) return null;
  const byGroup = new Map(groups.map((row) => [String(row.groupId ?? ''), []]));
  for (const strategy of analysis?.strategies || []) {
    byGroup.get(String(strategy.groupId ?? ''))?.push(strategy);
  }
  const data = groups.map((group) => ({
    name: group.groupName,
    value: Math.max(1, group.samples),
    itemStyle: { borderColor: tokens.panel },
    children: (byGroup.get(String(group.groupId ?? '')) || []).map((strategy) => ({
      name: strategy.strategyName,
      value: Math.max(1, strategy.samples),
      strategyId: strategy.strategyId,
      metric: strategy.metrics.return,
      itemStyle: { color: strategy.metrics.return === null ? tokens.panel2
        : strategy.metrics.return > 0 ? tokens.gain : strategy.metrics.return < 0 ? tokens.loss : tokens.panel2,
      opacity: strategy.metrics.return === null ? 0.5
        : Math.min(1, 0.35 + (Math.abs(strategy.metrics.return) / Math.max(1e-9, heatScale((analysis.strategies || []).map((row) => row.metrics.return)) ?? 1)) * 0.65) },
    })),
  }));
  return {
    tooltip: {
      formatter: (params) => `<b>${faDigits(params.name)}</b><br>ترکیب: ${chartFormat.int(params.value)}`
        + (params.data?.metric === undefined ? '' : `<br>بازده: <b>${pctText(params.data.metric)}</b>`),
    },
    series: [{
      type: 'treemap', data, roam: false, nodeClick: false,
      leafDepth: 2, width: '100%', height: '100%',
      breadcrumb: { show: true, bottom: 0, itemStyle: { color: tokens.panel2, textStyle: { color: tokens.ink } } },
      label: { formatter: (params) => faDigits(params.name), color: tokens.panel, fontWeight: 600 },
      upperLabel: { show: true, height: 24, color: tokens.ink, formatter: (params) => faDigits(params.name) },
      itemStyle: { borderColor: tokens.panel, borderWidth: 2, gapWidth: 2 },
      levels: [
        { itemStyle: { borderWidth: 3, gapWidth: 3, borderColor: tokens.panel } },
        { itemStyle: { borderWidth: 1, gapWidth: 1, borderColor: tokens.panel } },
      ],
    }],
  };
}

/**
 * مختصات موازی: هر استراتژی یک خط که از همهٔ سنجه‌ها رد می‌شود.
 *
 * سنجه‌هایی که «پایین‌تر بهتر»اند وارونه نمایش داده می‌شوند تا در همهٔ
 * محورها بالا یعنی بهتر — وگرنه خط شکسته چیزی نمی‌گوید.
 */
export function parallelOption(analysis, metrics, tokens) {
  const strategies = analysis?.strategies || [];
  const list = (metrics || []).filter((metric) => strategies.some((row) => finite(row.metrics[metric.id]) !== null));
  if (strategies.length < 2 || list.length < 2) return null;
  return {
    parallelAxis: list.map((metric, index) => ({
      dim: index, name: metric.label, inverse: metric.better === 'low',
      nameTextStyle: { color: tokens.ink }, axisLabel: { color: tokens.muted, formatter: chartFormat.num },
      axisLine: { lineStyle: { color: tokens.line } },
    })),
    parallel: {
      left: 48, right: 48, top: 64, bottom: 24,
      parallelAxisDefault: { nameLocation: 'start', nameGap: 22 },
    },
    tooltip: { formatter: (params) => `<b>${faDigits(params.name)}</b>` },
    series: [{
      type: 'parallel', smooth: true,
      lineStyle: { width: 2, opacity: 0.55 },
      emphasis: { lineStyle: { width: 3, opacity: 1 } },
      data: strategies.map((row) => ({
        name: row.strategyName,
        value: list.map((metric) => finite(row.metrics[metric.id])),
      })),
    }],
  };
}

/** توزیع بازده پایان بازه روی همهٔ ترکیب‌ها. */
export function histogramOption(analysis, tokens, { bins = 24 } = {}) {
  const values = (analysis?.combos || [])
    .map((combo) => finite(combo.series.finalPct))
    .filter((value) => value !== null);
  if (values.length < 3) return null;
  const low = Math.min(...values), high = Math.max(...values);
  const span = high - low;
  const width = span > 0 ? span / bins : 1;
  const counts = new Array(bins).fill(0);
  for (const value of values) {
    const index = span > 0 ? Math.min(bins - 1, Math.floor((value - low) / width)) : 0;
    counts[index] += 1;
  }
  const centres = counts.map((_, index) => low + (width * (index + 0.5)));
  return {
    grid: { left: 56, right: 24, top: 24, bottom: 56, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => `بازده حدود ${pctText(centres[rows[0].dataIndex])}<br><b>${chartFormat.int(rows[0].value)}</b> ترکیب`,
    },
    xAxis: {
      type: 'category', data: centres.map((value) => chartFormat.pct(value)),
      axisLabel: { color: tokens.muted, hideOverlap: true, rotate: 45 },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: {
      type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.int },
      splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    series: [{
      type: 'bar', data: counts, barCategoryGap: '12%',
      itemStyle: {
        color: (params) => (centres[params.dataIndex] > 0 ? tokens.gain : centres[params.dataIndex] < 0 ? tokens.loss : tokens.muted),
        borderRadius: [4, 4, 0, 0],
      },
    }],
  };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at), high = Math.ceil(at);
  return sorted[low] + ((sorted[high] - sorted[low]) * (at - low));
};

/** جعبه‌ای: پراکندگی بازده ترکیب‌ها، به تفکیک استراتژی. */
export function boxOption(analysis, tokens, { limit = 14 } = {}) {
  const strategies = (analysis?.strategies || []).slice(0, limit);
  const boxes = [];
  const names = [];
  for (const row of strategies) {
    const values = (analysis.combos || [])
      .filter((combo) => combo.strategyId === row.strategyId)
      .map((combo) => finite(combo.series.finalPct))
      .filter((value) => value !== null)
      .sort((a, b) => a - b);
    if (values.length < 3) continue;
    names.push(row.strategyName);
    boxes.push([values[0], quantile(values, 0.25), quantile(values, 0.5), quantile(values, 0.75), values.at(-1)]);
  }
  if (!boxes.length) return null;
  return {
    grid: { left: 56, right: 24, top: 24, bottom: 96, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (params) => `<b>${faDigits(params.name)}</b><br>`
        + ['کمینه', 'چارک پایین', 'میانه', 'چارک بالا', 'بیشینه']
          .map((label, index) => `${label}: <b>${pctText(params.value[index + 1])}</b>`).join('<br>'),
    },
    xAxis: {
      type: 'category', data: names.map(faDigits),
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true, width: 110, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: {
      type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    series: [{
      type: 'boxplot', data: boxes,
      itemStyle: { color: tokens.panel2, borderColor: tokens.accent },
      emphasis: { itemStyle: { borderColor: tokens.ink } },
    }],
  };
}

/**
 * پراکندگی سود در برابر درد: بازده روی محور عمودی، بیشترین افت روی افقی.
 *
 * گوشهٔ بالا-راست (افت کم، بازده زیاد) همان چیزی است که دنبالش می‌گردیم؛
 * این نمودار آن را در یک نگاه نشان می‌دهد.
 */
export function scatterOption(analysis, tokens) {
  const points = (analysis?.strategies || [])
    .map((row) => ({
      name: row.strategyName, id: row.strategyId,
      x: finite(row.metrics.drawdown), y: finite(row.metrics.return),
      size: row.samples,
    }))
    .filter((row) => row.x !== null && row.y !== null);
  if (points.length < 2) return null;
  const maxSamples = Math.max(...points.map((row) => row.size));
  return {
    grid: { left: 64, right: 32, top: 32, bottom: 64, containLabel: true },
    tooltip: {
      formatter: (params) => `<b>${faDigits(params.data.name)}</b><br>بازده: <b>${pctText(params.data.value[1])}</b>`
        + `<br>بیشترین افت: <b>${pctText(params.data.value[0])}</b><br>ترکیب: ${chartFormat.int(params.data.size)}`,
    },
    xAxis: {
      type: 'value', name: 'بیشترین افت مسیر', nameLocation: 'middle', nameGap: 34,
      nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    yAxis: {
      type: 'value', name: 'بازده', nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    series: [{
      type: 'scatter',
      data: points.map((row) => ({ name: row.name, id: row.id, size: row.size, value: [row.x, row.y] })),
      symbolSize: (value, params) => 10 + ((params.data.size / Math.max(1, maxSamples)) * 26),
      itemStyle: {
        color: (params) => (params.data.value[1] > 0 ? tokens.gain : params.data.value[1] < 0 ? tokens.loss : tokens.muted),
        opacity: 0.75, borderColor: tokens.panel,
      },
      emphasis: { itemStyle: { opacity: 1, borderWidth: 2, borderColor: tokens.ink } },
      label: {
        show: true, position: 'top', color: tokens.muted,
        formatter: (params) => faDigits(params.data.name),
      },
    }],
  };
}

/**
 * درخت کاوش: خانواده ← نوع ← استراتژی.
 *
 * همان ترتیبی که کاربر خواست — از کل به جزء — ولی به‌جای چند جدول پشت سر
 * هم، یک ساختار که جای هر چیز را در کل نشان می‌دهد.
 */
export function treeOption(analysis, tokens) {
  const groups = analysis?.groups || [];
  if (!groups.length) return null;
  const byGroup = new Map(groups.map((row) => [String(row.groupId ?? ''), []]));
  for (const strategy of analysis?.strategies || []) {
    byGroup.get(String(strategy.groupId ?? ''))?.push(strategy);
  }
  const toneOf = (value) => (value === null ? tokens.muted : value > 0 ? tokens.gain : value < 0 ? tokens.loss : tokens.muted);
  return {
    tooltip: {
      formatter: (params) => `<b>${faDigits(params.name)}</b>`
        + (params.data?.metric === undefined ? '' : `<br>بازده: <b>${pctText(params.data.metric)}</b>`)
        + (params.data?.samples === undefined ? '' : `<br>ترکیب: ${chartFormat.int(params.data.samples)}`),
    },
    series: [{
      type: 'tree', orient: 'RL', layout: 'orthogonal',
      left: '22%', right: '6%', top: '2%', bottom: '2%',
      symbolSize: 9, roam: true, initialTreeDepth: 2,
      expandAndCollapse: true, animationDuration: 420,
      label: { position: 'left', align: 'right', color: tokens.ink, formatter: (params) => faDigits(params.name) },
      leaves: { label: { position: 'right', align: 'left' } },
      lineStyle: { color: tokens.line, width: 1.4, curveness: 0.35 },
      emphasis: { focus: 'descendant' },
      data: [{
        name: 'همهٔ استراتژی‌ها',
        children: groups.map((group) => ({
          name: group.groupName, samples: group.samples, metric: group.returnStat,
          itemStyle: { color: toneOf(group.returnStat) },
          children: (byGroup.get(String(group.groupId ?? '')) || []).map((strategy) => ({
            name: strategy.strategyName, strategyId: strategy.strategyId,
            samples: strategy.samples, metric: strategy.metrics.return,
            itemStyle: { color: toneOf(strategy.metrics.return) },
          })),
        })),
      }],
    }],
  };
}

/** `20260801` → `2026-08-01`؛ تقویم ECharts تاریخ میلادی می‌خواهد. */
export function isoDate(value) {
  const number = finite(value);
  if (number === null || number < 10000101) return null;
  const text = String(Math.trunc(number));
  if (text.length !== 8) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

/**
 * تقویم روزانه: هر خانه یک روز معاملاتی، رنگش بازدهِ همان روز.
 *
 * برای دیدن الگوی زمانی — «همیشه اول هفته بد بود» یا «افت در سه روز پشت
 * هم افتاد» — چیزی جای تقویم را نمی‌گیرد.
 */
export function calendarOption(analysis, tokens, { strategyId = '', mode = 'step' } = {}) {
  const dates = analysis?.dates || [];
  if (!dates.length) return null;
  const row = strategyId
    ? (analysis.strategies || []).find((item) => item.strategyId === strategyId)
    : null;
  const cells = [];
  for (let column = 0; column < dates.length; column++) {
    const iso = isoDate(dates[column]);
    if (!iso) continue;
    const value = row
      ? heatCell(row.path, column, mode)
      : medianAcross(analysis.strategies || [], column, mode);
    if (value === null) continue;
    cells.push([iso, value]);
  }
  if (!cells.length) return null;
  const bound = heatScale(cells.map((cell) => cell[1])) ?? 1;
  const years = [...new Set(cells.map((cell) => cell[0].slice(0, 4)))];
  const label = row ? row.strategyName : 'میانهٔ همهٔ استراتژی‌ها';
  return {
    tooltip: {
      formatter: (params) => `<b>${faDigits(label)}</b><br>${faDigits(params.value[0])}<br>${pctText(params.value[1])}`,
    },
    visualMap: {
      min: -bound, max: bound, calculable: true, orient: 'horizontal',
      left: 'center', bottom: 4, itemWidth: 12, itemHeight: 140,
      textStyle: { color: tokens.muted }, formatter: chartFormat.pct,
      inRange: { color: [tokens.loss, tokens.panel2, tokens.gain] },
    },
    calendar: years.map((year, index) => ({
      top: 48 + (index * 132), left: 56, right: 24, cellSize: ['auto', 18], range: year,
      itemStyle: { color: tokens.panel, borderColor: tokens.line, borderWidth: 1 },
      splitLine: { lineStyle: { color: tokens.line } },
      yearLabel: { show: true, color: tokens.ink, formatter: (params) => faDigits(params.nameMap) },
      dayLabel: { color: tokens.muted, nameMap: ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'] },
      monthLabel: { color: tokens.muted },
    })),
    series: years.map((year, index) => ({
      type: 'heatmap', coordinateSystem: 'calendar', calendarIndex: index,
      data: cells.filter((cell) => cell[0].startsWith(year)),
    })),
  };
}

/** میانهٔ یک ستون روی همهٔ استراتژی‌ها — برای نمای سبدیِ تقویم. */
function medianAcross(strategies, column, mode) {
  const values = strategies
    .map((row) => heatCell(row.path, column, mode))
    .filter((value) => value !== null)
    .sort((a, b) => a - b);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

/**
 * جریان سرمایه: از سرمایهٔ اول دوره، به هر استراتژی، تا ارزش پایان دوره.
 *
 * جمعِ ورودی و خروجی هر گره برابر است، پس نمودار خودش یک بازرسی است: اگر
 * جایی پول گم شود، در همین شکل دیده می‌شود. سهمی که ارزش پایانی‌اش صفر یا
 * منفی شده باشد، برچسب می‌خورد — چون سنکی جریان منفی نمی‌کشد و نبودِ
 * برچسب یعنی پنهان‌کردن بدترین حالت.
 */
export function sankeyOption(basket, tokens) {
  const funded = (basket?.legs || []).filter((leg) => leg.ok);
  if (!funded.length) return null;
  const capitalName = 'سرمایهٔ اول دوره';
  const endName = 'ارزش پایان دوره';
  const nodes = [{ name: capitalName }, { name: endName }];
  const links = [];
  const wiped = [];
  for (const leg of funded) {
    const name = `${leg.strategyName} · ${fmt.int(leg.lots)} دست`;
    nodes.push({ name });
    links.push({ source: capitalName, target: name, value: leg.deployedRial });
    const ending = leg.finalPnlRial === null ? null : leg.deployedRial + leg.finalPnlRial;
    if (ending === null) continue;
    if (ending > 0) links.push({ source: name, target: endName, value: ending });
    else wiped.push(leg.strategyName);
  }
  if (basket.idleRial > 0) {
    nodes.push({ name: 'نقد تخصیص‌نیافته' });
    links.push({ source: capitalName, target: 'نقد تخصیص‌نیافته', value: basket.idleRial });
    links.push({ source: 'نقد تخصیص‌نیافته', target: endName, value: basket.idleRial });
  }
  if (!links.length) return null;
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params) => (params.dataType === 'edge'
        ? `${faDigits(params.data.source)} ← ${faDigits(params.data.target)}<br><b>${chartFormat.money(params.data.value)}</b>`
        : `<b>${faDigits(params.name)}</b><br>${chartFormat.money(params.value)}`),
    },
    series: [{
      type: 'sankey', nodeAlign: 'left', right: 140, left: 24, top: 24, bottom: 24,
      emphasis: { focus: 'adjacency' },
      nodeGap: 12, nodeWidth: 16,
      label: { color: tokens.ink, formatter: (params) => faDigits(params.name) },
      lineStyle: { color: 'gradient', opacity: 0.42, curveness: 0.5 },
      data: nodes, links,
      // برچسبِ سهم‌های سوخته، بیرون از نمودار در همان کارت نوشته می‌شود؛
      // اینجا فقط نگهش می‌داریم تا رابط بتواند بخواندش.
      wiped,
    }],
  };
}

/** منحنی ارزش سبد و افت آن، روی یک محور زمان مشترک. */
export function equityOption(basket, dateLabels, tokens) {
  const path = basket?.path || [];
  if (!path.some((point) => point.equityRial !== null)) return null;
  const equity = path.map((point) => point.equityRial);
  const capital = basket.capitalRial;
  let peak = capital;
  const drawdown = path.map((point) => {
    if (point.equityRial === null) return null;
    peak = Math.max(peak, point.equityRial);
    return peak > 0 ? ((point.equityRial - peak) / peak) * 100 : null;
  });
  return {
    legend: { top: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: [
      { left: 76, right: 76, top: 44, height: '52%', containLabel: true },
      { left: 76, right: 76, bottom: 48, height: '20%', containLabel: true },
    ],
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => `<b>${faDigits(dateLabels[rows[0]?.dataIndex] || '')}</b><br>`
        + rows.map((row) => `${row.marker} ${faDigits(row.seriesName)} <b>${
          row.seriesName === 'افت از سقف' ? pctText(row.value) : chartFormat.money(row.value)}</b>`).join('<br>'),
    },
    xAxis: [
      { type: 'category', gridIndex: 0, data: dateLabels.map(faDigits), boundaryGap: false,
        axisLabel: { show: false }, axisLine: { lineStyle: { color: tokens.line } } },
      { type: 'category', gridIndex: 1, data: dateLabels.map(faDigits), boundaryGap: false,
        axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
        axisLine: { lineStyle: { color: tokens.line } } },
    ],
    yAxis: [
      { type: 'value', gridIndex: 0, scale: true, axisLabel: { color: tokens.muted, formatter: chartFormat.money },
        splitLine: { lineStyle: { color: tokens.lineSoft } } },
      { type: 'value', gridIndex: 1, max: 0, axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
        splitLine: { lineStyle: { color: tokens.lineSoft } } },
    ],
    series: [
      {
        name: 'ارزش سبد', type: 'line', data: equity, smooth: true, showSymbol: false, connectNulls: false,
        lineStyle: { width: 2.4, color: tokens.accent }, itemStyle: { color: tokens.accent },
        areaStyle: { opacity: 0.10, color: tokens.accent },
        markLine: {
          symbol: 'none', silent: true,
          data: [{ yAxis: capital, label: { formatter: 'سرمایهٔ اول دوره', color: tokens.muted, position: 'insideEndTop' } }],
          lineStyle: { color: tokens.muted, type: 'dashed' },
        },
      },
      {
        name: 'افت از سقف', type: 'line', xAxisIndex: 1, yAxisIndex: 1, data: drawdown,
        smooth: true, showSymbol: false, connectNulls: false,
        lineStyle: { width: 1.6, color: tokens.loss }, itemStyle: { color: tokens.loss },
        areaStyle: { opacity: 0.16, color: tokens.loss },
      },
    ],
  };
}

/**
 * نقشهٔ افق × استراتژی: «اگر بعد از n روز می‌بستیم، هر استراتژی کجا بود؟»
 *
 * چون همهٔ ترکیب‌ها یک روز ورود دارند، «نگهداری n روز» دقیقاً همان ستون n
 * است — پس این نقشه از همان ماتریس درمی‌آید و بازپخش تازه نمی‌خواهد.
 *
 * ستونی که سرتاسر سبز است یعنی آن افق برای همه خوب بوده، نه فقط برای یکی؛
 * و آن، حرفی است که نقشهٔ روزانه نمی‌زند.
 */
export function horizonHeatOption(analysis, tokens, { sort = 'score', palette = 'signed' } = {}) {
  const strategies = sortStrategies(analysis?.strategies || [], sort);
  const columns = analysis?.dates?.length || 0;
  if (!strategies.length || columns < 2) return null;
  const cells = [];
  const values = [];
  strategies.forEach((row, y) => {
    for (let x = 0; x < columns; x++) {
      const value = finite(row.path?.cumulative?.[x]);
      if (value === null) continue;
      cells.push([x, y, value]);
      values.push(value);
    }
  });
  if (!cells.length) return null;
  const bound = heatScale(values) ?? 1;
  return {
    grid: { left: 8, right: 24, top: 12, bottom: 76, containLabel: true },
    tooltip: {
      formatter: (params) => {
        const [x, y, value] = params.value;
        return `<b>${faDigits(strategies[y]?.strategyName || '')}</b>`
          + `<br>نگهداری ${fmt.int(x)} روز — تا ${faDigits(String(analysis.dates[x] ?? ''))}`
          + `<br>بازده: <b>${pctText(value)}</b>`;
      },
    },
    xAxis: {
      type: 'category', data: Array.from({ length: columns }, (_, index) => fmt.int(index)),
      name: 'روز نگهداری', nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, hideOverlap: true }, axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: {
      type: 'category', data: strategies.map((row) => faDigits(row.strategyName)), inverse: true,
      axisLabel: { color: tokens.muted, width: 150, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    visualMap: {
      min: -bound, max: bound, calculable: true, orient: 'horizontal', left: 'center', bottom: 6,
      itemWidth: 12, itemHeight: 150, textStyle: { color: tokens.muted }, formatter: chartFormat.pct,
      inRange: { color: paletteRange(normalizeHeatPalette(palette), tokens) },
    },
    series: [{
      type: 'heatmap', data: cells, progressive: 2000,
      itemStyle: { borderColor: tokens.panel, borderWidth: 1 },
      emphasis: { itemStyle: { borderColor: tokens.ink, borderWidth: 1.5 } },
    }],
  };
}
