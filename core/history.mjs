// موتور بازپخش تاریخی موقعیت‌ها.
//
// هر ردیف یک سؤال مستقل است: اگر موقعیت در تاریخ شروع باز می‌شد و در این
// روز معاملاتی کامل آفست می‌شد، سود و زیان چه بود؟ قیمت گمشده هرگز با قیمت
// روز قبل پر نمی‌شود؛ ردیف ناقص صریحاً «فاقد داده» می‌ماند.

import { num, ok, EPS } from './num.mjs';
import { grossCash, entryFees, analyzePayoff } from './payoff.mjs';
import { analyzeMixed, isSingleExpiry } from './mixed.mjs';
import { strategyMargin, capitalBase } from './margin.mjs';
import { notionalOf } from './portfolio-basis.mjs';
import { marginParamsOf } from './settings.mjs';
import { jalaliToGregorian, gregorianToJalali } from './jalali.mjs';
import { selectStrikes, fairShare, windowMode } from './strike-window.mjs';
import {
  legContractSize, comboContractSize, blockedExpirySet, withoutBlockedExpiries,
} from './chain.mjs';

export const HISTORY_BASES = [
  ['FIRST', 'اولین'],
  ['LAST', 'آخرین'],
  ['CLOSE', 'پایانی'],
  ['LOW', 'کمترین'],
  ['HIGH', 'بیشترین'],
];

const DAY_FA = ['یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];

export function dateParts(value) {
  const s = String(Math.trunc(num(value))).padStart(8, '0');
  if (!/^\d{8}$/.test(s)) return null;
  const y = Number(s.slice(0, 4)), m = Number(s.slice(4, 6)), d = Number(s.slice(6, 8));
  // صفر و ماه/روز بیرون از دامنه، تاریخ نیستند. تا امروز از این در رد
  // می‌شدند و `{0,0,0}` می‌ساختند؛ `historyDateLabel` رویشان «NaN/NaN/NaN»
  // چاپ می‌کرد و `dateUtc` یک تاریخ واقعی در ۱۸۹۹ می‌ساخت — که بدتر است،
  // چون بی‌سروصدا وارد محاسبه می‌شود. حالا `null` می‌دهند و هر فراخوان،
  // همان مسیر «تاریخ نامعتبر» خودش را می‌رود.
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** تاریخ سررسید دیده‌بان ممکن است شمسی یا میلادی باشد؛ خروجی همیشه YYYYMMDD میلادی است. */
export function normalizeHistoryDate(value) {
  const p = dateParts(value);
  if (!p) return 0;
  if (p.y >= 1300 && p.y < 1700) {
    const [gy, gm, gd] = jalaliToGregorian(p.y, p.m, p.d);
    return gy * 10000 + gm * 100 + gd;
  }
  return p.y * 10000 + p.m * 100 + p.d;
}

export function dateUtc(value) {
  const p = dateParts(normalizeHistoryDate(value));
  return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)) : null;
}

