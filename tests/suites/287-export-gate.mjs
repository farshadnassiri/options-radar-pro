// ۲۸۷. قفلِ دفترِ قراردادها — «بی‌معنا» در برابر «ناقص»
//
// ═══ R4-05 ═══
//
// بازآزماییِ پذیرش: کاربر بازهٔ یک‌هفته‌ای و ۱۰۸ قرارداد را انتخاب کرد و
// دکمهٔ آماده‌سازی **هرگز فعال نشد** — «پیمایش کاتالوگ ابزار تمام نشده»،
// در حالی که ساختِ دفتر روی ۱٬۳۷۴ از ۳٬۵۱۳ جست‌وجو بود و شمارِ کل هم با
// کشفِ شاخه‌های تازه بالا می‌رفت. شرطِ بازشدنِ قفل خودش در حال دور شدن
// بود، و مسیرِ واقعیِ کلیک تا دانلود یک بار هم اجرا نشد.
//
// قفلی که کاربر نمی‌تواند بازش کند محافظت نیست؛ همان «جمعِ نصفه» است با
// ظاهرِ احتیاط.

import { check, group, readSrc } from '../harness.mjs';
import { exportBlockers, exportGate, exportWarnings } from '../../core/data-export.mjs';
import { buildDataExportSheets } from '../../ui/data-export-workbook.mjs';

const scan = (patch) => ({ versionCurrent: true, catalogComplete: true, detailsComplete: true, ...patch });
const universe = (missingDays, patch) => ({ missingDays, health: { scan: scan(patch) } });

group('۲۸۷. بازتولیدِ همان وضعیتِ ممیزی');
{
  // دفترِ در حالِ ساخت: کاتالوگ ناتمام، روزها تمام، شش قراردادِ انتخابی
  // بی‌تاریخِ عرضه — دقیقاً همان چیزی که کاربر دید.
  const picked = [
    { ins: 'B', kind: 'underlying' },
    ...Array.from({ length: 102 }, (_, i) => ({ ins: `k${i}`, kind: 'call', activeFrom: 20260901 })),
    ...Array.from({ length: 6 }, (_, i) => ({ ins: `u${i}`, kind: 'call', activeFrom: 0 })),
  ];
  const mid = universe(0, { catalogComplete: false, detailsComplete: false });
  const gate = exportGate(mid, picked);

  check('دیگر هیچ مانعی نیست — دکمه باز می‌شود', gate.blocking.length === 0);
  check('ولی هر دو کم‌داشته گفته می‌شوند', gate.warnings.length === 2);
  check('کاتالوگِ ناتمام نامش می‌آید',
    gate.warnings.some((w) => w.includes('پیمایش کاتالوگ')));
  check('و شش قراردادِ بی‌تاریخ هم، با عددِ خودشان',
    gate.warnings.some((w) => w.includes('6 قراردادِ انتخابی')));
  check('`exportBlockers` و `exportWarnings` از همان دروازه می‌آیند',
    exportBlockers(mid, picked).length === 0 && exportWarnings(mid, picked).length === 2);
}

