// موقعیت‌های واقعی و تحلیل رول.
//
// دو نکته که این فایل روی آن بنا شده:
//
// ۱. پریمیوم دریافتی تا سررسید «سود تحقق‌یافته» نیست. موقعیت فروش، هر روز به
//    قیمت روز بدهی است. پس ارزش‌گذاری هر لحظه یعنی هزینه بستن موقعیت در بازار،
//    نه پریمیومی که گرفتی.
//
// ۲. تصمیم رول تفاضل دو موقعیت است، نه مقایسه دو پریمیوم:
//
//      D(S) = بازده موقعیت جدید در سررسید − بازده موقعیت فعلی در سررسید
//
//    نقاط تغییر علامت D مرز تصمیم‌اند. همین یک تابع، جای ده جدول مقایسه‌ای
//    را می‌گیرد و از همان موتور بازده مشترک می‌آید.

import { num, ok, EPS } from './num.mjs';
import { grossCash, entryFees, analyzePayoff, pnlAtExpiry, signedQty } from './payoff.mjs';
import { analyzeMixed } from './mixed.mjs';
import { strategyMargin, capitalBase } from './margin.mjs';
import { daysSinceJalali } from './jalali.mjs';

const ENTRY_RISK_VERSION = 1;

/** قیمت پایانی پایه در ورود؛ برای کاوردکالِ قدیمی از قیمت خرید سهم درمی‌آید. */
function entrySpotOf(pos) {
  const saved = num(pos?.entrySpot);
  if (saved > 0) return saved;
  return num(pos?.legs?.find((l) => l.kind === 'underlying')?.price);
}

/**
 * عکس فوری سرمایه و وجه تضمین روز ورود، برای یک دست قرارداد.
 *
 * قیمت اجرای اختیار لزوماً قیمت پایانی نیست. موقعیت‌های تازه `entryClose`
 * را جدا ذخیره می‌کنند؛ برای رکورد قدیمی، قیمت اجرا فقط یک برآورد است و
 * پرچم `approxMargin` این تفاوت را تا رابط حفظ می‌کند.
 */
export function captureEntryRisk(pos, opt = {}) {
  const fees = opt.fees || { buyStock: 0, sellStock: 0, option: 0, exercise: 0 };
  const legs = Array.isArray(pos?.legs) ? pos.legs : [];
  const entryGross = grossCash(legs);
  const entryFee = entryFees(legs, fees);
  const entryNet = entryGross - entryFee;
  const analysis = analyzePayoff(legs, entryNet, { fees });
  const entrySpot = entrySpotOf(pos);
  const shorts = legs.filter((l) => l.side === 'sell' && l.kind !== 'underlying');

  // بدون قیمت پایانی پایه، وجه تضمین فروش لخت قابل بازسازی نیست. استفاده از
  // قیمت امروز برای یک تاریخ قدیمی مخرج بازده را با حرکت بازار جابه‌جا می‌کند.
  if (shorts.length && !(entrySpot > 0)) {
    return {
      version: ENTRY_RISK_VERSION, available: false, entrySpot: NaN,
      reason: 'قیمت پایانی پایه در روز ورود ثبت نشده است',
    };
  }

  const closes = {};
  let approxMargin = false;
  legs.forEach((leg, i) => {
    if (leg.kind === 'underlying') return;
    const savedClose = num(leg.entryClose);
    if (savedClose > 0) closes[i] = savedClose;
    else {
      closes[i] = num(leg.price);
      if (leg.side === 'sell') approxMargin = true;
    }
  });
  const margin = strategyMargin(legs, {
    S: entrySpot, closes, params: opt.params,
    creditMode: opt.creditMode || 'FULL', capitalMode: opt.capitalMode || 'NET',
  });
  const cap = capitalBase({ legs, netCash: entryNet, marginNet: margin.marginNet, maxLoss: analysis.maxLoss });
  const available = Number.isFinite(cap.value);
  return {
    version: ENTRY_RISK_VERSION, available, entrySpot,
    capital: cap.value, capitalKind: cap.kind, capitalLabel: cap.label,
    margin: margin.margin, marginNet: margin.marginNet,
    conditionalMargin: margin.conditionalMargin,
    approxMargin,
    reason: available ? '' : 'سرمایه روز ورود قابل محاسبه نیست',
  };
}

function savedEntryRisk(pos) {
  const r = pos?.entryRisk;
  if (!r || r.version !== ENTRY_RISK_VERSION || !Number.isFinite(r.capital)) return null;
  return { ...r, available: true };
}

