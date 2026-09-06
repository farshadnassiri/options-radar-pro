// ۲۳۳. زنجیرهٔ روزِ گذشته — همان جدول، تاریخِ دیگر
//
// ═══ خواسته‌ای که این دسته جوابش است (بندِ ۸) ═══
//
// «در صفحه مخصوص هر استراتژی امکان رصد زنده و همچنین رصد تاریخی وجود
// داشته باشه … اگه کاربر تاریخ داد جدول بر اساس تاریخ به روز بشه.»
//
// ═══ آنچه سنجیده می‌شود ═══
//
// نه اینکه «تابعی هست»، بلکه اینکه **هیچ عددی ساخته نمی‌شود**: روزِ دیگر
// جانشین نمی‌شود، دفترِ سفارشِ گذشته اختراع نمی‌شود، و پایهٔ بی‌قیمت
// ترکیب نمی‌سازد.

import { check, group } from '../harness.mjs';
import {
  HISTORY_CHAIN_BASES, buildHistoryChain, dailyAt, historyBasis, historyChainNote, priceHistoryRows,
} from '../../core/history-chain.mjs';

group('۲۳۳ زنجیرهٔ تاریخی — انتخابِ روز');

const series = [
  { date: 20260101, close: 100, last: 101, low: 98, high: 103, yday: 99, vol: 10, trades: 3, value: 1000 },
  { date: 20260103, close: 120, last: 121, low: 118, high: 124, yday: 100, vol: 20, trades: 5, value: 2400 },
];

check('ردیفِ دقیقاً همان روز برداشته می‌شود', dailyAt(series, 20260103)?.close === 120);
// این ادعا قلبِ صداقتِ این ماژول است: روزی که معامله نشده، ردیف ندارد و
// هیچ روزِ دیگری جایش نمی‌نشیند. با جانشینی، کاربر عددی می‌دید که آن روز
// اصلاً وجود نداشت.
check('روزِ نبوده، با روزِ قبل جانشین نمی‌شود', dailyAt(series, 20260102) === null);
check('روزِ بیرون از سری هم null است، نه نزدیک‌ترین',
  dailyAt(series, 20251231) === null && dailyAt(series, 20260201) === null);
check('سریِ نامرتب همان جواب را می‌دهد', dailyAt([...series].reverse(), 20260101)?.close === 100);
check('سریِ خالی یا ورودیِ بی‌ربط، پرتاب نمی‌کند',
  dailyAt([], 20260101) === null && dailyAt(null, 20260101) === null && dailyAt(series, 0) === null);

check('مبنای گذشته، دفتر سفارش ندارد',
  !HISTORY_CHAIN_BASES.some(([key]) => key === 'BOOK') && HISTORY_CHAIN_BASES.length === 4);
check('مبنای زندهٔ بی‌معنی در گذشته، به پایانی می‌افتد',
  historyBasis('BOOK') === 'CLOSE' && historyBasis('') === 'CLOSE' && historyBasis('MID') === 'CLOSE');
check('و مبنای معتبر دست نمی‌خورد',
  historyBasis('LAST') === 'LAST' && historyBasis('low') === 'LOW' && historyBasis('HIGH') === 'HIGH');

group('۲۳۳ زنجیرهٔ تاریخی — پرکردنِ قیمت');

const day = (date, close, extra = {}) => ({
  date, close, last: close + 1, low: close - 2, high: close + 3,
  yday: close - 5, vol: 7, trades: 2, value: close * 7, ...extra,
});

