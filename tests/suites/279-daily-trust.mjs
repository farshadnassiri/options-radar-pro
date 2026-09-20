// ۲۷۹. منبع جایگزینِ روزانه، و خطای جزئی که خالی می‌شد
//
// بند ۵ و ۷ ممیزیِ ۱۴۰۵/۰۶/۲۹.
//
// بند ۵ — نمونهٔ واقعیِ اهرم برای `20260919`:
//   `GetClosingPriceHistory` یک رکورد داد با `dEven=0`، ساعت ۰۶:۱۲:۰۶،
//   صفر معامله و قیمت ۷۵٬۰۶۴. روزانهٔ همان روز پایانیِ ۷۳٬۵۲۷ داشت و
//   ۷۵٬۰۶۴ قیمتِ **روز قبل** بود. کد آن را `date:0` می‌کرد و چون آرایه
//   خالی نبود `source:'history'` می‌داد — شکست، با ظاهرِ موفقیت.
//
// بند ۷ — خطای هر ابزار داخل پاسخِ موفقِ دسته‌ای می‌آمد و مصرف‌کننده فقط
//   `value.rows || []` را نگه می‌داشت.

import { check, group, readSrc } from '../harness.mjs';
import {
  coversDailyDate, dailyRowRejection, dailyRowTrusted, dailySecond,
  trustedDailyRows, validDailyDate,
} from '../../core/daily-trust.mjs';

group('۲۷۹. بازتولیدِ رکوردِ بدقلق');
{
  // همان رکوردی که ممیزی گرفت.
  const bad = { date: 0, hEven: 61206, trades: 0, vol: 0, close: 75064 };
  check('رکوردِ `dEven=0` روزانهٔ معتبر نیست', !dailyRowTrusted(bad));
  check('و دلیلش «تاریخ نامعتبر» است', dailyRowRejection(bad) === 'تاریخ نامعتبر');

  // همان رکورد، این بار با تاریخِ درست ولی همان مهرِ زمانیِ پیش‌جلسه.
  const preSession = { date: 20260919, hEven: 61206, trades: 0, vol: 0, close: 75064 };
  check('عکسِ پیش‌جلسه هم پذیرفته نمی‌شود', !dailyRowTrusted(preSession));
  check('و دلیلش جدا گفته می‌شود', dailyRowRejection(preSession) === 'عکس پیش‌جلسه');

  // ولی رکوردِ واقعیِ همان روز باید رد نشود.
  check('روزانهٔ واقعیِ همان روز می‌ماند',
    dailyRowTrusted({ date: 20260919, hEven: 123000, trades: 7736, vol: 73305224, close: 73527 }));
  // ═══ و ردیفِ بی‌ساعت مشکوک نیست ═══
  //
  // بیشترِ ردیف‌های سالمِ فهرست روزانه اصلاً `hEven` ندارند؛ اگر صفرِ ساعت
  // «پیش‌جلسه» خوانده شود، دروازه کلِ فهرست روزانه را می‌خورد.
  check('ردیفِ بی‌ساعت با صفر معامله رد نمی‌شود',
    dailyRowTrusted({ date: 20260919, hEven: 0, trades: 0, vol: 0, close: 73527 }));
  // و ردیفِ پیش‌جلسه‌ای که **معامله دارد** هم رد نمی‌شود: مهرِ زمانی
  // به‌تنهایی مدرک نیست؛ صفر بودنِ معامله و حجم است که آن را عکس می‌کند.
  check('ساعتِ زودهنگام با معاملهٔ ثبت‌شده رد نمی‌شود',
    dailyRowTrusted({ date: 20260919, hEven: 61206, trades: 5, vol: 100 }));
}

