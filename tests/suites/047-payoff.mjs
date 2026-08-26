// ۴۶. فرض‌های منحنی امروز
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { analyzeMixed } from '../../core/mixed.mjs';
import { analyzePayoff } from '../../core/payoff.mjs';


// ═══════════ ۴۶. نوار فرض‌های نمودار بازده ═══════════
//
// نمودار حالا سه فرض منحنی «امروز» را دست کاربر می‌دهد: روز مانده، تلاطم،
// نرخ بدون ریسک. منحنی سررسید فرض‌پذیر نیست و نباید تکان بخورد.
//
// معنی اسلایدر «روز مانده» یک متمم است: افق ارزش‌گذاری = نزدیک‌ترین سررسید
// منهای روز مانده. این آزمون همان تبدیل را قفل می‌کند، چون اگر جهتش برعکس
// شود نمودار بی‌صدا غلط می‌شود — شکلش هنوز باورپذیر است.
group('۴۶. فرض‌های منحنی امروز');
{
  const legs46 = [{ kind: 'call', side: 'buy', ratio: 1, size: 1000, strike: 20000, price: 32318, days: 63 }];
  const net46 = -32318 * 1000;
  const fees46 = { buyStock: 0, sellStock: 0, option: 0, exercise: 0 };
  const base46 = { fees: fees46, spot: 50784, sigma: 0.467, rFree: 0.25, divYield: 0 };
  const expiry46 = analyzePayoff(legs46, net46, { fees: fees46 });
  const atHorizon = (h) => analyzeMixed(legs46, net46, { ...base46, horizonDays: h });

  // روز مانده = ۰  →  افق = نزدیک‌ترین سررسید  →  همان منحنی سررسید
  const collapsed = atHorizon(63);
  const sameAsExpiry = [30000, 50784, 70000]
    .every((S) => near(collapsed.at(S), expiry46.at(S), 1e-6));
  check('روز مانده صفر، منحنی امروز را روی منحنی سررسید می‌خواباند', sameAsExpiry,
    `${Math.round(collapsed.at(50784))} در برابر ${Math.round(expiry46.at(50784))}`);

  // روز مانده کامل  →  افق صفر  →  ارزش زمانی هنوز هست، پس بالاتر از سررسید
  const today46 = atHorizon(0);
  check('با روز مانده کامل، خرید کال ارزش زمانی دارد و بالای منحنی سررسید است',
    today46.at(50784) > expiry46.at(50784),
    `${Math.round(today46.at(50784))} > ${Math.round(expiry46.at(50784))}`);

  // تلاطم بالاتر، ارزش زمانی بیشتر — برای موقعیت خرید یعنی منحنی بالاتر
  const hiVol = analyzeMixed(legs46, net46, { ...base46, sigma: 0.9, horizonDays: 0 });
  check('تلاطم بیشتر، منحنی امروزِ موقعیت خرید را بالا می‌برد',
    hiVol.at(50784) > today46.at(50784),
    `${Math.round(hiVol.at(50784))} > ${Math.round(today46.at(50784))}`);

  // نرخ بهره روی کال خرید اثر مثبت دارد (رو مثبت است)
  const hiRate = analyzeMixed(legs46, net46, { ...base46, rFree: 0.6, horizonDays: 0 });
  check('نرخ بالاتر، منحنی امروزِ کال خرید را بالا می‌برد',
    hiRate.at(50784) > today46.at(50784),
    `${Math.round(hiRate.at(50784))} > ${Math.round(today46.at(50784))}`);

  // منحنی سررسید به هیچ‌کدام وابسته نیست
  check('منحنی سررسید با هیچ فرضی تکان نمی‌خورد',
    near(analyzePayoff(legs46, net46, { fees: fees46 }).at(50784), expiry46.at(50784), 1e-12));

  // ——— قرارداد نوار، در خود ماژول ———
  const chartSrc = readSrc('../ui/chart.mjs');
  check('نوار فرض‌ها افق را از متمم روز مانده می‌سازد',
    chartSrc.includes('horizonDays: nearDays - a.days'));
  check('هر سه فرض در نوار هست',
    ['روز مانده', 'نوسان دلخواه', 'نرخ بهره'].every((t) => chartSrc.includes(t)));
  check('نوار دکمه بازگشت به فرض‌های واقعی دارد', chartSrc.includes('data-assume-reset'));
  // عددی که کاربر می‌بیند باید از fmt عبور کند (قاعده ۲-۳)
  check('عدد نوار فرض‌ها از fmt عبور می‌کند',
    chartSrc.includes('fmt.int(v)') && chartSrc.includes('fmt.num(Number(v.toFixed(3)))'));
  // برچسب لبه، بیرون قاب نیفتد
  check('برچسب قیمت پایه و سربه‌سری لنگر لبه‌ای دارد',
    chartSrc.includes('edgeAnchor(X(spot))') && chartSrc.includes('edgeAnchor(X(b)'));
  check('رسم دوباره از بیرون ممکن است', chartSrc.includes('redraw: render'));
}
