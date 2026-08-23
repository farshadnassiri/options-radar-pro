// مجموعه داشبوردهای تصمیم‌گیری زنده بازار.
// سه تب عمودی، هر کدام بیست نمای تنبل دارند و انتخاب دامنه در همه مشترک است.

import { fmt, faDigits, faClock } from '/ui/fmt.mjs';
import { makeTable } from '/ui/table.mjs';
import { liveOptionTape, liveReferenceTape, marketBreadthSnapshot } from '/core/live-market.mjs';
import { dashboardScope, activeOptionsBoard, moneynessDistribution, BOARD_METRICS } from '/core/decision-dashboard.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { breadthBars, breadthDonut, liveChart } from '/ui/tabs/live-market.mjs';
import { logError } from '/ui/errlog.mjs';

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

const pulseViews = [
  ['breadth-donut', 'دایره جهت بازار', 'donut', 'contracts', 'changePct'],
  ['breadth-bars', 'میله قدرت جهت‌ها', 'breadth', 'contracts', 'changePct'],
  ['breadth-pct', 'روند درصد مثبت و منفی', 'timeline', 'timeline', 'positivePct'],
  ['breadth-net', 'روند خالص وسعت', 'timeline', 'timeline', 'breadth'],
  ['base-volume-path', 'حجم تجمعی پایه‌ها', 'timeline', 'timeline', 'cumulativeVolume'],
  ['base-change-table', 'تغییر همه پایه‌ها', 'table', 'underlyings', 'changePct'],
  ['gainers-table', 'بیشترین رشد', 'table', 'contracts', 'changePct'],
  ['losers-table', 'بیشترین افت', 'table-asc', 'contracts', 'changePct'],
  ['change-bars', 'میله تغییر آخرین', 'bar', 'contracts', 'changePct'],
  ['direction-value', 'ارزش به تفکیک جهت', 'bar', 'directions', 'value'],
  ['direction-volume', 'حجم به تفکیک جهت', 'bar', 'directions', 'volume'],
  ['direction-trades', 'تعداد معامله به تفکیک جهت', 'bar', 'directions', 'trades'],
  ['calls-change', 'جهت اختیار خرید', 'table', 'calls', 'changePct'],
  ['puts-change', 'جهت اختیار فروش', 'table', 'puts', 'changePct'],
  ['expiry-change', 'جهت سررسیدها', 'table', 'expiries', 'changePct'],
  ['strike-change', 'جهت قیمت‌های اعمال', 'bar', 'strikes', 'changePct'],
  ['unchanged', 'نمادهای بدون تغییر', 'table-zero', 'contracts', 'changePct'],
  ['traded-snapshot', 'عکس نمادهای معامله‌شده', 'table', 'contracts', 'trades'],
  ['market-snapshot', 'عکس کامل دامنه', 'table', 'contracts', 'value'],
  ['pulse-tape', 'ریزمعامله قرارداد', 'tape', 'contracts', 'value'],
];

const liquidityViews = [
  ['base-value-table', 'ارزش بالای نمادهای پایه', 'table', 'underlyings', 'value'],
  ['base-value-bars', 'میله ارزش پایه‌ها', 'bar', 'underlyings', 'value'],
  ['contract-value-table', 'ارزش بالای قراردادها', 'table', 'contracts', 'value'],
  ['contract-value-bars', 'میله ارزش قراردادها', 'bar', 'contracts', 'value'],
  ['expiry-value-table', 'ارزش به تفکیک سررسید', 'table', 'expiries', 'value'],
  ['expiry-value-bars', 'میله ارزش سررسیدها', 'bar', 'expiries', 'value'],
  ['high-value-overall', 'رهبران ارزش کل بازار', 'table', 'contracts', 'value'],
  ['high-value-expiry', 'رهبران ارزش هر سررسید', 'expiry-leaders', 'contracts', 'value'],
  ['volume-table', 'رهبران حجم', 'table', 'contracts', 'volume'],
  ['volume-bars', 'میله حجم', 'bar', 'contracts', 'volume'],
  ['trades-table', 'رهبران تعداد معامله', 'table', 'contracts', 'trades'],
  ['trades-bars', 'میله تعداد معامله', 'bar', 'contracts', 'trades'],
  ['oi-table', 'بیشترین موقعیت باز', 'table', 'contracts', 'oi'],
  ['oi-bars', 'میله موقعیت باز', 'bar', 'contracts', 'oi'],
  ['spread-table', 'فاصله مظنه دوطرفه', 'table-asc', 'contracts', 'spreadPct'],
  ['spread-bars', 'میله فاصله مظنه', 'bar', 'contracts', 'spreadPct'],
  ['call-put-value', 'ارزش کال و پوت', 'bar', 'sides', 'value'],
  ['call-put-volume', 'حجم کال و پوت', 'bar', 'sides', 'volume'],
  ['expiry-concentration', 'تمرکز ارزش سررسید', 'bar', 'expiries', 'value'],
  ['liquidity-tape', 'مسیر ارزش قرارداد', 'tape', 'contracts', 'value'],
];

