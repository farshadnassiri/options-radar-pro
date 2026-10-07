// ————————————————————————————————————————————————————————————————
// کندل امروز قراردادها — نمودار مادر: همهٔ کندل‌ها روی یک محور، قابل مقایسه
//
// ═══ خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۵) ═══
//
// «کندل قیمت امروز قراردادها را به یک تب جداگانه منتقل کن… یک نمودار مرجع
// و مادر باشد که همه کندل‌های یک سررسید را از نظر توزیع و پراکندگی نشان
// دهد… محور عمودی تغییرات قیمت، یا نوسان ضمنی، یا شاخص‌های دیگر… چون
// قیمت‌ها یکسان نیستند نمودار طوری باشد که مقایسه حفظ شود.» محور: لگاریتمی.
// برای نوسان ضمنی: «برای هر ۴ قیمت کندل ۴ نقطه پیدا کن و تلاطم را بر اساس
// آن به صورت کندلی بکش.»
//
// ═══ تلاطمِ هر نقطهٔ کندل: قیمت پایهٔ هم‌جهت ═══
//
// IV هر قیمت یک قیمت پایه می‌خواهد. زمانِ کمینه و بیشینهٔ قرارداد معلوم
// نیست، پس قیمت پایهٔ «همان لحظه» را نداریم. جفت کردن همه با قیمت پایهٔ
// **فعلی** عدد می‌سازد: کمینهٔ صبحِ یک کال که پایه هم پایین بود، با پایهٔ
// ظهر تلاطمی ساختگی و پایین می‌دهد. قاعدهٔ اینجا جفتِ هم‌جهت است — کال با
// پایه هم‌جهت حرکت می‌کند و پوت خلاف آن:
//
//   کال    کمینه ↔ کمینهٔ پایه   بیشینه ↔ بیشینهٔ پایه
//   پوت    کمینه ↔ بیشینهٔ پایه  بیشینه ↔ کمینهٔ پایه
//   هر دو  اولین ↔ اولین پایه    آخرین ↔ آخرین پایه     پایانی ↔ پایانی پایه
//
// «آخرین» با همان قیمت پایه‌ای جفت می‌شود که ستون تلاطم زنجیره (`spot`)،
// پس تلاطمِ نقطهٔ آخرین همان عدد زنجیره است (آزمون ۳۲۸ هر دو را کنار هم
// می‌گذارد). قیمت پایهٔ نیامده با چیز دیگری پر نمی‌شود؛ آن نقطه خالی
// می‌ماند و علتش گفته می‌شود.
//
// خالص است: نه DOM، نه شبکه.
// ————————————————————————————————————————————————————————————————

import { liveIvAt } from './live-market.mjs';
import { mergeRangeInfo } from './range-info.mjs';
import { pctVsYesterday } from './price-change.mjs';
import { contractAnalytics } from './decision-dashboard.mjs';

const num = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));
const pos = (v) => { const x = num(v); return Number.isFinite(x) && x > 0 ? x : NaN; };
const fin = (v) => Number.isFinite(num(v));

/** پنج قیمت کندل، به ترتیب نمایش. */
export const CANDLE_POINTS = Object.freeze(['low', 'first', 'last', 'close', 'high']);
export const POINT_LABEL = Object.freeze({ low: 'کمینه', first: 'اولین', last: 'آخرین', close: 'پایانی', high: 'بیشینه' });

/** قیمت پایهٔ جفتِ هر نقطه — جدول بالا. */
export function pairedUnderlying(kind, ua = {}) {
  const low = pos(ua.low), high = pos(ua.high);
  return {
    first: pos(ua.first), last: pos(ua.last), close: pos(ua.close),
    low: kind === 'put' ? high : low,
    high: kind === 'put' ? low : high,
  };
}

/**
 * بازهٔ روز نماد پایه از ردیف عکس و پاسخ اطلاعات — همان قاعدهٔ ادغام قرارداد.
 * `last` قیمت پایه‌ای است که زنجیره با آن تلاطم می‌سازد (`spot` قرارداد).
 */
export function underlyingDay(ua = {}, info = null, spot = NaN) {
  const merged = mergeRangeInfo({ tradeLast: ua.tradeLast, close: ua.close, yday: ua.yday, trades: ua.uaTrades }, info);
  return {
    ins: String(ua.ins || ''), name: ua.name || '',
    first: merged.first, low: merged.low, high: merged.high,
    last: pos(spot) || pos(ua.last), close: pos(ua.close), yday: pos(ua.yday),
    tradeLast: pos(ua.tradeLast),
    changePct: pctVsYesterday(pos(spot) || pos(ua.last), ua.yday),
    rangeSource: merged.rangeSource,
  };
}