// دو قیمت اعمال روی یک پایه؛ پای پوتِ یکی از آن‌ها آن روز اصلاً معامله
// نشده، تا «پای بی‌قیمت» هم سنجیده شود.
const rows = [
  {
    uaInsCode: 'UA1', lval30_UA: 'خودرو',
    insCode_C: 'C1', insCode_P: 'P1', lVal18AFC_C: 'ضخود۱', lVal18AFC_P: 'طخود۱',
    strikePrice: 1000, contractSize: 1000, endDate: 14050915, remainedDay: 30,
  },
  {
    uaInsCode: 'UA1', lval30_UA: 'خودرو',
    insCode_C: 'C2', insCode_P: 'P2', lVal18AFC_C: 'ضخود۲', lVal18AFC_P: 'طخود۲',
    strikePrice: 1200, contractSize: 1000, endDate: 14050915, remainedDay: 30,
  },
  {
    uaInsCode: 'UA2', lval30_UA: 'فولاد',
    insCode_C: 'C3', insCode_P: 'P3', lVal18AFC_C: 'ضفلا۱', lVal18AFC_P: 'طفلا۱',
    strikePrice: 500, contractSize: 1000, endDate: 14050915, remainedDay: 30,
  },
];

const dailies = {
  UA1: { rows: [day(20260101, 900), day(20260103, 950)] },
  C1: { rows: [day(20260103, 60)] },
  P1: { rows: [day(20260103, 40)] },
  C2: { rows: [day(20260103, 30)] },
  P2: { rows: [] },                                   // آن روز معامله نشد
  C3: { rows: [day(20260103, 25)] },
  P3: { rows: [day(20260103, 15)] },
  // UA2 عمداً هیچ سری‌ای ندارد — پایهٔ بی‌قیمت
};

const priced = priceHistoryRows(rows, dailies, 20260103);
// پنج از شش: تنها پای بی‌معامله `P2` است. پاهای `UA2` قیمت دارند، هرچند
// خودِ پایه ندارد — و همین دو را جدا نگه می‌دارد: پای قیمت‌دارِ پایهٔ
// بی‌قیمت، ردیف نمی‌سازد ولی «پای بی‌قیمت» هم نیست.
check('شمارشِ پاها راست است', priced.legsTotal === 6 && priced.legsPriced === 5);
check('پای بی‌قیمتِ آن روز جدا شمرده می‌شود',
  priced.legsMissing === 1 && priced.missingLegIns.includes('P2'));
check('نماد پایهٔ بی‌سری هم جدا شمرده می‌شود',
  priced.basesMissing === 1 && priced.missingBaseIns.includes('UA2'));
check('قیمتِ پا از ردیفِ همان روز می‌آید', priced.rows[0].pClosing_C === 60 && priced.rows[0].pDrCotVal_C === 61);
check('و پایِ بی‌قیمت هیچ عددی نمی‌گیرد — صفر می‌ماند، نه قیمتِ پای دیگر',
  !priced.rows[1].pClosing_P && !priced.rows[1].pDrCotVal_P);
check('قیمتِ نماد پایه هم از سری خودش می‌آید، نه از قرارداد',
  priced.rows[0].pClosing_UA === 950 && priced.rows[0].pDrCotVal_UA === 951);
check('ورودی دست‌نخورده می‌ماند', rows[0].pClosing_C === undefined);

// آرایهٔ خام هم پذیرفته می‌شود، نه فقط شکلِ `{ rows }` — دو مصرف‌کننده دو
// شکل می‌دهند و یکی‌شان نباید بی‌صدا خالی برگردد.
const rawShape = priceHistoryRows([rows[0]], { UA1: [day(20260103, 950)], C1: [day(20260103, 60)] }, 20260103);
check('نگاشتِ آرایه‌ای هم کار می‌کند', rawShape.legsPriced === 1 && rawShape.rows[0].pClosing_UA === 950);

group('۲۳۳ زنجیرهٔ تاریخی — زنجیره');

const built = buildHistoryChain(rows, dailies, 20260103);
const ua1 = built.chain.get('UA1');
const strike1 = ua1.expiryList[0].strikeList.find((s) => s.strike === 1000);

