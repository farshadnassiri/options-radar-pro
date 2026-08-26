// ۴۹. سنجه‌های رصدگر لحظه‌ای
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { COLUMNS, breakevenMetrics, evaluate } from '../../core/evaluate.mjs';
import { analyzePayoff, grossCash } from '../../core/payoff.mjs';


// ═══════════════════════════ ۴۹. سنجه‌های رصدگر لحظه‌ای ═══════════════════════════
group('۴۹. سنجه‌های رصدگر لحظه‌ای');
{
  // کندور آهنی: خرید پوت ۸۰ به ۱ ، فروش پوت ۹۰ به ۳ ، فروش کال ۱۱۰ به ۳ ، خرید کال ۱۲۰ به ۱
  const legs49 = [
    { kind: 'put', side: 'buy', strike: 80, price: 1, ratio: 1, size: 1000 },
    { kind: 'put', side: 'sell', strike: 90, price: 3, ratio: 1, size: 1000 },
    { kind: 'call', side: 'sell', strike: 110, price: 3, ratio: 1, size: 1000 },
    { kind: 'call', side: 'buy', strike: 120, price: 1, ratio: 1, size: 1000 },
  ];
  const an49 = analyzePayoff(legs49, grossCash(legs49));
  const be49 = breakevenMetrics(an49.breakevens, 100);
  // سربه‌سری‌ها ۸۶ و ۱۱۴ ، پایه ۱۰۰ → نزدیک‌ترین ۱۱۴ نیست، هر دو ۱۴ فاصله دارند
  check('نزدیک‌ترین سربه‌سری، اولین با کمترین فاصله است', near(be49.beNear, 86), be49.beNear);
  check('فاصله علامت‌دار است — پایه بالای سربه‌سری یعنی مثبت', be49.beDistPct > 0 && near(be49.beDistPct, 14));
  check('حاشیه امن بی‌علامت است', near(be49.beRoomPct, 14));
  check('پهنای سربه‌سری برای ترکیب دوسره معنی دارد', near(be49.beWidthPct, 28), be49.beWidthPct);

  // تک‌سربه‌سری: پهنا نباید عدد بسازد
  const one49 = breakevenMetrics([95], 100);
  check('یک سربه‌سری یعنی پهنا خالی، نه صفر', !Number.isFinite(one49.beWidthPct) && near(one49.beDistPct, 5));
  check('بدون سربه‌سری یا بدون پایه، همه خالی می‌مانند',
    !Number.isFinite(breakevenMetrics([], 100).beNear) && !Number.isFinite(breakevenMetrics([95], 0).beNear));

  // ——— درصد سمت زیان و نسبت پاداش به ریسک ———
  const cols49 = new Set(COLUMNS.map((c) => c.key));
  check('ستون درصد بیشترین زیان هست', cols49.has('maxLossPct'));
  check('ستون پاداش به ریسک هست', cols49.has('rewardRisk'));
  const src49 = readSrc('../core/evaluate.mjs');
  // بی‌نهایت در مخرج، صفر می‌دهد و صفرِ ساختگی بدتر از خالی است.
  check('زیان نامحدود، نسبت پاداش به ریسک نمی‌سازد',
    src49.includes('ok(bestPnl) && ok(payoff.maxLoss) && payoff.maxLoss > 0'));
  check('درصد زیان به سرمایه سنجیده می‌شود، نه به چیز دیگر',
    src49.includes('(payoff.maxLoss / cap) * 100'));

  // ——— دیده شدن در نمای پیش‌فرض ———
  //
  // ستون‌های سربه‌سری از قبل در قرارداد ستونی بودند ولی در هیچ نمای آماده‌ای
  // نبودند؛ یعنی عملاً کسی نمی‌دیدشان. آزمون، همان دیده‌شدن را قفل می‌کند.
  const stratSrc49 = readSrc('../ui/tabs/strategy.mjs');
  const topSrc49 = readSrc('../ui/tabs/top.mjs');
  const summary49 = /خلاصه: \[([\s\S]*?)\],\n/.exec(stratSrc49)?.[1] || '';
  for (const k of ['be1DistPct', 'beRoomPct', 'maxProfit', 'maxProfitPct', 'retMaxPct', 'maxLoss',
    'maxLossPct', 'rewardRisk', 'expiryLabel', 'strikes', 'legNames']) {
    check(`نمای خلاصهٔ استراتژی ستون ${k} را دارد`, summary49.includes(`'${k}'`));
  }
  for (const k of ['beDistPct', 'beRoomPct', 'maxLossPct', 'rewardRisk']) {
    check(`نمای برترین موقعیت‌ها ستون ${k} را دارد`, topSrc49.includes(`'${k}'`));
  }
}
