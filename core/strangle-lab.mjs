// موتور «استرانگل فروش در بوتهٔ آزمایش» — آزمون روزبه‌روز با دادهٔ پایانیِ همان روز.
//
// ═══ خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۲) ═══
//
// «در یک تاریخ خاص یک استرانگل ست بشه … در پایان هر روز تکنیک زیر به
// کاربر پیشنهاد داده میشه بر اساس دیتای پایان همان روز … با انتخاب کاربر
// معامله تعدیل میشه و میره برای روز بعد … کلیه احتمالات و اقدامات احتمالی
// کاربر قابل مقایسه باشه.»
//
// الگوریتم مرجع، «الگوریتم جامع Short Strangle» است که صاحب پروژه داد:
//   ۲.۲  فروش کال و پوت در دلتای ۱۶ تا ۲۰
//   ۲.۳  حد سود و حد ضرر = درصدی از پرمیوم دریافتی اولیه
//   ۳.۱  زیان شناور در محدودهٔ ۱۰ تا ۱۵٪ سود هدف ← تعدیل
//   ۳.۲  بستن سمت سودده و فروش قیمت اعمال نزدیک‌تر با پرمیوم برابر سمت زیان‌ده
//   ۳.۳  تکرار، تا جایی که دو قیمت اعمال یکی شوند ← استرادل
//   ۴    قانون ۳ برابر روی استرادل
//   ۵    خروج با سود کامل، حد ضرر کلی یا سربه‌سر
//
// ═══ چرا همه‌چیز پارامتر است ═══
//
// متن الگوریتم چند جا دو خوانش دارد (مبنای «زیان شناور» پس از تعدیل، برابری
// پرمیوم وقتی قیمت‌های اعمال گسسته‌اند، استرادل ناپایدار وقتی هنوز روز زیادی
// مانده). خوانش پیش‌فرض همان است که در گفت‌وگو تأیید شد، و خوانش دیگر یک
// گزینه است، نه کدِ دوم.
//
// ═══ صداقت عددی ═══
//
// قیمت فقط «پایانیِ همان روز» است. روزی که قراردادی معامله نشده، قیمتش
// «نداشته» می‌ماند. «قیمت مدل» (بلک-شولز با IVِ آخرین روزِ معامله‌شده) فقط
// وقتی کاربر صریحاً روشنش کند ساخته می‌شود و هر جا نشست، `src: 'model'`
// دارد تا رابط برچسبش بزند. نگاه به آینده هم ممنوع است: مدل فقط از
// روزهای **پیش از** همان روز تغذیه می‌شود.
//
// این ماژول خالص است: نه DOM، نه شبکه. رابط در `ui/tabs/strangle-lab.mjs`.

import { num, EPS } from './num.mjs';
import { bsPrice, bsGreeks, impliedVol, intrinsic } from './bs.mjs';
import { strategyMargin, capitalBase, DEFAULT_PARAMS } from './margin.mjs';
import { normalizeHistoryDate, daysBetween } from './history.mjs';
import { optionBreakeven, weightedMean } from './open-view.mjs';

export const LAB_VERSION = 1;

/** پارامترهای الگوریتم — پیش‌فرض‌ها همان متن صاحب پروژه‌اند. */
export const LAB_DEFAULTS = Object.freeze({
  qty: 1,
  capitalMult: 3,          // ۱.۱ سرمایه = ۳ × وجه تضمین
  varLimitPct: 15,         // ۱.۲ سقف زیان حساب به درصد سرمایه
  dteLo: 45, dteHi: 50,    // ۲.۱
  entryMethod: 'delta',    // delta | otm
  deltaLo: 0.16, deltaHi: 0.20,
  otmPct: 10,              // فاصلهٔ قیمت اعمال از پایه در روش «درصد فاصله»
  tpPct: 100,              // ۲.۳ / ۵.۱ — درصد پرمیوم دریافتی اولیه
  slPct: 100,              // ۲.۳ / ۵.۲
  trigLo: 10, trigHi: 15,  // ۳.۱ — درصد سود هدفِ جاری
  trigBasis: 'sinceAdjust', // sinceAdjust | sinceEntry
  matchRule: 'nearest',    // nearest | atMost | atLeast
  ratio3x: 3,              // ۴.۱
  straddleExitDays: 7,     // ۴.۲
  unstableEarly: 'hold',   // hold | close — استرادل ناپایدار با روزِ زیاد
  breakevenRule: 'market', // market | nonNeg — ۵.۳
  fees: true,
  modelFill: false,
  exitFallback: 'lastPriced', // lastPriced | none — روز خروج بی‌قیمت
  entryBasis: 'close',     // قیمت فروشِ روز ورود: close | last | first | low | high | manual
  exitBasis: 'close',      // قیمت بازخریدِ روز خروج: همان گزینه‌ها
  manualEntryCall: 0, manualEntryPut: 0, manualExitCall: 0, manualExitPut: 0,
  // قیمت انتخابی فقط در دامنهٔ معاملات واقعی همان روز پذیرفته می‌شود؛ روشن
  // یعنی «سناریوی فرضی» — هر عددی پذیرفته و همه‌جا با برچسب «فرضی» می‌آید.
  manualFree: false,
  // ۵.۲ «خروج بی‌قیدوشرط»: روشن یعنی روز رسیدن به حد ضرر، هر تصمیمی بستن
  // کامل اجرا می‌شود. خاموش یعنی فقط پیشنهاد است.
  slForce: true,
  // ردیفی که قیمت پایانی دارد ولی حجم و شمار معامله‌اش صفر است، قیمتِ مانده
  // از روزهای قبل است، نه قیمت همان روز. پیش‌فرض: «نداشته».
  staleQuotes: 'skip',
});

/** مبناهای قیمت ورود و خروج. صفر یعنی «نیامده» و جایگزین نمی‌شود. */
export const PRICE_BASES = [
  ['close', 'پایانی'], ['last', 'آخرین معامله'], ['first', 'اولین معامله'],
  ['low', 'کمترین قیمت روز'], ['high', 'بیشترین قیمت روز'], ['manual', 'قیمت انتخابی'],
];

export const LAB_CHOICES = {
  entryMethod: [['delta', 'دلتای هدف'], ['otm', 'درصد فاصله از پایه']],
  trigBasis: [['sinceAdjust', 'از آخرین تعدیل'], ['sinceEntry', 'از روز ورود']],
  matchRule: [['nearest', 'نزدیک‌ترین پرمیوم'], ['atMost', 'نزدیک‌ترین، نه بیشتر'], ['atLeast', 'نزدیک‌ترین، نه کمتر']],
  unstableEarly: [['hold', 'نگه‌داشتن با هشدار'], ['close', 'بستن فوری']],
  breakevenRule: [['market', 'بستن به قیمت روز'], ['nonNeg', 'فقط اگر زیان نداشته باشد']],
  exitFallback: [['lastPriced', 'آخرین روزی که همهٔ پاها معامله شدند'], ['none', 'نتیجه نامعلوم بماند']],
  entryBasis: PRICE_BASES,
  exitBasis: PRICE_BASES,
  staleQuotes: [['skip', 'نداشته — مثل روز بی‌معامله'], ['use', 'استفاده با برچسب «بی‌معامله» (فرض صریح)']],
};

export const SIDES = ['call', 'put'];
export const SIDE_FA = { call: 'کال', put: 'پوت' };

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const other = (side) => (side === 'call' ? 'put' : 'call');

/** پیکربندی کامل: پیش‌فرض‌ها + ورودی کاربر، با مرزهای معقول. */
export function labConfig(input = {}) {
  const c = { ...LAB_DEFAULTS, ...(input || {}) };
  for (const key of Object.keys(LAB_DEFAULTS)) {
    const def = LAB_DEFAULTS[key];
    if (typeof def === 'number') c[key] = fin(Number(c[key])) ? Number(c[key]) : def;
    if (typeof def === 'boolean') c[key] = Boolean(c[key]);
  }
  for (const [key, list] of Object.entries(LAB_CHOICES)) {
    if (!list.some(([id]) => id === c[key])) c[key] = LAB_DEFAULTS[key];
  }
  c.qty = Math.max(1, Math.round(c.qty));
  if (c.trigHi < c.trigLo) c.trigHi = c.trigLo;
  if (c.deltaHi < c.deltaLo) [c.deltaLo, c.deltaHi] = [c.deltaHi, c.deltaLo];
  return c;
}

// ═════════════════════════ بازار: ورودیِ آزمایش ═════════════════════════

/** قیمت روزانهٔ یک ردیف: پایانی، و اگر نبود آخرین معاملهٔ **همان** روز. */
const dayPrice = (row) => {
  if (!row) return 0;
  const close = num(row.close, 0);
  return close > 0 ? close : Math.max(0, num(row.last, 0));
};

const seriesOf = (dailies, ins) => {
  const box = dailies?.[String(ins ?? '')];
  return Array.isArray(box) ? box : (Array.isArray(box?.rows) ? box.rows : []);
};

/**
 * ردیفِ «بی‌معامله»: قیمت دارد ولی حجم و شمار معاملهٔ همان روز صریحاً صفر
 * است — پایانیِ مانده از روزهای قبل. ردیفی که این میدان‌ها را اصلاً ندارد
 * بی‌معامله شمرده نمی‌شود (نمی‌دانیم، پس ادعا نمی‌کنیم).
 */
export const noTradeRow = (row) => !!row && ('vol' in row || 'trades' in row)
  && !(num(row.vol, 0) > 0) && !(num(row.trades, 0) > 0);

const byDate = (rows, { skipStale = false } = {}) => {
  const map = new Map();
  for (const row of rows) {
    const d = normalizeHistoryDate(row?.date);
    const p = dayPrice(row);
    if (skipStale && noTradeRow(row)) continue;
    if (d && p > 0) map.set(d, p);
  }
  return map;
};

/** قیمت‌های ردیف‌های بی‌معامله، جدا — فقط با فرض صریح کاربر مصرف می‌شوند. */
const staleByDate = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const d = normalizeHistoryDate(row?.date);
    const p = dayPrice(row);
    if (d && p > 0 && noTradeRow(row)) map.set(d, p);
  }
  return map;
};

