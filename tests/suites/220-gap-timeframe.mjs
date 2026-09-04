// ۲۲۰. تایم‌فریم فاصله، و رفتارش در برابر دارایی پایه
//
// دستهٔ ۲۱۸ یک لحظه را می‌سنجد؛ این یکی زمان را.
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «این فاصله در بازه‌های زمانی مختلف باید قابل نمایش باشد… در
// تایم‌فریم‌های مختلف… چه در بازه‌های زمانی گذشته چه حال.»
// و: «رفتار این تفاوت یا جمع رو با دارایی پایه بسنج در نمودار.»
//
// دو ادعا که این دسته قفلشان می‌کند:
//
//   تجمیع، نه نمونه‌برداری   برداشتنِ «قیمتِ آخرین روزِ هر هفته» جهش‌های
//                            درون‌هفته را گم می‌کند. سطل هر چهار عدد را
//                            نگه می‌دارد و هیچ روزی از شمارش نمی‌افتد.
//   همبستگی و شیب، با هم    همبستگیِ ۰٫۹ با شیبِ ۰٫۰۰۱ یعنی رابطه محکم
//                            است ولی عملاً بی‌اثر. یکی‌شان به‌تنهایی
//                            گمراه‌کننده است.

import { check, group, near } from '../harness.mjs';
import {
  GAP_TIMEFRAMES, dailyGapSeries, indexedPair, resample, versusBase,
} from '../../core/spread-gap-series.mjs';
import { buildRadarHistory } from '../../core/radar-history.mjs';
import { jalaliToGregorian } from '../../core/jalali.mjs';
import { byId } from '../../strategies/catalog.mjs';

// اسپرد صعودی کال: خرید ۵۰٬۰۰۰، فروش ۵۴٬۰۰۰.
const BULL = [
  { ins: 'c50', kind: 'call', side: 'buy', strike: 50000, size: 1000, ratio: 1, name: 'ضهرم۵۰' },
  { ins: 'c54', kind: 'call', side: 'sell', strike: 54000, size: 1000, ratio: 1, name: 'ضهرم۵۴' },
];


