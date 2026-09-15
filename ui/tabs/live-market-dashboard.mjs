// مجموعه داشبوردهای تصمیم‌گیری زنده بازار.
// نوار تب صفحه؛ هر حالت چند نمای تنبل دارد و انتخاب دامنه در همه مشترک است.

import { fmt, faDigits, faClock } from '/ui/fmt.mjs';
import { makeTable } from '/ui/table.mjs';
import { liveOptionTape, liveReferenceTape, marketBreadthSnapshot } from '/core/live-market.mjs';
import {
  dashboardScope, activeOptionsBoard, moneynessDistribution, BOARD_METRICS,
  strikeLadder, maxPain, termStructure,
  contractBreakeven, breakevenGap, breakevenGapPct, contractAnalytics,
} from '/core/decision-dashboard.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { breadthBars, breadthDonut, liveChart } from '/ui/tabs/live-market.mjs';
import { logError } from '/ui/errlog.mjs';
import { dashboardClock } from '/core/watch-health.mjs';
import { busyBlock, attachBusyBar } from '/ui/busy.mjs';
import { createOpenViewBaseSyncGate } from '/ui/open-view-selection.mjs';
import { mountLiveMarketMap } from '/ui/live-market-map.mjs';
import { SCOPE_LEVELS, resolveScope, needsTape } from '/ui/live-dashboard-scope.mjs';

// شش اسلات، و بدون چرخش. اسلات هفتم یعنی رنگی که با یکی از شش تای قبلی
// اشتباه گرفته می‌شود؛ سریِ هفتم باید در «بقیه» جمع شود، نه رنگ تازه بگیرد.
const SERIES = Array.from({ length: 6 }, (_, index) => `var(--series-${index + 1})`);
const esc = (value) => String(value ?? '').replace(/[&<>'\"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;',
}[char]));
const dateLabel = (value) => faDigits(historyDateLabel(value));
const kindLabel = (kind) => kind === 'call' ? 'اختیار خرید' : kind === 'put' ? 'اختیار فروش' : 'نماد پایه';
const tone = (value) => Number(value) > 0 ? 'gain' : Number(value) < 0 ? 'loss' : '';
const timeLabel = (value) => {
  const raw = String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(6, '0').slice(-6);
  return faDigits(`${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4)}`);
};

// ————— نماهای سه حالت تصمیم‌گیری —————
//
// بازبینی پس از سورت‌پذیر شدن جدول‌ها. تا وقتی جدول‌ها `innerHTML` خام
// بودند، «رهبران ارزش» و «رهبران حجم» دو نمای واقعاً متفاوت بودند. حالا که
// هر جدول روی هر ستون مرتب می‌شود و انتخابگر ستون دارد، آن دو **یک نما**
// هستند با دو مرتب‌سازی — و کاربر درست گفت که بعضی از این بیست‌تا اطلاعات
// مناسبی نمی‌دهند.
//
// پس هر جفتِ «جدول X / میله X» و هر «همان جدول، مرتب بر ستون دیگر» حذف شد
// و جایش سنجه‌هایی نشست که از **ساختار** زنجیره درمی‌آیند نه از رتبه‌بندی
// یک ستون: نردبان اعمال، بیشترین درد، ساختار زمانی تلاطم، چولگی، و توزیع.
//
// ── دور دوم، ۱۴۰۵/۰۶/۲۳ ──────────────────────────────────────────────
//
// گزارش صاحب پروژه: «برخی از این ۲۰ تا کاربردی نیستن از نگاه یک معامله‌گر.»
// درست بود — دور اول جفت‌ها را برداشت ولی **میله‌های رتبه‌ای** ماندند، و
// آن‌ها دقیقاً همان چیزی‌اند که یک کلیک روی سرستون جدول می‌دهد:
// «رهبران ارزش/حجم/موقعیت باز/تغییر»، «بیشترین رشد/افت»، «تمرکز ارزش و
// موقعیت باز روی سررسیدها» و «رهبران تلاطم» — هشت نما که هیچ‌کدام چیزی
// اضافه بر مرتب‌سازی نمی‌گفتند.
//
// کنارشان سه دستهٔ دیگر رفتند: نمودارهای **دوستونی** (ارزش/حجم/IV کال در
// برابر پوت) که دو عدد را به نموداری تبدیل می‌کردند که جدول گروه کاملش را
// دارد؛ جدول‌هایی که همان جدول با یک فیلتر بودند (تلاطم کال، تلاطم پوت)؛
// و دو تکراری آشکار — «لبخند تلاطم» تابلو که عیناً نمای تب تلاطم است، و
// «خالص وسعت» که همان روند درصد مثبت و منفی است با مقیاس دیگر.
//
// ۶۸ نما شد ۵۰. هیچ سؤالی بی‌جواب نماند؛ فقط هر سؤال یک جواب دارد.
//
// ستون چهارم (`kind`) شکل نما را می‌گوید و پنجمی، منبع ردیف.
const pulseViews = [
  ['breadth-donut', 'دایره جهت بازار', 'donut', 'contracts', 'changePct'],
  ['breadth-bars', 'میله قدرت جهت‌ها', 'breadth', 'contracts', 'changePct'],
  ['breadth-pct', 'روند درصد مثبت و منفی', 'timeline', 'timeline', 'positivePct'],
  ['base-volume-path', 'حجم تجمعی پایه‌ها', 'timeline', 'timeline', 'cumulativeVolume'],
  ['base-change-table', 'تغییر همه پایه‌ها', 'table', 'underlyings', 'changePct'],
  ['contract-change-table', 'تغییر همه قراردادها', 'table', 'contracts', 'changePct'],
  ['direction-table', 'جدول جهت‌ها', 'table', 'directions', 'value'],
  ['calls-change', 'جهت اختیار خرید', 'table', 'calls', 'changePct'],
  ['puts-change', 'جهت اختیار فروش', 'table', 'puts', 'changePct'],
  ['expiry-change', 'جهت سررسیدها', 'table', 'expiries', 'changePct'],
  ['unchanged', 'نمادهای بدون تغییر', 'table-zero', 'contracts', 'changePct'],
  ['change-distribution', 'توزیع تغییر قیمت', 'histogram-change', 'contracts', 'changePct'],
  ['change-vs-volume', 'تغییر در برابر حجم', 'scatter-xy', 'contracts', 'changePct'],
  ['sides-direction', 'جهت کال در برابر پوت', 'bar', 'sides', 'changePct'],
  ['pulse-tape', 'ریزمعامله قرارداد', 'tape', 'contracts', 'value'],
];

const liquidityViews = [
  ['contract-value-table', 'تابلوی قراردادها', 'table', 'contracts', 'value'],
  ['base-value-table', 'تابلوی نمادهای پایه', 'table', 'underlyings', 'value'],
  ['expiry-value-table', 'تابلوی سررسیدها', 'table', 'expiries', 'value'],
  ['high-value-expiry', 'رهبر ارزش هر سررسید', 'expiry-leaders', 'contracts', 'value'],
  ['call-put-table', 'کال در برابر پوت', 'table', 'sides', 'value'],
  ['strike-ladder', 'نردبان موقعیت باز روی اعمال', 'ladder-oi', 'contracts', 'oi'],
  ['strike-ladder-volume', 'نردبان حجم روی اعمال', 'ladder-volume', 'contracts', 'volume'],
  ['max-pain', 'بیشترین درد هر سررسید', 'max-pain', 'contracts', 'oi'],
  ['max-pain-curve', 'منحنی درد سررسید انتخابی', 'pain-curve', 'contracts', 'oi'],
  ['liquidity-heatmap', 'گرمانمای سررسید × فاصله اعمال', 'heatmap-value', 'contracts', 'value'],
  ['spread-table', 'فاصله مظنه دوطرفه', 'table-asc', 'contracts', 'spreadPct'],
  ['value-distribution', 'توزیع ارزش روی فاصله اعمال', 'histogram-money', 'contracts', 'value'],
  ['liquidity-tape', 'مسیر ارزش قرارداد', 'tape', 'contracts', 'value'],
];

const volatilityViews = [
  ['iv-table', 'تابلوی تلاطم قراردادها', 'table', 'contracts', 'ivPct'],
  ['iv-expiry-table', 'تلاطم به تفکیک سررسید', 'table', 'expiries', 'ivPct'],
  ['iv-strike-table', 'تلاطم به تفکیک اعمال', 'table', 'strikes', 'ivPct'],
  ['iv-smile', 'لبخند تلاطم روی فاصله اعمال', 'iv-smile', 'contracts', 'ivPct'],
  ['iv-term', 'ساختار زمانی تلاطم', 'term-structure', 'contracts', 'ivPct'],
  ['iv-skew', 'چولگی پوت منهای کال هر سررسید', 'term-skew', 'contracts', 'ivPct'],
  ['iv-heatmap', 'گرمانمای سررسید × فاصله اعمال', 'heatmap-iv', 'contracts', 'ivPct'],
  ['iv-distribution', 'توزیع تلاطم', 'histogram-iv', 'contracts', 'ivPct'],
  ['iv-vs-value', 'تلاطم در برابر ارزش معامله', 'scatter-iv-value', 'contracts', 'ivPct'],
  ['iv-vs-spread', 'تلاطم در برابر فاصله مظنه', 'scatter-iv-spread', 'contracts', 'ivPct'],
  ['pc-oi-expiry', 'نسبت موقعیت باز پوت به کال', 'bar', 'expiries', 'putCallOi'],
  ['pc-volume-expiry', 'نسبت حجم پوت به کال', 'bar', 'expiries', 'putCallVolume'],
  ['pc-strike-ladder', 'نسبت پوت به کال روی هر اعمال', 'ladder-pc', 'contracts', 'oi'],
  ['oi-change-table', 'تغییر موقعیت باز قراردادها', 'table', 'contracts', 'oiChange'],
  ['iv-tape', 'IV ریزمعامله قرارداد', 'tape', 'contracts', 'ivPct'],
  ['open-view-history', 'نگاه باز چندروزه', 'open-view', 'contracts', 'ivPct'],
];

// ————— تابلوی اختیارهای پرمعامله —————
//
// خواسته کاربر: بخشی از داشبورد که اختیارهای پرمعامله را بدهد، با سنجه
// انتخابی کاربر، و برای هر سررسید میانگین وزنی سربه‌سر و فاصله‌اش از قیمت
// جاری — با تفکیک کال، پوت و هر دو.
//
// این حالت نماهای خودش را دارد و شبیه سه حالت دیگر نیست: آن‌ها سنجه‌های
// خام بازار را رتبه می‌کنند، این یکی یک زنجیره قرارداد را می‌خواند.
const BOARD_METRIC_LABELS = [
  ['value', 'ارزش معامله'], ['volume', 'حجم'], ['trades', 'تعداد معامله'], ['oi', 'موقعیت باز'],
];
const BOARD_SIDES = [['both', 'هر دو'], ['call', 'اختیار خرید'], ['put', 'اختیار فروش']];

const boardViews = [
  ['board-table', 'تابلوی پرمعامله', 'board-rows'],
  ['board-expiry-table', 'سربه‌سر وزنی هر سررسید', 'board-expiries'],
  ['board-expiry-gap', 'فاصله سربه‌سر از قیمت جاری', 'board-gap'],
  ['board-band', 'باند سربه‌سر پوت تا کال', 'board-band'],
  ['board-moneyness', 'توزیع روی فاصله از قیمت جاری', 'board-moneyness'],
  ['board-scatter', 'اعمال در برابر سربه‌سر', 'board-scatter'],
];

// دو تب پایه که در همین تب ادغام شدند.
//
// «دیده‌بان زنجیره» و «برترین موقعیت‌ها» هر دو از همان عکس لحظه‌ای بازار
// تغذیه می‌شوند که این تب می‌سازد و هر دو یک کار می‌کنند: نگاه کلی به بازار
// پیش از تصمیم. سه تب جدا برای یک کار، یعنی کاربر باید بین سه نشانی
// جابه‌جا شود تا یک تصمیم بگیرد.
//
// ماژولشان دست‌نخورده می‌ماند و همان‌جا که هست تنبل بار می‌شود — همان
// الگویی که «نگاه باز» از قبل داشت. ادغام یعنی یک در ورودی، نه بازنویسی
// دو تب کارکرده.
const EMBEDDED_MODES = [
  { id: 'chain', title: 'دیده‌بان زنجیره', hint: 'یک درخواست، کل بازار اختیار', mod: '/ui/tabs/chain.mjs' },
  { id: 'top', title: 'برترین موقعیت‌ها', hint: 'غربال روی کل کاتالوگ استراتژی', mod: '/ui/tabs/top.mjs' },
];

// ————— تب‌بندی صفحه —————
//
// خواسته صاحب پروژه: «صفحه را تب‌بندی کن» و «تمام قسمت‌های این بخش را
// یکپارچه کن». پیش از این صفحه سه لایه ناوبری داشت: نقشه بالای صفحه، یک
// `<details>` به نام «تحلیل‌های تکمیلی» که باید باز می‌شد، و داخلش یک ریل
// عمودی با شش حالت. سه لایه برای یک انتخاب.
//
// حالا هر شش حالت و خودِ نقشه، **هم‌ردیف** در یک نوار تب‌اند. نقشه تب نخست
// است چون مسیر اصلی تصمیم از آنجا شروع می‌شود و انتخابش، دامنهٔ همه تب‌های
// دیگر را هم می‌سازد.
export const DASHBOARD_MODES = [
  { id: 'explorer', title: 'نقشه و زنجیره', hint: 'نقشه بازار، سررسید، کندل روزانه و زنجیره', views: [], explorer: true },
  { id: 'pulse', title: 'نبض و جهت بازار', hint: 'وسعت، روند و تغییر نسبت به دیروز', views: pulseViews },
  { id: 'liquidity', title: 'نقدینگی و سررسید', hint: 'ارزش، حجم، موقعیت باز و تمرکز', views: liquidityViews },
  { id: 'volatility', title: 'تلاطم و انتظارات', hint: 'IV لحظه‌ای و تحلیل نگاه باز', views: volatilityViews },
  { id: 'board', title: 'اختیارهای پرمعامله', hint: 'سربه‌سر وزنی هر سررسید و فاصله از قیمت جاری', views: boardViews, board: true },
  ...EMBEDDED_MODES.map((mode) => ({ ...mode, views: [] })),
];

