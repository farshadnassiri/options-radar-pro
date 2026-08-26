// ۹. ارزیاب ردیف، سرتاسری
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { evaluate } from '../../core/evaluate.mjs';
import { closeValuation } from '../../core/positions.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';


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
  // ردیف برای حجم واقعی کاربر سنجیده می‌شود، پس سقف دلتا هم در تعداد
  // قرارداد ضرب می‌شود: کاوردکالِ سه‌تایی حداکثر سه هزار سهم دلتا دارد.
  check('دلتای کاوردکال بین صفر و اندازه قرارداد ضربدر حجم',
    row.delta > 0 && row.delta < size * row.qty, `${row.delta.toFixed(1)} از ${size * row.qty}`);
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

  // «اگر همین حالا بگیرم و ببندم چه می‌شود؟» و «اگر با آخرین/پایانی تسویه
  // کنم؟» (خواسته الف-۱، سؤال‌های ۴ و ۵) — بدون کارمزد، عدد دقیق قابل
  // پیش‌بینی است: فروش تهاجمی روی bid پر می‌شود، بستن فوری روی ask.
  const s0 = { ...s, feeOption: 0, feeBuyStock: 0, feeSellStock: 0, feeExercise: 0 };
  const sp = byId('naked-put');
  const legsSp = buildLegs(sp, { strikes: [95000], size, days: [30] });
  const qSp = [mkQuote(8000, 8400, { last: 8300, close: 8100 })];
  const rowSp = evaluate({
    legs: legsSp, quotes: qSp,
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s0, def: sp, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('بستن فوری بدون کارمزد، دقیقاً هزینه اسپرد (bid منهای ask)',
    near(rowSp.instantClosePnl, (8000 - 8400) * size, 1e-6), rowSp.instantClosePnl);
  check('تسویه با آخرین معامله، دقیقاً bid منهای last',
    near(rowSp.settleLastPnl, (8000 - 8300) * size, 1e-6), rowSp.settleLastPnl);
  check('تسویه با قیمت پایانی، دقیقاً bid منهای close',
    near(rowSp.settleClosePnl, (8000 - 8100) * size, 1e-6), rowSp.settleClosePnl);

  // با کارمزد واقعی، بستن فوری همیشه از تسویه با آخرین/پایانی بدتر است —
  // چون اسپرد کامل را دو بار (ورود و خروج) می‌پردازی، آن‌ها فقط یک‌بار
  const rowSpFee = evaluate({
    legs: legsSp, quotes: qSp,
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s, def: sp, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('بستن فوری همیشه هزینه اسپرد کامل را می‌پردازد، بدتر از تسویه مرجع',
    rowSpFee.instantClosePnl < rowSpFee.settleLastPnl && rowSpFee.instantClosePnl < rowSpFee.settleClosePnl,
    `فوری ${Math.round(rowSpFee.instantClosePnl)} | آخرین ${Math.round(rowSpFee.settleLastPnl)} | پایانی ${Math.round(rowSpFee.settleClosePnl)}`);

  // ——— بازار یک‌طرفه: آفست ممکن نیست ———
  //
  // گزارش حسابرسی: در ۷٬۰۹۳ ردیفِ یک‌طرفه، ۱٬۲۳۶ «سود فوری مثبت» ساخته شد
  // که هیچ‌کدام اجراشدنی نبود؛ در ردیف‌های دوطرفه، صفر. ریشه: مبنای دفتر
  // سفارش وقتی سمت خروج خالی بود به آخرین معامله پس می‌افتاد. اینجا پوتی
  // فروخته می‌شود که فقط تقاضا دارد و هیچ عرضه‌ای ندارد — یعنی بازخریدش
  // ممکن نیست — و آخرین معامله‌اش ۱۰۰ ریالِ کهنه است.
  const qOneSide = [{ bid: 8000, bidQty: 500, ask: 0, askQty: 0, last: 100, close: 100,
    book: [{ bid: 8000, bidQty: 500, ask: 0, askQty: 0 }], state: 'A', staleSec: 1 }];
  const rowOne = evaluate({
    legs: legsSp, quotes: qOneSide,
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s0, def: sp, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('پای بدون سمت خروج، آفست‌ناپذیر علامت می‌خورد', rowOne.offsettable === false);
  check('و «سود فوری» ۷٬۹۰۰٬۰۰۰ ریالیِ کاذب دیگر ساخته نمی‌شود',
    !Number.isFinite(rowOne.instantClosePnl), rowOne.instantClosePnl);
  check('هشدارش در ردیف دیده می‌شود', rowOne.warn.includes('آفست ناممکن'), rowOne.warn.join('، '));
  check('و نام پای گیر گزارش می‌شود', rowOne.noExitLegs.length === 1, rowOne.noExitLegs.join('، '));
  // مبنای مرجع ادعای اجرا ندارد، پس همچنان عدد می‌دهد
  check('تسویه با آخرین معامله دست‌نخورده می‌ماند — مرجع است نه اجرا',
    Number.isFinite(rowOne.settleLastPnl) && Number.isFinite(rowOne.settleClosePnl));
  // و ردیف دوطرفه هیچ تغییری نمی‌کند
  check('ردیف دوطرفه همچنان آفست‌پذیر است و عددش همان است',
    rowSp.offsettable === true && near(rowSp.instantClosePnl, (8000 - 8400) * size, 1e-6));

  const cv = closeValuation(
    [{ kind: 'put', side: 'sell', ratio: 1, size: 1000 }], [{ bid: 8000, ask: 0 }], 'BOOK',
    { option: 0, buyStock: 0, sellStock: 0 }, { strict: true });
  check('closeValuation در حالت سخت‌گیر، به‌جای عدد، ناعدد می‌دهد',
    !Number.isFinite(cv.net) && cv.offsettable === false);
  const cvLast = closeValuation(
    [{ kind: 'put', side: 'sell', ratio: 1, size: 1000 }], [{ bid: 8000, ask: 0, last: 100 }], 'LAST',
    { option: 0, buyStock: 0, sellStock: 0 }, { strict: true });
  check('مبنای مرجع پرچم آفست ندارد، چون ادعای اجرا ندارد', cvLast.offsettable === null);
}
