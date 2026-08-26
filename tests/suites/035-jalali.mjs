// ۳۴. انتخابگر تاریخ مشترک
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { jalaliToGregorian } from '../../core/jalali.mjs';


// ═══════════════════════════ ۳۴. انتخابگر تاریخ مشترک ═══════════════════════════
group('۳۴. انتخابگر تاریخ مشترک');
{
  const read = (relative) => readSrc(relative);
  const wheelSource34 = read('../ui/datewheel.mjs');
  check('انتخابگر تاریخ یک ماژول مشترک است، نه سه پیاده‌سازی جدا',
    wheelSource34.includes('export function mountDateWheel('));
  // چرخ ماوس دیگر مقدار را عوض نمی‌کند. کاربری که فقط می‌خواست صفحه را
  // پایین ببرد و اشاره‌گرش از روی جعبه رد می‌شد، بی‌آنکه بخواهد روز را عوض
  // می‌کرد — و چون روز ورود فهرست ترکیب‌ها را از نو می‌سازد، ترکیب
  // انتخاب‌شده هم بی‌صدا عوض می‌شد.
  check('هیچ شنونده‌ای برای چرخ ماوس نمانده — اسکرول، انتخاب را عوض نمی‌کند',
    !/['"]wheel['"]/.test(wheelSource34) && !wheelSource34.includes('onwheel'));
  check('تقویم ماهانه است، نه ستون بی‌پایان روز',
    wheelSource34.includes('export function jalaliMonthDays(')
    && wheelSource34.includes('date-cal-grid'));
  // شمار روز ماه از خودِ تبدیل شمسی می‌آید، نه از قاعدهٔ کبیسهٔ رونویسی‌شده.
  check('طول ماه از تفاضل اول ماه بعد حساب می‌شود، نه از فرمول دوم',
    !/kabise|isLeap|leapJalali/i.test(wheelSource34)
    && wheelSource34.includes('jalaliToGregorian(ny, nm, 1)'));
  check('روزِ بی‌معامله حذف نمی‌شود، خاموش می‌شود', wheelSource34.includes('date-cal-off'));

  const tabs34 = ['../ui/tabs/backtest.mjs', '../ui/tabs/portfolio-backtest.mjs', '../ui/tabs/history.mjs', '../ui/tabs/positions.mjs'];
  const sources34 = tabs34.map(read);
  check('هیچ تبی ریل افقی قدیمی تاریخ را نگه نداشته است',
    sources34.every((source) => !source.includes('backtest-wheel')));
  check('همه تب‌های دارای تاریخ از انتخابگر مشترک استفاده می‌کنند',
    sources34.every((source) => source.includes("from '/ui/datewheel.mjs'")));
  const historySource34 = read('../ui/tabs/history.mjs');
  check('لغزنده و فهرست کشویی تاریخ در تحلیل تاریخی جایگزین شده‌اند',
    !/id="h-(start|end|payoff-day|rolling-start|rolling-end)"[^>]*(type="range"|<\/select)/.test(historySource34)
    && !historySource34.includes('<select id="h-rolling-start">'));

  const styleSource34 = read('../ui/style.css');
  check('تقویم هفت ستونه است — یک ستون برای هر روز هفته',
    /\.date-cal-week, \.date-cal-grid \{[^}]*repeat\(7, minmax\(0, 1fr\)\)/.test(styleSource34));
  // ارتفاع ثابت: ماه‌ها ۲۹ تا ۳۱ روزند و صفر تا شش خانه خالی در ابتدا
  // دارند؛ بدون ارتفاع ثابت، چیدمان اطراف با هر جابه‌جایی ماه می‌پرد.
  check('ارتفاع تقویم با عوض‌شدن ماه نمی‌پرد',
    /\.date-cal \{[^}]*height: \d+px;/.test(styleSource34));
}