export function daysBetween(a, b) {
  const da = dateUtc(a), db = dateUtc(b);
  if (!da || !db) return NaN;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

export function historyDateLabel(value) {
  const p = dateParts(normalizeHistoryDate(value));
  if (!p) return '—';
  const [jy, jm, jd] = gregorianToJalali(p.y, p.m, p.d);
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

export function historyDayName(value) {
  const d = dateUtc(value);
  return d ? DAY_FA[d.getUTCDay()] : '—';
}

export function historyPrice(row, basis, manual = NaN) {
  if (basis === 'MANUAL') return num(manual, NaN);
  if (!row) return NaN;
  const key = { FIRST: 'first', LAST: 'last', CLOSE: 'close', LOW: 'low', HIGH: 'high' }[basis];
  const value = key ? num(row[key], NaN) : NaN;
  return value > 0 ? value : NaN;
}

/**
 * قیمت دستی را با بازه معامله‌شده همان روز می‌سنجد.
 *
 * بیرون بودن، خطا نیست — کاربر می‌تواند سناریوی «اگر با این قیمت می‌خریدم»
 * را بسنجد. ولی سکوت در برابرش هم درست نیست: عددی که آن روز اصلاً معامله
 * نشده، ادعای اجراپذیری ندارد و کاربر باید بداند. اگر خودِ کمترین و
 * بیشترین روز موجود نباشد، وضعیت `unknown` است نه `inside`.
 */
export function manualPriceCheck(row, price) {
  const value = num(price, NaN);
  const low = historyPrice(row, 'LOW'), high = historyPrice(row, 'HIGH');
  if (!(value > 0)) return { status: 'empty', price: NaN, low, high };
  if (!(low > 0) || !(high > 0)) return { status: 'unknown', price: value, low, high };
  return { status: value >= low && value <= high ? 'inside' : 'outside', price: value, low, high };
}

export function indexHistory(rows = []) {
  const out = new Map();
  for (const row of rows) {
    const date = normalizeHistoryDate(row.date);
    if (date) out.set(date, { ...row, date });
  }
  return out;
}

/** حجم، تعداد معامله و ارزش روزانه؛ ارزش برآوردی هرگز با مقدار رسمی قاطی نمی‌شود. */
export function historyMarketMetrics(row) {
  if (!row) return { volume: 0, trades: 0, value: 0, valueEstimated: false };
  const volume = Math.max(0, num(row.vol));
  const trades = Math.max(0, num(row.trades));
  const official = Math.max(0, num(row.value));
  const close = historyPrice(row, 'CLOSE');
  const estimated = official > 0 ? official : (volume > 0 && close > 0 ? volume * close : 0);
  return { volume, trades, value: estimated, valueEstimated: official <= 0 && estimated > 0 };
}

/** عکس قیمت و معاملات هر پای استراتژی در یک روز؛ پایه فقط اگر خودش پا باشد می‌آید. */
export function strategyLegSnapshots(legs = [], seriesByIns = {}, date) {
  const target = normalizeHistoryDate(date);
  const indexes = new Map(Object.entries(seriesByIns || {}).map(([ins, rows]) => [String(ins), indexHistory(rows)]));
  return legs.map((leg, index) => {
    const row = indexes.get(String(leg.ins))?.get(target);
    return {
      index, ins: String(leg.ins), name: leg.name, kind: leg.kind, side: leg.side,
      strike: leg.strike,
      prices: Object.fromEntries(HISTORY_BASES.map(([basis]) => [basis, historyPrice(row, basis)])),
      market: historyMarketMetrics(row),
      missing: !row,
    };
  });
}

function passesLiquidity(row, minVolume = 0, minValue = 0) {
  const m = historyMarketMetrics(row);
  return m.volume >= Math.max(0, num(minVolume)) && m.value >= Math.max(0, num(minValue));
}

function readableHistoryName(entity, fallback) {
  const name = String(entity?.name || '').trim();
  return name && name !== String(entity?.ins || '') ? name : fallback;
}

/**
 * قراردادهای فعال یک پایه، به شکل تخت.
 *
 * `blockedExpiries` را می‌گیرد تا سررسیدی که سقف موقعیتش پر است اصلاً وارد
 * فهرست نشود — نه در انتخابگر دیده شود، نه در ترکیب‌سازی، نه در بازپخش.
 * پیش از این، این قید فقط در مسیر زنده اعمال می‌شد و کل خانواده تحلیل
 * تاریخی آن را نادیده می‌گرفت.
 */
export function flattenActiveContracts(ua, blockedExpiries = '') {
  const out = [];
  const usable = withoutBlockedExpiries(ua, blockedExpirySet(blockedExpiries));
  for (const ex of usable?.expiryList || []) {
    for (const st of ex.strikeList || []) {
      for (const kind of ['call', 'put']) {
        const q = st[kind];
        if (!q?.ins) continue;
        out.push({
          ins: String(q.ins), name: readableHistoryName(q, `قرارداد ${kind === 'call' ? 'اختیار خرید' : 'اختیار فروش'}`), kind,
          strike: st.strike, size: num(st.size, 0), sizeFromSpec: !!st.sizeFromSpec,
          expiry: normalizeHistoryDate(ex.endDate), expiryRaw: ex.endDate,
          daysNow: ex.days,
        });
      }
    }
  }
  return out.sort((a, b) => a.expiry - b.expiry || a.strike - b.strike || a.kind.localeCompare(b.kind));
}

/**
 * سرشماری قرارداد — پیش از هر ترکیبی.
 *
 * ═══ چرا لازم شد ═══
 *
 * کاربر دو خروجی گرفت که هر دو برای «استرانگل فروش» شش ترکیب داشتند و
 * هر دو غلط بودند. غلط بودنشان از خودِ فایل پیدا نبود: فایل می‌گفت «شش
 * ترکیب»، نمی‌گفت «چون فقط پانزده قرارداد وارد شد». آن پانزده‌تا از
 * دفترِ آن‌روزِ ناقص می‌آمد.
 *
 * پس عددِ ترکیب بدون عددِ قرارداد قابل قضاوت نیست. این تابع عددِ قرارداد
 * را می‌سازد و رابط و اکسل هر دو نشانش می‌دهند — تا فایل بعدی خودش
 * بگوید سالم است یا نه.
 *
 * ═══ چه چیزی گفته می‌شود و با چه مبنایی ═══
 *
 *   زنده           سررسیدش بعد از روز ورود است. از تاریخ سررسید، قطعی.
 *   جفت ناقص       سری‌ای که فقط کال دارد یا فقط پوت. هیچ سمتی ساخته
 *                  نمی‌شود؛ فقط شمرده می‌شود.
 *   قیمت‌دار       روز ورود قیمت دارد و می‌شود واردش شد.
 *   بی‌سابقه       نخستین ردیفِ سابقه‌اش بعد از روز ورود است — یعنی آن روز
 *                  هنوز نبوده. **مبنا سابقهٔ معامله است، نه تاریخ رسمی
 *                  انتشار**؛ قراردادی که منتشر شده و هرگز معامله نشده،
 *                  اینجا «بی‌سابقه» می‌افتد و این حدس نیست، همان چیزی است
 *                  که داده می‌گوید.
 *   ساکت           سابقه‌اش پیش از روز ورود شروع شده ولی همان روز قیمت
 *                  ندارد. وجود داشته، معامله نشده.
 *
 * پنجرهٔ قیمت اعمال به شمار پای استراتژی بند است، پس یک عدد ندارد. برای
 * یک تا چهار پا جداگانه حساب می‌شود تا کاربر ببیند پنجره کجا و چقدر
 * می‌بُرد.
 */
export function contractCensus({ ua, seriesByIns, startDate, entryBasis = 'CLOSE', settings = {}, liquidity = {} } = {}) {
  const start = normalizeHistoryDate(startDate);
  const contracts = flattenActiveContracts(ua, settings.blockedExpiries);
  const indexes = new Map(Object.entries(seriesByIns || {}).map(([ins, rows]) => [String(ins), indexHistory(rows)]));
  const firstSeen = new Map();
  for (const [ins, rows] of Object.entries(seriesByIns || {})) {
    const dates = (rows || []).map((row) => normalizeHistoryDate(row.date)).filter((d) => d > 0);
    if (dates.length) firstSeen.set(String(ins), Math.min(...dates));
  }
  const spot = historyPrice(indexes.get(String(ua?.ins))?.get(start), 'CLOSE');

  const tally = {
    date: start, spot: Number.isFinite(spot) && spot > 0 ? spot : null,
    total: contracts.length, call: 0, put: 0,
    alive: 0, expired: 0,
    priced: 0, unseen: 0, silent: 0, illiquid: 0,
    pairs: 0, incomplete: 0,
    expiries: [], windows: [],
  };

  const byExpiry = new Map();
  for (const c of contracts) {
    if (c.kind === 'call') tally.call += 1; else tally.put += 1;
    const alive = c.expiry > start;
    if (!alive) { tally.expired += 1; continue; }
    tally.alive += 1;
    let bucket = byExpiry.get(c.expiry);
    if (!bucket) {
      bucket = { expiry: c.expiry, days: daysBetween(start, c.expiry), call: 0, put: 0, strikes: new Set(), sides: new Map(), priced: 0, unseen: 0, silent: 0, illiquid: 0 };
      byExpiry.set(c.expiry, bucket);
    }
    if (c.kind === 'call') bucket.call += 1; else bucket.put += 1;
    bucket.strikes.add(c.strike);
    const sides = bucket.sides.get(c.strike) || { call: false, put: false };
    sides[c.kind] = true;
    bucket.sides.set(c.strike, sides);

    const row = indexes.get(String(c.ins))?.get(start);
    const price = historyPrice(row, entryBasis);
    if (Number.isFinite(price)) {
      tally.priced += 1; bucket.priced += 1;
      if (!passesLiquidity(row, liquidity.minLegVolume, liquidity.minLegValue)) {
        tally.illiquid += 1; bucket.illiquid += 1;
      }
    } else if (!(num(firstSeen.get(String(c.ins)), 0) > 0) || num(firstSeen.get(String(c.ins)), 0) > start) {
      tally.unseen += 1; bucket.unseen += 1;
    } else {
      tally.silent += 1; bucket.silent += 1;
    }
  }

  for (const bucket of [...byExpiry.values()].sort((a, b) => a.expiry - b.expiry)) {
    let paired = 0, incomplete = 0;
    for (const sides of bucket.sides.values()) {
      if (sides.call && sides.put) paired += 1; else incomplete += 1;
    }
    tally.pairs += paired; tally.incomplete += incomplete;
    const ladder = [...bucket.strikes].sort((a, b) => a - b);
    tally.expiries.push({
      expiry: bucket.expiry, days: bucket.days,
      call: bucket.call, put: bucket.put, strikes: ladder.length,
      paired, incomplete,
      priced: bucket.priced, unseen: bucket.unseen, silent: bucket.silent, illiquid: bucket.illiquid,
      ladder,
    });
  }

  // اثر پنجره، به تفکیک شمار پا. سقفِ هر سررسید همان سهم برابری است که
  // ترکیب‌ساز واقعاً استفاده می‌کند، وگرنه این عدد با آن نمی‌خواند.
  const share = fairShare(settings.maxRows, Math.max(1, tally.expiries.length), settings.maxCombosPerExpiry);
  for (const legs of [1, 2, 3, 4]) {
    let kept = 0, dropped = 0, forced = false;
    for (const ex of tally.expiries) {
      const pick = selectStrikes({
        strikes: ex.ladder, spot, legs, cap: share,
        mode: settings.comboWindowMode, pct: settings.comboWindowPct, steps: settings.comboWindowSteps,
      });
      kept += pick.picked.length; dropped += pick.dropped.length;
      if (pick.forced) forced = true;
    }
    tally.windows.push({ legs, kept, dropped, forced });
  }
  tally.windowMode = windowMode(settings.comboWindowMode);
  return tally;
}

/**
 * جملهٔ سرشماری — همان که بالای جدول و در سرشناسهٔ اکسل می‌نشیند.
 *
 * عددها با جداکنندهٔ جهت (U+2068/U+2069) بسته می‌شوند. بی آن، دو عددِ
 * پشت‌سرهم در متنِ راست‌به‌چپ به هم می‌چسبند و «۵۰٪ · ۱ روز» به شکل
 * «۱۰ روز» خوانده می‌شود — اشتباهی که یک بار در نوار بازه رخ داد.
 */
export function censusNote(census, legs = 2) {
  if (!census || !census.total) return 'برای این تاریخ هیچ قراردادی در دفتر نبود.';
  const iso = (n) => `\u2068${Number(n).toLocaleString('fa-IR')}\u2069`;
  const parts = [
    `${iso(census.alive)} قرارداد در ${historyDateLabel(census.date)} زنده بوده — ${iso(census.pairs)} سری کامل`,
  ];
  if (census.incomplete) parts.push(`${iso(census.incomplete)} سری فقط یک سمت دارد و هیچ استراتژی دوسمته‌ای از آن ساخته نمی‌شود`);
  if (census.silent) parts.push(`${iso(census.silent)} قرارداد آن روز معامله نشد، پس قیمت ورود ندارد`);
  if (census.unseen) parts.push(`${iso(census.unseen)} قرارداد تا آن روز هیچ سابقهٔ معامله‌ای نداشت`);
  const win = (census.windows || []).find((w) => w.legs === legs);
  if (win && win.dropped) {
    parts.push(win.forced
      ? `${iso(win.dropped)} قیمت اعمال به‌خاطر سقف ترکیب کنار ماند، از دورترین به قیمت پایه`
      : `${iso(win.dropped)} قیمت اعمال بیرون پنجرهٔ انتخابی بود`);
  }
  return `${parts.join('؛ ')}.`;
}

const reverseSide = (side) => (side === 'buy' ? 'sell' : 'buy');

function pricedLegsAtEntry(legs, indexes, startDate, basis, manuals, units) {
  const priced = [];
  const missing = [];
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const row = indexes.get(String(leg.ins))?.get(startDate);
    const manual = manuals?.[i];
    const price = historyPrice(row, manual != null && manual !== '' ? 'MANUAL' : basis, manual);
    if (!(price >= 0) || !Number.isFinite(price)) missing.push(i);
    const market = historyMarketMetrics(row);
    priced.push({
      ...leg,
      ratio: num(leg.ratio, 1) * Math.max(1, Math.trunc(num(units, 1))),
      price,
      days: Math.max(0, daysBetween(startDate, leg.expiry)),
      entryVolume: market.volume, entryTrades: market.trades,
      entryValue: market.value, entryValueEstimated: market.valueEstimated,
    });
  }
  return { priced, missing };
}

function closeAtDate(priced, indexes, date, basis, fees, manuals = null) {
  const closeLegs = [];
  const missing = [];
  const perLeg = [];
  for (let i = 0; i < priced.length; i++) {
    const leg = priced[i];
    const row = indexes.get(String(leg.ins))?.get(date);
    const manual = manuals?.[i];
    // قیمت دستی خروج فقط روی همان روزی می‌نشیند که کاربر آن را برای همان روز
    // وارد کرده؛ فراخوان مسئول است که `manuals` را تنها برای آن روز بدهد.
    const price = manual != null && manual !== '' ? num(manual, NaN) : historyPrice(row, basis);
    if (!Number.isFinite(price)) missing.push(i);
    const close = { ...leg, side: reverseSide(leg.side), price };
    closeLegs.push(close);
    const entryGross = grossCash([leg]);
    const closeGross = Number.isFinite(price) ? grossCash([close]) : NaN;
    const entryFee = entryFees([leg], fees);
    const exitFee = Number.isFinite(price) ? entryFees([close], fees) : NaN;
    const market = historyMarketMetrics(row);
    perLeg.push({
      index: i, ins: leg.ins, name: leg.name, kind: leg.kind, side: leg.side,
      strike: leg.strike, entryPrice: leg.price, exitPrice: price,
      grossPnl: entryGross + closeGross,
      netPnl: entryGross + closeGross - entryFee - exitFee,
      entryFee, exitFee,
      volume: market.volume, trades: market.trades,
      value: market.value, valueEstimated: market.valueEstimated,
    });
  }
  if (missing.length) return { missing, perLeg };
  const gross = grossCash(closeLegs);
  const fee = entryFees(closeLegs, fees);
  return { missing, perLeg, closeLegs, gross, fee };
}

function capitalForEntry(priced, netCash, spot, settings, fees) {
  const payoff = isSingleExpiry(priced)
    ? analyzePayoff(priced, netCash, { fees })
    : analyzeMixed(priced, netCash, {
      fees, spot, rFree: settings.rFree, divYield: settings.divYield,
      sigma: settings.volManual,
    });
  const closes = Object.fromEntries(priced.map((l, i) => [i, l.price]));
  const margin = strategyMargin(priced, {
    S: spot, closes,
    params: marginParamsOf(settings),
    creditMode: settings.creditSpreadMargin, capitalMode: settings.capitalMode,
  });
  const capital = capitalBase({
    legs: priced, netCash, marginNet: margin.marginNet, maxLoss: payoff.maxLoss,
  });
  return { payoff, margin, capital };
}

function baseMetrics(baseIndex, date, startRow, previousDate) {
  const row = baseIndex.get(date);
  const prev = previousDate ? baseIndex.get(previousDate) : null;
  const close = historyPrice(row, 'CLOSE');
  const prevClose = historyPrice(prev, 'CLOSE');
  const startClose = historyPrice(startRow, 'CLOSE');
  const market = historyMarketMetrics(row);
  return {
    baseClose: close,
    baseDailyPct: close > 0 && prevClose > 0 ? ((close / prevClose) - 1) * 100 : NaN,
    baseCumulativePct: close > 0 && startClose > 0 ? ((close / startClose) - 1) * 100 : NaN,
    baseVolume: market.volume, baseTrades: market.trades,
    baseValue: market.value, baseValueEstimated: market.valueEstimated,
  };
}

const average = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
const median = (values) => quantile(values, 0.5);
function quantile(values, q) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}
function stdDev(values) {
  if (values.length < 2) return NaN;
  const m = average(values);
  return Math.sqrt(values.reduce((s, v) => s + ((v - m) ** 2), 0) / (values.length - 1));
}
function correlation(a, b) {
  if (a.length < 2 || a.length !== b.length) return NaN;
  const ma = average(a), mb = average(b);
  const top = a.reduce((s, v, i) => s + (v - ma) * (b[i] - mb), 0);
  const da = Math.sqrt(a.reduce((s, v) => s + ((v - ma) ** 2), 0));
  const db = Math.sqrt(b.reduce((s, v) => s + ((v - mb) ** 2), 0));
  return da > EPS && db > EPS ? top / (da * db) : NaN;
}
function longestStreak(values, predicate) {
  let best = 0, run = 0;
  for (const value of values) { run = predicate(value) ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}

export function summarizeReplay(rows, entry = {}) {
  const valid = rows.filter((r) => r.status === 'ok');
  if (!valid.length) return {
    validDays: 0, missingDays: rows.filter((r) => r.status === 'missing').length, best: null, worst: null,
    positiveDays: 0, negativeDays: 0, flatDays: 0,
    positivePct: NaN, negativePct: NaN, maxDrawdown: NaN, firstProfit: null,
    liquidityDays: rows.filter((r) => r.status === 'liquidity').length,
  };
  const best = valid.reduce((a, r) => (r.netPnl > a.netPnl ? r : a));
  const worst = valid.reduce((a, r) => (r.netPnl < a.netPnl ? r : a));
  const positiveDays = valid.filter((r) => r.netPnl > 0).length;
  const negativeDays = valid.filter((r) => r.netPnl < 0).length;
  const flatDays = valid.length - positiveDays - negativeDays;
  const firstProfit = valid.find((r) => r.netPnl > 0) || null;
  const pnls = valid.map((r) => r.netPnl);
  const returns = valid.map((r) => r.returnPct).filter(Number.isFinite);
  const gains = pnls.filter((v) => v > 0), losses = pnls.filter((v) => v < 0);
  const paired = valid.filter((r) => Number.isFinite(r.returnPct) && Number.isFinite(r.baseCumulativePct));
  return {
    validDays: valid.length,
    missingDays: rows.filter((r) => r.status === 'missing').length,
    liquidityDays: rows.filter((r) => r.status === 'liquidity').length,
    best, worst, last: valid.at(-1), firstProfit,
    positiveDays, negativeDays, flatDays,
    positivePct: (positiveDays / valid.length) * 100,
    negativePct: (negativeDays / valid.length) * 100,
    flatPct: (flatDays / valid.length) * 100,
    maxDrawdown: Math.min(...valid.map((r) => r.drawdown)),
    meanPnl: average(pnls), medianPnl: median(pnls), pnlStdDev: stdDev(pnls),
    meanReturn: average(returns), medianReturn: median(returns), returnStdDev: stdDev(returns),
    p10: quantile(returns, 0.10), p25: quantile(returns, 0.25),
    p75: quantile(returns, 0.75), p90: quantile(returns, 0.90),
    avgGain: average(gains), avgLoss: average(losses),
    profitFactor: losses.length ? gains.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0)) : (gains.length ? Infinity : NaN),
    longestPositive: longestStreak(pnls, (v) => v > 0),
    longestNegative: longestStreak(pnls, (v) => v < 0),
    returnBaseCorrelation: correlation(paired.map((r) => r.returnPct), paired.map((r) => r.baseCumulativePct)),
    entryGross: entry.gross, entryFee: entry.fee, netCash: entry.netCash,
    cashPaid: entry.cashPaid, cashReceived: entry.cashReceived,
    cashNetGross: entry.cashNetGross,
    capital: entry.capital?.value, capitalLabel: entry.capital?.label,
    margin: entry.margin?.margin, marginNet: entry.margin?.marginNet,
    conditionalMargin: entry.margin?.conditionalMargin,
  };
}

