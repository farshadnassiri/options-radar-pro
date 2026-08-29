// ۲۰۱. صفحهٔ تب‌بندی‌شدهٔ آزمون همه استراتژی‌ها

import { check, group, readSrc } from '../harness.mjs';

const tab201 = readSrc('../ui/tabs/portfolio-backtest.mjs');
const host201 = readSrc('../ui/chart-host.mjs');
const style201 = readSrc('../ui/style.css');

group('۲۰۱. صفحهٔ تب‌بندی‌شدهٔ آزمون همه استراتژی‌ها');
{
  // ── نه پنل، هر کدام یک موضوع ────────────────────────────────────────
  const panels201 = ['setup', 'overview', 'ranking', 'heatmap', 'trend', 'metrics', 'distribution', 'drill', 'basket'];
  for (const id of panels201) {
    check(`پنل «${id}» در قالب هست`, tab201.includes(`data-panel="${id}"`), id);
  }
  check('نوار تب از کمک‌تابع مشترک ساخته می‌شود، نه از نو',
    tab201.includes("mountSubtabs($('pb-tabs'), PB_TABS,"));
  check('همهٔ پنل‌ها جز راه‌اندازی، پیش از اجرا پنهان‌اند',
    panels201.filter((id) => id !== 'setup')
      .every((id) => tab201.includes(`data-panel="${id}" hidden`)));

  // ── عدسی مشترک ──────────────────────────────────────────────────────
  check('چهار انتخاب عدسی در قالب‌اند',
    ['pb-basis', 'pb-stat', 'pb-weighting', 'pb-from', 'pb-to'].every((id) => tab201.includes(`id="${id}"`)));
  check('هر تغییر عدسی فقط بازساخت است، نه اجرای دوباره',
    tab201.includes('const relens = (patch) => { lens = { ...lens, ...patch }; recompute(); };')
    && !/relens[\s\S]{0,200}runAll\(/.test(tab201));
  check('بازساخت از همان ماتریسِ اجرا می‌آید و بازپخش تازه نمی‌کند',
    tab201.includes('analysis = analyzePortfolio({')
    && tab201.includes('rows: payloadRows, matrix: payloadMatrix,')
    && !/function recompute\(\)[\s\S]{0,600}replayHistory\(/.test(tab201));
  check('عدسی در تب راه‌اندازی پنهان می‌شود',
    tab201.includes("$('pb-lens').hidden = id === 'setup';"));

  // ── نمودار فقط وقتی دیده می‌شود رسم می‌شود ─────────────────────────
  check('پنل دیده‌نشده رسم نمی‌شود',
    tab201.includes('if (!analysis || !dirty.has(id))') && tab201.includes("dirty.add('heatmap')"));
  check('ظرف نمودار ارتفاع صریح دارد تا بوم صفر نشود',
    style201.includes('.pb-chart { width: 100%; min-width: 0; height: 320px; }'));

  // ── نقصی که فقط مرورگر پیدایش کرد ──────────────────────────────────
  // ورود مستقیم به تب کاوش، جدول ترکیب‌ها را خالی می‌گذاشت: هیچ استراتژی
  // انتخاب نشده بود و عنوان دعوت‌کننده، خالی‌بودن را طبیعی نشان می‌داد.
  check('ورود مستقیم به کاوش، بهترین استراتژی را انتخاب می‌کند',
    tab201.includes('const fallback = analysis.strategies.find((row) => row.strategyId === selectedStrategyId)')
    && tab201.includes('analysis.best?.strategyId')
    && tab201.includes('if (fallback) selectStrategy(fallback, { jump: false });'));

  // ── نتیجهٔ کهنه کنار انتخاب تازه نمی‌ماند ──────────────────────────
  check('عوض‌کردن نماد یا دامنه، گزارش قبلی را پاک می‌کند',
    tab201.includes('function hideReport()')
    && tab201.includes('charts.disposeAll();')
    && (tab201.match(/hideReport\(\)/g) || []).length >= 4);
  check('نمودارها با ترک تب آزاد می‌شوند',
    tab201.includes('activeWorker?.terminate();') && /return \(\) => \{[\s\S]{0,120}charts\.disposeAll\(\);/.test(tab201));

  // ── میزبان نمودار ───────────────────────────────────────────────────
  check('ماژول نمودار محلی است، نه از شبکهٔ توزیع محتوا',
    host201.includes("import('/vendor/echarts/echarts.esm.min.js')")
    && !/https?:\/\//.test(host201.replace(/^\s*\/\/.*$/gm, '')));
  check('رنگ نمودار از توکن همان صفحه خوانده می‌شود',
    host201.includes("cssVar(style, '--gain')") && host201.includes('getComputedStyle(document.body)'));
  check('هیچ رنگ سخت‌کدشده‌ای در میزبان نمودار نمانده',
    !/#[0-9a-fA-F]{3,8}\b|rgba?\s*\(/.test(host201));
  check('نبود ماژول نمودار، صفحه را از کار نمی‌اندازد',
    host201.includes('کتابخانهٔ نمودار بار نشد؛ جدول‌های همین بخش همان داده را دارند.'));
  check('سری کم‌شده روی نمودار نمی‌ماند',
    host201.includes('{ notMerge: true }'));
  check('نمودار با تغییر اندازهٔ ظرف بزرگ می‌شود',
    host201.includes('new ResizeObserver(() => instance.resize())'));
}

// ═══ تایم‌فریم پایین: همان ترکیب، ساعت‌به‌ساعت ═══
group('۲۰۱-ب. تایم‌فریم پایین');
{
  check('ریزمعامله فقط برای پاهای همین ترکیب و نماد پایه گرفته می‌شود',
    tab201.includes('const codes = [...new Set([String(ua.ins), ...item.legs.map((leg) => String(leg.ins))])];')
    && tab201.slice(tab201.indexOf('async function renderIntraday(')).includes('/api/trades?ins='));
  check('هر لحظهٔ جلسه یک ردیف می‌شود',
    tab201.includes('for (const [second, label] of MARK_MOMENTS)'));
  check('ساعتی که پایی قیمت نداشته، عدد جعل نمی‌کند',
    tab201.includes("rows.push({ label, ok: false, why: 'تا این ساعت هیچ پایی معامله نشده بود' })")
    && tab201.includes("rows.push({ label, ok: false, why: 'یکی از پاها تا این ساعت قیمت نداشت' })"));
  // برشِ دقیقِ همان تابع، نه پنجرهٔ نویسه‌ای: پنجره با هر خط تازه‌ای که
  // بالایش اضافه شود بی‌صدا از دست می‌رود.
  const intraday201 = tab201.slice(tab201.indexOf('async function renderIntraday('),
    tab201.indexOf('function showDetail(item) {'));
  check('بازده ساعت‌به‌ساعت روی همان مبنای عدسی حساب می‌شود',
    intraday201.includes('returnOnBasis(final.netPnl, {') && intraday201.includes('}, lens.basisId).pct,'));
  // شمار «ابزارِ افتاده» اینجا دروغِ آماری بود: ریزمعامله عمداً فقط برای
  // پاهای همین ترکیب گرفته می‌شود، پس هر ابزار دیگری «افتاده» شمرده می‌شد
  // در حالی که اصلاً پرسیده نشده بود.
  check('شمار ابزارِ افتاده گزارش نمی‌شود، چون پرسیده نشده بود',
    !tab201.includes('dropped: marked.dropped,')
    && !tab201.includes('ابزار دیگر تا این ساعت معامله نشده بود'));
  check('به‌جایش قیمت واقعی هر پا در همان ساعت نشان داده می‌شود',
    tab201.includes('exitAt: final.perLeg.map((leg) => leg.exitPrice),')
    && tab201.includes('پا با قیمت'));
  check('رنگ ردیف ساعت به عدد حساس است', intraday201.includes('heatLevel(row.pct, bound)'));
}
