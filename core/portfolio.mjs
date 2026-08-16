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
  };
}
