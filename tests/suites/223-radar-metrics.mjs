// ۲۲۳. سنجه‌های کاملِ یک ترکیب رادار
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «تمامی ایتمهای تاثیر گذار داخل جدول بیار … (حداکثر سود، زیان، درصد سود،
// زیان و …) با الهام از سایر جداول برنامه.» و: «ارزش معامله به فیلترها
// اضافه بشه.» و: «قسمت short strangle درست نمایش داده نمیشه.»
//
// سه ادعا که این دسته قفلشان می‌کند:
//
//   یک خط لوله      رادار همان `analyzePayoff → strategyMargin →
//                   capitalBase` را اجرا می‌کند که بقیهٔ برنامه. دو
//                   «بیشترین زیان» متفاوت از یک ترکیب، بدترین حالتِ
//                   ممکن است، چون هیچ‌کدام غلط به نظر نمی‌رسد.
//   درصد از مقیاس   نمی‌گیرد. مقیاسِ نمایش عددِ ریالی را عوض می‌کند و
//                   «بازده» را نه — چون صورت و مخرج هر دو از اندازهٔ
//                   واقعی می‌آیند.
//   نامحدود، عدد نیست  استرانگل فروش زیانِ نامحدود دارد و همان‌طور حمل
//                   می‌شود. تبدیلش به عددی بزرگ، ستونی می‌سازد که
//                   می‌شود رویش مرتب کرد و دروغ می‌گوید.

import { check, group, near } from '../harness.mjs';
import { comboMetrics, contractSizeOf, passesValueFilter } from '../../core/radar-metrics.mjs';
import { defaults } from '../../core/settings.mjs';

const S = defaults();
const SPOT = 54000;

const BULL = [
  { ins: 'c50', kind: 'call', side: 'buy', strike: 50000, size: 1000, ratio: 1, name: 'ضهرم۵۰' },
  { ins: 'c60', kind: 'call', side: 'sell', strike: 60000, size: 1000, ratio: 1, name: 'ضهرم۶۰' },
];
const SHORT_STRANGLE = [
  { ins: 'p50', kind: 'put', side: 'sell', strike: 50000, size: 1000, ratio: 1, name: 'طهرم۵۰' },
  { ins: 'c60', kind: 'call', side: 'sell', strike: 60000, size: 1000, ratio: 1, name: 'ضهرم۶۰' },
];
const row = (value, vol) => ({ date: 20260901, close: 1, last: 1, first: 1, vol, value });

group('۲۲۳-الف. بیشترین سود و زیان، و درصدشان');
{
  const bull = comboMetrics({
    legs: BULL, prices: { c50: 5000, c60: 1000 }, spot: SPOT,
    settings: S, daysLeft: 30, scale: 'raw', units: 1,
  });
  check('اسپرد صعودی کال بدهکار است و بهایش ۴٬۰۰۰',
    bull.ok && bull.side === 'debit' && bull.cost === 4000, `${bull.side} ${bull.cost}`);
  check('بیشترین سودش زیر عرضِ ۱۰٬۰۰۰ منهای بها می‌ماند — کارمزد تسویه واقعی است',
    bull.maxProfit > 5800 && bull.maxProfit < 6000, `${bull.maxProfit}`);
  check('بیشترین زیانش همان بهایی است که پرداخته‌ای',
    near(bull.maxLoss, 4000), `${bull.maxLoss}`);
  check('هیچ‌کدام نامحدود نیست',
    bull.unlimitedProfit === false && bull.unlimitedLoss === false);
  check('سربه‌سری بین دو اعمال می‌افتد و فاصله‌اش از پایه درصد دارد',
    bull.beLow > 50000 && bull.beLow < 60000 && Number.isFinite(bull.beLowPct),
    `${Math.round(bull.beLow)} · ${bull.beLowPct.toFixed(1)}٪`);
  check('سرمایهٔ درگیر از همان تعریفِ قفل‌شدهٔ برنامه می‌آید و برچسبش را می‌گوید',
    bull.capital > 0 && bull.capitalLabel.length > 0, bull.capitalLabel);
  check('درصد سود و درصد زیان هر دو ساخته می‌شوند',
    bull.returnPct > 100 && near(bull.lossPct, 100), `${bull.returnPct.toFixed(1)}٪ / ${bull.lossPct.toFixed(1)}٪`);
  check('نسبت پاداش به ریسک همان تقسیمِ آن دو است',
    near(bull.rewardRisk, bull.maxProfit / bull.maxLoss), `${bull.rewardRisk}`);
  check('سود روزانه و ماهانه از روزهای مانده درمی‌آیند',
    near(bull.perDayPct, bull.returnPct / 30)
    && near(bull.monthlyPct, bull.perDayPct * S.daysPerMonth));
}

group('۲۲۳-ب. استرانگل فروش — همان چیزی که «درست نمایش داده نمی‌شد»');
{
  const short = comboMetrics({
    legs: SHORT_STRANGLE, prices: { p50: 300, c60: 400 }, spot: SPOT,
    settings: S, daysLeft: 30, scale: 'raw', units: 1,
  });
  check('بستانکار است و بیشینهٔ سودش همان ۷۰۰ بستانکارِ امروز',
    short.ok && short.side === 'credit' && near(short.maxProfit, 700), `${short.maxProfit}`);
  // زیانِ فروشندهٔ استرانگل سقف ندارد. عددی‌کردنش ستونی می‌سازد که
  // می‌شود رویش مرتب کرد و «کم‌ریسک‌ترین» را غلط نشان می‌دهد.
  check('زیانش نامحدود است و همان‌طور حمل می‌شود، نه به‌شکل عددی بزرگ',
    short.maxLoss === Infinity && short.unlimitedLoss === true, `${short.maxLoss}`);
  check('و چون نامحدود است، «درصد زیان» ساخته نمی‌شود',
    !Number.isFinite(short.lossPct));
  // ═══ همان بندی که رادار را از «هیچ عددی ندارم» درمی‌آورد ═══
  //
  // پیش از این استرانگل هیچ درصدِ بازدهی نمی‌گرفت، چون تنها مخرجِ در
  // دسترس بستانکارِ ورود بود و آن مخرج مدافع‌پذیر نیست. مخرجِ درست وجه
  // تضمین است، و این ماژول آن را از موتور مقرراتیِ خودِ برنامه می‌گیرد.
  check('ولی بازده دارد، چون مخرجش وجه تضمینِ مقرراتی است نه بستانکار',
    short.marginNet > 0 && short.returnPct > 0
    && near(short.returnPct, (700 * 1000 / short.capital) * 100),
    `${short.returnPct.toFixed(2)}٪ بر ${short.capital}`);
  check('دو سربه‌سری دارد و پهنای امنش درصد می‌گیرد',
    short.breakevens.length === 2 && short.beLow < SPOT && short.beHigh > SPOT
    && short.beWidthPct > 0,
    `${Math.round(short.beLow)}–${Math.round(short.beHigh)} · ${short.beWidthPct.toFixed(1)}٪`);

  const long = comboMetrics({
    legs: SHORT_STRANGLE.map((leg) => ({ ...leg, side: 'buy' })),
    prices: { p50: 300, c60: 400 }, spot: SPOT, settings: S, daysLeft: 30,
  });
  check('استرانگلِ خرید وارونه است: سودش نامحدود و زیانش همان بهای پرداختی',
    long.unlimitedProfit === true && near(long.maxLoss, 700)
    && !Number.isFinite(long.returnPct), `${long.maxLoss}`);
}

group('۲۲۳-ج. مقیاسِ نمایش عددِ ریالی را عوض می‌کند، بازده را نه');
{
  const make = (scale, units) => comboMetrics({
    legs: BULL, prices: { c50: 5000, c60: 1000 }, spot: SPOT,
    settings: S, daysLeft: 30, scale, units,
  });
  const raw = make('raw', 1), size = make('size', 1), qty = make('qty', 5);
  check('عددِ ریالیِ بیشترین سود با مقیاس بزرگ می‌شود',
    near(size.maxProfit, raw.maxProfit * 1000)
    && near(qty.maxProfit, raw.maxProfit * 5000),
    [raw.maxProfit, size.maxProfit, qty.maxProfit].join(' · '));
  check('ولی درصد بازده در هر سه یکی است',
    near(raw.returnPct, size.returnPct) && near(size.returnPct, qty.returnPct),
    [raw.returnPct, size.returnPct, qty.returnPct].map((v) => v.toFixed(4)).join(' · '));
  check('سربه‌سری قیمتِ پایه است و اصلاً به مقیاس کاری ندارد',
    near(raw.beLow, qty.beLow));
  check('اندازهٔ قرارداد از خودِ پاها می‌آید، نه از تنظیمات',
    contractSizeOf(BULL, S) === 1000
    && contractSizeOf([{ kind: 'call', side: 'buy', size: 0 }], { contractSize: 42 }) === 42);
}

group('۲۲۳-د. ارزش معامله — پالایه‌ای که «هست ولی معامله نمی‌شود» را کنار می‌گذارد');
{
  const withMarket = (values) => comboMetrics({
    legs: BULL, prices: { c50: 5000, c60: 1000 }, spot: SPOT, settings: S, daysLeft: 30,
    rowByIns: { c50: row(values[0], values[0] / 10), c60: row(values[1], values[1] / 10) },
  });
  const rich = withMarket([9e9, 4e9]);
  check('ارزشِ معاملهٔ ترکیب، کمترینِ پاهاست نه جمعشان',
    rich.legValue === 4e9 && rich.legValueSum === 13e9, `${rich.legValue}`);
  check('حجم هم به همان قاعده — پای نازک، کلِ ترکیب را نازک می‌کند',
    rich.legVolume === 4e8);
  check('ترکیبِ پرمعامله از آستانه رد می‌شود',
    passesValueFilter(rich, { minLegValue: 1e9 }) === true);
  const thin = withMarket([9e9, 0]);
  check('و ترکیبی که یک پایش امروز معامله نشده، نمی‌شود',
    passesValueFilter(thin, { minLegValue: 1e9 }) === false && thin.thinLegs === 1);
  check('آستانهٔ صفر یعنی قیدی نگذاشته‌ای، پس هیچ ردیفی نمی‌افتد',
    passesValueFilter(thin, { minLegValue: 0, minLegVolume: 0 }) === true);
  // «خالی» با «صفر» یکی نیست: ترکیبی که اصلاً سطر بازار ندارد با قیدِ
  // ارزش کنار می‌رود (چون سنجیده نشد و ادعای نقدشوندگی هم ندارد)، ولی
  // بی‌قید دست‌نخورده می‌ماند.
  const blind = comboMetrics({ legs: BULL, prices: { c50: 5000, c60: 1000 }, spot: SPOT, settings: S });
  check('بی سطرِ بازار، ارزش صفر گزارش می‌شود نه عددی ساختگی',
    blind.legValue === 0 && passesValueFilter(blind, {}) === true);
}

group('۲۲۳-ه. مرزهای اعلام‌شده');
{
  check('پای بی‌قیمت، سنجه نمی‌سازد و علتش را می‌گوید',
    comboMetrics({ legs: BULL, prices: { c50: 5000 }, spot: SPOT, settings: S }).ok === false);
  check('ترکیب بی پای اختیار هم همین‌طور',
    comboMetrics({ legs: [], prices: {}, spot: SPOT, settings: S }).ok === false);
  // وجه تضمین عددی مقرراتی است و به قیمت پایه بسته. بی قیمت پایه ساخته
  // نمی‌شود، ولی بقیهٔ سنجه‌ها که به آن وابسته نیستند سر جایشان می‌مانند.
  const noSpot = comboMetrics({ legs: BULL, prices: { c50: 5000, c60: 1000 }, settings: S });
  check('بی قیمت پایه، وجه تضمین ساخته نمی‌شود ولی سود و زیان می‌مانند',
    noSpot.ok === true && !Number.isFinite(noSpot.marginNet) && noSpot.maxProfit > 0);
}
