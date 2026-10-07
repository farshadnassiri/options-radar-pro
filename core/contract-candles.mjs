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
import { contractAnalytics, contractBreakeven, breakevenGap, breakevenGapPct } from './decision-dashboard.mjs';
import { weightedMean } from './open-view.mjs';

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
export function candleRecord(row = {}, { info = null, uaDay = null, settings = {}, params = {}, chainBe = null } = {}) {
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
    // سربه‌سر از همان قاعدهٔ زنجیره (`contractBreakeven`: اعمال ± آخرین)؛
    // ردیف عکس آن را ندارد و پیش از این ستون «تا سربه‌سر» خالی می‌ماند.
    breakeven: contractBreakeven(row), breakevenGap: breakevenGap(row), breakevenGapPct: breakevenGapPct(row),
    chainBreakeven: num(chainBe?.value), chainBreakevenCount: num(chainBe?.count),
    beVsChain: Number.isFinite(contractBreakeven(row)) && num(chainBe?.value) > 0 ? contractBreakeven(row) - num(chainBe.value) : NaN,
    beVsChainPct: Number.isFinite(contractBreakeven(row)) && num(chainBe?.value) > 0 ? ((contractBreakeven(row) / num(chainBe.value)) - 1) * 100 : NaN,
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
// ═══ مرتب‌سازی ═══
//
// «امکان سورت قراردادها بر اساس آیتم‌های مختلف: ارزش معاملات، حجم،
// قراردادهای باز و…» در چیدمان «رتبه» کل محور، و در چیدمان گروهی درونِ هر
// نماد/سررسید، با همین کلید مرتب می‌شود. عددِ نامعلوم همیشه ته صف است،
// چه صعودی چه نزولی — «نمی‌دانیم» نه بزرگ‌ترین است نه کوچک‌ترین.
export const SORT_KEYS = Object.freeze([
  { key: 'strike', label: 'قیمت اعمال (کال پیش از پوت)' },
  { key: 'metric', label: 'همان شاخص محور عمودی' },
  { key: 'value', label: 'ارزش معاملات' },
  { key: 'volume', label: 'حجم' },
  { key: 'trades', label: 'تعداد معامله' },
  { key: 'oi', label: 'موقعیت باز' },
  { key: 'oiChange', label: 'تغییر موقعیت باز' },
  { key: 'oiChangePct', label: 'تغییر موقعیت باز ٪' },
  { key: 'change', label: 'درصد تغییر آخرین' },
  { key: 'dayRangePct', label: 'دامنه نوسان روز ٪' },
  { key: 'ivPct', label: 'تلاطم ضمنی آخرین' },
  { key: 'delta', label: 'دلتا' },
  { key: 'effectiveLeverage', label: 'اهرم مؤثر' },
  { key: 'moneynessPct', label: 'فاصله اعمال از پایه ٪' },
  { key: 'breakevenGapPct', label: 'فاصله تا سربه‌سر ٪' },
  { key: 'beVsChainPct', label: 'فاصله از سربه‌سر وزنی ٪' },
  { key: 'days', label: 'روز مانده' },
]);
/** سازگاری: کلیدهای چیدمان رتبهٔ نسخهٔ اول. */
export const RANK_KEYS = SORT_KEYS;

/** عدد کلید مرتب‌سازی یک رکورد. */
export function sortValue(r, key, metric = 'change') {
  if (key === 'metric') return metricValue(r, metric);
  if (key === 'change') return num(r.points?.change?.last);
  return num(r[key]);
}

/**
 * ترتیب رکوردها. `sortKey`/`sortDir` (`desc` پیش‌فرض، جز قیمت اعمال که
 * صعودی است) در «رتبه» روی کل محور و در «گروهی» درون هر نماد/سررسید.
 * `rankKey` نام قدیمی همان `sortKey` است.
 */
export function orderCandles(records = [], { xMode = 'grouped', sortKey, rankKey, sortDir, metric = 'change' } = {}) {
  const list = [...records];
  const key = sortKey || rankKey || (xMode === 'ranked' ? 'value' : 'strike');
  const dir = sortDir === 'asc' || sortDir === 'desc' ? sortDir : key === 'strike' ? 'asc' : 'desc';
  const sign = dir === 'asc' ? 1 : -1;
  const byKey = (a, b) => {
    if (key === 'strike') return sign * ((a.kind === b.kind ? 0 : a.kind === 'call' ? -1 : 1) || a.strike - b.strike);
    const va = sortValue(a, key, metric), vb = sortValue(b, key, metric);
    const fa = Number.isFinite(va), fb = Number.isFinite(vb);
    if (fa !== fb) return fa ? -1 : 1;
    return (fa ? sign * (va - vb) : 0) || a.name.localeCompare(b.name, 'fa');
  };
  if (xMode === 'moneyness') return list.sort((a, b) => (num(a.moneynessPct) || 0) - (num(b.moneynessPct) || 0));
  if (xMode === 'ranked') return list.sort(byKey);
  return list.sort((a, b) => a.uaName.localeCompare(b.uaName, 'fa') || String(a.uaIns).localeCompare(String(b.uaIns))
    || String(a.endDate).localeCompare(String(b.endDate)) || byKey(a, b));
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


// ═══ دستگیره‌های کشویی: بازهٔ ارزش، حجم و … ═══
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۵، دور دوم): «فیلترهای دیگر از قبیل ارزش
// معاملات قرارداد و حجم… با دستگیره کشویی، به صورت realtime.» ارزش و حجم
// چند مرتبه پراکنده‌اند (یک قرارداد صد هزار ریال، دیگری صد میلیارد)؛ دستگیرهٔ
// خطی همهٔ بازه را در یک درصدِ اول فشرده می‌کرد. پس این میدان‌ها روی
// مقیاس لگاریتمی حرکت می‌کنند و صفر (معامله‌نشده) جای خودش را در ابتدای
// مسیر دارد.
export const SLIDER_FIELDS = Object.freeze([
  { key: 'value', label: 'ارزش معاملات', unit: 'rial', log: true },
  { key: 'volume', label: 'حجم (قرارداد)', unit: 'int', log: true },
  { key: 'trades', label: 'تعداد معامله', unit: 'int', log: true },
  { key: 'oi', label: 'موقعیت باز (قرارداد)', unit: 'int', log: true },
  { key: 'days', label: 'روز مانده تا سررسید', unit: 'int', log: false },
  { key: 'moneynessPct', label: 'فاصله اعمال از پایه ٪', unit: 'pct', log: false },
  { key: 'dayRangePct', label: 'دامنه نوسان روز ٪', unit: 'pct', log: false },
]);
export const SLIDER_STEPS = 1000;

/**
 * نگاشت جای دستگیره (۰ تا `SLIDER_STEPS`) ↔ عدد میدان، از روی عددهای موجود.
 * لگاریتمی وقتی میدان مثبت است؛ صفرِ واقعی در جای ۰ می‌نشیند.
 */
export function sliderScale(values = [], log = false) {
  // `num`، نه `Number`: «null» نامعلوم است، نه صفر.
  const list = values.map(num).filter(Number.isFinite);
  if (!list.length) return null;
  const lo = Math.min(...list), hi = Math.max(...list);
  const positives = list.filter((v) => v > 0);
  const useLogScale = log && positives.length > 0 && lo >= 0;
  const pMin = useLogScale ? Math.min(...positives) : lo;
  const zeroSlot = useLogScale && lo === 0;
  const span = SLIDER_STEPS - (zeroSlot ? 1 : 0);
  const toValue = (pos) => {
    const p = Math.max(0, Math.min(SLIDER_STEPS, Number(pos)));
    if (p <= 0) return lo;
    if (p >= SLIDER_STEPS) return hi;
    if (!useLogScale) return lo + ((hi - lo) * p) / SLIDER_STEPS;
    const t = (p - (zeroSlot ? 1 : 0)) / span;
    if (t <= 0) return zeroSlot ? 0 : pMin;
    return hi > pMin ? Math.exp(Math.log(pMin) + t * (Math.log(hi) - Math.log(pMin))) : pMin;
  };
  const toPos = (value) => {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= lo) return 0;
    if (v >= hi) return SLIDER_STEPS;
    if (!useLogScale) return Math.round(((v - lo) / (hi - lo)) * SLIDER_STEPS);
    if (v < pMin) return zeroSlot ? 1 : 0;
    const t = hi > pMin ? (Math.log(v) - Math.log(pMin)) / (Math.log(hi) - Math.log(pMin)) : 0;
    return Math.round((zeroSlot ? 1 : 0) + t * span);
  };
  return { lo, hi, log: useLogScale, toValue, toPos };
}

