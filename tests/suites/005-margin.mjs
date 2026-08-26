// ۵. پوشش موقعیت و قاعده بستانکار در برابر بدهکار
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import {
  coverage, initialMargin, marginBase, requiredMargin, strategyMargin,
} from '../../core/margin.mjs';
import { defaults, marginParamsOf } from '../../core/settings.mjs';


// ═══════════════════════════ ۵. پوشش و قاعده بستانکار ═══════════════════════════
group('۵. پوشش موقعیت و قاعده بستانکار در برابر بدهکار');
{
  const size = 1000, S = 100;
  const mk = (kind, side, strike, price, ratio = 1, days = 30) => ({ kind, side, strike, price, ratio, size, days });
  const M = (legs) => strategyMargin(legs, { S, closes: {}, creditMode: 'FULL' });

  // چهار اسپرد عمودی: جهت و بستانکاری یکی نیستند
  const bullCall = [mk('call', 'buy', 100, 12), mk('call', 'sell', 120, 5)];
  const bearCall = [mk('call', 'sell', 100, 12), mk('call', 'buy', 120, 5)];
  const bullPut = [mk('put', 'buy', 80, 2), mk('put', 'sell', 100, 9)];
  const bearPut = [mk('put', 'sell', 80, 2), mk('put', 'buy', 100, 9)];

  check('اسپرد صعودی کال بدهکار است → وجه تضمین صفر', !M(bullCall).isCredit && M(bullCall).margin === 0);
  check('اسپرد نزولی کال بستانکار است → وجه تضمین دارد', M(bearCall).isCredit && M(bearCall).margin > 0);
  check('اسپرد صعودی پوت بستانکار است → وجه تضمین دارد، هرچند صعودی',
    M(bullPut).isCredit && M(bullPut).margin > 0);
  check('اسپرد نزولی پوت بدهکار است → وجه تضمین صفر، هرچند نزولی',
    !M(bearPut).isCredit && M(bearPut).margin === 0);

  // پوشش کامل در برابر ناقص
  check('اسپرد نزولی کال، پوشش کامل', coverage(bearCall).state === 'full');
  const ratio = [mk('call', 'buy', 100, 10), mk('call', 'sell', 110, 5, 2)];
  check('نسبت‌اسپرد، پوشش ناقص', coverage(ratio).state === 'partial', `نسبت لخت ${coverage(ratio).nakedRatio}`);
  check('نسبت‌اسپرد بدهکار هم وجه تضمین می‌گیرد، چون بخشی لخت است',
    M(ratio).margin > 0, `وجه تضمین ${Math.round(M(ratio).margin).toLocaleString()}`);
  // و یادداشتش هم باید همین را بگوید. «بدهکار یعنی بی‌تعهد» فقط برای
  // ترکیب پوشیده درست است؛ متن قدیمی همان جمله را برای نسبت‌اسپرد هم چاپ
  // می‌کرد، درست کنار وجه تضمینی که خودش گزارش کرده بود.
  check('و یادداشتش «وجه تضمین گرفته نمی‌شود» نمی‌گوید',
    M(ratio).note.includes('فروش برهنه'), M(ratio).note);
  check('ترکیب بدهکارِ پوشیده همچنان «وجه تضمین گرفته نمی‌شود» می‌گیرد',
    M(bearPut).margin === 0 && M(bearPut).note.includes('گرفته نمی‌شود'), M(bearPut).note);

  // کاوردکال: پوشش با سهم پایه، وجه تضمین نقدی صفر
  const cc = [{ kind: 'underlying', side: 'buy', price: 100, ratio: 1, size }, mk('call', 'sell', 110, 5)];
  check('کاوردکال، وجه تضمین نقدی ندارد', M(cc).margin === 0 && coverage(cc).state === 'full');

  // پوشش با سررسید نزدیک‌تر معتبر نیست
  const badCal = [mk('call', 'buy', 100, 5, 1, 10), mk('call', 'sell', 100, 8, 1, 60)];
  check('پای محافظ با سررسید نزدیک‌تر، پوشش نیست', coverage(badCal).state === 'naked');

  // تقویمی درست: خرید دور، فروش نزدیک
  const cal = [mk('call', 'sell', 100, 5, 1, 20), mk('call', 'buy', 100, 9, 1, 80)];
  check('تقویمی، پوشش کامل', coverage(cal).state === 'full');
  check('تقویمی بدهکار → وجه تضمین صفر، ولی تضمین شرطی مثبت',
    M(cal).margin === 0 && M(cal).conditionalMargin > 0,
    `شرطی ${Math.round(M(cal).conditionalMargin).toLocaleString()}`);

  // سه حالت مقدار وجه تضمین بستانکار
  const full = strategyMargin(bearCall, { S, closes: {}, creditMode: 'FULL' }).margin;
  const less = strategyMargin(bearCall, { S, closes: {}, creditMode: 'LESS_WIDTH' }).margin;
  const width = strategyMargin(bearCall, { S, closes: {}, creditMode: 'WIDTH' }).margin;
  check('سه حالت وجه تضمین بستانکار، سه عدد متفاوت',
    full > less && less >= 0 && width > 0,
    `الف ${Math.round(full).toLocaleString()} | ب ${Math.round(less).toLocaleString()} | ج ${Math.round(width).toLocaleString()}`);
  // ——— قاعدهٔ ترکیبی فروش هم‌زمان کال و پوت ———
  //
  // ضوابط، استرادل و استرانگل هم‌ماه را یک راهبرد می‌شناسد: بزرگ‌ترِ وجه
  // تضمین لازم دو پا + پریمیوم قراردادی که IM کمتری دارد. جمع دو پا فقط
  // سناریوی دستی است.
  const strangle = [mk('call', 'sell', 110, 5), mk('put', 'sell', 90, 4)];
  const cMax = strategyMargin(strangle, { S, closes: { 0: 5, 1: 4 } });
  const cSum = strategyMargin(strangle, { S, closes: { 0: 5, 1: 4 }, nakedComboMargin: 'SUM' });
  check('پیش‌فرض فروش هم‌زمان کال و پوت، قاعدهٔ راهبردی ضوابط است',
    cMax.comboRule === 'MAX_PLUS_PREMIUM');
  check('قاعدهٔ متن ضوابط، وجه تضمین کمتری می‌دهد', cMax.margin < cSum.margin,
    `جمع ${Math.round(cSum.margin).toLocaleString()} | ضوابط ${Math.round(cMax.margin).toLocaleString()}`);
  check('و دقیقاً برابر «بزرگ‌ترِ RM + پریمیوم قرارداد با IM کمتر» است',
    Math.abs(cMax.margin - (Math.max(
      requiredMargin(S, 110, size, 'call', 5), requiredMargin(S, 90, size, 'put', 4),
    ) + 4 * size)) < 1e-6, `${Math.round(cMax.margin).toLocaleString()}`);
  check('برچسب قاعدهٔ به‌کاررفته گزارش می‌شود', cMax.comboRule === 'MAX_PLUS_PREMIUM');
  check('استرادل/استرانگل هم‌اندازه فقط یک جزء وجه تضمین دارد',
    cMax.components.length === 1 && cMax.components[0].type === 'combo'
    && near(cMax.components[0].amount, cMax.margin));

  // بازنویسی قدیمی max(IM)+هر دو پریمیوم همیشه هم‌ارز فرمول ضوابط نیست.
  // این نمونه عمداً پریمیوم پای با IM کمتر را بزرگ می‌گیرد تا دو فرمول از
  // هم جدا شوند: متن همان پریمیوم پوت را صریحاً اضافه می‌کند.
  const premiumCross = [mk('call', 'sell', 120, 30), mk('put', 'sell', 110, 1)];
  const cross = strategyMargin(premiumCross, { S, closes: { 0: 30, 1: 1 } });
  const literal = Math.max(
    requiredMargin(S, 120, size, 'call', 30), requiredMargin(S, 110, size, 'put', 1),
  ) + 30 * size;
  const oldRewrite = Math.max(
    initialMargin(S, 120, size, 'call'), initialMargin(S, 110, size, 'put'),
  ) + 31 * size;
  check('فرمول مستقیم ضوابط جای بازنویسی نامعتبر قبلی را گرفته است',
    cross.margin === literal && cross.margin !== oldRewrite,
    `${cross.margin.toLocaleString()} در برابر بازنویسی ${oldRewrite.toLocaleString()}`);

  const uneven = [mk('call', 'sell', 110, 5, 2), mk('put', 'sell', 90, 4)];
  const unevenMargin = strategyMargin(uneven, { S, closes: { 0: 5, 1: 4 } });
  check('در نسبت نابرابر، یک جفت ترکیبی و مازاد کال دو جزء جدا هستند',
    unevenMargin.comboRule === 'MAX_PLUS_PREMIUM' && unevenMargin.components.length === 2
    && near(unevenMargin.components.reduce((a, x) => a + x.amount, 0), unevenMargin.margin));
  check('تضمین لازم کل، نسبت هر پای فروش را حساب می‌کند',
    unevenMargin.requiredTotal === 2 * requiredMargin(S, 110, size, 'call', 5)
      + requiredMargin(S, 90, size, 'put', 4));
  // ترکیبی که متن ضوابط دربارهٔ آن حرفی نزده، از قاعده بیرون می‌ماند
  const twoCalls = [mk('call', 'sell', 110, 5), mk('call', 'sell', 120, 3)];
  check('دو کالِ لخت مشمول قاعدهٔ ترکیبی نیست — حدس زدن، اختراع عدد است',
    strategyMargin(twoCalls, { S, closes: { 0: 5, 1: 3 }, nakedComboMargin: 'MAX_PLUS_PREMIUM' }).comboRule === 'SUM');
  const crossExpiry = [mk('call', 'sell', 110, 5, 1, 30), mk('put', 'sell', 90, 4, 1, 90)];
  check('کال و پوت با دو سررسید هم بیرون می‌ماند',
    strategyMargin(crossExpiry, { S, closes: { 0: 5, 1: 4 }, nakedComboMargin: 'MAX_PLUS_PREMIUM' }).comboRule === 'SUM');
  const inverted = [mk('call', 'sell', 90, 5), mk('put', 'sell', 110, 4)];
  check('ترکیب اعمال‌وارونه، استرانگل مقرراتی فرض نمی‌شود',
    strategyMargin(inverted, { S, closes: { 0: 5, 1: 4 } }).comboRule === 'SUM');

  // ——— مبنای جزء B ———
  //
  // صورتحساب واقعی کارگزاری B×S را تا ریال آخر بازتولید می‌کند. B×K فقط
  // برای مقایسهٔ سطح‌پایین با متن‌های منتشرشده باقی است.
  const pSpot = { A: 0.20, B: 0.10, C: 10000, maint: 0.70, bBasis: 'SPOT' };
  const pStrike = { ...pSpot, bBasis: 'STRIKE' };
  check('پیش‌فرض جزء B، قیمت پایانی دارایی پایه است',
    marginBase(100, 300, size, 'call').legB === marginBase(100, 300, size, 'call', pSpot).legB);
  const staleMarginSettings = { ...defaults(), marginBBasis: 'STRIKE', nakedComboMargin: 'SUM' };
  check('تنظیم ذخیره‌شدهٔ نسخه قدیمی، مبنای B را عوض نمی‌کند',
    marginParamsOf(staleMarginSettings).bBasis === 'SPOT');
  check('با مبنای قیمت اعمال، جزء B عدد دیگری می‌شود',
    marginBase(100, 300, size, 'call', pStrike).legB === 0.10 * 300 * size);
  check('و آن اختلاف به وجه تضمین اولیه می‌رسد',
    initialMargin(100, 300, size, 'call', pStrike) > initialMargin(100, 300, size, 'call', pSpot),
    `${initialMargin(100, 300, size, 'call', pSpot).toLocaleString()} در برابر ${initialMargin(100, 300, size, 'call', pStrike).toLocaleString()}`);
  check('در حالت هم‌ارز — قیمت اعمال برابر قیمت پایه — دو مبنا یکی می‌شوند',
    initialMargin(100, 100, size, 'put', pStrike) === initialMargin(100, 100, size, 'put', pSpot));

}
