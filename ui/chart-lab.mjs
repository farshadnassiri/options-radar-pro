// آزمایشگاه نمودار — دیدن بازار از هر زاویه.
//
// چیدمان این تب از دسته‌بندی مشترک کتابخانه‌های نموداری امروز آمده. هفت
// دسته‌ای که nivo، Vega-Lite، Observable Plot، Highcharts، amCharts،
// Plotly و ApexCharts کم‌وبیش یکسان دارند:
//
//   مقایسه · سهم از کل · توزیع · رابطه · زمان · جریان و شبکه · انحراف
//
// هر دسته به سؤالی جواب می‌دهد که دسته‌های دیگر نمی‌دهند. میله می‌گوید
// «کدام بیشتر»، توزیع می‌گوید «چقدر قابل اتکا»، و جریان می‌گوید «از کجا
// به کجا». داشبوردی که فقط میله و خط دارد، پنج تا از این هفت سؤال را
// اصلاً نمی‌پرسد.
//
// قاعدهٔ مشترک: هر خانه شناسهٔ استراتژی‌اش را حمل می‌کند تا کلیک روی هر
// بخش، همان‌جا به جزئیاتش برود. ECharts در پارامتر کلیک فقط `data` را
// می‌دهد، پس شناسه روی خودِ خانه می‌نشیند نه روی سری.

import { fmt, faDigits } from './fmt.mjs';
import { chartFormat } from './chart-host.mjs';

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};
const pct = (value) => (finite(value) === null ? '—' : `${fmt.pct(value)}٪`);
const fa = (value) => faDigits(String(value ?? ''));
const tone = (t, value) => (finite(value) === null ? t.muted : value >= 0 ? t.gain : t.loss);
const pick = (t, index) => t.palette[index % t.palette.length];

/** استراتژی‌های نمره‌دار، همیشه به یک ترتیب. */
export const ranked = (analysis) => (analysis?.strategies || [])
  .filter((row) => finite(row.score) !== null)
  .slice()
  .sort((a, b) => b.score - a.score);

/** ترکیب‌های دارای مسیر معتبر. */
export const usable = (analysis) => (analysis?.combos || [])
  .filter((combo) => combo.series?.ok && finite(combo.series.finalPct) !== null);

/** گروه‌بندی هر چیزی بر پایهٔ یک کلید. */
export function groupBy(rows, key) {
  const out = new Map();
  for (const row of rows) {
    const name = row[key] || '—';
    if (!out.has(name)) out.set(name, []);
    out.get(name).push(row);
  }
  return out;
}

/** چارک نمونه‌های مرتب‌شده، به روش خطی. */
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at), high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

/** چگالی هسته‌ای گاوسی روی شبکه‌ای ثابت — پایهٔ ریج‌لاین و ویولن. */
export function density(values, grid) {
  const clean = values.filter((value) => finite(value) !== null);
  if (clean.length < 2) return grid.map(() => 0);
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const sd = Math.sqrt(clean.reduce((a, b) => a + (b - mean) ** 2, 0) / clean.length) || 1;
  // پهنای باند سیلورمن: بی آن، نمونهٔ کم یک قلهٔ تیز و بی‌معنا می‌دهد.
  const bw = 1.06 * sd * Math.pow(clean.length, -0.2) || 1;
  return grid.map((x) => clean.reduce((sum, value) =>
    sum + Math.exp(-0.5 * ((x - value) / bw) ** 2), 0) / (clean.length * bw * Math.sqrt(2 * Math.PI)));
}

/** شبکهٔ مشترک برای همهٔ توزیع‌ها تا با هم مقایسه‌پذیر بمانند. */
export function sharedGrid(values, steps = 48) {
  const clean = values.filter((value) => finite(value) !== null);
  if (clean.length < 2) return [];
  const low = Math.min(...clean), high = Math.max(...clean);
  const pad = (high - low) * 0.15 || 1;
  const from = low - pad, to = high + pad;
  return Array.from({ length: steps }, (_, index) => from + ((to - from) * index) / (steps - 1));
}