/**
 * بازه‌های فعال دستگیره‌ها را روی رکوردها می‌گذارد. `ranges[key] = { lo, hi }`
 * (هر کدام `null` یعنی باز). رکوردی که آن میدان را ندارد، با بازهٔ فعال کنار
 * می‌رود — «نمی‌دانیم» در بازه نیست — و شمارش جدا برمی‌گردد.
 */
export function applyRanges(records = [], ranges = {}) {
  const active = Object.entries(ranges || {}).filter(([, r]) => r && (Number.isFinite(r.lo) || Number.isFinite(r.hi)));
  if (!active.length) return { kept: records, cut: 0, unknown: 0 };
  let cut = 0, unknown = 0;
  const kept = records.filter((rec) => {
    for (const [key, r] of active) {
      const v = Number(rec[key]);
      if (!Number.isFinite(v)) { unknown += 1; return false; }
      if ((Number.isFinite(r.lo) && v < r.lo) || (Number.isFinite(r.hi) && v > r.hi)) { cut += 1; return false; }
    }
    return true;
  });
  return { kept, cut, unknown };
}

// ═══ کندل‌های پرت ═══
//
// «داده‌ها و کندل‌های پرت خوانش نمودار را سخت می‌کنند و مقیاس آن را به هم
// می‌زنند.» سه راه، هیچ‌کدام عددی را عوض نمی‌کند: (۱) حذف دستی با کلیک
// (رابط)، (۲) حذف خودکارِ بیرون از حصار توکی روی همان محوری که دیده
// می‌شود، (۳) مقیاس مقاوم: محور از صدک‌ها، کندلِ بیرون‌زده با پیکان لبه.