group('۲۲۰-الف. تایم‌فریم و مقایسه با دارایی پایه');
{
  // خواستهٔ صاحب پروژه: «این فاصله در بازه‌های زمانی مختلف باید قابل
  // نمایش باشد… در تایم‌فریم‌های مختلف… چه در بازه‌های زمانی گذشته چه
  // حال» و «رفتار این تفاوت یا جمع رو با دارایی پایه بسنج در نمودار.»
  //
  // چهل روزِ ساختگی: فاصله یکنواخت بالا می‌رود و پایه هم — تا بشود دید
  // که همبستگی و شیب واقعاً درمی‌آیند.
  const days = [];
  for (let i = 0; i < 40; i += 1) days.push(i < 30 ? 20260901 + i : 20261001 + (i - 30));
  const rowsA = days.map((date, i) => ({ date, close: 2000 + (i * 40) }));
  const rowsB = days.map((date) => ({ date, close: 600 }));
  const rowsU = days.map((date, i) => ({ date, close: 52000 + (i * 90) }));
  const series = dailyGapSeries({
    legs: BULL, seriesByIns: { c50: rowsA, c54: rowsB, ua: rowsU }, dates: days,
    basis: 'CLOSE', strategyId: 'bull-call-spread', entry: 1400, baseIns: 'ua',
  });

  check('چهل روز، چهل نقطه، و فاصله از ۱٬۴۰۰ تا ۲٬۹۶۰ می‌رود',
    series.points.length === 40 && series.points[0].current === 1400
    && series.points.at(-1).current === 2960,
    `${series.points[0]?.current} → ${series.points.at(-1)?.current}`);
  check('قیمت نماد پایه هم روی هر نقطه می‌نشیند',
    series.points[0].basePrice === 52000 && series.points.at(-1).basePrice === 55510,
    `${series.points[0]?.basePrice} → ${series.points.at(-1)?.basePrice}`);
  check('و قیمت هر پا، برای نمودارِ دو-خطی',
    series.points[0].legs.map((leg) => leg.scaled).join(',') === '2000,600',
    series.points[0].legs.map((leg) => leg.scaled).join('،'));

  // ── تایم‌فریم ───────────────────────────────────────────────────────
  check('سه تایم‌فریم هست و هرکدام برچسب و راهنما دارد',
    GAP_TIMEFRAMES.length === 3
    && GAP_TIMEFRAMES.map((row) => row.id).join(',') === 'day,week,month'
    && GAP_TIMEFRAMES.every((row) => row.label && row.hint));
  const week = resample(series, 'week');
  const month = resample(series, 'month');
  check('سطلِ هفتگی چهل روز را کم می‌کند ولی خالی نمی‌گذارد',
    week.points.length > 1 && week.points.length < series.points.length,
    `${week.points.length} سطل`);
  check('سطلِ ماهانه از هفتگی درشت‌تر است',
    month.points.length > 0 && month.points.length < week.points.length,
    `${month.points.length} در برابر ${week.points.length}`);
  check('روزانه دست‌نخورده برمی‌گردد — تجمیعی در کار نیست',
    resample(series, 'day').points.length === 40);

  // چهار عددِ سطل، نه یکی. نمونه‌برداریِ ساده جهش‌های درون‌هفته را گم
  // می‌کند و همان چیزی است که میلهٔ دامنه برای دیدنش هست.
  const bucket = week.points[0];
  check('هر سطل باز، بیشینه، کمینه و بسته دارد',
    [bucket.open, bucket.high, bucket.low, bucket.close].every(Number.isFinite)
    && bucket.high >= bucket.low && bucket.days > 0,
    `${bucket.open}/${bucket.high}/${bucket.low}/${bucket.close} · ${bucket.days} روز`);
  check('و هیچ سطلی عددی بیرون از دامنهٔ خودش نمی‌سازد',
    week.points.every((row) => row.high >= row.open && row.high >= row.close
      && row.low <= row.open && row.low <= row.close));
  check('جمعِ روزهای سطل‌ها با شمار نقاط روزانه می‌خواند — روزی گم نمی‌شود',
    week.points.reduce((sum, row) => sum + row.days, 0) === 40);

  // ── در برابر دارایی پایه ────────────────────────────────────────────
  const versus = versusBase(series);
  check('رابطه با پایه سنجیده می‌شود: همبستگی، شیب، و عرض از مبدأ',
    versus.ok && versus.count === 40
    && [versus.r, versus.slope, versus.intercept].every(Number.isFinite));
  check('در این نمونهٔ کاملاً خطی، همبستگی یک است',
    near(versus.r, 1, 1e-6) && versus.tone === 'هم‌جهت با پایه', `${versus.r}`);
  check('و شیب می‌گوید با هر ریال حرکتِ پایه، فاصله چقدر تکان خورده',
    near(versus.slope, 40 / 90, 1e-6), `${versus.slope}`);
  check('بی قیمت پایه، حکمی صادر نمی‌شود',
    !versusBase(dailyGapSeries({
      legs: BULL, seriesByIns: { c50: rowsA, c54: rowsB }, dates: days,
      basis: 'CLOSE', strategyId: 'bull-call-spread',
    })).ok);

  // شیب بی همبستگی گمراه‌کننده است و برعکس؛ هر دو با هم می‌آیند.
  const flatBase = dailyGapSeries({
    legs: BULL, dates: days, basis: 'CLOSE', strategyId: 'bull-call-spread',
    seriesByIns: { c50: rowsA, c54: rowsB, ua: days.map((date) => ({ date, close: 52000 })) },
    baseIns: 'ua',
  });
  check('پایهٔ بی‌حرکت یعنی رابطه‌ای نیست، نه شیبِ بی‌نهایت',
    !Number.isFinite(versusBase(flatBase).r) || versusBase(flatBase).tone === 'رابطهٔ ضعیف');

  // ── هم‌مقیاس ────────────────────────────────────────────────────────
  //
  // فاصله به ریالِ قرارداد است و پایه به ریالِ سهم؛ روی یک محور یکی صاف
  // دیده می‌شود. نرمال‌کردن، پرسشِ «کدام بیشتر حرکت کرد» را جواب می‌دهد.
  const indexed = indexedPair(series);
  check('هر دو سری از صد شروع می‌کنند',
    near(indexed[0].gap, 100) && near(indexed[0].base, 100));
  check('و در پایان، حرکتِ فاصله بسیار بیشتر از پایه بوده',
    indexed.at(-1).gap > 200 && indexed.at(-1).base < 110,
    `فاصله ${indexed.at(-1).gap.toFixed(1)} · پایه ${indexed.at(-1).base.toFixed(1)}`);
}


