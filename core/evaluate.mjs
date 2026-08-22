// ارزیاب ردیف — هر ترکیبی از پاها را به همان مجموعه ستون مشترک تبدیل می‌کند.
//
// هر تب، هر استراتژی، همین ستون‌ها را دارد. اسم و معنی و واحد در همه‌جا یکی
// است. این تنها راهی است که چیزی مبهم نماند.
//
// همه اعداد پولی برای **حجم واقعی کاربر** است — `ctx.qty` قرارداد، نه یک
// دست. تا پیش از این ردیف برای یک دست سنجیده می‌شد و کاربری که ۳۰۰ قرارداد
// می‌گرفت باید هر عدد را خودش در ۳۰۰ ضرب می‌کرد؛ «نقد خالص ۶٬۶۴۲٬۵۵۴» کنار
// «حجم من ۳۰۰» هیچ‌جا نمی‌گفت کدام‌یک را نشان می‌دهد. حالا می‌گوید.
//
// تفکیک: عددی که به موقعیت تو تعلق دارد در `qty` مقیاس می‌خورد (نقد، سود و
// زیان، سرمایه، وجه تضمین، یونانی، هزینه اجرا). عددی که مالِ بازار است
// نمی‌خورد (حجم معاملات، موقعیت باز، مظنه‌ها). قیمت هم نمی‌خورد — قیمت
// اعمال و سربه‌سری و قیمت پایه، با حجم تو جابه‌جا نمی‌شوند. درصدها هم
// دست‌نخورده می‌مانند، چون صورت و مخرجشان با هم مقیاس می‌خورند.

import { num, ok, EPS } from './num.mjs';
import {
  grossCash, entryFees, analyzePayoff, positionGreeks, signedQty,
} from './payoff.mjs';
import { strategyMargin, capitalBase } from './margin.mjs';
import { basisOf, marginParamsOf, feesOf, assetClassLabel } from './settings.mjs';
import { closeValuation } from './positions.mjs';
import {
  priceLegs, executionCost, maxSize, rowQuality, leggingRisk, spreadPct, midOf,
} from './exec.mjs';
import { bsGreeks, bsPrice, impliedVol, probBelow } from './bs.mjs';
import { analyzeMixed, isSingleExpiry } from './mixed.mjs';
import { historyDateLabel } from './history.mjs';

/** بازه‌هایی از قیمت پایه که در آن‌ها سود می‌کنی. مبنای احتمال سود. */
export function profitRegions(an) {
  // موتور چند-سررسیدی خودش بازه‌های سود را می‌دهد، چون تکه‌ای-خطی نیست
  if (an.regions) return an.regions;
  const out = [];
  for (const g of an.segments) {
    const lo = g.lo, hi = g.hi;
    const yLo = g.a * lo + g.b;
    if (Math.abs(g.a) < EPS) {
      if (yLo > 0) out.push([lo, hi]);
      continue;
    }
    const root = -g.b / g.a;
    const inside = root > lo && (Number.isFinite(hi) ? root < hi : true);
    if (!inside) { if (yLo > 0) out.push([lo, hi]); continue; }
    if (g.a > 0) out.push([root, hi]); else out.push([lo, root]);
  }
  // ادغام بازه‌های چسبیده
  const merged = [];
  for (const r of out.sort((x, y) => x[0] - y[0])) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}

/** احتمال سود، از توزیع لگاریتم-نرمال روی بازه‌های سود. */
export function probOfProfit(an, S, T, sigma) {
  if (!(S > 0) || !(T > 0) || !ok(sigma) || sigma <= 0) return NaN;
  let p = 0;
  for (const [lo, hi] of profitRegions(an)) {
    const pHi = Number.isFinite(hi) ? probBelow(S, hi, T, sigma) : 1;
    const pLo = lo <= 0 ? 0 : probBelow(S, lo, T, sigma);
    p += Math.max(0, pHi - pLo);
  }
  return Math.min(1, Math.max(0, p)) * 100;
}

/**
 * ارزیابی کامل یک ترکیب.
 *
 * ورودی:
 *   legs      پاها، بدون قیمت — قیمت از quotes و مبنای انتخابی می‌آید
 *   quotes    هم‌طول legs: { bid,bidQty,ask,askQty,last,close,low,high,book[],state,staleSec }
 *   ctx       { S, Sclose, days, size, qty, settings, sigmaHist, def }
 *
 * `ctx.qty` تعداد قرارداد (واحد استراتژی) است و در همه اعداد پولی ضرب
 * می‌شود. جای ضرب، همان‌جایی است که پاها ساخته می‌شوند — نه در پایان روی
 * تک‌تک خروجی‌ها. اگر مقیاس در انتها اعمال می‌شد، هر ستون تازه‌ای که کسی
 * اضافه می‌کرد باید به فهرست ضرب هم افزوده می‌شد وگرنه بی‌صدا در مقیاس یک
 * دست می‌ماند؛ با ضرب در نسبت پا، موتور مشترک خودش همه را می‌برد.
 */