/** فیلدهای خامِ همان روز — فقط آن‌هایی که واقعاً آمده‌اند. */
const rawByDate = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const d = normalizeHistoryDate(row?.date);
    if (!d) continue;
    const q = {};
    // `yday` پایانی روز قبل است — مبنای درصد تغییر روزانه در همهٔ برنامه.
    for (const k of ['close', 'last', 'first', 'low', 'high', 'value', 'vol', 'trades', 'yday']) if (num(row[k], 0) > 0) q[k] = num(row[k], 0);
    if (noTradeRow(row) && dayPrice(row) > 0) q.noTrade = true;
    map.set(d, q);
  }
  return map;
};

/**
 * سررسیدهای یک پایه در فهرست قراردادها، با شمار قیمت اعمال.
 * `rows` ردیف‌های `/api/history/universe` هستند.
 */
export function labExpiries(rows = [], uaIns = '') {
  const map = new Map();
  for (const row of rows) {
    if (String(row?.uaInsCode ?? '') !== String(uaIns)) continue;
    const expiry = normalizeHistoryDate(num(row.expiryGregorian, 0) || num(row.endDate, 0));
    if (!expiry || !(num(row.strikePrice, 0) > 0)) continue;
    const box = map.get(expiry) || { expiry, strikes: 0 };
    box.strikes += 1;
    map.set(expiry, box);
  }
  return [...map.values()].sort((a, b) => a.expiry - b.expiry);
}

/** پایه‌هایی که در فهرست قرارداد دارند، با نام و شمار سررسید. */
export function labBases(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const ins = String(row?.uaInsCode ?? '');
    if (!ins) continue;
    const box = map.get(ins) || { ins, name: String(row.lval30_UA || ins), expiries: new Set(), contracts: 0 };
    box.expiries.add(num(row.expiryGregorian, 0) || num(row.endDate, 0));
    box.contracts += (row.insCode_C ? 1 : 0) + (row.insCode_P ? 1 : 0);
    map.set(ins, box);
  }
  return [...map.values()]
    .map((b) => ({ ins: b.ins, name: b.name, expiries: b.expiries.size, contracts: b.contracts }))
    .sort((a, b) => b.contracts - a.contracts || a.name.localeCompare(b.name, 'fa'));
}

/**
 * سررسیدی که روز ورود به بازهٔ DTE نزدیک‌تر است (۲.۱).
 * خروجی `{ expiry, dte, inRange }` است؛ `inRange` نادرست یعنی هشدار.
 */
export function pickExpiry(expiries = [], entryDate, cfg = LAB_DEFAULTS) {
  const lo = num(cfg.dteLo, 45), hi = num(cfg.dteHi, 50);
  let best = null;
  for (const e of expiries) {
    const dte = daysBetween(entryDate, e.expiry ?? e);
    if (!(dte > 0)) continue;
    const gap = dte < lo ? lo - dte : dte > hi ? dte - hi : 0;
    if (!best || gap < best.gap || (gap === best.gap && dte < best.dte)) {
      best = { expiry: normalizeHistoryDate(e.expiry ?? e), dte, gap };
    }
  }
  return best ? { expiry: best.expiry, dte: best.dte, inRange: best.gap === 0 } : null;
}

/**
 * بازارِ آزمایش: روزهای معاملاتیِ پایه در بازه، و قیمت پایانیِ هر قیمت اعمال.
 *
 * قیمت ردیفِ بی‌معامله (`noTradeRow`) در `day[side]` نمی‌نشیند؛ جدا در
 * `day.stale[side]` می‌ماند تا فقط با فرض صریح کاربر (`staleQuotes: 'use'`)
 * و با برچسب مصرف شود. پوشش هم دو عدد دارد: ردیف و معاملهٔ واقعی.
 *
 * فقط روزی وارد می‌شود که خودِ پایه قیمت پایانی دارد؛ بی پایه، هیچ
 * سود و زیان و دلتایی ساختنی نیست. قیمت قرارداد اگر آن روز نبود، کلیدش
 * اصلاً نوشته نمی‌شود — «نداشته» با صفر اشتباه نشود.
 */
export function buildLabMarket({ rows = [], dailies = {}, uaIns, expiry, from, to, size = 1000 } = {}) {
  const want = normalizeHistoryDate(expiry);
  const ua = String(uaIns ?? '');
  const mine = rows.filter((row) => String(row?.uaInsCode ?? '') === ua
    && normalizeHistoryDate(num(row.expiryGregorian, 0) || num(row.endDate, 0)) === want
    && num(row.strikePrice, 0) > 0);
  const strikes = [];
  const seen = new Set();
  for (const row of mine.sort((a, b) => a.strikePrice - b.strikePrice)) {
    const K = num(row.strikePrice, 0);
    if (seen.has(K)) continue;
    seen.add(K);
    strikes.push({
      strike: K,
      call: row.insCode_C ? { ins: String(row.insCode_C), sym: String(row.lVal18AFC_C || '') } : null,
      put: row.insCode_P ? { ins: String(row.insCode_P), sym: String(row.lVal18AFC_P || '') } : null,
    });
  }
  const start = normalizeHistoryDate(from);
  const end = Math.min(normalizeHistoryDate(to) || Infinity, want || Infinity);
  const uaPrices = byDate(seriesOf(dailies, ua));
  const uaRaw = rawByDate(seriesOf(dailies, ua));
  const legPrices = { call: new Map(), put: new Map() };
  const legStale = { call: new Map(), put: new Map() };
  const legRaw = { call: new Map(), put: new Map() };
  for (const s of strikes) {
    for (const side of SIDES) {
      if (!s[side]) continue;
      const rowsOf = seriesOf(dailies, s[side].ins);
      legPrices[side].set(s.strike, byDate(rowsOf, { skipStale: true }));
      legStale[side].set(s.strike, staleByDate(rowsOf));
      legRaw[side].set(s.strike, rawByDate(rowsOf));
    }
  }
  const days = [];
  for (const date of [...uaPrices.keys()].sort((a, b) => a - b)) {
    if (date < start || date > end) continue;
    const day = { date, S: uaPrices.get(date), dte: daysBetween(date, want), call: {}, put: {}, stale: { call: {}, put: {} }, raw: { call: {}, put: {} }, uaRaw: uaRaw.get(date) || {} };
    for (const side of SIDES) {
      for (const [K, series] of legPrices[side]) {
        const p = series.get(date);
        if (p > 0) day[side][K] = p;
        const st = legStale[side].get(K)?.get(date);
        if (st > 0) day.stale[side][K] = st;
        const q = legRaw[side].get(K)?.get(date);
        if (q && Object.keys(q).length) day.raw[side][K] = q;
      }
    }
    days.push(day);
  }
  const uaName = String(mine[0]?.lval30_UA || ua);
  const priced = days.reduce((a, d) => a + Object.keys(d.call).length + Object.keys(d.put).length, 0);
  const stale = days.reduce((a, d) => a + Object.keys(d.stale.call).length + Object.keys(d.stale.put).length, 0);
  const slots = days.length * strikes.reduce((a, s) => a + (s.call ? 1 : 0) + (s.put ? 1 : 0), 0);
  return {
    uaIns: ua, uaName, expiry: want, size: num(size, 1000) || 1000,
    from: start, to: normalizeHistoryDate(to), strikes, days,
    // `pct` پوشش معاملهٔ واقعی است؛ `recordPct` پوشش ردیف (با بی‌معامله‌ها).
    coverage: { priced, stale, records: priced + stale, slots,
      pct: slots ? (priced / slots) * 100 : NaN, recordPct: slots ? ((priced + stale) / slots) * 100 : NaN },
  };
}

// ═════════════════════════ قیمت‌گذاری ═════════════════════════

/**
 * زمینهٔ قیمت‌گذاری: نرخ، بازده نقدی، روزِ سال و اینکه قیمت مدل مجاز است.
 * کش IV روی خودِ بازار نمی‌نشیند تا بازار قابل‌ذخیره (JSON) بماند.
 */
export function pricingContext(market, { r = 0.3, q = 0, yearDays = 365, modelFill = false, useStale = false } = {}) {
  return { market, r: num(r, 0.3), q: num(q, 0), yearDays: num(yearDays, 365) || 365, modelFill: !!modelFill, useStale: !!useStale, ivCache: new Map() };
}

const yearsOf = (ctx, dte) => Math.max(0, dte) / ctx.yearDays;

/** IV از قیمت پایانیِ واقعیِ همان روز؛ بی قیمت واقعی، NaN. */
export function ivAt(ctx, i, side, K) {
  const key = `${side}|${K}|${i}`;
  if (ctx.ivCache.has(key)) return ctx.ivCache.get(key);
  const day = ctx.market.days[i];
  const p = day?.[side]?.[K];
  const iv = p > 0 && day.dte > 0
    ? impliedVol(side, p, day.S, K, yearsOf(ctx, day.dte), ctx.r, ctx.q)
    : NaN;
  ctx.ivCache.set(key, iv);
  return iv;
}

/**
 * قیمت یک پا در پایان روز `i`.
 *
 * `{ price, src, from }` — `src` یکی از: close (پایانی همان روز)،
 * intrinsic (روز سررسید)، stale (پایانیِ ردیف بی‌معامله، فقط با فرض صریح)،
 * model (بلک-شولز با IVِ روز `from`). بی جواب، `null` — و مصرف‌کننده باید
 * «نداشته» نشانش دهد.
 *
 * روز سررسید همیشه ارزش ذاتی است، حتی اگر پایانیِ مثبتی ثبت شده باشد:
 * قرارداد آن روز تسویه می‌شود، نه بازخرید — همان که متن پیشنهاد می‌گوید.
 */
export function priceAt(ctx, i, side, K) {
  const day = ctx.market.days[i];
  if (!day) return null;
  if (day.dte <= 0) return { price: intrinsic(side, day.S, K), src: 'intrinsic', from: day.date };
  const actual = day[side]?.[K];
  if (actual > 0) return { price: actual, src: 'close', from: day.date };
  const stale = day.stale?.[side]?.[K];
  if (ctx.useStale && stale > 0) return { price: stale, src: 'stale', from: day.date };
  if (!ctx.modelFill) return null;
  for (let j = i - 1; j >= 0; j -= 1) {
    if (!(ctx.market.days[j]?.[side]?.[K] > 0)) continue;
    const iv = ivAt(ctx, j, side, K);
    if (!fin(iv)) return null;
    const price = bsPrice(side, day.S, K, yearsOf(ctx, day.dte), ctx.r, ctx.q, iv);
    return fin(price) ? { price, src: 'model', from: ctx.market.days[j].date, iv } : null;
  }
  return null;
}