/** عدد شکل روی محور (لگاریتمی اگر محور لگاریتمی است). */
const axisOf = (metric, v, log) => toAxis(metric, v, log);

/**
 * شناسهٔ کندل‌هایی که سایه‌شان از حصار توکی (k × فاصلهٔ میان‌چارکی) بیرون
 * می‌زند — روی مختصات محور، تا روی محور لگاریتمی «پرت» همان چیزی باشد که
 * چشم می‌بیند. کمتر از هشت کندل، حصار معنا ندارد.
 */
export function outlierIds(records = [], metricKey = 'change', { log = true, k = 3 } = {}) {
  const m = metricOf(metricKey);
  const rows = records.map((r) => ({ r, s: metricShape(r, m.key) })).filter((x) => x.s);
  const mids = rows.map(({ s }) => axisOf(m, s.shape === 'candle' ? s.close : s.mark, log)).filter(Number.isFinite).sort((a, b) => a - b);
  if (mids.length < 8) return [];
  const q1 = quantile(mids, 0.25), q3 = quantile(mids, 0.75), iqr = q3 - q1;
  const loF = q1 - k * iqr, hiF = q3 + k * iqr;
  return rows.filter(({ s }) => {
    const lo = axisOf(m, s.low, log), hi = axisOf(m, s.high, log);
    return (Number.isFinite(lo) && lo < loF) || (Number.isFinite(hi) && hi > hiF);
  }).map(({ r }) => r.ins);
}

/** بازهٔ مقاوم محور: صدک `q` کف‌ها تا صدک `1−q` سقف‌ها، در مختصات محور. */
export function robustExtent(records = [], metricKey = 'change', { log = true, q = 0.02 } = {}) {
  const m = metricOf(metricKey);
  const lows = [], highs = [];
  for (const r of records) {
    const s = metricShape(r, m.key);
    if (!s) continue;
    const lo = axisOf(m, s.low, log), hi = axisOf(m, s.high, log);
    if (Number.isFinite(lo)) lows.push(lo);
    if (Number.isFinite(hi)) highs.push(hi);
  }
  if (lows.length < 5) return null;
  lows.sort((a, b) => a - b); highs.sort((a, b) => a - b);
  const lo = quantile(lows, q), hi = quantile(highs, 1 - q);
  const pad = (hi - lo) * 0.04 || 0.01;
  return { lo: lo - pad, hi: hi + pad };
}

