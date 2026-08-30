// آزمایشگاه نمودار — سهم از کل، توزیع، و رابطه.

import { fmt, faDigits } from './fmt.mjs';
import { chartFormat } from './chart-host.mjs';
import { density, groupBy, quantile, ranked, sharedGrid, usable } from './chart-lab.mjs';

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};
const pct = (value) => (finite(value) === null ? '—' : `${fmt.pct(value)}٪`);
const fa = (value) => faDigits(String(value ?? ''));
const tone = (t, value) => (finite(value) === null ? t.muted : value >= 0 ? t.gain : t.loss);
const pick = (t, index) => t.palette[index % t.palette.length];

// ═══════════════════ ۲. سهم از کل ═══════════════════

/** وافل: صد خانه، سهم هر خانواده از ترکیب‌های معتبر. */
export function familyWaffleOption(analysis, tokens) {
  const rows = usable(analysis);
  if (!rows.length) return null;
  const families = [...groupBy(rows, 'groupName')]
    .map(([name, members]) => ({ name, share: (members.length / rows.length) * 100, members }))
    .sort((a, b) => b.share - a.share);
  const cells = [];
  let at = 0;
  families.forEach((family, index) => {
    const count = Math.round(family.share);
    for (let n = 0; n < count && at < 100; n++, at += 1) {
      cells.push({ value: [at % 10, 9 - Math.floor(at / 10), index],
        strategyId: family.members[0]?.strategyId ?? null });
    }
  });
  for (; at < 100; at += 1) cells.push({ value: [at % 10, 9 - Math.floor(at / 10), -1], strategyId: null });
  return {
    grid: { left: 18, right: 18, top: 14, bottom: 14, containLabel: false },
    tooltip: { trigger: 'item',
      formatter: (params) => {
        const which = (params.data.value || params.data)[2];
        if (which < 0) return '<b>گرد‌کردن</b><br>باقی‌ماندهٔ خانه‌ها به هیچ خانواده‌ای نرسید';
        const family = families[which];
        return `<b>${fa(family.name)}</b><br>`
          + `${fa(family.members.length)} ترکیب<br><b>${pct(family.share)}</b> از همهٔ ترکیب‌های معتبر`;
      } },
    xAxis: { type: 'value', min: -0.5, max: 9.5, show: false },
    yAxis: { type: 'value', min: -0.5, max: 9.5, show: false },
    series: [{
      type: 'custom', data: cells,
      renderItem: (params, api) => {
        const point = api.coord([api.value(0), api.value(1)]);
        const size = api.size([1, 1]);
        const which = api.value(2);
        return { type: 'rect',
          shape: { x: point[0] - size[0] * 0.42, y: point[1] - size[1] * 0.42,
            width: size[0] * 0.84, height: size[1] * 0.84, r: 2 },
          style: api.style({ fill: which < 0 ? tokens.panel2 : pick(tokens, which) }) };
      },
    }],
  };
}

