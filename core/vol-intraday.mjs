// تلاطم ضمنیِ درون‌روزی — شاخص یک لحظه، سری قراردادها، دانه‌ها و مقایسه‌ها.
//
// ادامهٔ `core/vol-rank.mjs` (شاخص روزانه از قیمت پایانی)، نه جایگزینش. همان
// تکه‌ها به کار می‌روند — درون‌یابی در پول (`expiryAtmIv`) و درون‌یابی
// واریانس×زمان (`interpolateVariance`) — ولی:
//
//   • زمان از `core/vol-clock.mjs` می‌آید (پیش‌فرض ثانیهٔ معاملاتی)، نه روز
//     تقویمی صحیح؛ وگرنه تلاطم در طول روز سراشیبیِ ساختگی می‌گیرد.
//   • قیمت قرارداد میانهٔ مظنه است (`core/moment-quote.mjs`)، با جایگزینِ
//     برچسب‌دارِ آخرین معامله.
//   • پیش‌فرض فقط سمتِ خارج از پول وارد می‌شود: کال‌های بالای پایه و
//     پوت‌های زیرش. با نرخ سراسری ۳۰٪، کالِ در پول اغلب زیر کف نظری
//     می‌افتد و تلاطمش حل نمی‌شود — یا بدتر، عددی ناپایدار می‌دهد.
//   • پایه در صف یا توقف: شاخص آن لحظه ساخته نمی‌شود (قیمت پایه آن لحظه
//     قیمتِ قابل معامله نیست). دامنهٔ نامعلوم = «نامعلوم»، نه «عادی».
//
// هیچ عددی ساخته نمی‌شود: لحظهٔ بی‌مظنه، مظنهٔ کهنه و پایهٔ در صف خالی
// می‌مانند و علتشان گفته می‌شود. دانه‌های درشت از ریز **نمونه‌برداری**
// می‌شوند (آخرین مقدار معتبرِ سطل)، نه میانگین؛ شکاف درون‌یابی نمی‌شود.

import { impliedVolWhy, bsGreeks } from './bs.mjs';
import { volTime, volCalendar, volClockParams } from './vol-clock.mjs';
import { expiryAtmIv, interpolateVariance, quantile, percentileOf } from './vol-rank.mjs';
import { fitSmile } from './chain-compare.mjs';
import { momentsFor } from './intraday-grid.mjs';
import { normalizeHistoryDate } from './history.mjs';
import { quoteAt } from './moment-quote.mjs';
import { queueFromLimits, limitsAt } from './iv-record.mjs';

export const VOL_INTRADAY_VERSION = 1;

const n = (value) => {
  const out = Number(value);
  return value === null || value === undefined || value === '' || typeof value === 'boolean' || !Number.isFinite(out) ? NaN : out;
};
const isNum = (value) => Number.isFinite(value);
const clamp = (value, lo, hi, fallback) => (isNum(n(value)) ? Math.min(hi, Math.max(lo, n(value))) : fallback);
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : NaN);

export const INTRADAY_WHY = {
  ok: '',
  noBase: 'قیمت پایه در این لحظه نبود',
  staleBase: 'قیمت پایه کهنه‌تر از سقف بود',
  queue: 'پایه در صف یا توقف بود؛ قیمتش قابل معامله نبود',
  stale: 'همهٔ مظنه‌ها کهنه‌تر از سقف بودند',
  noAtm: 'قرارداد خارج از پولِ قیمت‌دار نزدیک پایه نبود یا تلاطمش حل نشد',
  noContracts: 'قراردادی در این لحظه نبود',
};

export const INTRADAY_FLAGS = {
  queueUnknown: 'وضعیت صف پایه نامعلوم (دامنهٔ مجاز آن روز را نداریم)',
  fallback: 'برای بعضی قراردادها آخرین معامله جای میانه نشست (جایگزین)',
  baseTrade: 'قیمت پایه آخرین معامله است، نه میانهٔ مظنه',
  oneSided: 'در پولِ یک سررسید فقط از یک سمتِ پایه ساخته شد',
  nearestExpiry: 'افق هدف بین دو سررسید نیفتاد؛ نزدیک‌ترین سررسید',
  assumedCalendar: 'تقویم آینده فرضی (data/holidays.json نیست)',
  staleDropped: 'مظنهٔ کهنه کنار رفت',
  baseAgeUnknown: 'زمان آخرین معاملهٔ پایه نامعلوم (ضبط پس از آغاز جلسه شروع شد)',
  rebuilt: 'بازسازی از ریزمعامله، نه ضبط زنده',
};

