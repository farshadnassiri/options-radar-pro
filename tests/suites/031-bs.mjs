// ۳۰. افق ارزش‌گذاری قابل‌بازنویسی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { analyzeMixed } from '../../core/mixed.mjs';


// ═══ ۳۰. افق ارزش‌گذاری قابل‌بازنویسی — منحنی «امروز» کنار «سررسید» ═══
group('۳۰. افق ارزش‌گذاری قابل‌بازنویسی');
{
  // پیش‌فرض دست‌نخورده: بدون horizonDays، همان رفتار قبلی (افق = نزدیک‌ترین
  // سررسید) — این تضمین می‌کند اضافه‌کردن پارامتر تازه هیچ استفاده قبلی را
  // نمی‌شکند.
  const legs20 = [
    { kind: 'put', side: 'buy', ratio: 1, strike: 1200, days: 30, size: 1000 },
    { kind: 'call', side: 'sell', ratio: 1, strike: 1400, days: 60, size: 1000 },
  ];
  const withoutOverride = analyzeMixed(legs20, -50000, { spot: 1000, sigma: 0.6 });
  const explicitDefault = analyzeMixed(legs20, -50000, { spot: 1000, sigma: 0.6, horizonDays: 30 });
  check('بدون horizonDays همان افق پیش‌فرض (نزدیک‌ترین سررسید) است',
    near(withoutOverride.at(1300), explicitDefault.at(1300), 1e-9),
    `${withoutOverride.at(1300)} ~ ${explicitDefault.at(1300)}`);

  // یک کال تک‌پا، horizonDays=0 یعنی «امروز»: هیچ پایی سررسید نشده، پس
  // سود و زیان دقیقاً برابر قیمت بلک-شولز است، نه ارزش ذاتی تکه‌ای-خطی —
  // هویت جبری، نه فقط علامت.
  const K = 1000, size = 1000, sigma = 0.5, days = 30, r = 0.3, q = 0;
  const premium = bsPrice('call', 1000, K, days / 365, r, q, sigma);
  const legCall = [{ kind: 'call', side: 'buy', ratio: 1, strike: K, days, size }];
  const today = analyzeMixed(legCall, -premium * size, { spot: 1000, sigma, rFree: r, divYield: q, horizonDays: 0 });
  const S2 = 1050;
  const expectedToday = (bsPrice('call', S2, K, days / 365, r, q, sigma) - premium) * size;
  check('منحنی امروز دقیقاً از قیمت بلک-شولز می‌آید (هویت جبری)',
    near(today.at(S2), expectedToday, 1e-6), `${today.at(S2)} ~ ${expectedToday}`);

  // درست همان ترکیب، امروز و سررسید باید در نقطه اعمال فرق کنند — چون
  // امروز هنوز ارزش زمانی دارد، سررسید فقط ارزش ذاتی. اگر یکی بودند یعنی
  // پارامتر افق اصلاً اثر نکرده.
  const expiry = analyzeMixed(legCall, -premium * size, { spot: 1000, sigma, rFree: r, divYield: q, horizonDays: days });
  check('امروز با سررسید در نقطه اعمال متفاوت است — ارزش زمانی هنوز هست',
    Math.abs(today.at(K) - expiry.at(K)) > size * 1,
    `امروز ${Math.round(today.at(K))} ، سررسید ${Math.round(expiry.at(K))}`);
}