export function evaluate({ legs, quotes, ctx }) {
  const s = ctx.settings;
  // نرخ پای سهم به نوع پایه بستگی دارد — سهم، صندوق قابل معامله، صندوق
  // کالایی. تا وقتی کاربر نگاشتش را ننوشته، هر سه یک عدد می‌گیرند و هیچ
  // ردیفی جابه‌جا نمی‌شود؛ ولی ردیف می‌گوید کدام نرخ خورده است.
  const fees = feesOf(s, ctx.assetClass || 'STOCK');
  // از `marginParamsOf` می‌آید نه از شیء دستی. سه جای برنامه این شیء را
  // دستی می‌ساختند و هر پارامتر تازه‌ای باید در هر سه اضافه می‌شد وگرنه
  // بی‌صدا جا می‌ماند — همان‌طور که مبنای جزء B جا می‌ماند.
  const params = marginParamsOf(s);
  // مبنای محاسبه از تنظیمات می‌آید، نه از عدد سخت‌کد. اندازه قرارداد و
  // تقویم، هر دو ورودی‌اند نه ثابت طبیعت.
  const basis = basisOf(s);
  const Y = Math.max(1, num(basis.yearDays, 365));
  const S = num(ctx.S);
  const Sclose = num(ctx.Sclose, S);
  const days = Math.max(1, num(ctx.days, 1));
  const T = days / Y;
  const qty = Math.max(1, Math.trunc(num(ctx.qty, s.qtyDefault)));

  // ——— ۱. قیمت اجرا ———
  // `priced` مقیاس «یک دست» را نگه می‌دارد: قیمت هر پا، کیفیت داده، و سقف
  // حجم همگی به‌ازای یک واحد معنی دارند و نباید در تعداد ضرب شوند.
  const priced = priceLegs(legs, quotes, {
    basis: s.priceBasis, execMode: s.execMode, qty,
    refFallback: !!s.showUnexecutable, maxSlipPct: s.maxSlipPct,
    contractSize: basis.contractSize,
  });

  const quality = rowQuality(priced, { staleSec: s.staleSec });
  const executable = quality.level !== 'unexecutable';

  // ——— ۱-۲. موقعیت واقعی ———
  // همان پاها، با نسبتِ ضرب‌شده در تعداد قرارداد. از اینجا به بعد هر تابع
  // موتور روی `pos` کار می‌کند، پس مقیاس یک بار اعمال می‌شود و همه‌جا —
  // بازده، وجه تضمین، یونانی، هزینه اجرا، نمودار — با هم می‌خوانند.
  const pos = qty === 1
    ? priced
    : priced.map((l) => ({ ...l, ratio: num(l.ratio, 1) * qty }));

  // ——— ۲. جریان نقد ———
  const gross = grossCash(pos);
  const entryFee = entryFees(pos, fees);
  const netCash = gross - entryFee;
  const isCredit = gross > EPS;

  // اگر همین حالا بگیرم و آفستش کنم چه می‌شود؟ / اگر با آخرین یا پایانی
  // تسویه کنم چه می‌شود؟ — سه مبنا روی همان مظنه‌های استفاده‌شده برای ورود.
  // مبنای دفتر سفارش ادعای اجرا دارد (bid/ask واقعی)؛ آخرین و پایانی فقط
  // مرجع‌اند، چون لحظه وقوعشان با لحظه این محاسبه هم‌زمان نیست.
  //
  // «بستن فوری» ادعای اجرا دارد، پس اگر سمت خروجِ حتی یک پا خالی باشد عدد
  // ساخته نمی‌شود. مبنای آخرین و پایانی از اول مرجع‌اند و همیشه عدد دارند.
  const quotesForClose = pos.map((l) => l.quote || {});
  const instantClose = closeValuation(pos, quotesForClose, 'BOOK', fees, { strict: true });
  const offsettable = instantClose.offsettable !== false;
  const instantClosePnl = offsettable ? netCash + instantClose.net : NaN;
  const settleLastPnl = netCash + closeValuation(pos, quotesForClose, 'LAST', fees).net;
  const settleClosePnl = netCash + closeValuation(pos, quotesForClose, 'CLOSE', fees).net;
  // کدام پا سمت خروج ندارد — تا کاربر بداند کجا گیر است، نه فقط اینکه گیر است
  const noExitLegs = instantClose.perLeg
    .map((x, i) => (x.offsettable ? null : (pos[i].name || pos[i].key || `پای ${i + 1}`)))
    .filter(Boolean);

  // ——— ۳. بازده در سررسید ———
  // اگر سررسید پاها یکی نباشد، موتور تکه‌ای-خطی جواب غلط می‌دهد: فروش و خرید
  // یک قیمت اعمال، ارزش ذاتی همدیگر را صفر می‌کنند و تقویمی بی‌سود درمی‌آید.
  const singleExpiry = isSingleExpiry(pos);
  const payoff = singleExpiry
    ? analyzePayoff(pos, netCash, { fees })
    : analyzeMixed(pos, netCash, {
      fees, rFree: s.rFree, divYield: s.divYield, spot: Sclose,
      sigma: ok(ctx.sigmaHist) ? ctx.sigmaHist : s.volManual,
      yearDays: Y,
    });

  // ——— ۴. وجه تضمین ———
  const closes = {};
  pos.forEach((l, i) => { closes[i] = num(l.quote?.close, num(l.price)); });
  const margin = strategyMargin(pos, {
    S: Sclose, closes, params, creditMode: s.creditSpreadMargin, capitalMode: s.capitalMode,
    nakedComboMargin: s.nakedComboMargin, contractSize: basis.contractSize,
  });

  // ——— ۵. سرمایه درگیر و بازده ———
  const capital = capitalBase({
    legs: pos, netCash, marginNet: margin.marginNet, maxLoss: payoff.maxLoss,
  });
  const cap = capital.value;

  const staticPnl = payoff.at(S);                       // اگر پایه ثابت بماند
  const bestPnl = payoff.maxProfit;
  const retMax = cap > 0 && ok(bestPnl) ? (bestPnl / cap) * 100 : NaN;
  const retStatic = cap > 0 && ok(staticPnl) ? (staticPnl / cap) * 100 : NaN;
  // سمت زیان هم باید درصد داشته باشد. تا امروز فقط سود درصد می‌گرفت
  // (`retMaxPct`) و زیان فقط ریالی بود، پس دو ترکیب با سرمایهٔ متفاوت از روی
  // ستون «بیشترین زیان» قابل مقایسه نبودند.
  const retMaxLoss = cap > 0 && ok(payoff.maxLoss) ? (payoff.maxLoss / cap) * 100 : NaN;
  // نسبت پاداش به ریسک. زیان نامحدود اینجا عدد نمی‌سازد — بی‌نهایت در مخرج
  // یعنی صفر، و صفرِ ساختگی بدتر از خالی است.
  const rewardRisk = ok(bestPnl) && ok(payoff.maxLoss) && payoff.maxLoss > 0
    ? bestPnl / payoff.maxLoss : NaN;
  const ann = (r) => (ok(r) ? (r * Y) / days : NaN);
  const annComp = (r) => {
    if (!ok(r)) return NaN;
    const v = ((1 + r / 100) ** (Y / days) - 1) * 100;
    return Number.isFinite(v) ? Math.min(v, 1e6) : NaN;
  };

  // ——— ۶. یونانی‌ها ———
  const r = s.rFree, q = s.divYield;
  // در مرحله یک غربال، استخراج تلاطم ضمنی برای هر پا گران است و کنار گذاشته
  // می‌شود. مرحله دو برای کاندیداهای برتر روشنش می‌کند.
  const wantGreeks = ctx.greeks !== false;
  // یونانی هر پا به‌ازای یک سهم است و به نسبت پا کاری ندارد، پس روی پاهای
  // یک‌دستی حساب می‌شود — همان‌جایی که `legPrices` تلاطم ضمنی را می‌خواند.
  // وزن و علامت را `positionGreeks` روی پاهای موقعیت اعمال می‌کند.
  const greeksByLeg = priced.map((l) => {
    if (l.kind === 'underlying' || !wantGreeks) return null;
    const pIv = { CLOSE: l.quote?.close, LAST: l.quote?.last, BID: l.quote?.bid }[s.ivBasis] ?? l.quote?.close;
    const Tl = Math.max(1, num(l.days, days)) / Y;
    let sig = NaN;
    if (s.volSource === 'MANUAL') sig = s.volManual;
    else if (s.volSource === 'HIST') sig = num(ctx.sigmaHist, NaN);
    else sig = impliedVol(l.kind, num(pIv), Sclose, num(l.strike), Tl, r, q, { lo: s.ivLo, hi: s.ivHi });
    if (!ok(sig) || sig <= 0) sig = ok(ctx.sigmaHist) ? ctx.sigmaHist : NaN;
    l.sigma = sig;
    if (!ok(sig)) return null;
    return bsGreeks(l.kind, Sclose, num(l.strike), Tl, r, q, sig, Y);
  });
  const greeks = wantGreeks
    ? positionGreeks(pos, greeksByLeg)
    : { delta: NaN, gamma: NaN, vega: NaN, theta: NaN, rho: NaN, deltaShares: NaN, incomplete: true };

  const sigmaUse = s.volSource === 'MANUAL' ? s.volManual
    : ok(ctx.sigmaHist) ? ctx.sigmaHist
    : priced.map((l) => l.sigma).find(ok);

  // ——— ۷. احتمال ———
  const pop = probOfProfit(payoff, S, T, sigmaUse);

  // ——— ۷-۲. مشخصات قرارداد و بازار ———
  //
  // ستون‌هایی که تابلوی حرفه‌ای دارد و تا حالا اینجا نبود. همه از داده‌ای
  // می‌آیند که قبلاً گرفته شده — هیچ درخواست تازه‌ای اضافه نمی‌کنند.
  //
  // قاعده جمع‌بستن: چیزی جمع می‌شود که جمعش معنی داشته باشد. ارزش ذاتی و
  // ارزش زمانی و نوشنال، علامت‌دار جمع می‌شوند چون ارزش موقعیت‌اند. مظنه و
  // تلاطم ضمنی جمع نمی‌شوند — آن‌ها به‌ازای هر پا فهرست می‌شوند، چون میانگین
  // یا مجموع دو مظنه، عددی است که در هیچ دفتر سفارشی وجود ندارد.
  const qtyOf = (l) => signedQty(l);
  const intrinsicOf = (l) => {
    if (l.kind === 'underlying') return Sclose;
    if (l.kind === 'call') return Math.max(0, Sclose - num(l.strike));
    return Math.max(0, num(l.strike) - Sclose);
  };

  let notional = 0, intrinsic = 0, timeValue = 0, bsValue = 0, bsKnown = true;
  let oiTotal = 0, oiChange = 0, volTotal = 0, tradeCount = 0, valueTotal = 0;
  const bidList = [], askList = [], lastList = [], closeList = [], ivList = [], headlineList = [];
  // ارزش معاملات، برخلاف فهرست‌های بالا، هم‌ترتیب با **همه** پاهاست — پای
  // سهم پایه هم خانه خودش را دارد. دلیلش تطبیق با ستون‌های هویت است:
  // `legNames` و `legsText` پای سهم را می‌شمارند، پس اگر این فهرست آن را
  // بیندازد، «پای ۱» کاوردکال در یک ستون سهم است و در ستون دیگر کال.
  //
  // خانهٔ پای سهم `NaN` می‌ماند نه صفر (قاعده ۲-۴): دیده‌بان اختیار، گردش
  // خودِ نماد پایه را در مظنه پا نمی‌دهد. صفر یعنی «امروز معامله نشد» و
  // این ادعا، ساختگی است.
  const valueList = [];
  let spreadWorst = NaN, bidQtyMin = Infinity, askQtyMin = Infinity;

  pos.forEach((l, i) => {
    const q = l.quote || {};
    const qty = qtyOf(l);
    notional += Math.abs(qty) * Sclose;
    const intr = intrinsicOf(l);
    intrinsic += qty * intr;
    timeValue += qty * (num(l.price) - intr);
    if (l.kind === 'underlying') { bsValue += qty * Sclose; valueList.push(NaN); return; }

    const Tl = Math.max(1, num(l.days, days)) / Y;
    // تلاطم روی پای یک‌دستی نشسته است، نه روی کپیِ مقیاس‌خورده
    const sig = num(priced[i].sigma, NaN);
    const theo = ok(sig) && sig > 0 ? bsPrice(l.kind, Sclose, num(l.strike), Tl, r, s.divYield, sig) : NaN;
    if (ok(theo)) bsValue += qty * theo; else bsKnown = false;

    oiTotal += num(q.oi);
    oiChange += num(q.oi) - num(q.oiYday);
    volTotal += num(q.vol);
    tradeCount += num(q.trades);
    valueTotal += num(q.value);
    valueList.push(num(q.value));

    bidList.push(num(q.bid));
    askList.push(num(q.ask));
    lastList.push(num(q.last));
    closeList.push(num(q.close));
    ivList.push(ok(sig) ? Number(sig.toFixed(4)) : NaN);
    headlineList.push(num(l.price));

    const sp = spreadPct(q);
    if (ok(sp)) spreadWorst = ok(spreadWorst) ? Math.max(spreadWorst, sp) : sp;
    if (num(q.bidQty) > 0) bidQtyMin = Math.min(bidQtyMin, num(q.bidQty));
    if (num(q.askQty) > 0) askQtyMin = Math.min(askQtyMin, num(q.askQty));
  });

  // ارزش بازاری موقعیت: مثبت یعنی خالص خریده‌ای. قرینه نقد ناخالص است.
  const marketValue = -gross;
  const bsDiffPct = bsKnown && Math.abs(bsValue) > EPS
    ? (marketValue / bsValue - 1) * 100 : NaN;
  // اهرم — کشسانی موقعیت: یک درصد حرکت پایه، چند درصد ارزش موقعیت را
  // جابه‌جا می‌کند. مخرجش ارزش بازاری است، پس در موقعیت بستانکار خالص
  // (ارزش منفی) علامتش هم معنی دارد و صاف نمی‌شود.
  const leverage = Math.abs(marketValue) > EPS && ok(greeks.delta)
    ? (greeks.delta * Sclose) / marketValue : NaN;

  // ——— ۸. هزینه اجرا ———
  const cost = executionCost(pos, {
    fees, marginNet: margin.marginNet, rFree: r, days, yearDays: Y,
  });

  // ——— ۹. سقف حجم ———
  // سقف حجم به‌ازای «یک واحد» سنجیده می‌شود — جوابش خودش تعداد قرارداد
  // است، پس ورودی‌اش هم باید مقیاس یک دست باشد وگرنه سقف بر `qty` تقسیم
  // می‌شود و کاربرِ ۳۰۰ قرارداد، سقف یک‌سیصدم واقعی می‌بیند.
  const size = maxSize(priced, {
    capitalPerContract: cap / qty,
    capitalAvailable: s.capitalAvailable,
    contractSize: basis.contractSize,
  });

  // ——— ۱۰. ریسک لنگ‌زدن ———
  const legging = leggingRisk(priced);

  const warn = [...quality.flags];
  // اندازه قرارداد در هر عدد پولی ضرب می‌شود. اگر از مشخصات قرارداد نیامده
  // باشد، یا پاهای یک ترکیب روی دو اندازه متفاوت باشند، ردیف باید بگوید —
  // وگرنه عددی که ۱۰٪ غلط است دقیقاً شبیه عددی است که درست است.
  const sizeAssumed = priced.some((l) => l.sizeAssumed);
  const sizeMixed = !!ctx.sizeMixed
    || new Set(priced.filter((l) => l.kind !== 'underlying').map((l) => num(l.size))).size > 1;
  if (sizeAssumed) warn.push('اندازه قرارداد فرضی');
  if (sizeMixed) warn.push('اندازه قرارداد ناهمگون');
  if (days < basis.shortDte) warn.push('سررسید نزدیک');
  if (!Number.isFinite(payoff.maxLoss)) warn.push('زیان نامحدود');
  if (margin.coverage === 'partial') warn.push('پوشش ناقص');
  if (priced.some((l) => l.exec?.simultaneous === false)) warn.push('قیمت ناهم‌زمان');
  if (priced.some((l) => num(l.exec?.slipPct) > s.maxSlipPct)) warn.push('افت مظنه بالا');
  if (!singleExpiry) warn.push('چند سررسید — بازده تقریبی');
  if (!offsettable) warn.push('آفست ناممکن');
  // بازده نامتعارف. بعد از اصلاح مخرج، عددهای چندمیلیون‌درصدی از بین
  // رفتند؛ آنچه می‌ماند از مظنه می‌آید نه از فرمول — اسپردی که بازار به آن
  // قیمت نمی‌دهد. حذفش نمی‌کنیم، ولی بی‌نشان هم رهایش نمی‌کنیم.
  if (num(s.retWarnMonthPct, 0) > 0 && ok(retMax)
    && (retMax * basis.monthDays) / days > s.retWarnMonthPct) warn.push('بازده نامتعارف');

  return {
    // هویت
    strategy: ctx.def?.name || 'ترکیب دستی',
    strategyId: ctx.def?.id || 'custom',
    underlying: ctx.underlying || '',
    assetClass: fees.assetClass,
    assetClassLabel: assetClassLabel(fees.assetClass),
    days, qty, legCount: priced.length,
    strikes: payoff.strikes,
    // سررسید و نام قرارداد: تا امروز ردیف فقط «روز مانده» داشت. دو ترکیب با
    // ۲۳ روز مانده می‌توانند دو سررسید متفاوت باشند، و «روز» این را نمی‌گوید.
    expiry: num(ctx.endDate),
    expiryLabel: ctx.endDate ? historyDateLabel(ctx.endDate) : '',
    // نام قراردادِ هر پا، همان‌طور که در تابلو و سامانهٔ کارگزار نوشته می‌شود
    // (مثل «طهرم7058»). این شناسه است نه عدد؛ رقمش عمداً فارسی نمی‌شود.
    legNames: priced.map((l) => l.name || '').filter(Boolean),
    legsText: priced.map((l) => `${l.side === 'sell' ? '−' : '+'}${num(l.ratio, 1)} ${l.kind === 'underlying' ? 'سهم' : (l.kind === 'call' ? 'کال' : 'پوت') + ' ' + num(l.strike)}`).join('  '),

    // قیمت
    S, Sclose,
    priceBasis: s.priceBasis, execMode: s.execMode,
    legPrices: priced.map((l) => ({
      key: l.key || `${l.kind}${l.strike ?? ''}`, side: l.side, kind: l.kind, strike: num(l.strike),
      // کیفیت ماشین‌خوان، جدا از برچسب فارسی. نوار تشخیص باید بتواند بگوید
      // ردیف چرا افتاد، و «منبع» متن است نه مقدار قابل شاخه زدن.
      price: num(l.price), source: l.exec?.source, quality: l.exec?.quality,
      slipPct: num(l.exec?.slipPct),
      filled: num(l.exec?.filled), short: num(l.exec?.short), levels: num(l.exec?.levels),
      spreadPct: spreadPct(l.quote || {}), mid: midOf(l.quote || {}), sigma: l.sigma,
    })),

    // جریان نقد
    grossCash: gross, entryFee, netCash, isCredit,
    cashLabel: isCredit ? 'بستانکار' : 'بدهکار',
    instantClosePnl, settleLastPnl, settleClosePnl,
    offsettable, noExitLegs,

    // سود و زیان
    breakevens: payoff.breakevens,
    ...breakevenMetrics(payoff.breakevens, S),
    singleExpiry, payoffApprox: !!payoff.approx, horizonDays: payoff.horizonDays ?? days,
    maxProfit: payoff.maxProfit, maxLoss: payoff.maxLoss,
    maxLossPct: retMaxLoss, rewardRisk,
    // همان عددِ `retMaxPct` است، ولی کنار «بیشترین سود» می‌نشیند تا سود و
    // زیان در یک گروه، هر دو ریالی و درصدی داشته باشند — همان تقارنی که
    // `maxLossPct` دارد.
    maxProfitPct: retMax,
    unlimitedProfit: payoff.unlimitedProfit, unlimitedLoss: payoff.unlimitedLoss,
    staticPnl,

    // مشخصات قرارداد و بازار
    notional, intrinsic, timeValue,
    bsValue: bsKnown ? bsValue : NaN, bsDiffPct, marketValue, leverage,
    oiTotal, oiChange, volTotal, tradeCount, valueTotal,
    spreadWorstPct: ok(spreadWorst) ? spreadWorst : NaN,
    bidQtyMin: Number.isFinite(bidQtyMin) ? bidQtyMin : NaN,
    askQtyMin: Number.isFinite(askQtyMin) ? askQtyMin : NaN,
    bidList, askList, lastList, closeList, ivList, headlineList,
    valueList, ...legValueSlots(valueList),
    blockedAsset: num(margin.sharesLocked) * Sclose,
    sharesLocked: num(margin.sharesLocked),
    marginRequired: num(margin.requiredTotal),

    // سرمایه
    capital: cap, capitalKind: capital.kind, capitalLabel: capital.label,
    margin: margin.margin, marginNet: margin.marginNet,
    conditionalMargin: margin.conditionalMargin,
    marginToMaxLoss: Number.isFinite(payoff.maxLoss) && payoff.maxLoss > 0
      ? margin.margin / payoff.maxLoss : NaN,
    coverage: margin.coverage, marginNote: margin.note,

    // بازده
    retMaxPct: retMax, retStaticPct: retStatic,
    retMonthPct: ok(retMax) ? (retMax * basis.monthDays) / days : NaN,
    retAnnPct: ann(retMax), retAnnCompPct: annComp(retMax),
    shortDte: days < basis.shortDte,

    // احتمال و یونانی
    popPct: pop, sigmaUse,
    delta: greeks.delta, gamma: greeks.gamma, vega: greeks.vega,
    theta: greeks.theta, rho: greeks.rho, deltaShares: greeks.deltaShares,
    greeksIncomplete: greeks.incomplete,
    thetaToCapitalPct: cap > 0 && ok(greeks.theta) ? (greeks.theta / cap) * 100 : NaN,

    // اجرا
    execCost: cost.total, costCommission: cost.commission, costCrossing: cost.crossing,
    costSlippage: cost.slippage, costFunding: cost.funding, costRows: cost.rows,
    maxQty: size.max, binding: size.binding, sizeLimits: size.limits,
    leggingRisk: legging.exists, leggingUnlimited: legging.unlimitedIfNaked,

    // سلامت
    quality: quality.level, qualityLabel: quality.label, executable,
    sizeAssumed, sizeMixed,
    contractSizes: [...new Set(priced.map((l) => num(l.size)))],
    warn: [...new Set(warn)],

    // برای نمودار — پاهای قیمت‌خورده، بدون شیء تابع‌دار
    payoff,
    // پاهای موقعیت، نه یک دست: نمودار بازده و پنل سناریو همین‌ها را با
    // `netCash` جفت می‌کنند و اگر یکی مقیاس‌خورده باشد و دیگری نه، نمودار و
    // جدول دو عدد متفاوت می‌گویند.
    __legs: pos.map((l) => ({
      kind: l.kind, side: l.side, ratio: num(l.ratio, 1), strike: num(l.strike),
      size: num(l.size, basis.contractSize), price: num(l.price), days: l.days,
      // شناسه قرارداد لازم است تا همین ترکیب در تب بک‌تست دوباره پیدا شود.
      // بدون آن، انتقال باید ترکیب را از روی قیمت اعمال حدس بزند و دو
      // قرارداد هم‌اعمال در دو سررسید، یکی گرفته می‌شوند.
      ins: l.ins ? String(l.ins) : '', name: l.name || '',
    })),
    // دفتر سفارش هر پا، برای سنجش ریسک عمق هنگام *بستن* موقعیت. فقط سطوح،
    // نه کل شیء مظنه — بقیه‌اش در ستون‌ها هست و تکرارش ردیف را سنگین می‌کند.
    __books: pos.map((l) => ({ book: Array.isArray(l.quote?.book) ? l.quote.book : [] })),
  };
}

