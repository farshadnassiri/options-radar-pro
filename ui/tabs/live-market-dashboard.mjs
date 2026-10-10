// مجموعه داشبوردهای تصمیم‌گیری زنده بازار.
// نوار تب صفحه؛ هر حالت چند نمای تنبل دارد و انتخاب دامنه در همه مشترک است.

import { fmt, faDigits, faClock } from '/ui/fmt.mjs';
import { liveOptionTape } from '/core/live-market.mjs';
import { dashboardScope, reviveDashboardUniverse } from '/core/decision-dashboard.mjs';
import { mountClearPicture } from '/ui/clear-picture-view.mjs';
import { mountIvCharts } from '/ui/iv-charts-view.mjs';
import { mountVolRank } from '/ui/vol-rank-view.mjs';
import { mountContractCandles } from '/ui/contract-candles-view.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { logError } from '/ui/errlog.mjs';
import { fetchLiveTape } from '/ui/quote-intake.mjs';
import { dashboardClock } from '/core/watch-health.mjs';
import { busyBlock, attachBusyBar } from '/ui/busy.mjs';
import { createOpenViewBaseSyncGate } from '/ui/open-view-selection.mjs';
import { mountLiveMarketMap } from '/ui/live-market-map.mjs';
import { pushUaTurnover } from '/ui/scanner.mjs';
import { SCOPE_LEVELS, resolveScope, needsTape } from '/ui/live-dashboard-scope.mjs';

const dateLabel = (value) => faDigits(historyDateLabel(value));

// ————— زیرتب‌ها پس از بازچینیِ ۱۴۰۵/۰۷/۱۷ —————
//
// خواستهٔ صاحب پروژه: (۱) «برترین موقعیت‌ها» از رصد لحظه‌ای حذف شود؛ (۲) از
// «تلاطم و انتظارات» فقط «نگاه باز چندروزه» بماند و نام تب «نگاه باز» شود؛
// (۳) «مقایسه در زنجیره»، «نبض و جهت بازار»، «نقدینگی و سررسید»، «اختیارهای
// پرمعامله» و «دیده‌بان زنجیره» در یک تب به نام «تصویر شفاف» خلاصه شوند —
// «خیلی از اطلاعات آن‌ها ممکن است به درد نخورد»؛ هدف، دیدِ از کل به جزء است
// (`ui/clear-picture-view.mjs`, `core/clear-picture.mjs`).
//
// پنجاه نمای رتبه‌ای و ساختاری آن پنج زیرتب با این بازچینی رفتند؛ ماژول‌های
// مستقلشان (`ui/tabs/chain.mjs`، `ui/tabs/top.mjs`، `ui/chain-compare-view.mjs`)
// دست‌نخورده در مخزن مانده‌اند ولی دیگر در این صفحه سوار نمی‌شوند.
//
// ستون چهارم (`kind`) شکل نما را می‌گوید.
const openViewViews = [
  ['open-view-history', 'نگاه باز چندروزه', 'open-view', 'contracts', 'ivPct'],
];

// تب پایهٔ ادغام‌شده: ماژولش دست‌نخورده می‌ماند و همان‌جا تنبل بار می‌شود.
const EMBEDDED_MODES = [
  // ترکیب آزاد سهم، کال و پوت با نسبت‌های مختلف — بی کاتالوگ (۱۴۰۵/۰۷/۱۳).
  { id: 'scanner', title: 'اسکنر آپشن', hint: 'ترکیب آزاد سهم، کال و پوت با ریسک محدود؛ کارت‌های یک‌نگاه', mod: '/ui/tabs/combo-scanner.mjs' },
];

