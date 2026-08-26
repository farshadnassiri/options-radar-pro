// ۴. وجه تضمین — شش مشاهده تابلو
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, results } from '../harness.mjs';
import {
  DEFAULT_PARAMS, impliedUnderlying, initialMargin, minMargin, requiredMargin, verifyMargin,
} from '../../core/margin.mjs';


// ═══════════════════════════ ۴. وجه تضمین در برابر تابلو ═══════════════════════════
group('۴. وجه تضمین — شش مشاهده تابلو');
{
  // این fixture بر مبنای رفتار تابلوی کارگزاری (B×S) ثبت شده و اکنون با
  // صورتحساب واقعی کارگزاری نیز تأیید شده است.
  const boardParams = DEFAULT_PARAMS;
  // شش مشاهدهٔ دستیِ تابلو، در دو برداشت (A و B). این‌ها داده‌اند نه محاسبه:
  // هرچه اینجاست از تابلو خوانده شده و هیچ عددش بازسازی نشده.
  //
  // ⚠ بدهی شناخته‌شده: این جدول **زمان و منبع برداشت را ثبت نکرده**. بدون
  // آن، هیچ‌کس نمی‌تواند یک مشاهدهٔ مشکوک را با تابلوی همان لحظه بسنجد؛
  // تنها کاری که می‌شود کرد حدس‌زدن است، و حدس در فایل آزمون بدتر از
  // نبودن داده است. برداشت بعدی باید `at` (تاریخ و ساعت) و `src` (نشانی
  // صفحه) هم داشته باشد.
  //
  // یک ناسازگاری معلوم و عمداً پذیرفته‌شده: در `ضهرم5033` اتحاد
  // `RM = IM + پریمیوم × اندازه` برقرار نیست —
  //   ۵٬۲۰۰٬۰۰۰ + ۱٬۹۰۱ × ۱٬۰۰۰ = ۷٬۱۰۱٬۰۰۰
  //   رقم ثبت‌شدهٔ تابلو            = ۷٬۰۶۱٬۰۰۰
  //   اختلاف                        =    ۴۰٬۰۰۰ ریال
  // احتمال بیشتر، ناهم‌زمانیِ خودِ برداشت است (پریمیوم و وجه تضمین در دو
  // لحظه خوانده شده‌اند)، نه خطای فرمول — چون همان فرمول در پنج مشاهدهٔ
  // دیگر دقیق درمی‌آید. تا وقتی برداشتِ زمان‌دار جایگزینش نشده، آزمون
  // صریحاً «۵ از ۶» را انتظار دارد و ردیف ناسازگار را با `!` گزارش
  // می‌کند — نه اینکه پنهانش کند و نه اینکه عدد را به میل خودش اصلاح کند.
  const BOARD = [
    { name: 'ضهرم5034', ua: 'اهرم', snap: 'A', kind: 'call', K: 50000, size: 1000, prem: 1098, im: 4270000, rm: 5368000 },
    { name: 'ضهرم5033', ua: 'اهرم', snap: 'A', kind: 'call', K: 46000, size: 1000, prem: 1901, im: 5200000, rm: 7061000 },
    { name: 'ضخود5052', ua: 'خودرو', snap: 'A', kind: 'call', K: 500, size: 1000, prem: 41, im: 110000, rm: 151000 },
    { name: 'ضفزر505', ua: 'فزر', snap: 'A', kind: 'call', K: 140000, size: 1000, prem: 22876, im: 32290000, rm: 55166000 },
    { name: 'ضهرم6046', ua: 'اهرم', snap: 'B', kind: 'call', K: 46000, size: 1000, prem: 3980, im: 4320000, rm: 8300000 },
    { name: 'ضفزر505', ua: 'فزر', snap: 'B', kind: 'call', K: 140000, size: 1000, prem: 22049, im: 31390000, rm: 53439000 },
  ];

  let idOk = 0;
  const ranges = {};
  for (const b of BOARD) {
    const identity = b.im + b.prem * b.size;
    const ok = Math.abs(identity - b.rm) / b.rm <= 5e-3;
    if (ok) idOk += 1;
    else results.push(['!', `اتحاد RM در ${b.name} برقرار نیست`,
      `محاسبه ${identity.toLocaleString()} در برابر تابلو ${b.rm.toLocaleString()}`]);

    const inv = impliedUnderlying({ K: b.K, size: b.size, kind: b.kind, imRef: b.im, params: boardParams });
    check(`بازتولید IM تابلو — ${b.name} ${b.snap}`, inv.ok,
      inv.ok ? `S سازگار ${Math.round(inv.lo).toLocaleString()} تا ${Math.round(inv.hi).toLocaleString()} | جزء ${inv.binding}` : 'هیچ S سازگاری نیست');
    if (inv.ok) {
      const k = `${b.ua}|${b.snap}`;
      ranges[k] = ranges[k] || [];
      ranges[k].push([inv.lo, inv.hi, b.name]);
    }
  }
  check('اتحاد RM = IM + پریمیوم × اندازه، در ۵ مشاهده از ۶', idOk === 5, `${idOk} از ۶`);

  // قراردادهای یک پایه در یک برداشت باید بازه S مشترک داشته باشند
  for (const [k, list] of Object.entries(ranges)) {
    if (list.length < 2) continue;
    const lo = Math.max(...list.map((x) => x[0]));
    const hi = Math.min(...list.map((x) => x[1]));
    check(`بازه S مشترک — ${k}`, lo <= hi,
      lo <= hi ? `${Math.round(lo).toLocaleString()} تا ${Math.round(hi).toLocaleString()}` : 'ناسازگار');
  }

  // تطبیق مستقیم با قیمت پایه معلوم
  const v = verifyMargin({ S: 156950, K: 140000, size: 1000, kind: 'call', optClose: 22049,
    imRef: 31390000, rmRef: 53439000, params: boardParams });
  check('تطبیق کامل ضفزر با S معلوم', v.imOk && v.rmOk && v.identityOk,
    `IM ${Math.round(v.im).toLocaleString()} | RM ${Math.round(v.rm).toLocaleString()} | جزء ${v.binding}`);

  check('گردکردن فقط روی وجه تضمین اولیه است',
    initialMargin(156950, 140000, 1000, 'call', boardParams) % DEFAULT_PARAMS.C === 0
    && requiredMargin(156950, 140000, 1000, 'call', 22049, boardParams) % DEFAULT_PARAMS.C !== 0);
  check('حداقل وجه تضمین ۷۰ درصد لازم است', near(minMargin(1000000), 700000));
  check('وجه تضمین در قیمت پایه یکنواست',
    initialMargin(100000, 50000, 1000, 'call') <= initialMargin(120000, 50000, 1000, 'call'));
}
