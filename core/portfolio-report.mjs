// گزارش «آزمون همه استراتژی‌ها» — بازساخته‌شده روی ماتریس خام.
//
// هدفِ این تب یک جملهٔ ساده است: «در این بازه، بهترین و بدترین استراتژی
// کدام بود؟» ولی «بهترین» یک عدد نیست، یک قضاوت است — و قضاوتِ پنهان،
// همان چیزی است که گزارش‌های مالی را بی‌اعتبار می‌کند. پس اینجا:
//
//   • هر سنجه نام دارد، جهت دارد («بالاتر بهتر» یا «پایین‌تر بهتر»)، و
//     وزنش دیده می‌شود و قابل تغییر است.
//   • نمره از رتبهٔ درصدی ساخته می‌شود، نه از خودِ عدد. جمع‌کردن «۴۰٪ بازده»
//     با «۶۵٪ نرخ برد» بی‌معناست؛ جمع‌کردن جایگاهشان معنا دارد.
//   • استراتژی‌ای که سنجه‌ای را ندارد، در آن سنجه صفر نمی‌گیرد — از مخرجش
//     بیرون می‌رود و سهم داده‌اش گزارش می‌شود.

import { RETURN_BASES, DEFAULT_RETURN_BASIS, basisMeta, normalizeBasis } from './portfolio-basis.mjs';
import { columnsInRange, matrixRow } from './portfolio-matrix.mjs';
import { comboSeries, comboWeight } from './portfolio-series.mjs';
import {
  DEFAULT_STATISTIC, DEFAULT_WEIGHTING, medianOf,
  normalizeStatistic, normalizeWeighting, statOf, statisticMeta, weightingMeta,
} from './portfolio-stats.mjs';

export const PORTFOLIO_REPORT_VERSION = 1;

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

/**
 * سنجه‌ها — به زبان معامله‌گر، نه به زبان آمار.
 *
 * `better: 'low'` یعنی عدد کوچک‌تر بهتر است (رتبه، روز تا سود، پراکندگی).
 * `weight` وزن پیش‌فرض در نمرهٔ ترکیبی است؛ صفر یعنی سنجه ساخته و نشان داده
 * می‌شود ولی به‌طور پیش‌فرض در نمره نمی‌آید.
 */
export const METRICS = [
  {
    id: 'return', label: 'بازده', unit: 'pct', better: 'high', weight: 35,
    hint: 'آمارهٔ انتخابی از بازده پایان بازهٔ ترکیب‌های همین استراتژی، روی مبنای انتخابی',
  },
  {
    id: 'winPct', label: 'نرخ برد', unit: 'pct', better: 'high', weight: 20,
    hint: 'چند درصد ترکیب‌های این استراتژی در پایان بازه سبز بودند',
  },
  {
    id: 'painRatio', label: 'سود به درد', unit: 'ratio', better: 'high', weight: 20,
    hint: 'بازده تقسیم بر بیشترین افت مسیر؛ «به ازای هر واحد درد، چقدر سود»',
  },
  {
    id: 'rank', label: 'پایداری رتبه', unit: 'rank', better: 'low', weight: 15,
    hint: 'میانهٔ جایگاه روزانه بین همهٔ استراتژی‌ها؛ عدد کوچک‌تر یعنی روزبه‌روز جلوتر بوده',
  },
  {
    id: 'coverage', label: 'پوشش داده', unit: 'pct', better: 'high', weight: 10,
    hint: 'چند درصد روزهای بازه برای این استراتژی قیمت معتبر داشتند؛ کم بودنش یعنی نتیجه کم‌پشتوانه است',
  },
  {
    id: 'drawdown', label: 'بیشترین افت مسیر', unit: 'pct', better: 'high', weight: 0,
    hint: 'بدترین عقب‌نشینی از سقف مسیر؛ نزدیک صفر بهتر است',
  },
  {
    id: 'excess', label: 'مازاد بر نماد پایه', unit: 'pct', better: 'high', weight: 0,
    hint: 'بازده استراتژی منهای بازده خودِ سهم در همان بازه؛ «ارزشش را داشت یا نه»',
  },
  {
    id: 'speed', label: 'روز تا نخستین سود', unit: 'days', better: 'low', weight: 0,
    hint: 'چند روز معاملاتی طول کشید تا برای نخستین بار سبز شود',
  },
  {
    id: 'spread', label: 'پراکندگی نتیجه', unit: 'pct', better: 'low', weight: 0,
    hint: 'فاصلهٔ چارک بالا تا چارک پایین؛ زیاد بودنش یعنی نتیجه به انتخاب ترکیب وابسته است، نه به استراتژی',
  },
  {
    id: 'worst', label: 'بدترین ترکیب', unit: 'pct', better: 'high', weight: 0,
    hint: 'بازده بدترین ترکیب این استراتژی؛ دُمِ زیان',
  },
];