/**
 * قرارداد ستونی مشترک. جدول هر تب از همین ساخته می‌شود، پس اسم و واحد
 * در همه تب‌ها یکی است.
 *   fmt : money | pct | num | int | text | list
 *   heat: نام طیف رنگی، اگر ستون کمی و قابل مقایسه باشد
 */
/**
 * سنجه‌های سربه‌سری نسبت به قیمت پایه فعلی.
 *
 * «سربه‌سری ۹۶٬۲۲۳» به‌تنهایی چیزی نمی‌گوید تا وقتی ندانی پایه کجاست. آنچه
 * قابل مقایسه است، فاصله نسبی است: پایه چند درصد باید حرکت کند تا به
 * نزدیک‌ترین سربه‌سری برسد.
 *
 *   beNear      نزدیک‌ترین سربه‌سری به قیمت پایه
 *   beDistPct   فاصله علامت‌دار تا آن، درصد قیمت پایه.
 *
 *               علامت از دید «قیمت امروز» خوانده می‌شود، نه از دید سربه‌سری:
 *               مثبت یعنی پایه **بالای** سربه‌سری است، منفی یعنی پایین‌تر.
 *               پیش از این وارونه بود (فاصلهٔ سربه‌سری از پایه) و همان
 *               ستون، برای دو ترکیب هم‌جهت دو علامت متفاوت می‌داد.
 *
 *   beRoomPct   اندازه همان فاصله، بدون علامت — ستون مرتب‌سازی «حاشیه امن»
 *   beLow       پایین‌ترین سربه‌سری ، beHigh  بالاترین
 *   beWidthPct  فاصله دو سر، درصد قیمت پایه. برای استرادل و کندور معنی دارد.
 *   be1..be4    هر سربه‌سری در ستون خودش، از پایین به بالا، با فاصلهٔ خودش.
 *               یک ستونِ «سربه‌سری» که چند عدد را کنار هم می‌ریزد، نه مرتب
 *               می‌شود نه مقایسه — و استرادل و کندور همیشه بیش از یکی دارند.
 *   beDistList  فاصلهٔ همه سربه‌سری‌ها، هم‌ترتیب با `breakevens`. اگر روزی
 *               ترکیبی بیش از BE_SLOTS نقطه ساخت، این ستون چیزی را پنهان
 *               نمی‌کند.
 */

