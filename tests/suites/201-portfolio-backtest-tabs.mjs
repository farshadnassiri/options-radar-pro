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
