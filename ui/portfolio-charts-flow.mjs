// نمودارهای روند، پراکندگی و سنجه — نیمهٔ دوم کتابخانه.
//
// تقسیم‌بندی عمدی است: `portfolio-charts-parts.mjs` می‌گوید «چه چیزی از چه
// چیزی تشکیل شده»، این فایل می‌گوید «در طول زمان چه شد» و «نتیجه چقدر
// پخش بود». یک فایل هزارخطی هر دو را می‌گفت و هیچ‌کدام را پیدا نمی‌کردی.

import { fmt, faDigits } from '/ui/fmt.mjs';
import { chartFormat } from '/ui/chart-host.mjs';
import { shareLine } from '/ui/portfolio-charts-parts.mjs';

export const PORTFOLIO_FLOW_VERSION = 1;

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};
const pctText = (value) => (finite(value) === null ? '—' : `${fmt.pct(value)}٪`);
const known = (list) => (Array.isArray(list) ? list : []).map(finite).filter((value) => value !== null);

const quantileOf = (sorted, q) => {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at), high = Math.ceil(at);
  return sorted[low] + ((sorted[high] - sorted[low]) * (at - low));
};

/**
 * نوار چارک‌ها: میانه در وسط، و باند چارک پایین تا بالا دورش.
 *
 * تک‌خطِ میانه می‌گوید «معمولاً چه شد»؛ باند می‌گوید «چقدر می‌توانست فرق
 * کند». بدون باند، مسیرِ میانه به‌غلط قطعی به نظر می‌رسد.
 */
export function quartileBandOption(analysis, dateLabels, tokens, { strategyId = '' } = {}) {
  const columns = analysis?.dates?.length || 0;
  if (!columns) return null;
  const pool = (analysis.combos || []).filter((combo) => combo.series.ok
    && (!strategyId || combo.strategyId === strategyId));
  if (pool.length < 3) return null;
  const low = [], mid = [], span = [];
  for (let column = 0; column < columns; column++) {
    const values = known(pool.map((combo) => combo.series.pct[column])).sort((a, b) => a - b);
    if (!values.length) { low.push(null); mid.push(null); span.push(null); continue; }
    const p25 = quantileOf(values, 0.25), p75 = quantileOf(values, 0.75);
    low.push(p25);
    span.push(p75 - p25);
    mid.push(quantileOf(values, 0.5));
  }
  const label = strategyId
    ? (analysis.strategies.find((row) => row.strategyId === strategyId)?.strategyName || '')
    : 'همهٔ ترکیب‌ها';
  return {
    grid: { left: 64, right: 28, top: 36, bottom: 64, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => {
        const index = rows[0]?.dataIndex ?? 0;
        return `<b>${faDigits(dateLabels[index] || '')}</b><br>میانه: <b>${pctText(mid[index])}</b>`
          + `<br>چارک پایین: ${pctText(low[index])}<br>چارک بالا: ${pctText(low[index] === null || span[index] === null ? null : low[index] + span[index])}`;
      },
    },
    xAxis: {
      type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true }, axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [
      { name: 'کف باند', type: 'line', data: low, stack: 'band', lineStyle: { opacity: 0 }, showSymbol: false, silent: true },
      {
        name: `پهنای چارک‌ها — ${label}`, type: 'line', data: span, stack: 'band',
        lineStyle: { opacity: 0 }, showSymbol: false, silent: true,
        areaStyle: { color: tokens.accent, opacity: 0.16 },
      },
      {
        name: `میانهٔ ${label}`, type: 'line', data: mid, smooth: true, showSymbol: false,
        lineStyle: { width: 2.4, color: tokens.accent }, itemStyle: { color: tokens.accent },
      },
    ],
  };
}