// ————— تب‌بندی صفحه —————
//
// خواسته صاحب پروژه: «صفحه را تب‌بندی کن» و «تمام قسمت‌های این بخش را
// یکپارچه کن». همهٔ حالت‌ها و خودِ نقشه، **هم‌ردیف** در یک نوار تب‌اند. نقشه
// تب نخست است چون مسیر اصلی تصمیم از آنجا شروع می‌شود و انتخابش، دامنهٔ همه
// تب‌های دیگر را هم می‌سازد؛ «تصویر شفاف» کنارش، چون نگاهِ کل پیش از جزء است.
export const IV_SUBTABS = [['charts', 'نمودارهای نوسان ضمنی'], ['rank', 'رتبه و صدک تلاطم']];

export const DASHBOARD_MODES = [
  { id: 'explorer', title: 'نقشه و زنجیره', hint: 'نقشه بازار، سررسید و زنجیره', views: [], explorer: true },
  { id: 'clear', title: 'تصویر شفاف', hint: 'از کل به جزء: ارزش، کال و پوت، جهت در طول روز و ترین‌ها', views: [], clear: true },
  // خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۵): کندل امروز به تب جدا، با نمودار مادرِ همهٔ
  // کندل‌ها، شاخص قابل انتخاب، توزیع میله‌ای و خروجی اکسل (`core/contract-candles.mjs`).
  { id: 'candles', title: 'کندل قیمت امروز قراردادها', hint: 'نمودار مادر همهٔ کندل‌ها، تلاطم کندلی، توزیع میله‌ای و خروجی اکسل', views: [], candles: true },
  // همان تب برای یک روز گذشته (۱۴۰۵/۰۷/۱۵): داده از `ui/contract-candles-past.mjs`.
  { id: 'candles-past', title: 'کندل بازار در گذشته', hint: 'همان نمودار مادر، توزیع و اکسل برای یک روز گذشته', views: [], candlesPast: true },
  // خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۱): «هدف دیدن نوسان ضمنی در طول زمان است» —
  // نمودار مادر روزانه برای شاخص پایه یا هر قرارداد، قراردادهای یک سررسید روی
  // هم، و نمودار بازه در تایم‌فریم دلخواه (`core/iv-chart.mjs`).
  { id: 'iv-charts', title: 'نوسان ضمنی', hint: 'نوسان ضمنی هر نماد و قرارداد در طول زمان، قراردادهای یک سررسید، و بازه در تایم‌فریم دلخواه', views: [], ivCharts: true },
  { id: 'open-view', title: 'نگاه باز', hint: 'تحلیل چندروزهٔ نگاه باز روی نماد انتخابی', views: openViewViews },
  // «رتبه و صدک تلاطم» (۱۴۰۵/۰۷/۱۰، منطق در `core/vol-rank.mjs`) از ۱۴۰۵/۰۷/۱۷
  // زیرتبِ جدای همین «نوسان ضمنی» است، نه تبی در این نوار (`IV_SUBTABS`).
  ...EMBEDDED_MODES.map((mode) => ({ ...mode, views: [] })),
];

// ————— ستون‌ها، به‌ازای هر سطح —————
//
// خواسته کاربر: «اطلاعاتی که از کل نماد می‌گیریم با اطلاعاتی که از سررسید
// یا یک قرارداد می‌گیریم متفاوت است.» جدول قبلی یک قالب دوازده‌ستونه برای
// همه بود، پس ردیف نماد پایه ستون «سررسید» می‌گرفت که همیشه «—» بود، و
// ردیف سررسید ستون «آخرین» می‌گرفت که برای یک گروه معنی ندارد.
//
// `base: true` یعنی در نمای آماده هست؛ بقیه از انتخابگر ستون اضافه می‌شوند.
const col = (key, label, fmtName, opt = {}) => ({ key, label, fmt: fmtName, ...opt });