group('۲۸۷. مرزِ قفل: فقط آنچه بی‌معناست');
{
  check('دفترِ سالم نه مانع دارد نه هشدار',
    exportGate(universe(0, {})).blocking.length === 0
      && exportGate(universe(0, {})).warnings.length === 0);

  // ═══ تنها موردِ باقی‌مانده ═══
  //
  // نسخهٔ قدیمی یعنی دفتر شکلِ دیگری دارد و هیچ انتخابی قابلِ اتکا نیست.
  // به پیمایش وابسته نیست، پس با بازسازی خودش باز می‌شود — قفلی که راهِ
  // خروج دارد، برخلاف آن یکی.
  const stale = exportGate(universe(0, { versionCurrent: false, catalogComplete: false }));
  check('دفترِ نسخه‌قدیمی همچنان قفل می‌کند', stale.blocking.length === 1);
  check('و همان‌جا می‌ایستد — هشدارِ اضافه نمی‌سازد', stale.warnings.length === 0);

  check('روزِ اسکن‌نشده هشدار است، نه مانع',
    exportGate(universe(131, {})).blocking.length === 0
      && exportGate(universe(131, {})).warnings.join().includes('131'));
  check('انتخابِ کاملاً تاریخ‌دار، هشدارِ مشخصات نمی‌گیرد',
    exportGate(universe(0, { detailsComplete: false }),
      [{ ins: 'c1', kind: 'call', activeFrom: 20260701 }]).warnings.length === 0);
  check('دفترِ بی‌گزارشِ سلامت ادعایی نمی‌سازد',
    exportGate({ missingDays: 0 }).warnings.length === 0 && exportGate(null).blocking.length === 0);
}

group('۲۸۷. آنچه قفل نمی‌کند، باید نوشته شود');
{
  // اگر کم‌داشته در فایل نیاید، «قفل برداشته شد» به «انگار مشکلی نبود»
  // ترجمه می‌شود — و فایلِ ناقص کامل به نظر می‌رسد.
  const guide = buildDataExportSheets({
    instruments: [{ ins: 'B', name: 'اهرم', kind: 'underlying', baseName: 'اهرم' }],
    pairs: [], items: {}, range: { from: 20260914, to: 20260920 }, complete: false,
    coverageWarnings: ['پیمایش کاتالوگ ابزار تمام نشده', '6 قراردادِ انتخابی تاریخ عرضهٔ معلوم ندارد'],
  }).find((part) => part.name === 'راهنما');
  const row = (guide.rows.find((r) => r[0] === 'کم‌داشتهٔ دفتر هنگام خروجی') || [])[1] || '';
  check('برگ راهنما سطرِ کم‌داشته دارد', Boolean(row));
  check('و هر دو کم‌داشته را می‌نویسد',
    row.includes('پیمایش کاتالوگ') && row.includes('6 قراردادِ انتخابی'));
  const clean = buildDataExportSheets({
    instruments: [], pairs: [], items: {}, range: { from: 1, to: 2 }, complete: true,
  }).find((part) => part.name === 'راهنما');
  check('و در فایلِ بی‌کم‌داشته، صریح می‌گوید کم‌داشته‌ای نبود',
    String((clean.rows.find((r) => r[0] === 'کم‌داشتهٔ دفتر هنگام خروجی') || [])[1] || '')
      .includes('کم‌داشته‌ای نداشت'));
}

group('۲۸۷. تب، قفل و هشدار را جدا نشان می‌دهد');
{
  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('دکمه فقط با مانعِ واقعی بسته می‌شود',
    tab.includes('const blockers = () => exportBlockers(universe, selectedInstruments())')
      && tab.includes('|| blockers().length > 0'));
  check('و هشدار جدا خوانده می‌شود',
    tab.includes('const warnings = () => exportWarnings(universe, selectedInstruments())'));
  check('جملهٔ هشدار می‌گوید خروجی باز است',
    tab.includes('خروجی باز است، ولی پوشش ناقص است'));
  check('و می‌گوید همین در فایل هم ثبت می‌شود',
    tab.includes('همین محدودیت در برگ راهنمای فایل هم ثبت می‌شود'));
  check('کم‌داشته‌ها به فایل می‌رسند', tab.includes('coverageWarnings: warnings(),'));
  // وضعیتِ کنارِ دکمه باید با هر نوبتِ ساختِ دفتر تازه شود، وگرنه
  // جملهٔ قفلِ نبوده روی صفحه می‌ماند.
  check('وضعیت با ادامهٔ ساختِ دفتر تازه می‌شود',
    /ساخت دفتر ادامه دارد[\s\S]{0,400}paintBlockerStatus\(\);/.test(tab));
}
