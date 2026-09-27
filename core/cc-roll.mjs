// دستیار تصمیم رول کاوردکال — منطق نوت‌بوک «رهگیر سود و زیان کاوردکال»،
// روی همان موتور بازده مشترک.
//
// ═══ پرسشی که این ماژول جواب می‌دهد ═══
//
// «موقعیت فعلی‌ام را ببینم و در چند ثانیه بفهمم رول بکنم یا نه، به کدام
// سررسید، با چه هزینه و چه ریسکی.» تب رول تا امروز جواب عمومی را داشت
// (تفاضل دو موقعیت برای هر ترکیبی)؛ این‌جا همان تفاضل برای شکل خاص
// کاوردکال به زبان تصمیم برگردانده می‌شود:
//
//   net_cost_0   = S0·(1 + کارمزد خرید سهم) − C0·(1 − کارمزد اختیار)
//   roll_flow    = C_new·(1 − کارمزد اختیار) − C_bb·(1 + کارمزد اختیار)
//   net_cost_new = net_cost_0 − roll_flow
//
//   D(S) = بازده(S؛ K_new، net_cost_new) − بازده(S؛ K_cur، net_cost_0)
//
// بازدهٔ هر سهم در سررسید از `analyzePayoff` می‌آید (قاعدهٔ ۲-۵): بالای
// اعمال، سهم با کارمزد اعمال تحویل می‌شود و زیر آن با کارمزد فروش در بازار
// فروخته می‌شود — همان دو نرخی که D را روی قیمت‌های اعمال پرش‌دار می‌کنند.
//
// D تکه‌ای-خطی است و فقط روی قیمت‌های اعمال می‌شکند، پس «محدودهٔ سودآوری
// رول» (جایی که D > 0) دقیق حل می‌شود، نه با شبکه و تنصیف.
//
// ═══ سررسیدهای متفاوت ═══
//
// مثل نوت‌بوک، مقایسه در «یک قیمت پایانی واحد» است: اگر پایه در پایان به S
// برسد، کدام بهتر است. افق بلندترِ پای تازه در این عدد قیمت‌گذاری نشده و
// ستون «روز اضافه» و پرچمِ «افق بلندتر» همین را می‌گویند. لایهٔ احتمال
// (اختیاری، با تلاطم) همان D را روی توزیع قیمت در سررسید پای تازه می‌سنجد.
//
// ═══ صداقت عددی ═══
//
// عددی که ادعای اجرا دارد فقط از دفتر سفارش می‌آید. قیمتِ مرجع (آخرین یا
// پایانی) جایگزین می‌شود ولی ردیفش `executable: false` می‌گیرد و در
// پیشنهاد نهایی به‌عنوان گزینهٔ اجرایی انتخاب نمی‌شود.

import { num, EPS } from './num.mjs';
import { analyzePayoff, grossCash, entryFees, signedQty } from './payoff.mjs';
import { probAbove } from './bs.mjs';

export const CC_ROLL_VERSION = 1;

const FEE0 = { buyStock: 0, sellStock: 0, option: 0, exercise: 0 };
const fin = (x) => typeof x === 'number' && Number.isFinite(x);

/** سه مبنای قیمت، همان سه حالت پنل نوت‌بوک. */
export const CC_BASES = [
  { id: 'DEPTH', label: 'عمق دفتر سفارش — متناسب با حجم شما',
    hint: 'قیمت میانگین اجرای کل تعداد قرارداد شما از پنج سطح دفتر سفارش؛ تنها عددی که واقعاً می‌گیرید.' },
  { id: 'BOOK', label: 'سطح اول دفتر سفارش',
    hint: 'بهترین عرضه برای بستن و بهترین تقاضا برای فروش تازه — قیمت یک قرارداد.' },
  { id: 'LAST', label: 'آخرین معامله',
    hint: 'مرجع است، نه قیمت اجرا: می‌گوید بازار کجا معامله کرده، نه شما کجا پر می‌شوید.' },
];

/** برچسب‌های ارزیابی نهایی — به ترتیبی که قاعده‌ها سنجیده می‌شوند. */
export const CC_LABELS = {
  weak: 'ضعیف',
  dominated: 'نامتناسب با ریسک',
  bestFlat: 'بهترین گزینه در سناریوی ثبات',
  marginal: 'قابل‌بررسی',
  good: 'مناسب',
  heavy: 'سرمایه‌بر',
  bullOnly: 'فقط با دید صعودی',
};

const VIEW_BANDS = [[0, 'خنثی'], [5, 'کمی صعودی'], [10, 'صعودی متوسط'], [16, 'صعودی قوی'],
  [Infinity, 'بسیار صعودی و پرریسک']];

/** «مناسب برای چه دیدی»: رشد لازم تا اعمال تازه، به زبان بازار. */
export function marketView(strike, spot) {
  if (!(spot > 0) || !(strike > 0)) return '—';
  const need = ((strike - spot) / spot) * 100;
  return VIEW_BANDS.find(([lim]) => need <= lim)[1];
}

// ————————————————————————— شکل موقعیت —————————————————————————

/**
 * آیا موقعیت کاوردکال است و اقتصاد پایه‌اش چیست.
 *
 * کاوردکال یعنی دقیقاً یک پای خرید سهم و یک پای فروش کال، با تعداد سهم برابر
 * با تعداد تحت پوشش کال. هر شکل دیگری (کالر، کاوردکال نیمه‌پوشش) ریاضی
 * دیگری دارد و این‌جا با دلیل صریح رد می‌شود، نه با عدد غلط.
 *
 * `nc0` (بهای تمام‌شدهٔ هر سهم) از جریان نقد ورود موتور مشترک درمی‌آید؛
 * آزمون ۳۰۲ نشان می‌دهد با فرمول نوت‌بوک یکی است.
 */
