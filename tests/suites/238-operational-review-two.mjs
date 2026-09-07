// ۲۳۸. گزارش آزمون عملیاتی دوم روی `bd0a618` — پنج مورد، بازارِ باز
//
// ═══ آنچه در این دور مشترک بود ═══
//
// دورِ اول «سکوت» بود: خانهٔ خالیِ بی‌توضیح. دورِ دوم «حرفِ غلط با ظاهرِ
// معتبر» بود. این دور چیز تازه‌ای نشان داد: **هشدارِ بی‌اثر**.
//
// هر پنج مورد جایی بودند که برنامه ایراد را می‌دانست و می‌گفت، ولی از
// دانستنش هیچ استفاده‌ای نمی‌کرد:
//
//   · تقویمی «زیان نامحدود» می‌گرفت، چون شیبِ کارمزد با شیبِ ساختار
//     اشتباه گرفته می‌شد — و همان ردیف در کادرِ قیمت دستی عددِ سومی داشت.
//   · ردیفِ «بازده ماهانه ۲٬۰۲۶٬۳۹۶٪» هشدارِ کامل داشت و **رتبهٔ اول** بود.
//   · اسکنِ صفرنتیجه درست توضیح می‌داد و هیچ‌وقت نمی‌گفت تمام شد.
//   · دفتر خطا ۱۵۷ بار ۵۰۲ ثبت کرد و هیچ‌بار نگفت کدام سرویس.
//   · پنلِ انتخاب استراتژی بعد از انتخاب، جلوی همان تب می‌ایستاد.
//
// درس: هشداری که روی تصمیم اثر ندارد، برچسب است نه هشدار.

import { check, group, near, readSrc } from '../harness.mjs';
import { analyzeMixed, isSingleExpiry } from '../../core/mixed.mjs';
import { analyzePayoff, grossCash, entryFees } from '../../core/payoff.mjs';
import { manualCompare } from '../../core/manual-price.mjs';
import { rowTrust, bestTrusted, trustFirst, DEMOTING_FLAGS, suspectNote } from '../../core/row-trust.mjs';
import { upstreamFamily, makeUpstreamTally } from '../../core/upstream-tally.mjs';
import { COLUMNS } from '../../core/evaluate.mjs';
import { radarProfile, RADAR_FILTERS } from '../../core/strategy-radar.mjs';
import { CATALOG, byId } from '../../strategies/catalog.mjs';
import { buildChain } from '../../core/chain.mjs';
import { scan } from '../../core/scan.mjs';
import { defaults } from '../../core/settings.mjs';

const FEES = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };
const FREE = { buyStock: 0, sellStock: 0, option: 0, exercise: 0 };
const MARKET = { rFree: 0.3, divYield: 0, spot: 13000, sigma: 0.6, yearDays: 365 };
const leg = (kind, side, strike, days, price, ratio = 1) =>
  ({ kind, side, strike, days, price, size: 1000, ratio, sigma: 0.6 });
const net = (legs, fees) => grossCash(legs) - entryFees(legs, fees);
const mixed = (legs, fees = FEES) => analyzeMixed(legs, net(legs, fees), { ...MARKET, fees });

// تقویمیِ خرید: فروش کالِ نزدیک، خرید کالِ دور، همان قیمت اعمال — دقیقاً
// شکلی که گزارش دید.
const CALENDAR = [leg('call', 'sell', 13540, 20, 900), leg('call', 'buy', 13540, 80, 1600)];

group('۲۳۸ ایراد ۱ — تقویمی: «زیان نامحدود» از کارمزد نمی‌آید');

// ═══ ریشه ═══
//
// در قیمت‌های بسیار بالا پای نزدیک اعمال می‌شود و باید سهم خرید کرد؛
// کارمزدِ آن خرید متناسب با قیمت است، پس شیبِ عددیِ تابع منفیِ کوچک
// می‌ماند (‎−۴٫۷ برای اندازهٔ ۱۰۰۰). آستانهٔ «صاف» ۱e−۶ بود، پس این شیبِ
// کارمزدی «زیان نامحدود» خوانده می‌شد — برای **هر** ردیف تقویمی.
const cal = mixed(CALENDAR);
check('تقویمیِ خرید دیگر «زیان نامحدود» نیست', cal.unlimitedLoss === false);
check('و بیشترین زیانش عددِ متناهی است', Number.isFinite(cal.maxLoss));
// زیانِ تقویمیِ هم‌قیمت‌اعمال، همان بدهکارِ ورود است.
check('بیشترین زیان، بدهکارِ خالصِ ورود است',
  near(cal.maxLoss, -net(CALENDAR, FEES), 0.02));
