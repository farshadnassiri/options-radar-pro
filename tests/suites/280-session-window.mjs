// ۲۸۰. پنجرهٔ ساعتِ انتخابی، جدول پیوسته، و تقسیمِ خروجی بزرگ
//
// بند ۶ و معیار پذیرشِ ۶ و ۸ ممیزیِ ۱۴۰۵/۰۶/۲۹.
//
// پیش از این پنجره **ثابت** ۹:۰۰ تا ۱۲:۳۰ بود و انتخابِ ۹:۳۰ به‌عنوان
// آغاز در این مسیر اصلاً وجود نداشت؛ ورودیِ بازه در تب مربوط به تاریخ
// است نه ساعت. شمع‌ها هم مبدأ ثابت داشتند و فقط برای سطل‌های دارای رکورد
// ساخته می‌شدند: یک معامله در ۱۰:۳۰ تنها یک ردیف می‌ساخت، نه جدولِ تمام
// دقیقه‌های روز.

import { check, group, readSrc } from '../harness.mjs';
import {
  DEFAULT_SESSION_WINDOW, clockLabel, dataExportCandles, dataExportSessionRows,
  dataExportTradeRows, inSessionWindow, parseClock, sessionWindow,
} from '../../core/data-export.mjs';
import { splitSheets, SHEET_ROW_CAP, buildDataExportSheets } from '../../ui/data-export-workbook.mjs';

const instrument = { ins: 'B', name: 'اهرم', kind: 'underlying', baseName: 'اهرم' };
const pairs = [{ key: '20260920:B', ins: 'B', date: 20260920 }];
const at = (time, quantity = 1) => ({ time, quantity, price: 1000, canceled: false, canceledKnown: true });

group('۲۸۰. ساعت، ورودی است نه ثابت');
{
  check('`HH:MM` خوانده می‌شود', parseClock('09:30') === (9 * 3600) + (30 * 60));
  check('و `HH:MM:SS` هم', parseClock('12:30:00') === (12 * 3600) + (30 * 60));
  check('ورودیِ بدشکل `NaN` است', Number.isNaN(parseClock('9-30')) && Number.isNaN(parseClock('')));
  check('ساعتِ ۲۴ و دقیقهٔ ۶۰ رد می‌شوند',
    Number.isNaN(parseClock('24:00')) && Number.isNaN(parseClock('09:60')));
  check('برچسبِ ساعت برگشت‌پذیر است', clockLabel(parseClock('09:30')) === '09:30:00');

  const picked = sessionWindow('09:30', '12:30');
  check('پنجرهٔ ۹:۳۰ تا ۱۲:۳۰ ساخته می‌شود', picked.start === parseClock('09:30') && picked.end === parseClock('12:30'));
  check('و «انتخابیِ کاربر» علامت می‌خورد', picked.custom === true);
  check('پیش‌فرض «انتخابی» شمرده نمی‌شود', sessionWindow('09:00', '12:30').custom === false);

  // ═══ چرا ورودیِ بد بی‌صدا اصلاح نمی‌شود ═══
  //
  // پنجره‌ای که ساکت به پیش‌فرض بیفتد یعنی کاربر فکر کند انتخابش اعمال
  // شده، در حالی که نشده — همان جنسِ خطایی که این ممیزی پر از آن است.
  const reversed = sessionWindow('12:30', '09:30');
  check('پنجرهٔ وارونه به پیش‌فرض می‌افتد', reversed.start === DEFAULT_SESSION_WINDOW.start);
  check('ولی بی‌صدا نه — دلیلش گفته می‌شود', reversed.note.includes('پایان پیش از آغاز'));
  check('ورودیِ نامعتبر هم دلیل می‌گیرد', sessionWindow('x', 'y').note.includes('نامعتبر'));
}