/**
 * یک رکورد کامل برای هر قرارداد: پنج قیمت، قیمت پایهٔ جفت هر نقطه، و همهٔ
 * شاخص‌های محور عمودی. `info` پاسخ `/api/infos` همان قرارداد است و `uaDay`
 * خروجی `underlyingDay`. شاخص‌ها از همان مسیرهای زنجیره ساخته می‌شوند.
 */
export function candleRecord(row = {}, { info = null, uaDay = null, settings = {}, params = {} } = {}) {
  const merged = mergeRangeInfo(row, info);
  const kind = row.kind === 'put' ? 'put' : 'call';
  const prices = Object.fromEntries(CANDLE_POINTS.map((key) => [key, pos(merged[key])]));
  const yday = pos(row.yday);
  const valid = Number(row.trades) > 0 && CANDLE_POINTS.every((key) => prices[key] > 0);
  const ua = pairedUnderlying(kind, uaDay || {});
  // «آخرین» دقیقاً همان قیمت پایهٔ ستون تلاطم زنجیره است.
  ua.last = pos(row.spot);
  const strike = num(row.strike);
  const iv = {}, ivWhy = {}, change = {}, premium = {}, timeValue = {};
  for (const key of CANDLE_POINTS) {
    const price = prices[key], spot = ua[key];
    change[key] = pctVsYesterday(price, yday);
    premium[key] = price > 0 && spot > 0 ? (price / spot) * 100 : NaN;
    const intrinsic = spot > 0 && strike > 0 ? Math.max(0, kind === 'call' ? spot - strike : strike - spot) : NaN;
    timeValue[key] = price > 0 && spot > 0 && Number.isFinite(intrinsic) ? ((price - intrinsic) / spot) * 100 : NaN;
    const solved = spot > 0 ? liveIvAt({ kind, strike, days: row.days }, spot, settings, price) : { ivPct: NaN, why: 'noSpot' };
    iv[key] = solved.ivPct; ivWhy[key] = solved.why;
  }
  const analytics = contractAnalytics({ ...row, kind }, params);
  const dayRangePct = prices.high > 0 && prices.low > 0 && yday > 0 ? ((prices.high - prices.low) / yday) * 100 : NaN;
  return {
    ins: String(row.ins || ''), name: row.name || '', kind,
    uaIns: String(row.uaIns || ''), uaName: row.uaName || '',
    endDate: String(row.endDate || ''), days: num(row.days), strike, size: num(row.size),
    spot: pos(row.spot), moneynessPct: num(row.moneynessPct),
    ...prices, yday, valid, rangeSource: merged.rangeSource, rangeLag: merged.rangeLag,
    ua, uaRangeSource: uaDay?.rangeSource || 'none', uaChangePct: num(uaDay?.changePct),
    points: { change, iv, premium, timeValue }, ivWhy,
    volume: num(row.volume), value: num(row.value), trades: num(row.trades), oi: num(row.oi), oiChange: num(row.oiChange),
    oiChangePct: num(row.oiChangePct), bid: num(row.bid), ask: num(row.ask), mid: num(row.mid), spreadPct: num(row.spreadPct),
    ivPct: num(row.ivPct), ivMidPct: num(row.ivMidPct), ivBidPct: num(row.ivBidPct), ivAskPct: num(row.ivAskPct),
    breakevenGapPct: num(row.breakevenGapPct),
    delta: num(analytics.delta), leverage: num(analytics.leverage), effectiveLeverage: num(analytics.effectiveLeverage),
    dayRangePct,
    // جای آخرین قیمت در بازهٔ روز: صفر کف روز، صد سقف روز.
    dayPositionPct: prices.high > prices.low && prices.last > 0 ? ((prices.last - prices.low) / (prices.high - prices.low)) * 100 : NaN,
  };
}

