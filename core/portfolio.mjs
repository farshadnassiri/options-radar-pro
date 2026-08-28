// تجمیع گزارش آزمون هم‌زمان استراتژی‌ها.
//
// این فایل فقط خروجی‌های معتبر موتور تاریخ را خلاصه می‌کند. ردیف فاقد قیمت
// روز سنجش هرگز با آخرین قیمت قبلی جایگزین و وارد آمار سود/زیان نمی‌شود.

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function extremes(rows) {
  if (!rows.length) return { best: null, worst: null };
  return {
    best: rows.reduce((a, row) => row.final.returnPct > a.final.returnPct ? row : a),
    worst: rows.reduce((a, row) => row.final.returnPct < a.final.returnPct ? row : a),
  };
}

function summarizeGroup(rows, identity) {
  const wins = rows.filter((row) => row.final.netPnl > 0).length;
  const losses = rows.filter((row) => row.final.netPnl < 0).length;
  const flat = rows.length - wins - losses;
  const returns = rows.map((row) => row.final.returnPct);
  const pnls = rows.map((row) => row.final.netPnl);
  return {
    ...identity,
    samples: rows.length,
    wins, losses, flat,
    winPct: rows.length ? (wins / rows.length) * 100 : NaN,
    lossPct: rows.length ? (losses / rows.length) * 100 : NaN,
    meanReturn: average(returns),
    medianReturn: median(returns),
    meanPnl: average(pnls),
    medianPnl: median(pnls),
    totalPnl: pnls.reduce((sum, value) => sum + value, 0),
    ...extremes(rows),
  };
}

function groupRows(rows, keyOf, identityOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([key, list]) => summarizeGroup(list, identityOf(list[0], key)));
}

function summarizeTimeline(rows, strategies) {
  const dates = [...new Set(rows.flatMap((row) => (row?.path?.daily || [])
    .filter((point) => finite(point?.netPnl) && finite(point?.returnPct) && Number.isFinite(Number(point?.date)))
    .map((point) => Number(point.date))))].sort((a, b) => a - b);
  if (!dates.length) return { dates: [], strategies: [], best: null, worst: null };

  const identity = new Map(strategies.map((row) => [row.strategyId, row]));
  const pointsByStrategy = new Map(strategies.map((row) => [row.strategyId, []]));
  const bucketsByDate = new Map(dates.map((date) => [date, new Map()]));
  for (const row of rows) {
    for (const point of row?.path?.daily || []) {
      const date = Number(point?.date);
      if (!bucketsByDate.has(date) || !finite(point?.netPnl) || !finite(point?.returnPct)) continue;
      const buckets = bucketsByDate.get(date);
      if (!buckets.has(row.strategyId)) buckets.set(row.strategyId, []);
      buckets.get(row.strategyId).push(point);
    }
  }
  for (const date of dates) {
    const buckets = bucketsByDate.get(date);
    const ranked = [...buckets.entries()].map(([strategyId, points]) => ({
      strategyId,
      date,
      samples: points.length,
      medianReturn: median(points.map((point) => point.returnPct)),
      medianPnl: median(points.map((point) => point.netPnl)),
    })).sort((a, b) => (b.medianReturn - a.medianReturn)
      || (b.samples - a.samples)
      || String(identity.get(a.strategyId)?.strategyName || a.strategyId)
        .localeCompare(String(identity.get(b.strategyId)?.strategyName || b.strategyId), 'fa'));
    ranked.forEach((point, index) => pointsByStrategy.get(point.strategyId)?.push({ ...point, rank: index + 1 }));
  }

  const timelineStrategies = strategies.map((strategy) => {
    const points = pointsByStrategy.get(strategy.strategyId) || [];
    return {
      strategyId: strategy.strategyId,
      strategyName: strategy.strategyName,
      groupName: strategy.groupName,
      points,
      observedDays: points.length,
      medianRank: median(points.map((point) => point.rank)),
      medianReturn: median(points.map((point) => point.medianReturn)),
      topDays: points.filter((point) => point.rank === 1).length,
    };
  }).filter((strategy) => strategy.points.length);
  const comparable = timelineStrategies.filter((strategy) => strategy.observedDays === dates.length);
  const ordered = [...(comparable.length ? comparable : timelineStrategies)].sort((a, b) => (a.medianRank - b.medianRank)
    || (b.medianReturn - a.medianReturn)
    || (b.observedDays - a.observedDays));
  return {
    dates,
    strategies: timelineStrategies,
    best: ordered[0] || null,
    worst: ordered.at(-1) || null,
  };
}

/**
 * خلاصه قابل گزارش از نتیجه همه ترکیب‌ها. معیار رتبه‌بندی استراتژی، میانه
 * بازده است؛ بهترین تک‌ترکیب جداگانه گزارش می‌شود تا پرت‌ها پنهان نمانند.
 */
export function summarizePortfolio(rows = []) {
  const valid = rows.filter((row) => finite(row?.final?.netPnl) && finite(row?.final?.returnPct));
  const wins = valid.filter((row) => row.final.netPnl > 0).length;
  const losses = valid.filter((row) => row.final.netPnl < 0).length;
  const flat = valid.length - wins - losses;
  const strategies = groupRows(valid, (row) => row.strategyId, (row) => ({
    strategyId: row.strategyId,
    strategyName: row.strategyName,
    groupId: row.groupId,
    groupName: row.groupName,
    direction: row.direction,
    feasible: row.feasible !== false,
  })).sort((a, b) => (b.medianReturn - a.medianReturn) || (b.winPct - a.winPct) || (b.samples - a.samples));
  const groups = groupRows(valid, (row) => row.groupId, (row) => ({
    groupId: row.groupId,
    groupName: row.groupName,
  })).sort((a, b) => (b.medianReturn - a.medianReturn) || (b.winPct - a.winPct));
  const { best, worst } = extremes(valid);
  const timeline = summarizeTimeline(valid, strategies);
  return {
    total: valid.length,
    excluded: Math.max(0, rows.length - valid.length),
    wins, losses, flat,
    winPct: valid.length ? (wins / valid.length) * 100 : NaN,
    lossPct: valid.length ? (losses / valid.length) * 100 : NaN,
    flatPct: valid.length ? (flat / valid.length) * 100 : NaN,
    meanReturn: average(valid.map((row) => row.final.returnPct)),
    medianReturn: median(valid.map((row) => row.final.returnPct)),
    totalPnl: valid.reduce((sum, row) => sum + row.final.netPnl, 0),
    bestTrade: best,
    worstTrade: worst,
    bestStrategy: strategies[0] || null,
    worstStrategy: strategies.at(-1) || null,
    strategies,
    groups,
    timeline,
  };
}
