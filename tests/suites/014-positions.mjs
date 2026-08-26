// ۱۳. موقعیت واقعی و تحلیل رول
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { todayJalali } from '../../core/jalali.mjs';
import { analyzeMixed } from '../../core/mixed.mjs';
import { analyzePayoff } from '../../core/payoff.mjs';
import { captureEntryRisk, markToMarket, rollAnalysis } from '../../core/positions.mjs';


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

  // فروش لخت: سرمایه ورود باید عکس فوری باشد، نه ترکیب قیمت پایه امروز با
  // پریمیوم روز ورود. با ثابت‌ماندن مظنه اختیار، P&L یکی است؛ تغییر قیمت
  // پایه فقط وجه تضمین لازم امروز را عوض می‌کند و نباید مخرج بازده را بجنباند.
  const naked = {
    id: 'p-naked', qty: 1, entryDate: todayJalali(), uaIns: '1', entrySpot: 100000,
    legs: [
      { kind: 'call', side: 'sell', ratio: 1, size, strike: 110000, price: 5000, entryClose: 5200, days: 30 },
    ],
  };
  naked.entryRisk = captureEntryRisk(naked, { fees, capitalMode: 'NET' });
  const nakedLow = markToMarket(naked, [q(6900, 7100)], {
    fees, spot: 100000, spotClose: 100000, capitalMode: 'NET',
  });
  const nakedHigh = markToMarket(naked, [q(6900, 7100)], {
    fees, spot: 150000, spotClose: 150000, capitalMode: 'NET',
  });
  check('فروش لخت، عکس فوری معتبرِ سرمایه ورود دارد',
    naked.entryRisk.available && nakedLow.entryRiskStored && nakedLow.capital > 0);
  check('وجه تضمین ورود از قیمت پایانی ثبت‌شده اختیار می‌آید',
    nakedLow.entryMargin === naked.entryRisk.margin && nakedLow.entryMargin !== nakedLow.currentMargin,
    `${Math.round(nakedLow.entryMargin).toLocaleString()} / ${Math.round(nakedLow.currentMargin).toLocaleString()}`);
  check('حرکت پایه امروز، سرمایه ورود و بازده را جابه‌جا نمی‌کند',
    near(nakedLow.pnl, nakedHigh.pnl) && near(nakedLow.capital, nakedHigh.capital)
      && near(nakedLow.retPct, nakedHigh.retPct),
    `${nakedLow.retPct.toFixed(4)}٪ / ${nakedHigh.retPct.toFixed(4)}٪`);
  check('حرکت پایه امروز فقط وجه تضمین جاری را به‌روز می‌کند',
    nakedHigh.currentMargin > nakedLow.currentMargin,
    `${Math.round(nakedLow.currentMargin).toLocaleString()} → ${Math.round(nakedHigh.currentMargin).toLocaleString()}`);

  const legacyNaked = {
    id: 'p-legacy', qty: 1, entryDate: todayJalali(), uaIns: '1',
    legs: [{ kind: 'put', side: 'sell', ratio: 1, size, strike: 90000, price: 4000, days: 30 }],
  };
  const legacyMtm = markToMarket(legacyNaked, [q(4900, 5100)], {
    fees, spot: 100000, spotClose: 100000,
  });
  check('موقعیت قدیمیِ فاقد قیمت پایه ورود، بازده ساختگی نمی‌سازد',
    !legacyMtm.entryRiskAvailable && Number.isNaN(legacyMtm.capital) && Number.isNaN(legacyMtm.retPct)
      && legacyMtm.entryRiskReason.includes('ثبت نشده'));

  const noCloseToday = markToMarket(naked, [{ bid: 6900, ask: 7100, last: 7000, close: 0 }], {
    fees, spot: 100000, spotClose: 100000,
  });
  check('بدون قیمت پایانی امروز اختیار، وجه تضمین جاری ساخته نمی‌شود',
    !noCloseToday.currentMarginAvailable && Number.isNaN(noCloseToday.currentMargin));

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
  check('تفاضل در قیمت پایین منفی و در قیمت بالا (فراتر از مرز تصمیم) مثبت است',
    roll.diff(90000) < 0 && roll.diff(200000) > 0,
    `${Math.round(roll.diff(90000)).toLocaleString()} در برابر ${Math.round(roll.diff(200000)).toLocaleString()}`);
  check('مرز تصمیم پیدا شد', roll.crossings.length >= 1,
    roll.crossings.map((x) => Math.round(x).toLocaleString()).join(' , '));
  check('جمع‌بندی بر مبنای قیمت فعلی داده شد', !!roll.verdict, roll.verdict);

  // ——— رول چند-سررسیدی: پای تازه سررسید دیگری دارد (قلم الف-۵ بک‌لاگ) ———
  // ۱۱۰/۳۰روزه بسته می‌شود، ۱۲۰/۹۰روزه جای آن می‌نشیند — پس موقعیت پس از رول
  // دیگر تک‌سررسیدی نیست. analyzePayoff دیگر معنا ندارد (هر پا سررسید خودش
  // را می‌خواهد)، پس مسیر analyzeMixed با افق مشترک «امروز» باید فعال شود.
  check('رول چند-سررسیدی، approx=true را علامت می‌زند', roll.approx === true);
  check('یادداشت رول چند-سررسیدی، تقریبی‌بودن را می‌گوید', roll.note.includes('تقریبی'));

  // هویت جبری: diff همین رول باید دقیقاً از تفاضل دو analyzeMixed مستقل،
  // با همان افق و همان netCash های برگشتی، به دست بیاید — نه یک تقریب دیگر.
  const mixOpt13 = { fees, spot: 104500, horizonDays: 0 };
  const curCheck13 = analyzeMixed(pos.legs, roll.curNet, mixOpt13);
  const nextCheck13 = analyzeMixed(roll.nextLegs, roll.nextNet, mixOpt13);
  const identityAt = 115000;
  check('diff رول چند-سررسیدی دقیقاً از دو analyzeMixed مستقل می‌آید (هویت جبری)',
    near(roll.diff(identityAt), nextCheck13.at(identityAt) - curCheck13.at(identityAt), 1e-9),
    `${roll.diff(identityAt)} ~ ${nextCheck13.at(identityAt) - curCheck13.at(identityAt)}`);

  // رول هم‌سررسید (اکثریت رول‌های واقعی — فقط قیمت اعمال عوض می‌شود، نه
  // سررسید) باید دست‌نخورده از همان موتور دقیق تکه‌ای-خطی قبلی بماند —
  // approx ست نمی‌شود، جبر دقیق است نه تقریب بلک-شولز.
  const rollSameExpiry = rollAnalysis({
    pos, quotes: [q(104000, 105000), q(7000, 7400)],
    closeIdx: 1,
    newLeg: { kind: 'call', side: 'sell', ratio: 1, size, strike: 120000, days: 30 },
    newQuote: q(6000, 6400),
    opt: { fees, spot: 104500 },
  });
  check('رول هم‌سررسید هنوز از موتور دقیق تکه‌ای-خطی می‌آید، نه تقریبی',
    !rollSameExpiry.approx);
}