// ═══ نمودار توزیع ═══
//
// خواستهٔ صاحب پروژه: «در یک نمودار جدا به صورت میله‌ای بازه‌های تغییر قیمت و
// سایر پارامترها… مثلاً ۲۰ نماد بازه تغییر x درصدی داشتند»؛ دور دوم: «اصلاح
// کن، دقیق‌ترش کن و پارامترهای بیشتری اضافه کن.» نسخهٔ اول برچسب بازه را با
// گرد کردنِ نمایشی می‌نوشت (۳۷٫۵ ← ۳۸) و لبه‌ها با خطای ممیز شناور جمع
// می‌شدند؛ حالا لبه‌ها به رقم اعشارِ گام گرد می‌شوند، هر عدد دقیقاً در یک
// سطل [از، تا) می‌افتد، و آمار کامل، وزن، گروه، دنباله و چگالی دارد.

/** گام گرد ۱–۲–۲٫۵–۵ × توان ده. */
export function niceStep(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const e = 10 ** Math.floor(Math.log10(raw)), f = raw / e;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
}

/** شمار رقم اعشار لازم برای نوشتن دقیق یک گام (۲٫۵ → ۱، ۰٫۲۵ → ۲). */
export function stepDecimals(step) {
  for (let d = 0; d <= 8; d += 1) {
    const x = step * 10 ** d;
    if (Math.abs(Math.round(x) - x) < 1e-7 * Math.max(1, x)) return d;
  }
  return 8;
}

export const HIST_WEIGHTS = Object.freeze([
  ['count', 'شمار'], ['value', 'ارزش معاملات'], ['volume', 'حجم'], ['trades', 'تعداد معامله'], ['oi', 'موقعیت باز'],
]);
export const HIST_GROUPS = Object.freeze([
  ['kind', 'کال و پوت'], ['moneyness', 'در / به / خارج از پول'], ['underlying', 'نماد پایه'], ['expiry', 'سررسید'], ['none', 'بی‌گروه'],
]);

/** در پول، به پول (±۲٪) یا خارج از پول — از دید دارندهٔ همان قرارداد. */
export function moneynessClass(r, band = 2) {
  const m = num(r.moneynessPct);
  if (!Number.isFinite(m)) return 'unknown';
  if (Math.abs(m) <= band) return 'atm';
  const callItm = m < 0; // اعمال زیر قیمت پایه
  return (r.kind === 'put' ? !callItm : callItm) ? 'itm' : 'otm';
}
const MONEYNESS_LABEL = { itm: 'در سود', atm: 'به پول (±۲٪)', otm: 'خارج از پول', unknown: 'نامعلوم' };

/** آمار توصیفی؛ وزن‌دار وقتی وزن داده شود. */
export function describe(values = [], weights = null) {
  const pairs = values.map((v, i) => [v, weights ? weights[i] : 1]).filter(([v, w]) => Number.isFinite(v) && Number.isFinite(w) && w >= 0);
  const xs = pairs.map(([v]) => v).sort((a, b) => a - b);
  const n = xs.length;
  if (!n) return { n: 0, mean: NaN, std: NaN, median: NaN, q1: NaN, q3: NaN, iqr: NaN, min: NaN, max: NaN, skew: NaN, kurt: NaN, positive: 0, negative: 0, wMean: NaN, wMedian: NaN };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const m2 = xs.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  const m3 = xs.reduce((a, v) => a + (v - mean) ** 3, 0) / n;
  const m4 = xs.reduce((a, v) => a + (v - mean) ** 4, 0) / n;
  const std = n > 1 ? Math.sqrt(m2 * n / (n - 1)) : NaN;
  const q1 = quantile(xs, 0.25), q3 = quantile(xs, 0.75);
  const W = pairs.reduce((a, [, w]) => a + w, 0);
  let wMean = NaN, wMedian = NaN;
  if (weights && W > 0) {
    wMean = pairs.reduce((a, [v, w]) => a + v * w, 0) / W;
    const sorted = [...pairs].sort((a, b) => a[0] - b[0]);
    let acc = 0;
    for (const [v, w] of sorted) { acc += w; if (acc >= W / 2) { wMedian = v; break; } }
  }
  return {
    n, mean, std, median: quantile(xs, 0.5), q1, q3, iqr: q3 - q1, min: xs[0], max: xs[n - 1],
    skew: m2 > 0 && n > 2 ? m3 / m2 ** 1.5 : NaN, kurt: m2 > 0 && n > 3 ? m4 / m2 ** 2 - 3 : NaN,
    positive: xs.filter((v) => v > 0).length, negative: xs.filter((v) => v < 0).length, wMean, wMedian,
  };
}