check('و شیبِ عددی همچنان گزارش می‌شود — پنهان نشد، فقط تصمیم نمی‌گیرد',
  Number.isFinite(cal.slopeRight) && cal.slopeRight < 0);

// ═══ آزمونِ اصلی: کارمزد نباید حکم بدهد ═══
//
// همان پاها با کارمزدِ صفر و با کارمزدِ واقعی باید **یک حکم** بگیرند.
// پیش از این، صفر کردنِ کارمزد حکم را عوض می‌کرد.
const calFree = mixed(CALENDAR, FREE);
check('حکمِ بی‌کرانی به کارمزد وابسته نیست',
  cal.unlimitedLoss === calFree.unlimitedLoss
  && cal.unlimitedProfit === calFree.unlimitedProfit);

// و ساختارهایی که واقعاً بی‌کران‌اند، بی‌کران می‌مانند.
const nakedCall = mixed([leg('call', 'sell', 14000, 30, 800)]);
check('کالِ برهنه همچنان زیان نامحدود دارد', nakedCall.unlimitedLoss === true);
const ratio = mixed([leg('call', 'buy', 13000, 20, 1200), leg('call', 'sell', 14000, 80, 700, 2)]);
check('نسبتِ ۱:۲ هم زیان نامحدود دارد', ratio.unlimitedLoss === true);
const back = mixed([leg('call', 'sell', 13000, 20, 1200), leg('call', 'buy', 14000, 80, 700, 2)]);
check('و بک‌اسپرد سودِ نامحدود — نه زیان',
  back.unlimitedProfit === true && back.unlimitedLoss === false);
const diagonal = mixed([leg('call', 'sell', 13000, 20, 1200), leg('call', 'buy', 15000, 80, 800)]);
check('مورب هم کراندار است', diagonal.unlimitedLoss === false && Number.isFinite(diagonal.maxLoss));
// پوتِ برهنه از سمت راست بی‌کران نیست؛ زیانش بزرگ ولی متناهی است.
const nakedPut = mixed([leg('put', 'sell', 13000, 30, 700)]);
check('پوتِ برهنه زیانِ بزرگِ متناهی دارد، نه بی‌نهایت',
  nakedPut.unlimitedLoss === false && Number.isFinite(nakedPut.maxLoss) && nakedPut.maxLoss > 0);

group('۲۳۸ ایراد ۱ب — کادرِ قیمت دستی همان موتور را صدا می‌زند');

// «بخش «اگر با قیمت دستی پر شود»، در حالی که هیچ قیمت دستی وارد نشده بود:
//  بیشترین سود منفی ۱۰۰٬۴۲۰، بیشترین زیان ۱۱۸٬۸۷۴ و سربه‌سری ناموجود.»
//
// چون `summarize` همیشه موتورِ تکه‌ای-خطی را صدا می‌زد، و آن موتور فروش و
// خرید یک قیمت اعمال را در دو سررسیدِ مختلف روی هم صفر می‌کند.
check('پاهای تقویمی هم‌سررسید نیستند', isSingleExpiry(CALENDAR) === false);
const linear = analyzePayoff(CALENDAR, net(CALENDAR, FEES), { fees: FEES });
check('موتورِ تکه‌ای-خطی روی همین پاها جوابِ دیگری می‌دهد — این همان دو-عددیِ گزارش است',
  linear.maxProfit < 0 && cal.maxProfit > 0);

const cmp = manualCompare(CALENDAR, {}, { fees: FEES, market: MARKET });
check('ستونِ «با قیمت بازار» با جدول و نمودار یکی است',
  near(cmp.base.maxProfit, cal.maxProfit, 1e-6) && near(cmp.base.maxLoss, cal.maxLoss, 1e-6));
check('و دیگر با موتورِ تکه‌ای-خطی نمی‌خواند', !near(cmp.base.maxProfit, linear.maxProfit, 1e-6));
check('سربه‌سری هم از همان موتور می‌آید',
  cmp.base.breakevens.length === cal.breakevens.length && cmp.base.breakevens.length > 0);
check('بی هیچ قیمتِ دستی، دو ستون عیناً یکی‌اند',
  cmp.anyManual === false && cmp.manual === cmp.base);
