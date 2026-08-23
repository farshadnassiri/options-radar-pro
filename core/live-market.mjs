// موتور خالص «رصد لحظه‌ای بازار».
//
// سرور فقط نوار معاملات را می‌گیرد و رابط فقط رسم می‌کند. این فایل میان
// آن دو، خلاصه روز و IV هر معامله اختیار را می‌سازد تا محاسبه در تب دیگری
// تکرار نشود و بی‌نیاز از DOM آزمون‌پذیر بماند.

import { impliedVol } from './bs.mjs';
import { tradeSecond } from './backtest.mjs';

const finite = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);

/** معامله معتبرِ امروز؛ ابطال و رکورد ناقص وارد گردش و نمودار نمی‌شود. */
export function activeLiveTrades(rows = []) {
  return rows
    .filter((row) => row && !row.canceled && finite(row.price) > 0 && finite(row.quantity) > 0 && finite(row.time) > 0)
    .map((row) => ({
      sequence: Math.trunc(finite(row.sequence)) || 0,
      time: Math.trunc(finite(row.time)),
      price: finite(row.price),
      quantity: finite(row.quantity),
      canceled: false,
      canceledKnown: row.canceledKnown !== false,
    }))
    .sort((a, b) => tradeSecond(a.time) - tradeSecond(b.time) || a.sequence - b.sequence);
}

/** خلاصه قابل حسابرسی نوار یک نماد، از شروع بازار تا آخرین معامله پاسخ. */
export function summarizeLiveTrades(rows = []) {
  const trades = activeLiveTrades(rows);
  if (!trades.length) return {
    count: 0, volume: 0, value: 0,
    firstPrice: NaN, lastPrice: NaN, low: NaN, high: NaN, vwap: NaN,
    firstTime: 0, lastTime: 0, changePct: NaN,
  };
  let volume = 0, value = 0, low = Infinity, high = -Infinity;
  for (const row of trades) {
    volume += row.quantity;
    value += row.quantity * row.price;
    low = Math.min(low, row.price);
    high = Math.max(high, row.price);
  }
  const first = trades[0], last = trades[trades.length - 1];
  return {
    count: trades.length, volume, value,
    firstPrice: first.price, lastPrice: last.price, low, high,
    vwap: volume > 0 ? value / volume : NaN,
    firstTime: first.time, lastTime: last.time,
    changePct: first.price > 0 ? ((last.price / first.price) - 1) * 100 : NaN,
  };
}

/**
 * معامله‌های اختیار را با آخرین معامله قبلی پایه هم‌زمان می‌کند.
 *
 * قیمت آینده پایه هرگز به گذشته حمل نمی‌شود: تا اولین معامله پایه، IV تهی
 * است. این مسیر «مشاهده بازار» است، نه قیمت قابل اجرا؛ قیمت اختیار، خودِ
 * آخرین معامله ثبت‌شده است و دفتر سفارش تاریخی از این API نمی‌آید.
 */
export function liveOptionTape({ trades = [], baseTrades = [], contract = {}, settings = {} } = {}) {
  const optionRows = activeLiveTrades(trades);
  const baseRows = activeLiveTrades(baseTrades);
  const days = finite(contract.days);
  const yearDays = finite(settings.dayCountYear);
  const T = days > 0 && yearDays > 0 ? days / yearDays : NaN;
  const strike = finite(contract.strike);
  const rFree = finite(settings.rFree);
  const divYield = finite(settings.divYield);
  const kind = contract.kind === 'put' ? 'put' : 'call';

  let baseAt = 0, basePrice = NaN, cumulativeVolume = 0, cumulativeValue = 0;
  const out = [];
  for (const row of optionRows) {
    const second = tradeSecond(row.time);
    // hEven فقط تا ثانیه دقت دارد؛ ترتیب دو معامله از دو نماد در یک ثانیه
    // معلوم نیست. پس همان‌ثانیه را «قبلی» فرض نمی‌کنیم و فقط زمان کوچک‌تر
    // را حمل می‌کنیم. خانه خالی بهتر از IV متکی به ترتیب ساختگی است.
    while (baseAt < baseRows.length && tradeSecond(baseRows[baseAt].time) < second) {
      basePrice = baseRows[baseAt].price;
      baseAt += 1;
    }
    cumulativeVolume += row.quantity;
    cumulativeValue += row.quantity * row.price;
    const iv = Number.isFinite(basePrice) && Number.isFinite(T) && strike > 0
      ? impliedVol(kind, row.price, basePrice, strike, T, rFree, divYield, {
        lo: finite(settings.ivLo), hi: finite(settings.ivHi),
      })
      : NaN;
    out.push({
      id: `${contract.ins || ''}:${row.sequence}`,
      ins: String(contract.ins || ''), name: String(contract.name || ''),
      kind, days, endDate: finite(contract.endDate), strike,
      sequence: row.sequence, time: row.time, second,
      price: row.price, quantity: row.quantity, value: row.quantity * row.price,
      cumulativeVolume, cumulativeValue,
      basePrice,
      iv: Number.isFinite(iv) ? iv : NaN,
      ivPct: Number.isFinite(iv) ? iv * 100 : NaN,
      canceledKnown: row.canceledKnown,
      referenceOnly: true,
    });
  }
  return out;
}

/** نقاط نمودار قیمت/حجم پایه هم‌قرارداد با خروجی اختیار. */
export function liveReferenceTape(rows = [], instrument = {}) {
  const trades = activeLiveTrades(rows);
  const first = trades[0]?.price;
  let cumulativeVolume = 0, cumulativeValue = 0;
  return trades.map((row) => {
    cumulativeVolume += row.quantity;
    cumulativeValue += row.quantity * row.price;
    return {
      id: `${instrument.ins || ''}:${row.sequence}`,
      ins: String(instrument.ins || ''), name: String(instrument.name || ''),
      kind: instrument.kind || 'underlying',
      sequence: row.sequence, time: row.time, second: tradeSecond(row.time),
      price: row.price, quantity: row.quantity, value: row.quantity * row.price,
      cumulativeVolume, cumulativeValue,
      changePct: first > 0 ? ((row.price / first) - 1) * 100 : NaN,
      referenceOnly: true,
    };
  });
}