const groupOf = (x, groupBy) => {
  if (groupBy === 'kind') return x.kind === 'put' ? 'put' : 'call';
  if (groupBy === 'moneyness') return moneynessClass(x.r || x);
  if (groupBy === 'underlying') return String(x.uaName || x.r?.uaName || '');
  if (groupBy === 'expiry') return String(x.endDate || x.r?.endDate || '');
  return 'all';
};

/**
 * توزیع یک شاخص. خروجی: `{ step, decimals, start, end, bars, groups,
 * stats, kde, total, count, outside }`. هر میله `{ kind: 'under'|'bin'|'over',
 * from, to, total, byGroup, items }` و `total` جمع وزن است (یا شمار).
 * `unit: 'underlying'` هر نماد پایه را با میانهٔ قراردادهایش یک بار می‌شمارد
 * (کال و پوت جدا). `tails` کسرِ بریده از هر سر (۰ تا ۰٫۱) است؛ بریده‌ها در
 * دو سطل «کمتر از» و «بیشتر از» جمع می‌شوند و گم نمی‌شوند.
 */
export function histogram(records = [], {
  metric = 'change', point = 'last', bins = 12, binWidth = 0, unit = 'contract',
  tails = 0.02, weight = 'count', groupBy = 'kind', kde = true,
} = {}) {
  const wOf = (r) => (weight === 'count' ? 1 : num(r[weight]));
  let items = records.map((r) => ({ r, kind: r.kind, name: r.name, uaName: r.uaName, endDate: r.endDate, value: metricValue(r, metric, point), w: wOf(r) }))
    .filter((x) => Number.isFinite(x.value) && Number.isFinite(x.w) && x.w >= 0);
  if (unit === 'underlying') {
    const groups = new Map();
    for (const x of items) {
      const key = `${x.r.uaIns}:${x.kind}`;
      if (!groups.has(key)) groups.set(key, { kind: x.kind, name: x.r.uaName, uaName: x.r.uaName, endDate: '', values: [], w: 0, members: [] });
      const g = groups.get(key); g.values.push(x.value); g.w += x.w; g.members.push(x.r);
    }
    items = [...groups.values()].map((g) => ({ kind: g.kind, name: g.name, uaName: g.uaName, endDate: g.endDate, r: { ...g.members[0], moneynessPct: NaN }, value: quantile(g.values.sort((a, b) => a - b), 0.5), w: weight === 'count' ? 1 : g.w, n: g.values.length }));
  }
  const empty = { step: NaN, decimals: 0, start: NaN, end: NaN, bars: [], groups: [], stats: describe([]), kde: [], total: 0, count: 0, outside: 0 };
  if (!items.length) return empty;
  const sorted = items.map((x) => x.value).sort((a, b) => a - b);
  const cut = Math.max(0, Math.min(0.1, Number(tails) || 0));
  const clip = cut > 0 && sorted.length >= 20;
  // صدک بی‌درون‌یابی: با درون‌یابی، یک دادهٔ پرت نیمی از راه را تا خودش
  // می‌کشید و همان کشیدگی که قرار بود بریده شود برمی‌گشت.
  const at = (q) => sorted[Math.floor((sorted.length - 1) * q)];
  let lo = clip ? at(cut) : sorted[0], hi = clip ? at(1 - cut) : sorted[sorted.length - 1];
  if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
  const step = Number(binWidth) > 0 ? Number(binWidth) : niceStep((hi - lo) / Math.max(1, bins));
  const decimals = stepDecimals(step);
  const round = (x) => Number(x.toFixed(decimals));
  const start = round(Math.floor(lo / step + 1e-9) * step);
  let count = Math.max(1, Math.ceil((hi - start) / step - 1e-9));
  if (count > 400) count = 400;
  const end = round(start + count * step);
  const bars = Array.from({ length: count }, (_, i) => ({ kind: 'bin', from: round(start + i * step), to: round(start + (i + 1) * step), total: 0, byGroup: {}, items: [] }));
  const under = { kind: 'under', from: -Infinity, to: start, total: 0, byGroup: {}, items: [] };
  const over = { kind: 'over', from: end, to: Infinity, total: 0, byGroup: {}, items: [] };
  for (const x of items) {
    let bar;
    if (x.value < start) bar = under;
    else if (x.value > end) bar = over;
    else bar = bars[Math.min(count - 1, Math.floor((x.value - start) / step + 1e-9))];
    const g = groupOf(x, groupBy);
    bar.total += x.w; bar.byGroup[g] = (bar.byGroup[g] || 0) + x.w;
    bar.items.push(x);
  }
  const all = [...(under.items.length ? [under] : []), ...bars, ...(over.items.length ? [over] : [])];
  for (const bar of all) bar.items.sort((a, b) => b.value - a.value);
  const totals = new Map();
  for (const x of items) { const g = groupOf(x, groupBy); totals.set(g, (totals.get(g) || 0) + x.w); }
  const groups = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([key, w]) => ({
    key, weight: w,
    label: groupBy === 'kind' ? (key === 'put' ? 'پوت' : 'کال')
      : groupBy === 'moneyness' ? MONEYNESS_LABEL[key] : groupBy === 'none' ? 'همه' : key,
  }));
  const total = items.reduce((a, x) => a + x.w, 0);
  let acc = 0;
  for (const bar of all) { acc += bar.total; bar.cumulative = total > 0 ? (acc / total) * 100 : NaN; }
  const stats = describe(items.map((x) => x.value), weight === 'count' ? null : items.map((x) => x.w));
  // چگالی هسته‌ای گاوسی (پهنای باند سیلورمن)، هم‌مقیاس با ارتفاع میله‌ها.
  let curve = [];
  if (kde && items.length >= 5 && total > 0) {
    const spread = Math.min(stats.std, stats.iqr / 1.34 || stats.std);
    const h = 0.9 * (spread > 0 ? spread : stats.std || step) * items.length ** -0.2;
    if (h > 0) {
      // منحنی تا سه پهنای باند بیرون از بازه‌ها هم کشیده می‌شود تا دنباله‌اش بریده نشود.
      const a = start - 3 * h, b = end + 3 * h;
      const xs = Array.from({ length: 161 }, (_, i) => a + ((b - a) * i) / 160);
      curve = xs.map((xv) => {
        let d = 0;
        for (const x of items) d += x.w * Math.exp(-0.5 * ((xv - x.value) / h) ** 2);
        return [xv, (d / (h * Math.sqrt(2 * Math.PI))) * step];
      });
    }
  }
  return { step, decimals, start, end, bars: all, groups, stats, kde: curve, total, count: items.length, outside: under.items.length + over.items.length };
}

