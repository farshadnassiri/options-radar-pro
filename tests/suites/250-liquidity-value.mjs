// ۲۵۱. حداقل ارزش هر قرارداد — و چرا خروجی صفر می‌شد
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs
//
// گزارش صاحب پروژه: «وقتی حداقل ارزش هر قرارداد (میلیون ریال) را تعیین
// می‌کنم برنامه خروجی نمی‌ده.»
//
// ۷۱ آزمون موتور تاریخچه سبز بودند و این را نگرفتند، چون هیچ‌کدام سناریوی
// «اختیارِ بی‌ارزشِ رسمی» را نمی‌ساختند — و دقیقاً همان‌جا برآورد هزار برابر
// کمتر می‌شد.

import { check, group } from '../harness.mjs';
import {
  historyMarketMetrics, liquidityReason, emptyPortfolioReason, replayHistory,
} from '../../core/history.mjs';
import { liveDayRows } from '../../core/live-day.mjs';

group('۲۵۱. ارزش روزانهٔ اختیار و پالایهٔ نقدشوندگی');
{
  // ═══ ۱. برآوردی که هزار برابر کمتر بود ═══
  //
  // حجمِ اختیار به **قرارداد** است و هر قرارداد اندازه‌ای دارد. برآوردِ
  // «حجم × قیمت پایانی» برای سهم درست است، برای اختیار نه.
  const opt = { date: 20260910, close: 450, last: 450, vol: 200, trades: 30, value: 0 };
  const real = 200 * 450 * 1000;
  check('۱. ارزش اختیار با اندازهٔ قرارداد برآورد می‌شود',
    historyMarketMetrics(opt, { size: 1000 }).value === real,
    String(historyMarketMetrics(opt, { size: 1000 }).value));
  check('۱. و بدون اندازه، هزار برابر کمتر نمی‌شود — چون اصلاً عدد نمی‌دهد',
    historyMarketMetrics(opt, { size: 0 }).valueKnown === false
    && Number.isNaN(historyMarketMetrics(opt, { size: 0 }).value));
  // سهم اندازه ندارد؛ پیش‌فرض یک است و رفتار قبلی برای پایه حفظ می‌شود.
  check('۱. برآورد نماد پایه همان حجم × پایانی می‌ماند',
    historyMarketMetrics(opt).value === 200 * 450);
  check('۱. برآورد برچسب می‌خورد و با عدد رسمی قاطی نمی‌شود',
    historyMarketMetrics(opt, { size: 1000 }).valueEstimated === true
    && historyMarketMetrics({ ...opt, value: 5e8 }, { size: 1000 }).valueEstimated === false);
  check('۱. عدد رسمی هرگز در اندازه ضرب نمی‌شود',
    historyMarketMetrics({ ...opt, value: 5e8 }, { size: 1000 }).value === 5e8);
  check('۱. ابزارِ بی‌معامله صفرِ واقعی می‌گیرد، نه «نامعلوم»',
    historyMarketMetrics({ ...opt, vol: 0 }, { size: 0 }).value === 0
    && historyMarketMetrics({ ...opt, vol: 0 }, { size: 0 }).valueKnown === true);

  // ═══ ۲. «زیر حد» با «نامعلوم» یکی نیست ═══
  //
  // با اولی کاربر حد را پایین می‌آورد؛ با دومی می‌فهمد اندازهٔ قرارداد
  // نیامده و پایین‌آوردنِ حد کمکی نمی‌کند.
  check('۲. زیر حدِ ارزش، علتِ خودش را دارد',
    liquidityReason(opt, 0, 1e9, 1000) === 'value');
  check('۲. زیر حدِ حجم، علتِ جدا دارد', liquidityReason(opt, 5000, 0, 1000) === 'volume');
  check('۲. ارزشِ نامعلوم، «زیر حد» شمرده نمی‌شود',
    liquidityReason(opt, 0, 1e6, 0) === 'valueUnknown');
  check('۲. و وقتی حدی نیست، ارزشِ نامعلوم مانع نمی‌شود',
    liquidityReason(opt, 0, 0, 0) === '');
  check('۲. عبور از هر دو حد، علتی ندارد',
    liquidityReason(opt, 100, 1e6, 1000) === '');

  // ═══ ۳. همان حد، در روز خروج هم اعمال می‌شود ═══
  //
  // این خودش غلط نیست — برای بستنِ موقعیت هم باید نقدشوندگی باشد — ولی
  // تا امروز بی‌صدا بود: ترکیب در روز ورود ساخته می‌شد و در روز خروج
  // کاملاً حذف، بی آنکه کاربر بفهمد کدام سر افتاده است.
  const day = (date, close, vol, value) => ({ date, close, last: close, first: close, low: close, high: close, vol, trades: 20, value });
  const series = {
    UA: [day(20260901, 2400, 5e6, 1.2e13), day(20260910, 2500, 5e6, 1.2e13)],
    // روز ورود پرمعامله، روز خروج کم‌معامله
    C1: [day(20260901, 450, 5000, 2.25e9), day(20260910, 500, 3, 1.5e6)],
  };
  const legs = [{ ins: 'C1', kind: 'call', side: 'buy', qty: 1, strike: 2400, size: 1000, endDate: 20261120, name: 'ض' }];
  const args = {
    legs, seriesByIns: series, baseIns: 'UA', startDate: 20260901, endDate: 20260910,
    entryBasis: 'CLOSE', exitBasis: 'CLOSE', units: 1, fees: {}, settings: { dayCountYear: 365 },
  };
  const finalOf = (liq) => replayHistory({ ...args, liquidity: liq }).rows?.find((r) => r.date === 20260910);
  check('۳. بی پالایه، روز خروج معتبر است', finalOf({})?.status === 'ok');
  check('۳. با حدِ کوچک هم معتبر می‌ماند', finalOf({ minLegValue: 1e6 })?.status === 'ok');
  check('۳. با حدِ بزرگ، روز خروج وضعیت نقدشوندگی می‌گیرد',
    finalOf({ minLegValue: 10e6 })?.status === 'liquidity');
  // و روز ورود همچنان سالم است — یعنی حذف در سرِ دیگر رخ داده
  check('۳. در حالی که روز ورود سالم است',
    replayHistory({ ...args, liquidity: { minLegValue: 10e6 } }).ok === true);

  // ═══ ۳-ب. همان خطا، یک لایه پایین‌تر: ارزشِ نوار ═══
  //
  // `summarizeLiveTrades` مجموع «تعداد × قیمت» را می‌دهد، و برای اختیار آن
  // هزار برابر کمتر است. این عدد در سری روزانه به‌عنوان ارزشِ **رسمی**
  // می‌نشیند، پس لایه‌های بالاتر دیگر برآوردش نمی‌کنند و همان عددِ غلط مبنا
  // می‌شود — اصلاحِ برآورد به‌تنهایی این نیمه را نمی‌گرفت.
  const board = {
    uaInsCode: 'UA', lval30_UA: 'پایه', contractSize: 1000,
    pDrCotVal_UA: 2400, pClosing_UA: 2390, priceYesterday_UA: 2300,
    insCode_C: 'C1', lVal18AFC_C: 'ض', pDrCotVal_C: 449, pClosing_C: 450, priceYesterday_C: 440,
  };
  const tape = { count: 40, volume: 315, value: 142172, firstPrice: 440, lastPrice: 449, low: 430, high: 455 };
  const rows = liveDayRows([board], { date: 20260915, tapeByIns: { C1: tape, UA: { ...tape, value: 7.5e11 } } });
  check('۳-ب. ارزش امروزِ اختیار در اندازهٔ قرارداد ضرب می‌شود',
    rows.C1.value === 142172 * 1000, String(rows.C1.value));
  check('۳-ب. ولی ارزش امروزِ نماد پایه دست‌نخورده می‌ماند',
    rows.UA.value === 7.5e11, String(rows.UA.value));
  // اندازهٔ نیامده عددِ بی‌اندازه نمی‌سازد: صفر یعنی «ارزشِ رسمی نداریم» و
  // مصرف‌کننده خودش با اندازهٔ قراردادِ خودش برآورد می‌کند.
  const noSize = liveDayRows([{ ...board, contractSize: 0 }], { date: 20260915, tapeByIns: { C1: tape } });
  check('۳-ب. اندازهٔ نامعلوم، ارزشِ بی‌اندازه نمی‌نویسد',
    noSize.C1.value === 0, String(noSize.C1.value));
  check('۳-ب. و بقیهٔ ردیف همچنان ساخته می‌شود',
    noSize.C1.vol === 315 && noSize.C1.last === 449);

  // ═══ ۴. جمله‌ای که کارِ بعدی را می‌گوید ═══
  //
  // «هیچ ترکیبی پیدا نشد» از دیدِ کاربر یعنی «برنامه خروجی نمی‌ده».
  // برنامه کار کرده؛ فقط نگفته چه کرده.
  const exitCase = emptyPortfolioReason({
    generatedByStrategy: [{ candidates: 420, noLiquidity: 0, noEntry: 3 }],
    excluded: { exitLiquidity: 400, exitPrice: 20 },
    liquidity: { minLegValue: 1e8 },
  });
  check('۴. شمار ترکیب‌های ساخته‌شده گفته می‌شود',
    exitCase.parts.find((part) => part.key === 'built')?.count === 420);
  // ادعا باید **این** شاخه را جدا کند. نسخهٔ اولش فقط «روز خروج» را
  // می‌جست و با خاموش‌کردن همین شاخه هم سبز می‌ماند، چون شاخهٔ «قیمت کامل
  // ندارد» هم همان عبارت را دارد. حالا هر دو نیمهٔ پیام لازم است: اینکه
  // حذف از **پالایهٔ نقدشوندگیِ** روز خروج بوده، و اینکه کارِ بعدی
  // پایین‌آوردنِ حد است.
  check('۴. و اینکه حذف در روز خروج بوده، نه ورود',
    exitCase.parts.some((part) => part.key === 'exitLiquidity' && part.count === 400)
    && exitCase.advice.includes('روز خروج') && exitCase.advice.includes('حد را پایین‌تر')
    && exitCase.advice.includes('روز ورود گذاشتی'), exitCase.advice);
  // و شاخهٔ «قیمت کامل ندارد» جملهٔ خودش را دارد، نه همین را
  check('۴. حذف به‌خاطر قیمتِ ناقصِ روز خروج، راهنمای دیگری می‌دهد',
    !emptyPortfolioReason({
      generatedByStrategy: [{ candidates: 420 }], excluded: { exitPrice: 20 }, liquidity: {},
    }).advice.includes('حد را پایین‌تر'));
  check('۴. عدد در هسته قالب نمی‌گیرد — رقم فارسی کارِ لایهٔ نمایش است',
    exitCase.parts.every((part) => typeof part.count === 'number'));

  const entryCase = emptyPortfolioReason({
    generatedByStrategy: [{ candidates: 0, noLiquidity: 512, noEntry: 0 }],
    excluded: {}, liquidity: { minLegValue: 1e9 },
  });
  check('۴. حذف در روز ورود، راهنمای دیگری می‌دهد',
    entryCase.advice.includes('پایین‌تر') && !entryCase.advice.includes('روز خروج'));
  const noneCase = emptyPortfolioReason({
    generatedByStrategy: [{ candidates: 0, noLiquidity: 0, noEntry: 0 }],
    excluded: {}, census: { priced: 0 }, liquidity: {},
  });
  check('۴. وقتی اصلاً قراردادی قیمت ندارد، تاریخ را پیشنهاد می‌دهد',
    noneCase.advice.includes('تاریخ ورود'));
  check('۴. ورودی خالی پرتاب نمی‌کند',
    emptyPortfolioReason().parts.length === 0 && emptyPortfolioReason().built === 0);
  check('۴. وجودِ پالایه از خودِ حدها خوانده می‌شود',
    emptyPortfolioReason({ liquidity: { minLegValue: 1 } }).hasFilter === true
    && emptyPortfolioReason({ liquidity: {} }).hasFilter === false);
}
