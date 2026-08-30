// آزمایشگاه نمودار — زمان، جریان و شبکه، و انحراف.

import { fmt, faDigits } from './fmt.mjs';
import { chartFormat } from './chart-host.mjs';
import { groupBy, quantile, ranked, usable } from './chart-lab.mjs';

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};
const pct = (value) => (finite(value) === null ? '—' : `${fmt.pct(value)}٪`);
const fa = (value) => faDigits(String(value ?? ''));
const tone = (t, value) => (finite(value) === null ? t.muted : value >= 0 ? t.gain : t.loss);
const pick = (t, index) => t.palette[index % t.palette.length];

/** پیرسون، برای نمودارهای شبکه‌ای این پرونده. */
export function corr(a, b) {
  const pairs = [];
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const x = finite(a[index]), y = finite(b[index]);
    if (x !== null && y !== null) pairs.push([x, y]);
  }
  if (pairs.length < 3) return null;
  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (const [x, y] of pairs) { num += (x - mx) * (y - my); dx += (x - mx) ** 2; dy += (y - my) ** 2; }
  return dx * dy > 0 ? num / Math.sqrt(dx * dy) : null;
}

// ═══════════════════ ۵. زمان ═══════════════════

/**
 * نمودار افق: هر نوار یک استراتژی، رنگ به‌جای ارتفاع.
 *
 * وقتی سی سری داری و ارتفاع نداری، افق تنها شکلی است که هم ترتیب زمانی
 * را نگه می‌دارد و هم شدت را — بی آنکه سی خط روی هم بیفتند.
 */
export function horizonOption(analysis, dateLabels, tokens) {
  const rows = ranked(analysis).slice(0, 16);
  if (!rows.length) return null;
  const cells = [];
  let span = 0;
  rows.forEach((row, y) => {
    (row.path?.cumulative || []).forEach((value, x) => {
      const number = finite(value);
      if (number === null) return;
      span = Math.max(span, Math.abs(number));
      cells.push({ value: [x, y, number], strategyId: row.strategyId });
    });
  });
  if (!cells.length) return null;
  return {
    grid: { left: 160, right: 24, top: 20, bottom: 74 },
    tooltip: { trigger: 'item',
      formatter: (params) => {
        const [x, y, value] = params.data.value || params.data;
        return `<b>${fa(rows[y].strategyName)}</b><br>${fa(dateLabels[x] || '')}<br>`
          + `بازده تجمعی: <b>${pct(value)}</b>`;
      } },
    visualMap: { min: -span, max: span, calculable: true, orient: 'horizontal', left: 'center', bottom: 6,
      textStyle: { color: tokens.muted }, formatter: chartFormat.pct,
      inRange: { color: [tokens.loss, tokens.panel2, tokens.gain] } },
    xAxis: { type: 'category', data: dateLabels.map(faDigits), splitArea: { show: false },
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'category', data: rows.map((row) => fa(row.strategyName)),
      axisLabel: { color: tokens.muted, width: 150, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } }, splitArea: { show: false } },
    series: [{ type: 'heatmap', data: cells,
      itemStyle: { borderColor: tokens.panel, borderWidth: 0.5 },
      emphasis: { itemStyle: { borderColor: tokens.accent, borderWidth: 2 } } }],
  };
}