export function coveredCall(pos, fees = FEE0) {
  const legs = Array.isArray(pos?.legs) ? pos.legs : [];
  const stockIdx = legs.findIndex((l) => l.kind === 'underlying' && l.side === 'buy');
  const callIdx = legs.findIndex((l) => l.kind === 'call' && l.side === 'sell');
  if (legs.length !== 2 || stockIdx < 0 || callIdx < 0) {
    return { ok: false, reason: 'این دستیار برای کاوردکال است: دقیقاً یک پای خرید سهم و یک پای فروش کال.' };
  }
  const stock = legs[stockIdx];
  const call = legs[callIdx];
  const stockUnits = Math.abs(signedQty(stock));
  const callUnits = Math.abs(signedQty(call));
  if (!(callUnits > 0) || Math.abs(stockUnits - callUnits) > EPS) {
    return { ok: false, reason: 'تعداد سهم با تعداد تحت پوشش کال برابر نیست؛ کاوردکال کامل نیست.' };
  }
  const S0 = num(stock.price);
  const C0 = num(call.price);
  const K = num(call.strike);
  if (!(S0 > 0) || !(K > 0) || !(C0 > 0)) {
    return { ok: false, reason: 'قیمت ورود سهم، قیمت فروش کال یا قیمت اعمال ثبت نشده است.' };
  }
  const qty = Math.max(1, num(pos?.qty, 1));
  const entryNet = grossCash(legs) - entryFees(legs, fees);
  const nc0 = -entryNet / callUnits;
  const shares = callUnits * qty;
  return {
    ok: true, reason: '',
    stockIdx, callIdx, S0, C0, K, qty,
    shares, contracts: num(call.ratio, 1) * qty, size: num(call.size, 1),
    nc0, capital: nc0 * shares,
    callIns: String(call.ins || ''), callName: String(call.name || ''),
    entryDate: pos?.entryDate || '',
  };
}

// ————————————————————————— بازده و تفاضل —————————————————————————

const unitCovered = (K) => [
  { kind: 'underlying', side: 'buy', ratio: 1, size: 1, price: 0 },
  { kind: 'call', side: 'sell', strike: K, ratio: 1, size: 1, price: 0 },
];

/**
 * بازدهٔ هر سهم در سررسید: ارزش تسویه منهای بهای تمام‌شده.
 * از موتور مشترک می‌آید، نه از فرمول دوم.
 */
export function ccPayoff(K, nc, fees = FEE0) {
  const an = analyzePayoff(unitCovered(K), -nc, { fees });
  return (S) => an.at(S);
}

/** سود اضافهٔ رول نسبت به رول‌نکردن، هر سهم، به ازای قیمت پایانی S. */
export function rollDelta(K0, nc0, K1, nc1, fees = FEE0) {
  const p0 = ccPayoff(K0, nc0, fees);
  const p1 = ccPayoff(K1, nc1, fees);
  return (S) => p1(S) - p0(S);
}

/** تکه‌های خطی D: هر تکه `{ lo, hi, a, b }` با D = a·S + b روی [lo, hi). */
function deltaPieces(K0, K1, d) {
  const ks = [...new Set([K0, K1])].sort((x, y) => x - y);
  const bounds = [0, ...ks, Infinity];
  const pieces = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const lo = bounds[i];
    const hi = bounds[i + 1];
    const span = Number.isFinite(hi) ? hi - lo : Math.max(lo, 1);
    const x1 = lo + span * 0.25;
    const x2 = lo + span * 0.75;
    const a = (d(x2) - d(x1)) / (x2 - x1);
    pieces.push({ lo, hi, a, b: d(x1) - a * x1 });
  }
  return pieces;
}

/**
 * ناحیه‌هایی از قیمت پایانی که رول در آن‌ها به نفع است (D > 0).
 *
 * خروجی فهرست `{ from, to }` است؛ `from: null` یعنی «از صفر» (زیر X) و
 * `to: null` یعنی بی‌کران از بالا. فهرست خالی یعنی «در هیچ قیمتی».
 */
export function favorableRanges(K0, nc0, K1, nc1, fees = FEE0) {
  const d = rollDelta(K0, nc0, K1, nc1, fees);
  const pos = [];
  for (const { lo, hi, a, b } of deltaPieces(K0, K1, d)) {
    if (Math.abs(a) < 1e-12) {
      if (b > EPS) pos.push([lo, hi]);
      continue;
    }
    const r = -b / a;
    const from = a > 0 ? Math.max(lo, r) : lo;
    const to = a > 0 ? hi : Math.min(hi, r);
    if (to - from > EPS) pos.push([from, to]);
  }
  const merged = [];
  for (const [from, to] of pos) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last[1] - from) < 1e-6) last[1] = to;
    else merged.push([from, to]);
  }
  return merged.map(([from, to]) => ({
    from: from <= EPS ? null : from,
    to: Number.isFinite(to) ? to : null,
  }));
}

