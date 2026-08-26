// ۹۹. تقویم معاملاتی و پرش زمانی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { INTRADAY_END_SECOND, INTRADAY_START_SECOND } from '../../core/backtest.mjs';
import {
  gapsIn, indexOfDay, laterThan, moment, momentKey, momentsBetween, sameMoment, shiftTradingDays, snapToTradingDay, stepMoment, tradingDays, tradingDaysBetween,
} from '../../core/trading-calendar.mjs';


// ═══════════════════ ۹۹. تقویم معاملاتی و پرش زمانی ═══════════════════
//
// تقویم از داده ساخته می‌شود نه از جدول تعطیلات، پس آنچه باید سنجیده شود
// این است: روزی که در سری نیست هرگز روز معاملاتی نشود، و پرشی که به
// انتهای تقویم می‌خورد بی‌صدا کوتاه نشود.
group('۹۹. تقویم معاملاتی و پرش زمانی');
{
  const series = [
    { date: 20260517, close: 100 }, { date: 20260518, close: 101 },
    { date: 20260519, close: 102 }, { date: 20260520, close: 103 },
    { date: 20260521, close: 104 },
    // پنج‌شنبه و جمعه نیست
    { date: 20260524, close: 105 }, { date: 20260525, close: 106 },
  ];
  const days = tradingDays(series);
  check('تقویم فقط روزهای دارای قیمت را می‌گیرد', days.length === 7 && days[0] === 20260517);
  check('روز بی‌قیمت روز معاملاتی نیست',
    tradingDays([{ date: 20260517, close: 100 }, { date: 20260518, close: 0 }]).length === 1);
  check('تقویم مرتب و بدون تکرار است',
    tradingDays([{ date: 20260519, close: 1 }, { date: 20260517, close: 1 }, { date: 20260519, close: 1 }])
      .join(',') === '20260517,20260519');

  check('ایندکس روز با جست‌وجوی دودویی درست است',
    indexOfDay(days, 20260521) === 4 && indexOfDay(days, 20260524) === 5);
  check('روز بیرون از تقویم ایندکس ندارد', indexOfDay(days, 20260522) === -1);

  check('چسبیدن به جلو، تعطیلی را رد می‌کند', snapToTradingDay(days, 20260522, 1) === 20260524);
  check('چسبیدن به عقب، تعطیلی را برمی‌گرداند', snapToTradingDay(days, 20260522, -1) === 20260521);
  check('روز معاملاتی به خودش می‌چسبد', snapToTradingDay(days, 20260521, 1) === 20260521);

  check('یک روز جلو، از تعطیلی می‌پرد', shiftTradingDays(days, 20260521, 1) === 20260524);
  check('یک هفته یعنی پنج روز معاملاتی', shiftTradingDays(days, 20260517, 5) === 20260524);
  check('پرش بیرون از تقویم صفر می‌دهد نه آخرین روز',
    shiftTradingDays(days, 20260525, 3) === 0 && shiftTradingDays(days, 20260517, -1) === 0);
  check('فاصلهٔ دو روز به روز معاملاتی شمرده می‌شود',
    tradingDaysBetween(days, 20260521, 20260525) === 2);
  check('فاصله با روز بیرون از تقویم عدد نمی‌سازد',
    Number.isNaN(tradingDaysBetween(days, 20260522, 20260525)));

  // ——— پرش ———
  const at = (d, s) => ({ date: d, second: s });
  check('پرش پانزده‌دقیقه‌ای درون همان روز می‌ماند', (() => {
    const r = stepMoment(days, at(20260521, 9 * 3600), 'm15');
    return r.ok && r.date === 20260521 && r.second === 9 * 3600 + 900 && r.rolled === false;
  })());
  check('پلهٔ ساعتی که از ۱۲:۳۰ رد شود به ۹:۰۰ جلسهٔ بعد می‌رود', (() => {
    const r = stepMoment(days, at(20260521, 12 * 3600), 'h1');
    return r.ok && r.date === 20260524 && r.second === INTRADAY_START_SECOND && r.rolled === true;
  })());
  check('باقی‌ماندهٔ پله حمل نمی‌شود', (() => {
    // ۱۲:۲۹ به‌علاوهٔ یک ساعت، ۹:۵۹ روز بعد نمی‌شود؛ ۹:۰۰ می‌شود.
    const r = stepMoment(days, at(20260521, 12 * 3600 + 29 * 60), 'h1');
    return r.second === INTRADAY_START_SECOND;
  })());
  check('پایان روز از میانهٔ روز به ۱۲:۳۰ همان روز می‌رود', (() => {
    const r = stepMoment(days, at(20260521, 10 * 3600), 'eod');
    return r.date === 20260521 && r.second === INTRADAY_END_SECOND && r.rolled === false;
  })());
  check('پایان روز از خودِ ۱۲:۳۰ به روز بعد می‌رود', (() => {
    const r = stepMoment(days, at(20260521, INTRADAY_END_SECOND), 'eod');
    return r.date === 20260524 && r.rolled === true;
  })());
  check('پرش روزانه ساعت را نگه می‌دارد', (() => {
    const r = stepMoment(days, at(20260517, 10 * 3600 + 1800), 'd3');
    return r.date === 20260520 && r.second === 10 * 3600 + 1800;
  })());
  check('پرش تا سررسید به آخرین روز معاملاتیِ تا سررسید می‌رود', (() => {
    const r = stepMoment(days, at(20260517, 9 * 3600), 'expiry', { expiryDate: 20260522 });
    return r.date === 20260521 && r.second === INTRADAY_END_SECOND;
  })());
  check('پرش از انتهای تقویم دلیل می‌دهد نه لحظهٔ ساختگی', (() => {
    const r = stepMoment(days, at(20260525, 12 * 3600), 'h1');
    return r.ok === false && r.end === true && r.why.length > 0;
  })());
  check('پلهٔ ناشناخته لحظه نمی‌سازد', stepMoment(days, at(20260521, 9 * 3600), 'nope').ok === false);

  // ——— لحظه‌ها ———
  check('ثانیهٔ پیش از جلسه به بازگشایی می‌چسبد', moment(20260521, 8 * 3600).second === INTRADAY_START_SECOND);
  check('ثانیهٔ پس از جلسه به پایان می‌چسبد', moment(20260521, 15 * 3600).second === INTRADAY_END_SECOND);
  check('کلید لحظه مرتب‌شدنی است',
    momentKey(at(20260521, 9 * 3600)) < momentKey(at(20260521, 10 * 3600))
    && momentKey(at(20260521, INTRADAY_END_SECOND)) < momentKey(at(20260524, 0)));
  check('لحظهٔ بی‌تاریخ کلید ندارد', Number.isNaN(momentKey({ date: 0, second: 100 })));
  check('laterThan با لحظهٔ نامعتبر هرگز درست نیست',
    laterThan({ date: 0 }, at(20260521, 9 * 3600)) === false
    && laterThan(at(20260521, 9 * 3600), { date: 0 }) === false);

  // ——— قدم‌های میانی ———
  {
    const r = momentsBetween(days, at(20260521, 9 * 3600), at(20260521, 10 * 3600), { seconds: 900 });
    check('قدم‌های میانی یک ساعت با دانهٔ ربع‌ساعت چهارتاست', r.ok && r.moments.length === 4);
    check('آخرین قدم دقیقاً روی مقصد می‌ایستد',
      sameMoment(r.moments[r.moments.length - 1], at(20260521, 10 * 3600)));
  }
  {
    const r = momentsBetween(days, at(20260521, 9 * 3600), at(20260525, 12 * 3600), { seconds: 900, limit: 5 });
    check('رسیدن به سقف قدم، صریح اعلام می‌شود', r.truncated === true && r.moments.length === 5);
  }
  check('مقصدِ پیش از مبدأ قدمی نمی‌سازد',
    momentsBetween(days, at(20260524, 9 * 3600), at(20260521, 9 * 3600)).moments.length === 0);

  // ——— شکاف مشکوک ———
  check('شکاف بلندتر از آخر هفته دیده می‌شود', (() => {
    const stopped = tradingDays([
      { date: 20260517, close: 1 }, { date: 20260518, close: 1 }, { date: 20260601, close: 1 },
    ]);
    const gaps = gapsIn(stopped);
    return gaps.length === 1 && gaps[0].from === 20260518 && gaps[0].to === 20260601;
  })());
  check('آخر هفتهٔ عادی شکاف نیست', gapsIn(days).length === 0);
}