/** پارامترهای مسیر درون‌روزی: تنظیمات + انتخاب همان نما. */
export function intradayParams(settings = {}, over = {}) {
  return {
    ...volClockParams({ ...settings, ...over }),
    targetTradingDays: clamp(over.targetTradingDays ?? settings.volTargetTradingDays, 5, 120, 20),
    minTradingDays: clamp(over.minTradingDays, 1, 60, 5),
    bandPct: clamp(over.bandPct, 1, 60, 15),
    maxAgeSec: clamp(over.maxAgeSec ?? settings.volQuoteMaxAgeSec, 30, 7200, 900),
    side: over.side === 'both' ? 'both' : 'otm',
    atm: over.atm === 'smile' ? 'smile' : 'linear',
    priceBasis: over.priceBasis === 'trade' ? 'trade' : 'mid',
  };
}

/** یک بار برای هر محاسبه: تنظیمات، تقویم و پارامترها. */
export function intradayContext(settings = {}, { holidays = [], holidaysKnown = false, ...over } = {}) {
  const calendar = volCalendar({ settings, holidays, known: holidaysKnown });
  return { settings, calendar, session: calendar.session, params: intradayParams(settings, over) };
}

/** امضای پارامترها — کش نتیجه با تغییرش باطل می‌شود. */
export function intradaySignature(ctx) {
  const p = ctx.params, s = ctx.settings;
  return [VOL_INTRADAY_VERSION, p.basis, p.expiryMoment, p.offDayWeight, p.targetTradingDays, p.minTradingDays,
    p.bandPct, p.maxAgeSec, p.side, p.atm, p.priceBasis, n(s.rFree), n(s.divYield), n(s.tradingDaysYr), n(s.dayCountYear),
    ctx.calendar.holidays].join('|');
}

function solve(kind, price, S, K, years, settings) {
  if (!(price > 0) || !(years > 0)) return NaN;
  const { iv } = impliedVolWhy(kind, price, S, K, years, n(settings.rFree) || 0, n(settings.divYield) || 0, {
    lo: n(settings.ivLo) > 0 ? n(settings.ivLo) : 0.01, hi: n(settings.ivHi) > 0 ? n(settings.ivHi) : 5,
  });
  return isNum(iv) ? iv * 100 : NaN;
}

/**
 * تلاطم یک قرارداد در یک لحظه، از مظنهٔ همان لحظه.
 *
 * `obs`: `{ ins, kind, strike, expiry, quote }` که `quote` خروجی `quoteAt`
 * است. همان قیمت و همان زمان به `impliedVolWhy` می‌رود که موتور تلاطم پاها
 * — تفاوت فقط مبنای زمان است، که پارامتر است.
 *
 * ═══ نوار خرید و فروش فقط از مظنهٔ سالم ═══
 *
 * گزارش آزمون ۳۷۱۲e1a (بند ۴): دفترِ ۱۸۰۰ ثانیه‌ای کنار معاملهٔ تازه داده
 * شد. `quoteAt` دفتر را درست «کهنه» خواند و قیمت اصلی را از معامله گرفت،
 * ولی تلاطم خرید و فروش از همان دو قیمتِ کهنه ساخته شد (۴۴٫۴۴٪ تا ۷۵٫۴۶٪)
 * و نوارِ «اکنون» دو مظنهٔ منقضی را نشان داد. حالا IV خرید و فروش فقط وقتی
 * ساخته می‌شود که سلامت دفتر `ok` باشد: دوطرفه، نامتقاطع، مرتب و تازه.
 * تازگیِ معاملهٔ جایگزین اعتبار دفتر را برنمی‌گرداند.
 *
 * `opts.full = false` (درون شاخص) فقط تلاطم قیمت اصلی را حل می‌کند؛ خرید
 * و فروش برای قراردادهای واردِ شاخص بعداً با `contractBand` حل می‌شوند.
 * `opts.timeMemo` زمان تا سررسید را برای قراردادهای هم‌سررسیدِ یک لحظه
 * یک بار حساب می‌کند.
 */
