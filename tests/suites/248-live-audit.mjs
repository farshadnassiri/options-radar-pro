// ۲۴۸. ممیزی ۱۴۰۵/۰۶/۲۴ روی صفحهٔ رصد زنده
//
// ده ایراد گزارش شد در حالی که دروازه کامل سبز بود — یعنی آزمون‌ها چیزی را
// می‌سنجیدند که رفتار واقعی نبود. این دسته همان فاصله را پر می‌کند.

import { check, near, group, readSrc } from '../harness.mjs';
import { impliedVolWhy, bsPrice } from '../../core/bs.mjs';
import { liveIvAt, liveQuoteIvSet, IV_WHY_LABEL } from '../../core/live-market.mjs';
import { liveBaseList, liveOpenViewContracts, mergeUnderlyingTrades, contractAnalytics } from '../../core/decision-dashboard.mjs';
import { dashboardClock } from '../../core/watch-health.mjs';

group('۲۴۸. ممیزی رصد زنده — فهرست لحظه‌ای، گردش پایه، علت تلاطم و ساعت');

// ————— ۱. فهرست نماد لحظه‌ای فقط از تابلوی امروز —————
const uni248 = {
  underlyings: [
    { ins: '11', name: 'اهرم', changePct: 2.5, uaValue: 0 },
    { ins: '22', name: 'خودرو', changePct: -1, uaValue: 0 },
    // نمادی که امروز روی تابلو قرارداد ندارد: در فهرست پایه هست ولی
    // هیچ قراردادی به آن اشاره نمی‌کند.
    { ins: '33', name: 'نمادِ بی‌قرارداد', changePct: 0, uaValue: 0 },
  ],
  contracts: [
    { ins: 'c1', uaIns: '11', uaName: 'اهرم', kind: 'call', strike: 1000, endDate: 20260101, days: 30, size: 1000, volume: 5 },
    { ins: 'c2', uaIns: '11', uaName: 'اهرم', kind: 'put', strike: 1000, endDate: 20260101, days: 30, size: 1000, volume: 0 },
    { ins: 'c3', uaIns: '11', uaName: 'اهرم', kind: 'call', strike: 1200, endDate: 20260201, days: 61, size: 0, volume: 2 },
    { ins: 'c4', uaIns: '22', uaName: 'خودرو', kind: 'call', strike: 500, endDate: 20260101, days: 30, size: 1000, volume: 0 },
  ],
};
const bases248 = liveBaseList(uni248);
// ═══ مهم‌ترین ادعای ردیف ۱ ═══
// نمادی که امروز هیچ قراردادی ندارد نباید قابل انتخاب باشد. پیش از این
// فهرست از دفتر تاریخیِ بازه می‌آمد و چنین نمادهایی داخلش بودند.
check('نمادِ بدون قرارداد امروز در فهرست لحظه‌ای نمی‌آید',
  bases248.length === 2 && !bases248.some((item) => item.ins === '33'));
check('شمار قرارداد و سررسید هر نماد از خود عکس امروز می‌آید',
  bases248.find((item) => item.ins === '11').contracts === 3
  && bases248.find((item) => item.ins === '11').expiries === 2);
check('قرارداد معامله‌شده جدا شمرده می‌شود',
  bases248.find((item) => item.ins === '11').tradedContracts === 2
  && bases248.find((item) => item.ins === '22').tradedContracts === 0);
check('فهرست الفبایی است تا انتخاب از میان ده‌ها نماد ممکن بماند',
  bases248.map((item) => item.name).join(',') === ['اهرم', 'خودرو'].sort((a, b) => a.localeCompare(b, 'fa')).join(','));

const live248 = liveOpenViewContracts(uni248, '11');
check('قراردادهای لحظه‌ای همان شکل فهرست تاریخی را دارند',
  live248.length === 3
  && live248.every((item) => ['ins', 'name', 'kind', 'strike', 'size', 'expiry', 'daysNow'].every((key) => key in item)));
check('اندازهٔ نداده‌شده صفر می‌ماند و پرچمش پایین است، نه اینکه ساخته شود',
  live248.find((item) => item.ins === 'c3').size === 0
  && live248.find((item) => item.ins === 'c3').sizeFromSpec === false
  && live248.find((item) => item.ins === 'c1').sizeFromSpec === true);
