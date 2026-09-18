// ۲۶۸. سه قاعده‌ای که ممیزیِ «خروجی دیتا» خواست
//
// ممیزی صاحب پروژه روی بازهٔ ۲۰۲۴/۰۷/۲۲ تا ۲۰۲۵/۰۱/۲۰ سه ایراد داد، و هر
// سه از یک جنس‌اند: چیزی که **نمی‌دانیم** به‌جای یک واقعیت نوشته می‌شد.
//
//   ۱. دفتر ناقص بود (۱۳۰ روزِ اسکن‌نشده) ولی خروجی گرفته شد.
//   ۲. قراردادِ بی‌تاریخِ عرضه برای هر ۱۳۱ روزِ بازه درخواست رفت — از جمله
//      `ضهرم4011` که یک ماه **پس از پایان بازه** عرضه شده.
//   ۳. ۳٬۲۱۷ ابزار/روز «بدون معامله» خوانده شد، در حالی که تابلوی روزانه
//      ۶۷ تا را تکذیب می‌کرد و برای ۳٬۱۵۰ تا اصلاً تابلویی نبود.

import { check, group, readSrc } from '../harness.mjs';
import {
  EMPTY_STATUS, dataExportCoverageRows, dataExportPairs, emptyStatusOf,
  exportBlockers, instrumentsWithPairs, unknownListingContracts,
} from '../../core/data-export.mjs';
import { buildDataExportSheets } from '../../ui/data-export-workbook.mjs';

group('۲۶۸. تاریخ عرضهٔ نامعلوم درخواست نمی‌سازد');
{
  // بازسازیِ دقیقِ همان مورد: عرضه ۲۰۲۵/۰۲/۱۵، سررسید ۲۰۲۵/۰۷/۱۶، و
  // بازه‌ای که ۲۰۲۵/۰۱/۲۰ تمام می‌شود.
  const instruments = [
    { ins: 'B', name: 'اهرم', baseIns: 'B', baseName: 'اهرم', kind: 'underlying', size: 1 },
    { ins: 'c1', name: 'ضهرم4011', baseIns: 'B', baseName: 'اهرم', kind: 'call', size: 1000, activeFrom: 0, expiry: 20250716 },
    { ins: 'c2', name: 'ضهرم3010', baseIns: 'B', baseName: 'اهرم', kind: 'call', size: 1000, activeFrom: 20240701, expiry: 20241201 },
  ];
  const days = [20240722, 20241016, 20250120];
  const keys = dataExportPairs(instruments, days).map((pair) => pair.key);

  check('قراردادِ بی‌تاریخِ عرضه هیچ جفتی نمی‌سازد', !keys.some((key) => key.endsWith(':c1')));
  // عمرِ c2: از ۲۰۲۴/۰۷/۰۱ تا سررسیدِ ۲۰۲۴/۱۲/۰۱ — پس ۲۰۲۵/۰۱/۲۰ بیرون است.
  check('و قراردادِ تاریخ‌دار فقط داخل عمر خودش می‌آید',
    keys.filter((key) => key.endsWith(':c2')).join() === '20240722:c2,20241016:c2');
  check('پایه همچنان همهٔ روزها را می‌گیرد',
    keys.filter((key) => key.endsWith(':B')).length === 3);
  // ۱۳۱ روز × ۲۴ قرارداد = ۳٬۱۴۴ جفتِ بی‌جا؛ همان چیزی که ممیزی گرفت.
  check('جفتِ بی‌جا دیگر ساخته نمی‌شود', keys.length === 5, `${keys.length}`);

  check('قراردادِ کنارگذاشته‌شده شمرده می‌شود، نه بی‌صدا بیفتد',
    unknownListingContracts(instruments).map((item) => item.name).join() === 'ضهرم4011');
  check('پایه هرگز در این شمارش نمی‌آید',
    !unknownListingContracts(instruments).some((item) => item.kind === 'underlying'));
  check('قرارداد بی‌شناسه هم نمی‌آید',
    unknownListingContracts([{ kind: 'call', activeFrom: 0 }]).length === 0);
}