/** وجه تضمین لازم امروز، فقط وقتی قیمت پایانی امروزِ همه فروش‌ها موجود است. */
function currentMarginRisk(legs, quotes, opt) {
  const spot = num(opt.spotClose, opt.spot);
  const shorts = legs
    .map((leg, index) => ({ leg, index }))
    .filter(({ leg }) => leg.side === 'sell' && leg.kind !== 'underlying');
  if (!shorts.length) {
    return { available: true, margin: 0, marginNet: 0, conditionalMargin: 0 };
  }
  if (!(spot > 0) || shorts.some(({ index }) => !(num(quotes[index]?.close) > 0))) {
    return {
      available: false, margin: NaN, marginNet: NaN, conditionalMargin: NaN,
      reason: !(spot > 0)
        ? 'قیمت پایانی پایه امروز موجود نیست'
        : 'قیمت پایانی امروز یکی از قراردادهای فروش موجود نیست',
    };
  }
  const closes = {};
  shorts.forEach(({ index }) => { closes[index] = num(quotes[index].close); });
  const margin = strategyMargin(legs, {
    S: spot, closes, params: opt.params,
    creditMode: opt.creditMode || 'FULL', capitalMode: opt.capitalMode || 'NET',
  });
  return {
    available: true,
    margin: margin.margin, marginNet: margin.marginNet,
    conditionalMargin: margin.conditionalMargin,
  };
}

/** قیمت بستن هر پا در بازار: موقعیت خرید روی تقاضا بسته می‌شود، فروش روی عرضه. */
export function closePrice(leg, quote, basis = 'BOOK') {
  const q = quote || {};
  if (basis === 'CLOSE') return num(q.close);
  if (basis === 'LAST') return num(q.last) || num(q.close);
  const px = leg.side === 'buy' ? num(q.bid) : num(q.ask);
  return px > 0 ? px : (num(q.last) || num(q.close));
}

/**
 * آیا سمت خروجِ این پا اصلاً مظنه دارد؟
 *
 * بستن یعنی معامله در جهت مخالف: موقعیت خرید روی تقاضا فروخته می‌شود و
 * موقعیت فروش روی عرضه بازخرید. اگر همان یک سمت خالی باشد، هیچ قیمتی برای
 * آفست وجود ندارد — نه اینکه قیمتش نامعلوم باشد، اصلاً معامله‌ای ممکن نیست.
 */
export function canOffset(leg, quote) {
  const q = quote || {};
  return num(leg.side === 'buy' ? q.bid : q.ask) > 0;
}

/**
 * هزینه/بستانکار بستن هر پا با یک مبنای قیمت مشخص — بدون فرض قبلی درباره
 * قیمت ورود. markToMarket (موقعیت واقعی، با قیمت ورود ثبت‌شده) و evaluate
 * (ردیف غربال، «اگر همین حالا بگیرم و ببندم») هر دو از همین یک تابع
 * می‌آیند، پس رفتار «بستن یعنی معامله در جهت مخالف» یک‌بار نوشته شده.
 *
 * ——— چرا `strict` ———
 *
 * مبنای دفتر سفارش، وقتی سمت خروج خالی است، به آخرین معامله یا قیمت پایانی
 * پس می‌افتد. برای «ارزش امروزِ موقعیتم» درست است؛ برای «اگر همین حالا
 * ببندم» فاجعه است: پایی که فقط تقاضا دارد و هیچ عرضه‌ای ندارد، با آخرین
 * معاملهٔ کهنه‌اش «بازخرید» می‌شود و ردیف، سود فوریِ بزرگ نشان می‌دهد که در
 * بازار هیچ‌کس نمی‌تواند بگیردش. حسابرسی ۱٬۲۳۶ چنین ردیفی شمرد، همگی
 * یک‌طرفه؛ در ردیف‌های دوطرفه صفر.
 *
 * پس با `strict`، عددی ساخته نمی‌شود. خالی‌بودن، خودش پاسخ است.
 */
