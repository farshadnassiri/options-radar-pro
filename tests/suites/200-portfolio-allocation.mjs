// ۲۰۰. سبد فرضی — قرارداد شکسته نمی‌شود، پول گم نمی‌شود

import { check, group, near } from '../harness.mjs';
import { ALLOCATION_REASONS, allocatePortfolio } from '../../core/portfolio-allocation.mjs';
import { analyzePortfolio } from '../../core/portfolio-report.mjs';
import { buildPnlMatrix } from '../../core/portfolio-matrix.mjs';

group('۲۰۰. سبد فرضی');
{
  const entry200 = {
    marginGross: 1000, netCash: 0, marginNet: 1000, capital: 1000, notional: 5000,
    legValue: 100, legValueComplete: true,
  };
  const combo200 = (id, strategyId, pnls, entry = entry200) => ({
    id, strategyId, strategyName: `استراتژی ${strategyId}`,
    groupId: 'g', groupName: 'دسته', feasible: true, entry,
    path: { daily: pnls.map((value, index) => (value === null ? null : { date: 20260801 + index, netPnl: value })).filter(Boolean) },
  });
  const analysisOf = (rows) => {
    const matrix = buildPnlMatrix(rows);
    matrix.baseSeries = rows[0].path.daily.map(() => 0);
    return analyzePortfolio({ rows, matrix });
  };

  const rows200 = [combo200('a', 'A', [10, 20, 30]), combo200('b', 'B', [-5, -5, 50])];
  const an200 = analysisOf(rows200);
  const out200 = allocatePortfolio({
    capitalRial: 100000, analysis: an200,
    picks: [{ strategyId: 'A', comboId: 'a', pct: 30 }, { strategyId: 'B', comboId: 'b', pct: 50 }],
  });

  check('تخصیص با درصدهای معتبر انجام می‌شود', out200.ok === true, out200.why);
  check('تعداد دست از تقسیم صحیح سهم بر بهای هر دست می‌آید',
    out200.legs[0].lots === 30 && out200.legs[1].lots === 50,
    JSON.stringify(out200.legs.map((leg) => leg.lots)));
  check('پول به‌کاررفته و پول نقدِ مانده روی هم سرمایهٔ اول دوره‌اند',
    out200.deployedRial + out200.idleRial === out200.capitalRial,
    `${out200.deployedRial} + ${out200.idleRial}`);
  check('درصد تخصیص‌نیافته به‌عنوان نقد می‌ماند، نه اینکه ناپدید شود',
    out200.idleRial === 20000, String(out200.idleRial));

  // ── مسیر سبد ───────────────────────────────────────────────────────
  check('سود هر روز، جمع وزنی سود اجزا در همان روز است',
    out200.path[2].totalPnlRial === 3400, String(out200.path[2].totalPnlRial));
  check('بازده سبد روی سرمایهٔ اول دورهٔ خودِ کاربر حساب می‌شود',
    near(out200.path[2].returnPct, 3.4, 1e-9), String(out200.path[2].returnPct));
  check('ارزش سبد، سرمایه به‌علاوهٔ سود است',
    out200.path[2].equityRial === 103400, String(out200.path[2].equityRial));

  // ── سهم هر جزء ─────────────────────────────────────────────────────
  check('بازده هر جزء روی پول درگیرِ خودش حساب می‌شود',
    out200.contributions[0].returnPct === 3 && out200.contributions[1].returnPct === 5);
  check('سهم هر جزء از سود کل، روی هم صد می‌شود',
    near(out200.contributions.reduce((sum, row) => sum + row.sharePct, 0), 100, 1e-9),
    String(out200.contributions.reduce((sum, row) => sum + row.sharePct, 0)));

  // ── قرارداد شکسته نمی‌شود ──────────────────────────────────────────
  const tiny200 = allocatePortfolio({
    capitalRial: 1000, analysis: an200, picks: [{ comboId: 'a', pct: 50 }],
  });
  check('سهمی که به یک دست نمی‌رسد، کسری تخصیص نمی‌گیرد',
    tiny200.legs[0].lots === 0 && tiny200.legs[0].why === ALLOCATION_REASONS.tooExpensive);
  check('سهم تأمین‌نشده، همهٔ پولش نقد می‌ماند',
    tiny200.legs[0].idleRial === 500 && tiny200.ok === false);
  const rounding200 = allocatePortfolio({
    capitalRial: 10000, analysis: an200, picks: [{ comboId: 'a', pct: 35 }],
  });
  check('باقی‌ماندهٔ گردکردن، نقد ثبت می‌شود نه دستِ کسری',
    rounding200.legs[0].lots === 3 && rounding200.legs[0].idleRial === 500,
    JSON.stringify([rounding200.legs[0].lots, rounding200.legs[0].idleRial]));

  // ── نبود داده، ارزش سبد را نامعلوم می‌کند ─────────────────────────
  const holed200 = analysisOf([combo200('a', 'A', [10, 20, 30]), combo200('c', 'C', [7, null, 9])]);
  const gap200 = allocatePortfolio({
    capitalRial: 100000, analysis: holed200,
    picks: [{ comboId: 'a', pct: 30 }, { comboId: 'c', pct: 30 }],
  });
  check('روزی که یک جزء قیمت ندارد، ارزش کل سبد نامعلوم می‌ماند',
    gap200.path[1].totalPnlRial === null && gap200.path[1].equityRial === null);
  check('سود شناخته‌شدهٔ همان روز جدا گزارش می‌شود',
    gap200.path[1].knownPnlRial === 600, String(gap200.path[1].knownPnlRial));
  check('شناسهٔ جزء بی‌داده نام برده می‌شود',
    JSON.stringify(gap200.path[1].unknown) === JSON.stringify(['c']));
  check('شمار روزهای معلوم و کل، جدا گزارش می‌شود',
    gap200.summary.knownDays === 2 && gap200.summary.totalDays === 3);

  // ── افت سبد ────────────────────────────────────────────────────────
  const sink200 = analysisOf([combo200('d', 'D', [50, -100, -20])]);
  const dd200 = allocatePortfolio({ capitalRial: 10000, analysis: sink200, picks: [{ comboId: 'd', pct: 100 }] });
  check('افت سبد از سقفِ ارزش شمرده می‌شود، نه از سرمایهٔ اول',
    dd200.summary.maxDrawdownRial === -1500, String(dd200.summary.maxDrawdownRial));
  check('نخستین روز سود سبد ثبت می‌شود', dd200.summary.firstProfitIndex === 0);

  // ── ورودی نامعتبر ──────────────────────────────────────────────────
  check('سرمایهٔ ثبت‌نشده، تخصیص نمی‌سازد',
    allocatePortfolio({ capitalRial: null, analysis: an200, picks: [{ comboId: 'a', pct: 50 }] }).why === ALLOCATION_REASONS.noCapital);
  for (const [label, value] of [['رشتهٔ خالی', ''], ['بولین', true], ['صفر', 0]]) {
    check(`سرمایهٔ ${label} پذیرفته نمی‌شود`,
      allocatePortfolio({ capitalRial: value, analysis: an200, picks: [{ comboId: 'a', pct: 50 }] }).ok === false, label);
  }
  check('مجموع درصدهای بیش از صد رد می‌شود',
    allocatePortfolio({
      capitalRial: 100000, analysis: an200,
      picks: [{ comboId: 'a', pct: 60 }, { comboId: 'b', pct: 60 }],
    }).why === ALLOCATION_REASONS.overAllocated);
  check('مجموع دقیقاً صد پذیرفته می‌شود',
    allocatePortfolio({
      capitalRial: 100000, analysis: an200,
      picks: [{ comboId: 'a', pct: 50 }, { comboId: 'b', pct: 50 }],
    }).ok === true);
  check('ترکیب ناموجود، دلیلش گفته می‌شود',
    allocatePortfolio({ capitalRial: 100000, analysis: an200, picks: [{ comboId: 'ندارد', pct: 50 }] })
      .legs[0].why === ALLOCATION_REASONS.comboMissing);
  check('بدون انتخاب، تخصیص ساخته نمی‌شود',
    allocatePortfolio({ capitalRial: 100000, analysis: an200, picks: [] }).why === ALLOCATION_REASONS.noPicks);
  check('درصد صفر یا منفی انتخاب شمرده نمی‌شود',
    allocatePortfolio({ capitalRial: 100000, analysis: an200, picks: [{ comboId: 'a', pct: 0 }] }).why === ALLOCATION_REASONS.noPicks);
}
