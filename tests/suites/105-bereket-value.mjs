// ۱۰۴. ارزش‌گذاری موقعیت و آزمون پذیرش فاز دو
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { decomposePnl } from '../../core/bereket-pnl.mjs';
import {
  CREDIT_MARGIN_POLICIES, creditSpreadMargin, marginAt, markMoment, valuationTrack,
} from '../../core/bereket-value.mjs';
import { bsPrice, impliedVol } from '../../core/bs.mjs';
import { coverage } from '../../core/margin.mjs';
import { analyzePayoff } from '../../core/payoff.mjs';


// ═══════════════════ ۱۰۴. ارزش‌گذاری موقعیت و آزمون پذیرش فاز دو ═══════════════════
//
// آزمون پذیرشی که سند برای این فاز خواسته: یک پوزیشن دستی، ارزش‌گذاری روز
// به روز، و باقی‌ماندهٔ کوچک. دنیای آزمون را خودِ بلک-شولز می‌سازد — پس
// اگر تجزیه درست باشد، باید تقریباً کاملش کند. باقی‌ماندهٔ بزرگ در چنین
// دنیایی یعنی ایراد از تجزیه است، نه از بازار.
group('۱۰۴. ارزش‌گذاری موقعیت و آزمون پذیرش فاز دو');
{
  // کف و سقف جست‌وجوی تلاطم **کسری‌اند** نه درصدی — همان واحدی که
  // `impliedVol` می‌فهمد. عدد درصدی اینجا یعنی کفِ صد درصد، و تلاطم
  // چهل درصدی زیر آن کف می‌افتد و ریشه پیدا نمی‌شود.
  const params = { rFree: 0.30, divYield: 0, yearDays: 365, ivLo: 0.01, ivHi: 5 };
  const SIGMA = 0.40;
  const legs = [
    { kind: 'call', side: 'buy', strike: 10_000, ratio: 1, size: 1000 },
    { kind: 'call', side: 'sell', strike: 11_000, ratio: 1, size: 1000 },
  ];
  const priceAt = (spot, daysLeft) => legs.map((leg) => bsPrice(
    leg.kind, spot, leg.strike, Math.max(daysLeft, 0.5) / 365, params.rFree, params.divYield, SIGMA,
  ));

  // ——— دنیای ساختگی: مسیر آرام قیمت، تلاطم ثابت ———
  const world = [];
  const spots = [10_000, 10_120, 10_050, 10_260, 10_400, 10_330, 10_510];
  spots.forEach((spot, at) => {
    world.push({ date: 20260501 + at, spot, daysLeft: 60 - at, prices: priceAt(spot, 60 - at) });
  });
  const entryPrices = world[0].prices;

  const track = valuationTrack({
    legs, entryPrices, params,
    moments: world.map((row) => ({ date: row.date })),
    feed: (at) => ({
      spot: world[at].spot, prices: world[at].prices,
      date: world[at].date, days: [world[at].daysLeft, world[at].daysLeft],
    }),
  });

  check('مسیر ارزش‌گذاری برای هر لحظه یک نقطه دارد', track.length === world.length);
  check('نقطهٔ ورود سود صفر دارد', Math.abs(track[0].grossPnl) < 1e-6);
  check('تلاطم استخراج‌شده همان تلاطمی است که قیمت با آن ساخته شد',
    track[3].ivPct.every((value) => Math.abs(value - SIGMA * 100) < 0.5),
    track[3].ivPct.map((v) => v.toFixed(2)).join('، '));
  check('هر پا سود و زیان جدا دارد و جمعشان ناخالص است', (() => {
    const row = track[4];
    return Math.abs(row.pnl[0] + row.pnl[1] - row.grossPnl) < 1e-6;
  })());
  check('شکل نقطه همان چیزی است که تجزیه می‌خواهد',
    ['label', 'date', 'spot', 'pnl', 'greeks', 'ivPct'].every((key) => key in track[0]));

  // ——— آزمون پذیرش: باقی‌مانده باید کوچک باشد ———
  const decomposed = decomposePnl({
    legs, track,
    entryCost: { commission: 1_500_000, crossing: 300_000, slippage: 0 },
    exitCost: { commission: 1_400_000, crossing: 280_000, slippage: 0 },
    marginNet: 0, rFree: params.rFree, days: 6, yearDays: 365,
  });
  check('اتحاد جمع در مسیر واقعی هم برقرار است', decomposed.identityOk === true);
  check('همهٔ گام‌ها تجزیه شدند', decomposed.incompleteSteps === 0 && Math.abs(decomposed.coverage - 100) < 1e-6);
  check('باقی‌ماندهٔ توضیح‌داده‌نشده کوچک است',
    decomposed.residualPct < 5, `${decomposed.residualPct.toFixed(2)}٪`);
  check('در دنیای بلک-شولز، هشدار باقی‌مانده روشن نمی‌شود', decomposed.residualWarn === false);
  check('چهار عامل با هم تقریباً کل حرکت را می‌سازند', (() => {
    const four = ['delta', 'gamma', 'vega', 'theta'].reduce((sum, key) => sum + decomposed.parts[key], 0);
    return Math.abs(four - decomposed.gross) / Math.abs(decomposed.gross) < 0.05;
  })());
  check('تلاطم ثابت یعنی سهم وگا ناچیز است',
    Math.abs(decomposed.parts.vega) < Math.abs(decomposed.gross) * 0.02);
  check('گذر زمان روی این اسپرد منفی نیست بلکه علامت خودش را دارد',
    Number.isFinite(decomposed.parts.theta));

  // ——— وجه تضمین ———
  {
    const marginParams = { A: 0.20, B: 0.10, C: 10000, maint: 0.70, bBasis: 'SPOT' };
    const debit = marginAt({ legs, prices: world[3].prices, spot: world[3].spot, params: marginParams });
    check('اسپرد بدهکار وجه تضمین بلوکه نمی‌کند', debit.isCredit === false && debit.blocked === 0);
    check('بیشترین زیان عدد واقعی است، نه صفرِ خاموش', (() => {
      // `analyzePayoff` پارامتر دومش نقد خالص است نه شیء تنظیمات. اگر شیء
      // بدهی، حساب داخلی به NaN می‌رود و بیشترین زیان صفر درمی‌آید — عددی
      // که هیچ جدولی به آن مشکوک نمی‌شود و همان‌جا در مخرج سرمایه و آزمون
      // مقاومت می‌نشیند.
      const spent = Math.abs(debit.netCash);
      return Number.isFinite(debit.maxLoss) && debit.maxLoss > 0
        && Math.abs(debit.maxLoss - spent) / spent < 0.05;
    })(), `${Number(debit.maxLoss).toFixed(0)} در برابر ${Math.abs(debit.netCash).toFixed(0)}`);
    check('سرمایهٔ درگیر اسپرد بدهکار، بدهکار خالص است', debit.capital.value > 0);

    const creditLegs = [
      { kind: 'put', side: 'sell', strike: 10_000, ratio: 1, size: 1000, price: 500 },
      { kind: 'put', side: 'buy', strike: 9_000, ratio: 1, size: 1000, price: 200 },
    ];
    const credit = marginAt({
      legs: creditLegs, prices: [500, 200], spot: 10_200, params: marginParams,
      creditPolicy: 'maxOfLossAndShortLeg',
    });
    check('اسپرد بستانکار وجه تضمین می‌گیرد', credit.isCredit === true && credit.blocked > 0);
    check('عدد بلوکه‌شده واقعاً از موتور وجه تضمین می‌آید، نه صفرِ نام‌غلط',
      credit.marginNet > 0 && Number.isFinite(credit.marginNet));
    check('عدد اسپرد بستانکار تخمینی برچسب می‌خورد', credit.estimated === true && !!credit.creditEstimate.label);
    check('سیاست بیشینه، از هر دو جزء بزرگ‌تر است', (() => {
      const onlyShort = marginAt({ legs: creditLegs, prices: [500, 200], spot: 10_200, params: marginParams, creditPolicy: 'shortLeg' });
      const onlyLoss = marginAt({ legs: creditLegs, prices: [500, 200], spot: 10_200, params: marginParams, creditPolicy: 'maxLoss' });
      return credit.blocked >= onlyShort.blocked - 1e-6 && credit.blocked >= onlyLoss.blocked - 1e-6;
    })());
    check('هر سه سیاست، تخمینی بودن را حمل می‌کنند',
      Object.keys(CREDIT_MARGIN_POLICIES).every((policy) =>
        creditSpreadMargin({ marginNet: 1e6, maxLoss: 2e6, policy }).estimated === true));
    check('زیان حداکثرِ نامعلوم، عدد ساختگی نمی‌سازد', (() => {
      const out = creditSpreadMargin({ marginNet: 1e6, maxLoss: NaN, policy: 'maxLoss' });
      return out.value === 1e6 && out.label.includes('نامعلوم');
    })());
    check('وجه تضمین با قیمت همان لحظه حساب می‌شود نه با قیمت ورود', (() => {
      // روی اسپرد پوشش‌یافته، پای فروش با پای خرید پوشش می‌شود و عدد به
      // فاصلهٔ دو قیمت اعمال می‌چسبد نه به قیمت قرارداد. پس ادعا را روی
      // پای لخت می‌سنجیم، جایی که وجه تضمین نگهداری واقعاً با قیمت روز
      // بالا و پایین می‌رود — و همین است که کال مارجین را می‌سازد.
      //
      // و عددی که باید سنجیده شود «وجه تضمین لازم» است نه «خالص». خالص،
      // پریمیوم دریافتی را کم می‌کند و چون هر دو با قیمت قرارداد بالا
      // می‌روند، تفاضلشان تقریباً ثابت می‌ماند. آنچه کال مارجین را
      // می‌سازد، همان عدد ناخالص است.
      const naked = [{ kind: 'put', side: 'sell', strike: 10_000, ratio: 1, size: 1000, price: 500 }];
      const cheap = marginAt({ legs: naked, prices: [500], spot: 10_200, params: marginParams });
      const dear = marginAt({ legs: naked, prices: [1500], spot: 10_200, params: marginParams });
      return dear.margin.requiredTotal > cheap.margin.requiredTotal && cheap.marginNet > 0;
    })());
  }

  // ——— پای بی‌قیمت ———
  check('پای بی‌قیمت سود صفر نمی‌گیرد بلکه نامعلوم می‌ماند', (() => {
    const row = markMoment({
      legs, prices: [world[2].prices[0], NaN], entryPrices, spot: world[2].spot,
      date: world[2].date, days: [58, 58], params,
    });
    return Number.isNaN(row.pnl[1]) && row.marked === 1;
  })());
  check('گام ناقص، پوشش تجزیه را کم می‌کند', (() => {
    const holed = track.map((row, at) => (at === 3 ? { ...row, ivPct: [row.ivPct[0], NaN] } : row));
    const out = decomposePnl({ legs, track: holed });
    return out.coverage < 100 && out.incompleteSteps > 0;
  })());
}
