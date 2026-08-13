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
import { strategyMargin, capitalBase } from './margin.mjs';
import { daysSinceJalali } from './jalali.mjs';

/** قیمت بستن هر پا در بازار: موقعیت خرید روی تقاضا بسته می‌شود، فروش روی عرضه. */
export function closePrice(leg, quote, basis = 'BOOK') {
  const q = quote || {};
  if (basis === 'CLOSE') return num(q.close);
  if (basis === 'LAST') return num(q.last) || num(q.close);
  const px = leg.side === 'buy' ? num(q.bid) : num(q.ask);
  return px > 0 ? px : (num(q.last) || num(q.close));
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
  const margin = strategyMargin(legs, {
    S: num(opt.spotClose, opt.spot), closes: {},
    creditMode: opt.creditMode || 'FULL', capitalMode: opt.capitalMode || 'NET',
  });
  const cap = capitalBase({ legs, netCash: entryNet, marginNet: margin.marginNet, maxLoss: an.maxLoss });

  const held = daysSinceJalali(pos.entryDate);
  const qty = Math.max(1, num(pos.qty, 1));

  return {
    qty,
    entryGross, entryFee, entryNet,
    closeGross, closeFee, closeNet,
    pnl, pnlTotal: pnl * qty,
    perLeg,
    capital: cap.value, capitalLabel: cap.label,
    retPct: cap.value > 0 ? (pnl / cap.value) * 100 : NaN,
    retMonthPct: cap.value > 0 && held ? ((pnl / cap.value) * 100 * 30) / held : NaN,
    daysHeld: held,
    margin: margin.margin, conditionalMargin: margin.conditionalMargin,
    ifHeld: {
      atSpot: pnlAtExpiry(legs, num(opt.spot), entryNet, { fees }),
      maxProfit: an.maxProfit, maxLoss: an.maxLoss, breakevens: an.breakevens,
      unlimitedLoss: an.unlimitedLoss,
    },
    analysis: an,
  };
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

  const curAn = analyzePayoff(cur, curNet, { fees });
  const nextAn = analyzePayoff(nextLegs, nextNet, { fees });
  const diff = (S) => nextAn.at(S) - curAn.at(S);

  // مرز تصمیم: ریشه‌های تفاضل. هر دو تابع تکه‌ای-خطی‌اند، پس نقاط شکست
  // اجتماع قیمت‌های اعمال دو موقعیت است و ریشه هر بازه دقیق است.
  const ks = [...new Set([...curAn.strikes, ...nextAn.strikes])].sort((a, b) => a - b);
  const bounds = [0, ...ks, ks.length ? ks[ks.length - 1] * 3 : spot * 3];
  const crossings = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i], b = bounds[i + 1];
    const ya = diff(a + EPS), yb = diff(b - EPS);
    if (!ok(ya) || !ok(yb)) continue;
    if ((ya < 0 && yb > 0) || (ya > 0 && yb < 0)) {
      const t = -ya / (yb - ya);
      crossings.push(a + t * (b - a));
    }
  }

  const atSpot = diff(spot);
  const qty = Math.max(1, num(pos.qty, 1));

  return {
    closePrice: closePx, closeCash, newPrice: newPx, newCash,
    netCashChange: closeCash + newCash,
    curNet, nextNet, nextLegs,
    curAnalysis: curAn, nextAnalysis: nextAn,
    diff, crossings,
    atSpot, atSpotTotal: atSpot * qty,
    curMaxProfit: curAn.maxProfit, nextMaxProfit: nextAn.maxProfit,
    curMaxLoss: curAn.maxLoss, nextMaxLoss: nextAn.maxLoss,
    curBreakevens: curAn.breakevens, nextBreakevens: nextAn.breakevens,
    verdict: atSpot > 0
      ? 'در قیمت فعلی پایه، رول بهتر است'
      : atSpot < 0 ? 'در قیمت فعلی پایه، نگه داشتن موقعیت فعلی بهتر است' : 'در قیمت فعلی، تفاوتی ندارد',
    note: 'تفاضل، در سررسید سنجیده شده. هزینه بستن از مظنه فعلی آمده و اگر عمق کافی نباشد بدتر تمام می‌شود.',
  };
}

/** موقعیت خالی، برای فرم ورود. */
export function blankPosition() {
  return {
    id: `p${Date.now().toString(36)}`,
    title: '', uaIns: '', entryDate: '', qty: 1, note: '',
    legs: [],
  };
}
