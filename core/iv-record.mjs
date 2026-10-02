// ضبط تلاطم زنده — عکس‌های دیده‌بان، فشرده، برای «امروز از بازگشایی».
//
// ═══ چرا از دیده‌بان، نه درخواستِ تازه ═══
//
// سرور در جلسه هر چند ثانیه `GetInstrumentOptionMarketWatch` را می‌خواند:
// بهترین خرید و فروش، آخرین معامله و حجمِ **همهٔ** قراردادها، و آخرین قیمت
// پایه‌ها. ضبطِ همین عکس هیچ درخواستِ اضافه‌ای به بالادست نمی‌زند و سهمیه
// را نمی‌خورد — و برای همهٔ نمادها کار می‌کند، نه فهرستی دستی.
//
// ═══ شکل پرونده ═══
//
// `data/iv-live/<date>.jsonl`، هر خط یک «قاب»:
//
//   { t: ثانیه, k: 1|0, m: { ins: [ua, kind, strike, expiry] },
//     u: { ua: [last, close, vol] }, c: { ins: [bid, ask, last, vol, close] } }
//
// `k: 1` قابِ کامل است (هر سی دقیقه و نخستین قابِ پس از روشن‌شدن سرور)؛
// بقیه فقط آنچه از قاب قبل عوض شد. `m` شناسنامهٔ قراردادِ تازه‌دیده‌شده است.
// فقط قراردادهای درون باند (پیش‌فرض ۳۰٪ حول پایه) ضبط می‌شوند.
//
// ═══ زمان آخرین معامله ═══
//
// تابلو زمانِ آخرین معامله را نمی‌دهد. وقتی حجمِ تجمعی بالا رفت، معامله‌ای
// بین دو قاب رخ داده — زمانش «همین قاب» گرفته می‌شود (کران بالا، حداکثر یک
// گام دیرتر). پیش از نخستین افزایشِ دیده‌شده، زمان آخرین معامله **نامعلوم**
// است و آن قیمت جایگزینِ میانه نمی‌شود.

export const IV_RECORD_VERSION = 1;
export const IV_RECORD_KEYFRAME_SEC = 1800;

const n = (value) => {
  const out = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(out) ? 0 : out;
};
const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

/** ردیف دیده‌بان → دو قرارداد و یک پایه. */
function rowParts(row) {
  const ua = String(row?.uaInsCode ?? '').trim();
  const strike = n(row?.strikePrice);
  const expiry = n(row?.expiryGregorian) || n(row?.endDate);
  const out = { ua, base: [n(row?.pDrCotVal_UA), n(row?.pClosing_UA), n(row?.qTotTran5J_UA)], contracts: [] };
  for (const [sfx, kind] of [['C', 0], ['P', 1]]) {
    const ins = String(row?.[`insCode_${sfx}`] ?? '').trim();
    if (!ins) continue;
    out.contracts.push({
      ins, meta: [ua, kind, strike, expiry],
      quote: [n(row[`pMeDem_${sfx}`]), n(row[`pMeOf_${sfx}`]), n(row[`pDrCotVal_${sfx}`]), n(row[`qTotTran5J_${sfx}`]), n(row[`pClosing_${sfx}`])],
    });
  }
  return out;
}

/**
 * یک قاب از عکس دیده‌بان.
 *
 * `prev` حالتِ قاب قبل است (`null` یعنی قابِ کامل). خروجی `{ frame, state }`؛
 * `frame` همان خطی است که نوشته می‌شود و `state` ورودیِ قاب بعد.
 */
export function recordFrame(rows = [], { second, prev = null, bandPct = 30 } = {}) {
  const keyframe = !prev || (second - prev.keyAt >= IV_RECORD_KEYFRAME_SEC);
  const state = {
    keyAt: keyframe ? second : prev.keyAt,
    bases: new Map(keyframe ? [] : prev.bases),
    quotes: new Map(keyframe ? [] : prev.quotes),
    meta: new Set(prev ? prev.meta : []),
  };
  const frame = { t: second, k: keyframe ? 1 : 0 };
  const m = {}, u = {}, c = {};
  for (const row of rows || []) {
    const part = rowParts(row);
    if (!part.ua || !(part.base[0] > 0 || part.base[1] > 0)) continue;
    const spot = part.base[0] > 0 ? part.base[0] : part.base[1];
    if (keyframe || !same(state.bases.get(part.ua), part.base)) {
      u[part.ua] = part.base;
      state.bases.set(part.ua, part.base);
    }
    for (const contract of part.contracts) {
      if (!(contract.meta[2] > 0) || Math.abs(contract.meta[2] / spot - 1) * 100 > bandPct) continue;
      if (!state.meta.has(contract.ins) || keyframe) {
        m[contract.ins] = contract.meta;
        state.meta.add(contract.ins);
      }
      if (keyframe || !same(state.quotes.get(contract.ins), contract.quote)) {
        c[contract.ins] = contract.quote;
        state.quotes.set(contract.ins, contract.quote);
      }
    }
  }
  if (Object.keys(m).length) frame.m = m;
  if (Object.keys(u).length) frame.u = u;
  if (Object.keys(c).length) frame.c = c;
  return { frame, state };
}