group('۲۸۰. پنجره در پالایه اعمال می‌شود');
{
  // مرزهای گزارش‌شدهٔ ممیزی، این بار با پنجرهٔ انتخابیِ ۹:۳۰.
  const window = sessionWindow('09:30', '12:30');
  check('۹:۰۰ در پنجرهٔ پیش‌فرض هست', inSessionWindow(90000, DEFAULT_SESSION_WINDOW));
  check('و در پنجرهٔ ۹:۳۰ نیست', !inSessionWindow(90000, window));
  check('۹:۳۰:۰۰ دقیقاً داخل است', inSessionWindow(93000, window));
  check('۱۲:۳۰:۰۰ هم داخل است — پایان شامل است', inSessionWindow(123000, window));
  check('و ۱۲:۳۰:۰۱ بیرون', !inSessionWindow(123001, window));

  const items = { '20260920:B': { rows: [at(90000), at(93000), at(110000), at(123000), at(123001)], source: 'history' } };
  const split = dataExportSessionRows(dataExportTradeRows(instrument, pairs, items, window));
  check('انتخابِ ۹:۳۰ واقعاً روی ردیف‌ها اثر می‌گذارد', split.rows.length === 3);
  // ردیفِ بیرون **حذف** نمی‌شود؛ شمرده می‌شود.
  check('و ردیف‌های بیرون شمرده می‌شوند، نه بی‌صدا', split.outside === 2 && split.total === 5);
  check('با پنجرهٔ پیش‌فرض همان ورودی ۴ ردیف می‌دهد',
    dataExportSessionRows(dataExportTradeRows(instrument, pairs, items)).rows.length === 4);
}

group('۲۸۰. شمع‌ها همان پنجره را می‌گیرند');
{
  const window = sessionWindow('09:30', '12:30');
  const rows = dataExportSessionRows(
    dataExportTradeRows(instrument, pairs,
      { '20260920:B': { rows: [at(93000), at(103000)], source: 'history' } }, window),
  ).rows;

  // ═══ مبدأ سطل، با پنجره جابه‌جا می‌شود ═══
  //
  // با مبدأ ثابتِ ۹:۰۰، بازهٔ ۹:۳۰ داخل سطلِ به‌نامِ ۹:۰۰ می‌افتاد — یعنی
  // برچسبِ سطل روی ساعتی می‌نشست که کاربر اصلاً نخواسته بود.
  const hourly = dataExportCandles(rows, 3600, { window });
  check('سطلِ ساعتی از ۹:۳۰ شروع می‌شود، نه ۹:۰۰', hourly[0].time === 93000);
  check('و سطلِ بعدی ۱۰:۳۰ است', hourly[1].time === 103000);
  check('با پنجرهٔ پیش‌فرض همان داده سطلِ ۹:۰۰ می‌دهد',
    dataExportCandles(rows, 3600)[0].time === 90000);
}

group('۲۸۰. جدول زمانیِ پیوسته');
{
  // بازتولیدِ ممیزی: یک معامله در ۱۰:۳۰.
  const rows = dataExportSessionRows(dataExportTradeRows(instrument, pairs,
    { '20260920:B': { rows: [at(103000, 10)], source: 'history' } })).rows;

  const sparse = dataExportCandles(rows, 60);
  check('حالتِ فشرده هنوز فقط یک ردیف می‌دهد', sparse.length === 1);

  // ۰۹:۰۰ تا ۱۲:۳۰ یعنی ۲۱۰ دقیقه.
  const full = dataExportCandles(rows, 60, { continuous: true });
  check('جدول پیوسته تمام دقیقه‌های پنجره را می‌دهد', full.length === 210);
  check('و ردیفِ ۱۰:۳۰ همان معاملهٔ واقعی است',
    full.find((bar) => bar.time === 103000).volume === 10);

  // ═══ قاعده‌ای که شکستنی نیست ═══
  const blank = full.find((bar) => bar.time === 100000);
  check('سطلِ بی‌معامله هیچ قیمتی نمی‌گیرد',
    Number.isNaN(blank.open) && Number.isNaN(blank.high)
      && Number.isNaN(blank.low) && Number.isNaN(blank.close));
  // ═══ این ادعا پس از R3-02 دو شاخه شد ═══
  //
  // صفر فقط وقتی راست است که دریافتِ آن روز تأیید شده باشد. بی حکمِ
  // پوشش، نوشتنِ «حجم صفر» همان ادعای غلطی است که ممیزی گرفت — برای
  // روزی که تابلو ۷٬۷۳۶ معامله ثبت کرده بود.
  check('بی حکمِ پوشش، حجم و شمار هم خالی می‌مانند، نه صفر',
    Number.isNaN(blank.volume) && Number.isNaN(blank.value) && Number.isNaN(blank.trades));
  check('و وضعیتش «نامعلوم» است', blank.state === 'unknown');
  const quietDay = dataExportCandles(rows, 60, {
    continuous: true, verdictByDate: { 20260920: 'quiet' },
  }).find((bar) => bar.time === 100000);
  check('ولی با تأییدِ تابلو، صفر یک واقعیت است و نوشته می‌شود',
    quietDay.volume === 0 && quietDay.value === 0 && quietDay.trades === 0);
  check('و وضعیتش «نشد» است، نه «نیامد»', quietDay.state === 'quiet');
  check('و خودش را «معامله نشد» معرفی می‌کند', blank.traded === false);
  check('سطلِ واقعی «معامله شد» است', full.find((bar) => bar.time === 103000).traded === true);
  // هیچ قیمتی از سطل قبل تکرار نشده باشد.
  check('هیچ سطلِ خالی قیمتِ سطلِ پیشین را نگرفته',
    full.filter((bar) => bar.traded === false).every((bar) => !Number.isFinite(bar.close)));

  // پنجرهٔ انتخابی هم پیوستگی‌اش را می‌گیرد: ۹:۳۰ تا ۱۲:۳۰ یعنی ۱۸۰ دقیقه.
  check('پنجرهٔ انتخابی جدولِ پیوستهٔ خودش را می‌دهد',
    dataExportCandles(rows, 60, { window: sessionWindow('09:30', '12:30'), continuous: true }).length === 180);
}

