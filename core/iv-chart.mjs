// دادهٔ نمودارهای تب «نوسان ضمنی» در رصد لحظه‌ای.
//
// سه نمودار، یک موتور:
//
//   ۱  نمودار مادر — نوسان ضمنی روزانهٔ یک نماد در طول زمان: شاخص پایه یا هر
//      قرارداد، کنار قیمت، حجم و موقعیت باز (مثل «نمودار تاریخی» یک قرارداد).
//   ۲  قراردادهای یک سررسید — نوسان ضمنی روزانهٔ چند قرارداد روی هم.
//   ۳  بازه و تایم‌فریم — نوسان ضمنی درون‌روزی در دانهٔ دلخواه (۵ تا ۶۰ دقیقه
//      یا روزانه) برای بازه‌ای که کاربر داده.
//
// نوسان ضمنی روزانهٔ هر قرارداد با `observationIv` حل می‌شود — همان تابعی که
// شاخص روزانهٔ «رتبه و صدک تلاطم» رویش ساخته شده؛ پس عدد یک قرارداد اینجا و
// سهمش در شاخص آنجا یکی است. درون‌روزی با `contractIvAt` و `quoteAt` — همان
// موتور شاخص لحظه. روزِ بی‌قیمت خالی می‌ماند و درون‌یابی نمی‌شود.

import { observationIv } from './vol-rank.mjs';
import { normalizeHistoryDate } from './history.mjs';
import { quoteAt } from './moment-quote.mjs';
import { contractIvAt } from './vol-intraday.mjs';
import { queueFromLimits, limitsAt } from './iv-record.mjs';

export const IV_CHART_VERSION = 1;
const isNum = (value) => Number.isFinite(value);
const finite = (value) => {
  const out = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(out) ? NaN : out;
};

export const IV_DAILY_WHY = {
  noPanel: 'پروندهٔ قیمت آن روز هنوز ساخته نشده',
  notTraded: 'آن روز معامله‌ای نداشت (قیمت تابلو مانده از قبل است)',
  noSpot: 'قیمت پایانی پایه آن روز نیست',
  input: 'سررسید گذشته یا ورودی نامعتبر',
  belowFloor: 'قیمت زیر ارزش ذاتی (نوسان حل نشد)',
  aboveBand: 'قیمت بالای سقف نظری (نوسان حل نشد)',
  unstable: 'حل‌کننده عدد نداد',
};

/**
 * سری روزانهٔ یک قرارداد: هر روز بازه یک ردیف.
 *
 * `contract`: `{ ins, kind, strike, expiry }`؛ `panels`: نقشهٔ روز → `{ ins: [close, last, vol, trades, value, low, high] }`؛
 * `baseRows`: سری روزانهٔ پایه؛ `oi`: نقشهٔ روز → `{ ins: موقعیت باز }`؛
 * `live`: `{ date, spot, price, volume, oi }` امروز (اختیاری).
 *
 * `from`/`to`: بازهٔ نمودار. پس از ترکیب همهٔ منبع‌ها (پرونده، روزها و امروز)
 * اعمال می‌شود، پس امروزِ بیرون از بازهٔ تاریخی وارد نمی‌شود (گزارش آزمون
 * ۴۰b2533، بند ۱: پایان بازه رعایت نمی‌شد و خلاصه «امروز» را آخرین می‌گفت).
 *
 * روزِ بی‌معامله (حجم و تعداد صفر) نوسان نمی‌سازد، حتی اگر قیمتی دارد: آن
 * قیمت از روزهای قبل مانده. همان قاعدهٔ شاخص (`panelObservations` و
 * `liveObservations` با `traded`) — بند ۴ همان گزارش.
 *
 * `strikeOf(contract, date)`: قیمت اعمالِ همان روز — پیش از تعدیل سود نقدی یا
 * افزایش سرمایه (`core/strike-adjust.mjs`)؛ بی آن، اعمالِ ذخیره‌شده. هر ردیف
 * `strike` همان روز را دارد.
 */