/** مسیر افت هر استراتژی — همان درد، در طول زمان. */
export function drawdownPathOption(analysis, dateLabels, tokens, { pick = [] } = {}) {
  const all = analysis?.strategies || [];
  const rows = pick.length ? all.filter((row) => pick.includes(row.strategyId)) : all.slice(0, 6);
  if (!rows.length) return null;
  return {
    legend: { type: 'scroll', top: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 64, right: 28, top: 40, bottom: 64, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => `<b>${faDigits(dateLabels[params[0]?.dataIndex] || '')}</b><br>`
        + params.map((row) => `${row.marker} ${faDigits(row.seriesName)} <b>${pctText(row.value)}</b>`).join('<br>'),
    },
    xAxis: {
      type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true }, axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: { type: 'value', max: 0, axisLabel: { color: tokens.muted, formatter: chartFormat.pct }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: rows.map((row) => ({
      name: row.strategyName, type: 'line', data: row.path.drawdown,
      smooth: true, showSymbol: false, connectNulls: false,
      areaStyle: { opacity: 0.10 }, emphasis: { focus: 'series' }, lineStyle: { width: 1.8 },
    })),
  };
}

/** نرخ برد روزانه: هر روز چند درصد ترکیب‌ها سبز بودند. */
export function dailyWinOption(analysis, dateLabels, tokens, { pick = [] } = {}) {
  const all = analysis?.strategies || [];
  const rows = pick.length ? all.filter((row) => pick.includes(row.strategyId)) : all.slice(0, 6);
  if (!rows.length) return null;
  return {
    legend: { type: 'scroll', top: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 64, right: 28, top: 40, bottom: 64, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => `<b>${faDigits(dateLabels[params[0]?.dataIndex] || '')}</b><br>`
        + params.map((row) => `${row.marker} ${faDigits(row.seriesName)} <b>${pctText(row.value)}</b>`).join('<br>'),
    },
    xAxis: {
      type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true }, axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { color: tokens.muted, formatter: chartFormat.pct }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: rows.map((row) => ({
      name: row.strategyName, type: 'line', data: row.path.winPct, smooth: true,
      showSymbol: false, connectNulls: false, emphasis: { focus: 'series' }, lineStyle: { width: 1.8 },
      markLine: { symbol: 'none', silent: true, data: [{ yAxis: 50 }], lineStyle: { color: tokens.muted, type: 'dashed' } },
    })),
  };
}

/**
 * رودخانهٔ سهم خانواده‌ها: در هر روز، سود مثبت کدام خانواده بیشتر بود.
 *
 * فقط سود مثبت وارد می‌شود، چون رودخانه پهنای منفی نمی‌کشد. این را همان‌جا
 * در راهنما می‌گوییم تا کسی نصفِ ماجرا را کلِ ماجرا نگیرد.
 */
export function familyRiverOption(analysis, dateLabels, tokens) {
  const groups = analysis?.groups || [];
  const columns = analysis?.dates?.length || 0;
  if (groups.length < 2 || columns < 3) return null;
  const byGroup = new Map(groups.map((row) => [String(row.groupId ?? ''), row.groupName]));
  const rows = [];
  for (let column = 0; column < columns; column++) {
    for (const [groupId, groupName] of byGroup) {
      const values = known((analysis.strategies || [])
        .filter((row) => String(row.groupId ?? '') === groupId)
        .map((row) => row.path.cumulative[column]));
      if (!values.length) continue;
      const positive = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
      rows.push([dateLabels[column], Math.max(0, positive), groupName]);
    }
  }
  if (rows.length < 6) return null;
  return {
    singleAxis: {
      type: 'category', data: dateLabels.map(faDigits), top: 40, bottom: 56,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } },
      axisTick: { lineStyle: { color: tokens.line } },
      splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'line' },
      formatter: (params) => `<b>${faDigits(params[0]?.name ?? '')}</b><br>`
        + params.map((row) => `${row.marker} ${faDigits(row.value[2])} <b>${pctText(row.value[1])}</b>`).join('<br>')
        + '<br><small>فقط بازده مثبت؛ رودخانه پهنای منفی نمی‌کشد.</small>',
    },
    legend: { type: 'scroll', top: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    series: [{
      type: 'themeRiver', boundaryGap: ['12%', '12%'],
      data: rows.map((row) => [faDigits(row[0]), row[1], row[2]]),
      label: { color: tokens.ink, formatter: (params) => faDigits(params.value?.[2] ?? '') },
      emphasis: { focus: 'series' },
    }],
  };
}

/** توزیع تجمعی بازده: «چند درصد ترکیب‌ها زیر این عدد ماندند؟» */
export function cumulativeDistOption(analysis, tokens) {
  const values = known((analysis?.combos || []).map((combo) => combo.series.finalPct)).sort((a, b) => a - b);
  if (values.length < 5) return null;
  const points = values.map((value, index) => [value, ((index + 1) / values.length) * 100]);
  return {
    grid: { left: 64, right: 28, top: 24, bottom: 60, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => `بازده تا <b>${pctText(params[0].value[0])}</b>`
        + `<br><b>${pctText(params[0].value[1])}</b> ترکیب‌ها زیر این عددند`,
    },
    xAxis: {
      type: 'value', name: 'بازده', nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct }, splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    yAxis: {
      type: 'value', min: 0, max: 100, name: 'سهم تجمعی', nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct }, splitLine: { lineStyle: { color: tokens.lineSoft } },
    },
    series: [{
      type: 'line', data: points, showSymbol: false, smooth: false, step: 'end',
      lineStyle: { width: 2, color: tokens.accent }, areaStyle: { opacity: 0.12, color: tokens.accent },
      markLine: {
        symbol: 'none', silent: true,
        data: [{ xAxis: 0, label: { formatter: 'سر به سر', color: tokens.muted } }],
        lineStyle: { color: tokens.muted, type: 'dashed' },
      },
    }],
  };
}