/** چند سربه‌سری ستون جدا می‌گیرد. چهار پا، حداکثر چهار نقطهٔ واقعی می‌سازد. */
export const BE_SLOTS = 4;

export function breakevenMetrics(bes, S) {
  const list = (Array.isArray(bes) ? bes : []).filter((b) => ok(b) && b > 0).sort((a, b) => a - b);
  const slots = {};
  for (let i = 1; i <= BE_SLOTS; i++) { slots[`be${i}`] = NaN; slots[`be${i}DistPct`] = NaN; }
  if (!list.length || !(S > 0)) {
    return {
      beNear: NaN, beDistPct: NaN, beRoomPct: NaN, beLow: NaN, beHigh: NaN,
      beWidthPct: NaN, beCount: list.length, beDistList: [], ...slots,
    };
  }
  // مثبت = پایه بالای سربه‌سری است
  const distOf = (b) => ((S - b) / S) * 100;
  let near = list[0];
  for (const b of list) if (Math.abs(b - S) < Math.abs(near - S)) near = b;
  const lo = list[0];
  const hi = list[list.length - 1];
  for (let i = 0; i < Math.min(BE_SLOTS, list.length); i++) {
    slots[`be${i + 1}`] = list[i];
    slots[`be${i + 1}DistPct`] = distOf(list[i]);
  }
  return {
    beNear: near,
    beDistPct: distOf(near),
    beRoomPct: Math.abs(distOf(near)),
    beLow: lo,
    beHigh: hi,
    beWidthPct: list.length > 1 ? ((hi - lo) / S) * 100 : NaN,
    beCount: list.length,
    beDistList: list.map(distOf),
    ...slots,
  };
}

