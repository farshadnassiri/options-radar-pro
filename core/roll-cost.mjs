// اصطکاکِ رول — چیزی که «تفاضل دو موقعیت» نشانش نمی‌دهد.
//
// ═══ پرسشی که بی‌جواب مانده بود ═══
//
// تب رول می‌گوید «در کدام قیمت پایه، موقعیت تازه بهتر از فعلی درمی‌آید».
// درست است، ولی یک هزینه را در خودش قایم می‌کند: رول یعنی **دو معامله** —
// بستنِ پای فعلی و بازکردنِ پای تازه — و هر کدام کارمزد دارند و هر کدام از
// اسپرد عبور می‌کنند. تفاضل، این را در جریان نقد دارد ولی به‌عنوان یک عدد
// جدا نمی‌گوید؛ و کاربری که دو نامزد با تفاضلِ نزدیک به هم دارد، نمی‌داند
// کدامشان هزینهٔ اجرایش کمتر است.
//
// ═══ چرا «نیم‌اسپردِ عبورشده» و نه کلِ اسپرد ═══
//
// معاملهٔ فوری در جهتِ مخالف انجام می‌شود: خرید روی عرضه، فروش روی تقاضا.
// نسبت به **میانهٔ** دفتر، هر طرف نیمِ اسپرد می‌پردازد. شمردنِ کلِ اسپرد
// برای یک طرف، هزینه را دو برابر نشان می‌دهد؛ و صفر شمردنش، رول را رایگان.
//
// ═══ و چرا بی دفترِ دوطرفه عددی ساخته نمی‌شود ═══
//
// میانه بی هر دو سمتِ دفتر وجود ندارد. پایی که فقط تقاضا دارد، میانه‌اش
// معلوم نیست — نه اینکه صفر باشد. آن‌وقت `spreadKnown:false` می‌نشیند و
// جمع فقط کارمزد را می‌گوید، با پرچمِ صریح.

import { num } from './num.mjs';
import { signedQty } from './payoff.mjs';
import { closePrice } from './positions.mjs';

export const ROLL_COST_VERSION = 1;

export const ROLL_COST_REASONS = {
  noLeg: 'پای بسته‌شونده یا پای تازه مشخص نیست',
  noPrice: 'قیمت اجرای دست‌کم یکی از دو طرف در دسترس نیست',
  noSpread: 'دفتر دوطرفه ندارد، پس نیم‌اسپرد عبورشده ساخته نشد',
  noGain: 'رول تتای موقعیت را بهتر نمی‌کند، پس اصطکاکش با گذشت زمان جبران نمی‌شود',
  noTheta: 'تتای یکی از دو طرف درنیامده',
};

const midOf = (quote) => {
  const bid = num(quote?.bid), ask = num(quote?.ask);
  return bid > 0 && ask > 0 ? (bid + ask) / 2 : NaN;
};

const feeRateOf = (leg, fees, side) => {
  if (leg?.kind !== 'underlying') return num(fees?.option);
  return side === 'buy' ? num(fees?.buyStock) : num(fees?.sellStock);
};

/**
 * هزینهٔ اجرای یک رول — کارمزدِ دو معامله، به‌علاوهٔ نیم‌اسپردی که هر طرف
 * از آن عبور می‌کند.
 *
 * `qty` تعدادِ قرارداد است و در پایان ضرب می‌شود، تا `perContract` هم برای
 * مقایسهٔ نامزدها بماند: دو نامزد با تعدادِ یکسان از روی همان عدد قابل
 * مقایسه‌اند، و کاربر هم عددِ کلِ پولی را می‌خواهد.
 */
export function rollFriction({ leg, legQuote, newLeg, newQuote, fees = {}, qty = 1 } = {}) {
  if (!leg || !newLeg) {
    return { available: false, reason: ROLL_COST_REASONS.noLeg, total: NaN, totalPerContract: NaN, spreadKnown: false };
  }
  // بستن یعنی معاملهٔ مخالفِ ورود؛ باز کردنِ پای تازه در جهتِ خودِ پاست.
  const closeSide = leg.side === 'buy' ? 'sell' : 'buy';
  const closePx = closePrice(leg, legQuote, 'BOOK');
  const openPx = newLeg.side === 'buy' ? num(newQuote?.ask) : num(newQuote?.bid);
  const closeUnits = Math.abs(signedQty(leg));
  const openUnits = Math.abs(signedQty(newLeg));
  if (!(closePx > 0) || !(openPx > 0)) {
    return { available: false, reason: ROLL_COST_REASONS.noPrice, total: NaN, totalPerContract: NaN, spreadKnown: false };
  }

  const closeFee = closePx * closeUnits * feeRateOf(leg, fees, closeSide);
  const openFee = openPx * openUnits * feeRateOf(newLeg, fees, newLeg.side);

  const closeMid = midOf(legQuote);
  const openMid = midOf(newQuote);
  const spreadKnown = Number.isFinite(closeMid) && Number.isFinite(openMid);
  const closeSlip = spreadKnown ? Math.abs(closePx - closeMid) * closeUnits : NaN;
  const openSlip = spreadKnown ? Math.abs(openPx - openMid) * openUnits : NaN;

  const scale = Math.max(1, Math.trunc(num(qty, 1)));
  const perContract = closeFee + openFee + (spreadKnown ? closeSlip + openSlip : 0);
  return {
    version: ROLL_COST_VERSION,
    available: true,
    reason: spreadKnown ? '' : ROLL_COST_REASONS.noSpread,
    spreadKnown,
    closeFee: closeFee * scale, openFee: openFee * scale,
    closeSlip: closeSlip * scale, openSlip: openSlip * scale,
    feeTotal: (closeFee + openFee) * scale,
    slipTotal: spreadKnown ? (closeSlip + openSlip) * scale : NaN,
    total: perContract * scale,
    totalPerContract: perContract,
    qty: scale,
  };
}

/**
 * چند روز طول می‌کشد تا اصطکاکِ رول با تتای بهترشده جبران شود.
 *
 * ═══ فرضی که باید صریح گفته شود ═══
 *
 * این عدد فرض می‌کند قیمتِ پایه و تلاطم **تکان نخورند**. در بازار واقعی
 * نمی‌خورند نیست؛ پس این «پیش‌بینی» نیست، یک مقیاس است: «اصطکاکِ این رول،
 * به اندازهٔ چند روزِ زوالِ زمانیِ اضافه است». همین یک جمله فرقِ رولی که
 * اصطکاکش سه روز است با رولی که چهل روز است را روشن می‌کند.
 *
 * تتا «ریال در روز» است و برای موقعیتِ فروش مثبت. اگر رول تتا را بهتر
 * نکند، عددی ساخته نمی‌شود — «بی‌نهایت روز» عدد نیست.
 */
export function rollPayback(friction, { thetaBefore, thetaAfter } = {}) {
  if (!friction?.available) return { available: false, reason: friction?.reason || ROLL_COST_REASONS.noLeg, days: NaN };
  const before = num(thetaBefore, NaN);
  const after = num(thetaAfter, NaN);
  if (!Number.isFinite(before) || !Number.isFinite(after)) {
    return { available: false, reason: ROLL_COST_REASONS.noTheta, days: NaN };
  }
  const gain = after - before;
  if (!(gain > 0)) return { available: false, reason: ROLL_COST_REASONS.noGain, days: NaN, gainPerDay: gain };
  return { available: true, reason: '', days: friction.total / (gain * friction.qty), gainPerDay: gain };
}
