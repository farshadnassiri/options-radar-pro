// ۲۸۴. تلاشِ تکمیلیِ قابل پیگیری
//
// ═══ چرا این قلم لازم شد ═══
//
// جمع‌بندیِ بازآزماییِ عملیِ دور سوم: «اعلام درست کسری، جای دریافت داده را
// نمی‌گیرد.» سه نوبت ممیزی صرفِ این شد که برنامه بفهمد چه کم دارد و
// صادقانه بگوید. ولی کاربری که فایلش ۱٬۱۶۳ ابزار/روزِ «نیامد» دارد، با
// گزارشِ دقیق هم هنوز دادهٔ آن روزها را ندارد.

import { check, group, readSrc } from '../harness.mjs';
import {
  REFILL_MAX_ATTEMPTS, REFILL_REASON, markRefillAttempt, refillDelayMs,
  refillProgress, refillQueue, refillSummary,
} from '../../core/refill-queue.mjs';
import { dataExportCoverageRows } from '../../core/data-export.mjs';
import { keepBetterTape } from '../../core/tape-choice.mjs';

const pair = (ins, date) => ({ key: `${date}:${ins}`, ins, date });
const rows = (count) => Array.from({ length: count }, (_, i) => ({
  time: 100000 + i, price: 1000, quantity: 1, canceled: false,
}));

group('۲۸۴. صف فقط کم‌داشته‌ها را نگه می‌دارد');
{
  const pairs = [pair('A', 20260919), pair('B', 20260919), pair('C', 20260919),
    pair('D', 20260919), pair('E', 20260919)];
  const items = {
    '20260919:A': { rows: [], source: 'history' },
    '20260919:B': { rows: rows(5), source: 'history' },
    '20260919:C': { rows: rows(100), source: 'history' },
    '20260919:D': { rows: [], error: 'دروازه', source: 'history' },
    // E عمداً نیست: «درخواست نرفت» با «خالی آمد» یکی نیست.
  };
  const audit = [
    { key: '20260919:A', verdict: 'missing', dailyTrades: 7736, dailyVolume: 73305224 },
    { key: '20260919:B', verdict: 'partial', tradeGap: 95, volumeGap: 500 },
    { key: '20260919:C', verdict: 'matched' },
  ];
  const queue = refillQueue(pairs, items, audit);

  check('ابزار/روزِ تطبیق‌شده وارد صف نمی‌شود',
    !queue.some((job) => job.key === '20260919:C'));
  check('نیامده، ناقص، خطادار و درخواست‌نرفته همه وارد می‌شوند',
    queue.length === 4);
  check('و هرکدام دلیلِ خودش را دارد',
    queue.map((job) => job.reason).sort().join(',') === 'absent,error,missing,partial');
  check('هر دلیل برچسبِ فارسی دارد',
    ['missing', 'partial', 'error', 'absent'].every((r) => Boolean(REFILL_REASON[r])));

  // ═══ ترتیب تصادفی نیست ═══
  //
  // اگر سهمیه وسطِ کار تمام شود، آنچه به دست آمده باید بیشترین ارزش را
  // داشته باشد. پس پرارزش‌ترین کسری اول می‌رود.
  check('پرارزش‌ترین کسری اولِ صف است', queue[0].key === '20260919:A');
  check('و ارزشِ جامانده با خودش حمل می‌شود',
    queue[0].gapTrades === 7736 && queue[0].gapVolume === 73305224);
  check('کسریِ «ناقص» از شکافِ خودش می‌آید، نه از کلِ تابلو',
    queue.find((job) => job.reason === 'partial').gapTrades === 95);

  // نوارِ زنده دوباره گرفتنی نیست.
  const live = refillQueue([pair('L', 20260920)],
    { '20260920:L': { rows: [], source: 'live' } },
    [{ key: '20260920:L', verdict: 'missing', dailyTrades: 10 }]);
  check('روزِ نوارِ زنده وارد صف نمی‌شود', live.length === 0);

  const sum = refillSummary(queue);
  check('جمع‌بندی هر دلیل را جدا می‌شمارد',
    sum.total === 4 && sum.missing === 1 && sum.partial === 1 && sum.error === 1 && sum.absent === 1);
  check('و پرارزش‌ترین را نام می‌برد', sum.worst.ins === 'A');
}

