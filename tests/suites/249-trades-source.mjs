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
  intradayPathWithGaps, coverageSummary, baseGapSuspect, TF_DAY_STATUS, TF_DAY_LABEL,
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
    [batchKey('ua', YDAY)]: { rows, complete: true },
    // معامله‌ای نشده — پاسخ سالم، فهرست خالی
    [batchKey('call', YDAY)]: { rows: [], complete: true, verified: true, quiet: true },
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
  const broken = dayFromBatch({
    [batchKey('ua', YDAY)]: { rows, complete: false, verified: true, shortfall: { trades: 10 } },
    [batchKey('call', YDAY)]: { rows, complete: false, verified: false },
    [batchKey('put', YDAY)]: { rows: [], complete: false, throttled: true },
  }, YDAY, codes3);
  // ═══ R5-19: «تأییدنشده» از این ادعا جدا شد ═══
  //
  // نسخهٔ قبلی نوارِ **پرِ** بی‌مرجع (`call` بالا) را هم دریافت‌نشده
  // می‌خواست. اندازه‌گیری نشان داد هزینه‌اش چیست: پای منقضی تابلوی تک‌روز
  // ندارد، پس هر ۳۰ روزِ یک تحلیل از نمودار افتاد در حالی که نوارش کامل
  // رسیده بود. ناقصِ **اثبات‌شده** و سهمیه‌خورده بیرون می‌مانند؛ پرِ
  // بی‌مرجع رسم می‌شود و نامش در `unverified` می‌آید.
  check('نوار ناقصِ اثبات‌شده و سهمیه‌خورده وارد محاسبهٔ روز نمی‌شوند',
    broken.failed.join(',') === 'ua,put' && !('ua' in broken.byIns) && !('put' in broken.byIns));
  check('ولی نوارِ پرِ تأییدنشده رسم می‌شود — با نامش',
    broken.byIns.call?.length === rows.length && broken.unverified.join(',') === 'call');
  check('و نوارِ خالیِ بی‌مرجع دریافت‌نشده است، نه بی‌معامله',
    dayFromBatch({ [batchKey('ua', YDAY)]: { rows: [], complete: false, verified: false } }, YDAY, ['ua']).failed.join(',') === 'ua');
  check('پاسخ بی‌حکم به جای بی‌معامله، دریافت‌نشده است',
    dayFromBatch({ [batchKey('ua', YDAY)]: { rows: [] } }, YDAY, ['ua']).failed.join(',') === 'ua');

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
    [batchKey('ua', 20260909)]: { rows: [], complete: true, verified: true, quiet: true },
    [batchKey('call', 20260909)]: { rows: [], complete: true, verified: true, quiet: true },
    [batchKey('put', 20260909)]: { rows: [], complete: true, verified: true, quiet: true },
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