/**
 * بازپخش یک ترکیب انتخاب‌شده. seriesByIns شیء ins → آرایه روزانه است.
 */
export function replayHistory({
  legs, seriesByIns, baseIns, startDate, endDate,
  entryBasis = 'CLOSE', exitBasis = 'LAST', manualEntry = {}, manualExit = {}, units = 1,
  fees = {}, settings = {}, liquidity = {},
}) {
  const start = normalizeHistoryDate(startDate), requestedEnd = normalizeHistoryDate(endDate);
  const indexes = new Map(Object.entries(seriesByIns || {}).map(([ins, rows]) => [String(ins), indexHistory(rows)]));
  const baseIndex = indexes.get(String(baseIns)) || new Map();
  const expiry = Math.min(...legs.filter((l) => l.kind !== 'underlying').map((l) => normalizeHistoryDate(l.expiry)).filter(Boolean));
  const end = Number.isFinite(expiry) ? Math.min(requestedEnd, expiry) : requestedEnd;
  const { priced, missing } = pricedLegsAtEntry(legs, indexes, start, entryBasis, manualEntry, units);
  const startBase = baseIndex.get(start);
  const spot = historyPrice(startBase, 'CLOSE');
  if (missing.length || !(spot > 0)) {
    return {
      ok: false, error: 'قیمت ورود یک یا چند پا یا قیمت پایانی نماد پایه موجود نیست',
      missingEntryLegs: missing, rows: [], priced,
    };
  }

  const startBaseMarket = historyMarketMetrics(startBase);
  const baseEntryLiquid = passesLiquidity(startBase, liquidity.minBaseVolume, liquidity.minBaseValue);
  const illiquidEntryLegs = priced
    .map((leg, i) => ({ leg, i, row: indexes.get(String(leg.ins))?.get(start) }))
    .filter(({ leg, row }) => leg.kind !== 'underlying' && !passesLiquidity(row, liquidity.minLegVolume, liquidity.minLegValue))
    .map(({ i }) => i);
  if (!baseEntryLiquid || illiquidEntryLegs.length) {
    return {
      ok: false, error: 'حجم یا ارزش روز ورود از حداقل فیلتر نقدشوندگی کمتر است',
      liquidityError: true, illiquidEntryLegs, rows: [], priced,
    };
  }

  const legCash = priced.map((leg) => grossCash([leg]));
  const cashReceived = legCash.filter((value) => value > 0).reduce((a, b) => a + b, 0);
  const cashPaid = Math.abs(legCash.filter((value) => value < 0).reduce((a, b) => a + b, 0));
  const gross = cashReceived - cashPaid;
  const fee = entryFees(priced, fees);
  const netCash = gross - fee;
  const risk = capitalForEntry(priced, netCash, spot, settings, fees);
  const entry = {
    gross, fee, netCash, cashReceived, cashPaid, cashNetGross: gross,
    ...risk, baseMarket: startBaseMarket,
    // `priced` تعداد واحد را از پیش در `ratio` دارد، پس ضریب واحد اینجا یک
    // است؛ وگرنه ارزش اسمی دو بار در تعداد ضرب می‌شد.
    spot, notional: notionalOf(priced, spot, 1),
  };
  const dates = [...baseIndex.keys()].filter((d) => d >= start && d <= end).sort((a, b) => a - b);
  const rows = [];
  let peak = -Infinity, previousPnl = NaN;
  let previousLegPnl = [];
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const close = closeAtDate(priced, indexes, date, exitBasis, fees, date === end ? manualExit : null);
    const base = baseMetrics(baseIndex, date, startBase, dates[i - 1]);
    if (close.missing.length) {
      rows.push({
        date, dateLabel: historyDateLabel(date), dayName: historyDayName(date),
        holdingDays: daysBetween(start, date), status: 'missing', missingLegs: close.missing,
        perLeg: close.perLeg, ...base,
      });
      continue;
    }
    const grossPnl = gross + close.gross;
    const netPnl = netCash + close.gross - close.fee;
    const cap = risk.capital.value;
    const returnPct = cap > EPS ? (netPnl / cap) * 100 : NaN;
    const baseLiquid = base.baseVolume >= Math.max(0, num(liquidity.minBaseVolume))
      && base.baseValue >= Math.max(0, num(liquidity.minBaseValue));
    const illiquidLegs = close.perLeg
      .map((leg, index) => ({ leg, index }))
      .filter(({ leg, index }) => priced[index].kind !== 'underlying'
        && (leg.volume < Math.max(0, num(liquidity.minLegVolume)) || leg.value < Math.max(0, num(liquidity.minLegValue))))
      .map(({ index }) => index);
    const status = baseLiquid && !illiquidLegs.length ? 'ok' : 'liquidity';
    if (status === 'ok') peak = Math.max(peak, netPnl);
    const drawdown = Number.isFinite(peak) ? netPnl - peak : 0;
    const pnlDelta = Number.isFinite(previousPnl) ? netPnl - previousPnl : 0;
    close.perLeg.forEach((leg, index) => {
      leg.pnlDelta = Number.isFinite(previousLegPnl[index]) ? leg.netPnl - previousLegPnl[index] : 0;
    });
    const currentCloses = Object.fromEntries(close.perLeg.map((l, index) => [index, l.exitPrice]));
    const dayMargin = strategyMargin(priced, {
      S: base.baseClose, closes: currentCloses,
      params: marginParamsOf(settings),
      creditMode: settings.creditSpreadMargin, capitalMode: settings.capitalMode,
    });
    rows.push({
      date, dateLabel: historyDateLabel(date), dayName: historyDayName(date),
      holdingDays: daysBetween(start, date), daysToExpiry: Number.isFinite(expiry) ? daysBetween(date, expiry) : NaN,
      status, illiquidLegs, baseLiquid, grossPnl, entryFee: fee, exitFee: close.fee,
      totalFees: fee + close.fee, netPnl, pnlDelta, returnPct, drawdown,
      margin: dayMargin.margin, marginNet: dayMargin.marginNet,
      conditionalMargin: dayMargin.conditionalMargin, marginPerLeg: dayMargin.perLeg,
      perLeg: close.perLeg, ...base,
    });
    previousPnl = netPnl;
    previousLegPnl = close.perLeg.map((l) => l.netPnl);
  }
  return {
    ok: true, startDate: start, endDate: end, expiry, entryBasis, exitBasis, manualEntry, manualExit,
    priced, entry, rows, summary: summarizeReplay(rows, entry),
    approximateCapital: !isSingleExpiry(priced),
  };
}

