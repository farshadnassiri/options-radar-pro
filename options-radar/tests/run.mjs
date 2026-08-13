// آزمون صحت‌سنجی موتور.
//
// قاعده کار: تا این آزمون‌ها پاس نشوند، هیچ استراتژی تازه‌ای اضافه نمی‌شود.
// هر کدام یک ادعای مستقل را می‌سنجد و هیچ‌کدام به شبکه نیاز ندارد.
//
// اجرا:  node tests/run.mjs

import { bsPrice, bsGreeks, impliedVol, probBelow, histVol } from '../core/bs.mjs';
import { grossCash, entryFees, analyzePayoff, signedQty } from '../core/payoff.mjs';
import { analyzeMixed } from '../core/mixed.mjs';
import {
  initialMargin, requiredMargin, minMargin, verifyMargin, impliedUnderlying,
  coverage, strategyMargin, capitalBase, DEFAULT_PARAMS,
} from '../core/margin.mjs';
import { walkBook, resolvePrice, maxSize, bookCapacity } from '../core/exec.mjs';
import { evaluate, profitRegions, probOfProfit, breakevenMetrics } from '../core/evaluate.mjs';
import { CATALOG, buildLegs, byId } from '../strategies/catalog.mjs';
import { defaults } from '../core/settings.mjs';
import { buildChain, underlyingList, chainStats } from '../core/chain.mjs';
import { scan as scanFn, generateCombos } from '../core/scan.mjs';
import { markToMarket, rollAnalysis } from '../core/positions.mjs';
import { jalaliToGregorian, gregorianToJalali, parseJalali, todayJalali } from '../core/jalali.mjs';

let pass = 0, fail = 0;
const results = [];

