// ۲۸۸. سه یافتهٔ آزمونِ واقعیِ دور پنجم (R5-01 تا R5-03)
//
// ═══ چرا این دسته لازم شد ═══
//
// دو تا از سه یافته باز هم در **ابزارِ کنترلِ خودمان** بودند، و الگو
// یکی بود: انتظار از همان چیزی می‌آمد که قرار بود سنجیده شود. برگی که
// حذف شده بود وارد حلقه نمی‌شد، و روزی که حذف شده بود از مجموعهٔ انتظار
// هم حذف می‌شد. هر دو حالت «۰ اشکال» می‌دادند — بدترین شکلِ شکست، چون
// شبیهِ موفقیت است.
//
// پس اینجا هم مثل دستهٔ ۲۸۶، ابزار از بیرون و با فایلِ واقعی گزیده
// می‌شود: فایل ساخته می‌شود، چیزی از آن **حذف** می‌شود، و ادعا این است
// که ابزار حذف را می‌بیند.

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, group, readSrc } from '../harness.mjs';
import { buildXlsx, sheet } from '../../ui/xlsx.mjs';
import {
  REFILL_MAX_ATTEMPTS, attemptsOf, markAttempt, markRefillAttempt, refillQueue,
} from '../../core/refill-queue.mjs';
import { chooseTape, keepBetterTape } from '../../core/tape-choice.mjs';
import { dataExportBlankAudit, dataExportCoverageRows } from '../../core/data-export.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tool = path.join(root, 'tools', 'verify-export.mjs');

const run = (file) => new Promise((resolve) => {
  execFile(process.execPath, [tool, file], { encoding: 'utf8' },
    (error, stdout) => resolve({ code: error ? error.code ?? 1 : 0, out: String(stdout) }));
});

const TICK_HEAD = ['تاریخ میلادی', 'تاریخ شمسی', 'ساعت', 'شماره معامله',
  'قیمت (ریال)', 'حجم', 'وضعیت ابطال', 'منبع'];
const BAR_HEAD = ['تاریخ میلادی', 'تاریخ شمسی', 'ساعت شروع', 'باز', 'بیشترین', 'کمترین',
  'بسته', 'حجم', 'ارزش (ریال)', 'تعداد معامله', 'تعداد باطل', 'منبع', 'معامله شد'];

/**
 * دفترکارِ چندابزار/چندروزه — چون هر دو یافته دقیقاً از همین‌جا می‌آیند:
 * یکی ابزارِ گم‌شده، یکی روزِ گم‌شده. دفترِ تک‌ابزار/تک‌روزهٔ دستهٔ ۲۸۶
 * هیچ‌کدام را نمی‌توانست بسازد.
 */
