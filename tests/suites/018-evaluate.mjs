// ۱۷. سنجه‌های سربه‌سری
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { breakevenMetrics } from '../../core/evaluate.mjs';


group('۱۷. سنجه‌های سربه‌سری');
{
  const S = 100000;
  // یک سربه‌سری بالای پایه: پایه زیر سربه‌سری است، پس علامت منفی است
  const up = breakevenMetrics([105000], S);
  check('پایه زیر سربه‌سری، فاصله منفی است', near(up.beDistPct, -5, 1e-9), `${up.beDistPct}٪`);
  check('نزدیک‌ترین سربه‌سری، همان تک نقطه است', up.beNear === 105000);

  // یک سربه‌سری زیر پایه: علامت مثبت است، ولی حاشیه امن بدون علامت
  const dn = breakevenMetrics([92000], S);
  check('پایه بالای سربه‌سری، فاصله مثبت است', near(dn.beDistPct, 8, 1e-9), `${dn.beDistPct}٪`);
  check('حاشیه امن بدون علامت است', near(dn.beRoomPct, 8, 1e-9));

  // استرادل: دو سربه‌سری. نزدیک‌ترین انتخاب می‌شود، نه اولی.
  const strad = breakevenMetrics([94000, 108000], S);
  check('از دو سربه‌سری، نزدیک‌ترین به پایه انتخاب شد', strad.beNear === 94000,
    `${strad.beNear} در برابر ${strad.beHigh}`);
  check('پایین و بالا درست تفکیک شدند', strad.beLow === 94000 && strad.beHigh === 108000);
  check('پهنای سربه‌سری، درصد قیمت پایه است', near(strad.beWidthPct, 14, 1e-9), `${strad.beWidthPct}٪`);
  check('شمار سربه‌سری', strad.beCount === 2);

  // ترتیب ورودی نباید اثر بگذارد
  const rev = breakevenMetrics([108000, 94000], S);
  check('ترتیب ورودی اثر ندارد', rev.beNear === strad.beNear && rev.beLow === strad.beLow);

  // بدون سربه‌سری یا بدون قیمت پایه، عدد ساختگی ساخته نمی‌شود
  const none = breakevenMetrics([], S);
  check('بی‌سربه‌سری، همه سنجه‌ها نامعتبرند',
    !Number.isFinite(none.beNear) && !Number.isFinite(none.beDistPct) && none.beCount === 0);
  check('قیمت پایه نامعتبر، سنجه نمی‌سازد', !Number.isFinite(breakevenMetrics([100], 0).beNear));

  // تک سربه‌سری پهنا ندارد
  check('تک سربه‌سری پهنا ندارد', !Number.isFinite(up.beWidthPct));
  // مقدار بی‌معنی در فهرست، دور ریخته می‌شود
  const dirty = breakevenMetrics([NaN, -5, 0, 103000], S);
  check('سربه‌سری بی‌معنی کنار گذاشته شد', dirty.beCount === 1 && dirty.beNear === 103000);
}