// ═══ شاخص‌های محور عمودی ═══
//
// `shape`: `candle` (پنج نقطه)، `range` (بازهٔ خرید تا فروش با نشانه) یا
// `point` (یک عدد). `log`: آیا محور لگاریتمی معنی دارد. درصد تغییر روی محور
// لگاریتمی به «نسبت به دیروز» برده می‌شود تا +۱۰۰٪ و −۵۰٪ هم‌فاصله باشند.
export const CANDLE_METRICS = Object.freeze([
  { key: 'change', label: 'درصد تغییر نسبت به پایانی دیروز', short: 'تغییر ٪', unit: 'pct', shape: 'candle', log: 'ratio' },
  { key: 'iv', label: 'تلاطم ضمنی کندلی', short: 'تلاطم ٪', unit: 'pct', shape: 'candle', log: 'plain' },
  { key: 'ivExec', label: 'تلاطم اجرایی — مظنه خرید تا فروش', short: 'تلاطم اجرایی ٪', unit: 'pct', shape: 'range', log: 'plain' },
  { key: 'premium', label: 'قیمت قرارداد ٪ قیمت پایه', short: 'پریمیوم ٪ پایه', unit: 'pct', shape: 'candle', log: 'plain' },
  { key: 'timeValue', label: 'ارزش زمانی ٪ قیمت پایه', short: 'ارزش زمانی ٪', unit: 'pct', shape: 'candle', log: '' },
  { key: 'dayRangePct', label: 'دامنه نوسان امروز ٪ پایانی دیروز', short: 'دامنه روز ٪', unit: 'pct', shape: 'point', log: 'plain' },
  { key: 'dayPositionPct', label: 'جای آخرین قیمت در بازه روز ٪', short: 'جای در بازه ٪', unit: 'pct', shape: 'point', log: '' },
  { key: 'delta', label: 'دلتا', short: 'دلتا', unit: 'num', shape: 'point', log: '' },
  { key: 'effectiveLeverage', label: 'اهرم مؤثر (اهرم × |دلتا|)', short: 'اهرم مؤثر', unit: 'num', shape: 'point', log: 'plain' },
  { key: 'breakevenGapPct', label: 'فاصله تا سربه‌سر ٪', short: 'تا سربه‌سر ٪', unit: 'pct', shape: 'point', log: '' },
  { key: 'spreadPct', label: 'فاصله مظنه ٪', short: 'اسپرد ٪', unit: 'pct', shape: 'point', log: 'plain' },
  { key: 'oiChangePct', label: 'تغییر موقعیت باز ٪', short: 'تغییر OI ٪', unit: 'pct', shape: 'point', log: '' },
]);
export const metricOf = (key) => CANDLE_METRICS.find((item) => item.key === key) || CANDLE_METRICS[0];

/** محور لگاریتمی برای این شاخص واقعاً به کار می‌رود؟ */
export const useLog = (metric, wantLog) => !!(wantLog && metricOf(metric.key || metric).log);

/**
 * عدد شاخص → مختصات محور. محور لگاریتمی با لگاریتم طبیعی روی محور خطی
 * ساخته می‌شود (برچسب‌هایش از `logTicks`)، چون محور لگاریتمیِ کتابخانه فقط
 * توان‌های پایه را برچسب می‌زند و ۰٫۵ تا ۳ برابر را بی‌برچسب می‌گذاشت.
 * عددی که لگاریتم ندارد (صفر یا منفی) `NaN` است و رسم نمی‌شود.
 */
export function toAxis(metric, value, log) {
  const m = metricOf(metric.key || metric);
  if (!Number.isFinite(value)) return NaN;
  if (!useLog(m, log)) return value;
  const v = m.log === 'ratio' ? 1 + value / 100 : value;
  return v > 0 ? Math.log(v) : NaN;
}
/** مختصات محور → عدد شاخص (برای برچسب محور). */
export function fromAxis(metric, value, log) {
  const m = metricOf(metric.key || metric);
  if (!useLog(m, log)) return value;
  const v = Math.exp(value);
  return m.log === 'ratio' ? (v - 1) * 100 : v;
}

const RATIO_TICKS = [-95, -90, -80, -70, -60, -50, -40, -30, -20, -10, 0, 10, 25, 50, 100, 200, 300, 500, 1000, 2000, 5000];

/**
 * برچسب‌های گرد برای محور لگاریتمی، به مختصات محور. درصد تغییر برچسب‌های
 * آشنای معامله‌گر را می‌گیرد (−۵۰٪، ۰، +۱۰۰٪)، بقیه دنبالهٔ ۱–۲–۵.
 */