export function contractIvAt(obs, base, at, ctx, { full = true, timeMemo = null } = {}) {
  const S = n(base?.price), K = n(obs?.strike);
  const kind = obs?.kind === 'put' ? 'put' : obs?.kind === 'call' ? 'call' : null;
  const p = ctx.params;
  let t = timeMemo?.get(obs?.expiry);
  if (!t) {
    t = volTime(at, obs?.expiry, { basis: p.basis, settings: ctx.settings, calendar: ctx.calendar, offDayWeight: p.offDayWeight, expiryMoment: p.expiryMoment });
    timeMemo?.set(obs?.expiry, t);
  }
  const q = obs?.quote || {};
  const out = {
    ins: String(obs?.ins ?? ''), kind, strike: K, expiry: normalizeHistoryDate(obs?.expiry),
    years: t.years, tradingDays: t.tradingSeconds / ctx.session.length,
    ivPct: NaN, ivMid: NaN, ivBid: NaN, ivAsk: NaN, ivTrade: NaN,
    priceSource: q.priceSource || '', quoteAge: NaN, why: '',
  };
  if (!kind || !(K > 0) || !(S > 0)) return { ...out, why: 'input' };
  if (!(t.years > 0)) return { ...out, why: t.why || 'expired' };
  out.ivPct = solve(kind, n(q.price), S, K, t.years, ctx.settings);
  // میانه همان قیمت اصلی است وقتی منبعش میانه است؛ دوباره حل نمی‌شود.
  if (q.priceSource === 'mid') out.ivMid = out.ivPct;
  else if (q.health === 'ok') out.ivMid = solve(kind, n(q.mid), S, K, t.years, ctx.settings);
  if (full) {
    contractBand(out, q, S, ctx);
    if (n(q.lastAge) <= p.maxAgeSec) out.ivTrade = solve(kind, n(q.last), S, K, t.years, ctx.settings);
  }
  out.quoteAge = q.priceSource === 'mid' ? n(q.bookAge) : n(q.lastAge);
  if (!isNum(out.ivPct)) out.why = q.why || (n(q.price) > 0 ? 'unsolved' : 'noQuote');
  return out;
}

/** IV خرید و فروش یک قرارداد — فقط از دفترِ سالم و تازه (`health === 'ok'`). */
export function contractBand(row, quote, spot, ctx) {
  if (quote?.health !== 'ok' || !(row.years > 0) || !row.kind) return row;
  row.ivBid = solve(row.kind, n(quote.bid), n(spot), row.strike, row.years, ctx.settings);
  row.ivAsk = solve(row.kind, n(quote.ask), n(spot), row.strike, row.years, ctx.settings);
  return row;
}

/**
 * شاخص تلاطم پایه در یک لحظه.
 *
 * `base`: `{ price, priceSource, ageSec, queue: { key, known } }`؛
 * `observations`: قراردادها با `quote`. خروجی: شاخص و نوار خرید تا فروش،
 * ساختار زمانی، چولگی (۱۱۰٪ پایه منهای در پول)، شیب زمانی (نزدیک منهای
 * بعدی)، و تلاطم و فاصله از لبخندِ **هر قرارداد** — همان گذر، رایگان.
 */
