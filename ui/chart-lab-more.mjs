// آزمایشگاه نمودار — سلسله‌مراتب، چندسنجه‌ای، و تقویم.

import { fmt, faDigits } from './fmt.mjs';
import { chartFormat } from './chart-host.mjs';
import { groupBy, quantile, ranked, usable } from './chart-lab.mjs';
import { corr } from './chart-lab-flow.mjs';

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};
const pct = (value) => (finite(value) === null ? '—' : `${fmt.pct(value)}٪`);
const fa = (value) => faDigits(String(value ?? ''));
const tone = (t, value) => (finite(value) === null ? t.muted : value >= 0 ? t.gain : t.loss);
const pick = (t, index) => t.palette[index % t.palette.length];

/** آفتاب‌نما: خانواده ← استراتژی ← ترکیب، سه پله در یک شکل. */
export function sunburstOption(analysis, tokens) {
  const rows = usable(analysis);
  if (!rows.length) return null;
  const families = groupBy(rows, 'groupName');
  return {
    tooltip: { trigger: 'item',
      formatter: (params) => `<b>${fa(params.name)}</b><br>`
        + `${fa(params.value)} ترکیب · <b>${pct((params.value / rows.length) * 100)}</b> از کل` },
    series: [{
      type: 'sunburst', radius: [14, '94%'], sort: null, emphasis: { focus: 'ancestor' },
      label: { color: tokens.ink, formatter: (p) => fa(p.name), minAngle: 10 },
      itemStyle: { borderColor: tokens.panel, borderWidth: 1.5 },
      data: [...families].map(([name, members], index) => ({
        name, itemStyle: { color: pick(tokens, index) },
        strategyId: members[0]?.strategyId ?? null,
        children: [...groupBy(members, 'strategyName')].map(([strategy, list]) => ({
          name: strategy, value: list.length, strategyId: list[0]?.strategyId ?? null,
        })),
      })),
    }],
  };
}

/** درخت‌نقشه: مساحت شمار ترکیب، رنگ میانهٔ بازده. */
export function treemapOption(analysis, tokens) {
  const families = [...groupBy(usable(analysis), 'groupName')];
  if (!families.length) return null;
  const rows = families.map(([name, members]) => {
    const values = members.map((combo) => finite(combo.series.finalPct))
      .filter((v) => v !== null).sort((a, b) => a - b);
    return { name, members, median: quantile(values, 0.5) ?? 0 };
  });
  const span = Math.max(1, ...rows.map((row) => Math.abs(row.median)));
  return {
    tooltip: { trigger: 'item',
      formatter: (params) => `<b>${fa(params.name)}</b><br>`
        + `${fa(params.data.count)} ترکیب<br>میانهٔ بازده: <b>${pct(params.data.median)}</b>` },
    visualMap: { min: -span, max: span, calculable: true, orient: 'horizontal', left: 'center', bottom: 4,
      dimension: 1, textStyle: { color: tokens.muted }, formatter: chartFormat.pct,
      inRange: { color: [tokens.loss, tokens.panel2, tokens.gain] } },
    series: [{
      type: 'treemap', roam: false, nodeClick: false, top: 8, bottom: 44, left: 8, right: 8,
      breadcrumb: { show: false }, label: { color: tokens.ink, formatter: (p) => fa(p.name) },
      itemStyle: { borderColor: tokens.panel, borderWidth: 2, gapWidth: 2 },
      data: rows.map((row) => ({ name: row.name, value: [row.members.length, row.median],
        count: row.members.length, median: row.median,
        strategyId: row.members[0]?.strategyId ?? null })),
    }],
  };
}

/** مختصات موازی: چند سنجه، هر استراتژی یک خط شکسته. */
export function parallelOption(analysis, metrics, tokens) {
  const rows = ranked(analysis).slice(0, 20);
  const keys = (metrics || []).filter((metric) => rows.some((row) => finite(row.metrics[metric.id]) !== null));
  if (rows.length < 2 || keys.length < 3) return null;
  return {
    parallelAxis: keys.map((metric, index) => ({
      dim: index, name: fa(metric.label),
      nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted }, axisLine: { lineStyle: { color: tokens.line } },
      // محور معکوس برای سنجه‌هایی که «کمتر بهتر» است، وگرنه خطِ خوب و بد
      // در یک جهت می‌افتند و شکل نمودار دروغ می‌گوید.
      inverse: metric.better === 'low',
    })),
    parallel: { left: 60, right: 60, top: 46, bottom: 30,
      parallelAxisDefault: { type: 'value' } },
    tooltip: { trigger: 'item',
      formatter: (params) => `<b>${fa(rows[params.dataIndex].strategyName)}</b><br>`
        + keys.map((metric, index) => `${fa(metric.label)}: <b>${
          metric.unit === 'pct' ? pct(params.value[index]) : chartFormat.num(params.value[index])}</b>`).join('<br>') },
    series: [{
      type: 'parallel', smooth: true, lineStyle: { width: 1.6, opacity: 0.66 },
      emphasis: { lineStyle: { width: 3, opacity: 1 } },
      data: rows.map((row, index) => ({
        value: keys.map((metric) => finite(row.metrics[metric.id])),
        strategyId: row.strategyId,
        lineStyle: { color: pick(tokens, index) },
      })),
    }],
  };
}