check('مرتب بر سررسید و بعد اعمال، تا دو سررسید قاطی نشوند',
  live248.map((item) => item.ins).join(',') === 'c1,c2,c3');

// ————— ۵. گردش واقعی پایه، روی عکس زنجیره —————
const merged248 = mergeUnderlyingTrades(uni248, [
  { ins: '11', value: 155_000_000_000, volume: 4200, trades: 900, last: 2400 },
  { ins: '22', value: 0, volume: 0, trades: 0, last: 0 },
]);
check('گردش دیده‌شدهٔ پایه روی همان ردیف می‌نشیند',
  merged248.underlyings[0].uaValue === 155_000_000_000 && merged248.underlyings[0].uaTrades === 900);
// ═══ صفر و «نداریم» یکی نیستند ═══
// پایه‌ای که در نوار معامله هست ولی امروز معامله نشده، صفرِ واقعی دارد.
// پایه‌ای که اصلاً پرسیده نشده، «نامعلوم» است.
check('پایهٔ دیده‌شده و بی‌معامله صفر می‌گیرد، پایهٔ پرسیده‌نشده نامعلوم',
  merged248.underlyings[1].uaValue === 0
  && Number.isNaN(merged248.underlyings[2].uaValue));
check('قیمت پایه فقط وقتی جایگزین می‌شود که نوار عدد معتبر داده باشد',
  merged248.underlyings[0].last === 2400 && merged248.underlyings[1].last === undefined);

// ————— ۳. علت خالی‌بودن تلاطم —————
const T248 = 30 / 365;
check('حل‌گر در حالت عادی جواب و کد «ok» می‌دهد',
  impliedVolWhy('call', 180, 2100, 2000, T248, 0.3, 0, { lo: 0.01, hi: 5 }).why === 'ok');
check('قیمت زیر کف نظری، کد خودش را دارد',
  impliedVolWhy('call', 50, 2100, 2000, T248, 0.3, 0, { lo: 0.01, hi: 5 }).why === 'belowFloor');
const ceil248 = bsPrice('call', 2100, 2000, T248, 0.3, 0, 5);
check('قیمت بالاتر از دامنهٔ تلاطم، کد جدا دارد',
  impliedVolWhy('call', ceil248 * 1.2, 2100, 2000, T248, 0.3, 0, { lo: 0.01, hi: 5 }).why === 'aboveBand');
check('ورودی ناقص با «حل نشد» قاطی نمی‌شود',
  impliedVolWhy('call', 0, 2100, 2000, T248, 0.3, 0, {}).why === 'input');
check('هر کد یک جملهٔ فارسی دارد',
  ['ok', 'noPrice', 'noSpot', 'noDays', 'input', 'belowFloor', 'aboveBand', 'unstable']
    .every((key) => key in IV_WHY_LABEL));

// ————— ۴. تلاطم مشاهده‌ای در برابر تلاطم اجرایی —————
const S248 = { dayCountYear: 365, rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5 };
// نمونهٔ واقعی ممیزی: ضهرم۶۰۵۰ — پایه ۷۲٬۵۷۲، اعمال ۶۸٬۰۰۰، پریمیوم ۴٬۶۳۱.
const audited248 = { kind: 'call', strike: 68000, days: 30, last: 4631, close: 4631, bid: 5200, ask: 5400 };
const set248 = liveQuoteIvSet(audited248, 72572, S248);
check('نمونهٔ ممیزی همچنان حل نمی‌شود، ولی حالا علتش را می‌گوید',
  Number.isNaN(set248.ivPct) && set248.ivWhy === 'belowFloor');
check('بدون قیمت، «بدون معامله و مظنه» گزارش می‌شود نه «حل نشد»',
  liveIvAt({ kind: 'call', strike: 2000, days: 30 }, 2100, S248, NaN).why === 'noPrice');
check('بدون قیمت پایه، علتِ جدا دارد',
  liveIvAt({ kind: 'call', strike: 2000, days: 30 }, 0, S248, 180).why === 'noSpot');
