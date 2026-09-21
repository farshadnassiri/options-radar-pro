// ۲۸۹. سهمیهٔ بالادست — «نیامد» با «نگذاشتند بیاید» یکی نیست
//
// ═══ اندازه‌گیری‌ای که این دسته را ساخت ═══
//
// سه اجرای پشت سر هم روی همان ۳۰۰ ابزار/روز، با هدرهای کامل، از ماشینِ
// صاحب پروژه:
//
//     اجرا    داده آمد   خالی   میانگینِ پاسخ
//     اول        ۲۹۴       ۰      ۷۰۱ms
//     دوم        ۱۷۸     ۱۱۰    ۱٬۳۰۵ms
//     سوم          ۰     ۳۰۰       ۶۵ms      ← سیصد درخواست در پنج ثانیه
//
// و شکلِ پاسخ در اجرای سوم: `HTTP 200` با `{"tradeHistory":[]}` — نه
// ۴۲۹، نه ۴۰۳، نه خطا. **دقیقاً همان چیزی که روزِ بی‌معامله برمی‌گرداند.**
//
// برای همین خروجیِ هفتگیِ گزارش‌شده ۳۵۹ ابزار/روز را «ریزمعامله نیامد»
// نوشت، در حالی که داده روی بورس بود: درخواستِ تکیِ همان پنج روز، هر پنج
// بار با تابلو خواند.

import { check, group, readSrc } from '../harness.mjs';
import { THROTTLE_STREAK, makeThrottleWatch, throttleNote } from '../../core/throttle-watch.mjs';
import { REFILL_REASON, refillQueue, refillSummary } from '../../core/refill-queue.mjs';
import { BLOCKED_STATUS, dataExportCoverageRows, dataExportOutcome } from '../../core/data-export.mjs';

/** پاسخی که تابلو تکذیبش می‌کند: مرجع معامله دارد، نوار خالی است. */
const denied = { emptyBoth: true, reference: { trades: 7736, volume: 73305224, quiet: false } };
/** پاسخِ سالم. */
const served = { emptyBoth: false, reference: { trades: 7736, volume: 73305224, quiet: false } };

group('۲۸۹. ناظر فقط وقتی رأی می‌دهد که تابلو تکذیب کند');
{
  const w = makeThrottleWatch();
  check('یک خالیِ تکذیب‌شده هنوز حکم نیست', w.saw(denied) === false);
  check('و ناظر هنوز سالم است', w.throttled() === false);

  // ═══ چرا صفرِ تأییدشده رأی ندارد ═══
  //
  // روزی که تابلو خودش می‌گوید معامله‌ای نشده، نوارِ خالی‌اش **درست**
  // است. شمردنش یعنی یک بازارِ ساکت را سهمیه خواندن.
  const quiet = makeThrottleWatch();
  for (let i = 0; i < THROTTLE_STREAK * 2; i += 1) {
    quiet.saw({ emptyBoth: true, reference: { trades: 0, volume: 0, quiet: true } });
  }
  check('صفرِ تأییدشده هرگز حکمِ سهمیه نمی‌دهد', quiet.throttled() === false);

  // و بی مرجع هم همین‌طور: نمی‌دانیم، پس حکم نمی‌دهیم.
  const blind = makeThrottleWatch();
  for (let i = 0; i < THROTTLE_STREAK * 2; i += 1) blind.saw({ emptyBoth: true, reference: null });
  check('بی مرجع هم حکمی داده نمی‌شود', blind.throttled() === false);
}

group('۲۸۹. رشتهٔ پیاپی، و چیزی که می‌شکندش');
{
  const w = makeThrottleWatch();
  for (let i = 0; i < THROTTLE_STREAK - 1; i += 1) w.saw(denied);
  check('یکی مانده به سقف، هنوز حکم نیست', w.throttled() === false);
  check('و دقیقاً سرِ سقف حکم صادر می‌شود', w.saw(denied) === true);
  check('حالت شمارِ رشته را می‌گوید', w.state().run === THROTTLE_STREAK);
  check('و زمانِ حکم ثبت می‌شود', w.state().since > 0);

  // ═══ یک پاسخِ سالم رشته را می‌شکند ═══
  //
  // این مهم است: اگر بالادست وسطِ کار جواب بدهد، یعنی سهمیه باز است و
  // خالی‌های قبلی هر کدام علتِ خودشان را داشتند.
  const mixed = makeThrottleWatch();
  for (let i = 0; i < THROTTLE_STREAK - 1; i += 1) mixed.saw(denied);
  mixed.saw(served);
  for (let i = 0; i < THROTTLE_STREAK - 1; i += 1) mixed.saw(denied);
  check('پاسخِ سالم رشته را صفر می‌کند', mixed.throttled() === false);
  check('ولی بیشینهٔ رشته یادش می‌ماند', mixed.state().worst === THROTTLE_STREAK - 1);

  check('سقف عددِ معقولی است', THROTTLE_STREAK >= 5 && THROTTLE_STREAK <= 30);
  check('و حکم جملهٔ فارسی دارد',
    throttleNote(w.state()).includes('سهمیه') && throttleNote({ throttled: false }) === '');
}

