// ۲۶۶. تایم‌فریم خروجی دیتا و ستون‌های مشتق
//
// گزارش صاحب پروژه: «فایل‌های اکسل سنگین و پرحجمی می‌سازد». دو اهرم اینجا
// قفل می‌شود — تجمیع زمانی، و خاموشیِ ستون‌هایی که هیچ واقعیتِ تازه‌ای
// ندارند. هر دو باید حجم را کم کنند **بی اینکه چیزی بسازند یا بیندازند**.

import { check, group, readSrc } from '../harness.mjs';
import {
  DATA_EXPORT_FRAMES, dataExportCandles, dataExportFrame, dataExportPairs,
  dataExportTradeRows, discoverDataExportInstruments,
} from '../../core/data-export.mjs';
import { tradeTimeLabel } from '../../core/backtest.mjs';

// زمانِ بالادست `HHMMSS` است، نه ثانیه. ورودیِ آزمایشی باید هم‌شکلِ پاسخ
// واقعی باشد، وگرنه قاعده‌ای که سبز می‌شود روی داده‌ای برقرار است که هرگز
// نمی‌رسد — و همین یک بار همین‌جا گرفته شد.
const at = (second) => (Math.floor(second / 3600) * 10000)
  + (Math.floor((second % 3600) / 60) * 100) + (second % 60);
import { buildDataExportSheets } from '../../ui/data-export-workbook.mjs';
import { buildXlsx } from '../../ui/xlsx.mjs';