/**
 * قیمت معاملهٔ ورود یا خروج با مبنای انتخابی.
 *
 * پایانی همان `priceAt` است. «آخرین»، «اولین»، «کمترین» و «بیشترین» فقط
 * از فیلدِ واقعیِ همان روز می‌آیند؛ اگر نیامده، `null` — هیچ مبنایی بی‌صدا
 * جای مبنای دیگر نمی‌نشیند. روز سررسید ارزش ذاتی است.
 *
 * «انتخابی» عددی است که کاربر نوشته، و فقط اگر در دامنهٔ معاملات واقعی
 * همان روز (`manualRange`) باشد پذیرفته می‌شود؛ با `free` (سناریوی فرضی)
 * هر عدد مثبتی با `src: 'hypo'` پذیرفته می‌شود.
 */
export function tradePrice(ctx, i, side, K, basis = 'close', manual = 0, free = false) {
  if (!basis || basis === 'close') return priceAt(ctx, i, side, K);
  const day = ctx.market.days[i];
  if (basis === 'manual') {
    const m = num(manual, 0);
    if (!(m > 0)) return null;
    if (free) return { price: m, src: 'hypo', from: day?.date };
    return manualCheck(ctx, i, side, K, m).ok ? { price: m, src: 'manual', from: day?.date } : null;
  }
  if (day && day.dte <= 0) return { price: intrinsic(side, day.S, K), src: 'intrinsic', from: day.date };
  const q = day?.raw?.[side]?.[K];
  if (q?.noTrade && !ctx.useStale) return null;
  const v = q?.[basis];
  if (v > 0) return { price: v, src: q.noTrade ? 'stale' : basis, from: day.date };
  return null;
}

/**
 * دامنهٔ معاملات واقعی یک قرارداد در روز `i`: کمینه و بیشینهٔ میدان‌های
 * قیمتیِ آمده (کمترین، بیشترین، اولین، آخرین، پایانی). روزِ بی‌معامله یا
 * بی‌ردیف `null` است — قیمتی برای سنجش نیست.
 */
export function manualRange(ctx, i, side, K) {
  const q = ctx.market.days[i]?.raw?.[side]?.[K];
  if (!q || q.noTrade) return null;
  const vals = ['low', 'high', 'first', 'last', 'close'].map((k) => q[k]).filter((v) => v > 0);
  return vals.length ? { lo: Math.min(...vals), hi: Math.max(...vals) } : null;
}

/** قیمت انتخابی در دامنهٔ همان روز هست؟ `why` متن خطا برای رابط است. */
export function manualCheck(ctx, i, side, K, price) {
  const range = manualRange(ctx, i, side, K);
  if (!range) return { ok: false, range: null, why: `${SIDE_FA[side]} ${K} در آن روز معامله‌ای نداشت؛ قیمت انتخابی سنجیدنی نیست.` };
  const ok = price >= range.lo - EPS && price <= range.hi + EPS;
  return { ok, range, why: ok ? '' : `قیمت انتخابی ${SIDE_FA[side]} (${price}) بیرون از دامنهٔ معاملات همان روز (${range.lo} تا ${range.hi}) است.` };
}

export const BASIS_FA = Object.fromEntries(PRICE_BASES);

/**
 * سربه‌سر وزنی کال و پوتِ یک روز — همان منطق «رصد لحظه‌ای»
 * (`optionBreakeven` و `weightedMean` از `core/open-view.mjs`):
 *   سربه‌سر کال = قیمت اعمال + پرمیوم   ،   سربه‌سر پوت = قیمت اعمال − پرمیوم
 * و میانگین آن‌ها با وزن ارزش معاملاتِ همان روزِ هر قرارداد. قراردادی که
 * آن روز معامله نشده (ارزش صفر) وزنی ندارد.
 */
export function weightedBreakevens(ctx, i) {
  const day = ctx.market.days[i];
  const out = {};
  for (const side of SIDES) {
    const rows = [];
    for (const s of ctx.market.strikes) {
      const q = day?.raw?.[side]?.[s.strike];
      const premium = q?.close || q?.last;
      if (!q?.value || !(premium > 0)) continue;
      rows.push({ value: optionBreakeven(side, s.strike, premium), weight: q.value });
    }
    const m = weightedMean(rows);
    out[side] = { value: m.value, weight: m.weight, count: m.count };
  }
  return out;
}

/** دلتای یک پا در روز `i` — از IVِ همان روز، یا IVِ مدل اگر مجاز باشد. */
export function deltaAt(ctx, i, side, K) {
  const day = ctx.market.days[i];
  if (!day || !(day.dte > 0)) return NaN;
  let iv = ivAt(ctx, i, side, K);
  if (!fin(iv)) {
    const q = priceAt(ctx, i, side, K);
    iv = q?.src === 'model' ? q.iv : NaN;
  }
  if (!fin(iv)) return NaN;
  return bsGreeks(side, day.S, K, yearsOf(ctx, day.dte), ctx.r, ctx.q, iv, ctx.yearDays).delta;
}

/** جدول قیمت اعمال‌های یک روز: قیمت، منبع، IV و دلتای هر دو سمت. */
export function strikeBoard(ctx, i) {
  const day = ctx.market.days[i];
  if (!day) return [];
  return ctx.market.strikes.map((s) => {
    const row = { strike: s.strike, otmPct: ((s.strike - day.S) / day.S) * 100 };
    for (const side of SIDES) {
      if (!s[side]) { row[side] = null; continue; }
      const q = priceAt(ctx, i, side, s.strike);
      row[side] = {
        sym: s[side].sym, ins: s[side].ins,
        price: q?.price ?? NaN, src: q?.src || 'none',
        iv: ivAt(ctx, i, side, s.strike),
        delta: deltaAt(ctx, i, side, s.strike),
      };
    }
    return row;
  });
}

/**
 * انتخاب قیمت‌های اعمال ورود (۲.۲).
 *
 * روش دلتا: نزدیک‌ترین قدرمطلق دلتا به میانهٔ بازه؛ اگر هیچ‌کدام در بازه
 * نبود، نزدیک‌ترین با `inRange: false`. روش درصد فاصله: کال بالای پایه و
 * پوت زیر پایه با همان درصد. کال همیشه بالاتر یا برابرِ پوت می‌ماند.
 */
export function pickEntry(ctx, cfg = LAB_DEFAULTS, i = 0) {
  const day = ctx.market.days[i];
  if (!day) return { call: null, put: null, note: 'روز ورود در داده نیست.' };
  const board = strikeBoard(ctx, i);
  const mid = (cfg.deltaLo + cfg.deltaHi) / 2;
  const pick = (side) => {
    const usable = board.filter((row) => row[side] && fin(row[side].price) && row[side].price > 0);
    if (!usable.length) return null;
    if (cfg.entryMethod === 'otm') {
      const target = side === 'call' ? day.S * (1 + cfg.otmPct / 100) : day.S * (1 - cfg.otmPct / 100);
      const best = usable.reduce((a, b) => (Math.abs(b.strike - target) < Math.abs(a.strike - target) ? b : a));
      return { strike: best.strike, inRange: true, delta: best[side].delta };
    }
    const withDelta = usable.filter((row) => fin(row[side].delta));
    if (!withDelta.length) return null;
    const d = (row) => Math.abs(row[side].delta);
    const best = withDelta.reduce((a, b) => (Math.abs(d(b) - mid) < Math.abs(d(a) - mid) ? b : a));
    return { strike: best.strike, inRange: d(best) >= cfg.deltaLo - EPS && d(best) <= cfg.deltaHi + EPS, delta: best[side].delta };
  };
  const call = pick('call'), put = pick('put');
  const notes = [];
  if (!call) notes.push('برای کال قیمت یا دلتای قابل‌استفاده‌ای در روز ورود نبود.');
  if (!put) notes.push('برای پوت قیمت یا دلتای قابل‌استفاده‌ای در روز ورود نبود.');
  if (call && put && call.strike < put.strike) notes.push('قیمت اعمال کال زیر پوت افتاد؛ دستی اصلاح کنید.');
  if (cfg.entryMethod === 'delta') {
    if (call && !call.inRange) notes.push('هیچ کالی در بازهٔ دلتای هدف نبود؛ نزدیک‌ترین انتخاب شد.');
    if (put && !put.inRange) notes.push('هیچ پوتی در بازهٔ دلتای هدف نبود؛ نزدیک‌ترین انتخاب شد.');
  }
  return { call: call?.strike ?? null, put: put?.strike ?? null, callInfo: call, putInfo: put, note: notes.join(' ') };
}

/**
 * فرض اجرای کل حجم: پایی که حجم معامله‌اش از کل حجم معاملهٔ همان روزِ آن
 * قرارداد بیشتر است. گزارش آزمون ۸۳e5888 مورد ۲۲: ۱۰۰۰ قرارداد در بازار
 * کم‌معامله بی هشدار پذیرفته می‌شد. روزِ بی‌معامله حجم صفر است؛ ردیفی که
 * میدان حجم ندارد سنجیده نمی‌شود.
 */
export function liquidityNotes(ctx, cfg, legs, i) {
  const out = [];
  for (const side of SIDES) {
    const leg = legs?.[side];
    const q = leg ? ctx.market.days[i]?.raw?.[side]?.[leg.strike] : null;
    if (!q) continue;
    const vol = q.noTrade ? 0 : q.vol;
    if (!fin(vol)) continue;
    if (cfg.qty > vol) out.push({ side, strike: leg.strike, vol, qty: cfg.qty });
  }
  return out;
}

// ═════════════════════════ وضعیت و ارزیابی ═════════════════════════

const mult = (ctx, cfg) => ctx.market.size * cfg.qty;

const copyState = (s) => ({
  ...s,
  legs: { call: s.legs.call ? { ...s.legs.call } : null, put: s.legs.put ? { ...s.legs.put } : null },
  bySide: { call: { ...s.bySide.call }, put: { ...s.bySide.put } },
  trades: s.trades.map((t) => ({ ...t })),
});

/** کارمزد یک معامله؛ با کارمزد خاموش صفر. */
const feeOf = (cfg, fees, notional) => (cfg.fees ? Math.abs(notional) * num(fees?.option, 0) : 0);

