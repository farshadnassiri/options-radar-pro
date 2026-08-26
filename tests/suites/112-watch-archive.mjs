// ۱۱۱. بایگانی دیده‌بان و سوگیری بقا
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { buildChain } from '../../core/chain.mjs';
import {
  ARCHIVE_VERSION, archiveName, archiveNote, chainRowsFrom, makeArchive, validArchiveDate,
} from '../../core/watch-archive.mjs';


// ═══════════════════ ۱۱۱. بایگانی دیده‌بان و سوگیری بقا ═══════════════════
//
// بالادست نسخهٔ تاریخ‌دار فهرست قراردادها را نمی‌دهد. تنها راهش ضبط روزانه
// است، و خطرناک‌ترین حالتِ ممکن این است که بایگانی نبودن **بی‌صدا** به
// فهرست امروز برگردد — همان سوگیری بقا، با ظاهرِ حل‌شده.
group('۱۱۱. بایگانی دیده‌بان و سوگیری بقا');
{
  const watchRow = (ua, strike, expiry, extra = {}) => ({
    uaInsCode: ua, lval30_UA: 'آزمون',
    insCode_C: `c${strike}`, insCode_P: `p${strike}`,
    lVal18AFC_C: `ضآز${strike}`, lVal18AFC_P: `طآز${strike}`,
    strikePrice: strike, contractSize: 1000, endDate: expiry, remainedDay: 30,
    pDrCotVal_UA: 10_500, pClosing_UA: 10_400, pDrCotVal_C: 600, pClosing_C: 590,
    qTotTran5J_C: 5000, oP_C: 900,
    ...extra,
  });

  check('تاریخ بایگانی هشت رقم میلادی است',
    validArchiveDate('20260521') && !validArchiveDate('1405/03/01')
    && !validArchiveDate('2026052') && !validArchiveDate('../x'));
  check('نام فایل فقط از تاریخ معتبر ساخته می‌شود',
    archiveName('20260521') === '20260521.json' && archiveName('../x') === null);

  // ——— فشرده‌سازی ———
  {
    const rows = [
      watchRow('900001', 10_000, 20260620),
      watchRow('900001', 11_000, 20260620),
      watchRow('900001', 10_000, 20260620),          // تکراری
      { strikePrice: 5 },                            // بی‌کد پایه
      watchRow('900001', 0, 20260620),               // بی‌قیمت اعمال
    ];
    const archive = makeArchive(20260521, rows, { at: 12345 });
    check('ردیف تکراری دو بار ذخیره نمی‌شود', archive.count === 2);
    check('ردیف بی‌هویت اصلاً ذخیره نمی‌شود',
      archive.rows.every((row) => row.ua && row.k > 0));
    check('پرونده تاریخ و ساعت و نسخه دارد',
      archive.date === 20260521 && archive.at === 12345 && archive.version === ARCHIVE_VERSION);

    // ═══ ادعای اصلی یک: بایگانی قیمت نگه نمی‌دارد ═══
    check('هیچ میدان قیمتی در فشرده نیست', (() => {
      const text = JSON.stringify(archive);
      return !text.includes('10500') && !text.includes('10400')
        && !text.includes('600') && !text.includes('590');
    })());
    check('اما هویت و مشخصات قرارداد کامل می‌ماند', (() => {
      const one = archive.rows[0];
      return one.ua === '900001' && one.c === 'c10000' && one.p === 'p10000'
        && one.k === 10_000 && one.size === 1000 && one.end === 20260620 && one.days === 30;
    })());
  }

  // ——— بازسازی ———
  {
    const archive = makeArchive(20260521, [watchRow('900001', 10_000, 20260620), watchRow('900001', 11_000, 20260620)]);
    const rows = chainRowsFrom(archive);
    check('بازسازی، شکل مورد نیاز زنجیره را می‌دهد', rows.length === 2);
    check('زنجیره از بایگانی ساخته می‌شود', (() => {
      const chain = buildChain(rows);
      const ua = chain.get('900001');
      return !!ua && ua.contracts === 4 && ua.expiryList.length === 1
        && ua.expiryList[0].strikeList.map((s) => s.strike).join(',') === '10000,11000';
    })());
    check('اندازهٔ قرارداد از خود بایگانی می‌آید',
      buildChain(rows).get('900001').expiryList[0].strikeList[0].size === 1000);
    check('هر میدان قیمتیِ بازسازی صفر است',
      rows.every((row) => row.pClosing_UA === 0 && row.pDrCotVal_C === 0 && row.pMeDem_P === 0));
    check('بازسازی نشان‌دار است تا با عکس زنده اشتباه نشود',
      rows.every((row) => row.fromArchive === true));
    check('پروندهٔ خراب، ردیفی نمی‌سازد',
      chainRowsFrom(null).length === 0 && chainRowsFrom({ rows: 'x' }).length === 0);
  }

  // ═══ ادعای اصلی دو: نبودن بایگانی بی‌صدا نمی‌ماند ═══
  {
    const found = archiveNote({ wanted: 20260521, found: true, count: 120 });
    const gap = archiveNote({ wanted: 20260101, found: false, firstDate: 20260521 });
    const none = archiveNote({ wanted: 20260101, found: false, firstDate: 0 });
    check('حالت «بایگانی داریم» می‌گوید سوگیری بقا نیست',
      found.includes('سوگیری بقا در این جلسه وجود ندارد'));
    check('حالت «بایگانی داریم ولی نه برای این روز» صریح هشدار می‌دهد',
      gap.includes('بایگانی نداریم') && gap.includes('خوش‌بین‌تر از واقعیت'));
    check('حالت «هیچ بایگانی نداریم» جمله‌اش فرق دارد',
      none.includes('هنوز هیچ بایگانی') && none !== gap);
    check('هر سه جمله رقم فارسی دارند',
      [found, gap, none].every((text) => /^[^0-9]*$/.test(text)));
  }
}
