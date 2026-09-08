// ۲۴۲. گزارش ۱۴۰۵/۰۶/۱۷ — سه ایراد روی رصد تاریخی و انتقالش
//
// ═══ آنچه این دور مشترک بود ═══
//
// هر سه از یک جا آمدند: **فرضی که وقتی نوشته شد درست بود، و بعد قاعده عوض
// شد.** نقشهٔ انتقال از روزی مانده بود که تبِ استراتژی فقط ردیفِ زنده
// داشت؛ انتخابِ دستیِ پاها از روزی که هیچ‌کس دو پای هم‌نوع را کنار هم
// نگذاشته بود؛ و اندازهٔ قرارداد از مسیری که فقط پای سهم را می‌دید.
//
// هیچ‌کدام «کدِ غلط» نبودند. همه، کدِ درستِ دیروز بودند.

import { check, group, readSrc } from '../harness.mjs';
import { handoffPlan, strategyLinkPlan, historyStamp } from '../../ui/handoff.mjs';
import { defaultLegIns, manualLegProblem } from '../../ui/history-legs.mjs';
import { legContractSize } from '../../core/chain.mjs';
import { grossCash, positionGreeks, signedQty } from '../../core/payoff.mjs';
import { byId } from '../../strategies/catalog.mjs';

const liveRow = {
  uaIns: '1', underlying: 'وبملت', strategyId: 'bull-call-spread',
  strategy: 'Bull Call Spread', legsText: '+ضملت6026 −ضملت6027',
  legIns: ['A', 'B'], legPrices: [{ ins: 'A' }, { ins: 'B' }],
};
const pastRow = { ...liveRow, historyDate: 20260906, historyBasis: 'CLOSE' };

group('۲۴۲ ایراد ۱ — ردیفِ تاریخی، روزش را با خودش می‌برد');

// «مبدأ ۱۴۰۵/۰۶/۱۵ بود ولی مقصد ۱۴۰۵/۰۶/۱۶ را انتخاب کرد. فقط یک نقطه
//  باقی ماند و نمودارها ساخته نشدند.»
check('ردیفِ زنده مهرِ تاریخی ندارد', historyStamp(liveRow) === null);
check('و ردیفِ تاریخی دارد',
  historyStamp(pastRow).date === 20260906 && historyStamp(pastRow).basis === 'CLOSE');
check('مبنای ناشناخته پذیرفته نمی‌شود — مقصد نباید کلیدِ بی‌معنا بگیرد',
  historyStamp({ ...pastRow, historyBasis: 'BOOK' }).basis === ''
  && historyStamp({ ...pastRow, historyBasis: '' }).basis === '');
check('تاریخِ صفر یا بی‌معنا، ردیف را تاریخی نمی‌کند',
  historyStamp({ ...liveRow, historyDate: 0 }) === null
  && historyStamp({ ...liveRow, historyDate: 'x' }) === null
  && historyStamp(null) === null);

const labPast = handoffPlan(pastRow, { from: 'strategy', units: 2 });
check('نقشهٔ آزمایشگاه روزِ مبدأ را می‌برد، نه «auto»', labPast.entryDate === 20260906);
check('روزِ خروج همچنان انتخابِ مقصد است — ردیفِ مبدأ یک روز است',
  labPast.exitDate === 'auto');
check('و با همان مبنایی که عددهای مبدأ از آن ساخته شدند',
  labPast.entryBasis === 'CLOSE' && labPast.exitBasis === 'CLOSE');
check('«زنده» و «تاریخی» با هم جمع نمی‌شوند', labPast.live === false);
check('حتی وقتی فراخواننده اشتباهاً `live` بفرستد',
  handoffPlan(pastRow, { live: true }).live === false);

const labLive = handoffPlan(liveRow, { from: 'strategy', entryBasis: 'LAST', exitBasis: 'LAST' });
check('ردیفِ زنده دست‌نخورده ماند — «auto» و مبنای فراخواننده',
  labLive.entryDate === 'auto' && labLive.exitDate === 'auto'
  && labLive.entryBasis === 'LAST' && labLive.live === false);