/**
 * گشایش استرانگل در پایان روز `i`.
 * خطا یعنی قیمت ورود نیست — هیچ عددی جایش ساخته نمی‌شود.
 */
export function openPosition(ctx, cfg, entry, i = 0, fees = {}) {
  const M = mult(ctx, cfg);
  const legs = {};
  for (const side of SIDES) {
    const K = num(entry?.[side], NaN);
    if (!fin(K)) return { error: `قیمت اعمال ${SIDE_FA[side]} انتخاب نشده.` };
    const manual = side === 'call' ? cfg.manualEntryCall : cfg.manualEntryPut;
    const q = tradePrice(ctx, i, side, K, cfg.entryBasis, manual, cfg.manualFree);
    if (!q) {
      if (cfg.entryBasis === 'manual') {
        return { error: num(manual, 0) > 0
          ? `${manualCheck(ctx, i, side, K, num(manual, 0)).why} برای ورود فرضی «سناریوی فرضی» را روشن کنید.`
          : `قیمت انتخابی ${SIDE_FA[side]} وارد نشده.` };
      }
      const stale = ctx.market.days[i]?.raw?.[side]?.[K]?.noTrade;
      return { error: stale ? `${SIDE_FA[side]} ${K} در روز ورود معامله نشد (حجم صفر)؛ قیمتش مانده از روزهای قبل است و برای ورود پذیرفته نمی‌شود.`
        : `«${BASIS_FA[cfg.entryBasis] || 'پایانی'}» ${SIDE_FA[side]} ${K} در روز ورود نیامده.` };
    }
    legs[side] = { strike: K, open: q.price, openDay: i, src: q.src };
  }
  if (legs.call.strike < legs.put.strike) return { error: 'قیمت اعمال کال نباید زیر پوت باشد.' };
  const credit = (legs.call.open + legs.put.open) * M;
  // دفتر هر سمت جدا: سود تحقق‌یافته و کارمزدِ هر سمت، تا «اثر انباشتهٔ هر
  // پا» از همان دفتر بیاید و جمع دو سمت دقیقاً سود و زیان کل باشد.
  const bySide = {
    call: { realized: 0, fees: feeOf(cfg, fees, legs.call.open * M), received: legs.call.open * M },
    put: { realized: 0, fees: feeOf(cfg, fees, legs.put.open * M), received: legs.put.open * M },
  };
  const fee = bySide.call.fees + bySide.put.fees;
  // دفتر معامله‌های هر پا: هر قراردادی که فروخته شد، با روز و قیمت فروش و
  // (پس از بسته‌شدن) روز و قیمت بازخرید — مبنای نمودار پرمیوم.
  const trades = SIDES.map((side) => ({
    side, strike: legs[side].strike, openDay: i, openPrice: legs[side].open, openSrc: legs[side].src,
    premium: legs[side].open * M, openFee: feeOf(cfg, fees, legs[side].open * M),
  }));
  return {
    state: {
      legs, bySide, trades, realized: 0, fees: fee, received: credit, paid: 0,
      initialCredit: credit, refPnl: -fee, initialRef: -fee, adjustments: 0,
      closed: false, reason: '', closedAt: -1, finalPnl: NaN,
    },
  };
}

/**
 * ارزیابی پایان روز `i`، پیش از اقدام آن روز.
 *
 * همهٔ درصدها نسبت به همان مبنایی است که متن الگوریتم گفته:
 *   حد سود و حد ضرر ← پرمیوم دریافتی **اولیه** (۵.۱ و ۵.۲)
 *   آستانهٔ تعدیل ← «سود هدفِ جاری» = سودِ بیشینهٔ اکنون (۳.۲.۳)
 */
export function evaluateDay(ctx, cfg, state, i) {
  const day = ctx.market.days[i];
  const M = mult(ctx, cfg);
  const last = ctx.market.days.length - 1;
  const out = {
    i, date: day?.date, S: day?.S, dte: day?.dte, isLast: i === last,
    marks: { call: null, put: null }, missing: [], modeled: [],
    pnl: NaN, unreal: NaN, maxProfit: NaN, floatLoss: NaN, floatPct: NaN,
    zone: 'calm', tpHit: false, slHit: false,
    straddle: false, ratio: NaN, unstable: false,
    losing: null, winning: null, candidate: null,
  };
  if (!day || state.closed) return { ...out, closed: state.closed, pnl: state.finalPnl, rec: rec('none', 'closed') };
  let unreal = 0, openValue = 0;
  for (const side of SIDES) {
    const leg = state.legs[side];
    if (!leg) continue;
    const q = priceAt(ctx, i, side, leg.strike);
    out.marks[side] = q;
    if (!q) { out.missing.push(side); continue; }
    if (q.src === 'model') out.modeled.push(side);
    unreal += (leg.open - q.price) * M;
    openValue += leg.open * M;
  }
  out.maxProfit = state.realized + openValue - state.fees;
  if (out.missing.length) return { ...out, rec: rec('hold', 'missing', { sides: out.missing }) };
  out.unreal = unreal;
  out.pnl = state.realized + unreal - state.fees;
  const ref = cfg.trigBasis === 'sinceEntry' ? state.initialRef : state.refPnl;
  out.floatLoss = Math.max(0, ref - out.pnl);
  out.floatPct = out.maxProfit > EPS ? (out.floatLoss / out.maxProfit) * 100 : NaN;
  out.zone = !(out.floatPct >= cfg.trigLo) ? 'calm' : out.floatPct <= cfg.trigHi ? 'band' : 'beyond';
  out.tpHit = out.pnl >= (cfg.tpPct / 100) * state.initialCredit - EPS;
  out.slHit = out.pnl <= -(cfg.slPct / 100) * state.initialCredit + EPS;

  const { call, put } = state.legs;
  if (call && put) {
    out.straddle = Math.abs(call.strike - put.strike) < EPS;
    const cm = out.marks.call.price, pm = out.marks.put.price;
    out.ratio = Math.min(cm, pm) > EPS ? Math.max(cm, pm) / Math.min(cm, pm) : Infinity;
    out.unstable = out.straddle && out.ratio >= cfg.ratio3x - EPS;
    const moveC = cm - call.open, moveP = pm - put.open;
    out.losing = moveC >= moveP ? 'call' : 'put';
    out.winning = other(out.losing);
  }
  if (out.isLast) return { ...out, rec: rec('close', day.dte <= 0 ? 'expiry' : 'exit') };
  if (out.slHit) return { ...out, rec: rec('close', cfg.slForce ? 'sl' : 'slSoft') };
  if (out.tpHit) return { ...out, rec: rec('close', 'tp') };
  if (!(call && put)) return { ...out, rec: rec('hold', 'oneLeg') };
  if (out.straddle) {
    if (!out.unstable) return { ...out, rec: rec('hold', 'straddleStable') };
    if (day.dte <= cfg.straddleExitDays) {
      if (cfg.breakevenRule === 'nonNeg' && out.pnl < 0) return { ...out, rec: rec('hold', 'straddleWaitBreakeven') };
      return { ...out, rec: rec('close', 'straddleLate') };
    }
    return { ...out, rec: cfg.unstableEarly === 'close' ? rec('close', 'straddleEarlyClose') : rec('hold', 'straddleEarly') };
  }
  if (out.zone === 'calm') return { ...out, rec: rec('hold', 'calm') };
  const cand = adjustCandidate(ctx, cfg, state, i, out);
  out.candidate = cand;
  if (!cand.strike) return { ...out, rec: rec('hold', 'noCandidate', { detail: cand.why }) };
  return { ...out, rec: rec('roll', out.zone === 'band' ? 'band' : 'beyond', { side: out.winning, strike: cand.strike }) };
}

/** متن پیشنهادِ هر علت — رابط همین‌ها را نشان می‌دهد. */
export const REC_TEXT = {
  closed: 'معامله بسته شده.',
  missing: 'قیمت پایانی امروزِ یکی از پاها نیست؛ هیچ تصمیمی روی عدد ساختگی گرفته نمی‌شود.',
  exit: 'روز خروج: بستن کامل به قیمت مبنای خروج.',
  expiry: 'روز سررسید: تسویه به ارزش ذاتی (نه بازخرید به قیمت پایانی).',
  sl: 'زیان به حد ضرر کلی رسید (۵.۲): خروج بی‌قیدوشرط — هر تصمیمی، بستن کامل اجرا می‌شود.',
  slSoft: 'زیان به حد ضرر کلی رسید (۵.۲): پیشنهاد خروج کامل (طبق تنظیم، اجباری نیست).',
  tp: 'سود به سود هدف رسید (۵.۱): بستن کامل.',
  oneLeg: 'فقط یک پا باز است؛ الگوریتم این حالت را تعریف نکرده — نگه‌داشتن.',
  straddleStable: 'استرادل پایدار (زیر ۳ برابر): نگه‌داشتن برای افول ارزش زمانی (۴.۲).',
  straddleLate: 'استرادل ناپایدار نزدیک سررسید: خروج به‌علت عدم توازن پرمیوم (۴.۲) — به قیمت روز، با هر سود یا زیانی.',
  straddleWaitBreakeven: 'استرادل ناپایدار نزدیک سررسید، ولی هنوز زیان دارد؛ طبق تنظیم «فقط بدون زیان» صبر.',
  straddleEarly: 'استرادل ناپایدار ولی هنوز روز زیادی مانده: نگه‌داشتن با هشدار.',
  straddleEarlyClose: 'استرادل ناپایدار؛ طبق تنظیم، بستن فوری حتی با روز زیاد.',
  calm: 'زیان شناور زیر آستانهٔ تعدیل است (۳.۱): بدون دستکاری.',
  noCandidate: 'آستانهٔ تعدیل فعال شد ولی قیمت اعمال مناسبی با قیمتِ امروز پیدا نشد.',
  band: 'زیان شناور در محدودهٔ تعدیل (۳.۱): بستن پای بهتر (کم‌رشدتر از قیمت ورود) و فروش قیمت اعمال نزدیک‌تر (۳.۲).',
  beyond: 'زیان شناور از محدودهٔ تعدیل هم گذشته؛ تعدیل دیرهنگام (۳.۲).',
};

/** روز رسیدن به حد ضرری که اجباری است؟ آن روز هر اقدامی بستن کامل است. */
export const slForced = (cfg, ev) => !!cfg?.slForce && ev?.rec?.why === 'sl';

