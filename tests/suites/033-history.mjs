// ۳۲. بازپخش تاریخی استراتژی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import path from 'node:path';
import { check, near, group, readSrc } from '../harness.mjs';
import {
  canceledFlag, inIntradaySession, normalizeTrades, replayIntraday, summarizeIntraday, tradeSecond, tradeTimeLabel,
} from '../../core/backtest.mjs';
import {
  basisMatrix, entrySensitivity, generateHistoricalCombos, historyDateLabel, historyDayName, historyMarketMetrics, historyPrice, holdingPeriodProfile, normalizeHistoryDate, optimizeExitPolicy, replayHistory, replayTradeDetail, rollingEntryMatrix, strategyLegSnapshots, summarizeReplay,
} from '../../core/history.mjs';
import { defaults } from '../../core/settings.mjs';
import { byId } from '../../strategies/catalog.mjs';


// ═══ ۳۲. بازپخش تاریخی — ورود مستقل، آفست روزانه، داده گمشده ═══
group('۳۲. بازپخش تاریخی استراتژی');
{
  const base32 = [
    { date: 20260801, close: 100, last: 101, low: 98, high: 103 },
    { date: 20260802, close: 110, last: 111, low: 105, high: 113 },
    { date: 20260803, close: 105, last: 106, low: 102, high: 109 },
  ];
  const call32 = [
    { date: 20260801, close: 10, last: 11, low: 9, high: 12 },
    { date: 20260802, close: 7, last: 6, low: 5, high: 8 },
  ];
  const put32 = [
    { date: 20260801, close: 8, last: 9, low: 7, high: 10 },
    { date: 20260802, close: 5, last: 4, low: 3, high: 6 },
    { date: 20260803, close: 4, last: 3, low: 2, high: 5 },
  ];
  const legs32 = [
    { ins: '11', name: 'پوت', kind: 'put', side: 'sell', ratio: 1, size: 1000, strike: 90, expiry: 20260820 },
    { ins: '12', name: 'کال', kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 110, expiry: 20260820 },
  ];
  const args32 = {
    legs: legs32, baseIns: '1', startDate: 20260801, endDate: 20260803,
    entryBasis: 'CLOSE', exitBasis: 'LAST', units: 1,
    seriesByIns: { 1: base32, 11: put32, 12: call32 },
    fees: { buyStock: 0, sellStock: 0, option: 0, exercise: 0 },
    settings: defaults(),
  };
  const replay32 = replayHistory(args32);
  check('بازپخش تاریخی با قیمت ورود پایانی ساخته می‌شود', replay32.ok && replay32.priced[0].price === 8 && replay32.priced[1].price === 10);
  check('پرداختی، دریافتی و خالص ورود جدا گزارش می‌شوند', replay32.entry.cashPaid === 0 && replay32.entry.cashReceived === 18000 && replay32.entry.netCash === 18000);
  check('آفست روز دوم با آخرین، سود ناخالص درست می‌دهد', replay32.rows[1].grossPnl === 8000, replay32.rows[1].grossPnl);
  check('تغییر روزانه پایه محاسبه می‌شود', near(replay32.rows[1].baseDailyPct, 10, 1e-9), replay32.rows[1].baseDailyPct);
  check('تغییر تجمعی پایه از روز ورود محاسبه می‌شود', near(replay32.rows[2].baseCumulativePct, 5, 1e-9), replay32.rows[2].baseCumulativePct);
  check('نبود قیمت یک پا، ردیف را فاقد داده می‌کند', replay32.rows[2].status === 'missing' && replay32.rows[2].missingLegs[0] === 1);
  const legSnapshots32 = strategyLegSnapshots(legs32, args32.seriesByIns, 20260801);
  check('کارت قیمت بک‌تست برای هر پای استراتژی یک عکس مستقل می‌سازد', legSnapshots32.length === 2 && legSnapshots32[0].ins === '11' && legSnapshots32[1].ins === '12');
  check('قیمت کارت پاها از قرارداد می‌آید، نه دارایی پایه', legSnapshots32[0].prices.CLOSE === 8 && legSnapshots32[1].prices.CLOSE === 10 && legSnapshots32.every((row) => row.prices.CLOSE !== 100));
  const backtestSource32 = readSrc('../ui/tabs/backtest.mjs');
  check('رابط بک‌تست عکس قیمت را با پاهای انتخاب‌شده می‌سازد', backtestSource32.includes('strategyLegSnapshots(legs, seriesByIns, entry)') && !backtestSource32.includes('marketSnapshot(rowAt(ua?.ins'));
  check('رابط بک‌تست تحلیل خط زمانی، اثر پاها، حجم و ماتریس هم‌حرکتی را رندر می‌کند',
    backtestSource32.includes('summarizeIntraday(intraday)') && backtestSource32.includes('bt-intraday-leg-chart')
    && backtestSource32.includes('bt-intraday-volume-chart') && backtestSource32.includes('bt-correlation-table'));
  check('نمودارهای درون‌روزی روی ساعت واقعی و به‌شکل پله‌ای رسم می‌شوند',
    backtestSource32.includes('timeScale: true, step: true')
    && readSrc('../ui/track-chart.mjs').includes("`M ${values[0].x} ${values[0].y}`"));

  const manual32 = replayHistory({ ...args32, manualEntry: { 0: 5, 1: 20 } });
  check('قیمت دستی هر پا مستقل و بیرون دامنه پذیرفته می‌شود', manual32.priced[0].price === 5 && manual32.priced[1].price === 20);
  check('قیمت دستی در سود آفست اثر می‌گذارد', manual32.rows[1].netPnl === 15000, manual32.rows[1].netPnl);

  check('قیمت تاریخی صفر، داده معتبر ساخته نمی‌شود', Number.isNaN(historyPrice({ close: 0 }, 'CLOSE')));
  check('قیمت اولین معامله روز در مبناهای تاریخی قابل انتخاب است', historyPrice({ first: 13 }, 'FIRST') === 13);
  check('قیمت دستی صفر پذیرفته می‌شود', historyPrice(null, 'MANUAL', 0) === 0);
  check('تاریخ شمسی سررسید به میلادی نرمال می‌شود', normalizeHistoryDate(14050529) === 20260820, normalizeHistoryDate(14050529));
  check('برچسب تاریخ، شمسی است', historyDateLabel(20260801) === '1405/05/10', historyDateLabel(20260801));
  check('نام روز همراه تاریخ موجود است', historyDayName(20260801) === 'شنبه', historyDayName(20260801));

  const summary32 = summarizeReplay(replay32.rows, replay32.entry);
  check('خلاصه روز معتبر و فاقد داده را جدا می‌شمارد', summary32.validDays === 2 && summary32.missingDays === 1);
  check('تعداد و درصد آفست مثبت و منفی جداست', summary32.positiveDays === 1 && summary32.negativeDays === 1 && near(summary32.positivePct, 50));
  check('میانگین، میانه و پراکندگی بازده ساخته می‌شود', Number.isFinite(summary32.meanReturn) && Number.isFinite(summary32.medianReturn) && Number.isFinite(summary32.returnStdDev));
  check('خلاصه، سرمایه و جریان نقدی ورود را نگه می‌دارد', Number.isFinite(summary32.capital) && summary32.cashPaid === 0 && summary32.cashReceived === 18000 && summary32.netCash === 18000);
  check('بازده پایه در نتیجه جدول اصلی موجود است', near(summary32.last.baseCumulativePct, 10, 1e-9));
  check('اثر روزانه هر پا محاسبه می‌شود', Number.isFinite(replay32.rows[1].perLeg[0].pnlDelta));
  check('وجه تضمین کل و هر پای فروش در روز موجود است', Number.isFinite(replay32.rows[1].marginNet) && replay32.rows[1].marginPerLeg.length === 2);
  check('ماتریس مبنای ورود و خروج هر بیست‌وپنج حالت را دارد', basisMatrix(args32).length === 25);
  check('حساسیت ورود برای هر پا و پنج شوک ساخته می‌شود', entrySensitivity(args32).length === 10);

  const units32 = replayHistory({ ...args32, units: 3 });
  check('تعداد واحد استراتژی، سود را خطی مقیاس می‌کند', units32.rows[1].netPnl === replay32.rows[1].netPnl * 3);

  const expiryBase32 = [
    ...base32,
    { date: 20260820, close: 108, last: 108, low: 107, high: 109 },
    { date: 20260821, close: 109, last: 109, low: 108, high: 110 },
  ];
  const expiryCall32 = [...call32, { date: 20260820, close: 1, last: 1, low: 1, high: 1 }, { date: 20260821, close: 2, last: 2, low: 2, high: 2 }];
  const expiryPut32 = [...put32, { date: 20260820, close: 1, last: 1, low: 1, high: 1 }, { date: 20260821, close: 2, last: 2, low: 2, high: 2 }];
  const stopped32 = replayHistory({ ...args32, endDate: 20260821, seriesByIns: { 1: expiryBase32, 11: expiryPut32, 12: expiryCall32 } });
  check('بازپخش در اولین سررسید متوقف می‌شود', stopped32.endDate === 20260820 && stopped32.rows.at(-1).date === 20260820);

  const ua32 = {
    ins: '1', name: 'پایه', close: 100, last: 101,
    expiryList: [{
      days: 19, endDate: 20260820,
      strikeList: [
        { strike: 90, size: 1000, call: { ins: '21', name: 'کال ۹۰' }, put: { ins: '11', name: 'پوت ۹۰' } },
        { strike: 110, size: 1000, call: { ins: '12', name: 'کال ۱۱۰' }, put: { ins: '22', name: 'پوت ۱۱۰' } },
      ],
    }],
  };
  const autoSeries32 = {
    1: base32,
    11: put32,
    12: call32,
    21: call32.map((r) => ({ ...r, close: r.close + 1 })),
    22: put32.map((r) => ({ ...r, close: r.close + 1 })),
  };
  const generated32 = generateHistoricalCombos({
    def: byId('short-strangle'), ua: ua32, seriesByIns: autoSeries32,
    startDate: 20260801, entryBasis: 'CLOSE', settings: defaults(), filtered: false,
  });
  check('حالت خودکار، تمام ترکیب ساختاری استراتژی انتخابی را می‌سازد', generated32.combos.length === 1, generated32.combos.length);
  check('ترکیب خودکار، پوت پایین و کال بالا را درست می‌چیند', generated32.combos[0].legs[0].ins === '11' && generated32.combos[0].legs[1].ins === '12');

  const officialMarket32 = historyMarketMetrics({ close: 100, vol: 20, trades: 4, value: 5000 });
  const estimatedMarket32 = historyMarketMetrics({ close: 100, vol: 20, trades: 4 });
  check('ارزش رسمی روزانه بر برآورد اولویت دارد', officialMarket32.value === 5000 && !officialMarket32.valueEstimated);
  check('نبود ارزش رسمی با حجم × پایانی برآورد و علامت می‌خورد', estimatedMarket32.value === 2000 && estimatedMarket32.valueEstimated);

  const liquidSeries32 = {
    1: base32.map((r, i) => ({ ...r, vol: i === 1 ? 10 : 1000, trades: 5, value: i === 1 ? 1000 : 100000 })),
    11: put32.map((r, i) => ({ ...r, vol: i === 1 ? 2 : 100, trades: 3, value: i === 1 ? 20 : 10000 })),
    12: call32.map((r) => ({ ...r, vol: 100, trades: 3, value: 10000 })),
  };
  const liquidReplay32 = replayHistory({ ...args32, seriesByIns: liquidSeries32,
    liquidity: { minBaseVolume: 100, minBaseValue: 10000, minLegVolume: 10, minLegValue: 1000 } });
  check('فیلتر نقدشوندگی روز ضعیف را از آمار معتبر حذف می‌کند', liquidReplay32.ok && liquidReplay32.rows[1].status === 'liquidity' && liquidReplay32.summary.liquidityDays === 1);
  const blockedEntry32 = replayHistory({ ...args32, seriesByIns: liquidSeries32,
    liquidity: { minBaseVolume: 2000 } });
  check('حداقل حجم پایه در خود روز ورود اعمال می‌شود', !blockedEntry32.ok && blockedEntry32.liquidityError);

  const optimized32 = optimizeExitPolicy(args32, { targets: [1, 5], holdingDays: [1, 2] });
  check('بهینه‌ساز، بهترین خروج مشاهده‌شده و قاعده خروج می‌سازد', optimized32.bestObserved?.date === 20260802 && optimized32.bestPolicy?.samples >= 1);

  const matrixArgs32 = {
    ...args32,
    seriesByIns: { ...args32.seriesByIns, 12: [...call32, { date: 20260803, close: 6, last: 5, low: 4, high: 7 }] },
  };
  const rolling32 = rollingEntryMatrix(matrixArgs32);
  const cell32 = rolling32.cells.find((c) => c.entryDate === 20260801 && c.exitDate === 20260802);
  const sameDayCell32 = rolling32.cells.find((c) => c.entryDate === 20260801 && c.exitDate === 20260801);
  check('ماتریس ورود×خروج همه تاریخ‌های پایه را نگه می‌دارد', rolling32.dates.length === 3 && rolling32.cells.length === 6, `${rolling32.dates.length} تاریخ، ${rolling32.cells.length} خانه`);
  check('خانه ماتریس بازده انباشته و تغییر همان روز را جدا دارد', Number.isFinite(cell32?.returnPct) && Number.isFinite(cell32?.dailyReturnPct) && cell32.holdingTradingDays === 1);
  check('تغییر روز ورود از صفر تا آفست همان روز است، نه صفر ساختگی', sameDayCell32?.dailyPnl === sameDayCell32?.netPnl);
  check('ماتریس برای هر ورود، سرمایه و جریان‌های نقدی کامل خروجی می‌دهد', rolling32.entries.length === 3 && Number.isFinite(rolling32.entries[0]?.capital) && Number.isFinite(rolling32.entries[0]?.cashPaid) && Number.isFinite(rolling32.entries[0]?.cashReceived));
  check('هر خانه جزئیات نقدشوندگی، کارمزد و اثر همه پاها را برای خروجی جامع دارد', cell32?.perLeg?.length === 2 && Number.isFinite(cell32?.baseClose) && Number.isFinite(cell32?.totalFees) && cell32.perLeg.every((leg) => Number.isFinite(leg.exitPrice) && Number.isFinite(leg.netPnl)));
  check('خروجی ماتریس هیچ شناسه خام قرارداد یا دارایی پایه را حمل نمی‌کند', !JSON.stringify(rolling32).includes('"ins"'));
  const profile32 = holdingPeriodProfile(rolling32);
  check('پروفایل افق نگهداری، چند ورود را در روز معاملاتی یکسان تجمیع می‌کند', profile32.rows.find((r) => r.holdingTradingDays === 1)?.samples === 2);
  check('افق مقاوم فقط از افق دارای نمونه کافی انتخاب می‌شود', profile32.best?.holdingTradingDays === 1);
  const detail32 = replayTradeDetail(matrixArgs32, 20260801, 20260802);
  check('کلیک خانه می‌تواند مسیر کامل و بهترین/بدترین نقطه را بازسازی کند', detail32.ok && detail32.path.length === 2 && detail32.best && detail32.worst && detail32.selected.date === 20260802);

  const intraday32 = replayIntraday({
    replay: replay32,
    tradesByIns: {
      11: [{ sequence: 1, time: 90000, price: 5, quantity: 3 }, { sequence: 3, time: 90100, price: 4, quantity: 2 }],
      12: [{ sequence: 2, time: 90030, price: 6, quantity: 4 }],
    },
    baseTrades: [{ sequence: 1, time: 90010, price: 110, quantity: 20 }, { sequence: 2, time: 90040, price: 111, quantity: 5 }],
    fees: args32.fees,
  });
  check('ریزمعامله تا پیش از مشاهده قیمت همه پاها عدد مالی نمی‌سازد', intraday32.length === 3 && intraday32[0].timeLabel === '09:00:30');
  check('رویداد نماد پایه هم روی خط زمانی مشترک می‌نشیند', intraday32[1].timeLabel === '09:00:40' && intraday32[1].basePrice === 111);
  check('ارزش‌گذاری ریزمعامله اثر هر پا و سود کل را از موتور مشترک می‌سازد', intraday32[2].perLeg.length === 2 && intraday32[2].netPnl === 8000, intraday32[2].netPnl);
  check('قیمت پایه ریزمعامله به‌صورت مشاهده‌شده و درصدی نگه داشته می‌شود', intraday32[1].basePrice === 111 && near(intraday32[1].basePct, 11));
  check('تبدیل زمان ریزمعامله پایدار است', tradeSecond(90105) === 32465 && tradeTimeLabel(90105) === '09:01:05');
  check('مرز جلسه درون‌روزی دقیقاً ۹ تا ۱۲:۳۰ است', !inIntradaySession(85959) && inIntradaySession(90000) && inIntradaySession(123000) && !inIntradaySession(123001));

  const detailedIntraday32 = replayIntraday({
    replay: replay32,
    tradesByIns: {
      11: [
        { sequence: 1, time: 85959, price: 99, quantity: 90 },
        { sequence: 2, time: 90000, price: 5, quantity: 3 },
        { sequence: 3, time: 90000, price: 4, quantity: 2 },
        { sequence: 4, time: 123001, price: 1, quantity: 80 },
      ],
      12: [{ sequence: 1, time: 90000, price: 6, quantity: 4 }, { sequence: 2, time: 90530, price: 7, quantity: 1 }],
    },
    fees: args32.fees,
  });
  check('چند معامله یک پا در یک ثانیه، یک نقطه با آخرین قیمت می‌سازد', detailedIntraday32.length === 2 && detailedIntraday32[0].perLeg[0].exitPrice === 4);
  check('حجم همان ثانیه و حجم تجمعی هر پا جدا نگه داشته می‌شود', detailedIntraday32[0].perLeg[0].secondVolume === 5 && detailedIntraday32[1].perLeg[0].cumulativeVolume === 5);
  check('سن آخرین قیمت هر پا روی خط زمانی مشترک مشخص است', detailedIntraday32[1].perLeg[0].ageSec === 330 && detailedIntraday32[1].maxAgeSec === 330 && !detailedIntraday32[1].allFresh);
  const intradaySummary32 = summarizeIntraday(detailedIntraday32, { bucketSeconds: 60 });
  check('خلاصه درون‌روزی بهترین، بدترین و افت از قله را می‌سازد', intradaySummary32.points === 2 && intradaySummary32.best && intradaySummary32.worst && intradaySummary32.maxDrawdown <= 0);
  const observedIntervals32 = intradaySummary32.intervals.filter((row) => row.observations);
  check('جدول بازه‌ای همه جلسه را بدون ساخت عدد برای شکاف‌ها نگه می‌دارد', intradaySummary32.intervals.length === 210 && intradaySummary32.intervals.some((row) => !row.observations && !Number.isFinite(row.openPnl)));
  check('جدول بازه‌ای، تعداد مشاهده و حجم واقعی پاها را جمع می‌زند', observedIntervals32.length === 2 && observedIntervals32[0].volume === 9 && observedIntervals32[0].trades === 3);
  check('خلاصه هر پا قیمت، اثر و فعالیت بازار را نگه می‌دارد', intradaySummary32.legs.length === 2 && intradaySummary32.legs[0].lastPrice === 4 && intradaySummary32.legs[1].tradeCount === 2);
  check('ماتریس هم‌حرکتی به تعداد پاها و با قطر یک ساخته می‌شود', intradaySummary32.correlation.length === 2 && intradaySummary32.correlation[0][0] === 1 && intradaySummary32.correlation[1][1] === 1);

  // ——— دو پا روی یک قرارداد: یک معامله فیزیکی، نه دو تا ———
  // اگر جمع سطر از روی حجم پاها بسته شود، همان معامله دوبار شمرده می‌شود و
  // عددی بیرون می‌آید که در تابلو وجود ندارد.
  const sharedIns32 = replayIntraday({
    replay: {
      ...replay32,
      priced: [replay32.priced[0], { ...replay32.priced[0], side: 'sell' }],
    },
    tradesByIns: { [String(replay32.priced[0].ins)]: [
      { sequence: 1, time: 90000, price: 6, quantity: 100 },
      { sequence: 2, time: 90100, price: 7, quantity: 50 },
    ] },
    fees: args32.fees,
  });
  check('حجم تجمعی سطر با دو پای هم‌قرارداد دوبار شمرده نمی‌شود',
    sharedIns32.length === 2 && sharedIns32[0].cumulativeVolume === 100 && sharedIns32.at(-1).cumulativeVolume === 150,
    sharedIns32.map((row) => row.cumulativeVolume).join('/'));
  check('حجم تجمعی سطر همان جمع رویدادهای همان مسیر است',
    sharedIns32.at(-1).cumulativeVolume === sharedIns32.reduce((sum, row) => sum + row.eventVolume, 0));
  const chartSource32 = readSrc('../ui/track-chart.mjs');
  check('برچسب سری نمودار نام قرارداد بالادست را فرار می‌دهد',
    chartSource32.includes('const seriesLabel = (item) => esc(item.label);')
    && !/\$\{item\.label\}/.test(chartSource32));
  // این ادعا دربارهٔ نشانه‌گذاری خودِ تب است، نه نمودار مشترک.
  const btMarkup32 = readSrc('../ui/tabs/backtest.mjs');
  check('توضیح ماتریس هم‌حرکتی بیرون از جعبه پیمایش جدول می‌نشیند',
    btMarkup32.includes('id="bt-correlation-note"')
    && !/backtest-correlation[\s\S]{0,2000}?<p class="backtest-table-note"/.test(btMarkup32));
  const styleSource32 = readSrc('../ui/style.css');
  check('ماتریس هم‌حرکتی کف پهنای جدول تاریخچه را نمی‌گیرد',
    styleSource32.includes('.history-table.backtest-correlation { min-width: 0; }'));

  // ——— ابطال معامله: «باطل نشده» و «نمی‌دانیم» دو چیز متفاوت‌اند ———
  check('پرچم ابطال از هر املای محتمل بالادست خوانده می‌شود',
    canceledFlag({ canceled: true }) === true && canceledFlag({ cancelled: 1 }) === true
    && canceledFlag({ isCanceled: false }) === false);
  check('نبود میدان ابطال «باطل‌نشده» معنی نمی‌دهد، «نامعلوم» معنی می‌دهد',
    canceledFlag({ pTran: 5 }) === null);
  const trades32 = normalizeTrades([
    { nTran: 2, hEven: 90100, qTitTran: 5, pTran: 7 },
    { nTran: 1, hEven: 90000, qTitTran: 3, pTran: 6, canceled: true },
    { nTran: 3, hEven: 85900, qTitTran: 1, pTran: 0 },
  ]);
  check('ریزمعامله بدون قیمت دور ریخته و بقیه بر پایه زمان مرتب می‌شود',
    trades32.length === 2 && trades32[0].time === 90000 && trades32[1].time === 90100);
  check('معامله باطل‌شده علامت می‌خورد و معلوم‌بودن وضعیتش گزارش می‌شود',
    trades32[0].canceled === true && trades32[0].canceledKnown === true);
  check('وقتی بالادست ساکت است، ابطال نامعلوم می‌ماند و ادعای پاکی نمی‌شود',
    trades32[1].canceled === false && trades32[1].canceledKnown === false);
  const cancelDropped32 = replayIntraday({
    replay: replay32,
    tradesByIns: {
      11: [{ sequence: 1, time: 90000, price: 5, quantity: 3 }],
      12: [{ sequence: 2, time: 90030, price: 6, quantity: 4, canceled: true }],
    },
    fees: args32.fees,
  });
  check('با پای باطل‌شده، همه پاها مشاهده‌شده نیستند و عدد مالی ساخته نمی‌شود',
    cancelDropped32.length === 0, cancelDropped32.length);
}