function choose(arr, k, cap = Infinity) {
  const out = [];
  const walk = (at, picked) => {
    if (out.length >= cap) return;
    if (picked.length === k) { out.push([...picked]); return; }
    for (let i = at; i < arr.length; i++) {
      picked.push(arr[i]); walk(i + 1, picked); picked.pop();
      if (out.length >= cap) return;
    }
  };
  walk(0, []);
  return out;
}

function equalWidth(strikes) {
  if (strikes.length < 3) return true;
  const width = strikes[1] - strikes[0];
  return strikes.slice(2).every((k, i) => Math.abs((k - strikes[i + 1]) - width) <= Math.max(1, width * 0.02));
}

/** تمام ترکیب‌های ساختاری یک استراتژی روی قراردادهای فعال. */
/**
 * هویت پایدار یک ترکیب — همان چیزی که کاربر «انتخاب کرده».
 *
 * ترکیب‌ها با هر تغییر مبنای قیمت یا روز ورود از نو ساخته می‌شوند و ترتیبشان
 * عوض می‌شود، پس اندیس آرایه هویت نیست: اندیس ۳ بعد از بازسازی می‌تواند
 * قرارداد دیگری باشد. آنچه عوض نمی‌شود، خودِ قراردادهاست.
 *
 * `side` و `ratio` هم داخل کلیدند چون یک جفت قرارداد یکسان می‌تواند دو
 * ترکیب متفاوت بسازد — کالِ خریده و همان کالِ فروخته یکی نیستند. ترتیب پاها
 * مرتب می‌شود تا دو ساختِ متفاوت از یک ترکیب، یک کلید بدهند.
 */
