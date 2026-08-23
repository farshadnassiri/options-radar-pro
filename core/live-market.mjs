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

/**
 * ابزارهای پایهٔ یکتای عکس دیده‌بان؛ ورودی همان ردیف خام TSETMC است.
 *
 * هر ردیف دیده‌بان یک جفت کال/پوت دارد و مشخصات پایه را تکرار می‌کند. این
 * تابع آن تکرار را حذف می‌کند و فقط میدان‌هایی را نگه می‌دارد که واقعاً از
 * تابلو آمده‌اند. نماد بدون حجم امروز بعداً «بی‌معامله» می‌ماند، نه خنثی.
 */
export function breadthInstruments(rows = []) {
  const byIns = new Map();
  for (const row of rows || []) {
    const ins = String(row?.uaInsCode ?? '');
    if (!/^\d+$/.test(ins) || byIns.has(ins)) continue;
    const rawName = String(row?.lval30_UA ?? '').trim();
    byIns.set(ins, {
      ins,
      name: rawName && rawName !== ins ? rawName : 'دارایی پایه بدون نام',
      last: finite(row?.pDrCotVal_UA),
      close: finite(row?.pClosing_UA),
      yday: finite(row?.priceYesterday_UA),
      volume: Math.max(0, finite(row?.qTotTran5J_UA) || 0),
      value: Math.max(0, finite(row?.qTotCap_UA) || 0),
      trades: Math.max(0, finite(row?.zTotTran_UA) || 0),
    });
  }
  return [...byIns.values()];
}

const breadthState = (price, yday, traded) => {
  if (!traded) return 'untraded';
  if (!(finite(price) > 0) || !(finite(yday) > 0)) return 'unknown';
  if (finite(price) > finite(yday)) return 'positive';
  if (finite(price) < finite(yday)) return 'negative';
  return 'flat';
};

/** عکس همین لحظهٔ وسعت بازار پایه؛ درصدها فقط میان نمادهای معامله‌شده‌اند. */
export function marketBreadthSnapshot(instruments = []) {
  const rows = (instruments || []).map((item) => {
    const price = finite(item.last) > 0 ? finite(item.last) : finite(item.close);
    const volume = Math.max(0, finite(item.uaVolume !== undefined ? item.uaVolume : item.volume) || 0);
    const trades = Math.max(0, finite(item.uaTrades !== undefined ? item.uaTrades : item.trades) || 0);
    const value = Math.max(0, finite(item.uaValue !== undefined ? item.uaValue : item.value) || 0);
    const state = breadthState(price, item.yday, volume > 0 || trades > 0);
    return {
      ...item, price, volume, value, trades, state,
      changePct: price > 0 && finite(item.yday) > 0 ? ((price / finite(item.yday)) - 1) * 100 : NaN,
    };
  });
  const count = (state) => rows.filter((row) => row.state === state).length;
  const positive = count('positive'), negative = count('negative'), flat = count('flat');
  const untraded = count('untraded'), unknown = count('unknown');
  const traded = positive + negative + flat;
  const pct = (value) => traded > 0 ? (value / traded) * 100 : NaN;
  const volumeOf = (state) => rows.filter((row) => row.state === state).reduce((sum, row) => sum + row.volume, 0);
  const valueOf = (state) => rows.filter((row) => row.state === state).reduce((sum, row) => sum + row.value, 0);
  return {
    total: rows.length, traded, positive, negative, flat, untraded, unknown,
    positivePct: pct(positive), negativePct: pct(negative), flatPct: pct(flat),
    breadth: positive - negative,
    positiveVolume: volumeOf('positive'), negativeVolume: volumeOf('negative'), flatVolume: volumeOf('flat'),
    positiveValue: valueOf('positive'), negativeValue: valueOf('negative'), flatValue: valueOf('flat'),
    rows,
    gainers: rows.filter((row) => row.state === 'positive').sort((a, b) => b.changePct - a.changePct),
    losers: rows.filter((row) => row.state === 'negative').sort((a, b) => a.changePct - b.changePct),
  };
}

/**
 * مسیر دقیقه‌ای وسعت بازار از اولین معاملات امروز.
 *
 * تا نخستین معاملهٔ هر نماد، وضعیت آن `untraded` است. معاملات داخل یک دقیقه
 * روی هم اعمال و فقط عکس انتهای همان دقیقه ثبت می‌شود؛ قیمت یا دقیقهٔ خالی
 * درون‌یابی نمی‌شود. حجم و ارزش هم فقط از خود معاملات معتبر جمع می‌شوند.
 */
export function marketBreadthTimeline(instruments = [], tradesByIns = {}, { bucketSeconds = 60 } = {}) {
  const source = new Map((instruments || []).map((item) => [String(item.ins), item]));
  const width = Math.max(60, Math.trunc(finite(bucketSeconds) || 60));
  const events = [];
  for (const [ins, item] of source) {
    for (const trade of activeLiveTrades(tradesByIns[ins] || [])) {
      const second = tradeSecond(trade.time);
      events.push({ ins, item, ...trade, second, bucket: Math.floor(second / width) * width });
    }
  }
  events.sort((a, b) => a.second - b.second || a.sequence - b.sequence || a.ins.localeCompare(b.ins));
  if (!events.length) return [];

  const latest = new Map();
  let cumulativeVolume = 0, cumulativeValue = 0, cumulativeTrades = 0;
  const out = [];
  for (let at = 0; at < events.length;) {
    const bucket = events[at].bucket;
    let lastTime = events[at].time;
    while (at < events.length && events[at].bucket === bucket) {
      const event = events[at];
      latest.set(event.ins, event.price);
      cumulativeVolume += event.quantity;
      cumulativeValue += event.quantity * event.price;
      cumulativeTrades += 1;
      lastTime = event.time;
      at += 1;
    }
    let positive = 0, negative = 0, flat = 0, unknown = 0;
    for (const [ins, price] of latest) {
      const state = breadthState(price, source.get(ins)?.yday, true);
      if (state === 'positive') positive += 1;
      else if (state === 'negative') negative += 1;
      else if (state === 'flat') flat += 1;
      else unknown += 1;
    }
    const traded = positive + negative + flat;
    out.push({
      second: bucket + width - 1, time: lastTime,
      total: source.size, traded, untraded: source.size - latest.size, unknown,
      positive, negative, flat, breadth: positive - negative,
      positivePct: traded > 0 ? (positive / traded) * 100 : NaN,
      negativePct: traded > 0 ? (negative / traded) * 100 : NaN,
      flatPct: traded > 0 ? (flat / traded) * 100 : NaN,
      cumulativeVolume, cumulativeValue, cumulativeTrades,
    });
  }
  return out;
}

/** IV آخرین قیمت مشاهده‌شده قرارداد در عکس زنجیره. */
export function liveQuoteIv(contract = {}, basePrice, settings = {}) {
  const price = finite(contract.last) > 0 ? finite(contract.last) : finite(contract.close);
  const days = finite(contract.days);
  const yearDays = finite(settings.dayCountYear);
  const T = days > 0 && yearDays > 0 ? days / yearDays : NaN;
  const strike = finite(contract.strike);
  if (!(price > 0) || !(finite(basePrice) > 0) || !(strike > 0) || !Number.isFinite(T)) return NaN;
  const iv = impliedVol(contract.kind === 'put' ? 'put' : 'call', price, finite(basePrice), strike, T,
    finite(settings.rFree), finite(settings.divYield), { lo: finite(settings.ivLo), hi: finite(settings.ivHi) });
  return Number.isFinite(iv) ? iv * 100 : NaN;
}
