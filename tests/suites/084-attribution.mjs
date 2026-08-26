// ۸۳. تجزیه سود و زیان
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import {
  DRIVERS, analyzeAttribution, attributeStep, dailyTrack, dominantDriver, driverTotals, elapsedDays, turningPoints,
} from '../../core/attribution.mjs';
import { bsGreeks, bsPrice } from '../../core/bs.mjs';
import { coverage } from '../../core/margin.mjs';


// ═════════ ۸۳. تجزیه سود و زیان به ریشه‌ها ═════════
//
// خواسته کاربر: «هر جا سود و زیانی ایجاد شد اثر ایجاد ان مشخص بشه… مثلا دلتا
// رفت بالا تلاطم رفت بالا گاما اثر گذاشت یا نه اثر زوال زمانی بود… این ۳۲۰
// میلیون ریال سود دلیلش چیه و سود و زیان را دقیق و کامل تجزیه کنی به
// ریشه‌هایش… گام اول به پایه‌هاش، گام دوم رفتار پایه‌ها.»
group('۸۳. تجزیه سود و زیان');
{
  const P83 = { rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5, yearDays: 365 };
  const leg83 = { kind: 'call', strike: 11000, expiry: 20260401, side: 'buy', ratio: 1, size: 1000, name: 'کال' };
  const mk = (date, S, sigma, days) => {
    const price = bsPrice('call', S, 11000, days / 365, 0.3, 0, sigma);
    return {
      date, label: String(date), spot: S, prices: [price], pnl: [1000 * price],
      ivPct: [sigma * 100], greeks: [bsGreeks('call', S, 11000, days / 365, 0.3, 0, sigma, 365)],
    };
  };

  // گام کوچک: تقریب مرتبهٔ دوم باید تقریباً کامل توضیح بدهد
  const small83 = attributeStep([leg83], mk(20260101, 10000, 0.65, 90), mk(20260102, 10020, 0.649, 89));
  check('گام کوچک، تقریباً کامل تجزیه می‌شود',
    Math.abs(small83.rest / small83.actual) < 0.05,
    `باقیمانده ${(Math.abs(small83.rest / small83.actual) * 100).toFixed(2)}٪`);
  check('جمع چهار عامل و باقیمانده، دقیقاً تغییر واقعی است',
    Math.abs((small83.delta + small83.gamma + small83.vega + small83.theta + small83.rest) - small83.actual) < 1e-6);
  check('صعود پایه سهم دلتای مثبت می‌دهد', small83.delta > 0);
  check('گذر زمان برای کال خریداری‌شده سهم منفی می‌دهد', small83.theta < 0);
  check('افت تلاطم سهم وگای منفی می‌دهد', small83.vega < 0);

  // پای سهم پایه: کل حرکتش دلتاست و باقیمانده‌اش صفر
  const stock83 = { kind: 'underlying', side: 'buy', ratio: 1, size: 1, name: 'پایه' };
  const a83 = { date: 20260101, label: 'الف', spot: 10000, prices: [10000], pnl: [0], ivPct: [NaN], greeks: [null] };
  const b83 = { date: 20260102, label: 'ب', spot: 10200, prices: [10200], pnl: [200], ivPct: [NaN], greeks: [null] };
  const stepStock = attributeStep([stock83], a83, b83);
  check('حرکت پای پایه تمامش دلتاست', Math.abs(stepStock.delta - 200) < 1e-9, String(stepStock.delta));
  check('پای پایه باقیمانده ندارد', Math.abs(stepStock.rest) < 1e-9);

  // قاعدهٔ ۲-۴: پای بی‌یونانی تجزیه نمی‌شود؛ سودش به «توضیح‌داده‌نشده» می‌رود
  const blindLeg = { kind: 'call', strike: 11000, expiry: 20260401, side: 'buy', ratio: 1, size: 1000, name: 'کور' };
  const ba = { date: 20260101, label: 'الف', spot: 10000, prices: [900], pnl: [0], ivPct: [NaN], greeks: [null] };
  const bb = { date: 20260102, label: 'ب', spot: 10200, prices: [980], pnl: [80000], ivPct: [NaN], greeks: [null] };
  const blindStep = attributeStep([blindLeg], ba, bb);
  check('پای بی‌تلاطم تجزیه نمی‌شود و گام ناقص می‌ماند', blindStep.incomplete === true);
  check('سود پای بی‌تجزیه، صفر فرض نمی‌شود بلکه جدا نگه داشته می‌شود',
    Math.abs(blindStep.unexplainedPnl - 80000) < 1e-9, String(blindStep.unexplainedPnl));
  check('سهم عوامل پای بی‌تجزیه، عدد ساختگی نمی‌گیرد',
    DRIVERS.every((d) => Number.isNaN(blindStep.byLeg[0][d.key])));
  const blindTotals = driverTotals([blindStep]);
  check('پوشش تجزیه، سهم توضیح‌داده‌شده را صادقانه می‌گوید',
    blindTotals.coverage === 0, String(blindTotals.coverage));

  // ——— سه لایهٔ جواب ———
  const track83 = [mk(20260101, 10000, 0.65, 90), mk(20260102, 10200, 0.62, 89), mk(20260103, 10150, 0.66, 88)];
  const full83 = analyzeAttribution([leg83], track83);
  check('لایهٔ اول: هر پا سطر خودش را دارد', full83.byLeg.length === 1 && full83.byLeg[0].samples === 2);
  check('لایهٔ دوم: جمع عوامل روی کل عمر ساخته می‌شود',
    Math.abs(full83.totals.actual - (track83[2].pnl[0] - track83[0].pnl[0])) < 1e-6);
  check('لایهٔ سوم: سود و زیان هر عامل جدا می‌ماند', (() => {
    const vega = full83.phases.find((p) => p.key === 'vega');
    return vega.gain > 0 && vega.loss < 0 && Math.abs(vega.net - (vega.gain + vega.loss)) < 1e-9;
  })());
  check('مسیر تجمعی، در نقطهٔ آخر با جمع می‌خواند',
    Math.abs(full83.cumulative.at(-1).actual - full83.totals.actual) < 1e-6);
  check('پررنگ‌ترین عامل هر گام، بزرگ‌ترین قدر مطلق است', (() => {
    const step = full83.steps[0];
    const best = dominantDriver(step);
    return DRIVERS.every((d) => !Number.isFinite(step[d.key]) || Math.abs(step[d.key]) <= Math.abs(best.value));
  })());
  check('نقاط عطف از بزرگ به کوچک مرتب‌اند', (() => {
    const list = turningPoints(full83.steps, 5);
    return list.every((item, i) => !i || Math.abs(list[i - 1].step.actual) >= Math.abs(item.step.actual));
  })());
  check('رو ستون ندارد، چون نرخ در بازپخش ثابت است',
    !DRIVERS.some((d) => d.key === 'rho'), DRIVERS.map((d) => d.key).join(','));

  // فاصلهٔ زمانی: ثانیه هم باید بشمارد وگرنه تتای یک روز کامل روی گام
  // یک‌دقیقه‌ای می‌نشیند
  check('فاصلهٔ دو نقطهٔ هم‌روز از ثانیه می‌آید',
    Math.abs(elapsedDays({ date: 20260101, second: 34200 }, { date: 20260101, second: 34260 }) - 60 / 86400) < 1e-12);
  check('فاصلهٔ دو روز، روز تقویمی است',
    elapsedDays({ date: 20260101 }, { date: 20260103 }) === 2);

  // مسیر روزانه از بازپخش، بدون ردیف فاقد داده
  const rows83 = [
    { date: 20260101, status: 'ok', dateLabel: 'الف', baseClose: 10000, perLeg: [{ exitPrice: 900, netPnl: 0, ivPct: 60 }] },
    { date: 20260102, status: 'missing', dateLabel: 'ب', perLeg: [] },
    { date: 20260103, status: 'ok', dateLabel: 'ج', baseClose: 10200, perLeg: [{ exitPrice: 980, netPnl: 80000, ivPct: 61 }] },
  ];
  check('ردیف فاقد داده وارد تجزیه نمی‌شود', dailyTrack({ rows: rows83 }).length === 2);
}
