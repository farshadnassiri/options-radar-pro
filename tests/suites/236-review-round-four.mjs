// ۲۳۶. چهار ایرادِ بازپخشِ صاحب پروژه روی `652e819`
//
// ═══ گزارش ═══
//
//   ۱  «فاصله تا سربه‌سری بعضی ردیف‌ها — می‌ماند.»
//   ۲  «گزارش فیلتر تعداد ردیف‌های افتاده به‌خاطر نداشتن داده را نمی‌گوید.»
//   ۳  «ردیف‌های تقریبی، سطح اول سن مظنه را ۰ نشان می‌دهند، نه —.»
//   ۴  «برای Box Spread نمودار و فاصلهٔ پاها ساخته نمی‌شود.»
//
// ═══ آنچه در هر چهار مشترک بود ═══
//
// هیچ‌کدام غلطِ محاسباتی نبودند. هر چهار، **سکوت** بودند: عددی که وجود
// ندارد، یا عددی که هنوز پرسیده نشده، یا وضعیتی که بن‌بست است — و هیچ‌کدام
// خودشان را روی صفحه اعلام نمی‌کردند. این دسته همان سکوت‌ها را قفل می‌کند.

import { check, group, readSrc } from '../harness.mjs';
import { breakevenStatus, breakevenMetrics } from '../../core/evaluate.mjs';
import { rowQuality } from '../../core/exec.mjs';
import { buildChain } from '../../core/chain.mjs';
import { analyzePayoff, entryFees, grossCash } from '../../core/payoff.mjs';
import { legActivity, sessionTrail, trailNote } from '../../core/session-trail.mjs';
import { radarProfile as radarProfile236 } from '../../core/strategy-radar.mjs';
import { CATALOG as CATALOG236, byId as byId236 } from '../../strategies/catalog.mjs';

const profiles236 = CATALOG236.map((def) => [def, radarProfile236(def)]);

group('۲۳۶ ایراد ۱ — سربه‌سریِ نداشته، علت دارد');

// ═══ چرا این یک باگِ محاسباتی نبود ═══
//
// کاورد کالِ عمیقاً در سود با پرمیوم ناچیز، در هیچ قیمتی سود نمی‌دهد.
// منحنی صفر را قطع نمی‌کند، پس سربه‌سری واقعاً وجود ندارد و `—` درست
// است. آنچه غلط بود، سکوت: ردیفی که ذاتاً زیان‌ده است باید داد بزند.
const fees = { buyStock: 0.00464, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };
const covered = (S, K, premium) => {
  const legs = [
    { kind: 'underlying', side: 'buy', ratio: 1, size: 1000, price: S },
    { kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: K, price: premium },
  ];
  return analyzePayoff(legs, grossCash(legs) - entryFees(legs, fees), { fees });
};

const deep = covered(1000, 700, 10);
check('کاورد کالِ عمیقاً در سود با پرمیوم ناچیز، سربه‌سری ندارد',
  deep.breakevens.length === 0 && deep.maxProfit < 0);
check('و این «نداشتنِ داده» نیست — سود و زیانش هر دو عدد دارند',
  Number.isFinite(deep.maxProfit) && Number.isFinite(deep.maxLoss));
check('پس ستون فاصله تا سربه‌سری هم عدد ندارد، و درست هم همین است',
  !Number.isFinite(breakevenMetrics(deep.breakevens, 1000).beRoomPct));

// ═══ سه معنیِ متفاوتِ «سربه‌سری ندارد» ═══
check('«همیشه زیان» شناخته و نام‌گذاری می‌شود',
  breakevenStatus(deep).id === 'alwaysLoss'
  && breakevenStatus(deep).label.includes('در هیچ قیمتی سود نمی‌دهد'));
check('«همیشه سود» جدا شناخته می‌شود — دو خبر کاملاً متفاوت',
  breakevenStatus({ breakevens: [], maxProfit: 5e6, maxLoss: -10 }).id === 'alwaysProfit');
check('و وقتی خودِ سود و زیان عدد ندارد، هیچ ادعایی نمی‌شود',
  breakevenStatus({ breakevens: [], maxProfit: NaN, maxLoss: NaN }).id === 'unknown');
check('ردیفِ دارای سربه‌سری، شمارشش را می‌گوید',
  breakevenStatus(covered(1000, 1050, 50)).id === 'has'
  && breakevenStatus(covered(1000, 1050, 50)).count === 1);
check('«همیشه زیان» تنها حالتی است که پرچمِ هشدار می‌گیرد',
  breakevenStatus(deep).alwaysLoss === true
  && breakevenStatus({ breakevens: [], maxProfit: 5e6, maxLoss: -10 }).alwaysLoss === false
  && breakevenStatus(covered(1000, 1050, 50)).alwaysLoss === false);
// سربه‌سریِ صفر یا منفی قیمت نیست و نباید شمرده شود.
check('سربه‌سریِ ناممکن (صفر یا منفی) شمرده نمی‌شود',
  breakevenStatus({ breakevens: [0, -5], maxProfit: -1, maxLoss: 5 }).id === 'alwaysLoss');
