// نمودارهای ترکیب، ریسک و توزیع تب «سبد فرضی».
//
// دسته‌بندی از بررسی کتابخانه‌های نموداری امروز آمده — همان تقسیمی که
// nivo، Vega-Lite، Observable Plot، Highcharts و amCharts کم‌وبیش مشترک
// دارند: مقایسه، سهم از کل، توزیع، رابطه، جریان، و انحراف. هر نمودار
// اینجا زیر یکی از آن دسته‌هاست، نه چون قشنگ است چون به سؤالی جواب
// می‌دهد که بقیه نمی‌دهند.

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

// ═══════════════════ ج. سهم از کل ═══════════════════

/** جریان سرمایه: سرمایه ← اجزا ← ارزش پایانی، با درصد در تولتیپ. */
export function flowOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const capitalName = 'سرمایهٔ اول دوره';
  const endName = 'ارزش پایان دوره';
  const nodes = [{ name: capitalName }, { name: endName }];
  const links = [];
  const wiped = [];
  for (const leg of legs) {
    const name = `${leg.strategyName} · ${fmt.int(leg.contracts)} قرارداد`;
    nodes.push({ name, comboId: leg.comboId });
    links.push({ source: capitalName, target: name, value: leg.deployedRial, comboId: leg.comboId });
    const ending = leg.finalPnlRial === null ? null : leg.deployedRial + leg.finalPnlRial;
    if (ending === null) continue;
    if (ending > 0) links.push({ source: name, target: endName, value: ending, comboId: leg.comboId });
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
        ? `${label(params.data.source)} ← ${label(params.data.target)}<br>`
          + `<b>${moneyPct(params.data.value, basket.capitalRial)}</b> از سرمایهٔ اول دوره`
        : `<b>${label(params.name)}</b><br><b>${moneyPct(params.value, basket.capitalRial)}</b>`),
    },
    series: [{
      type: 'sankey', nodeAlign: 'left', right: 150, left: 24, top: 24, bottom: 24,
      emphasis: { focus: 'adjacency' }, nodeGap: 12, nodeWidth: 16,
      label: { color: tokens.ink, formatter: (params) => faDigits(params.name) },
      lineStyle: { color: 'gradient', opacity: 0.42, curveness: 0.5 },
      data: nodes, links, wiped,
    }],
  };
}

/** آفتاب‌نمای خانواده ← استراتژی ← ترکیب، بر پول درگیر. */
export function sunburstOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const families = new Map();
  for (const leg of legs) {
    const key = leg.groupName || 'بدون خانواده';
    if (!families.has(key)) families.set(key, new Map());
    const inner = families.get(key);
    if (!inner.has(leg.strategyName)) inner.set(leg.strategyName, []);
    inner.get(leg.strategyName).push(leg);
  }
  const data = [...families].map(([name, inner], index) => ({
    name,
    itemStyle: { color: tokens.palette[index % tokens.palette.length] },
    children: [...inner].map(([strategy, rows]) => ({
      name: strategy,
      children: rows.map((leg) => ({
        name: `${fmt.int(leg.contracts)} قرارداد`, value: leg.deployedRial, comboId: leg.comboId,
      })),
    })),
  }));
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params) => `<b>${label(params.name)}</b><br>`
        + `پول درگیر: <b>${moneyPct(params.value, basket.deployedRial)}</b> از کل درگیر`,
    },
    series: [{
      type: 'sunburst', data, radius: [16, '92%'], sort: null,
      emphasis: { focus: 'ancestor' },
      label: { color: tokens.ink, formatter: (p) => faDigits(p.name), minAngle: 12 },
      itemStyle: { borderColor: tokens.panel, borderWidth: 1.5 },
      levels: [{}, { r0: 16, r: '42%' }, { r0: '42%', r: '70%' }, { r0: '70%', r: '92%' }],
    }],
  };
}

