// روند سود و زیان یک موقعیت باز — روزانه، درون‌روزی، و همین لحظه.
//
// تب «موقعیت‌های من» تا امروز یک **عکس** بود: می‌گفت همین حالا چقدر در سود
// یا زیانی، ولی نمی‌گفت این عدد از کجا آمده. همان موقعیت می‌توانست دیروز
// دو برابر در سود باشد و کاربر هیچ‌وقت نفهمد. این ماژول همان یک عدد را به
// یک **روند** تبدیل می‌کند، از سه منبعِ واقعی:
//
//   روزانه      تاریخچهٔ پایانی هر پا (`/api/dailies`) — از روز ورود تا امروز
//   درون‌روزی    نوار معاملهٔ امروز هر پا (`/api/live-trades`) — لحظه‌به‌لحظه
//   جلسه        همان قیمت‌گیریِ هر پانزده ثانیهٔ خودِ تب، انباشته در حافظه
//
// ═══ قاعده‌ای که کلِ این فایل روی آن بنا شده ═══
//
// یک نقطهٔ روند، سود و زیانِ **کلِ** موقعیت است؛ پس تا وقتی حتی یک پا در آن
// لحظه قیمت ندارد، نقطه ساخته نمی‌شود. نه قیمت دیروز روی امروز می‌نشیند، نه
// پای بی‌معامله صفر می‌شود، نه میان دو نقطه خط کشیده می‌شود. لحظهٔ بی‌قیمت
// در `gaps` نام می‌گیرد — با نامِ همان پایی که نداشته — تا کاربر بداند
// نمودار چرا اینجا قطع است. عددِ ساختگی، بدترین شکلِ «پر بودن» است.
//
// ═══ و قرارداد پس از سررسید ═══
//
// بالادست گاهی آخرین قیمتِ قراردادِ منقضی را تکرار می‌کند. آن قیمت، قیمتِ
// معامله نیست؛ ردِ چیزی است که دیگر وجود ندارد. پس روند دقیقاً روی
// نزدیک‌ترین سررسیدِ پاها می‌ایستد و همان‌جا `stoppedAt` را اعلام می‌کند.

import { num } from './num.mjs';
import { grossCash, entryFees } from './payoff.mjs';
import { closeValuation } from './positions.mjs';
import { historyPrice, indexHistory, normalizeHistoryDate, daysBetween } from './history.mjs';
import { markAt, MARK_MOMENTS } from './intraday-mark.mjs';
import { momentLabel } from './intraday-grid.mjs';

export const POSITION_TRACK_VERSION = 1;

export const TRACK_REASONS = {
  noLegs: 'این موقعیت پایی ندارد',
  noIns: 'شناسهٔ قرارداد دست‌کم یک پا ثبت نشده، پس تاریخچه‌اش پیدا نمی‌شود',
  noPrice: 'در این لحظه همهٔ پاها قیمت ندارند',
  noPoint: 'هیچ لحظه‌ای با قیمتِ کاملِ همهٔ پاها پیدا نشد',
  expired: 'سررسید این موقعیت گذشته است',
  noTape: 'نوار معاملهٔ امروز برای این موقعیت گرفته نشده',
};

const FEE_ZERO = { buyStock: 0, sellStock: 0, option: 0, exercise: 0 };

/**
 * شناسهٔ ابزار هر پا.
 *
 * پای سهم شناسهٔ خودش را ندارد و شناسهٔ پایهٔ موقعیت را می‌گیرد — همان
 * قراردادی که `priceAll` در تب موقعیت‌ها از قبل داشت.
 */
export function trackLegIns(pos, leg) {
  const own = String(leg?.ins || '');
  if (own) return own;
  return leg?.kind === 'underlying' ? String(pos?.uaIns || '') : '';
}

/** سررسید یک پا به عدد فشردهٔ میلادی؛ صفر یعنی ثبت نشده. */
export function trackLegExpiry(leg) {
  if (!leg || leg.kind === 'underlying') return 0;
  return normalizeHistoryDate(leg.expiry);
}

/**
 * سررسید موقعیت = **نزدیک‌ترین** سررسیدِ پاها.
 *
 * چرا نزدیک‌ترین و نه دورترین: با رسیدن اولین سررسید، موقعیت دیگر همانی
 * نیست که ثبت شده — یک پایش تسویه شده و بقیه تنها مانده‌اند. ادامهٔ روند
 * بعد از آن، روندِ موقعیتِ دیگری است.
 *
 * صفر یعنی هیچ پایی سررسید ثبت‌شده ندارد (رکوردهای قدیمی)، نه «سررسید
 * ندارد».
 */