export function logTicks(metric, lo, hi) {
  const m = metricOf(metric.key || metric);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  let values;
  if (m.log === 'ratio') values = RATIO_TICKS;
  else {
    // دنبالهٔ ریز، تا بازهٔ باریکی مثل تلاطم ۳۳ تا ۵۰٪ هم چند برچسب بگیرد.
    values = [];
    for (let e = -3; e <= 6; e += 1) for (const b of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8]) values.push(b * 10 ** e);
  }
  const a = Math.min(lo, hi), b = Math.max(lo, hi), pad = (b - a) * 0.02;
  const inside = values.map((v) => ({ v, t: toAxis(m, v, true) })).filter(({ t }) => Number.isFinite(t) && t >= a - pad && t <= b + pad);
  // بیش از نُه برچسب شلوغ است؛ یکی‌درمیان کم می‌شود ولی صفرِ درصد تغییر می‌ماند.
  const step = Math.ceil(inside.length / 9) || 1;
  return inside.filter(({ v }, i) => i % step === 0 || (m.log === 'ratio' && v === 0)).map(({ t }) => t);
}

/**
 * شکل هر رکورد روی یک شاخص: `{ shape, open, close, low, high, mark, marks }`
 * — همه به عددِ خودِ شاخص (نه مختصات محور). کندل: بدنه اولین تا آخرین،
 * سایه کمینه تا بیشینهٔ **همهٔ** نقطه‌ها (کمینهٔ تلاطم لزوماً نقطهٔ کمینهٔ
 * قیمت نیست)، نشانه پایانی. `null` یعنی این رکورد روی این شاخص چیزی ندارد.
 */
export function metricShape(record, metricKey) {
  const m = metricOf(metricKey);
  if (m.shape === 'candle') {
    const p = record.points?.[m.key] || {};
    const open = p.first, close = p.last;
    if (!Number.isFinite(open) || !Number.isFinite(close)) return null;
    const all = CANDLE_POINTS.map((key) => p[key]).filter(Number.isFinite);
    return { shape: 'candle', open, close, low: Math.min(...all), high: Math.max(...all), mark: p.close, marks: { ...p }, missing: CANDLE_POINTS.filter((key) => !Number.isFinite(p[key])) };
  }
  if (m.shape === 'range') {
    const lo = record.ivBidPct, hi = record.ivAskPct, mid = record.ivMidPct, last = record.ivPct;
    const ends = [lo, hi].filter(Number.isFinite);
    if (!ends.length && !Number.isFinite(mid)) return null;
    return { shape: 'range', low: ends.length ? Math.min(...ends) : mid, high: ends.length ? Math.max(...ends) : mid, mark: mid, last, open: NaN, close: NaN, marks: { bid: lo, ask: hi, mid, last } };
  }
  const value = record[m.key];
  return Number.isFinite(value) ? { shape: 'point', low: value, high: value, mark: value, open: NaN, close: NaN, marks: { value } } : null;
}

/**
 * عدد مرجعِ یک رکورد روی شاخص — برای مرتب‌سازی، آمار، نمودار میله‌ای و روایت.
 * کندل به‌طور پیش‌فرض «آخرین» را می‌دهد؛ `point` نقطهٔ دیگری را می‌خواهد
 * (`range` یعنی بیشینه منهای کمینهٔ همان شاخص).
 */
export function metricValue(record, metricKey, point = 'last') {
  const shape = metricShape(record, metricKey);
  if (!shape) return NaN;
  if (shape.shape !== 'candle') return shape.mark;
  if (point === 'range') return shape.high - shape.low;
  const v = shape.marks[point];
  return Number.isFinite(v) ? v : NaN;
}

// ═══ گزینش ═══

/**
 * فیلتر: نوع، نمادها، سررسیدها (هم تاریخ کل بازار، هم سررسیدِ هر نماد)،
 * حداقل ارزش و N قراردادِ پرارزش‌تر. سررسیدِ هر نماد فقط همان نماد را
 * محدود می‌کند: انتخاب دو سررسید از «اهرم» نمادهای دیگر را دست نمی‌زند.
 */
export function filterCandles(rows = [], filter = {}) {
  const side = ['call', 'put'].includes(filter.side) ? filter.side : 'all';
  const uas = new Set((filter.underlyings || []).map(String));
  const dates = new Set((filter.dates || []).map(String));
  const exp = new Set((filter.expiries || []).map(String));
  const limitedUa = new Set([...exp].map((key) => key.split(':')[0]));
  const minValue = Number(filter.minValue) > 0 ? Number(filter.minValue) : 0;
  let out = rows.filter((row) => {
    if (side !== 'all' && row.kind !== side) return false;
    if (uas.size && !uas.has(String(row.uaIns))) return false;
    if (dates.size && !dates.has(String(row.endDate))) return false;
    if (limitedUa.has(String(row.uaIns)) && !exp.has(`${row.uaIns}:${row.endDate}`)) return false;
    if (minValue && !(Number(row.value) >= minValue)) return false;
    if (filter.tradedOnly !== false && !(Number(row.trades) > 0)) return false;
    return true;
  });
  const top = Number(filter.top) > 0 ? Math.floor(Number(filter.top)) : 0;
  if (top && out.length > top) {
    out = [...out].sort((a, b) => (fin(b.value) ? b.value : -1) - (fin(a.value) ? a.value : -1)).slice(0, top);
  }
  return out;
}

