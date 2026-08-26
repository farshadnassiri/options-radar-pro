// ۲۹. ماشین زمان
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { timeMachine } from '../../core/timemachine.mjs';


// ═══════════════ ۲۹. ماشین زمان — شبیه‌سازی بلک-شولز روی تاریخچه ═══════════════
group('۲۹. ماشین زمان');
{
  const K = 100000;
  const size = 1000;
  const legLongCall = [{ kind: 'call', side: 'buy', ratio: 1, strike: K, size }];
  const flatCloses = Array.from({ length: 10 }, (_, i) => ({ date: 20260100 + i, close: K }));

  const r0 = timeMachine(legLongCall, flatCloses, { daysToday: 30, sigma: 0.5 });
  check('روز ورود (اولین ردیف)، سود و زیان دقیقاً صفر', r0[0].pnl === 0, r0[0].pnl);
  check('طول خروجی برابر طول ورودی', r0.length === flatCloses.length, r0.length);

  // بدون تغییر قیمت پایه، فقط گذر زمان: کال خرید با تلاطم مثبت باید کمی
  // ارزش زمانی از دست بدهد (تتای منفی) چون داریم به سررسید نزدیک می‌شویم
  check('در پول بدون حرکت پایه، گذر زمان روی کال خرید یعنی زیان (تتای منفی)',
    r0[r0.length - 1].pnl < 0, r0[r0.length - 1].pnl);

  // T باید یکنوا کاهشی باشد، چون هر ردیف بعدی به امروز نزدیک‌تر است
  check('روز باقیمانده تا سررسید یکنوا کاهشی است',
    r0.every((r, i) => i === 0 || r.daysLeft <= r0[i - 1].daysLeft), r0.map((r) => r.daysLeft).join(' , '));

  // صعود شدید پایه در آخرین روز باید سود قابل توجه بدهد، و دقیقاً برابر
  // تفاضل bsPrice همان روز با bsPrice روز ورود (هویت جبری، نه فقط علامت)
  const bumped = [...flatCloses];
  bumped[bumped.length - 1] = { ...bumped[bumped.length - 1], close: K * 1.3 };
  const r1 = timeMachine(legLongCall, bumped, { daysToday: 30, sigma: 0.5 });
  const last = r1[r1.length - 1];
  const entryPx = bsPrice('call', K, K, (30 + bumped.length - 1) / 365, 0, 0, 0.5);
  const lastPx = bsPrice('call', K * 1.3, K, Math.max(30, 0.5) / 365, 0, 0, 0.5);
  check('صعود ۳۰٪ پایه، سود قابل‌توجه می‌دهد', last.pnl > 0, last.pnl);
  check('سود دقیقاً برابر تفاضل قیمت بلک-شولز دو روز است (هویت جبری)',
    near(last.pnl, (lastPx - entryPx) * size, 1e-6), `${last.pnl} ~ ${(lastPx - entryPx) * size}`);

  // فروش، علامت برعکس همان خرید — از یک تابع واحد می‌آید، نه شاخه جدا
  const legShort = [{ kind: 'call', side: 'sell', ratio: 1, strike: K, size }];
  const r2 = timeMachine(legShort, bumped, { daysToday: 30, sigma: 0.5 });
  check('فروش همان کال، دقیقاً علامت برعکس خرید',
    near(r2[r2.length - 1].pnl, -last.pnl, 1e-6), r2[r2.length - 1].pnl);

  // ورودی نامعتبر سقوط نمی‌کند
  check('بدون تاریخچه، فهرست خالی برمی‌گرداند', timeMachine(legLongCall, [], { daysToday: 30, sigma: 0.5 }).length === 0);
  check('تلاطم نامعتبر، فهرست خالی برمی‌گرداند',
    timeMachine(legLongCall, flatCloses, { daysToday: 30, sigma: 0 }).length === 0);
}