/** درخت‌نقشهٔ پول درگیر، رنگ‌شده با بازده هر جزء. */
export function weightTreeOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const returns = legs.map((leg) => (leg.finalPnlRial === null || !(leg.deployedRial > 0)
    ? null : (leg.finalPnlRial / leg.deployedRial) * 100));
  const span = Math.max(1, ...returns.map((value) => Math.abs(value ?? 0)));
  return {
    tooltip: {
      trigger: 'item',
      formatter: (params) => `<b>${label(params.name)}</b><br>`
        + `پول درگیر: <b>${moneyPct(params.value, basket.deployedRial)}</b> از کل درگیر<br>`
        + `بازده این جزء: <b>${pctText(params.data.pct)}</b>`,
    },
    visualMap: {
      min: -span, max: span, calculable: true, orient: 'horizontal', left: 'center', bottom: 4,
      dimension: 1, textStyle: { color: tokens.muted }, formatter: chartFormat.pct,
      inRange: { color: [tokens.loss, tokens.panel2, tokens.gain] },
    },
    series: [{
      type: 'treemap', roam: false, nodeClick: false, top: 8, bottom: 44, left: 8, right: 8,
      breadcrumb: { show: false }, label: { color: tokens.ink, formatter: (p) => faDigits(p.name) },
      itemStyle: { borderColor: tokens.panel, borderWidth: 2, gapWidth: 2 },
      data: legs.map((leg, index) => ({
        name: leg.strategyName, value: [leg.deployedRial, returns[index] ?? 0],
        pct: returns[index], comboId: leg.comboId,
      })),
    }],
  };
}

/** آبشار: از سرمایهٔ اول دوره، جزء به جزء، تا ارزش پایانی. */
export function waterfallOption(basket, tokens) {
  const legs = fundedLegs(basket).filter((leg) => leg.finalPnlRial !== null);
  if (!legs.length) return null;
  const names = ['سرمایهٔ اول دوره', ...legs.map((leg) => leg.strategyName), 'ارزش پایان دوره'];
  const base = [0];
  const bars = [basket.capitalRial];
  let running = basket.capitalRial;
  for (const leg of legs) {
    const value = leg.finalPnlRial;
    base.push(value >= 0 ? running : running + value);
    bars.push(Math.abs(value));
    running += value;
  }
  base.push(0);
  bars.push(running);
  return {
    grid: { left: 76, right: 24, top: 28, bottom: 74, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (rows) => {
        const at = rows[0]?.dataIndex ?? 0;
        if (at === 0) return `<b>سرمایهٔ اول دوره</b><br><b>${chartFormat.money(basket.capitalRial)}</b>`;
        if (at === names.length - 1) {
          return `<b>ارزش پایان دوره</b><br><b>${moneyPct(running, basket.capitalRial)}</b> از سرمایهٔ اول`;
        }
        const leg = legs[at - 1];
        return `<b>${faDigits(leg.strategyName)}</b><br>`
          + `سود یا زیان: <b>${moneyPct(leg.finalPnlRial, basket.capitalRial)}</b> از سرمایهٔ کل<br>`
          + `بازده خودِ جزء: <b>${pctText(leg.deployedRial > 0 ? (leg.finalPnlRial / leg.deployedRial) * 100 : null)}</b>`;
      },
    },
    xAxis: { type: 'category', data: names.map(faDigits),
      axisLabel: { color: tokens.muted, rotate: 40, hideOverlap: true, width: 90, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', scale: true, axisLabel: { color: tokens.muted, formatter: chartFormat.money },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [
      { type: 'bar', stack: 'آبشار', silent: true, data: base, itemStyle: { color: 'transparent' } },
      { type: 'bar', stack: 'آبشار', barMaxWidth: 46,
        // شناسه روی خودِ خانه می‌نشیند، نه روی سری: پارامترهای کلیکِ
        // ECharts فقط `data` را می‌دهند و `seriesModel` در آن‌ها نیست.
        data: bars.map((value, index) => ({ value, comboId: legs[index - 1]?.comboId ?? null })),
        itemStyle: {
          borderRadius: 3,
          color: (p) => (p.dataIndex === 0 || p.dataIndex === names.length - 1
            ? tokens.accent : tone(tokens, legs[p.dataIndex - 1]?.finalPnlRial)),
        },
        },
    ],
  };
}

/** دمبل: بودجهٔ هدف در برابر پولی که واقعاً درگیر شد. */
export function dumbbellOption(basket, tokens) {
  const legs = (basket?.legs || []);
  if (!legs.length) return null;
  const names = legs.map((leg) => leg.strategyName || '—');
  return {
    legend: { top: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 150, right: 40, top: 44, bottom: 44, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (rows) => {
        const at = rows[0]?.dataIndex ?? 0;
        const leg = legs[at];
        return `<b>${faDigits(leg.strategyName || '—')}</b><br>`
          + `بودجهٔ هدف: <b>${moneyPct(leg.targetRial, basket.capitalRial)}</b><br>`
          + `پول درگیر: <b>${chartFormat.money(leg.deployedRial)}</b><br>`
          + `نقد بی‌کار: <b>${chartFormat.money(leg.idleRial)}</b> · ${shareText(leg.idleRial, leg.targetRial)} از سهم<br>`
          + (leg.ok ? `<i>${label(leg.contracts)} قرارداد</i>` : `<i>${faDigits(leg.why || '')}</i>`);
      },
    },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.money },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: names.map(faDigits),
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [
      { name: 'بودجهٔ هدف', type: 'bar', data: legs.map((leg) => leg.targetRial),
        barGap: '-100%', barMaxWidth: 18,
        itemStyle: { color: tokens.panel2, borderColor: tokens.line, borderWidth: 1, borderRadius: 3 } },
      { name: 'پول درگیر', type: 'bar', barMaxWidth: 18,
        data: legs.map((leg) => ({ value: leg.deployedRial, comboId: leg.comboId })),
        itemStyle: { color: tokens.accent, borderRadius: 3 } },
    ],
  };
}