/** ارزش معاملات کال و پوتِ هر نماد پایه، از ردیف‌های همان عکس. */
export function underlyingTurnover(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row.uaIns);
    if (!map.has(key)) map.set(key, { uaIns: key, uaName: row.uaName || '', callValue: 0, putValue: 0, value: 0, traded: 0, contracts: 0, expiries: new Set() });
    const item = map.get(key), value = Number(row.value);
    item.contracts += 1; item.expiries.add(String(row.endDate));
    if (Number(row.trades) > 0) item.traded += 1;
    if (Number.isFinite(value)) { item[row.kind === 'put' ? 'putValue' : 'callValue'] += value; item.value += value; }
  }
  return [...map.values()].map((item) => ({ ...item, expiries: [...item.expiries].sort() }));
}

// ═══ محور افقی ═══
//
// سه چیدمان: فاصله اعمال از پایه (قیاس‌پذیر بین نمادها و شکل لبخند)،
// گروه نماد ← سررسید ← اعمال، و رتبه بر یک کلید.
export const X_MODES = Object.freeze([
  { key: 'moneyness', label: 'فاصله اعمال از پایه ٪' },
  { key: 'grouped', label: 'نماد ← سررسید ← اعمال' },
  { key: 'ranked', label: 'رتبه' },
]);
export const RANK_KEYS = Object.freeze([
  { key: 'metric', label: 'همان شاخص محور' },
  { key: 'value', label: 'ارزش معاملات' },
  { key: 'volume', label: 'حجم' },
  { key: 'oi', label: 'موقعیت باز' },
]);

/** ترتیب رکوردها برای محور دسته‌ای. */
export function orderCandles(records = [], { xMode = 'grouped', rankKey = 'value', metric = 'change' } = {}) {
  const list = [...records];
  const known = (v) => (Number.isFinite(v) ? v : -Infinity);
  if (xMode === 'moneyness') return list.sort((a, b) => known(a.moneynessPct) - known(b.moneynessPct));
  if (xMode === 'ranked') {
    const val = (r) => (rankKey === 'metric' ? metricValue(r, metric) : num(r[rankKey]));
    return list.sort((a, b) => known(val(b)) - known(val(a)) || a.name.localeCompare(b.name, 'fa'));
  }
  return list.sort((a, b) => a.uaName.localeCompare(b.uaName, 'fa') || String(a.uaIns).localeCompare(String(b.uaIns))
    || String(a.endDate).localeCompare(String(b.endDate))
    || (a.kind === b.kind ? 0 : a.kind === 'call' ? -1 : 1) || a.strike - b.strike);
}

/** نوارهای گروه برای چیدمان گروهی: از کدام اندیس تا کدام، کدام نماد و سررسید. */
export function groupBands(ordered = []) {
  const bands = [];
  ordered.forEach((row, index) => {
    const key = `${row.uaIns}:${row.endDate}`;
    const last = bands[bands.length - 1];
    if (last && last.key === key) last.to = index;
    else bands.push({ key, uaIns: row.uaIns, uaName: row.uaName, endDate: row.endDate, from: index, to: index });
  });
  return bands;
}

// ═══ آمار ═══

