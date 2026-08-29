// نمودارهای «از کل به جزء» — ترکیب سبد، از خانواده تا یک ترکیب.
//
// همهٔ این‌ها یک سؤال دارند با هشت جواب تصویری: **پول و نتیجه کجا جمع
// شده‌اند؟** هر کدام چیزی را می‌گویند که بقیه نمی‌گویند — وگرنه هشت نمودار
// یعنی هشت بار تکرار یک حرف، و همان چیزی است که صفحه را شلوغ می‌کند نه
// گویا.
//
// یک قاعدهٔ مشترک: **درصد سهم در هر راهنمای شناور می‌آید.** عدد مطلق بدون
// سهمش از کل، مقایسه‌پذیر نیست؛ «۱۲ ترکیب» تا ندانی از چند، چیزی نمی‌گوید.

import { fmt, faDigits } from '/ui/fmt.mjs';
import { chartFormat } from '/ui/chart-host.mjs';

export const PORTFOLIO_PARTS_VERSION = 1;

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const pctText = (value) => (finite(value) === null ? '—' : `${fmt.pct(value)}٪`);

/**
 * سهم درصدی یک عدد از کل — همان چیزی که کاربر خواست در هر راهنما باشد.
 *
 * کلِ صفر یا نامعلوم سهم نمی‌سازد: تقسیم بر صفر بی‌نهایت می‌دهد و بی‌نهایت
 * در یک راهنمای شناور یعنی «چیزی نفهمیدم».
 */
export function shareOf(value, total) {
  const part = finite(value);
  const whole = finite(total);
  if (part === null || whole === null || Math.abs(whole) < 1e-12) return null;
  return (part / whole) * 100;
}

/** خط «سهم از کل» برای راهنمای شناور. نامعلوم، خطی نمی‌سازد. */
export const shareLine = (value, total, label = 'سهم از کل') => {
  const share = shareOf(value, total);
  return share === null ? '' : `<br>${label}: <b>${pctText(share)}</b>`;
};

const groupsWithStrategies = (analysis) => {
  const byGroup = new Map((analysis?.groups || []).map((row) => [String(row.groupId ?? ''), []]));
  for (const strategy of analysis?.strategies || []) {
    byGroup.get(String(strategy.groupId ?? ''))?.push(strategy);
  }
  return byGroup;
};

const toneOf = (value, tokens) => (finite(value) === null ? tokens.muted
  : value > 0 ? tokens.gain : value < 0 ? tokens.loss : tokens.muted);

/**
 * آفتاب‌نما: خانواده ← استراتژی ← ترکیب، در سه حلقه.
 *
 * درخت‌نقشه اندازه را خوب نشان می‌دهد ولی سلسله‌مراتب را بد؛ آفتاب‌نما
 * عکسش است. هر دو با هم، هم وزن را می‌گویند هم جای هر چیز را در کل.
 */