// ═══════════════════ ۱. مقایسه ═══════════════════

/** لالی‌پاپ نمره — کوتاه‌ترین راه به «کدام بهتر». */
export function scoreLollipopOption(analysis, tokens) {
  const rows = ranked(analysis).slice(0, 18).reverse();
  if (!rows.length) return null;
  return {
    grid: { left: 160, right: 44, top: 20, bottom: 44, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const row = rows[params[0]?.dataIndex ?? 0];
        return `<b>${fa(row.strategyName)}</b><br>خانواده: ${fa(row.groupName)}<br>`
          + `نمره: <b>${chartFormat.num(row.score)}</b><br>بازده: <b>${pct(row.metrics.return)}</b><br>`
          + `نرخ برد: <b>${pct(row.metrics.winPct)}</b><br>رتبه: <b>${fa(row.rank)}</b>`;
      } },
    xAxis: { type: 'value', max: 100, axisLabel: { color: tokens.muted, formatter: chartFormat.num },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: rows.map((row) => fa(row.strategyName)),
      axisLabel: { color: tokens.muted, width: 150, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [
      { type: 'bar', barMaxWidth: 3, silent: true,
        data: rows.map((row) => ({ value: row.score, strategyId: row.strategyId })),
        itemStyle: { color: tokens.line } },
      { type: 'scatter', symbolSize: 16,
        data: rows.map((row) => ({ value: row.score, strategyId: row.strategyId })),
        itemStyle: { color: (p) => pick(tokens, p.dataIndex), borderColor: tokens.panel, borderWidth: 2 } },
    ],
  };
}

/** دمبل: بازده نیمهٔ اول در برابر کل دوره. */
export function halfDumbbellOption(analysis, tokens) {
  const rows = ranked(analysis).slice(0, 14).map((row) => {
    const line = (row.path?.cumulative || []).filter((value) => finite(value) !== null);
    if (line.length < 2) return null;
    return { row, half: line[Math.floor(line.length / 2)], full: line[line.length - 1] };
  }).filter(Boolean);
  if (!rows.length) return null;
  return {
    legend: { top: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 160, right: 40, top: 44, bottom: 44, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const item = rows[params[0]?.dataIndex ?? 0];
        const shift = item.full - item.half;
        return `<b>${fa(item.row.strategyName)}</b><br>`
          + `نیمهٔ دوره: <b>${pct(item.half)}</b><br>پایان دوره: <b>${pct(item.full)}</b><br>`
          + `<i>${fa(shift >= 0 ? 'در نیمهٔ دوم جلو رفت' : 'در نیمهٔ دوم عقب نشست')} · ${pct(shift)}</i>`;
      } },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: rows.map((item) => fa(item.row.strategyName)),
      axisLabel: { color: tokens.muted, width: 150, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [
      { name: 'نیمهٔ دوره', type: 'bar', barGap: '-100%', barMaxWidth: 16,
        data: rows.map((item) => ({ value: item.half, strategyId: item.row.strategyId })),
        itemStyle: { color: tokens.panel2, borderColor: tokens.line, borderWidth: 1, borderRadius: 3 } },
      { name: 'پایان دوره', type: 'bar', barMaxWidth: 16,
        data: rows.map((item) => ({ value: item.full, strategyId: item.row.strategyId })),
        itemStyle: { color: (p) => tone(tokens, p.value), borderRadius: 3 } },
    ],
  };
}

/** میلهٔ گلوله‌ای: بازده هر استراتژی در برابر میانهٔ خانواده‌اش. */
export function bulletOption(analysis, tokens) {
  const rows = ranked(analysis).slice(0, 14);
  if (!rows.length) return null;
  const byGroup = groupBy(rows, 'groupName');
  const target = new Map([...byGroup].map(([name, members]) => {
    const values = members.map((row) => finite(row.metrics.return)).filter((v) => v !== null).sort((a, b) => a - b);
    return [name, quantile(values, 0.5)];
  }));
  return {
    grid: { left: 160, right: 40, top: 20, bottom: 44, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const row = rows[params[0]?.dataIndex ?? 0];
        const bar = target.get(row.groupName);
        return `<b>${fa(row.strategyName)}</b><br>بازده: <b>${pct(row.metrics.return)}</b><br>`
          + `میانهٔ خانوادهٔ «${fa(row.groupName)}»: <b>${pct(bar)}</b><br>`
          + `<i>${fa(finite(bar) !== null && row.metrics.return >= bar ? 'بالای میانهٔ خانواده' : 'زیر میانهٔ خانواده')}</i>`;
      } },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: rows.map((row) => fa(row.strategyName)),
      axisLabel: { color: tokens.muted, width: 150, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [
      { type: 'bar', barMaxWidth: 20,
        data: rows.map((row) => ({ value: row.metrics.return, strategyId: row.strategyId })),
        itemStyle: { color: (p) => tone(tokens, p.value), borderRadius: 3 } },
      // نشانهٔ هدف — همان چیزی که میلهٔ گلوله‌ای را از میلهٔ ساده جدا می‌کند.
      { type: 'scatter', symbol: 'rect', symbolSize: [3, 26],
        data: rows.map((row) => ({ value: target.get(row.groupName), strategyId: row.strategyId })),
        itemStyle: { color: tokens.ink } },
    ],
  };
}

/** میلهٔ شعاعی نمره — همان ترتیب، شکلی که چگالی بیشتری جا می‌دهد. */
export function radialScoreOption(analysis, tokens) {
  const rows = ranked(analysis).slice(0, 12);
  if (!rows.length) return null;
  return {
    polar: { radius: [32, '78%'] },
    angleAxis: { max: 100, startAngle: 90, axisLine: { lineStyle: { color: tokens.line } },
      axisLabel: { color: tokens.muted, formatter: chartFormat.num },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    radiusAxis: { type: 'category', data: rows.map((row) => fa(row.strategyName)),
      axisLabel: { color: tokens.muted, width: 120, overflow: 'truncate' },
      axisLine: { show: false }, axisTick: { show: false } },
    tooltip: { trigger: 'item',
      formatter: (params) => `<b>${fa(rows[params.dataIndex].strategyName)}</b><br>`
        + `نمره: <b>${chartFormat.num(params.value)}</b><br>`
        + `بازده: <b>${pct(rows[params.dataIndex].metrics.return)}</b>` },
    series: [{
      type: 'bar', coordinateSystem: 'polar', roundCap: true, barMaxWidth: 16,
      data: rows.map((row, index) => ({ value: row.score, strategyId: row.strategyId,
        itemStyle: { color: pick(tokens, index) } })),
    }],
  };
}

/** تصویرمیله: شمار ترکیب هر خانواده، با واحدهای شمردنی. */
export function countPictorialOption(analysis, tokens) {
  const rows = [...groupBy(usable(analysis), 'groupName')]
    .map(([name, members]) => ({ name, count: members.length,
      strategyId: members[0]?.strategyId ?? null }))
    .sort((a, b) => b.count - a.count);
  if (!rows.length) return null;
  return {
    grid: { left: 150, right: 40, top: 20, bottom: 44, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const row = rows[params[0]?.dataIndex ?? 0];
        const all = rows.reduce((sum, item) => sum + item.count, 0);
        return `<b>${fa(row.name)}</b><br>`
          + `${fa(row.count)} ترکیب معتبر<br><b>${pct((row.count / all) * 100)}</b> از همهٔ ترکیب‌ها`;
      } },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.int },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: rows.map((row) => fa(row.name)),
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [{
      type: 'pictorialBar', symbol: 'rect', symbolRepeat: true, symbolSize: [7, 18],
      symbolMargin: 3, symbolClip: false, barCategoryGap: '38%',
      data: rows.map((row, index) => ({ value: row.count, strategyId: row.strategyId,
        itemStyle: { color: pick(tokens, index) } })),
    }],
  };
}