const METRIC_BY_ID = new Map(METRICS.map((row) => [row.id, row]));
export const metricMeta = (id) => METRIC_BY_ID.get(String(id ?? '')) || null;
export const DEFAULT_METRIC_WEIGHTS = Object.fromEntries(METRICS.map((row) => [row.id, row.weight]));

export const HEATMAP_MODES = [
  { id: 'cumulative', label: 'بازده تجمعی', hint: 'از روز ورود تا همان روز', unit: 'pct', signed: true },
  { id: 'step', label: 'بازده همان روز', hint: 'تغییر نسبت به آخرین روزِ دارای داده', unit: 'pct', signed: true },
  { id: 'drawdown', label: 'افت از سقف مسیر', hint: 'فاصله تا بهترین نقطه‌ای که تا آن روز دیده شده', unit: 'pct', signed: false },
  { id: 'winPct', label: 'نرخ برد همان روز', hint: 'چند درصد ترکیب‌ها آن روز سبز بودند', unit: 'pct', signed: false },
  { id: 'rank', label: 'رتبهٔ همان روز', hint: 'جایگاه بین همهٔ استراتژی‌های آن روز', unit: 'rank', signed: false },
];
const HEAT_BY_ID = new Map(HEATMAP_MODES.map((row) => [row.id, row]));
export const DEFAULT_HEATMAP_MODE = 'cumulative';
export const normalizeHeatmapMode = (id) => (HEAT_BY_ID.has(String(id ?? '')) ? String(id) : DEFAULT_HEATMAP_MODE);
export const heatmapMeta = (id) => HEAT_BY_ID.get(String(id ?? '')) || null;

/** رتبهٔ درصدی یک عدد بین هم‌گروه‌هایش: صفر بدترین، صد بهترین. */
function percentileScores(values, better) {
  const known = values.map((value, index) => ({ value: finite(value), index }))
    .filter((row) => row.value !== null);
  const out = values.map(() => null);
  if (!known.length) return out;
  if (known.length === 1) { out[known[0].index] = 100; return out; }
  const sorted = [...known].sort((a, b) => (better === 'low' ? a.value - b.value : b.value - a.value));
  // هم‌مقدارها یک نمره می‌گیرند — وگرنه ترتیب دلخواهِ مرتب‌سازی به نمره
  // نشت می‌کند و دو استراتژیِ دقیقاً برابر، ناعادلانه از هم جدا می‌شوند.
  let position = 0;
  while (position < sorted.length) {
    let end = position;
    while (end + 1 < sorted.length && sorted[end + 1].value === sorted[position].value) end += 1;
    const share = ((position + end) / 2) / (sorted.length - 1);
    const score = (1 - share) * 100;
    for (let index = position; index <= end; index++) out[sorted[index].index] = score;
    position = end + 1;
  }
  return out;
}

function aggregateColumn(series, weights, column, key, statistic, weighting) {
  const samples = series.map((row, index) => ({ value: row[key]?.[column] ?? null, weight: weights[index] }));
  return statOf(samples, statistic, weighting);
}

/**
 * تحلیل کامل یک اجرا.
 *
 * هیچ‌چیز اینجا بازپخش نمی‌شود — همه‌چیز از ماتریسی می‌آید که ریسه یک بار
 * ساخته است. برای همین عوض‌کردن مبنا، آماره، وزن یا بازه، لحظه‌ای است.
 */