function rec(kind, why, extra = {}) {
  const action = kind === 'roll' ? { kind: 'roll', side: extra.side, strike: extra.strike }
    : kind === 'close' ? { kind: 'close' } : { kind: 'hold' };
  return { ...extra, kind, why, text: REC_TEXT[why] || '', action };
}

/**
 * گام ۳.۲.۲: قیمت اعمال تازهٔ سمت سودده، نزدیک‌تر به بازار، با پرمیومی
 * برابرِ پرمیوم فعلی سمت زیان‌ده. سمت سودده از قیمت اعمال سمت زیان‌ده رد
 * نمی‌شود؛ رسیدن به آن یعنی استرادل (۳.۳).
 */
export function adjustCandidate(ctx, cfg, state, i, ev) {
  const win = ev.winning, lose = ev.losing;
  if (!win) return { strike: null, why: 'پا برای تعدیل نیست.' };
  const target = ev.marks[lose]?.price;
  const cur = state.legs[win].strike, edge = state.legs[lose].strike;
  const options = [];
  for (const s of ctx.market.strikes) {
    if (!s[win]) continue;
    const K = s.strike;
    const closer = win === 'put' ? K > cur + EPS && K <= edge + EPS : K < cur - EPS && K >= edge - EPS;
    if (!closer) continue;
    const q = priceAt(ctx, i, win, K);
    if (!q) continue;
    options.push({ strike: K, price: q.price, src: q.src, gap: q.price - target });
  }
  let pool = options;
  if (cfg.matchRule === 'atMost') pool = options.filter((o) => o.gap <= EPS);
  if (cfg.matchRule === 'atLeast') pool = options.filter((o) => o.gap >= -EPS);
  if (!pool.length) {
    return { strike: null, target, options,
      why: options.length ? 'هیچ قیمت اعمالی با قاعدهٔ برابری پرمیوم جور نشد.' : 'قیمت اعمال نزدیک‌تری با قیمتِ امروز نیست.' };
  }
  const best = pool.reduce((a, b) => (Math.abs(b.gap) < Math.abs(a.gap) ? b : a));
  return { strike: best.strike, price: best.price, src: best.src, target, gapPct: target > 0 ? (best.gap / target) * 100 : NaN, options };
}

// ═════════════════════════ اثر هر پا ═════════════════════════

/**
 * اثر انباشتهٔ هر سمت تا پایان روز `i`، پس از اقدامِ همان روز.
 *
 *   اثر سمت = سود تحقق‌یافتهٔ همهٔ پاهای بسته‌شدهٔ آن سمت
 *           + (قیمت فروش − قیمت امروز) × اندازه × تعداد  برای پای باز
 *           − کارمزدهای آن سمت
 *
 * جمع دو سمت دقیقاً همان سود و زیان کل است (آزمون همین را می‌سنجد). پای
 * بی‌قیمت، اثر آن سمت را «نداشته» می‌کند، نه صفر.
 */
export function sideBreakdown(ctx, cfg, state, i) {
  const M = mult(ctx, cfg);
  const out = {};
  for (const side of SIDES) {
    const book = state.bySide[side];
    const leg = state.closed ? null : state.legs[side];
    const q = leg ? priceAt(ctx, i, side, leg.strike) : null;
    const unreal = leg ? (q ? (leg.open - q.price) * M : NaN) : 0;
    out[side] = {
      cum: book.realized + unreal - book.fees,
      realized: book.realized, unreal, fees: book.fees, received: book.received,
      leg: leg ? { ...leg } : null, mark: q,
    };
  }
  return out;
}

// ═════════════════════════ اقدام‌ها ═════════════════════════

/**
 * سه نوع اقدام کافی است:
 *   hold                    نگه‌داشتن
 *   close                   بستن همهٔ پاهای باز
 *   roll {side, strike}     بستن آن سمت (اگر باز است) و فروش قیمت اعمال تازه؛
 *                           `strike: null` یعنی فقط بستن همان سمت
 * و `algo` که در هر روز به پیشنهاد همان روز ترجمه می‌شود.
 */
export const ACTION_KINDS = ['hold', 'close', 'roll', 'algo'];

export function actionKey(a) {
  if (!a || a.kind === 'hold') return 'H';
  if (a.kind === 'close') return 'C';
  if (a.kind === 'open') return 'O';
  if (a.kind === 'roll') return `R:${a.side}:${a.strike ?? '-'}`;
  return 'A';
}

/** اقدام را روی وضعیت اجرا می‌کند؛ وضعیت قبلی دست نمی‌خورد. */
export function applyAction(ctx, cfg, state, i, action, ev, fees = {}, reason = '') {
  let a = !action || action.kind === 'algo' ? ev?.rec?.action || { kind: 'hold' } : action;
  // ۵.۲: حد ضرر اجباری پیش از هر تصمیمی اجرا می‌شود.
  if (!state.closed && slForced(cfg, ev) && a.kind !== 'close') a = { kind: 'close', forced: 'sl' };
  if (state.closed || a.kind === 'hold') return { state, action: { kind: 'hold' } };
  const M = mult(ctx, cfg);
  const s = copyState(state);
  const closeLeg = (side) => {
    const leg = s.legs[side];
    if (!leg) return null;
    const q = ev?.marks?.[side] || priceAt(ctx, i, side, leg.strike);
    if (!q) return `قیمت ${SIDE_FA[side]} امروز نیست؛ بستنش ممکن نیست.`;
    const cost = q.price * M;
    const gain = (leg.open - q.price) * M;
    s.realized += gain;
    s.bySide[side].realized += gain;
    s.paid += cost;
    // تسویهٔ سررسید کارمزد معامله ندارد؛ پای در سود کارمزد اعمال دارد.
    const fee = q.src === 'intrinsic'
      ? (cfg.fees && q.price > 0 ? leg.strike * M * num(fees?.exercise, 0) : 0)
      : feeOf(cfg, fees, cost);
    s.fees += fee;
    s.bySide[side].fees += fee;
    const t = s.trades.findLast((x) => x.side === side && x.closeDay == null);
    if (t) Object.assign(t, { closeDay: i, closePrice: q.price, closeSrc: q.src, cost, closeFee: fee, realized: gain - t.openFee - fee });
    s.legs[side] = null;
    return null;
  };
  if (a.kind === 'close') {
    for (const side of SIDES) {
      const err = closeLeg(side);
      if (err) return { state, error: err, action: a };
    }
    s.closed = true;
    s.closedAt = i;
    s.reason = reason || (ev?.rec?.kind === 'close' ? ev.rec.why : 'manual');
    s.finalPnl = s.realized - s.fees;
    return { state: s, action: a };
  }
  if (a.kind === 'roll') {
    const side = a.side;
    if (!SIDES.includes(side)) return { state, error: 'سمت تعدیل نامعتبر است.', action: a };
    if (a.strike != null) {
      const K = num(a.strike, NaN);
      const otherLeg = s.legs[other(side)];
      if (otherLeg && (side === 'put' ? K > otherLeg.strike + EPS : K < otherLeg.strike - EPS)) {
        return { state, error: 'این قیمت اعمال از سمت مقابل رد می‌شود (استرانگل وارونه).', action: a };
      }
      const q = priceAt(ctx, i, side, K);
      if (!q) return { state, error: `قیمت ${SIDE_FA[side]} ${K} امروز نیست.`, action: a };
      const err = closeLeg(side);
      if (err) return { state, error: err, action: a };
      const credit = q.price * M;
      const fee = feeOf(cfg, fees, credit);
      s.legs[side] = { strike: K, open: q.price, openDay: i, src: q.src };
      s.trades.push({ side, strike: K, openDay: i, openPrice: q.price, openSrc: q.src, premium: credit, openFee: fee });
      s.received += credit;
      s.bySide[side].received += credit;
      s.fees += fee;
      s.bySide[side].fees += fee;
    } else {
      const err = closeLeg(side);
      if (err) return { state, error: err, action: a };
    }
    if (!s.legs.call && !s.legs.put) {
      s.closed = true; s.closedAt = i; s.reason = 'manual'; s.finalPnl = s.realized - s.fees;
      return { state: s, action: a };
    }
    s.adjustments += 1;
    // ۳.۲.۳: مبنای آستانهٔ بعدی، سود و زیانِ همین لحظه پس از تعدیل.
    let unreal = 0;
    for (const sd of SIDES) {
      const leg = s.legs[sd];
      if (!leg) continue;
      const q = priceAt(ctx, i, sd, leg.strike);
      unreal += q ? (leg.open - q.price) * M : 0;
    }
    s.refPnl = s.realized + unreal - s.fees;
    return { state: s, action: a };
  }
  return { state, action: { kind: 'hold' } };
}

// ═════════════════════════ روز خروج ═════════════════════════

/**
 * بستن روز آخر.
 *
 * اگر یکی از پاهای باز در روز خروج معامله نشده باشد، هیچ قیمتی جایش ساخته
 * نمی‌شود. با `exitFallback: 'lastPriced'` خروج به آخرین روزِ پیش از آن
 * می‌رود که **همهٔ** پاهای باز قیمت پایانیِ واقعی داشتند — روزی واقعی با
 * قیمت واقعی. چون پاها از روزِ گشایش تا آخر دست نخورده‌اند (هر تعدیلی
 * `openDay` را جلو می‌برد)، بستن در آن روز با همان وضعیت معتبر است. علتش
 * `exitEarly` است تا رابط بگوید چرا روز بستن با روز خروج یکی نیست.
 */