// ── آخرین و پایانی، هر کدام با درصد تغییر نسبت به پایانی دیروز ──────────
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۳): هر جا قیمت نشان داده می‌شود، آخرین و
// پایانی هر دو با درصد تغییر؛ مبنای درصد همیشه پایانی روز قبل. «آخرین» فقط
// معامله است (`tradeLast`)؛ ستون «قیمت جاری» همان آخرین، یا پایانی اگر
// معامله نشد، با نام صریح خودش می‌ماند.
const PRICE_PAIR_COLS = (group) => [
  col('tradeLast', 'آخرین معامله', 'money', { group, base: true }),
  col('lastChangePct', 'تغییر آخرین نسبت به پایانی دیروز ٪', 'pct', { group, base: true, heat: 'gain', sign: true }),
  col('close', 'پایانی', 'money', { group, base: true }),
  col('closeChangePct', 'تغییر پایانی نسبت به پایانی دیروز ٪', 'pct', { group, base: true, heat: 'gain', sign: true }),
  col('yday', 'پایانی دیروز', 'money', { group }),
  col('last', 'قیمت جاری (آخرین، یا پایانی بی‌معامله)', 'money', { group }),
  col('changePct', 'تغییر قیمت جاری نسبت به پایانی دیروز ٪', 'pct', { group, heat: 'gain', sign: true }),
];
const PRICE_PAIR_COLS_UA = [
  col('uaLast', 'آخرین معاملهٔ پایه', 'money', { group: 'قیمت پایه' }),
  col('uaLastPct', 'تغییر آخرین پایه نسبت به پایانی دیروز ٪', 'pct', { group: 'قیمت پایه', heat: 'gain', sign: true }),
  col('uaClose', 'پایانی پایه', 'money', { group: 'قیمت پایه' }),
  col('uaClosePct', 'تغییر پایانی پایه نسبت به پایانی دیروز ٪', 'pct', { group: 'قیمت پایه', heat: 'gain', sign: true }),
];

