// ۳۹. تحلیل چندروزه روی تایم‌فریم انتخابی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import {
  ENTRY_EXIT_MIN_BUCKET, INTRADAY_START_SECOND, TF_BUCKET_STATUS, bucketIntradayPath, intradayEntryExitProfile, intradayHoldingSummary, timeOfDayProfile,
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
  //
  // ═══ ادعایی که رفتارِ ناقص را «درست» فرض کرده بود ═══
  //
  // ادعای پیشین این بود: «سطل بی‌مشاهده ساخته نمی‌شود». صاحب پروژه نشان
  // داد که همین، خودِ باگ است: حلقه روی «سطل‌های موجود» می‌چرخید نه روی
  // بازهٔ جلسه، پس برای استرانگلِ کم‌معامله‌ای که اولین قیمتِ کاملش ساعت
  // ۱۲:۲۵ تشکیل می‌شود، نمودار از ۱۲:۲۵ شروع می‌شد — در تایم‌فریم پنج
  // دقیقه‌ای یک سطل به‌جای چهل‌ودو.
  //
  // پس ادعا وارونه شد: شمارِ سطلِ هر روز باید **ثابت** باشد.
  const buckets39 = bucketIntradayPath(days39, { bucketSeconds: 30 * 60 });
  // انتخاب با کلیدِ زمان، نه با شمارهٔ ردیف: با افزوده‌شدنِ سطل‌های خالی
  // اندیس‌ها جابه‌جا می‌شوند و ادعایی که به اندیس چسبیده باشد، به‌جای
  // سنجیدنِ قاعده، شکلِ آرایه را می‌سنجد.
  const at39 = (date, offset) => buckets39.find((row) => row.date === date && row.startSecond === S + offset);
  const d1a = at39(20260801, 0), d1b = at39(20260801, 1800);
  const d2a = at39(20260802, 0), d2b = at39(20260802, 1800);

  check('هر روز محورِ کاملِ جلسه را می‌گیرد، نه فقط سطل‌های دارای مشاهده',
    buckets39.length === 14, `${buckets39.length} سطل برای دو روز`);
  check('در هر روز فقط سطل‌های دارای معامله «مشاهده‌شده»اند',
    buckets39.filter((row) => row.status === TF_BUCKET_STATUS.OBSERVED).length === 4);
  check('باز، بسته، بیشینه و کمینه هر سطل از مشاهده‌های همان سطل می‌آید',
    d1a.openPnl === 100 && d1a.closePnl === 300 && d1a.highPnl === 300 && d1a.lowPnl === 100);
  check('تغییر درون سطل از اولین تا آخرین مشاهده همان سطل است', d1a.changePnl === 200);
  // تغییر پیاپی از بسته‌شدن سطل قبلیِ **دارای مشاهده** می‌آید، حتی وقتی
  // آن سطل روز دیگری است. سطل‌های خالی مرجع را جابه‌جا نمی‌کنند.
  check('اولین سطل تغییر پیاپی ندارد، نه اینکه صفر باشد', Number.isNaN(d1a.stepPnl));
  check('تغییر پیاپی از سطل مشاهده‌دارِ قبلی حساب می‌شود، حتی وقتی روز عوض شده',
    d1b.stepPnl === -350 && d2a.stepPnl === 140, `${d1b.stepPnl}/${d2a.stepPnl}`);
  check('سطل خالی مرجعِ تغییر پیاپی را خراب نمی‌کند', d2b.stepPnl === -80, d2b.stepPnl);
  check('هر سطل تعداد مشاهده و حجم خودش را حمل می‌کند',
    d1a.observations === 2 && d1a.volume === 2 && d1b.observations === 1);
  check('اثر هر پا در سطل هم گزارش می‌شود', d1a.perLeg[0].changePnl === 200);
  // تایم‌فریم کوچک‌تر یعنی سطل بیشتر، بدون ساختن **مشاهدهٔ** تازه. شمارِ
  // سطل عوض می‌شود چون محور ریزتر می‌شود؛ شمارِ مشاهده نباید عوض شود.
  const fine39 = bucketIntradayPath(days39, { bucketSeconds: 60 });
  check('تایم‌فریم ریزتر سطل بیشتر می‌دهد ولی مشاهده تازه نمی‌سازد',
    fine39.length === 420 && fine39.reduce((sum, row) => sum + row.observations, 0) === 6,
    `${fine39.length} سطل، ${fine39.reduce((sum, row) => sum + row.observations, 0)} مشاهده`);
  check('تایم‌فریم زیر یک دقیقه به یک دقیقه بسته می‌شود',
    bucketIntradayPath(days39, { bucketSeconds: 1 }).length === fine39.length);

  // ═══ شمارِ سطلِ هر روز، برای هر تایم‌فریم ═══
  //
  // جدولی که صاحب پروژه داد. جلسه ۹:۰۰ تا ۱۲:۳۰ است، یعنی ۲۱۰ دقیقه.
  // سطلِ آخرِ شصت‌دقیقه‌ای نیم‌ساعته است، چون جلسه سرِ ساعت تمام نمی‌شود.
  const oneDay39 = [days39[0]];
  for (const [minutes, expected] of [[1, 210], [5, 42], [15, 14], [30, 7], [60, 4]]) {
    const rows = bucketIntradayPath(oneDay39, { bucketSeconds: minutes * 60 });
    check(`تایم‌فریم ${minutes} دقیقه‌ای هر روز ${expected} سطل دارد`,
      rows.length === expected, `${rows.length}`);
  }
  const hourly39 = bucketIntradayPath(oneDay39, { bucketSeconds: 3600 });
  check('سطل آخرِ شصت‌دقیقه‌ای نیم‌ساعته است، نه یک ساعت',
    hourly39.at(-1).endSecond - hourly39.at(-1).startSecond === 30 * 60);

  // ═══ سطلِ پیش از اولین قیمتِ کامل، عدد نمی‌گیرد ═══
  //
  // این همان موردی است که گزارش شد: استرانگلی که اولین قیمتِ کاملش ساعت
  // ۱۲:۲۵ تشکیل می‌شود. پیش از آن هیچ قیمتی مشاهده نشده که حمل شود، و
  // کشیدنِ قیمتِ ۱۲:۲۵ به صبح پس‌نگر است.
  const late39 = [{ date: 20260803, points: [point39((12 * 3600) + (25 * 60), 500), point39((12 * 3600) + (27 * 60), 520)] }];
  const lateRows = bucketIntradayPath(late39, { bucketSeconds: 5 * 60 });
  check('روزی که قیمتش دیر تشکیل می‌شود هم محورِ کامل می‌گیرد', lateRows.length === 42);
  const morning39 = lateRows[0];
  check('سطلِ ۹:۰۰ پیش از اولین قیمتِ کامل است', morning39.status === TF_BUCKET_STATUS.BEFORE_FIRST);
  check('سطلِ پیش از اولین قیمت هیچ عددی ندارد — نه بسته، نه حمل‌شده',
    Number.isNaN(morning39.closePnl) && Number.isNaN(morning39.carriedPnl));
  // هر دو نقطه (۱۲:۲۵ و ۱۲:۲۷) در همین یک سطلِ پنج‌دقیقه‌ای می‌افتند، پس
  // باز ۵۰۰ است و بسته ۵۲۰ — نه هر دو ۵۰۰. ادعای اولم همین را اشتباه
  // گرفته بود و آزمون گرفتش.
  const noon39 = lateRows.find((row) => row.startSecond === (12 * 3600) + (25 * 60));
  check('سطلِ ۱۲:۲۵ مشاهده‌شده است و عددِ واقعی دارد',
    noon39.status === TF_BUCKET_STATUS.OBSERVED && noon39.openPnl === 500 && noon39.closePnl === 520,
    `${noon39.openPnl}/${noon39.closePnl}`);

  // ═══ پس از اولین قیمت، حمل می‌شود — ولی در خانهٔ جدا ═══
  //
  // دو خواسته در ظاهر با هم می‌جنگیدند: «آخرین قیمت را حمل کن» و «نمودار
  // قیمت را به گذشته تعمیم ندهد». هر دو برقرارند چون در دو خانهٔ جدا
  // می‌نشینند: «closePnl» فقط مشاهدهٔ واقعی (پس رسّام خط را قطع می‌کند)،
  // و «carriedPnl» با سنّش برای جدول.
  const gapRow39 = bucketIntradayPath(late39, { bucketSeconds: 60 })
    .find((row) => row.status === TF_BUCKET_STATUS.CARRIED);
  check('سطلِ بی‌معامله پس از اولین قیمت، «حمل‌شده» است', !!gapRow39);
  check('قیمتِ حمل‌شده در خانهٔ جدا می‌نشیند، نه در بسته',
    Number.isNaN(gapRow39.closePnl) && gapRow39.carriedPnl === 500, `${gapRow39.closePnl}/${gapRow39.carriedPnl}`);
  check('قیمتِ حمل‌شده سنّ خودش را همراه دارد',
    Number.isFinite(gapRow39.carriedAgeSec) && gapRow39.carriedAgeSec > 0, gapRow39.carriedAgeSec);
  // روزی که هیچ نقطه‌ای ندارد هیچ سطلی نمی‌گیرد: علتِ نبودِ داده را
  // «intradayPathWithGaps» در سطحِ روز می‌گوید، با برچسب. اگر اینجا ۲۱۰
  // سطلِ خالی بسازیم، آن ردیفِ توضیح‌دار دیگر ساخته نمی‌شود.
  check('روزِ بی‌نقطه اصلاً سطل نمی‌گیرد — علتش در سطحِ روز گفته می‌شود',
    bucketIntradayPath([{ date: 20260804, points: [] }], { bucketSeconds: 5 * 60 }).length === 0);

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
