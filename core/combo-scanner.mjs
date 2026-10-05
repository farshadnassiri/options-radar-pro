// اسکنر آپشن — ترکیب آزاد سهم پایه، کال و پوت با نسبت‌های مختلف.
//
// ═══ خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۳) ═══
//
// «اسکنر آپشن دنبال استراتژی آماده نمی‌گردد. سهم پایه، کال و پوت را با
// نسبت‌های مختلف ترکیب می‌کند و آن‌هایی را که سود می‌دهند مرتب می‌کند؛
// بیشترشان اسم کتابی ندارند.» با قیمت سرخطیِ همان لحظه، کارمزد و وجه
// تضمین؛ فیلتر دید بازار، سرمایه، احتمال سود، زیان و نقدشوندگی؛ و باز
// کردن هر ترکیب با یک کلیک در نمودار سود و زیان.
//
// ═══ چطور ═══
//
//   ۱. پاهای مجاز هر سررسید: کال و پوتِ پنجرهٔ قیمت اعمالِ دور قیمت پایه،
//      به‌اضافهٔ خرید سهم. پای فروش فقط با تقاضای سرخط، پای خرید فقط با
//      عرضهٔ سرخط — یعنی همان قیمتی که همین لحظه قابل اجراست.
//   ۲. همهٔ ترکیب‌های دو (و اگر خواسته شد سه) پایه با نسبت‌های اول‌به‌هم
//      (۱:۱، ۱:۲، ۲:۳، …). نسبت ۲:۴ همان ۱:۲ است و دوباره ساخته نمی‌شود.
//   ۳. غربال ارزان روی سود و زیانِ سررسید: زیان نامحدود (شیب منفی پس از
//      بالاترین اعمال)، زیان بیش از سقف، یا بی هیچ سودی — کنار می‌رود.
//   ۴. بازمانده‌ها با همان `evaluate` بقیهٔ برنامه سنجیده می‌شوند: قیمت
//      اجرا، کارمزد، وجه تضمین طبق ضوابط، سرمایهٔ درگیر، احتمال سود.
//   ۵. فیلترهای کاربر، گروه‌بندی (یک کارت برای هر مجموعهٔ قرارداد، با
//      نسبت‌های دیگرش) و مرتب‌سازی.
//
// هیچ عددی ساخته نمی‌شود: پایی که سرخط ندارد اصلاً وارد نمی‌شود، و هر حذف
// در قیف شمرده می‌شود. خالص است: نه DOM، نه شبکه؛ در ریسهٔ غربال اجرا
// می‌شود.

import { num, EPS } from './num.mjs';
import { evaluate } from './evaluate.mjs';
import { probBelow, impliedVol } from './bs.mjs';
import { feesOf, basisOf, assetClassMap, assetClassOf } from './settings.mjs';
import {
  underlyingQuote, legContractSize, comboContractSize, blockedExpirySet, expiryBlocked,
} from './chain.mjs';

export const SCANNER_VERSION = 1;

/** پیش‌فرض‌ها همان نمونهٔ صاحب پروژه‌اند: احتمال سود ≥ ۶۰٪، زیان هر ست ≤ ۱۰ میلیون ریال. */
export const SCANNER_DEFAULTS = Object.freeze({
  view: 'all',            // all | bull | bear | neutral | vol
  minPop: 60,             // درصد
  maxLossPerSet: 10e6,    // ریال، برای یک ست
  maxCapital: 0,          // ریال؛ صفر یعنی بی‌سقف
  minLiquidity: 2,        // از ۴
  minDays: 5, maxDays: 75,
  maxLegs: 2,             // ۲ یا ۳
  maxRatio: 3,
  strikeWindow: 8,        // نزدیک‌ترین قیمت‌های اعمال به پایه، در هر سررسید
  allowStock: true,
  sort: 'return',         // return | pop
  limit: 300,             // شمار گروه‌های برگشتی (فیلتر نتیجه‌ها روی همین‌ها)
  // شرط اجرا (درخواست صاحب پروژه، دور دوم): «بر اساس اردر بوک و شرایط
  // لحظه‌ای بازار… اگر نمی‌شود سهم یا کال یا پوت را خرید پیشنهاد نده.»
  //   book   فقط با دفتر سفارش زندهٔ پنج‌سطحی و وضعیت «مجاز» همهٔ پاها،
  //          حتی سهم پایه؛ دفتری که از `bookMaxAgeSec` کهنه‌تر است قبول نیست
  //   watch  سرخط دیده‌بان (سطح اول)؛ سریع‌تر، سهم پایه با آخرین قیمت
  execRule: 'book',
  bookMaxAgeSec: 90,
  minSets: 1,             // کمترین ستی که دفتر همین لحظه جا دارد
  maxBuilt: 600000,       // سقف ترکیب ساخته‌شده در یک اسکن
  maxEval: 2500,          // سقف ترکیبی که به ارزیابی کامل می‌رسد
});