function workbook({ frame, grid, window: win, coverage, sheets }) {
  const total = coverage.reduce((sum, row) => sum + row.rows + (row.outside || 0), 0);
  const tick = frame === 'ریزمعامله (خام)';
  return [
    sheet('راهنما', ['شاخص', 'مقدار'], [
      ['نتیجهٔ دریافت', `${total} ریزمعامله از ${coverage.length} ابزار/روز`],
      ['از تاریخ', '20260914'], ['تا تاریخ', '20260919'],
      ['تایم‌فریم', frame], ['جدول زمانی', grid],
      ['پنجرهٔ ساعت', `ردیف‌های برگ هر ابزار فقط ${win} است؛ …`],
      ['تلاش دریافت', `شمارِ ستون «تلاش دریافت» دورهای پرسیدن است، از خودِ دورِ اول:`
        + ` ${coverage.length} ابزار/روز یک بار · 0 ابزار/روز بیش از یک بار (بیشینه 1 بار)`
        + ' · 0 ابزار/روز اصلاً درخواستشان نرفت.'],
    ]),
    sheet('پوشش دریافت', [
      'نماد ابزار', 'تاریخ میلادی', 'کل ردیف', 'فعال', 'باطل',
      'خارج از جلسهٔ بازار', 'خارج از پنجرهٔ انتخابی', 'وضعیت', 'کسریِ نسبت به تابلو',
      'معاملهٔ تابلوی روزانه', 'تلاش دریافت', 'خطا',
    ], coverage.map((row) => {
      const all = row.rows + (row.outside || 0);
      return [row.name, row.date, all, all, 0, row.outside || 0, row.outside || 0,
        'کامل — با تابلو تطبیق شد', 'تطبیق کامل', all, '1 بار', ''];
    })),
    ...Object.entries(sheets).map(([name, rows]) => sheet(name, tick ? TICK_HEAD : BAR_HEAD, rows)),
  ];
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-r5-'));
const write = async (name, sheets) => {
  const file = path.join(tmp, `${name}.xlsx`);
  fs.writeFileSync(file, Buffer.from(await buildXlsx(sheets)));
  return file;
};

const tickRow = (date, i) => [date, '1405/06/28', '10:00:00', i + 1, 1000, 1, 'فعال', 'history'];
const barRow = (date, i) => [date, '1405/06/28', '09:30:00', 1000, 1000, 1000, 1000,
  i === 0 ? 33 : null, i === 0 ? 33000 : null, i === 0 ? 33 : null, i === 0 ? 0 : null,
  'history', i === 0 ? 'بله' : 'خیر'];

const TICK_GRID = 'فشرده — فقط سطلی که معامله داشته ردیف دارد.';
const CONT_GRID = 'پیوسته — هر روزِ درخواست‌شده تمام سطل‌های پنجره را دارد.';
const WIN = '09:30:00 تا 12:30:00';

group('۲۸۸. R5-02 — برگِ کاملاً حذف‌شده باید دیده شود');
{
  // دو ابزار در پوشش، هر کدام ۳۳ ردیفِ داخلِ پنجره.
  const cover = [
    { name: 'طهرم7050', date: 20260919, rows: 33, outside: 4 },
    { name: 'ضهرم7051', date: 20260919, rows: 33, outside: 4 },
  ];
  const body = Array.from({ length: 33 }, (_, i) => tickRow(20260919, i));

  const healthy = await write('two-sheets', workbook({
    frame: 'ریزمعامله (خام)', grid: TICK_GRID, window: WIN,
    coverage: cover, sheets: { 'طهرم7050': body, 'ضهرم7051': body },
  }));
  const good = await run(healthy);
  check('فایلِ سالمِ دوابزاره قبول می‌شود', good.code === 0,
    good.out.split('\n').filter((l) => l.includes('✘')).join(' | '));
  check('و هر دو برگ سنجیده می‌شوند', good.out.includes('برابرِ ریزمعاملهٔ داخلِ پنجره است')
    && good.out.includes('2 برگ'));

  // ═══ کنترلِ منفی: کلِ برگِ دومی حذف می‌شود ═══
  //
  // پیش از این، حلقه روی برگ‌های **موجود** می‌چرخید، پس این فایل «۰ برگ
  // اشکال دارد» می‌گرفت و حکمش «دادهٔ کاملِ بازه را دارد» می‌شد.
  const gone = await write('sheet-removed', workbook({
    frame: 'ریزمعامله (خام)', grid: TICK_GRID, window: WIN,
    coverage: cover, sheets: { 'طهرم7050': body },
  }));
  const bad = await run(gone);
  check('برگِ حذف‌شده فایل را رد می‌کند', bad.code !== 0);
  check('و ابزارِ بی‌برگ را نام می‌برد',
    bad.out.includes('1 ابزار برگ ندارند') && bad.out.includes('ضهرم7051'),
    bad.out.split('\n').filter((l) => l.includes('برگ')).join(' | '));
  check('و حکمش «کامل» نیست', !bad.out.includes('دادهٔ کاملِ بازه را دارد'));
}

group('۲۸۸. R5-03 — روزِ کاملاً حذف‌شده باید دیده شود');
{
  // یک ابزار، دو روز، جدولِ پیوستهٔ یک‌دقیقه‌ای: هر روز ۱۸۰ سطل.
  const cover = [
    { name: 'اهرم', date: 20260914, rows: 33, outside: 0 },
    { name: 'اهرم', date: 20260919, rows: 33, outside: 0 },
  ];
  const day = (date) => Array.from({ length: 180 }, (_, i) => barRow(date, i));

  const healthy = await write('two-days', workbook({
    frame: 'شمع ۱ دقیقه', grid: CONT_GRID, window: WIN,
    coverage: cover, sheets: { 'اهرم': [...day(20260914), ...day(20260919)] },
  }));
  const good = await run(healthy);
  check('جدولِ پیوستهٔ دوروزه قبول می‌شود', good.code === 0,
    good.out.split('\n').filter((l) => l.includes('✘')).join(' | '));

  // ═══ کنترلِ منفی: هر ۱۸۰ ردیفِ یک روز حذف می‌شود ═══
  //
  // پیش از این، انتظار `تعداد روزهای دیده‌شده × ۱۸۰` بود؛ با حذفِ روز،
  // انتظار هم ۱۸۰ می‌شد و تساوی برقرار می‌ماند. حالا انتظار از برگ
  // پوشش می‌آید و روزِ غایب جایی برای پنهان‌شدن ندارد.
  const gone = await write('day-removed', workbook({
    frame: 'شمع ۱ دقیقه', grid: CONT_GRID, window: WIN,
    coverage: cover, sheets: { 'اهرم': day(20260919) },
  }));
  const bad = await run(gone);
  check('روزِ حذف‌شده فایل را رد می‌کند', bad.code !== 0);
  check('و روزِ غایب را نام می‌برد',
    bad.out.includes('1 روز اصلاً ردیفی ندارد') && bad.out.includes('20260914'),
    bad.out.split('\n').filter((l) => l.includes('روز')).join(' | '));
  check('و شمارِ ابزار/روزِ غایب را جدا می‌گوید',
    bad.out.includes('1 ابزار/روز در پوشش هست ولی در برگ هیچ ردیفی ندارد'));

  // و همین برای تیک: ۶۶ ردیف روی **یک** روز، به‌جای ۳۳ در هر روز.
  const moved = await write('tick-day-moved', workbook({
    frame: 'ریزمعامله (خام)', grid: TICK_GRID, window: WIN,
    coverage: cover,
    sheets: { 'اهرم': Array.from({ length: 66 }, (_, i) => tickRow(20260919, i)) },
  }));
  const tickBad = await run(moved);
  check('در تیک هم، جمعِ درست با روزِ غلط قبول نمی‌شود', tickBad.code !== 0,
    tickBad.out.split('\n').filter((l) => l.includes('✘')).join(' | '));
  check('و روزِ خالی را نشان می‌دهد', tickBad.out.includes('روز 20260914 0 در برابر 33'));
}

group('۲۸۸. R5-01 — شمارندهٔ تلاش یک قرارداد دارد');
{
  // ═══ قرارداد: هر دورِ پرسیدن یک واحد، از خودِ دورِ اول ═══
  const first = markAttempt({ rows: [], source: 'history' }, 1700000000000);
  check('دورِ اول شمارنده را ۱ می‌کند', first.attempts === 1);
  check('و زمانش ثبت می‌شود', first.lastAttemptAt === 1700000000000);
  check('دورِ دوم ۲ می‌شود', markAttempt(first).attempts === 2);
  check('نامِ قدیمی همان تابع است', markRefillAttempt === markAttempt);
  check('رکوردِ بی‌شمارنده صفر خوانده می‌شود', attemptsOf({ rows: [] }) === 0);
  check('و رکوردِ نبوده هم', attemptsOf(undefined) === 0);

  // سقف، **کلِ** پرسیدن‌هاست: دورِ اول + پاسِ خودکار + چهار دورِ تکمیلی.
  check('سقف با قراردادِ تازه هم‌تراز شد', REFILL_MAX_ATTEMPTS === 6);
  const pairs = [{ key: '20260919:A', ins: 'A', date: 20260919 }];
  const audit = [{ key: '20260919:A', verdict: 'missing', dailyTrades: 100, dailyVolume: 1000 }];
  const queued = (attempts) => refillQueue(pairs,
    { '20260919:A': { rows: [], source: 'history', attempts } }, audit);
  check('ابزار/روزی که فقط یک بار پرسیده شده هنوز در صف است', queued(1).length === 1);
  check('و شمارِ تلاشش در صف دیده می‌شود', queued(1)[0].attempts === 1);
  check('یکی مانده به سقف هنوز در صف است', queued(5).length === 1);
  check('و روی سقف از صف می‌افتد', queued(6).length === 0);

  // ═══ ترکیبِ واقعی: شمارش روی خروجیِ دروازهٔ حفظِ داده ═══
  //
  // این همان جایی است که نوبتِ قبل گزید و هیچ آزمونِ واحدی ندید: شمارنده
  // درست بالا می‌رفت، ولی `keepBetterTape` رکوردِ حامل را دور می‌ریخت و
  // عدد به فایل نمی‌رسید. پس ادعا دیگر دربارهٔ `markAttempt` تنها نیست،
  // دربارهٔ **همان عبارتی** است که در `fetchBatch` نوشته شده.
  {
    const expect = { known: true, trades: 33, volume: 3300, quiet: false };
    const mark = (record) => markAttempt(record, 1700000000000);
    const rows = (k) => Array.from({ length: k }, (_, i) => ({ sequence: i + 1 }));
    let record;
    // دورِ ۱: خالی می‌آید.
    record = mark(keepBetterTape(record, { rows: [], source: 'history' }, expect));
    check('پس از دورِ اول شمارنده ۱ است', record.attempts === 1);
    // دورِ ۲: باز هم خالی — رکوردِ قبلی می‌ماند، ولی تلاش باید شمرده شود.
    record = mark(keepBetterTape(record, { rows: [], source: 'history' }, expect));
    check('دورِ بی‌اثر هم شمرده می‌شود', record.attempts === 2);
    // دورِ ۳: داده می‌آید و جایگزین می‌شود.
    record = mark(keepBetterTape(record, { rows: rows(33), source: 'history' }, expect));
    check('دورِ موفق هم شمرده می‌شود', record.attempts === 3);
    check('و دادهٔ به‌دست‌آمده سرِ جایش است', record.rows.length === 33);
    // دورِ ۴: پاسخِ بدترِ تازه — نه داده برود، نه شمارنده بایستد.
    record = mark(keepBetterTape(record, { rows: rows(1), source: 'history' }, expect));
    check('پاسخِ بدتر داده را پس نمی‌گیرد', record.rows.length === 33);
    check('ولی تلاشش شمرده می‌شود', record.attempts === 4);
  }

  // ═══ و عددی که به فایل می‌رود همان است ═══
  const coverage = dataExportCoverageRows([{ ins: 'A', name: 'ن', kind: 'call' }], pairs,
    { '20260919:A': { rows: [], source: 'history', attempts: 2 } });
  check('برگ پوشش شمارِ تلاش را دست‌نخورده می‌برد', coverage[0].attempts === 2);

  // ═══ سه عددی که سه معنای متفاوت دارند ═══
  //
  // فایلِ واقعیِ دور پنجم همین را نداشت: پس از یک تلاشِ تکمیلیِ
  // انجام‌شده، راهنما نوشت «هر ابزار/روز یک بار پرسیده شد».
  const book = readSrc('../ui/data-export-workbook.mjs');
  check('راهنما قرارداد را اعلام می‌کند', book.includes('دورهای پرسیدن است، از خودِ دورِ اول'));
  check('و هر سه حالت را جدا می‌شمارد',
    book.includes("row.attempts > 1") && book.includes("row.attempts === 1")
      && book.includes("row.attempts === 0"));

  // و ابزارِ کنترل با همان قرارداد می‌خواند، نه قراردادِ قبلی.
  const verify = readSrc('../tools/verify-export.mjs');
  check('ابزارِ کنترل قرارداد را از راهنما می‌خواند',
    verify.includes("/دورهای پرسیدن/.test("));
  check('و «نپرسیدهٔ بی‌علت» را جدا می‌گزد', verify.includes('silentNever'));
}

group('۲۸۸. R5-04 — تلاشِ دوباره باید واقعاً به بالادست برسد');
{
  // ═══ چرا این دسته لازم شد ═══
  //
  // اولین پیاده‌سازیِ «پرچم را بین دورها عوض کن» بی‌اثر بود: دورِ «ساده»
  // پرچمِ `fresh` را خاموش می‌کرد، و مسیرِ غیر‌fresh از کشِ ۹۰۰ثانیه‌ایِ
  // سرور جواب می‌گرفت. در اجرای آزمایشیِ مرورگر، چهار دور رفته بود و
  // بالادست هر مسیر را فقط **سه** بار دیده بود — یعنی یک دورِ کامل هرگز
  // از خانه بیرون نرفت.
  //
  // تفکیکِ لازم: `fresh` یعنی «کشِ ما را رد کن»، `bust` یعنی «مهرِ زمان به
  // URLِ بالادست بچسبان». تلاشِ دوباره همیشه اولی را می‌خواهد و فقط دومی
  // بین دورها عوض می‌شود.
  const server = readSrc('../server/server.mjs');
  check('سرور دو مفهوم را جدا می‌گیرد',
    server.includes('async function getFresh(pathname, ttlSec = 2, priority = 2, { bust = true } = {})'));
  check('و URLِ ساده و مهرخورده را جدا می‌سازد',
    server.includes('bust ? `${S.baseUrl}${pathname}${join}_=${Date.now()}` : `${S.baseUrl}${pathname}`'));
  // کلیدِ کش هم باید جدا باشد، وگرنه دو شکلِ URL پاسخِ هم را می‌خورند و
  // تفکیک روی کاغذ می‌ماند.
  check('کلیدِ کش دو حالت را قاطی نمی‌کند',
    server.includes('`fresh:${bust ? \'b\' : \'p\'}:${pathname}`'));
  check('مسیرِ تاریخی هر دو را می‌پذیرد',
    server.includes('async function fetchHistoricalTape(code, date, { fresh = false, expect = null, bust = true } = {})'));
  check('و بستهٔ انبوه هم', server.includes('const bust = body.bust !== false'));

  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('تب `bust` را در بدنهٔ درخواست می‌فرستد', /fresh,\n\s+\/\/[\s\S]{0,200}\n\s+bust,/.test(tab));
  check('و دورِ تکمیلی هرگز کشِ سرور را نمی‌خورد',
    tab.includes('await fetchHistorical(jobs, prepared.items, controller.signal, true, bust)'));
}

group('۲۸۸. R5-05 — عددِ کسری بی پشتوانهٔ تابلو نوشته نمی‌شود');
{
  // ═══ بازتولیدِ ثبت‌شده ═══
  //
  // در اجرای آزمایشیِ مرورگر، ۳۶۲ ردیفِ برگ پوشش ستونِ «کسریِ نسبت به
  // تابلو» را پر داشتند و ستونِ «معاملهٔ تابلوی روزانه» را خالی. علتش
  // ساده بود: کسری را **سرور** با مرجعِ خودش حساب می‌کرد و ستونِ تابلو
  // را **تب** از مرجعِ خودش پر می‌کرد. هر جا آن دو یکی نبودند، فایل
  // عددی می‌نوشت که پشتوانه‌اش را نشان نمی‌داد.
  const tape = (trades, volume) => Array.from({ length: trades }, () => ({ quantity: volume / trades }));
  const expect = { known: true, quiet: false, trades: 10, volume: 100 };

  const partial = chooseTape([{ variant: 'true', rows: tape(4, 40), duplicates: 0, conflicts: [] }], expect);
  check('حکمِ ناقص مرجعش را همراه می‌برد',
    partial.reference?.trades === 10 && partial.reference?.volume === 100);
  check('و کسری از همان مرجع حساب شده', partial.shortfall.trades === 6);

  const full = chooseTape([{ variant: 'true', rows: tape(10, 100), duplicates: 0, conflicts: [] }], expect);
  check('حکمِ کامل هم مرجعش را همراه می‌برد', full.reference?.trades === 10 && full.complete === true);

  const gone = chooseTape([], expect);
  check('حکمِ «نیامد» هم', gone.reference?.trades === 10 && gone.shortfall.trades === 10);

  const quiet = chooseTape([], { known: true, quiet: true, trades: 0, volume: 0 });
  check('و صفرِ تأییدشده مرجعِ صفر دارد، نه نبودِ مرجع',
    quiet.reference?.quiet === true && quiet.reference?.trades === 0);

  // بی مرجع، هیچ عددی ساخته نمی‌شود — نه کسری، نه پشتوانه.
  const blind = chooseTape([{ variant: 'true', rows: tape(4, 40), duplicates: 0, conflicts: [] }],
    { known: false, trades: 0, volume: 0 });
  check('بی مرجع، نه کسری نوشته می‌شود نه پشتوانه',
    blind.shortfall === null && blind.reference === null);

  // و برگ پوشش وقتی مرجعِ خودش را ندارد، از مرجعِ سرور می‌خواند.
  const book = readSrc('../ui/data-export-workbook.mjs');
  check('برگ پوشش مرجعِ سرور را جایگزین می‌کند',
    book.includes('Number.isFinite(hit.reference?.trades) ? hit.reference.trades'));
}

group('۲۸۸. R5-06 — دو مرجعِ تابلو، یک حکم');
{
  // ═══ بازتولیدِ ثبت‌شده ═══
  //
  // `GetClosingPriceDailyList` برای قراردادِ منقضی خالی برمی‌گردد (از
  // تابلو حذف شده)، ولی `GetClosingPriceDaily` همان روز را می‌دهد. پس
  // سرور می‌دانست ابزار/روز ناقص است و عددِ کسری را هم برمی‌گرداند، در
  // حالی که بازبینیِ تب حکمِ «نامعلوم» می‌داد — و «نامعلوم» وارد صفِ
  // تلاشِ تکمیلی نمی‌شود. یعنی همان ردیف‌هایی که می‌دانستیم کم دارند
  // هرگز دوباره پرسیده نمی‌شدند. در هارنسِ مرورگر ۳۶۲ از ۵۲۴ چنین بودند.
  const pairs = [{ key: '20260919:A', ins: 'A', date: 20260919 }];
  const tape = (k) => Array.from({ length: k }, () => ({ quantity: 10, canceled: false }));

  // تابلوی یکجای تب خالی است — قراردادِ منقضی.
  const withRef = dataExportBlankAudit(pairs, {
    '20260919:A': {
      rows: tape(4), source: 'history',
      reference: { trades: 10, volume: 100, quiet: false },
    },
  }, {}, []);
  check('مرجعِ سرور حکم را از «نامعلوم» بیرون می‌آورد', withRef[0].verdict === 'partial');
  check('و عددهای تابلو در بازبینی می‌نشینند',
    withRef[0].dailyTrades === 10 && withRef[0].dailyVolume === 100);
  check('و منبعِ مرجع نام‌برده می‌شود', withRef[0].referenceSource === 'day');
  check('کسری هم از همان حساب می‌شود',
    withRef[0].tradeGap === 6 && withRef[0].volumeGap === 60);

  // نوارِ خالی + مرجعِ سرور = «نیامد»، نه «نامعلوم».
  const empty = dataExportBlankAudit(pairs, {
    '20260919:A': { rows: [], source: 'history', reference: { trades: 10, volume: 100, quiet: false } },
  }, {}, []);
  check('نوارِ خالی با مرجعِ سرور «نیامد» می‌شود', empty[0].verdict === 'missing');

  // ═══ و همین است که در صف می‌نشیند ═══
  const queue = refillQueue(pairs, {
    '20260919:A': { rows: [], source: 'history', attempts: 1, reference: { trades: 10, volume: 100 } },
  }, empty);
  check('و حالا وارد صفِ تلاشِ تکمیلی می‌شود', queue.length === 1 && queue[0].reason === 'missing');

  // صفرِ تأییدشدهٔ سرور هم مرجع است، نه نبودِ مرجع.
  const quiet = dataExportBlankAudit(pairs, {
    '20260919:A': { rows: [], source: 'history', reference: { trades: 0, volume: 0, quiet: true } },
  }, {}, []);
  check('صفرِ تأییدشده «بدون معامله» می‌شود، نه «نامعلوم»', quiet[0].verdict === 'quiet');

  // ═══ اولویت با مرجعِ خودِ تب می‌ماند ═══
  //
  // مرجعِ یکجا یک درخواست برای کلِ عمرِ ابزار است؛ اگر هست، همان مبناست.
  const both = dataExportBlankAudit(pairs, {
    '20260919:A': { rows: tape(4), source: 'history', reference: { trades: 999, volume: 9990 } },
  }, { A: { rows: [{ date: 20260919, trades: 10, vol: 100 }] } }, []);
  check('مرجعِ خودِ تب بر مرجعِ سرور مقدم است',
    both[0].dailyTrades === 10 && both[0].referenceSource === 'list');

  // بی هیچ مرجعی، هنوز «نامعلوم» است — این تغییر حدس نمی‌زند.
  const blind = dataExportBlankAudit(pairs, {
    '20260919:A': { rows: tape(4), source: 'history' },
  }, {}, []);
  check('بی هیچ مرجعی هنوز «نامعلوم» است', blind[0].verdict === 'unknown');
  check('و منبعی هم اعلام نمی‌شود', blind[0].referenceSource === '');

  // و مرجعِ بدشکل باور نمی‌شود.
  const junk = dataExportBlankAudit(pairs, {
    '20260919:A': { rows: tape(4), source: 'history', reference: { trades: 'x', volume: null } },
  }, {}, []);
  check('مرجعِ بدشکل نادیده گرفته می‌شود', junk[0].verdict === 'unknown');

  // برگ راهنما می‌گوید هر حکم با کدام مرجع سنجیده شده.
  const book = readSrc('../ui/data-export-workbook.mjs');
  check('راهنما منبعِ راست‌آزمایی را می‌شمارد',
    book.includes("row.referenceSource === 'list'") && book.includes("row.referenceSource === 'day'")
      && book.includes('از تابلوی تک‌روزِ سرور'));
}
