// ۸۱. نویسندهٔ xlsx و حجم فایل
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { sheet as wbSheet, workbook as wbWrap } from '../../ui/workbook.mjs';
import {
  buildXlsx, colName as xCol, crc32 as xCrc, deflateRaw as xDeflate, sheet as xSheet, sheetName as xSheetName, stripZlib as xStrip, tidy as xTidy, zip as xZip,
} from '../../ui/xlsx.mjs';
import { inflateRawSync } from 'node:zlib';


// ═════════ ۸۱. نویسندهٔ xlsx و حجم فایل ═════════
//
// خواسته کاربر: «خروجی اکسل گام سوم خیلی خوب و جامع است اما حجمش خیلی بالاست
// و نزدیک ۳۰ مگابایت… طوری اصلاحش کن که حجمش خیلی کمتر بشه.»
//
// پس آزمون باید خودِ حجم را بسنجد، نه اینکه «قالب عوض شد» را. عدد مقایسه
// از همان داده در قالب قبلی می‌آید تا نسبت، ادعای این کامیت را ثابت کند.
group('۸۱. نویسندهٔ xlsx و حجم فایل');
{
  check('دم ممیز شناور چیده می‌شود', xTidy(0.1 + 0.2) === 0.3, String(0.1 + 0.2));
  check('عددِ نبوده، عددِ نبوده می‌ماند', Number.isNaN(xTidy(NaN)));
  check('منفی صفر، صفر می‌شود', Object.is(xTidy(-0), 0));
  check('نام ستون از A تا BA درست است',
    ['A', 'Z', 'AA', 'AB', 'BA'].every((want, i) => xCol([0, 25, 26, 27, 52][i]) === want));

  const used81 = new Set();
  check('نام برگ تکراری شماره می‌گیرد',
    xSheetName('سطل', used81) === 'سطل' && xSheetName('سطل', used81) === 'سطل 2');
  check('نام برگ از ۳۱ نویسه بلندتر نمی‌شود', xSheetName('ب'.repeat(60), new Set()).length === 31);
  check('نویسهٔ ممنوع اکسل از نام برگ می‌رود', !xSheetName('a/b:c*d', new Set()).match(/[/:*]/));

  // CRC32 با مقدار شناخته‌شدهٔ «123456789» = 0xCBF43926
  check('CRC32 با مقدار مرجع می‌خواند',
    xCrc(new TextEncoder().encode('123456789')) === 0xCBF43926,
    xCrc(new TextEncoder().encode('123456789')).toString(16));

  const rows81 = Array.from({ length: 3000 }, (_, i) => ['۰۹:۰۰:۰۱', 'اختیار خرید ضهرم۷۰۵۸', i * 1.0000001, NaN, i]);
  const head81 = ['زمان', 'نام پا', 'اثر', 'تلاطم', 'حجم'];
  const bytes81 = await buildXlsx([xSheet('برگ', head81, rows81)]);
  const old81 = new TextEncoder().encode(wbWrap([wbSheet('برگ', head81, rows81)])).length;

  check('فایل یک بستهٔ zip معتبر است',
    bytes81[0] === 0x50 && bytes81[1] === 0x4B && bytes81[2] === 0x03 && bytes81[3] === 0x04);
  check('پایان‌نگارهٔ فهرست مرکزی در فایل هست',
    [...bytes81.slice(-22, -18)].join(',') === '80,75,5,6');
  // ادعای این کامیت: چند برابر کوچک‌تر، نه چند درصد
  check('فایل دست‌کم پنج برابر از قالب قبلی کوچک‌تر است',
    old81 / bytes81.length >= 5, `${(old81 / bytes81.length).toFixed(1)} برابر`);

  // خانهٔ خالی نباید نوشته شود — قاعدهٔ ۲-۴ تا داخل فایل
  const one81 = await buildXlsx([xSheet('یک', ['الف', 'ب'], [['متن', NaN]])]);
  const text81 = new TextDecoder().decode(one81);
  check('خانهٔ عددِ نبوده اصلاً نوشته نمی‌شود', !text81.includes('NaN'));

  // یک برگ بدون فشرده‌سازی هم باید سالم بسته شود
  const noPack = await xZip([{ name: 'a.txt', data: 'x' }]);
  check('بسته با یک عضو هم درست بسته می‌شود', noPack.length > 22 && noPack[0] === 0x50);

  // ——— مسیر پشتیبانِ فشرده‌سازی ———
  //
  // رگرسیون یک باگ واقعی: `deflate-raw` تازه است — نود از ۲۱٫۲ داردش،
  // فایرفاکس از ۱۱۳، سافاری از ۱۶٫۴. روی هر چیزی قدیمی‌تر استثنا می‌داد و
  // کل فایل بی‌فشرده نوشته می‌شد. CI که روی نود ۱۸ می‌ایستد همین را گرفت:
  // به‌جای پانزده برابر، دو برابر.
  //
  // آزمون سکوی قدیمی را **شبیه‌سازی** می‌کند تا مسیر پشتیبان قطعی سنجیده
  // شود، نه اینکه به نسخهٔ نودِ اجراکننده سپرده شود.
  const sample81 = 'ردیف نمونه '.repeat(3000);
  const raw81 = new TextEncoder().encode(sample81);
  const realCS = globalThis.CompressionStream;
  const oldPlatform = class {
    constructor(format) {
      if (format === 'deflate-raw') throw new TypeError('Unsupported compression format: deflate-raw');
      return new realCS(format);
    }
  };

  const packedNew = await xDeflate(raw81);
  globalThis.CompressionStream = oldPlatform;
  const packedOld = await xDeflate(raw81);
  globalThis.CompressionStream = realCS;

  check('سکوی بدون deflate-raw هم واقعاً فشرده می‌کند',
    packedOld && packedOld.length < raw81.length / 5,
    packedOld ? `${(raw81.length / packedOld.length).toFixed(0)} برابر` : 'اصلاً فشرده نشد');
  // `!!packedOld` اینجا احتیاط نیست، شرط است: بدون آن، نبودِ مسیر پشتیبان
  // به‌جای یک ردِ تمیز، کل اجرای آزمون را می‌انداخت و ادعاهای بعدی هرگز
  // خوانده نمی‌شدند.
  check('دو مسیر فشرده‌سازی یک خروجی می‌دهند',
    !!packedOld && packedNew.length === packedOld.length
    && packedNew.every((byte, at) => byte === packedOld[at]));
  check('خروجی مسیر پشتیبان، همان دادهٔ اصلی را برمی‌گرداند',
    !!packedOld && new TextDecoder().decode(inflateRawSync(Buffer.from(packedOld))) === sample81);

  // بریدنِ کورکورانهٔ پوشش zlib، فایلی می‌سازد که باز می‌شود و محتوایش
  // آشغال است — بدتر از فایلی که باز نمی‌شود. پس سرآیند بررسی می‌شود.
  check('سرآیند zlib با روش ناشناخته رد می‌شود',
    xStrip(Uint8Array.from([9, 0, 1, 2, 3, 4, 5, 6, 7])) === null);
  check('سرآیند zlib با واژه‌نامهٔ از پیش‌تعیین‌شده رد می‌شود',
    xStrip(Uint8Array.from([0x78, 0x20, 1, 2, 3, 4, 5, 6, 7])) === null);
  check('دادهٔ کوتاه‌تر از پوشش zlib رد می‌شود', xStrip(Uint8Array.from([0x78, 0x9c, 1])) === null);

  // و کل دفترکار روی همان سکوی قدیمی هم باید فشرده و سالم دربیاید
  globalThis.CompressionStream = oldPlatform;
  const bookOld = await buildXlsx([xSheet('برگ', head81, rows81)]);
  globalThis.CompressionStream = realCS;
  check('دفترکار روی سکوی قدیمی هم چند برابر کوچک‌تر است',
    old81 / bookOld.length >= 5, `${(old81 / bookOld.length).toFixed(1)} برابر`);

  const bt81 = readSrc('../ui/tabs/backtest.mjs');
  check('فراخوان خروجی منتظر ساخت فایل می‌ماند', /await\s+downloadBacktestExcel/.test(bt81));
}