// ═══ خلاصهٔ زیر نمودار مادر ═══
//
// «توضیحات تکمیلی بیشتری به صورت متنی و کوتاه زیر چارت بده (ارزش معاملات،
// قراردادهای باز، تغییراتش و…).» هر جمع فقط از قراردادهایی است که آن عدد را
// دارند و شمار جاافتاده‌ها کنارش برمی‌گردد — جمعِ نصفه بی‌نام ساخته نمی‌شود.

/** جمع عددهای موجود، با شمار موجود و جاافتاده. */
export function sumKnown(records = [], key) {
  let sum = 0, known = 0;
  for (const r of records) {
    const v = num(r[key]);
    if (Number.isFinite(v)) { sum += v; known += 1; }
  }
  return { sum: known ? sum : NaN, known, missing: records.length - known };
}

export function candleSummary(records = []) {
  const calls = records.filter((r) => r.kind === 'call'), puts = records.filter((r) => r.kind === 'put');
  const change = (r) => r.points?.change?.last;
  const up = records.filter((r) => change(r) > 0).length, down = records.filter((r) => change(r) < 0).length;
  const med = (list) => quantile(list.map(change).filter(Number.isFinite).sort((a, b) => a - b), 0.5);
  const value = sumKnown(records, 'value'), callValue = sumKnown(calls, 'value'), putValue = sumKnown(puts, 'value');
  const oi = sumKnown(records, 'oi'), callOi = sumKnown(calls, 'oi'), putOi = sumKnown(puts, 'oi');
  // تغییر موقعیت باز فقط از قراردادهایی که هم امروز و هم دیروزشان معلوم است.
  const both = records.filter((r) => Number.isFinite(num(r.oi)) && Number.isFinite(num(r.oiChange)));
  const oiChange = both.reduce((a, r) => a + num(r.oiChange), 0);
  const oiBase = both.reduce((a, r) => a + (num(r.oi) - num(r.oiChange)), 0);
  // تغییر وزنی با ارزش: «پول کجا رفت»، نه میانگین قراردادهای کم‌معامله.
  const weighted = records.filter((r) => Number.isFinite(change(r)) && num(r.value) > 0);
  const wSum = weighted.reduce((a, r) => a + num(r.value), 0);
  const ivRows = records.filter((r) => Number.isFinite(num(r.ivPct)) && num(r.value) > 0);
  const ivW = ivRows.reduce((a, r) => a + num(r.value), 0);
  const pick = (list, f, dir = 1) => list.filter((r) => Number.isFinite(f(r))).sort((a, b) => dir * (f(b) - f(a)))[0] || null;
  return {
    count: records.length, calls: calls.length, puts: puts.length, up, down, flat: records.length - up - down,
    value, callValue, putValue, volume: sumKnown(records, 'volume'), trades: sumKnown(records, 'trades'),
    oi, callOi, putOi, oiChange: both.length ? oiChange : NaN, oiChangePct: oiBase > 0 ? (oiChange / oiBase) * 100 : NaN, oiKnown: both.length,
    medianCall: med(calls), medianPut: med(puts),
    valueWeightedChange: wSum > 0 ? weighted.reduce((a, r) => a + change(r) * num(r.value), 0) / wSum : NaN,
    valueWeightedIv: ivW > 0 ? ivRows.reduce((a, r) => a + num(r.ivPct) * num(r.value), 0) / ivW : NaN,
    putCallValue: callValue.sum > 0 && Number.isFinite(putValue.sum) ? putValue.sum / callValue.sum : NaN,
    putCallOi: callOi.sum > 0 && Number.isFinite(putOi.sum) ? putOi.sum / callOi.sum : NaN,
    topValue: pick(records, (r) => num(r.value)),
    topGainer: pick(records, change), topLoser: pick(records, change, -1),
    widest: pick(records, (r) => r.dayRangePct),
    topOiAdd: pick(records, (r) => num(r.oiChange)), topOiCut: pick(records, (r) => num(r.oiChange), -1),
  };
}