/** رودخانه: ضخامت هر جریان، شمار ترکیب‌های سودده آن خانواده در هر روز. */
export function riverOption(analysis, dateLabels, tokens) {
  const families = [...groupBy(usable(analysis), 'groupName')];
  if (families.length < 2) return null;
  const rows = [];
  families.forEach(([name, members]) => {
    dateLabels.forEach((_, at) => {
      const wins = members.filter((combo) => finite(combo.series.pct?.[at]) > 0).length;
      rows.push([at, wins, name]);
    });
  });
  if (!rows.some((row) => row[1] > 0)) return null;
  return {
    legend: { top: 0, type: 'scroll', textStyle: { color: tokens.muted }, formatter: faDigits },
    tooltip: { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: tokens.line } },
      formatter: (params) => {
        const at = params[0]?.value?.[0] ?? 0;
        return `<b>${fa(dateLabels[at] || '')}</b><br>`
          + params.map((row) => `${row.marker} ${fa(row.value[2])}: <b>${fa(row.value[1])}</b> ترکیب سودده`).join('<br>');
      } },
    singleAxis: { top: 44, bottom: 44, left: 60, right: 24, type: 'category',
      data: dateLabels.map(faDigits),
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [{
      type: 'themeRiver', data: rows,
      label: { show: false },
      emphasis: { focus: 'series' },
      color: families.map((_, index) => pick(tokens, index)),
    }],
  };
}

