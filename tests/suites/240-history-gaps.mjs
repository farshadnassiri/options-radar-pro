// ۲۴۰. «آن روز معامله نشد» با «نتوانستیم بگیریمش» یکی نیست
//
// ═══ از کجا آمد ═══
//
// نکتهٔ عملیاتیِ بازآزماییِ ۱۴۰۵/۰۶/۱۶ روی `d6a89e9`:
//
//   «بالادست TSETMC در این بازه ۶۵ خطای HTTP 502 داد؛ ۶۱ مورد مربوط به
//    تاریخچهٔ روزانه بود … این خطاها بیرونی‌اند، اما رابط آن‌ها را صریح نشان
//    می‌دهد و ممکن است پوشش تاریخی را موقتاً ناقص کنند.»
//
// «رابط آن‌ها را صریح نشان می‌دهد» دربارهٔ **شمارندهٔ خطای سرور** درست بود —
// ولی جدولِ تاریخی چیز دیگری می‌گفت. `/api/dailies` برای قراردادی که
// دریافتش شکست خورده `rows: []` به‌علاوهٔ `error` می‌دهد، و `priceHistoryRows`
// فقط `rows` را می‌خواند. پس آن قرارداد دقیقاً شبیه قراردادی می‌شد که آن روز
// معامله نشده، و جملهٔ صداقت می‌نوشت «۱۸۰ از ۲۰۰ پا قیمت داشت» — عددی که
// خواننده واقعیتِ بازار می‌خواند، نه خرابیِ شبکه.
//
// همان الگوی همیشگی، این بار در سکوت: **حالتِ شکست، شبیه یک نتیجهٔ معتبر
// شده بود.** و تفاوتشان عملی است: «معامله نشده» تمام است، «نگرفتیم» با
// اسکنِ دوباره درست می‌شود.

import { check, group } from '../harness.mjs';
import { resolvePrice } from '../../core/exec.mjs';
import { buildHistoryChain, historyChainNote, priceHistoryRows } from '../../core/history-chain.mjs';
import { runHistoryScan } from '../../ui/strategy-history.mjs';
import { byId } from '../../strategies/catalog.mjs';
import { defaults } from '../../core/settings.mjs';

const DATE = 20260103;
const day = (date, close) => ({ date, close, last: close + 1, low: close - 5, high: close + 5, vol: 100, trades: 8, value: close * 100 });
const pair = (ua, call, put, strike) => ({
  uaInsCode: ua, lval30_UA: 'خودرو', insCode_C: call, insCode_P: put,
  lVal18AFC_C: `ض${call}`, lVal18AFC_P: `ط${put}`,
  strikePrice: strike, contractSize: 1000, endDate: 14050915, remainedDay: 30,
});
const rows = [pair('UA1', 'C1', 'P1', 1000), pair('UA1', 'C2', 'P2', 1200)];

group('۲۴۰ — پای دریافت‌نشده، از پای بی‌معامله جدا می‌شود');

const mixed = priceHistoryRows(rows, {
  UA1: { rows: [day(DATE, 950)] },
  C1: { rows: [day(DATE, 60)] },
  P1: { rows: [] },                                     // آن روز معامله نشد
  C2: { rows: [], error: 'Error: HTTP 502' },           // دریافت شکست خورد
  P2: { rows: [day(DATE, 20)] },
}, DATE);

check('هر دو همچنان «بی‌قیمت» شمرده می‌شوند — عددِ کل عوض نشد',
  mixed.legsTotal === 4 && mixed.legsPriced === 2 && mixed.legsMissing === 2);
check('ولی فقط یکی‌شان «دریافت نشد» است',
  mixed.legsFailed === 1 && mixed.failedLegIns.join() === 'C2');
check('و پای بی‌معامله در آن فهرست نیست — نداشتنش تقصیرِ بازار است',
  !mixed.failedLegIns.includes('P1') && mixed.missingLegIns.includes('P1'));
check('«دریافت‌نشده» زیرمجموعهٔ «بی‌قیمت» است، نه شمارشِ موازی',
  mixed.legsFailed <= mixed.legsMissing);

// خطای مسیرِ دومِ `/api/dailies` وقتی مسیرِ اول جواب داده، هشدار نیست.
const noise = priceHistoryRows([rows[0]], {
  UA1: { rows: [day(DATE, 950)] },
  C1: { rows: [day(DATE, 60)], fallbackError: 'Error: HTTP 502', fallbackTried: true },
  P1: { rows: [day(DATE, 40)] },
}, DATE);
check('قیمتی که پر شد، خطای مسیرِ دومش هشدار نمی‌سازد',
  noise.legsPriced === 2 && noise.legsFailed === 0);

