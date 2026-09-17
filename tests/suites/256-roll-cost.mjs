// ۲۵۶. اصطکاک اجرای رول و پیوند موقعیت به تب رول
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { ROLL_COST_VERSION, ROLL_COST_REASONS, rollFriction, rollPayback } from '../../core/roll-cost.mjs';
import { positionRollPlan } from '../../ui/handoff.mjs';

group('۲۵۶. اصطکاک اجرای رول');
{
  const size = 1000;
  const fees = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };

  // پای فعلی: فروش کال ۱۱۰٬۰۰۰. بستنش یعنی خرید روی **عرضه**.
  const leg = { kind: 'call', side: 'sell', ratio: 1, size, strike: 110000, price: 5000, ins: 'A' };
  const legQuote = { bid: 6800, ask: 7200 };            // میانه ۷٬۰۰۰
  // پای تازه: فروش کال ۱۲۰٬۰۰۰ — فروش روی **تقاضا**.
  const newLeg = { kind: 'call', side: 'sell', ratio: 1, size, strike: 120000, days: 60, ins: 'B' };
  const newQuote = { bid: 2900, ask: 3100 };            // میانه ۳٬۰۰۰

  check('نسخهٔ قرارداد اصطکاک اعلام شده', ROLL_COST_VERSION === 1);

  const f = rollFriction({ leg, legQuote, newLeg, newQuote, fees, qty: 2 });
  check('اصطکاک ساخته می‌شود', f.available === true, f.reason);
  check('دفتر دوطرفه، نیم‌اسپرد را قابل سنجش می‌کند', f.spreadKnown === true);
  // بستنِ فروش روی عرضه (۷٬۲۰۰) و بازکردنِ فروش روی تقاضا (۲٬۹۰۰).
  check('کارمزد بستن از قیمت عرضه می‌آید، نه از میانه',
    near(f.closeFee, 7200 * size * fees.option * 2), `${Math.round(f.closeFee)}`);
  check('کارمزد باز کردن از قیمت تقاضا می‌آید',
    near(f.openFee, 2900 * size * fees.option * 2), `${Math.round(f.openFee)}`);
  // نسبت به میانه، هر طرف نیمِ اسپرد می‌پردازد: ۲۰۰ و ۱۰۰.
  check('نیم‌اسپردِ عبورشدهٔ هر طرف شمرده می‌شود، نه کلِ اسپرد',
    near(f.closeSlip, 200 * size * 2) && near(f.openSlip, 100 * size * 2),
    `${Math.round(f.closeSlip)} / ${Math.round(f.openSlip)}`);
  check('جمع، کارمزد به‌علاوهٔ اسپرد است', near(f.total, f.feeTotal + f.slipTotal));
  check('تعداد قرارداد یک بار ضرب می‌شود',
    near(f.total, f.totalPerContract * 2) && f.qty === 2);

  // ——— بی دفترِ دوطرفه ———
  // سمتِ اجرا هست (فروش روی عرضه بازخرید می‌شود) ولی سمتِ دیگر خالی است،
  // پس میانه — و با آن نیم‌اسپرد — وجود ندارد.
  const oneSided = rollFriction({ leg, legQuote: { bid: 0, ask: 7200 }, newLeg, newQuote, fees, qty: 1 });
  check('پای یک‌طرفه، نیم‌اسپرد ندارد ولی کارمزدش هست',
    oneSided.available === true && oneSided.spreadKnown === false && Number.isNaN(oneSided.slipTotal));
  check('و جمعش فقط کارمزد است — نه صفر، نه حدس',
    near(oneSided.total, oneSided.feeTotal));
  check('علتِ نبودِ اسپرد گفته می‌شود', oneSided.reason === ROLL_COST_REASONS.noSpread);

  check('بی قیمت اجرا، اصطکاکی ساخته نمی‌شود',
    rollFriction({ leg, legQuote: { bid: 0, ask: 0 }, newLeg, newQuote: { bid: 0, ask: 0 }, fees }).reason
    === ROLL_COST_REASONS.noPrice);
  check('بی پا، اصطکاکی ساخته نمی‌شود',
    rollFriction({ leg: null, newLeg, fees }).reason === ROLL_COST_REASONS.noLeg);

  // ——— کارمزد سهم از نرخ سهم می‌آید، نه نرخ اختیار ———
  const stock = { kind: 'underlying', side: 'buy', ratio: 1, size, price: 100000, ins: 'UA' };
  const stockF = rollFriction({
    leg: stock, legQuote: { bid: 104000, ask: 104000 }, newLeg: stock,
    newQuote: { bid: 104000, ask: 104000 }, fees, qty: 1,
  });
  check('بستنِ سهمِ خریداری‌شده با نرخ فروش سهم کارمزد می‌خورد',
    near(stockF.closeFee, 104000 * size * fees.sellStock), `${Math.round(stockF.closeFee)}`);

  // ——— جبران با تتا ———
  const back = rollPayback(f, { thetaBefore: 1000, thetaAfter: 1500 });
  check('جبران با تتا از بهبودِ تتا می‌آید', back.available === true, back.reason);
  check('روزِ جبران = اصطکاک ÷ (بهبود تتا × تعداد)',
    near(back.days, f.total / (500 * 2)), `${back.days.toFixed(2)}`);
  // «بی‌نهایت روز» عدد نیست.
  check('رولی که تتا را بهتر نمی‌کند، روزِ جبران ندارد',
    rollPayback(f, { thetaBefore: 1500, thetaAfter: 1000 }).reason === ROLL_COST_REASONS.noGain);
  check('تتای برابر هم جبران نمی‌سازد',
    rollPayback(f, { thetaBefore: 1000, thetaAfter: 1000 }).available === false);
  check('تتای نامعلوم علت خودش را می‌گوید',
    rollPayback(f, { thetaBefore: NaN, thetaAfter: 1000 }).reason === ROLL_COST_REASONS.noTheta);
  check('بی اصطکاک، جبرانی هم نیست',
    rollPayback({ available: false, reason: 'x' }, { thetaBefore: 1, thetaAfter: 2 }).available === false);

  // ——— پیوند موقعیت به تب رول ———
  const pos = {
    id: 'p7', title: 'کاوردکال', uaIns: '77', uaName: 'اهرم',
    legs: [{ kind: 'underlying', side: 'buy', ratio: 1, size, price: 1 },
      { kind: 'call', side: 'sell', ratio: 1, size, strike: 110000, price: 5000, ins: 'A' }],
  };
  const plan = positionRollPlan(pos);
  check('نقشهٔ رول فقط شناسه می‌برد، نه کپیِ رکورد',
    plan.positionId === 'p7' && plan.legs === undefined);
  check('و مقصدش تب رول است', plan.to === 'roll' && plan.from === 'positions');
  check('عنوان همراه می‌رود — فقط برای پیامِ «پیدا نشد»', plan.title === 'کاوردکال');
  check('موقعیت بی‌شناسه نقشه نمی‌گیرد', positionRollPlan({ ...pos, id: '' }) === null);
  // رولِ سهمِ تنها معنایی ندارد: پایی برای بستن و جایگزینی نیست.
  check('موقعیتِ فقط سهم، نقشهٔ رول نمی‌گیرد',
    positionRollPlan({ ...pos, legs: [pos.legs[0]] }) === null);

  // ——— قرارداد دو تب ———
  const rollSrc = readSrc('../ui/tabs/roll.mjs');
  check('تب رول نقشهٔ خودش را از state برمی‌دارد', rollSrc.includes("state.handoff?.to === 'roll'"));
  check('تب رول فقط موقعیت باز را در کشویی می‌گذارد',
    rollSrc.includes("positionStatus(p, today).id === 'open'"));
  check('موقعیتِ پیدانشده بی‌صدا رد نمی‌شود', rollSrc.includes('در فهرست موقعیت‌های باز نیست'));
  check('اصطکاک هر نامزد در جدول مقایسه ساخته می‌شود', rollSrc.includes('const f2 = rollFriction('));
  check('گزینهٔ همهٔ سررسیدها هست و دو کشویی را خاموش می‌کند',
    rollSrc.includes("id=\"all-exp\"") && rollSrc.includes("el('#exp').disabled = every"));
  check('تب موقعیت‌ها دکمهٔ رول دارد',
    readSrc('../ui/tabs/positions.mjs').includes("goHandoff(state, plan, 'roll')"));
}