export function settleLast(ctx, cfg, state, last, ev, fees = {}) {
  // قیمت بازخرید روز خروج با مبنای خروج؛ پای بی‌قیمت `null` می‌ماند تا
  // `applyAction` خطا بدهد و قاعدهٔ «آخرین روزِ قیمت‌دار» برسد.
  const withExit = (e, i) => {
    if (!cfg.exitBasis || cfg.exitBasis === 'close') return e;
    const marks = { ...e.marks };
    for (const sd of SIDES) {
      const leg = state.legs[sd];
      if (!leg) continue;
      marks[sd] = tradePrice(ctx, i, sd, leg.strike, cfg.exitBasis, sd === 'call' ? cfg.manualExitCall : cfg.manualExitPut, cfg.manualFree);
    }
    return { ...e, marks };
  };
  const exitEv = withExit(ev, last);
  const blank = SIDES.some((sd) => state.legs[sd] && !exitEv.marks[sd]);
  const res = blank ? { state } : applyAction(ctx, cfg, state, last, { kind: 'close' }, exitEv, fees, ev.rec.why);
  if (res.state.closed) return { state: res.state, at: last, action: res.action };
  if (cfg.exitFallback === 'lastPriced') {
    const from = Math.max(...SIDES.map((sd) => state.legs[sd]?.openDay ?? 0));
    for (let j = last - 1; j > from; j -= 1) {
      const evj = withExit(evaluateDay(ctx, cfg, state, j), j);
      if (SIDES.some((sd) => state.legs[sd] && !evj.marks[sd])) continue;
      const r = applyAction(ctx, cfg, state, j, { kind: 'close' }, evj, fees, 'exitEarly');
      if (r.state.closed) return { state: r.state, at: j, action: r.action, early: true };
    }
  }
  return {
    state: { ...state, closed: true, closedAt: last, reason: 'incomplete', finalPnl: NaN },
    at: last, action: { kind: 'close' }, error: res.error,
  };
}

// ═════════════════════════ مسیر ═════════════════════════

/**
 * سیاست‌های آماده برای روزهایی که کاربر تصمیمی ثبت نکرده.
 *   algo        همیشه پیشنهاد الگوریتم
 *   exitsOnly   فقط حد سود/ضرر و خروج استرادل؛ بدون تعدیل
 *   hold        هیچ کاری تا روز خروج
 */
export const POLICIES = {
  algo: { label: 'الگوریتم کامل', decide: (ev) => ev.rec.action },
  exitsOnly: { label: 'فقط حد سود و ضرر', decide: (ev) => (ev.rec.kind === 'close' ? ev.rec.action : { kind: 'hold' }) },
  hold: { label: 'نگه‌داشتن تا پایان', decide: () => ({ kind: 'hold' }) },
};

/**
 * اجرای کامل یک مسیر.
 *
 * `decide(i, ev, state)` اقدام روز `i` را می‌دهد. روز آخر همیشه بسته
 * می‌شود. `upTo` برای حالت تعاملی است: روزهای پیش از آن اجرا می‌شوند و
 * ارزیابیِ خودِ آن روز به‌عنوان «در انتظار تصمیم» برمی‌گردد.
 */
export function runPath(ctx, cfg, entry, { decide = () => null, upTo = Infinity, fees = {}, entryDay = 0 } = {}) {
  const days = ctx.market.days;
  const opened = openPosition(ctx, cfg, entry, entryDay, fees);
  if (opened.error) return { error: opened.error, steps: [], series: [] };
  let state = opened.state;
  const steps = [];
  const series = new Array(days.length).fill(NaN);
  const sides = { call: new Array(days.length).fill(NaN), put: new Array(days.length).fill(NaN) };
  const noteSides = (st, i) => {
    const b = sideBreakdown(ctx, cfg, st, i);
    sides.call[i] = b.call.cum;
    sides.put[i] = b.put.cum;
    return b;
  };
  const entryEv = evaluateDay(ctx, cfg, state, entryDay);
  series[entryDay] = entryEv.pnl;
  steps.push({ i: entryDay, date: days[entryDay].date, ev: entryEv, action: { kind: 'open' }, state, pnl: entryEv.pnl, sides: noteSides(state, entryDay) });
  let pending = null;
  for (let i = entryDay + 1; i < days.length; i += 1) {
    if (state.closed) { series[i] = state.finalPnl; noteSides(state, i); continue; }
    const ev = evaluateDay(ctx, cfg, state, i);
    if (i >= upTo && !ev.isLast) { pending = { i, ev, state, sides: noteSides(state, i) }; series[i] = ev.pnl; break; }
    if (ev.isLast) {
      const fin = settleLast(ctx, cfg, state, i, ev, fees);
      state = fin.state;
      const step = { i, date: days[i].date, ev, wanted: { kind: 'close' }, action: fin.action, error: '', state,
        exitAt: fin.at, early: !!fin.early, incomplete: state.reason === 'incomplete', pnl: state.finalPnl };
      // خروجِ زودتر: از روز بستن به بعد، سری همان سود نهایی است.
      for (let k = fin.at; k <= i; k += 1) { series[k] = state.finalPnl; noteSides(state, k); }
      for (const s of steps) if (s.i > fin.at) { s.pnl = state.finalPnl; s.sides = sideBreakdown(ctx, cfg, state, s.i); }
      step.sides = sideBreakdown(ctx, cfg, state, i);
      steps.push(step);
      continue;
    }
    let wanted = decide(i, ev, state);
    if (ev.missing.length && wanted && wanted.kind !== 'hold') wanted = { kind: 'hold', blocked: true };
    const res = applyAction(ctx, cfg, state, i, wanted, ev, fees, '');
    const step = { i, date: days[i].date, ev, wanted, action: res.action, error: res.error || '', state: res.state };
    state = res.state;
    step.pnl = state.closed ? state.finalPnl : evaluateDay(ctx, cfg, state, i).pnl;
    step.sides = noteSides(state, i);
    series[i] = step.pnl;
    steps.push(step);
  }
  const final = state.closed ? state.finalPnl : NaN;
  return { steps, series, sides, state, pending, final, done: state.closed };
}

/** تصمیم‌گیرِ ترکیبی: تصمیم ثبت‌شدهٔ کاربر، و سیاست برای بقیه. */
export function planDecider(decisions = {}, policy = 'hold') {
  const fallback = POLICIES[policy]?.decide || POLICIES.hold.decide;
  // تصمیمی که «پیشنهاد الگوریتم» بوده (`via: 'algo'`) در بازپخش دوباره از
  // پیشنهادِ همان روز ساخته می‌شود: اگر کاربر روزی پیش‌تر را عوض کرد،
  // «پیروی از الگوریتم» در روزهای بعد هم معنای خودش را نگه می‌دارد.
  return (i, ev) => {
    const own = decisions[ev.date];
    if (!own) return fallback(ev);
    return own.via === 'algo' ? ev.rec.action : own;
  };
}

/** خلاصهٔ آماری یک مسیر برای کارت و جدول. */
export function pathStats(run, capital) {
  const vals = run.series.filter(fin);
  const min = vals.length ? Math.min(...vals) : NaN;
  const max = vals.length ? Math.max(...vals) : NaN;
  return {
    final: run.final, min, max,
    finalPct: capital > 0 && fin(run.final) ? (run.final / capital) * 100 : NaN,
    minPct: capital > 0 && fin(min) ? (min / capital) * 100 : NaN,
    adjustments: run.state?.adjustments ?? 0,
    reason: run.state?.reason || '',
    closedAt: run.state?.closedAt ?? -1,
  };
}

// ═════════════════════════ سرمایه (۱.۰) ═════════════════════════

/**
 * وجه تضمین استرانگل در روز `i` از همان موتور `strategyMargin` (قاعدهٔ
 * ترکیبی فروش کال و پوت). سرمایه = ضریب × وجه تضمین روز ورود.
 */
export function labMargin(ctx, cfg, legs, i, params = DEFAULT_PARAMS) {
  const day = ctx.market.days[i];
  if (!day) return NaN;
  const list = [];
  for (const side of SIDES) {
    const leg = legs?.[side];
    if (!leg) continue;
    const q = priceAt(ctx, i, side, leg.strike);
    if (!q) return NaN;
    list.push({ side: 'sell', kind: side, strike: leg.strike, price: q.price, size: ctx.market.size, ratio: cfg.qty, days: day.dte });
  }
  if (!list.length) return 0;
  return strategyMargin(list, { S: day.S, params, contractSize: ctx.market.size, capitalMode: 'GROSS' }).margin;
}

/**
 * مبنای «درصد سود و زیان» — همان منطق بقیهٔ برنامه (`capitalBase` در
 * `core/margin.mjs`، که تب تحلیل تاریخی و رصد هم با آن بازده می‌سازند):
 * برای موقعیت بستانکار با زیان نامحدود مثل استرانگل فروش، سرمایهٔ درگیر =
 * وجه تضمین بلوکه‌شده؛ با `capitalMode: 'NET'` (پیش‌فرض تنظیمات) منهای
 * پرمیوم دریافتی. درصد سود و زیان = سود و زیان ÷ همین عدد.
 */
export function labReturnBase(ctx, cfg, legs, i, params = DEFAULT_PARAMS, capitalMode = 'NET') {
  const day = ctx.market.days[i];
  if (!day) return { value: NaN, label: '' };
  const list = [];
  for (const side of SIDES) {
    const leg = legs?.[side];
    if (!leg) continue;
    list.push({ side: 'sell', kind: side, strike: leg.strike, price: leg.open, size: ctx.market.size, ratio: cfg.qty, days: day.dte });
  }
  if (!list.length) return { value: NaN, label: '' };
  const m = strategyMargin(list, { S: day.S, params, contractSize: ctx.market.size, capitalMode });
  return capitalBase({ legs: list, netCash: m.grossCash, marginNet: m.marginNet, maxLoss: Infinity });
}

// ═════════════════════════ همهٔ مسیرها ═════════════════════════

export const BRANCH_OPTIONS = {
  algo: 'پیشنهاد الگوریتم',
  hold: 'نگه‌داشتن',
  close: 'بستن کامل',
  defend: 'رول سمت زیان‌ده به دورتر',
};

/**
 * «دفاع»: سمت زیان‌ده یک قیمت اعمال دورتر از بازار رول می‌شود — تکنیک رایج
 * دوم کنار الگوریتم، تا مقایسه فقط بین «کار الگوریتم» و «هیچ کار» نباشد.
 */
export function defendAction(ctx, state, i, ev) {
  const side = ev.losing;
  if (!side || !state.legs[side]) return null;
  const cur = state.legs[side].strike;
  const list = ctx.market.strikes.filter((s) => s[side] && (side === 'call' ? s.strike > cur + EPS : s.strike < cur - EPS));
  const next = side === 'call' ? list[0] : list[list.length - 1];
  if (!next || !priceAt(ctx, i, side, next.strike)) return null;
  return { kind: 'roll', side, strike: next.strike };
}

function resolveOption(ctx, state, i, ev, opt) {
  if (opt === 'algo') return ev.rec.action;
  if (opt === 'hold') return { kind: 'hold' };
  if (opt === 'close') return { kind: 'close' };
  if (opt === 'defend') return defendAction(ctx, state, i, ev);
  return null;
}