group('۲۶۶. تایم‌فریم خروجی دیتا');
{
  const roster = [{
    uaInsCode: 'BASE', lval30_UA: 'اهرم', activeFrom: 20260901, activeTo: 20260910,
    expiryGregorian: 20260910, strikePrice: 20000, contractSize: 1000,
    insCode_C: 'CALL1', lVal18AFC_C: 'ضهرم۱',
  }];
  const instruments = discoverDataExportInstruments(roster, ['BASE']);
  const call = instruments.find((item) => item.kind === 'call');
  const pairs = dataExportPairs(instruments, [20260901]);

  // یک روزِ ساختگی ولی هم‌شکلِ پاسخ واقعی: ۹:۰۰:۰۰ تا ۹:۰۹:۵۰، هر ده ثانیه.
  const ticks = [];
  for (let step = 0; step < 60; step += 1) {
    ticks.push({
      time: at((9 * 3600) + (step * 10)), sequence: step + 1,
      price: 1000 + step, quantity: 2, canceled: false, canceledKnown: true,
    });
  }
  const items = { [`20260901:CALL1`]: { rows: ticks, source: 'history' } };
  const rows = dataExportTradeRows(call, pairs, items);
  check('ریزمعامله‌های ساختگی خوانده شدند', rows.length === 60);

  // ── قاعدهٔ اول: تجمیع، ردیف کم می‌کند و هیچ عددی نمی‌سازد.
  const oneMin = dataExportCandles(rows, 60);
  check('شمع یک‌دقیقه‌ای ده ردیف از شصت ریزمعامله می‌سازد', oneMin.length === 10);
  check('هر شمع شش ریزمعامله دارد', oneMin.every((bar) => bar.trades === 6));
  check('باز و بستهٔ شمع اول، اولین و آخرین قیمتِ همان دقیقه است',
    oneMin[0].open === 1000 && oneMin[0].close === 1005);
  check('بیشترین و کمترین از قیمت‌های واقعی همان سطل می‌آید',
    oneMin[0].low === 1000 && oneMin[0].high === 1005);
  check('حجم و ارزش، جمعِ همان شش معامله است',
    oneMin[0].volume === 12
      && oneMin[0].value === [1000, 1001, 1002, 1003, 1004, 1005].reduce((sum, price) => sum + (price * 2), 0));
  check('مبدأ سطل ۹:۰۰ است و برچسبش دوباره HHMMSS',
    oneMin[0].second === 9 * 3600 && oneMin[1].second === (9 * 3600) + 60
      && tradeTimeLabel(oneMin[0].time) === '09:00:00' && tradeTimeLabel(oneMin[1].time) === '09:01:00');
  check('جمعِ حجمِ شمع‌ها با جمعِ حجمِ ریزمعامله‌ها یکی است',
    oneMin.reduce((sum, bar) => sum + bar.volume, 0) === rows.reduce((sum, row) => sum + row.quantity, 0));

  const fiveMin = dataExportCandles(rows, 300);
  check('شمع پنج‌دقیقه‌ای دو ردیف می‌دهد', fiveMin.length === 2);
  check('و بستهٔ آخرش همان آخرین قیمتِ روز است', fiveMin[1].close === 1059);

  // ── قاعدهٔ دوم: سطلی که معامله ندارد، ردیف ندارد. جای خالی صادق است.
  const gapped = dataExportCandles(rows.filter((row) => row.time < at((9 * 3600) + 60) || row.time >= at((9 * 3600) + 180)), 60);
  check('دقیقهٔ بی‌معامله ردیف نمی‌گیرد', gapped.length === 8);
  check('و هیچ قیمتی به‌جایش درون‌یابی نمی‌شود',
    !gapped.some((bar) => bar.second === (9 * 3600) + 60 || bar.second === (9 * 3600) + 120));

  // ── قاعدهٔ سوم: معاملهٔ باطل در قیمت نمی‌نشیند ولی گم هم نمی‌شود.
  const withVoid = dataExportCandles([
    { date: 20260901, time: at(9 * 3600), price: 500, quantity: 3, canceled: true, source: 'history' },
    { date: 20260901, time: at((9 * 3600) + 5), price: 700, quantity: 4, canceled: false, source: 'history' },
    { date: 20260901, time: at((9 * 3600) + 60), price: 900, quantity: 5, canceled: true, source: 'history' },
  ], 60);
  check('قیمتِ باطل در باز/بیشترین/کمترین/بسته نمی‌نشیند',
    withVoid[0].open === 700 && withVoid[0].high === 700 && withVoid[0].low === 700 && withVoid[0].close === 700);
  check('حجمِ باطل هم جمع نمی‌شود', withVoid[0].volume === 4 && withVoid[0].trades === 1);
  check('ولی شمرده می‌شود', withVoid[0].canceled === 1);
  check('سطلی که فقط معاملهٔ باطل داشته حذف نمی‌شود', withVoid.length === 2 && withVoid[1].canceled === 1);
  check('و خانه‌های قیمتش خالی می‌ماند، نه صفر',
    !Number.isFinite(withVoid[1].open) && !Number.isFinite(withVoid[1].close) && withVoid[1].volume === 0);

  // ── فهرست تایم‌فریم‌ها و پیش‌فرضش.
  check('فهرست تایم‌فریم‌ها از ریزمعامله تا ۶۰ دقیقه است',
    DATA_EXPORT_FRAMES.map((frame) => frame.id).join(',') === 'tick,m1,m5,m15,m30,m60');
  check('پیش‌فرض و مقدارِ ناشناخته هر دو ریزمعاملهٔ خام‌اند',
    dataExportFrame().id === 'tick' && dataExportFrame('m7').id === 'tick' && dataExportFrame('tick').seconds === 0);
  check('و m15 یعنی ۹۰۰ ثانیه', dataExportFrame('m15').seconds === 900);
}

