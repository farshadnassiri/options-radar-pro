// ۳۳. گزارش همه استراتژی‌ها
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { summarizePortfolio } from '../../core/portfolio.mjs';


// ═══════════════════════════ ۳۳. گزارش همه استراتژی‌ها ═══════════════════════════
group('۳۳. گزارش همه استراتژی‌ها');
{
  const portfolioRows = [
    { id: 'a1', strategyId: 'a', strategyName: 'الف', groupId: 'g1', groupName: 'گروه یک', feasible: true, final: { netPnl: 100, returnPct: 10 }, path: { daily: [{ date: 14050101, netPnl: -10, returnPct: -1 }, { date: 14050102, netPnl: 100, returnPct: 10 }] } },
    { id: 'a2', strategyId: 'a', strategyName: 'الف', groupId: 'g1', groupName: 'گروه یک', feasible: true, final: { netPnl: -20, returnPct: -2 }, path: { daily: [{ date: 14050101, netPnl: 30, returnPct: 3 }, { date: 14050102, netPnl: -20, returnPct: -2 }] } },
    { id: 'b1', strategyId: 'b', strategyName: 'ب', groupId: 'g2', groupName: 'گروه دو', feasible: true, final: { netPnl: 30, returnPct: 3 }, path: { daily: [{ date: 14050101, netPnl: 20, returnPct: 2 }, { date: 14050102, netPnl: 30, returnPct: 3 }] } },
    { id: 'missing', strategyId: 'b', strategyName: 'ب', groupId: 'g2', groupName: 'گروه دو', feasible: true, final: null },
    { id: 'nulls', strategyId: 'b', strategyName: 'ب', groupId: 'g2', groupName: 'گروه دو', feasible: true, final: { netPnl: null, returnPct: null } },
  ];
  const report = summarizePortfolio(portfolioRows);
  check('گزارش سبد فقط خروجی عددی معتبر را می‌شمارد', report.total === 3 && report.excluded === 2);
  check('تعداد و درصد معاملات سودده و زیان‌ده درست است', report.wins === 2 && report.losses === 1 && near(report.winPct, 200 / 3));
  check('رتبه‌بندی استراتژی با میانه بازده انجام می‌شود، نه بهترین تک‌معامله', report.bestStrategy?.strategyId === 'a' && report.bestTrade?.id === 'a1');
  check('گزارش گروه و بدترین استراتژی را جدا نگه می‌دارد', report.groups.length === 2 && report.worstStrategy?.strategyId === 'b');
  check('خط زمانی فقط روزها و عددهای معتبر را نگه می‌دارد', report.timeline.dates.join(',') === '14050101,14050102' && report.timeline.strategies.every((row) => row.observedDays === 2));
  check('رتبه روزانه از میانه ترکیب‌های همان استراتژی ساخته می‌شود', report.timeline.strategies.find((row) => row.strategyId === 'a')?.points.map((row) => row.rank).join(',') === '2,1');
  check('پایدارترین و ضعیف‌ترین رتبه بازه جدا از رتبه روز خروج گزارش می‌شوند', report.timeline.best?.strategyId === 'a' && report.timeline.worst?.strategyId === 'b');
  const coverageReport = summarizePortfolio([
    { id: 'full', strategyId: 'full', strategyName: 'کامل', groupId: 'g', groupName: 'گروه', final: { netPnl: 2, returnPct: 2 }, path: { daily: [{ date: 1, netPnl: 1, returnPct: 1 }, { date: 2, netPnl: 2, returnPct: 2 }] } },
    { id: 'sparse', strategyId: 'sparse', strategyName: 'ناقص', groupId: 'g', groupName: 'گروه', final: { netPnl: 100, returnPct: 100 }, path: { daily: [{ date: 2, netPnl: 100, returnPct: 100 }] } },
  ]);
  check('استراتژی کم‌مشاهده فقط با یک روز رتبه پایدار بازه نمی‌گیرد', coverageReport.bestStrategy?.strategyId === 'sparse' && coverageReport.timeline.best?.strategyId === 'full');
}
