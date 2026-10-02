// رتبه و صدک تلاطم ضمنی (IV Rank / IV Percentile) و خویشاوندانش.
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۰): «IV Rank و IV Percentile را اضافه کن…
// مقایسهٔ تلاطم فعلی با این دو و با تلاطم تاریخی، نمودار تلاطم ضمنی و
// تاریخی، و رابطهٔ انواع تلاطم در نمودار و جدول تعاملی.»
//
// این ماژول خالص است: شبکه نمی‌زند و DOM نمی‌شناسد. ورودی‌اش سری روزانهٔ
// نماد پایه و قیمت پایانی قراردادهای معامله‌شدهٔ هر روز است؛ خروجی‌اش هر
// عددی که رابط نشان می‌دهد.
//
// ═══ شاخص تلاطم ضمنی یک روز ═══
//
// IV یک قرارداد نیست، IV **پایه** است: تلاطم «در پول» در افق ثابت. برای هر
// سررسید، تلاطم دو اعمالِ دو طرفِ قیمت پایه (میانگین کال و پوتِ همان اعمال،
// هر کدام که معامله شده) روی قیمت پایه درون‌یابی می‌شود. بعد دو سررسیدِ
// دو طرفِ افق هدف (پیش‌فرض ۳۰ روز تقویمی) در **واریانس×زمان** درون‌یابی
// می‌شوند — همان روشی که شاخص‌های تلاطم بازارهای جهانی دارند. روش دوم،
// «نزدیک‌ترین سررسید»، برای بازاری است که سررسید دوم کم‌معامله است.
//
// قراردادی که آن روز معامله نشده وارد نمی‌شود: پایانیِ روزِ بی‌معامله همان
// پایانی دیروز است و تلاطمی که از آن درآید، تلاطم دیروز با قیمت پایهٔ امروز
// است — عددی که هیچ‌جا وجود نداشت.
//
// ═══ IVR و IVP ═══
//
//   IVR = (IV امروز − کمینهٔ بازه) ÷ (بیشینهٔ بازه − کمینهٔ بازه) × ۱۰۰
//   IVP = درصد روزهای بازه (پیش از امروز) که IV از امروز کمتر بود
//
// بازه بر حسب **روز معاملاتی** نماد پایه است، نه شمار مشاهدهٔ معتبر. روزی که
// شاخص ساخته نشد، خالی می‌ماند و پوشش بازه گزارش می‌شود؛ با کمتر از
// `minSamples` روز معتبر هیچ رتبه‌ای ساخته نمی‌شود. IVR به یک جهش تک‌روزه
// حساس است (کمینه و بیشینه دو نقطه‌اند)؛ IVP نه — برای همین هر دو نشان
// داده می‌شوند و اختلاف بزرگشان خودش خبر است.

import { impliedVolWhy } from './bs.mjs';
import { dateUtc, daysBetween, normalizeHistoryDate } from './history.mjs';

export const VOL_RANK_VERSION = 1;

const finite = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return NaN;
  const out = Number(value);
  return Number.isFinite(out) ? out : NaN;
};
const isNum = (value) => Number.isFinite(value);
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN);
const faInt = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/** بازه‌های رتبه، بر حسب روز معاملاتی. */
export const VOL_LOOKBACKS = [
  [60, 'سه ماه'], [120, 'شش ماه'], [240, 'یک سال'], [480, 'دو سال'],
];
export const IV_METHODS = [
  ['cm', 'افق ثابت'],
  ['front', 'نزدیک‌ترین سررسید'],
];
export const IV_PRICE_BASES = [
  ['close', 'قیمت پایانی'],
  ['last', 'آخرین معامله'],
];

export const VOL_DEFAULTS = {
  method: 'cm',
  targetDays: 30,       // افق شاخص، روز تقویمی
  bandPct: 15,          // فاصلهٔ مجاز اعمال از پایه برای «در پول»
  minDte: 7,            // سررسیدِ زیر یک هفته تلاطمِ ناپایدار می‌دهد
  maxDte: 200,
  priceBasis: 'close',
  lookback: 240,
  minSamples: 20,
  hvWindow: 20,         // ≈ ۳۰ روز تقویمی؛ هم‌افق با شاخص
  hvWindows: [10, 20, 30, 60],
  coneWindows: [10, 20, 30, 60, 90, 120],
  jumpCut: 0.2,         // بازده لگاریتمیِ بزرگ‌تر = تعدیل (افزایش سرمایه، سود نقدی)
};