check('ستون «وضعیت سربه‌سری» و هشدارش در موتور هستند',
  readSrc('../core/evaluate.mjs').includes("key: 'beStatus'")
  && readSrc('../core/evaluate.mjs').includes("warn.push('در هیچ قیمتی سود نمی‌دهد')"));

// ═══ و ستون، همان‌جا که سؤال ساخته می‌شود ═══
//
// قاعده است نه فهرست: هر نمایه‌ای که ستونِ سربه‌سری دارد، این را هم
// بلافاصله بعدش می‌گیرد؛ و نمایه‌ای که ندارد (تقویمی، آربیتراژ) نباید
// ستونِ بی‌ربط بگیرد.
const withBe = profiles236.filter(([, p]) => p.columns.some((k) => /^be/.test(k) && k !== 'beStatus'));
check('هر نمایهٔ دارای سربه‌سری، ستونِ وضعیتش را هم دارد',
  withBe.length >= 20 && withBe.every(([, p]) => p.columns.includes('beStatus')));
check('و بلافاصله بعد از آخرین ستونِ سربه‌سری می‌نشیند، نه ته جدول',
  withBe.every(([, p]) => {
    const at = p.columns.indexOf('beStatus');
    return /^be/.test(p.columns[at - 1]);
  }));
check('نمایه‌ای که اصلاً ستونِ سربه‌سری ندارد، این را هم نمی‌گیرد',
  !radarProfile236(byId236('calendar-call')).columns.includes('beStatus')
  && !radarProfile236(byId236('box')).columns.includes('beStatus'));

group('۲۳۶ ایراد ۳ — «نپرسیده‌ایم» با «تازه است» یکی نیست');

// ═══ ریشه ═══
//
// `buildChain` برای هر مظنه `staleSec: 0` و `state: 'A'` می‌گذاشت — دو
// جای‌نگه‌دار که مرحلهٔ دو رویشان می‌نوشت. ولی صفر یعنی «همین الان» و
// `A` یعنی «مجاز»: دو ادعای کامل دربارهٔ چیزی که مرحلهٔ یک اصلاً
// نپرسیده. ردیفِ «تقریبی، سطح اول» سنِ مظنه‌اش صفر درمی‌آمد.
const watchRow = {
  uaInsCode: 'UA1', lval30_UA: 'خودرو', insCode_C: 'C1', insCode_P: 'P1',
  lVal18AFC_C: 'ضخود۱', lVal18AFC_P: 'طخود۱',
  strikePrice: 9000, contractSize: 1000, endDate: 14051215, remainedDay: 30,
  pDrCotVal_C: 800, pClosing_C: 800, pDrCotVal_UA: 9500, pClosing_UA: 9500,
};
const chain236 = buildChain([watchRow]);
const quote236 = chain236.get('UA1').expiryList[0].strikeList[0].call;
check('مظنهٔ مرحلهٔ یک، سنِ مظنه ندارد — صفر نیست', !Number.isFinite(quote236.staleSec));
check('و وضعیتش «مجاز» ادعا نمی‌شود', quote236.state === '');
check('پایهٔ همان زنجیره هم همین‌طور',
  !Number.isFinite(chain236.get('UA1').staleSec) && chain236.get('UA1').state === '');

const stage1 = rowQuality([{ exec: { quality: 'level1', short: 0 }, quote: quote236 }], { staleSec: 900 });
check('پس ردیفِ «تقریبی، سطح اول» سنِ مظنه‌اش «—» است نه «۰»',
  !Number.isFinite(stage1.staleSecMax));
check('و وضعیتش نه «مجاز» است نه «متوقف»',
  stage1.stateLabel === '' && stage1.tradable === null);
// مرحلهٔ دو که عدد واقعی می‌آورد، باید همان عدد را نشان بدهد — از جمله
// صفرِ **واقعی**، که با صفرِ جای‌نگه‌دار فرق دارد.
const stage2 = rowQuality([{ exec: { quality: 'depth', short: 0 }, quote: { ...quote236, staleSec: 0, state: 'A' } }], { staleSec: 900 });
check('ولی صفرِ واقعیِ مرحلهٔ دو همچنان صفر نوشته می‌شود',
  stage2.staleSecMax === 0 && stage2.tradable === true && stage2.stateLabel === 'مجاز');

group('۲۳۶ ایراد ۴ — کدام پا ساکت است');