group('۲۷۹. دروازه‌ها و صافی');
{
  check('تاریخِ هشت‌رقمیِ معتبر می‌گذرد', validDailyDate(20260919));
  check('صفر نمی‌گذرد', !validDailyDate(0));
  check('هفت‌رقمی نمی‌گذرد', !validDailyDate(2026091));
  check('ماهِ ۱۳ نمی‌گذرد', !validDailyDate(20261319));
  check('روزِ صفر نمی‌گذرد', !validDailyDate(20260900));
  check('ساعت به ثانیه درست ترجمه می‌شود', dailySecond(61206) === (6 * 3600) + (12 * 60) + 6);
  check('و ۰۹:۰۰:۰۰ دقیقاً مرزِ آغاز جلسه است', dailySecond(90000) === 9 * 3600);

  const mixed = trustedDailyRows([
    { date: 0, hEven: 61206, trades: 0, vol: 0 },
    { date: 20260918, hEven: 123000, trades: 10, vol: 100 },
    { date: 20260919, hEven: 61206, trades: 0, vol: 0 },
  ]);
  check('فقط ردیفِ معتبر می‌ماند', mixed.rows.length === 1 && mixed.rows[0].date === 20260918);
  check('و شمارِ افتاده گزارش می‌شود', mixed.dropped === 2);
  check('با تفکیکِ دلیل، نه فقط یک عدد',
    mixed.reasons['تاریخ نامعتبر'] === 1 && mixed.reasons['عکس پیش‌جلسه'] === 1);

  // ═══ «چند ردیف آمد» اثباتِ «روزِ گمشده برگشت» نیست ═══
  //
  // منبع جایگزین یک endpoint تک‌روزه است و حلقهٔ بازه ندارد.
  check('پوشش‌دادنِ روزِ خواسته‌شده جدا سنجیده می‌شود',
    coversDailyDate([{ date: 20260918 }], 20260919) === false
    && coversDailyDate([{ date: 20260919 }], 20260919) === true);
  check('و روزِ صفر هیچ‌وقت پوشش‌داده نیست', coversDailyDate([{ date: 0 }], 0) === false);
}

group('۲۷۹. مصرف در سرور و تب‌ها');
{
  const server = readSrc('../server/server.mjs');
  check('منبع جایگزین از صافی می‌گذرد',
    server.includes('trustedDailyRows(normalizeDailyRows(firstList(await get(histPath'));
  check('و پوششِ روزِ خواسته‌شده در پاسخ می‌آید',
    server.includes('const covers = coversDailyDate(trusted.rows, asOf)')
      && server.includes('fallbackCovers: covers'));
  check('پوشش‌ندادن پیام می‌گیرد، نه سکوت',
    server.includes('منبع جایگزین ${asOf} را پوشش نداد'));
  check('و ردیفِ افتاده با دلیلش گزارش می‌شود', server.includes('fallbackDropReasons: trusted.reasons'));
  // بی `hEven` دروازهٔ پیش‌جلسه کور است.
  check('ساعت همراه ردیفِ روزانه می‌آید', server.includes('hEven: Number(r.hEven) || 0'));

  // ═══ بند ۷: خطای جزئی دیگر آرایهٔ خالی نمی‌شود ═══
  const history = readSrc('../ui/tabs/history.mjs');
  check('تب تاریخچه خطای هر ابزار را نگه می‌دارد',
    history.includes('seriesErrors[ins] = String(why)'));
  check('و کدِ بی‌کلید هم «نیامد» است، نه «خالی بود»',
    history.includes("seriesErrors[code] = 'پاسخی برای این ابزار نیامد'"));
  check('و جمله‌اش این دو را از هم جدا می‌گوید',
    history.includes('این خالی‌بودنِ بازار نیست'));

  const openView = readSrc('../ui/tabs/open-view.mjs');
  check('نگاه باز هم خطای هر قرارداد را نگه می‌دارد',
    openView.includes('seriesErrors[ins] = String(why)'));
  check('و ناقص‌بودنِ تحلیل را می‌گوید',
    openView.includes('تحلیلِ همان قراردادها ناقص است'));
  check('هیچ‌کدام دیگر فقط `rows || []` نمی‌گیرند',
    !history.includes('seriesByIns[ins] = value.rows || [];')
      && !openView.includes('closedSeriesByIns[ins] = result.rows || [];'));

  check('تاریخچهٔ مشترک هم پیامِ پوشش‌ندادن را خطا می‌شمارد',
    readSrc('../ui/history-dailies.mjs').includes('value?.fallbackNote'));
}
