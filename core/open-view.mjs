// موتور خالص «نگاه باز».
//
// هر قرارداد اختیار یک سربه‌سر خرید دارد:
//   کال = اعمال + پریمیوم
//   پوت = اعمال - پریمیوم
// شاخص هر سمت، میانگین همین عددها با وزن ارزش معامله همان قرارداد است.
// قیمت گمشده، ارزش صفر و قیمت پایه غایب هیچ‌وقت با مشاهده قبلی پر نمی‌شود.

import { impliedVol } from './bs.mjs';
import { num } from './num.mjs';
import {
  daysBetween, historyPrice, indexHistory, normalizeHistoryDate,
} from './history.mjs';
import {
  INTRADAY_START_SECOND, INTRADAY_END_SECOND, inIntradaySession, tradeSecond,
} from './backtest.mjs';

export const OPEN_VIEW_RELATIONS = [
  ['basePrice', 'قیمت پایه'],
  ['callBreakeven', 'سربه‌سر وزنی کال'],
  ['putBreakeven', 'سربه‌سر وزنی پوت'],
  ['callIvPct', 'نوسان ضمنی کال'],
  ['putIvPct', 'نوسان ضمنی پوت'],
  ['callValue', 'ارزش کال'],
  ['putValue', 'ارزش پوت'],
];

export function optionBreakeven(kind, strike, premium) {
  const k = num(strike, NaN), p = num(premium, NaN);
  if (!(k > 0) || !(p > 0)) return NaN;
  return kind === 'call' ? k + p : kind === 'put' ? k - p : NaN;
}

export function weightedMean(rows = [], valueOf = (row) => row.value, weightOf = (row) => row.weight) {
  let numerator = 0, weight = 0, count = 0;
  for (const row of rows) {
    const value = num(valueOf(row), NaN), w = num(weightOf(row), NaN);
    if (!Number.isFinite(value) || !(w > 0)) continue;
    numerator += value * w;
    weight += w;
    count += 1;
  }
  return { value: weight > 0 ? numerator / weight : NaN, weight, count };
}

function pctChange(value, previous) {
  return Number.isFinite(value) && previous > 0 ? ((value / previous) - 1) * 100 : NaN;
}

function enrichChanges(rows) {
  let previous = null;
  return rows.map((row) => {
    const next = {
      ...row,
      baseChangePct: pctChange(row.basePrice, previous?.basePrice),
      callBreakevenChangePct: pctChange(row.callBreakeven, previous?.callBreakeven),
      putBreakevenChangePct: pctChange(row.putBreakeven, previous?.putBreakeven),
      callIvChangePp: Number.isFinite(row.callIvPct) && Number.isFinite(previous?.callIvPct)
        ? row.callIvPct - previous.callIvPct : NaN,
      putIvChangePp: Number.isFinite(row.putIvPct) && Number.isFinite(previous?.putIvPct)
        ? row.putIvPct - previous.putIvPct : NaN,
    };
    previous = row;
    return next;
  });
}

function enrichExpiryChanges(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row.expiry || '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].flatMap((group) => enrichChanges(group.sort((a, b) => a.date - b.date || num(a.second) - num(b.second))))
    .sort((a, b) => a.date - b.date || num(a.second) - num(b.second) || a.expiry - b.expiry);
}

function aggregate(items, basePrice, meta = {}) {
  const side = (kind) => {
    const rows = items.filter((item) => item.kind === kind && item.value > 0);
    const be = weightedMean(rows, (item) => item.breakeven, (item) => item.value);
    const strike = weightedMean(rows, (item) => item.strike, (item) => item.value);
    const premium = weightedMean(rows, (item) => item.premium, (item) => item.value);
    const iv = weightedMean(rows, (item) => item.iv, (item) => item.value);
    return { rows, be, strike, premium, iv };
  };
  const call = side('call'), put = side('put');
  const result = {
    ...meta,
    basePrice: basePrice > 0 ? basePrice : NaN,
    callBreakeven: call.be.value,
    putBreakeven: put.be.value,
    callStrike: call.strike.value,
    putStrike: put.strike.value,
    callPremium: call.premium.value,
    putPremium: put.premium.value,
    callIvPct: Number.isFinite(call.iv.value) ? call.iv.value * 100 : NaN,
    putIvPct: Number.isFinite(put.iv.value) ? put.iv.value * 100 : NaN,
    callValue: call.be.weight,
    putValue: put.be.weight,
    callIvValue: call.iv.weight,
    putIvValue: put.iv.weight,
    callContracts: call.be.count,
    putContracts: put.be.count,
    totalContracts: call.be.count + put.be.count,
    callBreakevenGap: Number.isFinite(call.be.value) && basePrice > 0 ? call.be.value - basePrice : NaN,
    putBreakevenGap: Number.isFinite(put.be.value) && basePrice > 0 ? basePrice - put.be.value : NaN,
    callBreakevenGapPct: Number.isFinite(call.be.value) && basePrice > 0 ? ((call.be.value / basePrice) - 1) * 100 : NaN,
    putBreakevenGapPct: Number.isFinite(put.be.value) && basePrice > 0 ? (1 - (put.be.value / basePrice)) * 100 : NaN,
    breakevenBand: Number.isFinite(call.be.value) && Number.isFinite(put.be.value)
      ? call.be.value - put.be.value : NaN,
  };
  return result;
}

