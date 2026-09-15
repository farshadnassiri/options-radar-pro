// ۲۴۹. ممیزی ۱۴۰۵/۰۶/۲۴ روی گام سوم بک‌تست
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs
//
// هفت ایراد گزارش شد در حالی که دو دستهٔ مربوط با ۵۲ ادعا سبز بودند. علتش
// در خودِ گزارش آمده بود (ردیف ۷): «آزمون‌ها بیشتر ساختار کد و وجود توابع
// را کنترل می‌کنند، نه اتصال واقعی endpointها.» این دسته قاعده را می‌سنجد.

import { check, group, readSrc } from '../harness.mjs';
import { faNum } from '../../ui/fmt.mjs';
import {
  intradayPathWithGaps, coverageSummary, TF_DAY_STATUS, TF_DAY_LABEL,
} from '../../core/backtest.mjs';
import {
  TRADES_LIVE, TRADES_HISTORY, BATCH_PAIR_CAP, LIVE_CODE_CAP,
  tradesSourceFor, splitTradeDays, tradeBatches, batchKey,
  dayFromBatch, dayFromLiveTape,
} from '../../core/trades-source.mjs';

group('۲۴۹. منبع ریزمعاملهٔ هر روز و شمار درخواست‌ها');
{
  const TODAY = 20260915, YDAY = 20260914;

  // ————— ۱. روز جاری از نقطهٔ پایانی اشتباه خوانده می‌شد —————
  //
  // بازتولید ممیزی: امروز `/api/trades` برای اهرم ۰ ردیف داد و
  // `/api/live-trades` ۱۰٬۷۶۱ ردیف. پس روزی که داده‌اش هست «بی‌معامله»
  // دیده می‌شد.
  check('۱. روز جاری به نوار زنده می‌رود',
    tradesSourceFor(TODAY, { liveDate: TODAY }) === TRADES_LIVE);
  check('۱. روز بسته‌شده به مسیر تاریخی می‌رود',
    tradesSourceFor(YDAY, { liveDate: TODAY }) === TRADES_HISTORY);
  // ═══ چرا `liveDate` و نه ساعتِ رایانه ═══
  //
  // «امروز است» کافی نیست: پیش از باز شدن بازار و در روز غیرمعاملاتی، نوار
  // محتوای جلسهٔ **قبلی** را حمل می‌کند. آن قضاوت را `liveDayOf` کرده و
  // خروجی‌اش همین `liveDate` است؛ صفر یعنی «نمی‌دانیم».
  check('۱. بدون روزِ زندهٔ معتبر، هیچ روزی به نوار نمی‌رود',
    tradesSourceFor(TODAY, { liveDate: 0 }) === TRADES_HISTORY);
  check('۱. و قاعدهٔ فاز بازار اینجا تکرار نشده',
    !readSrc('../core/trades-source.mjs').includes('LIVE_DAY_PHASES'));

  // ————— تقسیم روزها —————
  const split = splitTradeDays([20260910, YDAY, TODAY, 20260916, 0], { liveDate: TODAY, today: TODAY });
  check('روزها بین دو منبع تقسیم می‌شوند',
    split.live.join(',') === String(TODAY) && split.history.join(',') === `20260910,${YDAY}`);
  // روزِ نرسیده نه تاریخی دارد نه نواری؛ فرستادنش فقط یک درخواستِ
  // حتماً‌خالی است — ولی حذفِ بی‌صدایش هم درست نیست.
  check('روز نرسیده درخواست نمی‌سازد ولی جدا گزارش می‌شود',
    split.ahead.join(',') === '20260916'
    && !split.live.includes(20260916) && !split.history.includes(20260916));
  check('روز نامعتبر اصلاً وارد نمی‌شود',
    split.live.length + split.history.length + split.ahead.length === 4);
  check('بدون روزِ زنده، امروز هم تاریخی می‌شود',
    splitTradeDays([TODAY], { liveDate: 0, today: TODAY }).history.join(',') === String(TODAY));

  // ————— ۴. تعداد درخواست —————
  //
  // ممیزی: «برای استراتژی دوپا، ۴۵ روز یعنی حداقل ۱۳۵ درخواست مرورگر و
  // تقریباً همین تعداد درخواست بالادست.»
  const days45 = Array.from({ length: 45 }, (_, i) => 20260701 + i);
  const codes3 = ['ua', 'call', 'put'];
  const batches = tradeBatches(days45, codes3);
  check('۴. ۴۵ روز و سه ابزار در یک درخواست جا می‌شود، نه ۱۳۵ تا',
    batches.length === 1 && batches[0].length === 135);
  check('۴. هر جفت، ابزار و روزِ خودش را دارد',
    batches[0][0].ins === 'ua' && batches[0][0].date === 20260701
    && batches[0].at(-1).date === days45.at(-1));
  // یک روز هیچ‌وقت بین دو درخواست نصف نمی‌شود: وگرنه شکستِ یک تکه، همهٔ
  // روزها را یک پای گم‌شده می‌دهد به‌جای اینکه چند روز را کامل خراب کند.
  const tight = tradeBatches([1, 2, 3].map((d) => 20260900 + d), codes3, { cap: 4 });
  check('۴. روز بین دو درخواست نصف نمی‌شود',
    tight.every((part) => part.length % codes3.length === 0)
    && tight.every((part) => new Set(part.map((row) => row.date)).size === 1));
  check('۴. سقف هر درخواست همان سقف سرور است', BATCH_PAIR_CAP === 1200 && LIVE_CODE_CAP === 24);
  check('۴. بی ابزار، هیچ درخواستی ساخته نمی‌شود', tradeBatches(days45, []).length === 0);
  check('۴. ابزار تکراری دو بار پرسیده نمی‌شود',
    tradeBatches([TODAY], ['a', 'a', 'b'])[0].length === 2);

  // ————— ۵. «دریافت نشد» با «معامله نشده» یکی نیست —————
  //
  // ممیزی: «روز خراب فقط در شمارندهٔ `empty` می‌رود… در نتیجه خرابی شبکه با
  // واقعیت "قرارداد معامله نشده" اشتباه می‌شود.»
  const rows = [{ time: 90000, price: 100, quantity: 5 }];
  const items = {
    [batchKey('ua', YDAY)]: { rows },
    // معامله‌ای نشده — پاسخ سالم، فهرست خالی
    [batchKey('call', YDAY)]: { rows: [] },
    // درخواستش شکست خورده — این «بی‌معامله» نیست
    [batchKey('put', YDAY)]: { rows: [], error: 'HttpError: 502' },
  };
  const day = dayFromBatch(items, YDAY, codes3);
  check('۵. پای بی‌معامله ردیفِ خالی می‌گیرد، نه علامتِ خطا',
    Array.isArray(day.byIns.call) && day.byIns.call.length === 0 && !day.failed.includes('call'));
  check('۵. پایی که دریافت نشد، «بی‌معامله» فرض نمی‌شود',
    day.failed.join(',') === 'put' && !('put' in day.byIns));
  check('۵. پایی که اصلاً در پاسخ نیست هم «دریافت‌نشده» است',
    dayFromBatch({}, YDAY, codes3).failed.join(',') === 'ua,call,put');
  check('۵. منبع هر روز روی خودش نوشته می‌شود', day.source === TRADES_HISTORY);

  // ————— همان قاعده برای نوار زنده —————
  const tape = dayFromLiveTape({
    ua: { rows }, call: { rows: [] }, put: { error: 'شبکه' },
  }, TODAY, codes3);
  check('نوار زنده همان شکل خروجی را می‌دهد',
    tape.byIns.ua.length === 1 && tape.byIns.call.length === 0
    && tape.failed.join(',') === 'put' && tape.source === TRADES_LIVE && tape.date === TODAY);

  // ————— ۶. شکاف واقعی بالادست —————
  //
  // ممیزی: «در آزمایش اهرم… ۲۰۲۶-۰۹-۰۹ برای هر سه ابزار صفر بود، با وجود
  // اینکه روزهای قبل و بعد داده داشتند.» این شکافِ خودِ بالادست است، نه
  // خرابی ما — و باید از خطای دریافت جدا دیده شود.
  const gap = dayFromBatch({
    [batchKey('ua', 20260909)]: { rows: [] },
    [batchKey('call', 20260909)]: { rows: [] },
    [batchKey('put', 20260909)]: { rows: [] },
  }, 20260909, codes3);
  check('۶. روزِ خالیِ بالادست «دریافت‌نشده» علامت نمی‌خورد',
    gap.failed.length === 0 && Object.values(gap.byIns).every((list) => list.length === 0));
}


