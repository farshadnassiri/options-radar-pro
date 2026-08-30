// نمودارهای تب «سبد فرضی» — مسیر سبد، رفتار اعضا، و مقایسه با نماد پایه.
//
// چرا ماژول جدا: ساختِ گزینهٔ نمودار منطق است، نه چیدمان. وقتی داخل تب
// می‌ماند، نه می‌شود مستقیم آزمونش کرد و نه در جای دیگری به کار می‌آید.
//
// یک قاعده در همهٔ این نمودارها: **درصد همیشه کنار ریال می‌آید**. عدد
// مطلق به‌تنهایی بی‌مقیاس است — «۵۸ میلیون سود» تا وقتی ندانی روی چه
// سرمایه‌ای بوده، نه خوب است نه بد. `moneyPct` همین را یک‌جا می‌سازد.

import { fmt, faDigits } from './fmt.mjs';
import { chartFormat } from './chart-host.mjs';

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

export const pctText = (value) => (finite(value) === null ? '—' : `${fmt.pct(value)}٪`);

/** «۵۸٬۰۰۰٬۰۰۰ · ۵٫۸۰٪» — عدد و مقیاسش، همیشه با هم. */
export function moneyPct(rial, base) {
  const value = finite(rial);
  if (value === null) return '—';
  const den = finite(base);
  const pct = den === null || !(Math.abs(den) > 0) ? null : (value / den) * 100;
  return pct === null ? chartFormat.money(value) : `${chartFormat.money(value)} · ${pctText(pct)}`;
}

/** سهم یک عدد از یک کل، برای تولتیپ‌های ترکیبی. */
export const shareText = (part, whole) => {
  const a = finite(part), b = finite(whole);
  if (a === null || b === null || !(Math.abs(b) > 0)) return '—';
  return pctText((a / b) * 100);
};

const label = (value) => faDigits(String(value ?? ''));

/** اعضای تأمین‌شدهٔ سبد، همیشه به یک ترتیب. */
export const fundedLegs = (basket) => (basket?.legs || []).filter((leg) => leg.ok);

/** مسیر تجمعی درصدیِ یک عضو، روی سرمایهٔ درگیرِ خودش. */
export function legPath(leg) {
  const den = finite(leg?.deployedRial);
  return (leg?.pnl || []).map((value) => {
    const pnl = finite(value);
    if (pnl === null || den === null || !(den > 0)) return null;
    return (pnl / den) * 100;
  });
}

/** گام روزانهٔ یک سری تجمعی — تفاضل، نه خودِ عدد. */
export function stepsOf(series) {
  const out = [];
  let previous = null;
  for (const value of series) {
    const now = finite(value);
    out.push(now === null || previous === null ? (now === null ? null : now) : now - previous);
    if (now !== null) previous = now;
  }
  return out;
}

// ═══════════════════ الف. مسیر و ارزش سبد ═══════════════════

/**
 * منحنی ارزش سبد، افت زیرِ آن، و بازهٔ بیشترین افت به‌صورت سایه.
 *
 * نسبت به نسخهٔ پیشین: بزرگ‌نمایی زمانی، نشانهٔ سقف و کف، سایهٔ بازهٔ افت،
 * و درصد در کنار هر ریال در تولتیپ.
 */