group('۲۸۴. سقفِ تلاش، و حافظهٔ بین دورها');
{
  const pairs = [pair('A', 20260919)];
  const audit = [{ key: '20260919:A', verdict: 'missing', dailyTrades: 10 }];
  const at = (attempts) => refillQueue(pairs,
    { '20260919:A': { rows: [], source: 'history', attempts } }, audit);

  check('زیر سقف، در صف می‌ماند', at(REFILL_MAX_ATTEMPTS - 1).length === 1);
  check('سرِ سقف، از صف بیرون می‌رود', at(REFILL_MAX_ATTEMPTS).length === 0);
  check('و شمارِ تلاشِ قبلی در صف دیده می‌شود', at(2)[0].attempts === 2);
  check('سقف عددِ معقولی است', REFILL_MAX_ATTEMPTS >= 2 && REFILL_MAX_ATTEMPTS <= 10);

  // شمارنده روی خودِ رکورد می‌نشیند، چون همان چیزی است که به فایل می‌رود.
  const once = markRefillAttempt({ rows: [], source: 'history' }, 1700000000000);
  check('ثبتِ تلاش شمارنده را بالا می‌برد', once.attempts === 1);
  check('و زمانش را نگه می‌دارد', once.lastAttemptAt === 1700000000000);
  check('ثبتِ دوباره از همان‌جا ادامه می‌دهد', markRefillAttempt(once).attempts === 2);
  check('و ردیف‌های موجود را دست نمی‌زند',
    markRefillAttempt({ rows: rows(3) }).rows.length === 3);

  // ═══ فاصله، و چرا فزاینده ═══
  check('دورِ اول کوتاه مکث می‌کند', refillDelayMs(1) === 5000);
  check('و هر دور دو برابر می‌شود', refillDelayMs(2) === 10000 && refillDelayMs(3) === 20000);
  check('ولی از دو دقیقه بالاتر نمی‌رود', refillDelayMs(20) === 120000);
  check('دورِ نامعتبر هم فاصلهٔ معتبر می‌دهد', refillDelayMs(0) === 5000);
}

group('۲۸۴. شمارندهٔ تلاش از ادغام جان سالم می‌برد');
{
  // ═══ باگی که فقط شبیه‌سازیِ حلقه گرفتش ═══
  //
  // `keepBetterTape` با `{ ...next }` جایگزین می‌کرد و هر چیزی را که روی
  // رکوردِ قبلی نشسته بود دور می‌ریخت — از جمله `attempts` را، که پاسخِ
  // بالادست هرگز ندارد. پس شمارنده با هر جایگزینیِ **موفق** صفر می‌شد:
  // سقفِ تلاش بی‌اثر و ستونِ «تلاش دریافت» فایل خالی. آزمونِ واحدِ یک‌مرحله‌ای
  // این را نمی‌گیرد؛ فقط در تلاشِ چندم دیده می‌شود.
  const tracked = markRefillAttempt(markRefillAttempt({ rows: [], source: 'history' }));
  check('رکوردِ ردیابی‌شده دو تلاش دارد', tracked.attempts === 2);

  const expect = { known: true, quiet: false, trades: 5, volume: 5 };
  const filled = keepBetterTape(tracked, { rows: rows(5), source: 'history' }, expect);
  check('پس از جایگزینیِ موفق، ردیف‌ها می‌آیند', filled.rows.length === 5);
  check('و شمارندهٔ تلاش پاک نمی‌شود', filled.attempts === 2);

  // همین برای مسیرهای دیگرِ ادغام هم باید برقرار باشد.
  const held = keepBetterTape({ ...tracked, rows: rows(9) }, { rows: [], source: 'history' }, expect);
  check('در نگه‌داشتنِ دادهٔ قبلی هم شمارنده می‌ماند', held.attempts === 2 && held.rows.length === 9);
  const errored = keepBetterTape({ ...tracked, rows: rows(9) }, { rows: [], error: 'x' }, expect);
  check('و در مسیرِ خطا هم', errored.attempts === 2);
  // رکوردی که اصلاً ردیابی نشده، میدانِ ساختگی نمی‌گیرد.
  check('رکوردِ بی‌سابقه شمارندهٔ ساختگی نمی‌گیرد',
    keepBetterTape(undefined, { rows: rows(2) }, expect).attempts === undefined);
}

group('۲۸۴. پیشرفت، نه صرفِ تلاش');
{
  const queue = [
    { key: 'k1' }, { key: 'k2' }, { key: 'k3' },
  ];
  const before = { k1: { rows: [] }, k2: { rows: rows(5) }, k3: { rows: [] } };
  const after = { k1: { rows: rows(100) }, k2: { rows: rows(60) }, k3: { rows: [] } };
  const got = refillProgress(queue, before, after);

  check('خالی که پر شد، «پر شد» شمرده می‌شود', got.filled === 1);
  check('ناقص که کامل‌تر شد، جدا شمرده می‌شود', got.improved === 1);
  check('ردیف‌های تازه شمرده می‌شوند', got.gainedTrades === 155);
  check('و آنچه هنوز خالی است هم', got.stillEmpty === 1);
  // «چند تلاش رفت» گزارشِ پیشرفت نیست.
  check('شمارِ تلاش با شمارِ دستاورد یکی نیست',
    got.tried === 3 && got.tried !== got.filled);
  // دورِ بی‌اثر باید صفر بدهد تا حلقه بتواند خودش را ببندد.
  const none = refillProgress(queue, before, before);
  check('دورِ بی‌اثر صفر دستاورد می‌دهد', none.gainedTrades === 0 && none.filled === 0);
}