// ═══ ریشه ═══
//
// باکس چهار پا دارد. اگر یکی امروز معامله نشده باشد، هیچ لحظه‌ای عددِ
// کامل ندارد — درست، ولی بن‌بست. آنچه کم بود جوابِ «کدام پا؟».
const t236 = (time, price) => ({ time, price, quantity: 5 });
const boxLegs = [
  { ins: 'C1', kind: 'call', side: 'buy', ratio: 1, size: 1000, strike: 1000, name: 'ضخود۱' },
  { ins: 'C2', kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 1200, name: 'ضخود۲' },
  { ins: 'P1', kind: 'put', side: 'sell', ratio: 1, size: 1000, strike: 1000, name: 'طخود۱' },
  { ins: 'P2', kind: 'put', side: 'buy', ratio: 1, size: 1000, strike: 1200, name: 'طخود۲' },
];
const boxTape = { C1: [t236(100000, 800), t236(110000, 810)], C2: [t236(101500, 300)], P1: [t236(103000, 120)] };
const boxTrail = sessionTrail({ legs: boxLegs, tapeByIns: boxTape, grain: 'm30' });

check('هیچ لحظه‌ای عددِ کامل ندارد — این همان چیزی است که دیده شد', boxTrail.complete === 0);
check('ولی حالا کارنامهٔ هر چهار پا برمی‌گردد', boxTrail.legReport.length === 4);
check('و می‌گوید کدام پا ساکت است',
  boxTrail.legReport.filter((leg) => leg.silent).map((leg) => leg.name).join(',') === 'طخود۲');
check('و برای پای فعال، تعداد معامله و اولین و آخرین ساعت',
  boxTrail.legReport[0].trades === 2
  && boxTrail.legReport[0].first === 10 * 3600
  && boxTrail.legReport[0].last === 11 * 3600);
check('پای ساکت ساعتی ندارد — صفر نمی‌شود',
  !Number.isFinite(boxTrail.legReport[3].first) && boxTrail.legReport[3].trades === 0);

const note236 = trailNote(boxTrail);
check('جمله نامِ پای ساکت را می‌گوید، نه فقط شمارشش', note236.includes('طخود۲'));
check('و صریح می‌گوید این محدودیتِ بازار است نه خطای برنامه',
  note236.includes('محدودیتِ بازار است، نه خطای برنامه'));

// معاملهٔ باطل و پیش از بازگشایی، «فعال» حساب نمی‌شوند — وگرنه پایی که
// فقط یک معاملهٔ باطل دارد «فعال» خوانده می‌شد و علت گم می‌ماند.
const dirty236 = legActivity([boxLegs[0]], {
  C1: [t236(85500, 1), { ...t236(110000, 999), canceled: true }],
}, {});
check('معاملهٔ باطل و پیش از بازگشایی، پا را فعال نمی‌کنند',
  dirty236[0].trades === 0 && dirty236[0].silent === true);

// ═══ حالتِ دوم: همهٔ پاها فعال، ولی هیچ نقطه‌ای کامل نیست ═══
//
// دانهٔ شصت‌دقیقه‌ای، ساعت ۱۰:۳۰. تنها لحظهٔ شبکه ۱۰:۰۰ است و هر دو پا
// ۱۰:۲۰ معامله کرده‌اند — یعنی فعال‌اند، ولی هنوز لحظه‌ای نرسیده که
// هر دو در آن قیمت داشته باشند. جملهٔ لازم اینجا فرق دارد، چون کارِ
// کاربر هم فرق دارد: دانهٔ ریزتر، نه صبر.
const lateAll = sessionTrail({
  legs: boxLegs.slice(0, 2),
  tapeByIns: { C1: [t236(102000, 800)], C2: [t236(102000, 300)] },
  grain: 'm60', until: 10 * 3600 + 30 * 60,
});
check('همهٔ پاها فعال‌اند، ولی هیچ نقطه‌ای کامل نیست',
  lateAll.complete === 0 && lateAll.legReport.every((leg) => !leg.silent));
check('و جملهٔ این حالت، به دانهٔ ریزتر راهنمایی می‌کند نه به پای ساکت',
  trailNote(lateAll).includes('دانهٔ ریزتری') && !trailNote(lateAll).includes('معامله‌ای نداشته'));

group('۲۳۶ ایراد ۲ — عددِ صفر هم باید نوشته شود');

// گزارشِ فیلتر تا امروز بندِ «نداشتنِ داده» را فقط وقتی می‌نوشت که عددش
// صفر نبود. پس «هیچ ردیفی به‌خاطر نبودِ داده نیفتاد» و «اصلاً شمرده
// نشده» یک ظاهر داشتند.
const stratSrc236 = readSrc('../ui/tabs/strategy.mjs');
check('گزارش فیلتر، هر دو عدد را بی‌قید و شرط می‌نویسد',
  stratSrc236.includes('ردیف چون شرط را رد کردند و')
  && stratSrc236.includes('ردیف چون این عدد را اصلاً ندارند'));
check('و حالتِ «هیچ ردیفی نیفتاد» جملهٔ خودش را دارد',
  stratSrc236.includes("'هیچ ردیفی نیفتاد'"));
check('کارنامهٔ پا در پنل ردِ جلسه رسم می‌شود، نه فقط در جمله',
  stratSrc236.includes('کارنامهٔ هر پا در جلسهٔ امروز') && stratSrc236.includes('امروز معامله نشده'));