const COLS_CONTRACT = [
  col('title', 'قرارداد', 'sym', { group: 'شناسه', base: true }),
  col('uaName', 'نماد پایه', 'text', { group: 'شناسه', base: true }),
  col('kindLabel', 'نوع', 'text', { group: 'شناسه', base: true }),
  col('strike', 'قیمت اعمال', 'money', { group: 'شناسه', base: true }),
  col('expiryText', 'سررسید', 'text', { group: 'شناسه', base: true }),
  col('days', 'روز مانده', 'int', { group: 'شناسه' }),
  col('spot', 'قیمت جاری پایه', 'money', { group: 'قیمت پایه' }),
  ...PRICE_PAIR_COLS_UA,
  ...PRICE_PAIR_COLS('قیمت'),
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
  // صدک، نه تاریخچه: دفترِ سفارشِ گذشته ذخیره نمی‌شود، پس «اسپرد امروز در
  // برابر عادتِ خودِ این قرارداد» ساختنی نیست. آنچه ساختنی است، جای همین
  // قرارداد در میان تابلوی امروز است — و برای تصمیمِ «اجرایش گران است یا
  // نه» همان‌قدر کار می‌کند.
  col('spreadRankPct', 'صدک فاصله مظنه ٪', 'pct', { group: 'مظنه', heat: 'loss' }),
  col('volume', 'حجم', 'int', { group: 'گردش امروز', base: true, heat: 'gain' }),
  col('value', 'ارزش معامله (میلیون ریال)', 'mrial', { group: 'گردش امروز', base: true, heat: 'gain' }),
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


export async function mount(root, { state, api }) {
  root.innerHTML = `<section class="live-dashboard-hero"><div><p class="eyebrow">مرکز تصمیم‌گیری زنده بازار اختیار</p><h1>داشبورد معاملاتی لحظه‌ای</h1><p>هر جدول و نمودار از عکس واقعی بازار و معاملات امروز بازسازی می‌شود. درصد تغییر، آخرین قیمت را فقط با قیمت پایانی دیروز مقایسه می‌کند.</p></div><div><button type="button" class="ghost" id="dd-refresh">به‌روزرسانی اکنون</button><button type="button" class="ghost" id="dd-pause">توقف خودکار</button><span id="dd-status" role="status">در انتظار نخستین عکس…</span></div></section>
    <nav class="dd-tabbar" role="tablist" aria-label="بخش‌های رصد زنده بازار">${DASHBOARD_MODES.map((mode, index) => `<button type="button" role="tab" data-mode="${mode.id}" title="${mode.hint}" aria-selected="${index === 0}" aria-pressed="${index === 0}"><b>${mode.title}</b><small>${mode.hint}</small></button>`).join('')}</nav>
    <section class="card decision-toolbar" id="dd-toolbar" hidden>
      <div class="decision-scope-live"><div><p class="eyebrow">دامنه تحلیل</p><p class="note" id="dd-scope-note">کل بازار اختیار</p></div><div class="decision-level-switch" role="group" aria-label="سطح دامنه">${SCOPE_LEVELS.map(([key, label], index) => `<button type="button" data-dd-level="${key}" aria-pressed="${index === 0}">${label}</button>`).join('')}</div></div>
      <p class="note dd-scope-hint">انتخاب از همان نقشه و زنجیرهٔ تب نخست خوانده می‌شود؛ اینجا دوباره نماد و سررسید نمی‌پرسیم. برای عوض‌کردن نماد به تب «نقشه و زنجیره» برگرد.</p>
    </section>
    <div class="decision-main">${DASHBOARD_MODES.map((mode, modeIndex) => mode.explorer
      ? `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><div id="dd-market-explorer"></div></section>`
      : mode.clear
        ? `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><div data-clear-host></div></section>`
      : mode.candlesPast
        ? `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><div data-candles-past-host></div></section>`
      : mode.candles
        ? `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><div data-candles-host></div></section>`
      : mode.ivCharts
        ? `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><nav class="cp-tabs dd-subtabs" role="tablist" aria-label="بخش‌های نوسان ضمنی">${IV_SUBTABS.map(([id, label]) => `<button type="button" role="tab" data-iv-sub="${id}" aria-selected="${id === 'charts'}">${label}</button>`).join('')}</nav><div data-iv-sub-panel="charts"><div data-iv-charts-host></div></div><div data-iv-sub-panel="rank" hidden><div data-vol-rank-host></div></div></section>`
      : mode.mod
        ? `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><div data-embedded-host></div></section>`
        : `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><div class="section-head"><div><p class="eyebrow">حالت تصمیم‌گیری</p><h2>${mode.title}</h2></div><span>${mode.hint}</span></div><div class="decision-view-buttons" ${mode.views.length < 2 ? 'hidden' : ''}>${mode.views.map((view, index) => `<button type="button" data-view="${view[0]}" aria-pressed="${index === 0}">${fmt.int(index + 1)}. ${view[1]}</button>`).join('')}</div><section class="card decision-view-card"><div class="section-head"><h3 data-view-title>${mode.views[0][1]}</h3><span data-view-scope>کل بازار</span></div><div data-view-host>${busyBlock('در حال دریافت نخستین عکس بازار… این مرحله چند ثانیه طول می‌کشد.', { lines: 4 })}</div><div data-open-view-host class="decision-open-view" hidden></div></section></section>`).join('')}</div>`;

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
  let loading = false, paused = false, timer = null, tape = [], openViewMounted = false, openViewController = null;
  const openViewBaseSync = createOpenViewBaseSyncGate();
  let lastUaIns = '';
  // دستگیرهٔ «زمان به‌روزرسانی» به خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۷) از
  // «تصویر شفاف» رفت؛ آهنگ همان انتخابِ ذخیره‌شده یا آهنگِ دیده‌بان در تنظیمات است.
  const intervalSec = Math.max(5, Math.min(60, Number(localStorage.getItem('options-radar:dashboard-interval')) || Number(state.settings.watchIntervalSec) || 15));

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
  // «تصویر شفاف» تنبل سوار می‌شود: تا کاربر بازش نکرده، هیچ کاری نمی‌کند.
  // دامنه همان نوار سطح است و هر جزء با کلیک، انتخابِ نقشه را یک پله پایین
  // می‌برد — انتخاب همچنان یک منبع دارد: نقشه.
  let clearView = null;
  const clear = () => {
    if (!clearView) {
      clearView = mountClearPicture(root.querySelector('[data-clear-host]'), {
        getScope: () => selected(),
        rowsAt: (level) => dashboardScope(payload.universe, { ...selected(), level }).contracts,
        underlyingsAt: () => dashboardScope(payload.universe, selected()).underlyings,
        getTape: () => tape,
        getSession: () => payload.session,
        pickUnderlying: (uaIns) => marketExplorer.pickUnderlying(uaIns),
        pickExpiry: (uaIns, endDate) => marketExplorer.pickExpiry(uaIns, endDate),
        pickContract: (row) => marketExplorer.pickContract(row),
        setLevel: (level) => root.querySelector(`[data-dd-level="${level}"]`)?.click(),
        isVisible: () => activeMode === 'clear' && root.isConnected,
      });
    }
    return clearView;
  };
  // تب «نوسان ضمنی» هم تنبل سوار می‌شود و نماد را از همان نقشه می‌گیرد. دو
  // زیرتب دارد و هر کدام فقط وقتی دیده می‌شود کار می‌کند (دریافت تاریخچه هم).
  let ivSub = localStorage.getItem('options-radar:iv-subtab') === 'rank' ? 'rank' : 'charts';
  let ivChartsView = null, volRankView = null;
  const volRank = () => {
    if (!volRankView) {
      volRankView = mountVolRank(root.querySelector('[data-vol-rank-host]'), {
        getSelection: () => marketExplorer.selection(),
        getPayload: () => payload,
        getSettings: () => state.settings,
        isVisible: () => activeMode === 'iv-charts' && ivSub === 'rank' && root.isConnected,
      });
    }
    return volRankView;
  };
  function paintIvSub() {
    root.querySelectorAll('[data-iv-sub]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ivSub === ivSub)));
    root.querySelectorAll('[data-iv-sub-panel]').forEach((panel) => { panel.hidden = panel.dataset.ivSubPanel !== ivSub; });
    if (ivSub === 'rank') volRank().paint(); else ivCharts().paint();
  }
  const ivCharts = () => {
    if (!ivChartsView) {
      ivChartsView = mountIvCharts(root.querySelector('[data-iv-charts-host]'), {
        getSelection: () => marketExplorer.selection(),
        getPayload: () => payload,
        getSettings: () => state.settings,
        isVisible: () => activeMode === 'iv-charts' && ivSub === 'charts' && root.isConnected,
      });
    }
    return ivChartsView;
  };

  // تب کندل تنبل سوار می‌شود و گزینش خودش را دارد (نه از نقشه). کمینه و
  // بیشینه فقط وقتی همین تب دیده می‌شود گرفته می‌شوند.
  let candlesView = null;
  const candles = () => {
    if (!candlesView) {
      candlesView = mountContractCandles(root.querySelector('[data-candles-host]'), {
        getPayload: () => payload,
        getSettings: () => state.settings,
        greekParams,
        isVisible: () => activeMode === 'candles' && root.isConnected,
        onOpenContract: (row) => {
          marketExplorer.pickContract(row);
          root.querySelector('[data-mode="explorer"]')?.click();
          root.querySelector('[data-lmm-chain-step]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      });
    }
    return candlesView;
  };
  // تب کندل گذشته هم تنبل سوار می‌شود؛ تا کاربر روز را نخواسته، چیزی گرفته نمی‌شود.
  let candlesPastView = null;
  const candlesPast = () => {
    if (!candlesPastView) {
      candlesPastView = mountContractCandles(root.querySelector('[data-candles-past-host]'), {
        mode: 'past',
        getPayload: () => payload,
        getSettings: () => state.settings,
        greekParams,
        isVisible: () => activeMode === 'candles-past' && root.isConnected,
      });
    }
    return candlesPastView;
  };


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
    const host = root.querySelector('[data-mode-panel="open-view"] [data-open-view-host]');
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

  async function paintView() {
    const mode = modeOf();
    // نوار دامنه فقط بالای تبی می‌آید که واقعاً دامنه می‌خواهد: «تصویر شفاف».
    // روی نقشه، «نگاه باز» (انتخابگر نماد خودش را دارد) و تب‌های ادغام‌شده،
    // کنترلی که هیچ کاری نمی‌کند نمایش داده نمی‌شود.
    $('dd-toolbar').hidden = !mode?.clear;
    if (mode?.explorer) { paintLevels(); return; }
    if (mode?.clear) {
      $('dd-scope-note').textContent = scopeLabel(dashboardScope(payload.universe, selected()));
      await clear().paint(); return;
    }
    if (mode?.candles) { candles().paint(); return; }
    if (mode?.candlesPast) { candlesPast().paint(); return; }
    if (mode?.ivCharts) { paintIvSub(); return; }
    if (mode?.mod) { await mountEmbedded(mode); return; }
    const panel = root.querySelector(`[data-mode-panel="${activeMode}"]`), view = viewOf();
    if (!panel || !view) return;
    const host = panel.querySelector('[data-view-host]'), openHost = panel.querySelector('[data-open-view-host]');
    panel.querySelector('[data-view-title]').textContent = view[1];
    panel.querySelector('[data-view-scope]').textContent = 'نماد از نقشه یا انتخابگرِ خودِ نگاه باز';
    host.hidden = view[2] === 'open-view'; openHost.hidden = view[2] !== 'open-view';
    if (view[2] === 'open-view') await syncOpenView();
  }

  // ریزمعامله فقط برای نمایی که آن را نشان می‌دهد.
  //
  // پیش از این هر تیکِ خودکار یک `live-trades` می‌زد، حتی وقتی کاربر روی
  // نقشه بود؛ روی بازهٔ ۵ ثانیه‌ای یعنی ۷۲۰ درخواست در ساعت برای داده‌ای که
  // هیچ‌جا رسم نمی‌شد.
  //
  // نوارِ قبلی تا رسیدنِ نوارِ تازهٔ **همان قرارداد** می‌ماند (۱۴۰۵/۰۷/۱۸):
  // پیش‌تر هر تیک اول `tape = []` می‌کرد و یک دریافتِ ناموفق دو نمودار
  // درون‌روزیِ «تصویر شفاف» را به یادداشتِ «ریزمعامله نرسیده» برمی‌گرداند.
  // فقط عوض‌شدنِ قرارداد نوار را خالی می‌کند.
  let tapeFor = '';
  async function fetchTape() {
    const pick = selected();
    if (!needsTape(pick.level, modeOf()?.clear ? 'clear' : viewOf()?.[2])) { tape = []; tapeFor = ''; return; }
    const key = `${pick.uaIns}|${pick.contractIns}`;
    if (key !== tapeFor) { tape = []; tapeFor = key; }
    const contract = activeContract(); if (!contract) return;
    try {
      const got = await fetchLiveTape([pick.uaIns, contract.ins]);
      if (got.errors.length) throw new Error(got.errors[0].why);
      const optionRows = got.byIns[contract.ins]?.rows || [], baseRows = got.byIns[pick.uaIns]?.rows || [];
      // نوارِ خامِ پایه با نامِ درستِ پارامتر. پیش از این `underlyingTape`
      // می‌رفت که تابع اصلاً نمی‌خواند؛ هر ۳٬۰۱۶ معاملهٔ ضفزر729 بی قیمت پایه
      // و بی IV می‌ماند. تابع حالا کلیدِ ناشناخته را رد می‌کند.
      const fresh = liveOptionTape({ trades: optionRows, baseTrades: baseRows, contract, settings: state.settings });
      // پاسخِ دیررسیدهٔ قراردادِ قبلی روی نوارِ قرارداد تازه نمی‌نشیند.
      if (tapeFor === key) tape = fresh;
    } catch (error) { logError('ریزمعامله داشبورد تصمیم‌گیری', error); }
  }

  function schedule() {
    clearTimeout(timer); if (paused) return;
    timer = setTimeout(refresh, intervalSec * 1000);
  }

  // ── دریافتِ پس‌زمینه بی‌صداست (۱۴۰۵/۰۷/۱۶) ──
  // «می‌خواهم دریافت دیتا را کاربر اصلاً متوجه نشود.» تیکِ خودکار دیگر
  // «در حال دریافت…» نمی‌نویسد، نوارِ درجریان را روشن نمی‌کند و دکمه را خاموش
  // نمی‌کند؛ فقط وقتی داده رسید، عددها و خطِ وضعیت عوض می‌شوند. کلیکِ
  // دستیِ «به‌روزرسانی اکنون» همچنان بازخورد می‌گیرد — آنجا کاربر منتظر است.
  async function refresh(event) {
    if (loading) return;
    const manual = Boolean(event?.type);
    loading = true;
    if (manual) {
      $('dd-refresh').disabled = true; $('dd-status').textContent = 'در حال دریافت عکس تازه بازار…';
      $('dd-status').className = ''; busyBar?.busy(true);
    }
    try {
      const response = await fetch('/api/live-dashboard', { cache: 'no-store' }), next = await response.json();
      if (!response.ok || next.error) throw new Error(next.error || `HTTP ${response.status}`);
      // `NaN`ِ سرور پس از JSON `null` است و `Number(null)` صفر؛ مرز همین‌جاست.
      next.universe = reviveDashboardUniverse(next.universe);
      // عکسِ خالی یا بی‌قرارداد شکست است، نه داده (۱۴۰۵/۰۷/۱۸): پیش‌تر یک
      // پاسخِ خالی انتخابِ نقشه را به نخستین نماد می‌پراند و همهٔ نمودارها
      // بسته می‌شدند. آخرین عکسِ سالم می‌ماند و فقط خطِ وضعیت خطا را می‌گوید.
      // تا عکسِ سالمی نرسیده، همان پاسخ پذیرفته می‌شود (چیزی برای نگه‌داشتن نیست).
      const hadGood = payload.universe.underlyings.length > 0;
      if (hadGood && (!next.universe?.underlyings?.length || !next.universe?.contracts?.length)) {
        throw new Error('عکس تازهٔ بازار خالی یا ناقص بود؛ آخرین عکس سالم نگه داشته شد');
      }
      payload = next; openViewController?.updateLive?.(payload);
      // همان گردش پایه به زنجیرهٔ ریسه (دیده‌بان زنجیره و اسکنرها) — یک عدد در همه‌جا.
      pushUaTurnover(payload.universe?.underlyings || [], next.at).catch?.(() => {});
      await marketExplorer.setUniverse(payload.universe, true, payload);
      paintLevels(); await fetchTape(); await paintView();
      // دو زمان، دو ادعا. «عکس» زمانی است که تابلو خوانده شده و «دریافت»
      // زمانی که پاسخ رسیده؛ پیش از این فقط دومی نشان داده می‌شد و رابط
      // هر پنج ثانیه ادعا می‌کرد داده تازه است.
      const clock = dashboardClock({ snapshotAt: next.snapshotAt, at: next.at });
      // زمانِ عکسِ بازار برای «تاریخ داده» در تصویرِ هر نمودار و جدولِ این داشبورد.
      if (!clock.unknown) root.dataset.asof = String(clock.snapshotAt);
      const stamp = clock.unknown
        ? 'زمان عکس نامعلوم'
        : `عکس ${faClock(new Date(clock.snapshotAt))} · ${faDigits(clock.ageSec)} ثانیه پیش`;
      // عکس کهنهٔ بالادست (سنجش `boardFreshness` در سرور) بی‌برچسب نمی‌ماند.
      const boardStale = next.session?.stale?.why ? `⚠ ${next.session.stale.why} · ` : '';
      // جلسهٔ قبل با قراردادهایی که در همان جلسه سررسید شدند (`core/session-board.mjs`).
      const expiring = Number(next.session?.expiring) > 0 ? ` · شامل ${fmt.int(next.session.expiring)} قرارداد که در همان جلسه سررسید شد` : '';
      $('dd-status').textContent = `${boardStale}${stamp} · دریافت ${faClock(new Date(clock.at || Date.now()))} · ${fmt.int(next.universe?.contracts?.length || 0)} قرارداد · ${fmt.int(next.traded || 0)} پایه معامله‌شده${expiring}`;
      $('dd-status').className = clock.stale || boardStale ? 'loss' : '';
    } catch (error) {
      $('dd-status').textContent = `به‌روزرسانی ناموفق: ${error.message}`; logError('داشبورد تصمیم‌گیری', error);
    } finally { loading = false; $('dd-refresh').disabled = false; if (manual) busyBar?.busy(false); schedule(); }
  }

  // کاشیِ «رتبهٔ تلاطم» روی نقشه (و هر پیوند درونی دیگر) تب خودش را باز می‌کند.
  // «رتبه و صدک تلاطم» زیرتبِ «نوسان ضمنی» است: همان تب، با زیرتبِ رتبه.
  root.addEventListener('click', (event) => {
    const sub = event.target.closest('[data-iv-sub]');
    if (sub) { ivSub = sub.dataset.ivSub; localStorage.setItem('options-radar:iv-subtab', ivSub); paintIvSub(); return; }
    const link = event.target.closest('[data-open-mode]');
    if (!link) return;
    if (link.dataset.openMode === 'vol-rank') { ivSub = 'rank'; localStorage.setItem('options-radar:iv-subtab', ivSub); root.querySelector('[data-mode="iv-charts"]')?.click(); return; }
    root.querySelector(`[data-mode="${link.dataset.openMode}"]`)?.click();
  });

  root.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', async () => {
    activeMode = button.dataset.mode;
    root.querySelectorAll('[data-mode]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button));
      item.setAttribute('aria-selected', String(item === button));
    });
    root.querySelectorAll('[data-mode-panel]').forEach((panel) => { panel.hidden = panel.dataset.modePanel !== activeMode; });
    // تب کندل با باز شدن خودش (در `paintView`) کمینه/بیشینهٔ کهنه را تازه
    // می‌کند — نه در هر تیکِ پس‌زمینه وقتی کسی نگاهش نمی‌کند.
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
  $('dd-refresh').addEventListener('click', refresh);
  $('dd-pause').addEventListener('click', () => { paused = !paused; $('dd-pause').textContent = paused ? 'ادامه خودکار' : 'توقف خودکار'; if (paused) clearTimeout(timer); else refresh(); });
  // نوار باریکِ «در جریان» بالای نوار تب: محتوای موجود پاک نمی‌شود، ولی
  // کاربر می‌بیند که چیزی در راه است.
  const busyBar = attachBusyBar(root.querySelector('.dd-tabbar'), { label: 'در حال دریافت عکس تازه بازار…' });
  paintLevels(); await refresh();
  return () => {
    clearTimeout(timer);
    busyBar?.dispose();
    openViewController?.dispose?.();
    marketExplorer.dispose();
    clearView?.dispose(); volRankView?.dispose(); ivChartsView?.dispose(); candlesView?.dispose(); candlesPastView?.dispose();
    for (const dispose of embedded.values()) { try { dispose?.(); } catch { /* برچیدن نباید بترکد */ } }
  };
}