export function closeValuation(legs, quotes, basis, fees, opt = {}) {
  let gross = 0;
  let fee = 0;
  let allOffsettable = true;
  const perLeg = legs.map((l, i) => {
    const px = closePrice(l, quotes[i], basis);
    const units = Math.abs(signedQty(l));
    const proceeds = l.side === 'buy' ? px * units : -px * units;
    const feeOut = l.kind === 'underlying'
      ? px * units * (l.side === 'buy' ? num(fees.sellStock) : num(fees.buyStock))
      : px * units * num(fees.option);
    gross += proceeds;
    fee += feeOut;
    const offsettable = canOffset(l, quotes[i]);
    if (!offsettable) allOffsettable = false;
    return { price: px, proceeds, fee: feeOut, offsettable };
  });
  // ادعای آفست فقط از مبنای دفتر سفارش برمی‌آید. آخرین و پایانی از اول
  // مرجع‌اند و ادعای اجرا ندارند، پس این پرچم برایشان معنا ندارد.
  const offsettable = basis === 'BOOK' ? allOffsettable : null;
  const blocked = opt.strict === true && offsettable === false;
  return {
    gross: blocked ? NaN : gross,
    fee: blocked ? NaN : fee,
    net: blocked ? NaN : gross - fee,
    offsettable,
    perLeg,
  };
}

/**
 * ارزش‌گذاری لحظه‌ای موقعیت.
 *
 * pos: { legs:[{kind,side,ratio,strike,size,price,ins}], qty, entryDate, uaIns }
 * quotes: هم‌طول legs
 */
export function markToMarket(pos, quotes, opt = {}) {
  const fees = opt.fees || { buyStock: 0, sellStock: 0, option: 0, exercise: 0 };
  const basis = opt.basis || 'BOOK';
  const legs = pos.legs;

  const entryGross = grossCash(legs);
  const entryFee = entryFees(legs, fees);
  const entryNet = entryGross - entryFee;

  const perLeg = [];
  let closeGross = 0;
  let closeFee = 0;

  legs.forEach((l, i) => {
    const px = closePrice(l, quotes[i], basis);
    const units = Math.abs(signedQty(l));
    // بستن یعنی معامله در جهت مخالف ورود: خرید روی تقاضا فروخته می‌شود،
    // فروش روی عرضه بازخرید می‌شود.
    const proceeds = l.side === 'buy' ? px * units : -px * units;
    const feeOut = l.kind === 'underlying'
      ? px * units * (l.side === 'buy' ? num(fees.sellStock) : num(fees.buyStock))
      : px * units * num(fees.option);
    const entryCashLeg = -signedQty(l) * num(l.price);
    const feeIn = l.kind === 'underlying'
      ? num(l.price) * units * (l.side === 'buy' ? num(fees.buyStock) : num(fees.sellStock))
      : num(l.price) * units * num(fees.option);
    closeGross += proceeds;
    closeFee += feeOut;
    perLeg.push({
      kind: l.kind, side: l.side, strike: num(l.strike), units,
      entryPrice: num(l.price), markPrice: px,
      entryValue: entryCashLeg, closeValue: proceeds,
      feeIn, feeOut,
      pnl: entryCashLeg + proceeds - feeIn - feeOut,
      name: l.name || '',
    });
  });

  const closeNet = closeGross - closeFee;
  const pnl = entryNet + closeNet;

  const an = analyzePayoff(legs, entryNet, { fees });
  // بازده از یک مخرج تاریخی ثابت می‌آید؛ وجه تضمین امروز عدد دیگری است و
  // با قیمت پایانی امروزِ پایه و اختیار محاسبه می‌شود.
  const entryRisk = savedEntryRisk(pos) || captureEntryRisk(pos, opt);
  const currentRisk = currentMarginRisk(legs, quotes, opt);
  const capital = entryRisk.available ? entryRisk.capital : NaN;

  const held = daysSinceJalali(pos.entryDate);
  const qty = Math.max(1, num(pos.qty, 1));

  return {
    qty,
    entryGross, entryFee, entryNet,
    closeGross, closeFee, closeNet,
    pnl, pnlTotal: pnl * qty,
    perLeg,
    capital, capitalLabel: entryRisk.capitalLabel || entryRisk.reason,
    retPct: capital > 0 ? (pnl / capital) * 100 : NaN,
    retMonthPct: capital > 0 && held ? ((pnl / capital) * 100 * 30) / held : NaN,
    daysHeld: held,
    entrySpot: entryRisk.entrySpot,
    entryMargin: entryRisk.available ? entryRisk.margin : NaN,
    entryMarginNet: entryRisk.available ? entryRisk.marginNet : NaN,
    entryConditionalMargin: entryRisk.available ? entryRisk.conditionalMargin : NaN,
    entryMarginApprox: entryRisk.approxMargin === true,
    entryRiskAvailable: entryRisk.available === true,
    entryRiskStored: savedEntryRisk(pos) != null,
    entryRiskReason: entryRisk.reason || '',
    currentMarginAvailable: currentRisk.available,
    currentMarginReason: currentRisk.reason || '',
    currentMargin: currentRisk.margin,
    currentMarginNet: currentRisk.marginNet,
    currentConditionalMargin: currentRisk.conditionalMargin,
    // نام‌های قدیمی برای مصرف‌کننده‌های موجود؛ از این پس صریحاً «امروز»اند.
    margin: currentRisk.margin, conditionalMargin: currentRisk.conditionalMargin,
    ifHeld: {
      atSpot: pnlAtExpiry(legs, num(opt.spot), entryNet, { fees }),
      maxProfit: an.maxProfit, maxLoss: an.maxLoss, breakevens: an.breakevens,
      unlimitedLoss: an.unlimitedLoss,
    },
    analysis: an,
  };
}