/** چارک با درون‌یابی خطی؛ فهرست مرتب‌شده می‌گیرد. */
export function quantile(sorted = [], q) {
  if (!sorted.length) return NaN;
  const at = (sorted.length - 1) * q, lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** آمار یک شاخص، جدا برای کال، پوت و همه. نبودِ عدد، عدد نمی‌سازد. */
export function candleStats(records = [], metricKey = 'change') {
  const pick = (kind) => {
    const values = records.filter((r) => kind === 'all' || r.kind === kind)
      .map((r) => metricValue(r, metricKey)).filter(Number.isFinite).sort((a, b) => a - b);
    return {
      kind, count: values.length,
      min: values.length ? values[0] : NaN, max: values.length ? values[values.length - 1] : NaN,
      q1: quantile(values, 0.25), median: quantile(values, 0.5), q3: quantile(values, 0.75),
      positive: values.filter((v) => v > 0).length, negative: values.filter((v) => v < 0).length,
    };
  };
  return { all: pick('all'), call: pick('call'), put: pick('put') };
}

/**
 * قرارداد غیرعادی: دامنهٔ روز یا ارزش معاملاتش بالاتر از حصار توکی
 * (چارک سوم + ۱٫۵ × فاصلهٔ میان‌چارکی) **هم‌گروهانش** — همان نماد، سررسید
 * و نوع. گروهِ کمتر از پنج عضو حصار معنادار ندارد و چیزی علامت نمی‌خورد.
 */
export function flagUnusual(records = [], { minGroup = 5 } = {}) {
  const groups = new Map();
  for (const r of records) {
    const key = `${r.uaIns}:${r.endDate}:${r.kind}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const flags = new Map();
  for (const list of groups.values()) {
    if (list.length < minGroup) continue;
    for (const field of ['dayRangePct', 'value']) {
      const values = list.map((r) => r[field]).filter(Number.isFinite).sort((a, b) => a - b);
      if (values.length < minGroup) continue;
      const q1 = quantile(values, 0.25), q3 = quantile(values, 0.75), fence = q3 + 1.5 * (q3 - q1);
      for (const r of list) {
        if (Number.isFinite(r[field]) && r[field] > fence && fence > 0) {
          if (!flags.has(r.ins)) flags.set(r.ins, []);
          flags.get(r.ins).push(field);
        }
      }
    }
  }
  return flags;
}

// ═══ روایت به زبان معامله‌گر ═══

const P = (v, f) => f.pct(v);

/**
 * چند جمله دربارهٔ آنچه نمودار نشان می‌دهد. `f` قالب‌بند نمایشی است (رقم
 * فارسی از رابط می‌آید) تا این تابع خالص بماند. فقط از عددهایی حرف می‌زند
 * که هست؛ آمار خالی جمله‌اش را حذف می‌کند، نه اینکه صفر بگوید.
 */
export function candleNarrative(records = [], { metric = 'change', log = true, unusual = new Map(), uaDays = [], f } = {}) {
  const m = metricOf(metric), lines = [];
  const calls = records.filter((r) => r.kind === 'call'), puts = records.filter((r) => r.kind === 'put');
  if (!records.length) return ['در گزینش فعلی هیچ قرارداد معامله‌شده‌ای با کندل معتبر نیست.'];
  lines.push(`${f.int(records.length)} قرارداد معامله‌شده روی نمودار است: ${f.int(calls.length)} کال و ${f.int(puts.length)} پوت.`);

  // جهت روز: آخرین نسبت به پایانی دیروز.
  const side = (list, name) => {
    const ch = list.map((r) => r.points.change.last).filter(Number.isFinite).sort((a, b) => a - b);
    if (!ch.length) return '';
    const up = ch.filter((v) => v > 0).length;
    return `${name}: ${f.int(up)} از ${f.int(ch.length)} بالای پایانی دیروزند، میانهٔ تغییر ${P(quantile(ch, 0.5), f)}٪`;
  };
  const parts = [side(calls, 'کال‌ها'), side(puts, 'پوت‌ها')].filter(Boolean);
  if (parts.length) lines.push(`${parts.join(' · ')}.`);

  // نسبت به خود پایه، وقتی فقط یک نماد هست.
  const uaSet = new Set(records.map((r) => r.uaIns));
  if (uaSet.size === 1) {
    const ua = uaDays.find((u) => uaSet.has(String(u.ins)));
    if (ua && Number.isFinite(ua.changePct)) {
      const c = quantile(calls.map((r) => r.points.change.last).filter(Number.isFinite).sort((a, b) => a - b), 0.5);
      const read = ua.changePct > 0 && Number.isFinite(c)
        ? (c > 0 ? 'کال‌ها با پایه هم‌جهت‌اند و اهرم کار کرده' : 'پایه مثبت است ولی میانهٔ کال‌ها منفی است — یعنی تلاطم یا انتظار افت قیمت کال‌ها را پایین نگه داشته')
        : ua.changePct < 0 && Number.isFinite(c) && c > 0 ? 'پایه منفی است ولی کال‌ها مثبت‌اند — خریدار کال روی برگشت پایه شرط بسته است' : '';
      lines.push(`نماد پایه ${ua.name} امروز ${P(ua.changePct, f)}٪ تغییر کرده است${read ? `؛ ${read}` : ''}.`);
    }
  }

  // فشار انتهای جلسه از جای آخرین قیمت در بازهٔ روز.
  const near = (list, test) => list.filter((r) => Number.isFinite(r.dayPositionPct) && test(r.dayPositionPct) && r.high > r.low).length;
  const top = near(records, (v) => v >= 75), bottom = near(records, (v) => v <= 25);
  if (top + bottom) lines.push(`${f.int(top)} قرارداد نزدیک سقف روز معامله شده‌اند (خریدار تا آخر غالب بوده) و ${f.int(bottom)} قرارداد نزدیک کف روز (فروشنده غالب، یا سود از سقف پس داده شده).`);

  // بیشترین دامنه.
  const widest = records.filter((r) => Number.isFinite(r.dayRangePct)).sort((a, b) => b.dayRangePct - a.dayRangePct)[0];
  if (widest) lines.push(`پرنوسان‌ترین قرارداد ${widest.name} است: کمینه تا بیشینه‌اش ${P(widest.dayRangePct, f)}٪ پایانی دیروز بوده.`);

  // تلاطم.
  if (['iv', 'ivExec'].includes(m.key)) {
    const med = (list) => quantile(list.map((r) => metricValue(r, m.key)).filter(Number.isFinite).sort((a, b) => a - b), 0.5);
    const mc = med(calls), mp = med(puts);
    const both = Number.isFinite(mc) && Number.isFinite(mp);
    const parts = [Number.isFinite(mc) ? `کال‌ها ${P(mc, f)}٪` : '', Number.isFinite(mp) ? `پوت‌ها ${P(mp, f)}٪` : ''].filter(Boolean);
    if (parts.length) {
      const skew = both
        ? (mp > mc ? ' — پوت‌ها گران‌ترند؛ بازار برای ریزش بیمه می‌خرد' : mc > mp ? ' — کال‌ها گران‌ترند؛ تقاضای اهرم صعودی بیشتر است' : '') : '';
      lines.push(`میانهٔ تلاطم ${parts.join(' و ')} است${skew}.`);
    }
    if (m.key === 'iv') {
      const moved = records.map((r) => ({ r, d: r.points.iv.last - r.points.iv.first })).filter((x) => Number.isFinite(x.d));
      const upIv = moved.filter((x) => x.d > 0).length;
      if (moved.length) lines.push(`در ${f.int(upIv)} از ${f.int(moved.length)} قرارداد تلاطم آخرین معامله بالاتر از اولین معامله است؛ بدنهٔ سبز در این نما یعنی «گران‌تر شدن تلاطم» طی روز، نه لزوماً سود خریدار.`);
    }
  }

  if (unusual.size) {
    const names = records.filter((r) => unusual.has(r.ins)).slice(0, 6).map((r) => r.name);
    if (names.length) lines.push(`${f.int(names.length)} قرارداد نسبت به هم‌سررسیدهای خود غیرعادی‌اند (دامنه یا ارزش معاملات بالای حصار آماری) و حاشیهٔ پررنگ دارند: ${names.join('، ')}.`);
  }

  // راهنمای خواندن.
  const guide = {
    candle: 'هر کندل عمودی: سایه کمینه تا بیشینه، بدنه از اولین تا آخرین معامله، لوزی قیمت پایانی.',
    range: 'هر میله: تلاطمِ مظنه خرید تا مظنه فروش (آنچه همین حالا قابل اجراست)، خط میانی تلاطم میانه، نقطه تلاطم آخرین معامله.',
    point: 'هر نقطه یک قرارداد است؛ پراکندگی عمودی یعنی قراردادها از این نظر چقدر با هم فرق دارند.',
  }[m.shape];
  const scale = useLog(m, log) ? (m.log === 'ratio'
    ? ' محور لگاریتمی است: +۱۰۰٪ و −۵۰٪ هم‌فاصله‌اند، پس قرارداد ارزان و گران با یک خط‌کش مقایسه می‌شوند.'
    : ' محور لگاریتمی است: فاصلهٔ برابر یعنی نسبت برابر.') : '';
  lines.push(`${guide}${scale}`);
  if (m.key === 'iv') lines.push('تلاطم هر نقطه با قیمت پایهٔ هم‌جهت ساخته شده: کمینهٔ کال با کمینهٔ پایه، کمینهٔ پوت با بیشینهٔ پایه، اولین با اولین و آخرین با آخرین. زمان واقعی هر نقطه معلوم نیست، پس این کندل تقریبی است و نقطهٔ بی‌قیمتِ پایه خالی می‌ماند.');
  return lines;
}

/** شناسه‌هایی که پاسخ اطلاعاتشان نیست یا کهنه است — فقط همین‌ها دوباره گرفته می‌شوند. */
export function staleInfoIds(ids = [], cache = new Map(), now = Date.now(), ttlMs = 60_000) {
  return [...new Set(ids.map(String))].filter((id) => {
    const hit = cache.get(id);
    return !hit || !(now - hit.at < ttlMs);
  });
}

// ═══ نمودار میله‌ای: چند قرارداد (یا نماد) در هر بازهٔ شاخص ═══
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۵): «در یک نمودار جدا به صورت نمودار
// میله‌ای بازه‌های تغییر قیمت و سایر پارامترها را نشان بده… مثلاً ۲۰ نماد
// بازه تغییر x درصدی داشتند.» بازه‌ها گرد و خطی‌اند (معامله‌گر «۰ تا ۱۰٪»
// می‌خواند نه بازهٔ لگاریتمی)، و دو دنباله در دو سطل «کمتر از» و «بیشتر
// از» جمع می‌شوند تا یک قرارداد +۹۰۰٪ کل نمودار را باریک نکند.

/** گام گرد ۱–۲–۲٫۵–۵ × توان ده. */
export function niceStep(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const e = 10 ** Math.floor(Math.log10(raw)), f = raw / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}

/**
 * سطل‌ها: `{ from, to, kind: 'under'|'bin'|'over', call, put, items }`.
 * `unit: 'underlying'` هر نماد پایه را یک بار می‌شمارد — با میانهٔ کال‌هایش
 * در ستون کال و میانهٔ پوت‌هایش در ستون پوت.
 */
export function histogram(records = [], { metric = 'change', point = 'last', bins = 12, unit = 'contract', tails = true } = {}) {
  let items = records.map((r) => ({ r, kind: r.kind, name: r.name, value: metricValue(r, metric, point) })).filter((x) => Number.isFinite(x.value));
  if (unit === 'underlying') {
    const groups = new Map();
    for (const x of items) {
      const key = `${x.r.uaIns}:${x.kind}`;
      if (!groups.has(key)) groups.set(key, { kind: x.kind, name: x.r.uaName, values: [] });
      groups.get(key).values.push(x.value);
    }
    items = [...groups.values()].map((g) => ({ kind: g.kind, name: g.name, value: quantile(g.values.sort((a, b) => a - b), 0.5), n: g.values.length }));
  }
  if (!items.length) return { step: NaN, bars: [], count: 0 };
  const sorted = items.map((x) => x.value).sort((a, b) => a - b);
  const clip = tails && sorted.length >= 20;
  // صدک بی‌درون‌یابی: با درون‌یابی، یک دادهٔ پرت نیمی از راه را تا خودش
  // می‌کشید و همان کشیدگی که قرار بود بریده شود برمی‌گشت.
  const at = (q) => sorted[Math.floor((sorted.length - 1) * q)];
  let lo = clip ? at(0.02) : sorted[0], hi = clip ? at(0.98) : sorted[sorted.length - 1];
  if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
  const step = niceStep((hi - lo) / Math.max(1, bins));
  const start = Math.floor(lo / step) * step, end = Math.max(start + step, Math.ceil(hi / step) * step);
  const count = Math.max(1, Math.round((end - start) / step));
  const bars = Array.from({ length: count }, (_, i) => ({ kind: 'bin', from: start + i * step, to: start + (i + 1) * step, call: 0, put: 0, items: [] }));
  const under = { kind: 'under', from: -Infinity, to: start, call: 0, put: 0, items: [] };
  const over = { kind: 'over', from: end, to: Infinity, call: 0, put: 0, items: [] };
  for (const x of items) {
    let bar;
    if (x.value < start) bar = under;
    else if (x.value >= end) bar = x.value === end ? bars[bars.length - 1] : over;
    else bar = bars[Math.min(bars.length - 1, Math.floor((x.value - start) / step))];
    bar[x.kind === 'put' ? 'put' : 'call'] += 1;
    bar.items.push(x);
  }
  for (const bar of [under, ...bars, over]) bar.items.sort((a, b) => b.value - a.value);
  return { step, count: items.length, bars: [...(under.items.length ? [under] : []), ...bars, ...(over.items.length ? [over] : [])] };
}
