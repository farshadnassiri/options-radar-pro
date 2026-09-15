// ۲۴۹. ممیزی ۱۴۰۵/۰۶/۲۴ روی گام سوم بک‌تست
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs
//
// هفت ایراد گزارش شد در حالی که دو دستهٔ مربوط با ۵۲ ادعا سبز بودند. علتش
// در خودِ گزارش آمده بود (ردیف ۷): «آزمون‌ها بیشتر ساختار کد و وجود توابع
// را کنترل می‌کنند، نه اتصال واقعی endpointها.» این دسته قاعده را می‌سنجد.

import { check, group, readSrc } from '../harness.mjs';
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