// ═══════════════════ د. ریسک و رابطه ═══════════════════

/** ریسک در برابر بازده — اندازهٔ حباب، پول درگیر. */
export function riskReturnOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const points = legs.map((leg) => {
    const path = legPath(leg);
    let peak = 0, worst = 0;
    for (const value of path) {
      if (value === null) continue;
      peak = Math.max(peak, value);
      worst = Math.min(worst, value - peak);
    }
    const final = leg.deployedRial > 0 && leg.finalPnlRial !== null
      ? (leg.finalPnlRial / leg.deployedRial) * 100 : null;
    return { leg, worst, final };
  }).filter((row) => row.final !== null);
  if (!points.length) return null;
  const maxMoney = Math.max(...points.map((row) => row.leg.deployedRial));
  return {
    grid: { left: 64, right: 30, top: 30, bottom: 56, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const row = points[params.dataIndex];
        return `<b>${faDigits(row.leg.strategyName)}</b><br>`
          + `بازده جزء: <b>${pctText(row.final)}</b><br>`
          + `بیشترین افت: <b>${pctText(row.worst)}</b><br>`
          + `پول درگیر: <b>${moneyPct(row.leg.deployedRial, basket.deployedRial)}</b> از کل درگیر<br>`
          + `سود به درد: <b>${chartFormat.num(row.worst < 0 ? row.final / Math.abs(row.worst) : null)}</b>`;
      },
    },
    xAxis: { name: 'بیشترین افت (٪)', nameLocation: 'middle', nameGap: 34,
      nameTextStyle: { color: tokens.muted }, type: 'value',
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { name: 'بازده (٪)', nameTextStyle: { color: tokens.muted }, type: 'value',
      axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [{
      type: 'scatter',
      symbolSize: (value, params) => 14 + 34 * Math.sqrt((points[params.dataIndex].leg.deployedRial || 0) / (maxMoney || 1)),
      data: points.map((row) => ({ value: [row.worst, row.final], comboId: row.leg.comboId })),
      itemStyle: { color: (p) => tone(tokens, points[p.dataIndex].final), opacity: 0.78,
        borderColor: tokens.panel, borderWidth: 1.5 },
      label: { show: true, position: 'top', color: tokens.muted, fontSize: 10,
        formatter: (p) => faDigits(points[p.dataIndex].leg.strategyName) },
      markLine: { silent: true, symbol: 'none', lineStyle: { color: tokens.line, type: 'dashed' },
        data: [{ yAxis: 0 }] },
    }],
  };
}

/** جعبه‌ای گام روزانهٔ هر عضو — پراکندگی، نه فقط میانگین. */
export function memberBoxOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const boxes = [];
  const names = [];
  const kept = [];
  for (const leg of legs) {
    const values = stepsOf(legPath(leg)).filter((value) => value !== null).sort((a, b) => a - b);
    if (values.length < 3) continue;
    const at = (q) => {
      const position = (values.length - 1) * q;
      const low = Math.floor(position), high = Math.ceil(position);
      return values[low] + (values[high] - values[low]) * (position - low);
    };
    boxes.push([values[0], at(0.25), at(0.5), at(0.75), values[values.length - 1]]);
    names.push(leg.strategyName);
    kept.push(leg);
  }
  if (!boxes.length) return null;
  return {
    grid: { left: 150, right: 24, top: 26, bottom: 46, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const [low, q1, median, q3, high] = (params.data.value || params.data).slice(0, 5);
        return `<b>${faDigits(names[params.dataIndex])}</b><br>`
          + `بیشینهٔ گام: <b>${pctText(high)}</b><br>چارک بالا: <b>${pctText(q3)}</b><br>`
          + `میانه: <b>${pctText(median)}</b><br>چارک پایین: <b>${pctText(q1)}</b><br>`
          + `کمینهٔ گام: <b>${pctText(low)}</b><br>`
          + `<i>پهنای چارکی ${pctText(q3 - q1)}</i>`;
      },
    },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: names.map(faDigits),
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [{
      type: 'boxplot', boxWidth: [8, 26],
      data: boxes.map((value, index) => ({ value, comboId: kept[index].comboId })),
      itemStyle: { color: tokens.accentSoft, borderColor: tokens.accent },
    }],
  };
}