export function sunburstOption(analysis, tokens, { maxCombos = 6 } = {}) {
  const groups = analysis?.groups || [];
  if (!groups.length) return null;
  const byGroup = groupsWithStrategies(analysis);
  const total = groups.reduce((sum, row) => sum + row.samples, 0);
  const data = groups.map((group) => ({
    name: group.groupName, metric: group.returnStat, samples: group.samples,
    itemStyle: { color: toneOf(group.returnStat, tokens), opacity: 0.85 },
    children: (byGroup.get(String(group.groupId ?? '')) || []).map((strategy) => ({
      name: strategy.strategyName, strategyId: strategy.strategyId,
      metric: strategy.metrics.return, samples: strategy.samples,
      itemStyle: { color: toneOf(strategy.metrics.return, tokens), opacity: 0.7 },
      children: (analysis.combos || [])
        .filter((combo) => combo.strategyId === strategy.strategyId && combo.series.ok)
        .sort((a, b) => (b.series.finalPct ?? -Infinity) - (a.series.finalPct ?? -Infinity))
        .slice(0, maxCombos)
        .map((combo) => ({
          name: (combo.strikes || []).map((strike) => fmt.int(strike)).join('/') || combo.id,
          comboId: combo.id, strategyId: strategy.strategyId,
          value: 1, metric: combo.series.finalPct, samples: 1,
          itemStyle: { color: toneOf(combo.series.finalPct, tokens), opacity: 0.55 },
        })),
    })),
  }));
  return {
    tooltip: {
      formatter: (params) => `<b>${faDigits(params.name)}</b>`
        + `<br>ترکیب: ${chartFormat.int(params.data?.samples ?? params.value)}`
        + shareLine(params.data?.samples ?? params.value, total, 'سهم از همهٔ ترکیب‌ها')
        + (params.data?.metric === undefined ? '' : `<br>بازده: <b>${pctText(params.data.metric)}</b>`),
    },
    series: [{
      type: 'sunburst', radius: [0, '92%'], nodeClick: false, sort: null,
      emphasis: { focus: 'ancestor' },
      label: { color: tokens.panel, formatter: (params) => faDigits(params.name), minAngle: 8 },
      levels: [
        {},
        { r0: '12%', r: '44%', itemStyle: { borderWidth: 2, borderColor: tokens.panel }, label: { rotate: 'tangential' } },
        { r0: '44%', r: '74%', itemStyle: { borderWidth: 1, borderColor: tokens.panel } },
        { r0: '75%', r: '80%', itemStyle: { borderWidth: 1, borderColor: tokens.panel }, label: { show: false } },
      ],
      data,
    }],
  };
}

/** سهم هر خانواده از ترکیب‌های معتبر — با درصد، همان‌طور که خواسته شد. */
export function shareDonutOption(analysis, tokens) {
  const groups = analysis?.groups || [];
  if (!groups.length) return null;
  const total = groups.reduce((sum, row) => sum + row.samples, 0);
  return {
    legend: { type: 'scroll', bottom: 0, textStyle: { color: tokens.muted }, formatter: faDigits },
    tooltip: {
      formatter: (params) => `<b>${faDigits(params.name)}</b><br>ترکیب: ${chartFormat.int(params.value)}`
        + shareLine(params.value, total)
        + `<br>بازده: <b>${pctText(params.data.metric)}</b>`,
    },
    series: [{
      type: 'pie', radius: ['42%', '68%'], center: ['50%', '46%'], avoidLabelOverlap: true,
      itemStyle: { borderColor: tokens.panel, borderWidth: 2, borderRadius: 4 },
      label: { color: tokens.ink, formatter: (params) => `${faDigits(params.name)}\n${chartFormat.pct(params.percent)}٪` },
      labelLine: { lineStyle: { color: tokens.line } },
      data: groups.map((row) => ({ name: row.groupName, value: row.samples, groupId: row.groupId, metric: row.returnStat })),
    }],
  };
}

/**
 * گل رز: هر گلبرگ یک استراتژی، طولش بازده و پهنایش شمار ترکیب.
 *
 * دایره‌ای بودنش عمدی است — برای مقایسهٔ بیست‌وچند استراتژی، میله‌ای افقی
 * صفحه را می‌کشد و رز همه را در یک نگاه جا می‌دهد.
 */