/** کمینه و بیشینهٔ D روی کل محور — سقف زیان و سود اضافهٔ رول، هر سهم. */
export function deltaExtremes(K0, nc0, K1, nc1, fees = FEE0) {
  const d = rollDelta(K0, nc0, K1, nc1, fees);
  const vals = [];
  for (const { lo, hi, a, b } of deltaPieces(K0, K1, d)) {
    vals.push(a * lo + b);
    vals.push(Number.isFinite(hi) ? a * hi + b : (Math.abs(a) < 1e-12 ? b : (a > 0 ? Infinity : -Infinity)));
  }
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

/** نزدیک‌ترین مرز ناحیهٔ سودآوری به قیمت فعلی. */
export function nearestEdge(ranges, spot) {
  const edges = ranges.flatMap((r) => [r.from, r.to]).filter((x) => fin(x));
  if (!edges.length) return NaN;
  return edges.reduce((best, e) => (Math.abs(e - spot) < Math.abs(best - spot) ? e : best), edges[0]);
}

// ————————————————————————— قیمت اجرا —————————————————————————

/**
 * قیمت میانگین اجرای واقعی برای حجم مشخص، با مصرف سطوح دفتر سفارش.
 *
 * `side: 'buy'` سطوح عرضه را مصرف می‌کند و `'sell'` سطوح تقاضا را.
 * `slipPct` فاصلهٔ میانگین از سطح اول است؛ برای خرید مثبت و برای فروش
 * منفی — در هر دو حالت به ضرر شما.
 */
export function walkBook(levels, qty, side) {
  const want = num(qty);
  const empty = { vwap: 0, top: 0, filled: 0, short: Math.max(want, 0), levels: 0, slipPct: NaN, full: false };
  if (!Array.isArray(levels) || !levels.length || !(want > 0)) return empty;
  let rem = want, cost = 0, used = 0, top = 0;
  for (const lv of levels) {
    const p = num(side === 'buy' ? lv?.ask : lv?.bid);
    const q = num(side === 'buy' ? lv?.askQty : lv?.bidQty);
    if (!(p > 0) || !(q > 0)) continue;
    if (!top) top = p;
    const take = Math.min(rem, q);
    cost += take * p;
    rem -= take;
    used += 1;
    if (rem <= EPS) break;
  }
  const filled = want - rem;
  if (!(filled > 0)) return empty;
  const vwap = cost / filled;
  return {
    vwap, top, filled, short: Math.max(rem, 0), levels: used,
    slipPct: top > 0 ? ((vwap - top) / top) * 100 : NaN, full: rem <= EPS,
  };
}

/**
 * قیمت یک طرف رول با مبنای انتخابی.
 *
 * `source` می‌گوید عدد از کجا آمد: `depth` (کل حجم در دفتر جا شد)،
 * `partial` (فقط بخشی جا شد)، `l1` (سطح اول)، `ref` (آخرین یا پایانی —
 * مرجع، نه اجرا) یا `none`.
 */
export function legPrice(quote = {}, side, basis = 'BOOK', qty = 1) {
  const l1 = num(side === 'buy' ? quote.ask : quote.bid);
  const l1Qty = num(side === 'buy' ? quote.askQty : quote.bidQty);
  const ref = num(quote.last) || num(quote.close);
  const out = (price, executable, source, walk = null) => ({ price, l1, executable, source, walk });
  if (basis === 'LAST') return ref > 0 ? out(ref, false, 'ref') : out(0, false, 'none');
  if (basis === 'DEPTH') {
    const w = walkBook(quote.book, qty, side);
    if (w.filled > 0) return out(w.vwap, w.full, w.full ? 'depth' : 'partial', w);
    if (l1 > 0) {
      const full = l1Qty >= num(qty) - EPS;
      return out(l1, full, full ? 'l1' : 'partial', null);
    }
  } else if (l1 > 0) {
    return out(l1, true, 'l1');
  }
  return ref > 0 ? out(ref, false, 'ref') : out(0, false, 'none');
}

// ————————————————————————— احتمال —————————————————————————

/**
 * احتمال به‌نفع‌بودن رول و سود اضافهٔ مورد انتظار، روی توزیع لگاریتم-نرمال
 * با روند صفر (همان مدل `probAbove`).
 *
 * `T` افق پای تازه است. هشدار مدل همان هشدار `probAbove` است: دامنهٔ نوسان،
 * توقف نماد و پرش‌های بازار ایران در آن نیست. `NaN` یعنی تلاطم نداریم،
 * نه «احتمال صفر».
 */
export function rollOdds({ ranges, d, spot, days, sigma }) {
  const T = num(days) / 365;
  if (!(spot > 0) || !(T > 0) || !fin(sigma) || !(sigma > 0)) return { prob: NaN, expected: NaN };
  let prob = 0;
  for (const r of ranges) {
    const above = r.from == null ? 1 : probAbove(spot, r.from, T, sigma);
    const beyond = r.to == null ? 0 : probAbove(spot, r.to, T, sigma);
    prob += Math.max(0, above - beyond);
  }
  const sd = sigma * Math.sqrt(T);
  const N = 480;
  const zMax = 6;
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i <= N; i++) {
    const z = -zMax + (2 * zMax * i) / N;
    const w = Math.exp(-0.5 * z * z) * (i === 0 || i === N ? 0.5 : 1);
    sum += w * d(spot * Math.exp(z * sd - 0.5 * sd * sd));
    wsum += w;
  }
  return { prob: Math.min(1, prob), expected: sum / wsum };
}

// ————————————————————————— نامزدهای رول —————————————————————————

const DEFAULT_FILTERS = { minBid: 1, minOi: 0, maxExpiries: 4, includeLower: true, maxSlipPct: 12 };

/**
 * همهٔ نامزدهای رول با اعداد کامل تصمیم.
 *
 * ورودی:
 *   cc       خروجی `coveredCall`
 *   spot     قیمت فعلی پایه
 *   current  `{ ins, strike, days, quote }` کال فعلی، از زنجیره
 *   chain    `[{ ins, name, strike, days, size, quote }]` همهٔ کال‌های پایه
 *   quote    `{ bid, bidQty, ask, askQty, last, close, oi, vol, book }`
 *
 * خروجی `{ ok, reason, baseline, rows, skipped, expiries }`. ردیف‌ها بر
 * اساس سود اضافه با قیمت امروز مرتب‌اند.
 */
