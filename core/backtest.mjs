// ابزارهای خالص بک‌تست سریع.
//
// مسیر روزانه را موتور history می‌سازد. این فایل فقط ریزمعامله‌های روز آخر
// را به ارزش‌گذاری‌های مشاهده‌شده تبدیل می‌کند. «آخرین معامله تا این لحظه»
// قیمت قابل‌اجرای هم‌زمان نیست و مصرف‌کننده باید همین محدودیت را نشان دهد.

import { grossCash, entryFees } from './payoff.mjs';
import { EPS, num } from './num.mjs';

const reverseSide = (side) => (side === 'buy' ? 'sell' : 'buy');

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

/**
 * آخرین معامله مشاهده‌شده هر پا را روی یک خط زمانی مشترک می‌گذارد.
 * تا وقتی همه پاها دست‌کم یک معامله ندارند، هیچ عدد مالی ساخته نمی‌شود.
 */
export function replayIntraday({ replay, tradesByIns = {}, baseTrades = [], fees = {} }) {
  if (!replay?.ok || !replay.priced?.length) return [];
  const events = [];
  replay.priced.forEach((leg, index) => {
    for (const trade of tradesByIns[String(leg.ins)] || []) {
      const price = num(trade.price, NaN);
      if (!(price > 0) || trade.canceled) continue;
      events.push({ ...trade, price, legIndex: index, second: tradeSecond(trade.time) });
    }
  });
  const baseEvents = (baseTrades || [])
    .filter((trade) => num(trade.price) > 0 && !trade.canceled)
    .map((trade) => ({ ...trade, price: num(trade.price), second: tradeSecond(trade.time) }))
    .sort((a, b) => a.second - b.second || num(a.sequence) - num(b.sequence));
  events.sort((a, b) => a.second - b.second || num(a.sequence) - num(b.sequence));

  const latest = new Map();
  let baseAt = 0, lastBase = NaN;
  const out = [];
  const capital = num(replay.entry?.capital?.value, NaN);
  const firstBase = replay.rows.find((row) => Number.isFinite(row.baseClose))?.baseClose;

  for (let at = 0; at < events.length;) {
    const second = events[at].second;
    while (baseAt < baseEvents.length && baseEvents[baseAt].second <= second) {
      lastBase = baseEvents[baseAt].price;
      baseAt += 1;
    }
    while (at < events.length && events[at].second === second) {
      latest.set(events[at].legIndex, events[at]);
      at += 1;
    }
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
      };
    });
    const netPnl = perLeg.reduce((sum, leg) => sum + leg.netPnl, 0);
    out.push({
      second, time: events[at - 1].time, timeLabel: tradeTimeLabel(events[at - 1].time),
      netPnl, returnPct: capital > EPS ? (netPnl / capital) * 100 : NaN,
      basePrice: lastBase,
      basePct: lastBase > 0 && firstBase > 0 ? ((lastBase / firstBase) - 1) * 100 : NaN,
      perLeg,
    });
  }
  return out;
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