const METRICS = {
  changePct: ['تغییر آخرین نسبت به پایانی دیروز ٪', (value) => `${fmt.pct(value)}٪`],
  value: ['ارزش معامله', fmt.money], volume: ['حجم', fmt.int], trades: ['تعداد معامله', fmt.int],
  oi: ['موقعیت باز', fmt.int], oiChange: ['تغییر موقعیت باز', fmt.int],
  oiChangePct: ['تغییر موقعیت باز ٪', (value) => `${fmt.pct(value)}٪`],
  ivPct: ['تلاطم ضمنی ٪', (value) => `${fmt.pct(value)}٪`],
  spreadPct: ['فاصله مظنه ٪', (value) => `${fmt.pct(value)}٪`],
  putCallOi: ['نسبت OI پوت به کال', fmt.num], putCallVolume: ['نسبت حجم پوت به کال', fmt.num],
  breakevenGapPct: ['فاصله تا سربه‌سر ٪', (value) => `${fmt.pct(value)}٪`],
  bandPct: ['باند سربه‌سر ٪ قیمت جاری', (value) => `${fmt.pct(value)}٪`],
};

// ————— ستون‌ها، به‌ازای هر سطح —————
//
// خواسته کاربر: «اطلاعاتی که از کل نماد می‌گیریم با اطلاعاتی که از سررسید
// یا یک قرارداد می‌گیریم متفاوت است.» جدول قبلی یک قالب دوازده‌ستونه برای
// همه بود، پس ردیف نماد پایه ستون «سررسید» می‌گرفت که همیشه «—» بود، و
// ردیف سررسید ستون «آخرین» می‌گرفت که برای یک گروه معنی ندارد.
//
// `base: true` یعنی در نمای آماده هست؛ بقیه از انتخابگر ستون اضافه می‌شوند.
const col = (key, label, fmtName, opt = {}) => ({ key, label, fmt: fmtName, ...opt });

