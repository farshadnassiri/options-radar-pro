// ۹۳. لایهٔ مشترک رصد — یک ورودی برای هر سه تایم‌فریم
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { bsGreeks, bsPrice, impliedVol } from '../../core/bs.mjs';
import { histVolPct, histVolSeries, resolveHistVol } from '../../core/hist-vol.mjs';
import { ivParams, meanIvPct } from '../../core/leg-iv.mjs';
import {
  annotateTrack, monitorCoverage, monitorExtremes, monitorSeries, monitorSnapshot, monitorStance,
} from '../../core/monitor.mjs';
import { positionGreeks } from '../../core/payoff.mjs';


// ═══════════════════ ۹۳. لایهٔ مشترک رصد یونانی و تلاطم ═══════════════════
group('۹۳. لایهٔ مشترک رصد — یک ورودی برای هر سه تایم‌فریم');
{
  const P93 = ivParams({ rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5, dayCountYear: 365,
    tradingDaysYr: 240, hvWindowDays: 30, hvManualPct: 0 });
  const legs93 = [
    { kind: 'call', strike: 10000, expiry: 20260401, side: 'buy', ratio: 1, size: 1000, name: 'کال ۱۰' },
    { kind: 'call', strike: 11000, expiry: 20260401, side: 'sell', ratio: 1, size: 1000, name: 'کال ۱۱' },
  ];
  // قیمتی که خودِ بلک‌شولز با تلاطم معلوم ساخته؛ پس تلاطم برگشتی باید همان باشد
  const spot93 = 10500, days93 = 90, T93 = days93 / 365;
  const px = (leg, sigma) => bsPrice(leg.kind, spot93, leg.strike, T93, 0.3, 0, sigma);
  const prices93 = [px(legs93[0], 0.55), px(legs93[1], 0.65)];

  const snap = monitorSnapshot(legs93, { spot: spot93, prices: prices93, date: 20260101 }, P93, { hvPct: 42 });
  check('عکس لحظه، تلاطم ضمنی هر پا را جدا درمی‌آورد',
    near(snap.ivPct[0], 55, 1e-3) && near(snap.ivPct[1], 65, 1e-3),
    `${snap.ivPct[0].toFixed(2)} و ${snap.ivPct[1].toFixed(2)}`);
  check('میانگین ضمنی موقعیت، میانگین سادهٔ همان دوتاست',
    near(snap.meanIvPct, 60, 1e-3), `${snap.meanIvPct.toFixed(3)}`);
  check('فاصلهٔ ضمنی از تاریخی تفریق است',
    near(snap.ivHvSpreadPp, snap.meanIvPct - 42, 1e-9));
  // سهم هر پا، جمعش دقیقاً یونانی موقعیت است — همان ادعایی که جدول تفکیک می‌کند
  check('جمع سهم پاها دقیقاً یونانی موقعیت است',
    ['delta', 'gamma', 'vega', 'theta', 'rho'].every((key) =>
      near(snap.share.reduce((sum, part) => sum + part[key], 0), snap.greeks[key], 1e-9)),
    `دلتا ${snap.greeks.delta.toFixed(3)}`);

  // ——— جمعِ ناقص، جمع نیست ———
  //
  // پیش از این `positionGreeks` از صفر شروع می‌کرد و موقعیتی که هیچ پایش
  // تلاطم نداده بود «دلتا ۰» می‌گرفت — عددی که «خنثای جهت» خوانده می‌شود
  // در حالی که حرفش «نمی‌دانیم» است. قاعده در خودِ `positionGreeks` نشسته
  // نه در لایهٔ رصد، وگرنه آزمایشگاه که از این لایه رد نمی‌شود همان موقعیت
  // را با عدد دیگری نشان می‌داد.
  const blind = monitorSnapshot(legs93, { spot: spot93, prices: [NaN, NaN], date: 20260101 }, P93, {});
  check('موقعیت بی‌تلاطم، یونانی صفر نمی‌گیرد — خالی می‌ماند',
    blind.incomplete && ['delta', 'gamma', 'vega', 'theta', 'rho'].every((key) => Number.isNaN(blind.greeks[key])),
    `دلتا ${blind.greeks.delta}`);
  // همین قاعده مستقیم روی `positionGreeks` هم سنجیده می‌شود، چون مسیرهایی
  // (آزمایشگاه، قرارداد ستونی) از لایهٔ رصد رد نمی‌شوند.
  const rawSum = positionGreeks(
    [{ kind: 'call', side: 'buy', ratio: 1, size: 1000, strike: 10000 },
      { kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 11000 }],
    [{ delta: 0.6, gamma: 1e-6, vega: 12, theta: -3, rho: 4 }, null],
  );
  check('خودِ positionGreeks هم جمعِ ناقص را عدد نمی‌کند',
    rawSum.incomplete && ['delta', 'gamma', 'vega', 'theta', 'rho', 'deltaShares']
      .every((key) => Number.isNaN(rawSum[key])), `دلتا ${rawSum.delta}`);
  const half = monitorSnapshot(legs93, { spot: spot93, prices: [prices93[0], NaN], date: 20260101 }, P93, {});
  check('پای درآمده سر جایش می‌ماند، ولی جمعِ ناقص عدد نمی‌دهد',
    half.incomplete && Number.isNaN(half.greeks.delta) && Number.isFinite(half.byLeg[0].delta)
    && Number.isFinite(half.ivPct[0]) && Number.isNaN(half.ivPct[1]));

  // ——— یک ورودی، سه شکل داده ———
  const rowsDaily = [{ date: 20260101, dateLabel: '۱۴۰۴/۱۰/۱۱', baseClose: spot93, netPnl: 1000,
    perLeg: [{ exitPrice: prices93[0] }, { exitPrice: prices93[1] }] }];
  const rowsIntraday = [{ second: 34200, timeLabel: '09:30:00', basePrice: spot93, netPnl: 900,
    perLeg: [{ exitPrice: prices93[0] }, { exitPrice: prices93[1] }] }];
  const rowsBucket = [{ date: 20260101, startSecond: 34200, timeLabel: '09:30:00', basePrice: spot93, closePnl: 800,
    perLeg: [{ price: prices93[0] }, { price: prices93[1] }] }];
  annotateTrack(rowsDaily, { legs: legs93, shape: 'daily', hvPct: 42 }, P93);
  annotateTrack(rowsIntraday, { legs: legs93, shape: 'intraday', date: 20260101, hvPct: 42 }, P93);
  annotateTrack(rowsBucket, { legs: legs93, shape: 'bucket', hvPct: 42 }, P93);
  check('هر سه شکل داده به یک عدد می‌رسند — چون یک بدنه دارند',
    near(rowsDaily[0].greeks.delta, rowsIntraday[0].greeks.delta, 1e-9)
    && near(rowsDaily[0].greeks.delta, rowsBucket[0].greeks.delta, 1e-9)
    && near(rowsDaily[0].meanIvPct, rowsBucket[0].meanIvPct, 1e-9),
    `${rowsDaily[0].greeks.delta.toFixed(4)}`);
  check('مهر روی خود ردیف و روی هر پا می‌نشیند',
    Number.isFinite(rowsDaily[0].perLeg[0].ivPct) && !!rowsDaily[0].perLeg[0].greeks
    && rowsDaily[0].hvPct === 42);
  check('سطل تایم‌فریم هم ستون سود می‌گیرد، از closePnl',
    monitorSeries(rowsBucket)[0].netPnl === 800);

  // ——— سری نمودار ———
  const series93 = monitorSeries(rowsDaily, { legCount: 2 });
  check('سری نمودار، هم ستون کل دارد هم ستون هر پا و هم تلاطم‌ها',
    Number.isFinite(series93[0].delta) && Number.isFinite(series93[0].delta1)
    && Number.isFinite(series93[0].iv2) && series93[0].hv === 42
    && Number.isFinite(series93[0].ivHv));
  check('ستون یونانی پا وزن‌نخورده است، مثل قرارداد ستونی',
    near(series93[0].delta1, rowsDaily[0].perLeg[0].greeks.delta, 1e-12));

  // ——— پوشش و نقاط عطف ———
  const mixed93 = [
    { date: 20260101, dateLabel: 'الف', baseClose: spot93, perLeg: [{ exitPrice: prices93[0] }, { exitPrice: prices93[1] }] },
    { date: 20260102, dateLabel: 'ب', baseClose: spot93, perLeg: [{ exitPrice: prices93[0] }, { exitPrice: NaN }] },
  ];
  annotateTrack(mixed93, { legs: legs93, shape: 'daily', hvPct: 42 }, P93);
  const cov93 = monitorCoverage(mixed93);
  check('پوشش می‌گوید از چند نقطه یونانیِ کامل درآمد',
    cov93.total === 2 && cov93.complete === 1 && cov93.partial === 1 && near(cov93.coveragePct, 50, 1e-9),
    `${cov93.coveragePct}٪`);
  const ex93 = monitorExtremes(mixed93);
  check('نقاط عطف می‌گوید هر حساسیت کجا به انتهای دامنه‌اش رسید',
    ex93.length === 6 && ex93[0].key === 'delta' && typeof ex93[0].maxAt === 'string' && ex93[0].maxAt !== '');

  // ——— جهت‌گیری، ترجمهٔ همان عددها ———
  const stance93 = monitorStance({ delta: 1200, gamma: -3, vega: -900, theta: 400 });
  check('جهت‌گیری، عدد را به جمله ترجمه می‌کند و چیز تازه‌ای نمی‌سازد',
    stance93.delta === 'صعودی' && stance93.gamma === 'دشمن حرکت بزرگ'
    && stance93.vega === 'فروشندهٔ تلاطم' && stance93.theta === 'زمان به سودت کار می‌کند');
  check('دلتای نزدیک صفر، خنثای جهت خوانده می‌شود نه صعودی',
    monitorStance({ delta: 0.01 }).delta === 'خنثای جهت');

  // ——— تلاطم تاریخی ———
  const closes93 = Array.from({ length: 120 }, (_, i) => 1000 * Math.exp(((i % 2) ? 1 : -1) * 0.015));
  const hvOk = histVolPct(closes93, { tradingDaysYear: 240 });
  check('تلاطم تاریخی با داده کافی، عدد و منبعش را می‌گوید',
    hvOk.enough && hvOk.source === 'series' && hvOk.pct > 0, `${hvOk.pct.toFixed(2)}٪`);
  const hvShort = histVolPct(closes93.slice(0, 10), { tradingDaysYear: 240 });
  check('داده کم، عدد نمی‌سازد و می‌گوید چند تا لازم بود',
    !hvShort.enough && Number.isNaN(hvShort.pct) && hvShort.needed === 22 && hvShort.why.includes('۲۲'),
    hvShort.why);
  const hvManual = resolveHistVol(closes93.slice(0, 10), { tradingDaysYear: 240, manualPct: 37 });
  check('اعلام دستی جای دادهٔ نبوده می‌نشیند و برچسبش می‌ماند',
    hvManual.pct === 37 && hvManual.source === 'manual');
  const hvIgnored = resolveHistVol(closes93, { tradingDaysYear: 240, manualPct: 37 });
  check('اعلام دستی روی دادهٔ واقعی نمی‌نشیند و همین گفته می‌شود',
    hvIgnored.source === 'series' && hvIgnored.manualIgnored === true);
  const rolling93 = histVolSeries(closes93, { tradingDaysYear: 240, window: 30 });
  check('سری غلتان، تا پنجره پر نشود عدد نمی‌سازد',
    Number.isNaN(rolling93[10]) && Number.isFinite(rolling93.at(-1)), `${rolling93.at(-1).toFixed(2)}`);
  check('پنجرهٔ کوتاه‌تر از کف، به کف کشیده می‌شود نه اینکه بشکند',
    histVolSeries(closes93, { tradingDaysYear: 240, window: 5 }).filter(Number.isFinite).length > 0);

  // ——— تب رصد، فقط از همین لایه می‌خواند ———
  const gwSrc = readSrc('../ui/tabs/greeks-watch.mjs');
  check('تب رصد یونانی، محاسبه‌ای از خودش ندارد و از لایهٔ مشترک می‌خواند',
    gwSrc.includes("from '/core/monitor.mjs'") && gwSrc.includes('annotateTrack(')
    && !gwSrc.includes('bsGreeks(') && !gwSrc.includes('impliedVol('));
  check('تب رصد هر سه تایم‌فریم را دارد',
    ['daily', 'bucket', 'intraday'].every((key) => gwSrc.includes(`['${key}',`)));
  check('تب رصد در فهرست تب‌ها ثبت شده است',
    readSrc('../ui/app.mjs').includes("id: 'greeks-watch'"));
  // پنجرهٔ غلتان باید روی کل سری پایه بسته شود، نه روی روزهای همین موقعیت:
  // یک موقعیت ده‌روزه هیچ‌وقت پنجرهٔ شصت‌روزه را پر نمی‌کند.
  check('پنجرهٔ تلاطم تاریخی روی کل سری پایه بسته می‌شود، نه روی روزهای موقعیت',
    gwSrc.includes('const baseSeries = seriesByIns[String(ua.ins)] || [];')
    && gwSrc.includes('histVolSeries(baseSeries.map('));
}
