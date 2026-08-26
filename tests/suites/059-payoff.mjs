// ۵۸. ردیف با حجم واقعی کاربر سنجیده می‌شود
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { buildChain } from '../../core/chain.mjs';
import { COLUMNS, evaluate } from '../../core/evaluate.mjs';
import { grossCash, pnlAtExpiry } from '../../core/payoff.mjs';
import { scan as scanFn } from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';


// ═══════════ ۵۸. ردیف با حجم واقعی کاربر سنجیده می‌شود ═══════════
group('۵۸. ردیف با حجم واقعی کاربر سنجیده می‌شود');
{
  // گزارش کاربر: «نقد خالص برای ۱ قرارداد گذاشته، در حالی که ۳۰۰ قرارداد
  // دارم.» ردیف تا امروز برای یک دست سنجیده می‌شد و `qty` فقط دو جا اثر
  // داشت — پیمایش دفتر سفارش و سقف حجم. یعنی هر عدد پولی جدول، جدول
  // کوچک‌های پنل جزئیات، نمودار بازده، و پنل سناریو، همه یک‌سیصدم موقعیت
  // واقعی را نشان می‌دادند بی‌آنکه جایی بگوید.
  const s58 = { ...defaults(), qtyDefault: 1 };
  const size58 = 1000;
  // عمق سخاوتمند، تا قیمت اجرا بین دو حجم فرق نکند و مقایسه تمیز بماند؛
  // وگرنه پیمایش دفتر برای ۱۰ قرارداد قیمت بدتری می‌دهد و ضریب دقیق نیست.
  const deep58 = (bid, ask) => ({
    bid, bidQty: 1e9, ask, askQty: 1e9, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid, high: ask, state: 'A', staleSec: 5,
    book: [{ level: 1, bid, bidQty: 1e9, ask, askQty: 1e9 }],
  });

  const def58 = byId('short-strangle');
  const legs58 = buildLegs(def58, { strikes: [90000, 110000], size: size58, days: [30] });
  const quotes58 = [deep58(3000, 3200), deep58(2600, 2800)];
  const ctx58 = (qty) => ({
    S: 100000, Sclose: 100000, days: 30, size: size58, qty,
    settings: s58, def: def58, underlying: 'نمونه', sigmaHist: 0.5,
  });
  const one58 = evaluate({ legs: legs58, quotes: quotes58, ctx: ctx58(1) });
  const many58 = evaluate({ legs: legs58, quotes: quotes58, ctx: ctx58(300) });

  check('تعداد قرارداد در خود ردیف دیده می‌شود', one58.qty === 1 && many58.qty === 300);

  // ——— چه چیزی مقیاس می‌خورد: هرچه مال موقعیت توست ———
  const SCALED = [
    'grossCash', 'entryFee', 'netCash', 'instantClosePnl', 'settleLastPnl', 'settleClosePnl',
    'maxProfit', 'staticPnl', 'capital', 'margin', 'marginNet', 'conditionalMargin',
    'marginRequired', 'blockedAsset', 'sharesLocked', 'notional', 'marketValue', 'intrinsic',
    'timeValue', 'bsValue', 'delta', 'gamma', 'vega', 'theta', 'rho', 'deltaShares',
    'execCost', 'costCommission', 'costCrossing', 'costSlippage', 'costFunding',
  ];
  for (const k of SCALED) {
    check(`«${k}» با حجم مقیاس می‌خورد`,
      Number.isFinite(one58[k]) && near(many58[k], one58[k] * 300, Math.abs(one58[k] * 300) * 1e-9 + 1e-6),
      `${one58[k]} → ${many58[k]}`);
  }

  // ——— چه چیزی مقیاس نمی‌خورد: قیمت، درصد، و آنچه مال بازار است ———
  const FIXED = [
    'S', 'Sclose', 'beNear', 'beLow', 'beHigh', 'be1', 'be2',
    'retMaxPct', 'retStaticPct', 'retMonthPct', 'retAnnPct', 'maxProfitPct', 'maxLossPct',
    'rewardRisk', 'popPct', 'sigmaUse', 'leverage', 'thetaToCapitalPct', 'marginToMaxLoss',
    'beDistPct', 'beRoomPct', 'volTotal', 'oiTotal', 'valueTotal', 'tradeCount',
  ];
  for (const k of FIXED) {
    check(`«${k}» با حجم عوض نمی‌شود`,
      Number.isFinite(one58[k]) ? near(many58[k], one58[k], Math.abs(one58[k]) * 1e-9 + 1e-9) : !Number.isFinite(many58[k]),
      `${one58[k]} → ${many58[k]}`);
  }
  // زیان نامحدودِ استرانگل فروش، با هیچ ضریبی متناهی نمی‌شود؛ برای «بیشترین
  // زیان» باید ترکیب کراندار سنجید.
  check('زیان نامحدود، با حجم هم نامحدود می‌ماند',
    !Number.isFinite(one58.maxLoss) && !Number.isFinite(many58.maxLoss));
  const defBox58 = byId('bull-call-spread');
  const legsBox58 = buildLegs(defBox58, { strikes: [100000, 110000], size: size58, days: [30] });
  const quotesBox58 = [deep58(6000, 6200), deep58(2600, 2800)];
  const boxOne58 = evaluate({ legs: legsBox58, quotes: quotesBox58, ctx: { ...ctx58(1), def: defBox58 } });
  const boxMany58 = evaluate({ legs: legsBox58, quotes: quotesBox58, ctx: { ...ctx58(300), def: defBox58 } });
  check('بیشترین زیانِ کراندار با حجم مقیاس می‌خورد',
    Number.isFinite(boxOne58.maxLoss) && near(boxMany58.maxLoss, boxOne58.maxLoss * 300, boxOne58.maxLoss * 3e-7),
    `${Math.round(boxOne58.maxLoss)} → ${Math.round(boxMany58.maxLoss)}`);

  check('قیمت اعمال و سربه‌سری، با حجم جابه‌جا نمی‌شوند',
    one58.breakevens.length === many58.breakevens.length
    && one58.breakevens.every((b, i) => near(b, many58.breakevens[i])));
  check('قیمت اجرای هر پا، مالِ یک سهم است و ضرب نمی‌شود',
    one58.legPrices.every((l, i) => near(l.price, many58.legPrices[i].price)));
  check('متن پاها همان نسبت الگو را می‌گوید، نه نسبت ضرب‌شده',
    one58.legsText === many58.legsText, many58.legsText);
  check('تلاطم ضمنی هر پا، پس از مقیاس هم سر جایش است',
    many58.legPrices.every((l) => Number.isFinite(l.sigma))
    && many58.ivList.every((v) => Number.isFinite(v)));

  // سقف حجم جوابش خودش «تعداد قرارداد» است؛ اگر ورودی سرمایه‌اش مقیاس‌خورده
  // بماند، سقف بر حجم تقسیم می‌شود و کاربرِ ۳۰۰ قرارداد سقف یک‌سیصدم می‌بیند.
  check('سقف حجم، به‌ازای یک واحد می‌ماند',
    one58.maxQty === many58.maxQty, `${one58.maxQty} → ${many58.maxQty}`);

  // نمودار بازده و پنل سناریو، `__legs` را با `netCash` جفت می‌کنند. اگر یکی
  // مقیاس‌خورده باشد و دیگری نه، نمودار و جدول دو عدد متفاوت می‌گویند.
  check('پاهای همراه ردیف، همان مقیاس نقد خالص را دارند',
    near(pnlAtExpiry(many58.__legs, many58.S, many58.netCash), many58.staticPnl)
    && near(many58.staticPnl, one58.staticPnl * 300));
  check('نسبت پاهای همراه، در تعداد قرارداد ضرب شده است',
    many58.__legs.every((l, i) => near(l.ratio, one58.__legs[i].ratio * 300)));

  // اسکن هم باید همان حجم را رد کند — نه `qtyDefault` پیش‌فرض
  const mkRow58 = (strike) => ({
    uaInsCode: '1', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000, priceYesterday_UA: 99000,
    insCode_C: `c${strike}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: size58, remainedDay: 30, endDate: 20260101,
    pMeDem_C: 3000, qTitMeDem_C: 1e6, pMeOf_C: 3200, qTitMeOf_C: 1e6,
    pDrCotVal_C: 3100, pClosing_C: 3100, oP_C: 500, qTotTran5J_C: 1000,
    pMeDem_P: 2600, qTitMeDem_P: 1e6, pMeOf_P: 2800, qTitMeOf_P: 1e6,
    pDrCotVal_P: 2700, pClosing_P: 2700, oP_P: 400, qTotTran5J_P: 800,
  });
  const rows58 = [90000, 95000, 100000, 105000, 110000].map(mkRow58);
  const chain58 = buildChain(rows58, s58);
  const scanOne = scanFn({ def: def58, chain: chain58, uaKeys: ['1'], settings: s58, qty: 1 });
  const scanMany = scanFn({ def: def58, chain: chain58, uaKeys: ['1'], settings: s58, qty: 50 });
  const pick58 = (res, id) => res.rows.find((r) => r.id === id);
  check('اسکن، حجم را تا ردیف می‌برد',
    scanOne.rows.length > 0 && scanOne.rows.every((r) => {
      const m = pick58(scanMany, r.id);
      return m && m.qty === 50 && near(m.netCash, r.netCash * 50, Math.abs(r.netCash * 50) * 1e-9 + 1e-6);
    }), `${scanOne.rows.length} ردیف`);

  // ستون حجم باید در قرارداد ستونی باشد، وگرنه هیچ‌جای جدول نمی‌گوید این
  // اعداد مال چند قرارداد است.
  check('ستون «حجم من» در قرارداد ستونی هست',
    COLUMNS.some((c) => c.key === 'qty' && c.fmt === 'int'));

  // تب‌ها باید حجمِ همان تب را به پنل سناریو و انتقال بدهند، نه پیش‌فرض
  // تنظیمات — وگرنه کاربر حجم را عوض می‌کند و پنل جزئیات همان عدد قبلی را
  // نگه می‌دارد.
  const stratSrc58 = readSrc('../ui/tabs/strategy.mjs');
  check('تب استراتژی، حجم کنترل خودش را به پنل جزئیات می‌دهد',
    !/units: Math\.max\(1, Number\(s\(\)\.qtyDefault\)/.test(stratSrc58)
    && stratSrc58.includes('units: unitsOf(r)'));
}
