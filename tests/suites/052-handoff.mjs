// ۵۱. انتقال ترکیب زنده به بک‌تست
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { canHandoff, goHandoff, handoffPlan } from '../../ui/handoff.mjs';


// ═══════════════════════════ ۵۱. انتقال ترکیب زنده به بک‌تست ═══════════════════════════
group('۵۱. انتقال ترکیب زنده به بک‌تست');
{
  const row51 = {
    uaIns: '77', underlying: 'اهرم', strategyId: 'bull-call-spread', strategy: 'Bull Call Spread',
    legsText: '+۱ کال ۲۰۰۰۰  −۱ کال ۲۲۰۰۰',
    __legs: [
      { kind: 'call', side: 'buy', strike: 20000, ins: 'c1', name: 'ضهرم1' },
      { kind: 'call', side: 'sell', strike: 22000, ins: 'c2', name: 'ضهرم2' },
    ],
  };
  check('ردیف دارای نماد و شناسه پا، قابل انتقال است', canHandoff(row51));
  check('ردیف بدون نماد پایه قابل انتقال نیست', !canHandoff({ ...row51, uaIns: '' }));
  // بدون شناسه قرارداد، مقصد باید ترکیب را از روی قیمت اعمال حدس بزند و دو
  // قرارداد هم‌اعمال در دو سررسید یکی گرفته می‌شوند.
  check('ردیف بدون شناسه قرارداد قابل انتقال نیست',
    !canHandoff({ ...row51, __legs: [{ kind: 'call', side: 'buy', strike: 20000, ins: '' }] }));
  check('ردیف تهی، برنامه را نمی‌شکند', !canHandoff(null) && !canHandoff({}));

  const plan51 = handoffPlan(row51, { from: 'strategy', strategyId: 'bull-call-spread', units: 3 });
  check('نقشه، مقصد و مبدأ را می‌برد', plan51.to === 'backtest' && plan51.from === 'strategy');
  check('فقط پاهای اختیار منتقل می‌شوند', plan51.legIns.join(',') === 'c1,c2');
  // پای سهم در تب بک‌تست از خود ترکیب ساخته می‌شود، نه از فهرست قرارداد
  const withStock51 = handoffPlan({ ...row51,
    __legs: [...row51.__legs, { kind: 'underlying', side: 'buy', ins: 'u9' }] });
  check('پای دارایی پایه در فهرست قرارداد نمی‌آید', withStock51.legIns.join(',') === 'c1,c2');
  check('تعداد واحد دست‌کم یک است و صحیح',
    handoffPlan(row51, { units: 0 }).units === 1 && handoffPlan(row51, { units: 2.7 }).units === 2
    && handoffPlan(row51, {}).units === 1);
  // ردیف زنده تاریخ ندارد؛ حدس‌زدن یک بازهٔ ثابت، بازه‌ای می‌سازد که ممکن
  // است برای این قرارداد اصلاً وجود نداشته باشد.
  check('تاریخ‌ها خودکارند، نه حدسی', plan51.entryDate === 'auto' && plan51.exitDate === 'auto');
  check('مبنای قیمت پیش‌فرض آخرین معامله است',
    plan51.entryBasis === 'LAST' && plan51.exitBasis === 'LAST');
  // انتقال باید انتخاب ببرد نه نتیجه: اگر عددی کپی شود، دو تب می‌توانند دو
  // حرف بزنند و معلوم نیست کدام مال کدام محاسبه است.
  for (const k of ['maxProfit', 'maxLoss', 'retMaxPct', 'netCash', 'capital', 'popPct']) {
    check(`نتیجهٔ «${k}» در نقشه منتقل نمی‌شود`, !(k in plan51));
  }

  const btSrc51 = readSrc('../ui/tabs/backtest.mjs');
  check('مقصد، تاریخ خودکار را به بلندترین بازهٔ موجود ترجمه می‌کند',
    btSrc51.includes("plan.entryDate === 'auto' ? entryDates[0]")
    && btSrc51.includes("plan.exitDate === 'auto' ? exitDates.at(-1)"));
  for (const [file, what] of [['../ui/tabs/strategy.mjs', 'تب استراتژی'], ['../ui/tabs/top.mjs', 'برترین موقعیت‌ها']]) {
    const src = readSrc(file);
    check(`${what} دکمهٔ انتقال دارد و فقط برای ردیف قابل انتقال`,
      src.includes('canHandoff(r) ? handoffButtonHtml()') && src.includes('goHandoff(state, handoffPlan(r, {'));
  }
}