export const SCANNER_VIEWS = [
  ['all', 'همه'], ['bull', 'صعودی'], ['bear', 'نزولی'], ['neutral', 'خنثی'], ['vol', 'نوسانی'],
];
export const VIEW_FA = Object.fromEntries(SCANNER_VIEWS);

export const SCANNER_SORTS = [['return', 'بازده بیشتر'], ['pop', 'احتمال سود بیشتر']];

export const EXEC_RULES = [
  ['book', 'فقط شدنی با دفتر سفارش زنده'],
  ['watch', 'سرخط دیده‌بان (سریع‌تر، سهم با آخرین قیمت)'],
];

export function scannerConfig(input = {}) {
  const c = { ...SCANNER_DEFAULTS, ...(input || {}) };
  for (const [k, def] of Object.entries(SCANNER_DEFAULTS)) {
    if (typeof def === 'number') c[k] = Number.isFinite(Number(c[k])) ? Number(c[k]) : def;
    if (typeof def === 'boolean') c[k] = Boolean(c[k]);
  }
  if (!SCANNER_VIEWS.some(([id]) => id === c.view)) c.view = 'all';
  if (!SCANNER_SORTS.some(([id]) => id === c.sort)) c.sort = 'return';
  if (!EXEC_RULES.some(([id]) => id === c.execRule)) c.execRule = 'book';
  c.minSets = Math.max(1, Math.round(c.minSets));
  c.maxLegs = c.maxLegs >= 3 ? 3 : 2;
  c.maxRatio = Math.max(1, Math.min(4, Math.round(c.maxRatio)));
  c.strikeWindow = Math.max(2, Math.min(16, Math.round(c.strikeWindow)));
  if (c.maxDays < c.minDays) c.maxDays = c.minDays;
  return c;
}

export const emptyScanFunnel = () => ({
  expiries: 0, pool: 0, built: 0, unlimited: 0, overLoss: 0, noProfit: 0,
  quickPop: 0, evaluated: 0, unexecutable: 0, filtered: 0, kept: 0, truncated: false, evalCapped: 0,
  noBook: 0, notTradable: 0, stockNoBook: 0,
});

// ═════════════════════════ نسبت‌ها ═════════════════════════

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/** همهٔ چندتایی‌های نسبت با اعضای ۱..max که بزرگ‌ترین مقسوم‌علیه مشترکشان ۱ است. */
export function primitiveRatios(k, max) {
  const out = [];
  const walk = (acc) => {
    if (acc.length === k) { if (acc.reduce(gcd) === 1) out.push([...acc]); return; }
    for (let r = 1; r <= max; r += 1) { acc.push(r); walk(acc); acc.pop(); }
  };
  walk([]);
  return out;
}

// ═════════════════════════ پاها ═════════════════════════

/**
 * پاهای مجاز یک سررسید. هر عضو یک «قرارداد و سمت» است با قیمت سرخطِ همان
 * سمت؛ قراردادی که سرخطِ آن سمت را ندارد، آن سمت را نمی‌سازد.
 */
/**
 * دفتر سفارشِ زنده و قابل اعتماد؟ در شرط `book`: دفتر پنج‌سطحی از
 * `/api/books` آمده (`book` و `bookAt` را روکش ریسه می‌نشاند)، کهنه‌تر از
 * سقف نیست، و وضعیت نماد «مجاز» است (`A…`). وضعیتِ نیامده یعنی نمی‌دانیم،
 * و در این شرط «نمی‌دانیم» پیشنهاد نمی‌شود.
 */
export function liveBook(q, cfg, now) {
  if (!q || !Array.isArray(q.book) || !q.book.length) return { ok: false, why: 'noBook' };
  if (!(num(q.bookAt) > 0) || now - num(q.bookAt) > cfg.bookMaxAgeSec * 1000) return { ok: false, why: 'noBook' };
  if (!String(q.state || '').toUpperCase().startsWith('A')) return { ok: false, why: 'notTradable' };
  return { ok: true };
}

/** سرخطِ یک سمت: از دفتر زنده اگر هست، وگرنه سطح اول دیده‌بان. */
const topOf = (q, side) => {
  const lvl = Array.isArray(q.book) && q.book.length ? q.book[0] : q;
  return side === 'buy' ? { price: num(lvl.ask), qty: num(lvl.askQty) } : { price: num(lvl.bid), qty: num(lvl.bidQty) };
};

