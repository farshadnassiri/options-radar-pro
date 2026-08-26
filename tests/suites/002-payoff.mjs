// ۲. بازده در سررسید — بدون کارمزد
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { analyzePayoff, grossCash } from '../../core/payoff.mjs';


// ═══════════════════════════ ۲. موتور بازده ═══════════════════════════
group('۲. بازده در سررسید — بدون کارمزد');
{
  const size = 1000;
  const mk = (kind, side, strike, price, ratio = 1) => ({ kind, side, strike, price, ratio, size });

  // کاوردکال: سهم ۱۰۰۰، فروش کال ۱۱۰۰ به ۵۰
  {
    const legs = [{ kind: 'underlying', side: 'buy', price: 1000, ratio: 1, size }, mk('call', 'sell', 1100, 50)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('کاوردکال سربه‌سری ۹۵۰', near(an.breakevens[0], 950), `${an.breakevens}`);
    check('کاوردکال بیشترین سود ۱۵۰٫۰۰۰', near(an.maxProfit, 150000));
    check('کاوردکال بیشترین زیان ۹۵۰٫۰۰۰', near(an.maxLoss, 950000));
    check('کاوردکال سود محدود', !an.unlimitedProfit);
  }

  // اسپرد صعودی کال: خرید ۱۰۰ به ۱۲، فروش ۱۲۰ به ۵
  {
    const legs = [mk('call', 'buy', 100, 12), mk('call', 'sell', 120, 5)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('اسپرد صعودی بدهکار ۷٫۰۰۰', near(grossCash(legs), -7000));
    check('اسپرد صعودی سربه‌سری ۱۰۷', near(an.breakevens[0], 107), `${an.breakevens}`);
    check('اسپرد صعودی بیشترین سود ۱۳٫۰۰۰', near(an.maxProfit, 13000));
    check('اسپرد صعودی بیشترین زیان ۷٫۰۰۰', near(an.maxLoss, 7000));
  }

  // کندور آهنی: خرید پوت ۸۰ به ۱، فروش پوت ۹۰ به ۳، فروش کال ۱۱۰ به ۳، خرید کال ۱۲۰ به ۱
  {
    const legs = [mk('put', 'buy', 80, 1), mk('put', 'sell', 90, 3), mk('call', 'sell', 110, 3), mk('call', 'buy', 120, 1)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('کندور آهنی بستانکار ۴٫۰۰۰', near(grossCash(legs), 4000));
    check('کندور آهنی دو سربه‌سری ۸۶ و ۱۱۴',
      an.breakevens.length === 2 && near(an.breakevens[0], 86) && near(an.breakevens[1], 114), `${an.breakevens}`);
    check('کندور آهنی بیشترین سود ۴٫۰۰۰', near(an.maxProfit, 4000));
    check('کندور آهنی بیشترین زیان ۶٫۰۰۰', near(an.maxLoss, 6000));
  }

  // باترفلای کال خرید: ۹۰ به ۱۲، دو تا ۱۰۰ به ۶، ۱۱۰ به ۲
  {
    const legs = [mk('call', 'buy', 90, 12), mk('call', 'sell', 100, 6, 2), mk('call', 'buy', 110, 2)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('باترفلای بدهکار ۲٫۰۰۰', near(grossCash(legs), -2000));
    check('باترفلای بیشترین سود ۸٫۰۰۰ سر ۱۰۰', near(an.maxProfit, 8000) && near(an.atMaxProfit, 100));
    check('باترفلای دو سربه‌سری ۹۲ و ۱۰۸',
      an.breakevens.length === 2 && near(an.breakevens[0], 92) && near(an.breakevens[1], 108), `${an.breakevens}`);
    check('باترفلای بیشترین زیان ۲٫۰۰۰', near(an.maxLoss, 2000));
  }

  // استرادل فروش: زیان دو طرف نامحدود
  {
    const legs = [mk('call', 'sell', 100, 8), mk('put', 'sell', 100, 7)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('استرادل فروش زیان نامحدود', an.unlimitedLoss);
    check('استرادل فروش سربه‌سری ۸۵ و ۱۱۵',
      near(an.breakevens[0], 85) && near(an.breakevens[1], 115), `${an.breakevens}`);
    check('استرادل فروش بیشترین سود ۱۵٫۰۰۰', near(an.maxProfit, 15000));
  }

  // نسبت‌اسپرد کال: خرید ۱۰۰، فروش دو تا ۱۱۰ → سود نامحدود ندارد، زیان نامحدود دارد
  {
    const legs = [mk('call', 'buy', 100, 10), mk('call', 'sell', 110, 5, 2)];
    const an = analyzePayoff(legs, grossCash(legs));
    check('نسبت‌اسپرد زیان نامحدود', an.unlimitedLoss);
    check('نسبت‌اسپرد شیب راست منفی', an.slopeRight < 0);
  }
}