export function equityOption(basket, dateLabels, tokens) {
  const path = basket?.path || [];
  if (!path.some((point) => point.equityRial !== null)) return null;
  const capital = basket.capitalRial;
  const equity = path.map((point) => point.equityRial);
  let peak = capital, peakAt = 0, troughAt = null, worst = 0, from = 0;
  const drawdown = path.map((point, index) => {
    if (point.equityRial === null) return null;
    if (point.equityRial > peak) { peak = point.equityRial; peakAt = index; }
    const drop = peak > 0 ? ((point.equityRial - peak) / peak) * 100 : null;
    if (drop !== null && drop < worst) { worst = drop; troughAt = index; from = peakAt; }
    return drop;
  });
  const known = path.filter((point) => point.totalPnlRial !== null);
  const best = known.reduce((a, b) => (b.totalPnlRial > a.totalPnlRial ? b : a), known[0]);
  const low = known.reduce((a, b) => (b.totalPnlRial < a.totalPnlRial ? b : a), known[0]);
  return {
    legend: { top: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: [
      { left: 76, right: 76, top: 44, height: '50%', containLabel: true },
      { left: 76, right: 76, bottom: 64, height: '20%', containLabel: true },
    ],
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1] },
      { type: 'slider', xAxisIndex: [0, 1], bottom: 8, height: 18,
        borderColor: tokens.line, fillerColor: tokens.accentSoft, handleStyle: { color: tokens.accent } },
    ],
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => {
        const at = rows[0]?.dataIndex ?? 0;
        const point = path[at];
        return `<b>${label(dateLabels[at] || '')}</b><br>`
          + `ارزش سبد: <b>${moneyPct(point?.equityRial, capital)}</b><br>`
          + `سود یا زیان: <b>${moneyPct(point?.totalPnlRial, capital)}</b><br>`
          + `افت از سقف: <b>${pctText(drawdown[at])}</b>`
          + (point?.unknown?.length ? `<br><i>${label(point.unknown.length)} جزء این روز قیمت نداشت</i>` : '');
      },
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
        markPoint: {
          symbolSize: 46, silent: true,
          label: { color: tokens.ink, fontSize: 10, formatter: (p) => faDigits(p.name) },
          data: [
            best ? { name: 'بیشینه', xAxis: best.column, yAxis: best.equityRial, itemStyle: { color: tokens.gainSoft } } : null,
            low && low !== best ? { name: 'کمینه', xAxis: low.column, yAxis: low.equityRial, itemStyle: { color: tokens.lossSoft } } : null,
          ].filter(Boolean),
        },
        // سایهٔ بازهٔ بیشترین افت: عددِ «۱۳٪ افت» تا وقتی ندانی کِی و در
        // چند روز رخ داده، تصمیمی نمی‌سازد.
        markArea: troughAt === null ? undefined : {
          silent: true, itemStyle: { color: tokens.lossSoft, opacity: 0.5 },
          data: [[{ xAxis: from, name: `بیشترین افت ${fmt.pct(worst)}٪` }, { xAxis: troughAt }]],
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
 * سبد در برابر نماد پایه — هر دو از صفر، بر حسب درصد.
 *
 * این تنها نموداری است که به سؤال «اصلاً ارزشش را داشت؟» جواب می‌دهد:
 * سبدی که ۵٪ داده در بازاری که ۱۲٪ بالا رفته، بازنده است.
 */
export function versusBaseOption(basket, baseSeries, dateLabels, tokens) {
  const path = basket?.path || [];
  const capital = basket?.capitalRial;
  const mine = path.map((point) => (point.totalPnlRial === null || !(capital > 0)
    ? null : (point.totalPnlRial / capital) * 100));
  const base = (baseSeries || []).map(finite);
  if (!mine.some((value) => value !== null)) return null;
  const excess = mine.map((value, index) => (value === null || base[index] === null ? null : value - base[index]));
  return {
    legend: { top: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 60, right: 24, top: 44, bottom: 64, containLabel: true },
    dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 8, height: 18,
      borderColor: tokens.line, fillerColor: tokens.accentSoft, handleStyle: { color: tokens.accent } }],
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => {
        const at = rows[0]?.dataIndex ?? 0;
        return `<b>${label(dateLabels[at] || '')}</b><br>`
          + `سبد: <b>${pctText(mine[at])}</b><br>`
          + `نماد پایه: <b>${pctText(base[at])}</b><br>`
          + `مازاد: <b>${pctText(excess[at])}</b>`;
      },
    },
    xAxis: { type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [
      { name: 'سبد فرضی', type: 'line', data: mine, smooth: true, showSymbol: false, connectNulls: false,
        lineStyle: { width: 2.6, color: tokens.accent }, itemStyle: { color: tokens.accent } },
      { name: 'نماد پایه', type: 'line', data: base, smooth: true, showSymbol: false, connectNulls: false,
        lineStyle: { width: 2, color: tokens.muted, type: 'dashed' }, itemStyle: { color: tokens.muted } },
      { name: 'مازاد بر نماد پایه', type: 'bar', data: excess, barMaxWidth: 14,
        itemStyle: { color: (p) => (p.value >= 0 ? tokens.gainSoft : tokens.lossSoft) } },
    ],
  };
}

