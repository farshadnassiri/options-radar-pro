// ۲۰. بازه سود، بیرون پنجره رسم
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { probOfProfit } from '../../core/evaluate.mjs';
import { analyzeMixed } from '../../core/mixed.mjs';


// ═══════ ۲۰. بازه سود موتور چند-سررسیدی از لبه پنجره بریده نمی‌شود ═══════
group('۲۰. بازه سود، بیرون پنجره رسم');
{
  // باگ: پنجره نمونه‌برداری [۰٫۳۵ , ۲٫۲] برابر قیمت پایه بود و بازه سود از
  // همان‌جا بریده می‌شد. هر ترکیب پوت‌دار که در سقوط شدید سود می‌داد، بازه
  // سودش «از ۳۵٪ قیمت پایه» گزارش می‌شد و احتمال سودش کم‌برآورد می‌شد.
  const legs = [
    { kind: 'put', side: 'buy', ratio: 1, strike: 1200, days: 30, size: 1000 },
    { kind: 'call', side: 'sell', ratio: 1, strike: 1400, days: 60, size: 1000 },
  ];
  const a = analyzeMixed(legs, -50000, { spot: 1000, sigma: 0.6 });

  check('بازه سود تا صفر می‌رسد، نه تا لبه پنجره', a.regions.length === 1 && a.regions[0][0] === 0,
        JSON.stringify(a.regions.map((r) => r.map((x) => Math.round(x)))));
  check('سود در قیمت‌های خیلی پایین واقعاً مثبت است', a.at(1) > 0 && a.at(300) > 0,
        `${Math.round(a.at(1))} و ${Math.round(a.at(300))}`);
  check('مرز بالای بازه دقیقاً سربه‌سری است',
        a.breakevens.length === 1 && near(a.regions[0][1], a.breakevens[0], 1e-9),
        `${a.regions[0][1]}`);
  check('در مرز، سود عملاً صفر است', Math.abs(a.at(a.breakevens[0])) < 1,
        `${a.at(a.breakevens[0])}`);

  // احتمال سود باید از حالت بریده بزرگ‌تر باشد. افق و تلاطم را جایی می‌گیریم
  // که دنباله پایین واقعاً وزن داشته باشد، وگرنه آزمون چیزی ثابت نمی‌کند:
  // در سی روز با تلاطم ۰٫۶، احتمال رسیدن به ۳۵٪ قیمت پایه عملاً صفر است و
  // هر دو عدد تا دو رقم اعشار یکی درمی‌آیند.
  const truncated = [[Math.max(1000 * 0.35, 1), a.regions[0][1]]];
  const full = probOfProfit(a, 1000, 1, 1.2);
  const cut = probOfProfit({ regions: truncated }, 1000, 1, 1.2);
  check('احتمال سود دیگر کم‌برآورد نمی‌شود', full - cut > 1,
        `${full.toFixed(2)}٪ در برابر ${cut.toFixed(2)}٪ — ${(full - cut).toFixed(2)} واحد بازیافت شد`);

  // پنجره رسم باید قیمت اعمال دور را هم بگیرد
  const far = analyzeMixed([
    { kind: 'call', side: 'buy', ratio: 1, strike: 5000, days: 30, size: 1000 },
    { kind: 'call', side: 'sell', ratio: 1, strike: 5000, days: 60, size: 1000 },
  ], -10000, { spot: 1000, sigma: 0.6 });
  const xs = far.points.map((p) => p.S);
  check('قیمت اعمال دور داخل پنجره رسم است', Math.max(...xs) >= 5000, `تا ${Math.round(Math.max(...xs))}`);

  // بدون سربه‌سری، یک بازه یکپارچه — و باید علامتش درست خوانده شود
  const allLoss = analyzeMixed([
    { kind: 'call', side: 'buy', ratio: 1, strike: 1000, days: 30, size: 1000 },
    { kind: 'call', side: 'sell', ratio: 1, strike: 1000, days: 60, size: 1000 },
  ], -300000, { spot: 1000, sigma: 0.6 });
  check('ترکیب همیشه‌زیان، هیچ بازه سودی ندارد', allLoss.regions.length === 0,
        JSON.stringify(allLoss.regions));

  // تقویمی خرید هنوز کراندار است — گروه ۱۶ نباید بشکند
  const cal = analyzeMixed([
    { kind: 'call', side: 'sell', ratio: 1, strike: 1000, days: 30, size: 1000 },
    { kind: 'call', side: 'buy', ratio: 1, strike: 1000, days: 60, size: 1000 },
  ], -200000, { spot: 1000, sigma: 0.6 });
  check('تقویمی خرید هنوز زیان کراندار دارد', cal.unlimitedLoss === false && Number.isFinite(cal.maxLoss),
        `${Math.round(cal.maxLoss)}`);
}