export function ivIndexAt({ at, base = {}, observations = [] } = {}, ctx, { detail = true } = {}) {
  const p = ctx.params;
  const S = n(base.price);
  const flags = new Set();
  if (ctx.calendar.assumed) flags.add('assumedCalendar');
  if (base.priceSource && base.priceSource !== 'mid') flags.add('baseTrade');
  const tdy = n(ctx.settings.tradingDaysYr) > 0 ? n(ctx.settings.tradingDaysYr) : 240;
  const empty = (why, extra = {}) => ({
    at, spot: S, ivPct: NaN, bidPct: NaN, askPct: NaN, why, flags: [...flags], term: [], contracts: [],
    used: 0, maxAge: NaN, skewPct: NaN, termSlope: NaN, basis: p.basis, rFree: n(ctx.settings.rFree), ...extra,
  });
  if (!(S > 0)) return empty('noBase');
  const queue = base.queue || null;
  if (queue && queue.known !== false && ['buyQueue', 'sellQueue', 'halted'].includes(queue.key)) return empty('queue', { queue: queue.key });
  if (queue && queue.known === false) flags.add('queueUnknown');
  if (n(base.ageSec) > p.maxAgeSec) return empty('staleBase');
  if (!observations.length) return empty('noContracts');

  const timeMemo = new Map();
  const contracts = observations.map((obs) => contractIvAt(obs, base, at, ctx, { full: detail, timeMemo }));
  const stale = observations.filter((obs) => obs?.quote?.why === 'stale').length;
  if (stale) flags.add('staleDropped');
  const inBand = (c) => Math.abs(c.strike / S - 1) * 100 <= p.bandPct;
  const sideOk = (c) => p.side === 'both' || (c.kind === 'call' ? c.strike >= S : c.strike <= S);
  const eligible = contracts.filter((c) => isNum(c.ivPct) && c.tradingDays >= p.minTradingDays && inBand(c) && sideOk(c));
  // بی جزئیات، نوار خرید و فروش فقط برای قراردادهای واردِ شاخص حل می‌شود.
  if (!detail) {
    const quoteOf = new Map(contracts.map((c, i) => [c, observations[i]?.quote]));
    for (const c of eligible) contractBand(c, quoteOf.get(c), S, ctx);
  }
  if (eligible.some((c) => c.priceSource === 'fallback')) flags.add('fallback');

  // ── لبخندِ هر سررسید: x = ln(K/S)، وزن وگا ──
  const byExpiry = new Map();
  for (const c of contracts) {
    if (!isNum(c.ivPct) || !(c.years > 0)) continue;
    if (!byExpiry.has(c.expiry)) byExpiry.set(c.expiry, []);
    byExpiry.get(c.expiry).push(c);
  }
  const smiles = new Map();
  for (const [expiry, rows] of byExpiry) {
    const pts = rows.filter((c) => sideOk(c)).map((c) => ({
      x: Math.log(c.strike / S), y: c.ivPct,
      w: bsGreeks(c.kind, S, c.strike, c.years, n(ctx.settings.rFree) || 0, n(ctx.settings.divYield) || 0, c.ivPct / 100).vega,
    }));
    const fit = fitSmile(pts);
    if (fit) smiles.set(expiry, fit);
  }
  for (const c of contracts) {
    const fit = smiles.get(c.expiry);
    c.smileResidual = fit && isNum(c.ivPct) ? c.ivPct - fit.at(Math.log(c.strike / S)) : NaN;
  }

  // ── در پولِ هر سررسید ──
  const groups = new Map();
  for (const c of eligible) {
    if (!groups.has(c.expiry)) groups.set(c.expiry, []);
    groups.get(c.expiry).push(c);
  }
  const atmOf = (rows, key, target = S) => expiryAtmIv(rows.map((c) => ({ strike: c.strike, kind: c.kind, ivPct: c[key] })), S, p.bandPct, target);
  const term = [...groups.entries()].map(([expiry, rows]) => {
    const fit = smiles.get(expiry);
    const linear = atmOf(rows, 'ivPct');
    const ivPct = p.atm === 'smile' && fit ? fit.at(0) : linear.ivPct;
    const skew = atmOf(rows, 'ivPct', S * 1.1);
    return {
      expiry, years: rows[0].years, tradingDays: rows[0].tradingDays, ivPct,
      bidPct: atmOf(rows, 'ivBid').ivPct, askPct: atmOf(rows, 'ivAsk').ivPct,
      skewPct: p.atm === 'smile' && fit ? fit.at(Math.log(1.1)) - fit.at(0) : (skew.oneSided === false && isNum(skew.ivPct) ? skew.ivPct - linear.ivPct : NaN),
      used: linear.used, oneSided: linear.oneSided, strikes: linear.strikes, contracts: rows.length,
      maxAge: Math.max(...rows.map((c) => (isNum(c.quoteAge) ? c.quoteAge : 0))),
    };
  }).sort((a, b) => a.years - b.years);
  const usable = term.filter((row) => isNum(row.ivPct));
  if (!usable.length) return empty(stale && !eligible.length ? 'stale' : 'noAtm', { contracts, term });

  // ── افق ثابت: درون‌یابی واریانس×زمان در همان مبنای زمان ──
  const T = p.targetTradingDays / tdy;
  const lower = [...usable].reverse().find((row) => row.years <= T);
  const upper = usable.find((row) => row.years >= T);
  let ivPct, bidPct, askPct, used, picked, skewRow;
  if (lower && upper && lower.expiry !== upper.expiry) {
    ivPct = interpolateVariance(lower.ivPct, lower.years, upper.ivPct, upper.years, T);
    bidPct = interpolateVariance(lower.bidPct, lower.years, upper.bidPct, upper.years, T);
    askPct = interpolateVariance(lower.askPct, lower.years, upper.askPct, upper.years, T);
    used = lower.used + upper.used;
    picked = [lower, upper];
    skewRow = Math.abs(lower.years - T) <= Math.abs(upper.years - T) ? lower : upper;
  } else {
    const nearest = [...usable].sort((a, b) => Math.abs(a.years - T) - Math.abs(b.years - T))[0];
    ({ ivPct, bidPct, askPct, used } = nearest);
    picked = [nearest];
    skewRow = nearest;
    flags.add('nearestExpiry');
  }
  if (picked.some((row) => row.oneSided)) flags.add('oneSided');
  return {
    at, spot: S, ivPct, bidPct, askPct, why: isNum(ivPct) ? 'ok' : 'noAtm',
    flags: [...flags], term, contracts,
    expiries: picked.map((row) => row.expiry), used,
    maxAge: Math.max(...picked.map((row) => row.maxAge)),
    skewPct: skewRow.skewPct,
    termSlope: usable.length >= 2 ? usable[0].ivPct - usable[1].ivPct : NaN,
    basis: p.basis, rFree: n(ctx.settings.rFree), targetYears: T,
  };
}