/** بازده گام‌به‌گام سبد — میلهٔ دوسویه، برای دیدن ریتم به‌جای مسیر. */
export function stepBarOption(basket, dateLabels, tokens) {
  const capital = basket?.capitalRial;
  const cumulative = (basket?.path || []).map((point) => (point.totalPnlRial === null || !(capital > 0)
    ? null : (point.totalPnlRial / capital) * 100));
  const steps = stepsOf(cumulative);
  if (!steps.some((value) => value !== null)) return null;
  const up = steps.filter((value) => value !== null && value > 0).length;
  const down = steps.filter((value) => value !== null && value < 0).length;
  return {
    grid: { left: 60, right: 24, top: 34, bottom: 58, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => `<b>${label(dateLabels[rows[0]?.dataIndex] || '')}</b><br>`
        + `گام این دوره: <b>${pctText(rows[0]?.value)}</b><br>`
        + `تجمعی تا اینجا: <b>${pctText(cumulative[rows[0]?.dataIndex])}</b><br>`
        + `<i>${label(up)} گام مثبت · ${label(down)} گام منفی</i>`,
    },
    xAxis: { type: 'category', data: dateLabels.map(faDigits),
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: [{
      type: 'bar', data: steps, barMaxWidth: 22,
      itemStyle: { color: (p) => (p.value >= 0 ? tokens.gain : tokens.loss), borderRadius: [3, 3, 0, 0] },
    }],
  };
}

// ═══════════════════ ب. رفتار هر عضو در طول زمان ═══════════════════
//
// سبد یک عدد پایانی نیست؛ چند مسیر است که با هم جمع شده‌اند. عضوی که
// آخر دوره سربه‌سر درآمده ممکن است وسط راه نصف سرمایه‌اش را از دست داده
// باشد — و همان، نه عدد پایانی، تصمیم دفعهٔ بعد را می‌سازد.

/** مسیر تجمعی هر عضو، روی سرمایهٔ درگیر خودش. */
export function memberPathOption(basket, dateLabels, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const paths = legs.map(legPath);
  return {
    legend: { top: 0, type: 'scroll', textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 60, right: 90, top: 44, bottom: 62, containLabel: true },
    dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 8, height: 18,
      borderColor: tokens.line, fillerColor: tokens.accentSoft, handleStyle: { color: tokens.accent } }],
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => {
        const at = rows[0]?.dataIndex ?? 0;
        const sorted = [...rows].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
        return `<b>${label(dateLabels[at] || '')}</b><br>`
          + sorted.map((row) => {
            const leg = legs[row.seriesIndex];
            return `${row.marker} ${faDigits(row.seriesName)} <b>${pctText(row.value)}</b>`
              + ` <i>${moneyPct(leg?.pnl?.[at], basket.capitalRial)}</i>`;
          }).join('<br>');
      },
    },
    xAxis: { type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: legs.map((leg, index) => ({
      name: leg.strategyName, type: 'line',
      data: paths[index].map((value) => ({ value, comboId: leg.comboId })),
      smooth: true, showSymbol: false, connectNulls: false,
      // نقطه پنهان است ولی همچنان هدفِ کلیک می‌ماند، پس کلیک روی خط کار
      // می‌کند بی‌آنکه نمودار شلوغ شود.
      triggerLineEvent: true, emphasis: { focus: 'series' },
      lineStyle: { width: 2, color: tokens.palette[index % tokens.palette.length] },
      itemStyle: { color: tokens.palette[index % tokens.palette.length] },
      endLabel: { show: true, color: tokens.muted, fontSize: 10,
        formatter: (p) => faDigits(p.seriesName) },
      comboId: leg.comboId,
    })),
  };
}