/** چند پا ستون ارزش معاملات جدا می‌گیرد. کاتالوگ حداکثر چهار پا دارد. */
export const LEG_VALUE_SLOTS = 4;

/**
 * ارزش معاملات امروزِ هر پا، هر کدام در ستون خودش.
 *
 * چرا ستون جدا و نه فقط `valueTotal`: مجموع ارزش معاملات یک ترکیب نمی‌گوید
 * که گردش، پخش است یا روی یک پا جمع شده. کندوری که ۹۰٪ ارزشش مال یک پاست،
 * سه پای دیگرش عملاً نمی‌شود بست — و ردیفش با کندوری که گردش متوازن دارد
 * دقیقاً یک عدد نشان می‌داد. `valueList` هم می‌ماند، برای ترکیب دستی‌ای که
 * بیش از `LEG_VALUE_SLOTS` پا داشته باشد؛ همان قاعده‌ای که `beDistList`
 * کنار `be1..be4` دارد.
 *
 * خانه‌های خالی `NaN`اند نه صفر: ستون «پای ۴» یک اسپرد دوپا اصلاً پایی
 * ندارد که گردشش صفر باشد.
 *
 * تابع خالص است تا بی‌نیاز از مرورگر آزمون شود.
 */
export function legValueSlots(values) {
  const list = Array.isArray(values) ? values : [];
  const slots = {};
  for (let i = 1; i <= LEG_VALUE_SLOTS; i++) slots[`legValue${i}`] = NaN;
  for (let i = 0; i < Math.min(LEG_VALUE_SLOTS, list.length); i++) {
    slots[`legValue${i + 1}`] = ok(list[i]) ? list[i] : NaN;
  }
  return slots;
}