/** ماریمکو: عرض سهم خانواده، ارتفاع میانهٔ بازدهش. */
export function familyMekkoOption(analysis, tokens) {
  const rows = usable(analysis);
  if (!rows.length) return null;
  const families = [...groupBy(rows, 'groupName')].map(([name, members]) => {
    const values = members.map((row) => finite(row.series.finalPct)).filter((v) => v !== null).sort((a, b) => a - b);
    return { name, members, median: quantile(values, 0.5) ?? 0 };
  });
  let cursor = 0;
  const boxes = families.map((family) => {
    const width = (family.members.length / rows.length) * 100;
    const box = { ...family, x0: cursor, x1: cursor + width };
    cursor += width;
    return box;
  });
  return {
    grid: { left: 60, right: 24, top: 24, bottom: 50, containLabel: true },
    tooltip: { trigger: 'item',
      formatter: (params) => {
        const box = boxes[params.dataIndex];
        return `<b>${fa(box.name)}</b><br>`
          + `سهم از ترکیب‌ها: <b>${pct(box.x1 - box.x0)}</b> · ${fa(box.members.length)} ترکیب<br>`
          + `میانهٔ بازده: <b>${pct(box.median)}</b>`;
      } },
    xAxis: { type: 'value', min: 0, max: 100, name: 'سهم از ترکیب‌ها (٪)',
      nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'value', name: 'میانهٔ بازده (٪)', nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [{
      type: 'custom',
      data: boxes.map((box) => ({ value: [box.x0, box.median, box.x1],
        strategyId: box.members[0]?.strategyId ?? null })),
      renderItem: (params, api) => {
        const start = api.coord([api.value(0), api.value(1)]);
        const end = api.coord([api.value(2), 0]);
        return { type: 'rect',
          shape: { x: Math.min(start[0], end[0]), y: Math.min(start[1], end[1]),
            width: Math.max(1, Math.abs(end[0] - start[0])), height: Math.abs(end[1] - start[1]) },
          style: api.style({ fill: api.value(1) >= 0 ? tokens.gain : tokens.loss,
            opacity: 0.7, stroke: tokens.panel, lineWidth: 1.5 }) };
      },
    }],
  };
}

/** قیف غربال: از همهٔ ترکیب‌ها تا آنچه سود داد. */
export function screenFunnelOption(analysis, tokens) {
  const all = (analysis?.combos || []).length;
  const ok = usable(analysis);
  const green = ok.filter((combo) => combo.series.finalPct > 0);
  const rows = [
    { name: 'همهٔ ترکیب‌ها', value: all },
    { name: 'دارای مسیر معتبر', value: ok.length },
    { name: 'سودده در پایان', value: green.length },
  ].filter((row) => row.value > 0);
  if (rows.length < 2) return null;
  return {
    tooltip: { trigger: 'item',
      formatter: (params) => `<b>${fa(params.name)}</b><br>${fa(params.value)} ترکیب<br>`
        + `<b>${pct((params.value / all) * 100)}</b> از همهٔ ترکیب‌ها` },
    series: [{
      type: 'funnel', left: '10%', right: '10%', top: 18, bottom: 18, minSize: '30%', sort: 'none', gap: 4,
      label: { color: tokens.ink, position: 'inside',
        formatter: (p) => `${fa(p.name)} · ${fa(p.value)}` },
      itemStyle: { borderColor: tokens.panel, borderWidth: 2 },
      data: rows.map((row, index) => ({ ...row, itemStyle: { color: pick(tokens, index) } })),
    }],
  };
}

// ═══════════════════ ۳. توزیع ═══════════════════

/**
 * ریج‌لاین: توزیع بازده هر خانواده، روی هم چیده.
 *
 * جایگزین جعبه‌ای وقتی خانواده‌ها زیادند: شکلِ کاملِ توزیع را نگه می‌دارد
 * و در همان ارتفاع، چند برابر جا می‌دهد.
 */
export function ridgelineOption(analysis, tokens) {
  const rows = usable(analysis);
  const families = [...groupBy(rows, 'groupName')].filter(([, members]) => members.length >= 3);
  if (families.length < 2) return null;
  const grid = sharedGrid(rows.map((row) => row.series.finalPct));
  if (!grid.length) return null;
  const curves = families.map(([name, members]) => ({
    name, members,
    values: density(members.map((row) => row.series.finalPct), grid),
  }));
  const peak = Math.max(...curves.flatMap((curve) => curve.values)) || 1;
  const step = 0.85;
  return {
    grid: { left: 150, right: 30, top: 20, bottom: 50, containLabel: true },
    tooltip: { trigger: 'item',
      formatter: (params) => {
        const curve = curves[params.seriesIndex];
        const values = curve.members.map((row) => finite(row.series.finalPct))
          .filter((v) => v !== null).sort((a, b) => a - b);
        return `<b>${fa(curve.name)}</b><br>${fa(curve.members.length)} ترکیب<br>`
          + `میانه: <b>${pct(quantile(values, 0.5))}</b><br>`
          + `چارک پایین: <b>${pct(quantile(values, 0.25))}</b><br>`
          + `چارک بالا: <b>${pct(quantile(values, 0.75))}</b>`;
      } },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: curves.map((curve) => fa(curve.name)),
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: curves.map((curve, index) => ({
      type: 'custom', name: curve.name,
      data: [{ value: index, strategyId: curve.members[0]?.strategyId ?? null }],
      renderItem: (params, api) => {
        const base = api.coord([grid[0], index]);
        const points = grid.map((x, at) => {
          const point = api.coord([x, index]);
          return [point[0], base[1] - (curve.values[at] / peak) * api.size([0, 1])[1] * step];
        });
        const floor = grid.map((x) => api.coord([x, index])).reverse();
        return { type: 'polygon',
          shape: { points: [...points, ...floor] },
          style: api.style({ fill: pick(tokens, index), opacity: 0.62,
            stroke: pick(tokens, index), lineWidth: 1.4 }) };
      },
    })),
  };
}

/** ویولن: همان توزیع، آینه‌شده، برای مقایسهٔ تقارن. */
export function violinOption(analysis, tokens) {
  const rows = usable(analysis);
  const families = [...groupBy(rows, 'groupName')].filter(([, members]) => members.length >= 3);
  if (!families.length) return null;
  const grid = sharedGrid(rows.map((row) => row.series.finalPct));
  if (!grid.length) return null;
  const shapes = families.map(([name, members]) => ({
    name, members, values: density(members.map((row) => row.series.finalPct), grid),
  }));
  const peak = Math.max(...shapes.flatMap((shape) => shape.values)) || 1;
  return {
    grid: { left: 60, right: 24, top: 20, bottom: 76, containLabel: true },
    tooltip: { trigger: 'item',
      formatter: (params) => {
        const shape = shapes[params.seriesIndex];
        const values = shape.members.map((row) => finite(row.series.finalPct))
          .filter((v) => v !== null).sort((a, b) => a - b);
        return `<b>${fa(shape.name)}</b><br>${fa(shape.members.length)} ترکیب<br>`
          + `کمینه: <b>${pct(values[0])}</b> · بیشینه: <b>${pct(values[values.length - 1])}</b><br>`
          + `میانه: <b>${pct(quantile(values, 0.5))}</b>`;
      } },
    xAxis: { type: 'category', data: shapes.map((shape) => fa(shape.name)),
      axisLabel: { color: tokens.muted, rotate: 30, hideOverlap: true, width: 90, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: shapes.map((shape, index) => ({
      type: 'custom', name: shape.name,
      data: [{ value: index, strategyId: shape.members[0]?.strategyId ?? null }],
      renderItem: (params, api) => {
        const half = api.size([1, 0])[0] * 0.42;
        const right = grid.map((y, at) => {
          const point = api.coord([index, y]);
          return [point[0] + (shape.values[at] / peak) * half, point[1]];
        });
        const left = grid.map((y, at) => {
          const point = api.coord([index, y]);
          return [point[0] - (shape.values[at] / peak) * half, point[1]];
        }).reverse();
        return { type: 'polygon', shape: { points: [...right, ...left] },
          style: api.style({ fill: pick(tokens, index), opacity: 0.62,
            stroke: pick(tokens, index), lineWidth: 1.4 }) };
      },
    })),
  };
}

/** ازدحام: هر ترکیب یک نقطه — خودِ داده، نه خلاصه‌اش. */
export function comboSwarmOption(analysis, tokens) {
  const families = [...groupBy(usable(analysis), 'groupName')];
  if (!families.length) return null;
  const points = [];
  families.forEach(([, members], y) => {
    const seen = new Map();
    for (const combo of members) {
      const value = finite(combo.series.finalPct);
      if (value === null) continue;
      const key = Math.round(value * 2) / 2;
      const count = seen.get(key) || 0;
      seen.set(key, count + 1);
      const offset = ((count % 2 === 0 ? 1 : -1) * Math.ceil(count / 2)) * 0.075;
      points.push({ value: [value, y + offset], strategyId: combo.strategyId,
        name: combo.strategyName });
    }
  });
  if (!points.length) return null;
  return {
    grid: { left: 150, right: 24, top: 20, bottom: 46, containLabel: true },
    tooltip: { trigger: 'item',
      formatter: (params) => `<b>${fa(params.data.name)}</b><br>`
        + `بازده این ترکیب: <b>${pct((params.data.value || params.data)[0])}</b>` },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: families.map(([name]) => fa(name)),
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [{ type: 'scatter', data: points, symbolSize: 7,
      itemStyle: { color: (p) => tone(tokens, (p.data.value || p.data)[0]), opacity: 0.66 } }],
  };
}

/** هیستوگرام پروانه‌ای: سود در یک سو، زیان در سوی دیگر. */
export function butterflyOption(analysis, tokens) {
  const rows = usable(analysis);
  if (rows.length < 4) return null;
  const values = rows.map((row) => finite(row.series.finalPct)).filter((v) => v !== null);
  const span = Math.max(...values.map(Math.abs)) || 1;
  const bins = 10;
  const width = span / bins;
  const up = new Array(bins).fill(0), down = new Array(bins).fill(0);
  for (const value of values) {
    const slot = Math.min(bins - 1, Math.floor(Math.abs(value) / width));
    if (value >= 0) up[slot] += 1; else down[slot] += 1;
  }
  const labels = up.map((_, index) => `${fmt.pct(index * width)}–${fmt.pct((index + 1) * width)}`);
  return {
    legend: { top: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 120, right: 24, top: 44, bottom: 44, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const at = params[0]?.dataIndex ?? 0;
        return `<b>قدر مطلق ${fa(labels[at])}٪</b><br>`
          + `سودده: <b>${fa(up[at])}</b> · ${pct((up[at] / values.length) * 100)}<br>`
          + `زیان‌ده: <b>${fa(down[at])}</b> · ${pct((down[at] / values.length) * 100)}`;
      } },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: (v) => chartFormat.int(Math.abs(v)) },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: labels.map(faDigits),
      axisLabel: { color: tokens.muted }, axisLine: { lineStyle: { color: tokens.line } } },
    series: [
      { name: 'زیان‌ده', type: 'bar', stack: 'پروانه', data: down.map((value) => -value),
        itemStyle: { color: tokens.loss, borderRadius: [3, 0, 0, 3] } },
      { name: 'سودده', type: 'bar', stack: 'پروانه', data: up,
        itemStyle: { color: tokens.gain, borderRadius: [0, 3, 3, 0] } },
    ],
  };
}