export function ccRollPlan({ cc, spot, current, chain = [], fees = FEE0, basis = 'BOOK', filters = {}, sigma = NaN }) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  if (!cc?.ok) return { ok: false, reason: cc?.reason || 'موقعیت کاوردکال نیست', rows: [] };
  if (!(spot > 0)) return { ok: false, reason: 'قیمت فعلی پایه در دست نیست', rows: [] };
  if (!current || !(num(current.days) >= 0)) {
    return { ok: false, reason: 'کال فعلی در زنجیرهٔ امروز پیدا نشد؛ سررسید یا قیمت بستنش معلوم نیست.', rows: [] };
  }
  const fo = num(fees.option);
  const fe = num(fees.exercise);
  const { shares, nc0, K: K0 } = cc;
  const bb = legPrice(current.quote, 'buy', basis, cc.contracts);
  if (!(bb.price > 0)) {
    return { ok: false, reason: 'برای کال فعلی هیچ قیمتی برای بستن نیست — نه عرضه، نه آخرین معامله.', rows: [] };
  }
  const daysCur = Math.max(num(current.days), 1);
  const p0 = ccPayoff(K0, nc0, fees);
  const payOut = bb.price * (1 + fo) * shares;
  const maxProfit = (K0 * (1 - fe) - nc0) * shares;
  const intrinsic = Math.max(spot - K0, 0);
  const baseline = {
    K: K0, days: daysCur, nc0, shares, contracts: cc.contracts, spot,
    maxProfit, retPct: (maxProfit / (nc0 * shares)) * 100,
    annPct: ((maxProfit / (nc0 * shares)) * 100 * 365) / daysCur,
    buyback: bb.price, buybackL1: bb.l1, buybackOk: bb.executable, buybackSource: bb.source,
    buybackWalk: bb.walk, payOut,
    payOutL1: bb.l1 > 0 ? bb.l1 * (1 + fo) * shares : NaN,
    optionLocked: (cc.C0 * (1 - fo) - bb.price * (1 + fo)) * shares,
    nowProfit: p0(spot) * shares,
    flatPerDay: (p0(spot) * shares) / daysCur,
    ifExpire: (spot * (1 - num(fees.sellStock)) - nc0) * shares,
    intrinsic, timeValue: bb.price - intrinsic,
    capturedPct: ((cc.C0 - bb.price) / cc.C0) * 100,
    timeValueLeftPct: ((bb.price - intrinsic) / cc.C0) * 100,
    cushionPct: ((spot - nc0) / spot) * 100,
    C0: cc.C0, S0: cc.S0,
  };

  const allDays = [...new Set(chain.map((c) => num(c.days)).filter((d) => d >= daysCur - EPS))].sort((a, b) => a - b);
  const expiries = f.maxExpiries > 0 ? allDays.slice(0, f.maxExpiries + 1) : allDays;
  const wanted = new Set(expiries);

  const rows = [];
  const skipped = [];
  for (const c of chain) {
    const days = num(c.days);
    if (!wanted.has(days) || String(c.ins) === String(current.ins)) continue;
    const same = Math.abs(days - num(current.days)) < EPS;
    const K1 = num(c.strike);
    if (!(K1 > 0)) continue;
    if (same && K1 <= K0) continue;
    if (!same && !f.includeLower && K1 < K0) continue;
    const q = c.quote || {};
    if (num(q.oi) < f.minOi) continue;
    const sizeKnown = num(c.size) > 0;
    const size = sizeKnown ? num(c.size) : cc.size;
    const nNew = shares / size;
    const pr = legPrice(q, 'sell', basis, nNew);
    if (!(pr.price > 0)) { skipped.push({ ins: c.ins, name: c.name, strike: K1, days, why: 'بدون هیچ قیمت' }); continue; }
    if (pr.price < f.minBid) { skipped.push({ ins: c.ins, name: c.name, strike: K1, days, why: 'زیر حداقل مظنه' }); continue; }

    const cashIn = pr.price * (1 - fo) * shares;
    const netFlow = cashIn - payOut;
    const flow = netFlow / shares;
    const nc1 = nc0 - flow;
    const d = rollDelta(K0, nc0, K1, nc1, fees);
    const ranges = favorableRanges(K0, nc0, K1, nc1, fees);
    const ext = deltaExtremes(K0, nc0, K1, nc1, fees);
    const dNow = d(spot);
    const edge = nearestEdge(ranges, spot);
    const maxP = (K1 * (1 - fe) - nc1) * shares;
    const retPct = nc1 > 0 ? (maxP / (nc1 * shares)) * 100 : NaN;
    const extraDays = days - daysCur;

    let depthCost = NaN;
    if (basis === 'DEPTH' && pr.l1 > 0 && fin(baseline.payOutL1)) {
      const flowL1 = (pr.l1 * (1 - fo) * shares - baseline.payOutL1) / shares;
      depthCost = (flowL1 - flow) * shares;
    }

    const flags = [];
    if (K1 * (1 - fe) <= nc1) flags.push('زیان قطعی در اعمال');
    if (K1 < spot) flags.push('درون پول');
    if (!pr.executable) flags.push(pr.source === 'partial' ? 'عمق ناکافی' : 'بدون مظنه اجرا');
    if (!bb.executable) flags.push(bb.source === 'partial' ? 'عمق ناکافی برای بستن' : 'بستن بدون مظنه اجرا');
    if (pr.walk && fin(pr.walk.slipPct) && Math.abs(pr.walk.slipPct) > f.maxSlipPct) flags.push('افت مظنهٔ زیاد');
    if (extraDays > 0) flags.push('افق بلندتر');
    if (!sizeKnown) flags.push('اندازهٔ قرارداد نامعلوم');
    else if (Math.abs(nNew - Math.round(nNew)) > 1e-9) flags.push('اندازهٔ قرارداد ناسازگار');

    const odds = rollOdds({ ranges, d: (S) => d(S) * shares, spot, days, sigma });
    rows.push({
      ins: String(c.ins || ''), name: String(c.name || ''), strike: K1, days, extraDays, same, size, sizeKnown,
      contracts: nNew,
      premium: pr.price, premiumL1: pr.l1, premiumSource: pr.source, executable: pr.executable && bb.executable,
      slipPct: pr.walk ? pr.walk.slipPct : NaN, levels: pr.walk ? pr.walk.levels : (pr.source === 'l1' ? 1 : 0),
      shortQty: pr.walk ? pr.walk.short : (pr.source === 'partial' ? Math.max(nNew - num(q.bidQty), 0) : 0),
      depthCost,
      payOut, cashIn, netFlow, flow, nc: nc1, ncChange: nc1 - nc0,
      maxProfit: maxP, retPct, annPct: fin(retPct) ? (retPct * 365) / Math.max(days, 1) : NaN,
      dNow: dNow * shares, dMax: ext.max * shares, dMin: ext.min * shares,
      ranges, edge, edgePct: fin(edge) ? ((edge - spot) / spot) * 100 : NaN,
      strikeDistPct: ((K1 - spot) / spot) * 100,
      verdict: !ranges.length ? 'never' : dNow > 0 ? 'now' : 'conditional',
      flags, tv: pr.price - Math.max(spot - K1, 0),
      vol: num(q.vol), oi: num(q.oi),
      prob: odds.prob, expected: odds.expected,
      perExtraDay: extraDays > 0 ? (dNow * shares) / extraDays : NaN,
      // سود ایستای موقعیت پس از رول، تقسیم بر افق خودش. مقایسهٔ سررسیدهای
      // متفاوت در یک قیمت پایانی، سررسید دورتر را همیشه جلو می‌اندازد؛ این
      // عدد می‌گوید آن جلوافتادن، روز به روز هم جلوتر است یا فقط طولانی‌تر.
      flatPerDay: (baseline.nowProfit + dNow * shares) / Math.max(days, 1),
    });
  }
  rows.sort((a, b) => (b.dNow - a.dNow) || (b.dMax - a.dMax));
  return { ok: true, reason: '', basis, baseline, rows, skipped, expiries, sigma };
}