/** افت هر عضو از سقف خودش — کدام‌یک وسط راه چقدر درد داشت. */
export function memberDrawdownOption(basket, dateLabels, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const series = legs.map((leg) => {
    let peak = 0;
    return legPath(leg).map((value) => {
      if (value === null) return null;
      peak = Math.max(peak, value);
      return value - peak;
    });
  });
  return {
    legend: { top: 0, type: 'scroll', textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 60, right: 24, top: 44, bottom: 58, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => `<b>${label(dateLabels[rows[0]?.dataIndex] || '')}</b><br>`
        + [...rows].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
          .map((row) => `${row.marker} ${faDigits(row.seriesName)} <b>${pctText(row.value)}</b>`).join('<br>'),
    },
    xAxis: { type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', max: 0, axisLabel: { color: tokens.muted, formatter: chartFormat.pct },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: legs.map((leg, index) => ({
      name: leg.strategyName, type: 'line',
      data: series[index].map((value) => ({ value, comboId: leg.comboId })),
      smooth: true, showSymbol: false, connectNulls: false,
      triggerLineEvent: true, emphasis: { focus: 'series' },
      lineStyle: { width: 1.6, color: tokens.palette[index % tokens.palette.length] },
      areaStyle: { opacity: 0.10, color: tokens.palette[index % tokens.palette.length] },
      comboId: leg.comboId,
    })),
  };
}

/** سهم انباشتهٔ اعضا از سود — چه کسی، کِی، چقدر از کل را ساخت. */
export function memberStackOption(basket, dateLabels, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const totals = dateLabels.map((_, at) => legs.reduce((sum, leg) => {
    const value = finite(leg.pnl?.[at]);
    return value === null ? sum : sum + value;
  }, 0));
  return {
    legend: { top: 0, type: 'scroll', textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 70, right: 24, top: 44, bottom: 58, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => {
        const at = rows[0]?.dataIndex ?? 0;
        return `<b>${label(dateLabels[at] || '')}</b><br>`
          + `جمع سبد: <b>${moneyPct(totals[at], basket.capitalRial)}</b><br>`
          + rows.map((row) => `${row.marker} ${faDigits(row.seriesName)} <b>${chartFormat.money(row.value)}</b>`
            + ` · ${shareText(row.value, totals[at])} از سود روز`).join('<br>');
      },
    },
    xAxis: { type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.money },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: legs.map((leg, index) => ({
      name: leg.strategyName, type: 'line', stack: 'سود',
      data: leg.pnl.map((value) => ({ value: finite(value), comboId: leg.comboId })),
      smooth: false, showSymbol: false, connectNulls: false, triggerLineEvent: true,
      areaStyle: { opacity: 0.55, color: tokens.palette[index % tokens.palette.length] },
      lineStyle: { width: 0.8, color: tokens.palette[index % tokens.palette.length] },
      emphasis: { focus: 'series' }, comboId: leg.comboId,
    })),
  };
}

