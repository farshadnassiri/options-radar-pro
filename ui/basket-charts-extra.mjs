// دستهٔ چهارم نمودارهای سبد: تخصیص، ضبط بازار، و الگوی تقویمی.

import { fmt, faDigits } from './fmt.mjs';
import { chartFormat } from './chart-host.mjs';
import { fundedLegs, legPath, moneyPct, pctText, shareText, stepsOf } from './basket-charts.mjs';
import { basketPath } from './basket-charts-more.mjs';

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};
const label = (value) => faDigits(String(value ?? ''));
const tone = (tokens, value) => (finite(value) === null ? tokens.muted : value >= 0 ? tokens.gain : tokens.loss);

/** وافل تخصیص: صد خانه، هر خانه یک درصد از سرمایه. */
export function waffleOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const cells = [];
  let index = 0;
  legs.forEach((leg, which) => {
    const count = Math.round((leg.deployedRial / basket.capitalRial) * 100);
    for (let n = 0; n < count && index < 100; n++, index++) {
      cells.push([index % 10, 9 - Math.floor(index / 10), which]);
    }
  });
  const idle = index;
  for (; index < 100; index++) cells.push([index % 10, 9 - Math.floor(index / 10), -1]);
  return {
    grid: { left: 20, right: 20, top: 16, bottom: 16, containLabel: false },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const which = (params.data.value || params.data)[2];
        if (which < 0) return `<b>نقد تخصیص‌نیافته</b><br><b>${moneyPct(basket.idleRial, basket.capitalRial)}</b>`;
        const leg = legs[which];
        return `<b>${faDigits(leg.strategyName)}</b><br>`
          + `پول درگیر: <b>${moneyPct(leg.deployedRial, basket.capitalRial)}</b> از سرمایه<br>`
          + `<i>هر خانه یک درصد سرمایه است</i>`;
      },
    },
    xAxis: { type: 'value', min: -0.5, max: 9.5, show: false },
    yAxis: { type: 'value', min: -0.5, max: 9.5, show: false },
    series: [{
      type: 'custom',
      data: cells.map((value) => ({ value, comboId: value[2] >= 0 ? legs[value[2]].comboId : null })),
      renderItem: (params, api) => {
        const point = api.coord([api.value(0), api.value(1)]);
        const size = api.size([1, 1]);
        const which = api.value(2);
        return {
          type: 'rect',
          shape: { x: point[0] - size[0] * 0.42, y: point[1] - size[1] * 0.42,
            width: size[0] * 0.84, height: size[1] * 0.84, r: 2 },
          style: api.style({ fill: which < 0 ? tokens.panel2 : tokens.palette[which % tokens.palette.length] }),
        };
      },
    }],
    idle,
  };
}

/** لالی‌پاپ سهم هر عضو از سود کل — کوتاه‌ترین راه به «چه کسی سود را ساخت». */
export function contributionLollipopOption(basket, tokens) {
  const rows = (basket?.contributions || []).filter((row) => finite(row.finalPnlRial) !== null);
  if (!rows.length) return null;
  const sorted = [...rows].sort((a, b) => a.finalPnlRial - b.finalPnlRial);
  const total = sorted.reduce((sum, row) => sum + row.finalPnlRial, 0);
  return {
    grid: { left: 150, right: 40, top: 24, bottom: 46, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const row = sorted[params[0]?.dataIndex ?? 0];
        return `<b>${faDigits(row.strategyName)}</b><br>`
          + `سود یا زیان: <b>${moneyPct(row.finalPnlRial, basket.capitalRial)}</b> از سرمایه<br>`
          + `بازده خودِ جزء: <b>${pctText(row.returnPct)}</b><br>`
          + `سهم از سود کل: <b>${shareText(row.finalPnlRial, total)}</b>`;
      },
    },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.money },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: sorted.map((row) => faDigits(row.strategyName)),
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [
      { type: 'bar', data: sorted.map((row) => row.finalPnlRial), barMaxWidth: 3,
        itemStyle: { color: (p) => tone(tokens, p.value) }, silent: true },
      { type: 'scatter', symbolSize: 18,
        data: sorted.map((row) => ({ value: row.finalPnlRial, comboId: row.comboId })),
        itemStyle: { color: (p) => tone(tokens, p.value), borderColor: tokens.panel, borderWidth: 2 } },
    ],
  };
}

/**
 * ضبط بالا و پایین بازار.
 *
 * پرسش تریدر: در روزهایی که نماد پایه بالا رفت، چند درصدش را گرفتیم؛ و
 * در روزهایی که پایین آمد، چند درصدش را خوردیم. سبدی که بالا را کم
 * می‌گیرد ولی پایین را هم کم می‌خورد، ممکن است بهتر از سبدِ پرسودتر باشد.
 */
