// عکس فشردهٔ «نبض زنده» و تاریخچهٔ کوتاه مرورگر.
//
// این ماژول فقط عدد خام برمی‌گرداند. اگر یک جزءِ ارزش سفارش‌ها ناقص باشد،
// جمع کل همان سنجه NaN می‌ماند؛ جمع ناقص نباید شبیه کل بازار نمایش داده شود.

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : NaN;
const nonNegative = (value) => Number.isFinite(finite(value)) && finite(value) >= 0 ? finite(value) : NaN;

function strictSum(rows, valueOf) {
  if (!rows.length) return NaN;
  let total = 0;
  for (const row of rows) {
    const value = valueOf(row);
    if (!Number.isFinite(value)) return NaN;
    total += value;
  }
  return total;
}

function orderValue(price, quantity, size = 1) {
  const p = nonNegative(price), q = nonNegative(quantity), multiplier = nonNegative(size);
  return Number.isFinite(p) && Number.isFinite(q) && multiplier > 0 ? p * q * multiplier : NaN;
}

function sideTotal(contracts, kind, side) {
  return strictSum(contracts.filter((row) => row.kind === kind), (row) => {
    const price = side === 'buy' ? row.bid : row.ask;
    const quantity = side === 'buy' ? row.bidQty : row.askQty;
    return orderValue(price, quantity, row.size);
  });
}

function oiTotal(contracts, kind, yesterday = false) {
  const rows = contracts.filter((row) => row.kind === kind);
  return strictSum(rows, (row) => nonNegative(yesterday ? row.oiYday : row.oi));
}

function baseOrderTotals(underlyings, baseBooks) {
  if (!underlyings.length) return { buy: NaN, sell: NaN, covered: 0, total: 0 };
  let buy = 0, sell = 0, covered = 0;
  for (const row of underlyings) {
    const book = baseBooks?.[String(row.ins)]?.book;
    if (!Array.isArray(book) || !book.length) continue;
    const buyPart = strictSum(book, (level) => orderValue(level.bid, level.bidQty));
    const sellPart = strictSum(book, (level) => orderValue(level.ask, level.askQty));
    if (!Number.isFinite(buyPart) || !Number.isFinite(sellPart)) continue;
    buy += buyPart; sell += sellPart; covered += 1;
  }
  return {
    buy: covered === underlyings.length ? buy : NaN,
    sell: covered === underlyings.length ? sell : NaN,
    covered,
    total: underlyings.length,
  };
}

/** عکس جاری همه سنجه‌های هفت نمودار نبض بازار. */
export function marketPulseSnapshot(universe = {}, baseBooks = {}) {
  const contracts = Array.isArray(universe.contracts) ? universe.contracts : [];
  const underlyings = Array.isArray(universe.underlyings) ? universe.underlyings : [];
  const calls = contracts.filter((row) => row.kind === 'call');
  const puts = contracts.filter((row) => row.kind === 'put');
  const sum = (rows, key) => strictSum(rows, (row) => nonNegative(row[key]));
  const baseOrders = baseOrderTotals(underlyings, baseBooks);
  const callOi = oiTotal(contracts, 'call'), putOi = oiTotal(contracts, 'put');
  const callOiYday = oiTotal(contracts, 'call', true), putOiYday = oiTotal(contracts, 'put', true);
  return {
    contracts: contracts.length,
    tradedContracts: contracts.filter((row) => nonNegative(row.volume) > 0 || nonNegative(row.value) > 0 || nonNegative(row.trades) > 0).length,
    callValue: sum(calls, 'value'), putValue: sum(puts, 'value'),
    optionValue: sum(contracts, 'value'), optionVolume: sum(contracts, 'volume'), optionTrades: sum(contracts, 'trades'),
    callOi, putOi, callOiYday, putOiYday,
    callOiChange: Number.isFinite(callOiYday) ? callOi - callOiYday : NaN,
    putOiChange: Number.isFinite(putOiYday) ? putOi - putOiYday : NaN,
    baseBuyOrders: baseOrders.buy, baseSellOrders: baseOrders.sell,
    baseBookCovered: baseOrders.covered, baseBookTotal: baseOrders.total,
    callBuyOrders: sideTotal(contracts, 'call', 'buy'),
    callSellOrders: sideTotal(contracts, 'call', 'sell'),
    putBuyOrders: sideTotal(contracts, 'put', 'buy'),
    putSellOrders: sideTotal(contracts, 'put', 'sell'),
    priceChanges: underlyings.map((row) => ({
      ins: String(row.ins || ''), name: String(row.name || ''),
      changePct: finite(row.changePct), value: nonNegative(row.value), volume: nonNegative(row.volume),
    })).filter((row) => Number.isFinite(row.changePct)),
  };
}

const delta = (now, before) => Number.isFinite(now) && Number.isFinite(before) && now >= before ? now - before : NaN;

/**
 * نقطه تازه را جایگزین/اضافه می‌کند و شدت معامله را فقط از اختلاف دو عکس
 * معتبر می‌سازد. کاهش شمارنده یعنی جلسه یا منبع عوض شده و تاریخچه ریست است.
 */
export function appendMarketPulseHistory(history = [], point = {}, maxPoints = 240) {
  const second = finite(point.second), at = finite(point.at);
  if (!Number.isFinite(second) || !Number.isFinite(at)) return Array.isArray(history) ? history : [];
  let rows = (Array.isArray(history) ? history : []).filter((row) => Number.isFinite(row.second) && Number.isFinite(row.at));
  const last = rows.at(-1);
  if (last && (at - last.at > 8 * 60 * 60 * 1000
    || (Number.isFinite(point.optionValue) && Number.isFinite(last.optionValue) && point.optionValue < last.optionValue))) rows = [];
  rows = rows.filter((row) => !(row.second === second && Math.abs(row.at - at) < 5 * 60 * 1000));
  const before = rows.at(-1);
  const next = {
    ...point, second, at,
    callIntensityValue: before ? delta(point.callValue, before.callValue) : NaN,
    putIntensityValue: before ? delta(point.putValue, before.putValue) : NaN,
    optionIntensityValue: before ? delta(point.optionValue, before.optionValue) : NaN,
    optionIntensityVolume: before ? delta(point.optionVolume, before.optionVolume) : NaN,
    optionIntensityTrades: before ? delta(point.optionTrades, before.optionTrades) : NaN,
  };
  return [...rows, next].sort((a, b) => a.at - b.at).slice(-Math.max(2, Math.trunc(maxPoints) || 240));
}
