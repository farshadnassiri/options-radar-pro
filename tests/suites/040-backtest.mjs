// ۳۹. تحلیل چندروزه روی تایم‌فریم انتخابی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import {
  ENTRY_EXIT_MIN_BUCKET, INTRADAY_START_SECOND, bucketIntradayPath, intradayEntryExitProfile, intradayHoldingSummary, timeOfDayProfile,
} from '../../core/backtest.mjs';


// ═══════════════════════════ ۳۹. تحلیل چندروزه روی تایم‌فریم انتخابی ═══════════════════════════
group('۳۹. تحلیل چندروزه روی تایم‌فریم انتخابی');
{
  const S = INTRADAY_START_SECOND;
  // نقطه‌ساز ساده: هر نقطه یک ثانیه با آفست و یک پا.
  const point39 = (second, netPnl, price = 10, volume = 1) => ({
    second, timeLabel: '—', netPnl, returnPct: netPnl / 100,
    basePrice: 1000, basePct: 0, eventVolume: volume, eventTrades: 1,
    baseCumulativeVolume: 0, baseSecondVolume: 0, maxAgeSec: 0, allFresh: true,
    perLeg: [{ index: 0, ins: '11', name: 'پا', side: 'sell', exitPrice: price, netPnl, cumulativeVolume: volume, tradeCount: 1, ageSec: 0 }],
  });
  const days39 = [
    { date: 20260801, points: [point39(S, 100), point39(S + 60, 300), point39(S + 1900, -50)] },
    { date: 20260802, points: [point39(S + 30, 20), point39(S + 120, 90), point39(S + 1900, 10)] },
  ];

  // ——— سطل‌بندی ———
  const buckets39 = bucketIntradayPath(days39, { bucketSeconds: 30 * 60 });
  check('هر روز جدا سطل می‌شود و سطل بی‌مشاهده ساخته نمی‌شود',
    buckets39.length === 4, buckets39.map((row) => `${row.date}@${row.startSecond - S}`).join(' '));
  check('باز، بسته، بیشینه و کمینه هر سطل از مشاهده‌های همان سطل می‌آید',
    buckets39[0].openPnl === 100 && buckets39[0].closePnl === 300 && buckets39[0].highPnl === 300 && buckets39[0].lowPnl === 100);
  check('تغییر درون سطل از اولین تا آخرین مشاهده همان سطل است', buckets39[0].changePnl === 200);
  // تغییر پیاپی از بسته‌شدن سطل قبلی می‌آید، حتی وقتی سطل قبلی روز دیگری است.
  check('اولین سطل تغییر پیاپی ندارد، نه اینکه صفر باشد', Number.isNaN(buckets39[0].stepPnl));
  // سطل سوم اولین سطل روز دوم است؛ مرجعش بستهٔ آخرین سطل روز اول است، نه صفر.
  check('تغییر پیاپی از سطل قبلی حساب می‌شود، حتی وقتی روز عوض شده',
    buckets39[1].stepPnl === -350 && buckets39[2].stepPnl === 140,
    `${buckets39[1].stepPnl}/${buckets39[2].stepPnl}`);
  check('هر سطل تعداد مشاهده و حجم خودش را حمل می‌کند',
    buckets39[0].observations === 2 && buckets39[0].volume === 2 && buckets39[1].observations === 1);
  check('اثر هر پا در سطل هم گزارش می‌شود', buckets39[0].perLeg[0].changePnl === 200);
  // تایم‌فریم کوچک‌تر یعنی سطل بیشتر، بدون ساختن نقطه تازه.
  const fine39 = bucketIntradayPath(days39, { bucketSeconds: 60 });
  check('تایم‌فریم ریزتر سطل بیشتر می‌دهد ولی مشاهده تازه نمی‌سازد',
    fine39.length === 6 && fine39.reduce((sum, row) => sum + row.observations, 0) === 6, fine39.length);
  check('تایم‌فریم زیر یک دقیقه به یک دقیقه بسته می‌شود',
    bucketIntradayPath(days39, { bucketSeconds: 1 }).length === fine39.length);

  // ——— مدت سود و زیان ———
  const holding39 = intradayHoldingSummary(days39);
  // روز اول: ۶۰ ثانیه با آفست ۱۰۰، بعد ۱۸۴۰ ثانیه با ۳۰۰، و نقطه آخر بدون
  // ادامه — پس ۱۹۰۰ ثانیه مشاهده‌شده که همه‌اش در سود بوده.
  check('مدت مشاهده‌شده از فاصله نقاط می‌آید، نه از طول جلسه',
    holding39.days[0].observedSeconds === 1900 && holding39.days[0].positiveSeconds === 1900);
  check('بازه پس از آخرین معامله روز اصلاً شمرده نمی‌شود',
    holding39.days[0].observedSeconds === 1900 && holding39.days[0].lastSecond - holding39.days[0].firstSecond === 1900);
  check('روز سودده و زیان‌ده از آفست پایان روز شمرده می‌شود',
    holding39.positiveDays === 1 && holding39.negativeDays === 1 && holding39.dayCount === 2);
  check('درصد زمان در سود روی کل بازه محاسبه می‌شود', near(holding39.positivePct, 100));
  // صفر نه سود است نه زیان؛ ریختنش در یکی از دو سطل، درصدها را جابه‌جا می‌کند.
  const flat39 = intradayHoldingSummary([{ date: 1, points: [point39(S, 0), point39(S + 50, 5)] }]);
  check('ثانیه با آفست صفر نه در سود شمرده می‌شود نه در زیان',
    flat39.flatSeconds === 50 && flat39.positiveSeconds === 0 && flat39.negativeSeconds === 0,
    `${flat39.flatSeconds}/${flat39.positiveSeconds}`);
  const lossDay39 = intradayHoldingSummary([{ date: 1, points: [point39(S, -5), point39(S + 100, -7)] }]);
  check('زمان در زیان جدا از زمان در سود شمرده می‌شود',
    lossDay39.negativeSeconds === 100 && lossDay39.positiveSeconds === 0 && near(lossDay39.negativePct, 100));

  // ——— رفتار ساعتی ———
  const profile39 = timeOfDayProfile(days39, { bucketSeconds: 30 * 60 });
  check('بازه ساعتی مشترک دو روز، دو نمونه دارد', profile39[0].days === 2 && profile39[0].upDays === 2);
  check('یکنواختی جهت، سهم پرتکرارترین جهت است', near(profile39[0].consistencyPct, 100));
  const mixed39 = timeOfDayProfile([
    { date: 1, points: [point39(S, 0), point39(S + 60, 10)] },
    { date: 2, points: [point39(S, 0), point39(S + 60, -10)] },
  ], { bucketSeconds: 30 * 60 });
  check('دو روز با جهت مخالف، یکنواختی پنجاه درصد می‌دهد', near(mixed39[0].consistencyPct, 50) && near(mixed39[0].upPct, 50));

  // ——— بهترین بازه ورود و خروج ———
  const legs39 = [{ kind: 'call', side: 'buy', ratio: 1, size: 1, strike: 100, price: 0 }];
  const priced39 = [
    { date: 1, points: [point39(S, 0, 10), point39(S + 20 * 60, 0, 14), point39(S + 40 * 60, 0, 12)] },
    { date: 2, points: [point39(S, 0, 20), point39(S + 20 * 60, 0, 26), point39(S + 40 * 60, 0, 24)] },
  ];
  const matrix39 = intradayEntryExitProfile(priced39, { legs: legs39, bucketSeconds: 20 * 60, fees: {} });
  check('ماتریس ورود×خروج فقط جفت‌های رو به جلو می‌سازد',
    matrix39.cells.length === 3 && matrix39.cells.every((cell) => cell.exitSecond > cell.entrySecond), matrix39.cells.length);
  check('هر خانه روی همه روزها تجمیع می‌شود', matrix39.cells.every((cell) => cell.samples === 2));
  // خرید ۱۰ و فروش ۱۴ در روز اول و ۲۰ به ۲۶ در روز دوم → میانه ۵
  const firstToSecond39 = matrix39.cells.find((cell) => cell.entrySecond === S && cell.exitSecond === S + 20 * 60);
  check('سود هر خانه از قیمت مشاهده‌شده دو سرِ همان جفت می‌آید',
    firstToSecond39.medianPnl === 5 && firstToSecond39.winPct === 100, firstToSecond39.medianPnl);
  check('بهترین بازه ورود و خروج با میانه رتبه‌بندی می‌شوند',
    matrix39.bestEntry.second === S && matrix39.bestExit.second === S + 20 * 60,
    `${matrix39.bestEntry.second - S}/${matrix39.bestExit.second - S}`);
  // کف پنج دقیقه‌ای عمدی است و باید صریح برگردد، نه بی‌صدا اعمال شود.
  const clamped39 = intradayEntryExitProfile(priced39, { legs: legs39, bucketSeconds: 60, fees: {} });
  check('تایم‌فریم ریزتر از کف ماتریس، صریح به کف بسته می‌شود',
    clamped39.bucketSeconds === ENTRY_EXIT_MIN_BUCKET && clamped39.requestedBucketSeconds === 60);
  check('بدون پا، ماتریس عدد نمی‌سازد', intradayEntryExitProfile(priced39, { legs: [], bucketSeconds: 20 * 60 }).cells.length === 0);
  check('روزی که فقط یک سطل دارد، هیچ جفتی نمی‌سازد',
    intradayEntryExitProfile([{ date: 1, points: [point39(S, 0, 10)] }], { legs: legs39, bucketSeconds: 20 * 60 }).days === 0);
  // کارمزد باید در هر دو سمت کم شود، وگرنه ماتریس سود را بیش‌برآورد می‌کند.
  const withFee39 = intradayEntryExitProfile(priced39, { legs: legs39, bucketSeconds: 20 * 60, fees: { option: 0.1 } });
  check('کارمزد هر دو سمت از سود خانه کم می‌شود',
    withFee39.cells.find((cell) => cell.entrySecond === S && cell.exitSecond === S + 20 * 60).medianPnl < 5);

  check('ورودی خالی، خروجی خالی می‌دهد',
    bucketIntradayPath([]).length === 0 && intradayHoldingSummary([]).dayCount === 0 && timeOfDayProfile([]).length === 0);

}