/** توزیع تغییر روزانه — «تندی حرکت» به‌شکل هیستوگرام. */
export function stepHistogramOption(analysis, tokens, { bins = 25 } = {}) {
  const values = known((analysis?.combos || []).flatMap((combo) => combo.series.stepPct));
  if (values.length < 10) return null;
  const low = Math.min(...values), high = Math.max(...values);
  const span = high - low;
  const width = span > 0 ? span / bins : 1;
  const counts = new Array(bins).fill(0);
  for (const value of values) counts[span > 0 ? Math.min(bins - 1, Math.floor((value - low) / width)) : 0] += 1;
  const centres = counts.map((_, index) => low + (width * (index + 0.5)));
  const total = values.length;
  return {
    grid: { left: 56, right: 24, top: 24, bottom: 60, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => `تغییر روزانه حدود ${pctText(centres[rows[0].dataIndex])}`
        + `<br><b>${chartFormat.int(rows[0].value)}</b> مشاهده` + shareLine(rows[0].value, total),
    },
    xAxis: {
      type: 'category', data: centres.map((value) => chartFormat.pct(value)),
      axisLabel: { color: tokens.muted, hideOverlap: true, rotate: 45 }, axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.int }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [{
      type: 'bar', data: counts, barCategoryGap: '8%',
      itemStyle: {
        color: (params) => (centres[params.dataIndex] > 0 ? tokens.gain : centres[params.dataIndex] < 0 ? tokens.loss : tokens.muted),
        borderRadius: [3, 3, 0, 0],
      },
    }],
  };
}