// ═════════ ۲۵۲. پاسخِ ناقص، نه واقعیتِ بازار ═════════
//
// ممیزی (۱۴۰۵/۰۶/۲۴): سه روزِ ۲۱ تا ۲۳ شهریور «نماد پایه معامله نشد»
// گرفتند، در حالی که درخواستِ مستقیمِ همان endpoint برای اهرم ۹۷۵ و ۹۴۹ و
// ۵٬۸۴۵ معامله داد. پاسخِ خالیِ لحظه‌ای کش شده بود و مثل واقعیتِ بازار
// رفتار می‌کرد.
group('۲۵۲. پاسخِ خالیِ پایه که واقعیتِ بازار نبود');
{
  const t = (time, price) => ({ time, price, quantity: 5, canceled: false });
  // ═══ تشخیص، از خودِ داده ═══
  //
  // برای فهمیدنش لازم نیست بیرون را بپرسیم: اختیارِ روی یک نماد وقتی
  // معامله می‌شود که خودِ نماد باز و فعال است.
  check('پایهٔ خالی در روزی که پاها معامله دارند، مشکوک است',
    baseGapSuspect({ baseTrades: [], legTrades: [[t(94300, 450)]] }) === true);
  check('روزِ واقعاً ساکت مشکوک نیست',
    baseGapSuspect({ baseTrades: [], legTrades: [[], []] }) === false);
  check('وقتی پایه معامله دارد، مشکوک نیست',
    baseGapSuspect({ baseTrades: [t(94300, 2400)], legTrades: [[t(94300, 450)]] }) === false);
  // معاملهٔ بیرونِ جلسه و معاملهٔ باطل، «فعالیت» شمرده نمی‌شوند — وگرنه
  // روزِ واقعاً ساکت هم مشکوک می‌شد و بی‌جهت دوباره پرسیده.
  check('پیش‌گشایش فعالیت شمرده نمی‌شود',
    baseGapSuspect({ baseTrades: [], legTrades: [[t(84500, 450)]] }) === false);
  check('معاملهٔ باطل هم فعالیت شمرده نمی‌شود',
    baseGapSuspect({ baseTrades: [], legTrades: [[{ ...t(94300, 450), canceled: true }]] }) === false);
  check('قیمت صفر فعالیت نیست',
    baseGapSuspect({ baseTrades: [], legTrades: [[t(94300, 0)]] }) === false);
  // و برعکس: پایه‌ای که فقط بیرونِ جلسه معامله دارد، در جلسه خالی است
  check('پایهٔ فقط‌پیش‌گشایشی هم ناقص شمرده می‌شود',
    baseGapSuspect({ baseTrades: [t(84500, 2400)], legTrades: [[t(94300, 450)]] }) === true);
  check('ورودی خالی پرتاب نمی‌کند', baseGapSuspect() === false && baseGapSuspect({}) === false);

  // ═══ وضعیتِ جدا، چون کارِ جدا می‌خواهد ═══
  //
  // «معامله نشده» یعنی تمام؛ «ناقص» یعنی دوباره بپرس. تا امروز هر دو یک
  // چیز شمرده می‌شدند و روز برای همیشه می‌رفت.
  check('وضعیتِ ناقص از «معامله نشد» جداست',
    TF_DAY_STATUS.BASE_GAP === 'baseGap' && TF_DAY_STATUS.BASE_GAP !== TF_DAY_STATUS.NO_BASE);
  check('و جملهٔ خودش را دارد که متناقض‌بودن را می‌گوید',
    TF_DAY_LABEL.baseGap.includes('ناقص') && TF_DAY_LABEL.baseGap !== TF_DAY_LABEL.noBase);
  check('در خلاصه هم جدا شمرده می‌شود',
    coverageSummary([{ status: TF_DAY_STATUS.BASE_GAP }, { status: TF_DAY_STATUS.NO_BASE }]).baseGap === 1);
  check('و روی نمودار شکاف می‌گیرد، نه حذف',
    intradayPathWithGaps([], [{ date: 20260912, status: TF_DAY_STATUS.BASE_GAP }])[0]?.why
      === TF_DAY_LABEL.baseGap);

  // ═══ و مسیرِ تلاش دوباره ═══
  const src252 = readSrc('../ui/tabs/backtest.mjs');
  check('روزِ مشکوک بی کش دوباره پرسیده می‌شود',
    src252.includes("loadTradeDays(suspect, codes, { fresh: true })")
    && src252.includes('for (const date of suspect) tradesCache.delete(date);'));
  check('و پاسخِ ناقص هرگز کش نمی‌شود',
    /if \(gap\) \{ coverage\.push\(\{ \.\.\.row, status: TF_DAY_STATUS\.BASE_GAP \}\); continue; \}[\s\S]{0,80}tradesCache\.set/.test(src252));
  const srv252 = readSrc('../server/server.mjs');
  check('سرور هم راهِ «بی کش» دارد',
    srv252.includes('const fresh = body.fresh === true;')
    // R5-04: «بی کش» حالا یک گزینهٔ `bust` هم می‌گیرد — کشِ ما در هر دو
    // حالت دور زده می‌شود و فقط شکلِ URLِ بالادست فرق می‌کند.
    && srv252.includes('fresh ? await getFresh(pathname, 2, 6, { bust }) : await get(pathname, S.ttlDailySec, 6)'));
  // ═══ و عمرِ کوتاهِ پاسخِ خالی ═══
  check('پاسخِ خالی برچسب می‌خورد و عمرِ کوتاه‌تر می‌گیرد',
    srv252.includes('empty: firstList(data).length === 0')
    && srv252.includes('hit?.empty ? Math.min(ttlSec, Math.max(0, num(S.ttlEmptySec, 60)))'));
}