/** ماتریس همبستگی استراتژی‌ها بر گام روزانه. */
export function strategyCorrOption(analysis, tokens) {
  const rows = ranked(analysis).slice(0, 14);
  if (rows.length < 2) return null;
  const steps = rows.map((row) => row.path?.step || []);
  const cells = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows.length; x++) {
      const value = x === y ? 1 : corr(steps[x], steps[y]);
      if (value !== null) cells.push({ value: [x, y, Math.round(value * 1000) / 1000], strategyId: rows[y].strategyId });
    }
  }
  if (!cells.length) return null;
  return {
    grid: { left: 150, right: 20, top: 20, bottom: 140 },
    tooltip: { trigger: 'item',
      formatter: (params) => {
        const [x, y, value] = params.data.value;
        return `<b>${fa(rows[y].strategyName)}</b><br><b>${fa(rows[x].strategyName)}</b><br>`
          + `همبستگی گام روزانه: <b>${chartFormat.num(value)}</b><br>`
          + `<i>${fa(Math.abs(value) > 0.8 ? 'تقریباً یکی حرکت می‌کنند'
            : Math.abs(value) < 0.2 ? 'کمابیش مستقل‌اند' : 'همبستگی متوسط')}</i>`;
      } },
    visualMap: { min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 6,
      textStyle: { color: tokens.muted }, formatter: chartFormat.num,
      inRange: { color: [tokens.loss, tokens.panel2, tokens.gain] } },
    xAxis: { type: 'category', data: rows.map((row) => fa(row.strategyName)), splitArea: { show: false },
      axisLabel: { color: tokens.muted, rotate: 50, hideOverlap: true, width: 110, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'category', data: rows.map((row) => fa(row.strategyName)), splitArea: { show: false },
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [{ type: 'heatmap', data: cells,
      itemStyle: { borderColor: tokens.panel, borderWidth: 1 },
      emphasis: { itemStyle: { borderColor: tokens.accent, borderWidth: 2 } } }],
  };
}

/** نقشهٔ حرارتی سنجه × استراتژی، همه بر مقیاس صدکی مشترک. */
export function metricHeatOption(analysis, metrics, tokens) {
  const rows = ranked(analysis).slice(0, 16);
  const keys = (metrics || []).filter((metric) => rows.some((row) => finite(row.metrics[metric.id]) !== null));
  if (!rows.length || !keys.length) return null;
  const cells = [];
  keys.forEach((metric, x) => {
    const values = rows.map((row) => finite(row.metrics[metric.id])).filter((v) => v !== null).sort((a, b) => a - b);
    rows.forEach((row, y) => {
      const raw = finite(row.metrics[metric.id]);
      if (raw === null) return;
      // صدک، نه خودِ عدد: سنجه‌ها واحدهای متفاوت دارند و بی مقیاسِ
      // مشترک، رنگ‌ها بی‌معنا کنار هم می‌نشینند.
      let below = 0;
      for (const value of values) if (value < raw) below += 1;
      const rank = (below / Math.max(1, values.length - 1)) * 100;
      cells.push({ value: [x, y, Math.round(metric.better === 'low' ? 100 - rank : rank)],
        raw, strategyId: row.strategyId });
    });
  });
  if (!cells.length) return null;
  return {
    grid: { left: 150, right: 20, top: 20, bottom: 120 },
    tooltip: { trigger: 'item',
      formatter: (params) => {
        const [x, y, score] = params.data.value;
        return `<b>${fa(rows[y].strategyName)}</b><br>${fa(keys[x].label)}: `
          + `<b>${keys[x].unit === 'pct' ? pct(params.data.raw) : chartFormat.num(params.data.raw)}</b><br>`
          + `صدک در میان استراتژی‌ها: <b>${fa(score)}</b>`;
      } },
    visualMap: { min: 0, max: 100, calculable: true, orient: 'horizontal', left: 'center', bottom: 6,
      textStyle: { color: tokens.muted }, formatter: chartFormat.int,
      inRange: { color: [tokens.loss, tokens.panel2, tokens.gain] } },
    xAxis: { type: 'category', data: keys.map((metric) => fa(metric.label)), splitArea: { show: false },
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'category', data: rows.map((row) => fa(row.strategyName)), splitArea: { show: false },
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [{ type: 'heatmap', data: cells,
      itemStyle: { borderColor: tokens.panel, borderWidth: 1 },
      emphasis: { itemStyle: { borderColor: tokens.accent, borderWidth: 2 } } }],
  };
}

/** تقویم گام نماد پایه — بستر بازار، جدا از استراتژی‌ها. */
export function baseCalendarOption(analysis, isoDates, tokens) {
  const base = (analysis?.baseSeries || []).map(finite);
  const cells = [];
  let span = 0, previous = null;
  isoDates.forEach((iso, index) => {
    const value = base[index];
    if (!iso || value === null) return;
    const step = previous === null ? value : value - previous;
    previous = value;
    span = Math.max(span, Math.abs(step));
    cells.push([iso, step]);
  });
  if (cells.length < 2) return null;
  const years = [...new Set(cells.map((cell) => cell[0].slice(0, 4)))];
  return {
    tooltip: { trigger: 'item',
      formatter: (params) => `<b>${fa(params.data[0])}</b><br>گام نماد پایه: <b>${pct(params.data[1])}</b>` },
    visualMap: { min: -span, max: span, calculable: true, orient: 'horizontal', left: 'center', bottom: 4,
      textStyle: { color: tokens.muted }, formatter: chartFormat.pct,
      inRange: { color: [tokens.loss, tokens.panel2, tokens.gain] } },
    calendar: years.map((year, index) => ({
      range: year, top: 36 + index * 128, left: 60, right: 20, cellSize: ['auto', 16],
      itemStyle: { color: tokens.panel, borderColor: tokens.line, borderWidth: 1 },
      splitLine: { lineStyle: { color: tokens.line } },
      dayLabel: { color: tokens.muted, nameMap: ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'] },
      monthLabel: { color: tokens.muted }, yearLabel: { color: tokens.muted },
    })),
    series: years.map((year, index) => ({
      type: 'heatmap', coordinateSystem: 'calendar', calendarIndex: index,
      data: cells.filter((cell) => cell[0].startsWith(year)),
    })),
  };
}

/** توزیع تجمعی چند خانواده روی یک محور — مقایسهٔ کاملِ شکل. */
export function familyEcdfOption(analysis, tokens) {
  const families = [...groupBy(usable(analysis), 'groupName')].filter(([, members]) => members.length >= 3);
  if (families.length < 2) return null;
  return {
    legend: { top: 0, type: 'scroll', textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 58, right: 26, top: 44, bottom: 50, containLabel: true },
    tooltip: { trigger: 'axis',
      formatter: (params) => params.map((row) => `${row.marker} ${fa(row.seriesName)}: `
        + `<b>${pct(row.value[1])}</b> ترکیب‌ها زیر ${pct(row.value[0])}`).join('<br>') },
    xAxis: { type: 'value', name: 'بازده (٪)', nameLocation: 'middle', nameGap: 30,
      nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'value', max: 100, axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: families.map(([name, members], index) => {
      const values = members.map((combo) => finite(combo.series.finalPct))
        .filter((v) => v !== null).sort((a, b) => a - b);
      return { name, type: 'line', step: 'end', showSymbol: false, triggerLineEvent: true,
        data: values.map((value, at) => ({ value: [value, ((at + 1) / values.length) * 100],
          strategyId: members[0]?.strategyId ?? null })),
        lineStyle: { width: 2, color: pick(tokens, index) }, itemStyle: { color: pick(tokens, index) },
        emphasis: { focus: 'series' } };
    }),
  };
}

/** جعبه‌ای گام روزانهٔ خانواده‌ها — پراکندگی روزانه، نه پایانی. */
export function familyBoxOption(analysis, tokens) {
  const families = [...groupBy(usable(analysis), 'groupName')];
  const boxes = [], names = [], keep = [];
  for (const [name, members] of families) {
    const values = members.flatMap((combo) => (combo.series.stepPct || []).map(finite))
      .filter((value) => value !== null).sort((a, b) => a - b);
    if (values.length < 5) continue;
    boxes.push([values[0], quantile(values, 0.25), quantile(values, 0.5),
      quantile(values, 0.75), values[values.length - 1]]);
    names.push(name);
    keep.push(members[0]?.strategyId ?? null);
  }
  if (!boxes.length) return null;
  return {
    grid: { left: 150, right: 24, top: 20, bottom: 46, containLabel: true },
    tooltip: { trigger: 'item',
      formatter: (params) => {
        const [low, q1, median, q3, high] = (params.data.value || params.data).slice(0, 5);
        return `<b>${fa(names[params.dataIndex])}</b><br>`
          + `بیشینه: <b>${pct(high)}</b><br>چارک بالا: <b>${pct(q3)}</b><br>`
          + `میانه: <b>${pct(median)}</b><br>چارک پایین: <b>${pct(q1)}</b><br>`
          + `کمینه: <b>${pct(low)}</b><br><i>پهنای چارکی ${pct(q3 - q1)}</i>`;
      } },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: names.map(faDigits),
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [{ type: 'boxplot', boxWidth: [8, 26],
      data: boxes.map((value, index) => ({ value, strategyId: keep[index] })),
      itemStyle: { color: tokens.accentSoft, borderColor: tokens.accent } }],
  };
}

/** شبکهٔ شباهت: استراتژی‌هایی که با هم حرکت می‌کنند، کنار هم می‌نشینند. */
export function similarityGraphOption(analysis, tokens) {
  const rows = ranked(analysis).slice(0, 18);
  if (rows.length < 3) return null;
  const steps = rows.map((row) => row.path?.step || []);
  const links = [];
  for (let a = 0; a < rows.length; a++) {
    for (let b = a + 1; b < rows.length; b++) {
      const value = corr(steps[a], steps[b]);
      if (value === null || value < 0.55) continue;
      links.push({ source: rows[a].strategyName, target: rows[b].strategyName,
        value: Math.round(value * 100) / 100,
        lineStyle: { width: 1 + (value - 0.55) * 8, opacity: 0.4 } });
    }
  }
  return {
    tooltip: { trigger: 'item',
      formatter: (params) => (params.dataType === 'edge'
        ? `<b>${fa(params.data.source)}</b> و <b>${fa(params.data.target)}</b><br>`
          + `هم‌حرکتی: <b>${chartFormat.num(params.data.value)}</b>`
        : `<b>${fa(params.name)}</b><br>نمره: <b>${chartFormat.num(params.data.score)}</b><br>`
          + `بازده: <b>${pct(params.data.ret)}</b>`) },
    series: [{
      type: 'graph', layout: 'force', roam: false, animation: false, layoutAnimation: false,
      force: { repulsion: 260, gravity: 0.1, edgeLength: 90, layoutAnimation: false },
      label: { show: true, color: tokens.ink, fontSize: 10, formatter: (p) => fa(p.name) },
      emphasis: { focus: 'adjacency' },
      data: rows.map((row, index) => ({
        name: row.strategyName, strategyId: row.strategyId,
        score: row.score, ret: row.metrics.return,
        symbolSize: 14 + (finite(row.score) ?? 0) * 0.28,
        itemStyle: { color: pick(tokens, index) },
      })),
      links,
    }],
  };
}

/** عقربهٔ سلامت بازار: چند درصد ترکیب‌ها در این بازه سود دادند. */
export function marketGaugeOption(analysis, tokens) {
  const rows = usable(analysis);
  if (!rows.length) return null;
  const green = rows.filter((combo) => combo.series.finalPct > 0).length;
  const share = (green / rows.length) * 100;
  return {
    tooltip: { trigger: 'item',
      formatter: () => `<b>${fa(green)}</b> از <b>${fa(rows.length)}</b> ترکیب سودده<br>`
        + `<b>${pct(share)}</b><br>`
        + `<i>${fa(share > 60 ? 'بازهٔ مساعد برای بیشتر استراتژی‌ها'
          : share < 40 ? 'بازهٔ سخت — بیشتر ترکیب‌ها زیان دادند' : 'بازهٔ دوسویه')}</i>` },
    series: [{
      type: 'gauge', min: 0, max: 100, startAngle: 200, endAngle: -20,
      radius: '92%', center: ['50%', '62%'], splitNumber: 5,
      progress: { show: true, width: 18, itemStyle: { color: tone(tokens, share - 50) } },
      axisLine: { lineStyle: { width: 18, color: [[1, tokens.panel2]] } },
      axisTick: { lineStyle: { color: tokens.line } }, splitLine: { lineStyle: { color: tokens.line } },
      axisLabel: { color: tokens.muted, distance: 24, formatter: (value) => fa(Math.round(value)) },
      pointer: { itemStyle: { color: tone(tokens, share - 50) } },
      anchor: { show: true, size: 14, itemStyle: { color: tokens.panel, borderColor: tokens.line, borderWidth: 2 } },
      detail: { valueAnimation: false, color: tone(tokens, share - 50), fontSize: 24, offsetCenter: [0, '42%'],
        formatter: (value) => `${faDigits(fmt.pct(value))}٪` },
      data: [{ value: share }],
    }],
  };
}