// مظنه با قیمت پایه هم‌زمان است؛ وقتی قابل حل باشد، ستون اجرایی پر می‌شود
// حتی اگر ستون مشاهده‌ای خالی بماند.
const async248 = { kind: 'call', strike: 2000, days: 30, last: 40, close: 40, bid: 175, ask: 185 };
const pair248 = liveQuoteIvSet(async248, 2100, S248);
check('تلاطم اجرایی از مظنه ساخته می‌شود حتی وقتی آخرین معامله حل نمی‌شود',
  Number.isNaN(pair248.ivPct) && pair248.ivWhy === 'belowFloor' && Number.isFinite(pair248.ivMidPct));
check('تلاطم مظنهٔ خرید و فروش جدا می‌آیند و ترتیبشان درست است',
  Number.isFinite(pair248.ivBidPct) && Number.isFinite(pair248.ivAskPct)
  && pair248.ivBidPct < pair248.ivAskPct);

// ————— ۳ و ۴ و ۷ در سطح ستون —————
const rowA248 = { kind: 'call', strike: 68000, days: 30, last: 4631, spot: 72572, ivPct: NaN, ivWhy: 'belowFloor', ivMidPct: 20, oi: 10, volume: 0 };
const anA248 = contractAnalytics(rowA248, { rFree: 0.3, divYield: 0, yearDays: 365 });
check('ستون علت، جملهٔ فارسی همان کد را می‌دهد', anA248.ivWhyText === 'قیمت زیر کف نظری');
// خالی‌بودن ستون علت وقتی تلاطم هست یعنی «توضیحی لازم نیست»؛ وقتی تلاطم
// نیست و کدی هم نداریم یعنی «نمی‌دانیم». یک شکل دیده‌شدنشان، گمراه‌کننده بود.
check('ستون علت، «توضیحی لازم نیست» را از «نمی‌دانیم» جدا می‌کند',
  contractAnalytics({ ...rowA248, ivPct: 42, ivWhy: 'ok' }, {}).ivWhyText === ''
  && contractAnalytics({ ...rowA248, ivPct: NaN, ivWhy: undefined }, {}).ivWhyText === 'نامشخص');
check('دلتای مشاهده‌ای خالی می‌ماند ولی دلتای اجرایی از مظنه ساخته می‌شود',
  Number.isNaN(anA248.delta) && Number.isFinite(anA248.deltaMid) && anA248.deltaMid > 0.9);
// ═══ «آخرین قیمت» همیشه «قیمت امروز» نیست ═══
check('قراردادِ امروز بی‌معامله نشان‌دار می‌شود',
  anA248.pricedToday === false
  && contractAnalytics({ ...rowA248, volume: 7 }, {}).pricedToday === true);

// ————— ۹. فرضِ نرخ، نه بازار، ستون را خالی می‌کند —————
//
// ممیزی ردیف ۹: «یک نرخ سود سراسری برای تمام نمادها… می‌تواند کف نظری و
// دلتا را مخدوش کند.» اندازه‌گیری روی همان نمونه نشان داد این فرض **علت
// غالب** است، نه ناهم‌زمانی: با نرخ ۳۰٪ کف نظری ۶٬۲۲۸ است و قیمت ۴٬۶۳۱
// زیرش می‌افتد؛ با نرخ صفر کف ۴٬۵۷۲ می‌شود و همان قیمت بالای آن است.
// ستون «کف نظری» همین را دیدنی می‌کند تا انتخاب فرض، تصمیمِ آگاهانه باشد.
const floorHigh248 = contractAnalytics(rowA248, { rFree: 0.3, divYield: 0, yearDays: 365, ivLo: 0.01 });
const floorZero248 = contractAnalytics(rowA248, { rFree: 0, divYield: 0, yearDays: 365, ivLo: 0.01 });
check('کف نظری از نرخ بدون ریسک تنظیمات می‌آید و با آن جابه‌جا می‌شود',
  floorHigh248.theoreticalFloor > floorZero248.theoreticalFloor
  && near(floorZero248.theoreticalFloor, 72572 - 68000, 5));
check('فاصلهٔ قیمت از کف، با عوض‌شدن فرضِ نرخ علامت عوض می‌کند',
  floorHigh248.floorGap < 0 && floorZero248.floorGap > 0);
check('بدون سمت یا بدون روز، کف نظری ادعا نمی‌شود',
  Number.isNaN(contractAnalytics({ strike: 100, spot: 100, days: 30 }, {}).theoreticalFloor)
  && Number.isNaN(contractAnalytics({ kind: 'call', strike: 100, spot: 100, days: 0 }, {}).theoreticalFloor));