/** رادار سنجه‌ها: چند استراتژی، روی همهٔ محورها با هم. */
export function metricRadarOption(analysis, metrics, tokens, { pick = [], limit = 5 } = {}) {
  const all = analysis?.strategies || [];
  const rows = (pick.length ? all.filter((row) => pick.includes(row.strategyId)) : all.slice(0, limit));
  const axes = (metrics || []).filter((metric) => rows.some((row) => finite(row.metrics[metric.id]) !== null));
  if (rows.length < 2 || axes.length < 3) return null;
  // هر محور به صفر تا صد نگاشته می‌شود، وگرنه «درصد بازده» و «شمار ترکیب»
  // روی یک شکل قابل جمع نیستند. جهت «پایین‌تر بهتر» وارونه می‌شود تا در
  // همهٔ محورها، دورتر از مرکز یعنی بهتر.
  const scaled = (metric, value) => {
    const pool = known(all.map((row) => row.metrics[metric.id]));
    if (!pool.length || finite(value) === null) return null;
    const min = Math.min(...pool), max = Math.max(...pool);
    if (max - min < 1e-12) return 50;
    const share = (value - min) / (max - min);
    return (metric.better === 'low' ? 1 - share : share) * 100;
  };
  return {
    legend: { type: 'scroll', bottom: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    tooltip: {
      formatter: (params) => `<b>${faDigits(params.name)}</b><br>`
        + axes.map((metric, index) => `${metric.label}: <b>${
          metric.unit === 'pct' ? pctText(params.data.raw[index]) : chartFormat.num(params.data.raw[index])
        }</b>`).join('<br>'),
    },
    radar: {
      indicator: axes.map((metric) => ({ name: metric.label, max: 100 })),
      axisName: { color: tokens.ink, fontSize: 11 },
      splitLine: { lineStyle: { color: tokens.line } },
      splitArea: { areaStyle: { color: [tokens.panel, tokens.panel2] } },
      axisLine: { lineStyle: { color: tokens.line } },
      radius: '64%',
    },
    series: [{
      type: 'radar', symbolSize: 4,
      areaStyle: { opacity: 0.10 }, lineStyle: { width: 2 },
      emphasis: { focus: 'series', areaStyle: { opacity: 0.28 } },
      data: rows.map((row) => ({
        name: row.strategyName, strategyId: row.strategyId,
        value: axes.map((metric) => scaled(metric, row.metrics[metric.id])),
        raw: axes.map((metric) => row.metrics[metric.id]),
      })),
    }],
  };
}

/** عقربهٔ نمرهٔ بهترین — یک عدد، در جای خودش روی صفر تا صد. */
export function scoreGaugeOption(analysis, tokens) {
  const best = analysis?.best;
  if (!best || finite(best.score) === null) return null;
  return {
    tooltip: { formatter: () => `<b>${faDigits(best.strategyName)}</b><br>نمرهٔ ترکیبی: <b>${chartFormat.num(best.score)}</b> از ۱۰۰` },
    series: [{
      type: 'gauge', min: 0, max: 100, startAngle: 210, endAngle: -30, radius: '92%',
      progress: { show: true, width: 14, itemStyle: { color: tokens.accent } },
      axisLine: { lineStyle: { width: 14, color: [[1, tokens.panel2]] } },
      axisTick: { show: false },
      splitLine: { length: 10, lineStyle: { color: tokens.line } },
      axisLabel: { color: tokens.muted, distance: 18, formatter: chartFormat.int },
      pointer: { itemStyle: { color: tokens.accent } },
      anchor: { show: true, size: 12, itemStyle: { color: tokens.accent } },
      title: { offsetCenter: [0, '32%'], color: tokens.muted, fontSize: 12 },
      detail: {
        offsetCenter: [0, '-2%'], color: tokens.ink, fontSize: 26, fontWeight: 700,
        formatter: (value) => chartFormat.num(value),
      },
      data: [{ value: best.score, name: best.strategyName }],
    }],
  };
}

/** میلهٔ قطبی نمره — همهٔ استراتژی‌ها روی یک دایره، مرتب و فشرده. */
export function polarScoreOption(analysis, tokens) {
  const rows = (analysis?.strategies || []).filter((row) => finite(row.score) !== null);
  if (rows.length < 3) return null;
  return {
    polar: { radius: [26, '78%'] },
    angleAxis: { max: 100, startAngle: 90, axisLabel: { color: tokens.muted, formatter: chartFormat.int }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
    radiusAxis: {
      type: 'category', data: rows.map((row) => faDigits(row.strategyName)),
      axisLabel: { color: tokens.muted, fontSize: 10 }, axisLine: { show: false }, axisTick: { show: false },
    },
    tooltip: {
      formatter: (params) => `<b>${faDigits(params.name)}</b><br>نمره: <b>${chartFormat.num(params.value)}</b>`
        + `<br>بازده: <b>${pctText(params.data.metric)}</b>`,
    },
    series: [{
      type: 'bar', coordinateSystem: 'polar', roundCap: true, barWidth: '62%',
      data: rows.map((row) => ({
        value: row.score, strategyId: row.strategyId, metric: row.metrics.return,
        itemStyle: { color: row.metrics.return > 0 ? tokens.gain : row.metrics.return < 0 ? tokens.loss : tokens.muted, opacity: 0.85 },
      })),
    }],
  };
}

/** میلهٔ انباشتهٔ اجزای نمره — «این نمره از کجا آمد». */
export function scorePartsOption(analysis, tokens, { limit = 14 } = {}) {
  const rows = (analysis?.strategies || []).slice(0, limit).filter((row) => (row.scoreParts || []).length);
  if (rows.length < 2) return null;
  const ids = [...new Set(rows.flatMap((row) => row.scoreParts.map((part) => part.id)))];
  const labelOf = (id) => rows.flatMap((row) => row.scoreParts).find((part) => part.id === id)?.label || id;
  return {
    legend: { type: 'scroll', top: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 8, right: 40, top: 40, bottom: 24, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const total = params.reduce((sum, row) => sum + (finite(row.value) ?? 0), 0);
        return `<b>${faDigits(params[0]?.name ?? '')}</b><br>`
          + params.filter((row) => finite(row.value) !== null && row.value > 0)
            .map((row) => `${row.marker} ${faDigits(row.seriesName)} <b>${chartFormat.num(row.value)}</b>`
              + ` <small>(${chartFormat.pct((row.value / Math.max(1e-9, total)) * 100)}٪)</small>`).join('<br>')
          + `<br>جمع نمره: <b>${chartFormat.num(total)}</b>`;
      },
    },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.int }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: {
      type: 'category', inverse: true, data: rows.map((row) => faDigits(row.strategyName)),
      axisLabel: { color: tokens.muted, width: 150, overflow: 'truncate' }, axisLine: { lineStyle: { color: tokens.line } },
    },
    series: ids.map((id) => ({
      name: labelOf(id), type: 'bar', stack: 'score', barWidth: '64%',
      emphasis: { focus: 'series' },
      data: rows.map((row) => {
        const part = row.scoreParts.find((item) => item.id === id);
        // سهم وزنی همان جزء از نمرهٔ نهایی — نه خودِ نمرهٔ درصدی، وگرنه
        // میله‌ها روی هم عددی می‌شوند که هیچ‌جا معنا ندارد.
        const covered = row.scoreParts.reduce((sum, item) => sum + item.weight, 0);
        return part && covered > 0 ? (part.score * part.weight) / covered : 0;
      }),
    })),
  };
}