export function contractDailySeries({ contract, panels = {}, baseRows = [], oi = {}, priceBasis = 'close', settings = {}, days = [], live = null, from = 0, to = 0, strikeOf = null } = {}) {
  const ins = String(contract?.ins ?? '');
  const spotOf = new Map(baseRows.map((row) => [normalizeHistoryDate(row?.date), finite(row?.close)]));
  const dates = [...new Set([...days.map(normalizeHistoryDate), ...Object.keys(panels).map(normalizeHistoryDate)].filter(Boolean))].sort((a, b) => a - b);
  const expiry = normalizeHistoryDate(contract?.expiry);
  const rows = [];
  for (const date of dates) {
    if (expiry && date > expiry) continue;
    const panel = panels[date] || panels[String(date)];
    const values = panel?.[ins];
    const spot = spotOf.get(date);
    const strike = strikeOf ? finite(strikeOf(contract, date)) : finite(contract?.strike);
    const row = { date, strike, ivPct: NaN, price: NaN, close: NaN, last: NaN, volume: NaN, trades: NaN, value: NaN, oi: finite(oi?.[date]?.[ins] ?? oi?.[String(date)]?.[ins]), spot, why: '' };
    if (!panel) { rows.push({ ...row, why: 'noPanel' }); continue; }
    if (!Array.isArray(values)) { rows.push({ ...row, volume: 0, trades: 0, why: 'notTraded' }); continue; }
    const [close, last, vol, trades, value] = values.map(finite);
    row.close = close; row.last = last; row.volume = vol; row.trades = trades; row.value = value;
    if (!(vol > 0) && !(trades > 0)) { rows.push({ ...row, volume: isNum(vol) ? vol : 0, why: 'notTraded' }); continue; }
    row.price = priceBasis === 'last' ? last : close;
    if (!(spot > 0)) { rows.push({ ...row, why: 'noSpot' }); continue; }
    const iv = observationIv({ kind: contract.kind, strike, expiry, price: row.price }, spot, date, settings);
    row.ivPct = iv.ivPct;
    row.why = isNum(iv.ivPct) ? '' : iv.why;
    rows.push(row);
  }
  if (live && normalizeHistoryDate(live.date) && !(expiry && normalizeHistoryDate(live.date) > expiry)) {
    const date = normalizeHistoryDate(live.date);
    const volume = finite(live.volume);
    const traded = volume > 0;
    const price = traded ? finite(live.price) : NaN, spot = finite(live.spot);
    const iv = !traded ? { ivPct: NaN, why: 'notTraded' }
      : price > 0 && spot > 0 ? observationIv({ kind: contract.kind, strike: contract.strike, expiry, price }, spot, date, settings) : { ivPct: NaN, why: 'input' };
    const row = {
      date, live: true, strike: finite(contract?.strike), ivPct: iv.ivPct, price, close: NaN, last: NaN, volume: isNum(volume) ? volume : 0, trades: NaN, value: NaN,
      oi: finite(live.oi), spot, why: isNum(iv.ivPct) ? '' : iv.why,
    };
    const at = rows.findIndex((r) => r.date === date);
    if (at >= 0) rows[at] = row; else rows.push(row);
  }
  return inRange(rows, from, to);
}

/** فقط ردیف‌های `from <= date <= to` (کرانِ صفر یعنی بی‌کران). */
function inRange(rows, from, to) {
  const lo = normalizeHistoryDate(from) || 0, hi = normalizeHistoryDate(to) || 0;
  return lo || hi ? rows.filter((row) => (!lo || row.date >= lo) && (!hi || row.date <= hi)) : rows;
}

/**
 * سری روزانهٔ پایه از تاریخچهٔ `buildVolHistory`: شاخص نوسان ضمنی، HV
 * هم‌افق، رتبه و صدک، قیمت و حجم پایه، و جمع موقعیت باز قراردادهایش.
 *
 * `to`: پایان بازه. تاریخچهٔ پایه همهٔ عمقش را دارد (HV و رتبه به آن نیاز
 * دارند)؛ بی این کران، شاخص پس از پایان بازه ادامه می‌یافت و محور نمودار
 * سررسید را هم گشاد می‌کرد (گزارش آزمون ۴۰b2533، بند ۱).
 */
export function underlyingDailySeries(history, { baseRows = [], oi = {}, from = 0, to = 0 } = {}) {
  const volOf = new Map(baseRows.map((row) => [normalizeHistoryDate(row?.date), finite(row?.vol ?? row?.volume)]));
  return inRange(history?.rows || [], from, to).map((row) => {
    const day = oi?.[row.date] || oi?.[String(row.date)];
    const values = day ? Object.values(day).map(finite).filter(isNum) : [];
    return {
      date: row.date, live: Boolean(row.live), ivPct: row.ivPct, hvPct: row.hvMatch, ivr: row.ivr, ivp: row.ivp,
      price: row.spot, volume: volOf.get(row.date) ?? NaN, oi: values.length ? values.reduce((a, b) => a + b, 0) : NaN,
      why: isNum(row.ivPct) ? '' : row.why,
    };
  });
}

/**
 * چرا شاخص از روز X شروع می‌شود: اولین و آخرین روزِ دارای شاخص، و شمار علت‌های
 * روزهای خالیِ پیش از اولین روز، میان دو سر و پس از آخرین (پرسش صاحب پروژه
 * دربارهٔ فزر: «چرا فقط از ۳۱ خرداد رسم می‌کند؟»). `rows`: سری
 * `underlyingDailySeries`.
 */