export function roseOption(analysis, tokens) {
  const rows = (analysis?.strategies || []).filter((row) => finite(row.metrics.return) !== null);
  if (rows.length < 3) return null;
  const floor = Math.min(0, ...rows.map((row) => row.metrics.return));
  const total = rows.reduce((sum, row) => sum + row.samples, 0);
  return {
    tooltip: {
      formatter: (params) => `<b>${faDigits(params.name)}</b><br>بازده: <b>${pctText(params.data.metric)}</b>`
        + `<br>ترکیب: ${chartFormat.int(params.data.samples)}` + shareLine(params.data.samples, total, 'سهم از ترکیب‌ها'),
    },
    series: [{
      type: 'pie', radius: [24, '76%'], center: ['50%', '50%'], roseType: 'area',
      itemStyle: { borderRadius: 4, borderColor: tokens.panel, borderWidth: 1 },
      label: { color: tokens.muted, formatter: (params) => faDigits(params.name), fontSize: 10 },
      labelLine: { length: 6, length2: 6, lineStyle: { color: tokens.line } },
      data: rows.map((row) => ({
        // شعاع باید مثبت باشد؛ کفِ منفی به صفر منتقل می‌شود و عددِ واقعی در
        // راهنما می‌ماند. وگرنه استراتژی زیان‌ده اصلاً گلبرگ نمی‌گرفت.
        name: row.strategyName, value: (row.metrics.return - floor) + 0.01,
        strategyId: row.strategyId, metric: row.metrics.return, samples: row.samples,
        itemStyle: { color: toneOf(row.metrics.return, tokens) },
      })),
    }],
  };
}

/**
 * قیف غربال: از هر چه ساخته شد تا هر چه به رتبه‌بندی رسید.
 *
 * این نمودار جواب سؤالی است که همیشه پرسیده می‌شود: «چرا از هزار ترکیب
 * فقط هفتاد تا ماند؟»
 */
export function funnelOption(analysis, audit, tokens) {
  const built = finite(audit?.built);
  const candidates = finite(audit?.candidates);
  const accepted = finite(analysis?.combos?.length);
  const usable = finite(analysis?.usable);
  const rows = [
    ['ساخته‌شده از کاتالوگ', built],
    ['نامزدِ دارای قیمت ورود', candidates],
    ['دارای پایان معتبر', accepted],
    ['وارد رتبه‌بندی', usable],
  ].filter(([, value]) => value !== null && value > 0);
  if (rows.length < 2) return null;
  const top = rows[0][1];
  return {
    tooltip: {
      formatter: (params) => `<b>${faDigits(params.name)}</b><br>${chartFormat.int(params.value)} ترکیب`
        + shareLine(params.value, top, 'سهم از ساخته‌شده‌ها'),
    },
    series: [{
      type: 'funnel', left: '8%', right: '8%', top: 16, bottom: 16, minSize: '18%',
      sort: 'descending', gap: 3,
      label: { color: tokens.ink, position: 'inside', formatter: (params) => `${faDigits(params.name)} · ${chartFormat.int(params.value)}` },
      itemStyle: { borderColor: tokens.panel, borderWidth: 2 },
      data: rows.map(([name, value]) => ({ name, value })),
    }],
  };
}

/**
 * شبکهٔ شباهت: استراتژی‌هایی که مسیرشان با هم می‌رود، به هم وصل می‌شوند.
 *
 * به درد تشخیص «تنوع دروغین» می‌خورد: پنج استراتژی که همبستگی‌شان بالای
 * نود درصد است، در عمل یک شرط‌بندی‌اند نه پنج تا.
 */
export function similarityGraphOption(analysis, tokens, { threshold = 0.75 } = {}) {
  const rows = (analysis?.strategies || []).filter((row) => (row.path?.cumulative || []).some((value) => value !== null));
  if (rows.length < 3) return null;
  const nodes = rows.map((row) => ({
    id: row.strategyId, name: row.strategyName,
    value: row.samples, metric: row.metrics.return,
    symbolSize: 14 + Math.min(34, Math.sqrt(Math.max(1, row.samples)) * 5),
    itemStyle: { color: toneOf(row.metrics.return, tokens) },
  }));
  const links = [];
  for (let a = 0; a < rows.length; a++) {
    for (let b = a + 1; b < rows.length; b++) {
      const r = correlationOf(rows[a].path.cumulative, rows[b].path.cumulative);
      if (r === null || r < threshold) continue;
      links.push({
        source: rows[a].strategyId, target: rows[b].strategyId, correlation: r,
        lineStyle: { width: 1 + ((r - threshold) / Math.max(1e-9, 1 - threshold)) * 4, opacity: 0.45 },
      });
    }
  }
  return {
    tooltip: {
      formatter: (params) => (params.dataType === 'edge'
        ? `همبستگی مسیر: <b>${chartFormat.num(params.data.correlation)}</b>`
        : `<b>${faDigits(params.data.name)}</b><br>بازده: <b>${pctText(params.data.metric)}</b><br>ترکیب: ${chartFormat.int(params.data.value)}`),
    },
    series: [{
      type: 'graph', layout: 'force', roam: true, draggable: true,
      force: { repulsion: 220, edgeLength: [60, 160], gravity: 0.08 },
      emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.9 } },
      label: { show: true, position: 'right', color: tokens.ink, formatter: (params) => faDigits(params.data.name) },
      lineStyle: { color: tokens.accent, curveness: 0.12 },
      data: nodes, links,
    }],
  };
}