group('۲۶۸. خالیِ تأییدنشده «بدون معامله» نیست');
{
  const instruments = [{ ins: 'B', name: 'اهرم', baseName: 'اهرم', kind: 'underlying', size: 1 }];
  const pairs = [
    { ins: 'B', date: 20241225, key: '20241225:B' },
    { ins: 'B', date: 20241226, key: '20241226:B' },
    { ins: 'B', date: 20241227, key: '20241227:B' },
    { ins: 'B', date: 20241228, key: '20241228:B' },
  ];
  const items = {
    '20241225:B': { rows: [], source: 'history' },
    '20241226:B': { rows: [], source: 'history' },
    '20241227:B': { rows: [], source: 'history' },
    '20241228:B': { rows: [{ price: 1, quantity: 1, time: 90000 }], source: 'history' },
  };
  const audit = [
    // تابلو می‌گوید ۳۰٬۵۴۰ معامله شد — این «بدون معامله» نیست.
    { key: '20241225:B', ins: 'B', date: 20241225, verdict: 'missing', dailyTrades: 30540 },
    // تابلو صفر می‌گوید — این واقعاً بدون معامله است.
    { key: '20241226:B', ins: 'B', date: 20241226, verdict: 'quiet', dailyTrades: 0 },
    // تابلویی در دست نیست — نمی‌دانیم.
    { key: '20241227:B', ins: 'B', date: 20241227, verdict: 'unknown', dailyTrades: NaN },
  ];
  const rows = dataExportCoverageRows(instruments, pairs, items, audit);
  const statusOf = (date) => rows.find((row) => row.date === date).status;

  check('خالی‌ای که تابلو تکذیبش می‌کند «ریزمعامله نیامد» است',
    statusOf(20241225) === EMPTY_STATUS.missing);
  check('و فقط خالیِ تأییدشدهٔ تابلو «بدون معامله» است',
    statusOf(20241226) === EMPTY_STATUS.quiet);
  check('خالیِ بی‌تابلو «تأییدنشده» می‌ماند — نه ادعای بازار',
    statusOf(20241227) === EMPTY_STATUS.unknown);
  check('ردیفِ دارای داده دست نمی‌خورد', statusOf(20241228) === 'داده آمد');
  // بی بازبینی هیچ ادعایی دربارهٔ بازار نمی‌شود.
  check('بی تابلوی روزانه، هیچ خالی‌ای «بدون معامله» خوانده نمی‌شود',
    dataExportCoverageRows(instruments, pairs, items).every((row) => row.status !== EMPTY_STATUS.quiet));
  check('خطا و درخواست‌نرفته جای خودشان می‌مانند',
    dataExportCoverageRows(instruments, pairs, { '20241225:B': { rows: [], error: 'x', source: 'history' } })
      .map((row) => row.status).join().includes('خطا')
    && dataExportCoverageRows(instruments, pairs, {})[0].status === 'درخواست نرفت');
  check('حکمِ ناشناخته هم به «تأییدنشده» می‌افتد، نه به «بدون معامله»',
    emptyStatusOf('چیزی') === EMPTY_STATUS.unknown && emptyStatusOf() === EMPTY_STATUS.unknown);

  // برگ راهنما نباید عددِ «بدون معامله» را بی‌قید بنویسد.
  const guide = buildDataExportSheets({
    instruments, pairs, items, audit, range: { from: 20241225, to: 20241228 }, complete: true,
  }).find((part) => part.name === 'راهنما');
  const emptyLine = String((guide.rows.find((row) => row[0] === 'خالی') || [])[1] || '');
  check('راهنما شمارِ خالی را از شمارِ تأییدشده جدا می‌گوید',
    emptyLine.includes('3 ابزار/روز') && emptyLine.includes('1 تای آن'));
  check('و دیگر سطر بی‌قیدِ «بدون معامله» ندارد',
    !guide.rows.some((row) => row[0] === 'بدون معامله'));
}

group('۲۶۸. دروازهٔ اجرا');
{
  const tab = readSrc('../ui/tabs/data-export.mjs');
  // خودِ قفل و فهرستِ موانعش در گروهِ «قفل تا تکمیلِ واقعیِ دفتر» پایین‌تر
  // سنجیده می‌شود؛ اینجا فقط اینکه دکمه واقعاً به آن بسته است.
  check('دکمهٔ اجرا به فهرستِ موانع بسته است',
    tab.includes('|| blockers().length > 0'));
  check('و علتش همان‌جا که دکمه است نوشته می‌شود',
    tab.includes('تا تکمیل دفتر، خروجی قفل است'));
  // قفلِ سراسریِ `complete=false` عمداً برنگشت: پیش از این دکمه را دائماً
  // غیرفعال می‌کرد و صاحب پروژه برش داشت.
  check('قفل به بازه بسته است، نه به سلامتِ کلِ دفتر',
    !tab.includes('runBtn.disabled = !universe?.complete'));
  check('قراردادِ بی‌تاریخِ عرضه در جملهٔ وضعیت گفته می‌شود',
    tab.includes('const unlisted = unknownListingContracts(instruments)')
      && tab.includes('تاریخ عرضه‌اش در دفتر نیست و وارد بازه نشد'));
}