// ═══════════════════ سری‌ها، دانه‌ها و مقایسه‌ها ═══════════════════
//
// «نقطه» اینجا `{ second, value, ... }` است — ثانیه از نیمه‌شب تهران. هر
// سری یک روز است و به ترتیب ثانیه.

const valid = (points, key = 'value') => (points || []).filter((pt) => isNum(n(pt?.[key])));

/**
 * دانهٔ درشت از ریز: برای هر لحظهٔ پایانِ سطل، آخرین مقدار معتبرِ همان
 * سطل. اگر دقیقاً در پایان سطل مقدار هست همان است؛ وگرنه آخرینِ درونِ سطل با
 * `carried` و سنش. سطلِ خالی، خالی می‌ماند.
 */
export function sampleGrain(points = [], grain = 'm15', { key = 'value' } = {}) {
  const cuts = momentsFor(grain);
  const list = valid(points, key).slice().sort((a, b) => a.second - b.second);
  const out = [];
  let from = -Infinity, at = 0;
  for (const cut of cuts) {
    let last = null;
    while (at < list.length && list[at].second <= cut) {
      if (list[at].second > from) last = list[at];
      at += 1;
    }
    out.push(last
      ? { ...last, second: cut, at: last.second, carried: last.second !== cut, ageSec: cut - last.second }
      : { second: cut, [key]: NaN, at: NaN, carried: false, empty: true });
    from = cut;
  }
  return out;
}

/** نقطهٔ روزانهٔ مسیر درون‌روزی: آخرین لحظهٔ معتبر جلسه. */
export function dayClose(points = [], { key = 'value' } = {}) {
  const list = valid(points, key);
  return list.length ? list.reduce((a, b) => (b.second > a.second ? b : a)) : null;
}

/** «بازگشایی»: نخستین لحظهٔ معتبر پس از `skipSec` از آغاز جلسه. */
export function openPoint(points = [], { open = 32400, skipSec = 900, key = 'value' } = {}) {
  const list = valid(points, key).filter((pt) => pt.second >= open + skipSec).sort((a, b) => a.second - b.second);
  return list[0] || null;
}

/**
 * مقدار در یک ثانیه: دقیقاً همان، یا آخرینِ پیش از آن تا `carryMaxSec` با
 * برچسب «حمل‌شده» و سن. بیشتر از آن، هیچ — درون‌یابی نمی‌شود.
 */
export function valueAt(points = [], second, { carryMaxSec = 600, key = 'value' } = {}) {
  const list = valid(points, key).filter((pt) => pt.second <= second);
  if (!list.length) return null;
  const last = list.reduce((a, b) => (b.second > a.second ? b : a));
  const age = second - last.second;
  if (age > carryMaxSec) return null;
  return { ...last, carried: age > 0, ageSec: age };
}