// ————————————————————————— جدول تصمیم (بخش اول نوت‌بوک) —————————————————————————

/**
 * ردیف‌های جدول تصمیم یک گروه سررسید؛ ردیف اول همیشه «رول‌نکردن» است.
 *
 * اصلاح نسبت به نوت‌بوک: «پول جدید لازم» قدرمطلق خالص رول نیست. رول
 * بستانکار پول **نمی‌خواهد**، پول می‌دهد؛ پس `pay` فقط بخش بدهکار است و
 * بستانکاری جدا در `credit` می‌آید.
 */
export function decisionRows(plan, days = null) {
  const b = plan.baseline;
  const base = {
    isBase: true, name: 'رول‌نکردن', days: b.days, K: b.K, nc: b.nc0, pay: 0, credit: 0,
    edge: NaN, ranges: [], flat: b.nowProfit, dflat: 0, maxp: b.maxProfit, dmax: 0, dhi: 0, dlo: 0,
    view: 'نزولی یا خنثی', tv: NaN, flags: [], executable: true, prob: NaN, expected: NaN,
    label: CC_LABELS.good, why: 'سود قفل‌شده و بدون سرمایهٔ جدید', whyKind: 'base', risky: false,
  };
  const group = days == null ? plan.rows : plan.rows.filter((r) => Math.abs(r.days - days) < EPS);
  const cand = group.map((r) => ({
    isBase: false, name: r.name, ins: r.ins, days: r.days, K: r.strike, nc: r.nc,
    pay: Math.max(-r.netFlow, 0), credit: Math.max(r.netFlow, 0), netFlow: r.netFlow,
    edge: r.edge, ranges: r.ranges, flat: r.dNow + b.nowProfit, dflat: r.dNow,
    maxp: r.maxProfit, dmax: r.maxProfit - b.maxProfit, dhi: r.dMax, dlo: r.dMin,
    view: marketView(r.strike, b.spot), tv: r.tv, flags: r.flags, executable: r.executable,
    prob: r.prob, expected: r.expected, extraDays: r.extraDays,
  }));
  if (cand.length) {
    const bestFlat = Math.max(...cand.map((r) => r.dflat));
    const maxPay = Math.max(...cand.map((r) => r.pay));
    for (const r of cand) {
      const eff = r.pay > 0 ? r.dflat / r.pay : (r.dflat > 0 ? Infinity : 0);
      r.eff = eff;
      const dominated = cand.some((o) => o !== r && o.dmax > r.dmax + 1 && o.pay <= r.pay * 1.02
        && Math.abs(o.days - r.days) < EPS);
      if (r.dhi <= 0) { r.label = CC_LABELS.weak; r.whyKind = 'never'; }
      else if (dominated) { r.label = CC_LABELS.dominated; r.whyKind = 'dominated'; }
      else if (r.dflat === bestFlat && r.dflat > 0) { r.label = CC_LABELS.bestFlat; r.whyKind = 'bestFlat'; }
      else if (r.dflat > 0 && eff < 0.02) { r.label = CC_LABELS.marginal; r.whyKind = 'marginal'; }
      else if (r.dflat > 0) { r.label = CC_LABELS.good; r.whyKind = 'good'; }
      else if (maxPay > 0 && r.pay >= maxPay * 0.98) { r.label = CC_LABELS.heavy; r.whyKind = 'heavy'; }
      else { r.label = CC_LABELS.bullOnly; r.whyKind = 'bullOnly'; }
      r.risky = (maxPay > 0 && r.pay >= maxPay * 0.9) || r.dflat < 0;
    }
  }
  return [base, ...cand];
}

// ————————————————————————— سناریوها (بخش دوم) —————————————————————————