export function positionExpiry(pos) {
  const dates = (pos?.legs || []).map(trackLegExpiry).filter((d) => d > 0);
  return dates.length ? Math.min(...dates) : 0;
}

/**
 * موقعیت هنوز باز است یا سررسیدش گذشته.
 *
 * `today` عدد فشردهٔ میلادی است و از فراخوان می‌آید، نه از `Date.now()` —
 * ادعای «باز بودن» باید در هر ساعتی همان جواب را بدهد، و آزمونش باید
 * بتواند روز را تزریق کند.
 *
 * `known:false` یعنی سررسیدی ثبت نشده؛ آن‌وقت موقعیت «باز» فرض می‌شود چون
 * چیزی خلافش نمی‌دانیم — ولی این فرض صریح اعلام می‌شود تا رابط بتواند
 * بگوید نمی‌داند.
 */
export function positionOpenState(pos, today = 0) {
  const expiry = positionExpiry(pos);
  const at = normalizeHistoryDate(today);
  if (!expiry) return { open: true, expired: false, known: false, expiry: 0, daysToExpiry: NaN, reason: '' };
  if (!at) return { open: true, expired: false, known: true, expiry, daysToExpiry: NaN, reason: '' };
  const left = daysBetween(at, expiry);
  const expired = expiry < at;
  return {
    open: !expired, expired, known: true, expiry,
    daysToExpiry: Number.isFinite(left) ? left : NaN,
    reason: expired ? TRACK_REASONS.expired : '',
  };
}

/** جریان نقد ورود یک دست — همان تعریفی که `markToMarket` دارد. */
export function entryNetOf(legs = [], fees = FEE_ZERO) {
  return grossCash(legs) - entryFees(legs, fees);
}

/**
 * سود و زیان موقعیت با یک قیمت مرجع برای هر پا.
 *
 * `prices` هم‌طولِ `legs` است و هر عضوش قیمتِ **معامله‌شدهٔ** آن پا در آن
 * لحظه است — نه مظنه. پس مبنای بستن `LAST` است و ادعای آفست ندارد: این
 * تابع می‌گوید «ارزش موقعیت در آن لحظه چقدر بود»، نه «می‌شد بست».
 */
export function pnlFromPrices(pos, prices = [], { fees = FEE_ZERO } = {}) {
  const legs = Array.isArray(pos?.legs) ? pos.legs : [];
  if (!legs.length) return { available: false, reason: TRACK_REASONS.noLegs, missing: [] };
  const missing = [];
  legs.forEach((leg, i) => {
    if (!(num(prices[i]) > 0)) missing.push(trackLegIns(pos, leg) || `پای ${i + 1}`);
  });
  if (missing.length) return { available: false, reason: TRACK_REASONS.noPrice, missing };
  const quotes = prices.map((price) => ({ last: num(price), close: num(price) }));
  const close = closeValuation(legs, quotes, 'LAST', fees);
  const entryNet = entryNetOf(legs, fees);
  const pnl = entryNet + close.net;
  const qty = Math.max(1, num(pos?.qty, 1));
  return {
    available: true, reason: '', missing: [],
    entryNet, closeNet: close.net, pnl, pnlTotal: pnl * qty, qty,
  };
}

/** فهرست شناسهٔ همهٔ ابزارهای یک موقعیت، بی تکرار — برای گرفتن تاریخچه. */
export function trackInstruments(pos) {
  const out = [];
  for (const leg of pos?.legs || []) {
    const ins = trackLegIns(pos, leg);
    if (ins && !out.includes(ins)) out.push(ins);
  }
  const base = String(pos?.uaIns || '');
  if (base && !out.includes(base)) out.push(base);
  return out;
}

const seriesIndex = (seriesByIns, ins) => {
  const raw = seriesByIns?.[ins];
  if (raw instanceof Map) return raw;
  return indexHistory(Array.isArray(raw) ? raw : (raw?.rows || []));
};

/**
 * روند روزانهٔ سود و زیان، از روز ورود تا امروز (یا تا سررسید).
 *
 * `seriesByIns` همان چیزی است که `/api/dailies` می‌دهد: شناسه به ردیف‌های
 * روزانه. روزها از اجتماعِ روزهای همهٔ پاها ساخته می‌شوند — نه از تقویم —
 * چون تعطیلی بازار روزِ بی‌داده نیست، روزِ نبوده است.
 */