/**
 * همهٔ مسیرهای ممکن، با سقف.
 *
 * `mode: 'trigger'` فقط در روزی انشعاب می‌دهد که الگوریتم کاری پیشنهاد
 * کرده (تعدیل یا خروج)؛ `'every'` در هر روز. انشعاب‌های هم‌نتیجه یکی
 * می‌شوند. وقتی شمار مسیرها به سقف رسید، از آن به بعد فقط شاخهٔ اول
 * (پیشنهاد الگوریتم) دنبال می‌شود و `truncated` روشن می‌شود.
 *
 * `prefix` و `branchFrom`: تا روز `branchFrom` تصمیم‌های ثبت‌شدهٔ کاربر
 * اجرا می‌شوند و انشعاب از همان روز شروع می‌شود — «از امروزِ آزمایش به
 * بعد چه می‌شد».
 */
export function enumeratePaths(ctx, cfg, entry, { mode = 'trigger', options = ['algo', 'hold', 'close'], cap = 2000, fees = {}, entryDay = 0, prefix = null, branchFrom = 0 } = {}) {
  const days = ctx.market.days;
  const opened = openPosition(ctx, cfg, entry, entryDay, fees);
  if (opened.error) return { error: opened.error, paths: [] };
  const start = opened.state;
  const n = days.length;
  const series = new Float64Array(n).fill(NaN);
  const choices = [];
  const paths = [];
  let truncated = false;
  let nodes = 0;
  series[entryDay] = evaluateDay(ctx, cfg, start, entryDay).pnl;

  const leaf = (state) => {
    paths.push({
      id: paths.length,
      choices: choices.slice(),
      series: Array.from(series),
      final: state.closed ? state.finalPnl : NaN,
      adjustments: state.adjustments,
      reason: state.reason,
      closedAt: state.closedAt,
    });
  };

  const walk = (state, i) => {
    if (i >= n) { leaf(state); return; }
    if (state.closed) {
      for (let j = i; j < n; j += 1) series[j] = state.finalPnl;
      leaf(state);
      return;
    }
    nodes += 1;
    const ev = evaluateDay(ctx, cfg, state, i);
    let acts;
    if (ev.isLast) acts = [{ kind: 'close' }];
    else if (i < branchFrom) {
      // پیش از نقطهٔ انشعاب، همان تصمیم‌های ثبت‌شده — بی شاخه.
      const fixed = prefix ? prefix(i, ev, state) : null;
      acts = [fixed && !ev.missing.length ? fixed : { kind: 'hold' }];
    }
    else if (ev.missing.length) acts = [{ kind: 'hold' }];
    else if (slForced(cfg, ev)) acts = [{ kind: 'close' }];
    else if (mode === 'trigger' && ev.rec.kind === 'hold') acts = [{ kind: 'hold' }];
    else {
      const seen = new Set();
      acts = [];
      // «ترکیبی»: روز آرام فقط نگه‌داشتن یا بستن؛ روزی که الگوریتم کاری
      // پیشنهاد کرده همهٔ گزینه‌ها. «بستن» مسیر را تمام می‌کند، پس شمار
      // مسیرها با روزها خطی می‌ماند و فقط روزهای تصمیم ضرب می‌کنند.
      const allowed = mode === 'mixed' && ev.rec.kind === 'hold'
        ? options.filter((o) => o === 'hold' || o === 'close' || o === 'algo') : options;
      for (const opt of allowed) {
        const a = resolveOption(ctx, state, i, ev, opt);
        if (!a) continue;
        const key = actionKey(a);
        if (seen.has(key)) continue;
        seen.add(key);
        acts.push({ ...a, opt });
      }
      if (!acts.length) acts = [{ kind: 'hold' }];
    }
    let cut = false;
    if (acts.length > 1 && paths.length + 1 >= cap) { truncated = true; cut = true; acts = acts.slice(0, 1); }
    if (ev.isLast) {
      const fin = settleLast(ctx, cfg, state, i, ev, fees);
      for (let k = fin.at; k <= i; k += 1) series[k] = fin.state.finalPnl;
      walk(fin.state, i + 1);
      return;
    }
    for (const a of acts) {
      const res = applyAction(ctx, cfg, state, i, a, ev, fees, '');
      const next = res.state;
      series[i] = next.closed ? next.finalPnl : evaluateDay(ctx, cfg, next, i).pnl;
      // انشعاب، و هر اقدامِ غیرِ نگه‌داشتن (حتی بی‌انشعاب) ثبت می‌شود تا
      // بارگذاریِ همین مسیر با «نگه‌داشتن برای بقیه» دقیقاً بازسازی شود.
      const branched = acts.length > 1 || cut || res.action.kind !== 'hold';
      if (branched) choices.push({ i, date: days[i].date, key: actionKey(res.action), opt: a.opt, action: res.action, why: ev.rec.why });
      walk(next, i + 1);
      if (branched) choices.pop();
      if (paths.length >= cap * 4) { truncated = true; return; }
    }
  };
  walk(start, entryDay + 1);
  return { paths, truncated, nodes, cap };
}

/** صدک‌ها و نسبت‌ها روی نتیجهٔ نهایی مسیرها. */
export function pathsSummary(paths = []) {
  const finals = paths.map((p) => p.final).filter(fin).sort((a, b) => a - b);
  const q = (p) => {
    if (!finals.length) return NaN;
    const at = (finals.length - 1) * p;
    const lo = Math.floor(at), hi = Math.ceil(at);
    return finals[lo] + (finals[hi] - finals[lo]) * (at - lo);
  };
  const mean = finals.length ? finals.reduce((a, b) => a + b, 0) / finals.length : NaN;
  return {
    count: paths.length, known: finals.length, unknown: paths.length - finals.length,
    min: finals[0] ?? NaN, max: finals[finals.length - 1] ?? NaN,
    p10: q(0.1), p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9), mean,
    winRate: finals.length ? (finals.filter((v) => v > 0).length / finals.length) * 100 : NaN,
  };
}

/** رتبهٔ صدکیِ یک عدد میان نتیجه‌ها: چند درصد مسیرها بدتر بودند. */
export function percentileOf(paths = [], value) {
  const finals = paths.map((p) => p.final).filter(fin);
  if (!finals.length || !fin(value)) return NaN;
  return (finals.filter((v) => v < value - EPS).length / finals.length) * 100;
}

/**
 * «اگر آن روز کار دیگری می‌کردم»: برای هر روزِ مسیر کاربر و هر گزینه،
 * نتیجهٔ نهایی — با همان تصمیم‌های کاربر تا روز قبل، گزینهٔ دیگر در همان
 * روز، و سیاستِ `continuation` از روز بعد (`user` یعنی بازپخش تصمیم‌های
 * بعدی خودِ کاربر).
 */
export function whatIfMatrix(ctx, cfg, entry, decisions = {}, { options = ['algo', 'hold', 'close', 'defend'], continuation = 'algo', fallback = 'hold', fees = {}, entryDay = 0, upTo = Infinity } = {}) {
  const base = runPath(ctx, cfg, entry, { decide: planDecider(decisions, fallback), fees, entryDay, upTo });
  if (base.error) return { error: base.error, rows: [] };
  const rows = [];
  const cont = continuation === 'user' ? planDecider(decisions, fallback) : planDecider({}, continuation);
  for (const step of base.steps) {
    if (step.i <= entryDay || step.ev.isLast || step.ev.missing.length || step.ev.closed) continue;
    const prior = steps0(base.steps, step.i);
    const cells = [];
    for (const opt of options) {
      const a = resolveOption(ctx, prior, step.i, step.ev, opt);
      if (!a) { cells.push({ opt, action: null, final: NaN }); continue; }
      const run = runPath(ctx, cfg, entry, {
        fees, entryDay,
        decide: (i, ev, st) => (i < step.i ? planDecider(decisions, fallback)(i, ev, st) : i === step.i ? a : cont(i, ev, st)),
      });
      cells.push({ opt, action: a, key: actionKey(a), final: run.final, series: run.series });
    }
    rows.push({ i: step.i, date: step.date, chosen: actionKey(step.action), rec: step.ev.rec, cells });
  }
  return { rows, base };
}

// ═════════════════════════ اثر نقدی و وجه تضمین ═════════════════════════

/**
 * هر گزینه چه می‌کند — به پول.
 *
 *   cash         نقد امروز: پرمیوم فروش منهای هزینهٔ بازخرید (بی کارمزد)
 *   netCash      همان، پس از کارمزد
 *   realizedNow  سودی که با همین اقدام قطعی می‌شود
 *   marginBefore / marginAfter / marginDelta  وجه تضمین پیش و پس از اقدام
 *   netNeed      نیاز خالص به وجه = افزایش وجه تضمین − نقد خالص امروز؛
 *                منفی یعنی وجه آزاد می‌شود
 */
export function actionImpact(ctx, cfg, state, i, ev, action, fees = {}, params = DEFAULT_PARAMS) {
  const res = applyAction(ctx, cfg, state, i, action, ev, fees);
  if (res.error) return { error: res.error };
  const s = res.state;
  const cash = (s.received - state.received) - (s.paid - state.paid);
  const fee = s.fees - state.fees;
  const marginBefore = labMargin(ctx, cfg, state.legs, i, params);
  const marginAfter = s.closed ? 0 : labMargin(ctx, cfg, s.legs, i, params);
  const after = s.closed ? null : evaluateDay(ctx, cfg, s, i);
  return {
    state: s, action: res.action, cash, fee, netCash: cash - fee,
    realizedNow: s.realized - state.realized,
    marginBefore, marginAfter, marginDelta: marginAfter - marginBefore,
    netNeed: (marginAfter - marginBefore) - (cash - fee),
    pnlAfter: s.closed ? s.finalPnl : after.pnl,
    maxProfit: after ? after.maxProfit : NaN,
    closed: s.closed,
  };
}

/**
 * ارزش هر اقدامِ یک مسیر: نتیجهٔ نهایی با آن اقدام منهای نتیجهٔ همان مسیر
 * وقتی فقط همان روز «نگه‌داشتن» شود. مثبت یعنی آن اقدام سود آورد.
 */