function ivFor(item, basePrice, date, settings) {
  const days = daysBetween(date, item.expiry);
  if (!(basePrice > 0) || !(days > 0)) return NaN;
  return impliedVol(
    item.kind, item.premium, basePrice, item.strike,
    days / settings.yearDays, settings.rFree, settings.divYield,
    { lo: settings.ivLo, hi: settings.ivHi },
  );
}

function settingsOf(value = {}) {
  return {
    rFree: num(value.rFree, 0.30),
    divYield: num(value.divYield, 0),
    yearDays: Math.max(1, num(value.yearDays, value.dayCountYear || 365)),
    ivLo: Math.max(0.0001, num(value.ivLo, 0.01)),
    ivHi: Math.max(0.01, num(value.ivHi, 5)),
  };
}

function inRange(date, from, to) {
  return (!from || date >= from) && (!to || date <= to);
}

/** شاخص روزانه برای همه سررسیدها و ریز هر سررسید. */
export function analyzeDailyOpenView({
  ua, contracts = [], seriesByIns = {}, from = 0, to = 0, settings = {}, basis = 'CLOSE',
} = {}) {
  const cfg = settingsOf(settings);
  const baseIndex = indexHistory(seriesByIns[String(ua?.ins)] || []);
  const optionIndexes = new Map(contracts.map((contract) => [String(contract.ins), indexHistory(seriesByIns[String(contract.ins)] || [])]));
  const dates = [...baseIndex.keys()].filter((date) => inRange(date, normalizeHistoryDate(from), normalizeHistoryDate(to))).sort((a, b) => a - b);
  const rows = [], expiryRows = [], contractRows = [];

  for (const date of dates) {
    const baseRow = baseIndex.get(date);
    const basePrice = historyPrice(baseRow, basis);
    const items = [];
    for (const contract of contracts) {
      const market = optionIndexes.get(String(contract.ins))?.get(date);
      const premium = historyPrice(market, basis);
      // وزن فقط ارزش رسمی همان روز است. برآورد حجم×پایانی در شاخص وارد نمی‌شود.
      const value = Math.max(0, num(market?.value));
      const item = {
        date, ins: String(contract.ins), name: contract.name, kind: contract.kind,
        expiry: normalizeHistoryDate(contract.expiry), strike: num(contract.strike, NaN),
        premium, value, volume: Math.max(0, num(market?.vol)), trades: Math.max(0, num(market?.trades)),
        breakeven: optionBreakeven(contract.kind, contract.strike, premium), iv: NaN,
        included: premium > 0 && value > 0,
      };
      item.iv = ivFor(item, basePrice, date, cfg);
      contractRows.push(item);
      if (item.included) items.push(item);
    }
    rows.push(aggregate(items, basePrice, {
      date, baseValue: Math.max(0, num(baseRow?.value)), baseVolume: Math.max(0, num(baseRow?.vol)),
    }));
    const expiries = [...new Set(items.map((item) => item.expiry))].sort((a, b) => a - b);
    for (const expiry of expiries) {
      expiryRows.push(aggregate(items.filter((item) => item.expiry === expiry), basePrice, { date, expiry }));
    }
  }
  return { rows: enrichChanges(rows), expiryRows: enrichExpiryChanges(expiryRows), contractRows, settings: cfg };
}