export function dailyPnlSeries(pos, seriesByIns = {}, {
  fees = FEE_ZERO, basis = 'CLOSE', from = 0, to = 0,
} = {}) {
  const legs = Array.isArray(pos?.legs) ? pos.legs : [];
  if (!legs.length) return emptySeries(TRACK_REASONS.noLegs);
  const insList = legs.map((leg) => trackLegIns(pos, leg));
  if (insList.some((ins) => !ins)) return emptySeries(TRACK_REASONS.noIns);

  const indexes = insList.map((ins) => seriesIndex(seriesByIns, ins));
  const start = normalizeHistoryDate(from);
  const expiry = positionExpiry(pos);
  const askedEnd = normalizeHistoryDate(to);
  // سررسید سقفِ سخت است: روزِ بعدش، روزِ این موقعیت نیست.
  const end = expiry > 0 ? Math.min(expiry, askedEnd || expiry) : askedEnd;

  const dates = new Set();
  for (const index of indexes) for (const date of index.keys()) dates.add(date);
  const days = [...dates].sort((a, b) => a - b)
    .filter((date) => (!start || date >= start) && (!end || date <= end));

  const baseIndex = pos?.uaIns ? seriesIndex(seriesByIns, String(pos.uaIns)) : null;
  const points = [];
  const gaps = [];
  for (const date of days) {
    const prices = indexes.map((index) => historyPrice(index.get(date), basis));
    const mark = pnlFromPrices(pos, prices, { fees });
    if (!mark.available) { gaps.push({ date, missing: mark.missing }); continue; }
    const spotRow = baseIndex?.get(date);
    points.push({
      date, pnl: mark.pnl, pnlTotal: mark.pnlTotal,
      spot: spotRow ? historyPrice(spotRow, basis) : NaN,
      prices,
    });
  }
  return {
    version: POSITION_TRACK_VERSION,
    basis, points, gaps,
    days: days.length,
    stoppedAt: expiry > 0 && (!askedEnd || askedEnd > expiry) ? expiry : 0,
    reason: points.length ? '' : TRACK_REASONS.noPoint,
  };
}

function emptySeries(reason) {
  return { version: POSITION_TRACK_VERSION, basis: '', points: [], gaps: [], days: 0, stoppedAt: 0, reason };
}

/**
 * روند درون‌روزیِ امروز، از نوار معاملهٔ هر پا.
 *
 * هر لحظه، آخرین معاملهٔ **پیش از** آن ثانیه را می‌گیرد (`markAt`) — همان
 * تعریفی که مسیر درون‌روزیِ آزمون همه استراتژی‌ها دارد، تا دو جای برنامه
 * یک «قیمتِ ساعت ده و نیم» نداشته باشند که با هم فرق کند.
 *
 * لحظه‌ای که هنوز همهٔ پاها در آن معامله نشده‌اند نقطه نمی‌شود. برای پایی
 * که تا آن ساعت اصلاً معامله نشده، این یعنی روندِ موقعیت از وسطِ روز شروع
 * می‌شود — و همان درست است.
 */
export function intradayPnlSeries(pos, tapeByIns = {}, {
  fees = FEE_ZERO, date = 0, moments = null,
} = {}) {
  const legs = Array.isArray(pos?.legs) ? pos.legs : [];
  if (!legs.length) return { ...emptySeries(TRACK_REASONS.noLegs), date: 0 };
  const insList = legs.map((leg) => trackLegIns(pos, leg));
  if (insList.some((ins) => !ins)) return { ...emptySeries(TRACK_REASONS.noIns), date: 0 };

  const tapes = insList.map((ins) => {
    const raw = tapeByIns?.[ins];
    return Array.isArray(raw) ? raw : (raw?.rows || []);
  });
  if (tapes.every((rows) => !rows.length)) {
    return { ...emptySeries(TRACK_REASONS.noTape), date: normalizeHistoryDate(date) };
  }

  const seconds = (Array.isArray(moments) && moments.length ? moments : MARK_MOMENTS.map(([second]) => second))
    .map((item) => (Array.isArray(item) ? num(item[0]) : num(item)))
    .filter((second) => second > 0)
    .sort((a, b) => a - b);

  const points = [];
  const gaps = [];
  for (const second of seconds) {
    const prices = tapes.map((rows) => num(markAt(rows, second)?.price, NaN));
    const mark = pnlFromPrices(pos, prices, { fees });
    if (!mark.available) { gaps.push({ second, label: momentLabel(second), missing: mark.missing }); continue; }
    points.push({ second, label: momentLabel(second), pnl: mark.pnl, pnlTotal: mark.pnlTotal, prices });
  }
  return {
    version: POSITION_TRACK_VERSION,
    basis: 'TAPE', points, gaps, days: 0, stoppedAt: 0,
    date: normalizeHistoryDate(date),
    reason: points.length ? '' : TRACK_REASONS.noPoint,
  };
}