/** آمار یک روز: باز، آخر، سقف، کف، دامنه، و جای «اکنون» در دامنه. */
export function dayStats(points = [], { key = 'value', open = 32400, skipSec = 900, nowSecond = Infinity } = {}) {
  const list = valid(points, key).filter((pt) => pt.second <= nowSecond);
  if (!list.length) return null;
  const first = openPoint(list, { open, skipSec, key }) || list[0];
  const last = list.reduce((a, b) => (b.second > a.second ? b : a));
  const values = list.map((pt) => n(pt[key]));
  const high = Math.max(...values), low = Math.min(...values);
  return {
    open: n(first[key]), openSecond: first.second, last: n(last[key]), lastSecond: last.second,
    high, low, range: high - low,
    change: n(last[key]) - n(first[key]),
    changePct: n(first[key]) ? (n(last[key]) / n(first[key]) - 1) * 100 : NaN,
    nowPct: high > low ? ((n(last[key]) - low) / (high - low)) * 100 : NaN,
    samples: list.length,
  };
}

/**
 * هم‌ساعت: مقدار همان «ثانیه از آغاز جلسه» در روزهای دیگر، با قاعدهٔ
 * حمل ده‌دقیقه‌ای. روزِ جلسهٔ کوتاه (آخرین لحظه‌اش زودتر از ۳۰ دقیقه پیش از
 * پایان) علامت می‌خورد.
 */
export function sameTime(days = [], second, { key = 'value', carryMaxSec = 600, close = 45000 } = {}) {
  return days.map(({ date, points }) => {
    const hit = valueAt(points, second, { carryMaxSec, key });
    const lastSecond = dayClose(points, { key })?.second ?? NaN;
    return {
      date, value: hit ? n(hit[key]) : NaN, carried: hit?.carried || false, ageSec: hit?.ageSec ?? NaN,
      shortSession: isNum(lastSecond) && lastSecond < close - 1800,
    };
  });
}

/** خلاصهٔ مقادیر هم‌ساعت و صدک «اکنون» میانشان. */
export function sameTimeSummary(values = [], now) {
  const list = values.map(n).filter(isNum);
  return {
    n: list.length, median: quantile(list, 0.5), q1: quantile(list, 0.25), q3: quantile(list, 0.75),
    min: list.length ? Math.min(...list) : NaN, max: list.length ? Math.max(...list) : NaN,
    percentile: percentileOf(list, now),
  };
}

/**
 * تلاطم تحقق‌یافتهٔ درون‌روزی پایه از بازده‌های گام‌به‌گام.
 *
 * `days`: `[{ date, points: [{ second, price, queue }] }]` به ترتیب تاریخ.
 * لحظهٔ صف کنار می‌رود و روزش «بریده» می‌شود. بازدهِ شبانه (آخرین لحظهٔ روز
 * قبل تا نخستین لحظهٔ امروز) جزءِ جداست و حذف نمی‌شود. سالانه‌سازی روی زمان
 * معاملاتی: واریانسِ جلسه × روز معاملاتی سال.
 */
export function intradayRealized(days = [], { stepSec = 300, tradingDaysYr = 240, sessionLength = 12600, jumpCut = 0.2 } = {}) {
  const out = [];
  let prevLast = null;
  for (const { date, points } of days) {
    const ok = (points || []).filter((pt) => n(pt.price) > 0 && !pt.queue).sort((a, b) => a.second - b.second);
    const cut = (points || []).some((pt) => pt.queue);
    const grid = [];
    for (const pt of ok) {
      if (!grid.length || pt.second - grid.at(-1).second >= stepSec) grid.push(pt);
    }
    let sum = 0, count = 0, coveredSec = 0;
    for (let i = 1; i < grid.length; i += 1) {
      const r = Math.log(grid[i].price / grid[i - 1].price);
      if (Math.abs(r) > jumpCut) continue;
      sum += r * r; count += 1; coveredSec += grid[i].second - grid[i - 1].second;
    }
    const overnight = prevLast && grid.length ? Math.log(grid[0].price / prevLast) : NaN;
    // واریانسِ پوشش‌داده به کلِ جلسه بسط داده می‌شود؛ بی پوشش، نامعلوم.
    const sessionVar = coveredSec > 0 ? sum * (sessionLength / coveredSec) : NaN;
    out.push({
      date, returns: count, cut, coveredSec,
      intradayVar: sessionVar,
      overnightVar: isNum(overnight) && Math.abs(overnight) <= jumpCut ? overnight * overnight : NaN,
      rvIntradayPct: isNum(sessionVar) ? Math.sqrt(sessionVar * tradingDaysYr) * 100 : NaN,
    });
    if (grid.length) prevLast = grid.at(-1).price;
  }
  const intra = out.map((d) => d.intradayVar).filter(isNum);
  const night = out.map((d) => d.overnightVar).filter(isNum);
  const totalVar = mean(intra) + (night.length ? mean(night) : 0);
  return {
    days: out,
    rvIntradayPct: intra.length ? Math.sqrt(mean(intra) * tradingDaysYr) * 100 : NaN,
    rvTotalPct: intra.length ? Math.sqrt(totalVar * tradingDaysYr) * 100 : NaN,
    overnightShare: intra.length && night.length ? (mean(night) / totalVar) * 100 : NaN,
    cutDays: out.filter((d) => d.cut).length,
  };
}

