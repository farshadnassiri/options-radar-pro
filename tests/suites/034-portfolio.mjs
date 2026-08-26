// ۳۳. گزارش همه استراتژی‌ها
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { summarizePortfolio } from '../../core/portfolio.mjs';


// ═══════════════════════════ ۳۳. گزارش همه استراتژی‌ها ═══════════════════════════
group('۳۳. گزارش همه استراتژی‌ها');
{
  const portfolioRows = [
    { id: 'a1', strategyId: 'a', strategyName: 'الف', groupId: 'g1', groupName: 'گروه یک', feasible: true, final: { netPnl: 100, returnPct: 10 } },
    { id: 'a2', strategyId: 'a', strategyName: 'الف', groupId: 'g1', groupName: 'گروه یک', feasible: true, final: { netPnl: -20, returnPct: -2 } },
    { id: 'b1', strategyId: 'b', strategyName: 'ب', groupId: 'g2', groupName: 'گروه دو', feasible: true, final: { netPnl: 30, returnPct: 3 } },
    { id: 'missing', strategyId: 'b', strategyName: 'ب', groupId: 'g2', groupName: 'گروه دو', feasible: true, final: null },
    { id: 'nulls', strategyId: 'b', strategyName: 'ب', groupId: 'g2', groupName: 'گروه دو', feasible: true, final: { netPnl: null, returnPct: null } },
  ];
  const report = summarizePortfolio(portfolioRows);
  check('گزارش سبد فقط خروجی عددی معتبر را می‌شمارد', report.total === 3 && report.excluded === 2);
  check('تعداد و درصد معاملات سودده و زیان‌ده درست است', report.wins === 2 && report.losses === 1 && near(report.winPct, 200 / 3));
  check('رتبه‌بندی استراتژی با میانه بازده انجام می‌شود، نه بهترین تک‌معامله', report.bestStrategy?.strategyId === 'a' && report.bestTrade?.id === 'a1');
  check('گزارش گروه و بدترین استراتژی را جدا نگه می‌دارد', report.groups.length === 2 && report.worstStrategy?.strategyId === 'b');
}