group('۲۲۰-ب. سررسیدی که پنجرهٔ روز بیرونش می‌گذارد، شمرده می‌شود');
{
  // ═══ همان شکایتِ «معلوم نیست فرصت نیست یا داده نداریم» ═══
  //
  // `generateHistoricalCombos` سررسیدها را با `minDays` و `maxDays`
  // غربال می‌کند و چیزی نمی‌گوید. پیش‌فرضِ `maxDays` صد و بیست روز است،
  // پس روی بازهٔ سه‌ماهه سررسیدهای دورتر **همه** بی‌صدا می‌افتند و
  // نتیجه صفر ردیف می‌شود — بی آنکه علتش جایی نوشته شود.
  //
  // این در اجرای مرورگر با دادهٔ ساختگی دیده شد: سررسیدِ ۱۶۴ روزه، صفر
  // ترکیب داد و هیچ پیامی نگفت چرا.
  const g = (jy, jm, jd) => { const [y, m, d] = jalaliToGregorian(jy, jm, jd); return (y * 10000) + (m * 100) + d; };
  const ENTRY = g(1405, 3, 1);
  const NEAR = g(1405, 4, 15);   // حدود ۴۵ روز
  const FAR = g(1405, 9, 25);    // حدود ۲۰۵ روز
  // شکلِ `ua` همان است که `flattenActiveContracts` می‌خواند: هر سررسید
  // یک `strikeList` دارد و هر پله، دو سمتِ `call` و `put` با شناسه.
  const ua = {
    ins: '9', name: 'اهرم',
    expiryList: [NEAR, FAR].map((endDate) => ({
      endDate, days: 0,
      strikeList: [46, 50, 54].map((k) => ({
        strike: k * 1000, size: 1000,
        call: { ins: `c${endDate}_${k}`, lVal18AFC: `ض${k}` },
        put: { ins: `p${endDate}_${k}`, lVal18AFC: `ط${k}` },
      })),
    })),
  };
  const dates = [ENTRY, g(1405, 3, 2), g(1405, 3, 3)];
  const seriesByIns = { 9: dates.map((date) => ({ date, close: 52000 })) };
  for (const endDate of [NEAR, FAR]) {
    for (const k of [46, 50, 54]) {
      // قیمت با قیمت اعمال کم می‌شود، وگرنه دو پای اسپرد هم‌قیمت‌اند و
      // `measureGap` — به‌درستی — ساختارِ بی‌ارزش را رد می‌کند و هیچ
      // ردیفی ساخته نمی‌شود.
      for (const prefix of ['c', 'p']) {
        const close = prefix === 'c' ? 2600 - ((k - 46) * 300) : 800 + ((k - 46) * 300);
        seriesByIns[`${prefix}${endDate}_${k}`] = dates.map((date) => ({ date, close }));
      }
    }
  }

  const run = async (maxDays) => buildRadarHistory({
    ua, defs: [byId('bull-call-spread')], seriesByIns,
    range: { from: dates[0], to: dates.at(-1) }, basis: 'CLOSE',
    settings: { blockedExpiries: '', minDays: 1, maxDays, wingsEqualWidth: true },
  });

  const tight = await run(120);
  check('با پنجرهٔ ۱۲۰ روزه، سررسیدِ دور می‌افتد و **شمرده** می‌شود',
    tight.expiryWindow.total === 2 && tight.expiryWindow.dropped === 1
    && tight.expiryWindow.kept === 1,
    JSON.stringify(tight.expiryWindow));
  check('و دورترین فاصله گفته می‌شود، تا کاربر بداند عدد را تا کجا ببرد',
    tight.expiryWindow.farthest > 120 && tight.expiryWindow.maxDays === 120,
    `${tight.expiryWindow.farthest} روز`);

  const wide = await run(400);
  check('با پنجرهٔ بازتر، هیچ سررسیدی نمی‌افتد',
    wide.expiryWindow.dropped === 0 && wide.expiryWindow.kept === 2);
  check('و ترکیبِ بیشتری ساخته می‌شود — یعنی واقعاً پنجره می‌بُرید',
    wide.rows.length > tight.rows.length,
    `${tight.rows.length} → ${wide.rows.length}`);
}