// ═══ سربه‌سر وزنی زنجیره ═══
//
// «قیمت سربه‌سر وزنی زنجیرهٔ آن قرارداد و فاصلهٔ سربه‌سر قرارداد از آن.»
// همان تعریف «رصد لحظه‌ای / نگاه باز» و «استرانگل بازی» (`optionBreakeven`
// و `weightedMean` در `core/open-view.mjs`): میانگین سربه‌سرِ قراردادهای
// همان نماد، همان سررسید و همان سمت، با وزن ارزش معاملات. قرارداد بی‌معامله
// وزن ندارد. از **همهٔ** زنجیره ساخته می‌شود، نه فقط آنچه فیلتر نگه داشته.

export const chainKey = (row) => `${row.uaIns}:${row.endDate}:${row.kind === 'put' ? 'put' : 'call'}`;

export function chainBreakevens(contracts = []) {
  const groups = new Map();
  for (const row of contracts) {
    const key = chainKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const out = new Map();
  for (const [key, rows] of groups) out.set(key, weightedMean(rows, (r) => contractBreakeven(r), (r) => num(r.value)));
  return out;
}

// ═══ شاخص ترکیبی: یک کندل از همهٔ کندل‌ها ═══
//
// «چون چندین کندل داریم چطور یک شاخص از همه‌شان بسازیم؟ مثلاً میانگین وزنی
// قیمت پایانی، میانگین وزنی قرارداد باز و…» هر نقطهٔ کندل ترکیبی، میانگینِ
// وزنیِ همان نقطه در کندل‌های گزینش است — روی خودِ شاخص محور (درصد تغییر،
// تلاطم، …)، نه روی قیمت ریالی که بین نمادها قابل جمع نیست. وزن قابل انتخاب
// است؛ قراردادی که وزن یا عدد آن نقطه را ندارد در همان نقطه شمرده نمی‌شود و
// شمارش جدا برمی‌گردد.
export const COMPOSITE_WEIGHTS = Object.freeze([
  ['none', 'بدون شاخص ترکیبی'],
  ['value', 'میانگین وزنی با ارزش معاملات'],
  ['volume', 'میانگین وزنی با حجم'],
  ['oi', 'میانگین وزنی با موقعیت باز'],
  ['trades', 'میانگین وزنی با تعداد معامله'],
  ['equal', 'میانگین ساده (وزن برابر)'],
  ['median', 'میانه (مقاوم در برابر پرت)'],
]);

export function compositeCandle(records = [], metricKey = 'change', weight = 'value') {
  if (!weight || weight === 'none') return null;
  const m = metricOf(metricKey);
  const shaped = records.map((r) => ({ r, s: metricShape(r, m.key) })).filter((x) => x.s);
  const points = m.shape === 'candle' ? CANDLE_POINTS : ['mark'];
  const valueAt = (s, p) => (m.shape === 'candle' ? s.marks[p] : s.mark);
  const wOf = (r) => (weight === 'equal' || weight === 'median' ? 1 : num(r[weight]));
  const out = { metric: m.key, weight, shape: m.shape === 'candle' ? 'candle' : 'point', n: 0, missingWeight: 0 };
  let used = new Set();
  for (const p of points) {
    const pairs = shaped.map(({ r, s }) => [valueAt(s, p), wOf(r), r.ins]).filter(([v, w]) => Number.isFinite(v) && Number.isFinite(w) && w > 0);
    if (!pairs.length) { out[p] = NaN; continue; }
    if (weight === 'median') out[p] = quantile(pairs.map(([v]) => v).sort((a, b) => a - b), 0.5);
    else {
      const W = pairs.reduce((a, [, w]) => a + w, 0);
      out[p] = pairs.reduce((a, [v, w]) => a + v * w, 0) / W;
    }
    for (const [, , ins] of pairs) used.add(ins);
  }
  out.n = used.size;
  out.missingWeight = shaped.length - used.size;
  if (m.shape !== 'candle') { out.close = out.mark; out.last = out.mark; }
  out.weightTotal = weight === 'equal' || weight === 'median' ? used.size : shaped.filter(({ r }) => used.has(r.ins)).reduce((a, { r }) => a + num(r[weight]), 0);
  return out;
}

/** همان شاخص ترکیبی برای هر نماد/سررسید جدا. */
export function compositeByGroup(records = [], metricKey = 'change', weight = 'value') {
  const groups = new Map();
  for (const r of records) {
    const key = `${r.uaIns}:${r.endDate}`;
    if (!groups.has(key)) groups.set(key, { key, uaIns: r.uaIns, uaName: r.uaName, endDate: r.endDate, rows: [] });
    groups.get(key).rows.push(r);
  }
  return [...groups.values()].map((g) => ({ ...g, composite: compositeCandle(g.rows, metricKey, weight), count: g.rows.length, rows: undefined }));
}

/**
 * محور میلهٔ پس‌زمینه: میله‌ها پایینِ همان کادر نمودار اصلی می‌نشینند و
 * بلندترینشان `share` (پیش‌فرض ۳۰٪) ارتفاع کادر را می‌گیرد، تا کندل‌ها
 * دیده بمانند. خروجی کمینه/بیشینهٔ محور دوم (لگاریتمی یا خطی).
 */
export function backgroundBarAxis(values = [], { log = true, share = 0.3 } = {}) {
  const list = values.map(num).filter((v) => Number.isFinite(v) && (log ? v > 0 : v >= 0));
  if (!list.length) return null;
  const hi = Math.max(...list);
  if (!log) return { min: 0, max: hi / share };
  const lo = Math.min(...list);
  const base = lo < hi ? lo / 1.5 : hi / 10;
  return { min: base, max: base * (hi / base) ** (1 / share) };
}
