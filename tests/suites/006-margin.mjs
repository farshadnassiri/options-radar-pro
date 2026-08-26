// ۵-ب. تطبیق وجه تضمین و بازده با صورتحساب کارگزاری
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { evaluate } from '../../core/evaluate.mjs';
import { DEFAULT_PARAMS, strategyMargin } from '../../core/margin.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';


// ═══════════════ ۵-ب. تطبیق با صورتحساب واقعی کارگزاری ═══════════════
group('۵-ب. تطبیق وجه تضمین و بازده با صورتحساب کارگزاری');
{
  const size = 1000;
  const S = 52990;
  const params = { ...DEFAULT_PARAMS, bBasis: 'SPOT' };
  const leg = (kind, strike, close, ratio) => ({
    kind, side: 'sell', strike, price: close, size, ratio, days: 58,
  });

  const broker300 = strategyMargin([
    leg('put', 42000, 1416, 300), leg('call', 56000, 5508, 300),
  ], { S, closes: { 0: 1416, 1: 5508 }, params, capitalMode: 'GROSS' });
  check('صورتحساب ۴۲٬۰۰۰ / ۵۶٬۰۰۰ با حجم ۳۰۰ دقیقاً بازتولید می‌شود',
    broker300.margin === 4_354_200_000, broker300.margin.toLocaleString());
  check('استرانگل ۳۰۰تایی فقط یک جزء تضمین ترکیبی دارد',
    broker300.comboRule === 'MAX_PLUS_PREMIUM' && broker300.components.length === 1
      && broker300.components[0].amount === broker300.margin);

  const broker200 = strategyMargin([
    leg('put', 46000, 2434, 200), leg('call', 62000, 3537, 200),
  ], { S, closes: { 0: 2434, 1: 3537 }, params, capitalMode: 'GROSS' });
  check('صورتحساب ۴۶٬۰۰۰ / ۶۲٬۰۰۰ با حجم ۲۰۰ دقیقاً بازتولید می‌شود',
    broker200.margin === 2_254_200_000, broker200.margin.toLocaleString());
  check('استرانگل ۲۰۰تایی هم فقط یک ستون وجه تضمین لازم دارد',
    broker200.components.length === 1 && broker200.components[0].amount === broker200.margin);

  // حتی اگر مرورگر تنظیم‌های حذف‌شدهٔ نسخهٔ قبلی را نگه داشته باشد، مسیر
  // تولید ردیف نباید دوباره دو پای فروش را جمع بزند یا به B×K برگردد.
  const stale = {
    ...defaults(), feeOption: 0, feeExercise: 0, rFree: 0,
    marginBBasis: 'STRIKE', nakedComboMargin: 'SUM',
  };
  const quote = (bid, ask, close) => ({
    bid, bidQty: 1e9, ask, askQty: 1e9, last: close, close,
    low: bid, high: ask, state: 'A', staleSec: 1,
    book: [{ level: 1, bid, bidQty: 1e9, ask, askQty: 1e9 }],
  });
  const def = byId('short-strangle');
  const legs = buildLegs(def, { strikes: [42000, 56000], size, days: [58] });
  const row = evaluate({
    legs,
    quotes: [quote(1363, 1416, 1416), quote(5467, 5508, 5508)],
    ctx: { S, Sclose: S, days: 58, size, qty: 300, settings: stale, def,
      underlying: 'اهرم', sigmaHist: 0.6 },
  });
  const grossCredit = (1363 + 5467) * size * 300;
  const capital = 4_354_200_000 - grossCredit;
  const expectedReturn = grossCredit / capital * 100;
  check('تنظیم SUM قدیمی در مسیر واقعی نادیده گرفته می‌شود',
    row.margin === 4_354_200_000 && row.marginParts.length === 1,
    `${row.margin.toLocaleString()} | ${row.marginParts.length} جزء`);
  check('وجه تضمین خالص، تضمین راهبرد منهای بستانکار ورود است',
    row.marginNet === capital && row.capital === capital,
    `${row.marginNet.toLocaleString()} | ${row.capital.toLocaleString()}`);
  check('درصد سود دوره از سرمایه درگیر اصلاح‌شده محاسبه می‌شود',
    near(row.retMaxPct, expectedReturn, 1e-9)
      && near(row.maxProfitPct, expectedReturn, 1e-9));
  check('درصد سود ماهانه نیز از همان مخرج اصلاح‌شده می‌آید',
    near(row.retMonthPct, expectedReturn * 30 / 58, 1e-9));
  check('زیان نامحدود استرانگل، درصد زیان ساختگی تولید نمی‌کند',
    !Number.isFinite(row.maxLoss) && !Number.isFinite(row.maxLossPct)
      && !Number.isFinite(row.rewardRisk));
  check('مبنای محاسبه در خروجی ردیف صریح است',
    row.marginNote.includes('قاعدهٔ ترکیبی') && row.marginNote.includes('قیمت پایانی پایه'));
}