// ═════════ ۲۵۰. پوشش روزها در گام سوم ═════════
//
// گزارش صاحب پروژه: «همه روزهای درون بازه را انگار پوشش نمیده و برخی روزها
// رو نمیاره.» دو نیمه داشت و هر دو یک ریشه: روزِ بی‌داده بی‌صدا حذف می‌شد.
group('۲۵۰. پوشش روزها در گام سوم و شکافِ دیده‌شدنی');
{
  const cov = [
    { date: 20260908, status: TF_DAY_STATUS.SKIPPED },
    { date: 20260909, status: TF_DAY_STATUS.OK, points: 12 },
    { date: 20260910, status: TF_DAY_STATUS.NO_LEGS, legs: ['ضهرم۲۰۴۰'] },
    { date: 20260913, status: TF_DAY_STATUS.FAILED },
    { date: 20260914, status: TF_DAY_STATUS.NO_BASE },
    { date: 20260915, status: TF_DAY_STATUS.OK, points: 8 },
  ];
  const buckets = [
    { date: 20260909, closePnl: 5, perLeg: [{ netPnl: 5, price: 100 }] },
    { date: 20260909, closePnl: 7, perLeg: [{ netPnl: 7, price: 110 }] },
    { date: 20260915, closePnl: 9, perLeg: [{ netPnl: 9, price: 120 }] },
  ];
  const rows = intradayPathWithGaps(buckets, cov);

  // ═══ نیمهٔ اول: هیچ روزی از فهرست نمی‌افتد ═══
  check('هر روزِ فهرست در خروجی هست', new Set(rows.map((r) => r.date)).size === cov.length,
    `${faNum(new Set(rows.map((r) => r.date)).size)} از ${faNum(cov.length)}`);
  check('روزِ دارای داده سطل‌های واقعی‌اش را نگه می‌دارد',
    rows.filter((r) => r.date === 20260909 && !r.gap).length === 2);
  check('ترتیب فهرست حفظ می‌شود',
    rows.map((r) => r.date).join(',') === '20260908,20260909,20260909,20260910,20260913,20260914,20260915');

  // ═══ نیمهٔ دوم: روزِ بی‌داده شکاف است، نه صفر ═══
  //
  // این تفاوت معاملاتی است، نه نمایشی: بیشینهٔ افت از شکلِ خط خوانده
  // می‌شود، و صفرِ جعلی یا خطی که از روی یک هفته پریده، هر دو عددِ غلط
  // می‌دهند — یکی کمتر از واقع، یکی بیشتر.
  // ادعا باید **گزارش** بدهد، نه پرتاب کند: وقتی ردیف اصلاً ساخته نشود،
  // `gap[key]` خطا می‌دهد و کلِ دسته می‌میرد — و آن‌وقت به‌جای یک سطرِ
  // قرمزِ گویا، یک stack trace می‌گیریم.
  const METRICS = ['closePnl', 'openPnl', 'highPnl', 'lowPnl', 'returnPct', 'basePrice', 'basePct'];
  const gap = rows.find((r) => r.date === 20260913);
  check('روزِ دریافت‌نشده ردیفِ شکاف می‌گیرد', gap?.gap === true, gap ? '' : 'ردیفی ساخته نشد');
  check('و هیچ عددی ندارد — نه صفر، نه حمل‌شده از روز قبل',
    Boolean(gap) && METRICS.every((key) => Number.isNaN(gap[key])),
    gap ? METRICS.filter((key) => !Number.isNaN(gap[key])).join('، ') : 'ردیفی ساخته نشد');
  check('پاهای ردیفِ شکاف خالی‌اند، پس ستون هر پا هم شکاف می‌شود',
    Array.isArray(gap?.perLeg) && gap.perLeg.length === 0);
  check('و علتش روی خودِ ردیف نوشته می‌شود',
    gap?.why === TF_DAY_LABEL.failed
    && rows.find((r) => r.date === 20260914)?.why === TF_DAY_LABEL.noBase);
  check('روزِ بیرونِ سقف هم شکاف می‌گیرد، نه حذف',
    rows.find((r) => r.date === 20260908)?.why === TF_DAY_LABEL.skipped);

  // ═══ چهار علتِ متفاوت، چهار جملهٔ متفاوت ═══
  //
  // «خطای دریافت» یعنی دوباره تلاش کن؛ «نماد پایه معامله نشد» یعنی واقعیتِ
  // بازار است و تلاش دوباره عوضش نمی‌کند. یک جمله برای هر دو، تصمیمِ کاربر
  // را خراب می‌کند.
  const labels = Object.values(TF_DAY_LABEL);
  check('هر وضعیت جملهٔ فارسیِ جدا دارد',
    new Set(labels).size === labels.length && labels.every((text) => text.length > 2));
  check('هر کدِ وضعیت جمله دارد',
    Object.values(TF_DAY_STATUS).every((key) => typeof TF_DAY_LABEL[key] === 'string' && TF_DAY_LABEL[key]));

  const sum = coverageSummary(cov);
  check('خلاصه هر علت را جدا می‌شمارد',
    sum.ok === 2 && sum.noLegs === 1 && sum.failed === 1 && sum.noBase === 1 && sum.skipped === 1);
  check('و جمعش همان تعداد روزهای بازه است', sum.total === 6);
  check('فهرست خالی هم پرتاب نمی‌کند',
    intradayPathWithGaps().length === 0 && coverageSummary().total === 0);
  // سطلی که روزش در فهرست پوشش نیست، بی‌صدا وارد نمی‌شود: فهرستِ مرجع
  // همان فهرست است، نه اتحادِ دو منبع.
  check('سطلِ روزِ خارج از فهرست وارد خروجی نمی‌شود',
    !intradayPathWithGaps([{ date: 20261231, closePnl: 1, perLeg: [] }], cov).some((r) => r.date === 20261231));
}
