// ۵۱. انتقال ترکیب زنده به بک‌تست
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import {
  STRATEGY_LINK_TARGETS, canHandoff, goHandoff, handoffPlan,
  strategyLinkPlan, strategyLinkTargets, watchConditionsFrom,
} from '../../ui/handoff.mjs';
import { normalizeCondition } from '../../core/watch-rule.mjs';
import { GAP_STRATEGY_IDS } from '../../core/spread-gap.mjs';


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
  // «برترین موقعیت‌ها» هنوز دکمهٔ تکی دارد. تب استراتژی از دکمهٔ تکی به
  // نوارِ پیوند رفت، پس همان ادعا آنجا با **رفتارِ** `strategyLinkTargets`
  // سنجیده می‌شود، نه با متنِ منبع — پایین‌تر، در بخشِ «نوار پیوند».
  const topSrc51 = readSrc('../ui/tabs/top.mjs');
  check('برترین موقعیت‌ها دکمهٔ انتقال دارد و فقط برای ردیف قابل انتقال',
    topSrc51.includes('canHandoff(r) ? handoffButtonHtml()') && topSrc51.includes('goHandoff(state, handoffPlan(r, {'));
  const stratSrc51 = readSrc('../ui/tabs/strategy.mjs');
  check('تب استراتژی نوار پیوند دارد و هر مقصد از همان مسیرِ صفحهٔ جدا می‌رود',
    stratSrc51.includes('strategyLinkTargets(r, { strategyId: def.id })') && stratSrc51.includes('goHandoff(state, plan, to)'));
}

