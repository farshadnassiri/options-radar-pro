// ۱۶. موتور چند-سررسیدی — کرانداری
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { analyzeMixed } from '../../core/mixed.mjs';
import { signedQty } from '../../core/payoff.mjs';


group('۱۶. موتور چند-سررسیدی — کرانداری');
{
  // این گروه یک باگ واقعی را قفل می‌کند: شیب انتهایی از لبه پنجره رسم خوانده
  // می‌شد. در دو برابر قیمت پایه، پای زنده هنوز ارزش زمانی دارد و شیب ظاهری
  // صفر نیست، پس هر تقویمی «زیان نامحدود» می‌گرفت. چون مخرج بازده بیشترین
  // زیان است، بازده هر ردیف تقویمی صفر می‌شد و کل تب از رتبه‌بندی می‌افتاد.
  const spot = 100000, size = 1000;
  const leg = (side, K, price, days, ratio = 1) =>
    ({ kind: 'call', side, ratio, strike: K, price, size, days, sigma: 0.6 });
  const cash = (ls) => ls.reduce((c, l) => c - signedQty(l) * l.price, 0);
  const run = (ls) => analyzeMixed(ls, cash(ls), { spot, rFree: 0.3, sigma: 0.6 });

  // تقویمی خرید: فروش نزدیک، خرید دور، یک قیمت اعمال
  const cal = [leg('sell', 100000, 3000, 20), leg('buy', 100000, 5000, 80)];
  const a = run(cal);
  check('تقویمی خرید، زیان کراندار است', !a.unlimitedLoss && Number.isFinite(a.maxLoss));
  check('بیشترین زیان تقویمی، دقیقاً بدهکار خالص است',
    near(a.maxLoss, 2_000_000, 1e-6), `${Math.round(a.maxLoss).toLocaleString()}`);
  check('شیب مجانبی تقویمی عملاً صفر است', Math.abs(a.slopeRight) < 1e-3,
    a.slopeRight.toExponential(2));
  check('سود تقویمی هم کراندار است', !a.unlimitedProfit && Number.isFinite(a.maxProfit),
    `${Math.round(a.maxProfit).toLocaleString()}`);

  // مورب بدهکار: اعمال‌های متفاوت، باز هم کراندار و زیانش بدهکار خالص
  const diag = [leg('sell', 110000, 1500, 20), leg('buy', 95000, 8000, 80)];
  const b = run(diag);
  check('مورب بدهکار، زیان کراندار و برابر بدهکار خالص',
    !b.unlimitedLoss && near(b.maxLoss, 6_500_000, 1e-6),
    `${Math.round(b.maxLoss).toLocaleString()}`);

  // نسبت تقویمی: یک پای لخت می‌ماند، پس زیان واقعاً نامحدود است
  const ratioCal = [leg('sell', 100000, 3000, 20, 2), leg('buy', 100000, 5000, 80)];
  const c = run(ratioCal);
  check('نسبت تقویمی، زیان واقعاً نامحدود شناسایی شد',
    c.unlimitedLoss && c.maxLoss === Infinity);
  check('شیب مجانبی نسبت تقویمی، اندازه پای لخت است',
    near(c.slopeRight, -size, 1e-6), `${c.slopeRight.toFixed(1)} در برابر ${-size}`);

  // آستانه باید با اندازه موقعیت مقیاس بخورد، نه عدد مطلق
  const big = [leg('sell', 100000, 3000, 20), leg('buy', 100000, 5000, 80)]
    .map((l) => ({ ...l, size: 1_000_000 }));
  check('تقویمی بزرگ هم کراندار می‌ماند — آستانه مقیاس‌پذیر است',
    !analyzeMixed(big, cash(big), { spot, rFree: 0.3, sigma: 0.6 }).unlimitedLoss);

  // ارزش در قیمت پایه نزدیک صفر: هر دو کال بی‌ارزش، پس همان بدهکار خالص
  check('ارزش در قیمت پایه صفر، بدهکار خالص است', near(a.atZero, -2_000_000, 1e-6),
    `${Math.round(a.atZero).toLocaleString()}`);
}
