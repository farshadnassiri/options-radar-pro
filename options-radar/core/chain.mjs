// ساخت زنجیره اختیار از عکس لحظه‌ای دیده‌بان.
//
// دیده‌بان با یک درخواست کل بازار را می‌دهد و هر رکوردش یک کال و یک پوت با
// قیمت اعمال و سررسید مشترک است. کل غربال مرحله یک روی همین می‌نشیند و
// هیچ درخواست اضافه‌ای نمی‌خورد.
//
//   پایه → سررسید → قیمت اعمال → { کال , پوت }
//
// مظنه‌ای که اینجا ساخته می‌شود فقط سطح اول دارد. عمق پنج سطحی و کمترین و
// بیشترین قیمت روز، مرحله دو است و فقط برای کاندیداهای برتر گرفته می‌شود.

import { num } from './num.mjs';

const n = (x) => num(x, 0);

// سنتینل «عمق نامعلوم». متناهی است چون num هر مقدار نامتناهی را صفر می‌کند،
// و به‌اندازه‌ای بزرگ که هیچ‌وقت قید مقیدکننده نشود.
export const UNKNOWN_DEPTH = 1e12;

/** مظنه یک سمت قرارداد، از رکورد دیده‌بان. */
function sideQuote(r, sfx) {
  const bid = n(r[`pMeDem_${sfx}`]);
  const ask = n(r[`pMeOf_${sfx}`]);
  const last = n(r[`pDrCotVal_${sfx}`]);
  const close = n(r[`pClosing_${sfx}`]) || last || bid;
  return {
    ins: String(r[`insCode_${sfx}`] ?? ''),
    name: String(r[`lVal18AFC_${sfx}`] ?? ''),
    kind: sfx === 'C' ? 'call' : 'put',
    bid, bidQty: n(r[`qTitMeDem_${sfx}`]),
    ask, askQty: n(r[`qTitMeOf_${sfx}`]),
    last, close,
    low: 0, high: 0,               // مرحله دو پر می‌کند
    oi: n(r[`oP_${sfx}`]), oiYday: n(r[`yesterdayOP_${sfx}`]),
    vol: n(r[`qTotTran5J_${sfx}`]), trades: n(r[`zTotTran_${sfx}`]),
    value: n(r[`qTotCap_${sfx}`]),
    book: null, state: 'A', staleSec: 0,
    depth: false,                  // آیا عمق کامل گرفته شده
  };
}

/**
 * زنجیره کامل. کلید هر پایه، کد نماد پایه است تا با تغییر نام نماد نشکند.
 */
export function buildChain(rows) {
  const byUa = new Map();

  for (const r of rows || []) {
    const uaIns = String(r.uaInsCode ?? '');
    if (!uaIns) continue;
    const strike = n(r.strikePrice);
    const days = Math.round(n(r.remainedDay));
    if (!(strike > 0)) continue;

    let ua = byUa.get(uaIns);
    if (!ua) {
      ua = {
        ins: uaIns,
        name: String(r.lval30_UA ?? ''),
        last: n(r.pDrCotVal_UA), close: n(r.pClosing_UA), yday: n(r.priceYesterday_UA),
        low: 0, high: 0, book: null, state: 'A', staleSec: 0, depth: false,
        expiries: new Map(),
        contracts: 0,
      };
      byUa.set(uaIns, ua);
    }
    ua.last = ua.last || n(r.pDrCotVal_UA);
    ua.close = ua.close || n(r.pClosing_UA);

    let ex = ua.expiries.get(days);
    if (!ex) {
      ex = { days, endDate: n(r.endDate), strikes: new Map() };
      ua.expiries.set(days, ex);
    }

    ex.strikes.set(strike, {
      strike,
      size: n(r.contractSize) || 1000,
      call: sideQuote(r, 'C'),
      put: sideQuote(r, 'P'),
    });
    ua.contracts += 2;
  }

  // مرتب‌سازی: سررسید صعودی، قیمت اعمال صعودی
  for (const ua of byUa.values()) {
    ua.expiryList = [...ua.expiries.values()].sort((a, b) => a.days - b.days);
    for (const ex of ua.expiryList) {
      ex.strikeList = [...ex.strikes.values()].sort((a, b) => a.strike - b.strike);
    }
  }
  return byUa;
}

/** فهرست نماد پایه برای منوی انتخابی — انتخابی، نه تایپی. */
export function underlyingList(chain) {
  return [...chain.values()]
    .map((u) => ({
      ins: u.ins, name: u.name, last: u.last || u.close,
      contracts: u.contracts,
      expiries: u.expiryList.length,
      volume: u.expiryList.reduce((a, ex) => a
        + ex.strikeList.reduce((b, s) => b + s.call.vol + s.put.vol, 0), 0),
      oi: u.expiryList.reduce((a, ex) => a
        + ex.strikeList.reduce((b, s) => b + s.call.oi + s.put.oi, 0), 0),
      quoted: u.expiryList.reduce((a, ex) => a
        + ex.strikeList.reduce((b, s) => b + (s.call.bid > 0 ? 1 : 0) + (s.put.bid > 0 ? 1 : 0), 0), 0),
    }))
    .sort((a, b) => b.volume - a.volume || b.contracts - a.contracts);
}

/** مظنه پایه، به شکل همان قرارداد مظنه اختیار، تا موتور یک مسیر داشته باشد. */
export function underlyingQuote(ua) {
  const p = ua.last || ua.close;
  // دیده‌بان اختیار، دفتر سفارش نماد پایه را نمی‌دهد. پس در مرحله یک، عمق
  // پایه «نامعلوم» است نه «صفر». اگر صفر بگیریم هر ترکیب دارای سهم می‌افتد.
  // مرحله دو دفتر واقعی را می‌نشاند و همین ردیف‌ها دوباره حساب می‌شوند.
  const unknown = !ua.book?.length;
  return {
    ins: ua.ins, name: ua.name, kind: 'underlying',
    bid: ua.book?.length ? ua.book[0].bid : p,
    bidQty: ua.book?.length ? ua.book[0].bidQty : UNKNOWN_DEPTH,
    ask: ua.book?.length ? ua.book[0].ask : p,
    askQty: ua.book?.length ? ua.book[0].askQty : UNKNOWN_DEPTH,
    assumedDepth: unknown,
    last: ua.last, close: ua.close, low: ua.low, high: ua.high,
    book: ua.book, state: ua.state, staleSec: ua.staleSec, depth: !!ua.depth,
    oi: 0, vol: 0,
  };
}

/** آمار کل بازار اختیار، برای نوار شاخص تب دیده‌بان. */
export function chainStats(chain) {
  let contracts = 0, quoted = 0, vol = 0, oi = 0, value = 0, expiries = new Set();
  for (const ua of chain.values()) {
    for (const ex of ua.expiryList) {
      expiries.add(ex.days);
      for (const s of ex.strikeList) {
        for (const q of [s.call, s.put]) {
          contracts += 1;
          if (q.bid > 0 || q.ask > 0) quoted += 1;
          vol += q.vol; oi += q.oi; value += q.value;
        }
      }
    }
  }
  return { underlyings: chain.size, contracts, quoted, vol, oi, value, expiries: expiries.size };
}
