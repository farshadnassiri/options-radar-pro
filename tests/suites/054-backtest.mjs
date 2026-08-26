// ۵۳. روزِ قفل‌شدهٔ ریزمعامله
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { inIntradaySession } from '../../core/backtest.mjs';


// ═══════════════════════════ ۵۳. روزِ قفل‌شدهٔ ریزمعامله ═══════════════════════════
group('۵۳. روزِ قفل‌شدهٔ ریزمعامله');
{
  const src53 = readSrc('../ui/tabs/backtest.mjs');

  // گزارش کاربر: «گاهی این پیام را می‌دهد، روز قبل و بعدش سالم است.»
  //
  // علت: هر نتیجه‌ای کش می‌شد، حتی وقتی درخواستِ یکی از پاها شکست خورده بود.
  // یک خطای گذرای بالادست — سهمیه، مهلت، ۵۰۲ — آن روز را تا پایان نشست قفل
  // می‌کرد و هر بار باز کردنش همان نتیجهٔ خرابِ کش‌شده را برمی‌گرداند.
  check('نتیجهٔ ناقص کش نمی‌شود',
    /if \(!requiredMissing\(failed\)\.length\) tradesCache\.set\(date, result\);/.test(src53));
  check('گرفتن دوباره با اجبار ممکن است', src53.includes('async function fetchDayTrades(date, { force = false } = {})'));
  check('دکمهٔ تلاش دوباره همان روز را از کش پاک می‌کند',
    src53.includes("tradesCache.delete(intradayDate);") && src53.includes('bt-intraday-retry'));

  // سه علت کاملاً متفاوت به یک نتیجه می‌رسیدند و هر سه یک جملهٔ واحد
  // می‌گرفتند. آن جمله برای دو تای اول دروغ بود: خرابیِ ما را به‌عنوان
  // واقعیتِ بازار گزارش می‌کرد.
  check('علت نبودِ خط زمانی تفکیک می‌شود، نه یک جملهٔ واحد',
    src53.includes('function intradayGap(day)')
    && ["'fetch'", "'fetch-base'", "'quiet'", "'partial'"].every((k) => src53.includes(k)));
  check('پیام قدیمیِ گمراه‌کننده دیگر نیست',
    !src53.includes('برای این روز، قیمت تمام پاها در بازهٔ ۹:۰۰ تا ۱۲:۳۰ کامل نشده است'));
  // «معامله نشده» واقعیت بازار است و تلاش دوباره دردی دوا نمی‌کند؛ فقط
  // خرابیِ دریافت دکمه می‌گیرد.
  check('تلاش دوباره فقط برای خرابی دریافت است، نه برای پای بی‌معامله',
    src53.includes("gap.kind.startsWith('fetch')"));
  check('نام پای بی‌معامله گفته می‌شود، نه فقط شمارش',
    src53.includes('function legsWithoutTrades(byIns)') && src53.includes('quiet.map('));
  // معاملهٔ باطل‌شده و قیمت صفر نباید «معامله» حساب شوند
  check('شمارش معامله، باطل‌شده و قیمت صفر را کنار می‌گذارد',
    /!t\.canceled && Number\(t\.price\) > 0 && inIntradaySession\(t\.time\)/.test(src53));
  // نتیجهٔ ناقص کش نمی‌شود، ولی پیام خطا باید بداند چه شد
  check('آخرین دریافتِ کش‌نشده برای ساختن پیام نگه داشته می‌شود',
    src53.includes('let lastDayFetch = null;') && src53.includes('lastDayFetch = result;'));
}