export function comboKey(legs = []) {
  return legs
    .map((leg) => `${leg?.ins ?? ''}|${leg?.side ?? ''}|${Number(leg?.ratio) || 1}`)
    .sort()
    .join('::');
}

export function generateHistoricalCombos({ def, ua, seriesByIns, startDate, entryBasis = 'CLOSE', settings = {}, filtered = true, liquidity = {} }) {
  const start = normalizeHistoryDate(startDate);
  const contracts = flattenActiveContracts(ua, settings.blockedExpiries);
  const indexes = new Map(Object.entries(seriesByIns || {}).map(([ins, rows]) => [String(ins), indexHistory(rows)]));
  const baseIndex = indexes.get(String(ua.ins)) || new Map();
  const spot = historyPrice(baseIndex.get(start), 'CLOSE');
  if (!(spot > 0)) return { combos: [], built: 0, noEntry: 0, noLiquidity: 0, outOfWindow: 0, capped: false };
  if (!passesLiquidity(baseIndex.get(start), liquidity.minBaseVolume, liquidity.minBaseValue)) {
    return { combos: [], built: 0, noEntry: 0, noLiquidity: 1, outOfWindow: 0, capped: false };
  }
  const expiries = [...new Set(contracts.map((c) => c.expiry))]
    .filter((expiry) => expiry > start)
    .filter((expiry) => {
      if (!filtered) return true;
      const days = daysBetween(start, expiry);
      return days >= num(settings.minDays, 0) && days <= num(settings.maxDays, 400);
    })
    .sort((a, b) => a - b);
  const expirySets = def.expiries > 1
    ? expiries.flatMap((a, i) => expiries.slice(i + 1).map((b) => [a, b]))
    : expiries.map((e) => [e]);
  const byKey = new Map(contracts.map((c) => [`${c.expiry}|${c.kind}|${c.strike}`, c]));
  const out = [];
  let built = 0, noEntry = 0, noLiquidity = 0, outOfWindow = 0, capped = false;
  const maxRows = Math.max(1, Math.trunc(num(settings.maxRows, 4000)));
  const maxPerExpiry = Math.max(1, Math.trunc(num(settings.maxCombosPerExpiry, 400)));
  // سهم برابر هر سررسید از سقف ردیف — وگرنه سررسید نزدیک همهٔ سهم را
  // می‌خورد و سررسید دور، که در دفتر هست، هرگز ساخته نمی‌شود.
  const share = fairShare(maxRows, expirySets.length, maxPerExpiry);

  for (const exSet of expirySets) {
    const listed = [...new Set(contracts.filter((c) => c.expiry === exSet[0]).map((c) => c.strike))]
      .sort((a, b) => a - b);
    // پنجره فقط در نمای «غربال‌شده» اثر دارد. نمای خام باید هرچه در دفتر
    // هست را بسازد، چون کاربر همان‌جا می‌خواهد ببیند چه بوده.
    const pick = filtered
      ? selectStrikes({
        strikes: listed, spot, legs: def.strikes, cap: share,
        mode: settings.comboWindowMode, pct: settings.comboWindowPct, steps: settings.comboWindowSteps,
      })
      : { picked: listed, dropped: [], forced: false };
    outOfWindow += pick.dropped.length;
    if (pick.forced) capped = true;
    const strikes = pick.picked;
    const sets = def.strikes === 1 ? strikes.map((k) => [k]) : choose(strikes, def.strikes, share * 4);
    let made = 0;
    for (const strikeSet of sets) {
      if (made >= share || out.length >= maxRows) { capped = true; break; }
      if (filtered && def.strikes >= 3 && settings.wingsEqualWidth && !equalWidth(strikeSet)) continue;
      built += 1;
      // پاهای اختیار اول، تا اندازه پای سهم پایه از قراردادهای همین
      // ترکیب بیاید. `contracts[0]` قرارداد اول کل فهرست بود، نه لزوماً
      // قراردادی که در این ترکیب هست؛ پس از افزایش سرمایه که اندازه یک سری
      // تعدیل می‌شود، آن عدد به سری دیگری تعلق داشت.
      const legs = [];
      let missingStructure = false;
      let stockSlot = -1;
      const optionSizes = [];
      let sizeAssumed = false;
      for (const t of def.legs) {
        if (t.kind === 'underlying') {
          stockSlot = legs.length;
          legs.push({ kind: 'underlying', side: t.side, ratio: t.ratio, size: 0, ins: String(ua.ins), name: ua.name, expiry: exSet[0] });
          continue;
        }
        const expiry = exSet[Math.min(t.exp, exSet.length - 1)];
        const strike = strikeSet[t.slot - 1];
        const c = byKey.get(`${expiry}|${t.kind}|${strike}`);
        if (!c) { missingStructure = true; break; }
        const sz = legContractSize(c.size, settings.contractSize);
        if (sz.assumed) sizeAssumed = true;
        optionSizes.push(c.size);
        legs.push({ ...c, size: sz.size, sizeAssumed: sz.assumed, side: t.side, ratio: t.ratio, slot: t.slot, exp: t.exp });
      }
      const comboSize = comboContractSize(optionSizes, settings.contractSize);
      if (!missingStructure && stockSlot >= 0) {
        legs[stockSlot].size = comboSize.size;
        legs[stockSlot].sizeAssumed = comboSize.assumed;
        if (comboSize.assumed) sizeAssumed = true;
      }
      if (missingStructure) continue;
      const hasEntry = legs.every((l) => Number.isFinite(historyPrice(indexes.get(String(l.ins))?.get(start), entryBasis)));
      if (!hasEntry) { noEntry += 1; continue; }
      const liquidEntry = legs.every((l) => l.kind === 'underlying'
        || passesLiquidity(indexes.get(String(l.ins))?.get(start), liquidity.minLegVolume, liquidity.minLegValue));
      if (!liquidEntry) { noLiquidity += 1; continue; }
      made += 1;
      out.push({
        id: legs.map((l) => l.ins).join('|'), legs, strikes: strikeSet,
        expiries: exSet, spot, underlying: ua.name, uaIns: String(ua.ins),
      });
    }
    if (out.length >= maxRows) break;
  }
  return { combos: out, built, noEntry, noLiquidity, outOfWindow, capped };
}

