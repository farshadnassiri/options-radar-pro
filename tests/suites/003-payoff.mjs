// ۳. بازده در سررسید — با کارمزد تسویه
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { analyzePayoff, entryFees, grossCash } from '../../core/payoff.mjs';


group('۳. بازده در سررسید — با کارمزد تسویه');
{
  const size = 1000;
  const fees = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };
  const legs = [
    { kind: 'underlying', side: 'buy', price: 1000, ratio: 1, size },
    { kind: 'call', side: 'sell', strike: 1100, price: 50, ratio: 1, size },
  ];
  const net = grossCash(legs) - entryFees(legs, fees);
  const an = analyzePayoff(legs, net, { fees });

  // سناریوی اعمال: سهم در قیمت اعمال تحویل می‌رود، پس فقط کارمزد اعمال
  const called = an.at(1200);
  const expectCalled = 1100 * size - 1100 * size * fees.exercise
    - 1000 * size * (1 + fees.buyStock) + 50 * size * (1 - fees.option);
  check('سناریوی اعمال — فقط کارمزد اعمال', near(called, expectCalled, 1e-9),
    `${Math.round(called).toLocaleString()} ~ ${Math.round(expectCalled).toLocaleString()}`);

  // سناریوی ایستا: سهم می‌ماند و برای نقد کردن، کارمزد فروش بازار می‌دهد
  const stat = an.at(1050);
  const expectStat = 1050 * size * (1 - fees.sellStock)
    - 1000 * size * (1 + fees.buyStock) + 50 * size * (1 - fees.option);
  check('سناریوی ایستا — کارمزد فروش بازار', near(stat, expectStat, 1e-9),
    `${Math.round(stat).toLocaleString()} ~ ${Math.round(expectStat).toLocaleString()}`);
  check('کارمزد، سربه‌سری را بالا می‌برد', an.breakevens[0] > 950, `${an.breakevens[0].toFixed(2)}`);
}
