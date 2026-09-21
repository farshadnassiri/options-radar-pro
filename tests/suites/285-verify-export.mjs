// ۲۸۵. خوانندهٔ فایل خروجی، با نویسندهٔ واقعی رفت‌وبرگشت می‌زند
//
// `tools/verify-export.mjs` حکم می‌دهد که فایلِ خروجی کامل است یا نه. اگر
// خواننده‌اش از نویسنده دور بیفتد، آن حکم بی‌صدا غلط می‌شود — و بدترین
// حالت همین است: ابزاری که برای گرفتنِ ایراد ساخته شده، خودش ایراد را
// پنهان کند.
//
// پس اینجا یک دفترکارِ واقعی با `ui/xlsx.mjs` نوشته می‌شود و با همان
// خواننده باز می‌شود؛ هر چیزی که بیرون بیاید باید دقیقاً همان باشد که
// رفته.

import { check, group, readSrc } from '../harness.mjs';
import { buildXlsx, sheet } from '../../ui/xlsx.mjs';
import { readSheet, sharedStrings, sheetOrder, unzip } from '../../tools/verify-export.mjs';

group('۲۸۵. رفت‌وبرگشتِ xlsx');
{
  const rows = [
    ['اهرم', 20260919, 7736, 73305224, 'کامل — با تابلو تطبیق شد'],
    ['ضهرم۶۰۴۰', 20260916, 246, 2828, 'ناقص — کمتر از تابلو'],
    // خانهٔ خالی و عددِ منفی و متنِ دارای نویسهٔ XML، هر سه دامِ واقعی‌اند.
    ['طهرم۷۰۵۰', 20260728, null, -5, 'a<b>&"c"'],
  ];
  const sheets = [
    sheet('راهنما', ['شاخص', 'مقدار'], [['نتیجهٔ دریافت', '۱۲۳ ریزمعامله'], ['از تاریخ', '20260622']]),
    sheet('پوشش دریافت', ['نماد ابزار', 'تاریخ میلادی', 'کل ردیف', 'حجم', 'وضعیت'], rows),
  ];
  const bytes = await buildXlsx(sheets);
  check('نویسنده بایت داد', bytes && bytes.byteLength > 0);

  const files = unzip(Buffer.from(bytes));
  check('zip باز شد و برگ‌ها داخلش هستند',
    files.has('xl/workbook.xml') && files.has('xl/worksheets/sheet1.xml'));

  const names = sheetOrder(files);
  check('نامِ برگ‌ها به ترتیب خوانده می‌شود',
    names[0] === 'راهنما' && names[1] === 'پوشش دریافت');

  const strings = sharedStrings(files);
  const back = readSheet(files, 1, strings);
  check('سرستون‌ها همان‌اند که رفتند',
    back[0].join('|') === 'نماد ابزار|تاریخ میلادی|کل ردیف|حجم|وضعیت');
  check('شمارِ ردیف‌ها می‌خواند', back.length === rows.length + 1);
  check('متنِ فارسی سالم برمی‌گردد', back[1][0] === 'اهرم' && back[1][4].includes('تطبیق'));
  check('عددها عدد می‌مانند، نه رشته',
    back[1][1] === 20260919 && back[1][2] === 7736 && back[1][3] === 73305224);
  check('عددِ منفی هم سالم است', back[3][3] === -5);
  // خانهٔ خالی نباید به صفر تبدیل شود — کلِ حکمِ «نیامد» به همین بند است.
  check('خانهٔ خالی خالی می‌ماند، نه صفر',
    back[3][2] === null || back[3][2] === undefined || back[3][2] === '');
  check('نویسهٔ XML درست باز می‌شود', back[3][4] === 'a<b>&"c"');

  const guide = readSheet(files, 0, strings);
  check('برگ راهنما هم درست خوانده می‌شود',
    guide[1][0] === 'نتیجهٔ دریافت' && String(guide[1][1]).includes('ریزمعامله'));
}

group('۲۸۵. ابزار، اجرا و وارد شدن را از هم جدا می‌کند');
{
  const src = readSrc('../tools/verify-export.mjs');
  // ملاک «خودش اجرا شده» است، نه «آرگومان دارد» — وگرنه پالایهٔ آزمون
  // به‌جای نامِ فایل خوانده می‌شود، که یک بار همین‌جا رخ داد.
  check('اجرا را از مسیرِ خودش تشخیص می‌دهد، نه از آرگومان',
    src.includes("const selfRun = String(process.argv[1] || '') === fileURLToPath(import.meta.url);"));
  check('و بدنه پشت همان شرط است', src.includes('\nif (selfRun) {'));
  // ابزارِ حکم‌دهنده نباید چیزی را عوض کند یا به شبکه برود.
  check('هیچ نوشتنی روی دیسک ندارد', !/fs\.write|writeFile/.test(src));
  check('و هیچ درخواستِ شبکه‌ای', !/fetch\(|http\.request/.test(src));
  check('صفر وابستگیِ بیرونی — فقط ماژول‌های خودِ نود',
    [...src.matchAll(/^import .*from '([^']+)'/gm)]
      .every((m) => m[1].startsWith('node:')));
}