/** نقشهٔ حرارتی عضو × دوره — گام هر عضو در هر دوره، یک نگاه. */
export function memberHeatOption(basket, dateLabels, tokens) {
  const legs = fundedLegs(basket);
  if (!legs.length) return null;
  const cells = [];
  let span = 0;
  legs.forEach((leg, y) => {
    stepsOf(legPath(leg)).forEach((value, x) => {
      if (value === null) return;
      span = Math.max(span, Math.abs(value));
      cells.push([x, y, value]);
    });
  });
  if (!cells.length) return null;
  return {
    grid: { left: 150, right: 24, top: 34, bottom: 70, containLabel: false },
    tooltip: {
      trigger: 'item',
      formatter: (params) => {
        const [x, y, value] = params.data.value || params.data;
        const leg = legs[y];
        return `<b>${faDigits(leg.strategyName)}</b><br>${label(dateLabels[x] || '')}<br>`
          + `گام این دوره: <b>${pctText(value)}</b><br>`
          + `سود تا اینجا: <b>${moneyPct(leg.pnl?.[x], leg.deployedRial)}</b>`;
      },
    },
    visualMap: {
      min: -span, max: span, calculable: true, orient: 'horizontal', left: 'center', bottom: 6,
      textStyle: { color: tokens.muted }, formatter: chartFormat.pct,
      inRange: { color: [tokens.loss, tokens.panel2, tokens.gain] },
    },
    xAxis: { type: 'category', data: dateLabels.map(faDigits), splitArea: { show: false },
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'category', data: legs.map((leg) => faDigits(leg.strategyName)),
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } } },
    series: [{
      type: 'heatmap',
      data: cells.map((value) => ({ value, comboId: legs[value[1]].comboId })),
      itemStyle: { borderColor: tokens.panel, borderWidth: 1 },
      emphasis: { itemStyle: { borderColor: tokens.accent, borderWidth: 2 } },
    }],
  };
}

/** جابه‌جایی رتبهٔ اعضا در طول دوره — چه کسی کِی جلو افتاد. */
export function memberBumpOption(basket, dateLabels, tokens) {
  const legs = fundedLegs(basket);
  if (legs.length < 2) return null;
  const paths = legs.map(legPath);
  const ranks = legs.map(() => []);
  dateLabels.forEach((_, at) => {
    const order = legs.map((leg, index) => ({ index, value: paths[index][at] }))
      .filter((row) => row.value !== null)
      .sort((a, b) => b.value - a.value);
    legs.forEach((_, index) => {
      const place = order.findIndex((row) => row.index === index);
      ranks[index].push(place < 0 ? null : place + 1);
    });
  });
  return {
    legend: { top: 0, type: 'scroll', textStyle: { color: tokens.muted }, formatter: faDigits },
    grid: { left: 50, right: 96, top: 44, bottom: 58, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (rows) => {
        const at = rows[0]?.dataIndex ?? 0;
        return `<b>${label(dateLabels[at] || '')}</b><br>`
          + [...rows].sort((a, b) => (a.value ?? 99) - (b.value ?? 99))
            .map((row) => `${row.marker} رتبهٔ ${label(row.value)} — ${faDigits(row.seriesName)}`
              + ` <b>${pctText(paths[row.seriesIndex][at])}</b>`).join('<br>');
      },
    },
    xAxis: { type: 'category', data: dateLabels.map(faDigits), boundaryGap: false,
      axisLabel: { color: tokens.muted, rotate: 45, hideOverlap: true },
      axisLine: { lineStyle: { color: tokens.line } } },
    yAxis: { type: 'value', inverse: true, min: 1, max: legs.length, interval: 1,
      axisLabel: { color: tokens.muted, formatter: chartFormat.int },
      splitLine: { lineStyle: { color: tokens.lineSoft } } },
    series: legs.map((leg, index) => ({
      name: leg.strategyName, type: 'line',
      data: ranks[index].map((value) => ({ value, comboId: leg.comboId })),
      smooth: 0.35, symbolSize: 9, connectNulls: false, emphasis: { focus: 'series' },
      lineStyle: { width: 2.4, color: tokens.palette[index % tokens.palette.length] },
      itemStyle: { color: tokens.palette[index % tokens.palette.length] },
      endLabel: { show: true, color: tokens.muted, fontSize: 10, formatter: (p) => faDigits(p.seriesName) },
      comboId: leg.comboId,
    })),
  };
}