export const COLUMNS = [
  { key: 'strategy', label: 'استراتژی', fmt: 'text', group: 'هویت', pin: true },
  { key: 'underlying', label: 'پایه', fmt: 'text', group: 'هویت', pin: true },
  { key: 'legsText', label: 'پاها', fmt: 'text', group: 'هویت', pin: true },
  { key: 'days', label: 'روز', fmt: 'int', group: 'هویت' },
  // بدون این ستون، «نقد خالص ۶٬۶۴۲٬۵۵۴» نمی‌گوید مال چند قرارداد است.
  { key: 'qty', label: 'حجم من (قرارداد)', fmt: 'int', group: 'هویت' },
  { key: 'assetClassLabel', label: 'نوع دارایی پایه — مبنای نرخ کارمزد', fmt: 'text', group: 'هویت' },
  { key: 'expiryLabel', label: 'تاریخ سررسید', fmt: 'text', group: 'هویت' },
  { key: 'strikes', label: 'قیمت اعمال', fmt: 'list', group: 'هویت' },
  { key: 'legNames', label: 'نام قرارداد پاها', fmt: 'sym', group: 'هویت' },
  { key: 'cashLabel', label: 'جهت نقدی', fmt: 'text', group: 'جریان نقد' },
  { key: 'grossCash', label: 'نقد ناخالص', fmt: 'money', group: 'جریان نقد' },
  { key: 'entryFee', label: 'کارمزد ورود', fmt: 'money', group: 'جریان نقد' },
  { key: 'netCash', label: 'نقد خالص', fmt: 'money', group: 'جریان نقد' },
  { key: 'instantClosePnl', label: 'آفست — سود/زیان بستن فوری با دفتر سفارش', fmt: 'money', group: 'جریان نقد', heat: 'gain' },
  { key: 'offsettable', label: 'آفست ممکن است', fmt: 'bool', group: 'جریان نقد' },
  { key: 'noExitLegs', label: 'پای بدون سمت خروج', fmt: 'sym', group: 'جریان نقد' },
  { key: 'settleLastPnl', label: 'سود/زیان اگر تسویه با آخرین معامله', fmt: 'money', group: 'جریان نقد' },
  { key: 'settleClosePnl', label: 'سود/زیان اگر تسویه با قیمت پایانی', fmt: 'money', group: 'جریان نقد' },
  { key: 'S', label: 'قیمت پایه', fmt: 'money', group: 'سود و زیان' },
  { key: 'breakevens', label: 'سربه‌سری', fmt: 'list', group: 'سود و زیان' },
  { key: 'beDistList', label: 'فاصله تا هر سربه‌سری ٪', fmt: 'pctList', group: 'سود و زیان' },
  { key: 'be1', label: 'سربه‌سری ۱', fmt: 'money', group: 'سود و زیان' },
  { key: 'be1DistPct', label: 'فاصله تا سربه‌سری ۱ ٪', fmt: 'pct', group: 'سود و زیان' },
  { key: 'be2', label: 'سربه‌سری ۲', fmt: 'money', group: 'سود و زیان' },
  { key: 'be2DistPct', label: 'فاصله تا سربه‌سری ۲ ٪', fmt: 'pct', group: 'سود و زیان' },
  { key: 'be3', label: 'سربه‌سری ۳', fmt: 'money', group: 'سود و زیان' },
  { key: 'be3DistPct', label: 'فاصله تا سربه‌سری ۳ ٪', fmt: 'pct', group: 'سود و زیان' },
  { key: 'be4', label: 'سربه‌سری ۴', fmt: 'money', group: 'سود و زیان' },
  { key: 'be4DistPct', label: 'فاصله تا سربه‌سری ۴ ٪', fmt: 'pct', group: 'سود و زیان' },
  { key: 'beNear', label: 'نزدیک‌ترین سربه‌سری', fmt: 'money', group: 'سود و زیان' },
  { key: 'beDistPct', label: 'فاصله تا سربه‌سری ٪', fmt: 'pct', group: 'سود و زیان' },
  { key: 'beRoomPct', label: 'حاشیه امن ٪', fmt: 'pct', group: 'سود و زیان', heat: 'prob' },
  { key: 'beLow', label: 'سربه‌سری پایین', fmt: 'money', group: 'سود و زیان' },
  { key: 'beHigh', label: 'سربه‌سری بالا', fmt: 'money', group: 'سود و زیان' },
  { key: 'beWidthPct', label: 'پهنای سربه‌سری ٪', fmt: 'pct', group: 'سود و زیان' },
  { key: 'maxProfit', label: 'بیشترین سود', fmt: 'money', group: 'سود و زیان', heat: 'gain' },
  { key: 'maxProfitPct', label: 'بیشترین سود ٪ سرمایه', fmt: 'pct', group: 'سود و زیان', heat: 'gain' },
  { key: 'maxLoss', label: 'بیشترین زیان', fmt: 'money', group: 'سود و زیان', heat: 'loss' },
  { key: 'maxLossPct', label: 'بیشترین زیان ٪ سرمایه', fmt: 'pct', group: 'سود و زیان', heat: 'loss' },
  { key: 'rewardRisk', label: 'پاداش به ریسک', fmt: 'num', group: 'سود و زیان', heat: 'gain' },
  { key: 'staticPnl', label: 'سود اگر پایه ثابت بماند', fmt: 'money', group: 'سود و زیان' },
  { key: 'headlineList', label: 'قیمت سرخط', fmt: 'list', group: 'مظنه' },
  { key: 'bidList', label: 'تقاضا', fmt: 'list', group: 'مظنه' },
  { key: 'askList', label: 'عرضه', fmt: 'list', group: 'مظنه' },
  { key: 'bidQtyMin', label: 'حجم تقاضا — کمترین پا', fmt: 'int', group: 'مظنه' },
  { key: 'askQtyMin', label: 'حجم عرضه — کمترین پا', fmt: 'int', group: 'مظنه' },
  { key: 'lastList', label: 'آخرین', fmt: 'list', group: 'مظنه' },
  { key: 'closeList', label: 'پایانی', fmt: 'list', group: 'مظنه' },
  { key: 'spreadWorstPct', label: 'فاصله ٪ — بدترین پا', fmt: 'pct', group: 'مظنه', heat: 'loss' },
  { key: 'volTotal', label: 'حجم', fmt: 'int', group: 'بازار' },
  { key: 'valueTotal', label: 'ارزش معاملات', fmt: 'money', group: 'بازار' },
  { key: 'valueList', label: 'ارزش معاملات هر پا', fmt: 'moneyList', group: 'بازار' },
  { key: 'legValue1', label: 'ارزش معاملات پای ۱', fmt: 'money', group: 'بازار', heat: 'gain' },
  { key: 'legValue2', label: 'ارزش معاملات پای ۲', fmt: 'money', group: 'بازار', heat: 'gain' },
  { key: 'legValue3', label: 'ارزش معاملات پای ۳', fmt: 'money', group: 'بازار', heat: 'gain' },
  { key: 'legValue4', label: 'ارزش معاملات پای ۴', fmt: 'money', group: 'بازار', heat: 'gain' },
  { key: 'tradeCount', label: 'تعداد معامله', fmt: 'int', group: 'بازار' },
  { key: 'oiTotal', label: 'موقعیت باز', fmt: 'int', group: 'بازار' },
  { key: 'oiChange', label: 'تغییر موقعیت باز', fmt: 'int', group: 'بازار' },
  { key: 'notional', label: 'نوشنال ولیو', fmt: 'money', group: 'ارزش قرارداد' },
  { key: 'marketValue', label: 'ارزش بازاری موقعیت', fmt: 'money', group: 'ارزش قرارداد' },
  { key: 'intrinsic', label: 'ارزش ذاتی', fmt: 'money', group: 'ارزش قرارداد' },
  { key: 'timeValue', label: 'ارزش زمانی', fmt: 'money', group: 'ارزش قرارداد' },
  { key: 'bsValue', label: 'بلک‌شولز', fmt: 'money', group: 'ارزش قرارداد' },
  { key: 'bsDiffPct', label: 'درصد اختلاف با بلک‌شولز', fmt: 'pct', group: 'ارزش قرارداد' },
  { key: 'ivList', label: 'تلاطم ضمنی هر پا', fmt: 'list', group: 'ارزش قرارداد' },
  { key: 'leverage', label: 'اهرم', fmt: 'num', group: 'ارزش قرارداد' },
  { key: 'capital', label: 'سرمایه درگیر', fmt: 'money', group: 'سرمایه' },
  { key: 'marginRequired', label: 'تضمین لازم', fmt: 'money', group: 'سرمایه' },
  { key: 'blockedAsset', label: 'دارایی مسدودی', fmt: 'money', group: 'سرمایه' },
  { key: 'sharesLocked', label: 'سهم قفل‌شده', fmt: 'int', group: 'سرمایه' },
  { key: 'capitalLabel', label: 'مبنای سرمایه', fmt: 'text', group: 'سرمایه' },
  { key: 'margin', label: 'وجه تضمین', fmt: 'money', group: 'سرمایه' },
  { key: 'marginToMaxLoss', label: 'تضمین به زیان', fmt: 'num', group: 'سرمایه' },
  { key: 'conditionalMargin', label: 'تضمین شرطی', fmt: 'money', group: 'سرمایه' },
  { key: 'retMaxPct', label: 'بازده دوره ٪', fmt: 'pct', group: 'بازده', heat: 'gain' },
  { key: 'retStaticPct', label: 'بازده ایستا ٪', fmt: 'pct', group: 'بازده' },
  { key: 'retMonthPct', label: 'بازده ماهانه ٪', fmt: 'pct', group: 'بازده', heat: 'gain' },
  { key: 'retAnnPct', label: 'بازده سالانه ٪', fmt: 'pct', group: 'بازده' },
  { key: 'retAnnCompPct', label: 'سالانه مرکب ٪', fmt: 'pct', group: 'بازده' },
  { key: 'popPct', label: 'احتمال سود ٪', fmt: 'pct', group: 'احتمال', heat: 'prob' },
  { key: 'delta', label: 'دلتا', fmt: 'num', group: 'یونانی' },
  { key: 'gamma', label: 'گاما', fmt: 'num', group: 'یونانی' },
  { key: 'vega', label: 'وگا', fmt: 'money', group: 'یونانی' },
  { key: 'theta', label: 'تتا روزانه', fmt: 'money', group: 'یونانی' },
  { key: 'rho', label: 'رو', fmt: 'money', group: 'یونانی' },
  { key: 'deltaShares', label: 'دلتا بر حسب سهم', fmt: 'num', group: 'یونانی' },
  { key: 'thetaToCapitalPct', label: 'تتا به سرمایه ٪', fmt: 'pct', group: 'یونانی', heat: 'gain' },
  { key: 'sigmaUse', label: 'تلاطم مبنا', fmt: 'num', group: 'یونانی' },
  { key: 'execCost', label: 'هزینه اجرا', fmt: 'money', group: 'اجرا', heat: 'loss' },
  { key: 'costCommission', label: 'کارمزد', fmt: 'money', group: 'اجرا' },
  { key: 'costCrossing', label: 'عبور از اسپرد', fmt: 'money', group: 'اجرا' },
  { key: 'costSlippage', label: 'افت مظنه', fmt: 'money', group: 'اجرا' },
  { key: 'costFunding', label: 'هزینه فرصت تضمین', fmt: 'money', group: 'اجرا' },
  { key: 'maxQty', label: 'سقف قرارداد', fmt: 'int', group: 'اجرا' },
  { key: 'binding', label: 'قید مقیدکننده', fmt: 'text', group: 'اجرا' },
  { key: 'qualityLabel', label: 'کیفیت داده', fmt: 'text', group: 'سلامت' },
  { key: 'warn', label: 'هشدار', fmt: 'list', group: 'سلامت' },
];

