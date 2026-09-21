// ۲۸۶. سه یافتهٔ بازآزماییِ پذیرش (R4-01 تا R4-04)
//
// دو تای اول در **ابزارِ کنترلِ خودمان** بودند، و این بدترین جای ممکن
// است: ابزاری که برای گرفتنِ برش ساخته شده بود، فایلِ بریده را «کامل»
// خواند. پس این دسته ابزار را از بیرون و با فایلِ واقعی می‌گزد، نه با
// خواندنِ متنِ کدش.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, group, readSrc } from '../harness.mjs';
import { buildXlsx, sheet } from '../../ui/xlsx.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tool = path.join(root, 'tools', 'verify-export.mjs');

const run = (file) => new Promise((resolve) => {
  execFile(process.execPath, [tool, file], { encoding: 'utf8' },
    (error, stdout) => resolve({ code: error ? error.code ?? 1 : 0, out: String(stdout) }));
});

/** دفترکارِ کمینه‌ای که همان شکلِ فایلِ واقعی را دارد. */
function workbook({ frame, grid, window: win, rows, sheetRows, outside = 0 }) {
  const total = rows + outside;
  return [
    sheet('راهنما', ['شاخص', 'مقدار'], [
      ['نتیجهٔ دریافت', `${total} ریزمعامله از 1 ابزار/روز`],
      ['از تاریخ', '20260919'], ['تا تاریخ', '20260919'],
      ['تایم‌فریم', frame], ['جدول زمانی', grid],
      ['پنجرهٔ ساعت', `ردیف‌های برگ هر ابزار فقط ${win} است؛ …`],
    ]),
    sheet('پوشش دریافت', [
      'نماد ابزار', 'تاریخ میلادی', 'کل ردیف', 'فعال', 'باطل',
      'خارج از جلسهٔ بازار', 'خارج از پنجرهٔ انتخابی', 'وضعیت', 'کسریِ نسبت به تابلو',
      'معاملهٔ تابلوی روزانه',
    ], [['طهرم7050', 20260919, total, total, 0, outside, outside,
      'کامل — با تابلو تطبیق شد', 'تطبیق کامل', total]]),
    sheet('طهرم7050', frame === 'ریزمعامله (خام)'
      ? ['تاریخ میلادی', 'تاریخ شمسی', 'ساعت', 'شماره معامله', 'قیمت (ریال)', 'حجم', 'وضعیت ابطال', 'منبع']
      : ['تاریخ میلادی', 'تاریخ شمسی', 'ساعت شروع', 'باز', 'بیشترین', 'کمترین', 'بسته',
        'حجم', 'ارزش (ریال)', 'تعداد معامله', 'تعداد باطل', 'منبع', 'معامله شد'],
    sheetRows),
  ];
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-'));
const write = async (name, sheets) => {
  const file = path.join(tmp, `${name}.xlsx`);
  fs.writeFileSync(file, Buffer.from(await buildXlsx(sheets)));
  return file;
};

group('۲۸۶. R4-02 — فایلِ بریده باید رد شود');
{
  // دادهٔ واقعیِ ممیزی: طهرم۷۰۵۰ در ۲۰۲۶۰۹۱۹ با ۳۷ معامله، که ۴ تایش
  // بیرونِ پنجرهٔ ۰۹:۳۰ است، پس برگ باید **۳۳** ردیف داشته باشد.
  const tick = (i) => [20260919, '1405/06/28', '10:00:00', i + 1, 1000, 1, 'فعال', 'history'];
  const healthy = await write('healthy-tick', workbook({
    frame: 'ریزمعامله (خام)', grid: 'فشرده — فقط سطلی که معامله داشته ردیف دارد.',
    window: '09:30:00 تا 12:30:00', rows: 33, outside: 4,
    sheetRows: Array.from({ length: 33 }, (_, i) => tick(i)),
  }));
  const good = await run(healthy);
  check('فایلِ سالمِ تیک قبول می‌شود', good.code === 0, good.out.split('\n').filter((l) => l.includes('✘')).join(' | '));

  // ═══ کنترلِ منفی: همان فایل، بریده به یک ردیف ═══
  const cut = await write('truncated-tick', workbook({
    frame: 'ریزمعامله (خام)', grid: 'فشرده — فقط سطلی که معامله داشته ردیف دارد.',
    window: '09:30:00 تا 12:30:00', rows: 33, outside: 4,
    sheetRows: [tick(0)],
  }));
  const bad = await run(cut);
  check('فایلِ بریده رد می‌شود', bad.code !== 0);
  check('و عددِ دقیقِ کسری را می‌گوید', bad.out.includes('1 در برابر 33'), '');
  check('و حکمش «کامل» نیست', !bad.out.includes('دادهٔ کاملِ بازه را دارد'));
}

group('۲۸۶. R4-03 — جدولِ پیوستهٔ سالم نباید رد شود');
{
  // ۰۹:۳۰ تا ۱۲:۳۰ با شمعِ یک‌دقیقه = ۱۸۰ سطل. مقایسهٔ ۱۸۰ سطل با ۳۷
  // تیک اصلاً معیار نیست — همان چیزی که نسخهٔ اول اشتباه می‌کرد.
  const bar = (i) => [20260919, '1405/06/28', '09:30:00', 1000, 1000, 1000, 1000,
    i === 0 ? 33 : null, i === 0 ? 33000 : null, i === 0 ? 33 : null, i === 0 ? 0 : null,
    'history', i === 0 ? 'بله' : 'خیر'];
  const file = await write('continuous-m1', workbook({
    frame: 'شمع ۱ دقیقه', grid: 'پیوسته — هر روزِ درخواست‌شده تمام سطل‌های پنجره را دارد.',
    window: '09:30:00 تا 12:30:00', rows: 33, outside: 4,
    sheetRows: Array.from({ length: 180 }, (_, i) => bar(i)),
  }));
  const out = await run(file);
  check('جدولِ پیوستهٔ کامل قبول می‌شود', out.code === 0,
    out.out.split('\n').filter((l) => l.includes('✘')).join(' | '));
  check('و شکلِ خروجی را درست تشخیص می‌دهد',
    out.out.includes('شمع 1 دقیقه') && out.out.includes('پیوسته')
      && out.out.includes('180 سطل در هر روز'));

  // و روزی که سطل کم دارد باید رد شود.
  const short = await write('continuous-short', workbook({
    frame: 'شمع ۱ دقیقه', grid: 'پیوسته — هر روزِ درخواست‌شده تمام سطل‌های پنجره را دارد.',
    window: '09:30:00 تا 12:30:00', rows: 33, outside: 4,
    sheetRows: Array.from({ length: 120 }, (_, i) => bar(i)),
  }));
  const shortOut = await run(short);
  check('جدولِ پیوستهٔ ناقص رد می‌شود', shortOut.code !== 0);
  check('و عددش را می‌گوید', shortOut.out.includes('120 ردیف در برابر 1×180=180'));
}

group('۲۸۶. R4-01 — میدانِ تاریخ قراردادِ هر endpoint است');
{
  const server = readSrc('../server/server.mjs');
  // پاسخِ درستِ `clientType` با `recDate` دیگر «بی‌تاریخ» خوانده نمی‌شود.
  check('جدولِ میدان‌ها به‌جای یک ثابتِ سراسری',
    server.includes("daily: { date: 'dEven', id: 'insCode' }")
      && server.includes("clientType: { date: 'recDate', id: 'insCode' }"));
  check('نوعِ بی‌تاریخ رد نمی‌شود، ولی ادعای روز هم برایش نمی‌شود',
    server.includes("return { row, found: true, dated: false, why: 'این نوع رکوردِ تاریخ‌دار نیست' }"));
  // نبودِ میدان، مدرکِ نامرتبط‌بودن نیست — رد کردنش همان R4-01 بود.
  check('نبودِ میدانِ تاریخ رکورد را دور نمی‌ریزد',
    /if \(!has\) return \{ row, found: true, dated: false/.test(server));
  // شناسهٔ «۰» جای‌نگه‌دار است، نه ابزارِ دیگر.
  check('شناسهٔ جای‌نگه‌دار رکورد را رد نمی‌کند',
    server.includes("stampedIns !== '0' && stampedIns !== String(ins)"));
  // و آنچه **باید** رد شود، هنوز رد می‌شود.
  check('رکوردِ تاریخِ دیگر همچنان رد می‌شود',
    server.includes('رکوردِ همان روز در دست نیست'));
}

group('۲۸۶. R4-04 — جملهٔ صفحه با دکمه یکی می‌شود');
{
  const tab = readSrc('../ui/tabs/data-export.mjs');
  // متن می‌گفت «می‌توانید خروجی بگیرید» در حالی که دکمه قفل بود.
  check('جملهٔ دفتر، قفلِ واقعی را می‌گوید',
    tab.includes('ولی تا رفعِ این‌ها خروجی قفل است'));
  check('و فقط وقتی «می‌توانید» می‌گوید که واقعاً باز باشد',
    /const stuck = blockers\(\);[\s\S]{0,400}stuck\.length[\s\S]{0,200}با پوشش فعلی هم می‌توانید/.test(tab));
}

fs.rmSync(tmp, { recursive: true, force: true });
