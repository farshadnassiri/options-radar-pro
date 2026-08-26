// ۹۶. سنجش در یک لحظهٔ درون‌روز
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import {
  MARK_MOMENTS, applyIntradayMark, markAt, markNote, marksAt,
} from '../../core/intraday-mark.mjs';


// ═══════════════════ ۹۶. سنجش در یک لحظهٔ درون‌روز ═══════════════════
//
// خواسته: «قسمت آزمون همه استراتژی‌ها قابلیت بررسی از مبدأ تا قیمت‌های
// میان‌روزی در تایم بازار را داشته باشد». حالت «تا همین لحظه» از قبل بود
// ولی یک ردیفِ روزانه از عکس تابلو می‌ساخت. آنچه نبود این بود: «اگر ساعت
// ده و نیمِ همان روز می‌بستم چه می‌شد؟»
group('۹۶. سنجش در یک لحظهٔ درون‌روز');
{
  const tape96 = {
    // سه معامله: ۹:۳۰، ۱۰:۱۵، ۱۱:۴۵
    A: [
      { time: 93000, price: 100, quantity: 10, canceled: false },
      { time: 101500, price: 130, quantity: 20, canceled: false },
      { time: 114500, price: 190, quantity: 5, canceled: false },
    ],
    // فقط بعدازظهر معامله شده
    B: [{ time: 120000, price: 55, quantity: 7, canceled: false }],
    // معاملهٔ باطل‌شده و معاملهٔ پیش‌گشایش، هیچ‌کدام نباید بنشینند
    C: [
      { time: 84000, price: 900, quantity: 1, canceled: false },
      { time: 100000, price: 800, quantity: 3, canceled: true },
    ],
  };
  const at1030 = markAt(tape96.A, 10 * 3600 + 1800);
  check('قیمت لحظه، آخرین معاملهٔ پیش از همان ثانیه است',
    at1030.price === 130 && at1030.timeLabel === '10:15:00', `${at1030.price} در ${at1030.timeLabel}`);
  check('حجم و ارزش تا همان لحظه شمرده می‌شوند، نه تا پایان روز',
    at1030.volume === 30 && at1030.trades === 2 && at1030.value === 100 * 10 + 130 * 20,
    `${at1030.volume} سهم در ${at1030.trades} معامله`);
  check('معاملهٔ بعد از آن لحظه وارد نمی‌شود',
    markAt(tape96.A, 12 * 3600 + 1800).price === 190);
  check('ابزار بی‌معامله تا آن لحظه، اصلاً قیمت نمی‌گیرد',
    markAt(tape96.B, 10 * 3600) === null);
  check('پیش‌گشایش و معاملهٔ باطل‌شده هیچ‌کدام قیمت نمی‌سازند',
    markAt(tape96.C, 12 * 3600 + 1800) === null);

  const marks96 = marksAt(tape96, 10 * 3600 + 1800);
  check('نگاشت لحظه فقط ابزارهای دارای معامله را دارد',
    Object.keys(marks96).join(',') === 'A', Object.keys(marks96).join(','));

  // تاریخ‌ها به همان شکلی‌اند که خوراک روزانه می‌دهد: میلادی فشرده.
  const series96 = {
    A: [{ date: 20260521, close: 111, last: 111, first: 90, low: 88, high: 120, vol: 900, trades: 40, value: 99900 },
      { date: 20260522, close: 222, last: 222, first: 200, low: 190, high: 230, vol: 800, trades: 30, value: 177600 }],
    B: [{ date: 20260521, close: 50, last: 50, vol: 5, trades: 1, value: 250 },
      { date: 20260522, close: 60, last: 60, vol: 6, trades: 1, value: 360 }],
  };
  const applied = applyIntradayMark(series96, marks96, { date: 20260522, second: 10 * 3600 + 1800 });
  const rowA = applied.series.A.find((row) => row.date === 20260522);
  check('ردیف روز سنجش قیمت لحظه‌ای می‌گیرد و برچسبش می‌ماند',
    rowA.close === 130 && rowA.last === 130 && rowA.intradayMark === true && rowA.markTimeLabel === '10:15:00');
  // «کمترین/بیشترین/اولین» روز در ساعت ده و نیم هنوز کامل نشده‌اند؛ ماندنشان
  // یعنی مبنای «کمترین قیمت روز» عددی می‌داد که هنوز وجود نداشت.
  check('دامنهٔ روز صفر می‌شود، چون در آن لحظه هنوز کامل نشده',
    rowA.first === 0 && rowA.low === 0 && rowA.high === 0);
  check('روز قبلی دست‌نخورده می‌ماند',
    applied.series.A.find((row) => row.date === 20260521).close === 111);
  // قاعدهٔ ۲-۴ در سفت‌ترین شکلش: قیمت پایانی روز یا قیمت دیروز جایش نمی‌نشیند
  check('ابزار بی‌قیمت در آن لحظه، ردیف آن روز را از دست می‌دهد نه اینکه قیمت کهنه بگیرد',
    !applied.series.B.some((row) => row.date === 20260522) && applied.dropped === 1,
    `افتاده: ${applied.dropped}`);
  check('شمارش مهر و افت گزارش می‌شود',
    applied.marked === 1 && applied.date === 20260522);
  check('بی‌روزِ معتبر، ورودی دست‌نخورده برمی‌گردد',
    applyIntradayMark(series96, marks96, { date: 0 }).series === series96);

  const note96 = markNote(applied, { label: '۱۰:۳۰', total: 2 });
  check('جمله می‌گوید چند ابزار قیمت گرفتند و چند تا افتادند، با رقم فارسی',
    note96.includes('۱ ابزار قیمت ساعت ۱۰:۳۰') && note96.includes('۱ ابزار ردیف آن روز را از دست دادند')
    && !/[0-9]/.test(note96), note96);
  check('بی‌هیچ معامله، جمله ادعای آماده‌شدن نمی‌کند',
    markNote({ marked: 0 }, { label: '۰۹:۳۰', total: 5 }).includes('ممکن نیست'));

  const pbSrc = readSrc('../ui/tabs/portfolio-backtest.mjs');
  check('آزمون همه استراتژی‌ها انتخابگر لحظهٔ سنجش دارد',
    pbSrc.includes("id=\"pb-mark\"") && pbSrc.includes('MARK_MOMENTS.map(') && pbSrc.includes('applyIntradayMark('));
  check('سنجش پایان روز هیچ درخواست تازه‌ای نمی‌خورد',
    /if \(!Number\.isFinite\(second\) \|\| !second\) \{[\s\S]{0,160}return seriesByIns;/.test(pbSrc));
  // رتبه‌بندی و جزئیات باید از یک سری بخوانند، وگرنه یکی ساعت ده و نیم را
  // می‌گوید و دیگری پایان روز، و هیچ‌کدام غلط به نظر نمی‌رسد.
  check('جزئیات و حساسیت از همان سری‌ای می‌خوانند که رتبه‌بندی با آن ساخته شد',
    pbSrc.includes('runSeriesByIns = runSeries;')
    && pbSrc.includes('seriesByIns: Object.keys(runSeriesByIns).length ? runSeriesByIns : seriesByIns'));
  check('آزمون همه استراتژی‌ها یونانی و تلاطم همان بازپخش را نشان می‌دهد',
    pbSrc.includes('annotateReplay(replay,') && pbSrc.includes("id=\"pb-greeks-kpis\""));
  check('از آزمون همه استراتژی‌ها می‌شود به تب رصد یونانی رفت',
    pbSrc.includes("to: 'greeks-watch' }, 'greeks-watch')"));
}