const LEG_KIND_FA = { call: 'کال', put: 'پوت', underlying: 'سهم' };

// رقم فارسی، همان‌جا. `ui/fmt.mjs` این را دارد ولی هسته به رابط وابسته
// نمی‌شود؛ ورودی اینجا یک عدد صحیح کوچک است (نسبت پا)، نه عدد پولی.
const faInt = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);

/**
 * قرارداد ستونی، با سرستون پاهای یک استراتژی مشخص.
 *
 * «ارزش معاملات پای ۲» به‌تنهایی هیچ‌چیز نمی‌گوید: در استرانگل فروش یکی
 * پوت است و دیگری کال، و کاربر برای فهمیدنِ کدام باید ستون «نام قرارداد
 * پاها» را جدا بخواند و با ترتیب تطبیق بدهد. هر تب استراتژی دقیقاً یک الگو
 * دارد، پس نوع و جهت هر پا از خودِ تعریف استراتژی معلوم است و می‌تواند در
 * سرستون بنشیند.
 *
 * شماره پا می‌ماند و حذف نمی‌شود: باترفلای سه پای کال دارد و بدون شماره،
 * سه سرستون هم‌نام می‌شوند.
 *
 * جدولی که ردیف‌هایش از استراتژی‌های مختلف می‌آیند (برترین موقعیت‌ها) این
 * را صدا نمی‌زند — آنجا نگاشت واحدی از «پای ۲» به یک نوع پا وجود ندارد.
 *
 * تابع خالص است و همان `COLUMNS` را برمی‌گرداند اگر استراتژی پا نداشته
 * باشد، تا فراخوانی‌اش هیچ‌جا شرط لازم نداشته باشد.
 */
export function columnsForStrategy(def) {
  const legs = def?.legs || [];
  if (!legs.length) return COLUMNS;
  return COLUMNS.map((c) => {
    const m = /^legValue(\d+)$/.exec(c.key);
    const leg = m ? legs[Number(m[1]) - 1] : null;
    if (!leg) return c;
    const side = leg.side === 'sell' ? 'فروش' : 'خرید';
    const ratio = num(leg.ratio, 1) > 1 ? ` ×${faInt(leg.ratio)}` : '';
    return { ...c, label: `${c.label} — ${side} ${LEG_KIND_FA[leg.kind] || ''}${ratio}` };
  });
}