/** قیمت‌های سناریو: قیمت‌های اعمال، دو پله پایین‌تر، یک پله بالاتر و قیمت فعلی. */
export function scenarioPrices(K0, strikes, spot) {
  const ks = [...new Set([K0, ...strikes].map(Number).filter((k) => k > 0))].sort((a, b) => a - b);
  const diffs = ks.slice(1).map((k, i) => k - ks[i]).sort((a, b) => a - b);
  const step = diffs.length ? diffs[Math.floor(diffs.length / 2)] : Math.max(K0 * 0.05, 1);
  const prices = [ks[0] - 2 * step, ks[0] - step, ...ks, ks[ks.length - 1] + step].filter((p) => p > 0);
  if (prices.every((p) => Math.abs(p - spot) > step * 0.2)) prices.push(spot);
  return [...new Set(prices.map((p) => Math.round(p)))].sort((a, b) => a - b);
}

/** سود کل هر گزینه در یک قیمت پایانی. */
export function rowValueAt(row, S, plan, fees = FEE0) {
  return ccPayoff(row.K, row.nc, fees)(S) * plan.baseline.shares;
}

/**
 * جدول سناریو: در هر قیمت پایانی، بهترین و دومین گزینه و فاصله از
 * رول‌نکردن. داده است، نه جمله؛ جمله را لایهٔ نمایش می‌سازد.
 */
export function scenarioTable(drows, plan, fees = FEE0) {
  const b = plan.baseline;
  const prices = scenarioPrices(b.K, drows.filter((r) => !r.isBase).map((r) => r.K), b.spot);
  return prices.map((S) => {
    const vals = drows.map((r) => ({ row: r, value: rowValueAt(r, S, plan, fees) }))
      .sort((x, y) => y.value - x.value);
    const baseValue = vals.find((v) => v.row.isBase).value;
    const best = vals[0];
    return {
      S, isSpot: Math.abs(S - Math.round(b.spot)) < 1,
      best: best.row, bestValue: best.value,
      second: vals[1]?.row || null, secondValue: vals[1]?.value ?? NaN,
      baseValue, gain: best.value - baseValue,
      effPct: !best.row.isBase && best.row.pay > 0 ? ((best.value - baseValue) / best.row.pay) * 100 : NaN,
      values: vals,
    };
  });
}

// ————————————————————————— ماتریس تصمیم (بخش سوم) —————————————————————————

/** از دید بازار به اقدام: هر ردیف `{ kind, price, pick, gain }`. */
export function decisionMatrix(drows, plan, fees = FEE0) {
  const b = plan.baseline;
  const cand = drows.filter((r) => !r.isBase);
  if (!cand.length) return [];
  const bestAt = (S) => drows.map((r) => ({ r, v: rowValueAt(r, S, plan, fees) }))
    .reduce((x, y) => (y.v > x.v ? y : x));
  const baseAt = (S) => rowValueAt(drows[0], S, plan, fees);
  const items = [];
  const lowK = Math.min(...cand.map((r) => r.K));
  const low = bestAt(Math.min(...drows.map((r) => r.K)) * 0.93);
  items.push({ kind: 'drop', price: lowK, pick: low.r, gain: 0 });
  const flat = bestAt(b.spot);
  items.push({ kind: 'flat', price: b.spot, pick: flat.r, gain: flat.v - baseAt(b.spot) });
  for (const K of [...new Set(cand.map((r) => r.K).filter((k) => k > b.spot))].sort((x, y) => x - y)) {
    const at = bestAt(K);
    items.push({ kind: 'grow', price: K, pick: at.r, gain: at.v - baseAt(K) });
  }
  const safe = cand.filter((r) => r.dflat > 0);
  const safest = safe.length ? safe.reduce((x, y) => (y.pay < x.pay ? y : x)) : drows[0];
  items.push({ kind: 'unsure', price: NaN, pick: safest, gain: safe.length ? safest.dflat : 0 });
  const credit = cand.filter((r) => r.pay <= 0);
  const noMoney = credit.length ? credit.reduce((x, y) => (y.dflat > x.dflat ? y : x)) : drows[0];
  items.push({ kind: 'noMoney', price: NaN, pick: noMoney, gain: credit.length ? noMoney.dflat : 0 });
  return items;
}

// ————————————————————————— شاخص‌ها و ناسازگاری (بخش چهارم) —————————————————————————

/** شاخص‌های کنترلی هر نامزد، همان هشت ردیف نوت‌بوک. */
export function controlMetrics(drows, plan) {
  const b = plan.baseline;
  return drows.filter((r) => !r.isBase).map((r) => ({
    name: r.name,
    costPerShare: -r.netFlow / b.shares,
    strikeUp: r.K - b.K,
    capGainPerShare: r.dhi / b.shares,
    ncNew: r.nc,
    capitalNew: r.nc * b.shares,
    retOnNewCapital: (r.maxp / (r.nc * b.shares)) * 100,
    retOnNewMoney: r.pay > 0 ? (r.dhi / r.pay) * 100 : NaN,
    timeValue: r.tv,
  }));
}

/**
 * ناسازگاری و کمبود داده. هر مورد `{ kind, ... }`؛ متن را لایهٔ نمایش
 * می‌سازد. آخرین مورد همیشه یادآوری مدل است.
 */
export function dataIssues(drows, plan) {
  const b = plan.baseline;
  const cand = drows.filter((r) => !r.isBase);
  const out = [];
  const byDays = new Map();
  for (const r of cand) {
    if (!(r.K > b.spot) || !fin(r.tv) || !(r.tv > 0)) continue;
    if (!byDays.has(r.days)) byDays.set(r.days, []);
    byDays.get(r.days).push(r);
  }
  for (const list of byDays.values()) {
    const otm = list.sort((x, y) => x.K - y.K);
    for (let i = 1; i < otm.length; i++) {
      if (otm[i].tv >= otm[i - 1].tv) out.push({ kind: 'tvOrder', a: otm[i - 1].name, b: otm[i].name });
    }
    const ratios = [];
    for (let i = 0; i < otm.length - 1; i++) {
      if (otm[i + 1].tv > 0) ratios.push({ r: otm[i].tv / otm[i + 1].tv, a: otm[i].name, b: otm[i + 1].name });
    }
    for (let i = 1; i < ratios.length; i++) {
      if (ratios[i].r < ratios[i - 1].r / 2) {
        out.push({ kind: 'tvFlat', a: ratios[i].a, b: ratios[i].b, ratio: ratios[i].r, prev: ratios[i - 1].r });
      }
    }
  }
  const noExec = cand.filter((r) => !r.executable).map((r) => r.name);
  if (noExec.length) out.push({ kind: 'noQuote', names: noExec });
  if (!b.buybackOk) out.push({ kind: 'buyback', source: b.buybackSource });
  out.push({ kind: 'model', withOdds: fin(plan.sigma) && plan.sigma > 0 });
  return out;
}