// ═══════════════════ ۴. رابطه ═══════════════════

/** هگزبین: وقتی نقطه‌ها روی هم می‌افتند، چگالی را بشمار نه نقطه را. */
export function hexbinOption(analysis, tokens) {
  const rows = usable(analysis).map((combo) => ({
    x: finite(combo.series.maxDrawdownPct), y: finite(combo.series.finalPct), combo,
  })).filter((row) => row.x !== null && row.y !== null);
  if (rows.length < 6) return null;
  const xs = rows.map((row) => row.x), ys = rows.map((row) => row.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cols = 14, rowsN = 12;
  const dx = (x1 - x0) / cols || 1, dy = (y1 - y0) / rowsN || 1;
  const bins = new Map();
  for (const row of rows) {
    const cy = Math.min(rowsN - 1, Math.floor((row.y - y0) / dy));
    const shift = cy % 2 === 0 ? 0 : 0.5;
    const cx = Math.min(cols - 1, Math.max(0, Math.round((row.x - x0) / dx - shift)));
    const key = `${cx}:${cy}`;
    if (!bins.has(key)) bins.set(key, { cx: cx + shift, cy, members: [] });
    bins.get(key).members.push(row);
  }
  const cells = [...bins.values()];
  const most = Math.max(...cells.map((cell) => cell.members.length));
  return {
    grid: { left: 62, right: 30, top: 22, bottom: 66, containLabel: true },
    tooltip: { trigger: 'item',
      formatter: (params) => {
        const cell = cells[params.dataIndex];
        const best = cell.members.reduce((a, b) => (b.y > a.y ? b : a), cell.members[0]);
        return `<b>${fa(cell.members.length)} ترکیب در این خانه</b><br>`
          + `بازده حدود <b>${pct(y0 + cell.cy * dy)}</b> با افت حدود <b>${pct(x0 + cell.cx * dx)}</b><br>`
          + `بهترینشان: ${fa(best.combo.strategyName)} · <b>${pct(best.y)}</b>`;
      } },
    visualMap: { min: 1, max: most, calculable: true, orient: 'horizontal', left: 'center', bottom: 6,
      textStyle: { color: tokens.muted }, formatter: chartFormat.int,
      inRange: { color: [tokens.panel2, tokens.accent] } },
    xAxis: { type: 'value', name: 'بیشترین افت (٪)', nameLocation: 'middle', nameGap: 30,
      nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'value', name: 'بازده (٪)', nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [{
      type: 'custom',
      data: cells.map((cell) => ({ value: [x0 + cell.cx * dx, y0 + cell.cy * dy, cell.members.length],
        strategyId: cell.members[0]?.combo.strategyId ?? null })),
      renderItem: (params, api) => {
        const point = api.coord([api.value(0), api.value(1)]);
        const size = Math.max(5, Math.min(api.size([dx, 0])[0], api.size([0, dy])[1]) * 0.56);
        const corners = Array.from({ length: 6 }, (_, index) => {
          const angle = (Math.PI / 3) * index + Math.PI / 6;
          return [point[0] + size * Math.cos(angle), point[1] + size * Math.sin(angle)];
        });
        return { type: 'polygon', shape: { points: corners },
          style: api.style({ stroke: tokens.panel, lineWidth: 1 }) };
      },
    }],
  };
}

/** رگرسیون خطی: خط برازش روی ابر نقاط، با شیب در تولتیپ. */
export function regressionOption(analysis, tokens) {
  const rows = ranked(analysis).map((row) => ({
    x: finite(row.metrics.drawdown), y: finite(row.metrics.return), row,
  })).filter((row) => row.x !== null && row.y !== null);
  if (rows.length < 3) return null;
  const n = rows.length;
  const mx = rows.reduce((s, r) => s + r.x, 0) / n;
  const my = rows.reduce((s, r) => s + r.y, 0) / n;
  let num = 0, den = 0;
  for (const row of rows) { num += (row.x - mx) * (row.y - my); den += (row.x - mx) ** 2; }
  const slope = den > 0 ? num / den : 0;
  const intercept = my - slope * mx;
  const xs = rows.map((row) => row.x);
  const line = [Math.min(...xs), Math.max(...xs)].map((x) => [x, intercept + slope * x]);
  return {
    grid: { left: 62, right: 30, top: 22, bottom: 52, containLabel: true },
    tooltip: { trigger: 'item',
      formatter: (params) => {
        if (params.seriesIndex === 1) {
          return `<b>خط برازش</b><br>شیب: <b>${chartFormat.num(slope)}</b><br>`
            + `<i>${fa(slope > 0 ? 'افت بیشتر با بازده بیشتر همراه بوده' : 'افت بیشتر بازده بیشتری نیاورده')}</i>`;
        }
        const row = rows[params.dataIndex];
        const fitted = intercept + slope * row.x;
        return `<b>${fa(row.row.strategyName)}</b><br>بازده: <b>${pct(row.y)}</b><br>`
          + `افت: <b>${pct(row.x)}</b><br>`
          + `<i>${fa(row.y >= fitted ? 'بالای خط برازش — بیش از انتظار' : 'زیر خط برازش — کمتر از انتظار')}</i>`;
      } },
    xAxis: { type: 'value', name: 'بیشترین افت (٪)', nameLocation: 'middle', nameGap: 30,
      nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'value', name: 'بازده (٪)', nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [
      { type: 'scatter', symbolSize: 13,
        data: rows.map((row) => ({ value: [row.x, row.y], strategyId: row.row.strategyId })),
        itemStyle: { color: (p) => tone(tokens, (p.data.value || p.data)[1]), opacity: 0.8,
          borderColor: tokens.panel, borderWidth: 1.5 } },
      { type: 'line', data: line, showSymbol: false, silent: false,
        lineStyle: { color: tokens.ink, width: 2, type: 'dashed' } },
    ],
  };
}

/** شیب رتبه: جای هر استراتژی در روز اول در برابر روز آخر. */
export function rankSlopeOption(analysis, tokens) {
  const rows = ranked(analysis).map((row) => {
    const line = (row.path?.rank || []).filter((value) => finite(value) !== null);
    return line.length >= 2 ? { row, first: line[0], last: line[line.length - 1] } : null;
  }).filter(Boolean);
  if (!rows.length) return null;
  const most = Math.max(...rows.flatMap((item) => [item.first, item.last]));
  return {
    grid: { left: 50, right: 140, top: 26, bottom: 44, containLabel: true },
    tooltip: { trigger: 'item',
      formatter: (params) => {
        const item = rows[params.seriesIndex];
        const move = item.first - item.last;
        return `<b>${fa(item.row.strategyName)}</b><br>`
          + `رتبهٔ روز اول: <b>${fa(item.first)}</b><br>رتبهٔ روز آخر: <b>${fa(item.last)}</b><br>`
          + `<i>${fa(move > 0 ? `${move} پله بالا رفت` : move < 0 ? `${-move} پله پایین آمد` : 'جابه‌جا نشد')}</i>`;
      } },
    xAxis: { type: 'category', data: ['روز اول', 'روز آخر'].map(faDigits),
      axisLabel: { color: tokens.muted }, axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', inverse: true, min: 1, max: most,
      axisLabel: { color: tokens.muted, formatter: chartFormat.int },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: rows.map((item, index) => ({
      name: item.row.strategyName, type: 'line', symbolSize: 9,
      data: [item.first, item.last].map((value) => ({ value, strategyId: item.row.strategyId })),
      lineStyle: { width: 2, color: pick(tokens, index) }, itemStyle: { color: pick(tokens, index) },
      endLabel: { show: true, color: tokens.muted, fontSize: 10, formatter: (p) => fa(p.seriesName) },
      emphasis: { focus: 'series' },
    })),
  };
}
