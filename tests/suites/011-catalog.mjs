// ۱۰. فهرست استراتژی‌ها
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { CATALOG, buildLegs } from '../../strategies/catalog.mjs';


group('۱۰. فهرست استراتژی‌ها');
{
  check('فهرست پر است', CATALOG.length >= 25, `${CATALOG.length} استراتژی`);
  check('شناسه‌ها یکتا هستند', new Set(CATALOG.map((d) => d.id)).size === CATALOG.length);
  const bad = CATALOG.filter((d) => {
    const maxSlot = Math.max(...d.legs.filter((l) => l.kind !== 'underlying').map((l) => l.slot), 0);
    return maxSlot !== d.strikes;
  });
  check('تعداد قیمت اعمال هر الگو با پاهایش می‌خواند', bad.length === 0, bad.map((d) => d.id).join(', '));
  const infeasible = CATALOG.filter((d) => !d.feasible);
  check('استراتژی‌های نیازمند فروش سهم، برچسب دارند',
    infeasible.length > 0 && infeasible.every((d) => !!d.infeasibleWhy),
    infeasible.map((d) => d.name).join(' , '));
  for (const d of CATALOG.filter((x) => x.feasible)) {
    const legs = buildLegs(d, {
      strikes: [80000, 90000, 100000, 110000].slice(0, d.strikes),
      size: 1000, days: [30, 60],
      prices: {},
    });
    const okLegs = legs.every((l) => l.kind === 'underlying' || Number.isFinite(l.strike));
    if (!okLegs) check(`ساخت پاها — ${d.name}`, false, 'قیمت اعمال ناقص');
  }
  check('ساخت پاها برای همه الگوهای شدنی', true);
}