group('۲۸۰. خروجی بزرگ، چند برگ');
{
  // معیار پذیرشِ ۸: تقسیم شود و مجموع رکوردها برابر بماند.
  const headers = ['a', 'b'];
  const rows = Array.from({ length: 25 }, (_, i) => [i, i * 2]);
  const parts = splitSheets('اهرم', headers, rows, [10, 10], 10);
  check('ردیفِ بیشتر از سقف به چند برگ می‌رود', parts.length === 3);
  check('و مجموع رکوردها دقیقاً برابرِ ورودی می‌ماند',
    parts.reduce((sum, part) => sum + part.rows.length, 0) === 25);
  check('ترتیب دست‌نخورده می‌ماند، پس چسباندنشان همان جدول است',
    parts.flatMap((part) => part.rows).every((row, i) => row[0] === i));
  check('هر برگ سرستونِ خودش را دارد', parts.every((part) => part.headers.join() === 'a,b'));
  check('برگ اول نامِ ساده دارد و بقیه شماره', parts[0].name === 'اهرم' && parts[1].name === 'اهرم (۲)');
  check('زیر سقف، هیچ تقسیمی نمی‌شود', splitSheets('اهرم', headers, rows, [10, 10], 100).length === 1);
  check('سقفِ پیش‌فرض همان سقفِ یک شیتِ اکسل است', SHEET_ROW_CAP === 1048575);

  // و دیگر پرتاب نمی‌کند: کاربری که کلِ بازه را می‌خواهد فایلش را می‌گیرد.
  const big = { '20260920:B': { rows: Array.from({ length: 30 }, (_, i) => at(90000 + i)), source: 'history' } };
  let threw = '';
  try {
    buildDataExportSheets({ instruments: [instrument], pairs, items: big, range: { from: 20260920, to: 20260920 } });
  } catch (error) { threw = String(error.message); }
  check('ساختِ فایل دیگر به‌خاطر بزرگی پرتاب نمی‌کند', !threw.includes('سقف یک شیت'));
}

group('۲۸۰. تب و فایل همان پنجره را می‌گویند');
{
  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('تب ورودیِ ساعتِ آغاز و پایان دارد',
    tab.includes('id="de-from-time"') && tab.includes('id="de-to-time"'));
  check('و کلیدِ جدول پیوسته', tab.includes('id="de-continuous"'));
  check('پنجره در پالایه و شمع‌سازی یکسان اعمال می‌شود',
    tab.includes('dataExportTradeRows(item, pairs, items, window)')
      && tab.includes('dataExportCandles(split.rows, frame.seconds, { window, continuous })'));
  check('و دلیلِ ردِ ورودیِ بد به کاربر نشان داده می‌شود',
    tab.includes("$('de-window-note')") && tab.includes('note.textContent = window.note'));
  check('عوض‌کردن ساعت دریافت دوباره نمی‌خواهد',
    tab.includes("for (const id of ['de-frame', 'de-from-time', 'de-to-time', 'de-continuous'])")
      && !tab.includes("de-from-time').addEventListener('change', invalidatePrepared"));

  const book = readSrc('../ui/data-export-workbook.mjs');
  check('برگ راهنما عددِ واقعیِ پنجره را می‌نویسد، نه متنِ ثابت',
    book.includes('clockLabel(window.start)') && !book.includes('فقط جلسهٔ پیوستهٔ ۹:۰۰ تا ۱۲:۳۰ است'));
  check('و سطرِ «جدول زمانی» می‌گوید پیوسته بوده یا فشرده',
    book.includes("['جدول زمانی', continuous"));
  check('ستونِ «معامله شد» در سرستونِ شمع هست',
    book.includes("'معامله شد'"));
}