function check(name, cond, detail = '') {
  if (cond) { pass += 1; results.push(['✔', name, detail]); }
  else { fail += 1; results.push(['✘', name, detail]); }
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
function group(t) { results.push(['—', t, '']); }

// ═══════════════════════════ ۱. موتور بلک-شولز ═══════════════════════════
group('۱. بلک-شولز و یونانی');
{
  const S = 10000, K = 11000, T = 0.25, r = 0.30, q = 0.05, sig = 0.65;
  const c = bsPrice('call', S, K, T, r, q, sig);
  const p = bsPrice('put', S, K, T, r, q, sig);
  check('برابری خرید و فروش', near(c - p, S * Math.exp(-q * T) - K * Math.exp(-r * T), 1e-8),
    `اختلاف ${(c - p - (S * Math.exp(-q * T) - K * Math.exp(-r * T))).toExponential(2)}`);

  for (const kind of ['call', 'put']) {
    const g = bsGreeks(kind, S, K, T, r, q, sig);
    const h = S * 1e-4;
    const dNum = (bsPrice(kind, S + h, K, T, r, q, sig) - bsPrice(kind, S - h, K, T, r, q, sig)) / (2 * h);
    const gNum = (bsPrice(kind, S + h, K, T, r, q, sig) - 2 * bsPrice(kind, S, K, T, r, q, sig)
      + bsPrice(kind, S - h, K, T, r, q, sig)) / (h * h);
    const vNum = (bsPrice(kind, S, K, T, r, q, sig + 0.005) - bsPrice(kind, S, K, T, r, q, sig - 0.005)) / 1;
    const ht = 1e-5;
    const tNum = -((bsPrice(kind, S, K, T + ht, r, q, sig) - bsPrice(kind, S, K, T - ht, r, q, sig)) / (2 * ht)) / 365;
    const rNum = (bsPrice(kind, S, K, T, r + 0.005, q, sig) - bsPrice(kind, S, K, T, r - 0.005, q, sig)) / 1;
    check(`دلتا ${kind}`, near(g.delta, dNum, 1e-4), `${g.delta.toFixed(6)} ~ ${dNum.toFixed(6)}`);
    check(`گاما ${kind}`, near(g.gamma, gNum, 1e-3));
    check(`وگا ${kind}`, near(g.vega, vNum, 1e-3));
    check(`تتا ${kind}`, near(g.theta, tNum, 1e-4), `${g.theta.toFixed(3)} ~ ${tNum.toFixed(3)}`);
    check(`رو ${kind}`, near(g.rho, rNum, 1e-3));
  }

  for (const kind of ['call', 'put']) {
    const mkt = bsPrice(kind, S, K, T, r, q, 0.87);
    const iv = impliedVol(kind, mkt, S, K, T, r, q, { lo: 0.01, hi: 5 });
    check(`رفت و برگشت تلاطم ضمنی ${kind}`, near(iv, 0.87, 1e-4), `${iv.toFixed(6)}`);
  }
  check('تلاطم ضمنی زیر ارزش ذاتی → نامعلوم', !Number.isFinite(impliedVol('call', 1, 20000, 10000, 0.5, 0.3, 0, {})));

  const closes = Array.from({ length: 60 }, (_, i) => 1000 * Math.exp(0.01 * Math.sin(i)));
  check('تلاطم تاریخی عدد متناهی می‌دهد', Number.isFinite(histVol(closes, 240)));
}

// ═══════════════════════════ ۲. موتور بازده ═══════════════════════════
group('۲. بازده در سررسید — بدون کارمزد');
{
  const size = 1000;
  const mk = (kind, side, strike, price, ratio = 1) => ({ kind, side, strike, price, ratio, size });

  // کاوردکال: سهم ۱۰۰۰، فروش کال ۱۱۰۰ به ۵۰
  {
    const legs = [{ kind: 'underlying', side: 'buy', price: 1000, ratio: 1, size }, mk('call', 'sell', 1100, 50)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('کاوردکال سربه‌سری ۹۵۰', near(an.breakevens[0], 950), `${an.breakevens}`);
    check('کاوردکال بیشترین سود ۱۵۰٫۰۰۰', near(an.maxProfit, 150000));
    check('کاوردکال بیشترین زیان ۹۵۰٫۰۰۰', near(an.maxLoss, 950000));
    check('کاوردکال سود محدود', !an.unlimitedProfit);
  }

  // اسپرد صعودی کال: خرید ۱۰۰ به ۱۲، فروش ۱۲۰ به ۵
  {
    const legs = [mk('call', 'buy', 100, 12), mk('call', 'sell', 120, 5)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('اسپرد صعودی بدهکار ۷٫۰۰۰', near(grossCash(legs), -7000));
    check('اسپرد صعودی سربه‌سری ۱۰۷', near(an.breakevens[0], 107), `${an.breakevens}`);
    check('اسپرد صعودی بیشترین سود ۱۳٫۰۰۰', near(an.maxProfit, 13000));
    check('اسپرد صعودی بیشترین زیان ۷٫۰۰۰', near(an.maxLoss, 7000));
  }

  // کندور آهنی: خرید پوت ۸۰ به ۱، فروش پوت ۹۰ به ۳، فروش کال ۱۱۰ به ۳، خرید کال ۱۲۰ به ۱
  {
    const legs = [mk('put', 'buy', 80, 1), mk('put', 'sell', 90, 3), mk('call', 'sell', 110, 3), mk('call', 'buy', 120, 1)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('کندور آهنی بستانکار ۴٫۰۰۰', near(grossCash(legs), 4000));
    check('کندور آهنی دو سربه‌سری ۸۶ و ۱۱۴',
      an.breakevens.length === 2 && near(an.breakevens[0], 86) && near(an.breakevens[1], 114), `${an.breakevens}`);
    check('کندور آهنی بیشترین سود ۴٫۰۰۰', near(an.maxProfit, 4000));
    check('کندور آهنی بیشترین زیان ۶٫۰۰۰', near(an.maxLoss, 6000));
  }

  // باترفلای کال خرید: ۹۰ به ۱۲، دو تا ۱۰۰ به ۶، ۱۱۰ به ۲
  {
    const legs = [mk('call', 'buy', 90, 12), mk('call', 'sell', 100, 6, 2), mk('call', 'buy', 110, 2)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('باترفلای بدهکار ۲٫۰۰۰', near(grossCash(legs), -2000));
    check('باترفلای بیشترین سود ۸٫۰۰۰ سر ۱۰۰', near(an.maxProfit, 8000) && near(an.atMaxProfit, 100));
    check('باترفلای دو سربه‌سری ۹۲ و ۱۰۸',
      an.breakevens.length === 2 && near(an.breakevens[0], 92) && near(an.breakevens[1], 108), `${an.breakevens}`);
    check('باترفلای بیشترین زیان ۲٫۰۰۰', near(an.maxLoss, 2000));
  }

  // استرادل فروش: زیان دو طرف نامحدود
  {
    const legs = [mk('call', 'sell', 100, 8), mk('put', 'sell', 100, 7)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('استرادل فروش زیان نامحدود', an.unlimitedLoss);
    check('استرادل فروش سربه‌سری ۸۵ و ۱۱۵',
      near(an.breakevens[0], 85) && near(an.breakevens[1], 115), `${an.breakevens}`);
    check('استرادل فروش بیشترین سود ۱۵٫۰۰۰', near(an.maxProfit, 15000));
  }

  // نسبت‌اسپرد کال: خرید ۱۰۰، فروش دو تا ۱۱۰ → سود نامحدود ندارد، زیان نامحدود دارد
  {
    const legs = [mk('call', 'buy', 100, 10), mk('call', 'sell', 110, 5, 2)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('نسبت‌اسپرد زیان نامحدود', an.unlimitedLoss);
    check('نسبت‌اسپرد شیب راست منفی', an.slopeRight < 0);
  }
}

group('۳. بازده در سررسید — با کارمزد تسویه');
{
  const size = 1000;
  const fees = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };
  const legs = [
    { kind: 'underlying', side: 'buy', price: 1000, ratio: 1, size },
    { kind: 'call', side: 'sell', strike: 1100, price: 50, ratio: 1, size },
  ];
  const net = grossCash(legs) - entryFees(legs, fees);
  const an = analyzePayoff(legs, net, { fees });

  // سناریوی اعمال: سهم در قیمت اعمال تحویل می‌رود، پس فقط کارمزد اعمال
  const called = an.at(1200);
  const expectCalled = 1100 * size - 1100 * size * fees.exercise
    - 1000 * size * (1 + fees.buyStock) + 50 * size * (1 - fees.option);
  check('سناریوی اعمال — فقط کارمزد اعمال', near(called, expectCalled, 1e-9),
    `${Math.round(called).toLocaleString()} ~ ${Math.round(expectCalled).toLocaleString()}`);

  // سناریوی ایستا: سهم می‌ماند و برای نقد کردن، کارمزد فروش بازار می‌دهد
  const stat = an.at(1050);
  const expectStat = 1050 * size * (1 - fees.sellStock)
    - 1000 * size * (1 + fees.buyStock) + 50 * size * (1 - fees.option);
  check('سناریوی ایستا — کارمزد فروش بازار', near(stat, expectStat, 1e-9),
    `${Math.round(stat).toLocaleString()} ~ ${Math.round(expectStat).toLocaleString()}`);
  check('کارمزد، سربه‌سری را بالا می‌برد', an.breakevens[0] > 950, `${an.breakevens[0].toFixed(2)}`);
}

// ═══════════════════════════ ۴. وجه تضمین در برابر تابلو ═══════════════════════════
group('۴. وجه تضمین — شش مشاهده تابلو');
{
  const BOARD = [
    { name: 'ضهرم5034', ua: 'اهرم', snap: 'A', kind: 'call', K: 50000, size: 1000, prem: 1098, im: 4270000, rm: 5368000 },
    { name: 'ضهرم5033', ua: 'اهرم', snap: 'A', kind: 'call', K: 46000, size: 1000, prem: 1901, im: 5200000, rm: 7061000 },
    { name: 'ضخود5052', ua: 'خودرو', snap: 'A', kind: 'call', K: 500, size: 1000, prem: 41, im: 110000, rm: 151000 },
    { name: 'ضفزر505', ua: 'فزر', snap: 'A', kind: 'call', K: 140000, size: 1000, prem: 22876, im: 32290000, rm: 55166000 },
    { name: 'ضهرم6046', ua: 'اهرم', snap: 'B', kind: 'call', K: 46000, size: 1000, prem: 3980, im: 4320000, rm: 8300000 },
    { name: 'ضفزر505', ua: 'فزر', snap: 'B', kind: 'call', K: 140000, size: 1000, prem: 22049, im: 31390000, rm: 53439000 },
  ];

  let idOk = 0;
  const ranges = {};
  for (const b of BOARD) {
    const identity = b.im + b.prem * b.size;
    const ok = Math.abs(identity - b.rm) / b.rm <= 5e-3;
    if (ok) idOk += 1;
    else results.push(['!', `اتحاد RM در ${b.name} برقرار نیست`,
      `محاسبه ${identity.toLocaleString()} در برابر تابلو ${b.rm.toLocaleString()}`]);

    const inv = impliedUnderlying({ K: b.K, size: b.size, kind: b.kind, imRef: b.im });
    check(`بازتولید IM تابلو — ${b.name} ${b.snap}`, inv.ok,
      inv.ok ? `S سازگار ${Math.round(inv.lo).toLocaleString()} تا ${Math.round(inv.hi).toLocaleString()} | جزء ${inv.binding}` : 'هیچ S سازگاری نیست');
    if (inv.ok) {
      const k = `${b.ua}|${b.snap}`;
      ranges[k] = ranges[k] || [];
      ranges[k].push([inv.lo, inv.hi, b.name]);
    }
  }
  check('اتحاد RM = IM + پریمیوم × اندازه، در ۵ مشاهده از ۶', idOk === 5, `${idOk} از ۶`);

  // قراردادهای یک پایه در یک برداشت باید بازه S مشترک داشته باشند
  for (const [k, list] of Object.entries(ranges)) {
    if (list.length < 2) continue;
    const lo = Math.max(...list.map((x) => x[0]));
    const hi = Math.min(...list.map((x) => x[1]));
    check(`بازه S مشترک — ${k}`, lo <= hi,
      lo <= hi ? `${Math.round(lo).toLocaleString()} تا ${Math.round(hi).toLocaleString()}` : 'ناسازگار');
  }

  // تطبیق مستقیم با قیمت پایه معلوم
  const v = verifyMargin({ S: 156950, K: 140000, size: 1000, kind: 'call', optClose: 22049, imRef: 31390000, rmRef: 53439000 });
  check('تطبیق کامل ضفزر با S معلوم', v.imOk && v.rmOk && v.identityOk,
    `IM ${Math.round(v.im).toLocaleString()} | RM ${Math.round(v.rm).toLocaleString()} | جزء ${v.binding}`);

  check('گردکردن فقط روی وجه تضمین اولیه است',
    initialMargin(156950, 140000, 1000, 'call') % DEFAULT_PARAMS.C === 0
    && requiredMargin(156950, 140000, 1000, 'call', 22049) % DEFAULT_PARAMS.C !== 0);
  check('حداقل وجه تضمین ۷۰ درصد لازم است', near(minMargin(1000000), 700000));
  check('وجه تضمین در قیمت پایه یکنواست',
    initialMargin(100000, 50000, 1000, 'call') <= initialMargin(120000, 50000, 1000, 'call'));
}

// ═══════════════════════════ ۵. پوشش و قاعده بستانکار ═══════════════════════════
group('۵. پوشش موقعیت و قاعده بستانکار در برابر بدهکار');
{
  const size = 1000, S = 100;
  const mk = (kind, side, strike, price, ratio = 1, days = 30) => ({ kind, side, strike, price, ratio, size, days });
  const M = (legs) => strategyMargin(legs, { S, closes: {}, creditMode: 'FULL' });

  // چهار اسپرد عمودی: جهت و بستانکاری یکی نیستند
  const bullCall = [mk('call', 'buy', 100, 12), mk('call', 'sell', 120, 5)];
  const bearCall = [mk('call', 'sell', 100, 12), mk('call', 'buy', 120, 5)];
  const bullPut = [mk('put', 'buy', 80, 2), mk('put', 'sell', 100, 9)];
  const bearPut = [mk('put', 'sell', 80, 2), mk('put', 'buy', 100, 9)];

  check('اسپرد صعودی کال بدهکار است → وجه تضمین صفر', !M(bullCall).isCredit && M(bullCall).margin === 0);
  check('اسپرد نزولی کال بستانکار است → وجه تضمین دارد', M(bearCall).isCredit && M(bearCall).margin > 0);
  check('اسپرد صعودی پوت بستانکار است → وجه تضمین دارد، هرچند صعودی',
    M(bullPut).isCredit && M(bullPut).margin > 0);
  check('اسپرد نزولی پوت بدهکار است → وجه تضمین صفر، هرچند نزولی',
    !M(bearPut).isCredit && M(bearPut).margin === 0);

  // پوشش کامل در برابر ناقص
  check('اسپرد نزولی کال، پوشش کامل', coverage(bearCall).state === 'full');
  const ratio = [mk('call', 'buy', 100, 10), mk('call', 'sell', 110, 5, 2)];
  check('نسبت‌اسپرد، پوشش ناقص', coverage(ratio).state === 'partial', `نسبت لخت ${coverage(ratio).nakedRatio}`);
  check('نسبت‌اسپرد بدهکار هم وجه تضمین می‌گیرد، چون بخشی لخت است',
    M(ratio).margin > 0, `وجه تضمین ${Math.round(M(ratio).margin).toLocaleString()}`);

  // کاوردکال: پوشش با سهم پایه، وجه تضمین نقدی صفر
  const cc = [{ kind: 'underlying', side: 'buy', price: 100, ratio: 1, size }, mk('call', 'sell', 110, 5)];
  check('کاوردکال، وجه تضمین نقدی ندارد', M(cc).margin === 0 && coverage(cc).state === 'full');

  // پوشش با سررسید نزدیک‌تر معتبر نیست
  const badCal = [mk('call', 'buy', 100, 5, 1, 10), mk('call', 'sell', 100, 8, 1, 60)];
  check('پای محافظ با سررسید نزدیک‌تر، پوشش نیست', coverage(badCal).state === 'naked');

  // تقویمی درست: خرید دور، فروش نزدیک
  const cal = [mk('call', 'sell', 100, 5, 1, 20), mk('call', 'buy', 100, 9, 1, 80)];
  check('تقویمی، پوشش کامل', coverage(cal).state === 'full');
  check('تقویمی بدهکار → وجه تضمین صفر، ولی تضمین شرطی مثبت',
    M(cal).margin === 0 && M(cal).conditionalMargin > 0,
    `شرطی ${Math.round(M(cal).conditionalMargin).toLocaleString()}`);

  // سه حالت مقدار وجه تضمین بستانکار
  const full = strategyMargin(bearCall, { S, closes: {}, creditMode: 'FULL' }).margin;
  const less = strategyMargin(bearCall, { S, closes: {}, creditMode: 'LESS_WIDTH' }).margin;
  const width = strategyMargin(bearCall, { S, closes: {}, creditMode: 'WIDTH' }).margin;
  check('سه حالت وجه تضمین بستانکار، سه عدد متفاوت',
    full > less && less >= 0 && width > 0,
    `الف ${Math.round(full).toLocaleString()} | ب ${Math.round(less).toLocaleString()} | ج ${Math.round(width).toLocaleString()}`);
}

group('۶. مخرج بازده');
{
  const size = 1000;
  const debit = capitalBase({ legs: [{ kind: 'call' }], netCash: -7000, marginNet: 0, maxLoss: 7000 });
  check('بدهکار → مخرج، بدهکار خالص', debit.kind === 'DEBIT' && debit.value === 7000);

  const credit = capitalBase({ legs: [{ kind: 'call' }], netCash: 4000, marginNet: 2000, maxLoss: 6000 });
  check('بستانکار → مخرج، بیشینه وجه تضمین و بیشترین زیان', credit.value === 6000, credit.label);

  const credit2 = capitalBase({ legs: [{ kind: 'call' }], netCash: 4000, marginNet: 9000, maxLoss: 6000 });
  check('اگر وجه تضمین بزرگ‌تر باشد، همان مخرج است', credit2.value === 9000, credit2.label);

  const stock = capitalBase({ legs: [{ kind: 'underlying' }], netCash: -950000, marginNet: 0, maxLoss: 950000 });
  check('دارای سهم → مخرج، بهای سهم منهای پریمیوم', stock.kind === 'STOCK_NET' && stock.value === 950000);
}

// ═══════════════════════════ ۷. لایه اجرا ═══════════════════════════
group('۷. دفتر سفارش و حجم');
{
  const book = [
    { level: 1, bid: 100, bidQty: 5, ask: 105, askQty: 4 },
    { level: 2, bid: 98, bidQty: 10, ask: 107, askQty: 10 },
    { level: 3, bid: 95, bidQty: 20, ask: 110, askQty: 20 },
  ];
  const w1 = walkBook(book, 5, 'sell');
  check('فروش ۵ در سطح اول جا می‌شود', w1.full && w1.vwap === 100 && w1.levels === 1);

  const w2 = walkBook(book, 12, 'sell');
  check('فروش ۱۲ باید دو سطح مصرف کند', w2.levels === 2 && near(w2.vwap, (5 * 100 + 7 * 98) / 12, 1e-9),
    `میانگین ${w2.vwap.toFixed(2)}`);
  check('افت مظنه در فروش عمیق منفی است', w2.slipPct < 0, `${w2.slipPct.toFixed(2)}٪`);

  const w3 = walkBook(book, 100, 'buy');
  check('حجم بزرگ‌تر از عمق، کمبود را گزارش می‌کند', !w3.full && w3.short === 66, `کمبود ${w3.short}`);

  const cons = walkBook(book, 4, 'buy', 1);
  check('حالت محافظه‌کار سطح اول را نادیده می‌گیرد', cons.vwap === 107);

  check('ظرفیت دفتر، مستقل از حجم درخواستی است',
    bookCapacity(book, 'sell') === 35 && bookCapacity(book, 'buy') === 34,
    `فروش ${bookCapacity(book, 'sell')} | خرید ${bookCapacity(book, 'buy')}`);
  check('سقف افت مظنه، سطوح دور را کنار می‌گذارد',
    bookCapacity(book, 'sell', 0, 3) === 15, `${bookCapacity(book, 'sell', 0, 3)}`);
  const rp = resolvePrice({ bid: 100, ask: 105, book }, 'sell', { basis: 'BOOK', qty: 2 });
  check('سقف قرارداد از ظرفیت می‌آید نه از حجم پرشده',
    rp.filled === 2 && rp.capacity === 35, `پرشده ${rp.filled} | ظرفیت ${rp.capacity}`);

  const q = { bid: 100, bidQty: 5, ask: 105, askQty: 4, last: 102, close: 101, low: 96, high: 108, book };
  check('مبنای دفتر، ادعای اجرا دارد', resolvePrice(q, 'sell', { basis: 'BOOK', qty: 5 }).executable);
  check('مبنای پایانی، ادعای اجرا ندارد', !resolvePrice(q, 'sell', { basis: 'CLOSE', qty: 5 }).executable);
  check('کمترین قیمت روز، ناهم‌زمان علامت می‌خورد',
    resolvePrice(q, 'sell', { basis: 'LOW', qty: 5 }).simultaneous === false);
  check('میانه مظنه، ادعای اجرا ندارد',
    resolvePrice(q, 'sell', { basis: 'BOOK', execMode: 'MID', qty: 5 }).price === 102.5
    && !resolvePrice(q, 'sell', { basis: 'BOOK', execMode: 'MID', qty: 5 }).executable);
  check('بی‌مظنه، قیمت صفر و کیفیت هیچ',
    resolvePrice({ bid: 0, ask: 0, book: [] }, 'sell', { basis: 'BOOK', qty: 1 }).quality === 'none');
}

// ═══════════════════════════ ۸. احتمال سود ═══════════════════════════
group('۸. احتمال سود از بازه‌های سود');
{
  const size = 1000;
  const mk = (kind, side, strike, price, ratio = 1) => ({ kind, side, strike, price, ratio, size });

  const condor = [mk('put', 'buy', 80, 1), mk('put', 'sell', 90, 3), mk('call', 'sell', 110, 3), mk('call', 'buy', 120, 1)];
  const an = analyzePayoff(condor, grossCash(condor));
  const reg = profitRegions(an);
  check('کندور یک بازه سود دارد', reg.length === 1 && near(reg[0][0], 86) && near(reg[0][1], 114),
    reg.map((r) => `${r[0].toFixed(1)}..${r[1].toFixed(1)}`).join(' , '));
  const p = probOfProfit(an, 100, 30 / 365, 0.5);
  check('احتمال سود کندور بین صفر و صد', p > 0 && p < 100, `${p.toFixed(1)}٪`);

  const strad = [mk('call', 'buy', 100, 8), mk('put', 'buy', 100, 7)];
  const anS = analyzePayoff(strad, grossCash(strad));
  const regS = profitRegions(anS);
  check('استرادل خرید دو بازه سود دارد، دو طرف', regS.length === 2, `${regS.length}`);
  check('احتمال سود استرادل معنی‌دار است',
    probOfProfit(anS, 100, 30 / 365, 0.8) > 0, `${probOfProfit(anS, 100, 30 / 365, 0.8).toFixed(1)}٪`);
}

// ═══════════════════════════ ۹. ارزیاب ردیف ═══════════════════════════
group('۹. ارزیاب ردیف، سرتاسری');
{
  const s = defaults();
  const size = 1000;
  const mkQuote = (bid, ask, extra = {}) => ({
    bid, bidQty: 50, ask, askQty: 50, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid * 0.9, high: ask * 1.1, state: 'A', staleSec: 10,
    book: [
      { level: 1, bid, bidQty: 5, ask, askQty: 5 },
      { level: 2, bid: bid * 0.98, bidQty: 40, ask: ask * 1.02, askQty: 40 },
    ],
    ...extra,
  });

  // کاوردکال کامل با داده مصنوعی
  const def = byId('covered-call');
  const legs = buildLegs(def, { strikes: [110000], size, days: [30] });
  const quotes = [mkQuote(99000, 100000), mkQuote(4800, 5200)];
  const row = evaluate({
    legs, quotes,
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 3, settings: s, def, underlying: 'نمونه', sigmaHist: 0.6 },
  });

  check('ردیف ساخته شد و اجراپذیر است', row.executable && row.quality === 'exact', row.qualityLabel);
  check('کاوردکال بدهکار خالص است', !row.isCredit && row.netCash < 0);
  check('مخرج سرمایه، بهای سهم منهای پریمیوم', row.capitalKind === 'STOCK_NET', row.capitalLabel);
  check('کاوردکال وجه تضمین نقدی ندارد', row.margin === 0);
  check('بازده دوره مثبت و متناهی', Number.isFinite(row.retMaxPct) && row.retMaxPct > 0, `${row.retMaxPct.toFixed(2)}٪`);
  check('بازده ماهانه با نسبت روز مقیاس می‌خورد', near(row.retMonthPct, row.retMaxPct * 30 / 30, 1e-9));
  check('یونانی‌ها کامل محاسبه شدند', !row.greeksIncomplete && Number.isFinite(row.delta));
  check('دلتای کاوردکال بین صفر و اندازه قرارداد', row.delta > 0 && row.delta < size, `${row.delta.toFixed(1)}`);
  check('احتمال سود محاسبه شد', Number.isFinite(row.popPct), `${row.popPct.toFixed(1)}٪`);
  check('هزینه اجرا تفکیک شده و مثبت است',
    row.execCost > 0 && row.costCommission > 0 && row.costRows.length === 2,
    `کارمزد ${Math.round(row.costCommission).toLocaleString()} | عبور ${Math.round(row.costCrossing).toLocaleString()}`);
  check('سقف حجم و قید مقیدکننده معلوم است', row.maxQty >= 0 && !!row.binding, `${row.maxQty} — ${row.binding}`);
  check('عمق ناکافی برای حجم ۳، در هشدارها دیده می‌شود',
    row.warn.includes('عمق ناکافی') || row.maxQty < 3, row.warn.join(' , ') || 'بی‌هشدار');

  // اسپرد بستانکار: قاعده وجه تضمین و ریسک لنگ‌زدن
  const bc = byId('bear-call-spread');
  const legs2 = buildLegs(bc, { strikes: [100000, 110000], size, days: [30] });
  const row2 = evaluate({
    legs: legs2, quotes: [mkQuote(8000, 8400), mkQuote(3000, 3400)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s, def: bc, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('اسپرد نزولی کال بستانکار است', row2.isCredit, `نقد خالص ${Math.round(row2.netCash).toLocaleString()}`);
  check('بستانکار → وجه تضمین مثبت', row2.margin > 0);
  check('مخرج بستانکار، بیشینه تضمین و بیشترین زیان',
    row2.capitalKind === 'CREDIT' && row2.capital >= row2.maxLoss - 1, row2.capitalLabel);
  check('ریسک لنگ‌زدن علامت خورد', row2.leggingRisk);
  check('نسبت تضمین به زیان گزارش شد', Number.isFinite(row2.marginToMaxLoss), `${row2.marginToMaxLoss.toFixed(2)}`);
  check('چهار قلم هزینه جدا گزارش شد',
    ['costCommission', 'costCrossing', 'costSlippage', 'costFunding'].every((k) => Number.isFinite(row2[k])));

  // مبنای ناهم‌زمان باید هشدار بدهد
  const row3 = evaluate({
    legs: legs2, quotes: [mkQuote(8000, 8400), mkQuote(3000, 3400)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, def: bc, underlying: 'نمونه', sigmaHist: 0.6,
      settings: { ...s, priceBasis: 'HIGH' } },
  });
  check('مبنای بیشترین قیمت روز، هشدار ناهم‌زمانی می‌دهد', row3.warn.includes('قیمت ناهم‌زمان'));
  check('مبنای مرجع، اجراناپذیر علامت می‌خورد', !row3.executable || row3.quality !== 'exact');
}

group('۱۰. فهرست استراتژی‌ها');
{
  check('فهرست پر است', CATALOG.length >= 25, `${CATALOG.length} استراتژی`);
  check('شناسه‌ها یکتا هستند', new Set(CATALOG.map((d) => d.id)).size === CATALOG.length);
  const bad = CATALOG.filter((d) => {
    const maxSlot = Math.max(...d.legs.filter((l) => l.kind !== 'underlying').map((l) => l.slot), 0);
    return maxSlot !== d.strikes;
  });
  check('تعداد قیمت اعمال هر الگو با پاهایش می‌خواند', bad.length === 0, bad.map((d) => d.id).join(', '));
  const infeasible = CATALOG.filter((d) => !d.feasible);
  check('استراتژی‌های نیازمند فروش سهم، برچسب دارند',
    infeasible.length > 0 && infeasible.every((d) => !!d.infeasibleWhy),
    infeasible.map((d) => d.name).join(' , '));
  for (const d of CATALOG.filter((x) => x.feasible)) {
    const legs = buildLegs(d, {
      strikes: [80000, 90000, 100000, 110000].slice(0, d.strikes),
      size: 1000, days: [30, 60],
      prices: {},
    });
    const okLegs = legs.every((l) => l.kind === 'underlying' || Number.isFinite(l.strike));
    if (!okLegs) check(`ساخت پاها — ${d.name}`, false, 'قیمت اعمال ناقص');
  }
  check('ساخت پاها برای همه الگوهای شدنی', true);
}

group('۱۱. عبور همه استراتژی‌ها از موتور — همان مسیر تب موتور');
{
  const s = defaults();
  const size = 1000, spot = 100000;
  const strikesAll = [90000, 95000, 100000, 105000];
  let broke = [];
  let unbounded = [];

  for (const def of CATALOG) {
    const strikes = strikesAll.slice(0, def.strikes);
    const legs = buildLegs(def, { strikes, size, days: [30, 90] });
    const quotes = legs.map((l) => {
      const intr = l.kind === 'underlying' ? spot
        : (l.kind === 'call' ? Math.max(0, spot - l.strike) : Math.max(0, l.strike - spot));
      const p = Math.round(l.kind === 'underlying' ? spot : intr + spot * 0.03);
      const half = Math.max(1, p * 0.02);
      return {
        bid: p - half, bidQty: 1e6, ask: p + half, askQty: 1e6,
        last: p, close: p, low: p * 0.9, high: p * 1.1, state: 'A', staleSec: 0,
        book: [{ level: 1, bid: p - half, bidQty: 1e6, ask: p + half, askQty: 1e6 }],
      };
    });
    try {
      const row = evaluate({
        legs, quotes,
        ctx: { S: spot, Sclose: spot, days: 30, size, qty: 1, settings: s, def, underlying: 'نمونه', sigmaHist: 0.6 },
      });
      const finite = ['netCash', 'capital', 'execCost', 'margin', 'conditionalMargin']
        .every((k) => Number.isFinite(row[k]));
      const beSane = row.breakevens.every((b) => b > 0 && Number.isFinite(b));
      if (!finite || !beSane) broke.push(def.id);
      if (row.unlimitedLoss) unbounded.push(def.name);
      // قاعده مرکزی باید در همه‌جا برقرار باشد
      if (!row.isCredit && row.margin > 0 && row.coverage === 'full') broke.push(`${def.id} — بدهکار با وجه تضمین`);
    } catch (e) {
      broke.push(`${def.id} → ${e.message}`);
    }
  }
  check('همه ۳۱ استراتژی بدون خطا ارزیابی شدند و اعداد متناهی دادند',
    broke.length === 0, broke.join(' | '));
  check('استراتژی‌های زیان‌نامحدود شناسایی شدند', unbounded.length > 0, unbounded.join(' , '));
}

group('۱۲. زنجیره و ترکیب‌سازی');
{
  // دو رکورد دیده‌بان مصنوعی، شکل واقعی پاسخ بازار
  const mkRow = (strike, days, cBid, pBid, ua = '1', uaName = 'نمونه') => ({
    uaInsCode: ua, lval30_UA: uaName, pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}_${days}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate: 20260101,
    pMeDem_C: cBid, qTitMeDem_C: 100, pMeOf_C: cBid * 1.05, qTitMeOf_C: 100,
    pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: pBid, qTitMeDem_P: 100, pMeOf_P: pBid * 1.05, qTitMeOf_P: 100,
    pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 400, qTotTran5J_P: 800,
  });

  const rows = [];
  for (const k of [90000, 95000, 100000, 105000, 110000]) {
    rows.push(mkRow(k, 30, Math.max(200, 100000 - k + 4000), Math.max(200, k - 100000 + 4000)));
    rows.push(mkRow(k, 90, Math.max(300, 100000 - k + 7000), Math.max(300, k - 100000 + 7000)));
  }
  rows.push({
    ...mkRow(100000, 30, 0, 0, '2', 'بی‌مظنه'),
    pMeDem_C: 0, pMeOf_C: 0, pMeDem_P: 0, pMeOf_P: 0,
    pDrCotVal_C: 4200, pClosing_C: 4200, pDrCotVal_P: 4100, pClosing_P: 4100,
  });

  const chain = buildChain(rows);
  check('زنجیره دو نماد پایه ساخت', chain.size === 2, `${chain.size}`);
  const ua = chain.get('1');
  check('دو سررسید و پنج قیمت اعمال', ua.expiryList.length === 2 && ua.expiryList[0].strikeList.length === 5);
  check('سررسیدها صعودی مرتب شدند', ua.expiryList[0].days < ua.expiryList[1].days);
  const list = underlyingList(chain);
  check('فهرست انتخابی نماد، با شمارش قرارداد', list.length === 2 && list[0].contracts > 0,
    list.map((u) => `${u.name}:${u.contracts}`).join(' , '));
  const st = chainStats(chain);
  check('آمار زنجیره: قرارداد و دارای مظنه', st.contracts === 22 && st.quoted === 20,
    `قرارداد ${st.contracts} | مظنه ${st.quoted}`);

  const s2 = { ...defaults(), comboWindowPct: 25, wingsEqualWidth: true, greeksInScan: false };

  // کاوردکال: یک ترکیب به ازای هر قیمت اعمال هر سررسید
  const cc = scanFn({ def: byId('covered-call'), chain, uaKeys: ['1'], settings: s2 });
  check('کاوردکال ترکیب ساخت', cc.rows.length > 0, `${cc.rows.length} ردیف در ${cc.ms}ms`);
  check('نوار تشخیص پر شد', cc.funnel.built > 0 && cc.funnel.kept === cc.rows.length,
    `ساخته ${cc.funnel.built} | مانده ${cc.funnel.kept}`);

  // اسپرد عمودی: دو قیمت اعمال از یک سررسید، هر دو در پنجره
  const bcs = scanFn({ def: byId('bull-call-spread'), chain, uaKeys: ['1'], settings: s2 });
  check('اسپرد عمودی، هر ترکیب دو قیمت اعمال متفاوت دارد',
    bcs.rows.length > 0 && bcs.rows.every((r) => r.strikeSet.length === 2 && r.strikeSet[0] < r.strikeSet[1]),
    `${bcs.rows.length} ردیف`);

  // باترفلای با بال مساوی: ۹۰-۱۰۰-۱۱۰ می‌ماند، ۹۰-۹۵-۱۰۵ می‌افتد
  const bf = scanFn({ def: byId('long-call-butterfly'), chain, uaKeys: ['1'], settings: s2 });
  const widths = bf.rows.map((r) => [r.strikeSet[1] - r.strikeSet[0], r.strikeSet[2] - r.strikeSet[1]]);
  check('بال مساوی رعایت شد', widths.every(([a, b]) => Math.abs(a - b) < 1), `${bf.rows.length} ردیف`);
  const bfOff = scanFn({ def: byId('long-call-butterfly'), chain, uaKeys: ['1'], settings: { ...s2, wingsEqualWidth: false } });
  check('خاموش کردن بال مساوی، ترکیب را بیشتر می‌کند', bfOff.rows.length > bf.rows.length,
    `${bf.rows.length} → ${bfOff.rows.length}`);

  // تقویمی: باید دو سررسید متفاوت داشته باشد و پای دور، دورتر باشد
  const cal = scanFn({ def: byId('calendar-call'), chain, uaKeys: ['1'], settings: s2 });
  check('تقویمی دو سررسید متفاوت دارد',
    cal.rows.length > 0 && cal.rows.every((r) => r.expiryDays.length === 2 && r.expiryDays[0] < r.expiryDays[1]),
    `${cal.rows.length} ردیف`);
  check('تقویمی، پوشش کامل و بدون وجه تضمین', cal.rows.every((r) => r.margin === 0 && r.coverage === 'full'));

  // نماد بی‌مظنه هیچ ردیفی نمی‌دهد و در نوار تشخیص شمرده می‌شود
  const dead = scanFn({ def: byId('covered-call'), chain, uaKeys: ['2'], settings: s2 });
  check('نماد بی‌مظنه، صفر ردیف و شمارش در نوار تشخیص',
    dead.rows.length === 0 && dead.funnel.noQuote > 0, `بی‌مظنه ${dead.funnel.noQuote}`);
  const shown = scanFn({ def: byId('covered-call'), chain, uaKeys: ['2'], settings: { ...s2, showUnexecutable: true } });
  check('با روشن کردن نمایش غیرقابل اجرا، ردیف برمی‌گردد و برچسب می‌خورد',
    shown.rows.length > 0 && shown.rows.every((r) => !r.executable), `${shown.rows.length} ردیف`);

  // پنجره قیمت اعمال، مهار اصلی است
  const wide = scanFn({ def: byId('iron-condor'), chain, uaKeys: ['1'], settings: { ...s2, comboWindowPct: 30 } });
  const narrow = scanFn({ def: byId('iron-condor'), chain, uaKeys: ['1'], settings: { ...s2, comboWindowPct: 6 } });
  check('پنجره باریک‌تر، ترکیب کمتر', narrow.funnel.built < wide.funnel.built,
    `${wide.funnel.built} → ${narrow.funnel.built}`);
  check('سقف ترکیب هر سررسید اعمال می‌شود',
    scanFn({ def: byId('iron-condor'), chain, uaKeys: ['1'], settings: { ...s2, maxCombosPerExpiry: 2 } }).funnel.built <= 6);

  // رتبه‌بندی
  const ranked = scanFn({ def: byId('covered-call'), chain, uaKeys: ['1'], settings: { ...s2, rankBy: 'retMonthPct' } });
  const rr = ranked.rows.map((r) => r.retMonthPct).filter(Number.isFinite);
  check('ردیف‌ها نزولی مرتب شدند', rr.every((v, i) => i === 0 || rr[i - 1] >= v));
}

group('۱۳. موقعیت واقعی و تحلیل رول');
{
  const size = 1000;
  const fees = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };
  const q = (bid, ask) => ({ bid, bidQty: 1000, ask, askQty: 1000, last: (bid + ask) / 2, close: (bid + ask) / 2 });

  // کاوردکال اجراشده: سهم ۱۰۰٫۰۰۰ خریدی، کال ۱۱۰٫۰۰۰ به ۵٫۰۰۰ فروختی
  const pos = {
    id: 'p1', qty: 2, entryDate: todayJalali(), uaIns: '1',
    legs: [
      { kind: 'underlying', side: 'buy', ratio: 1, size, price: 100000 },
      { kind: 'call', side: 'sell', ratio: 1, size, strike: 110000, price: 5000, days: 30 },
    ],
  };

  // پایه بالا رفته و کال گران‌تر شده
  const mtm = markToMarket(pos, [q(104000, 105000), q(7000, 7400)], { fees, spot: 104500, spotClose: 104500 });
  check('ارزش‌گذاری لحظه‌ای عدد متناهی می‌دهد', Number.isFinite(mtm.pnl), `${Math.round(mtm.pnl).toLocaleString()}`);
  check('سود کل، ضربدر تعداد قرارداد', Math.abs(mtm.pnlTotal - mtm.pnl * 2) < 1e-6);
  check('تفکیک پا: سهم در سود، کال در زیان',
    mtm.perLeg[0].pnl > 0 && mtm.perLeg[1].pnl < 0,
    `سهم ${Math.round(mtm.perLeg[0].pnl).toLocaleString()} | کال ${Math.round(mtm.perLeg[1].pnl).toLocaleString()}`);
  check('پریمیوم دریافتی، سود تحقق‌یافته شمرده نمی‌شود', mtm.pnl < 4000 * size,
    'بدهی کال به قیمت روز لحاظ شده');
  check('اگر تا سررسید نگه داری، سود در قیمت فعلی', Number.isFinite(mtm.ifHeld.atSpot));
  check('روز نگه‌داری از تاریخ شمسی خوانده شد', mtm.daysHeld === 0, `${mtm.daysHeld}`);

  // رول: کال ۱۱۰ را ببند، کال ۱۲۰ سررسید دورتر بفروش
  const roll = rollAnalysis({
    pos, quotes: [q(104000, 105000), q(7000, 7400)],
    closeIdx: 1,
    newLeg: { kind: 'call', side: 'sell', ratio: 1, size, strike: 120000, days: 90 },
    newQuote: q(6000, 6400),
    opt: { fees, spot: 104500 },
  });
  check('هزینه بستن، از عرضه گرفته شد', roll.closePrice === 7400 && roll.closeCash < 0,
    `${Math.round(roll.closeCash).toLocaleString()}`);
  check('بستانکار پای تازه، از تقاضا گرفته شد', roll.newPrice === 6000 && roll.newCash > 0);
  check('موقعیت جدید سقف سود بالاتری دارد', roll.nextMaxProfit > roll.curMaxProfit,
    `${Math.round(roll.curMaxProfit).toLocaleString()} → ${Math.round(roll.nextMaxProfit).toLocaleString()}`);
  check('سربه‌سری موقعیت جدید بالاتر است، چون هزینه بستن پرداخت شد',
    roll.nextBreakevens[0] > roll.curBreakevens[0],
    `${roll.curBreakevens[0].toFixed(0)} → ${roll.nextBreakevens[0].toFixed(0)}`);
  check('تفاضل در قیمت پایین منفی و در قیمت بالا مثبت است',
    roll.diff(90000) < 0 && roll.diff(130000) > 0,
    `${Math.round(roll.diff(90000)).toLocaleString()} در برابر ${Math.round(roll.diff(130000)).toLocaleString()}`);
  check('مرز تصمیم پیدا شد', roll.crossings.length >= 1,
    roll.crossings.map((x) => Math.round(x).toLocaleString()).join(' , '));
  check('جمع‌بندی بر مبنای قیمت فعلی داده شد', !!roll.verdict, roll.verdict);
}

group('۱۴. تاریخ شمسی');
{
  const [gy, gm, gd] = jalaliToGregorian(1404, 5, 21);
  check('۱۴۰۴/۰۵/۲۱ برابر ۲۰۲۵-۰۸-۱۲ است', gy === 2025 && gm === 8 && gd === 12, `${gy}-${gm}-${gd}`);
  const [jy, jm, jd] = gregorianToJalali(2025, 8, 12);
  check('رفت و برگشت تاریخ', jy === 1404 && jm === 5 && jd === 21, `${jy}/${jm}/${jd}`);
  check('تاریخ بد، null می‌دهد', parseJalali('چیز بی‌ربط') === null);
  check('امروز به شمسی، قالب درست دارد', /^\d{4}\/\d{2}\/\d{2}$/.test(todayJalali()), todayJalali());
}

group('۱۵. قرارداد پیام‌رسانی ریسه اسکن');
{
  // ریسه را در نود سوار می‌کنیم، با یک self ساختگی. اینطور پروتکل پیام‌ها
  // بدون مرورگر آزمون می‌شود و خطای کلون‌شدن داده هم بیرون می‌آید.
  const out = [];
  globalThis.self = { onmessage: null, postMessage: (m) => out.push(m) };
  await import('../worker/scan-worker.mjs');
  const send = (m) => globalThis.self.onmessage({ data: m });

  const mkRow = (strike, days, cBid, pBid) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000,
    insCode_C: `c${strike}_${days}`, insCode_P: `p${strike}_${days}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days,
    pMeDem_C: cBid, qTitMeDem_C: 100, pMeOf_C: cBid * 1.05, qTitMeOf_C: 100,
    pDrCotVal_C: cBid, pClosing_C: cBid, oP_C: 500, qTotTran5J_C: 10,
    pMeDem_P: pBid, qTitMeDem_P: 100, pMeOf_P: pBid * 1.05, qTitMeOf_P: 100,
    pDrCotVal_P: pBid, pClosing_P: pBid, oP_P: 400, qTotTran5J_P: 10,
  });
  const rows = [];
  for (const k of [90000, 95000, 100000, 105000, 110000]) {
    rows.push(mkRow(k, 30, Math.max(300, 104000 - k), Math.max(300, k - 96000)));
    rows.push(mkRow(k, 90, Math.max(500, 107000 - k), Math.max(500, k - 93000)));
  }
  const st = defaults();

  send({ type: 'rows', id: 1, full: true, rows, at: Date.now() });
  const ch = out.find((m) => m.type === 'chain');
  check('ریسه زنجیره ساخت و فهرست نماد داد', !!ch && ch.list.length === 1 && ch.stats.contracts === 20,
    `${ch?.list.length} نماد | ${ch?.stats.contracts} قرارداد`);

  send({ type: 'scan', id: 2, defId: 'covered-call', uaKeys: ['1'], settings: st, qty: 1 });
  const sc = out.find((m) => m.type === 'scan');
  check('ریسه اسکن کرد و نوار تشخیص برگشت', sc.rows.length > 0 && sc.funnel.built > 0,
    `${sc.rows.length} ردیف در ${sc.ms}ms`);
  check('ردیف بین ریسه و نخ اصلی کلون می‌شود',
    (() => { try { structuredClone(sc.rows[0]); return true; } catch { return false; } })(),
    'شیء تابع‌دار در ردیف نمانده');
  check('ردیف، پاهای قیمت‌خورده را برای رسم نمودار همراه دارد',
    Array.isArray(sc.rows[0].__legs) && sc.rows[0].__legs.length === 2);

  // مرحله دو: عمق واقعی می‌نشیند و یونانی روشن می‌شود
  const target = sc.rows[0];
  const optIns = target.legIns[0];
  send({ type: 'overlay', id: 3, data: {
    1: { book: [{ level: 1, bid: 99000, bidQty: 50000, ask: 100000, askQty: 50000 },
                { level: 2, bid: 98500, bidQty: 90000, ask: 100500, askQty: 90000 }] },
    [optIns]: { book: [{ level: 1, bid: 4000, bidQty: 3, ask: 4200, askQty: 3 },
                       { level: 2, bid: 3900, bidQty: 400, ask: 4400, askQty: 400 }] },
  } });
  check('پوشش عمق پذیرفته شد', out.some((m) => m.type === 'overlay-ok'));

  send({ type: 'scan', id: 4, defId: 'covered-call', uaKeys: ['1'], settings: st, qty: 5, onlyIds: [target.id] });
  const sc2 = out.filter((m) => m.type === 'scan')[1];
  const r2 = sc2.rows[0];
  check('مرحله دو فقط همان ردیف را برمی‌گرداند', sc2.rows.length === 1 && r2.id === target.id);
  check('با عمق واقعی، افت مظنه محاسبه شد', Number.isFinite(r2.legPrices[1].slipPct),
    `${r2.legPrices[1].slipPct.toFixed(2)}٪`);
  check('در مرحله دو یونانی روشن می‌شود', Number.isFinite(r2.delta) && !r2.greeksIncomplete,
    `دلتا ${r2.delta.toFixed(1)}`);
  check('در مرحله یک یونانی خاموش است', !Number.isFinite(target.delta), 'صرفه‌جویی در تلاطم ضمنی');
  check('هشدار عمق پایه نامعلوم، پس از نشستن عمق برداشته شد',
    !r2.warn.includes('عمق پایه نامعلوم'), r2.warn.join(' , ') || 'بی‌هشدار');

  send({ type: 'chain-detail', id: 5, uaIns: '1' });
  const cd = out.find((m) => m.type === 'chain-detail');
  check('جزئیات زنجیره برای تب دیده‌بان', cd.ua.expiries.length === 2 && cd.ua.expiries[0].strikes.length === 5);

  send({ type: 'scan', id: 6, defId: 'ناشناخته', uaKeys: ['1'], settings: st });
  check('استراتژی ناشناخته، خطای تمیز می‌دهد',
    out.filter((m) => m.type === 'scan').some((m) => m.error));
  delete globalThis.self;
}

group('۱۶. موتور چند-سررسیدی — کرانداری');
{
  // این گروه یک باگ واقعی را قفل می‌کند: شیب انتهایی از لبه پنجره رسم خوانده
  // می‌شد. در دو برابر قیمت پایه، پای زنده هنوز ارزش زمانی دارد و شیب ظاهری
  // صفر نیست، پس هر تقویمی «زیان نامحدود» می‌گرفت. چون مخرج بازده بیشترین
  // زیان است، بازده هر ردیف تقویمی صفر می‌شد و کل تب از رتبه‌بندی می‌افتاد.
  const spot = 100000, size = 1000;
  const leg = (side, K, price, days, ratio = 1) =>
    ({ kind: 'call', side, ratio, strike: K, price, size, days, sigma: 0.6 });
  const cash = (ls) => ls.reduce((c, l) => c - signedQty(l) * l.price, 0);
  const run = (ls) => analyzeMixed(ls, cash(ls), { spot, rFree: 0.3, sigma: 0.6 });

  // تقویمی خرید: فروش نزدیک، خرید دور، یک قیمت اعمال
  const cal = [leg('sell', 100000, 3000, 20), leg('buy', 100000, 5000, 80)];
  const a = run(cal);
  check('تقویمی خرید، زیان کراندار است', !a.unlimitedLoss && Number.isFinite(a.maxLoss));
  check('بیشترین زیان تقویمی، دقیقاً بدهکار خالص است',
    near(a.maxLoss, 2_000_000, 1e-6), `${Math.round(a.maxLoss).toLocaleString()}`);
  check('شیب مجانبی تقویمی عملاً صفر است', Math.abs(a.slopeRight) < 1e-3,
    a.slopeRight.toExponential(2));
  check('سود تقویمی هم کراندار است', !a.unlimitedProfit && Number.isFinite(a.maxProfit),
    `${Math.round(a.maxProfit).toLocaleString()}`);

  // مورب بدهکار: اعمال‌های متفاوت، باز هم کراندار و زیانش بدهکار خالص
  const diag = [leg('sell', 110000, 1500, 20), leg('buy', 95000, 8000, 80)];
  const b = run(diag);
  check('مورب بدهکار، زیان کراندار و برابر بدهکار خالص',
    !b.unlimitedLoss && near(b.maxLoss, 6_500_000, 1e-6),
    `${Math.round(b.maxLoss).toLocaleString()}`);

  // نسبت تقویمی: یک پای لخت می‌ماند، پس زیان واقعاً نامحدود است
  const ratioCal = [leg('sell', 100000, 3000, 20, 2), leg('buy', 100000, 5000, 80)];
  const c = run(ratioCal);
  check('نسبت تقویمی، زیان واقعاً نامحدود شناسایی شد',
    c.unlimitedLoss && c.maxLoss === Infinity);
  check('شیب مجانبی نسبت تقویمی، اندازه پای لخت است',
    near(c.slopeRight, -size, 1e-6), `${c.slopeRight.toFixed(1)} در برابر ${-size}`);

  // آستانه باید با اندازه موقعیت مقیاس بخورد، نه عدد مطلق
  const big = [leg('sell', 100000, 3000, 20), leg('buy', 100000, 5000, 80)]
    .map((l) => ({ ...l, size: 1_000_000 }));
  check('تقویمی بزرگ هم کراندار می‌ماند — آستانه مقیاس‌پذیر است',
    !analyzeMixed(big, cash(big), { spot, rFree: 0.3, sigma: 0.6 }).unlimitedLoss);

  // ارزش در قیمت پایه نزدیک صفر: هر دو کال بی‌ارزش، پس همان بدهکار خالص
  check('ارزش در قیمت پایه صفر، بدهکار خالص است', near(a.atZero, -2_000_000, 1e-6),
    `${Math.round(a.atZero).toLocaleString()}`);
}

group('۱۷. سنجه‌های سربه‌سری');
{
  const S = 100000;
  // یک سربه‌سری بالای پایه: پایه باید ۵٪ بالا برود
  const up = breakevenMetrics([105000], S);
  check('فاصله تا سربه‌سری بالاتر، مثبت است', near(up.beDistPct, 5, 1e-9), `${up.beDistPct}٪`);
  check('نزدیک‌ترین سربه‌سری، همان تک نقطه است', up.beNear === 105000);

  // یک سربه‌سری زیر پایه: علامت منفی است، ولی حاشیه امن بدون علامت
  const dn = breakevenMetrics([92000], S);
  check('فاصله تا سربه‌سری پایین‌تر، منفی است', near(dn.beDistPct, -8, 1e-9), `${dn.beDistPct}٪`);
  check('حاشیه امن بدون علامت است', near(dn.beRoomPct, 8, 1e-9));

  // استرادل: دو سربه‌سری. نزدیک‌ترین انتخاب می‌شود، نه اولی.
  const strad = breakevenMetrics([94000, 108000], S);
  check('از دو سربه‌سری، نزدیک‌ترین به پایه انتخاب شد', strad.beNear === 94000,
    `${strad.beNear} در برابر ${strad.beHigh}`);
  check('پایین و بالا درست تفکیک شدند', strad.beLow === 94000 && strad.beHigh === 108000);
  check('پهنای سربه‌سری، درصد قیمت پایه است', near(strad.beWidthPct, 14, 1e-9), `${strad.beWidthPct}٪`);
  check('شمار سربه‌سری', strad.beCount === 2);

  // ترتیب ورودی نباید اثر بگذارد
  const rev = breakevenMetrics([108000, 94000], S);
  check('ترتیب ورودی اثر ندارد', rev.beNear === strad.beNear && rev.beLow === strad.beLow);

  // بدون سربه‌سری یا بدون قیمت پایه، عدد ساختگی ساخته نمی‌شود
  const none = breakevenMetrics([], S);
  check('بی‌سربه‌سری، همه سنجه‌ها نامعتبرند',
    !Number.isFinite(none.beNear) && !Number.isFinite(none.beDistPct) && none.beCount === 0);
  check('قیمت پایه نامعتبر، سنجه نمی‌سازد', !Number.isFinite(breakevenMetrics([100], 0).beNear));

  // تک سربه‌سری پهنا ندارد
  check('تک سربه‌سری پهنا ندارد', !Number.isFinite(up.beWidthPct));
  // مقدار بی‌معنی در فهرست، دور ریخته می‌شود
  const dirty = breakevenMetrics([NaN, -5, 0, 103000], S);
  check('سربه‌سری بی‌معنی کنار گذاشته شد', dirty.beCount === 1 && dirty.beNear === 103000);
}

// ═══════════════════════════ گزارش ═══════════════════════════
const W = 62;
console.log('\n' + '═'.repeat(W));
console.log('  آزمون موتور — فاز ۲');
console.log('═'.repeat(W));
for (const [mark, name, detail] of results) {
  if (mark === '—') { console.log('\n' + name); continue; }
  const pad = name.length > 46 ? name.slice(0, 46) : name.padEnd(46, ' ');
  console.log(` ${mark} ${pad} ${detail}`);
}
console.log('\n' + '─'.repeat(W));
console.log(`  قبول ${pass}   رد ${fail}`);
console.log('─'.repeat(W) + '\n');
process.exit(fail ? 1 : 0);