group('۲۸۹. فایل علتِ درست را می‌نویسد');
{
  const pairs = [{ key: '20260919:A', ins: 'A', date: 20260919 }];
  const instruments = [{ ins: 'A', name: 'اهرم', kind: 'underlying', baseName: 'اهرم' }];
  const audit = [{ key: '20260919:A', verdict: 'missing', dailyTrades: 7736 }];

  // بی پرچمِ سهمیه، همان حکمِ قبلی می‌ماند.
  const plain = dataExportCoverageRows(instruments, pairs,
    { '20260919:A': { rows: [], source: 'history' } }, audit);
  check('خالیِ عادی هنوز «ریزمعامله نیامد» است', plain[0].status === 'ریزمعامله نیامد');
  check('و پرچمِ سهمیه ندارد', plain[0].throttled === false);

  // ═══ با پرچمِ سهمیه، علت عوض می‌شود ═══
  const blocked = dataExportCoverageRows(instruments, pairs,
    { '20260919:A': { rows: [], source: 'history', throttled: true } }, audit);
  check('ردیفِ پشتِ سهمیه «نیامد» نوشته نمی‌شود',
    blocked[0].status === BLOCKED_STATUS.throttled && blocked[0].status !== 'ریزمعامله نیامد');
  check('و پرچمش حمل می‌شود', blocked[0].throttled === true);

  // سهمیه بر خطا هم مقدم است: حکمِ سرور دربارهٔ این ردیف صادق‌تر است.
  const both = dataExportCoverageRows(instruments, pairs,
    { '20260919:A': { rows: [], source: 'history', throttled: true, error: 'سهمیهٔ بالادست بسته شد' } }, audit);
  check('سهمیه بر برچسبِ خطا مقدم است', both[0].status === BLOCKED_STATUS.throttled);

  check('سه علتِ نرسیدن نام‌گذاری‌شده‌اند',
    BLOCKED_STATUS.throttled && BLOCKED_STATUS.absent && BLOCKED_STATUS.error);
}

group('۲۸۹. سرور و تب هر دو می‌ایستند');
{
  const server = readSrc('../server/server.mjs');
  // ═══ ترتیبی، نه موازی ═══
  //
  // تشخیصِ وسطِ کار فقط وقتی می‌تواند جلوی بقیه را بگیرد که بقیه هنوز
  // نرفته باشند. `Promise.all` همه را با هم می‌فرستد و حکم بی‌اثر می‌شود.
  check('بستهٔ سرور ترتیبی اجرا می‌شود',
    server.includes('for (const { key, code, date, expect } of requests)')
      && !server.includes('requests.map(one)'));
  check('و به‌محضِ حکم، بقیه پرسیده نمی‌شوند',
    server.includes('if (watch.throttled()) {')
      && server.includes("throttled: true, error: 'سهمیهٔ بالادست بسته شد؛ این ابزار/روز پرسیده نشد'"));
  check('حکم به مصرف‌کننده هم گفته می‌شود',
    server.includes('throttled: true, throttleNote: throttleNote(state), stopped'));

  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('تب بستهٔ بعدی را نمی‌فرستد',
    tab.includes('if (payload.throttled) throttled =') && tab.includes('if (throttled) {'));
  check('و حلقهٔ تکمیلی هم دورِ بعد را نمی‌زند',
    tab.includes('تلاش تکمیلی متوقف شد —'));
  check('هر اجرای تازه پرچم را پاک می‌کند', tab.includes('throttled = null;'));

  // ═══ نرخ، که علتِ اصلی بود ═══
  const settings = readSrc('../core/settings.mjs');
  check('سقفِ نرخ پایین آمد', /key: 'ratePerSec'[\s\S]{0,80}def: 3,/.test(settings));
  check('و هم‌زمانی هم', /key: 'concurrency'[\s\S]{0,80}def: 2,/.test(settings));

  const tool = readSrc('../tools/verify-export.mjs');
  check('ابزارِ کنترل سهمیه را جدا می‌شمارد',
    tool.includes("const throttled = count('سهمیهٔ بالادست')")
      && tool.includes('سهمیهٔ بالادست در این اجرا بسته نشد'));
}

