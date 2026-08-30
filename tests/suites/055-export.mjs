// ۵۴. خروجی اکسل و عنوان محور
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import fs from 'node:fs';
import { check, group, readSrc } from '../harness.mjs';
import { csvCell, numericCell, stamp, toCsv } from '../../ui/export.mjs';


// ═══════════════════════════ ۵۴. خروجی اکسل و عنوان محور نمودارها ═══════════════════════════
group('۵۴. خروجی اکسل و عنوان محور');
{
  // ——— خانه‌ها ———
  //
  // رابط عدد را فارسی نشان می‌دهد. اکسل `۱۲٬۳۴۵` را عدد نمی‌فهمد و به‌صورت
  // متن می‌نشاند، پس جمع و مرتب‌سازی از کار می‌افتد.
  check('عدد فارسی به رقم لاتین برمی‌گردد', numericCell('۱۲٬۳۴۵') === '12345');
  check('منفی و اعشار فارسی هم درست می‌شوند', numericCell('−۴٬۵۰۰٫۲۵') === '-4500.25');
  // واحد در سرستون هست؛ «٪» چسبیده ستون را متن می‌کند
  check('نشانه درصد از خانه برداشته می‌شود', numericCell('−۳۷٫۷۱٪') === '-37.71');
  check('ولی فقط وقتی باقی‌مانده یک عدد کامل باشد',
    numericCell('۵۰٪ تا ۶۰٪').startsWith('"'), numericCell('۵۰٪ تا ۶۰٪'));
  // «۳۰ روز» عدد نیست: اگر عدد شود واحدش را از دست می‌دهد و ۳۰ ثانیه از ۳۰ روز جدا نمی‌شود
  check('متنِ دارای عدد، متن می‌ماند', numericCell('۳۰ روز') === '"30 روز"');
  check('نقل‌قول درون متن دوبار می‌شود، طبق RFC 4180',
    csvCell('او گفت "سلام"') === '"او گفت ""سلام"""');
  check('خانه تهی، رشته خالیِ نقل‌قول‌دار است', csvCell(null) === '""' && csvCell(undefined) === '""');
  check('شکست خط در خانه، سطر را نمی‌شکند', !csvCell('خط\nدوم').includes('\n'));

  // ——— فایل ———
  //
  // بدون BOM اکسل ویندوزی فایل را با کدپیج محلی می‌خواند و متن فارسی به هم
  // می‌ریزد. خودِ فایل سالم است؛ اکسل اشتباه می‌خواند.
  const csv54 = toCsv([['نام', 'مقدار'], ['اهرم', '۱۲٬۳۴۵']]);
  check('فایل با BOM شروع می‌شود', csv54.charCodeAt(0) === 0xFEFF);
  check('سطرها با CRLF جدا می‌شوند', csv54.includes('\r\n'));
  check('سرستون متن می‌ماند و مقدار عدد می‌شود',
    csv54.includes('"نام","مقدار"') && csv54.includes('"اهرم",12345'));
  check('مهر زمانی نام فایل، رقم لاتین است و طول ثابت',
    /^\d{8}-\d{4}$/.test(stamp(new Date(2026, 7, 20, 5, 9))), stamp(new Date(2026, 7, 20, 5, 9)));

  // ——— اتصال ———
  const exSrc54 = readSrc('../ui/export.mjs');
  // جدول مجازی‌سازی‌شده فقط ردیف‌های داخل قاب را در DOM دارد؛ خروجیِ
  // DOM-خوان آن‌جا بی‌صدا ناقص می‌شود.
  check('جارو، جدول مجازی‌سازی‌شده را کنار می‌گذارد',
    exSrc54.includes("if (wrap.closest('.tbl-wrap')) continue;"));
  check('دکمه بیرون از ظرفِ بازنویسی‌شونده می‌نشیند',
    exSrc54.includes("wrap.parentNode.insertBefore(bar, wrap);"));
  check('سرستون چندسطری با colspan جابه‌جا نمی‌شود',
    exSrc54.includes("for (let i = 0; i < span; i++) row.push(cell.textContent);"));
  const tblSrc54 = readSrc('../ui/table.mjs');
  check('جدول مجازی‌سازی‌شده خروجی داده‌محور دارد، نه DOM-محور',
    tblSrc54.includes('function exportRows()') && tblSrc54.includes('view.map((r) => cols.map('));
  for (const [file, what] of [['../ui/tabs/backtest.mjs', 'بک‌تست'], ['../ui/tabs/history.mjs', 'تاریخچه'],
    ['../ui/tabs/portfolio-backtest.mjs', 'سبد'], ['../ui/tabs/positions.mjs', 'موقعیت‌ها'],
    ['../ui/tabs/roll.mjs', 'رول'], ['../ui/scenario-panel.mjs', 'سناریو']]) {
    const src = readSrc(file);
    check(`جدول‌های ${what} دکمه خروجی می‌گیرند`, src.includes('attachExportsIn('));
  }

  // ——— عنوان محور ———
  //
  // بدون عنوان، «۱۲٬۵۰۰» می‌تواند ریال باشد یا قرارداد یا درصد.
  for (const [file, what] of [['../ui/chart.mjs', 'نمودار بازده'], ['../ui/track-chart.mjs', 'نمودارهای بک‌تست'],
    ['../ui/tabs/history.mjs', 'نمودارهای تاریخچه'], ['../ui/tabs/portfolio-backtest.mjs', 'نمودار سبد']]) {
    const src = readSrc(file);
    check(`${what} عنوان محور دارد`, /axis-title/.test(src));
  }
  const chartSrc54 = readSrc('../ui/chart.mjs');
  check('واحد در عنوان محور نوشته می‌شود',
    chartSrc54.includes('قیمت سهم پایه (ریال)') && chartSrc54.includes('سود و زیان (ریال)'));
  const btSrc54 = readSrc('../ui/track-chart.mjs');
  check('عنوان محور بک‌تست از واحد خودِ نمودار می‌آید',
    btSrc54.includes("money ? 'ریال' : count ? 'تعداد' : 'درصد'")
    && btSrc54.includes("timeScale ? 'ساعت جلسه"));
  const css54 = readSrc('../ui/style.css');
  // این دو ادعا زمانی عددِ دقیقِ هر توکن را قفل کرده بودند و با نخستین
  // تغییرِ مقیاسِ قلم رد شدند — بی‌آنکه چیزی خراب شده باشد. آنچه واقعاً
  // اهمیت دارد نسبت است، نه عدد: عنوان محور باید از برچسب عددی درشت‌تر
  // باشد و کفِ متن نمودار زیر خوانایی نرود.
  const fs54 = (name) => Number(css54.match(new RegExp(`--fs-${name}:\\s*([0-9.]+)px`))?.[1]);
  const axis54 = fs54('axis'), tick54 = fs54('chart');
  check('عنوان محور از برچسب عددی درشت‌تر است', axis54 > tick54, `${axis54}px > ${tick54}px`);
  const small54 = fs54('chart-sm'), large54 = fs54('chart-lg');
  check('مقیاس متن نمودار صعودی است و کفش زیر خوانایی نیست',
    small54 >= 13 && small54 < tick54 && tick54 < large54,
    `${small54} < ${tick54} < ${large54}`);
}