/** مقایسه چهار مبنای ورود × چهار مبنای آفست در آخرین روز معتبر. */
export function basisMatrix(args) {
  const rows = [];
  for (const [entry] of HISTORY_BASES) {
    for (const [exit] of HISTORY_BASES) {
      const replay = replayHistory({ ...args, entryBasis: entry, exitBasis: exit, manualEntry: {} });
      rows.push({ entry, exit, ok: replay.ok, result: replay.summary?.last || null });
    }
  }
  return rows;
}

/** حساسیت قیمت ورود هر پا با شوک درصدی؛ آفست در آخرین روز بازه ثابت می‌ماند. */
export function entrySensitivity(args, shocks = [-10, -5, 0, 5, 10]) {
  const base = replayHistory(args);
  if (!base.ok) return [];
  const out = [];
  for (let i = 0; i < base.priced.length; i++) {
    for (const shockPct of shocks) {
      const manualEntry = Object.fromEntries(base.priced.map((l, j) => [j, j === i ? l.price * (1 + shockPct / 100) : l.price]));
      const replay = replayHistory({ ...args, manualEntry });
      out.push({ legIndex: i, shockPct, entryPrice: manualEntry[i], result: replay.summary?.last || null });
    }
  }
  return out;
}

/** ماتریس ورود×خروج برای یک ترکیب؛ هر خانه نتیجه ورود i و آفست j است. */
export function rollingEntryMatrix(args) {
  const baseRows = [...new Set((args.seriesByIns?.[String(args.baseIns)] || [])
    .map((r) => normalizeHistoryDate(r.date))
    .filter((d) => d >= normalizeHistoryDate(args.startDate) && d <= normalizeHistoryDate(args.endDate))
    .sort((a, b) => a - b))];
  const cells = [];
  const entries = [];
  for (let i = 0; i < baseRows.length; i++) {
    const replay = replayHistory({ ...args, startDate: baseRows[i], manualEntry: {} });
    if (!replay.ok) continue;
    entries.push({
      entryDate: baseRows[i],
      gross: replay.entry?.gross, fee: replay.entry?.fee, netCash: replay.entry?.netCash,
      cashPaid: replay.entry?.cashPaid, cashReceived: replay.entry?.cashReceived,
      cashNetGross: replay.entry?.cashNetGross,
      capital: replay.entry?.capital?.value, capitalLabel: replay.entry?.capital?.label,
      margin: replay.entry?.margin?.margin, marginNet: replay.entry?.margin?.marginNet,
      conditionalMargin: replay.entry?.margin?.conditionalMargin,
      baseMarket: replay.entry?.baseMarket,
      legs: replay.priced.map((leg) => ({
        name: readableHistoryName(leg, `پای ${leg.kind === 'call' ? 'اختیار خرید' : leg.kind === 'put' ? 'اختیار فروش' : 'دارایی پایه'}`),
        kind: leg.kind, side: leg.side, strike: leg.strike, expiry: leg.expiry,
        size: leg.size, ratio: leg.ratio, entryPrice: leg.price,
        entryVolume: leg.entryVolume, entryTrades: leg.entryTrades,
        entryValue: leg.entryValue, entryValueEstimated: leg.entryValueEstimated,
      })),
    });
    for (let rowIndex = 0; rowIndex < replay.rows.length; rowIndex++) {
      const row = replay.rows[rowIndex];
      if (row.date < baseRows[i] || row.status !== 'ok') continue;
      const capital = replay.entry?.capital?.value;
      const dailyPnl = rowIndex === 0 ? row.netPnl : row.pnlDelta;
      cells.push({
        entryDate: baseRows[i], exitDate: row.date,
        netPnl: row.netPnl, returnPct: row.returnPct,
        dailyPnl,
        dailyReturnPct: capital > EPS ? (dailyPnl / capital) * 100 : NaN,
        holdingTradingDays: rowIndex,
        holdingCalendarDays: row.holdingDays,
        baseReturnPct: row.baseCumulativePct,
        baseClose: row.baseClose, baseDailyPct: row.baseDailyPct,
        baseVolume: row.baseVolume, baseTrades: row.baseTrades,
        baseValue: row.baseValue, baseValueEstimated: row.baseValueEstimated,
        grossPnl: row.grossPnl, entryFee: row.entryFee, exitFee: row.exitFee,
        totalFees: row.totalFees, drawdown: row.drawdown,
        margin: row.margin, marginNet: row.marginNet,
        conditionalMargin: row.conditionalMargin,
        perLeg: row.perLeg.map((leg) => ({
          name: readableHistoryName(leg, `پای ${leg.kind === 'call' ? 'اختیار خرید' : leg.kind === 'put' ? 'اختیار فروش' : 'دارایی پایه'}`),
          kind: leg.kind, side: leg.side, strike: leg.strike,
          entryPrice: leg.entryPrice, exitPrice: leg.exitPrice,
          grossPnl: leg.grossPnl, netPnl: leg.netPnl, pnlDelta: leg.pnlDelta,
          entryFee: leg.entryFee, exitFee: leg.exitFee,
          volume: leg.volume, trades: leg.trades,
          value: leg.value, valueEstimated: leg.valueEstimated,
        })),
      });
    }
  }
  return { dates: baseRows, cells, entries };
}

