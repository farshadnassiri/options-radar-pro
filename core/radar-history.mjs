// کیفیت داده و ساخت رادار روی بازهٔ انتخابی؛ مستقل از رابط و شبکه.
import { comboKey, daysBetween, flattenActiveContracts, generateHistoricalCombos, historyPrice, normalizeHistoryDate } from './history.mjs';
import { measureGap } from './spread-gap.mjs';
import { dailyGapSeries, gapVerdict } from './spread-gap-series.mjs';

export function radarDates(series = [], range) {
  return [...new Set(series.map((row) => normalizeHistoryDate(row.date))
    .filter((date) => date && date >= range.from && date <= range.to))].sort((a, b) => a - b);
}

export function radarDataReport({ ua, seriesByIns = {}, errors = {}, range, basis = 'CLOSE', settings = {} }) {
  const all = flattenActiveContracts(ua, '');
  const contracts = flattenActiveContracts(ua, settings.blockedExpiries);
  const dates = radarDates(seriesByIns[String(ua.ins)] || [], range);
  const inspect = (item) => {
    const ins = String(item.ins), series = seriesByIns[ins] || [];
    const inRange = series.filter((row) => { const date = normalizeHistoryDate(row.date); return date >= range.from && date <= range.to; });
    const priced = inRange.filter((row) => Number.isFinite(historyPrice(row, basis)));
    const hasAt = (date) => priced.some((row) => normalizeHistoryDate(row.date) === date);
    const status = errors[ins] ? 'error' : !series.length ? 'empty' : !inRange.length ? 'outside' : !priced.length ? 'unpriced' : 'ready';
    return { ins, name: item.name || ins, status, error: errors[ins] || '', days: priced.length,
      entry: hasAt(dates[0]), mark: hasAt(dates.at(-1)) };
  };
  const items = contracts.map(inspect);
  return { dates, base: inspect(ua), items, listed: all.length, blocked: all.length - contracts.length,
    requested: contracts.length, ready: items.filter((item) => item.status === 'ready').length,
    failed: items.filter((item) => item.status === 'error').length,
    entryReady: items.filter((item) => item.entry && item.status !== 'error').length,
    markReady: items.filter((item) => item.mark && item.status !== 'error').length };
}

/** قیمتِ دقیقِ همین روز؛ روزِ دیگری جانشینش نمی‌شود. */
function pricesAt(legs, seriesByIns, date, basis) {
  const prices = {};
  for (const leg of legs.filter((item) => item.kind !== 'underlying')) {
    const row = (seriesByIns[String(leg.ins)] || []).find((item) => normalizeHistoryDate(item.date) === date);
    const price = historyPrice(row, basis);
    if (!Number.isFinite(price)) return null;
    prices[String(leg.ins)] = price;
  }
  return prices;
}

export async function buildRadarHistory({ ua, defs, seriesByIns, range, basis = 'CLOSE', settings = {},
  onProgress = () => {}, cancel = () => false, yieldControl = async () => {} }) {
  const dates = radarDates(seriesByIns[String(ua.ins)] || [], range);
  const startDate = dates[0], markDate = dates.at(-1), rows = [];
  const excluded = { entry: 0, mark: 0, invalid: 0 };
  if (!dates.length) return { dates, rows, excluded };
  const active = () => { if (cancel()) throw new Error('ساخت متوقف شد'); };
  for (let index = 0; index < defs.length; index++) {
    active();
    const def = defs[index];
    onProgress({ done: index, total: defs.length, name: def.name, combos: rows.length });
    await yieldControl(); active();
    const generated = generateHistoricalCombos({ def, ua, seriesByIns, startDate, entryBasis: basis,
      settings, filtered: true, liquidity: {}, cancel });
    excluded.entry += generated.noEntry || 0;
    for (let n = 0; n < generated.combos.length; n++) {
      if (n % 50 === 0) { await yieldControl(); active(); }
      const combo = generated.combos[n], legs = combo.legs.map((leg) => ({ ...leg }));
      const entryPrices = pricesAt(legs, seriesByIns, startDate, basis);
      if (!entryPrices) { excluded.entry++; continue; }
      const entryGap = measureGap({ legs, prices: entryPrices, strategyId: def.id });
      if (!entryGap.ok) { excluded.invalid++; continue; }
      const markPrices = pricesAt(legs, seriesByIns, markDate, basis);
      if (!markPrices || combo.expiries[0] < markDate) { excluded.mark++; continue; }
      const gap = measureGap({ legs, prices: markPrices, strategyId: def.id, entry: entryGap.current,
        daysLeft: Math.max(0, daysBetween(markDate, combo.expiries[0])) });
      if (!gap.ok) { excluded.invalid++; continue; }
      const series = dailyGapSeries({ legs, seriesByIns, dates, basis, strategyId: def.id,
        entry: entryGap.current, expiry: combo.expiries[0] });
      rows.push({ key: `${def.id}::${comboKey(legs)}`, def, legs, strikes: combo.strikes,
        expiry: combo.expiries[0], entry: entryGap.current, gap, series, verdict: gapVerdict(series, gap) });
    }
  }
  onProgress({ done: defs.length, total: defs.length, combos: rows.length });
  return { dates, rows, excluded };
}