check('زنجیره همان دو پایه را دارد', built.chain.size === 2 && built.uaTotal === 2);
check('و فقط یکی‌شان قیمت دارد', built.uaPriced === 1);
check('قیمتِ پایه روی زنجیره نشست', ua1.close === 950 && ua1.last === 951);
check('کف و سقفِ روزِ پایه هم نشست', ua1.low === 948 && ua1.high === 953);
// این همان چیزی است که مبنای «کمترین/بیشترین قیمت روز» را در حالت تاریخی
// ممکن می‌کند. `sideQuote` این دو را صفر می‌گذارد چون در رصدِ زنده مرحلهٔ
// دو پرشان می‌کند؛ در گذشته مرحلهٔ دومی نیست و ردیفِ روزانه هر دو را دارد.
check('کف و سقفِ روزِ هر پا هم نشست', strike1.call.low === 58 && strike1.call.high === 63);

// ═══ دفترِ گذشته اختراع نمی‌شود ═══
//
// اگر `bid`/`ask` از قیمتِ پایانی ساخته می‌شد، ردیف در حالت تاریخی
// «قابل اجرا» خوانده می‌شد — ادعایی که هیچ منبعی ندارد.
check('دفتر سفارشِ گذشته ساخته نمی‌شود',
  strike1.call.bid === 0 && strike1.call.ask === 0
  && strike1.put.bid === 0 && strike1.put.ask === 0);
check('و «عمق گرفته شد» هرگز ادعا نمی‌شود',
  strike1.call.book === null && strike1.call.depth === false
  && strike1.put.book === null && strike1.put.depth === false);
check('پایِ بی‌معاملهٔ آن روز روی زنجیره هم بی‌قیمت است',
  ua1.expiryList[0].strikeList.find((s) => s.strike === 1200).put.close === 0);

const note = historyChainNote(built, 'LAST');
check('جملهٔ صداقت، شمارشِ واقعی را می‌گوید', note.includes('۵ از ۶'));
check('و می‌گوید نماد پایهٔ بی‌قیمت ترکیب نمی‌سازد', note.includes('نماد پایه'));
check('و ادعای اجرا را صریح رد می‌کند', note.includes('ادعای اجرا ندارند'));
check('و مبنای انتخابی را نام می‌برد', note.includes('آخرین معامله'));
check('روزِ بی‌قرارداد، جملهٔ خودش را دارد',
  historyChainNote(buildHistoryChain([], dailies, 20260103), 'CLOSE').includes('هیچ قراردادی'));

group('۲۳۳ رصد تاریخی — ترتیبِ درخواست و قاعدهٔ مرجع');

// ═══ چرا با `fetcher` تزریق‌شده ═══
//
// درسِ دو نوبت پیش: ادعای منبع آزمون نیست. اینجا خودِ **رفتار** سنجیده
// می‌شود — چه درخواستی به چه ترتیبی می‌رود، و آیا `showUnexecutable` در
// حالت تاریخی واقعاً روشن می‌شود.

const { runHistoryScan } = await import('../../ui/strategy-history.mjs');
const { byId: byId233 } = await import('../../strategies/catalog.mjs');
const { defaults: defaults233 } = await import('../../core/settings.mjs');
const DEFAULTS = defaults233();

const dayRow = (date, close) => ({
  date, close, last: close, low: close - 1, high: close + 1,
  yday: close, vol: 5, trades: 2, value: close * 5,
});

function fakeFetcher(seen) {
  return async (url) => {
    seen.push(url);
    if (url.startsWith('/api/history/universe')) {
      return { ok: true, status: 200, json: async () => ({
        note: 'از بایگانی همان روز', archived: true, asOf: 20260103,
        rows: [{
          uaInsCode: 'UA1', lval30_UA: 'خودرو',
          insCode_C: 'C1', insCode_P: 'P1', lVal18AFC_C: 'ضخود۱', lVal18AFC_P: 'طخود۱',
          strikePrice: 9000, contractSize: 1000, endDate: 14051215, remainedDay: 40,
        }, {
          uaInsCode: 'OTHER', insCode_C: 'CX', insCode_P: 'PX',
          strikePrice: 500, contractSize: 1000, endDate: 14051215, remainedDay: 40,
        }],
      }) };
    }
    if (url.startsWith('/api/dailies')) {
      return { ok: true, status: 200, json: async () => ({
        UA1: { rows: [dayRow(20260103, 10000)] },
        C1: { rows: [dayRow(20260103, 800)] },
        P1: { rows: [dayRow(20260103, 300)] },
      }) };
    }
    throw new Error(`درخواست پیش‌بینی‌نشده: ${url}`);
  };
}

