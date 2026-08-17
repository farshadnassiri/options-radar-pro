// ابزارهای خالص بک‌تست سریع.
//
// مسیر روزانه را موتور history می‌سازد. این فایل فقط ریزمعامله‌های روز آخر
// را به ارزش‌گذاری‌های مشاهده‌شده تبدیل می‌کند. «آخرین معامله تا این لحظه»
// قیمت قابل‌اجرای هم‌زمان نیست و مصرف‌کننده باید همین محدودیت را نشان دهد.

import { grossCash, entryFees } from './payoff.mjs';
import { EPS, num } from './num.mjs';

const reverseSide = (side) => (side === 'buy' ? 'sell' : 'buy');
export const INTRADAY_START_SECOND = 9 * 3600;
export const INTRADAY_END_SECOND = (12 * 3600) + (30 * 60);
export const INTRADAY_FRESH_SECOND = 5 * 60;

// ═══════════════════ نرمال‌سازی ریزمعامله بالادست ═══════════════════
//
// معامله باطل‌شده «ارزش‌گذاری مشاهده‌شده» نیست و نباید در بازپخش بنشیند.
//
// endpoint تاریخی `Trade/GetTradeHistory` میدان `canceled` را اعلام می‌کند؛
// دو املای سازگار قدیمی نیز برای پاسخ‌های کش‌شده خوانده می‌شود و — مهم‌تر —
// نتیجه در `canceledKnown` علامت می‌خورد: اگر بالادست هیچ‌کدام
// را نفرستد یعنی ما از وضعیت ابطال بی‌خبریم، نه اینکه چیزی باطل نشده.
// مصرف‌کننده باید همین ندانستن را به کاربر نشان دهد، نه اینکه سکوت کند.
//
// برای تأیید: یک پاسخ واقعی بگیرید و `Object.keys(rows[0])` را ببینید؛ اگر
// نام دیگری بود همین‌جا اضافه شود.
const CANCEL_KEYS = ['canceled', 'cancelled', 'isCanceled'];

export function canceledFlag(row) {
  for (const key of CANCEL_KEYS) {
    if (row?.[key] === undefined || row?.[key] === null) continue;
    return row[key] === true || Number(row[key]) === 1;
  }
  return null;                                   // بالادست چیزی نگفته است
}

export function normalizeTrades(rows = []) {
  return rows.map((r) => {
    const flag = canceledFlag(r);
    return {
      sequence: Number(r.nTran) || 0, time: Number(r.hEven) || 0,
      quantity: Number(r.qTitTran) || 0, price: Number(r.pTran) || 0,
      canceled: flag === true, canceledKnown: flag !== null,
    };
  }).filter((r) => r.price > 0 && r.time > 0)
    .sort((a, b) => a.time - b.time || a.sequence - b.sequence);
}

/** زمان HHMMSS را به ثانیه از ابتدای روز تبدیل می‌کند. */
export function tradeSecond(value) {
  const raw = String(Math.max(0, Math.trunc(num(value)))).padStart(6, '0').slice(-6);
  const h = Number(raw.slice(0, 2)), m = Number(raw.slice(2, 4)), s = Number(raw.slice(4, 6));
  return h * 3600 + m * 60 + s;
}