/** همبستگی پیرسون روی نقطه‌های هم‌زمانِ دو مسیر. نقطهٔ ناقص شمرده نمی‌شود. */
export function correlationOf(a = [], b = []) {
  const pairs = [];
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    const left = finite(a[index]), right = finite(b[index]);
    if (left === null || right === null) continue;
    pairs.push([left, right]);
  }
  if (pairs.length < 3) return null;
  const meanA = pairs.reduce((sum, row) => sum + row[0], 0) / pairs.length;
  const meanB = pairs.reduce((sum, row) => sum + row[1], 0) / pairs.length;
  let top = 0, da = 0, db = 0;
  for (const [left, right] of pairs) {
    top += (left - meanA) * (right - meanB);
    da += (left - meanA) ** 2;
    db += (right - meanB) ** 2;
  }
  const bottom = Math.sqrt(da) * Math.sqrt(db);
  return bottom > 1e-12 ? top / bottom : null;
}

/** ماتریس همبستگی — همان شباهت، ولی خوانا برای مقایسهٔ زوج‌به‌زوج. */
export function correlationHeatOption(analysis, tokens, { limit = 16 } = {}) {
  const rows = (analysis?.strategies || []).slice(0, limit)
    .filter((row) => (row.path?.cumulative || []).some((value) => value !== null));
  if (rows.length < 3) return null;
  const cells = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows.length; x++) {
      const r = x === y ? 1 : correlationOf(rows[y].path.cumulative, rows[x].path.cumulative);
      if (r === null) continue;
      cells.push([x, y, r]);
    }
  }
  if (!cells.length) return null;
  const names = rows.map((row) => faDigits(row.strategyName));
  return {
    grid: { left: 8, right: 24, top: 12, bottom: 88, containLabel: true },
    tooltip: {
      formatter: (params) => `<b>${names[params.value[1]]}</b> و <b>${names[params.value[0]]}</b>`
        + `<br>همبستگی مسیر: <b>${chartFormat.num(params.value[2])}</b>`
        + `<br>${params.value[2] > 0.9 ? 'تقریباً یک شرط‌بندی‌اند' : params.value[2] > 0.6 ? 'هم‌جهت‌اند' : params.value[2] < -0.3 ? 'خلاف هم می‌روند' : 'مستقل‌اند'}`,
    },
    xAxis: {
      type: 'category', data: names, axisLabel: { color: tokens.muted, rotate: 55, hideOverlap: true, width: 90, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: {
      type: 'category', data: names, inverse: true,
      axisLabel: { color: tokens.muted, width: 140, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    visualMap: {
      min: -1, max: 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 8,
      itemWidth: 12, itemHeight: 150, textStyle: { color: tokens.muted }, formatter: chartFormat.num,
      inRange: { color: [tokens.loss, tokens.panel2, tokens.accent] },
    },
    series: [{
      type: 'heatmap', data: cells,
      itemStyle: { borderColor: tokens.panel, borderWidth: 1 },
      emphasis: { itemStyle: { borderColor: tokens.ink, borderWidth: 1.5 } },
    }],
  };
}

/**
 * پارتو: چند استراتژی، چند درصد سود کل را ساختند؟
 *
 * اگر خط تجمعی زود به نود درصد برسد، یعنی نتیجه به دو سه استراتژی وابسته
 * است — و آن، تنوعِ روی کاغذ است نه واقعی.
 */
export function paretoOption(analysis, tokens) {
  const rows = (analysis?.strategies || [])
    .map((row) => ({
      name: row.strategyName, id: row.strategyId,
      value: (analysis.combos || [])
        .filter((combo) => combo.strategyId === row.strategyId && combo.series.finalPnl !== null)
        .reduce((sum, combo) => sum + combo.series.finalPnl, 0),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  if (rows.length < 3) return null;
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  let running = 0;
  const cumulative = rows.map((row) => { running += row.value; return (running / total) * 100; });
  return {
    grid: { left: 64, right: 64, top: 24, bottom: 96, containLabel: true },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => `<b>${faDigits(rows[params[0].dataIndex].name)}</b>`
        + `<br>سود: <b>${chartFormat.money(rows[params[0].dataIndex].value)}</b>`
        + shareLine(rows[params[0].dataIndex].value, total, 'سهم از سود کل')
        + `<br>تا اینجا روی هم: <b>${pctText(cumulative[params[0].dataIndex])}</b>`,
    },
    xAxis: {
      type: 'category', data: rows.map((row) => faDigits(row.name)),
      axisLabel: { color: tokens.muted, rotate: 50, hideOverlap: true, width: 110, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    yAxis: [
      { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.money }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
      { type: 'value', max: 100, axisLabel: { color: tokens.muted, formatter: chartFormat.pct }, splitLine: { show: false } },
    ],
    series: [
      {
        type: 'bar', data: rows.map((row) => ({ value: row.value, id: row.id })),
        itemStyle: { color: tokens.accent, borderRadius: [4, 4, 0, 0] },
      },
      {
        type: 'line', yAxisIndex: 1, data: cumulative, smooth: true, showSymbol: false,
        lineStyle: { color: tokens.warn, width: 2 }, itemStyle: { color: tokens.warn },
        markLine: {
          symbol: 'none', silent: true,
          data: [{ yAxis: 80, label: { formatter: 'هشتاد درصد', color: tokens.muted } }],
          lineStyle: { color: tokens.muted, type: 'dashed' },
        },
      },
    ],
  };
}

/** میلهٔ تصویری: شمار ترکیب هر خانواده، با سهم درصدی در راهنما. */
export function familyBarOption(analysis, tokens) {
  const groups = analysis?.groups || [];
  if (!groups.length) return null;
  const total = groups.reduce((sum, row) => sum + row.samples, 0);
  return {
    grid: { left: 8, right: 40, top: 16, bottom: 16, containLabel: true },
    tooltip: {
      trigger: 'item',
      formatter: (params) => `<b>${faDigits(params.name)}</b><br>ترکیب: ${chartFormat.int(params.value)}`
        + shareLine(params.value, total)
        + `<br>بازده: <b>${pctText(params.data.metric)}</b><br>نرخ برد: <b>${pctText(params.data.winPct)}</b>`,
    },
    xAxis: { type: 'value', axisLabel: { color: tokens.muted, formatter: chartFormat.int }, splitLine: { lineStyle: { color: tokens.lineSoft } } },
    yAxis: {
      type: 'category', inverse: true, data: groups.map((row) => faDigits(row.groupName)),
      axisLabel: { color: tokens.muted, width: 150, overflow: 'truncate' },
      axisLine: { lineStyle: { color: tokens.line } },
    },
    series: [{
      type: 'pictorialBar', symbol: 'roundRect', symbolRepeat: true, symbolSize: [8, '62%'],
      symbolMargin: 2, symbolClip: false,
      data: groups.map((row) => ({
        value: row.samples, groupId: row.groupId, metric: row.returnStat, winPct: row.winPct,
        itemStyle: { color: toneOf(row.returnStat, tokens), opacity: 0.85 },
      })),
      label: { show: true, position: 'right', color: tokens.muted, formatter: (params) => chartFormat.int(params.value) },
    }],
  };
}
