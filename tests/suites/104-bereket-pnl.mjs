// ۱۰۳. تجزیهٔ کامل سود و زیان
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import {
  COST_KEYS, PNL_PARTS, decomposePnl, fundingCost, residualNote,
} from '../../core/bereket-pnl.mjs';
import { coverage } from '../../core/margin.mjs';


// ═══════════════════ ۱۰۳. تجزیهٔ کامل سود و زیان ═══════════════════
//
// بند اجباری سند: «باقی‌مانده توضیح‌داده‌نشده همیشه نمایش داده شود». پس
// آنچه سنجیده می‌شود این است که اتحاد جمع دقیقاً برقرار بماند و هیچ قلمی
// در دیگری قایم نشود.
group('۱۰۳. تجزیهٔ کامل سود و زیان');
{
  const legs = [
    { kind: 'call', side: 'buy', strike: 10000, ratio: 1, size: 1000 },
    { kind: 'call', side: 'sell', strike: 11000, ratio: 1, size: 1000 },
  ];
  const g = (delta, gamma, vega, theta) => ({ delta, gamma, vega, theta });
  const track = [
    {
      label: 'روز یک', date: 20260519, spot: 10000,
      pnl: [0, 0], ivPct: [40, 38],
      greeks: [g(0.55, 0.0004, 12, -30), g(0.30, 0.0003, 10, -22)],
    },
    {
      label: 'روز دو', date: 20260520, spot: 10200,
      pnl: [120_000_000, -60_000_000], ivPct: [42, 39],
      greeks: [g(0.60, 0.0004, 12, -32), g(0.34, 0.0003, 10, -24)],
    },
    {
      label: 'روز سه', date: 20260521, spot: 10150,
      pnl: [95_000_000, -48_000_000], ivPct: [41, 39],
      greeks: [g(0.58, 0.0004, 12, -31), g(0.32, 0.0003, 10, -23)],
    },
  ];
  const entryCost = { commission: 3_000_000, crossing: 1_200_000, slippage: 400_000 };
  const exitCost = { commission: 2_800_000, crossing: 900_000, slippage: 300_000 };

  const r = decomposePnl({
    legs, track, entryCost, exitCost,
    marginNet: 500_000_000, rFree: 0.30, days: 2, yearDays: 365,
  });

  check('اتحاد جمع دقیقاً برقرار است', r.identityOk === true, `فاصله ${r.identityGap}`);
  check('ناخالص، جمع حرکت پاهاست', Math.abs(r.gross - (95_000_000 - 48_000_000)) < 1e-6);
  check('خالص، ناخالص منهای هزینه‌هاست', Math.abs(r.net - (r.gross + r.costs)) < 1e-6);
  check('هر چهار هزینه علامت منفی دارند',
    COST_KEYS.every((key) => r.parts[key] <= 0));
  check('هزینهٔ ورود و خروج هر دو شمرده می‌شوند',
    Math.abs(r.parts.commission + (3_000_000 + 2_800_000)) < 1e-6);
  check('هزینه فرصت وجه تضمین از نرخ همان تاریخ می‌آید',
    Math.abs(r.parts.funding + (500_000_000 * 0.30 * (2 / 365))) < 1e-6);
  check('نبودن نرخ، هزینه فرصت نمی‌سازد و اعلام می‌کند', (() => {
    const noRate = decomposePnl({ legs, track, entryCost, exitCost, marginNet: 5e8, days: 2 });
    return noRate.parts.funding === 0 && noRate.fundingKnown === false;
  })());
  check('وجه تضمین صفر، هزینه فرصت ندارد',
    fundingCost({ marginNet: 0, rFree: 0.3, days: 10 }).rial === 0);

  check('باقی‌مانده در ردیف‌های نمایش هست',
    r.rows.some((row) => row.key === 'rest' && row.kind === 'residual'));
  check('ردیف‌های نمایش با اقلام یکی‌اند',
    r.rows.length === PNL_PARTS.length && r.rows.every((row) => row.rial === r.parts[row.key]));
  check('جملهٔ باقی‌مانده همیشه نوشته می‌شود، حتی وقتی کوچک است',
    typeof r.residualNote === 'string' && r.residualNote.length > 0);
  check('جملهٔ باقی‌مانده رقم لاتین ندارد', /^[^0-9]*$/.test(r.residualNote));

  // ——— هشدار باقی‌مانده ———
  check('باقی‌ماندهٔ بزرگ هشدار می‌دهد', (() => {
    // یونانی‌های کوچک یعنی مدل تقریباً هیچ‌چیز را توضیح نمی‌دهد.
    const blind = track.map((row) => ({ ...row, greeks: row.greeks.map(() => g(0.001, 0, 0, 0)) }));
    const out = decomposePnl({ legs, track: blind, entryCost, exitCost, rFree: 0.3 });
    return out.residualWarn === true && out.residualNote.includes('مدل قیمت‌گذاری');
  })());
  check('باقی‌ماندهٔ کوچک هشدار نمی‌دهد', (() => {
    const out = decomposePnl({ legs, track, entryCost, exitCost, rFree: 0.3, residualWarnPct: 100000 });
    return out.residualWarn === false && out.residualNote.includes('زیر آستانه');
  })());
  check('آستانهٔ هشدار قابل تنظیم است', (() => {
    const strict = decomposePnl({ legs, track, entryCost, exitCost, rFree: 0.3, residualWarnPct: 0 });
    return strict.residualWarn === true;
  })());

  // ——— پوشش ———
  check('پایی بدون تلاطم، پوشش را کم می‌کند و صفر جا نمی‌گذارد', (() => {
    const gap = track.map((row) => ({ ...row, ivPct: [row.ivPct[0], NaN] }));
    const out = decomposePnl({ legs, track: gap, entryCost, exitCost, rFree: 0.3 });
    return Number.isFinite(out.coverage) && out.coverage < 100 && out.incompleteSteps > 0
      && out.residualNote.includes('تجزیه نشده');
  })());
  check('مسیر بدون گام، عدد نمی‌سازد', (() => {
    const out = decomposePnl({ legs, track: [track[0]], entryCost: null, exitCost: null });
    return out.gross === 0 && !Number.isFinite(out.residualPct) && out.residualNote.includes('معنی ندارد');
  })());
}
