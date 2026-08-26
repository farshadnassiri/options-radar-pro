// ۷۹. خروجی اکسل جامع بک‌تست
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import {
  intradayEntryExitProfile, intradayHoldingSummary, timeOfDayProfile,
} from '../../core/backtest.mjs';
import { bsPrice } from '../../core/bs.mjs';
import {
  annotateBucketIv, annotateDailyGreeks, annotateDailyIv, annotateIntradayIv, positionGreeksAt,
} from '../../core/leg-iv.mjs';
import { buildBacktestWorkbook } from '../../ui/backtest-export.mjs';
import {
  cell as wbCell, sheet as wbSheet, sheetParts as wbParts, workbook as wbWrap,
} from '../../ui/workbook.mjs';


// ═════════ ۷۹. خروجی اکسل جامع گام سوم ═════════
//
// خواسته کاربر: «دکمه دریافت فایل اکسل نیز نمایش داده شود و اطلاعات کامل و
// جامع از تمامی اطلاعات آن استراتژی در فایل اکسل قرار داده شود و هیچ
// اطلاعاتی جا نیفتد… چه مدت در سود چه مدت در زیان، رفتار هر بازه از روز،
// یونانی‌های این استراتژی در طول زمان، تلاطم ضمنی پاها در طول زمان.»
group('۷۹. خروجی اکسل جامع بک‌تست');
{
  // ——— قالب مشترک دفترکار ———
  check('عددِ نبوده خانهٔ خالی می‌شود، نه صفر و نه NaN',
    wbCell(NaN).includes('ss:Type="String"') && !wbCell(NaN).includes('NaN'), wbCell(NaN));
  check('عدد، عدد می‌ماند تا اکسل جمعش بزند', wbCell(12.5).includes('ss:Type="Number"'));
  check('نشانهٔ جهت‌دهی از خانه پاک می‌شود', !wbCell('⁦ضهرم⁩').includes('⁦'));
  check('نویسهٔ XML فرار داده می‌شود', wbCell('a<b&c').includes('a&lt;b&amp;c'));
  // بیش از ۶۰ هزار ردیف باید بین چند برگ پخش شود، نه بی‌صدا بیفتد
  const many = Array.from({ length: 60001 }, (_, i) => [i]);
  check('داده بلندتر از سقف برگ، بین چند برگ پخش می‌شود', wbParts('نمونه', ['x'], many).length === 2);
  check('برگ بی‌ردیف هم یک برگ می‌سازد', wbParts('نمونه', ['x'], []).length === 1);
  check('دفترکار یک Workbook معتبر است',
    wbWrap([wbSheet('a', ['h'], [[1]])]).startsWith('<?xml') && wbWrap([]).includes('</Workbook>'));

  // ——— یونانی‌ها در طول زمان ———
  const gLeg = { kind: 'call', strike: 11000, expiry: 20260401, side: 'buy', ratio: 1, size: 1000 };
  const gPrice = bsPrice('call', 10000, 11000, 90 / 365, 0.3, 0, 0.65);
  const gParams = { rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5, yearDays: 365 };
  const g = positionGreeksAt([gLeg], { spot: 10000, prices: [gPrice], date: 20260101 }, gParams);
  check('یونانی موقعیت از تلاطم ضمنی خود پا می‌آید',
    Number.isFinite(g.delta) && g.delta > 0 && g.incomplete === false, `دلتا ${g.delta.toFixed(1)}`);
  // پایی که تلاطم ندارد، جمع را ناقص می‌کند — و باید بگوید
  const g2 = positionGreeksAt([gLeg, { kind: 'put', strike: 9000, expiry: 20260401, side: 'sell', ratio: 1, size: 1000 }],
    { spot: 10000, prices: [gPrice, NaN], date: 20260101 }, gParams);
  check('پای بی‌تلاطم، جمع یونانی را «ناقص» علامت می‌زند', g2.incomplete === true);

  // ——— دفترکار کامل از دادهٔ ساختگی ———
  const priced = [
    { ins: '11', name: 'ضنمونه۱', kind: 'call', side: 'buy', ratio: 1, size: 1000, strike: 11000, expiry: 20260401, price: 500, days: 90 },
    { ins: '12', name: 'طنمونه۱', kind: 'put', side: 'sell', ratio: 1, size: 1000, strike: 9000, expiry: 20260401, price: 300, days: 90 },
  ];
  const mkDay = (date, ok = true) => ({
    date, dateLabel: '', dayName: 'شنبه', holdingDays: 1, daysToExpiry: 89,
    status: ok ? 'ok' : 'missing', baseClose: ok ? 10000 : NaN,
    baseDailyPct: 1, baseCumulativePct: 2, baseVolume: 10, baseValue: 20,
    grossPnl: 100, entryFee: 1, exitFee: 1, totalFees: 2, netPnl: 98, pnlDelta: 3, returnPct: 4, drawdown: -1,
    margin: 5, marginNet: 6, conditionalMargin: 7,
    perLeg: [
      { exitPrice: ok ? gPrice : NaN, entryPrice: 500, grossPnl: 10, netPnl: 9, entryFee: 1, exitFee: 0, pnlDelta: 1, volume: 3, trades: 2, value: 4 },
      { exitPrice: ok ? 250 : NaN, entryPrice: 300, grossPnl: 5, netPnl: 4, entryFee: 1, exitFee: 0, pnlDelta: 1, volume: 3, trades: 2, value: 4 },
    ],
  });
  const replay79 = {
    ok: true, startDate: 20260101, endDate: 20260110, expiry: 20260401,
    entryBasis: 'LAST', exitBasis: 'LAST', priced,
    entry: { gross: 1, fee: 2, netCash: 3, cashPaid: 4, cashReceived: 5,
      capital: { value: 1000, label: 'وجه تضمین' }, margin: { marginNet: 9 }, payoff: { maxLoss: -5, maxProfit: 7 } },
    rows: [mkDay(20260101), mkDay(20260102), mkDay(20260103, false)],
    summary: { validDays: 2, missingDays: 1, positiveDays: 2, negativeDays: 0, flatDays: 0,
      best: { date: 20260101, netPnl: 98 }, worst: { date: 20260102, netPnl: 98 },
      last: { netPnl: 98, returnPct: 4 }, firstProfit: { date: 20260101, holdingDays: 0 } },
  };
  annotateDailyIv(replay79, gParams);
  annotateDailyGreeks(replay79, gParams);
  check('مسیر روزانه پیش از خروجی، هم تلاطم دارد هم یونانی',
    Number.isFinite(replay79.rows[0].perLeg[0].ivPct) && Number.isFinite(replay79.rows[0].greeks.delta));

  const buckets79 = [{ date: 20260101, startSecond: 34200, endSecond: 35100, observations: 2, seconds: 900,
    openPnl: 1, closePnl: 2, highPnl: 3, lowPnl: 0, changePnl: 1, stepPnl: NaN,
    openReturnPct: 1, returnPct: 2, basePrice: 10000, basePct: 1, volume: 5, trades: 2,
    baseVolume: 3, freshPct: 100, maxAgeSec: 10,
    perLeg: [{ price: gPrice, priceChange: 1, netPnl: 2, changePnl: 1, cumulativeVolume: 4, tradeCount: 2, ageSec: 3 },
      { price: 250, priceChange: 1, netPnl: 2, changePnl: 1, cumulativeVolume: 4, tradeCount: 2, ageSec: 3 }] }];
  annotateBucketIv(buckets79, { legs: priced }, gParams);
  const intraday79 = [{ second: 34200, timeLabel: '09:30:00', netPnl: 5, returnPct: 1, basePrice: 10000, basePct: 1,
    eventVolume: 2, eventTrades: 1, cumulativeVolume: 2, baseSecondVolume: 1, baseCumulativeVolume: 1, baseAgeSec: 0,
    activeLegs: 2, maxAgeSec: 4, allFresh: true,
    perLeg: [{ exitPrice: gPrice, pricePct: 1, netPnl: 2, grossPnl: 3, entryFee: 1, exitFee: 0, secondVolume: 1, cumulativeVolume: 2, tradeCount: 1, lastTradeSecond: 34200, ageSec: 0, observedNow: true },
      { exitPrice: 250, pricePct: 1, netPnl: 2, grossPnl: 3, entryFee: 1, exitFee: 0, secondVolume: 1, cumulativeVolume: 2, tradeCount: 1, lastTradeSecond: 34200, ageSec: 0, observedNow: true }] }];
  annotateIntradayIv(intraday79, { legs: priced, date: 20260101 }, gParams);

  const xml79 = buildBacktestWorkbook({
    ua: { ins: '9', name: 'نمونه' }, strategyName: 'استرنگل', comboName: 'ض + ط',
    replay: replay79, intraday: intraday79, buckets: buckets79, params: gParams,
    holding: { days: [{ date: 20260101, points: 2, firstSecond: 34200, lastSecond: 35100, observedSeconds: 900,
      positiveSeconds: 600, negativeSeconds: 300, flatSeconds: 0, positivePct: 66.7,
      openPnl: 1, closePnl: 2, changePnl: 1, bestPnl: 3, worstPnl: 0, closeReturnPct: 1, basePct: 1, volume: 5 }],
      observedSeconds: 900, positiveSeconds: 600, negativeSeconds: 300, flatSeconds: 0,
      positivePct: 66.7, negativePct: 33.3, positiveDays: 1, negativeDays: 0, dayCount: 1 },
    timeOfDay: [{ startSecond: 34200, endSecond: 36000, days: 2, upDays: 1, downDays: 1, flatDays: 0,
      meanChange: 1, medianChange: 1, upPct: 50, consistencyPct: 50, meanVolume: 4 }],
    entryExit: { cells: [{ entrySecond: 34200, exitSecond: 36000, samples: 2, meanPnl: 1, medianPnl: 1, winPct: 50, bestPnl: 2, worstPnl: 0 }],
      entries: [{ second: 34200, pairs: 1, samples: 2, medianPnl: 1, meanPnl: 1, winPct: 50 }],
      exits: [{ second: 36000, pairs: 1, samples: 2, medianPnl: 1, meanPnl: 1, winPct: 50 }] },
    timeframeSeconds: 900, intradayDate: 20260101, generatedAt: 'نمونه',
  });

  // دفترکار حالا فهرست توصیف برگ است نه یک رشتهٔ XML: `buildBacktestWorkbook`
  // داده را می‌سازد و `ui/xlsx.mjs` آن را به فایل تبدیل می‌کند. آزمون هم
  // باید همان داده را بسنجد، نه قالبِ روزِ ساختش را.
  const sheetNames = xml79.map((part) => part.name);
  const flat = (parts) => parts.map((part) => [part.name, ...part.headers,
    ...part.rows.map((row) => row.join(' '))].join(' ')).join(' ');
  const text79 = flat(xml79);
  // هر واحد تحلیلی برگ خودش را دارد؛ خواستهٔ «هیچ اطلاعاتی جا نیفتد»
  for (const want of ['سرشناسه', 'راهنما', 'شاخص کل بازه', 'پاهای ورود', 'مسیر روزانه', 'روز × پا',
    'سطل تایم‌فریم', 'سطل × پا', 'مدت در سود و زیان', 'رفتار بازه‌های روز',
    'ورود × خروج', 'بهترین ساعت', 'نوار درون‌روز', 'درون‌روز × پا', 'خلاصه تلاطم']) {
    check(`برگ «${want}» در فایل هست`, sheetNames.includes(want), sheetNames.length ? '' : 'هیچ برگی نیست');
  }
  check('برگ تکراری ساخته نمی‌شود', new Set(sheetNames).size === sheetNames.length, sheetNames.join('، '));
  check('یونانی‌ها ستون خودشان را دارند',
    ['دلتا', 'گاما', 'وگا', 'تتا', 'رو'].every((g2n) => text79.includes(g2n)));
  check('تلاطم پاها در طول زمان در فایل هست', text79.includes('تلاطم ضمنی ٪'));
  check('پارامترهای محاسبه در سرشناسه ثبت می‌شوند',
    text79.includes('نرخ بدون ریسک سالانه') && text79.includes('روز سال — مخرج زمان'));
  check('ردیف فاقد داده هم در فایل می‌آید، با خانهٔ خالی',
    (text79.match(/فاقد داده/g) || []).length >= 1);
  // هویت ثابت پا یک بار نوشته می‌شود، ولی از فایل بیرون نمی‌رود
  const entryLegs79 = xml79.find((part) => part.name === 'پاهای ورود');
  check('هویت کامل هر پا در برگ پاهای ورود هست',
    ['نوع', 'جهت', 'نسبت', 'اندازه قرارداد', 'قیمت اعمال', 'سررسید'].every((h) => entryLegs79.headers.includes(h)),
    entryLegs79.headers.join('، '));
  const tick79 = xml79.find((part) => part.name === 'درون‌روز × پا');
  check('برگ پرحجم فقط با شمارهٔ پا به آن ارجاع می‌دهد',
    tick79.headers.includes('شماره پا') && !tick79.headers.includes('قیمت اعمال'),
    tick79.headers.join('، '));

  // برگی که داده ندارد نباید ساخته شود: برگ خالی از نبودِ برگ بدتر است
  const bare = buildBacktestWorkbook({ ua: { name: 'x' }, replay: replay79, params: gParams });
  const bareNames = bare.map((part) => part.name);
  check('برگ بی‌داده ساخته نمی‌شود',
    !bareNames.includes('سطل تایم‌فریم') && !bareNames.includes('نوار درون‌روز') && bareNames.includes('مسیر روزانه'),
    bareNames.join('، '));

  // ——— رابط: دکمه فقط پس از تحلیل ———
  const bt79 = readSrc('../ui/tabs/backtest.mjs');
  check('دکمهٔ اکسل کنار «تحلیل کل بازه» است',
    bt79.includes('id="bt-tf-export"') && bt79.includes('تحلیل کل بازه'));
  check('دکمه تا پیش از تحلیل پنهان است',
    /id="bt-tf-export" hidden/.test(bt79) && bt79.includes("$('bt-tf-export').hidden = false;"));
  check('باطل‌شدن تحلیل، دکمه را دوباره پنهان می‌کند',
    (bt79.match(/\$\('bt-tf-export'\)\.hidden = true;/g) || []).length >= 2);
  check('خروجی، همان موتورهای مشترک را صدا می‌زند',
    bt79.includes('intradayHoldingSummary(timeframeDays)')
    && bt79.includes('timeOfDayProfile(timeframeDays')
    && bt79.includes('intradayEntryExitProfile(timeframeDays'));

  // دو نسخه از قالب دفترکار نداشته باشیم
  const ovSrc = readSrc('../ui/open-view-export.mjs');
  check('قالب دفترکار یک پیاده‌سازی دارد',
    ovSrc.includes("from './workbook.mjs'") && !/^function sheet\(/m.test(ovSrc));
}
