// ۸. احتمال سود از بازه‌های سود
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { probOfProfit, profitRegions } from '../../core/evaluate.mjs';
import { analyzePayoff, grossCash } from '../../core/payoff.mjs';


// ═══════════════════════════ ۸. احتمال سود ═══════════════════════════
group('۸. احتمال سود از بازه‌های سود');
{
  const size = 1000;
  const mk = (kind, side, strike, price, ratio = 1) => ({ kind, side, strike, price, ratio, size });

  const condor = [mk('put', 'buy', 80, 1), mk('put', 'sell', 90, 3), mk('call', 'sell', 110, 3), mk('call', 'buy', 120, 1)];
  const an = analyzePayoff(condor, grossCash(condor));
  const reg = profitRegions(an);
  check('کندور یک بازه سود دارد', reg.length === 1 && near(reg[0][0], 86) && near(reg[0][1], 114),
    reg.map((r) => `${r[0].toFixed(1)}..${r[1].toFixed(1)}`).join(' , '));
  const p = probOfProfit(an, 100, 30 / 365, 0.5);
  check('احتمال سود کندور بین صفر و صد', p > 0 && p < 100, `${p.toFixed(1)}٪`);

  const strad = [mk('call', 'buy', 100, 8), mk('put', 'buy', 100, 7)];
  const anS = analyzePayoff(strad, grossCash(strad));
  const regS = profitRegions(anS);
  check('استرادل خرید دو بازه سود دارد، دو طرف', regS.length === 2, `${regS.length}`);
  check('احتمال سود استرادل معنی‌دار است',
    probOfProfit(anS, 100, 30 / 365, 0.8) > 0, `${probOfProfit(anS, 100, 30 / 365, 0.8).toFixed(1)}٪`);
}