export function indexGaps(rows = []) {
  const list = rows || [];
  const first = list.findIndex((row) => isNum(row.ivPct));
  let last = -1;
  for (let i = list.length - 1; i >= 0; i -= 1) { if (isNum(list[i].ivPct)) { last = i; break; } }
  const tally = (part) => {
    const out = {};
    for (const row of part) if (!isNum(row.ivPct)) out[row.why || 'unknown'] = (out[row.why || 'unknown'] || 0) + 1;
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  };
  return {
    days: list.length, ivDays: list.filter((row) => isNum(row.ivPct)).length,
    firstDate: first >= 0 ? list[first].date : 0, lastDate: last >= 0 ? list[last].date : 0,
    rangeFrom: list[0]?.date || 0,
    before: tally(first >= 0 ? list.slice(0, first) : list),
    between: first >= 0 ? tally(list.slice(first + 1, last)) : [],
    after: last >= 0 ? tally(list.slice(last + 1)) : [],
  };
}

/** میانگین متحرک ساده؛ پنجرهٔ ناقص یا دارای خالی، خالی. */
export function movingAverage(values = [], n = 5) {
  const k = Math.max(1, Math.trunc(n));
  return values.map((_, i) => {
    if (i + 1 < k) return NaN;
    const win = values.slice(i + 1 - k, i + 1).map(finite);
    return win.every(isNum) ? win.reduce((a, b) => a + b, 0) / k : NaN;
  });
}

/** سررسیدهای یک فهرست قرارداد، تازه‌ترین سررسیدِ باز اول. */
export function expiriesOf(contracts = [], today = 0) {
  const all = [...new Set(contracts.map((c) => normalizeHistoryDate(c.expiry)).filter(Boolean))].sort((a, b) => a - b);
  const open = all.filter((e) => !today || e >= today);
  return [...open, ...all.filter((e) => today && e < today).reverse()];
}

/** پیش‌فرض نمودار سررسید: نزدیک‌ترین اعمال‌ها به پایه، از هر نوع. */
export function defaultPicks(contracts = [], { expiry, spot, kind = 'both', perKind = 3 } = {}) {
  const S = finite(spot);
  const kinds = kind === 'both' ? ['call', 'put'] : [kind];
  const out = [];
  for (const k of kinds) {
    const list = contracts.filter((c) => normalizeHistoryDate(c.expiry) === normalizeHistoryDate(expiry) && c.kind === k);
    const ranked = S > 0 ? list.sort((a, b) => Math.abs(Math.log(a.strike / S)) - Math.abs(Math.log(b.strike / S))) : list.sort((a, b) => a.strike - b.strike);
    out.push(...ranked.slice(0, perKind).map((c) => String(c.ins)));
  }
  return out;
}

/** برچسب قرارداد: نماد اگر هست، وگرنه نوع و اعمال. */
export function contractLabel(c) {
  const sym = String(c?.symbol || '').trim();
  return sym || `${c?.kind === 'put' ? 'فروش' : 'خرید'} ${c?.strike}`;
}

/**
 * سری درون‌روزی یک قرارداد از روزهای فرم انتقال (`/api/vol/intraday?ins=`).
 *
 * هر لحظه: مظنهٔ همان لحظه (`quoteAt` — میانهٔ سالم، وگرنه آخرین معاملهٔ
 * تازه با برچسب جایگزین) و قیمت پایه تا همان لحظه؛ پایهٔ در صف یا
 * بی‌قیمت → خالی با علت. خروجی برای نمودار پیوسته: `{ date, second, value, bid, ask, price, spot, source, why }`.
 */
export function contractIntradaySeries(days = [], ins, ctx) {
  const p = ctx.params;
  const out = [];
  for (const day of [...days].sort((a, b) => a.date - b.date)) {
    const meta = day.contracts?.[ins];
    for (const [second, basePrice, , baseLastAt, quotes] of day.moments || []) {
      const point = { date: day.date, second, value: NaN, bid: NaN, ask: NaN, price: NaN, spot: finite(basePrice), source: day.source, why: '' };
      const q = quotes?.[ins];
      const lastAt = finite(baseLastAt);
      if (!meta) { out.push({ ...point, why: 'noContract' }); continue; }
      if (!(point.spot > 0)) { out.push({ ...point, why: 'noBase' }); continue; }
      if (isNum(lastAt) && second - lastAt > p.maxAgeSec) { out.push({ ...point, why: 'staleBase' }); continue; }
      const queue = queueFromLimits(point.spot, limitsAt(day.limits, second));
      if (queue.known && queue.key !== 'normal') { out.push({ ...point, why: 'queue' }); continue; }
      if (!q) { out.push({ ...point, why: 'noQuote' }); continue; }
      const quote = quoteAt({ record: { bid: q[0], ask: q[1], at: q[2], last: q[3], lastAt: q[4] }, second, maxAgeSec: p.maxAgeSec, basis: p.priceBasis });
      const c = contractIvAt({ ins, kind: meta[0], strike: meta[1], expiry: meta[2], quote }, { price: point.spot }, { date: day.date, second }, ctx);
      out.push({ ...point, value: c.ivPct, bid: c.ivBid, ask: c.ivAsk, price: quote.price, priceSource: quote.priceSource, why: isNum(c.ivPct) ? '' : (c.why || 'noQuote') });
    }
  }
  return out;
}