// ═══════════════════════ نوار پیوند — بندهای ۴ و ۱۱ ═══════════════════════
//
// «یک گزینه وجود داشته باشه که استراتژی مشخص شده را لینک کنه به قسمت
// ازمایشگاه یا رصد زنده … لینک در صفحه مجزا باز بشه.»
//
// آنچه سنجیده می‌شود: هیچ دکمه‌ای به مقصدی که نمی‌پذیرد ساخته نمی‌شود، و
// آستانه‌های پیش‌پر از عددِ **همین ردیف** می‌آیند نه از صفر.
group('۵۱. نوار پیوند به بقیهٔ برنامه');
{
  const rowLink = {
    uaIns: '77', underlying: 'اهرم', legsText: '+۱ کال ۲۰۰۰۰  −۱ کال ۲۲۰۰۰',
    __legs: [
      { kind: 'call', side: 'buy', strike: 20000, ins: 'c1' },
      { kind: 'call', side: 'sell', strike: 22000, ins: 'c2' },
    ],
    retMonthPct: 12.5, retMaxPct: 30, rewardRisk: 2.5,
    maxProfit: 5e6, maxLoss: -2e6, maxLossPct: -40, days: 33, S: 9500,
  };
  // `bull-call-spread` در `GAP_STRATEGY_IDS` هست، پس هر دو مقصد را می‌گیرد.
  const targets = strategyLinkTargets(rowLink, { strategyId: 'bull-call-spread' }).map((item) => item.to);
  check('هر مقصدِ فهرست، تبی است که نقشه را می‌پذیرد',
    STRATEGY_LINK_TARGETS.every((item) => ['backtest', 'watchtower'].includes(item.to)));
  check('ردیف کامل، هر دو مقصد را می‌گیرد', targets.join(',') === 'backtest,watchtower');
  check('ردیف بی‌شناسهٔ قرارداد، مقصدِ بک‌تست نمی‌گیرد',
    !strategyLinkTargets({ ...rowLink, __legs: [{ kind: 'call', side: 'buy', ins: '' }] },
      { strategyId: 'bull-call-spread' }).some((x) => x.to === 'backtest'));
  check('ردیف بی نماد پایه هیچ مقصدی نمی‌گیرد',
    strategyLinkTargets({ ...rowLink, uaIns: '' }, { strategyId: 'bull-call-spread' }).length === 0);
  // دیده‌بان شرطی فهرست استراتژی‌هایش را از `GAP_STRATEGY_IDS` می‌سازد.
  // بی این شرط، دکمه ساخته می‌شد و تیکِ استراتژی روی هیچ چک‌باکسی
  // نمی‌نشست — قاعده‌ای با دامنهٔ خالی، که کاربر آن را «شرطم برقرار نشد»
  // می‌خواند.
  check('استراتژیِ بیرون از دامنهٔ دیده‌بان، دکمهٔ دیده‌بان نمی‌گیرد',
    !strategyLinkTargets(rowLink, { strategyId: 'covered-call' }).some((x) => x.to === 'watchtower')
    && strategyLinkTargets(rowLink, { strategyId: 'covered-call' }).some((x) => x.to === 'backtest'));
  check('و هر شناسه‌ای که دکمهٔ دیده‌بان می‌گیرد، واقعاً در فهرست آن تب هست',
    GAP_STRATEGY_IDS.every((id) => strategyLinkTargets(rowLink, { strategyId: id }).some((x) => x.to === 'watchtower')));
  // ردیفی که هیچ سنجهٔ مشترکی با دیده‌بان ندارد، قاعده‌ای هم نمی‌سازد؛
  // دکمه‌اش نباید ساخته شود.
  const bare = { uaIns: '77', __legs: [{ kind: 'call', side: 'buy', ins: 'c1' }] };
  check('ردیف بی هیچ عددِ سنجیدنی، مقصدِ دیده‌بان نمی‌گیرد',
    !strategyLinkTargets(bare, { strategyId: 'bull-call-spread' }).some((x) => x.to === 'watchtower'));

  const wt = strategyLinkPlan(rowLink, { to: 'watchtower', strategyId: 'bull-call-spread', strategyName: 'اسپرد' });
  check('نقشهٔ دیده‌بان، نماد و استراتژی را می‌برد',
    wt.to === 'watchtower' && wt.uaIns === '77' && wt.strategyId === 'bull-call-spread');
  const byMetric = Object.fromEntries(wt.conditions.map((one) => [one.metric, one]));
  // آستانه = عددِ همین لحظه. قاعده‌ای با آستانهٔ صفر همان لحظه شلیک می‌کند
  // و کاربر باید همه‌اش را دستی عوض کند.
  check('آستانهٔ هر شرط، عددِ همین ردیف است', byMetric.monthlyPct.value === 12.5 && byMetric.returnPct.value === 30);
  // زیان در موتور منفی است و در دیده‌بان اندازه؛ نگاشتِ حدسی شرطی می‌ساخت
  // که وارونه عمل می‌کرد.
  check('زیان با قدرمطلق و با عملگرِ سقف می‌رود، نه با عددِ منفی و کف',
    byMetric.maxLoss.value === 2e6 && byMetric.maxLoss.op === 'le'
    && byMetric.lossPct.value === 40 && byMetric.lossPct.op === 'le');
  check('سنجهٔ بی‌عدد شرط نمی‌سازد',
    !watchConditionsFrom({ ...rowLink, retMonthPct: NaN }).some((one) => one.metric === 'monthlyPct'));
  check('«نامحدود» هم شرط نمی‌سازد — با هیچ آستانه‌ای سنجیده نمی‌شود',
    !watchConditionsFrom({ ...rowLink, maxProfit: Infinity }).some((one) => one.metric === 'maxProfit'));
  check('هر شرطِ ساخته‌شده از نظر خودِ دیده‌بان معتبر است',
    wt.conditions.every((one) => normalizeCondition(one).ok));
  check('مقصدِ ناشناخته نقشه نمی‌سازد', strategyLinkPlan(rowLink, { to: 'chain' }) === null);
  check('نام قاعده از استراتژی و نماد و ترکیب ساخته می‌شود',
    wt.ruleName.includes('اسپرد') && wt.ruleName.includes('اهرم'));
}