// نماد پایه هم همان قاعده را دارد.
const baseFail = priceHistoryRows([rows[0]], {
  UA1: { rows: [], error: 'Error: HTTP 502' },
  C1: { rows: [day(DATE, 60)] }, P1: { rows: [day(DATE, 40)] },
}, DATE);
check('پایهٔ دریافت‌نشده هم جدا شمرده می‌شود',
  baseFail.basesMissing === 1 && baseFail.basesFailed === 1
  && baseFail.failedBaseIns.join() === 'UA1');
const baseQuiet = priceHistoryRows([rows[0]], { C1: { rows: [day(DATE, 60)] }, P1: { rows: [day(DATE, 40)] } }, DATE);
check('و پایه‌ای که اصلاً سری ندارد، «دریافت‌نشده» نیست',
  baseQuiet.basesMissing === 1 && baseQuiet.basesFailed === 0);

// شکلِ آرایهٔ خام (مصرف‌کنندهٔ قدیمی) هیچ‌وقت خطا اعلام نمی‌کند.
const raw = priceHistoryRows([rows[0]], { UA1: [day(DATE, 950)], C1: [], P1: [] }, DATE);
check('آرایهٔ خام همچنان کار می‌کند و ادعای خطا نمی‌سازد',
  raw.legsMissing === 2 && raw.legsFailed === 0 && raw.basesFailed === 0);

group('۲۴۰ — جملهٔ صداقت، ناقص‌بودن را می‌گوید');

const noteFail = historyChainNote(mixed, 'CLOSE');
check('وقتی چیزی دریافت نشده، جمله هشدار می‌دهد',
  noteFail.includes('⚠') && noteFail.includes('دریافتشان از بالادست شکست خورد'));
check('و می‌گوید چه کاری از دستِ کاربر برمی‌آید',
  noteFail.includes('اسکنِ دوباره'));
check('رقمش فارسی است — جملهٔ نمایشی است',
  noteFail.includes('۱ قرارداد') && !/\d/.test(noteFail));
check('و جملهٔ همیشگیِ «مرجع‌اند، ادعای اجرا ندارند» سرِ جایش ماند',
  noteFail.includes('ادعای اجرا ندارند'));

const noteClean = historyChainNote(priceHistoryRows(rows, {
  UA1: { rows: [day(DATE, 950)] },
  C1: { rows: [day(DATE, 60)] }, P1: { rows: [] },
  C2: { rows: [day(DATE, 30)] }, P2: { rows: [day(DATE, 20)] },
}, DATE), 'CLOSE');
check('و وقتی همه‌چیز رسیده، هیچ هشداری اضافه نمی‌شود',
  !noteClean.includes('⚠') && noteClean.includes('۳ از ۴ پا'));

// `buildHistoryChain` همان میدان‌ها را بالا می‌برد.
const built = buildHistoryChain(rows, {
  UA1: { rows: [day(DATE, 950)] },
  C1: { rows: [day(DATE, 60)] }, P1: { rows: [day(DATE, 40)] },
  C2: { rows: [], error: 'Error: HTTP 502' }, P2: { rows: [day(DATE, 20)] },
}, DATE);
check('زنجیره هم پرچمِ ناقصی را حمل می‌کند', built.legsFailed === 1);

group('۲۴۰ — مسیرِ واقعی: از fetch تا پرچمِ `incomplete`');

// ═══ چرا مسیرِ کامل، نه فقط تابع ═══
//
// درسِ ثبت‌شدهٔ همین پروژه: «آزمونِ تابع، جای‌نگه‌دار و مرزِ نمایش را
// نمی‌بیند.» پس اینجا `runHistoryScan` با یک `fetcher` جعلی صدا زده
// می‌شود که دقیقاً همان چیزی را می‌دهد که `/api/dailies` هنگام ۵۰۲ می‌دهد.
const universeRows = rows.map((row) => ({ ...row }));
const dailyPayload = (withError) => ({
  UA1: { ins: 'UA1', rows: [day(DATE, 950)], source: 'list' },
  C1: { ins: 'C1', rows: [day(DATE, 60)], source: 'list' },
  P1: { ins: 'P1', rows: [day(DATE, 40)], source: 'list' },
  C2: withError
    ? { ins: 'C2', rows: [], source: 'list', error: 'Error: HTTP 502' }
    : { ins: 'C2', rows: [day(DATE, 30)], source: 'list' },
  P2: { ins: 'P2', rows: [day(DATE, 20)], source: 'list' },
});
const fetcherFor = (withError) => async (url) => ({
  ok: true,
  json: async () => (url.startsWith('/api/history/universe')
    ? { rows: universeRows, note: 'فهرست از دفتر آمد.', asOf: DATE }
    : dailyPayload(withError)),
});
const wide = { ...defaults(), minReturnPct: -1e9, minUaLiquidity: 0, minLegVol: 0, minLegValue: 0, minOpenInt: 0, minBidQty: 0, maxDays: 400 };