function bucketTrades(trades, intervalMinutes, size = 1) {
  const width = Math.max(1, Math.trunc(num(intervalMinutes, 15))) * 60;
  const buckets = new Map();
  for (const trade of trades || []) {
    if (trade?.canceled || !inIntradaySession(trade?.time)) continue;
    const price = num(trade.price, NaN), quantity = Math.max(0, num(trade.quantity));
    if (!(price > 0) || !(quantity > 0)) continue;
    const second = tradeSecond(trade.time);
    // معامله دقیقاً در ۱۲:۳۰ متعلق به آخرین سطل جلسه است، نه سطل تازه‌ای
    // که انتهایش بیرون ساعت بازار می‌افتد.
    const bucketSecond = Math.min(second, INTRADAY_END_SECOND - 1);
    const startSecond = INTRADAY_START_SECOND + Math.floor((bucketSecond - INTRADAY_START_SECOND) / width) * width;
    if (startSecond > INTRADAY_END_SECOND) continue;
    const state = buckets.get(startSecond) || { amount: 0, quantity: 0, trades: 0, unknownCancel: false };
    state.amount += price * quantity;
    state.quantity += quantity;
    state.trades += 1;
    state.unknownCancel ||= trade.canceledKnown === false;
    buckets.set(startSecond, state);
  }
  return new Map([...buckets].map(([second, state]) => [second, {
    second, price: state.quantity > 0 ? state.amount / state.quantity : NaN,
    value: state.amount * Math.max(0, num(size)), volume: state.quantity,
    trades: state.trades, unknownCancel: state.unknownCancel,
  }]));
}

/** شاخص درون‌روزی چند روز، روی سطل انتخابی؛ هیچ قیمت بین سطل‌ها حمل نمی‌شود. */
export function analyzeIntradayOpenView({
  ua, contracts = [], dates = [], tradesByKey = {}, intervalMinutes = 15, settings = {},
} = {}) {
  const cfg = settingsOf(settings);
  const rows = [], expiryRows = [], contractRows = [];
  const normalizedDates = [...new Set(dates.map(normalizeHistoryDate).filter(Boolean))].sort((a, b) => a - b);

  for (const date of normalizedDates) {
    const baseBuckets = bucketTrades(tradesByKey[`${date}:${ua?.ins}`] || [], intervalMinutes, 1);
    const optionBuckets = new Map();
    for (const contract of contracts) {
      optionBuckets.set(String(contract.ins), bucketTrades(
        tradesByKey[`${date}:${contract.ins}`] || [], intervalMinutes, contract.size,
      ));
    }
    const seconds = [...new Set([...optionBuckets.values()].flatMap((map) => [...map.keys()]))].sort((a, b) => a - b);
    for (const second of seconds) {
      const base = baseBuckets.get(second);
      const basePrice = base?.price;
      const items = [];
      for (const contract of contracts) {
        const market = optionBuckets.get(String(contract.ins))?.get(second);
        if (!market) continue;
        const item = {
          date, second, ins: String(contract.ins), name: contract.name, kind: contract.kind,
          expiry: normalizeHistoryDate(contract.expiry), strike: num(contract.strike, NaN),
          premium: market.price, value: market.value, volume: market.volume, trades: market.trades,
          breakeven: optionBreakeven(contract.kind, contract.strike, market.price),
          iv: NaN, included: market.value > 0, unknownCancel: market.unknownCancel,
        };
        item.iv = ivFor(item, basePrice, date, cfg);
        contractRows.push(item);
        if (item.included) items.push(item);
      }
      rows.push(aggregate(items, basePrice, {
        date, second, intervalMinutes: Math.max(1, Math.trunc(num(intervalMinutes, 15))),
        baseValue: base?.value || 0, baseVolume: base?.volume || 0,
        unknownCancel: !!base?.unknownCancel || items.some((item) => item.unknownCancel),
      }));
      const expiries = [...new Set(items.map((item) => item.expiry))].sort((a, b) => a - b);
      for (const expiry of expiries) {
        expiryRows.push(aggregate(items.filter((item) => item.expiry === expiry), basePrice, { date, second, expiry }));
      }
    }
  }
  return { rows: enrichChanges(rows), expiryRows: enrichExpiryChanges(expiryRows), contractRows, settings: cfg };
}

export function pearson(rows = [], xKey, yKey) {
  const pairs = rows.map((row) => [num(row?.[xKey], NaN), num(row?.[yKey], NaN)])
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return { value: NaN, samples: pairs.length };
  const mx = pairs.reduce((sum, [x]) => sum + x, 0) / pairs.length;
  const my = pairs.reduce((sum, [, y]) => sum + y, 0) / pairs.length;
  let numerator = 0, xx = 0, yy = 0;
  for (const [x, y] of pairs) {
    numerator += (x - mx) * (y - my);
    xx += (x - mx) ** 2;
    yy += (y - my) ** 2;
  }
  return { value: xx > 0 && yy > 0 ? numerator / Math.sqrt(xx * yy) : NaN, samples: pairs.length };
}

export function relationMatrix(rows = [], definitions = OPEN_VIEW_RELATIONS) {
  return definitions.flatMap(([rowKey, rowLabel]) => definitions.map(([columnKey, columnLabel]) => ({
    rowKey, rowLabel, columnKey, columnLabel, ...pearson(rows, rowKey, columnKey),
  })));
}
