// دستهٔ سوم نمودارهای سبد: الگو، تقویم، همبستگی و سهم.
//
// این‌ها همان دسته‌هایی‌اند که در کتابخانه‌های امروز «توزیع» و «رابطه»
// نامیده می‌شوند و در بیشتر داشبوردها جا می‌مانند، چون ساختنشان از یک
// خط ساده سخت‌تر است. برای کسی که گذشتهٔ بازار را برای یافتن الگو نگاه
// می‌کند، دقیقاً همین‌ها حرف می‌زنند.

import { fmt, faDigits } from './fmt.mjs';
import { chartFormat } from './chart-host.mjs';
import { fundedLegs, legPath, moneyPct, pctText, shareText, stepsOf } from './basket-charts.mjs';

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};
const label = (value) => faDigits(String(value ?? ''));
const tone = (tokens, value) => (finite(value) === null ? tokens.muted : value >= 0 ? tokens.gain : tokens.loss);

/** بازده تجمعی سبد بر حسب درصد، برای نمودارهایی که مسیر می‌خواهند. */
export const basketPath = (basket) => (basket?.path || []).map((point) => (
  point.totalPnlRial === null || !(basket.capitalRial > 0)
    ? null : (point.totalPnlRial / basket.capitalRial) * 100));

/** ضریب همبستگی پیرسون؛ اگر جفتِ معتبر کم باشد، `null`. */
export function pearson(a, b) {
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
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : null;
}

/**
 * ماتریس همبستگی گام‌های اعضا.
 *
 * برای سبد، مهم‌ترین نمودار ریسک است: دو عضوی که همبستگی نزدیک یک دارند
 * تنوع نمی‌سازند، هرچند اسمشان فرق کند.
 */
export function correlationOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (legs.length < 2) return null;
  const steps = legs.map((leg) => stepsOf(legPath(leg)));
  const cells = [];
  for (let y = 0; y < legs.length; y++) {
    for (let x = 0; x < legs.length; x++) {
      const value = x === y ? 1 : pearson(steps[x], steps[y]);
      if (value !== null) cells.push([x, y, Math.round(value * 1000) / 1000]);
    }
  }
  if (!cells.length) return null;
  return {
    grid: { left: 140, right: 20, top: 20, bottom: 130 },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const [x, y, value] = params.data.value || params.data;
        const near = Math.abs(value) > 0.8 ? 'تقریباً یکی حرکت می‌کنند — تنوعی نمی‌سازند'
          : Math.abs(value) < 0.2 ? 'کمابیش مستقل‌اند — تنوع واقعی' : 'همبستگی متوسط';
        return `<b>${faDigits(legs[y].strategyName)}</b><br><b>${faDigits(legs[x].strategyName)}</b><br>`
          + `همبستگی گام‌ها: <b>${chartFormat.num(value)}</b><br><i>${faDigits(near)}</i>`;
      },
    },
    visualMap: {
      min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 6,
      textStyle: { color: tokens.muted }, formatter: chartFormat.num,
      inRange: { color: [tokens.loss, tokens.panel2, tokens.gain] },
    },
    xAxis: { type: 'category', data: legs.map((leg) => faDigits(leg.strategyName)),
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true, width: 100, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } }, splitArea: { show: false } },
    yAxis: { type: 'category', data: legs.map((leg) => faDigits(leg.strategyName)),
      axisLabel: { color: tokens.muted, width: 130, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } }, splitArea: { show: false } },
    series: [{
      type: 'heatmap',
      data: cells.map((value) => ({ value, comboId: legs[value[1]].comboId })),
      label: { show: legs.length <= 8, color: tokens.ink,
        formatter: (p) => faDigits(fmt.pct((p.data.value || p.data)[2])) },
      itemStyle: { borderColor: tokens.panel, borderWidth: 1 },
      emphasis: { itemStyle: { borderColor: tokens.accent, borderWidth: 2 } },
    }],
  };
}

