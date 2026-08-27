// ۳. بازده در سررسید — با کارمزد تسویه
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import {
  analyzePayoff, entryFees, exerciseThreshold, grossCash, pnlAtExpiry,
} from '../../core/payoff.mjs';


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

  // ═══ اعمال فقط وقتی به‌صرفه است ═══
  //
  // موتور قبلاً هر اختیارِ در سود را حتماً اعمال‌شده فرض می‌کرد. برای کالی
  // که یک‌صدم ریال در سود است، این یعنی کارمزد اعمال و کارمزد فروش سهم
  // روی **کل ارزش اسمی** بخورد تا چند ریال ارزش ذاتی گرفته شود. نتیجه‌اش
  // این بود که `analyzePayoff` بیشترین زیان را روی خودِ قیمت اعمال گزارش
  // می‌کرد، در حالی که `pnlAtExpiry` روی همان قیمت عدد دیگری می‌داد —
  // موتور با خودش نمی‌خواند.
  const K3 = 9500;
  const long3 = [{ kind: 'call', side: 'buy', strike: K3, price: 73, ratio: 40, size: 1000 }];
  const net3 = grossCash(long3) - entryFees(long3, fees);
  const a3 = analyzePayoff(long3, net3, { fees });

  check('بیشترین زیان کال خریداری‌شده دقیقاً پرمیوم و کارمزد ورود است، نه بیشتر',
    near(a3.maxLoss, -net3, 1e-9),
    `${Math.round(a3.maxLoss).toLocaleString()} ~ ${Math.round(-net3).toLocaleString()}`);
  check('بیشترین زیان با مقدار همان نقطه می‌خواند — موتور با خودش تناقض ندارد',
    near(-a3.maxLoss, pnlAtExpiry(long3, a3.atMaxLoss, net3, { fees }), 1e-9),
    `${Math.round(a3.maxLoss)} در ${a3.atMaxLoss}`);

  // آستانه: جایی که ارزش ذاتی تازه کارمزد اعمال و فروش سهم را می‌پوشاند.
  const t3 = exerciseThreshold(long3[0], fees);
  check('آستانهٔ اعمال بالاتر از قیمت اعمال است و فرمولش قابل بازسازی است',
    t3 > K3 && near(t3, (K3 * (1 + fees.exercise)) / (1 - fees.sellStock), 1e-9), `${t3.toFixed(2)}`);
  check('درست زیر آستانه، اعمال نمی‌شود و زیان همان پرمیوم می‌ماند',
    near(pnlAtExpiry(long3, t3 - 1, net3, { fees }), net3, 1e-9));
  // درست روی آستانه، سود و زیانِ اعمال صفر است — پس تابع آنجا پرش ندارد.
  // همان پرشِ ساختگی بود که «بیشترین زیان» را باد می‌کرد.
  check('روی خود آستانه، اعمال دقیقاً سربه‌سر است و تابع پرش نمی‌کند',
    near(pnlAtExpiry(long3, t3, net3, { fees }), net3, 1e-6)
    && near(pnlAtExpiry(long3, t3 + 1e-6, net3, { fees }), net3, 1e-3));
  check('و بالاتر از آستانه، اعمال سودآور می‌شود',
    pnlAtExpiry(long3, t3 + 1, net3, { fees }) > net3
    && pnlAtExpiry(long3, t3 + 1000, net3, { fees })
      > pnlAtExpiry(long3, t3 + 1, net3, { fees }));

  // سربه‌سری بالاتر از آستانه است، پس اصلاح نباید جابه‌جایش کند.
  check('سربه‌سری کالِ کارمزددار بالای آستانه است و واقعاً ریشه است',
    a3.breakevens.length === 1 && a3.breakevens[0] > t3
    // سربه‌سری تا یک‌میلیونیم ریال گرد می‌شود و شیب اینجا ~۳۹٬۶۰۰ است، پس
    // چند صدم ریال باقی‌مانده، خطای گردکردنِ گزارش است نه خطای ریشه.
    && Math.abs(pnlAtExpiry(long3, a3.breakevens[0], net3, { fees })) < 1,
    `${a3.breakevens[0].toFixed(6)} در برابر آستانهٔ ${t3.toFixed(2)}`);

  // بدون کارمزد، آستانه دقیقاً به قیمت اعمال برمی‌گردد.
  check('بدون کارمزد، آستانه همان قیمت اعمال است و رفتار قدیم حفظ می‌شود',
    exerciseThreshold(long3[0], { buyStock: 0, sellStock: 0, option: 0, exercise: 0 }) === K3);

  // پای فروخته‌شده آستانه ندارد: تصمیم مال طرف مقابل است و بدترین حالت
  // فرض می‌شود. ریسک نامحدود هم باید دست‌نخورده بماند.
  const short3 = [
    { kind: 'call', side: 'sell', strike: 10_500, price: 68, ratio: 40, size: 1000 },
    { kind: 'put', side: 'sell', strike: 9500, price: 78, ratio: 40, size: 1000 },
  ];
  const shortNet3 = grossCash(short3) - entryFees(short3, fees);
  const as3 = analyzePayoff(short3, shortNet3, { fees });
  check('پای فروخته‌شده آستانه نمی‌گیرد و روی قیمت اعمال می‌ماند',
    exerciseThreshold(short3[0], fees) === 10_500 && exerciseThreshold(short3[1], fees) === 9500);
  check('استرنگل فروش همچنان زیان نامحدود می‌دهد و عدد نمی‌گیرد',
    as3.unlimitedLoss === true && as3.maxLoss === Infinity);
}