check('و `live` فراخواننده برای ردیف زنده محترم است',
  handoffPlan(liveRow, { live: true }).live === true);

const gwPast = strategyLinkPlan(pastRow, { to: 'greeks-watch', strategyId: 'bull-call-spread' });
const gwLive = strategyLinkPlan(liveRow, { to: 'greeks-watch', strategyId: 'bull-call-spread' });
check('رصد یونانی برای ردیفِ تاریخی «زنده» نمی‌شود', gwPast.live === false);
check('و روزِ مبدأ را می‌گیرد', gwPast.entryDate === 20260906 && gwPast.entryBasis === 'CLOSE');
check('ولی ردیفِ زنده همچنان `live: true` است و تاریخ نمی‌فرستد',
  gwLive.live === true && gwLive.entryDate === undefined);
check('مقصدهای دیگر هم روزِ تاریخی را می‌گیرند',
  strategyLinkPlan(pastRow, { to: 'spread-radar' }).entryDate === 20260906);
check('و برای ردیف زنده چیزی اضافه نمی‌شود',
  strategyLinkPlan(liveRow, { to: 'spread-radar' }).entryDate === undefined);
// دیده‌بان شرطی نقشهٔ خودش را دارد؛ افزودنِ تاریخ نباید بقیه‌اش را بشکند.
const wt = strategyLinkPlan(pastRow, { to: 'watchtower' });
check('دیده‌بان شرطی هم سالم ماند', !!wt.ruleName && Array.isArray(wt.conditions));

group('۲۴۲ ایراد ۲ — اندازهٔ صفرِ آرشیو، همه‌چیز را صفر می‌کرد');

// «سرمایه ۰، جریان نقدی ۰ … و دلتا/گاما/وگا/تتا/رو موقعیت همگی ۰، با اینکه
//  قیمت و یونانی هر پا معتبر و غیرصفر است.»
check('اندازهٔ صفر از پیش‌فرض پر می‌شود و نشان‌دار می‌ماند',
  legContractSize(0, 1000).size === 1000 && legContractSize(0, 1000).assumed === true);
check('و اندازهٔ واقعی دست‌نخورده و بی‌نشان می‌ماند',
  legContractSize(1000, 500).size === 1000 && legContractSize(1000, 500).assumed === false);

// ═══ چرا صفر همه‌چیز را می‌بلعد ═══
const zero = [
  { kind: 'call', side: 'buy', ratio: 1, size: 0, price: 9, strike: 1750 },
  { kind: 'call', side: 'sell', ratio: 1, size: 0, price: 4, strike: 1850 },
];
const fixed = zero.map((l) => ({ ...l, size: legContractSize(l.size, 1000).size }));
const greeks = [{ delta: 0.0222, gamma: 0, vega: 0.0706, theta: 0, rho: 0 },
  { delta: 0.0182, gamma: 0, vega: 0.0596, theta: 0, rho: 0 }];
check('با اندازهٔ صفر، مقدارِ امضاشدهٔ هر پا صفر است',
  signedQty(zero[0]) === 0 && signedQty(zero[1]) === 0);
check('پس جریان نقد صفر می‌شود، هرچند قیمتِ هر پا معتبر است',
  grossCash(zero) === 0 && zero.every((l) => l.price > 0));
check('و جمعِ یونانی‌ها هم صفر، هرچند یونانیِ هر پا غیرصفر است',
  positionGreeks(zero, greeks).delta === 0 && greeks.every((g) => g.delta !== 0));
check('با اندازهٔ اصلاح‌شده، جریان نقد غیرصفر می‌شود',
  grossCash(fixed) !== 0 && Math.abs(grossCash(fixed)) === Math.abs(grossCash(zero) + 5000));
// همان عددی که گزارش از آزمایشگاه دید: اختلافِ دلتای دو پا ضربدر ۱۰۰۰.
check('و دلتای موقعیت همان اختلافِ دلتاها ضربدر اندازه است',
  Math.abs(positionGreeks(fixed, greeks).delta - (0.0222 - 0.0182) * 1000) < 1e-9);