const hurt = await runHistoryScan({
  def: byId('bull-call-spread'), uaIns: 'UA1', date: DATE,
  basis: 'CLOSE', settings: wide, qty: 1, fetcher: fetcherFor(true),
});
check('اسکنِ تاریخی با ۵۰۲ روی یک قرارداد، ناقص اعلام می‌شود',
  hurt.incomplete === true && hurt.failedCount === 1);
check('و جمله‌اش همان هشدار را دارد', hurt.note.includes('⚠'));

// ═══ و مهم‌تر: ردیفِ ساختگی اصلاً ساخته نمی‌شود ═══
//
// پیش از این اصلاح، همین ورودی یک ردیف می‌داد با پای دومِ
// «قیمت پایانی: ۰» و «بیشترین سود ۱۳۸٬۸۳۸» — عددی که هیچ معامله‌ای پشتش
// نبود. حذف بی‌صداست نه: سطلِ `noQuote` می‌شمردش.
check('ترکیبی که یک پایش قیمت ندارد، ردیف نمی‌سازد',
  hurt.rows.length === 0 && hurt.funnel.noQuote > 0);
check('و هیچ ردیفی با پای صفرقیمت باقی نمی‌ماند',
  hurt.rows.every((row) => row.legPrices.every((leg) => leg.price > 0)));

const whole = await runHistoryScan({
  def: byId('bull-call-spread'), uaIns: 'UA1', date: DATE,
  basis: 'CLOSE', settings: wide, qty: 1, fetcher: fetcherFor(false),
});
check('و همان اسکن بدون خطا، ناقص اعلام نمی‌شود',
  whole.incomplete === false && whole.failedCount === 0 && !whole.note.includes('⚠'));
check('و همان ورودی بدون خطا، ردیف می‌سازد — پس حذف مالِ نبودِ قیمت بود نه چیز دیگر',
  whole.rows.length === 1 && whole.rows[0].legPrices.every((leg) => leg.price > 0));

group('۲۴۰ — صفر، قیمت نیست');

// ریشهٔ همه‌اش یک خط بود: `num(undefined)` صفر است و مبناهای مرجع صفر را
// قیمت می‌پذیرفتند. مبنای دفتر سفارش از اول `> 0` را می‌سنجید.
const buy = { basis: 'CLOSE' };
check('قیمت پایانیِ موجود، «مرجع» است',
  resolvePrice({ close: 120 }, 'buy', buy).quality === 'reference'
  && resolvePrice({ close: 120 }, 'buy', buy).price === 120);
check('و قیمت پایانیِ نبوده، «بی‌مظنه» — نه «قیمت پایانی ۰»',
  resolvePrice({}, 'buy', buy).quality === 'none'
  && resolvePrice({}, 'buy', buy).source === 'بی‌مظنه');
check('صفرِ صریح هم قیمت نیست',
  resolvePrice({ close: 0 }, 'buy', buy).quality === 'none');
check('عدد منفی هم قیمت نیست',
  resolvePrice({ close: -5 }, 'buy', buy).quality === 'none');
check('هر چهار مبنای مرجع همین قاعده را دارند',
  ['LAST', 'CLOSE', 'LOW', 'HIGH'].every((basis) =>
    resolvePrice({}, 'buy', { basis }).quality === 'none'));
check('و وقتی عدد هست، هر چهارتا برچسبِ خودشان را می‌زنند',
  resolvePrice({ last: 10 }, 'buy', { basis: 'LAST' }).source === 'آخرین معامله'
  && resolvePrice({ low: 10 }, 'buy', { basis: 'LOW' }).source === 'کمترین قیمت روز'
  && resolvePrice({ high: 10 }, 'buy', { basis: 'HIGH' }).source === 'بیشترین قیمت روز');
check('«ناهم‌زمانی» کمترین و بیشترین حفظ شد',
  resolvePrice({ low: 10 }, 'buy', { basis: 'LOW' }).simultaneous === false
  && resolvePrice({}, 'buy', { basis: 'LOW' }).simultaneous === false);
