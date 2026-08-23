// تجمیع خالص داده‌های داشبورد تصمیم‌گیری.
//
// ورودی همان عکس خام دیده‌بان اختیار است. خروجی چهار سطح بازار، پایه،
// سررسید و قرارداد را نگه می‌دارد تا رابط برای عوض‌کردن دامنه مجبور به
// حدس‌زدن یا درخواست شبکه تازه نباشد.

import { buildChain, underlyingList } from './chain.mjs';
import { liveQuoteIv } from './live-market.mjs';

export function pctVsYesterday(last, yesterday) {
  const now = Number(last), prior = Number(yesterday);
  return now > 0 && prior > 0 ? ((now / prior) - 1) * 100 : NaN;
}

const emptyAggregate = (seed = {}) => ({
  ...seed, contracts: 0, tradedContracts: 0, positive: 0, negative: 0, unchanged: 0,
  volume: 0, value: 0, trades: 0, oi: 0, oiYday: 0,
  callVolume: 0, putVolume: 0, callValue: 0, putValue: 0,
  callOi: 0, putOi: 0, twoSided: 0, changePct: NaN, ivPct: NaN,
  _changeWeighted: 0, _changeWeight: 0, _ivWeighted: 0, _ivWeight: 0, _spreads: [],
});

function addContract(target, row) {
  target.contracts += 1;
  const traded = row.volume > 0 || row.trades > 0 || row.value > 0;
  if (traded) target.tradedContracts += 1;
  target.volume += row.volume; target.value += row.value; target.trades += row.trades;
  target.oi += row.oi; target.oiYday += row.oiYday;
  if (row.kind === 'call') {
    target.callVolume += row.volume; target.callValue += row.value; target.callOi += row.oi;
  } else {
    target.putVolume += row.volume; target.putValue += row.value; target.putOi += row.oi;
  }
  if (Number.isFinite(row.changePct)) {
    if (row.changePct > 0) target.positive += 1;
    else if (row.changePct < 0) target.negative += 1;
    else target.unchanged += 1;
    const weight = row.value > 0 ? row.value : 1;
    target._changeWeighted += row.changePct * weight; target._changeWeight += weight;
  }
  if (Number.isFinite(row.ivPct)) {
    const weight = row.value > 0 ? row.value : 1;
    target._ivWeighted += row.ivPct * weight; target._ivWeight += weight;
  }
  if (Number.isFinite(row.spreadPct)) { target._spreads.push(row.spreadPct); target.twoSided += 1; }
}

function finishAggregate(row) {
  const spreads = row._spreads.sort((a, b) => a - b);
  const middle = Math.floor(spreads.length / 2);
  const spreadPct = spreads.length
    ? (spreads.length % 2 ? spreads[middle] : (spreads[middle - 1] + spreads[middle]) / 2)
    : NaN;
  const out = { ...row,
    changePct: row._changeWeight > 0 ? row._changeWeighted / row._changeWeight : NaN,
    ivPct: row._ivWeight > 0 ? row._ivWeighted / row._ivWeight : NaN,
    spreadPct,
    putCallVolume: row.callVolume > 0 ? row.putVolume / row.callVolume : NaN,
    putCallOi: row.callOi > 0 ? row.putOi / row.callOi : NaN,
  };
  delete out._changeWeighted; delete out._changeWeight; delete out._ivWeighted;
  delete out._ivWeight; delete out._spreads;
  return out;
}