export function legPool(ua, ex, cfg, contractSizeDeclared, now = Date.now(), funnel = null) {
  const spot = num(ua.last || ua.close);
  const rows = [...ex.strikeList].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
    .slice(0, cfg.strikeWindow).sort((a, b) => a.strike - b.strike);
  const strict = cfg.execRule === 'book';
  const pool = [];
  for (const row of rows) {
    const sz = legContractSize(row.size, contractSizeDeclared);
    for (const kind of ['call', 'put']) {
      const q = row[kind];
      if (!q || !q.ins) continue;
      if (strict) {
        const lb = liveBook(q, cfg, now);
        if (!lb.ok) { if (funnel) funnel[lb.why] += 1; continue; }
      }
      for (const side of ['buy', 'sell']) {
        const top = topOf(q, side);
        if (top.price > 0 && top.qty > 0) pool.push({ kind, side, strike: row.strike, price: top.price, quote: q, size: sz.size, sizeAssumed: sz.assumed, ins: String(q.ins), name: q.name, rowSize: row.size });
      }
    }
  }
  if (cfg.allowStock) {
    const uq = underlyingQuote(ua);
    // فروش استقراضی سهم در بازار ما نیست؛ فقط خرید. در شرط `book` سهم هم
    // باید عرضهٔ واقعی در دفتر زنده داشته باشد، نه «آخرین قیمت».
    const lb = strict ? liveBook({ ...uq, bookAt: ua.bookAt }, cfg, now) : { ok: true };
    const top = topOf(uq, 'buy');
    if (!lb.ok) { if (funnel) funnel.stockNoBook += 1; }
    else if (top.price > 0 && (!strict || top.qty > 0)) {
      pool.push({ kind: 'underlying', side: 'buy', strike: 0, price: top.price, quote: { ...uq, bookAt: ua.bookAt }, size: 0, ins: String(ua.ins), name: ua.name });
    }
  }
  return pool;
}

// ═════════════════════════ غربال ارزان ═════════════════════════

const valueAt = (leg, S) => (leg.kind === 'call' ? Math.max(0, S - leg.strike)
  : leg.kind === 'put' ? Math.max(0, leg.strike - S) : S);

/**
 * سود و زیان سررسیدِ یک ست، با قیمت سرخط و کارمزد معامله. فقط برای غربال:
 * عدد نهایی از `evaluate` می‌آید.
 *
 *   slopeUp   شیب پس از بالاترین اعمال (منفی = زیان نامحدود)
 *   minPnl    بدترین سود و زیان روی همهٔ نقاط شکست (منفی = زیان)
 *   maxPnl    بهترین (بی‌نهایت اگر شیب بالا مثبت باشد)
 */
export function quickPayoff(legs, fees = {}) {
  let cash = 0, slopeUp = 0;
  const ks = new Set([0]);
  for (const l of legs) {
    const q = (l.side === 'buy' ? 1 : -1) * l.ratio * l.size;
    const notional = Math.abs(q) * l.price;
    cash += -q * l.price - notional * (l.kind === 'underlying' ? num(fees.buyStock) : num(fees.option));
    if (l.kind === 'call' || l.kind === 'underlying') slopeUp += q;
    if (l.kind !== 'underlying') ks.add(l.strike);
  }
  const at = (S) => legs.reduce((a, l) => a + (l.side === 'buy' ? 1 : -1) * l.ratio * l.size * valueAt(l, S), cash);
  const points = [...ks].sort((a, b) => a - b).map((S) => [S, at(S)]);
  let minPnl = Infinity, maxPnl = -Infinity;
  for (const [, v] of points) { minPnl = Math.min(minPnl, v); maxPnl = Math.max(maxPnl, v); }
  if (slopeUp < -EPS) minPnl = -Infinity;
  if (slopeUp > EPS) maxPnl = Infinity;
  return { cash, slopeUp, minPnl, maxPnl, at, points };
}

/**
 * احتمال سود سررسیدِ همان منحنی، با توزیع لگاریتم-نرمال — همان مدلی که
 * `probOfProfit` در `evaluate` دارد، روی منحنی تکه‌ای-خطیِ `quickPayoff`.
 * فقط برای غربال؛ عدد کارت از `evaluate` است.
 */
export function quickPop(qp, S, T, sigma) {
  if (!(S > 0) || !(T > 0) || !(sigma > 0)) return NaN;
  const P = (x) => (x <= 0 ? 0 : x === Infinity ? 1 : probBelow(S, x, T, sigma));
  const pts = qp.points;
  let p = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x0, y0] = pts[i];
    const last = i === pts.length - 1;
    const x1 = last ? Infinity : pts[i + 1][0];
    const y1 = last ? (qp.slopeUp > EPS ? Infinity : qp.slopeUp < -EPS ? -Infinity : y0) : pts[i + 1][1];
    if (y0 > 0 && y1 > 0) { p += P(x1) - P(x0); continue; }
    if (y0 <= 0 && y1 <= 0) continue;
    // ریشه روی این تکه
    const root = last ? x0 + (-y0 / qp.slopeUp) : x0 + ((x1 - x0) * -y0) / (y1 - y0);
    p += y0 > 0 ? P(root) - P(x0) : P(x1) - P(root);
  }
  return Math.max(0, Math.min(1, p)) * 100;
}

