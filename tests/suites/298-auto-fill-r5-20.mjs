// ۲۹۸. «کل بازه» روزهای جامانده را خودش دوباره می‌گیرد (R5-20)
//
// خواستهٔ صاحب پروژه: «هرجا نمودار کشیده می‌شود یا دیتای جدولی هست، دیتا
// کامل باشد و بریدگی نداشته باشد.» از R5-19 روزِ ناقص رسم نمی‌شد و علتش
// نوشته می‌شد؛ ولی تا کاربر دوباره نمی‌زد خالی می‌ماند. حالا همان روزها پس
// از مکث دوباره پرسیده می‌شوند — مکثِ بلند پشتِ سهمیه، کوتاه پس از خطا.

import { check, group, readSrc } from '../harness.mjs';
import {
  AUTO_FILL_BARREN, AUTO_FILL_MAX_ROUNDS, fillDelayMs, fillNext, fillPending, fillStopText,
} from '../../core/auto-fill.mjs';
import { TF_DAY_STATUS } from '../../core/backtest.mjs';

group('۲۹۸. کدام روز دوباره پرسیده می‌شود');
{
  const coverage = [
    { date: 14050701, status: TF_DAY_STATUS.OK },
    { date: 14050702, status: TF_DAY_STATUS.FAILED },
    { date: 14050703, status: TF_DAY_STATUS.BASE_GAP },
    { date: 14050704, status: TF_DAY_STATUS.NO_BASE },
    { date: 14050705, status: TF_DAY_STATUS.NO_LEGS },
    { date: 14050706, status: TF_DAY_STATUS.NO_POINTS },
    { date: 14050707, status: TF_DAY_STATUS.SKIPPED },
  ];
  check('«خطای دریافت» و «پاسخ ناقص پایه» — چون «نرسید» یعنی دوباره بپرس',
    fillPending(coverage).join() === '14050702,14050703');
  check('بی‌معاملگیِ واقعی و روزِ بیرون از سقف دوباره پرسیده نمی‌شوند',
    !fillPending(coverage).some((date) => [14050704, 14050705, 14050706, 14050707].includes(date)));
  check('ورودیِ خالی یا خراب صف خالی می‌دهد', fillPending().length === 0 && fillPending(null).length === 0);
}

group('۲۹۸. مکث: بلند پشتِ سهمیه، کوتاه پس از خطا');
{
  check('پشتِ سهمیه از پنج دقیقه شروع می‌شود — سهمیه دست‌کم نیم ساعت می‌ماند',
    fillDelayMs({ round: 1, throttled: true }) === 5 * 60000);
  check('و تا یک ربع بالا می‌رود، نه بیشتر',
    fillDelayMs({ round: 2, throttled: true }) === 10 * 60000
    && fillDelayMs({ round: 9, throttled: true }) === 15 * 60000);
  check('خطای گذرا همان مکثِ «تلاش تکمیلی» تب خروجی را می‌گیرد: از نیم دقیقه',
    fillDelayMs({ round: 1 }) === 30000 && fillDelayMs({ round: 2 }) === 60000);
}

group('۲۹۸. کِی بس است');
{
  check('چیزی نماند: تمام', fillNext({ round: 1, pending: 0 }).reason === 'done');
  const barren1 = fillNext({ round: 1, pending: 3, filled: 0, throttled: false, barren: 0 });
  check('یک دورِ بی‌ثمر هنوز توقف نیست', barren1.stop === false && barren1.barren === 1);
  check(`${AUTO_FILL_BARREN} دورِ بی‌ثمرِ پیاپی یعنی بالادست همین را دارد`,
    fillNext({ round: 2, pending: 3, filled: 0, throttled: false, barren: 1 }).reason === 'barren');
  check('دورِ پشتِ سهمیه بی‌ثمر شمرده نمی‌شود — اصلاً پرسیده نشده',
    fillNext({ round: 2, pending: 3, filled: 0, throttled: true, barren: 1 }).stop === false
    && fillNext({ round: 2, pending: 3, filled: 0, throttled: true, barren: 1 }).barren === 1);
  check('دورِ ثمربخش شمارنده را صفر می‌کند',
    fillNext({ round: 3, pending: 2, filled: 1, barren: 1 }).barren === 0);
  check(`پس از ${AUTO_FILL_MAX_ROUNDS} دور، تصمیم با کاربر است`,
    fillNext({ round: AUTO_FILL_MAX_ROUNDS, pending: 2, filled: 1 }).reason === 'rounds');
  check('ادامه، مکثِ درست را با خودش دارد',
    fillNext({ round: 1, pending: 2, filled: 0, throttled: true }).wait === 5 * 60000);
  check('هر توقف جملهٔ خودش را دارد و عددِ جامانده را می‌گوید',
    fillStopText('barren', 3).includes('۳ روز') && fillStopText('rounds', 2).includes('۲ روز')
    && fillStopText('stopped', 4).includes('۴ روز') && fillStopText('done').includes('کامل'));
}

group('۲۹۸. سیم‌کشی در آزمایشگاه');
{
  const back = readSrc('../ui/tabs/backtest.mjs');
  check('پس از «تحلیل کل بازه»، تکمیلِ خودکار راه می‌افتد', back.includes('if (loaded) autoFill(loaded);'));
  check('هر دور فقط جامانده‌ها را می‌گیرد، از کشِ سرور رد می‌شود و مهر را یک‌درمیان عوض می‌کند',
    back.includes("loadTimeframeDays({ fresh: true, bust: round % 2 === 1, alive })")
    && back.includes('const missing = wanted.filter((date) => !tradesCache.has(date));'));
  check('و نمودار با هر دور دوباره رسم می‌شود', /const filled = [^\n]+\n\s+applyTimeframe\(loaded\);/.test(back));
  check('سهمیه که بسته شد، بسته‌های بعدی نمی‌روند',
    back.includes('if (batchThrottled) {') && back.includes('days.set(date, dayFromBatch({}, date, codes));'));
  check('و پرسشِ دوبارهٔ «پاسخ ناقص پایه» هم پشتِ سهمیه نمی‌رود',
    back.includes('const suspect = loaded.throttled ? [] : wanted.filter('));
  check('ترکیبِ تازه تکمیلِ قبلی را کنار می‌گذارد و روزِ کهنه در کش نمی‌نشیند',
    (back.match(/stopAutoFill\(\); tradesCache\.clear\(\);/g) || []).length === 2
    && back.includes('if (!alive()) return null;'));
  check('کاربر می‌تواند تکمیل را متوقف کند', back.includes('id="bt-tf-fill-stop"')
    && back.includes("$('bt-tf-fill-stop').addEventListener('click'"));
  check('شمارشِ درخواست فقط بسته‌های رفته را می‌شمارد', back.includes('batches: sent, throttled: batchThrottled'));
}