export function actionValues(ctx, cfg, entry, decisions = {}, { fees = {}, entryDay = 0 } = {}) {
  const base = runPath(ctx, cfg, entry, { decide: planDecider(decisions, 'hold'), fees, entryDay });
  if (base.error) return { error: base.error, items: [] };
  const days = ctx.market.days;
  const endAt = base.state.closedAt >= 0 ? base.state.closedAt : days.length - 1;
  const items = [];
  base.steps.forEach((step, k) => {
    if (step.i <= entryDay || step.ev.isLast || !step.action || step.action.kind === 'hold') return;
    const without = { ...decisions, [step.date]: { kind: 'hold' } };
    const alt = runPath(ctx, cfg, entry, { decide: planDecider(without, 'hold'), fees, entryDay });
    const before = base.steps[k - 1].state;
    items.push({
      i: step.i, date: step.date, action: step.action, why: step.ev.rec.why,
      value: base.final - alt.final, altFinal: alt.final,
      cash: (step.state.received - before.received) - (step.state.paid - before.paid),
      sMoveAfter: days[endAt] && days[step.i] ? ((days[endAt].S - days[step.i].S) / days[step.i].S) * 100 : NaN,
      sAt: days[step.i].S,
    });
  });
  return { base, items };
}

// ═════════════════════════ کارنامه ═════════════════════════

export const GRADE_BANDS = [
  [90, 'A', 'عالی'], [75, 'B', 'خوب'], [55, 'C', 'متوسط'], [35, 'D', 'ضعیف'], [-Infinity, 'E', 'بسیار ضعیف'],
];

export function gradeOf(score) {
  if (!fin(score)) return { letter: '—', label: 'نامعلوم' };
  const [, letter, label] = GRADE_BANDS.find(([min]) => score >= min);
  return { letter, label };
}

/**
 * کارنامهٔ پایان معامله.
 *
 * همهٔ کارهای ممکن از روز ورود تا خروج شمرده می‌شوند (روز آرام: نگه‌داشتن
 * یا بستن؛ روز تصمیم: همهٔ گزینه‌ها). نمرهٔ مسیر کاربر میانگین دو عدد است:
 *   صدک     چند درصد مسیرها بدتر از مسیر کاربر بودند
 *   کارایی  جای نتیجهٔ کاربر میان بدترین و بهترین (۰ تا ۱۰۰)
 * بهترین مسیرها با ارزش تک‌تک اقدام‌هایشان برمی‌گردند تا «چرا» گفته شود؛
 * و هر روزِ تصمیم کاربر با بهترین گزینهٔ همان روز سنجیده می‌شود (پشیمانی).
 */
export function gradeReport(ctx, cfg, entry, decisions = {}, { fees = {}, cap = 20000, options = ['algo', 'hold', 'close', 'defend'], top = 5, entryDay = 0 } = {}) {
  const all = enumeratePaths(ctx, cfg, entry, { mode: 'mixed', options, cap, fees, entryDay });
  if (all.error) return { error: all.error };
  const mine = runPath(ctx, cfg, entry, { decide: planDecider(decisions, 'hold'), fees, entryDay });
  const algo = runPath(ctx, cfg, entry, { decide: planDecider({}, 'algo'), fees, entryDay });
  const summary = pathsSummary(all.paths);
  const percentile = percentileOf(all.paths, mine.final);
  const span = summary.max - summary.min;
  const efficiency = fin(mine.final) && span > EPS ? ((mine.final - summary.min) / span) * 100 : fin(mine.final) ? 100 : NaN;
  const score = fin(percentile) && fin(efficiency) ? Math.round((percentile + efficiency) / 2) : NaN;
  const better = all.paths.filter((p) => fin(p.final) && p.final > mine.final + EPS).length;
  const versus = compareFinals(all.paths, mine.final);

  const seen = new Set();
  const best = [];
  for (const p of [...all.paths].filter((x) => fin(x.final)).sort((a, b) => b.final - a.final)) {
    const plan = {};
    for (const c of p.choices) plan[c.date] = { ...c.action, via: 'path' };
    const key = JSON.stringify(plan);
    if (seen.has(key)) continue;
    seen.add(key);
    const vals = actionValues(ctx, cfg, entry, plan, { fees, entryDay });
    best.push({ path: p, plan, final: p.final, run: vals.base, items: vals.items });
    if (best.length >= top) break;
  }

  const wi = whatIfMatrix(ctx, cfg, entry, decisions, { options, continuation: 'user', fallback: 'hold', fees, entryDay });
  const review = (wi.rows || []).map((row) => {
    const cells = row.cells.filter((c) => c.action && fin(c.final));
    const chosen = row.cells.find((c) => c.key === row.chosen && fin(c.final));
    const top1 = cells.reduce((a, b) => (!a || b.final > a.final ? b : a), null);
    return {
      i: row.i, date: row.date, rec: row.rec, chosenKey: row.chosen,
      chosenFinal: chosen ? chosen.final : mine.final,
      bestOpt: top1?.opt, bestAction: top1?.action, bestFinal: top1?.final ?? NaN,
      regret: top1 && fin(top1.final) ? Math.max(0, top1.final - (chosen ? chosen.final : mine.final)) : NaN,
      followedAlgo: actionKey(row.rec?.action) === row.chosen,
    };
  });
  const mineValues = actionValues(ctx, cfg, entry, decisions, { fees, entryDay });
  return {
    count: all.paths.length, truncated: all.truncated, summary,
    mine, algo, percentile, efficiency, score, grade: gradeOf(score), rank: better + 1, versus,
    best, review, mineItems: mineValues.items, paths: all.paths,
  };
}

/**
 * چند مسیر بدتر، برابر یا بهتر از یک نتیجه — برابرها جدا، تا متن کارنامه
 * «هر بستن زودتر سود را از دست می‌داد» نگوید وقتی چند بستن زودتر دقیقاً همان
 * نتیجه را داشتند. `filter` زیرمجموعهٔ مسیرها را می‌گیرد (مثلاً فقط آن‌هایی
 * که اقدامی کردند).
 */
export function compareFinals(paths = [], value, filter = null) {
  const out = { worse: 0, equal: 0, better: 0, known: 0 };
  if (!fin(value)) return out;
  for (const p of paths) {
    if (!fin(p.final) || (filter && !filter(p))) continue;
    out.known += 1;
    if (p.final < value - EPS) out.worse += 1;
    else if (p.final > value + EPS) out.better += 1;
    else out.equal += 1;
  }
  return out;
}

/** وضعیتِ آغاز روز `i` در مسیرِ اجراشده. */
function steps0(steps, i) {
  let st = steps[0].state;
  for (const s of steps) {
    if (s.i >= i) break;
    st = s.state;
  }
  return st;
}

/** برچسب کوتاه یک اقدام برای تراشه‌ها و جدول‌ها (بی رقم؛ رقم را رابط فارسی می‌کند). */
export function actionLabel(a) {
  if (!a || a.kind === 'hold') return 'نگه‌داشتن';
  if (a.kind === 'close') return 'بستن کامل';
  if (a.kind === 'algo') return 'پیشنهاد الگوریتم';
  if (a.kind === 'open') return 'ورود';
  if (a.kind === 'roll') return a.strike == null ? `بستن ${SIDE_FA[a.side]}` : `رول ${SIDE_FA[a.side]} به`;
  return '—';
}

export const CLOSE_REASON = {
  exit: 'روز خروج', expiry: 'سررسید', sl: 'حد ضرر', slSoft: 'حد ضرر', tp: 'حد سود',
  straddleLate: 'خروج به‌علت عدم توازن پرمیوم استرادل', straddleEarlyClose: 'استرادل ناپایدار',
  manual: 'بستن دستی', incomplete: 'قیمت روز آخر نبود',
  exitEarly: 'خروج در آخرین روزِ قیمت‌دار', '': '—',
};

/**
 * صاحبِ یک «قیمت انتخابی»: نماد، سررسید، قیمت اعمالِ همان سمت و روزِ
 * ورود یا خروج. عددِ انتخابی فقط برای همین قرارداد در همین روز معنا دارد؛
 * صاحب که عوض شد، عدد هم باید عوض شود (`ui/tabs/strangle-lab.mjs`،
 * `syncManual`). گزارش ۱۴۰۵/۰۷/۱۶: ۴۸۹۰ِ کالِ نمادِ قبلی روی کالِ نمادِ
 * تازه (دامنهٔ ۴۳ تا ۶۹) ماند و آزمایش اجرا نشد.
 */
export function manualOwnerKey(draft = {}, side = 'call', date = 0) {
  const strike = draft.entry?.[side];
  return [draft.uaIns || '', Number(draft.expiry) || 0, side, strike == null ? '' : Number(strike), Number(date) || 0].join('|');
}

/**
 * «قیمت انتخابی»ها را با قراردادِ فعلیِ پیش‌نویس هم‌گام می‌کند.
 *
 * `draft.cfg` و `draft.manualOwner` را در جا عوض می‌کند. `days` همان
 * `market.days` است (روز اول = ورود، روز آخر = خروج؛ هر روز `call`/`put`
 * به شکلِ قیمت اعمال → قیمت). فیلدی که صاحبش عوض شده پاک می‌شود؛ فیلدِ
 * خالی، اگر مبنا «انتخابی» است، از پایانیِ همان قرارداد پر می‌شود. فیلدی که
 * صاحبش هنوز ثبت نشده (پیش‌نویسِ ساخته‌شده از آزمایشِ ذخیره‌شده) فقط ثبت
 * می‌شود، پاک نه.
 */
export function syncManualPrices(draft, days = []) {
  if (!draft?.cfg) return draft;
  const first = days[0], last = days[days.length - 1];
  const owners = draft.manualOwner || (draft.manualOwner = {});
  const fields = [
    ['manualEntryCall', 'call', first, draft.cfg.entryBasis], ['manualEntryPut', 'put', first, draft.cfg.entryBasis],
    ['manualExitCall', 'call', last, draft.cfg.exitBasis], ['manualExitPut', 'put', last, draft.cfg.exitBasis],
  ];
  for (const [key, side, day, basis] of fields) {
    const owner = manualOwnerKey(draft, side, day?.date);
    if (key in owners && owners[key] !== owner) draft.cfg[key] = 0;
    owners[key] = owner;
    const strike = draft.entry?.[side];
    if (basis === 'manual' && !(draft.cfg[key] > 0) && strike != null) {
      const v = day?.[side]?.[strike];
      if (v > 0) draft.cfg[key] = v;
    }
  }
  return draft;
}