/** تقویم بازده دوره‌ای سبد — الگوی روزهای هفته و ماه، یک نگاه. */
export function calendarOption(basket, isoDates, tokens) {
  const steps = stepsOf(basketPath(basket));
  const cells = [];
  let span = 0;
  isoDates.forEach((iso, index) => {
    const value = steps[index];
    if (!iso || value === null) return;
    span = Math.max(span, Math.abs(value));
    cells.push([iso, value]);
  });
  if (cells.length < 2) return null;
  const years = [...new Set(cells.map((cell) => cell[0].slice(0, 4)))];
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params) => `<b>${label(params.data[0])}</b><br>گام این روز: <b>${pctText(params.data[1])}</b>`,
    },
    visualMap: {
      min: -span, max: span, calculable: true, orient: 'horizontal', left: 'center', bottom: 4,
      textStyle: { color: tokens.muted }, formatter: chartFormat.pct,
      inRange: { color: [tokens.loss, tokens.panel2, tokens.gain] },
    },
    calendar: years.map((year, index) => ({
      range: year, top: 40 + index * 130, left: 60, right: 20, cellSize: ['auto', 16],
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

/** توزیع تجمعی گام‌های سبد — «چند درصد دوره‌ها بدتر از این بودند؟» */
export function ecdfOption(basket, tokens) {
  const values = stepsOf(basketPath(basket)).filter((value) => value !== null).sort((a, b) => a - b);
  if (values.length < 3) return null;
  const points = values.map((value, index) => [value, ((index + 1) / values.length) * 100]);
  const median = values[Math.floor(values.length / 2)];
  return {
    grid: { left: 58, right: 26, top: 26, bottom: 52, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => {
        const [value, share] = rows[0]?.data || [];
        return `گام <b>${pctText(value)}</b><br>`
          + `<b>${pctText(share)}</b> دوره‌ها از این بدتر یا برابر بودند<br>`
          + `<i>${pctText(100 - share)} بهتر</i>`;
      },
    },
    xAxis: { type: 'value', name: 'گام دوره‌ای (٪)', nameLocation: 'middle', nameGap: 32,
      nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'value', max: 100, name: 'درصد تجمعی', nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [{
      type: 'line', step: 'end', data: points, showSymbol: false, smooth: false,
      lineStyle: { width: 2.2, color: tokens.accent },
      areaStyle: { opacity: 0.12, color: tokens.accent },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: tokens.muted, type: 'dashed' },
        label: { color: tokens.muted, formatter: () => `میانه ${fmt.pct(median)}٪` },
        data: [{ xAxis: median }] },
    }],
  };
}

/** ازدحام گام‌های اعضا — هر نقطه یک دوره، پخش‌شده تا روی هم نیفتد. */
export function swarmOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const points = [];
  legs.forEach((leg, y) => {
    const values = stepsOf(legPath(leg)).filter((value) => value !== null);
    // پخشِ عمودی از خودِ ترتیبِ نقطه می‌آید نه از تصادف: نمودار باید هر
    // بار عین دفعهٔ پیش کشیده شود، وگرنه مقایسهٔ دو نگاه ممکن نیست.
    const buckets = new Map();
    values.forEach((value) => {
      const key = Math.round(value * 4) / 4;
      const seen = buckets.get(key) || 0;
      buckets.set(key, seen + 1);
      const offset = ((seen % 2 === 0 ? 1 : -1) * Math.ceil(seen / 2)) * 0.09;
      points.push([value, y + offset, y, leg.comboId]);
    });
  });
  if (!points.length) return null;
  return {
    grid: { left: 150, right: 24, top: 24, bottom: 48, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const value = params.data.value || params.data;
        return `<b>${faDigits(legs[value[2]].strategyName)}</b><br>`
          + `گام یک دوره: <b>${pctText(value[0])}</b>`;
      },
    },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: legs.map((leg) => faDigits(leg.strategyName)),
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [{
      type: 'scatter', symbolSize: 8,
      data: points.map((value) => ({ value, comboId: value[3] })),
      itemStyle: { color: (p) => tone(tokens, (p.data.value || p.data)[0]), opacity: 0.68 },
    }],
  };
}

/** ماریمکو: عرض ستون سهم سرمایه، ارتفاعش بازده — سهم و اثر، با هم. */
export function marimekkoOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const total = legs.reduce((sum, leg) => sum + leg.deployedRial, 0) || 1;
  let cursor = 0;
  const boxes = legs.map((leg, index) => {
    const width = (leg.deployedRial / total) * 100;
    const value = leg.deployedRial > 0 && leg.finalPnlRial !== null
      ? (leg.finalPnlRial / leg.deployedRial) * 100 : 0;
    const box = { x0: cursor, x1: cursor + width, value, leg, index };
    cursor += width;
    return box;
  });
  return {
    grid: { left: 60, right: 24, top: 26, bottom: 52, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const box = boxes[params.dataIndex];
        return `<b>${faDigits(box.leg.strategyName)}</b><br>`
          + `سهم از سرمایهٔ درگیر: <b>${pctText(box.x1 - box.x0)}</b><br>`
          + `بازده این جزء: <b>${pctText(box.value)}</b><br>`
          + `سود یا زیان: <b>${moneyPct(box.leg.finalPnlRial, basket.capitalRial)}</b> از سرمایهٔ کل`;
      },
    },
    xAxis: { type: 'value', min: 0, max: 100, name: 'سهم از سرمایهٔ درگیر (٪)',
      nameLocation: 'middle', nameGap: 32, nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'value', name: 'بازده (٪)', nameTextStyle: { color: tokens.muted },
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [{
      type: 'custom',
      data: boxes.map((box) => ({ value: [box.x0, box.value, box.x1], comboId: box.leg.comboId })),
      renderItem: (params, api) => {
        const start = api.coord([api.value(0), api.value(1)]);
        const end = api.coord([api.value(2), 0]);
        const width = Math.max(1, end[0] - start[0]);
        return {
          type: 'rect',
          shape: { x: Math.min(start[0], end[0]), y: Math.min(start[1], end[1]),
            width, height: Math.abs(end[1] - start[1]) },
          style: api.style({ fill: api.value(1) >= 0 ? tokens.gain : tokens.loss, opacity: 0.72,
            stroke: tokens.panel, lineWidth: 1.5 }),
        };
      },
    }],
  };
}