/** ریشه‌های تفاضل با نمونه‌برداری چگال + تنصیف — وقتی تفاضل تکه‌ای-خطی نیست
 * (حالت چند-سررسیدی)، نقاط شکست الگبری نداریم، پس با شبکه‌ای چگال روی
 * بازه‌ای که هر دو موقعیت را در بر می‌گیرد ریشه‌یابی می‌کنیم. */
function sampledCrossings(diff, ks, spot) {
  const kMax = ks.length ? ks[ks.length - 1] : (spot > 0 ? spot : 1);
  const lo = 0, hi = Math.max(kMax * 3, spot * 3, 1);
  const N = 600;
  const crossings = [];
  let prevS = lo, prevV = diff(lo + EPS);
  for (let i = 1; i <= N; i++) {
    const S = lo + ((hi - lo) * i) / N;
    const v = diff(S);
    if (ok(prevV) && ok(v) && ((prevV < 0 && v > 0) || (prevV > 0 && v < 0))) {
      const t = -prevV / (v - prevV);
      crossings.push(prevS + t * (S - prevS));
    }
    prevS = S; prevV = v;
  }
  return crossings;
}

/**
 * تحلیل رول.
 *
 * پای شماره closeIdx بسته می‌شود و newLeg جای آن می‌نشیند.
 * جریان نقد جدید = جریان نقد ورود فعلی − هزینه بستن + بستانکار پای تازه
 *
 * خروجی:
 *   diff(S)     تفاضل بازده دو موقعیت در سررسید
 *   crossings   مرز تصمیم: قیمت‌هایی که رول از سودده به زیان‌ده می‌رود
 *   verdict     جمع‌بندی، بر مبنای قیمت فعلی پایه
 *
 * اگر پای تازه از سررسید دیگری باشد (نه فقط قیمت اعمال دیگر)، موقعیت پس از
 * رول دیگر تک‌سررسیدی نیست — analyzePayoff (بازده در سررسید) دیگر معنا
 * ندارد چون هر پا سررسید خودش را دارد. آن‌وقت هر دو طرف با analyzeMixed در
 * یک افق مشترک («امروز»، horizonDays=0 مگر صریح بازنویسی شود) سنجیده
 * می‌شوند تا مقایسه واقعاً روی یک تاریخ باشد، نه دو سررسید مختلف روی هم.
 * مسیر تک‌سررسیدی (اکثریت رول‌ها) دست‌نخورده می‌ماند — دقیقاً همان جبر
 * تکه‌ای-خطی قبلی، بدون تقریب.
 */