/** یک عکس فشرده و قابل سریال‌سازی برای همه دامنه‌های داشبورد. */
export function decisionDashboardSnapshot(rows, settings = {}) {
  const chain = buildChain(rows || []);
  const underlyings = underlyingList(chain, {
    rFree: settings.rFree, divYield: settings.divYield, yearDays: settings.dayCountYear,
  });
  const contracts = [], expiryMap = new Map(), marketExpiryMap = new Map();

  for (const ua of chain.values()) {
    const spot = Number(ua.last || ua.close);
    for (const expiry of ua.expiryList) {
      const expiryKey = `${ua.ins}:${expiry.endDate}`;
      const expiryAgg = emptyAggregate({
        key: expiryKey, uaIns: String(ua.ins), uaName: ua.name,
        endDate: expiry.endDate, days: expiry.days,
      });
      let marketAgg = marketExpiryMap.get(String(expiry.endDate));
      if (!marketAgg) {
        marketAgg = emptyAggregate({ key: String(expiry.endDate), endDate: expiry.endDate, days: expiry.days, underlyings: new Set() });
        marketExpiryMap.set(String(expiry.endDate), marketAgg);
      }
      marketAgg.underlyings.add(String(ua.ins));
      for (const strike of expiry.strikeList) {
        for (const quote of [strike.call, strike.put]) {
          if (!quote.ins) continue;
          const last = Number(quote.last || quote.close);
          const mid = quote.bid > 0 && quote.ask > 0 ? (quote.bid + quote.ask) / 2 : NaN;
          const contract = {
            ins: String(quote.ins), name: quote.name, kind: quote.kind,
            uaIns: String(ua.ins), uaName: ua.name, endDate: expiry.endDate, days: expiry.days,
            strike: strike.strike, size: strike.size, last, yday: quote.yday,
            changePct: pctVsYesterday(last, quote.yday), bid: quote.bid, ask: quote.ask,
            spreadPct: mid > 0 ? ((quote.ask - quote.bid) / mid) * 100 : NaN,
            volume: quote.vol, trades: quote.trades, value: quote.value,
            oi: quote.oi, oiYday: quote.oiYday,
            oiChange: Number(quote.oi) - Number(quote.oiYday),
            ivPct: liveQuoteIv({ ...quote, strike: strike.strike, days: expiry.days }, spot, settings),
          };
          contracts.push(contract); addContract(expiryAgg, contract); addContract(marketAgg, contract);
        }
      }
      expiryMap.set(expiryKey, finishAggregate(expiryAgg));
    }
  }

  const expiries = [...expiryMap.values()].sort((a, b) => b.value - a.value || a.days - b.days);
  const marketExpiries = [...marketExpiryMap.values()].map((item) => {
    const count = item.underlyings.size; item.underlyings = count;
    return finishAggregate(item);
  }).sort((a, b) => b.value - a.value || a.days - b.days);
  contracts.sort((a, b) => b.value - a.value || b.volume - a.volume || a.name.localeCompare(b.name, 'fa'));
  return { underlyings, expiries, marketExpiries, contracts };
}

/** ردیف‌های متناظر با انتخاب کاربر، بدون پرکردن داده گمشده. */
export function dashboardScope(snapshot, scope = {}) {
  const level = ['market', 'underlying', 'expiry', 'contract'].includes(scope.level) ? scope.level : 'market';
  const uaIns = String(scope.uaIns || ''), endDate = String(scope.endDate || ''), contractIns = String(scope.contractIns || '');
  let contracts = snapshot?.contracts || [];
  if (level !== 'market') contracts = contracts.filter((row) => String(row.uaIns) === uaIns);
  if (level === 'expiry' || level === 'contract') contracts = contracts.filter((row) => String(row.endDate) === endDate);
  if (level === 'contract') contracts = contracts.filter((row) => String(row.ins) === contractIns);
  const uaKeys = new Set(contracts.map((row) => String(row.uaIns)));
  const expiryKeys = new Set(contracts.map((row) => `${row.uaIns}:${row.endDate}`));
  return {
    level, contracts,
    underlyings: level === 'market' ? (snapshot?.underlyings || []) : (snapshot?.underlyings || []).filter((row) => uaKeys.has(String(row.ins))),
    expiries: level === 'market' ? (snapshot?.marketExpiries || []) : (snapshot?.expiries || []).filter((row) => expiryKeys.has(row.key)),
  };
}