/** توزیع گام روزانهٔ سبد — هیستوگرام با مرزهای مشترک. */
export function stepHistogramOption(basket, tokens) {
  const capital = basket?.capitalRial;
  const cumulative = (basket?.path || []).map((point) => (point.totalPnlRial === null || !(capital > 0)
    ? null : (point.totalPnlRial / capital) * 100));
  const values = stepsOf(cumulative).filter((value) => value !== null);
  if (values.length < 3) return null;
  const low = Math.min(...values), high = Math.max(...values);
  const bins = Math.min(16, Math.max(5, Math.round(Math.sqrt(values.length) * 2)));
  const width = (high - low) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const value of values) counts[Math.min(bins - 1, Math.floor((value - low) / width))] += 1;
  const centers = counts.map((_, index) => low + width * (index + 0.5));
  return {
    grid: { left: 56, right: 24, top: 26, bottom: 52, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (rows) => {
        const at = rows[0]?.dataIndex ?? 0;
        return `<b>${pctText(low + width * at)} تا ${pctText(low + width * (at + 1))}</b><br>`
          + `${label(counts[at])} دوره · <b>${shareText(counts[at], values.length)}</b> از دوره‌ها`;
      },
    },
    xAxis: { type: 'category', data: centers.map((value) => faDigits(fmt.pct(value))),
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.int },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [{
      type: 'bar', data: counts, barCategoryGap: '8%',
      itemStyle: { borderRadius: [3, 3, 0, 0], color: (p) => tone(tokens, centers[p.dataIndex]) },
    }],
  };
}

/** رادار اعضا روی چهار سنجه، همه به مقیاس صفر تا صد. */
export function memberRadarOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (legs.length < 2) return null;
  const rows = legs.map((leg) => {
    const path = legPath(leg);
    const steps = stepsOf(path).filter((value) => value !== null);
    let peak = 0, worst = 0;
    for (const value of path) { if (value === null) continue; peak = Math.max(peak, value); worst = Math.min(worst, value - peak); }
    const wins = steps.filter((value) => value > 0).length;
    return {
      leg,
      بازده: leg.deployedRial > 0 && leg.finalPnlRial !== null ? (leg.finalPnlRial / leg.deployedRial) * 100 : null,
      'نرخ برد': steps.length ? (wins / steps.length) * 100 : null,
      'کم‌دردی': -worst,
      'سهم از سرمایه': basket.deployedRial > 0 ? (leg.deployedRial / basket.deployedRial) * 100 : null,
    };
  });
  const keys = ['بازده', 'نرخ برد', 'کم‌دردی', 'سهم از سرمایه'];
  const max = keys.map((key) => Math.max(1, ...rows.map((row) => Math.abs(finite(row[key]) ?? 0))));
  return {
    legend: { top: 0, type: 'scroll', textStyle: { color: tokens.muted }, formatter: faDigits },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        // سطر را با نام پیدا می‌کنیم، نه با `dataIndex`: رادار وقتی سری‌ای
        // از افسانه خاموش شود، شماره‌ها را جابه‌جا می‌کند و عددِ یک عضو
        // زیر نام عضو دیگر می‌نشیند.
        const row = rows.find((item) => item.leg.strategyName === params.name);
        if (!row) return '';
        return `<b>${faDigits(params.name)}</b><br>`
          + keys.map((key) => `${faDigits(key)}: <b>${
            key === 'کم‌دردی' ? pctText(-row[key]) : pctText(row[key])}</b>`).join('<br>');
      },
    },
    radar: {
      indicator: keys.map((key, index) => ({ name: faDigits(key), max: max[index] })),
      axisName: { color: tokens.muted }, splitLine: { lineStyle: { color: tokens.lineSoft } },
      splitArea: { areaStyle: { color: [tokens.panel, tokens.panel2] } },
      axisLine: { lineStyle: { color: tokens.lineSoft } },
    },
    series: [{
      type: 'radar', symbolSize: 5,
      data: rows.map((row, index) => ({
        name: row.leg.strategyName,
        value: keys.map((key) => Math.abs(finite(row[key]) ?? 0)),
        lineStyle: { width: 2, color: tokens.palette[index % tokens.palette.length] },
        itemStyle: { color: tokens.palette[index % tokens.palette.length] },
        areaStyle: { opacity: 0.12, color: tokens.palette[index % tokens.palette.length] },
        comboId: row.leg.comboId,
      })),
    }],
  };
}