// ————— ۸. دو زمان، دو ادعا —————
const now248 = 1_700_000_000_000;
const fresh248 = dashboardClock({ snapshotAt: now248 - 5_000, at: now248, now: now248 });
const old248 = dashboardClock({ snapshotAt: now248 - 240_000, at: now248, now: now248 });
check('سن از زمان عکس حساب می‌شود، نه از زمان پاسخ',
  fresh248.ageSec === 5 && old248.ageSec === 240);
check('عکس چهاردقیقه‌ای کهنه اعلام می‌شود، حتی وقتی پاسخ همین الان رسیده',
  old248.stale === true && fresh248.stale === false);
check('بدون زمان عکس، هیچ سنی و هیچ تازگی‌ای ادعا نمی‌شود',
  dashboardClock({ snapshotAt: null, at: now248, now: now248 }).ageSec === null
  && dashboardClock({ snapshotAt: null, at: now248, now: now248 }).unknown === true
  && dashboardClock({ snapshotAt: null, at: now248, now: now248 }).stale === false);

// ————— ادعاهای متنِ منبع —————
const ov248 = readSrc('../ui/tabs/open-view.mjs');
const dash248 = readSrc('../ui/tabs/live-market-dashboard.mjs');
const lm248 = readSrc('../ui/tabs/live-market.mjs');
const server248 = readSrc('../server/server.mjs');

// ═══ ردیف ۲: هیچ درخواست تاریخی با ورود به نمای لحظه‌ای ═══
check('۲. دفتر تاریخی فقط یک بار و فقط در حالت تاریخی بار می‌شود',
  ov248.includes('async function ensureHistoryUniverse()')
  && ov248.includes('if (historyLoaded) return;')
  && /if \(isLive\(\)\) \{[\s\S]*?\} else await ensureHistoryUniverse\(\);/.test(ov248)
  // تنها راه رسیدن به دفتر بازه، همان دروازه است: اگر روزی جای دیگری
  // مستقیم صدا زده شود، این شمارش می‌گیردش.
  && (ov248.match(/loadUniverseForRange\(rangeUi\.range\)/g) || []).length === 1
  && /async function ensureHistoryUniverse\(\) \{[\s\S]*?loadUniverseForRange\(rangeUi\.range\)/.test(ov248));
check('۱. حالت لحظه‌ای فهرست نماد را از عکس زندهٔ داشبورد می‌گیرد',
  ov248.includes('function fillLiveBases(universe)') && ov248.includes('liveBaseList(liveUniverse || {})')
  && ov248.includes('liveOpenViewContracts(liveUniverse || {}, pick)')
  && ov248.includes('updateLive(payload)'));
check('۱. داشبورد عکس فعلی را همان لحظهٔ سوارکردن به نگاه باز می‌دهد',
  dash248.includes('openViewController?.updateLive?.(payload);'));
check('۵. سرور گردش پایه‌ها را پیش از ارسال روی عکس ادغام می‌کند',
  server248.includes('mergeUnderlyingTrades(decisionDashboardSnapshot(sourceRows, S), observed)'));
check('۶. واحد نمودار وسعت از صداکننده می‌آید، نه از خودِ تابع',
  lm248.includes("export function breadthDonut(host, summary, { unit = 'نماد' } = {})")
  && lm248.includes('${unit} معامله‌شده')
  && dash248.includes("breadthDonut(host, scopedBreadth(scoped), { unit: 'قرارداد' })")
  && dash248.includes("breadthBars(host, scopedBreadth(scoped), { unit: 'قرارداد' })"));
check('۸. نوار وضعیت هر دو زمان را می‌گوید و کهنگی را رنگ می‌کند',
  dash248.includes('dashboardClock({ snapshotAt: next.snapshotAt, at: next.at })')
  && dash248.includes("$('dd-status').className = clock.stale ? 'loss' : ''"));
check('۳ و ۴ و ۷ ستون خودشان را دارند',
  ['ivMidPct', 'ivBidPct', 'ivAskPct', 'ivWhyText', 'pricedToday', 'deltaMid', 'theoreticalFloor', 'floorGap']
    .every((key) => dash248.includes(`col('${key}'`)));