check('و ردیفِ بی‌کران در کادر هم بی‌کران می‌ماند، نه «—»',
  manualCompare([leg('call', 'sell', 14000, 30, 800)], {}, { fees: FEES, market: MARKET })
    .base.unlimitedLoss === true);

// وقتی قیمتِ دستی گذاشته می‌شود، همان موتور با پای عوض‌شده حساب می‌کند.
const withManual = manualCompare(CALENDAR, { 1: 2200 }, { fees: FEES, market: MARKET });
check('یک پای دست‌خورده، ستونِ دوم را جدا می‌کند',
  withManual.anyManual === true && withManual.manual.netCash < withManual.base.netCash);
check('و ترکیبِ تک‌سررسید همچنان با موتورِ تکه‌ای-خطی می‌خواند',
  near(manualCompare([leg('call', 'buy', 13000, 30, 900)], {}, { fees: FEES, market: MARKET }).base.maxLoss,
    analyzePayoff([leg('call', 'buy', 13000, 30, 900)],
      net([leg('call', 'buy', 13000, 30, 900)], FEES), { fees: FEES }).maxLoss, 1e-6));

group('۲۳۸ ایراد ۱ج — مسیرِ واقعی: تقویمی از buildChain تا scan');

const day = 24 * 3600 * 1000;
const stamp = (offset) => {
  const d = new Date(Date.now() + offset * day);
  return Number(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`);
};
const watchRow = (days, endDate, callIns, putIns) => ({
  uaInsCode: 'UA1', lval30_UA: 'خودرو', insCode_C: callIns, insCode_P: putIns,
  lVal18AFC_C: `ض${callIns}`, lVal18AFC_P: `ط${putIns}`,
  strikePrice: 10000, contractSize: 1000, endDate, remainedDay: days,
  pDrCotVal_UA: 10000, pClosing_UA: 10000, qTotTran5J_UA: 1e6, qTotCap_UA: 1e10,
  pMeDem_C: 500, qTitMeDem_C: 1000, pMeOf_C: 520, qTitMeOf_C: 1000,
  pDrCotVal_C: 510, pClosing_C: 510, qTotTran5J_C: 500, qTotCap_C: 1e9, oP_C: 500,
  pMeDem_P: 300, qTitMeDem_P: 1000, pMeOf_P: 320, qTitMeOf_P: 1000,
  pDrCotVal_P: 310, pClosing_P: 310, qTotTran5J_P: 500, qTotCap_P: 1e9, oP_P: 500,
});
const chain = buildChain([watchRow(30, stamp(30), 'C1', 'P1'), watchRow(90, stamp(90), 'C2', 'P2')]);
const wide = { ...defaults(), showUnexecutable: true, minReturnPct: -1e9, minUaLiquidity: 0, minLegVol: 0, minLegValue: 0, minOpenInt: 0, minBidQty: 0, maxDays: 400 };
const calRow = scan({ def: byId('calendar-call'), chain, uaKeys: ['UA1'], settings: wide, qty: 1 }).rows[0];
check('ردیفِ تقویمی از مسیرِ واقعی ساخته شد', !!calRow);
check('و در جدول «زیان نامحدود» نمی‌گیرد', calRow.unlimitedLoss === false);
check('پس بیشترین زیانش عدد دارد و مخرجِ سود-به-زیان می‌شود',
  Number.isFinite(calRow.maxLoss) && calRow.maxLoss > 0);
check('و هشدارِ «زیان نامحدود» هم روی ردیف نمی‌نشیند',
  !calRow.warn.includes('زیان نامحدود'));
check('«چند سررسید — بازده تقریبی» سرِ جایش ماند — این یکی راست بود',
  calRow.warn.includes('چند سررسید — بازده تقریبی'));

group('۲۳۸ ایراد ۲ — ردیفِ غیرقابل اتکا صدر را نمی‌گیرد');

// «Long Put دو روزه … بازده ماهانه ۲٬۰۲۶٬۳۹۶٪ را در رتبه اول نشان داد.
//  همان ردیف هم‌زمان هشدارهای «آفست ناممکن» و «بازده نامتعارف» داشت.»
check('دو هشدارِ گزارش، هر دو حکم‌ساز شدند',
  DEMOTING_FLAGS.has('بازده نامتعارف') && DEMOTING_FLAGS.has('آفست ناممکن'));
check('و ردیفی با هر کدامشان مشکوک است',
  rowTrust(['بازده نامتعارف']).suspect === true
  && rowTrust(['آفست ناممکن']).suspect === true
  && rowTrust(['آفست ناممکن', 'بازده نامتعارف']).reasons.length === 2);
// فهرست عمداً کوتاه است: اگر نیمی از جدول مشکوک شود، مشکوک بودن خبر نیست.
check('هشدارِ توصیفی ردیف را مشکوک نمی‌کند',
  rowTrust(['سررسید نزدیک', 'چند سررسید — بازده تقریبی', 'زیان نامحدود']).suspect === false);
check('ردیفِ بی‌هشدار هم مشکوک نیست', rowTrust([]).suspect === false && rowTrust().suspect === false);
check('و دلیلش روی صفحه جمله می‌شود، نه برچسبِ خام',
  suspectNote({ suspectWhy: rowTrust(['آفست ناممکن']).reasons }).includes('رتبه نمی‌گیرد'));

const good = { id: 'g', retMonthPct: 40, suspect: false };
const wild = { id: 'w', retMonthPct: 2026396, suspect: true };
const mid = { id: 'm', retMonthPct: 120, suspect: false };
check('مقایسه‌گر، مشکوک را آخر می‌گذارد',
  [wild, good, mid].sort(trustFirst)[2] === wild);
check('و در جهتِ وارونه هم آخر می‌ماند — بحث ترتیبِ عدد نیست',
  [good, wild, mid].sort((a, b) => trustFirst(a, b) || a.retMonthPct - b.retMonthPct)[2] === wild);
check('«بهترین» ردیفِ مشکوک را نمی‌خواند',
  bestTrusted([wild, good, mid]).id === 'm');
check('و اگر همه مشکوک باشند، «بهترین» خالی است نه بهترینِ مشکوک‌ها',
  bestTrusted([wild, { id: 'w2', retMonthPct: 9e5, suspect: true }]) === null);
check('ردیفِ بی‌عدد هم «بهترین» نمی‌شود',
  bestTrusted([{ id: 'n', retMonthPct: NaN, suspect: false }]) === null);

check('ستونِ اعتبار در قرارداد ستونی هست',
  COLUMNS.some((c) => c.key === 'suspect') && COLUMNS.some((c) => c.key === 'suspectFlags'));
check('و ردیفِ واقعیِ موتور آن را حمل می‌کند',
  typeof calRow.suspect === 'boolean' && Array.isArray(calRow.suspectFlags));
check('فیلترِ «کنار بگذار» در فهرست فیلترهاست',
  RADAR_FILTERS.some((f) => f.key === 'noSuspect' && f.cmp === 'notFlag' && f.field === 'suspect'));
check('و روی هر ۳۶ نمایه هست — قاعده است نه فهرست',
  CATALOG.every((def) => radarProfile(def).filters.some((f) => f.key === 'noSuspect')));
check('هیچ نمایه‌ای دو بار نگرفتش',
  CATALOG.every((def) => radarProfile(def).filters.filter((f) => f.key === 'noSuspect').length === 1));

const stratSrc = readSrc('../ui/tabs/strategy.mjs');
const tableSrc = readSrc('../ui/table.mjs');
check('جدول لایهٔ «مشکوک آخر» را دارد و جهت‌ناپذیر است',
  tableSrc.includes('if (demote) {') && tableSrc.includes('const d = (demote(a) ? 1 : 0) - (demote(b) ? 1 : 0);'));
check('و اختیاری است — تبی که این مفهوم را ندارد دست‌نخورده می‌ماند',
  tableSrc.includes("typeof opts.demote === 'function' ? opts.demote : null"));
check('تبِ استراتژی آن را سوار می‌کند', stratSrc.includes('demote: isSuspect,'));
check('و شاخص‌ها ردیفِ مشکوک را نمی‌خوانند',
  stratSrc.includes('const trusted = rows.filter((r) => !isSuspect(r));')
  && stratSrc.includes("bestTrusted(trusted, 'retMonthPct')"));
check('«ردیف قابل اجرا» هم دیگر ردیفی را که بسته نمی‌شود نمی‌شمارد',
  stratSrc.includes('trusted.filter((r) => r.executable).length'));

group('۲۳۸ ایراد ۳ — اسکنی که تمام می‌شود، می‌گوید تمام شد');

const scannerSrc = readSrc('../ui/scanner.mjs');
check('هر مسیرِ خروجِ زودهنگام مرحلهٔ دو را اعلام می‌کند',
  scannerSrc.includes('const endEarly = (skipped) => {')
  && !/if \(!top\.length\) return one;/.test(scannerSrc)
  && !/if \(!list\.length\) return one;/.test(scannerSrc));
check('و می‌گوید چرا اجرا نشد',
  scannerSrc.includes("endEarly('هیچ ردیفی از مرحله یک نگذشت')")
  && scannerSrc.includes("endEarly('ردیف‌های مرحله یک نماد قابل استعلامی ندارند')"));
check('اعلامِ زودهنگام هم ردیف‌های مرحلهٔ یک را حمل می‌کند، نه آرایهٔ خالی',
  scannerSrc.includes("onStage?.('two', { rows: one.rows, funnel: one.funnel, asked: 0, skipped });"));
check('و تب «کامل» نمی‌نویسد وقتی اجرا نشده',
  stratSrc.includes('res.skipped') && stratSrc.includes('مرحله دو اجرا نشد'));

group('۲۳۸ ایراد ۴ — دفتر خطا می‌گوید کدام سرویس');

const serverSrc = readSrc('../server/server.mjs');
check('محلِ خطا مسیرِ درخواست است، نه ماژولِ node',
  serverSrc.includes('where: `بالادست ${pathname}`') && !serverSrc.includes('where: `بالادست ${path}`'));
check('و نشانیِ کاملِ شکست‌خورده هم ثبت می‌شود',
  serverSrc.includes('تلاش ${attempt + 1} از ${S.retries + 1} — ${url}'));
check('مسیرِ «عکس تازه» هم که تا امروز ساکت بود، حالا می‌نویسد',
  serverSrc.includes('عکس تازه`'));

check('خانوادهٔ سرویس، شناسه‌ها را برمی‌دارد',
  upstreamFamily('/ClosingPrice/GetClosingPriceDailyList/17914401175772326/0')
    === '/ClosingPrice/GetClosingPriceDailyList/*/*');
check('و دو قرارداد مختلف یک خانواده‌اند',
  upstreamFamily('/BestLimits/111') === upstreamFamily('/BestLimits/222'));
check('پرسمانِ ضدِ کش بخشی از هویت نیست',
  upstreamFamily('/MarketWatch/Get?_=1730000000000') === upstreamFamily('/MarketWatch/Get'));
check('ورودیِ خالی هم نمی‌ترکد', upstreamFamily('') === '/' && upstreamFamily(null) === '/');

const tally = makeUpstreamTally();
tally.request('/BestLimits/1'); tally.request('/BestLimits/2'); tally.error('/BestLimits/2');
tally.request('/ClosingPrice/GetClosingPriceDailyList/9/0');
tally.cacheHit('/BestLimits/3');
const snap = tally.snapshot();
check('شمارش به تفکیکِ سرویس جمع می‌شود',
  snap[0].family === '/BestLimits/*' && snap[0].requests === 2 && snap[0].errors === 1 && snap[0].cacheHits === 1);
check('و پرمصرف‌ترین اول می‌آید', snap.length === 2 && snap[1].requests === 1);
check('بدترین سرویس از نظر خطا شناخته می‌شود',
  tally.worstError().family === '/BestLimits/*' && tally.worstError().errors === 1);
check('و وقتی خطایی نبوده، خالی است نه صفرِ ساختگی',
  makeUpstreamTally().worstError() === null);
check('سلامت سرور آن را بیرون می‌دهد',
  serverSrc.includes('byEndpoint: tally.snapshot(12), worstEndpoint: tally.worstError(),'));
check('و نوارِ بالای صفحه نامِ سرویس را کنارِ شمارِ خطا می‌گذارد',
  readSrc('../ui/app.mjs').includes('بیشترین خطا: ${worst.family}'));

group('۲۳۸ ایراد ۵ — پنلِ انتخاب استراتژی جلوی مقصد نمی‌ایستد');

// «کلیک روی «اسکن» به دکمه Naked Put زیر پنل برخورد کرد و استراتژی عوض شد.»
//
// بستنِ با کلیکِ بیرون این را نمی‌گرفت: کلیک روی خودِ دکمهٔ تب «بیرون» نیست.
const appSrc = readSrc('../ui/app.mjs');
check('انتخابِ تب، پنل را همان‌جا می‌بندد',
  /open\(t\.id\);[\s\S]{0,900}?closeSubmenu\(\);\n    \}\);/.test(appSrc));
check('بستنِ با کلیکِ بیرون هم سرِ جایش ماند',
  appSrc.includes("if (!e.target.closest('.rail') && !e.target.closest('.rail-submenu'))"));