const COLS_CONTRACT = [
  col('title', 'قرارداد', 'sym', { group: 'شناسه', base: true }),
  col('uaName', 'نماد پایه', 'text', { group: 'شناسه', base: true }),
  col('kindLabel', 'نوع', 'text', { group: 'شناسه', base: true }),
  col('strike', 'قیمت اعمال', 'money', { group: 'شناسه', base: true }),
  col('expiryText', 'سررسید', 'text', { group: 'شناسه', base: true }),
  col('days', 'روز مانده', 'int', { group: 'شناسه' }),
  col('spot', 'قیمت جاری پایه', 'money', { group: 'قیمت' }),
  col('last', 'آخرین', 'money', { group: 'قیمت', base: true }),
  col('close', 'پایانی', 'money', { group: 'قیمت' }),
  col('yday', 'پایانی دیروز', 'money', { group: 'قیمت' }),
  col('changePct', 'تغییر نسبت به پایانی دیروز ٪', 'pct', { group: 'قیمت', base: true, heat: 'gain', sign: true }),
  col('premiumPctSpot', 'پریمیوم ٪ قیمت پایه', 'pct', { group: 'قیمت' }),
  col('moneynessPct', 'فاصله اعمال از پایه ٪', 'pct', { group: 'قیمت', sign: true }),
  // ── سربه‌سر، در خودِ زنجیره ──────────────────────────────────────────
  //
  // تا امروز سربه‌سر فقط در تابلوی «اختیارهای پرمعامله» بود، یعنی کاربر
  // برای عددی که پیش از هر خرید لازم دارد باید از زنجیره بیرون می‌رفت.
  // هر دو از `breakevenGap*` در `core/decision-dashboard.mjs` می‌آیند تا
  // زنجیره و تابلو دو عدد متفاوت نگویند.
  col('breakeven', 'سربه‌سر', 'money', { group: 'سربه‌سر', base: true }),
  col('breakevenGap', 'فاصله تا سربه‌سر', 'money', { group: 'سربه‌سر', sign: true }),
  col('breakevenGapPct', 'فاصله تا سربه‌سر ٪', 'pct', { group: 'سربه‌سر', base: true, heat: 'loss', sign: true }),
  col('intrinsic', 'ارزش ذاتی هر سهم', 'money', { group: 'قیمت' }),
  col('intrinsicPctSpot', 'ارزش ذاتی ٪ قیمت پایه', 'pct', { group: 'قیمت' }),
  col('timeValue', 'ارزش زمانی هر سهم', 'money', { group: 'قیمت' }),
  col('timeValuePctSpot', 'ارزش زمانی ٪ قیمت پایه', 'pct', { group: 'قیمت' }),
  col('bid', 'تقاضا', 'money', { group: 'مظنه' }),
  col('bidQty', 'حجم تقاضا', 'int', { group: 'مظنه' }),
  col('ask', 'عرضه', 'money', { group: 'مظنه' }),
  col('askQty', 'حجم عرضه', 'int', { group: 'مظنه' }),
  col('mid', 'میانه مظنه', 'money', { group: 'مظنه' }),
  col('spreadPct', 'فاصله مظنه ٪', 'pct', { group: 'مظنه', base: true, heat: 'loss' }),
  col('volume', 'حجم', 'int', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('value', 'ارزش معامله', 'money', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('trades', 'تعداد معامله', 'int', { group: 'گردش امروز' }),
  col('oi', 'موقعیت باز', 'int', { group: 'تعهد انباشته', base: true }),
  col('oiYday', 'موقعیت باز دیروز', 'int', { group: 'تعهد انباشته' }),
  col('oiChange', 'تغییر موقعیت باز', 'int', { group: 'تعهد انباشته', base: true, heat: 'gain', sign: true }),
  col('oiChangePct', 'تغییر موقعیت باز ٪', 'pct', { group: 'تعهد انباشته', heat: 'gain', sign: true }),
  col('ivPct', 'تلاطم ضمنی ٪ — آخرین معامله', 'pct', { group: 'تلاطم', base: true }),
  // ── تلاطم مشاهده‌ای و تلاطم اجرایی، کنار هم ─────────────────────────
  //
  // ممیزی ۱۴۰۵/۰۶/۲۴: تلاطم از آخرین معامله ساخته می‌شد و آن معامله
  // لزوماً هم‌زمان با قیمت پایه نیست. مظنه این مشکل را ندارد — دفتر سفارش
  // همین حالاست. هیچ‌کدام جای دیگری را پر نمی‌کند؛ هر دو ستون خودشان را
  // دارند و فاصله‌شان خودش خبر است.
  col('ivMidPct', 'تلاطم اجرایی ٪ — میانه مظنه', 'pct', { group: 'تلاطم', base: true }),
  col('ivBidPct', 'تلاطم مظنه خرید ٪', 'pct', { group: 'تلاطم' }),
  col('ivAskPct', 'تلاطم مظنه فروش ٪', 'pct', { group: 'تلاطم' }),
  col('ivWhyText', 'علت نبود تلاطم', 'text', { group: 'تلاطم', base: true }),
  // ممیزی ردیف ۶: علتِ شکستِ تلاطمِ **اجرایی** در هسته ساخته می‌شد و هیچ
  // ستونی نداشت. پس ردیفی که دلتای اجرایی‌اش خالی بود، بی‌توضیح می‌ماند —
  // در حالی که تفاوتِ «مظنه یک‌طرفه است» با «قیمت زیر کف نظری» دقیقاً همان
  // چیزی است که تصمیم می‌سازد.
  col('ivMidWhyText', 'علت نبود تلاطم اجرایی', 'text', { group: 'تلاطم' }),
  col('theoreticalFloor', 'کف نظری قیمت', 'money', { group: 'تلاطم' }),
  col('floorGap', 'فاصله قیمت از کف نظری', 'money', { group: 'تلاطم', sign: true }),
  col('pricedToday', 'قیمت از معامله امروز', 'bool', { group: 'تلاطم' }),
  col('turnoverRatio', 'گردش به موقعیت باز', 'num', { group: 'گردش امروز' }),
  // ── چهار دستهٔ تازه ───────────────────────────────────────────────
  //
  // خواستهٔ صاحب پروژه: «همه چیز در تمامی موضوعات؛ چیزی جا نمونه.» تابلو
  // ارزش و حجم و موقعیت باز را خودش می‌دهد؛ این‌ها همان چیزهایی‌اند که
  // معامله‌گر اختیار **پیش از زدن دکمه** روی کاغذ حساب می‌کند.
  //
  // یونانی‌ها از همان `ivPct` ستون بالا ساخته می‌شوند، نه از حلِ دوباره؛
  // پس ستون تلاطم و ستون دلتا همیشه با هم می‌خوانند.
  col('delta', 'دلتا — از آخرین معامله', 'num', { group: 'یونانی', base: true, sign: true }),
  col('deltaMid', 'دلتای اجرایی — از میانه مظنه', 'num', { group: 'یونانی', base: true, sign: true }),
  col('gamma', 'گاما', 'small', { group: 'یونانی' }),
  col('theta', 'تتا (ریال در روز)', 'num', { group: 'یونانی', sign: true }),
  col('vega', 'وگا (هر ۱٪ تلاطم)', 'num', { group: 'یونانی' }),
  col('rho', 'رو (هر ۱٪ نرخ)', 'num', { group: 'یونانی' }),
  col('probItmPct', 'احتمال در سود در سررسید ٪', 'pct', { group: 'یونانی', heat: 'gain' }),
  // ── نیمهٔ اجراییِ همان پنج ستون ────────────────────────────────────
  //
  // ممیزی ردیف ۴: «از IV میانهٔ مظنه تمام یونانی‌ها محاسبه می‌شوند؛ اما در
  // خروجی فقط `deltaMid` نگه داشته می‌شود.» پس ردیفی که دلتای اجرایی داشت،
  // گاما و تتا و وگایش خالی بود — داده بود و دور ریخته می‌شد. حالا هر پنج
  // ستون جفتِ خودش را دارد و مقایسهٔ «مشاهده‌ای در برابر اجرایی» کامل است.
  col('gammaMid', 'گامای اجرایی', 'small', { group: 'یونانی' }),
  col('thetaMid', 'تتای اجرایی (ریال در روز)', 'num', { group: 'یونانی', sign: true }),
  col('vegaMid', 'وگای اجرایی (هر ۱٪ تلاطم)', 'num', { group: 'یونانی' }),
  col('rhoMid', 'روی اجرایی (هر ۱٪ نرخ)', 'num', { group: 'یونانی' }),
  col('probItmMidPct', 'احتمال در سود اجرایی ٪', 'pct', { group: 'یونانی', heat: 'gain' }),
  col('leverage', 'اهرم ساده', 'num', { group: 'اهرم و فرسایش' }),
  col('effectiveLeverage', 'اهرم مؤثر (دلتا × اهرم)', 'num', { group: 'اهرم و فرسایش', base: true }),
  col('effectiveLeverageMid', 'اهرم مؤثر اجرایی', 'num', { group: 'اهرم و فرسایش' }),
  col('timeValuePerDay', 'فرسایش روزانه ریال', 'money', { group: 'اهرم و فرسایش' }),
  col('timeDecayPctPerDay', 'فرسایش روزانه ٪ پریمیوم', 'pct', { group: 'اهرم و فرسایش', heat: 'loss' }),
  col('timeValueAnnualPct', 'ارزش زمانی سالانه ٪ پایه', 'pct', { group: 'اهرم و فرسایش' }),
  col('staticReturnPct', 'بازده اگر پایه تکان نخورد ٪', 'pct', { group: 'بازده', base: true, heat: 'gain', sign: true }),
  col('premiumPctStrike', 'پریمیوم ٪ قیمت اعمال', 'pct', { group: 'بازده' }),
];

const COLS_UNDERLYING = [
  col('title', 'نماد پایه', 'text', { group: 'شناسه', base: true }),
  col('last', 'آخرین', 'money', { group: 'قیمت پایه', base: true }),
  col('close', 'پایانی', 'money', { group: 'قیمت پایه' }),
  col('yday', 'پایانی دیروز', 'money', { group: 'قیمت پایه' }),
  col('changePct', 'تغییر نسبت به پایانی دیروز ٪', 'pct', { group: 'قیمت پایه', base: true, heat: 'gain', sign: true }),
  col('contracts', 'قرارداد', 'int', { group: 'اندازه تابلو', base: true }),
  col('strikes', 'قیمت اعمال', 'int', { group: 'اندازه تابلو' }),
  col('expiries', 'سررسید', 'int', { group: 'اندازه تابلو', base: true }),
  col('nearestDays', 'نزدیک‌ترین سررسید', 'int', { group: 'اندازه تابلو' }),
  col('farDays', 'دورترین سررسید', 'int', { group: 'اندازه تابلو' }),
  col('quoted', 'دارای مظنه', 'int', { group: 'نقدشوندگی' }),
  col('quotedPct', 'دارای مظنه ٪', 'pct', { group: 'نقدشوندگی', heat: 'gain' }),
  col('twoSided', 'مظنه دوطرفه', 'int', { group: 'نقدشوندگی' }),
  col('twoSidedPct', 'مظنه دوطرفه ٪', 'pct', { group: 'نقدشوندگی', heat: 'gain' }),
  col('spreadMedPct', 'میانه فاصله مظنه ٪', 'pct', { group: 'نقدشوندگی', heat: 'loss' }),
  col('volume', 'حجم اختیار', 'int', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('callVol', 'حجم کال', 'int', { group: 'گردش امروز' }),
  col('callVolumePct', 'سهم کال از حجم ٪', 'pct', { group: 'گردش امروز' }),
  col('putVol', 'حجم پوت', 'int', { group: 'گردش امروز' }),
  col('putVolumePct', 'سهم پوت از حجم ٪', 'pct', { group: 'گردش امروز' }),
  col('value', 'ارزش معاملات اختیار', 'money', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('callValue', 'ارزش کال', 'money', { group: 'گردش امروز' }),
  col('callValuePct', 'سهم کال از ارزش ٪', 'pct', { group: 'گردش امروز' }),
  col('putValue', 'ارزش پوت', 'money', { group: 'گردش امروز' }),
  col('putValuePct', 'سهم پوت از ارزش ٪', 'pct', { group: 'گردش امروز' }),
  col('uaValue', 'ارزش معاملات نماد پایه', 'money', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('uaVolume', 'حجم نماد پایه', 'int', { group: 'گردش امروز' }),
  col('uaTrades', 'تعداد معامله نماد پایه', 'int', { group: 'گردش امروز' }),
  col('trades', 'تعداد معامله', 'int', { group: 'گردش امروز' }),
  col('callTrades', 'تعداد معامله کال', 'int', { group: 'گردش امروز' }),
  col('putTrades', 'تعداد معامله پوت', 'int', { group: 'گردش امروز' }),
  col('oi', 'موقعیت باز', 'int', { group: 'تعهد انباشته', base: true }),
  col('oiYday', 'موقعیت باز دیروز', 'int', { group: 'تعهد انباشته' }),
  col('oiChange', 'تغییر موقعیت باز', 'int', { group: 'تعهد انباشته', base: true, heat: 'gain', sign: true }),
  col('oiChangePct', 'تغییر موقعیت باز ٪', 'pct', { group: 'تعهد انباشته' }),
  col('callOi', 'موقعیت باز کال', 'int', { group: 'تعهد انباشته' }),
  col('callOiPct', 'سهم کال از موقعیت باز ٪', 'pct', { group: 'تعهد انباشته' }),
  col('callOiYday', 'موقعیت باز کال دیروز', 'int', { group: 'تعهد انباشته' }),
  col('callOiChange', 'تغییر موقعیت باز کال', 'int', { group: 'تعهد انباشته' }),
  col('putOi', 'موقعیت باز پوت', 'int', { group: 'تعهد انباشته' }),
  col('putOiPct', 'سهم پوت از موقعیت باز ٪', 'pct', { group: 'تعهد انباشته' }),
  col('putOiYday', 'موقعیت باز پوت دیروز', 'int', { group: 'تعهد انباشته' }),
  col('putOiChange', 'تغییر موقعیت باز پوت', 'int', { group: 'تعهد انباشته' }),
  col('pcRatio', 'نسبت پوت به کال — موقعیت باز', 'num', { group: 'تعهد انباشته', base: true }),
  col('pcVolRatio', 'نسبت پوت به کال — حجم', 'num', { group: 'تعهد انباشته' }),
  col('atmIvPct', 'تلاطم ضمنی ٪ — نزدیک‌ترین پول', 'pct', { group: 'تلاطم', base: true }),
];

const COLS_EXPIRY = [
  col('title', 'سررسید', 'text', { group: 'شناسه', base: true }),
  col('uaName', 'نماد پایه', 'text', { group: 'شناسه', base: true }),
  col('days', 'روز مانده', 'int', { group: 'شناسه', base: true }),
  col('contracts', 'قرارداد', 'int', { group: 'اندازه', base: true }),
  col('tradedContracts', 'قرارداد معامله‌شده', 'int', { group: 'اندازه', base: true }),
  col('tradedPct', 'قرارداد معامله‌شده ٪', 'pct', { group: 'اندازه' }),
  col('positive', 'مثبت', 'int', { group: 'جهت' }),
  col('positivePct', 'مثبت ٪', 'pct', { group: 'جهت', heat: 'gain' }),
  col('negative', 'منفی', 'int', { group: 'جهت' }),
  col('negativePct', 'منفی ٪', 'pct', { group: 'جهت', heat: 'loss' }),
  col('unchanged', 'بدون تغییر', 'int', { group: 'جهت' }),
  col('unchangedPct', 'بدون تغییر ٪', 'pct', { group: 'جهت' }),
  col('changePct', 'تغییر وزنی ٪', 'pct', { group: 'جهت', base: true, heat: 'gain', sign: true }),
  col('volume', 'حجم', 'int', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('callVolume', 'حجم کال', 'int', { group: 'گردش امروز' }),
  col('callVolumePct', 'سهم کال از حجم ٪', 'pct', { group: 'گردش امروز' }),
  col('putVolume', 'حجم پوت', 'int', { group: 'گردش امروز' }),
  col('putVolumePct', 'سهم پوت از حجم ٪', 'pct', { group: 'گردش امروز' }),
  col('value', 'ارزش معامله', 'money', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('callValue', 'ارزش کال', 'money', { group: 'گردش امروز', base: true }),
  col('putValue', 'ارزش پوت', 'money', { group: 'گردش امروز', base: true }),
  col('callValuePct', 'سهم کال از ارزش ٪', 'pct', { group: 'گردش امروز' }),
  col('putValuePct', 'سهم پوت از ارزش ٪', 'pct', { group: 'گردش امروز' }),
  col('trades', 'تعداد معامله', 'int', { group: 'گردش امروز' }),
  col('callTrades', 'تعداد معامله کال', 'int', { group: 'گردش امروز' }),
  col('putTrades', 'تعداد معامله پوت', 'int', { group: 'گردش امروز' }),
  col('oi', 'موقعیت باز', 'int', { group: 'تعهد انباشته', base: true }),
  col('oiYday', 'موقعیت باز دیروز', 'int', { group: 'تعهد انباشته' }),
  col('oiChange', 'تغییر موقعیت باز', 'int', { group: 'تعهد انباشته', base: true, heat: 'gain', sign: true }),
  col('oiChangePct', 'تغییر موقعیت باز ٪', 'pct', { group: 'تعهد انباشته', heat: 'gain' }),
  col('callOi', 'موقعیت باز کال', 'int', { group: 'تعهد انباشته' }),
  col('callOiPct', 'سهم کال از موقعیت باز ٪', 'pct', { group: 'تعهد انباشته' }),
  col('putOi', 'موقعیت باز پوت', 'int', { group: 'تعهد انباشته' }),
  col('putOiPct', 'سهم پوت از موقعیت باز ٪', 'pct', { group: 'تعهد انباشته' }),
  col('putCallOi', 'نسبت OI پوت به کال', 'num', { group: 'تعهد انباشته', base: true }),
  col('putCallVolume', 'نسبت حجم پوت به کال', 'num', { group: 'تعهد انباشته' }),
  col('ivPct', 'تلاطم ضمنی وزنی ٪', 'pct', { group: 'تلاطم', base: true }),
  col('twoSided', 'مظنه دوطرفه', 'int', { group: 'نقدشوندگی' }),
  col('twoSidedPct', 'مظنه دوطرفه ٪', 'pct', { group: 'نقدشوندگی' }),
  col('spreadPct', 'میانه فاصله مظنه ٪', 'pct', { group: 'نقدشوندگی', heat: 'loss' }),
];

// گروه‌های ساختگی (کال/پوت، قیمت اعمال، جهت) نه قیمت دارند نه سررسید.
const COLS_GROUP = [
  col('title', 'گروه', 'text', { group: 'شناسه', base: true }),
  col('contractCount', 'قرارداد', 'int', { group: 'اندازه', base: true }),
  col('tradedContracts', 'قرارداد معامله‌شده', 'int', { group: 'اندازه' }),
  col('tradedPct', 'قرارداد معامله‌شده ٪', 'pct', { group: 'اندازه' }),
  col('changePct', 'تغییر وزنی ٪', 'pct', { group: 'جهت', base: true, heat: 'gain', sign: true }),
  col('positive', 'مثبت', 'int', { group: 'جهت' }),
  col('positivePct', 'مثبت ٪', 'pct', { group: 'جهت', heat: 'gain' }),
  col('negative', 'منفی', 'int', { group: 'جهت' }),
  col('negativePct', 'منفی ٪', 'pct', { group: 'جهت', heat: 'loss' }),
  col('unchanged', 'بدون تغییر', 'int', { group: 'جهت' }),
  col('unchangedPct', 'بدون تغییر ٪', 'pct', { group: 'جهت' }),
  col('volume', 'حجم', 'int', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('callVolume', 'حجم کال', 'int', { group: 'گردش امروز' }),
  col('callVolumePct', 'سهم کال از حجم ٪', 'pct', { group: 'گردش امروز' }),
  col('putVolume', 'حجم پوت', 'int', { group: 'گردش امروز' }),
  col('putVolumePct', 'سهم پوت از حجم ٪', 'pct', { group: 'گردش امروز' }),
  col('value', 'ارزش معامله', 'money', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('callValue', 'ارزش کال', 'money', { group: 'گردش امروز' }),
  col('callValuePct', 'سهم کال از ارزش ٪', 'pct', { group: 'گردش امروز' }),
  col('putValue', 'ارزش پوت', 'money', { group: 'گردش امروز' }),
  col('putValuePct', 'سهم پوت از ارزش ٪', 'pct', { group: 'گردش امروز' }),
  col('trades', 'تعداد معامله', 'int', { group: 'گردش امروز', base: true }),
  col('callTrades', 'تعداد معامله کال', 'int', { group: 'گردش امروز' }),
  col('putTrades', 'تعداد معامله پوت', 'int', { group: 'گردش امروز' }),
  col('oi', 'موقعیت باز', 'int', { group: 'تعهد انباشته', base: true }),
  col('oiYday', 'موقعیت باز دیروز', 'int', { group: 'تعهد انباشته' }),
  col('oiChange', 'تغییر موقعیت باز', 'int', { group: 'تعهد انباشته', base: true, heat: 'gain', sign: true }),
  col('oiChangePct', 'تغییر موقعیت باز ٪', 'pct', { group: 'تعهد انباشته', heat: 'gain' }),
  col('callOi', 'موقعیت باز کال', 'int', { group: 'تعهد انباشته' }),
  col('callOiPct', 'سهم کال از موقعیت باز ٪', 'pct', { group: 'تعهد انباشته' }),
  col('putOi', 'موقعیت باز پوت', 'int', { group: 'تعهد انباشته' }),
  col('putOiPct', 'سهم پوت از موقعیت باز ٪', 'pct', { group: 'تعهد انباشته' }),
  col('ivPct', 'تلاطم ضمنی وزنی ٪', 'pct', { group: 'تلاطم', base: true }),
  col('twoSided', 'مظنه دوطرفه', 'int', { group: 'نقدشوندگی' }),
  col('twoSidedPct', 'مظنه دوطرفه ٪', 'pct', { group: 'نقدشوندگی' }),
  col('spreadPct', 'میانگین فاصله مظنه ٪', 'pct', { group: 'نقدشوندگی', heat: 'loss' }),
];

const COLS_TAPE = [
  col('name', 'قرارداد', 'sym', { group: 'شناسه' }),
  col('kindLabel', 'نوع', 'text', { group: 'شناسه' }),
  col('strike', 'قیمت اعمال', 'money', { group: 'شناسه' }),
  col('expiryText', 'سررسید', 'text', { group: 'شناسه' }),
  col('days', 'روز مانده', 'int', { group: 'شناسه' }),
  col('timeText', 'زمان', 'text', { group: 'معامله', base: true }),
  col('price', 'قیمت', 'money', { group: 'معامله', base: true }),
  col('changeFromFirstPct', 'تغییر از اولین معامله ٪', 'pct', { group: 'معامله', heat: 'gain', sign: true }),
  col('quantity', 'حجم', 'int', { group: 'معامله', base: true }),
  col('value', 'ارزش', 'money', { group: 'معامله', base: true, heat: 'gain' }),
  col('cumulativeVolume', 'حجم تجمعی', 'int', { group: 'تجمعی', base: true }),
  col('cumulativeValue', 'ارزش تجمعی', 'money', { group: 'تجمعی', base: true }),
  col('basePrice', 'قیمت پایه هم‌زمان', 'money', { group: 'مرجع', base: true }),
  col('premiumPctBase', 'پریمیوم ٪ قیمت پایه', 'pct', { group: 'مرجع' }),
  col('moneynessPct', 'فاصله اعمال از پایه ٪', 'pct', { group: 'مرجع' }),
  col('intrinsic', 'ارزش ذاتی هر سهم', 'money', { group: 'مرجع' }),
  col('timeValue', 'ارزش زمانی هر سهم', 'money', { group: 'مرجع' }),
  col('ivPct', 'تلاطم ضمنی ٪', 'pct', { group: 'مرجع', base: true }),
  col('sequence', 'ترتیب', 'int', { group: 'معامله' }),
];

const rowName = (row) => row.name || row.uaName || row.label
  || (row.endDate ? `سررسید ${dateLabel(row.endDate)}` : row.strike ? `اعمال ${fmt.money(row.strike)}` : '—');

function aggregateRows(rows, keyOf, labelOf) {
  const map = new Map();
  for (const row of rows) {
    const key = String(keyOf(row));
    let item = map.get(key);
    if (!item) {
      item = { key, label: labelOf(row), contractCount: 0, tradedContracts: 0,
        positive: 0, negative: 0, unchanged: 0,
        value: 0, volume: 0, trades: 0, oi: 0, oiYday: 0,
        callVolume: 0, putVolume: 0, callValue: 0, putValue: 0,
        callTrades: 0, putTrades: 0, callOi: 0, putOi: 0, twoSided: 0,
        _oiYdayGap: false, _change: 0, _changeWeight: 0,
        _iv: 0, _ivWeight: 0, _spread: 0, _spreadCount: 0 };
      map.set(key, item);
    }
    item.contractCount += 1;
    if (Number(row.volume) > 0 || Number(row.trades) > 0 || Number(row.value) > 0) item.tradedContracts += 1;
    for (const metric of ['value', 'volume', 'trades', 'oi']) item[metric] += Number(row[metric]) || 0;
    if (Number.isFinite(Number(row.oiYday))) item.oiYday += Number(row.oiYday); else item._oiYdayGap = true;
    const side = row.kind === 'put' ? 'put' : 'call';
    item[`${side}Volume`] += Number(row.volume) || 0;
    item[`${side}Value`] += Number(row.value) || 0;
    item[`${side}Trades`] += Number(row.trades) || 0;
    item[`${side}Oi`] += Number(row.oi) || 0;
    const weight = Number(row.value) > 0 ? Number(row.value) : 1;
    if (Number.isFinite(row.changePct)) {
      item._change += row.changePct * weight; item._changeWeight += weight;
      if (row.changePct > 0) item.positive += 1;
      else if (row.changePct < 0) item.negative += 1;
      else item.unchanged += 1;
    }
    if (Number.isFinite(row.ivPct)) { item._iv += row.ivPct * weight; item._ivWeight += weight; }
    if (Number.isFinite(row.spreadPct)) {
      item._spread += row.spreadPct; item._spreadCount += 1; item.twoSided += 1;
    }
  }
  const pct = (part, total) => total > 0 ? (part / total) * 100 : NaN;
  return [...map.values()].map((item) => {
    const oiYday = item._oiYdayGap ? NaN : item.oiYday;
    const directions = item.positive + item.negative + item.unchanged;
    return { ...item, oiYday,
      oiChange: Number.isFinite(oiYday) ? item.oi - oiYday : NaN,
      oiChangePct: Number.isFinite(oiYday) && oiYday > 0 ? ((item.oi / oiYday) - 1) * 100 : NaN,
      changePct: item._changeWeight ? item._change / item._changeWeight : NaN,
      ivPct: item._ivWeight ? item._iv / item._ivWeight : NaN,
      spreadPct: item._spreadCount ? item._spread / item._spreadCount : NaN,
      tradedPct: pct(item.tradedContracts, item.contractCount),
      positivePct: pct(item.positive, directions), negativePct: pct(item.negative, directions),
      unchangedPct: pct(item.unchanged, directions), twoSidedPct: pct(item.twoSided, item.contractCount),
      callVolumePct: pct(item.callVolume, item.volume), putVolumePct: pct(item.putVolume, item.volume),
      callValuePct: pct(item.callValue, item.value), putValuePct: pct(item.putValue, item.value),
      callOiPct: pct(item.callOi, item.oi), putOiPct: pct(item.putOi, item.oi),
    };
  });
}

function rowsFor(view, scoped) {
  const contracts = scoped.contracts || [];
  if (view[3] === 'underlyings') return scoped.underlyings || [];
  if (view[3] === 'expiries') return scoped.expiries || [];
  if (view[3] === 'calls') return contracts.filter((row) => row.kind === 'call');
  if (view[3] === 'puts') return contracts.filter((row) => row.kind === 'put');
  if (view[3] === 'sides') return aggregateRows(contracts, (row) => row.kind, (row) => kindLabel(row.kind));
  if (view[3] === 'strikes') return aggregateRows(contracts, (row) => row.strike, (row) => `اعمال ${fmt.money(row.strike)}`);
  if (view[3] === 'directions') return aggregateRows(contracts,
    (row) => Number(row.changePct) > 0 ? 'positive' : Number(row.changePct) < 0 ? 'negative' : 'unchanged',
    (row) => Number(row.changePct) > 0 ? 'مثبت' : Number(row.changePct) < 0 ? 'منفی' : 'بدون تغییر');
  return contracts;
}

function ranked(view, scoped, limit = 24) {
  const metric = view[4], rows = rowsFor(view, scoped).filter((row) => Number.isFinite(row[metric]));
  const asc = view[2] === 'table-asc';
  let filtered = view[2] === 'table-zero' ? rows.filter((row) => Number(row[metric]) === 0) : rows;
  filtered = [...filtered].sort((a, b) => asc ? Number(a[metric]) - Number(b[metric]) : Number(b[metric]) - Number(a[metric]));
  return filtered.slice(0, limit);
}

// ————— ستون‌های تابلوی پرمعامله —————
const COLS_BOARD = [
  col('title', 'قرارداد', 'sym', { group: 'شناسه', base: true }),
  col('uaName', 'نماد پایه', 'text', { group: 'شناسه', base: true }),
  col('kindLabel', 'نوع', 'text', { group: 'شناسه', base: true }),
  col('strike', 'قیمت اعمال', 'money', { group: 'شناسه', base: true }),
  col('expiryText', 'سررسید', 'text', { group: 'شناسه', base: true }),
  col('days', 'روز مانده', 'int', { group: 'شناسه' }),
  col('spot', 'قیمت جاری پایه', 'money', { group: 'سربه‌سر', base: true }),
  col('last', 'پریمیوم (آخرین)', 'money', { group: 'سربه‌سر', base: true }),
  col('close', 'قیمت پایانی قرارداد', 'money', { group: 'قیمت' }),
  col('yday', 'پایانی دیروز قرارداد', 'money', { group: 'قیمت' }),
  col('premiumPctSpot', 'پریمیوم ٪ قیمت پایه', 'pct', { group: 'قیمت' }),
  col('intrinsic', 'ارزش ذاتی هر سهم', 'money', { group: 'قیمت' }),
  col('intrinsicPctSpot', 'ارزش ذاتی ٪ قیمت پایه', 'pct', { group: 'قیمت' }),
  col('timeValue', 'ارزش زمانی هر سهم', 'money', { group: 'قیمت' }),
  col('timeValuePctSpot', 'ارزش زمانی ٪ قیمت پایه', 'pct', { group: 'قیمت' }),
  col('breakeven', 'سربه‌سر', 'money', { group: 'سربه‌سر', base: true }),
  col('breakevenGapPct', 'فاصله تا سربه‌سر ٪', 'pct', { group: 'سربه‌سر', base: true, heat: 'loss' }),
  col('moneynessPct', 'فاصله اعمال از قیمت جاری ٪', 'pct', { group: 'سربه‌سر', base: true }),
  col('changePct', 'تغییر نسبت به پایانی دیروز ٪', 'pct', { group: 'گردش امروز', heat: 'gain' }),
  col('bid', 'تقاضا', 'money', { group: 'مظنه' }),
  col('bidQty', 'حجم تقاضا', 'int', { group: 'مظنه' }),
  col('ask', 'عرضه', 'money', { group: 'مظنه' }),
  col('askQty', 'حجم عرضه', 'int', { group: 'مظنه' }),
  col('mid', 'میانه مظنه', 'money', { group: 'مظنه' }),
  col('volume', 'حجم', 'int', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('value', 'ارزش معامله', 'money', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('trades', 'تعداد معامله', 'int', { group: 'گردش امروز', base: true }),
  col('oi', 'موقعیت باز', 'int', { group: 'تعهد انباشته', base: true }),
  col('oiChange', 'تغییر موقعیت باز', 'int', { group: 'تعهد انباشته', base: true, heat: 'gain', sign: true }),
  col('oiYday', 'موقعیت باز دیروز', 'int', { group: 'تعهد انباشته' }),
  col('oiChangePct', 'تغییر موقعیت باز ٪', 'pct', { group: 'تعهد انباشته', heat: 'gain' }),
  col('sharePct', 'سهم از سنجه ٪', 'pct', { group: 'تمرکز', base: true, heat: 'gain' }),
  col('ivPct', 'تلاطم ضمنی ٪', 'pct', { group: 'تلاطم', base: true }),
  col('spreadPct', 'فاصله مظنه ٪', 'pct', { group: 'نقدشوندگی', heat: 'loss' }),
];

const COLS_BOARD_EXPIRY = [
  col('title', 'سررسید', 'text', { group: 'شناسه', base: true }),
  col('uaName', 'نماد پایه', 'text', { group: 'شناسه', base: true }),
  col('days', 'روز مانده', 'int', { group: 'شناسه', base: true }),
  col('spot', 'قیمت جاری پایه', 'money', { group: 'شناسه', base: true }),
  col('contracts', 'قرارداد', 'int', { group: 'اندازه', base: true }),
  col('callCount', 'کال شمرده‌شده', 'int', { group: 'اندازه' }),
  col('putCount', 'پوت شمرده‌شده', 'int', { group: 'اندازه' }),
  col('callBreakeven', 'سربه‌سر وزنی کال', 'money', { group: 'سربه‌سر', base: true }),
  col('callGapPct', 'فاصله تا سربه‌سر کال ٪', 'pct', { group: 'سربه‌سر', base: true, heat: 'loss' }),
  col('putBreakeven', 'سربه‌سر وزنی پوت', 'money', { group: 'سربه‌سر', base: true }),
  col('putGapPct', 'فاصله تا سربه‌سر پوت ٪', 'pct', { group: 'سربه‌سر', base: true, heat: 'loss' }),
  col('callStrike', 'اعمال وزنی کال', 'money', { group: 'قیمت وزنی' }),
  col('callStrikeGapPct', 'فاصله اعمال وزنی کال از پایه ٪', 'pct', { group: 'قیمت وزنی' }),
  col('putStrike', 'اعمال وزنی پوت', 'money', { group: 'قیمت وزنی' }),
  col('putStrikeGapPct', 'فاصله اعمال وزنی پوت از پایه ٪', 'pct', { group: 'قیمت وزنی' }),
  col('callPremium', 'پریمیوم وزنی کال', 'money', { group: 'قیمت وزنی' }),
  col('callPremiumPct', 'پریمیوم وزنی کال ٪ پایه', 'pct', { group: 'قیمت وزنی' }),
  col('putPremium', 'پریمیوم وزنی پوت', 'money', { group: 'قیمت وزنی' }),
  col('putPremiumPct', 'پریمیوم وزنی پوت ٪ پایه', 'pct', { group: 'قیمت وزنی' }),
  col('band', 'باند سربه‌سر', 'money', { group: 'سربه‌سر', base: true }),
  col('bandPct', 'باند ٪ قیمت جاری', 'pct', { group: 'سربه‌سر', base: true }),
  col('weight', 'وزن سنجه', 'money', { group: 'تمرکز', base: true, heat: 'gain' }),
  col('callWeight', 'وزن کال', 'money', { group: 'تمرکز' }),
  col('callSharePct', 'سهم کال از وزن ٪', 'pct', { group: 'تمرکز' }),
  col('putWeight', 'وزن پوت', 'money', { group: 'تمرکز' }),
  col('putSharePct', 'سهم پوت از وزن ٪', 'pct', { group: 'تمرکز' }),
  col('sharePct', 'سهم از سنجه ٪', 'pct', { group: 'تمرکز', base: true, heat: 'gain' }),
];

// کدام مجموعه ستون، برای کدام ردیف.
//
// از خودِ ردیف تشخیص داده می‌شود نه از نام نما، چون یک نما می‌تواند در
// دامنه‌های مختلف ردیف‌های متفاوتی بدهد.
function colsFor(kindKey) {
  if (kindKey === 'underlyings') return COLS_UNDERLYING;
  if (kindKey === 'expiries') return COLS_EXPIRY;
  if (['sides', 'strikes', 'directions'].includes(kindKey)) return COLS_GROUP;
  return COLS_CONTRACT;
}

// ردیف خام را به چیزی تبدیل می‌کند که جدول مشترک بتواند مرتب و صادر کند:
// یک ستون عنوانِ متنی، و متن سررسید به‌جای عدد خام تاریخ.
function decorate(rows, kindKey, greekParams = {}) {
  return rows.map((row) => ({
    ...row,
    title: kindKey === 'expiries' ? dateLabel(row.endDate) : rowName(row),
    kindLabel: row.kind ? kindLabel(row.kind) : '',
    expiryText: row.endDate ? dateLabel(row.endDate) : '',
    contractCount: row.contracts ?? row.contractCount,
    // ردیف گروهی سربه‌سر ندارد: سربه‌سرِ «همه کال‌ها» عددی است که هیچ
    // قراردادی ندارد. پس فقط ردیفی که خودش یک قرارداد است این سه را می‌گیرد.
    ...(row.kind === 'call' || row.kind === 'put'
      ? { breakeven: contractBreakeven(row), breakevenGap: breakevenGap(row), breakevenGapPct: breakevenGapPct(row),
        ...contractAnalytics(row, greekParams) }
      : {}),
  }));
}

// نمودار میله‌ای رتبه‌ای: یک فام برای همه میله‌ها.
//
// پیش از این هر میله رنگ بعدیِ فهرست سری را می‌گرفت (`SERIES[index % ...]`).
// این رنگ‌کردن «بر اساس رتبه» است نه بر اساس هویت: میله اول با عوض‌شدن
// فیلتر رنگ عوض می‌کرد، و شانزده رنگ کنار هم چیزی جز شلوغی نمی‌ساخت —
// طولِ میله خودش مقدار را می‌گوید.
//
// تنها استثنا، سنجه‌های علامت‌دار (تغییر قیمت، تغییر موقعیت باز) است: آنجا
// علامت یک معنی واقعی دارد و رنگ سود/زیان همان را می‌گوید، نه هویت را.
function barChart(rows, metric) {
  if (!rows.length) return '<p class="empty-note">داده معتبری برای رسم این نمودار نیست.</p>';
  const [label, formatter] = METRICS[metric] || [metric, fmt.num];
  const signed = metric === 'changePct' || metric === 'oiChange' || metric === 'oiChangePct';
  const max = Math.max(...rows.map((row) => Math.abs(Number(row[metric]) || 0)), 1);
  return `<div class="decision-bars" aria-label="${esc(label)}">${rows.slice(0, 16).map((row) => {
    const value = Number(row[metric]);
    const fill = signed ? (value > 0 ? 'var(--gain)' : value < 0 ? 'var(--loss)' : 'var(--muted)') : 'var(--bar-fill)';
    return `<article><header><b>${esc(rowName(row))}</b><strong class="${tone(signed ? value : 0)}">${formatter(value)}</strong></header><i><b style="--bar:${Math.min(100, Math.abs(value) / max * 100)}%;--series:${fill}"></b></i><small>تغییر آخرین با پایانی دیروز: ${fmt.pct(row.changePct)}٪ · ارزش ${fmt.money(row.value)}</small></article>`;
  }).join('')}</div>`;
}

// ————— نمودارهای تابلوی پرمعامله —————
//
// هر کدام یک شکل متفاوت‌اند چون یک سؤال متفاوت می‌پرسند. میله رتبه‌ای برای
// «کدام بیشتر»، میله انباشته برای «سهم کال و پوت»، هیستوگرام برای «پول
// کجا نشسته»، و پراکنش برای «رابطه دو عدد».

/** میله انباشته: کال و پوت روی یک میله، برای سهم هر سمت در هر سطل. */
function stackedBars(items, { label, formatter = fmt.money }) {
  const usable = items.filter((item) => item.total > 0);
  if (!usable.length) return '<p class="empty-note">در دامنه انتخابی داده معتبر برای این نما نیست.</p>';
  const max = Math.max(...usable.map((item) => item.total));
  return `<div class="decision-bars decision-stacked" aria-label="${esc(label)}">${usable.map((item) => {
    const callPct = (item.call / max) * 100, putPct = (item.put / max) * 100;
    return `<article><header><b>${esc(item.label)}</b><strong>${formatter(item.total)}</strong></header>
      <i class="decision-stack"><b style="--bar:${callPct}%;--series:var(--call)"></b><b style="--bar:${putPct}%;--series:var(--put)"></b></i>
      <small>کال ${formatter(item.call)} · پوت ${formatter(item.put)} · ${fmt.int(item.contracts)} قرارداد</small></article>`;
  }).join('')}</div><div class="decision-legend"><span style="--series:var(--call)"><i></i>اختیار خرید</span><span style="--series:var(--put)"><i></i>اختیار فروش</span></div>`;
}

/**
 * پراکنش دو عدد، با نشانگر قیمت جاری.
 *
 * چرا پراکنش و نه جدول: رابطه «اعمال ← سربه‌سر» را فقط وقتی می‌شود دید که
 * هر دو روی یک صفحه باشند. خط چین قیمت جاری، مرز سود را می‌گذارد.
 */
function scatterChart(points, { xLabel, yLabel, marker = NaN }) {
  const usable = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (usable.length < 2) return '<p class="empty-note">برای رسم پراکنش دست‌کم دو نقطه معتبر لازم است.</p>';
  const xs = usable.map((p) => p.x), ys = usable.map((p) => p.y);
  let xMin = Math.min(...xs, Number.isFinite(marker) ? marker : Infinity);
  let xMax = Math.max(...xs, Number.isFinite(marker) ? marker : -Infinity);
  let yMin = Math.min(...ys, Number.isFinite(marker) ? marker : Infinity);
  let yMax = Math.max(...ys, Number.isFinite(marker) ? marker : -Infinity);
  if (!(xMax > xMin)) { xMin -= 1; xMax += 1; }
  if (!(yMax > yMin)) { yMin -= 1; yMax += 1; }
  const padX = (xMax - xMin) * 0.08, padY = (yMax - yMin) * 0.08;
  xMin -= padX; xMax += padX; yMin -= padY; yMax += padY;
  const W = 920, H = 340, P = { l: 96, r: 24, t: 22, b: 52 };
  const X = (v) => P.l + ((v - xMin) / (xMax - xMin)) * (W - P.l - P.r);
  const Y = (v) => P.t + (1 - ((v - yMin) / (yMax - yMin))) * (H - P.t - P.b);
  const ticks = (lo, hi) => Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const grid = ticks(yMin, yMax).map((v) => `<line class="live-market-grid-line" x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${P.l - 9}" y="${Y(v) + 4}" text-anchor="end">${fmt.money(v)}</text>`).join('');
  const xAxis = ticks(xMin, xMax).map((v) => `<text x="${X(v)}" y="${H - 18}" text-anchor="middle">${fmt.money(v)}</text>`).join('');
  const dots = usable.map((p) => `<circle class="decision-dot" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="5" style="--series:${p.kind === 'put' ? 'var(--put)' : 'var(--call)'}"><title>${esc(p.label)}</title></circle>`).join('');
  const cross = Number.isFinite(marker)
    ? `<line class="decision-marker" x1="${X(marker)}" x2="${X(marker)}" y1="${P.t}" y2="${H - P.b}"/><line class="decision-marker" x1="${P.l}" x2="${W - P.r}" y1="${Y(marker)}" y2="${Y(marker)}"/>`
    : '';
  return `<div class="live-market-chart-stage"><svg viewBox="0 0 ${W} ${H}" aria-label="${esc(yLabel)} در برابر ${esc(xLabel)}">${grid}${xAxis}${cross}${dots}
    <text class="axis-title" transform="translate(18 ${(P.t + H - P.b) / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>
    <text class="axis-title" x="${(P.l + W - P.r) / 2}" y="${H - 2}" text-anchor="middle">${esc(xLabel)}</text></svg></div>
    <div class="decision-legend"><span style="--series:var(--call)"><i></i>اختیار خرید</span><span style="--series:var(--put)"><i></i>اختیار فروش</span>${Number.isFinite(marker) ? '<span class="decision-legend-marker"><i></i>قیمت جاری پایه</span>' : ''}</div>`;
}

/**
 * گرمانما: سررسید (سطر) × فاصله اعمال از قیمت جاری (ستون).
 *
 * شکل درست برای «کجای زنجیره سنگین است»: دو بُعد دسته‌ای و یک عدد. با میله
 * باید یکی از دو بُعد را قربانی کرد.
 *
 * رنگ، طیف تک‌فام است نه رنگین‌کمان — این سنجهٔ اندازه است نه هویت، پس از
 * کم‌رنگ به پررنگ می‌رود. شدت با ریشه دوم بالا می‌رود تا یک خانهٔ پرت،
 * بقیه را بی‌رنگ نکند؛ همان قاعده‌ای که طیف جدول‌ها دارد.
 */
function heatmap(rows, { metric, formatter = fmt.money, label }) {
  const cells = new Map();
  const cols = MONEYNESS_COLS;
  const bucketOf = (row) => {
    const spot = Number(row.spot), strike = Number(row.strike);
    if (!(spot > 0) || !(strike > 0)) return null;
    const money = ((strike / spot) - 1) * 100;
    return cols.findIndex((edge, index) => money >= edge[0] && money < edge[1]);
  };
  for (const row of rows) {
    const column = bucketOf(row);
    if (column == null || column < 0) continue;
    const key = `${row.uaIns}:${row.endDate}`;
    let line = cells.get(key);
    if (!line) {
      line = { key, label: `${row.uaName} · ${dateLabel(row.endDate)}`, days: row.days, values: cols.map(() => ({ sum: 0, count: 0 })) };
      cells.set(key, line);
    }
    const value = Number(row[metric]);
    if (!Number.isFinite(value)) continue;
    line.values[column].sum += value; line.values[column].count += 1;
  }
  // IV میانگین می‌خواهد و ارزش، جمع. جمعِ IV عددی است که هیچ قراردادی ندارد.
  const averaged = metric === 'ivPct';
  const lines = [...cells.values()].sort((a, b) => a.days - b.days).map((line) => ({
    ...line, cells: line.values.map((cell) => (cell.count === 0 ? NaN : averaged ? cell.sum / cell.count : cell.sum)),
  }));
  const all = lines.flatMap((line) => line.cells).filter(Number.isFinite);
  if (!all.length) return '<p class="empty-note">در دامنه انتخابی داده معتبر برای گرمانما نیست.</p>';
  const lo = Math.min(...all), hi = Math.max(...all);
  const shade = (value) => {
    if (!Number.isFinite(value)) return 'background:var(--panel-2)';
    const t = hi > lo ? Math.sqrt((value - lo) / (hi - lo)) : 1;
    return `background:color-mix(in srgb, var(--series-1) ${Math.round(t * 72)}%, var(--panel) ${Math.round(100 - t * 72)}%)`;
  };
  return `<div class="history-table-wrap"><table class="history-table decision-heatmap"><thead><tr><th>سررسید</th>${cols.map(([from, to]) => `<th>${from === -Infinity ? `کمتر از ${faDigits(String(to))}` : to === Infinity ? `بیش از ${faDigits(String(from))}` : `${faDigits(String(from))} تا ${faDigits(String(to))}`}٪</th>`).join('')}</tr></thead><tbody>${lines.map((line) => `<tr><th scope="row">${esc(line.label)}</th>${line.cells.map((value) => `<td style="${shade(value)}">${Number.isFinite(value) ? formatter(value) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="note">ستون‌ها فاصله قیمت اعمال از قیمت جاری پایه‌اند. ${esc(label)} — کم‌رنگ یعنی کمینه، پررنگ یعنی بیشینه.</p>`;
}

const MONEYNESS_COLS = [[-Infinity, -20], [-20, -10], [-10, -5], [-5, 0], [0, 5], [5, 10], [10, 20], [20, Infinity]];

/**
 * نردبان اعمال: میله دوطرفه، کال یک سمت و پوت سمت دیگر، حول قیمت جاری.
 *
 * شکل آشنای «دیوارها»: اعمالی که تعهد باز سنگینی رویش نشسته، در عمل مثل
 * سطح حمایت یا مقاومت رفتار می‌کند.
 */
function ladderChart(group, { metric, formatter = fmt.int, label }) {
  if (!group) return '<p class="empty-note">برای نردبان، دامنه را روی یک پایه یا یک سررسید بگذار.</p>';
  const rungs = group.rungs.filter((rung) => rung[`call${metric}`] > 0 || rung[`put${metric}`] > 0);
  if (!rungs.length) return '<p class="empty-note">در این سررسید تعهد یا گردشی روی اعمال‌ها ثبت نشده است.</p>';
  const max = Math.max(...rungs.map((rung) => Math.max(rung[`call${metric}`], rung[`put${metric}`])), 1);
  const spot = Number(group.spot);
  return `<p class="note">${esc(group.uaName)} · سررسید ${dateLabel(group.endDate)} · قیمت جاری ${fmt.money(spot)}. ${esc(label)}</p>
    <div class="decision-ladder">${rungs.map((rung) => {
      const near = spot > 0 && Math.abs(rung.strike / spot - 1) <= 0.025;
      return `<article class="${near ? 'is-atm' : ''}">
        <i class="ladder-side"><b style="--bar:${(rung[`call${metric}`] / max) * 100}%;--series:var(--call)"></b></i>
        <span>${fmt.money(rung.strike)}${near ? '<small>نزدیک پول</small>' : ''}</span>
        <i class="ladder-side ladder-put"><b style="--bar:${(rung[`put${metric}`] / max) * 100}%;--series:var(--put)"></b></i>
        <small class="ladder-value">${formatter(rung[`call${metric}`])} / ${formatter(rung[`put${metric}`])}</small>
      </article>`;
    }).join('')}</div>
    <div class="decision-legend"><span style="--series:var(--call)"><i></i>اختیار خرید</span><span style="--series:var(--put)"><i></i>اختیار فروش</span></div>`;
}

/** منحنی درد: مجموع ارزش ذاتی تعهد باز، در هر قیمت تسویه ممکن. */
function painCurve(group) {
  if (!group || !group.curve?.length) return '<p class="empty-note">برای منحنی درد، دامنه را روی یک سررسید بگذار.</p>';
  const points = group.curve.map((point) => ({ second: point.strike, value: point.pain }));
  const host = document.createElement('div');
  liveChart(host, [{ label: 'مجموع ارزش ذاتی تعهد باز', color: 'var(--series-1)', points }],
    { valueFmt: fmt.money, unit: 'ریال', zeroFloor: true });
  // محور افقی این نمودار قیمت است نه زمان؛ برچسب‌های ساعتش را برمی‌داریم.
  host.querySelectorAll('svg text').forEach((node) => {
    if (/^[۰-۹]{2}:[۰-۹]{2}$/.test(node.textContent.trim())) node.remove();
  });
  return `<p class="note">${esc(group.uaName)} · سررسید ${dateLabel(group.endDate)} · بیشترین درد ${fmt.money(group.maxPain)} (${fmt.pct(group.maxPainGapPct)}٪ از قیمت جاری). محور افقی، قیمت اعمال است نه زمان.</p>${host.innerHTML}`;
}

/** هیستوگرام یک سنجه پیوسته روی سطل‌های مساوی. */
function histogram(values, { buckets = 12, formatter = fmt.pct, label, unit = '' }) {
  const usable = values.filter(Number.isFinite);
  if (usable.length < 2) return '<p class="empty-note">برای هیستوگرام دست‌کم دو مقدار معتبر لازم است.</p>';
  const lo = Math.min(...usable), hi = Math.max(...usable);
  if (!(hi > lo)) return '<p class="empty-note">همه مقادیر یکی‌اند؛ توزیع شکلی ندارد.</p>';
  const width = (hi - lo) / buckets;
  const bins = Array.from({ length: buckets }, (_, index) => ({
    from: lo + index * width, to: lo + (index + 1) * width, count: 0,
  }));
  for (const value of usable) bins[Math.min(buckets - 1, Math.floor((value - lo) / width))].count += 1;
  const max = Math.max(...bins.map((bin) => bin.count), 1);
  return `<p class="note">${esc(label)} · ${fmt.int(usable.length)} مقدار معتبر در ${faDigits(String(buckets))} سطل مساوی.</p>
    <div class="decision-histogram">${bins.map((bin) => `<article><i><b style="--bar:${(bin.count / max) * 100}%"></b></i><span>${formatter(bin.from)}${unit}</span><strong>${fmt.int(bin.count)}</strong></article>`).join('')}</div>`;
}

function scopedBreadth(scoped) {
  const rows = (scoped.contracts || []).map((row) => ({
    ...row, ins: row.ins, name: row.name, last: row.last, yday: row.yday,
    uaVolume: row.volume, uaValue: row.value, uaTrades: row.trades,
  }));
  return marketBreadthSnapshot(rows);
}

function expiryLeaders(scoped) {
  const groups = new Map();
  for (const row of scoped.contracts || []) {
    const key = `${row.uaIns}:${row.endDate}`, list = groups.get(key) || [];
    list.push(row); groups.set(key, list);
  }
  return [...groups.values()].map((rows) => [...rows].sort((a, b) => b.value - a.value)[0]).filter(Boolean)
    .sort((a, b) => b.value - a.value);
}

// نوار ریزمعامله هم ردیف می‌دهد، نه HTML — تا مثل بقیه مرتب و صادر شود.
function tapeRows(tape) {
  const first = Number(tape?.[0]?.price);
  return (tape || []).map((row, index) => {
    const base = Number(row.basePrice), strike = Number(row.strike), price = Number(row.price);
    const intrinsic = base > 0 && strike > 0
      ? (row.kind === 'put' ? Math.max(0, strike - base) : Math.max(0, base - strike)) : NaN;
    return {
      ...row, sequence: index + 1, timeText: timeLabel(row.time),
      kindLabel: kindLabel(row.kind), expiryText: row.endDate ? dateLabel(row.endDate) : '',
      changeFromFirstPct: first > 0 && price > 0 ? ((price / first) - 1) * 100 : NaN,
      premiumPctBase: base > 0 && price > 0 ? (price / base) * 100 : NaN,
      moneynessPct: base > 0 && strike > 0 ? ((strike / base) - 1) * 100 : NaN,
      intrinsic, timeValue: Number.isFinite(intrinsic) && price > 0 ? price - intrinsic : NaN,
    };
  }).reverse();
}

export async function mount(root, { state, api }) {
  root.innerHTML = `<section class="live-dashboard-hero"><div><p class="eyebrow">مرکز تصمیم‌گیری زنده بازار اختیار</p><h1>داشبورد معاملاتی لحظه‌ای</h1><p>هر جدول و نمودار از عکس واقعی بازار و معاملات امروز بازسازی می‌شود. درصد تغییر، آخرین قیمت را فقط با قیمت پایانی دیروز مقایسه می‌کند.</p></div><div><button type="button" class="ghost" id="dd-refresh">به‌روزرسانی اکنون</button><button type="button" class="ghost" id="dd-pause">توقف خودکار</button><span id="dd-status" role="status">در انتظار نخستین عکس…</span></div></section>
    <nav class="dd-tabbar" role="tablist" aria-label="بخش‌های رصد زنده بازار">${DASHBOARD_MODES.map((mode, index) => `<button type="button" role="tab" data-mode="${mode.id}" aria-selected="${index === 0}" aria-pressed="${index === 0}"><b>${mode.title}</b><small>${mode.hint}</small></button>`).join('')}</nav>
    <section class="card decision-toolbar" id="dd-toolbar" hidden>
      <div class="decision-scope-live"><div><p class="eyebrow">دامنه تحلیل</p><p class="note" id="dd-scope-note">کل بازار اختیار</p></div><div class="decision-level-switch" role="group" aria-label="سطح دامنه">${SCOPE_LEVELS.map(([key, label], index) => `<button type="button" data-dd-level="${key}" aria-pressed="${index === 0}">${label}</button>`).join('')}</div></div>
      <p class="note dd-scope-hint">انتخاب از همان نقشه و زنجیرهٔ تب نخست خوانده می‌شود؛ اینجا دوباره نماد و سررسید نمی‌پرسیم. برای عوض‌کردن نماد به تب «نقشه و زنجیره» برگرد.</p>
      <div class="decision-refresh-control"><label for="dd-interval">زمان به‌روزرسانی</label><input id="dd-interval" type="range" min="5" max="60" step="5"><output id="dd-interval-label"></output></div>
    </section>
    <div class="decision-main">${DASHBOARD_MODES.map((mode, modeIndex) => mode.explorer
      ? `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><div id="dd-market-explorer"></div></section>`
      : mode.mod
        ? `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><div data-embedded-host></div></section>`
        : `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><div class="section-head"><div><p class="eyebrow">حالت تصمیم‌گیری</p><h2>${mode.title}</h2></div><span>از میان ${fmt.int(mode.views.length)} جدول و نمودار فقط نمای موردنیاز را باز کن</span></div>${mode.board ? `<div class="decision-board-controls"><label>سنجه<select id="dd-board-metric">${BOARD_METRIC_LABELS.map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><div class="decision-side-switch" role="group" aria-label="تفکیک سمت">${BOARD_SIDES.map(([key, label], index) => `<button type="button" data-board-side="${key}" aria-pressed="${index === 0}">${label}</button>`).join('')}</div><p class="note" id="dd-board-note">سنجه انتخابی هم رتبه‌بندی می‌کند هم وزن شاخص سربه‌سر است.</p></div>` : ''}<div class="decision-view-buttons">${mode.views.map((view, index) => `<button type="button" data-view="${view[0]}" aria-pressed="${index === 0}">${fmt.int(index + 1)}. ${view[1]}</button>`).join('')}</div><section class="card decision-view-card"><div class="section-head"><h3 data-view-title>${mode.views[0][1]}</h3><span data-view-scope>کل بازار</span></div><div data-view-host>${busyBlock('در حال دریافت نخستین عکس بازار… این مرحله چند ثانیه طول می‌کشد.', { lines: 4 })}</div><div data-open-view-host class="decision-open-view" hidden></div></section></section>`).join('')}</div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  // یونانی‌ها با همان فرض‌هایی حساب می‌شوند که بقیهٔ برنامه؛ نه با عدد
  // سرخود، وگرنه دلتای این تب با دلتای «رصد یونانی» نمی‌خواند.
  const greekParams = () => ({
    rFree: Number(state.settings.rFree) || 0,
    divYield: Number(state.settings.divYield) || 0,
    yearDays: Number(state.settings.dayCountYear) > 0 ? Number(state.settings.dayCountYear) : 365,
    ivLo: Number(state.settings.ivLo) > 0 ? Number(state.settings.ivLo) : 0.01,
  });
  let payload = { universe: { underlyings: [], expiries: [], marketExpiries: [], contracts: [] }, timeline: [], snapshot: { rows: [] } };
  let activeMode = DASHBOARD_MODES[0].id;
  const activeViews = Object.fromEntries(DASHBOARD_MODES.filter((mode) => mode.views.length).map((mode) => [mode.id, mode.views[0][0]]));
  let loading = false, paused = false, timer = null, nextAt = 0, tape = [], openViewMounted = false, openViewController = null;
  const openViewBaseSync = createOpenViewBaseSyncGate();
  let lastUaIns = '';
  let intervalSec = Math.max(5, Math.min(60, Number(localStorage.getItem('options-radar:dashboard-interval')) || Number(state.settings.watchIntervalSec) || 15));
  $('dd-interval').value = String(intervalSec);

  // ── یک انتخاب، نه دو ────────────────────────────────────────────────
  //
  // گزارش صاحب پروژه: «بعضاً نیاز هست که تاریخ و نماد دوباره انتخاب بشن.»
  // درست بود: چهار کشوی `dd-underlying`/`dd-expiry`/`dd-contract` عیناً
  // همان چیزی را می‌پرسیدند که کاربر یک قدم قبل روی نقشه انتخاب کرده بود،
  // و چون دو منبع حقیقت وجود داشت، هر ناهمگامی یعنی تحلیل‌ها روی نمادی
  // ساخته می‌شدند که کاربر نگاهش نمی‌کرد.
  //
  // حالا **نقشه تنها منبع انتخاب است**. از این صفحه فقط یک چیز باقی مانده
  // که نقشه نمی‌گوید: کاربر می‌خواهد تحلیل روی کل بازار باشد یا روی همان
  // نماد/سررسید/قرارداد. همان یک چیز، نوار سطح است — و هیچ نام و تاریخی
  // دوباره پرسیده نمی‌شود.
  let scopeLevel = localStorage.getItem('options-radar:dashboard-scope-level') || 'market';
  if (!SCOPE_LEVELS.some(([key]) => key === scopeLevel)) scopeLevel = 'market';
  const selected = () => resolveScope(scopeLevel, marketExplorer.selection());
  const activeContract = () => payload.universe.contracts.find((row) => String(row.ins) === selected().contractIns);
  const modeOf = () => DASHBOARD_MODES.find((mode) => mode.id === activeMode);
  const viewOf = () => (modeOf()?.views || []).find((view) => view[0] === activeViews[activeMode]);
  const explorerVisible = () => activeMode === 'explorer';

  function paintInterval() {
    $('dd-interval-label').textContent = `${faDigits(intervalSec)} ثانیه`;
    $('dd-interval').setAttribute('aria-valuetext', `${faDigits(intervalSec)} ثانیه`);
  }

  // سطحی که انتخاب فعلی پشتیبانی نمی‌کند، خاموش می‌ماند: دکمه‌ای که کار
  // نمی‌کند بدتر از دکمه‌ای است که نیست.
  function paintLevels() {
    const pick = selected(), sel = marketExplorer.selection();
    const reach = { market: true, underlying: !!sel.uaIns, expiry: !!(sel.uaIns && sel.endDate), contract: !!(sel.uaIns && sel.endDate && sel.contractIns) };
    root.querySelectorAll('[data-dd-level]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.ddLevel === pick.level));
      button.disabled = !reach[button.dataset.ddLevel];
    });
  }

  const marketExplorer = mountLiveMarketMap($('dd-market-explorer'), {
    contractColumns: COLS_CONTRACT,
    greekParams,
    isVisible: explorerVisible,
    onScopeChange: async (pick) => {
      if (String(pick.uaIns) !== lastUaIns) { lastUaIns = String(pick.uaIns); openViewBaseSync.request(); }
      // انتخاب روی نقشه، سطح را هم بالا می‌برد — ولی هیچ‌وقت پایین نمی‌آورد:
      // کسی که روی «کل بازار» ایستاده و فقط نماد عوض می‌کند، منتظر نیست
      // تحلیلش ناگهان به یک نماد محدود شود.
      const order = SCOPE_LEVELS.map(([key]) => key);
      if (order.indexOf(pick.level) > order.indexOf(scopeLevel)) {
        scopeLevel = pick.level;
        localStorage.setItem('options-radar:dashboard-scope-level', scopeLevel);
      }
      paintLevels();
      await fetchTape();
      await paintView();
    },
  });

  function scopeLabel(scoped) {
    const pick = selected(), ua = payload.universe.underlyings.find((row) => String(row.ins) === pick.uaIns), contract = activeContract();
    if (pick.level === 'market') return `کل بازار · ${fmt.int(scoped.contracts.length)} قرارداد`;
    if (pick.level === 'underlying') return `${ua?.name || 'پایه'} · همه سررسیدها`;
    if (pick.level === 'expiry') return `${ua?.name || 'پایه'} · سررسید ${dateLabel(pick.endDate)}`;
    return `${ua?.name || 'پایه'} · ${contract?.name || 'قرارداد'} · سررسید ${dateLabel(pick.endDate)}`;
  }

  async function syncOpenView() {
    const host = root.querySelector('[data-mode-panel="volatility"] [data-open-view-host]');
    if (!openViewMounted) {
      host.innerHTML = '<p class="empty-note">در حال آماده‌سازی تحلیل چندروزه…</p>';
      const mod = await import('/ui/tabs/open-view.mjs'); openViewController = await mod.mount(host, { state }); openViewMounted = true;
      // نمای لحظه‌ای فهرست نمادش را از همین عکس می‌گیرد. بدون این خط، تا
      // تیک بعدی (تا ۶۰ ثانیه) انتخابگر خالی می‌ماند و کاربر فکر می‌کند
      // چیزی بار نشده.
      openViewController?.updateLive?.(payload);
    }
    // تیک خودکار دوباره به `paintView` می‌رسد، اما حق ندارد انتخاب مستقلی را
    // که کاربر داخل «نگاه باز» انجام داده با نماد بالای داشبورد جایگزین کند.
    // این مجوز فقط در ورود نخست یا وقتی کاربر روی نقشه نماد عوض کرده مصرف می‌شود.
    if (!openViewBaseSync.consume()) return;
    const base = host.querySelector('#ov-base'), value = selected().uaIns;
    if (base && value && base.value !== value && [...base.options].some((option) => option.value === value)) {
      base.value = value; base.dispatchEvent(new Event('change'));
    }
  }

  function paintTimeline(host, view, scoped) {
    if (selected().level !== 'market') {
      const metric = view[4] === 'cumulativeVolume' ? 'volume' : 'changePct';
      host.innerHTML = `<p class="note">مسیر دقیقه‌ای تجمعی فقط برای کل بازار ساخته می‌شود؛ در این دامنه عکس مقطعی همان سنجه نمایش داده شده است.</p>${barChart(ranked(['', '', 'bar', 'contracts', metric], scoped, 16), metric)}`;
      return;
    }
    const timeline = payload.timeline || [];
    if (!timeline.length) { host.innerHTML = '<p class="empty-note">هنوز مسیر دقیقه‌ای معتبری دریافت نشده است.</p>'; return; }
    if (view[0] === 'breadth-pct') {
      liveChart(host, [
        { label: 'مثبت', color: SERIES[0], points: timeline.map((row) => ({ ...row, value: row.positivePct })) },
        { label: 'منفی', color: SERIES[1], points: timeline.map((row) => ({ ...row, value: row.negativePct })) },
      ], { valueFmt: fmt.pct, unit: 'درصد نمادهای معامله‌شده' });
    } else {
      const metric = view[4], label = metric === 'breadth' ? 'خالص وسعت' : 'حجم تجمعی پایه‌ها';
      liveChart(host, [{ label, color: SERIES[0], points: timeline.map((row) => ({ ...row, value: row[metric] })) }], { valueFmt: fmt.int, unit: label, zeroFloor: metric !== 'breadth' });
    }
  }

  // ————— جدول‌های مرتب‌شونده و دارای خروجی اکسل —————
  //
  // خواسته کاربر: «همه جدول‌های رصد لحظه‌ای قابلیت سرت کردن و خروجی اکسل
  // داشته باشند.» جدول‌های این تب `innerHTML` خام بودند: نه مرتب می‌شدند،
  // نه ستون‌هایشان انتخابی بود، نه خروجی داشتند. حالا از همان
  // `makeTable` مشترک می‌آیند که هر سه را دارد.
  //
  // نمونه جدول برای هر نما یک بار ساخته و نگه داشته می‌شود، نه هر بار از
  // نو: با ساخت دوباره، ستون مرتب‌سازیِ کاربر در هر دریافت خودکار (هر ۵ تا
  // ۶۰ ثانیه) به حالت اول برمی‌گشت.
  const tables = new Map();
  function tableFor(host, key, cols, exportName) {
    let entry = tables.get(key);
    if (!entry) {
      const el = document.createElement('div');
      host.appendChild(el);
      const base = cols.filter((c) => c.base);
      entry = { el, table: makeTable(el, base.length ? base : cols, {
        all: cols, storeKey: `dashboard:${key}`, exportName: `dashboard-${exportName}`,
      }) };
      tables.set(key, entry);
    }
    // جدول‌های دیگر از DOM جدا می‌شوند، نه فقط پنهان: با پنهان‌کردن، عنصر
    // در همان میزبان می‌ماند و هر `querySelector` روی میزبان، جدولِ نمای
    // قبلی را برمی‌گرداند. نمونه‌شان در `tables` زنده می‌ماند، پس مرتب‌سازی
    // و ستون‌های انتخابیِ کاربر با برگشتن به همان نما سر جایشان‌اند.
    for (const other of tables.values()) if (other !== entry) other.el.remove();
    // هر چه نمای قبلی با `innerHTML` گذاشته بود هم می‌رود. بدون این، نمودار
    // نمای قبلی بالای جدول می‌ماند و دو نما هم‌زمان دیده می‌شوند.
    for (const child of [...host.children]) if (child !== entry.el) child.remove();
    if (entry.el.parentElement !== host) host.appendChild(entry.el);
    return entry.table;
  }

  function paintTable(host, view, scoped) {
    const kindKey = view[2] === 'tape' ? 'tape' : view[2] === 'expiry-leaders' ? 'contracts' : view[3];
    let rows, cols, empty = null;
    if (view[2] === 'tape') {
      cols = COLS_TAPE;
      if (selected().level !== 'contract' || !activeContract()) empty = 'دامنه را روی «قرارداد» بگذار و یک قرارداد انتخاب کن.';
      else if (!tape?.length) empty = 'برای قرارداد انتخابی ریزمعامله معتبر دریافت نشده است.';
      rows = tapeRows(tape);
    } else if (view[2] === 'expiry-leaders') {
      cols = COLS_CONTRACT; rows = decorate(expiryLeaders(scoped), 'contracts', greekParams());
    } else {
      cols = colsFor(kindKey); rows = decorate(ranked(view, scoped, 400), kindKey, greekParams());
    }
    const table = tableFor(host, `${view[2]}:${kindKey}`, cols, `${kindKey}`);
    table.setEmptyMessage(empty || 'در دامنه انتخابی داده معتبر برای این نما نیست.');
    table.set(empty ? [] : rows);
    // مرتب‌سازی اولیه روی همان سنجه‌ای که نما برایش ساخته شده؛ بعد از آن
    // انتخاب کاربر است و دست نمی‌خورد.
    if (!table.__seeded && cols.some((c) => c.key === view[4])) { table.sortBy(view[4]); table.__seeded = true; }
  }

  // تب ادغام‌شده فقط یک بار سوار می‌شود و تابع برچیدنش نگه داشته می‌شود،
  // وگرنه اشتراک‌های دیده‌بان و تایمر اسکن پس از رفتن از این تب زنده می‌مانند.
  const embedded = new Map();
  async function mountEmbedded(mode) {
    if (embedded.has(mode.id)) return;
    const host = root.querySelector(`[data-mode-panel="${mode.id}"] [data-embedded-host]`);
    if (!host) return;
    embedded.set(mode.id, null);
    host.innerHTML = '<p class="empty-note">در حال آماده‌سازی…</p>';
    try {
      const module = await import(mode.mod);
      host.innerHTML = '';
      embedded.set(mode.id, await module.mount(host, { state, api }));
    } catch (error) {
      embedded.delete(mode.id);
      host.innerHTML = '<p class="empty-note">این بخش بار نشد.</p>';
      logError(`سوارکردن ${mode.title} در رصد لحظه‌ای`, error);
    }
  }

  // ————— تابلوی اختیارهای پرمعامله —————
  let boardMetric = localStorage.getItem('options-radar:board-metric') || 'value';
  let boardSide = localStorage.getItem('options-radar:board-side') || 'both';

  function paintBoard(panel, view, scoped) {
    const host = panel.querySelector('[data-view-host]');
    const board = activeOptionsBoard(scoped.contracts || [], { metric: boardMetric, side: boardSide, limit: 400 });
    const metricLabel = BOARD_METRIC_LABELS.find(([key]) => key === board.metric)?.[1] || board.metric;
    const share = (weight) => (board.total > 0 ? (weight / board.total) * 100 : NaN);
    const note = panel.querySelector('#dd-board-note');
    if (note) note.textContent = `${metricLabel} هم ترتیب تابلو را می‌دهد هم وزن شاخص سربه‌سر است · ${fmt.int(board.counted)} قرارداد در دامنه`;

    if (view[2] === 'board-rows' || view[2] === 'board-expiries') {
      const isExpiry = view[2] === 'board-expiries';
      const rows = isExpiry
        ? board.expiries.map((row) => ({ ...row, title: dateLabel(row.endDate), sharePct: share(row.weight) }))
        : board.rows.map((row) => ({ ...row, title: rowName(row), kindLabel: kindLabel(row.kind),
          expiryText: dateLabel(row.endDate), sharePct: share(Number(row[board.metric]) || 0) }));
      const table = tableFor(host, `board:${view[2]}`, isExpiry ? COLS_BOARD_EXPIRY : COLS_BOARD, view[2]);
      table.setEmptyMessage('در دامنه انتخابی قرارداد معامله‌شده‌ای نیست.');
      table.set(rows);
      if (!table.__seeded) { table.sortBy(isExpiry ? 'weight' : board.metric); table.__seeded = true; }
      return;
    }
    for (const entry of tables.values()) entry.el.remove();

    if (view[2] === 'board-gap') {
      const rows = board.expiries.slice(0, 16).flatMap((row) => [
        { label: `${row.uaName} · ${dateLabel(row.endDate)} · کال`, value: row.callGapPct },
        { label: `${row.uaName} · ${dateLabel(row.endDate)} · پوت`, value: row.putGapPct },
      ]).filter((row) => Number.isFinite(row.value));
      host.innerHTML = rows.length
        ? `<p class="note">فاصله از دید همان سمت خوانده می‌شود: کال باید بالا برود تا به سربه‌سر برسد و پوت پایین بیاید. عدد کمتر یعنی نزدیک‌تر.</p>${barChart(rows.map((row) => ({ ...row, changePct: NaN, value: row.value, breakevenGapPct: row.value })), 'breakevenGapPct')}`
        : '<p class="empty-note">در دامنه انتخابی سربه‌سر وزنی معتبری ساخته نشد.</p>';
      return;
    }
    if (view[2] === 'board-band') {
      const rows = board.expiries.slice(0, 16).filter((row) => Number.isFinite(row.bandPct))
        .map((row) => ({ label: `${row.uaName} · ${dateLabel(row.endDate)}`, bandPct: row.bandPct, changePct: NaN }));
      host.innerHTML = rows.length
        ? `<p class="note">باند، فاصله سربه‌سر پوت تا سربه‌سر کال است — بازه‌ای که بازار انتظار دارد قیمت تا سررسید از آن بیرون نرود.</p>${barChart(rows, 'bandPct')}`
        : '<p class="empty-note">باند وقتی ساخته می‌شود که هر دو سمت سررسید سربه‌سر معتبر داشته باشند.</p>';
      return;
    }
    if (view[2] === 'board-moneyness') {
      host.innerHTML = `<p class="note">هر سطل، فاصله قیمت اعمال از قیمت جاری پایه است. سطل‌ها ثابت‌اند تا دو نماد و دو روز با هم مقایسه شوند.</p>${stackedBars(moneynessDistribution(scoped.contracts || [], board.metric), { label: `توزیع ${metricLabel}`, formatter: board.metric === 'value' ? fmt.money : fmt.int })}`;
      return;
    }
    // آخرین نمای تابلو: اعمال در برابر سربه‌سر.
    const spot = board.rows.find((row) => Number(row.spot) > 0)?.spot;
    host.innerHTML = `<p class="note">هر نقطه یک قرارداد از تابلو. خط‌های چین، قیمت جاری پایه‌اند؛ نقطه بالای خط افقی یعنی سربه‌سر بالاتر از قیمت امروز.</p>${scatterChart(board.rows.map((row) => ({
      x: Number(row.strike), y: Number(row.breakeven), kind: row.kind,
      label: `${rowName(row)} · اعمال ${fmt.money(row.strike)} · سربه‌سر ${fmt.money(row.breakeven)}`,
    })), { xLabel: 'قیمت اعمال', yLabel: 'سربه‌سر', marker: Number(spot) })}`;
  }

  // نماهایی که از ساختار زنجیره می‌آیند، نه از رتبه‌بندی یک ستون.
  // برمی‌گرداند که خودش رسم کرد یا نه، تا مسیر پیش‌فرض میله رتبه‌ای بماند.
  function paintStructural(host, view, scoped) {
    const contracts = scoped.contracts || [];
    const kind = view[2];
    // نردبان و منحنی درد ذاتاً یک‌سررسیدی‌اند: روی هم گذاشتنِ دو سررسید،
    // دو ساختار متفاوت را یکی نشان می‌دهد. پرگردش‌ترین گروه دامنه انتخاب
    // می‌شود و نامش هم بالای نمودار نوشته است.
    const ladders = () => strikeLadder(contracts)
      .sort((a, b) => b.rungs.reduce((s, r) => s + r.oi, 0) - a.rungs.reduce((s, r) => s + r.oi, 0));
    if (kind === 'ladder-oi') { host.innerHTML = ladderChart(ladders()[0], { metric: 'Oi', label: 'موقعیت باز هر اعمال، کال یک سمت و پوت سمت دیگر.' }); return true; }
    if (kind === 'ladder-volume') { host.innerHTML = ladderChart(ladders()[0], { metric: 'Volume', label: 'حجم امروز روی هر اعمال.' }); return true; }
    if (kind === 'ladder-pc') {
      const group = ladders()[0];
      host.innerHTML = group
        ? `<p class="note">نسبت پوت به کال روی هر اعمال — نه روی کل زنجیره. تمرکز پوت روی یک اعمال خاص، چیزی می‌گوید که نسبت کل پنهانش می‌کند.</p>${barChart(group.rungs.filter((rung) => Number.isFinite(rung.putCallOi)).map((rung) => ({ label: `اعمال ${fmt.money(rung.strike)}`, putCallOi: rung.putCallOi, changePct: NaN })), 'putCallOi')}`
        : '<p class="empty-note">برای این نما، دامنه را روی یک پایه یا سررسید بگذار.</p>';
      return true;
    }
    if (kind === 'max-pain') {
      const rows = maxPain(strikeLadder(contracts)).filter((row) => Number.isFinite(row.maxPain));
      host.innerHTML = rows.length
        ? `<p class="note">بیشترین درد، قیمتی است که در آن مجموع ارزش ذاتی تعهدهای باز کمینه می‌شود. ادعای پیش‌بینی نیست؛ می‌گوید سنگینی تعهد کجاست.</p>${barChart(rows.map((row) => ({ label: `${row.uaName} · ${dateLabel(row.endDate)}`, maxPainGapPct: row.maxPainGapPct, changePct: NaN })), 'maxPainGapPct')}`
        : '<p class="empty-note">تعهد باز کافی برای ساختن بیشترین درد نیست.</p>';
      return true;
    }
    if (kind === 'pain-curve') {
      host.innerHTML = painCurve(maxPain(ladders())[0]);
      return true;
    }
    if (kind === 'heatmap-value') { host.innerHTML = heatmap(contracts, { metric: 'value', formatter: fmt.money, label: 'جمع ارزش معامله هر خانه.' }); return true; }
    if (kind === 'heatmap-iv') { host.innerHTML = heatmap(contracts, { metric: 'ivPct', formatter: (v) => `${fmt.pct(v)}٪`, label: 'میانگین تلاطم ضمنی هر خانه.' }); return true; }
    if (kind === 'histogram-money') { host.innerHTML = stackedBars(moneynessDistribution(contracts, 'value'), { label: 'توزیع ارزش روی فاصله اعمال', formatter: fmt.money }); return true; }
    if (kind === 'histogram-change') { host.innerHTML = histogram(contracts.map((row) => row.changePct), { label: 'توزیع تغییر نسبت به پایانی دیروز', unit: '٪' }); return true; }
    if (kind === 'histogram-iv') { host.innerHTML = histogram(contracts.map((row) => row.ivPct), { label: 'توزیع تلاطم ضمنی', unit: '٪' }); return true; }
    if (kind === 'term-structure' || kind === 'term-skew') {
      const rows = termStructure(contracts);
      if (!rows.length) { host.innerHTML = '<p class="empty-note">تلاطم معتبری برای ساختن ساختار زمانی نیست.</p>'; return true; }
      const skew = kind === 'term-skew';
      host.innerHTML = `<p class="note">${skew
        ? 'چولگی: تلاطم پوت منهای کال. مثبت یعنی بازار برای ریزش گران‌تر قیمت می‌زند تا برای رشد.'
        : 'ساختار زمانی: تلاطم وزنی به‌ازای روز مانده. شیب وارونه یعنی بازار برای کوتاه‌مدت تلاطم بیشتری قیمت می‌زند.'}</p>${barChart(rows.map((row) => ({
        label: `${row.uaName} · ${fmt.int(row.days)} روز`, changePct: NaN,
        ivPct: row.ivPct, skewPp: row.skewPp,
      })), skew ? 'skewPp' : 'ivPct')}`;
      return true;
    }
    if (kind === 'iv-smile') {
      host.innerHTML = `<p class="note">لبخند تلاطم: نوسان ضمنی هر قرارداد در برابر فاصله اعمالش از قیمت جاری. صفر یعنی نزدیک پول.</p>${scatterChart(contracts.map((row) => ({
        x: Number(row.spot) > 0 ? ((Number(row.strike) / Number(row.spot)) - 1) * 100 : NaN,
        y: Number(row.ivPct), kind: row.kind, label: `${row.name} · IV ${fmt.pct(row.ivPct)}٪`,
      })), { xLabel: 'فاصله اعمال از قیمت جاری ٪', yLabel: 'تلاطم ضمنی ٪', marker: NaN })}`;
      return true;
    }
    const scatters = {
      'scatter-xy': ['volume', 'changePct', 'حجم', 'تغییر نسبت به پایانی دیروز ٪'],
      'scatter-iv-value': ['value', 'ivPct', 'ارزش معامله', 'تلاطم ضمنی ٪'],
      'scatter-iv-spread': ['spreadPct', 'ivPct', 'فاصله مظنه ٪', 'تلاطم ضمنی ٪'],
    };
    if (scatters[kind]) {
      const [xKey, yKey, xLabel, yLabel] = scatters[kind];
      host.innerHTML = scatterChart(contracts.map((row) => ({
        x: Number(row[xKey]), y: Number(row[yKey]), kind: row.kind,
        label: `${row.name} · ${xLabel} ${fmt.num(row[xKey])} · ${yLabel} ${fmt.num(row[yKey])}`,
      })), { xLabel, yLabel, marker: NaN });
      return true;
    }
    return false;
  }

  async function paintView() {
    const mode = modeOf();
    // نوار دامنه فقط بالای تب‌هایی می‌آید که واقعاً دامنه می‌خواهند. روی
    // نقشه و روی دو تب ادغام‌شده، کنترلی که هیچ کاری نمی‌کند نمایش داده
    // نمی‌شود.
    $('dd-toolbar').hidden = !mode?.views?.length;
    if (mode?.explorer) { paintLevels(); return; }
    if (mode?.mod) { await mountEmbedded(mode); return; }
    const panel = root.querySelector(`[data-mode-panel="${activeMode}"]`), view = viewOf();
    if (!panel || !view) return;
    const scoped = dashboardScope(payload.universe, selected()), host = panel.querySelector('[data-view-host]'), openHost = panel.querySelector('[data-open-view-host]');
    panel.querySelector('[data-view-title]').textContent = view[1]; panel.querySelector('[data-view-scope]').textContent = scopeLabel(scoped);
    $('dd-scope-note').textContent = scopeLabel(scoped);
    host.hidden = view[2] === 'open-view'; openHost.hidden = view[2] !== 'open-view';
    if (mode?.board) { paintBoard(panel, view, scoped); return; }
    const tabular = ['table', 'table-asc', 'table-zero', 'tape', 'expiry-leaders'].includes(view[2]);
    // جدول‌ها نمونه ماندگار دارند، پس فقط وقتی نما جدول نیست پاک می‌شوند.
    if (!tabular) { for (const entry of tables.values()) entry.el.remove(); host.innerHTML = ''; }
    if (view[2] === 'open-view') { await syncOpenView(); return; }
    if (view[2] === 'donut') { breadthDonut(host, scopedBreadth(scoped), { unit: 'قرارداد' }); return; }
    if (view[2] === 'breadth') { breadthBars(host, scopedBreadth(scoped), { unit: 'قرارداد' }); return; }
    if (view[2] === 'timeline') { paintTimeline(host, view, scoped); return; }
    if (tabular) { paintTable(host, view, scoped); return; }
    if (paintStructural(host, view, scoped)) return;
    host.innerHTML = barChart(ranked(view, scoped, 16), view[4]);
  }

  // ریزمعامله فقط برای نمایی که آن را نشان می‌دهد.
  //
  // پیش از این هر تیکِ خودکار یک `live-trades` می‌زد، حتی وقتی کاربر روی
  // نقشه بود؛ روی بازهٔ ۵ ثانیه‌ای یعنی ۷۲۰ درخواست در ساعت برای داده‌ای که
  // هیچ‌جا رسم نمی‌شد.
  async function fetchTape() {
    const pick = selected();
    if (!needsTape(pick.level, viewOf()?.[2])) { tape = []; return; }
    tape = [];
    const contract = activeContract(); if (!contract) return;
    try {
      const response = await fetch(`/api/live-trades?ins=${encodeURIComponent(`${pick.uaIns},${contract.ins}`)}`, { cache: 'no-store' });
      const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      const optionRows = data.items?.[contract.ins]?.rows || [], baseRows = data.items?.[pick.uaIns]?.rows || [];
      tape = liveOptionTape({ trades: optionRows, contract, underlyingTape: liveReferenceTape(baseRows), settings: state.settings });
    } catch (error) { logError('ریزمعامله داشبورد تصمیم‌گیری', error); }
  }

  function schedule() {
    clearTimeout(timer); if (paused) return;
    nextAt = Date.now() + intervalSec * 1000;
    timer = setTimeout(refresh, intervalSec * 1000);
  }

  async function refresh() {
    if (loading) return;
    loading = true; $('dd-refresh').disabled = true; $('dd-status').textContent = 'در حال دریافت عکس تازه بازار…';
    $('dd-status').className = ''; busyBar?.busy(true);
    try {
      const response = await fetch('/api/live-dashboard', { cache: 'no-store' }), next = await response.json();
      if (!response.ok || next.error) throw new Error(next.error || `HTTP ${response.status}`);
      payload = next; openViewController?.updateLive?.(payload);
      await marketExplorer.setUniverse(payload.universe, true, payload);
      paintLevels(); await fetchTape(); await paintView();
      // دو زمان، دو ادعا. «عکس» زمانی است که تابلو خوانده شده و «دریافت»
      // زمانی که پاسخ رسیده؛ پیش از این فقط دومی نشان داده می‌شد و رابط
      // هر پنج ثانیه ادعا می‌کرد داده تازه است.
      const clock = dashboardClock({ snapshotAt: next.snapshotAt, at: next.at });
      const stamp = clock.unknown
        ? 'زمان عکس نامعلوم'
        : `عکس ${faClock(new Date(clock.snapshotAt))} · ${faDigits(clock.ageSec)} ثانیه پیش`;
      $('dd-status').textContent = `${stamp} · دریافت ${faClock(new Date(clock.at || Date.now()))} · ${fmt.int(next.universe?.contracts?.length || 0)} قرارداد · ${fmt.int(next.traded || 0)} پایه معامله‌شده`;
      $('dd-status').className = clock.stale ? 'loss' : '';
    } catch (error) {
      $('dd-status').textContent = `به‌روزرسانی ناموفق: ${error.message}`; logError('داشبورد تصمیم‌گیری', error);
    } finally { loading = false; $('dd-refresh').disabled = false; busyBar?.busy(false); schedule(); }
  }

  root.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', async () => {
    activeMode = button.dataset.mode;
    root.querySelectorAll('[data-mode]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button));
      item.setAttribute('aria-selected', String(item === button));
    });
    root.querySelectorAll('[data-mode-panel]').forEach((panel) => { panel.hidden = panel.dataset.modePanel !== activeMode; });
    // برگشت به نقشه یعنی بخش کندل دوباره دیده می‌شود؛ همان‌جا اگر کهنه شده
    // باشد تازه می‌شود — نه در هر تیکِ پس‌زمینه.
    if (activeMode === 'explorer') await marketExplorer.refreshRanges();
    await fetchTape();
    await paintView();
  }));
  root.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', async () => {
    const panel = button.closest('[data-mode-panel]'), mode = panel.dataset.modePanel; activeViews[mode] = button.dataset.view;
    panel.querySelectorAll('[data-view]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    // نمای تازه ممکن است ریزمعامله بخواهد یا نخواهد؛ همین‌جا تصمیم گرفته می‌شود.
    await fetchTape();
    await paintView();
  }));
  root.querySelectorAll('[data-dd-level]').forEach((button) => button.addEventListener('click', async () => {
    scopeLevel = button.dataset.ddLevel;
    localStorage.setItem('options-radar:dashboard-scope-level', scopeLevel);
    paintLevels(); await fetchTape(); await paintView();
  }));
  root.querySelectorAll('#dd-board-metric').forEach((select) => {
    select.value = boardMetric;
    select.addEventListener('change', async () => {
      boardMetric = select.value; localStorage.setItem('options-radar:board-metric', boardMetric);
      // سنجه که عوض شد، مرتب‌سازیِ لنگرشده به سنجه قبلی دیگر جواب سؤال
      // تازه نیست؛ جدول‌های تابلو دوباره لنگر می‌گیرند.
      for (const [key, entry] of tables) if (key.startsWith('board:')) entry.table.__seeded = false;
      await paintView();
    });
  });
  root.querySelectorAll('[data-board-side]').forEach((button) => button.addEventListener('click', async () => {
    boardSide = button.dataset.boardSide; localStorage.setItem('options-radar:board-side', boardSide);
    root.querySelectorAll('[data-board-side]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    await paintView();
  }));
  root.querySelectorAll('[data-board-side]').forEach((button) =>
    button.setAttribute('aria-pressed', String(button.dataset.boardSide === boardSide)));
  $('dd-refresh').addEventListener('click', refresh);
  $('dd-pause').addEventListener('click', () => { paused = !paused; $('dd-pause').textContent = paused ? 'ادامه خودکار' : 'توقف خودکار'; if (paused) clearTimeout(timer); else refresh(); });
  $('dd-interval').addEventListener('input', () => { intervalSec = Number($('dd-interval').value); paintInterval(); });
  $('dd-interval').addEventListener('change', () => { localStorage.setItem('options-radar:dashboard-interval', String(intervalSec)); schedule(); });
  const countdown = setInterval(() => {
    if (!paused && nextAt > Date.now() && !loading) $('dd-interval-label').textContent = `${faDigits(intervalSec)} ثانیه · نوبت بعد ${faDigits(Math.ceil((nextAt - Date.now()) / 1000))} ثانیه`;
  }, 1000);
  // نوار باریکِ «در جریان» بالای نوار تب: محتوای موجود پاک نمی‌شود، ولی
  // کاربر می‌بیند که چیزی در راه است.
  const busyBar = attachBusyBar(root.querySelector('.dd-tabbar'), { label: 'در حال دریافت عکس تازه بازار…' });
  paintInterval(); paintLevels(); await refresh();
  return () => {
    clearTimeout(timer); clearInterval(countdown);
    busyBar?.dispose();
    openViewController?.dispose?.();
    marketExplorer.dispose();
    for (const dispose of embedded.values()) { try { dispose?.(); } catch { /* برچیدن نباید بترکد */ } }
  };
}