/** تلاطم ضمنی نزدیک‌به‌پولِ یک سررسید — جایگزین وقتی تلاطم تاریخی نیامده. */
export function expiryAtmIv(ua, ex, { rFree = 0.3, divYield = 0, yearDays = 365 } = {}) {
  const spot = num(ua.last || ua.close);
  if (!(spot > 0) || !(ex?.days > 0)) return NaN;
  const row = [...ex.strikeList].sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))[0];
  if (!row) return NaN;
  for (const q of [row.call, row.put]) {
    const mid = num(q?.bid) > 0 && num(q?.ask) > 0 ? (q.bid + q.ask) / 2 : num(q?.close || q?.last);
    if (!(mid > 0)) continue;
    const iv = impliedVol(q.kind, mid, spot, row.strike, ex.days / yearDays, rFree, divYield, {});
    if (Number.isFinite(iv) && iv > 0) return iv;
  }
  return NaN;
}

// ═════════════════════════ نام و دید ═════════════════════════

/**
 * اگر ترکیب نام کتابی دارد، همان؛ وگرنه «ترکیب سفارشی» با `named: false`.
 * پاها با نسبت اول‌به‌هم‌اند.
 */
export function classifyCombo(legs) {
  const opt = legs.filter((l) => l.kind !== 'underlying');
  const stock = legs.find((l) => l.kind === 'underlying');
  const named = (name) => ({ name, named: true });
  if (legs.length === 2 && stock && opt.length === 1) {
    const o = opt[0];
    if (o.kind === 'call' && o.side === 'sell') return named(stock.ratio === o.ratio ? 'کاوردکال' : 'کاوردکال نسبتی');
    if (o.kind === 'put' && o.side === 'buy') return named(stock.ratio === o.ratio ? 'پوت محافظ' : 'پوت محافظ نسبتی');
  }
  if (legs.length === 2 && opt.length === 2) {
    const [a, b] = [...opt].sort((x, y) => x.strike - y.strike);
    const sameKind = a.kind === b.kind;
    const oneToOne = a.ratio === b.ratio;
    if (sameKind && a.side !== b.side) {
      const fa = a.kind === 'call' ? 'کال' : 'پوت';
      if (!oneToOne) {
        // فقط نسبت‌های کتابی (۱:۲، ۱:۳) نام دارند؛ ۲:۳ و مانند آن «سفارشی»‌اند.
        if (Math.min(a.ratio, b.ratio) !== 1) return { name: 'ترکیب سفارشی', named: false };
        const more = a.ratio > b.ratio ? a : b;
        return named(more.side === 'buy' ? `بک‌اسپرد ${fa}` : `اسپرد نسبتی ${fa}`);
      }
      const bull = a.side === 'buy';
      return named(`اسپرد ${bull ? 'صعودی' : 'نزولی'} ${fa}`);
    }
    if (!sameKind && oneToOne && a.side === b.side) {
      const same = Math.abs(a.strike - b.strike) < EPS;
      return named(`${a.side === 'buy' ? 'خرید' : 'فروش'} ${same ? 'استرادل' : 'استرانگل'}`);
    }
  }
  if (legs.length === 3 && opt.length === 3 && opt.every((l) => l.kind === opt[0].kind)) {
    const s = [...opt].sort((x, y) => x.strike - y.strike);
    if (s[0].side === s[2].side && s[1].side !== s[0].side && s[1].ratio === 2 && s[0].ratio === 1 && s[2].ratio === 1
      && Math.abs((s[1].strike - s[0].strike) - (s[2].strike - s[1].strike)) < EPS) {
      return named(`پروانه ${s[0].kind === 'call' ? 'کال' : 'پوت'}`);
    }
  }
  return { name: 'ترکیب سفارشی', named: false };
}

/**
 * دید بازار از خودِ منحنی سود و زیان سررسید: اگر پایه ۱۰٪ بالا یا پایین
 * برود نتیجه از «ثابت ماندن» بهتر می‌شود یا بدتر.
 */
export function marketView(at, S) {
  if (!(S > 0) || typeof at !== 'function') return 'neutral';
  const mid = at(S), up = at(S * 1.1), dn = at(S * 0.9);
  const span = Math.max(Math.abs(mid), Math.abs(up), Math.abs(dn), 1);
  const tol = span * 0.05;
  const upBetter = up > mid + tol, dnBetter = dn > mid + tol;
  const upWorse = up < mid - tol, dnWorse = dn < mid - tol;
  if (upBetter && dnBetter) return 'vol';
  if (upBetter) return 'bull';
  if (dnBetter) return 'bear';
  // هیچ سمتی بهتر نیست: اگر فقط یک سمت بدتر است، ترکیب به سمت دیگر
  // تمایل دارد (مثلاً اسپرد نزولیِ در سود که با بالا رفتن پایه می‌بازد).
  if (upWorse && !dnWorse) return 'bear';
  if (dnWorse && !upWorse) return 'bull';
  return 'neutral';
}