/**
 * خلاصه هر افق نگهداری روی تمام تاریخ‌های ورود. این جدول از روی همان
 * خانه‌های ماتریس ساخته می‌شود و به‌جای انتخاب بهترین تک‌معامله، افقی را
 * برجسته می‌کند که میانه بهتر و پراکندگی کنترل‌شده‌تری داشته است.
 */
export function holdingPeriodProfile(matrix) {
  const groups = new Map();
  for (const cell of matrix?.cells || []) {
    if (!(cell.holdingTradingDays > 0) || !Number.isFinite(cell.returnPct)) continue;
    const list = groups.get(cell.holdingTradingDays) || [];
    list.push(cell); groups.set(cell.holdingTradingDays, list);
  }
  const rows = [...groups.entries()].map(([holdingTradingDays, cells]) => {
    const returns = cells.map((c) => c.returnPct);
    const daily = cells.map((c) => c.dailyReturnPct).filter(Number.isFinite);
    const deviation = stdDev(returns);
    const med = median(returns);
    return {
      holdingTradingDays, samples: cells.length,
      meanReturn: average(returns), medianReturn: med,
      p25: quantile(returns, 0.25), p75: quantile(returns, 0.75),
      returnStdDev: deviation,
      winPct: (returns.filter((v) => v > 0).length / returns.length) * 100,
      meanDailyChange: average(daily),
      robustScore: med - (Number.isFinite(deviation) ? deviation * 0.25 : 0),
    };
  }).sort((a, b) => a.holdingTradingDays - b.holdingTradingDays);
  const eligible = rows.filter((r) => r.samples >= Math.min(5, Math.max(2, Math.floor((matrix?.dates?.length || 0) / 4))));
  const best = [...eligible].sort((a, b) =>
    (b.robustScore - a.robustScore)
    || (b.winPct - a.winPct)
    || (b.medianReturn - a.medianReturn))[0] || null;
  return { rows, best };
}