/** مسابقهٔ خطی: کدام کِی از بقیه جدا شد. */
export function raceOption(analysis, dateLabels, tokens) {
  const rows = ranked(analysis).slice(0, 12);
  if (!rows.length) return null;
  return {
    legend: { top: 0, type: 'scroll', textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 60, right: 130, top: 44, bottom: 58, containLabel: true },
    tooltip: { trigger: 'axis',
      formatter: (params) => {
        const at = params[0]?.dataIndex ?? 0;
        return `<b>${fa(dateLabels[at] || '')}</b><br>`
          + [...params].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
            .map((row) => `${row.marker} ${fa(row.seriesName)} <b>${pct(row.value)}</b>`).join('<br>');
      } },
    xAxis: { type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: rows.map((row, index) => ({
      name: row.strategyName, type: 'line',
      data: (row.path?.cumulative || []).map((value) => ({ value, strategyId: row.strategyId })),
      smooth: true, showSymbol: false, connectNulls: false, triggerLineEvent: true,
      emphasis: { focus: 'series' },
      lineStyle: { width: 2, color: pick(tokens, index) }, itemStyle: { color: pick(tokens, index) },
      endLabel: { show: true, color: tokens.muted, fontSize: 10, formatter: (p) => fa(p.seriesName) },
    })),
  };
}

/** نوار زمانی: بهترین و بدترین روز هر خانواده روی یک خط. */
export function timelineOption(analysis, dateLabels, tokens) {
  const families = [...groupBy(usable(analysis), 'groupName')];
  if (!families.length) return null;
  const marks = [];
  families.forEach(([name, members], y) => {
    const daily = dateLabels.map((_, at) => {
      const values = members.map((combo) => finite(combo.series.stepPct?.[at])).filter((v) => v !== null);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    });
    const live = daily.map((value, at) => ({ value, at })).filter((row) => row.value !== null);
    if (!live.length) return;
    const best = live.reduce((a, b) => (b.value > a.value ? b : a));
    const worst = live.reduce((a, b) => (b.value < a.value ? b : a));
    marks.push({ value: [best.at, y, best.value, 'بهترین روز'], strategyId: members[0]?.strategyId ?? null, name });
    if (worst.at !== best.at) {
      marks.push({ value: [worst.at, y, worst.value, 'بدترین روز'], strategyId: members[0]?.strategyId ?? null, name });
    }
  });
  if (!marks.length) return null;
  const span = Math.max(...marks.map((mark) => Math.abs(mark.value[2]))) || 1;
  return {
    grid: { left: 150, right: 24, top: 20, bottom: 52, containLabel: true },
    tooltip: { trigger: 'item',
      formatter: (params) => {
        const [x, , value, kind] = params.data.value;
        return `<b>${fa(params.data.name)}</b><br>${fa(kind)}: ${fa(dateLabels[x] || '')}<br>`
          + `میانگین گام خانواده: <b>${pct(value)}</b>`;
      } },
    xAxis: { type: 'category', data: dateLabels.map(faDigits),
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'category', data: families.map(([name]) => fa(name)),
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [{
      type: 'scatter', data: marks,
      symbolSize: (value) => 12 + 26 * (Math.abs(value[2]) / span),
      itemStyle: { color: (p) => tone(tokens, p.data.value[2]), opacity: 0.85,
        borderColor: tokens.panel, borderWidth: 1.5 },
    }],
  };
}

// ═══════════════════ ۶. جریان و شبکه ═══════════════════

/** سنکی: خانواده ← نتیجه. جریانی که به «زیان» می‌رود هم دیده می‌شود. */
export function outcomeSankeyOption(analysis, tokens) {
  const families = [...groupBy(usable(analysis), 'groupName')];
  if (!families.length) return null;
  const nodes = [{ name: 'سودده' }, { name: 'زیان‌ده' }, { name: 'سر به سر' }];
  const links = [];
  for (const [name, members] of families) {
    nodes.push({ name, strategyId: members[0]?.strategyId ?? null });
    const win = members.filter((combo) => combo.series.finalPct > 0).length;
    const lose = members.filter((combo) => combo.series.finalPct < 0).length;
    const flat = members.length - win - lose;
    if (win) links.push({ source: name, target: 'سودده', value: win, strategyId: members[0]?.strategyId ?? null });
    if (lose) links.push({ source: name, target: 'زیان‌ده', value: lose, strategyId: members[0]?.strategyId ?? null });
    if (flat) links.push({ source: name, target: 'سر به سر', value: flat, strategyId: members[0]?.strategyId ?? null });
  }
  if (!links.length) return null;
  const all = links.reduce((sum, link) => sum + link.value, 0);
  return {
    tooltip: { trigger: 'item',
      formatter: (params) => (params.dataType === 'edge'
        ? `${fa(params.data.source)} ← ${fa(params.data.target)}<br>`
          + `<b>${fa(params.data.value)}</b> ترکیب · ${pct((params.data.value / all) * 100)} از کل`
        : `<b>${fa(params.name)}</b><br><b>${fa(params.value)}</b> ترکیب · ${pct((params.value / all) * 100)}`) },
    series: [{
      type: 'sankey', nodeAlign: 'left', left: 24, right: 130, top: 20, bottom: 20,
      emphasis: { focus: 'adjacency' }, nodeGap: 10, nodeWidth: 14,
      label: { color: tokens.ink, formatter: (p) => fa(p.name) },
      lineStyle: { color: 'gradient', opacity: 0.42, curveness: 0.5 },
      data: nodes, links,
    }],
  };
}

/** چرخ وابستگی: هم‌حرکتی خانواده‌ها با هم. */
export function chordOption(analysis, tokens) {
  const families = [...groupBy(usable(analysis), 'groupName')].slice(0, 9);
  if (families.length < 3) return null;
  const paths = families.map(([, members]) => {
    const length = members[0]?.series?.stepPct?.length || 0;
    return Array.from({ length }, (_, at) => {
      const values = members.map((combo) => finite(combo.series.stepPct?.[at])).filter((v) => v !== null);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    });
  });
  const nodes = families.map(([name, members], index) => ({
    name, strategyId: members[0]?.strategyId ?? null,
    itemStyle: { color: pick(tokens, index) },
  }));
  const links = [];
  for (let a = 0; a < families.length; a++) {
    for (let b = a + 1; b < families.length; b++) {
      const value = corr(paths[a], paths[b]);
      if (value === null || value <= 0.15) continue;
      links.push({ source: families[a][0], target: families[b][0], value: Math.round(value * 100) / 100,
        strategyId: families[a][1][0]?.strategyId ?? null });
    }
  }
  if (!links.length) return null;
  return {
    tooltip: { trigger: 'item',
      formatter: (params) => (params.dataType === 'edge'
        ? `<b>${fa(params.data.source)}</b> و <b>${fa(params.data.target)}</b><br>`
          + `هم‌حرکتی: <b>${chartFormat.num(params.data.value)}</b><br>`
          + `<i>${fa(params.data.value > 0.8 ? 'تقریباً یکی حرکت می‌کنند' : 'هم‌جهت ولی نه یکی')}</i>`
        : `<b>${fa(params.name)}</b>`) },
    series: [{
      type: 'graph', layout: 'circular', circular: { rotateLabel: true },
      roam: false, animation: false,
      label: { show: true, position: 'right', color: tokens.ink, formatter: (p) => fa(p.name) },
      lineStyle: { color: 'source', curveness: 0.32, opacity: 0.5 },
      emphasis: { focus: 'adjacency', lineStyle: { width: 4 } },
      symbolSize: 18, data: nodes, edges: links,
    }],
  };
}

/** درخت: خانواده ← استراتژی، برای رفتن از کل به جزء با چشم. */
export function treeOption(analysis, tokens) {
  const rows = ranked(analysis);
  if (!rows.length) return null;
  const families = [...groupBy(rows, 'groupName')];
  return {
    tooltip: { trigger: 'item',
      formatter: (params) => (params.data.metrics
        ? `<b>${fa(params.data.name)}</b><br>نمره: <b>${chartFormat.num(params.data.score)}</b><br>`
          + `بازده: <b>${pct(params.data.metrics.return)}</b><br>نرخ برد: <b>${pct(params.data.metrics.winPct)}</b>`
        : `<b>${fa(params.data.name)}</b><br>${fa(params.data.children?.length || 0)} استراتژی`) },
    series: [{
      type: 'tree', data: [{ name: 'همهٔ استراتژی‌ها',
        children: families.map(([name, members]) => ({
          name, strategyId: members[0]?.strategyId ?? null,
          children: members.map((row) => ({ name: row.strategyName, value: row.score,
            score: row.score, metrics: row.metrics, strategyId: row.strategyId })),
        })) }],
      left: '12%', right: '22%', top: 16, bottom: 16, symbolSize: 9,
      orient: 'RL', initialTreeDepth: 2,
      label: { color: tokens.ink, position: 'left', align: 'right', formatter: (p) => fa(p.name) },
      leaves: { label: { position: 'left', align: 'right' } },
      lineStyle: { color: tokens.line, width: 1.2, curveness: 0.4 },
      itemStyle: { color: tokens.accent, borderColor: tokens.panel },
      emphasis: { focus: 'descendant' }, expandAndCollapse: true, animationDuration: 320,
    }],
  };
}

// ═══════════════════ ۷. انحراف ═══════════════════

/** آبشار: سهم هر خانواده در فاصلهٔ صفر تا میانگین بازار. */
export function familyWaterfallOption(analysis, tokens) {
  const families = [...groupBy(usable(analysis), 'groupName')].map(([name, members]) => {
    const values = members.map((combo) => finite(combo.series.finalPct)).filter((v) => v !== null);
    return { name, members, median: quantile(values.slice().sort((a, b) => a - b), 0.5) ?? 0 };
  }).sort((a, b) => b.median - a.median);
  if (!families.length) return null;
  const names = [...families.map((family) => family.name), 'جمع'];
  const base = [];
  const bars = [];
  let running = 0;
  for (const family of families) {
    base.push(family.median >= 0 ? running : running + family.median);
    bars.push(Math.abs(family.median));
    running += family.median;
  }
  base.push(0);
  bars.push(running);
  return {
    grid: { left: 66, right: 24, top: 22, bottom: 78, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const at = params[0]?.dataIndex ?? 0;
        if (at === families.length) return `<b>جمع میانه‌ها</b><br><b>${pct(running)}</b>`;
        const family = families[at];
        return `<b>${fa(family.name)}</b><br>میانهٔ بازده: <b>${pct(family.median)}</b><br>`
          + `${fa(family.members.length)} ترکیب`;
      } },
    xAxis: { type: 'category', data: names.map(faDigits),
      axisLabel: { color: tokens.muted, rotate: 40, hideOverlap: true, width: 90, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [
      { type: 'bar', stack: 'آبشار', silent: true, data: base, itemStyle: { color: 'transparent' } },
      { type: 'bar', stack: 'آبشار', barMaxWidth: 40,
        data: bars.map((value, index) => ({ value,
          strategyId: families[index]?.members?.[0]?.strategyId ?? null })),
        itemStyle: { borderRadius: 3,
          color: (p) => (p.dataIndex === families.length ? tokens.accent
            : tone(tokens, families[p.dataIndex].median)) } },
    ],
  };
}

/** میلهٔ واگرا: فاصلهٔ هر استراتژی از میانهٔ همهٔ استراتژی‌ها. */
export function divergingOption(analysis, tokens) {
  const rows = ranked(analysis);
  if (rows.length < 3) return null;
  const values = rows.map((row) => finite(row.metrics.return)).filter((v) => v !== null).sort((a, b) => a - b);
  const middle = quantile(values, 0.5) ?? 0;
  const shifted = rows.map((row) => ({ row, delta: finite(row.metrics.return) === null ? null : row.metrics.return - middle }))
    .filter((item) => item.delta !== null)
    .sort((a, b) => a.delta - b.delta);
  return {
    grid: { left: 160, right: 40, top: 20, bottom: 44, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const item = shifted[params[0]?.dataIndex ?? 0];
        return `<b>${fa(item.row.strategyName)}</b><br>بازده: <b>${pct(item.row.metrics.return)}</b><br>`
          + `میانهٔ همهٔ استراتژی‌ها: <b>${pct(middle)}</b><br>`
          + `فاصله: <b>${pct(item.delta)}</b>`;
      } },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: shifted.map((item) => fa(item.row.strategyName)),
      axisLabel: { color: tokens.muted, width: 150, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [{ type: 'bar', barMaxWidth: 16,
      data: shifted.map((item) => ({ value: item.delta, strategyId: item.row.strategyId })),
      itemStyle: { color: (p) => tone(tokens, p.value), borderRadius: 3 } }],
  };
}

/** مازاد بر نماد پایه: مساحت بالای صفر و زیر آن، در طول زمان. */
export function excessAreaOption(analysis, dateLabels, tokens) {
  const rows = ranked(analysis).slice(0, 8);
  const base = (analysis?.baseSeries || []).map(finite);
  if (!rows.length || !base.some((value) => value !== null)) return null;
  return {
    legend: { top: 0, type: 'scroll', textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 60, right: 24, top: 44, bottom: 58, containLabel: true },
    tooltip: { trigger: 'axis',
      formatter: (params) => {
        const at = params[0]?.dataIndex ?? 0;
        return `<b>${fa(dateLabels[at] || '')}</b><br>نماد پایه: <b>${pct(base[at])}</b><br>`
          + [...params].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
            .map((row) => `${row.marker} ${fa(row.seriesName)} <b>${pct(row.value)}</b> مازاد`).join('<br>');
      } },
    xAxis: { type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: rows.map((row, index) => ({
      name: row.strategyName, type: 'line', triggerLineEvent: true,
      data: (row.path?.cumulative || []).map((value, at) => ({
        value: finite(value) === null || base[at] === null ? null : value - base[at],
        strategyId: row.strategyId })),
      smooth: true, showSymbol: false, connectNulls: false, emphasis: { focus: 'series' },
      lineStyle: { width: 1.8, color: pick(tokens, index) },
      itemStyle: { color: pick(tokens, index) },
      markLine: index === 0 ? { silent: true, symbol: 'none',
        lineStyle: { color: tokens.ink, type: 'dashed' },
        label: { color: tokens.muted, formatter: 'هم‌پای نماد پایه' }, data: [{ yAxis: 0 }] } : undefined,
    })),
  };
}