/**
 * نقدشوندگی از ۴، از چهار پرسش ساده دربارهٔ پاهای اختیار:
 *   ۱. همهٔ پاها امروز معامله شده‌اند
 *   ۲. بدترین اسپرد سرخط زیر ۱۰٪ است
 *   ۳. سرخط دست‌کم برای ۳ ست جا دارد
 *   ۴. پاهای فروش موقعیت باز دارند (بازار زنده، نه تابلوی خالی)
 */
export function liquidityScore(row, legs) {
  const opts = legs.filter((l) => l.kind !== 'underlying');
  const parts = [
    ['معامله امروز', opts.every((l) => num(l.quote?.trades) > 0 || num(l.quote?.vol) > 0)],
    ['اسپرد زیر ۱۰٪', Number.isFinite(row.spreadWorstPct) && row.spreadWorstPct <= 10],
    ['عمق دست‌کم ۳ ست', Number.isFinite(row.maxQty) && row.maxQty >= 3],
    ['موقعیت باز پای فروش', opts.filter((l) => l.side === 'sell').every((l) => num(l.quote?.oi) > 0)],
  ];
  return { score: parts.filter(([, ok]) => ok).length, of: 4, parts: parts.map(([label, ok]) => ({ label, ok })) };
}

// ═════════════════════════ منحنی، سناریو، پلکان اجرا ═════════════════════════

/**
 * منحنی سود و زیان سررسید به شکل تکه‌های خطیِ همان موتور (`analyzePayoff`):
 * `[{ lo, hi, a, b }]` که در هر تکه سود و زیان = a × S + b. دقیق است — کارمزد
 * اعمال هم شکستگی‌اش را دارد — و کلون‌پذیر، پس از ریسه به رابط می‌رسد.
 */
export function payoffCurve(payoff) {
  const segs = (payoff?.segments || []).map((g) => ({ lo: num(g.lo), hi: g.hi, a: num(g.a), b: num(g.b) }));
  return { segs };
}

/** سود و زیان سررسید در قیمت S از روی منحنی. */
export function curveAt(curve, S) {
  const segs = curve?.segs || [];
  const g = segs.find((x) => S >= x.lo - EPS && (S < x.hi || !Number.isFinite(x.hi))) || segs[segs.length - 1];
  return g ? g.a * S + g.b : NaN;
}

/**
 * سود و زیان، بازه‌به‌بازه — برای جمله‌های شرطی و خط‌کش سناریو.
 *
 * هر تکهٔ منحنی در ریشه‌اش شکسته می‌شود تا هر بازه یک علامت داشته باشد.
 * خروجی از پایین به بالا: `{ lo, hi, loPct, hiPct, sign, pnlLo, pnlHi,
 * trend, open }`؛ `trend` تخت/رو به بالا/رو به پایین، `open` یعنی بازهٔ
 * آخرِ بی‌سقف. بازه‌های هم‌علامت و هم‌روند پیاپی یکی می‌شوند.
 */
export function payoffScenarios(curve, spot) {
  const pieces = [];
  for (const g of curve?.segs || []) {
    const hiF = Number.isFinite(g.hi) ? g.hi : Infinity;
    const cuts = [g.lo];
    if (Math.abs(g.a) > EPS) {
      const root = -g.b / g.a;
      if (root > g.lo + EPS && root < hiF - EPS) cuts.push(root);
    }
    cuts.push(hiF);
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const lo = cuts[i], hi = cuts[i + 1];
      const mid = Number.isFinite(hi) ? (lo + hi) / 2 : lo + Math.max(lo, 1);
      const v = g.a * mid + g.b;
      const sign = Math.abs(v) < 1 ? 'zero' : v > 0 ? 'profit' : 'loss';
      const trend = Math.abs(g.a) < 1e-9 ? 'flat' : g.a > 0 ? 'up' : 'down';
      pieces.push({ lo, hi, sign, trend, pnlLo: g.a * lo + g.b, pnlHi: Number.isFinite(hi) ? g.a * hi + g.b : (trend === 'flat' ? g.b : g.a > 0 ? Infinity : -Infinity) });
    }
  }
  const out = [];
  for (const p of pieces) {
    const last = out[out.length - 1];
    if (last && last.sign === p.sign && last.trend === p.trend) { last.hi = p.hi; last.pnlHi = p.pnlHi; continue; }
    out.push({ ...p });
  }
  const pct = (x) => (spot > 0 && Number.isFinite(x) ? ((x - spot) / spot) * 100 : x === Infinity ? Infinity : NaN);
  return out.map((p) => ({ ...p, loPct: pct(p.lo), hiPct: pct(p.hi), open: !Number.isFinite(p.hi) }));
}