group('۲۶۸. قفل تا تکمیلِ واقعیِ دفتر');
{
  const scan = (patch) => ({ versionCurrent: true, catalogComplete: true, detailsComplete: true, ...patch });
  const universe = (missingDays, patch) => ({ missingDays, health: { scan: scan(patch) } });

  check('دفترِ تمام‌شده هیچ مانعی ندارد', exportBlockers(universe(0, {})).length === 0);
  check('روزِ اسکن‌نشده مانع است',
    exportBlockers(universe(131, {}))[0].includes('۱۳۱'.replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      || exportBlockers(universe(131, {}))[0].includes('131'));

  // ═══ ایرادی که ممیزی گرفت ═══
  //
  // روزها تمام شده‌اند ولی پاس کاتالوگ یا مشخصات هنوز می‌دود؛ تا امروز
  // دکمه در همین حالت فعال می‌شد و فهرستِ قرارداد ناقص می‌ماند.
  check('پاسِ ناتمامِ کاتالوگ با missingDays=0 هم مانع است',
    exportBlockers(universe(0, { catalogComplete: false })).some((why) => why.includes('کاتالوگ')));
  check('مشخصاتِ ناتمام هم مانع است',
    exportBlockers(universe(0, { detailsComplete: false })).some((why) => why.includes('مشخصات')));
  check('دفترِ نسخه‌قدیمی مانع است و علتش را خودش می‌گوید',
    exportBlockers(universe(0, { versionCurrent: false })).join().includes('نسخهٔ قدیمی'));
  check('و نسخهٔ قدیمی دو مانعِ تکراری نمی‌سازد',
    exportBlockers(universe(0, { versionCurrent: false, catalogComplete: false, detailsComplete: false })).length === 1);

  // ═══ و چرا قفل روی خودِ `complete` گذاشته نشد ═══
  //
  // آن پرچم «۶۶ جفتِ ناقص کال/پوت» را هم می‌شمارد، که واقعیتِ بازار است
  // (سریِ رسمیِ تک‌سمت) و هرگز درست نمی‌شود. قفل روی آن یعنی دکمه‌ای که
  // هیچ‌وقت فعال نمی‌شود — همان چیزی که یک بار برداشته شد.
  check('جفتِ ناقصِ کال/پوت مانعِ خروجی نیست — واقعیتِ بازار است، نه کارِ نیمه‌تمام',
    exportBlockers({ missingDays: 0, health: { complete: false, reasons: ['۶۶ جفت ناقص کال/پوت'], scan: scan({}) } }).length === 0);
  check('درخواستِ ناموفقِ گذرا هم دکمه را برای همیشه قفل نمی‌کند',
    exportBlockers({ missingDays: 0, health: { complete: false, scan: scan({ dayQueriesFailed: 3 }) } }).length === 0);
  check('دفترِ بی‌گزارشِ سلامت ادعایی نمی‌سازد',
    exportBlockers({ missingDays: 0 }).length === 0 && exportBlockers(null).length === 0);

  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('تب روی همین فهرستِ موانع قفل می‌کند',
    tab.includes('const blockers = () => exportBlockers(universe)')
      && tab.includes('|| blockers().length > 0'));
  check('و همهٔ موانع را کنار دکمه می‌نویسد',
    tab.includes('تا تکمیل دفتر، خروجی قفل است'));
}

group('۲۶۸. ابزارِ بی‌جفت برگ نمی‌گیرد');
{
  const instruments = [
    { ins: 'B', name: 'اهرم', kind: 'underlying' },
    { ins: 'c1', name: 'ضهرم4011', kind: 'call' },
    { ins: 'c2', name: 'ضهرم3010', kind: 'call' },
  ];
  const pairs = [
    { ins: 'B', date: 20240722, key: '20240722:B' },
    { ins: 'c2', date: 20240722, key: '20240722:c2' },
  ];
  const kept = instrumentsWithPairs(instruments, pairs).map((item) => item.name);
  check('قراردادی که وارد بازه نشده برگ نمی‌گیرد', !kept.includes('ضهرم4011'));
  check('پایه و قراردادِ داخل بازه می‌مانند', kept.join() === 'اهرم,ضهرم3010');

  // ملاک «جفت داشتن» است نه «معامله داشتن»: برگِ خالیِ قراردادِ زندهٔ
  // بی‌معامله یک واقعیت است و عمداً ساخته می‌شود.
  const sheets = buildDataExportSheets({
    instruments: instrumentsWithPairs(instruments, pairs), pairs,
    items: { '20240722:B': { rows: [{ price: 1, quantity: 1, time: 90000 }], source: 'history' },
      '20240722:c2': { rows: [], source: 'history' } },
    range: { from: 20240722, to: 20240722 }, complete: true,
  });
  const names = sheets.map((part) => part.name);
  check('فایل برگِ قراردادِ بیرونِ بازه را ندارد', !names.includes('ضهرم4011'));
  check('ولی برگِ خالیِ قراردادِ زندهٔ بی‌معامله را دارد',
    names.includes('ضهرم3010') && sheets.find((part) => part.name === 'ضهرم3010').rows.length === 0);

  check('تب همین فهرستِ فیلترشده را به فایل می‌دهد',
    readSrc('../ui/tabs/data-export.mjs').includes('const sheetInstruments = instrumentsWithPairs(instruments, pairs)')
      && readSrc('../ui/tabs/data-export.mjs').includes('prepared = { instruments: sheetInstruments,'));
}