/** قیف: از سرمایه تا آنچه واقعاً درگیر شد و آنچه ماند. */
export function funnelOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const ending = basket.summary?.finalEquityRial;
  const rows = [
    { name: 'سرمایهٔ اول دوره', value: basket.capitalRial },
    { name: 'پول واقعاً درگیر', value: basket.deployedRial },
    { name: 'ارزش پایان دوره', value: finite(ending) },
  ].filter((row) => finite(row.value) !== null);
  if (rows.length < 2) return null;
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params) => `<b>${label(params.name)}</b><br>`
        + `<b>${moneyPct(params.value, basket.capitalRial)}</b> از سرمایهٔ اول دوره`,
    },
    series: [{
      type: 'funnel', left: '12%', right: '12%', top: 20, bottom: 20,
      minSize: '32%', sort: 'none', gap: 4,
      label: { color: tokens.ink, position: 'inside',
        formatter: (p) => `${faDigits(p.name)} · ${fmt.pct((p.value / basket.capitalRial) * 100)}٪` },
      itemStyle: { borderColor: tokens.panel, borderWidth: 2 },
      data: rows.map((row, index) => ({ ...row,
        itemStyle: { color: tokens.palette[index % tokens.palette.length] } })),
    }],
  };
}

/** نرخ برد غلتان سبد — پایداری در طول زمان، نه یک عدد پایانی. */
export function rollingWinOption(basket, dateLabels, tokens, window = 5) {
  const steps = stepsOf(basketPath(basket));
  const out = steps.map((_, index) => {
    if (index + 1 < window) return null;
    const slice = steps.slice(index + 1 - window, index + 1).filter((value) => value !== null);
    if (slice.length < window) return null;
    return (slice.filter((value) => value > 0).length / slice.length) * 100;
  });
  if (!out.some((value) => value !== null)) return null;
  return {
    grid: { left: 56, right: 24, top: 26, bottom: 52, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => `<b>${label(dateLabels[rows[0]?.dataIndex] || '')}</b><br>`
        + `نرخ برد ${label(window)} دورهٔ اخیر: <b>${pctText(rows[0]?.value)}</b><br>`
        + `گام همین دوره: <b>${pctText(steps[rows[0]?.dataIndex])}</b>`,
    },
    xAxis: { type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', min: 0, max: 100,
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [{
      type: 'line', data: out, smooth: true, showSymbol: false, connectNulls: false,
      lineStyle: { width: 2.2, color: tokens.accent },
      areaStyle: { opacity: 0.12, color: tokens.accent },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: tokens.muted, type: 'dashed' },
        label: { color: tokens.muted, formatter: 'سر به سر' }, data: [{ yAxis: 50 }] },
    }],
  };
}

/** سهم هر عضو از ریسک سبد، در برابر سهمش از سرمایه. */
export function riskShareOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const risk = legs.map((leg) => {
    const steps = stepsOf(leg.pnl.map(finite)).filter((value) => value !== null);
    if (steps.length < 2) return 0;
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    return Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / steps.length);
  });
  const riskTotal = risk.reduce((a, b) => a + b, 0);
  if (!(riskTotal > 0)) return null;
  const names = legs.map((leg) => leg.strategyName);
  return {
    legend: { top: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 150, right: 30, top: 44, bottom: 44, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (rows) => {
        const at = rows[0]?.dataIndex ?? 0;
        const capitalShare = (legs[at].deployedRial / basket.deployedRial) * 100;
        const riskShare = (risk[at] / riskTotal) * 100;
        const verdict = riskShare > capitalShare * 1.25 ? 'بیش از سهمش ریسک می‌آورد'
          : riskShare < capitalShare * 0.8 ? 'کمتر از سهمش ریسک می‌آورد' : 'ریسک و سرمایه‌اش هم‌اندازه‌اند';
        return `<b>${faDigits(names[at])}</b><br>`
          + `سهم از سرمایهٔ درگیر: <b>${pctText(capitalShare)}</b><br>`
          + `سهم از نوسان سبد: <b>${pctText(riskShare)}</b><br><i>${faDigits(verdict)}</i>`;
      },
    },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: names.map(faDigits),
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [
      { name: 'سهم از سرمایه', type: 'bar', barMaxWidth: 16,
        data: legs.map((leg) => (leg.deployedRial / basket.deployedRial) * 100),
        itemStyle: { color: tokens.accent, borderRadius: 3 } },
      { name: 'سهم از نوسان', type: 'bar', barMaxWidth: 16,
        data: risk.map((value, index) => ({ value: (value / riskTotal) * 100, comboId: legs[index].comboId })),
        itemStyle: { color: tokens.warn, borderRadius: 3 } },
    ],
  };
}