/**
 * نقاط شکستِ حجم در دفتر سفارش: شمار ستی که با پر شدن هر سطحِ هر پا
 * ممکن می‌شود. یک «ست» یعنی همهٔ پاها با نسبت خودشان یک بار (مثلاً فروش
 * ۲ قرارداد + خرید ۳ قرارداد). پای سهمِ بی‌دفتر سنجیده نمی‌شود.
 */
export function ladderPoints(legs = [], quotes = [], maxSets = Infinity) {
  const pts = new Set([1]);
  legs.forEach((l, i) => {
    const q = quotes[i] || {};
    if (l.kind === 'underlying' && q.assumedDepth) return;
    const per = l.kind === 'underlying' ? num(l.ratio, 1) * num(l.size, 0) : num(l.ratio, 1);
    if (!(per > 0)) return;
    const levels = Array.isArray(q.book) && q.book.length ? q.book : [q];
    let cum = 0;
    for (const lvl of levels) {
      const price = l.side === 'buy' ? num(lvl.ask) : num(lvl.bid);
      const qty = l.side === 'buy' ? num(lvl.askQty) : num(lvl.bidQty);
      if (!(price > 0) || !(qty > 0)) break;
      cum += qty;
      const n = Math.floor(cum / per);
      if (n >= 1) pts.add(n);
    }
  });
  const max = Number.isFinite(maxSets) && maxSets >= 1 ? Math.floor(maxSets) : Math.max(...pts);
  pts.add(max);
  return [...pts].filter((n) => n >= 1 && n <= max).sort((a, b) => a - b);
}

/**
 * پلکان اجرا: با هر حجمِ شکستِ دفتر، همان ترکیب دوباره با `evaluate` و
 * همان حجم سنجیده می‌شود — قیمت هر پا میانگینِ پیمایش سطح‌های دفتر است.
 * پس معلوم است «با چند ست چه بازده‌ای»؛ گاهی فقط سطح‌های اول بازده خوب
 * می‌دهند و این همان را می‌گوید.
 */
export function executionLadder({ legs = [], quotes = [], ctx = {}, settings = {}, maxSets = Infinity, monthDays = 30, cap = 7 } = {}) {
  let pts = ladderPoints(legs, quotes, maxSets);
  if (pts.length > cap) {
    const keep = new Set([pts[0], pts[pts.length - 1]]);
    for (let k = 1; k < cap - 1; k += 1) keep.add(pts[Math.round((k * (pts.length - 1)) / (cap - 1))]);
    pts = [...keep].sort((a, b) => a - b);
  }
  const out = [];
  for (const n of pts) {
    let r;
    try { r = evaluate({ legs, quotes, ctx: { ...ctx, qty: n, settings: { ...settings, qtyDefault: n } } }); } catch { continue; }
    if (!r.executable) break;
    const optContracts = legs.filter((l) => l.kind !== 'underlying').reduce((a, l) => a + num(l.ratio, 1) * n, 0);
    out.push({
      n, contracts: optContracts,
      retStaticMonthPct: Number.isFinite(r.retStaticPct) ? (r.retStaticPct * monthDays) / Math.max(1, num(ctx.days, 1)) : NaN,
      popPct: r.popPct, netCash: r.netCash, capital: r.capital, maxLoss: r.maxLoss, maxProfit: r.maxProfit,
      entryFee: r.entryFee, staticPnl: r.staticPnl, short: (r.dataFlags || []).includes('عمق ناکافی'),
      legPrices: (r.legPrices || []).map((l) => l.price),
    });
  }
  return out;
}

// ═════════════════════════ اسکن ═════════════════════════

/** همهٔ ترکیب‌های یک سررسید، به شکل آرایهٔ پاهای قیمت‌خورده. */
function* combosOf(pool, cfg) {
  const ratios2 = primitiveRatios(2, cfg.maxRatio);
  const ratios3 = cfg.maxLegs >= 3 ? primitiveRatios(3, Math.min(cfg.maxRatio, 2)) : [];
  const n = pool.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (pool[i].ins === pool[j].ins) continue;
      for (const [ri, rj] of ratios2) yield [{ ...pool[i], ratio: ri }, { ...pool[j], ratio: rj }];
      if (!ratios3.length) continue;
      for (let k = j + 1; k < n; k += 1) {
        if (pool[k].ins === pool[i].ins || pool[k].ins === pool[j].ins) continue;
        for (const [ri, rj, rk] of ratios3) yield [{ ...pool[i], ratio: ri }, { ...pool[j], ratio: rj }, { ...pool[k], ratio: rk }];
      }
    }
  }
}

const legKey = (l) => `${l.side === 'buy' ? '+' : '-'}${l.ins}`;

