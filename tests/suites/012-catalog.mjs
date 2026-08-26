// ۱۱. عبور همه استراتژی‌ها از موتور — همان مسیر تب موتور
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { evaluate } from '../../core/evaluate.mjs';
import { coverage } from '../../core/margin.mjs';
import { defaults } from '../../core/settings.mjs';
import { CATALOG, buildLegs } from '../../strategies/catalog.mjs';


group('۱۱. عبور همه استراتژی‌ها از موتور — همان مسیر تب موتور');
{
  const s = defaults();
  const size = 1000, spot = 100000;
  const strikesAll = [90000, 95000, 100000, 105000];
  let broke = [];
  let unbounded = [];

  for (const def of CATALOG) {
    const strikes = strikesAll.slice(0, def.strikes);
    const legs = buildLegs(def, { strikes, size, days: [30, 90] });
    const quotes = legs.map((l) => {
      const intr = l.kind === 'underlying' ? spot
        : (l.kind === 'call' ? Math.max(0, spot - l.strike) : Math.max(0, l.strike - spot));
      const p = Math.round(l.kind === 'underlying' ? spot : intr + spot * 0.03);
      const half = Math.max(1, p * 0.02);
      return {
        bid: p - half, bidQty: 1e6, ask: p + half, askQty: 1e6,
        last: p, close: p, low: p * 0.9, high: p * 1.1, state: 'A', staleSec: 0,
        book: [{ level: 1, bid: p - half, bidQty: 1e6, ask: p + half, askQty: 1e6 }],
      };
    });
    try {
      const row = evaluate({
        legs, quotes,
        ctx: { S: spot, Sclose: spot, days: 30, size, qty: 1, settings: s, def, underlying: 'نمونه', sigmaHist: 0.6 },
      });
      const finite = ['netCash', 'capital', 'execCost', 'margin', 'conditionalMargin']
        .every((k) => Number.isFinite(row[k]));
      const beSane = row.breakevens.every((b) => b > 0 && Number.isFinite(b));
      if (!finite || !beSane) broke.push(def.id);
      if (row.unlimitedLoss) unbounded.push(def.name);
      // قاعده مرکزی باید در همه‌جا برقرار باشد
      if (!row.isCredit && row.margin > 0 && row.coverage === 'full') broke.push(`${def.id} — بدهکار با وجه تضمین`);
    } catch (e) {
      broke.push(`${def.id} → ${e.message}`);
    }
  }
  check('همه ۳۱ استراتژی بدون خطا ارزیابی شدند و اعداد متناهی دادند',
    broke.length === 0, broke.join(' | '));
  check('استراتژی‌های زیان‌نامحدود شناسایی شدند', unbounded.length > 0, unbounded.join(' , '));
}