// ————————————————————————— جمع‌بندی (بخش پنجم) —————————————————————————

/** گزینه‌های شاخص جمع‌بندی: ثبات، رشد متوسط، رشد قوی، محافظه‌کار، نامناسب. */
export function decisionSummary(drows, plan) {
  const b = plan.baseline;
  const cand = drows.filter((r) => !r.isBase);
  if (!cand.length) return null;
  const flatBest = drows.reduce((x, y) => (y.flat > x.flat ? y : x));
  const up = cand.filter((r) => r.K > b.spot);
  const mid = up.length ? up.reduce((x, y) => (y.K < x.K ? y : x)) : null;
  const strong = cand.reduce((x, y) => (y.K > x.K ? y : x));
  const safe = cand.filter((r) => r.dflat > 0);
  const conservative = safe.length ? safe.reduce((x, y) => (y.pay < x.pay ? y : x)) : null;
  const bad = cand.filter((r) => [CC_LABELS.dominated, CC_LABELS.weak, CC_LABELS.heavy].includes(r.label));
  const heavy = cand.reduce((x, y) => (y.pay > x.pay ? y : x));
  const negative = cand.filter((r) => r.dflat < 0);
  return {
    flatBest, mid, strong, conservative, bad, heavy, negative,
    lowK: Math.min(...cand.map((r) => r.K)),
    midGain: mid ? rowValueAt(mid, mid.K, plan) - rowValueAt(drows[0], mid.K, plan) : NaN,
  };
}

// ————————————————————————— ابزارهای تازه —————————————————————————

/**
 * نردبان سررسید: برای هر سررسید، بهترین رول آن.
 *
 * پاسخ مستقیم «به کدام سررسید»: هر پله می‌گوید اگر فقط همین سررسید را
 * داشتی، بهترین گزینه‌ات چه بود، چقدر پول می‌خواست و چقدر ریسک داشت.
 * «بهترین» اول از میان ردیف‌های اجراپذیر انتخاب می‌شود.
 */
export function expiryLadder(plan) {
  const out = [];
  for (const days of plan.expiries || []) {
    const group = plan.rows.filter((r) => Math.abs(r.days - days) < EPS);
    if (!group.length) continue;
    const exec = group.filter((r) => r.executable);
    const pool = exec.length ? exec : group;
    const best = pool.reduce((x, y) => (y.dNow > x.dNow ? y : x));
    const withOdds = pool.filter((r) => fin(r.expected));
    const bestExpected = withOdds.length ? withOdds.reduce((x, y) => (y.expected > x.expected ? y : x)) : null;
    const credit = pool.filter((r) => r.netFlow >= 0);
    out.push({
      days, extraDays: days - plan.baseline.days, count: group.length, executable: exec.length,
      best, bestExpected, bestCredit: credit.length ? credit.reduce((x, y) => (y.dNow > x.dNow ? y : x)) : null,
      positive: pool.filter((r) => r.dNow > 0).length,
    });
  }
  return out;
}

/**
 * زمان‌بندی: کال فعلی چقدر از کارش را کرده است.
 *
 * قاعدهٔ سرانگشتی رایج — نه قانون: وقتی بیشتر پریمیوم برداشت شده و ارزش
 * زمانی ناچیزی مانده، نگه‌داشتن کال فعلی تقریباً هیچ درآمدی نمی‌سازد و
 * فقط ریسک سقف سود را نگه می‌دارد؛ آن‌جا رول «به‌موقع» است.
 */
export function rollTiming(plan) {
  const b = plan.baseline;
  const tvLeft = b.timeValue;
  const tvPerDay = tvLeft / Math.max(b.days, 1);
  const itm = b.spot > b.K;
  let stage;
  if (b.timeValueLeftPct <= 15) stage = 'ripe';
  else if (b.capturedPct >= 60 && !itm) stage = 'ready';
  else if (itm && b.timeValueLeftPct <= 30) stage = 'ready';
  else stage = 'early';
  return {
    stage, itm, capturedPct: b.capturedPct, timeValueLeft: tvLeft * b.shares,
    timeValueLeftPct: b.timeValueLeftPct, tvPerDay: tvPerDay * b.shares, days: b.days,
    moneynessPct: ((b.spot - b.K) / b.K) * 100,
  };
}

/**
 * حکم نهایی — همان «اگر فقط سی ثانیه وقت دارید»، در یک جمله و یک گزینه.
 *
 *   roll         یک رول اجراپذیر با قیمت امروز جلوتر است
 *   conditional  هیچ‌کدام امروز جلوتر نیست، ولی با تلاطم فعلی رولی هست که
 *                احتمال به‌نفع‌بودنش بیش از نیم و امیدش مثبت است
 *   hold         هیچ رولی نه امروز جلوتر است نه امید مثبت دارد
 *   none         نامزدی برای سنجش نیست
 *
 * `estimated: true` یعنی بهترین گزینه فقط با قیمت مرجع پیدا شد و در دفتر
 * سفارش قابل اجرا نیست؛ حکم «رول» برای آن داده نمی‌شود.
 */