/**
 * اسکن کامل. خروجی گروه‌هاست: هر گروه یک مجموعهٔ قرارداد و سمت (مستقل از
 * نسبت)، با بهترین نسبت به‌عنوان کارت و بقیه به‌عنوان «نسبت‌های دیگر».
 */
export function comboScan({ chain, uaKeys = [], settings, scanner = {}, sigmaByUa = {}, sigmaSourceByUa = {}, now = Date.now() }) {
  const t0 = Date.now();
  const cfg = scannerConfig(scanner);
  // قیمت سرخطِ قابل اجرا، همیشه — تنظیم مبنای قیمت کاربر اینجا معنی ندارد.
  const s = { ...settings, priceBasis: 'BOOK', showUnexecutable: false, qtyDefault: 1 };
  const fees = feesOf(s);
  const basis = basisOf(s);
  const monthDays = num(basis.monthDays, 30) || 30;
  const blocked = blockedExpirySet(s.blockedExpiries);
  const classes = assetClassMap(s.assetClassMap);
  const funnel = emptyScanFunnel();
  const rows = [];

  // ── مرحلهٔ ۱: ساخت و غربال ارزان ───────────────────────────────────
  const cands = [];
  outer:
  for (const key of uaKeys) {
    const ua = chain.get(key);
    if (!ua) continue;
    const spot = num(ua.last || ua.close);
    if (!(spot > 0)) continue;
    for (const ex of ua.expiryList || []) {
      if (ex.days < cfg.minDays || ex.days > cfg.maxDays || expiryBlocked(blocked, ua.ins, ex.endDate)) continue;
      funnel.expiries += 1;
      const pool = legPool(ua, ex, cfg, s.contractSize, now, funnel);
      funnel.pool += pool.length;
      const hist = num(sigmaByUa[key], NaN);
      const sigma = hist > 0 ? hist : s.volSource === 'MANUAL' ? num(s.volManual, NaN)
        : expiryAtmIv(ua, ex, { rFree: s.rFree, divYield: s.divYield, yearDays: basis.yearDays });
      const T = ex.days / (num(basis.yearDays, 365) || 365);
      for (const legs of combosOf(pool, cfg)) {
        if (funnel.built >= cfg.maxBuilt) { funnel.truncated = true; break outer; }
        funnel.built += 1;
        // اندازهٔ پای سهم = اندازهٔ قراردادهای همین ترکیب
        const optSizes = legs.filter((l) => l.kind !== 'underlying').map((l) => l.rowSize);
        if (!optSizes.length) continue;
        const combo = comboContractSize(optSizes, s.contractSize);
        for (const l of legs) if (l.kind === 'underlying') l.size = combo.size;
        const quick = quickPayoff(legs, fees);
        if (quick.minPnl === -Infinity) { funnel.unlimited += 1; continue; }
        if (-quick.minPnl > cfg.maxLossPerSet) { funnel.overLoss += 1; continue; }
        if (!(quick.maxPnl > 0)) { funnel.noProfit += 1; continue; }
        // غربال احتمال با کمی گشادگی؛ عدد نهایی از `evaluate` است.
        const qpop = quickPop(quick, spot, T, sigma);
        if (Number.isFinite(qpop) && qpop < cfg.minPop - 8) { funnel.quickPop += 1; continue; }
        const risk = Math.max(-quick.minPnl, Math.abs(quick.cash), 1);
        cands.push({ key, ua, ex, spot, legs, combo, quick, qpop, hist, score: cfg.sort === 'pop' ? qpop : quick.at(spot) / risk });
      }
    }
  }
  // ── مرحلهٔ ۲: ارزیابی کامل بهترین‌های مرحلهٔ ۱ ──────────────────────
  cands.sort((a, b) => (Number.isFinite(b.score) ? b.score : -Infinity) - (Number.isFinite(a.score) ? a.score : -Infinity));
  if (cands.length > cfg.maxEval) funnel.evalCapped = cands.length - cfg.maxEval;
  for (const c of cands.slice(0, cfg.maxEval)) {
    const { key, ua, ex, spot, legs, combo, quick } = c;
    const kind = classifyCombo(legs);
    const evLegs = legs.map((l) => ({ kind: l.kind, side: l.side, ratio: l.ratio, strike: l.strike, size: l.size, sizeAssumed: l.sizeAssumed, days: ex.days, endDate: ex.endDate, ins: l.ins, name: l.name, price: undefined }));
    const quotes = legs.map((l) => l.quote);
    // همان زمینه برای پلکان اجرا (`executionLadder`) نگه داشته می‌شود؛ ساده و کلون‌پذیر.
    const ctx = {
      S: spot, Sclose: num(ua.close || ua.last), days: ex.days, size: combo.size, sizeMixed: combo.mixed,
      qty: 1, def: { id: 'free-combo', name: kind.name },
      underlying: ua.name, sigmaHist: c.hist > 0 ? c.hist : undefined, sigmaHistSource: sigmaSourceByUa[key],
      // بی تلاطم تاریخی، احتمال سود از تلاطم ضمنی پاها می‌آید و آن یونانی می‌خواهد.
      assetClass: assetClassOf(classes, ua), endDate: ex.endDate, greeks: !(c.hist > 0),
    };
    let row;
    try {
      row = evaluate({ legs: evLegs, quotes, ctx: { ...ctx, settings: s } });
    } catch { continue; }
    funnel.evaluated += 1;
    if (!row.executable || (row.legPrices || []).some((l) => l.quality === 'none')) { funnel.unexecutable += 1; continue; }
    if (row.unlimitedLoss || !Number.isFinite(row.maxLoss)) { funnel.unlimited += 1; continue; }
    const at = row.payoff?.at;
    const view = marketView(at, spot);
    const liq = liquidityScore(row, legs);
    const retStaticMonthPct = Number.isFinite(row.retStaticPct) ? (row.retStaticPct * monthDays) / ex.days : NaN;
    const pass = row.maxLoss <= cfg.maxLossPerSet + EPS
      && Number.isFinite(row.popPct) && row.popPct >= cfg.minPop - EPS
      && (!(cfg.maxCapital > 0) || row.capital <= cfg.maxCapital + EPS)
      && liq.score >= cfg.minLiquidity
      && (!Number.isFinite(row.maxQty) || row.maxQty >= cfg.minSets)
      && (cfg.execRule !== 'book' || row.tradable !== false)
      && (cfg.view === 'all' || cfg.view === view)
      && row.capital > 0;
    if (!pass) { funnel.filtered += 1; continue; }
    funnel.kept += 1;
    // منحنی دقیق سود و زیان سررسید: همان تکه‌های خطی موتور، نه نمونه‌برداری.
    const curve = payoffCurve(row.payoff);
    const legsCard = legs.map((l, i) => ({ kind: l.kind, side: l.side, ratio: l.ratio, strike: l.strike, price: num(row.legPrices?.[i]?.price, l.price), name: l.name, ins: l.ins }));
    rows.push({
      ...row, payoff: undefined,
      id: `${ua.ins}|${ex.endDate}|${legs.map((l) => `${legKey(l)}x${l.ratio}`).join('|')}`,
      groupKey: `${ua.ins}|${ex.endDate}|${legs.map(legKey).sort().join('|')}`,
      uaIns: String(ua.ins), uaName: ua.name, spot, days: ex.days, endDate: ex.endDate,
      comboName: kind.name, named: kind.named, view, viewLabel: VIEW_FA[view],
      liquidity: liq, retStaticMonthPct,
      riskless: quick.minPnl >= -EPS,
      legsCard, curve,
      beList: (row.breakevens || []).filter((b) => b > 0).map((b) => ({ price: b, pct: ((b - spot) / spot) * 100 })),
      scenarios: payoffScenarios(curve, spot),
      // ورودی پلکان اجرا: پاها، مظنه با دفتر، و زمینه — برای هر نسبتی که بعداً باز شود.
      evLegs, quotes, ctx,
      bookLive: cfg.execRule === 'book',
      chart: { legs: row.__legs, netCash: row.netCash },
      legIns: legs.filter((l) => l.kind !== 'underlying').map((l) => l.ins),
    });
  }

  const rankOf = (r) => (cfg.sort === 'pop'
    ? [r.popPct, r.retStaticMonthPct]
    : [r.retStaticMonthPct, r.popPct]);
  const better = (a, b) => {
    const [a1, a2] = rankOf(a), [b1, b2] = rankOf(b);
    const x = (v) => (Number.isFinite(v) ? v : -Infinity);
    return x(b1) - x(a1) || x(b2) - x(a2) || a.maxLoss - b.maxLoss;
  };
  const groups = new Map();
  for (const r of rows) {
    const g = groups.get(r.groupKey) || { key: r.groupKey, items: [] };
    g.items.push(r);
    groups.set(r.groupKey, g);
  }
  const list = [...groups.values()].map((g) => {
    g.items.sort(better);
    return { key: g.key, best: g.items[0], variants: g.items.slice(1, 6), count: g.items.length };
  }).sort((a, b) => better(a.best, b.best));
  // پلکان اجرا برای کارتِ هر گروهِ برگشتی: با چه حجمی چه بازده و چه نقدی.
  for (const g of list.slice(0, 60)) {
    g.best.ladder = executionLadder({ legs: g.best.evLegs, quotes: g.best.quotes, ctx: g.best.ctx, settings: s, maxSets: g.best.maxQty, monthDays });
  }
  return {
    groups: list.slice(0, cfg.limit), totalGroups: list.length, totalCombos: rows.length,
    funnel, ms: Date.now() - t0, cfg,
  };
}