/** تحقق‌یافتهٔ «امروز تا اکنون»: واریانسِ دیده‌شده، سالانه روی زمانِ گذشته. */
export function realizedSoFar(points = [], { stepSec = 300, tradingDaysYr = 240, sessionLength = 12600, jumpCut = 0.2 } = {}) {
  const day = intradayRealized([{ date: 0, points }], { stepSec, tradingDaysYr, sessionLength, jumpCut }).days[0];
  return { rvPct: day?.rvIntradayPct ?? NaN, returns: day?.returns ?? 0, coveredSec: day?.coveredSec ?? 0, cut: day?.cut ?? false };
}

// ═══════════════════ فرم انتقال → نقطه‌های شاخص ═══════════════════

export const INTRADAY_SOURCES = {
  record: 'ضبط زندهٔ دیده‌بان',
  trades: 'بازسازی از ریزمعامله',
  book: 'بازسازی از دفتر سفارش',
  pending: 'هنوز ساخته نشده',
  none: 'داده‌ای نیست',
};

/**
 * یک روزِ فرم انتقال (`core/iv-record.mjs`) → نقطه‌های شاخص با همان موتور.
 *
 * هر لحظه فقط از مظنه و معاملهٔ تا همان ثانیه ساخته می‌شود (`quoteAt`
 * و فرم انتقال هر دو در ثانیهٔ لحظه می‌بُرند). صفِ پایه از دامنهٔ مجاز همان
 * روز؛ دامنهٔ نامعلوم «نامعلوم» است، نه «عادی». `keepContracts` تلاطم هر
 * قرارداد را هم نگه می‌دارد (برای لبخند و جدول زنجیره).
 */
export function transportPoints(day, ctx, { keepContracts = false } = {}) {
  const meta = day?.contracts || {};
  const p = ctx.params;
  return (day?.moments || []).map(([second, basePrice, , baseLastAt, quotes]) => {
    const at = { date: day.date, second };
    const price = n(basePrice);
    const lastAt = n(baseLastAt);
    const queue = queueFromLimits(price, limitsAt(day.limits, second));
    const base = { price, priceSource: 'trade', ageSec: isNum(lastAt) ? second - lastAt : NaN, queue };
    const observations = Object.entries(quotes || {}).map(([ins, q]) => {
      const row = meta[ins] || [];
      return {
        ins, kind: row[0], strike: row[1], expiry: row[2],
        quote: quoteAt({ record: { bid: q[0], ask: q[1], at: q[2], last: q[3], lastAt: q[4] }, second, maxAgeSec: p.maxAgeSec, basis: p.priceBasis }),
      };
    });
    const r = ivIndexAt({ at, base, observations }, ctx, { detail: keepContracts });
    const flags = new Set(r.flags);
    if (price > 0 && !isNum(lastAt)) flags.add('baseAgeUnknown');
    if (day.source === 'trades' || day.source === 'book') flags.add('rebuilt');
    return {
      // `queue` بولی است چون `intradayRealized` لحظهٔ صف را با همین کنار می‌گذارد؛
      // کلید کامل (`normal`/`unknown`/…) در `queueKey`.
      second, value: r.ivPct, bid: r.bidPct, ask: r.askPct, price, spot: price,
      queue: ['buyQueue', 'sellQueue', 'halted'].includes(queue.key), queueKey: queue.key,
      why: r.why, flags: [...flags], skew: r.skewPct, termSlope: r.termSlope, used: r.used,
      maxAge: r.maxAge, expiries: r.expiries || [], term: r.term,
      ...(keepContracts ? { contracts: r.contracts } : {}),
    };
  });
}