/** خطوط پرونده → قاب‌ها؛ خطِ خراب کنار می‌رود و شمرده می‌شود. */
export function parseRecord(text = '') {
  const frames = [];
  let broken = 0;
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    try {
      const frame = JSON.parse(line);
      if (Number.isFinite(frame?.t)) frames.push(frame); else broken += 1;
    } catch { broken += 1; }
  }
  frames.sort((a, b) => a.t - b.t);
  return { frames, broken };
}

/**
 * حالتِ یک پایه و قراردادهایش در لحظه‌های خواسته‌شده.
 *
 * برای هر لحظه: پایه `{ last, lastAt, at }` و هر قرارداد
 * `{ bid, ask, at, last, lastAt }` — همان شکلی که `quoteAt` به‌عنوان
 * `record` می‌خواهد. `at` زمانِ آخرین قابی است که این مقدار را تأیید کرد
 * (قاب‌های بی‌تغییر هم تأیید می‌کنند). قابِ بعد از لحظه وارد نمی‌شود.
 */
export function recordMoments(frames = [], ua, seconds = []) {
  const key = String(ua);
  const meta = new Map();
  const quotes = new Map();
  let base = null;
  const cuts = [...seconds].sort((a, b) => a - b);
  const out = [];
  let at = 0, lastFrame = NaN;
  const prevVol = new Map(), lastAt = new Map();
  let baseVol = NaN, baseLastAt = NaN;
  for (const cut of cuts) {
    while (at < frames.length && frames[at].t <= cut) {
      const frame = frames[at];
      if (frame.k) { quotes.clear(); }
      for (const [ins, row] of Object.entries(frame.m || {})) if (String(row[0]) === key) meta.set(ins, row);
      const b = frame.u?.[key];
      if (b) {
        if (Number.isFinite(baseVol) && b[2] > baseVol) baseLastAt = frame.t;
        else if (!Number.isFinite(baseVol) && b[2] === 0) baseLastAt = NaN;
        baseVol = b[2];
        base = b;
      }
      for (const [ins, q] of Object.entries(frame.c || {})) {
        if (!meta.has(ins)) continue;
        const was = prevVol.get(ins);
        if (Number.isFinite(was) && q[3] > was) lastAt.set(ins, frame.t);
        prevVol.set(ins, q[3]);
        quotes.set(ins, q);
      }
      lastFrame = frame.t;
      at += 1;
    }
    if (!Number.isFinite(lastFrame)) { out.push({ second: cut, base: null, contracts: [] }); continue; }
    out.push({
      second: cut, frameAt: lastFrame,
      base: base ? { last: base[0], close: base[1], vol: base[2], at: lastFrame, lastAt: baseLastAt } : null,
      contracts: [...quotes.entries()].map(([ins, q]) => {
        const row = meta.get(ins);
        return {
          ins, kind: row[1] === 1 ? 'put' : 'call', strike: row[2], expiry: row[3],
          record: { at: lastFrame, bid: q[0], ask: q[1], last: q[2], lastAt: lastAt.has(ins) ? lastAt.get(ins) : NaN },
        };
      }),
    });
  }
  return out;
}

// ═══════════════════ فرم انتقال: ضبط و بازسازی، یک شکل ═══════════════════
//
// هر روز برای رابط یک شکل دارد، از هر منبعی آمده باشد:
//
//   { date, source, provisional, limits: [low, high] | null,
//     contracts: { ins: [kind, strike, expiry] },
//     moments: [[second, basePrice, baseAt, baseLastAt, { ins: [bid, ask, at, last, lastAt] }]] }
//
// `null` یعنی نامعلوم (NaN در JSON). قیمت پایه آخرین معاملهٔ **امروز** است:
// پایه‌ای که امروز هنوز معامله نشده (حجم صفر) قیمت ندارد — عددِ تابلو در
// آن حالت پایانیِ دیروز است و تلاطمِ امروز را رویش نمی‌سازیم.

const nul = (value) => (Number.isFinite(value) && value !== 0 ? value : null);
const nulT = (value) => (Number.isFinite(value) ? value : null);

