// ۱۴. تاریخ شمسی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import {
  gregorianToJalali, jalaliToGregorian, parseJalali, todayJalali,
} from '../../core/jalali.mjs';


group('۱۴. تاریخ شمسی');
{
  const [gy, gm, gd] = jalaliToGregorian(1404, 5, 21);
  check('۱۴۰۴/۰۵/۲۱ برابر ۲۰۲۵-۰۸-۱۲ است', gy === 2025 && gm === 8 && gd === 12, `${gy}-${gm}-${gd}`);
  const [jy, jm, jd] = gregorianToJalali(2025, 8, 12);
  check('رفت و برگشت تاریخ', jy === 1404 && jm === 5 && jd === 21, `${jy}/${jm}/${jd}`);
  check('تاریخ بد، null می‌دهد', parseJalali('چیز بی‌ربط') === null);
  check('امروز به شمسی، قالب درست دارد', /^\d{4}\/\d{2}\/\d{2}$/.test(todayJalali()), todayJalali());
}