export function captureOption(basket, baseSeries, tokens) {
  const mine = stepsOf(basketPath(basket));
  const base = stepsOf((baseSeries || []).map(finite));
  let upMine = 0, upBase = 0, downMine = 0, downBase = 0, upDays = 0, downDays = 0;
  for (let index = 0; index < Math.min(mine.length, base.length); index++) {
    const a = finite(mine[index]), b = finite(base[index]);
    if (a === null || b === null) continue;
    if (b > 0) { upMine += a; upBase += b; upDays += 1; }
    else if (b < 0) { downMine += a; downBase += b; downDays += 1; }
  }
  if (!upDays && !downDays) return null;
  const up = upBase !== 0 ? (upMine / upBase) * 100 : null;
  const down = downBase !== 0 ? (downMine / downBase) * 100 : null;
  const rows = [
    { name: 'ضبط روزهای صعودی', value: up, days: upDays, tone: tokens.gain },
    { name: 'ضبط روزهای نزولی', value: down, days: downDays, tone: tokens.loss },
  ].filter((row) => row.value !== null);
  if (!rows.length) return null;
  return {
    grid: { left: 160, right: 60, top: 24, bottom: 44, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        // اگر بازار در این بازه فقط یک جهت داشته باشد، `rows` یک عضو دارد
        // و `dataIndex` می‌تواند بیرون از آن بیفتد. تولتیپی که می‌ترکد،
        // بدتر از تولتیپی است که نیست.
        const row = rows[params?.[0]?.dataIndex ?? 0];
        if (!row) return '';
        const note = row.name.includes('صعودی')
          ? (row.value >= 100 ? 'بیش از بازار گرفت' : 'کمتر از بازار گرفت')
          : (row.value <= 100 ? 'کمتر از بازار خورد' : 'بیش از بازار خورد');
        return `<b>${faDigits(row.name)}</b><br>`
          + `<b>${pctText(row.value)}</b> حرکت نماد پایه<br>`
          + `<i>${label(row.days)} دوره · ${faDigits(note)}</i>`;
      },
    },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: rows.map((row) => faDigits(row.name)),
      axisLabel: { color: tokens.muted, width: 150, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [{
      type: 'bar', data: rows.map((row) => row.value), barMaxWidth: 30,
      itemStyle: { color: (p) => rows[p.dataIndex].tone, borderRadius: 4 },
      markLine: { silent: true, symbol: 'none',
        lineStyle: { color: tokens.muted, type: 'dashed' },
        label: { color: tokens.muted, formatter: 'هم‌پای بازار' }, data: [{ xAxis: 100 }] },
    }],
  };
}

/** عقربهٔ بازده سبد در برابر بازده نماد پایه. */
export function gaugeOption(basket, baseFinal, tokens) {
  const mine = finite(basket?.summary?.finalReturnPct);
  if (mine === null) return null;
  const target = finite(baseFinal);
  const span = Math.max(5, Math.abs(mine) * 1.6, Math.abs(target ?? 0) * 1.6);
  return {
    tooltip: {
      trigger: 'item',
      formatter: () => `بازده سبد: <b>${pctText(mine)}</b><br>`
        + `نماد پایه: <b>${pctText(target)}</b><br>`
        + `مازاد: <b>${pctText(target === null ? null : mine - target)}</b>`,
    },
    series: [{
      type: 'gauge', min: -span, max: span, startAngle: 200, endAngle: -20,
      radius: '92%', center: ['50%', '62%'], splitNumber: 4,
      progress: { show: true, width: 16, itemStyle: { color: tone(tokens, mine) } },
      axisLine: { lineStyle: { width: 16, color: [[1, tokens.panel2]] } },
      axisTick: { lineStyle: { color: tokens.line } },
      splitLine: { lineStyle: { color: tokens.line } },
      axisLabel: { color: tokens.muted, distance: 22, formatter: (value) => faDigits(fmt.pct(value)) },
      pointer: { itemStyle: { color: tone(tokens, mine) } },
      anchor: { show: true, size: 14, itemStyle: { color: tokens.panel, borderColor: tokens.line, borderWidth: 2 } },
      detail: { valueAnimation: false, color: tone(tokens, mine), fontSize: 22, offsetCenter: [0, '42%'],
        formatter: (value) => `${faDigits(fmt.pct(value))}٪` },
      data: [{ value: mine }],
      markLine: undefined,
      // خطِ نماد پایه به‌صورت یک عقربهٔ دوم می‌آید تا مقایسه بی‌واسطه باشد.
      ...(target === null ? {} : {}),
    },
    ...(target === null ? [] : [{
      type: 'gauge', min: -span, max: span, startAngle: 200, endAngle: -20,
      radius: '92%', center: ['50%', '62%'],
      axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { show: false }, detail: { show: false }, anchor: { show: false },
      pointer: { width: 3, length: '62%', itemStyle: { color: tokens.muted } },
      data: [{ value: target }], silent: true,
    }])],
  };
}