/**
 * دنبالهٔ تیکِ همین جلسه — هر بار که تب قیمت می‌گیرد، یک نقطه.
 *
 * حافظه‌ای است و با رفرش صفحه از بین می‌رود؛ همین در رابط گفته می‌شود. سقف
 * دارد چون تبِ باز‌مانده تا شب، وگرنه هزاران نقطه جمع می‌کند و نمودار را
 * کند می‌کند. نقطهٔ تکراری (همان میلی‌ثانیه) دو بار نمی‌نشیند.
 */
export function appendSessionTick(list = [], tick = null, { cap = 720 } = {}) {
  const at = num(tick?.at);
  const value = num(tick?.pnlTotal, NaN);
  if (!(at > 0) || !Number.isFinite(value)) return Array.isArray(list) ? list : [];
  const out = Array.isArray(list) ? list.slice() : [];
  const last = out[out.length - 1];
  if (last && num(last.at) === at) return out;
  out.push({ at, pnlTotal: value, pnl: num(tick.pnl, NaN), spot: num(tick.spot, NaN) });
  return out.length > cap ? out.slice(out.length - cap) : out;
}

/**
 * آمارهٔ یک روند — همان چهار عددی که آدم از نمودار می‌پرسد.
 *
 * `drawdown` بیشترین افت از قلهٔ تا آن لحظه است، به ریال. درصدش عمداً
 * ساخته نمی‌شود: مخرجش سود و زیان است که می‌تواند صفر یا منفی باشد و
 * درصدش معنا ندارد.
 */
export function trackStats(points = [], key = 'pnlTotal') {
  const list = (Array.isArray(points) ? points : []).filter((p) => Number.isFinite(num(p?.[key], NaN)));
  if (!list.length) {
    return { count: 0, first: NaN, last: NaN, change: NaN, peak: NaN, trough: NaN, drawdown: NaN, peakAt: null, troughAt: null };
  }
  const value = (p) => num(p[key]);
  let peak = value(list[0]), peakAt = list[0];
  let trough = value(list[0]), troughAt = list[0];
  let runPeak = value(list[0]), drawdown = 0;
  for (const point of list) {
    const v = value(point);
    if (v > peak) { peak = v; peakAt = point; }
    if (v < trough) { trough = v; troughAt = point; }
    if (v > runPeak) runPeak = v;
    if (runPeak - v > drawdown) drawdown = runPeak - v;
  }
  const first = value(list[0]);
  const last = value(list[list.length - 1]);
  return { count: list.length, first, last, change: last - first, peak, trough, drawdown, peakAt, troughAt };
}

/**
 * تغییر نسبت به آخرین نقطهٔ **پیش از** یک روز — «سود و زیان امروز».
 *
 * `now` سود و زیانِ همین لحظه است و از ارزش‌گذاری زندهٔ تب می‌آید، نه از
 * سری. مبنای دیروز از سری روزانه برداشته می‌شود؛ اگر روزِ پیش از `date`
 * نقطه نداشته باشد، عدد ساخته نمی‌شود — نه اینکه صفر شود.
 */
export function changeSince(series, { now = NaN, date = 0 } = {}) {
  const at = normalizeHistoryDate(date);
  const points = series?.points || [];
  let base = null;
  for (const point of points) {
    if (at && point.date >= at) break;
    base = point;
  }
  const value = num(now, NaN);
  if (!base || !Number.isFinite(value)) {
    return { available: false, change: NaN, base: NaN, baseDate: 0, reason: 'مبنای روز پیش برای این موقعیت ثبت نشده' };
  }
  return { available: true, change: value - num(base.pnlTotal), base: num(base.pnlTotal), baseDate: base.date, reason: '' };
}