export function tradeTimeLabel(value) {
  const raw = String(Math.max(0, Math.trunc(num(value)))).padStart(6, '0').slice(-6);
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4, 6)}`;
}

/** فقط جلسه پیوسته بازار؛ پیش‌گشایش و داده پس از ۱۲:۳۰ وارد تحلیل نمی‌شود. */
export function inIntradaySession(value) {
  const second = tradeSecond(value);
  return second >= INTRADAY_START_SECOND && second <= INTRADAY_END_SECOND;
}

/**
 * آخرین معامله مشاهده‌شده هر پا را روی یک خط زمانی مشترک می‌گذارد.
 * تا وقتی همه پاها دست‌کم یک معامله ندارند، هیچ عدد مالی ساخته نمی‌شود.
 */
export function replayIntraday({ replay, tradesByIns = {}, baseTrades = [], fees = {} }) {
  if (!replay?.ok || !replay.priced?.length) return [];
  const events = [];
  const indexesByIns = new Map();
  replay.priced.forEach((leg, index) => {
    const key = String(leg.ins);
    if (!indexesByIns.has(key)) indexesByIns.set(key, []);
    indexesByIns.get(key).push(index);
  });
  for (const [ins, legIndexes] of indexesByIns) {
    for (const trade of tradesByIns[ins] || []) {
      const price = num(trade.price, NaN);
      if (!(price > 0) || trade.canceled || !inIntradaySession(trade.time)) continue;
      events.push({ ...trade, price, legIndexes, source: 'leg', second: tradeSecond(trade.time) });
    }
  }
  for (const trade of baseTrades || []) {
    if (!(num(trade.price) > 0) || trade.canceled || !inIntradaySession(trade.time)) continue;
    events.push({ ...trade, price: num(trade.price), source: 'base', second: tradeSecond(trade.time) });
  }
  events.sort((a, b) => a.second - b.second || num(a.sequence) - num(b.sequence) || a.source.localeCompare(b.source));

  const latest = new Map();
  const firstPrices = new Map(), cumulativeVolumes = new Map(), tradeCounts = new Map();
  let lastBase = NaN, baseCumulativeVolume = 0, baseTradeCount = 0, baseLastSecond = NaN;
  // حجم تجمعی سطر باید همان چیزی باشد که واقعاً معامله شده. اگر دو پا روی یک
  // قرارداد بنشینند (نسبتی، رول)، یک معامله فیزیکی به هر دو اندیس می‌نشیند و
  // جمعِ حجم‌های پا آن را دوبار می‌شمارد. پس جمع رویدادها نگه داشته می‌شود،
  // نه جمع پاها؛ همان واحدی که `intervals.volume` هم با آن ساخته می‌شود.
  let cumulativeVolume = 0;
  const out = [];
  const capital = num(replay.entry?.capital?.value, NaN);
  const firstBase = replay.rows.find((row) => Number.isFinite(row.baseClose))?.baseClose;

  for (let at = 0; at < events.length;) {
    const second = events[at].second;
    const secondVolumes = new Map();
    let eventVolume = 0, eventTrades = 0, baseSecondVolume = 0, baseSecondTrades = 0;
    while (at < events.length && events[at].second === second) {
      const event = events[at];
      const quantity = Math.max(0, num(event.quantity));
      if (event.source === 'base') {
        lastBase = event.price;
        baseLastSecond = second;
        baseCumulativeVolume += quantity;
        baseTradeCount += 1;
        baseSecondVolume += quantity;
        baseSecondTrades += 1;
      } else {
        eventVolume += quantity;
        eventTrades += 1;
        for (const index of event.legIndexes) {
          latest.set(index, event);
          if (!firstPrices.has(index)) firstPrices.set(index, event.price);
          cumulativeVolumes.set(index, (cumulativeVolumes.get(index) || 0) + quantity);
          tradeCounts.set(index, (tradeCounts.get(index) || 0) + 1);
          secondVolumes.set(index, (secondVolumes.get(index) || 0) + quantity);
        }
      }
      at += 1;
    }
    cumulativeVolume += eventVolume;   // پیش از خروج: حجم حتی در ثانیه‌های ناقص هم معامله شده است
    if (latest.size !== replay.priced.length) continue;

    const perLeg = replay.priced.map((leg, index) => {
      const trade = latest.get(index);
      const close = { ...leg, side: reverseSide(leg.side), price: trade.price };
      const entryFee = entryFees([leg], fees);
      const exitFee = entryFees([close], fees);
      const grossPnl = grossCash([leg]) + grossCash([close]);
      return {
        index, ins: String(leg.ins), name: leg.name, side: leg.side, kind: leg.kind,
        entryPrice: leg.price, exitPrice: trade.price, quantity: num(trade.quantity),
        sequence: num(trade.sequence), grossPnl, entryFee, exitFee,
        netPnl: grossPnl - entryFee - exitFee,
        pricePct: firstPrices.get(index) > 0 ? ((trade.price / firstPrices.get(index)) - 1) * 100 : NaN,
        secondVolume: secondVolumes.get(index) || 0,
        cumulativeVolume: cumulativeVolumes.get(index) || 0,
        tradeCount: tradeCounts.get(index) || 0,
        lastTradeSecond: trade.second,
        ageSec: Math.max(0, second - trade.second),
        observedNow: trade.second === second,
      };
    });
    const netPnl = perLeg.reduce((sum, leg) => sum + leg.netPnl, 0);
    const maxAgeSec = Math.max(...perLeg.map((leg) => leg.ageSec));
    out.push({
      second, time: events[at - 1].time, timeLabel: tradeTimeLabel(events[at - 1].time),
      netPnl, returnPct: capital > EPS ? (netPnl / capital) * 100 : NaN,
      basePrice: lastBase,
      basePct: lastBase > 0 && firstBase > 0 ? ((lastBase / firstBase) - 1) * 100 : NaN,
      eventVolume, eventTrades,
      cumulativeVolume,
      activeLegs: perLeg.filter((leg) => leg.observedNow).length,
      maxAgeSec, allFresh: maxAgeSec <= INTRADAY_FRESH_SECOND,
      baseSecondVolume, baseSecondTrades, baseCumulativeVolume, baseTradeCount,
      baseAgeSec: Number.isFinite(baseLastSecond) ? Math.max(0, second - baseLastSecond) : NaN,
      perLeg,
    });
  }
  return out;
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : NaN;
function correlation(a, b) {
  if (a.length < 2 || a.length !== b.length) return NaN;
  const ma = mean(a), mb = mean(b);
  const top = a.reduce((sum, value, index) => sum + ((value - ma) * (b[index] - mb)), 0);
  const da = Math.sqrt(a.reduce((sum, value) => sum + ((value - ma) ** 2), 0));
  const db = Math.sqrt(b.reduce((sum, value) => sum + ((value - mb) ** 2), 0));
  return da > EPS && db > EPS ? top / (da * db) : NaN;
}

/** خلاصه تحلیلی مسیر ثانیه‌ای، بدون ساختن داده برای بازه‌های فاقد مشاهده. */
export function summarizeIntraday(points = [], { bucketSeconds = 15 * 60 } = {}) {
  const rows = points.filter((point) => Number.isFinite(point?.netPnl))
    .sort((a, b) => a.second - b.second);
  if (!rows.length) return { points: 0, first: null, last: null, best: null, worst: null, intervals: [], legs: [], correlation: [] };

  const first = rows[0], last = rows.at(-1);
  const best = rows.reduce((current, row) => row.netPnl > current.netPnl ? row : current, first);
  const worst = rows.reduce((current, row) => row.netPnl < current.netPnl ? row : current, first);
  let peak = first.netPnl, maxDrawdown = 0, positiveSeconds = 0, freshSeconds = 0, observedSeconds = 0;
  rows.forEach((row, index) => {
    peak = Math.max(peak, row.netPnl);
    maxDrawdown = Math.min(maxDrawdown, row.netPnl - peak);
    const nextSecond = rows[index + 1]?.second ?? row.second;
    const duration = Math.max(0, nextSecond - row.second);
    observedSeconds += duration;
    if (row.netPnl > 0) positiveSeconds += duration;
    if (row.allFresh) freshSeconds += duration;
  });

  const span = Math.max(1, INTRADAY_END_SECOND - INTRADAY_START_SECOND);
  const width = Math.max(60, Math.trunc(num(bucketSeconds, 15 * 60)));
  const grouped = new Map();
  for (const row of rows) {
    const bounded = Math.min(row.second, INTRADAY_END_SECOND - 1);
    const start = INTRADAY_START_SECOND + Math.floor((bounded - INTRADAY_START_SECOND) / width) * width;
    if (!grouped.has(start)) grouped.set(start, []);
    grouped.get(start).push(row);
  }
  const intervals = [];
  for (let startSecond = INTRADAY_START_SECOND; startSecond < INTRADAY_END_SECOND; startSecond += width) {
    const list = grouped.get(startSecond) || [];
    intervals.push({
      startSecond,
      endSecond: Math.min(INTRADAY_END_SECOND, startSecond + width),
      openPnl: list[0]?.netPnl,
      closePnl: list.at(-1)?.netPnl,
      highPnl: list.length ? Math.max(...list.map((row) => row.netPnl)) : NaN,
      lowPnl: list.length ? Math.min(...list.map((row) => row.netPnl)) : NaN,
      changePnl: list.length ? list.at(-1).netPnl - list[0].netPnl : NaN,
      observations: list.length,
      volume: list.reduce((sum, row) => sum + num(row.eventVolume), 0),
      trades: list.reduce((sum, row) => sum + num(row.eventTrades), 0),
      freshPct: list.length ? (list.filter((row) => row.allFresh).length / list.length) * 100 : NaN,
    });
  }

  const legs = last.perLeg.map((lastLeg, index) => {
    const values = rows.map((row) => row.perLeg[index]).filter(Boolean);
    return {
      index, ins: lastLeg.ins, name: lastLeg.name, side: lastLeg.side, kind: lastLeg.kind,
      firstPrice: values[0]?.exitPrice, lastPrice: values.at(-1)?.exitPrice,
      pricePct: values.at(-1)?.pricePct,
      firstPnl: values[0]?.netPnl, lastPnl: values.at(-1)?.netPnl,
      pnlChange: values.at(-1)?.netPnl - values[0]?.netPnl,
      bestPnl: Math.max(...values.map((leg) => leg.netPnl)),
      worstPnl: Math.min(...values.map((leg) => leg.netPnl)),
      cumulativeVolume: lastLeg.cumulativeVolume,
      tradeCount: lastLeg.tradeCount,
      ageSec: lastLeg.ageSec,
    };
  });
  const deltas = legs.map((_, legIndex) => rows.slice(1).map((row, index) =>
    row.perLeg[legIndex].netPnl - rows[index].perLeg[legIndex].netPnl));
  const correlationMatrix = legs.map((_, row) => legs.map((__, col) => row === col ? 1 : correlation(deltas[row], deltas[col])));

  return {
    points: rows.length, first, last, best, worst,
    firstProfit: rows.find((row) => row.netPnl > 0) || null,
    maxDrawdown,
    observedSeconds,
    coveragePct: ((last.second - first.second) / span) * 100,
    positiveTimePct: observedSeconds > 0 ? (positiveSeconds / observedSeconds) * 100 : NaN,
    freshTimePct: observedSeconds > 0 ? (freshSeconds / observedSeconds) * 100 : NaN,
    intervals, legs, correlation: correlationMatrix,
  };
}

/** مسیر ترکیبی: روزهای پیشین یک نقطه، روز آخر هر ریزمعامله یک نقطه. */
export function combinedBacktestPath(replay, intraday = [], mode = 'combined') {
  const daily = (replay?.rows || []).filter((row) => row.status === 'ok');
  if (mode === 'daily' || !intraday.length) return daily.map((row) => ({ ...row, granularity: 'day' }));
  if (mode === 'intraday') return intraday.map((row) => ({ ...row, date: replay.endDate, granularity: 'trade' }));
  return [
    ...daily.filter((row) => row.date < replay.endDate).map((row) => ({ ...row, granularity: 'day' })),
    ...intraday.map((row) => ({ ...row, date: replay.endDate, granularity: 'trade' })),
  ];
}