const histSrc = readSrc('../ui/tabs/history.mjs');
check('پای اختیارِ انتخابِ دستی هم از همان قاعده رد می‌شود',
  histSrc.includes('legContractSize(found.size, state.settings.contractSize)'));
check('و فرضی‌بودنِ اندازه حمل می‌شود',
  histSrc.includes('size: sz.size, sizeAssumed: sz.assumed,'));
check('رابط دیگر اندازهٔ صفر را «۱» نشان نمی‌دهد',
  !histSrc.includes('fmt.int(leg.size || 1)') && histSrc.includes('fmt.int(leg.size)'));

group('۲۴۲ ایراد ۳ — دو پای اسپرد، یک قرارداد نمی‌گیرند');

const list = [
  { ins: 'A', strike: 1750, kind: 'call' },
  { ins: 'B', strike: 1850, kind: 'call' },
  { ins: 'C', strike: 1950, kind: 'call' },
];
const priced = (ins) => ins !== 'A';           // «A» در این بازه قیمت ندارد
const spread = byId('bull-call-spread').legs.filter((t) => t.kind !== 'underlying');
check('استراتژی دو پای اختیار با دو slot دارد',
  spread.length === 2 && spread[0].slot !== spread[1].slot);
check('هر پا `slot`اُمین قیمتِ اعمال را می‌گیرد، پس دو تا فرق دارند',
  defaultLegIns(list, spread[0], () => true) === 'A'
  && defaultLegIns(list, spread[1], () => true) === 'B');
check('و قراردادِ بی‌قیمت پیش‌فرض نمی‌شود',
  defaultLegIns(list, spread[0], priced) === 'B'
  && defaultLegIns(list, spread[1], priced) === 'C');
check('اگر هیچ‌کدام قیمت نداشته باشند، ساختار مبنا می‌ماند — نه خالی',
  defaultLegIns(list, spread[0], () => false) === 'A');
check('قیمتِ اعمالِ تکراری، دو گزینه نمی‌سازد',
  defaultLegIns([{ ins: 'X', strike: 1750 }, { ins: 'Y', strike: 1750 }], spread[1], () => true) === 'X');
check('فهرست خالی نمی‌ترکاند', defaultLegIns([], spread[0], () => true) === '');
check('slotِ بزرگ‌تر از فهرست، از آخر می‌گیرد نه undefined',
  defaultLegIns(list, { slot: 9 }, () => true) === 'C');

const defLegs = byId('bull-call-spread').legs;
check('دو پای هم‌قرارداد، معتبر نیست و علتش گفته می‌شود',
  manualLegProblem(defLegs, [{ ins: 'A', slot: 1, exp: 0 }, { ins: 'A', slot: 2, exp: 0 }])
    .includes('دو قرارداد متفاوت'));
check('دو قراردادِ متفاوت، مشکلی ندارد',
  manualLegProblem(defLegs, [{ ins: 'A', slot: 1, exp: 0 }, { ins: 'B', slot: 2, exp: 0 }]) === '');
check('پای انتخاب‌نشده هم علتِ خودش را دارد',
  manualLegProblem(defLegs, [{ ins: 'A', slot: 1, exp: 0 }]).includes('برای هر پا'));
// استرادل دو پای هم‌قیمت‌اعمال دارد ولی دو نوعِ متفاوت — نباید بلوکه شود.
check('استرادل که دو پایش یک slot دارد، اشتباهاً بلوکه نمی‌شود',
  manualLegProblem(byId('long-straddle').legs,
    [{ ins: 'A', slot: 1, exp: 0 }, { ins: 'B', slot: 1, exp: 0 }]) === '');
check('و دکمهٔ اجرا پیش از محاسبه قفل می‌شود، نه بعدش',
  histSrc.includes('if (problem) throw new Error(problem);')
  && histSrc.includes("runBtn.disabled = !!problem;"));