export function analyzePortfolio({
  rows = [], matrix = null,
  basisId = DEFAULT_RETURN_BASIS, statistic = DEFAULT_STATISTIC, weighting = DEFAULT_WEIGHTING,
  from = null, to = null, weights = null,
} = {}) {
  const basis = normalizeBasis(basisId);
  const stat = normalizeStatistic(statistic);
  const mode = normalizeWeighting(weighting);
  const dates = Array.isArray(matrix?.dates) ? matrix.dates : [];
  const columns = columnsInRange(dates, from, to);
  const windowDates = columns.map((column) => dates[column]);

  const list = Array.isArray(rows) ? rows : [];
  const combos = list.map((row, index) => {
    const series = comboSeries(row, matrixRow(matrix, index), columns, basis);
    return {
      index,
      id: row?.id, strategyId: row?.strategyId, strategyName: row?.strategyName,
      groupId: row?.groupId, groupName: row?.groupName,
      direction: row?.direction, feasible: row?.feasible !== false,
      legs: row?.legs, strikes: row?.strikes, expiries: row?.expiries,
      entry: row?.entry, final: row?.final,
      weight: comboWeight(row),
      series,
    };
  });

  const usable = combos.filter((combo) => combo.series.ok && combo.series.finalIndex !== null);
  const unusable = combos.length - usable.length;

  // مسیر نماد پایه روی همین ستون‌ها، برای سنجهٔ «مازاد بر نماد پایه».
  const baseWindow = columns.map((column) => finite(matrix?.baseSeries?.[column]));
  let baseFinal = null;
  for (let index = baseWindow.length - 1; index >= 0; index--) {
    if (baseWindow[index] !== null) { baseFinal = baseWindow[index]; break; }
  }

  const byStrategy = new Map();
  for (const combo of usable) {
    const key = String(combo.strategyId ?? '');
    if (!byStrategy.has(key)) byStrategy.set(key, []);
    byStrategy.get(key).push(combo);
  }

  // ═══ مسیر تجمعی هر استراتژی و رتبهٔ روزانه ═══
  const strategyPaths = new Map();
  for (const [key, members] of byStrategy) {
    const series = members.map((combo) => combo.series);
    const memberWeights = members.map((combo) => combo.weight);
    const cumulative = [], step = [], drawdown = [], winPct = [], samples = [];
    for (let column = 0; column < columns.length; column++) {
      const cum = aggregateColumn(series, memberWeights, column, 'pct', stat, mode);
      cumulative.push(cum.value);
      samples.push(cum.samples);
      step.push(aggregateColumn(series, memberWeights, column, 'stepPct', stat, mode).value);
      drawdown.push(aggregateColumn(series, memberWeights, column, 'ddPct', stat, mode).value);
      const day = series.map((row) => row.pct[column]).filter((value) => value !== null);
      winPct.push(day.length ? (day.filter((value) => value > 0).length / day.length) * 100 : null);
    }
    strategyPaths.set(key, { cumulative, step, drawdown, winPct, samples, rank: columns.map(() => null) });
  }
  for (let column = 0; column < columns.length; column++) {
    const standing = [...strategyPaths.entries()]
      .map(([key, path]) => ({ key, value: path.cumulative[column] }))
      .filter((row) => row.value !== null)
      .sort((a, b) => b.value - a.value);
    standing.forEach((row, order) => { strategyPaths.get(row.key).rank[column] = order + 1; });
  }

  // ═══ سنجه‌های هر استراتژی ═══
  const strategies = [...byStrategy.entries()].map(([key, members]) => {
    const head = members[0];
    const path = strategyPaths.get(key);
    const finals = members.map((combo) => ({ value: combo.series.finalPct, weight: combo.weight }));
    const returnStat = statOf(finals, stat, mode);
    const drawdownStat = statOf(members.map((combo) => ({ value: combo.series.maxDrawdownPct, weight: combo.weight })), stat, mode);
    const p25 = statOf(finals, 'p25', mode).value;
    const p75 = statOf(finals, 'p75', mode).value;
    const wins = members.filter((combo) => combo.series.finalPct > 0).length;
    const losses = members.filter((combo) => combo.series.finalPct < 0).length;
    const speed = medianOf(members
      .map((combo) => combo.series.firstProfitIndex)
      .filter((value) => value !== null));
    const observed = members.reduce((sum, combo) => sum + combo.series.observed, 0);
    const possible = members.length * Math.max(1, columns.length);
    const worstPct = members.reduce((low, combo) => (low === null || combo.series.finalPct < low ? combo.series.finalPct : low), null);
    const bestPct = members.reduce((high, combo) => (high === null || combo.series.finalPct > high ? combo.series.finalPct : high), null);
    const painRatio = returnStat.value !== null && drawdownStat.value !== null && drawdownStat.value < -1e-9
      ? returnStat.value / Math.abs(drawdownStat.value)
      : null;
    return {
      strategyId: head.strategyId, strategyName: head.strategyName,
      groupId: head.groupId, groupName: head.groupName,
      direction: head.direction, feasible: head.feasible,
      samples: members.length, wins, losses,
      flat: members.length - wins - losses,
      path,
      metrics: {
        return: returnStat.value,
        winPct: members.length ? (wins / members.length) * 100 : null,
        painRatio,
        rank: medianOf(path.rank),
        coverage: possible > 0 ? (observed / possible) * 100 : null,
        drawdown: drawdownStat.value,
        excess: returnStat.value !== null && baseFinal !== null ? returnStat.value - baseFinal : null,
        speed,
        spread: p25 !== null && p75 !== null ? p75 - p25 : null,
        worst: worstPct,
      },
      best: bestPct, worst: worstPct, p25, p75,
      returnNote: returnStat.why,
      beyondBasis: members.some((combo) => combo.series.beyondBasis),
      topDays: path.rank.filter((value) => value === 1).length,
    };
  });

  // ═══ نمرهٔ ترکیبی ═══
  const activeWeights = {};
  for (const metric of METRICS) {
    const raw = finite(weights?.[metric.id]);
    activeWeights[metric.id] = raw !== null && raw > 0 ? raw : (weights ? 0 : metric.weight);
  }
  const scoreParts = new Map(strategies.map((row) => [row.strategyId, []]));
  for (const metric of METRICS) {
    if (!(activeWeights[metric.id] > 0)) continue;
    const scores = percentileScores(strategies.map((row) => row.metrics[metric.id]), metric.better);
    strategies.forEach((row, index) => {
      if (scores[index] === null) return;
      scoreParts.get(row.strategyId).push({ id: metric.id, label: metric.label, score: scores[index], weight: activeWeights[metric.id] });
    });
  }
  const totalWeight = METRICS.reduce((sum, metric) => sum + (activeWeights[metric.id] > 0 ? activeWeights[metric.id] : 0), 0);
  for (const row of strategies) {
    const parts = scoreParts.get(row.strategyId) || [];
    const covered = parts.reduce((sum, part) => sum + part.weight, 0);
    row.scoreParts = parts;
    row.score = covered > 0 ? parts.reduce((sum, part) => sum + (part.score * part.weight), 0) / covered : null;
    row.scoreCoverage = totalWeight > 0 ? (covered / totalWeight) * 100 : null;
  }
  const ranked = [...strategies].sort((a, b) => {
    if (a.score === null && b.score === null) return 0;
    if (a.score === null) return 1;
    if (b.score === null) return -1;
    return b.score - a.score;
  });
  ranked.forEach((row, index) => { row.rank = index + 1; });

  // ═══ دسته‌ها (خانواده‌ها) ═══
  const byGroup = new Map();
  for (const combo of usable) {
    const key = String(combo.groupId ?? '');
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(combo);
  }
  const groups = [...byGroup.entries()].map(([key, members]) => {
    const head = members[0];
    const finals = members.map((combo) => ({ value: combo.series.finalPct, weight: combo.weight }));
    const wins = members.filter((combo) => combo.series.finalPct > 0).length;
    const groupStrategies = ranked.filter((row) => String(row.groupId ?? '') === key);
    return {
      groupId: head.groupId, groupName: head.groupName,
      samples: members.length, wins,
      winPct: members.length ? (wins / members.length) * 100 : null,
      returnStat: statOf(finals, stat, mode).value,
      strategies: groupStrategies.length,
      bestStrategy: groupStrategies[0] || null,
      worstStrategy: groupStrategies.at(-1) || null,
      score: groupStrategies.length
        ? groupStrategies.reduce((sum, row) => sum + (row.score ?? 0), 0) / groupStrategies.length
        : null,
    };
  }).sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity));

  return {
    version: PORTFOLIO_REPORT_VERSION,
    basis: basisMeta(basis), basisId: basis, bases: RETURN_BASES,
    statistic: stat, statisticLabel: statisticMeta(stat)?.label || '',
    weighting: mode, weightingLabel: weightingMeta(mode)?.label || '',
    range: { from: windowDates[0] ?? null, to: windowDates.at(-1) ?? null, days: windowDates.length },
    dates: windowDates, columns,
    baseSeries: baseWindow, baseFinal,
    combos, usable: usable.length, unusable,
    strategies: ranked, groups,
    best: ranked[0] || null,
    worst: ranked.filter((row) => row.score !== null).at(-1) || null,
    weights: activeWeights,
    beyondBasis: usable.filter((combo) => combo.series.beyondBasis).length,
  };
}