/** پارامترهای مؤثر: پیش‌فرض‌ها + انتخاب کاربر، با کران. */
export function volParams(over = {}) {
  const p = { ...VOL_DEFAULTS, ...over };
  const clamp = (value, lo, hi, fallback) => {
    const v = finite(value);
    return isNum(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  };
  return {
    ...p,
    method: IV_METHODS.some(([id]) => id === p.method) ? p.method : VOL_DEFAULTS.method,
    priceBasis: IV_PRICE_BASES.some(([id]) => id === p.priceBasis) ? p.priceBasis : VOL_DEFAULTS.priceBasis,
    targetDays: clamp(p.targetDays, 7, 365, VOL_DEFAULTS.targetDays),
    bandPct: clamp(p.bandPct, 1, 60, VOL_DEFAULTS.bandPct),
    minDte: clamp(p.minDte, 1, 60, VOL_DEFAULTS.minDte),
    maxDte: clamp(p.maxDte, 30, 1000, VOL_DEFAULTS.maxDte),
    lookback: Math.trunc(clamp(p.lookback, 10, 2000, VOL_DEFAULTS.lookback)),
    minSamples: Math.trunc(clamp(p.minSamples, 3, 500, VOL_DEFAULTS.minSamples)),
    hvWindow: Math.trunc(clamp(p.hvWindow, 5, 250, VOL_DEFAULTS.hvWindow)),
    jumpCut: clamp(p.jumpCut, 0.05, 2, VOL_DEFAULTS.jumpCut),
  };
}

// ═══════════════════ تلاطم ضمنی یک قرارداد در یک روز ═══════════════════

/**
 * تلاطم ضمنیِ یک مشاهده، بر حسب درصد.
 *
 * `settings` همان تنظیمات برنامه است (`rFree`، `divYield`، `dayCountYear`،
 * `ivLo`، `ivHi`) تا عددِ این تب با تلاطمِ زنجیره و رصد یونانی یکی باشد.
 */
export function observationIv(obs, spot, date, settings = {}) {
  const kind = obs?.kind === 'put' ? 'put' : obs?.kind === 'call' ? 'call' : null;
  const price = finite(obs?.price), strike = finite(obs?.strike), S = finite(spot);
  const dte = daysBetween(date, obs?.expiry);
  const yearDays = finite(settings.dayCountYear) > 0 ? finite(settings.dayCountYear) : 365;
  if (!kind || !(price > 0) || !(strike > 0) || !(S > 0) || !(dte > 0)) return { ivPct: NaN, dte, why: 'input' };
  const r = isNum(finite(settings.rFree)) ? finite(settings.rFree) : 0;
  const q = isNum(finite(settings.divYield)) ? finite(settings.divYield) : 0;
  const { iv, why } = impliedVolWhy(kind, price, S, strike, dte / yearDays, r, q, {
    lo: finite(settings.ivLo) > 0 ? finite(settings.ivLo) : 0.01,
    hi: finite(settings.ivHi) > 0 ? finite(settings.ivHi) : 5,
  });
  return { ivPct: isNum(iv) ? iv * 100 : NaN, dte, why };
}

/**
 * تلاطم «در پول» یک سررسید: درون‌یابی روی قیمت پایه.
 *
 * `rows`: مشاهده‌های همان سررسید با `ivPct` حل‌شده. هر اعمال یک تلاطم
 * می‌گیرد (میانگین کال و پوتِ حل‌شده‌اش). نزدیک‌ترین اعمالِ زیر و بالای
 * پایه درون‌یابی می‌شوند؛ اگر فقط یک سمت در باند بود، همان — با پرچم
 * `oneSided`، چون چولگی آن را از تلاطم واقعیِ در پول دور می‌کند.
 */
export function expiryAtmIv(rows = [], spot, bandPct = VOL_DEFAULTS.bandPct, target = spot) {
  const S = finite(spot);
  // `target` قیمت اعمالی است که تلاطمش خواسته شده — پیش‌فرض خودِ پایه (در
  // پول). مسیر درون‌روزی با `۱٫۱ × پایه` چولگی را از همین می‌گیرد.
  const X = finite(target);
  const byStrike = new Map();
  for (const row of rows) {
    if (!isNum(row?.ivPct)) continue;
    const K = finite(row.strike);
    if (!(K > 0) || !(S > 0) || Math.abs(K / S - 1) * 100 > bandPct) continue;
    if (!byStrike.has(K)) byStrike.set(K, { strike: K, values: [], kinds: new Set() });
    const entry = byStrike.get(K);
    entry.values.push(row.ivPct);
    entry.kinds.add(row.kind);
  }
  const strikes = [...byStrike.values()]
    .map((s) => ({ strike: s.strike, ivPct: mean(s.values), count: s.values.length, kinds: [...s.kinds] }))
    .sort((a, b) => a.strike - b.strike);
  if (!strikes.length) return { ivPct: NaN, why: 'noAtm', strikes: [], used: 0, oneSided: false };
  const below = [...strikes].reverse().find((s) => s.strike <= X);
  const above = strikes.find((s) => s.strike >= X);
  if (below && above) {
    const ivPct = below.strike === above.strike
      ? below.ivPct
      : below.ivPct + ((X - below.strike) / (above.strike - below.strike)) * (above.ivPct - below.ivPct);
    const used = below.strike === above.strike ? below.count : below.count + above.count;
    return { ivPct, why: 'ok', strikes: [below.strike, above.strike], used, oneSided: false };
  }
  const one = below || above;
  return { ivPct: one.ivPct, why: 'ok', strikes: [one.strike], used: one.count, oneSided: true };
}

/**
 * شاخص تلاطم ضمنی یک روز.
 *
 * `observations`: `[{ kind, strike, expiry, price, traded }]` — فقط
 * معامله‌شده‌ها حساب می‌شوند. خروجی ساختار زمانیِ همان روز (`term`) را هم
 * دارد، چون همان محاسبه آن را می‌سازد و نمودارش رایگان است.
 */
export function ivIndexOfDay({ date, spot, observations = [] } = {}, params = {}, settings = {}) {
  const p = volParams(params);
  const day = normalizeHistoryDate(date);
  const S = finite(spot);
  const empty = (why) => ({ date: day, spot: S, ivPct: NaN, why, term: [], used: 0, expiries: [], flags: [] });
  if (!(S > 0)) return empty('noSpot');
  const traded = observations.filter((obs) => obs && obs.traded !== false && finite(obs.price) > 0);
  if (!traded.length) return empty('noTrades');

  const byExpiry = new Map();
  for (const obs of traded) {
    const expiry = normalizeHistoryDate(obs.expiry);
    const dte = daysBetween(day, expiry);
    if (!(dte >= p.minDte) || dte > p.maxDte) continue;
    const { ivPct } = observationIv({ ...obs, expiry }, S, day, settings);
    if (!byExpiry.has(expiry)) byExpiry.set(expiry, []);
    byExpiry.get(expiry).push({ ...obs, expiry, dte, ivPct });
  }
  const term = [...byExpiry.entries()]
    .map(([expiry, rows]) => {
      const atm = expiryAtmIv(rows, S, p.bandPct);
      return { expiry, dte: rows[0].dte, ivPct: atm.ivPct, strikes: atm.strikes, used: atm.used, oneSided: atm.oneSided, contracts: rows.length };
    })
    .sort((a, b) => a.dte - b.dte);
  const usable = term.filter((row) => isNum(row.ivPct));
  if (!usable.length) return { ...empty('noAtm'), term };

  if (p.method === 'front') {
    const front = usable[0];
    return {
      date: day, spot: S, ivPct: front.ivPct, why: 'ok', term, method: 'front',
      expiries: [front.expiry], dte: front.dte, used: front.used,
      flags: front.oneSided ? ['oneSided'] : [],
    };
  }

  const T = p.targetDays;
  const lower = [...usable].reverse().find((row) => row.dte <= T);
  const upper = usable.find((row) => row.dte >= T);
  if (lower && upper && lower.expiry !== upper.expiry) {
    const cm = interpolateVariance(lower.ivPct, lower.dte, upper.ivPct, upper.dte, T);
    if (Number.isFinite(cm)) {
      return {
        date: day, spot: S, ivPct: cm, why: 'ok', term, method: 'cm',
        expiries: [lower.expiry, upper.expiry], dte: T, used: lower.used + upper.used,
        flags: [lower, upper].some((row) => row.oneSided) ? ['oneSided'] : [],
      };
    }
  }
  // افق هدف بین دو سررسید نیفتاد: نزدیک‌ترین سررسید به افق، با پرچم.
  const nearest = [...usable].sort((a, b) => Math.abs(a.dte - T) - Math.abs(b.dte - T))[0];
  return {
    date: day, spot: S, ivPct: nearest.ivPct, why: 'ok', term, method: 'cm',
    expiries: [nearest.expiry], dte: nearest.dte, used: nearest.used,
    flags: ['nearestExpiry', ...(nearest.oneSided ? ['oneSided'] : [])],
  };
}

/**
 * درون‌یابی واریانس×زمان بین دو سررسید، در افق `T`.
 *
 * واحد زمان آزاد است (روز تقویمی در شاخص روزانه، سال در مسیر درون‌روزی) —
 * فقط باید هر سه یکی باشند. واریانسِ کل نامثبت، نامعلوم است.
 */
export function interpolateVariance(iv1, t1, iv2, t2, T) {
  const v1 = (iv1 / 100) ** 2 * t1;
  const v2 = (iv2 / 100) ** 2 * t2;
  const vT = v1 + ((v2 - v1) * (T - t1)) / (t2 - t1);
  return vT > 0 && T > 0 ? Math.sqrt(vT / T) * 100 : NaN;
}

export const IV_INDEX_WHY = {
  ok: '',
  noSpot: 'قیمت پایانی پایه نبود',
  noTrades: 'هیچ قراردادی معامله نشد',
  noAtm: 'قرارداد معامله‌شده‌ای نزدیک قیمت پایه نبود یا تلاطمش حل نشد',
  noPanel: 'دادهٔ قیمت قراردادهای آن روز هنوز گرفته نشده',
  outOfRange: 'بیرون از بازهٔ دریافت',
};

export const IV_INDEX_FLAGS = {
  oneSided: 'فقط یک سمتِ قیمت پایه اعمال معامله‌شده داشت',
  nearestExpiry: 'افق هدف بین دو سررسید نیفتاد؛ نزدیک‌ترین سررسید به‌کار رفت',
};

// ═══════════════════ رتبه و صدک ═══════════════════

/**
 * IVR و IVP یک روز از سری (هر مقدارِ نامعلوم `NaN`).
 *
 * بازه = `lookback` روزِ معاملاتیِ منتهی به همان روز. کمینه و بیشینه روی کل
 * بازه با خودِ امروز؛ صدک فقط روی روزهای **پیش** از امروز، تا امروز با
 * خودش مقایسه نشود.
 */
export function volRank(values = [], index = values.length - 1, { lookback = VOL_DEFAULTS.lookback, minSamples = VOL_DEFAULTS.minSamples } = {}) {
  const current = finite(values[index]);
  const start = Math.max(0, index - lookback + 1);
  const span = index - start + 1;
  const window = values.slice(start, index + 1).map(finite).filter(isNum);
  const prior = values.slice(start, index).map(finite).filter(isNum);
  const base = {
    current, samples: window.length, span, lookback,
    coverage: span > 0 ? (window.length / span) * 100 : NaN,
    full: span >= lookback,
    min: window.length ? Math.min(...window) : NaN,
    max: window.length ? Math.max(...window) : NaN,
  };
  if (!isNum(current)) return { ...base, ivr: NaN, ivp: NaN, why: 'امروز مقدار معتبری ندارد' };
  if (window.length < minSamples) {
    return { ...base, ivr: NaN, ivp: NaN, why: `در بازه ${faInt(window.length)} روز معتبر هست؛ دست‌کم ${faInt(minSamples)} لازم است` };
  }
  const ivr = base.max > base.min ? ((current - base.min) / (base.max - base.min)) * 100 : NaN;
  const ivp = prior.length ? (prior.filter((value) => value < current).length / prior.length) * 100 : NaN;
  return { ...base, ivr, ivp, why: isNum(ivr) ? '' : 'کمینه و بیشینهٔ بازه یکی است' };
}

/** همان رتبه، برای همهٔ روزها — مسیر IVR و IVP روی نمودار. */
export function volRankSeries(values = [], options = {}) {
  return values.map((_, index) => volRank(values, index, options));
}

/** جایگاه یک عدد در یک فهرست: درصد مقادیرِ کوچک‌تر. */
export function percentileOf(list = [], value) {
  const v = finite(value);
  const known = list.map(finite).filter(isNum);
  if (!isNum(v) || !known.length) return NaN;
  return (known.filter((x) => x < v).length / known.length) * 100;
}

/** چندک با درون‌یابی خطی. */
export function quantile(list = [], q) {
  const sorted = list.map(finite).filter(isNum).sort((a, b) => a - b);
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// ═══════════════════ تلاطم تاریخی ═══════════════════

/**
 * بازده لگاریتمی روزانه، هم‌ترتیب با ردیف‌ها.
 *
 * بازدهِ بزرگ‌تر از `jumpCut` کنار می‌رود: دامنهٔ نوسان روزانهٔ بورس تهران
 * چند درصد است، پس جهشِ بزرگ‌تر تعدیل قیمت (افزایش سرمایه، سود نقدی) است
 * نه نوسان — و یک تعدیل، تلاطم یک ماه را چند برابر نشان می‌دهد.
 */
export function logReturns(closes = [], jumpCut = VOL_DEFAULTS.jumpCut) {
  const out = new Array(closes.length).fill(NaN);
  let jumps = 0;
  for (let i = 1; i < closes.length; i += 1) {
    const a = finite(closes[i - 1]), b = finite(closes[i]);
    if (!(a > 0) || !(b > 0)) continue;
    const r = Math.log(b / a);
    if (Math.abs(r) > jumpCut) { jumps += 1; continue; }
    out[i] = r;
  }
  return { returns: out, jumps };
}

/** انحراف معیار نمونه‌ای سالانه‌شده، درصد. */
function annualStd(values, tdy) {
  if (values.length < 2) return NaN;
  const m = mean(values);
  const v = values.reduce((sum, x) => sum + (x - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(v) * Math.sqrt(tdy) * 100;
}

/**
 * تلاطم تاریخی غلتان (پایانی به پایانی)، هم‌ترتیب با ردیف‌ها.
 *
 * هر نقطه از `window` بازدهِ آخر ساخته می‌شود و دست‌کم ۸۰٪ آن‌ها باید معتبر
 * باشند (بازدهِ تعدیلی کنار رفته). پنجرهٔ پرنشده `NaN` است، نه پنجرهٔ کوتاه‌تر.
 */
export function rollingHv(returns = [], window = 20, tdy = 240) {
  const out = new Array(returns.length).fill(NaN);
  const need = Math.max(2, Math.ceil(window * 0.8));
  for (let i = window; i < returns.length; i += 1) {
    const slice = returns.slice(i - window + 1, i + 1).filter(isNum);
    if (slice.length >= need) out[i] = annualStd(slice, tdy);
  }
  return out;
}

/**
 * تلاطم پارکینسون (بیشینه و کمینهٔ روز)، غلتان.
 *
 * دامنهٔ روز اطلاعاتِ بیشتری از یک پایانی دارد، پس با پنجرهٔ کوتاه‌تر هم
 * پایدارتر است. روزی که کمینه یا بیشینه ندارد کنار می‌رود.
 */
export function rollingParkinson(rows = [], window = 20, tdy = 240) {
  const x = rows.map((row) => {
    const h = finite(row?.high), l = finite(row?.low);
    return h > 0 && l > 0 && h >= l ? Math.log(h / l) ** 2 : NaN;
  });
  const out = new Array(rows.length).fill(NaN);
  const need = Math.max(2, Math.ceil(window * 0.8));
  for (let i = window - 1; i < rows.length; i += 1) {
    const slice = x.slice(i - window + 1, i + 1).filter(isNum);
    if (slice.length >= need) out[i] = Math.sqrt((mean(slice) / (4 * Math.LN2)) * tdy) * 100;
  }
  return out;
}

/**
 * تلاطم تحقق‌یافتهٔ **بعدی**: از فردای هر روز تا `horizon` روز بعد.
 *
 * این عدد در آن روز معلوم نبود؛ فقط برای قضاوت گذشته است: «تلاطمی که بازار
 * آن روز قیمت داد، در عمل گران درآمد یا ارزان؟» روزهای آخر سری، چون آینده‌شان
 * هنوز نیامده، `NaN` می‌مانند.
 */
export function forwardRealized(returns = [], horizon = 20, tdy = 240) {
  const out = new Array(returns.length).fill(NaN);
  const need = Math.max(2, Math.ceil(horizon * 0.8));
  for (let i = 0; i + horizon < returns.length; i += 1) {
    const slice = returns.slice(i + 1, i + horizon + 1).filter(isNum);
    if (slice.length >= need) out[i] = annualStd(slice, tdy);
  }
  return out;
}

/**
 * مخروط تلاطم: برای هر پنجره، توزیع تلاطم تاریخیِ کل سری و جای امروز.
 *
 * پاسخ می‌دهد «تلاطم ۲۰ روزهٔ امروز برای این نماد زیاد است یا کم؟» — و
 * تلاطم ضمنی را می‌شود روی همان محور گذاشت.
 */
export function volCone(returns = [], windows = VOL_DEFAULTS.coneWindows, tdy = 240) {
  return windows.map((window) => {
    const series = rollingHv(returns, window, tdy);
    const known = series.filter(isNum);
    let current = NaN;
    for (let i = series.length - 1; i >= 0; i -= 1) { if (isNum(series[i])) { current = series[i]; break; } }
    return {
      window, samples: known.length,
      min: known.length ? Math.min(...known) : NaN,
      p10: quantile(known, 0.1), p25: quantile(known, 0.25), p50: quantile(known, 0.5),
      p75: quantile(known, 0.75), p90: quantile(known, 0.9),
      max: known.length ? Math.max(...known) : NaN,
      current, currentPct: percentileOf(known, current),
    };
  });
}

// ═══════════════════ وضعیت ═══════════════════

/**
 * پنج پله، از صدک (IVP) — نه از IVR، چون صدک از یک جهش تک‌روزه کشیده
 * نمی‌شود. متن هر پله خوانشِ رایج معامله‌گران است، نه توصیهٔ معامله.
 */
export const VOL_REGIMES = [
  { id: 'very-low', max: 20, label: 'بسیار ارزان', tone: 'cool',
    text: 'تلاطم ضمنی نزدیک کفِ بازه است و پریمیوم ارزان. خوانش رایج: خرید اختیار و استراتژی‌های بدهکار کم‌هزینه‌ترند — ولی تلاطم پایین می‌تواند مدتی پایین بماند.' },
  { id: 'low', max: 40, label: 'ارزان', tone: 'cool',
    text: 'تلاطم ضمنی زیر میانهٔ بازه است. خرید پریمیوم نسبتاً ارزان است؛ فروش پریمیوم پاداش کمتری از معمول می‌دهد.' },
  { id: 'mid', max: 60, label: 'میانه', tone: 'neutral',
    text: 'تلاطم ضمنی در میانهٔ بازهٔ خودش است؛ این سنجه به‌تنهایی برتری روشنی برای خرید یا فروش پریمیوم نمی‌دهد.' },
  { id: 'high', max: 80, label: 'گران', tone: 'hot',
    text: 'تلاطم ضمنی بالای میانهٔ بازه است و پریمیوم گران. خوانش رایج: فروش پریمیوم (کاورد کال، اسپرد بستانکار) جذاب‌تر است؛ خرید اختیار گران‌تر از معمول تمام می‌شود.' },
  { id: 'very-high', max: Infinity, label: 'بسیار گران', tone: 'hot',
    text: 'تلاطم ضمنی نزدیک سقفِ بازه است — معمولاً پس از خبر یا حرکت شدید. بازگشت به میانگین محتمل است ولی زمانش نه؛ فروش پریمیوم اینجا ریسکِ دمِ بزرگ دارد.' },
];

export function volRegime(ivp, ivr = NaN) {
  const v = finite(ivp);
  if (!isNum(v)) return { id: 'unknown', label: 'نامعلوم', tone: 'neutral', text: 'برای قضاوت، صدک تلاطم ضمنی لازم است و ساخته نشد.', divergence: '' };
  const level = VOL_REGIMES.find((row) => v < row.max) || VOL_REGIMES.at(-1);
  const r = finite(ivr);
  const divergence = isNum(r) && Math.abs(r - v) >= 25
    ? (r < v
      ? 'IVR خیلی کمتر از IVP است: یک جهشِ دور در بازه سقف را بالا کشیده؛ صدک تصویر دقیق‌تری می‌دهد.'
      : 'IVR خیلی بیشتر از IVP است: دامنهٔ بازه تنگ بوده و امروز نزدیک سقفِ کوتاهش است.')
    : '';
  return { ...level, divergence };
}

// ═══════════════════ سرهم‌کردن ═══════════════════

/**
 * مشاهده‌های هر روز، از پاسخ `/api/vol/history`.
 *
 * `contracts`: `[{ ins, kind, strike, expiry }]` · `panels`:
 * `{ [روز]: { [ins]: [close, last, vol, trades, value, low, high] } }`.
 * قراردادِ بی‌معامله‌ی آن روز (حجم و تعداد صفر) `traded: false` می‌گیرد.
 */
export const PANEL_COLUMNS = ['close', 'last', 'vol', 'trades', 'value', 'low', 'high'];

export function panelObservations(contracts = [], panels = {}, priceBasis = 'close') {
  const byIns = new Map(contracts.map((c) => [String(c.ins), c]));
  const out = new Map();
  for (const [day, row] of Object.entries(panels || {})) {
    const date = normalizeHistoryDate(day);
    if (!date) continue;
    const obs = [];
    for (const [ins, values] of Object.entries(row || {})) {
      const c = byIns.get(String(ins));
      if (!c || !Array.isArray(values)) continue;
      const [close, last, vol, trades] = values.map(finite);
      const price = priceBasis === 'last' ? last : close;
      obs.push({
        ins: String(ins), kind: c.kind, strike: finite(c.strike), expiry: normalizeHistoryDate(c.expiry),
        price, traded: (vol > 0) || (trades > 0),
      });
    }
    out.set(date, obs);
  }
  return out;
}

/** مشاهده‌های امروز از تابلوی زنده (`payload.universe.contracts`). */
export function liveObservations(contracts = [], uaIns, priceBasis = 'close') {
  return contracts
    .filter((c) => String(c.uaIns) === String(uaIns) && (c.kind === 'call' || c.kind === 'put'))
    .map((c) => ({
      ins: String(c.ins), kind: c.kind, strike: finite(c.strike), expiry: normalizeHistoryDate(c.endDate),
      price: priceBasis === 'last' ? finite(c.tradeLast) : finite(c.close),
      traded: finite(c.volume) > 0,
    }));
}

/**
 * کل تاریخچه: هر روزِ معاملاتیِ پایه یک ردیف.
 *
 * `baseRows`: سری روزانهٔ پایه (`date`، `close`، `high`، `low`) — تلاطم
 * تاریخی از همین است، با کل عمقش. `observations`: نقشهٔ روز → مشاهده‌ها؛ روزی
 * که در نقشه نیست «دادهٔ قراردادها گرفته نشده» است، نه «معامله نشد».
 * `live`: `{ date, spot, observations }` امروز، که ردیف آخر را می‌سازد.
 */
export function buildVolHistory({
  baseRows = [], observations = new Map(), live = null, from = 0, params = {}, settings = {},
} = {}) {
  const p = volParams(params);
  const tdy = finite(settings.tradingDaysYr) > 0 ? finite(settings.tradingDaysYr) : 240;
  const byDate = new Map();
  for (const row of baseRows) {
    const date = normalizeHistoryDate(row?.date);
    const close = finite(row?.close);
    if (date && close > 0) byDate.set(date, { date, close, high: finite(row.high), low: finite(row.low) });
  }
  if (live && normalizeHistoryDate(live.date) && finite(live.spot) > 0) {
    const date = normalizeHistoryDate(live.date);
    const prev = byDate.get(date);
    byDate.set(date, { date, close: finite(live.spot), high: prev?.high ?? NaN, low: prev?.low ?? NaN, live: true });
  }
  const base = [...byDate.values()].sort((a, b) => a.date - b.date);
  const { returns, jumps } = logReturns(base.map((row) => row.close), p.jumpCut);
  const hv = Object.fromEntries([...new Set([...p.hvWindows, p.hvWindow])].map((w) => [w, rollingHv(returns, w, tdy)]));
  const park = rollingParkinson(base, p.hvWindow, tdy);
  const fwd = forwardRealized(returns, p.hvWindow, tdy);
  const fromDay = normalizeHistoryDate(from) || 0;

  const rows = base.map((row, index) => {
    let index_ = null;
    if (row.live && live) {
      index_ = ivIndexOfDay({ date: row.date, spot: row.close, observations: live.observations }, p, settings);
    } else if (observations.has(row.date)) {
      index_ = ivIndexOfDay({ date: row.date, spot: row.close, observations: observations.get(row.date) }, p, settings);
    }
    const ivPct = index_ ? index_.ivPct : NaN;
    const hvMatch = hv[p.hvWindow][index];
    return {
      date: row.date, spot: row.close, live: Boolean(row.live),
      ivPct, why: index_ ? index_.why : (row.date >= fromDay ? 'noPanel' : 'outOfRange'),
      flags: index_?.flags || [], expiries: index_?.expiries || [], used: index_?.used || 0,
      term: index_?.term || [],
      hv: Object.fromEntries(Object.entries(hv).map(([w, series]) => [w, series[index]])),
      hvMatch, parkinson: park[index], fwdRv: fwd[index],
      spread: isNum(ivPct) && isNum(hvMatch) ? ivPct - hvMatch : NaN,
      ratio: isNum(ivPct) && hvMatch > 0 ? ivPct / hvMatch : NaN,
      fwdEdge: isNum(ivPct) && isNum(fwd[index]) ? ivPct - fwd[index] : NaN,
      returnPct: isNum(returns[index]) ? returns[index] * 100 : NaN,
    };
  });

  const ivSeries = rows.map((row) => row.ivPct);
  const hvSeries = rows.map((row) => row.hvMatch);
  const ranks = volRankSeries(ivSeries, p);
  const hvRanks = volRankSeries(hvSeries, p);
  rows.forEach((row, index) => {
    row.ivr = ranks[index].ivr;
    row.ivp = ranks[index].ivp;
    row.hvr = hvRanks[index].ivr;
    row.hvp = hvRanks[index].ivp;
  });

  // روزِ «حالا»: آخرین ردیفی که شاخص دارد.
  let currentIndex = -1;
  for (let i = rows.length - 1; i >= 0; i -= 1) { if (isNum(rows[i].ivPct)) { currentIndex = i; break; } }
  const current = currentIndex >= 0 ? rows[currentIndex] : null;
  const rank = currentIndex >= 0 ? ranks[currentIndex] : volRank([], -1, p);
  const hvRank = volRank(hvSeries, rows.length - 1, p);
  const inRange = rows.filter((row) => row.date >= fromDay);
  const ivKnown = inRange.map((row) => row.ivPct).filter(isNum);
  const panelDays = inRange.filter((row) => row.why !== 'noPanel').length;
  const fwdPairs = rows.filter((row) => isNum(row.fwdEdge));
  return {
    version: VOL_RANK_VERSION, params: p, tradingDaysYear: tdy,
    rows, currentIndex, current,
    rank, hvRank,
    regime: volRegime(rank.ivp, rank.ivr),
    hvNow: hvSeries.at(-1), parkinsonNow: park.at(-1),
    spreadNow: current ? current.spread : NaN,
    ratioNow: current ? current.ratio : NaN,
    stats: {
      days: inRange.length, panelDays, ivDays: ivKnown.length,
      coverage: inRange.length ? (ivKnown.length / inRange.length) * 100 : NaN,
      min: ivKnown.length ? Math.min(...ivKnown) : NaN,
      max: ivKnown.length ? Math.max(...ivKnown) : NaN,
      mean: mean(ivKnown), median: quantile(ivKnown, 0.5),
      jumps,
      // تلاطم ضمنی در گذشته معمولاً گران‌تر از تحقق‌یافتهٔ بعدی بوده یا ارزان‌تر؟
      fwdSamples: fwdPairs.length,
      fwdEdgeMean: mean(fwdPairs.map((row) => row.fwdEdge)),
      fwdRichPct: fwdPairs.length ? (fwdPairs.filter((row) => row.fwdEdge > 0).length / fwdPairs.length) * 100 : NaN,
    },
    cone: volCone(returns, p.coneWindows, tdy),
    term: current ? current.term : [],
  };
}

// ═══════════════════ بازهٔ دریافت و رابطه‌ها ═══════════════════

/**
 * بازهٔ تقویمیِ لازم برای `lookback` روز معاملاتی، تا دیروز.
 *
 * پنج روز معاملاتی در هفته به‌اضافهٔ تعطیلات رسمی: ۱٫۵ برابر، با ده روز
 * حاشیه. کم‌گرفتن یعنی بازهٔ رتبه بی‌صدا کوتاه‌تر از خواسته؛ زیادگرفتن فقط
 * چند پروندهٔ روزانهٔ بیشتر است.
 */
export function volRangeFor(lookback, today) {
  const end = dateUtc(today);
  if (!end) return null;
  const back = Math.ceil(Math.max(10, Number(lookback) || VOL_DEFAULTS.lookback) * 1.5) + 10;
  const compact = (d) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  return { from: compact(new Date(end.getTime() - back * 86400000)), to: compact(end) };
}

/** همبستگی پیرسون؛ با کمتر از ۵ جفت معتبر، نامعلوم. */
export function pearson(xs = [], ys = []) {
  const pairs = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i += 1) {
    const x = finite(xs[i]), y = finite(ys[i]);
    if (isNum(x) && isNum(y)) pairs.push([x, y]);
  }
  if (pairs.length < 5) return { r: NaN, n: pairs.length };
  const mx = mean(pairs.map((p) => p[0])), my = mean(pairs.map((p) => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  return { r: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN, n: pairs.length };
}

/** سنجه‌هایی که رابطه‌شان سنجیده می‌شود — هر کدام خواننده‌ای روی ردیف. */
export const VOL_RELATIONS = [
  ['ivPct', 'IV شاخص', (row) => row.ivPct],
  ['hv10', 'HV ۱۰ روزه', (row) => row.hv?.[10]],
  ['hv20', 'HV ۲۰ روزه', (row) => row.hv?.[20]],
  ['hv60', 'HV ۶۰ روزه', (row) => row.hv?.[60]],
  ['parkinson', 'پارکینسون', (row) => row.parkinson],
  ['ivr', 'IVR', (row) => row.ivr],
  ['ivp', 'IVP', (row) => row.ivp],
  ['spread', 'IV − HV', (row) => row.spread],
  ['fwdRv', 'تحقق‌یافتهٔ بعدی', (row) => row.fwdRv],
  ['absReturn', 'قدر مطلق بازده روز', (row) => (isNum(row.returnPct) ? Math.abs(row.returnPct) : NaN)],
];

/**
 * ماتریس همبستگی سنجه‌های تلاطم، روی سطح یا روی تغییر روزانه.
 *
 * سطحِ دو سری کندحرکت تقریباً همیشه همبسته درمی‌آید (هر دو با هم بالا و
 * پایین می‌روند)؛ تغییرِ روزانه نشان می‌دهد آیا **با هم** تکان می‌خورند.
 */
export function volCorrelation(rows = [], { changes = false, keys = VOL_RELATIONS.map(([key]) => key) } = {}) {
  const defs = VOL_RELATIONS.filter(([key]) => keys.includes(key));
  const series = defs.map(([, , read]) => {
    const raw = rows.map((row) => finite(read(row)));
    return changes ? raw.map((v, i) => (i && isNum(v) && isNum(raw[i - 1]) ? v - raw[i - 1] : NaN)) : raw;
  });
  return {
    keys: defs.map(([key]) => key),
    labels: defs.map(([, label]) => label),
    matrix: series.map((a) => series.map((b) => pearson(a, b))),
  };
}