group('۲۸۹. سهمیه در جمع‌بندی، خطا شمرده نمی‌شود');
{
  // ═══ چیزی که هارنسِ مرورگر گرفت ═══
  //
  // جملهٔ وضعیت نوشت «۵۰ ابزار/روز خطادار» — در حالی که آن ۵۰ تا اصلاً
  // پرسیده نشده بودند. برنامه شکست نخورده بود؛ بالادست در را بسته بود.
  const pairs = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }];
  const out = dataExportOutcome(pairs, {
    a: { rows: [{ x: 1 }, { x: 2 }], source: 'history' },
    b: { rows: [], source: 'history', throttled: true, error: 'سهمیهٔ بالادست بسته شد' },
    c: { rows: [], source: 'history', error: 'دروازه' },
    // d عمداً نیست: «درخواست نرفت».
  });
  check('ابزار/روزِ پشتِ سهمیه جدا شمرده می‌شود', out.throttled === 1);
  check('و در «خطادار» نمی‌نشیند، با آنکه متنِ خطا دارد', out.failed === 1);
  check('خطای واقعی سرِ جایش می‌ماند', out.failed === 1 && out.trades === 2);
  check('و پرچمِ توقف بالا می‌آید', out.throttleStopped === true);
  check('بی سهمیه، پرچم بالا نمی‌آید',
    dataExportOutcome([{ key: 'a' }], { a: { rows: [], source: 'history' } }).throttleStopped === false);

  // ═══ و جفتی که به‌خاطر سهمیه اصلاً فرستاده نشد ═══
  //
  // تب حلقه را می‌بندد، ولی جفت‌های نرفته باید **علت** داشته باشند؛
  // وگرنه در فایل «درخواست نرفت» می‌گیرند و علتشان گم می‌شود. در هارنس
  // ۴۰۲ ردیف دقیقاً همین شکل را داشتند.
  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('جفت‌های نفرستاده علتِ سهمیه می‌گیرند',
    tab.includes('for (let rest = index; rest < batches.length; rest += 1)')
      && tab.includes("error: 'سهمیهٔ بالادست بسته شد؛ این ابزار/روز پرسیده نشد',"));
  check('ولی جفتی که پاسخ گرفته دست نمی‌خورد',
    tab.includes('if (items[pair.key]) continue;'));
}

group('۲۸۹. صف هم علتِ درست را می‌داند');
{
  // ردیفِ پشتِ سهمیه باید در صف بماند — بالاخره باید گرفته شود — ولی
  // «خطادار» خوانده نشود. در هارنس، جملهٔ رابط ۴۵۲ ردیف را «خطادار»
  // نوشت در حالی که هیچ‌کدام خطا نداده بودند.
  const pairs = [{ key: '20260919:A', ins: 'A', date: 20260919 },
    { key: '20260919:B', ins: 'B', date: 20260919 }];
  const audit = [{ key: '20260919:A', verdict: 'missing', dailyTrades: 10 }];
  const queue = refillQueue(pairs, {
    '20260919:A': { rows: [], source: 'history', throttled: true, error: 'سهمیهٔ بالادست بسته شد' },
    '20260919:B': { rows: [], source: 'history', error: 'دروازه' },
  }, audit);

  check('ردیفِ پشتِ سهمیه در صف می‌ماند', queue.length === 2);
  const mine = queue.find((job) => job.key === '20260919:A');
  check('ولی علتش «سهمیه» است، نه «خطا»', mine.reason === 'throttled');
  check('و علت برچسبِ فارسی دارد', REFILL_REASON.throttled.includes('سهمیه'));
  check('خطای واقعی هنوز «خطا» است',
    queue.find((job) => job.key === '20260919:B').reason === 'error');

  const sum = refillSummary(queue);
  check('جمع‌بندی سهمیه را جدا می‌شمارد', sum.throttled === 1 && sum.error === 1);
}