group('۲۸۴. پیگیری در فایل و رابط');
{
  const coverage = dataExportCoverageRows(
    [{ ins: 'A', name: 'اهرم', kind: 'underlying', baseName: 'اهرم' }],
    [pair('A', 20260919)],
    { '20260919:A': { rows: [], source: 'history', attempts: 3 } },
    [{ key: '20260919:A', verdict: 'missing', dailyTrades: 10 }],
  );
  check('برگ پوشش شمارِ تلاش را حمل می‌کند', coverage[0].attempts === 3);
  check('و نبودنش صفر است، نه نامعلوم',
    dataExportCoverageRows([{ ins: 'A' }], [pair('A', 1)], { '1:A': { rows: [] } })[0].attempts === 0);

  const book = readSrc('../ui/data-export-workbook.mjs');
  check('ستونِ «تلاش دریافت» در برگ پوشش هست', book.includes("'تلاش دریافت',"));
  check('و برگ راهنما خلاصه‌اش را می‌گوید', book.includes("['تلاش دریافت', (() => {"));

  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('تب دکمهٔ تلاش تکمیلی دارد', tab.includes('id="de-refill"'));
  // ═══ چهار قاعده‌ای که این حلقه را بی‌خطر می‌کند ═══
  check('هر نشستن از دروازهٔ حفظِ داده رد می‌شود',
    tab.includes('keepBetterTape(items[pair.key], fresh0, expectationFor(pair))'));
  check('فاصله می‌افتد و قابلِ توقف است',
    tab.includes('await sleepUnlessAborted(wait, controller.signal)')
      && tab.includes("signal?.addEventListener('abort', onAbort, { once: true })"));
  // ═══ R5-01: شمارش جابه‌جا شد، پس این ادعا هم ═══
  //
  // ادعای قبلی «افزایش پیش از درخواست، داخلِ حلقهٔ تکمیلی» بود — و همان
  // جایگاه بود که دریافتِ اولیه را از شمارش جا می‌انداخت. حالا شمارش در
  // `fetchBatch` است، یعنی همان دری که **هر** دورِ پرسیدن از آن رد
  // می‌شود؛ پس ادعا این است که حلقهٔ تکمیلی شمارندهٔ جداگانه **ندارد**.
  check('شمارنده یک نقطه دارد و در مسیرِ مشترکِ دریافت است',
    tab.includes('const mark = (record) => markAttempt(record, Date.now())')
      && /items\[pair\.key\] = mark\(keepBetterTape\(/.test(tab));
  check('و حلقهٔ تکمیلی شمارندهٔ جداگانه ندارد',
    !/markAttempt\(prepared\.items\[job\.key\]/.test(tab));
  check('دو دورِ بی‌اثرِ پیاپی حلقه را می‌بندد', tab.includes('if (barren >= 2)'));
  // و پرچمِ درخواست بین دورها عوض می‌شود، وگرنه فقط یک مسیر امتحان می‌شود.
  // ═══ R5-04: ادعا دقیق‌تر شد ═══
  //
  // نسخهٔ اولِ همین قاعده `fresh` را بین دورها عوض می‌کرد، و دورِ «ساده»
  // به کشِ ۹۰۰ثانیه‌ایِ سرور می‌افتاد و اصلاً به بالادست نمی‌رسید — در
  // اجرای آزمایشیِ مرورگر، چهار دور رفته بود و بالادست هر مسیر را فقط سه
  // بار دیده بود. حالا `fresh` **همیشه** روشن است و فقط `bust` عوض
  // می‌شود، پس ادعا هر دو را با هم می‌گزد.
  check('پرچمِ درخواست بین دورها عوض می‌شود',
    tab.includes('const bust = round % 2 === 1')
      && tab.includes('await fetchHistorical(jobs, prepared.items, controller.signal, true, bust)'));
  check('ولی کشِ سرور در هر دو دور دور زده می‌شود',
    !/fetchHistorical\(jobs,[^)]*controller\.signal, false/.test(tab));
  check('و ممیزی بین دورها دوباره حساب می‌شود',
    tab.includes('prepared.audit = dataExportBlankAudit(prepared.pairs, prepared.items, lastDailyByIns, lastOpenDates)'));
  check('توقف، دادهٔ به‌دست‌آمده را نگه می‌دارد',
    tab.includes('دادهٔ به‌دست‌آمده سرِ جایش می‌ماند'));
  check('و سقف‌خوردن بی‌صدا نیست',
    tab.includes('این دیگر «حالا نیامد» نیست'));
}