const volatilityViews = [
  ['iv-table', 'IV همه قراردادها', 'table', 'contracts', 'ivPct'],
  ['iv-bars', 'میله IV قراردادها', 'bar', 'contracts', 'ivPct'],
  ['iv-sides', 'IV کال در برابر پوت', 'bar', 'sides', 'ivPct'],
  ['iv-expiry-table', 'IV به تفکیک سررسید', 'table', 'expiries', 'ivPct'],
  ['iv-expiry-bars', 'میله IV سررسیدها', 'bar', 'expiries', 'ivPct'],
  ['iv-strike-table', 'IV به تفکیک اعمال', 'table', 'strikes', 'ivPct'],
  ['iv-smile', 'لبخند IV قیمت اعمال', 'bar', 'strikes', 'ivPct'],
  ['iv-value', 'IV قراردادهای پُرارزش', 'table', 'contracts', 'value'],
  ['iv-change', 'IV و تغییر آخرین', 'table', 'contracts', 'changePct'],
  ['oi-change', 'تغییر موقعیت باز', 'table', 'contracts', 'oiChange'],
  ['oi-change-bars', 'میله تغییر موقعیت باز', 'bar', 'contracts', 'oiChange'],
  ['pc-oi-expiry', 'نسبت OI پوت به کال', 'table', 'expiries', 'putCallOi'],
  ['pc-volume-expiry', 'نسبت حجم پوت به کال', 'table', 'expiries', 'putCallVolume'],
  ['call-iv-table', 'تلاطم اختیار خرید', 'table', 'calls', 'ivPct'],
  ['put-iv-table', 'تلاطم اختیار فروش', 'table', 'puts', 'ivPct'],
  ['iv-spread', 'IV در کنار فاصله مظنه', 'table', 'contracts', 'spreadPct'],
  ['iv-liquidity', 'IV در کنار نقدشوندگی', 'table', 'contracts', 'volume'],
  ['iv-direction', 'IV به تفکیک جهت', 'bar', 'directions', 'ivPct'],
  ['iv-tape', 'IV ریزمعامله قرارداد', 'tape', 'contracts', 'ivPct'],
  ['open-view-history', 'نگاه باز چندروزه', 'open-view', 'contracts', 'ivPct'],
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
  ['board-share', 'سهم هر قرارداد از سنجه', 'board-share'],
  ['board-expiry-table', 'سربه‌سر وزنی هر سررسید', 'board-expiries'],
  ['board-expiry-gap', 'فاصله سربه‌سر از قیمت جاری', 'board-gap'],
  ['board-band', 'باند سربه‌سر پوت تا کال', 'board-band'],
  ['board-moneyness', 'توزیع روی فاصله از قیمت جاری', 'board-moneyness'],
  ['board-scatter', 'اعمال در برابر سربه‌سر', 'board-scatter'],
  ['board-smile', 'لبخند تلاطم ضمنی روی اعمال', 'board-smile'],
];