export function rollAnalysis({ pos, quotes, closeIdx, newLeg, newQuote, opt = {} }) {
  const fees = opt.fees || { buyStock: 0, sellStock: 0, option: 0, exercise: 0 };
  const basis = opt.basis || 'BOOK';
  const spot = num(opt.spot);

  const cur = pos.legs;
  const curNet = grossCash(cur) - entryFees(cur, fees);

  // ——— هزینه بستن پای فعلی ———
  const leg = cur[closeIdx];
  const closePx = closePrice(leg, quotes[closeIdx], basis);
  const units = Math.abs(signedQty(leg));
  const closeCash = (leg.side === 'buy' ? closePx * units : -closePx * units)
    - closePx * units * (leg.kind === 'underlying'
      ? (leg.side === 'buy' ? num(fees.sellStock) : num(fees.buyStock))
      : num(fees.option));

  // ——— بستانکار پای تازه ———
  const nq = newQuote || {};
  const newPx = newLeg.side === 'sell'
    ? (num(nq.bid) > 0 ? num(nq.bid) : num(nq.last) || num(nq.close))
    : (num(nq.ask) > 0 ? num(nq.ask) : num(nq.last) || num(nq.close));
  const nl = { ...newLeg, price: newPx, size: num(newLeg.size, num(leg.size, 1000)) };
  const newUnits = Math.abs(signedQty(nl));
  const newCash = (nl.side === 'sell' ? newPx * newUnits : -newPx * newUnits)
    - newPx * newUnits * num(fees.option);

  const nextLegs = cur.map((l, i) => (i === closeIdx ? nl : l));
  const nextNet = curNet + closeCash + newCash;

  const optDays = (legs) => new Set(legs.filter((l) => l.kind !== 'underlying').map((l) => num(l.days, 0)));
  const singleExpiry = new Set([...optDays(cur), ...optDays(nextLegs)]).size <= 1;

  let curAn, nextAn, crossings;
  if (singleExpiry) {
    curAn = analyzePayoff(cur, curNet, { fees });
    nextAn = analyzePayoff(nextLegs, nextNet, { fees });
    // مرز تصمیم: ریشه‌های تفاضل. هر دو تابع تکه‌ای-خطی‌اند، پس نقاط شکست
    // اجتماع قیمت‌های اعمال دو موقعیت است و ریشه هر بازه دقیق است.
    const ks = [...new Set([...curAn.strikes, ...nextAn.strikes])].sort((a, b) => a - b);
    const bounds = [0, ...ks, ks.length ? ks[ks.length - 1] * 3 : spot * 3];
    crossings = [];
    const diffExact = (S) => nextAn.at(S) - curAn.at(S);
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i], b = bounds[i + 1];
      const ya = diffExact(a + EPS), yb = diffExact(b - EPS);
      if (!ok(ya) || !ok(yb)) continue;
      if ((ya < 0 && yb > 0) || (ya > 0 && yb < 0)) {
        const t = -ya / (yb - ya);
        crossings.push(a + t * (b - a));
      }
    }
  } else {
    const mixOpt = {
      fees, spot, sigma: opt.sigma, rFree: opt.rFree, divYield: opt.divYield,
      horizonDays: Number.isFinite(opt.horizonDays) ? opt.horizonDays : 0,
    };
    curAn = analyzeMixed(cur, curNet, mixOpt);
    nextAn = analyzeMixed(nextLegs, nextNet, mixOpt);
    const ks = [...new Set([...curAn.strikes, ...nextAn.strikes])].sort((a, b) => a - b);
    crossings = sampledCrossings((S) => nextAn.at(S) - curAn.at(S), ks, spot);
  }
  const diff = (S) => nextAn.at(S) - curAn.at(S);

  const atSpot = diff(spot);
  const qty = Math.max(1, num(pos.qty, 1));

  return {
    closePrice: closePx, closeCash, newPrice: newPx, newCash,
    netCashChange: closeCash + newCash,
    curNet, nextNet, nextLegs,
    curAnalysis: curAn, nextAnalysis: nextAn,
    approx: !singleExpiry,
    diff, crossings,
    atSpot, atSpotTotal: atSpot * qty,
    curMaxProfit: curAn.maxProfit, nextMaxProfit: nextAn.maxProfit,
    curMaxLoss: curAn.maxLoss, nextMaxLoss: nextAn.maxLoss,
    curBreakevens: curAn.breakevens, nextBreakevens: nextAn.breakevens,
    verdict: atSpot > 0
      ? 'در قیمت فعلی پایه، رول بهتر است'
      : atSpot < 0 ? 'در قیمت فعلی پایه، نگه داشتن موقعیت فعلی بهتر است' : 'در قیمت فعلی، تفاوتی ندارد',
    note: singleExpiry
      ? 'تفاضل، در سررسید سنجیده شده. هزینه بستن از مظنه فعلی آمده و اگر عمق کافی نباشد بدتر تمام می‌شود.'
      : 'پای تازه سررسید دیگری دارد؛ تفاضل دیگر «در سررسید» معنا ندارد، پس هر دو طرف امروز با بلک-شولز ارزش‌گذاری شدند — تقریبی، نه جبری.',
  };
}

/** موقعیت خالی، برای فرم ورود. */
export function blankPosition() {
  return {
    id: `p${Date.now().toString(36)}`,
    title: '', uaIns: '', entryDate: '', entrySpot: null, entryRisk: null, qty: 1, note: '',
    legs: [],
  };
}
