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
function pricesAt(legs, priceIndex, date) {
  const prices = {};
  for (const leg of legs.filter((item) => item.kind !== 'underlying')) {
    const price = priceIndex.get(String(leg.ins))?.get(date);
    if (!Number.isFinite(price)) return null;
    prices[String(leg.ins)] = price;
  }
  return prices;
}

export async function buildRadarHistory({ ua, defs, seriesByIns, range, basis = 'CLOSE', settings = {},
  scale = 'raw', units = 1,
  onProgress = () => {}, cancel = () => false, yieldControl = async () => {} }) {
  const dates = radarDates(seriesByIns[String(ua.ins)] || [], range);
  const markDate = dates.at(-1), rows = [];
  const excluded = { entry: 0, mark: 0, invalid: 0 };
  if (!dates.length) return { dates, rows, excluded, expiryWindow: null };

  // رادارِ اکنون قرارداد و پنجره را در روز سنجش انتخاب می‌کند.
  // ابتدای بازه فقط مرز نمودار است، نه شرطِ وجود قرارداد یا روز ورود.
  const priceIndex = new Map(Object.entries(seriesByIns).map(([ins, series]) => [ins,
    new Map(series.map(row => [normalizeHistoryDate(row.date), historyPrice(row, basis)]))]));
  const minDays = Number.isFinite(settings.minDays) ? settings.minDays : 0;
  const maxDays = Number.isFinite(settings.maxDays) ? settings.maxDays : 400;
  const allExpiries = [...new Set(flattenActiveContracts(ua, settings.blockedExpiries).map(row => row.expiry))];
  const expiries = allExpiries.filter((expiry) => expiry > markDate);
  const inWindow = expiries.filter((expiry) => {
    const days = daysBetween(markDate, expiry);
    return days >= minDays && days <= maxDays;
  });
  const expiryWindow = {
    total: expiries.length, kept: inWindow.length, dropped: expiries.length - inWindow.length,
    minDays, maxDays, date: markDate, expired: allExpiries.length - expiries.length,
    // دورترین سررسیدی که افتاد — عددی که کاربر باید `maxDays` را تا آن
    // بالا ببرد. بی این، «سررسیدها افتادند» یک شکایت است نه یک راهنما.
    farthest: expiries.length ? Math.max(...expiries.map((expiry) => daysBetween(markDate, expiry))) : NaN,
  };
  const active = () => { if (cancel()) throw new Error('ساخت متوقف شد'); };
  for (let index = 0; index < defs.length; index++) {
    active();
    const def = defs[index];
    onProgress({ done: index, total: defs.length, name: def.name, combos: rows.length });
    await yieldControl(); active();
    const generated = generateHistoricalCombos({ def, ua, seriesByIns, startDate: markDate, entryBasis: basis,
      settings, filtered: true, liquidity: {}, cancel });
    excluded.mark += generated.noEntry || 0;
    for (let n = 0; n < generated.combos.length; n++) {
      if (n % 50 === 0) { await yieldControl(); active(); }
      const combo = generated.combos[n], legs = combo.legs.map((leg) => ({ ...leg }));
      const markPrices = pricesAt(legs, priceIndex, markDate);
      if (!markPrices) { excluded.mark++; continue; }
      const markGap = measureGap({ legs, prices: markPrices, strategyId: def.id, scale, units });
      if (!markGap.ok) { excluded.invalid++; continue; }
      // مبدأِ مقایسه، نخستین روزِ همین بازه با قیمت معتبرِ همهٔ پاهاست.
      // قرارداد تازه به‌خاطر نداشتن سابقه در ابتدای بازه حذف نمی‌شود؛
      // این تاریخ صریح نمایش داده می‌شود و ادعای ورود واقعی کاربر نیست.
      let entryGap = null, entryDate = null;
      for (const date of dates) {
        const prices = pricesAt(legs, priceIndex, date);
        if (!prices) continue;
        const measured = measureGap({ legs, prices, strategyId: def.id, scale, units });
        if (measured.ok) { entryGap = measured; entryDate = date; break; }
      }
      if (!entryGap) { excluded.entry++; continue; }
      const gap = measureGap({ legs, prices: markPrices, strategyId: def.id, entry: entryGap.current,
        daysLeft: Math.max(0, daysBetween(markDate, combo.expiries[0])), scale, units });
      if (!gap.ok) { excluded.invalid++; continue; }
      const series = dailyGapSeries({ legs, seriesByIns, dates, basis, strategyId: def.id,
        entry: entryGap.current, expiry: combo.expiries[0], scale, units, baseIns: String(ua.ins) });
      rows.push({ key: `${def.id}::${comboKey(legs)}`, def, legs, strikes: combo.strikes,
        expiry: combo.expiries[0], entryDate, markDate, entry: entryGap.current, gap, series, verdict: gapVerdict(series, gap) });
    }
  }
  onProgress({ done: defs.length, total: defs.length, combos: rows.length });
  return { dates, rows, excluded, expiryWindow };
}