export const DASHBOARD_MODES = [
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
  col('last', 'آخرین', 'money', { group: 'قیمت', base: true }),
  col('yday', 'پایانی دیروز', 'money', { group: 'قیمت' }),
  col('changePct', 'تغییر نسبت به پایانی دیروز ٪', 'pct', { group: 'قیمت', base: true, heat: 'gain' }),
  col('bid', 'تقاضا', 'money', { group: 'مظنه' }),
  col('ask', 'عرضه', 'money', { group: 'مظنه' }),
  col('spreadPct', 'فاصله مظنه ٪', 'pct', { group: 'مظنه', base: true, heat: 'loss' }),
  col('volume', 'حجم', 'int', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('value', 'ارزش معامله', 'money', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('trades', 'تعداد معامله', 'int', { group: 'گردش امروز' }),
  col('oi', 'موقعیت باز', 'int', { group: 'تعهد انباشته', base: true }),
  col('oiYday', 'موقعیت باز دیروز', 'int', { group: 'تعهد انباشته' }),
  col('oiChange', 'تغییر موقعیت باز', 'int', { group: 'تعهد انباشته', base: true, heat: 'gain' }),
  col('ivPct', 'تلاطم ضمنی ٪', 'pct', { group: 'تلاطم', base: true }),
];

const COLS_UNDERLYING = [
  col('title', 'نماد پایه', 'text', { group: 'شناسه', base: true }),
  col('last', 'آخرین', 'money', { group: 'قیمت پایه', base: true }),
  col('close', 'پایانی', 'money', { group: 'قیمت پایه' }),
  col('changePct', 'تغییر نسبت به پایانی دیروز ٪', 'pct', { group: 'قیمت پایه', base: true, heat: 'gain' }),
  col('contracts', 'قرارداد', 'int', { group: 'اندازه تابلو', base: true }),
  col('strikes', 'قیمت اعمال', 'int', { group: 'اندازه تابلو' }),
  col('expiries', 'سررسید', 'int', { group: 'اندازه تابلو', base: true }),
  col('nearestDays', 'نزدیک‌ترین سررسید', 'int', { group: 'اندازه تابلو' }),
  col('quoted', 'دارای مظنه', 'int', { group: 'نقدشوندگی' }),
  col('spreadMedPct', 'میانه فاصله مظنه ٪', 'pct', { group: 'نقدشوندگی', heat: 'loss' }),
  col('volume', 'حجم اختیار', 'int', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('value', 'ارزش معاملات اختیار', 'money', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('uaValue', 'ارزش معاملات نماد پایه', 'money', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('trades', 'تعداد معامله', 'int', { group: 'گردش امروز' }),
  col('oi', 'موقعیت باز', 'int', { group: 'تعهد انباشته', base: true }),
  col('oiChange', 'تغییر موقعیت باز', 'int', { group: 'تعهد انباشته', base: true, heat: 'gain' }),
  col('oiChangePct', 'تغییر موقعیت باز ٪', 'pct', { group: 'تعهد انباشته' }),
  col('callOi', 'موقعیت باز کال', 'int', { group: 'تعهد انباشته' }),
  col('putOi', 'موقعیت باز پوت', 'int', { group: 'تعهد انباشته' }),
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
  col('positive', 'مثبت', 'int', { group: 'جهت' }),
  col('negative', 'منفی', 'int', { group: 'جهت' }),
  col('changePct', 'تغییر وزنی ٪', 'pct', { group: 'جهت', base: true, heat: 'gain' }),
  col('volume', 'حجم', 'int', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('value', 'ارزش معامله', 'money', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('callValue', 'ارزش کال', 'money', { group: 'گردش امروز', base: true }),
  col('putValue', 'ارزش پوت', 'money', { group: 'گردش امروز', base: true }),
  col('trades', 'تعداد معامله', 'int', { group: 'گردش امروز' }),
  col('oi', 'موقعیت باز', 'int', { group: 'تعهد انباشته', base: true }),
  col('oiChange', 'تغییر موقعیت باز', 'int', { group: 'تعهد انباشته', base: true, heat: 'gain' }),
  col('putCallOi', 'نسبت OI پوت به کال', 'num', { group: 'تعهد انباشته', base: true }),
  col('putCallVolume', 'نسبت حجم پوت به کال', 'num', { group: 'تعهد انباشته' }),
  col('ivPct', 'تلاطم ضمنی وزنی ٪', 'pct', { group: 'تلاطم', base: true }),
  col('spreadPct', 'میانه فاصله مظنه ٪', 'pct', { group: 'تلاطم', heat: 'loss' }),
];

// گروه‌های ساختگی (کال/پوت، قیمت اعمال، جهت) نه قیمت دارند نه سررسید.
const COLS_GROUP = [
  col('title', 'گروه', 'text', { group: 'شناسه', base: true }),
  col('contractCount', 'قرارداد', 'int', { group: 'اندازه', base: true }),
  col('changePct', 'تغییر وزنی ٪', 'pct', { group: 'جهت', base: true, heat: 'gain' }),
  col('volume', 'حجم', 'int', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('value', 'ارزش معامله', 'money', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('trades', 'تعداد معامله', 'int', { group: 'گردش امروز', base: true }),
  col('oi', 'موقعیت باز', 'int', { group: 'تعهد انباشته', base: true }),
  col('oiChange', 'تغییر موقعیت باز', 'int', { group: 'تعهد انباشته', base: true, heat: 'gain' }),
  col('ivPct', 'تلاطم ضمنی وزنی ٪', 'pct', { group: 'تلاطم', base: true }),
  col('spreadPct', 'میانگین فاصله مظنه ٪', 'pct', { group: 'تلاطم', heat: 'loss' }),
];

const COLS_TAPE = [
  col('timeText', 'زمان', 'text', { group: 'معامله', base: true }),
  col('price', 'قیمت', 'money', { group: 'معامله', base: true }),
  col('quantity', 'حجم', 'int', { group: 'معامله', base: true }),
  col('value', 'ارزش', 'money', { group: 'معامله', base: true, heat: 'gain' }),
  col('cumulativeVolume', 'حجم تجمعی', 'int', { group: 'تجمعی', base: true }),
  col('cumulativeValue', 'ارزش تجمعی', 'money', { group: 'تجمعی', base: true }),
  col('basePrice', 'قیمت پایه هم‌زمان', 'money', { group: 'مرجع', base: true }),
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
      item = { key, label: labelOf(row), value: 0, volume: 0, trades: 0, oi: 0, oiChange: 0,
        _change: 0, _changeWeight: 0, _iv: 0, _ivWeight: 0, _spread: 0, _spreadCount: 0 };
      map.set(key, item);
    }
    for (const metric of ['value', 'volume', 'trades', 'oi', 'oiChange']) item[metric] += Number(row[metric]) || 0;
    const weight = Number(row.value) > 0 ? Number(row.value) : 1;
    if (Number.isFinite(row.changePct)) { item._change += row.changePct * weight; item._changeWeight += weight; }
    if (Number.isFinite(row.ivPct)) { item._iv += row.ivPct * weight; item._ivWeight += weight; }
    if (Number.isFinite(row.spreadPct)) { item._spread += row.spreadPct; item._spreadCount += 1; }
  }
  return [...map.values()].map((item) => ({ ...item,
    changePct: item._changeWeight ? item._change / item._changeWeight : NaN,
    ivPct: item._ivWeight ? item._iv / item._ivWeight : NaN,
    spreadPct: item._spreadCount ? item._spread / item._spreadCount : NaN,
  }));
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
  col('breakeven', 'سربه‌سر', 'money', { group: 'سربه‌سر', base: true }),
  col('breakevenGapPct', 'فاصله تا سربه‌سر ٪', 'pct', { group: 'سربه‌سر', base: true, heat: 'loss' }),
  col('moneynessPct', 'فاصله اعمال از قیمت جاری ٪', 'pct', { group: 'سربه‌سر', base: true }),
  col('changePct', 'تغییر نسبت به پایانی دیروز ٪', 'pct', { group: 'گردش امروز', heat: 'gain' }),
  col('volume', 'حجم', 'int', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('value', 'ارزش معامله', 'money', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('trades', 'تعداد معامله', 'int', { group: 'گردش امروز', base: true }),
  col('oi', 'موقعیت باز', 'int', { group: 'تعهد انباشته', base: true }),
  col('oiChange', 'تغییر موقعیت باز', 'int', { group: 'تعهد انباشته', base: true, heat: 'gain' }),
  col('sharePct', 'سهم از سنجه ٪', 'pct', { group: 'تمرکز', base: true, heat: 'gain' }),
  col('ivPct', 'تلاطم ضمنی ٪', 'pct', { group: 'تلاطم', base: true }),
  col('spreadPct', 'فاصله مظنه ٪', 'pct', { group: 'تلاطم', heat: 'loss' }),
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
  col('band', 'باند سربه‌سر', 'money', { group: 'سربه‌سر', base: true }),
  col('bandPct', 'باند ٪ قیمت جاری', 'pct', { group: 'سربه‌سر', base: true }),
  col('weight', 'وزن سنجه', 'money', { group: 'تمرکز', base: true, heat: 'gain' }),
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
function decorate(rows, kindKey) {
  return rows.map((row) => ({
    ...row,
    title: kindKey === 'expiries' ? dateLabel(row.endDate) : rowName(row),
    kindLabel: row.kind ? kindLabel(row.kind) : '',
    expiryText: row.endDate ? dateLabel(row.endDate) : '',
    contractCount: row.contracts ?? row.contractCount,
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
  return (tape || []).map((row, index) => ({
    ...row, sequence: index + 1, timeText: timeLabel(row.time),
  })).reverse();
}

export async function mount(root, { state, api }) {
  root.innerHTML = `<section class="live-dashboard-hero"><div><p class="eyebrow">مرکز تصمیم‌گیری زنده بازار اختیار</p><h1>داشبورد معاملاتی لحظه‌ای</h1><p>هر جدول و نمودار از عکس واقعی بازار و معاملات امروز بازسازی می‌شود. درصد تغییر، آخرین قیمت را فقط با قیمت پایانی دیروز مقایسه می‌کند.</p></div><div><button type="button" class="ghost" id="dd-refresh">به‌روزرسانی اکنون</button><button type="button" class="ghost" id="dd-pause">توقف خودکار</button><span id="dd-status" role="status">در انتظار نخستین عکس…</span></div></section>
    <section class="card decision-toolbar"><div class="decision-refresh-control"><label for="dd-interval">زمان به‌روزرسانی</label><input id="dd-interval" type="range" min="5" max="60" step="5"><output id="dd-interval-label"></output></div><div class="decision-scope-controls"><label>دامنه<select id="dd-scope"><option value="market">کل بازار</option><option value="underlying">یک نماد پایه</option><option value="expiry">یک سررسید از پایه</option><option value="contract">یک قرارداد از سررسید</option></select></label><label>نماد پایه<select id="dd-underlying"></select></label><label>سررسید<select id="dd-expiry"></select></label><label>قرارداد<select id="dd-contract"></select></label></div><p id="dd-scope-note" class="note">کل بازار اختیار</p></section>
    <div class="decision-shell"><aside class="decision-mode-rail" aria-label="حالت‌های تصمیم‌گیری">${DASHBOARD_MODES.map((mode, index) => `<button type="button" data-mode="${mode.id}" aria-pressed="${index === 0}"><b>${mode.title}</b><small>${mode.hint}</small><span>${mode.mod ? 'تب کامل' : `${fmt.int(mode.views.length)} نما`}</span></button>`).join('')}</aside><main class="decision-main">${DASHBOARD_MODES.map((mode, modeIndex) => mode.mod
      ? `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><div data-embedded-host></div></section>`
      : `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><div class="section-head"><div><p class="eyebrow">حالت تصمیم‌گیری</p><h2>${mode.title}</h2></div><span>از میان ${fmt.int(mode.views.length)} جدول و نمودار فقط نمای موردنیاز را باز کن</span></div>${mode.board ? `<div class="decision-board-controls"><label>سنجه<select id="dd-board-metric">${BOARD_METRIC_LABELS.map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><div class="decision-side-switch" role="group" aria-label="تفکیک سمت">${BOARD_SIDES.map(([key, label], index) => `<button type="button" data-board-side="${key}" aria-pressed="${index === 0}">${label}</button>`).join('')}</div><p class="note" id="dd-board-note">سنجه انتخابی هم رتبه‌بندی می‌کند هم وزن شاخص سربه‌سر است.</p></div>` : ''}<div class="decision-view-buttons">${mode.views.map((view, index) => `<button type="button" data-view="${view[0]}" aria-pressed="${index === 0}">${fmt.int(index + 1)}. ${view[1]}</button>`).join('')}</div><section class="card decision-view-card"><div class="section-head"><h3 data-view-title>${mode.views[0][1]}</h3><span data-view-scope>کل بازار</span></div><div data-view-host></div><div data-open-view-host class="decision-open-view" hidden></div></section></section>`).join('')}</main></div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  let payload = { universe: { underlyings: [], expiries: [], marketExpiries: [], contracts: [] }, timeline: [], snapshot: { rows: [] } };
  let activeMode = DASHBOARD_MODES[0].id;
  const activeViews = Object.fromEntries(DASHBOARD_MODES.filter((mode) => mode.views.length).map((mode) => [mode.id, mode.views[0][0]]));
  let loading = false, paused = false, timer = null, nextAt = 0, tape = [], openViewMounted = false;
  let intervalSec = Math.max(5, Math.min(60, Number(localStorage.getItem('options-radar:dashboard-interval')) || Number(state.settings.watchIntervalSec) || 15));
  $('dd-interval').value = String(intervalSec);

  const selected = () => ({ level: $('dd-scope').value, uaIns: $('dd-underlying').value, endDate: $('dd-expiry').value, contractIns: $('dd-contract').value });
  const activeContract = () => payload.universe.contracts.find((row) => String(row.ins) === $('dd-contract').value);
  const modeOf = () => DASHBOARD_MODES.find((mode) => mode.id === activeMode);
  const viewOf = () => (modeOf()?.views || []).find((view) => view[0] === activeViews[activeMode]);

  function paintInterval() {
    $('dd-interval-label').textContent = `${faDigits(intervalSec)} ثانیه`;
    $('dd-interval').setAttribute('aria-valuetext', `${faDigits(intervalSec)} ثانیه`);
  }

  function fillSelectors(preserve = true) {
    const before = selected(), underlyings = payload.universe.underlyings || [];
    $('dd-underlying').innerHTML = underlyings.map((row) => `<option value="${esc(row.ins)}">${esc(row.name)} · تغییر ${fmt.pct(row.changePct)}٪</option>`).join('');
    if (preserve && underlyings.some((row) => String(row.ins) === before.uaIns)) $('dd-underlying').value = before.uaIns;
    const uaIns = $('dd-underlying').value;
    const expiries = (payload.universe.expiries || []).filter((row) => String(row.uaIns) === uaIns).sort((a, b) => a.days - b.days);
    $('dd-expiry').innerHTML = expiries.map((row) => `<option value="${row.endDate}">${dateLabel(row.endDate)} · ${fmt.int(row.days)} روز</option>`).join('');
    if (preserve && expiries.some((row) => String(row.endDate) === before.endDate)) $('dd-expiry').value = before.endDate;
    const endDate = $('dd-expiry').value;
    const contracts = (payload.universe.contracts || []).filter((row) => String(row.uaIns) === uaIns && String(row.endDate) === endDate);
    $('dd-contract').innerHTML = contracts.map((row) => `<option value="${esc(row.ins)}">${esc(row.name)} · ${kindLabel(row.kind)} · ${fmt.money(row.strike)}</option>`).join('');
    if (preserve && contracts.some((row) => String(row.ins) === before.contractIns)) $('dd-contract').value = before.contractIns;
    const level = $('dd-scope').value;
    $('dd-underlying').disabled = level === 'market'; $('dd-expiry').disabled = !['expiry', 'contract'].includes(level); $('dd-contract').disabled = level !== 'contract';
  }

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
      const mod = await import('/ui/tabs/open-view.mjs'); await mod.mount(host, { state }); openViewMounted = true;
    }
    const base = host.querySelector('#ov-base'), value = $('dd-underlying').value;
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
      cols = COLS_CONTRACT; rows = decorate(expiryLeaders(scoped), 'contracts');
    } else {
      cols = colsFor(kindKey); rows = decorate(ranked(view, scoped, 400), kindKey);
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

    if (view[2] === 'board-share') {
      const rows = board.rows.slice(0, 16).map((row) => ({ ...row,
        label: `${rowName(row)} · ${kindLabel(row.kind)}`, total: Number(row[board.metric]) || 0,
        call: row.kind === 'call' ? Number(row[board.metric]) || 0 : 0,
        put: row.kind === 'put' ? Number(row[board.metric]) || 0 : 0, contracts: 1 }));
      host.innerHTML = stackedBars(rows, { label: `سهم هر قرارداد از ${metricLabel}`,
        formatter: board.metric === 'value' ? fmt.money : fmt.int });
      return;
    }
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
    if (view[2] === 'board-scatter') {
      const spot = board.rows.find((row) => Number(row.spot) > 0)?.spot;
      host.innerHTML = `<p class="note">هر نقطه یک قرارداد از تابلو. خط‌های چین، قیمت جاری پایه‌اند؛ نقطه بالای خط افقی یعنی سربه‌سر بالاتر از قیمت امروز.</p>${scatterChart(board.rows.map((row) => ({
        x: Number(row.strike), y: Number(row.breakeven), kind: row.kind,
        label: `${rowName(row)} · اعمال ${fmt.money(row.strike)} · سربه‌سر ${fmt.money(row.breakeven)}`,
      })), { xLabel: 'قیمت اعمال', yLabel: 'سربه‌سر', marker: Number(spot) })}`;
      return;
    }
    // لبخند تلاطم: IV در برابر فاصله اعمال از قیمت جاری
    host.innerHTML = `<p class="note">لبخند تلاطم: نوسان ضمنی هر قرارداد در برابر فاصله اعمالش از قیمت جاری. صفر یعنی نزدیک پول.</p>${scatterChart(board.rows.map((row) => ({
      x: Number(row.moneynessPct), y: Number(row.ivPct), kind: row.kind,
      label: `${rowName(row)} · فاصله ${fmt.pct(row.moneynessPct)}٪ · IV ${fmt.pct(row.ivPct)}٪`,
    })), { xLabel: 'فاصله اعمال از قیمت جاری ٪', yLabel: 'تلاطم ضمنی ٪', marker: NaN })}`;
  }

  async function paintView() {
    const mode = modeOf();
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
    if (view[2] === 'donut') { breadthDonut(host, scopedBreadth(scoped)); return; }
    if (view[2] === 'breadth') { breadthBars(host, scopedBreadth(scoped)); return; }
    if (view[2] === 'timeline') { paintTimeline(host, view, scoped); return; }
    if (tabular) { paintTable(host, view, scoped); return; }
    host.innerHTML = barChart(ranked(view, scoped, 16), view[4]);
  }

  async function fetchTape() {
    tape = [];
    const contract = activeContract(), pick = selected(); if (!contract || pick.level !== 'contract') return;
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
    try {
      const response = await fetch('/api/live-dashboard', { cache: 'no-store' }), next = await response.json();
      if (!response.ok || next.error) throw new Error(next.error || `HTTP ${response.status}`);
      payload = next; fillSelectors(true); await fetchTape(); await paintView();
      $('dd-status').textContent = `${faClock(new Date(next.at || Date.now()))} · ${fmt.int(next.universe?.contracts?.length || 0)} قرارداد · ${fmt.int(next.traded || 0)} پایه معامله‌شده`;
    } catch (error) {
      $('dd-status').textContent = `به‌روزرسانی ناموفق: ${error.message}`; logError('داشبورد تصمیم‌گیری', error);
    } finally { loading = false; $('dd-refresh').disabled = false; schedule(); }
  }

  root.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', async () => {
    activeMode = button.dataset.mode;
    root.querySelectorAll('[data-mode]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    root.querySelectorAll('[data-mode-panel]').forEach((panel) => { panel.hidden = panel.dataset.modePanel !== activeMode; });
    await paintView();
  }));
  root.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', async () => {
    const panel = button.closest('[data-mode-panel]'), mode = panel.dataset.modePanel; activeViews[mode] = button.dataset.view;
    panel.querySelectorAll('[data-view]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    await paintView();
  }));
  $('dd-scope').addEventListener('change', async () => { fillSelectors(true); await fetchTape(); await paintView(); });
  $('dd-underlying').addEventListener('change', async () => { fillSelectors(true); await fetchTape(); await paintView(); });
  $('dd-expiry').addEventListener('change', async () => { fillSelectors(true); await fetchTape(); await paintView(); });
  $('dd-contract').addEventListener('change', async () => { await fetchTape(); await paintView(); });
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
  paintInterval(); await refresh();
  return () => {
    clearTimeout(timer); clearInterval(countdown);
    for (const dispose of embedded.values()) { try { dispose?.(); } catch { /* برچیدن نباید بترکد */ } }
  };
}
