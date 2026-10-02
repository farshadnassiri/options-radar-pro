// مظنهٔ یک ابزار در یک لحظه — ورودی تلاطم درون‌روزی.
//
// ═══ چرا آخرین معامله کافی نیست ═══
//
// قیمت قراردادِ در پول تقریباً با تلاطم متناسب است. اگر فاصلهٔ خرید و فروش
// ۵٪ باشد و تلاطم ۶۰٪، تلاطمِ ساخته از «آخرین معامله» حدود سه واحد بالا و
// پایین می‌پرد فقط به این خاطر که معاملهٔ آخر روی کدام سمت خورده. میانهٔ
// دفتر این پرش را ندارد.
//
// سه منبع، به همین ترتیب:
//   book    رویدادهای دفتر تاریخ‌دار (`core/book-history.mjs`)
//   record  عکسِ ضبط‌شده از دیده‌بان (بهترین خرید و فروش و آخرین معامله)
//   trade   ریزمعامله (`core/intraday-mark.mjs`)
//
// قاعده: میانه فقط وقتی که هر دو سمت هست، دفتر سالم و نامتقاطع است و سنش
// از سقف کمتر. وگرنه آخرین معاملهٔ پیش از همان لحظه با برچسب «جایگزین».
// وگرنه هیچ. رویدادِ بعد از لحظه وارد نمی‌شود — `bookAt` و `markAt` هر دو
// در ثانیهٔ لحظه می‌بُرند.

import { bookAt } from './book-history.mjs';
import { markAt } from './intraday-mark.mjs';

export const MOMENT_QUOTE_VERSION = 1;

export const QUOTE_HEALTH = {
  ok: 'دفتر دوطرفه و سالم',
  oneSided: 'فقط یک سمت دفتر',
  crossed: 'دفتر متقاطع',
  insane: 'سطوح دفتر نامرتب',
  stale: 'مظنه کهنه‌تر از سقف',
  empty: 'دفتری در آن لحظه نبود',
};

const n = (value) => {
  const out = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(out) ? NaN : out;
};

/**
 * مظنه در ثانیهٔ `second`.
 *
 * `book`: رویدادهای نرمال دفتر · `record`: `{ at, bid, ask, last, lastAt }`
 * از ضبط (`at` و `lastAt` ثانیه‌اند) · `trades`: ردیف‌های نوار.
 * `basis`: `'mid'` (پیش‌فرض) یا `'trade'` — اولی میانه و در نبودش جایگزین،
 * دومی فقط آخرین معامله.
 */
export function quoteAt({ book = null, record = null, trades = null, second, maxAgeSec = 900, basis = 'mid' } = {}) {
  const cut = n(second);
  const out = {
    second: cut, bid: NaN, ask: NaN, mid: NaN, last: NaN, bookAge: NaN, lastAge: NaN,
    source: '', health: 'empty', price: NaN, priceSource: '', why: '',
  };
  if (!Number.isFinite(cut)) return { ...out, why: 'noMoment' };

  // ── سمت دفتر ──
  let top = null;
  if (Array.isArray(book) && book.length) {
    const snap = bookAt(book, cut);
    if (snap) {
      const level = snap.book.find((row) => row.level === 1) || snap.book[0];
      top = { bid: n(level?.bid), ask: n(level?.ask), age: snap.ageSec, sane: snap.sane, crossed: snap.crossed, source: 'book' };
    }
  } else if (record && n(record.at) <= cut) {
    top = { bid: n(record.bid), ask: n(record.ask), age: cut - n(record.at), sane: true, source: 'record' };
    top.crossed = top.bid > 0 && top.ask > 0 && top.bid > top.ask;
  }
  if (top) {
    out.source = top.source;
    out.bid = top.bid > 0 ? top.bid : NaN;
    out.ask = top.ask > 0 ? top.ask : NaN;
    out.bookAge = top.age;
    const two = out.bid > 0 && out.ask > 0;
    out.health = top.crossed ? 'crossed' : !top.sane ? 'insane' : !two ? (out.bid > 0 || out.ask > 0 ? 'oneSided' : 'empty')
      : top.age > maxAgeSec ? 'stale' : 'ok';
    if (out.health === 'ok') out.mid = (out.bid + out.ask) / 2;
  }

  // ── آخرین معامله تا همان ثانیه ──
  let last = null;
  if (Array.isArray(trades) && trades.length) {
    const mark = markAt(trades, cut);
    if (mark) last = { price: mark.price, at: mark.second };
  } else if (record && n(record.last) > 0 && Number.isFinite(n(record.lastAt)) && n(record.lastAt) <= cut) {
    last = { price: n(record.last), at: n(record.lastAt) };
  }
  if (last) { out.last = last.price; out.lastAge = cut - last.at; }

  const freshTrade = out.last > 0 && out.lastAge <= maxAgeSec;
  if (basis !== 'trade' && Number.isFinite(out.mid)) { out.price = out.mid; out.priceSource = 'mid'; }
  else if (freshTrade) { out.price = out.last; out.priceSource = basis === 'trade' ? 'trade' : 'fallback'; }
  else out.why = out.last > 0 ? 'stale' : (out.health === 'empty' ? 'noQuote' : out.health);
  return out;
}

export const QUOTE_WHY = {
  noMoment: 'لحظه نامعتبر',
  stale: 'مظنه و آخرین معامله هر دو کهنه‌تر از سقف',
  noQuote: 'تا این لحظه نه دفتری بود نه معامله‌ای',
  oneSided: 'دفتر یک‌سمته و معاملهٔ تازه‌ای هم نبود',
  crossed: 'دفتر متقاطع و معاملهٔ تازه‌ای هم نبود',
  insane: 'دفتر نامرتب و معاملهٔ تازه‌ای هم نبود',
};