/** خروجی `recordMoments` → فرم انتقال. */
export function compactRecordMoments(moments = []) {
  const contracts = {};
  const rows = moments.map((m) => {
    const c = {};
    for (const row of m.contracts || []) {
      contracts[row.ins] = [row.kind, row.strike, row.expiry];
      c[row.ins] = [nul(row.record.bid), nul(row.record.ask), nulT(row.record.at), nul(row.record.last), nulT(row.record.lastAt)];
    }
    const traded = m.base && m.base.vol > 0;
    return [m.second, traded ? nul(m.base.last) : null, nulT(m.base?.at), traded ? nulT(m.base.lastAt) : null, c];
  });
  return { contracts, moments: rows };
}

/**
 * بازسازی روزِ بسته‌شده از ریزمعامله (و دفتر، اگر بود).
 *
 * `baseTape`/`tapes` ردیف‌های نرمال نوار (`{ time, price, quantity, canceled }`)،
 * `books` رویدادهای نرمال دفتر. برای هر لحظه: آخرین معاملهٔ پایه تا همان
 * ثانیه، و برای هر قرارداد بالای دفتر و آخرین معامله تا همان ثانیه. هیچ
 * رویدادِ بعد از لحظه وارد نمی‌شود.
 */
export function rebuildMoments({ seconds = [], baseTape = [], tapes = {}, books = {}, meta = {}, markAt, bookAt } = {}) {
  const contracts = {};
  for (const [ins, row] of Object.entries(meta)) contracts[ins] = row;
  const moments = seconds.map((second) => {
    const b = markAt(baseTape, second);
    const c = {};
    for (const ins of Object.keys(meta)) {
      const mark = tapes[ins] ? markAt(tapes[ins], second) : null;
      const snap = books[ins] ? bookAt(books[ins], second) : null;
      const top = snap ? (snap.book.find((row) => row.level === 1) || snap.book[0]) : null;
      if (!mark && !top) continue;
      c[ins] = [nul(top?.bid), nul(top?.ask), top ? snap.at : null, nul(mark?.price), mark ? mark.second : null];
    }
    return [second, nul(b?.price), b ? b.second : null, b ? b.second : null, c];
  });
  return { contracts, moments };
}

/**
 * صفِ پایه از دامنهٔ مجاز: درون دامنه = نه صف (صف فقط روی حد شکل می‌گیرد)؛
 * روی حد = مظنون به صف؛ دامنهٔ نامعلوم = «نامعلوم»، نه «عادی».
 */
export function queueFromLimits(price, limits) {
  const p = Number(price);
  const [low, high] = Array.isArray(limits) ? limits.map(Number) : [NaN, NaN];
  if (!(low > 0) || !(high > 0)) return { key: 'unknown', known: false };
  if (!(p > 0)) return { key: 'unknown', known: false };
  if (p >= high - 1e-9) return { key: 'buyQueue', known: true, why: 'قیمت پایه روی سقف دامنه' };
  if (p <= low + 1e-9) return { key: 'sellQueue', known: true, why: 'قیمت پایه روی کف دامنه' };
  return { key: 'normal', known: true };
}

/**
 * دامنهٔ مجاز روز از پاسخ `GetStaticThreshold` → `[[ثانیه, کف, سقف]]`
 * به ترتیب زمان. ردیف بی‌کف یا بی‌سقف کنار می‌رود.
 */
export function limitsFrom(rows = []) {
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const low = n(row?.psGelStaMin), high = n(row?.psGelStaMax);
    if (!(low > 0) || !(high > 0)) continue;
    const raw = String(Math.max(0, Math.trunc(n(row?.hEven)))).padStart(6, '0').slice(-6);
    out.push([Number(raw.slice(0, 2)) * 3600 + Number(raw.slice(2, 4)) * 60 + Number(raw.slice(4, 6)), low, high]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** دامنهٔ معتبر در یک ثانیه: آخرین اعلامِ تا همان لحظه؛ اعلامِ بعدتر وارد نمی‌شود. */
export function limitsAt(limits, second) {
  if (!Array.isArray(limits) || !limits.length) return null;
  let pick = null;
  for (const row of limits) if (row[0] <= second) pick = row;
  return pick ? [pick[1], pick[2]] : null;
}

/** فقط لحظه‌های یک دانه از یک روزِ فرم انتقال (دانهٔ درشت = نمونه، نه میانگین). */
export function pickMoments(day, seconds) {
  const want = new Set(seconds);
  return { ...day, moments: (day.moments || []).filter((row) => want.has(row[0])) };
}