group('۲۶۶. برگ خروجی در تایم‌فریم و ستون‌های مشتق');
{
  const roster = [{
    uaInsCode: 'BASE', lval30_UA: 'اهرم', activeFrom: 20260901, activeTo: 20260910,
    expiryGregorian: 20260910, strikePrice: 20000, contractSize: 1000,
    insCode_C: 'CALL1', lVal18AFC_C: 'ضهرم۱',
  }];
  const instruments = discoverDataExportInstruments(roster, ['BASE']);
  const pairs = dataExportPairs(instruments, [20260901]);
  const tick = (step) => ({
    time: at((9 * 3600) + (step * 10)), sequence: step + 1,
    price: 1000 + step, quantity: 2, canceled: false, canceledKnown: true,
  });
  const items = {
    '20260901:CALL1': { rows: Array.from({ length: 60 }, (_, step) => tick(step)), source: 'history' },
    '20260901:BASE': { rows: Array.from({ length: 60 }, (_, step) => tick(step)), source: 'history' },
  };
  const base = { instruments, pairs, items, range: { from: 20260901, to: 20260901 }, complete: true };

  const rawSheets = buildDataExportSheets({ ...base });
  const barSheets = buildDataExportSheets({ ...base, frame: 'm5' });
  const callRaw = rawSheets.find((part) => part.name === 'ضهرم۱');
  const callBars = barSheets.find((part) => part.name === 'ضهرم۱');
  check('برگ خام شصت ردیف دارد و برگ پنج‌دقیقه‌ای دو ردیف',
    callRaw.rows.length === 60 && callBars.rows.length === 2);
  // ادعا با **نامِ** سرستون بسته می‌شود نه با شماره: افزودنِ یک ستون
  // نباید ادعایی را بشکند که اصلاً دربارهٔ آن ستون نیست.
  const col = (part, name) => part.headers.indexOf(name);
  const ohlc = ['باز', 'بیشترین', 'کمترین', 'بسته'].map((name) => col(callBars, name));
  check('سرستون شمع، OHLC پشت سر هم است',
    ohlc.every((at) => at > 0) && ohlc.every((at, i) => i === 0 || at === ohlc[i - 1] + 1));

  // ── ستون‌های مشتق: پیش‌فرض خاموش، و هیچ‌کدام واقعیتِ تازه ندارند.
  check('ستون‌های مشتق پیش‌فرض خاموش‌اند',
    !callRaw.headers.includes('ارزش خام (ریال)') && !callRaw.headers.includes('اندازه قرارداد'));
  const derived = buildDataExportSheets({ ...base, derived: true }).find((part) => part.name === 'ضهرم۱');
  check('با روشن‌کردنشان هر سه برمی‌گردند',
    derived.headers.includes('ارزش خام (ریال)')
      && derived.headers.includes('اندازه قرارداد')
      && derived.headers.includes('ارزش با اندازه قرارداد (ریال)'));
  // `at` بالای همین دسته سازندهٔ HHMMSS است؛ این یکی نامِ خودش را دارد.
  const cell = (name) => derived.headers.indexOf(name);
  const first = derived.rows[0];
  check('و عددشان دقیقاً حاصل‌ضرب همان ستون‌های موجود است',
    first[cell('ارزش خام (ریال)')] === first[cell('قیمت (ریال)')] * first[cell('حجم')]
      && first[cell('ارزش با اندازه قرارداد (ریال)')]
        === first[cell('ارزش خام (ریال)')] * first[cell('اندازه قرارداد')]);

  // ═══ تاریخ شمسی کنار میلادی ═══
  //
  // خواستهٔ صریح صاحب پروژه. میلادی حذف نمی‌شود — کلیدِ تطبیق با هر منبع
  // دیگری همان است — و شمسی کنارش می‌آید، در برگ خام و شمع و پوشش.
  for (const [label, part] of [['خام', callRaw], ['شمع', callBars]]) {
    const g = col(part, 'تاریخ میلادی'), j = col(part, 'تاریخ شمسی');
    check(`برگ ${label} هر دو تاریخ را دارد و شمسی درست کنار میلادی است`,
      g === 0 && j === 1);
    check(`و تاریخ شمسیِ برگ ${label} برابرِ همان روز میلادی است`,
      part.rows.every((row) => row[g] === 20260901 && row[j] === '1405/06/10'));
  }
  const cover = rawSheets.find((part) => part.name === 'پوشش دریافت');
  check('برگ پوشش هم تاریخ شمسی دارد',
    col(cover, 'تاریخ شمسی') === col(cover, 'تاریخ میلادی') + 1
      && cover.rows.every((row) => row[col(cover, 'تاریخ شمسی')] === '1405/06/10'));
  const guideRange = buildDataExportSheets({ ...base }).find((part) => part.name === 'راهنما');
  const fromText = String((guideRange.rows.find((row) => row[0] === 'از تاریخ') || [])[1] || '');
  check('راهنما هم بازه را با هر دو تقویم می‌گوید',
    fromText.includes('20260901') && fromText.includes('1405/06/10'));
  // تاریخِ نادرست خانهٔ خالی می‌گیرد، نه متنِ ساختگی.
  const bad = buildDataExportSheets({
    instruments, pairs: [{ ins: 'CALL1', date: 0, key: '0:CALL1' }],
    items: { '0:CALL1': { rows: [], source: 'history' } }, range: {},
  }).find((part) => part.name === 'پوشش دریافت');
  check('تاریخِ نادرست خانهٔ شمسیِ خالی می‌گیرد، نه «—»',
    bad.rows[0][col(bad, 'تاریخ شمسی')] === '');

  // اندازهٔ قرارداد باید حتی با ستون‌های خاموش داخل فایل بماند، وگرنه
  // «هیچ عددی از دست نمی‌رود» یک ادعای ناراست است.
  const coverage = rawSheets.find((part) => part.name === 'پوشش دریافت');
  const sizeAt = coverage.headers.indexOf('اندازه قرارداد');
  check('اندازهٔ قرارداد در برگ پوشش ستون دارد', sizeAt > 0);
  check('و برای قرارداد عددِ واقعی‌اش را می‌گوید',
    coverage.rows.some((row) => row[1] === 'ضهرم۱' && row[sizeAt] === 1000));
  check('و برای خودِ پایه یک است',
    coverage.rows.some((row) => row[1] === 'اهرم' && row[sizeAt] === 1));

  // ── خودِ فایل باید واقعاً کوچک‌تر شود؛ ادعای حجم بی‌سنجش نمی‌ماند.
  const rawBytes = await buildXlsx(rawSheets);
  const barBytes = await buildXlsx(barSheets);
  check('فایل تایم‌فریم‌دار از فایل خام کوچک‌تر است', barBytes.length < rawBytes.length);
  check('هر دو فایل سالم ساخته شدند و مهر zip دارند',
    rawBytes[0] === 0x50 && rawBytes[1] === 0x4B && barBytes[0] === 0x50 && barBytes[1] === 0x4B);

  // ── راهنما باید هر دو انتخاب را ثبت کند.
  const guide = barSheets.find((part) => part.name === 'راهنما');
  const valueOf = (key) => (guide.rows.find((row) => row[0] === key) || [])[1] || '';
  check('راهنما تایم‌فریم را می‌نویسد', valueOf('تایم‌فریم').includes('شمع ۵ دقیقه'));
  check('و می‌گوید سطل بی‌معامله ردیف ندارد', valueOf('تایم‌فریم').includes('درون‌یابی'));
  check('و وضعیت ستون‌های مشتق را هم می‌نویسد', valueOf('ستون‌های مشتق').includes('خاموش'));

  // ── نام فایل باید دو تفکیک را از هم جدا کند.
  const { dataExportFilename } = await import('../../ui/data-export-workbook.mjs');
  check('نام فایل تایم‌فریم را همراه دارد',
    dataExportFilename({ from: 20260901, to: 20260901 }, 'm5').endsWith('-m5')
      && dataExportFilename({ from: 20260901, to: 20260901 }).endsWith('-tick'));
}

group('۲۶۶. تب خروجی دیتا');
{
  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('تب گزینهٔ تایم‌فریم دارد', tab.includes("id=\"de-frame\"") && tab.includes('DATA_EXPORT_FRAMES.map'));
  check('و کلید ستون‌های مشتق', tab.includes("id=\"de-derived\""));
  // عوض‌کردن تایم‌فریم نباید دریافت را باطل کند: شیت‌ها موقع خروجی ساخته
  // می‌شوند، نه موقع دریافت.
  check('شیت‌ها موقع خروجی ساخته می‌شوند، نه موقع دریافت',
    tab.includes('const sheets = buildDataExportSheets({ ...prepared, frame, derived })'));
  check('و تغییر تایم‌فریم دادهٔ گرفته‌شده را باطل نمی‌کند',
    !/de-frame'\)\.addEventListener\('change', \(\) => \{\s*invalidatePrepared/.test(tab));
  check('جدول نتیجه ستون ردیف خروجی دارد', tab.includes('<th>ردیف خروجی</th>'));
  check('دکمهٔ آزمون یک ابزار/روز برداشته شد', !tab.includes('de-probe'));
}