/** هیت‌مپ روز هفته × نتیجه — آیا الگوی هفتگی هست؟ */
export function weekdayOption(basket, weekdays, tokens) {
  const steps = stepsOf(basketPath(basket));
  const names = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
  const sums = names.map(() => ({ total: 0, count: 0, wins: 0 }));
  steps.forEach((value, index) => {
    const day = weekdays?.[index];
    if (value === null || !Number.isInteger(day) || day < 0 || day > 6) return;
    sums[day].total += value;
    sums[day].count += 1;
    if (value > 0) sums[day].wins += 1;
  });
  const live = sums.map((row, index) => ({ ...row, index })).filter((row) => row.count > 0);
  if (live.length < 2) return null;
  return {
    grid: { left: 100, right: 30, top: 24, bottom: 44, containLabel: true },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const row = live[params[0]?.dataIndex ?? 0];
        return `<b>${faDigits(names[row.index])}</b><br>`
          + `میانگین گام: <b>${pctText(row.total / row.count)}</b><br>`
          + `نرخ برد: <b>${pctText((row.wins / row.count) * 100)}</b><br>`
          + `<i>${label(row.count)} دوره</i>`;
      },
    },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: { type: 'category', data: live.map((row) => faDigits(names[row.index])),
      axisLabel: { color: tokens.muted }, axisLine: { lineStyle: { color: tokens.line } } },
    series: [{
      type: 'bar', data: live.map((row) => row.total / row.count), barMaxWidth: 22,
      itemStyle: { color: (p) => tone(tokens, p.value), borderRadius: 3 },
    }],
  };
}

/** خطوط شیب: بازده نیمهٔ اول در برابر نیمهٔ دوم، برای هر عضو. */
export function slopeOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const rows = legs.map((leg) => {
    const path = legPath(leg).filter((value) => value !== null);
    if (path.length < 3) return null;
    const middle = Math.floor(path.length / 2);
    return { leg, first: path[middle], second: path[path.length - 1] - path[middle] };
  }).filter(Boolean);
  if (!rows.length) return null;
  return {
    grid: { left: 60, right: 130, top: 30, bottom: 44, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const row = rows[params.seriesIndex];
        const shift = row.second - row.first;
        return `<b>${faDigits(row.leg.strategyName)}</b><br>`
          + `نیمهٔ اول: <b>${pctText(row.first)}</b><br>نیمهٔ دوم: <b>${pctText(row.second)}</b><br>`
          + `<i>${faDigits(shift >= 0 ? 'در نیمهٔ دوم قوی‌تر شد' : 'در نیمهٔ دوم ضعیف‌تر شد')}</i>`;
      },
    },
    xAxis: { type: 'category', data: ['نیمهٔ اول', 'نیمهٔ دوم'].map(faDigits), boundaryGap: true,
      axisLabel: { color: tokens.muted }, axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: rows.map((row, index) => ({
      name: row.leg.strategyName, type: 'line', symbolSize: 10,
      data: [row.first, row.second].map((value) => ({ value, comboId: row.leg.comboId })), lineStyle: { width: 2.2, color: tokens.palette[index % tokens.palette.length] },
      itemStyle: { color: tokens.palette[index % tokens.palette.length] },
      endLabel: { show: true, color: tokens.muted, fontSize: 10, formatter: (p) => faDigits(p.seriesName) },
      emphasis: { focus: 'series' }, comboId: row.leg.comboId,
    })),
  };
}

/** حباب‌های بستهٔ خانواده — اندازه، پول درگیر؛ رنگ، نتیجه. */
export function familyBubbleOption(basket, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const nodes = legs.map((leg, index) => ({
    name: leg.strategyName,
    value: leg.deployedRial,
    symbolSize: 22 + 60 * Math.sqrt(leg.deployedRial / (basket.deployedRial || 1)),
    category: leg.groupName || 'بدون خانواده',
    pct: leg.deployedRial > 0 && leg.finalPnlRial !== null ? (leg.finalPnlRial / leg.deployedRial) * 100 : null,
    pnl: leg.finalPnlRial, comboId: leg.comboId,
    itemStyle: { color: tokens.palette[index % tokens.palette.length], opacity: 0.85 },
  }));
  const categories = [...new Set(nodes.map((node) => node.category))].map((name) => ({ name }));
  return {
    legend: { top: 0, type: 'scroll', textStyle: { color: tokens.muted }, formatter: faDigits,
      data: categories.map((row) => faDigits(row.name)) },
    tooltip: {
      trigger: 'item',
      formatter: (params) => `<b>${faDigits(params.data.name)}</b><br>`
        + `خانواده: ${faDigits(params.data.category)}<br>`
        + `پول درگیر: <b>${moneyPct(params.data.value, basket.deployedRial)}</b> از کل درگیر<br>`
        + `بازده جزء: <b>${pctText(params.data.pct)}</b>`,
    },
    series: [{
      type: 'graph', layout: 'force', roam: false, animation: false,
      // چیدمانِ نیرو اگر متوقف نشود، رشتهٔ اصلی را تا ابد مشغول نگه می‌دارد.
      layoutAnimation: false,
      force: { repulsion: 220, gravity: 0.12, edgeLength: 40, layoutAnimation: false },
      categories: categories.map((row) => ({ name: faDigits(row.name) })),
      label: { show: true, color: tokens.ink, fontSize: 10, formatter: (p) => faDigits(p.data.name) },
      data: nodes.map((node) => ({ ...node, name: node.name, category: faDigits(node.category) })),
      links: [],
    }],
  };
}