/** جزئیات کامل مسیر یک خانه ماتریس، برای پنل بازشونده زیر Heatmap. */
export function replayTradeDetail(args, entryDate, exitDate) {
  const entry = normalizeHistoryDate(entryDate), exit = normalizeHistoryDate(exitDate);
  if (!entry || !exit || exit < entry) return { ok: false, error: 'تاریخ ورود یا خروج معتبر نیست' };
  const replay = replayHistory({ ...args, startDate: entry, endDate: exit, manualEntry: {} });
  if (!replay.ok) return replay;
  const path = replay.rows.filter((r) => r.date <= exit && r.status === 'ok');
  const selected = path.find((r) => r.date === exit) || null;
  if (!selected) return { ok: false, error: 'برای این خانه داده خروج معتبر وجود ندارد' };
  const best = path.reduce((a, r) => (!a || r.returnPct > a.returnPct ? r : a), null);
  const worst = path.reduce((a, r) => (!a || r.returnPct < a.returnPct ? r : a), null);
  const firstProfit = path.find((r) => r.netPnl > 0) || null;
  const capturePct = best?.netPnl > EPS ? (selected.netPnl / best.netPnl) * 100 : NaN;
  return {
    ok: true, replay, path, selected, best, worst, firstProfit, capturePct,
    capital: replay.entry?.capital?.value,
    entryDate: entry, exitDate: exit,
    tradingDays: Math.max(0, replay.rows.findIndex((r) => r.date === exit)),
    calendarDays: daysBetween(entry, exit),
  };
}

/**
 * جست‌وجوی یک قاعده خروج قابل‌تکرار روی همه روزهای ورود ممکن:
 * نخستین رسیدن به هدف بازده، وگرنه خروج در سقف روز معاملاتی.
 * رتبه‌بندی با میانه بازده انجام می‌شود تا یک خروج استثنایی نتیجه را منحرف نکند.
 */
export function optimizeExitPolicy(args, {
  targets = [2, 5, 8, 10, 15, 20, 30],
  holdingDays = [1, 2, 3, 5, 8, 10, 15, 20],
} = {}) {
  const start = normalizeHistoryDate(args.startDate), end = normalizeHistoryDate(args.endDate);
  const dates = (args.seriesByIns?.[String(args.baseIns)] || [])
    .map((r) => normalizeHistoryDate(r.date))
    .filter((d) => d >= start && d <= end)
    .sort((a, b) => a - b);
  const replays = [];
  for (const entryDate of dates.slice(0, -1)) {
    const replay = replayHistory({ ...args, startDate: entryDate, manualEntry: {} });
    if (!replay.ok) continue;
    const valid = replay.rows.filter((r) => r.status === 'ok' && r.date > entryDate);
    if (valid.length) replays.push({ entryDate, rows: valid });
  }
  const policies = [];
  for (const targetPct of targets) {
    for (const maxTradingDays of holdingDays) {
      const exits = [];
      for (const sample of replays) {
        const window = sample.rows.slice(0, maxTradingDays);
        if (!window.length) continue;
        const hit = window.find((r) => r.returnPct >= targetPct);
        const exit = hit || window.at(-1);
        exits.push({
          entryDate: sample.entryDate, exitDate: exit.date,
          returnPct: exit.returnPct, netPnl: exit.netPnl,
          tradingDays: window.indexOf(exit) + 1, targetHit: Boolean(hit),
        });
      }
      if (!exits.length) continue;
      const returns = exits.map((x) => x.returnPct);
      const pnls = exits.map((x) => x.netPnl);
      policies.push({
        targetPct, maxTradingDays, samples: exits.length,
        meanReturn: average(returns), medianReturn: median(returns),
        returnStdDev: stdDev(returns), meanPnl: average(pnls),
        winPct: (returns.filter((v) => v > 0).length / returns.length) * 100,
        targetHitPct: (exits.filter((x) => x.targetHit).length / exits.length) * 100,
        avgTradingDays: average(exits.map((x) => x.tradingDays)), exits,
      });
    }
  }
  policies.sort((a, b) =>
    (b.medianReturn - a.medianReturn)
    || (b.winPct - a.winPct)
    || (b.meanReturn - a.meanReturn)
    || (a.returnStdDev - b.returnStdDev));
  const fixed = replayHistory(args);
  return {
    sampleEntries: replays.length,
    bestPolicy: policies[0] || null,
    policies: policies.slice(0, 12),
    bestObserved: fixed.ok ? fixed.summary.best : null,
  };
}