export function rollVerdict(plan) {
  if (!plan?.ok) return { action: 'none', reason: plan?.reason || '' };
  const rows = plan.rows;
  if (!rows.length) return { action: 'none', reason: 'هیچ نامزد رولی با این فیلترها قیمت نداشت.' };
  const sane = rows.filter((r) => !r.flags.includes('زیان قطعی در اعمال'));
  const exec = sane.filter((r) => r.executable);
  const timing = rollTiming(plan);
  const bestOf = (list, key) => (list.length ? list.reduce((x, y) => (y[key] > x[key] ? y : x)) : null);
  const bestExec = bestOf(exec, 'dNow');
  const bestAny = bestOf(sane, 'dNow');
  if (bestExec && bestExec.dNow > 0) {
    const alt = exec.filter((r) => r !== bestExec && r.dNow > 0);
    const credit = bestOf(exec.filter((r) => r.netFlow >= 0 && r.dNow > 0), 'dNow');
    const sameExp = bestOf(exec.filter((r) => r.same && r.dNow > 0), 'dNow');
    return {
      action: 'roll', pick: bestExec, credit: credit !== bestExec ? credit : null,
      sameExpiry: sameExp !== bestExec ? sameExp : null,
      dilutes: bestExec.extraDays > 0 && bestExec.flatPerDay < plan.baseline.flatPerDay,
      alternatives: alt.slice(0, 3), timing, estimated: false,
      strength: bestExec.dNow / Math.max(plan.baseline.nc0 * plan.baseline.shares, 1) * 100,
    };
  }
  const withOdds = exec.filter((r) => fin(r.expected) && r.expected > 0 && r.prob >= 0.5);
  if (withOdds.length) {
    return { action: 'conditional', pick: bestOf(withOdds, 'expected'), timing, estimated: false };
  }
  return {
    action: 'hold', pick: bestExec || bestAny, timing,
    estimated: !bestExec && !!bestAny && bestAny.dNow > 0,
    betterEstimate: !bestExec && bestAny && bestAny.dNow > 0 ? bestAny : null,
  };
}

/**
 * نقشهٔ سررسید × اعمال: برای هر خانه یک ردیف یا خالی.
 * `metric` یکی از کلیدهای ردیف است (`dNow` · `expected` · `prob` · `netFlow`).
 */
export function rollGrid(plan, metric = 'dNow') {
  const days = [...new Set(plan.rows.map((r) => r.days))].sort((a, b) => a - b);
  const strikes = [...new Set(plan.rows.map((r) => r.strike))].sort((a, b) => a - b);
  const cell = new Map(plan.rows.map((r) => [`${r.days}:${r.strike}`, r]));
  const values = plan.rows.map((r) => r[metric]).filter(fin);
  return {
    days, strikes, metric,
    lo: values.length ? Math.min(...values) : NaN,
    hi: values.length ? Math.max(...values) : NaN,
    at: (d, k) => cell.get(`${d}:${k}`) || null,
  };
}

// ————————————————————————— سود و زیان تاریخی (سلول‌های ۵ تا ۷) —————————————————————————

/**
 * تجزیهٔ روزانهٔ کاوردکال از روند موتور مشترک (`dailyPnlSeries`).
 *
 * سود خالص هر روز از خودِ روند می‌آید (همان موتور تب موقعیت‌ها)؛ این‌جا فقط
 * اجزای نوت‌بوک کنارش ساخته می‌شوند: پای سهم، پای اختیار، خرید و نگهداری و
 * ارزش افزودهٔ فروش کال. روز بی‌قیمت همان‌جا شکاف می‌ماند (قاعدهٔ ۲-۴)؛
 * پر کردن با آخرین قیمت، که نوت‌بوک انجام می‌داد، این‌جا انجام نمی‌شود.
 */
export function ccDailyBreakdown(cc, series, fees = FEE0) {
  const points = Array.isArray(series?.points) ? series.points : [];
  const fb = num(fees.buyStock);
  const fs = num(fees.sellStock);
  const rows = points.map((p) => {
    const St = num(p.prices?.[cc.stockIdx], NaN);
    const Ct = num(p.prices?.[cc.callIdx], NaN);
    const stockLeg = (St - cc.S0) * cc.shares;
    const optionLeg = (cc.C0 - Ct) * cc.shares;
    const bh = (St * (1 - fs) - cc.S0 * (1 + fb)) * cc.shares;
    return {
      date: p.date, spot: St, call: Ct, pnl: num(p.pnlTotal, NaN),
      gross: stockLeg + optionLeg, stockLeg, optionLeg, bh,
      valueAdded: num(p.pnlTotal, NaN) - bh,
      retPct: (num(p.pnlTotal, NaN) / cc.capital) * 100,
    };
  });
  if (!rows.length) return { rows, summary: null, gaps: series?.gaps?.length || 0 };
  let peak = -Infinity;
  let maxDD = 0;
  for (const r of rows) {
    peak = Math.max(peak, r.pnl);
    maxDD = Math.min(maxDD, r.pnl - peak);
  }
  const last = rows[rows.length - 1];
  return {
    rows,
    gaps: series?.gaps?.length || 0,
    summary: {
      ...last, maxDD,
      daysInProfitPct: (rows.filter((r) => r.pnl > 0).length / rows.length) * 100,
      points: rows.length,
    },
  };
}

/** سناریوهای سررسید برای موقعیت فعلی: اگر اعمال شود / اگر بی‌ارزش منقضی شود. */
export function ccSettleScenarios(cc, spot, fees = FEE0) {
  const p = ccPayoff(cc.K, cc.nc0, fees);
  return {
    ifAssigned: p(cc.K) * cc.shares,
    ifExpire: fin(spot) && spot > 0 ? (spot * (1 - num(fees.sellStock)) - cc.nc0) * cc.shares : NaN,
    breakeven: cc.nc0 / (1 - num(fees.sellStock)),
    toBreakevenPct: spot > 0 ? ((spot - cc.nc0) / cc.nc0) * 100 : NaN,
  };
}