const seen = [];
const out233 = await runHistoryScan({
  def: byId233('covered-call'), uaIns: 'UA1', date: 20260103, basis: 'CLOSE',
  // `minUaLiquidity` صفر می‌شود چون دادهٔ ساختگیِ این آزمون گردشِ واقعی
  // ندارد؛ آنچه سنجیده می‌شود مسیر است، نه غربالِ نقدشوندگی.
  settings: { ...DEFAULTS, showUnexecutable: false, minReturnPct: -1e9, minUaLiquidity: 0 },
  qty: 1, fetcher: fakeFetcher(seen),
});

check('اول فهرست قراردادهای همان روز، بعد قیمت‌های روزانه',
  seen.length === 2 && seen[0].includes('/api/history/universe?date=20260103')
  && seen[1].startsWith('/api/dailies'));
// فقط کدهای همین نماد درخواست می‌شوند، نه کلِ عکسِ آن روز — وگرنه یک تب
// استراتژی برای یک نماد، چند هزار کد می‌خواست.
check('فقط کدهای همین نماد پایه خواسته می‌شوند',
  seen[1].includes('UA1') && seen[1].includes('C1') && seen[1].includes('P1')
  && !seen[1].includes('CX') && !seen[1].includes('PX'));

// ═══ قاعدهٔ مرجع ═══
//
// دفترِ گذشته وجود ندارد، پس هر مبنای تاریخی «مرجع» است و هیچ ردیفی
// «قابل اجرا» نیست. اگر `showUnexecutable` کاربر (خاموش) محترم شمرده
// می‌شد، جدول همیشه خالی بود و خواننده آن را «آن روز چیزی نبود»
// می‌خواند — در حالی که مسئله ابزار است نه بازار.
check('با وجود خاموش بودنِ «نمایش غیرقابل اجرا»، ردیفِ تاریخی ساخته می‌شود',
  out233.rows.length > 0);
check('و هیچ ردیفِ تاریخی «قابل اجرا» ادعا نمی‌شود',
  out233.rows.every((row) => row.executable !== true));
check('هر ردیف تاریخِ خودش و مبنای خودش را حمل می‌کند',
  out233.rows.every((row) => row.historyDate === 20260103 && row.historyBasis === 'CLOSE'));
check('جملهٔ صداقت و یادداشتِ منبعِ فهرست هر دو برمی‌گردند',
  out233.note.includes('ادعای اجرا ندارند') && out233.universeNote.includes('بایگانی'));

// نمادِ بی‌قرارداد در آن تاریخ: خالی، ولی با علتِ خودش — نه با استثنا.
const empty233 = await runHistoryScan({
  def: byId233('covered-call'), uaIns: 'NOPE', date: 20260103,
  settings: DEFAULTS, qty: 1, fetcher: fakeFetcher([]),
});
check('نمادِ بی‌قرارداد در آن روز، جدولِ خالی با علت می‌دهد',
  empty233.rows.length === 0 && empty233.note.includes('هیچ قراردادی'));

let threw = '';
try {
  await runHistoryScan({ def: byId233('covered-call'), uaIns: '', date: 20260103, settings: DEFAULTS });
} catch (error) { threw = error.message; }
check('بی نماد، درخواستی فرستاده نمی‌شود', threw.includes('نماد پایه'));
