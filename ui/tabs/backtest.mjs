import { CATALOG, GROUPS, byId } from '/strategies/catalog.mjs';
import { buildChain, comboContractSize } from '/core/chain.mjs';
import { feesOf } from '/core/settings.mjs';
import {
  HISTORY_BASES, comboKey, flattenActiveContracts, generateHistoricalCombos, historyDateLabel,
  historyMarketMetrics, historyPrice, manualPriceCheck, normalizeHistoryDate,
  replayHistory, rollingEntryMatrix, holdingPeriodProfile, strategyLegSnapshots,
} from '/core/history.mjs';
import {
  replayIntraday, summarizeIntraday, inIntradaySession,
  bucketIntradayPath, observedBuckets, intradayHoldingSummary, timeOfDayProfile, intradayEntryExitProfile,
  TF_BUCKET_STATUS, TF_BUCKET_LABEL, timeframeChartPath,
  intradayPathWithGaps, coverageSummary, baseGapSuspect, TF_DAY_STATUS, TF_DAY_LABEL,
} from '/core/backtest.mjs';
import {
  ivParams, IV_PARAMS, annotateDailyIv, annotateIntradayIv, annotateBucketIv, ivSummary, legDaysToExpiry,
  annotateDailyGreeks,
} from '/core/leg-iv.mjs';
import { downloadBacktestExcel } from '/ui/backtest-export.mjs';
import { addRun, makeRunRecord } from '/core/backtest-runs.mjs';
import { readRuns, writeRuns, runsListHtml, runsCompareHtml } from '/ui/backtest-runs-view.mjs';
import { mountSubtabs } from '/ui/subtabs.mjs';
import {
  ANALYSIS_PANELS, analysisMarkup, paintAnalysis, installAnalysisControls,
} from '/ui/backtest-panels.mjs';
import { tehranDateNumber } from '/core/live-day.mjs';
import {
  splitTradeDays, tradeBatches, dayFromBatch, dayFromLiveTape,
  BATCH_PAIR_CAP, LIVE_CODE_CAP,
} from '/core/trades-source.mjs';
import { mountDateWheel } from '/ui/datewheel.mjs';
import { fmt, faDigits, faClock, signTone, ltr } from '/ui/fmt.mjs';
import { baseAfterRange, loadRange, mountHistoryRange } from '/ui/history-range.mjs';
import { loadHistoricalDailies } from '/ui/history-dailies.mjs';
import { handoffRange, handoffEntryDate } from '/ui/handoff.mjs';
import { clipDates, comboEntryDates, fastPathCodes } from '/ui/backtest-fastpath.mjs';
import { attachExportsIn } from '/ui/export.mjs';
import { logError } from '/ui/errlog.mjs';
import { chart, LEG_COLORS } from '/ui/track-chart.mjs';
import { fetchTapeBatch, tapeSummary, tapeWarning } from '/ui/tape-intake.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[c]));
const nameOf = (entity, fallback = 'بدون نام') => {
  const value = String(entity?.name || '').trim();
  return value && value !== String(entity?.ins || '') ? value : fallback;
};
const dateLabel = (value) => faDigits(historyDateLabel(value));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

// پارامترهای تلاطم ضمنی، فقط برای همین تب.
//
// پیش‌فرض از تنظیمات سراسری می‌آید تا رفتار با بقیهٔ برنامه یکی باشد. ولی
// کسی که می‌خواهد اثر نرخ بدون ریسک را روی همین یک بک‌تست ببیند، نباید
// مجبور شود تنظیمات سراسری را عوض کند و بعد یادش برود برگرداند — پس
// بازنویسی اینجا می‌ماند و با بستن تب می‌رود.
const ivOverride = {};
const errorText = (error, fallback) => /fetch failed|network|failed to fetch/i.test(String(error?.message || error))
  ? 'اتصال به منبع داده برقرار نشد.' : (String(error?.message || '').trim() || fallback);
const clockLabel = (second) => {
  const value = Math.max(0, Math.trunc(Number(second) || 0));
  return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor((value % 3600) / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};
// تلاطم نبوده باید «—» بماند. صفر یعنی «تلاطم صفر» که ادعای دیگری است.
const ivCell = (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—');
const ageLabel = (second) => Number.isFinite(Number(second)) ? `${fmt.int(second)} ثانیه` : '—';

/**
 * نقاط ریزمعامله را برای نمودار آماده می‌کند.
 *
 * `date` باید روزی باشد که همین حالا باز است. `replayIntraday` تاریخ را روی
 * نقاط نمی‌گذارد — ثانیهٔ درون‌روز می‌دهد، نه روز — پس اینجا مهر می‌خورد و
 * تولتیپ از همین می‌خواند. اگر روز اشتباهی مهر شود، هر چهار نمودارِ درون‌روز
 * تاریخ غلط نشان می‌دهند بی‌آنکه هیچ عددی غلط شود، و همین آن را سخت‌یاب
 * می‌کند: عددها درست‌اند، فقط تاریخ بالای تولتیپ مالِ روز دیگری است.
 */
function intradayChartRows(points, date) {
  return points.map((point) => {
    const row = { ...point, date, granularity: 'trade' };
    point.perLeg.forEach((leg, index) => {
      row[`legPnl${index}`] = leg.netPnl;
      row[`legPrice${index}`] = leg.pricePct;
      row[`legVolume${index}`] = leg.cumulativeVolume;
    });
    return row;
  });
}

function basisRail(id, selected = 'LAST') {
  return `<div class="backtest-basis" id="${id}" role="radiogroup" aria-label="مبنای قیمت">${HISTORY_BASES.map(([value, label]) => `<button type="button" data-basis="${value}" role="radio" aria-checked="${value === selected}">${label}</button>`).join('')}</div>`;
}

function setRail(host, value) {
  host.dataset.value = value;
  host.querySelectorAll('[data-basis]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.basis === value)));
}

function marketSnapshot(snapshots, selectedBasis, scope, manual = {}) {
  if (!snapshots?.length) return '<p class="empty-note">ابتدا یک ترکیب معتبر انتخاب کن.</p>';
  return `<div class="backtest-leg-markets">${snapshots.map((snapshot) => {
    const kind = snapshot.kind === 'call' ? 'اختیار خرید' : snapshot.kind === 'put' ? 'اختیار فروش' : 'نماد پایه';
    const prices = HISTORY_BASES.map(([basis, label]) => `<div data-active="${basis === selectedBasis}"><span>${label}</span><b>${fmt.money(snapshot.prices[basis])}</b></div>`).join('');
    const value = manual[snapshot.index];
    return `<article><div class="backtest-leg-market-head"><div><small>پای ${fmt.int(snapshot.index + 1)} · ${snapshot.side === 'buy' ? 'خرید' : 'فروش'} ${kind}</small><b>${esc(nameOf(snapshot, `پای ${snapshot.index + 1}`))}</b></div><span>${snapshot.kind === 'underlying' ? 'دارایی پایه' : `اعمال ${fmt.int(snapshot.strike)}`}</span></div><div class="backtest-price-grid">${prices}</div><div class="backtest-market-strip"><span>حجم <b>${fmt.int(snapshot.market.volume)}</b></span><span>معامله <b>${fmt.int(snapshot.market.trades)}</b></span><span>ارزش ${snapshot.market.valueEstimated ? 'تقریبی' : 'رسمی'} <b>${fmt.money(snapshot.market.value)}</b></span></div><label class="backtest-manual-price">قیمت دستی این پا<input type="number" min="0" step="any" inputmode="decimal" data-manual="${scope}" data-leg="${snapshot.index}" value="${value == null ? '' : esc(value)}" placeholder="خالی بماند = همان مبنای بالا"></label><p class="backtest-manual-note" data-manual-note="${scope}-${snapshot.index}"></p></article>`;
  }).join('')}</div>`;
}

export async function mount(root, { state }) {
  root.innerHTML = `<section class="backtest-hero"><div><p class="eyebrow">بعد از ماتریس‌ها · آزمون یک مسیر مشخص</p><h1>🔬 آزمایشگاه آپشن</h1><p>یک استراتژی را با قیمت مشاهده‌شده روز ورود بچین، مسیر روزانه را ببین و روز سنجش را با ریزمعامله‌های واقعی همان روز بازپخش کن.</p></div><span>بدون قیمت ساختگی</span></section>
  <section class="card backtest-setup"><div class="section-head"><div><p class="eyebrow">گام اول</p><h2>انتخاب سناریو</h2></div><b id="bt-status" role="status">در حال دریافت نمادها…</b></div>
    <div id="bt-range" class="step-first" data-step="۱"></div>
    <div class="backtest-form"><label class="step-next" data-step="۲">نماد پایه<select id="bt-base" disabled><option value="">اول بازه را انتخاب کن</option></select></label><label>استراتژی<select id="bt-strategy"></select></label><label>تعداد واحد<input id="bt-units" type="number" min="1" max="10000" step="1" value="${Math.max(1, state.settings.qtyDefault || 1)}"></label><button type="button" class="primary" id="bt-load">دریافت روزهای قابل اجرا</button></div>
  </section>
  <!-- بایگانی اجراها. بیرون از «بت-ورک» است و این جایش تصادفی نیست: کارش
       مقایسهٔ اجراهای **گذشته** است و آن‌ها ربطی به نمادی که همین حالا
       انتخاب شده ندارند، پس نباید پشت «دریافت تاریخچه» قفل بماند. -->
  <section class="card" id="bt-runs-card">
    <div class="section-head"><div><p class="eyebrow">مقایسهٔ دو تنظیم</p><h2>بایگانی اجراها</h2></div>
      <div class="backtest-head-actions">
        <input type="text" id="bt-run-label" placeholder="یادداشت این اجرا — اختیاری" style="min-width:16rem">
        <button type="button" class="ghost" id="bt-run-save">بایگانی این اجرا</button>
        <span id="bt-run-msg" role="status" aria-live="polite"></span>
      </div></div>
    <div id="bt-runs-list"></div>
    <div class="bar" id="bt-runs-pick" style="flex-wrap:wrap;gap:12px;margin-top:10px"></div>
    <div id="bt-runs-compare"></div>
  </section>

  <section id="bt-work" hidden>
    <nav id="bt-subtabs"></nav>
    <div class="bt-panel" data-panel="bt-setup">
    <div class="backtest-date-grid"><section class="card"><div class="section-head"><div><p class="eyebrow">روز ایجاد</p><h2>تاریخ ورود</h2></div><span>فقط روز دارای ترکیب معتبر</span></div><div id="bt-entry-date"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">روز سنجش</p><h2>تاریخ خروج آزمایشی</h2></div><span>فقط روز دارای قیمت همه پاها</span></div><div id="bt-exit-date"></div></section></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">قراردادهای واقعی</p><h2>ترکیب استراتژی</h2></div><span id="bt-combo-count">—</span></div><label class="backtest-combo">ترکیب قراردادها<select id="bt-combo"></select></label><p class="note" id="bt-fast-note" hidden></p><div id="bt-legs" class="backtest-legs"></div></section>
    <div class="backtest-date-grid"><section class="card"><div class="section-head"><div><p class="eyebrow">دکمه ریلی ورود</p><h2>قیمت پاها در روز ایجاد</h2></div><span>هر کارت یک پای استراتژی</span></div>${basisRail('bt-entry-basis', 'LAST')}<div id="bt-entry-market"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">دکمه ریلی سنجش</p><h2>قیمت پاها در روز خروج</h2></div><span>همان قراردادهای ترکیب</span></div>${basisRail('bt-exit-basis', 'LAST')}<div id="bt-exit-market"></div></section></div>
    <section class="card backtest-runbar"><p id="bt-run-note">برای هر ثانیهٔ معامله بین ۹:۰۰ تا ۱۲:۳۰، آخرین قیمت مشاهده‌شده تمام پاها روی یک خط زمانی مشترک قرار می‌گیرد. این ارزش‌گذاری مشاهده‌ای است و تضمین اجرای هم‌زمان نیست.</p><div class="backtest-run-actions"><button type="button" class="primary" id="bt-run">اجرای بک‌تست</button><button type="button" class="ghost" id="bt-live">رصد زنده موقعیت از ورود تاریخی</button></div></section>
    </div>

    <section id="bt-result" hidden>
      <div class="bt-panel" data-panel="bt-overview" hidden>
      <section class="card backtest-overview"><div class="section-head"><div><p class="eyebrow">گام اول نتیجه</p><h2>عملکرد کلی این بازه</h2></div><span id="bt-overview-range">—</span></div>
        <div class="backtest-kpis" id="bt-kpis"></div>
        <div class="backtest-chart-grid"><section><div class="section-head"><h3>سود و زیان مبلغی</h3><span>ریال</span></div><div id="bt-money-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>بازده و تغییر نماد پایه</h3><span>درصد</span></div><div id="bt-return-chart" class="backtest-chart"></div></section></div>
      </section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">اثر هر پایه</p><h2>جزئیات پاهای استراتژی در روز سنجش</h2></div><span id="bt-final-source">—</span></div><div id="bt-leg-table" class="history-table-wrap"></div></section>
      <section class="card backtest-matrix-link"><div class="section-head"><div><p class="eyebrow">رابطه با ماتریس ورود × خروج</p><h2>اعتبارسنجی افق کوتاه</h2></div></div><div id="bt-matrix-idea"></div></section>
      </div>

      <div class="bt-panel" data-panel="bt-daily" hidden>
      <section class="card"><div class="section-head"><div><p class="eyebrow">گام دوم · از روز ورود تا روز خروج</p><h2>مسیر روزبه‌روز</h2></div><span id="bt-days-count">—</span></div>
        <p class="backtest-table-note">روی هر ردیف کلیک کن تا ریزمعامله‌های همان روز در کوچک‌ترین تایم‌فریم — ثانیه‌به‌ثانیه — با همان نمودارها و جدول‌ها باز شود.</p>
        <div class="backtest-chart-grid"><section><div class="section-head"><h3>تغییر روزانهٔ سود</h3><span>ریال · هر نقطه یک روز</span></div><div id="bt-daily-step-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>سود خالص و افت از قله</h3><span>ریال</span></div><div id="bt-daily-dd-chart" class="backtest-chart"></div></section></div>
        <div id="bt-days-table" class="history-table-wrap"></div>
      </section>
      </div>

      <div class="bt-panel" data-panel="bt-iv" hidden>
      <section class="card backtest-iv"><div class="section-head"><div><p class="eyebrow">تلاطم ضمنی · هر پا جدا</p><h2>تلاطم پاها در هر سه تایم‌فریم</h2></div><span id="bt-iv-source">—</span></div>
        <p class="backtest-table-note">تلاطم هر پا از قیمت مشاهده‌شدهٔ خودش، قیمت پایهٔ همان لحظه و روز مانده تا سررسید <b>همان پا</b> درمی‌آید. پای سهم پایه تلاطم ضمنی ندارد و ستونش خالی می‌ماند. لحظه‌ای که قیمت پایه یا قیمت پا نبوده، تلاطمی هم ساخته نشده — «—» یعنی نداریم، نه صفر.</p>
        <div class="backtest-iv-params" id="bt-iv-params"></div>
        <div id="bt-iv-summary" class="history-table-wrap"></div>
        <div class="backtest-chart-grid"><section><div class="section-head"><h3>تلاطم روزبه‌روز</h3><span>درصد · مسیر روزانه</span></div><div id="bt-iv-daily-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>تلاطم درون‌روز</h3><span>درصد · ثانیه‌به‌ثانیه</span></div><div id="bt-iv-intraday-chart" class="backtest-chart"></div></section></div>
        <div class="backtest-chart-grid"><section><div class="section-head"><h3>تلاطم روی تایم‌فریم انتخابی</h3><span>درصد · هر نقطه یک سطل</span></div><div id="bt-iv-tf-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>پراکندگی تلاطم و قیمت پایه</h3><span>حساسیت تلاطم به حرکت پایه</span></div><div id="bt-iv-base-chart" class="backtest-chart"></div></section></div>
      </section>
      </div>

      <div class="bt-panel" data-panel="bt-intraday" hidden>
      <section class="card backtest-intraday-panel"><div class="section-head"><div><p class="eyebrow">خط زمانی مشترک همه پاها</p><h2 id="bt-intraday-title">تحلیل درون‌روزی ۹:۰۰ تا ۱۲:۳۰</h2></div><div class="backtest-head-actions"><span id="bt-intraday-source">—</span><button type="button" id="bt-export-intraday">خروجی همه نقاط</button></div></div><div id="bt-intraday-kpis" class="backtest-kpis"></div>
        <div class="backtest-chart-grid"><section><div class="section-head"><h3>ارزش مشاهده‌شدهٔ موقعیت</h3><span>ریال · مرجع، نه قابل آفست</span></div><div id="bt-intraday-pnl-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>اثر خالص هر پا</h3><span>تفکیک ریالی</span></div><div id="bt-intraday-leg-chart" class="backtest-chart"></div></section></div>
        <div class="backtest-chart-grid"><section><div class="section-head"><h3>حرکت قیمت هر پا</h3><span>نسبت به اولین معامله همان پا</span></div><div id="bt-intraday-price-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>حجم تجمعی هر پا</h3><span>قرارداد</span></div><div id="bt-intraday-volume-chart" class="backtest-chart"></div></section></div>
        <div class="backtest-analysis-grid"><section><div class="section-head"><h3>پنجره‌های ۱۵ دقیقه‌ای</h3><span>دامنه و جریان آفست</span></div><div id="bt-interval-table" class="history-table-wrap"></div></section><section><div class="section-head"><h3>ماتریس هم‌حرکتی اثر پاها</h3><span>تغییرات نقطه‌به‌نقطه</span></div><div id="bt-correlation-table" class="history-table-wrap"></div><p id="bt-correlation-note" class="backtest-table-note"></p></section></div>
        <section class="backtest-tape"><div class="section-head"><div><h3>نوار مشترک قیمت و حجم</h3><p>نمودارها همه نقاط را دارند؛ جدول برای حفظ سرعت حداکثر ۳۰۰ نقطه را با فاصله یکنواخت نشان می‌دهد.</p></div><span id="bt-tape-count">—</span></div><div id="bt-tape-table" class="history-table-wrap"></div></section>
      </section>
      </div>

      <div class="bt-panel" data-panel="bt-timeframe" hidden>
      <section class="card backtest-timeframe"><div class="section-head"><div><p class="eyebrow">گام سوم · کل بازه روی تایم‌فریم دلخواه</p><h2>عملکرد کلی و به تفکیک پاها</h2></div><div class="backtest-head-actions"><label class="backtest-tf-field">تایم‌فریم<select id="bt-tf-size"><option value="60">۱ دقیقه</option><option value="300">۵ دقیقه</option><option value="900" selected>۱۵ دقیقه</option><option value="1800">۳۰ دقیقه</option><option value="3600">۶۰ دقیقه</option></select></label><button type="button" class="primary" id="bt-tf-run">تحلیل کل بازه</button><button type="button" class="ghost" id="bt-tf-export" hidden>دریافت فایل اکسل</button><span id="bt-tf-export-size" class="backtest-export-size" role="status"></span></div></div>
        <p id="bt-tf-note" class="backtest-table-note">برای هر روز بازه، ریزمعامله همه پاها و نماد پایه جداگانه گرفته می‌شود؛ این یعنی چند ده درخواست. نتیجه فقط از ثانیه‌هایی ساخته می‌شود که هر پا دست‌کم یک معامله داشته باشد.</p>
        <p class="backtest-table-note">این مسیر از <b>آخرین معاملهٔ مشاهده‌شدهٔ هر پا</b> ساخته می‌شود، نه از مظنه تقاضا و عرضهٔ هم‌زمان. یعنی «ارزش موقعیت در آن لحظه»، نه «سودی که در آن لحظه می‌شد گرفت»: آفست واقعی، خرید روی عرضه و فروش روی تقاضاست و اسپرد هر دو پا را می‌پردازد. تابلو دفتر سفارش تاریخی نمی‌دهد، پس عدد اجرایی از این داده ساختنی نیست.</p>
        <div id="bt-tf-body" hidden>
          <div class="backtest-kpis" id="bt-tf-kpis"></div>
          <div class="backtest-chart-grid"><section><div class="section-head"><h3>آفست موقعیت در کل بازه</h3><span>ریال · هر نقطه یک سطل</span></div><div id="bt-tf-pnl-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>اثر خالص هر پا</h3><span>تفکیک ریالی</span></div><div id="bt-tf-leg-chart" class="backtest-chart"></div></section></div>
          <div class="backtest-chart-grid"><section><div class="section-head"><h3>بازده استراتژی و نماد پایه</h3><span>درصد</span></div><div id="bt-tf-return-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>قیمت نماد پایه</h3><span>ریال</span></div><div id="bt-tf-base-chart" class="backtest-chart"></div></section></div>
          <section class="backtest-tape"><div class="section-head"><div><h3>کِی وارد شوی و کِی خارج</h3><p id="bt-tf-matrix-note"></p></div><span id="bt-tf-matrix-best">—</span></div><div id="bt-tf-matrix" class="history-table-wrap"></div></section>
          <section class="backtest-tape"><div class="section-head"><div><h3>پوشش روزهای بازه</h3><p>هر روز معاملاتی بازه یک ردیف دارد — چه داده ساخته باشد چه نه. روزِ بی‌داده روی نمودار شکاف است، نه حذف.</p></div><span id="bt-tf-coverage-count">—</span></div><div id="bt-tf-coverage" class="history-table-wrap"></div></section>
          <section class="backtest-tape"><div class="section-head"><div><h3>جدول سطل‌ها</h3><p>هر ردیف یک سطل زمانی با مشاهده واقعی. سطل بی‌معامله ساخته نشده است.</p></div><span id="bt-tf-count">—</span></div><div id="bt-tf-table" class="history-table-wrap"></div></section>
        </div>
      </section>
      </div>
      ${analysisMarkup()}
    </section>
  </section>`;


  // هر ظرف جدول، دکمهٔ خروجی خودش را می‌گیرد. ظرف‌ها در همین قالب‌اند حتی
  // وقتی خالی‌اند، و خواندن لحظهٔ کلیک انجام می‌شود — پس یک بار کافی است.
  attachExportsIn(root, 'backtest');
  const $ = (id) => root.querySelector(`#${id}`);

  // نوار زیرتب. پیش از اولین اجرا فقط «چیدمان» را دارد: تبی که به جدول
  // خالی می‌رسد، کاربر را سردرگم می‌کند نه راهنمایی.
  const SETUP_TAB = { id: 'bt-setup', label: 'چیدمان', hint: 'تاریخ، ترکیب قراردادها و قیمت پاها' };
  const RESULT_TABS = [
    { id: 'bt-overview', label: 'نمای کلی', hint: 'عملکرد کل بازه در یک نگاه' },
    { id: 'bt-daily', label: 'مسیر روزانه', hint: 'روزبه‌روز از ورود تا خروج' },
    { id: 'bt-intraday', label: 'درون‌روز', hint: 'ثانیه‌به‌ثانیهٔ روز سنجش' },
    { id: 'bt-timeframe', label: 'کل بازه', hint: 'گام سوم — تایم‌فریم دلخواه و خروجی اکسل' },
    { id: 'bt-iv', label: 'تلاطم ضمنی', hint: 'تلاطم هر پا در هر سه تایم‌فریم' },
    ...ANALYSIS_PANELS,
  ];
  // `mountSubtabs` نوارِ بی‌تغییر را دست نمی‌زند، پس صدا زدنش پس از هر
  // دریافت داده بی‌خطر است و تب باز کاربر سر جایش می‌ماند. اما «اجرا» و
  // «رصد زنده» خواستهٔ صریح کاربرند: اگر همان لحظه روی فرم چیدمان ایستاده
  // باشد باید نتیجه را ببیند — و این تنها جایی است که انتخاب او جابه‌جا
  // می‌شود.
  let subtabs = mountSubtabs($('bt-subtabs'), [SETUP_TAB], { root });
  const showSetupOnly = () => { subtabs = mountSubtabs($('bt-subtabs'), [SETUP_TAB], { root }); };
  const showResultTabs = ({ fromSetup = false } = {}) => {
    subtabs = mountSubtabs($('bt-subtabs'), [SETUP_TAB, ...RESULT_TABS], { root, initial: 'bt-overview' });
    if (fromSetup && subtabs?.current === SETUP_TAB.id) subtabs.show('bt-overview');
    return subtabs;
  };
  const status = $('bt-status'), baseSelect = $('bt-base'), strategySelect = $('bt-strategy');
  const baseGate = baseAfterRange(baseSelect);
  const entryRail = $('bt-entry-basis'), exitRail = $('bt-exit-basis');
  let chain = new Map(), ua = null, contracts = [], seriesByIns = {}, entryDates = [], combos = [], legs = null;
  let replay = null, intraday = [], intradayDate = null, exitDates = [];
  // ریزمعامله هر روز یک درخواست به‌ازای هر نماد است. کاربر می‌تواند بین
  // روزهای مسیر بالا و پایین برود، پس هر روزِ گرفته‌شده نگه داشته می‌شود؛
  // وگرنه هر کلیک همان درخواست‌ها را دوباره می‌فرستد.
  const tradesCache = new Map();
  // آخرین دریافتی که کش نشد — نتیجهٔ ناقص عمداً کش نمی‌شود، ولی پیام خطا
  // باید بداند چه شد.
  let lastDayFetch = null;
  // روزی که عکس زندهٔ تابلو به آن نسبت داده شده — خروجی `liveDayOf`. صفر
  // یعنی «امروز به هیچ روزی نچسبید»، و آن‌وقت هیچ روزی به نوار زنده
  // نمی‌رود. این تنها مدرکِ «نوار مال امروز است» است و دوباره ساخته
  // نمی‌شود.
  let liveDate = 0;
  let timeframeDays = [], timeframeSeconds = 900;
  // قیمت دستی به یک قرارداد و یک روز مشخص تعلق دارد. با عوض‌شدن ترکیب یا
  // تاریخ، عددی که کاربر وارد کرده دیگر مال آن قرارداد و آن روز نیست، پس
  // نگه‌داشتنش یعنی نسبت‌دادن یک قیمت به جایی که هرگز آنجا نبوده.
  let manualEntry = {}, manualExit = {};
  let entryWheel = null, exitWheel = null;
  let liveTimer = null, liveWatching = false, liveLoading = false;
  const setStatus = (text, error = false) => { status.textContent = text; status.toggleAttribute('data-error', error); };

  for (const [group, title] of Object.entries(GROUPS)) {
    const optgroup = document.createElement('optgroup'); optgroup.label = title;
    for (const def of CATALOG.filter((item) => item.group === group && item.feasible)) {
      const option = document.createElement('option'); option.value = def.id; option.textContent = ltr(def.name); optgroup.appendChild(option);
    }
    strategySelect.appendChild(optgroup);
  }
  strategySelect.value = 'short-strangle';

  const rowAt = (ins, date) => (seriesByIns[String(ins)] || []).find((row) => normalizeHistoryDate(row.date) === Number(date));
  const comboLabel = (combo) => `${combo.legs.map((leg) => nameOf(leg, 'قرارداد')).join(' + ')} · اعمال ${combo.strikes.map((strike) => fmt.int(strike)).join(' / ')} · سررسید ${combo.expiries.map(dateLabel).join(' / ')}`;

  function renderCombo() {
    const index = Number($('bt-combo').value);
    manualEntry = {}; manualExit = {};
    legs = combos[index]?.legs || null;
    if (!legs) {
      $('bt-legs').innerHTML = '<p class="empty-note">ترکیب معتبری برای این روز و مبنای قیمت نیست.</p>';
      // ═══ ترکیب که رفت، چرخِ خروجِ ترکیبِ قبلی هم باید برود ═══
      //
      // گزارش ۱۴۰۵/۰۶/۱۶: «تب باز نشد — Cannot read properties of null
      // (reading 'map')». مسیرش این بود: تحویل، ترکیبِ منتقل‌شده را در آن
      // روز پیدا نمی‌کرد، کشویی روی گزینهٔ «نیست» می‌رفت و `legs` صفر
      // می‌شد — ولی `exitDates` و `exitWheel` هنوز مالِ ترکیبِ **قبلی**
      // بودند. چند خط بعد `exitWheel.select(...)` صدا زده می‌شد، بازخوردش
      // `paintSnapshots()` را می‌خواند، و آن روی `legs` که حالا `null` بود
      // `.map` می‌زد.
      //
      // خروجِ زودهنگام، حالتِ کهنه را پاک نمی‌کند مگر صریح پاکش کنی. پس
      // همین‌جا پاک می‌شود: نه فهرستِ روزِ خروجی می‌ماند، نه چرخی که
      // بازخوردش به ترکیبِ رفته اشاره کند.
      exitDates = [];
      exitWheel = mountDateWheel($('bt-exit-date'), [], null, () => {},
        { empty: 'اول یک ترکیب معتبر انتخاب کن.' });
      paintSnapshots();
      return;
    }
    const entryDate = Number($('bt-entry-date').dataset.value), basis = entryRail.dataset.value || 'LAST';
    $('bt-legs').innerHTML = legs.map((leg, index) => {
      const row = rowAt(leg.ins, entryDate), market = historyMarketMetrics(row);
      return `<article><span>${faDigits(index + 1)} · ${leg.side === 'buy' ? 'خرید' : 'فروش'} ${leg.kind === 'call' ? 'اختیار خرید' : leg.kind === 'put' ? 'اختیار فروش' : 'نماد پایه'}</span><b>${esc(nameOf(leg, 'پایه'))}</b><small>اعمال ${leg.kind === 'underlying' ? '—' : fmt.int(leg.strike)} · نسبت ${fmt.num(leg.ratio)} · اندازه ${fmt.int(leg.size)}</small><small>قیمت ورود ${fmt.money(historyPrice(row, basis))} · حجم ${fmt.int(market.volume)} · ارزش ${fmt.money(market.value)}</small></article>`;
    }).join('');
    refreshExitDates();
  }

  /**
   * ترکیب‌ها را برای روز و مبنای فعلی از نو می‌سازد، بدون از دست دادن انتخاب.
   *
   * `innerHTML` روی یک `select`، مقدارش را به گزینهٔ اول برمی‌گرداند. تا امروز
   * همین اتفاق می‌افتاد: با هر کلیک روی مبنای قیمت ورود یا هر تغییر روز،
   * ترکیبِ انتخاب‌شده بی‌صدا به ترکیب دیگری می‌پرید و کاربر روی قراردادی
   * کار می‌کرد که خودش انتخابش نکرده بود.
   *
   * پس هویت نگه داشته می‌شود، نه اندیس: اگر همان قراردادها در فهرست تازه
   * باشند دوباره انتخاب می‌شوند، و فقط وقتی نباشند به گزینهٔ اول می‌افتد.
   */
  function refreshCombos() {
    const entryDate = Number($('bt-entry-date').dataset.value);
    if (!entryDate) return;
    const keep = legs ? comboKey(legs) : '';
    const generated = generateHistoricalCombos({ def: byId(strategySelect.value), ua, seriesByIns, startDate: entryDate, entryBasis: entryRail.dataset.value || 'LAST', settings: state.settings, filtered: true });
    combos = generated.combos || [];
    const shown = combos.slice(0, 1000);
    $('bt-combo').innerHTML = shown.length ? shown.map((combo, index) => `<option value="${index}">${esc(comboLabel(combo))}</option>`).join('') : '<option value="">ترکیب معتبر پیدا نشد</option>';
    const at = keep ? shown.findIndex((combo) => comboKey(combo.legs) === keep) : -1;
    if (at >= 0) $('bt-combo').value = String(at);
    $('bt-combo-count').textContent = `${fmt.int(combos.length)} ترکیب قابل اجرا`
      + (keep && at < 0 && shown.length ? ' · ترکیب قبلی در این روز نبود' : '');
    renderCombo();
  }

  function refreshExitDates() {
    if (!legs) return;
    const entryDate = Number($('bt-entry-date').dataset.value);
    const allBaseDates = (seriesByIns[String(ua.ins)] || []).map((row) => normalizeHistoryDate(row.date)).filter((date) => date >= entryDate);
    const maxDate = Math.min(Math.max(...allBaseDates), ...legs.filter((leg) => leg.kind !== 'underlying').map((leg) => normalizeHistoryDate(leg.expiry)));
    const result = replayHistory({ legs, seriesByIns, baseIns: String(ua.ins), startDate: entryDate, endDate: maxDate, entryBasis: entryRail.dataset.value || 'LAST', exitBasis: exitRail.dataset.value || 'LAST', units: 1, fees: feesOf(state.settings), settings: state.settings });
    exitDates = result.ok ? result.rows.filter((row) => row.status === 'ok').map((row) => row.date) : [];
    const selected = exitDates.includes(Number($('bt-exit-date').dataset.value)) ? Number($('bt-exit-date').dataset.value) : exitDates[Math.min(exitDates.length - 1, 4)];
    exitWheel = mountDateWheel($('bt-exit-date'), exitDates, selected, () => { manualExit = {}; paintSnapshots(); }, { empty: 'روز دارای قیمت همه پاها پیدا نشد.' });
    paintSnapshots();
  }

  /** پارامترهای مؤثر تلاطم: تنظیمات سراسری، با بازنویسی همین تب. */
  const ivP = () => ivParams(state.settings, ivOverride);

  /** بازپخش درون‌روز، همیشه با مهر تلاطم؛ تا هیچ مسیری بی‌تلاطم نماند. */
  function replayDay(day, date) {
    const points = replayIntraday({
      replay, tradesByIns: day.byIns, baseTrades: day.byIns[String(ua.ins)] || [],
      fees: feesOf(state.settings),
    });
    return annotateIntradayIv(points, { legs: replay.priced, date }, ivP());
  }

  function paintSnapshots() {
    const entry = Number($('bt-entry-date').dataset.value), exit = Number($('bt-exit-date').dataset.value);
    $('bt-entry-market').innerHTML = marketSnapshot(strategyLegSnapshots(legs, seriesByIns, entry), entryRail.dataset.value || 'LAST', 'entry', manualEntry);
    $('bt-exit-market').innerHTML = marketSnapshot(strategyLegSnapshots(legs, seriesByIns, exit), exitRail.dataset.value || 'LAST', 'exit', manualExit);
    paintManualNotes();
  }

  const manualStore = (scope) => (scope === 'entry' ? manualEntry : manualExit);
  const manualDate = (scope) => Number($(scope === 'entry' ? 'bt-entry-date' : 'bt-exit-date').dataset.value);

  /**
   * پیام بازه برای هر قیمت دستی.
   *
   * بیرون بودن از کمترین تا بیشترین آن روز جلوی اجرا را نمی‌گیرد — کاربر حق
   * دارد سناریوی «اگر با این قیمت می‌بستم» را بسنجد. ولی بی‌صدا هم نمی‌ماند:
   * عددی که آن روز معامله نشده، ادعای اجراپذیری ندارد.
   */
  function paintManualNotes() {
    for (const scope of ['entry', 'exit']) {
      const date = manualDate(scope), store = manualStore(scope);
      for (const input of root.querySelectorAll(`[data-manual="${scope}"]`)) {
        const index = Number(input.dataset.leg);
        const note = root.querySelector(`[data-manual-note="${scope}-${index}"]`);
        if (!note) continue;
        const raw = store[index];
        const check = manualPriceCheck(rowAt(legs?.[index]?.ins, date), raw);
        note.dataset.state = check.status;
        note.textContent = check.status === 'empty' ? ''
          : check.status === 'unknown' ? 'کمترین و بیشترین آن روز برای این قرارداد موجود نیست، پس نمی‌دانیم این قیمت در بازه بوده یا نه.'
            : check.status === 'inside' ? `در بازه روز است (${fmt.money(check.low)} تا ${fmt.money(check.high)}).`
              : `در بازه روز نیست؛ بازه معامله‌شده ${fmt.money(check.low)} تا ${fmt.money(check.high)} بود. محاسبه با همین عدد ادامه می‌یابد.`;
      }
    }
  }

  function onManualInput(event) {
    const input = event.target.closest('[data-manual]');
    if (!input) return;
    const store = manualStore(input.dataset.manual), index = Number(input.dataset.leg);
    const raw = input.value.trim();
    if (raw === '' || !(Number(raw) > 0)) delete store[index]; else store[index] = Number(raw);
    paintManualNotes();
  }

  /** روزهای سریِ پایه، بریده به بازهٔ انتخابیِ کاربر. */
  function baseDatesInRange() {
    const all = (seriesByIns[String(ua.ins)] || []).map((row) => normalizeHistoryDate(row.date)).filter(Boolean);
    // ═══ روزی که کاربر انتخاب نکرده، سنجیده نمی‌شود ═══
    //
    // گزارش ۱۴۰۵/۰۶/۱۷: «با وجود انتخاب بازه یک‌ساله، برنامه ۱۱۲۵ روز را
    // بررسی می‌کند، درحالی‌که در رابط فقط ۳۱۱ روز داخل بازه دیده می‌شود.»
    // سریِ هر قرارداد از روزِ اولش می‌آید و این درست است؛ آنچه غلط بود،
    // سنجیدنِ همه‌اش بود.
    return clipDates(all, rangeUi?.range || null);
  }

  async function findExecutableDates() {
    const def = byId(strategySelect.value), basis = entryRail.dataset.value || 'LAST';
    const baseDates = baseDatesInRange();
    const found = [];
    for (let index = 0; index < baseDates.length; index++) {
      const date = baseDates[index];
      const generated = generateHistoricalCombos({ def, ua, seriesByIns, startDate: date, entryBasis: basis, settings: state.settings, filtered: true, probe: true });
      if (generated.combos.length) found.push(date);
      if (index % 10 === 0) { setStatus(`سنجش روزهای قابل اجرا: ${fmt.int(index + 1)} از ${fmt.int(baseDates.length)}`); await nextFrame(); }
    }
    return found;
  }

  /**
   * ═══ مسیرِ تند: وقتی می‌دانیم دنبالِ کدام ترکیبیم ═══
   *
   * انتقالِ زنده `legIns` را با خودش می‌آورد، پس پرسش «چه ترکیب‌هایی ممکن
   * است» نیست؛ «**این** ترکیب کدام روزها قیمت دارد» است. آن یکی ۳۵۵ نماد و
   * ۲۵۴ هزار ارزیابی می‌خواست، این یکی سه نماد و یک پیمایشِ خطی.
   *
   * فهرستِ کاملِ ترکیب‌ها حذف نشده — با دکمهٔ «همهٔ ترکیب‌ها» یا با عوض‌کردنِ
   * نماد و استراتژی ساخته می‌شود.
   */
  let fastPath = false;

  /**
   * جملهٔ صداقتِ مسیرِ تند، به‌علاوهٔ راهِ بیرون‌آمدن از آن.
   *
   * پنهان‌کردنِ اینکه فهرست کامل نیست، همان «حالتِ شکست شبیه نتیجهٔ معتبر»
   * است: کاربر باید بداند چرا فقط یک ترکیب می‌بیند و چطور بقیه را بیاورد.
   */
  function paintFastPathNote() {
    const box = $('bt-fast-note');
    if (!box) return;
    box.hidden = !fastPath;
    if (!fastPath) return;
    box.innerHTML = 'برای سرعت، فقط تاریخچهٔ همین ترکیب گرفته شد. '
      + '<button type="button" class="ghost" id="bt-load-all">همهٔ ترکیب‌های این نماد را بارگیری کن</button>';
    box.querySelector('#bt-load-all').addEventListener('click', () => loadHistory());
  }

  let liveDayNote = '';
  async function loadHistory({ requiredIns = [] } = {}) {
    entryDates = [];
    ua = chain.get(baseSelect.value);
    if (!ua) { setStatus('ابتدا نماد پایه را انتخاب کن.', true); return; }
    contracts = flattenActiveContracts(ua, state.settings.blockedExpiries);
    const wanted = requiredIns.map(String).filter(Boolean);
    fastPath = wanted.length > 0;
    const codes = fastPath
      ? fastPathCodes(ua.ins, wanted)
      : [...new Set([String(ua.ins), ...contracts.map((contract) => String(contract.ins))])];
    $('bt-load').disabled = true; setStatus(`دریافت تاریخچه ${fmt.int(codes.length)} نماد…`);
    try {
      const loaded = await loadHistoricalDailies(codes, ua.ins, fetch, { tapeFor: 'all' });
      seriesByIns = loaded.seriesByIns;
      // روز جاری از عکس زندهٔ تابلو می‌آید، نه از دفتر روزانه که تا شب
      // منتشرش نمی‌کند. جمله‌اش را همان‌جا می‌گوییم چون ارقام امروز نهایی
      // نیستند و کاربر باید بداند.
      liveDayNote = loaded.liveNote || '';
      // همان روزی که سری‌های روزانه ردیف لحظه‌ای گرفتند، ریزمعامله‌اش هم
      // باید از نوار زنده بیاید نه از مسیر تاریخی. یک مدرک، دو مصرف.
      liveDate = Number(loaded.liveDate) || 0;
      const failed = [String(ua.ins), ...wanted].filter((ins) => loaded.errors[ins]);
      if (failed.length) throw new Error(`دریافت تاریخچه ناموفق بود: ${failed.map((ins) => `${nameOf(contracts.find((contract) => String(contract.ins) === ins) || ua)}: ${loaded.errors[ins]}`).join('؛ ')}`);
      entryDates = fastPath
        ? comboEntryDates(wanted, baseDatesInRange(),
          (ins, date) => Number.isFinite(historyPrice(rowAt(ins, date), entryRail.dataset.value || 'LAST')))
        : await findExecutableDates();
      if (!entryDates.length) {
        throw new Error(fastPath
          ? 'این ترکیب در بازهٔ انتخابی هیچ روزی قیمتِ کامل ندارد — بازه را بازتر کن یا «همهٔ ترکیب‌ها» را بزن.'
          : 'با این نماد و استراتژی روز قابل‌اجرایی پیدا نشد');
      }
      $('bt-work').hidden = false;
      const selected = entryDates[Math.max(0, entryDates.length - 10)];
      entryWheel = mountDateWheel($('bt-entry-date'), entryDates, selected, () => refreshCombos(), { empty: 'روز قابل‌اجرا پیدا نشد.' });
      refreshCombos();
      paintFastPathNote();
      setStatus(`${fastPath
        ? `${fmt.int(entryDates.length)} روز برای همین ترکیب آماده است — بی معطلیِ کلِ زنجیره.`
        : `${fmt.int(entryDates.length)} روز قابل اجرا آماده است.`}${liveDayNote ? ` · ${liveDayNote}` : ''}`);
    } catch (error) { setStatus(errorText(error, 'تاریخچه دریافت نشد.'), true); } finally { $('bt-load').disabled = false; }
  }

  const dayCodes = () => [...new Set([...legs.map((leg) => String(leg.ins)), String(ua.ins)])];

  /**
   * یک تکه از مسیر دسته‌ای.
   *
   * شکستِ خودِ درخواست پرتاب نمی‌شود: هر جفتِ آن تکه «دریافت‌نشده» علامت
   * می‌خورد و بقیهٔ تکه‌ها ادامه می‌دهند. یک ۵۰۲ نباید کل تحلیل را ببلعد،
   * و مهم‌تر، نباید به‌شکل «آن روزها معامله نشده» دیده شود.
   */
  async function postTradeBatch(requests, { fresh = false } = {}) {
    try {
      // ═══ R5-13: حکمِ هر ابزار/روز همراهِ ردیف‌هایش می‌آید ═══
      //
      // نسخهٔ قبلی `payload.items` را خام برمی‌داشت و هیچ‌کجا `complete`،
      // `shortfall` یا `throttled` را نمی‌خواند. نتیجهٔ بک‌تست روی نوارِ
      // بریده ساخته می‌شد و از نتیجهٔ روی نوارِ کامل قابلِ تشخیص نبود —
      // بدترین حالت برای چیزی که مستقیم به تصمیمِ معاملاتی می‌رسد.
      const got = await fetchTapeBatch(requests, { fresh });
      if (got.throttled) batchErrors.push(got.note);
      else {
        const warn = tapeWarning(tapeSummary(got.verdicts));
        if (warn) batchErrors.push(warn);
      }
      return got.items;
    } catch (error) {
      batchErrors.push(String(error?.message || error));
      return {};
    }
  }

  /** نوار زندهٔ امروز، برای همان ابزارها. */
  async function getLiveTape(codes) {
    const items = {};
    for (let at = 0; at < codes.length; at += LIVE_CODE_CAP) {
      const part = codes.slice(at, at + LIVE_CODE_CAP);
      try {
        const response = await fetch(`/api/live-trades?ins=${part.join(',')}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || 'نوار زنده دریافت نشد');
        Object.assign(items, payload.items || {});
      } catch (error) { batchErrors.push(String(error?.message || error)); }
    }
    return items;
  }

  let batchErrors = [];

  /**
   * ریزمعاملهٔ چند روز، از منبع درستِ هر روز و با کمترین درخواست ممکن.
   *
   * ═══ دو چیزی که ممیزی گرفت ═══
   *
   * ردیف ۱: روز جاری از `/api/trades` تاریخی خوانده می‌شد و آن تا پایان روز
   * خالی است، در حالی که همان داده در `/api/live-trades` هست. حالا `liveDate`
   * — همان روزی که `liveDayOf` تأیید کرده — به نوار زنده می‌رود.
   *
   * ردیف ۴: برای هر روز و هر ابزار یک درخواست جدا می‌رفت؛ ۴۵ روز و دو پا
   * یعنی ۱۳۵ درخواست. `/api/trades/batch` از قبل بود و استفاده نمی‌شد.
   */
  async function loadTradeDays(dates, codes, { onProgress = () => {}, fresh = false } = {}) {
    if (!fresh) batchErrors = [];
    const days = new Map();
    const { live, history, ahead } = splitTradeDays(dates, { liveDate });
    const batches = tradeBatches(history, codes, { cap: BATCH_PAIR_CAP });
    const total = batches.length + (live.length ? 1 : 0);
    let done = 0;
    for (const requests of batches) {
      onProgress({ done, total, phase: 'history', days: requests.length / Math.max(1, codes.length) });
      await nextFrame();
      const items = await postTradeBatch(requests, { fresh });
      for (const date of [...new Set(requests.map((row) => row.date))]) {
        days.set(date, dayFromBatch(items, date, codes));
      }
      done += 1;
    }
    if (live.length) {
      onProgress({ done, total, phase: 'live', days: live.length });
      await nextFrame();
      const items = await getLiveTape(codes);
      for (const date of live) days.set(date, dayFromLiveTape(items, date, codes));
      done += 1;
    }
    onProgress({ done, total, phase: 'done', days: 0 });
    return { days, ahead, live: live.length, batches: batches.length };
  }

  /**
   * ریزمعامله یک روز را برای همه پاها و نماد پایه می‌گیرد.
   *
   * پایی که پاسخش نیامده، «بدون معامله» فرض نمی‌شود: نامش برمی‌گردد تا
   * فراخوان بتواند بگوید کدام پا داده ندارد. تفاوت «معامله نشده» با «نگرفتیم»
   * دقیقاً همان چیزی است که یک آفست دروغین می‌سازد.
   */
  async function fetchDayTrades(date, { force = false } = {}) {
    if (!force && tradesCache.has(date)) return tradesCache.get(date);
    const codes = dayCodes();
    const loaded = await loadTradeDays([date], codes);
    const result = loaded.days.get(Number(date)) || { byIns: {}, failed: codes, date };
    const { failed } = result;
    // نتیجهٔ ناقص کش نمی‌شود.
    //
    // پیش از این هر نتیجه‌ای کش می‌شد، حتی وقتی درخواستِ یکی از پاها شکست
    // خورده بود. یعنی یک خطای گذرای بالادست — سهمیه، مهلت، ۵۰۲ — آن روز را
    // تا پایان نشست قفل می‌کرد: هر بار باز کردنش همان نتیجهٔ خرابِ کش‌شده
    // را برمی‌گرداند و کاربر می‌دید روزی وسط مسیر خالی است در حالی که روز
    // قبل و بعدش سالم‌اند. دقیقاً همان چیزی که گزارش شد.
    lastDayFetch = result;
    if (!requiredMissing(failed).length) tradesCache.set(date, result);
    return result;
  }

  /**
   * کدام پا در بازهٔ جلسه اصلاً معامله نشده.
   *
   * این با «دریافت نشد» یکی نیست و پیام باید فرقشان را بگوید: یکی واقعیت
   * بازار است (قرارداد بی‌رمق)، دیگری خرابی ماست. تا امروز هر دو یک جملهٔ
   * واحد می‌گرفتند و کاربر نمی‌دانست باید دوباره تلاش کند یا نه.
   */
  /** معامله‌های داخل جلسه — همان صافی که همه‌جای این تب مبنا است. */
  const sessionTrades = (rows) => (rows || [])
    .filter((t) => !t.canceled && Number(t.price) > 0 && inIntradaySession(t.time));

  function legsWithoutTrades(byIns) {
    const out = [];
    legs.forEach((leg, index) => {
      if (!sessionTrades(byIns[String(leg.ins)]).length) out.push(nameOf(leg, `پای ${faDigits(index + 1)}`));
    });
    return out;
  }

  /** نامِ خواناى چند ابزار، برای جدول پوشش. */
  const legNames = (codes) => (codes || []).map((ins) => {
    const at = legs.findIndex((leg) => String(leg.ins) === String(ins));
    return at < 0 ? String(ins) : nameOf(legs[at], `پای ${faDigits(at + 1)}`);
  });

  const requiredMissing = (failed) => {
    const required = new Set(legs.map((leg) => String(leg.ins)));
    return failed.filter((ins) => required.has(ins));
  };

  function tradeWarningText({ byIns, failed }) {
    const missing = requiredMissing(failed);
    if (missing.length) return `ریزمعامله ${fmt.int(missing.length)} پای استراتژی دریافت نشد`;
    if (failed.length) return 'ریزمعامله نماد پایه دریافت نشد';
    return Object.values(byIns).some((rows) => rows.length) ? '' : 'برای این روز هیچ ریزمعامله‌ای برنگشت';
  }

  /** ریزمعامله یک روز از مسیر را باز می‌کند و پنل درون‌روزی را روی همان روز می‌نشاند. */
  async function openDayIntraday(date, { scroll = true } = {}) {
    if (!replay?.ok || !legs) return;
    if (liveWatching) stopLiveWatch();
    setStatus(`دریافت ریزمعامله ${dateLabel(date)}…`);
    try {
      const day = await fetchDayTrades(date);
      intradayDate = date;
      intraday = replayDay(day, date);
      const warning = tradeWarningText(day);
      paintIntradayAnalysis();
      paintDayTable();
      setStatus(warning
        ? `ریزمعامله ${dateLabel(date)}: ${warning}.`
        : `${fmt.int(intraday.length)} نقطه مشترک درون‌روزی برای ${dateLabel(date)} ساخته شد.`, Boolean(warning));
      if (scroll) $('bt-intraday-title').closest('section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setStatus(errorText(error, 'ریزمعامله دریافت نشد.'), true); }
  }

  // ═══════════════════ تلاطم ضمنی پاها ═══════════════════
  //
  // یک بار ساخته می‌شود و با هر تغییر پارامتر، هر سه تایم‌فریم از نو مهر
  // می‌خورند. جدا کردن این پنل از هر تایم‌فریم عمدی است: کاربر یک مجموعه
  // پارامتر دارد، نه سه تا، و اگر هر تایم‌فریم پارامتر خودش را داشت، سه
  // عدد تلاطم روی صفحه می‌ماند که هیچ‌کدام با آن یکی قابل‌مقایسه نبود.

  /**
   * فرم پارامترها؛ خالی‌گذاشتن هر خانه یعنی «همان تنظیمات سراسری».
   *
   * یک‌بار ساخته می‌شود و بس. ساختن دوباره در هر رنگ‌آمیزی، فوکوس را وسط
   * تایپ از خانه می‌پراند — کاربر «۰٫۳۵» را نمی‌توانست بنویسد چون بعد از
   * اولین رقم، خانه از نو ساخته می‌شد.
   */
  function paintIvParams() {
    const host = $('bt-iv-params');
    if (host.children.length) return;
    const p = ivP();
    host.innerHTML = IV_PARAMS.map((item) => `<label>${esc(item.label)}
      <input type="number" data-iv-param="${item.key}" min="${item.min}" max="${item.max}" step="${item.step}"
             value="${Number.isFinite(p[item.key]) ? p[item.key] : ''}"></label>`).join('')
      + '<button type="button" class="ghost" id="bt-iv-reset">بازگشت به تنظیمات سراسری</button>';
  }

  /** مقدار خانه‌ها را با تنظیمات سراسری هم‌تراز می‌کند؛ فقط برای دکمهٔ بازگشت. */
  function syncIvParams() {
    const p = ivParams(state.settings, {});
    for (const field of $('bt-iv-params').querySelectorAll('[data-iv-param]')) {
      field.value = Number.isFinite(p[field.dataset.ivParam]) ? p[field.dataset.ivParam] : '';
    }
  }

  /** سری تلاطم هر پا برای نمودار؛ کلید ثابت تا افسانه و خط جابه‌جا نشوند. */
  const ivSeries = () => replay.priced
    .map((leg, index) => ({ leg, index }))
    .filter(({ leg }) => leg.kind === 'call' || leg.kind === 'put')
    .map(({ leg, index }) => ({
      key: `legIv${index}`, label: `${faDigits(index + 1)} · ${nameOf(leg, 'پا')}`,
      color: LEG_COLORS[index % LEG_COLORS.length],
    }));

  /** نقاط را به شکلی می‌آورد که `chart` می‌خواهد: هر پا یک کلید مسطح. */
  const ivRows = (points, extra = () => ({})) => points.map((point, index) => ({
    ...extra(point, index),
    ...Object.fromEntries((point.legIvPct || []).map((value, at) => [`legIv${at}`, value])),
    meanIvPct: point.meanIvPct,
  }));

  function paintIv() {
    if (!replay?.ok) return;
    paintIvParams();
    const series = ivSeries();
    const daily = replay.rows.filter((row) => row.status !== 'missing');
    const tfBuckets = timeframeDays.length
      ? annotateBucketIv(bucketIntradayPath(timeframeDays, { bucketSeconds: timeframeSeconds }), { legs: replay.priced }, ivP())
      : [];

    const observedTf = observedBuckets(tfBuckets);
    $('bt-iv-source').textContent = [
      `${fmt.int(daily.length)} روز`,
      intraday.length ? `${fmt.int(intraday.length)} نقطهٔ درون‌روز` : '',
      // شمارِ *مشاهده‌شده*، نه شمارِ سطل: محورِ کامل ۲۱۰ سطل در روز دارد و
      // بیشترشان قیمت ندارند. گفتن «۲۱۰ سطل تایم‌فریم» برای منبعِ تلاطم،
      // عددی است که گمراه می‌کند.
      observedTf.length ? `${fmt.int(observedTf.length)} سطل تایم‌فریم` : '',
    ].filter(Boolean).join(' · ') || '—';

    chart($('bt-iv-daily-chart'), ivRows(daily), series, { xLabel: 'روز', yLabel: 'تلاطم ضمنی (٪)' });
    chart($('bt-iv-intraday-chart'), ivRows(intraday, (point) => ({ second: point.second })), series,
      { timeScale: true, step: true, xLabel: 'ساعت', yLabel: 'تلاطم ضمنی (٪)' });
    chart($('bt-iv-tf-chart'), ivRows(tfBuckets), series, { step: true, xLabel: 'سطل', yLabel: 'تلاطم ضمنی (٪)' });

    // تلاطم در برابر قیمت پایه: نقاط به‌ترتیب قیمت پایه چیده می‌شوند تا
    // شیب خط، حساسیت تلاطم به حرکت پایه را نشان دهد نه گذر زمان را.
    const bySpot = [...(intraday.length ? intraday : daily)]
      .map((point) => ({ ...point, spot: Number(point.basePrice ?? point.baseClose) }))
      .filter((point) => Number.isFinite(point.spot))
      .sort((a, b) => a.spot - b.spot);
    chart($('bt-iv-base-chart'), ivRows(bySpot), series, { xLabel: 'قیمت پایه — از کم به زیاد', yLabel: 'تلاطم ضمنی (٪)' });

    paintIvSummary(daily, tfBuckets);
  }

  /** خلاصهٔ هر پا در هر تایم‌فریم: دامنه، میانگین و تغییر سرتاسری. */
  function paintIvSummary(daily, tfBuckets) {
    const frames = [
      ['روزانه', daily],
      ['درون‌روز', intraday],
      ['تایم‌فریم', tfBuckets],
    ].filter(([, list]) => list.length);
    const legs = replay.priced
      .map((leg, index) => ({ leg, index }))
      .filter(({ leg }) => leg.kind === 'call' || leg.kind === 'put');
    if (!legs.length) {
      $('bt-iv-summary').innerHTML = '<p class="empty-note">این ترکیب پای اختیاری ندارد؛ تلاطم ضمنی تعریف نمی‌شود.</p>';
      return;
    }
    const rows = [];
    for (const { leg, index } of legs) {
      for (const [name, list] of frames) {
        const stats = ivSummary(list.map((point) => point.legIvPct?.[index]));
        rows.push({ leg, index, name, stats });
      }
    }
    $('bt-iv-summary').innerHTML = `<table class="history-table backtest-compact-table"><thead><tr><th>پا</th><th>تایم‌فریم</th><th>مشاهده</th><th>بی‌تلاطم</th><th>ابتدا</th><th>انتها</th><th>تغییر</th><th>کمینه</th><th>بیشینه</th><th>میانگین</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${faDigits(row.index + 1)} · ${esc(nameOf(row.leg, 'پا'))}</td><td>${esc(row.name)}</td><td>${fmt.int(row.stats.samples)}</td><td>${fmt.int(row.stats.gaps)}</td><td>${ivCell(row.stats.first)}</td><td>${ivCell(row.stats.last)}</td><td class="${signTone(row.stats.changePp)}">${Number.isFinite(row.stats.changePp) ? `${fmt.pct(row.stats.changePp)} واحد` : '—'}</td><td>${ivCell(row.stats.min)}</td><td>${ivCell(row.stats.max)}</td><td>${ivCell(row.stats.mean)}</td></tr>`).join('')}</tbody></table>`;
  }

  /** جدول روزبه‌روز مسیر؛ هر ردیف دروازه ورود به ریزمعامله همان روز است. */
  function paintDayTable() {
    const rows = replay.rows;
    // دو نمودار همین‌جا و نه در «نمای کلی»: آن‌ها سطحِ سود را نشان می‌دهند،
    // این‌ها تغییرِ روزبه‌روز و ناهمواری راه را — که پرسشِ همین تب است.
    const valid = rows.filter((row) => row.status === 'ok').map((row) => ({ ...row, granularity: 'day' }));
    chart($('bt-daily-step-chart'), valid, [{ key: 'pnlDelta', label: 'تغییر روزانهٔ سود', color: 'var(--accent)' }],
      { money: true, step: true, xLabel: 'روز', yLabel: 'ریال' });
    chart($('bt-daily-dd-chart'), valid, [
      { key: 'netPnl', label: 'سود خالص', color: 'var(--accent)' },
      { key: 'drawdown', label: 'افت از قله', color: 'var(--loss)' },
    ], { money: true, xLabel: 'روز', yLabel: 'ریال' });
    const legHeads = replay.priced.map((leg, index) => `<th>${faDigits(index + 1)} · ${esc(nameOf(leg, `پای ${index + 1}`))}</th>`).join('');
    $('bt-days-count').textContent = `${fmt.int(rows.filter((row) => row.status === 'ok').length)} روز معتبر از ${fmt.int(rows.length)} روز`;
    $('bt-days-table').innerHTML = `<table class="history-table"><thead><tr><th>روز</th><th>پایانی پایه</th><th>تغییر روز</th><th>تغییر از ورود</th>${legHeads}<th>سود ناخالص</th><th>کارمزد</th><th>سود خالص</th><th>تغییر روز</th><th>بازده</th><th>افت از قله</th><th>وجه تضمین خالص</th><th>وضعیت</th></tr></thead><tbody>${rows.map((row) => {
      const legCells = row.perLeg.map((leg) => `<td><b>${Number.isFinite(leg.exitPrice) ? fmt.money(leg.exitPrice) : '—'}</b><small class="${signTone(leg.netPnl)}">اثر ${Number.isFinite(leg.netPnl) ? fmt.money(leg.netPnl) : '—'}</small><small>حجم ${fmt.int(leg.volume)}</small><small>${ivCell(leg.ivPct)}</small></td>`).join('');
      const statusText = row.status === 'ok' ? 'معتبر'
        : row.status === 'liquidity' ? 'حذف نقدشوندگی'
          : `فاقد داده · پای ${faDigits((row.missingLegs || []).map((index) => index + 1).join('،'))}`;
      return `<tr data-day="${row.date}" tabindex="0" aria-selected="${row.date === intradayDate}" class="${row.status === 'missing' ? 'history-missing' : row.status === 'liquidity' ? 'history-liquidity' : ''}">
        <td><b>${esc(row.dayName)}</b><small>${dateLabel(row.date)} · روز ${fmt.int(row.holdingDays)}</small></td>
        <td>${fmt.money(row.baseClose)}</td><td class="${signTone(row.baseDailyPct)}">${fmt.pct(row.baseDailyPct)}٪</td><td class="${signTone(row.baseCumulativePct)}">${fmt.pct(row.baseCumulativePct)}٪</td>
        ${legCells}
        <td>${Number.isFinite(row.grossPnl) ? fmt.money(row.grossPnl) : '—'}</td><td>${Number.isFinite(row.totalFees) ? fmt.money(row.totalFees) : '—'}</td>
        <td class="${signTone(row.netPnl)}">${Number.isFinite(row.netPnl) ? fmt.money(row.netPnl) : '—'}</td><td class="${signTone(row.pnlDelta)}">${Number.isFinite(row.pnlDelta) ? fmt.money(row.pnlDelta) : '—'}</td>
        <td class="${signTone(row.returnPct)}">${Number.isFinite(row.returnPct) ? fmt.pct(row.returnPct) : '—'}٪</td><td class="${signTone(row.drawdown)}">${Number.isFinite(row.drawdown) ? fmt.money(row.drawdown) : '—'}</td>
        <td>${row.marginNet > 0 ? fmt.money(row.marginNet) : 'ندارد'}</td><td>${esc(statusText)}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  /**
   * چرا این روز خط زمانی مشترک ندارد.
   *
   * سه علت کاملاً متفاوت به یک نتیجه می‌رسند و تا امروز هر سه یک جملهٔ واحد
   * می‌گرفتند: «قیمت تمام پاها کامل نشده است». آن جمله برای دو تای اول
   * دروغ است — خرابیِ ما را به‌عنوان واقعیتِ بازار گزارش می‌کرد.
   */
  function intradayGap(day) {
    if (!day) return null;
    const missing = requiredMissing(day.failed || []);
    if (missing.length) {
      return { kind: 'fetch', text: `ریزمعاملهٔ ${fmt.int(missing.length)} پا از بالادست دریافت نشد. این خرابیِ دریافت است، نه نبودِ معامله.` };
    }
    if (day.failed?.length) {
      return { kind: 'fetch-base', text: 'ریزمعاملهٔ نماد پایه دریافت نشد؛ تغییر پایه در این نما نمی‌آید.' };
    }
    const quiet = legsWithoutTrades(day.byIns || {});
    if (quiet.length) {
      return { kind: 'quiet', text: `در بازهٔ ۹:۰۰ تا ۱۲:۳۰ این روز، ${quiet.map((n) => `«${esc(n)}»` ).join(' و ')} هیچ معامله‌ای نداشت. خط زمانی مشترک وقتی ساخته می‌شود که هر پا دست‌کم یک معامله داشته باشد.` };
    }
    return { kind: 'partial', text: 'معامله‌ها هست ولی هیچ ثانیه‌ای پیدا نشد که قیمت همهٔ پاها با هم مشاهده شده باشد.' };
  }

  function paintIntradayAnalysis() {
    const summary = summarizeIntraday(intraday);
    // عنوان باید بگوید کدام روز؛ کاربر می‌تواند هر روز مسیر را باز کند و
    // بدون تاریخ، همه این نمودارها شبیه هم‌اند.
    $('bt-intraday-title').textContent = intradayDate
      ? `ریزمعامله ${dateLabel(intradayDate)} · ۹:۰۰ تا ۱۲:۳۰`
      : 'تحلیل درون‌روزی ۹:۰۰ تا ۱۲:۳۰';
    const hosts = ['bt-intraday-pnl-chart', 'bt-intraday-leg-chart', 'bt-intraday-price-chart', 'bt-intraday-volume-chart', 'bt-interval-table', 'bt-correlation-table', 'bt-tape-table'];
    if (!summary.points) {
      const gap = intradayGap(tradesCache.get(intradayDate) || lastDayFetch);
      const retry = gap && gap.kind.startsWith('fetch')
        ? '<button type="button" class="ghost" id="bt-intraday-retry">تلاش دوباره</button>' : '';
      $('bt-intraday-source').textContent = gap?.kind === 'quiet' ? 'پای بی‌معامله' : 'فاقد خط زمانی کامل';
      $('bt-intraday-kpis').innerHTML = '';
      $('bt-tape-count').textContent = '—';
      $('bt-correlation-note').textContent = '';
      const msg = `<p class="empty-note">${gap?.text || 'برای این روز خط زمانی مشترکی ساخته نشد.'} ${retry}</p>`;
      hosts.forEach((id) => { $(id).innerHTML = id === hosts[0] ? msg : `<p class="empty-note">${gap?.text || 'داده‌ای برای رسم نیست.'}</p>`; });
      $('bt-intraday-retry')?.addEventListener('click', () => {
        tradesCache.delete(intradayDate);
        openDayIntraday(intradayDate, { scroll: false });
      });
      return;
    }

    // روزِ باز، نه روز پایان بازه. `replay.endDate` ثابت است و با کلیک روی
    // هر ردیف عوض نمی‌شود، پس تولتیپ هر چهار نمودار همیشه تاریخ روز آخر را
    // نشان می‌داد — حتی وقتی نقاط مالِ روز دیگری بودند.
    const rows = intradayChartRows(intraday, intradayDate);
    const legSeries = summary.legs.map((leg, index) => ({ key: `legPnl${index}`, label: `${faDigits(index + 1)} · ${nameOf(leg, 'پا')}`, color: LEG_COLORS[index % LEG_COLORS.length] }));
    const priceSeries = [
      { key: 'returnPct', label: 'بازده استراتژی از ورود', color: 'var(--gain)' },
      ...summary.legs.map((leg, index) => ({ key: `legPrice${index}`, label: `قیمت ${faDigits(index + 1)} · ${nameOf(leg, 'پا')}`, color: LEG_COLORS[index % LEG_COLORS.length] })),
    ];
    const volumeSeries = summary.legs.map((leg, index) => ({ key: `legVolume${index}`, label: `${faDigits(index + 1)} · ${nameOf(leg, 'پا')}`, color: LEG_COLORS[index % LEG_COLORS.length] }));
    $('bt-intraday-source').textContent = `${fmt.int(summary.points)} نقطه · ${faDigits(summary.first.timeLabel)} تا ${faDigits(summary.last.timeLabel)} · پنجره ${fmt.pct(summary.coveragePct)}٪ جلسه`;
    const cards = [
      ['آفست پایان مشاهده', fmt.money(summary.last.netPnl), signTone(summary.last.netPnl)],
      ['بازده پایان مشاهده', `${fmt.pct(summary.last.returnPct)}٪`, signTone(summary.last.returnPct)],
      ['بهترین لحظه', `${fmt.money(summary.best.netPnl)} · ${faDigits(summary.best.timeLabel)}`, 'gain'],
      ['بدترین لحظه', `${fmt.money(summary.worst.netPnl)} · ${faDigits(summary.worst.timeLabel)}`, 'loss'],
      ['بیشترین افت از قله', fmt.money(summary.maxDrawdown), signTone(summary.maxDrawdown)],
      ['زمان مشاهده‌شده در سود', `${fmt.pct(summary.positiveTimePct)}٪`, signTone(summary.positiveTimePct)],
      ['زمان با تازگی همه پاها', `${fmt.pct(summary.freshTimePct)}٪`, ''],
      ['بیشترین سن پا در پایان', ageLabel(summary.last.maxAgeSec), summary.last.allFresh ? 'gain' : 'loss'],
    ];
    $('bt-intraday-kpis').innerHTML = cards.map(([label, value, tone]) => `<article class="${tone}"><span>${label}</span><b>${value}</b></article>`).join('');
    chart($('bt-intraday-pnl-chart'), rows, [{ key: 'netPnl', label: 'سود و زیان خالص کل', color: 'var(--accent)' }], { money: true, timeScale: true, step: true });
    chart($('bt-intraday-leg-chart'), rows, legSeries, { money: true, timeScale: true, step: true });
    chart($('bt-intraday-price-chart'), rows, priceSeries, { timeScale: true, step: true });
    chart($('bt-intraday-volume-chart'), rows, volumeSeries, { count: true, timeScale: true, step: true });

    $('bt-interval-table').innerHTML = `<table class="history-table backtest-compact-table"><thead><tr><th>بازه</th><th>ابتدا</th><th>انتها</th><th>بیشینه</th><th>کمینه</th><th>تغییر</th><th>حجم پاها</th><th>نقاط تازه</th></tr></thead><tbody>${summary.intervals.map((row) => `<tr><td>${faDigits(clockLabel(row.startSecond).slice(0, 5))}–${faDigits(clockLabel(row.endSecond).slice(0, 5))}</td><td class="${signTone(row.openPnl)}">${fmt.money(row.openPnl)}</td><td class="${signTone(row.closePnl)}">${fmt.money(row.closePnl)}</td><td class="gain">${fmt.money(row.highPnl)}</td><td class="loss">${fmt.money(row.lowPnl)}</td><td class="${signTone(row.changePnl)}">${fmt.money(row.changePnl)}</td><td>${row.observations ? `${fmt.int(row.volume)} · ${fmt.int(row.trades)} معامله` : 'فاقد مشاهده'}</td><td>${row.observations ? `${fmt.pct(row.freshPct)}٪` : '—'}</td></tr>`).join('')}</tbody></table>`;

    const legHeads = summary.legs.map((leg, index) => `<th>${faDigits(index + 1)} · ${esc(nameOf(leg, 'پا'))}</th>`).join('');
    $('bt-correlation-table').innerHTML = `<table class="history-table backtest-correlation"><thead><tr><th>پا</th>${legHeads}</tr></thead><tbody>${summary.legs.map((leg, row) => `<tr><th>${faDigits(row + 1)} · ${esc(nameOf(leg, 'پا'))}</th>${summary.correlation[row].map((value) => `<td data-correlation="${Number.isFinite(value) ? Math.abs(value).toFixed(2) : ''}" class="${signTone(value)}">${fmt.num(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    // توضیح ماتریس بیرون از جعبه پیمایش می‌نشیند. اگر داخلش باشد با جدول
    // ۹۲۰ پیکسلی افقی کشیده و از دید کاربر بیرون می‌رود — و این جمله دقیقاً
    // همان چیزی است که «مقدار نامعلوم» را از «همبستگی صفر» جدا می‌کند.
    $('bt-correlation-note').textContent = 'همبستگی از تغییر اثر خالص پاها بین نقاط پیاپی محاسبه می‌شود؛ مقدار نامعلوم یعنی تغییر مشترک کافی وجود نداشته است.';

    const maxTape = 300, stride = Math.max(1, Math.ceil(intraday.length / maxTape));
    const tape = intraday.filter((_, index) => index % stride === 0 || index === intraday.length - 1);
    $('bt-tape-count').textContent = `${fmt.int(tape.length)} از ${fmt.int(intraday.length)} نقطه`;
    const tapeHeads = summary.legs.map((leg, index) => `<th>قیمت پای ${faDigits(index + 1)}</th><th>تلاطم ${faDigits(index + 1)}</th><th>حجم ثانیه/تجمعی</th><th>سن</th>`).join('');
    $('bt-tape-table').innerHTML = `<table class="history-table backtest-tape-table"><thead><tr><th>زمان</th><th>آفست</th><th>بازده</th><th>قیمت پایه</th><th>سن بیشینه</th>${tapeHeads}</tr></thead><tbody>${tape.map((row) => `<tr data-fresh="${row.allFresh}"><td>${faDigits(row.timeLabel)}</td><td class="${signTone(row.netPnl)}">${fmt.money(row.netPnl)}</td><td class="${signTone(row.returnPct)}">${fmt.pct(row.returnPct)}٪</td><td>${fmt.money(row.basePrice)}</td><td>${ageLabel(row.maxAgeSec)}</td>${row.perLeg.map((leg) => `<td>${fmt.money(leg.exitPrice)}</td><td>${ivCell(leg.ivPct)}</td><td>${fmt.int(leg.secondVolume)} / ${fmt.int(leg.cumulativeVolume)}</td><td>${ageLabel(leg.ageSec)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function exportIntraday() {
    if (!intraday.length || !replay) return;
    const headers = ['زمان', 'سود و زیان خالص', 'بازده درصد', 'قیمت نماد پایه', 'تغییر نماد پایه درصد', 'بیشترین سن ثانیه'];
    replay.priced.forEach((leg, index) => headers.push(`پای ${index + 1} قیمت`, `پای ${index + 1} حجم ثانیه`, `پای ${index + 1} حجم تجمعی`, `پای ${index + 1} اثر خالص`, `پای ${index + 1} سن ثانیه`));
    const lines = [headers, ...intraday.map((row) => {
      const values = [row.timeLabel, row.netPnl, row.returnPct, row.basePrice, row.basePct, row.maxAgeSec];
      row.perLeg.forEach((leg) => values.push(leg.exitPrice, leg.secondVolume, leg.cumulativeVolume, leg.netPnl, leg.ageSec));
      return values;
    })].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','));
    const href = URL.createObjectURL(new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = href; link.download = `intraday-${intradayDate || replay.endDate}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  /**
   * عملکرد کل بازه، در تفکیک روزانه.
   *
   * این بخش عمداً ریزمعامله را وارد نمی‌کند. قبلاً یک کشوی «نمای مسیر» سه
   * حالت داشت و حالت پیش‌فرضش روزهای پیش از روزِ بازشده را با ثانیه‌های
   * همان روز می‌چسباند. دو ایراد داشت که هر دو بی‌صدا بودند:
   *
   *   ۱. محور افقی بر پایه اندیس است. چند صد نقطه ریزمعامله در کنار چند ده
   *      روز، بخش روزانه را به یک نوار باریک تبدیل می‌کرد و شیب دو طرف مرز
   *      اصلاً با هم قابل مقایسه نبود.
   *   ۲. مسیر روی روزِ بازشده بریده می‌شد. پس «بهترین نقطه» و «بدترین نقطه»
   *      و «سود/زیان نهایی» با کلیک روی هر ردیف جدول روزبه‌روز عوض می‌شدند —
   *      در بخشی که عنوانش «عملکرد کلی این بازه» است.
   *
   * حالا این بخش همیشه کل بازه را در تفکیک روز نشان می‌دهد و به اینکه کدام
   * روز باز است کاری ندارد. لحظه‌به‌لحظهٔ یک روز کار پنل درون‌روزی است، که
   * همان داده را با محور ساعت و مسیر پله‌ای رسم می‌کند.
   */
  function paintOverview() {
    const path = replay.rows.filter((row) => row.status === 'ok').map((row) => ({ ...row, granularity: 'day' }));
    const final = replay.summary.last;
    const firstProfit = path.find((point) => point.netPnl > 0);
    const best = path.filter((point) => Number.isFinite(point.netPnl)).reduce((a, point) => !a || point.netPnl > a.netPnl ? point : a, null);
    const worst = path.filter((point) => Number.isFinite(point.netPnl)).reduce((a, point) => !a || point.netPnl < a.netPnl ? point : a, null);
    const firstLabel = firstProfit ? `${faDigits(firstProfit.dateLabel)} · روز ${fmt.int(firstProfit.holdingDays)}` : 'در این بازه رخ نداد';
    const cards = [
      ['سود/زیان نهایی', fmt.money(final?.netPnl), signTone(final?.netPnl)], ['بازده نهایی', fmt.pct(final?.returnPct), signTone(final?.returnPct)],
      ['تغییر نماد پایه', fmt.pct(final?.baseCumulativePct), signTone(final?.baseCumulativePct)], ['کوتاه‌ترین زمان سود', firstLabel, firstProfit ? 'gain' : ''],
      ['بهترین نقطه', best ? `${fmt.money(best.netPnl)} · ${fmt.pct(best.returnPct)}` : '—', 'gain'], ['بدترین نقطه', worst ? `${fmt.money(worst.netPnl)} · ${fmt.pct(worst.returnPct)}` : '—', 'loss'],
    ];
    $('bt-kpis').innerHTML = cards.map(([label, value, tone]) => `<article class="${tone}"><span>${label}</span><b>${value}</b></article>`).join('');
    chart($('bt-money-chart'), path, [{ key: 'netPnl', label: 'سود و زیان خالص', color: 'var(--accent)' }], { money: true });
    chart($('bt-return-chart'), path, [{ key: 'returnPct', label: 'بازده استراتژی', color: 'var(--accent)' }, { key: 'basePct', label: 'تغییر پایه', color: 'var(--cmp1)' }, { key: 'baseCumulativePct', label: 'تغییر پایه', color: 'var(--cmp1)' }]);
    $('bt-overview-range').textContent = `${dateLabel(replay.startDate)} تا ${dateLabel(replay.endDate)} · ${fmt.int(replay.summary.validDays)} روز معتبر`;
  }

  /**
   * پنل‌های تحلیلی، با همان داده‌ای که بقیهٔ تب دارد.
   *
   * جدا از `paintResult` نگه داشته شده چون کنترل‌های خودشان — تایم‌فریم
   * تحلیل، لحظهٔ مرجع حساسیت — باید بتوانند فقط همین‌ها را دوباره بکشند،
   * نه کل تب را.
   */
  function analysisContext() {
    return {
      el: $, chart, colors: LEG_COLORS,
      replay, intraday, intradayDate, params: ivP(),
      buckets: timeframeDays.length
        ? annotateBucketIv(bucketIntradayPath(timeframeDays, { bucketSeconds: timeframeSeconds }), { legs: replay.priced }, ivP())
        : [],
    };
  }

  function paintPanels() {
    if (!replay?.ok) return;
    try {
      paintAnalysis(analysisContext());
    } catch (error) {
      // یک پنل خراب نباید کل تب را بخواباند: بقیهٔ نتیجه همچنان معتبر است.
      logError(error, 'پنل‌های تحلیلی بک‌تست');
    }
  }

  installAnalysisControls(root, paintPanels);

  function paintResult() {
    paintOverview();
    paintDayTable();
    paintIntradayAnalysis();
    paintIv();
    const lastDaily = replay.summary.last, lastTick = intraday.at(-1);
    const finalLegs = lastTick?.perLeg || lastDaily?.perLeg || [];
    const manualExitCount = Object.keys(replay.manualExit || {}).length;
    $('bt-final-source').textContent = lastTick
      ? `آخرین ریزمعامله کامل در ${faDigits(lastTick.timeLabel)}`
      : manualExitCount ? `قیمت روزانه انتخاب‌شده، با قیمت دستی ${fmt.int(manualExitCount)} پا` : 'قیمت روزانه انتخاب‌شده';
    $('bt-leg-table').innerHTML = `<table class="history-table"><thead><tr><th>پا</th><th>جهت</th><th>قیمت ورود</th><th>قیمت سنجش</th><th>اثر ناخالص</th><th>کارمزد</th><th>اثر خالص</th><th>تلاطم ضمنی</th><th>روز تا سررسید</th><th>حجم/ارزش روز</th></tr></thead><tbody>${finalLegs.map((leg, index) => {
      const dailyLeg = lastDaily?.perLeg?.[index];
      const activity = lastTick ? `حجم ${fmt.int(leg.cumulativeVolume)} · ${fmt.int(leg.tradeCount)} معامله · سن ${ageLabel(leg.ageSec)}` : `حجم ${fmt.int(dailyLeg?.volume)} · ارزش ${fmt.money(dailyLeg?.value)}`;
      return `<tr><td>${faDigits(index + 1)} · ${esc(nameOf(leg, `پای ${index + 1}`))}</td><td>${replay.priced[index]?.side === 'buy' ? 'خرید' : 'فروش'}</td><td>${fmt.money(leg.entryPrice)}</td><td>${fmt.money(leg.exitPrice)}</td><td class="${signTone(leg.grossPnl)}">${fmt.money(leg.grossPnl)}</td><td>${fmt.money((leg.entryFee || 0) + (leg.exitFee || 0))}</td><td class="${signTone(leg.netPnl)}">${fmt.money(leg.netPnl)}</td><td>${ivCell(Number.isFinite(leg.ivPct) ? leg.ivPct : dailyLeg?.ivPct)}</td><td>${fmt.int(legDaysToExpiry(replay.priced[index], lastTick ? intradayDate : lastDaily?.date))}</td><td>${activity}</td></tr>`;
    }).join('')}</tbody></table>`;

    const args = { legs, seriesByIns, baseIns: String(ua.ins), startDate: entryDates[0], endDate: Number($('bt-exit-date').dataset.value), entryBasis: entryRail.dataset.value, exitBasis: exitRail.dataset.value, units: Math.max(1, Math.trunc(Number($('bt-units').value) || 1)), fees: feesOf(state.settings), settings: state.settings };
    const matrix = rollingEntryMatrix(args), profile = holdingPeriodProfile(matrix), recommended = profile.best;
    const selectedDays = Math.max(0, replay.rows.findIndex((row) => row.date === replay.endDate));
    $('bt-matrix-idea').innerHTML = recommended ? `<div class="backtest-matrix-kpis"><article><span>افق مقاوم ماتریس</span><b>${fmt.int(recommended.holdingTradingDays)} روز معاملاتی</b></article><article><span>میانه بازده آن افق</span><b class="${signTone(recommended.medianReturn)}">${fmt.pct(recommended.medianReturn)}</b></article><article><span>درصد نمونه‌های سودده</span><b>${fmt.pct(recommended.winPct)}</b></article><article><span>افق انتخابی این بک‌تست</span><b>${fmt.int(selectedDays)} روز معاملاتی</b></article></div><p>ماتریس فقط افق پرتکرار و کم‌پراکندگی را پیشنهاد می‌کند؛ این بک‌تست قرارداد، قیمت ورود، حجم و مسیر واقعی انتخاب‌شده را جداگانه می‌سنجد. یک خانه سبز به‌تنهایی «بهینه» نیست و ممکن است حاصل انتخاب پس‌نگر باشد.</p>` : '<p>برای این ترکیب نمونه کافی جهت پیشنهاد افق مقاوم ماتریس وجود ندارد؛ نتیجه همین مسیر را می‌بینی، بدون ادعای بهینه‌بودن.</p>';
  }

  // ═══════════ تحلیل کل بازه روی تایم‌فریم انتخابی ═══════════

  // ═══ چرا این عدد دیگر ۴۵ نیست ═══
  //
  // ممیزی ردیف ۳: «عنوان «کل بازه» دقیق نیست؛ کد فقط ۴۵ روز آخر را بررسی
  // می‌کند و روزهای قدیمی‌تر را حذف می‌کند.»
  //
  // آن سقف معلولِ ردیف ۴ بود: وقتی هر روز `legs+1` درخواست جدا می‌فرستاد،
  // ۴۵ روز یعنی ۱۳۵ درخواست و بیشترش عملاً غیرممکن. با مسیر دسته‌ای، همان
  // ۴۵ روز **یک** درخواست است و ۴۰۰ روز هم یکی-دو تا. پس سقف به جایی رفت
  // که واقعاً محدودیت است، نه جایی که پیاده‌سازی بد بود.
  //
  // و هر وقت بگزد، عددش در همان تب گفته می‌شود — «کل بازه» بی‌توضیح نمی‌ماند.
  const TIMEFRAME_DAY_CAP = 400;
  const rangeLabel = (row) => `${faDigits(clockLabel(row.startSecond).slice(0, 5))}–${faDigits(clockLabel(row.endSecond).slice(0, 5))}`;

  /**
   * نوشتن وضعیت **داخل همین تب**.
   *
   * ممیزی ردیف ۲: «پیشرفت و خطا در `bt-status` نوشته می‌شود که کاربر در تب
   * «کل بازه» آن را نمی‌بیند؛ فقط غیرفعال‌شدن دکمه را می‌بیند و تصور می‌کند
   * هیچ اتفاقی نیفتاده.» درست بود — آن نوار بالای صفحه و در گام اول است.
   * پس هر چیزی که این دکمه می‌سازد، کنار خودِ دکمه هم نوشته می‌شود.
   */
  function tfNote(text, error = false) {
    const el = $('bt-tf-note');
    el.textContent = text;
    el.toggleAttribute('data-error', Boolean(error));
  }

  /**
   * ریزمعامله همه روزهای معتبر مسیر را می‌گیرد.
   *
   * روزی که برای همه پاها نقطه مشترک نساخته، وارد تحلیل نمی‌شود و تعدادش
   * جدا گفته می‌شود — نه اینکه با صفر پر شود. و مهم‌تر (ممیزی ردیف ۵):
   * «دریافت نشد» از «معامله نشده» جدا شمرده می‌شود. یکی خرابی ماست و باید
   * دوباره تلاش شود؛ دیگری واقعیت بازار است.
   */
  async function loadTimeframeDays() {
    // ═══ فهرستِ مرجع: هر روزِ معاملاتیِ بازه، نه فقط روزهای «معتبر» ═══
    //
    // گزارش صاحب پروژه: «همه روزهای درون بازه را انگار پوشش نمیده.» علتش
    // همین سطر بود که `row.status === 'ok'` فیلتر می‌کرد. روزی که مسیرِ
    // روزانه‌اش `missing` یا `liquidity` بود، اصلاً **درخواست هم نمی‌شد** —
    // در حالی که نوارِ ریزمعامله منبعِ دیگری است و می‌تواند همان روز داده
    // داشته باشد. حالا همهٔ روزها پرسیده می‌شوند و علتِ هرکدام نوشته.
    const dates = replay.rows.map((row) => Number(row.date)).filter(Boolean);
    const dayStatus = new Map(replay.rows.map((row) => [Number(row.date), String(row.status || '')]));
    const wanted = dates.slice(-TIMEFRAME_DAY_CAP);
    const cutOff = new Set(dates.slice(0, Math.max(0, dates.length - wanted.length)));
    const codes = dayCodes();
    // روزهایی که از قبل کامل گرفته شده‌اند دوباره درخواست نمی‌شوند.
    const missing = wanted.filter((date) => !tradesCache.has(date));
    const loaded = await loadTradeDays(missing, codes, {
      onProgress: ({ done, total, phase, days }) => {
        const text = phase === 'done'
          ? `دریافت تمام شد؛ در حال ساخت سطل‌ها…`
          : phase === 'live'
            ? `دریافت نوار زندهٔ امروز برای ${fmt.int(codes.length)} ابزار…`
            : `دریافت دسته‌ای ${fmt.int(done + 1)} از ${fmt.int(total)} — ${fmt.int(Math.round(days))} روز × ${fmt.int(codes.length)} ابزار…`;
        tfNote(text); setStatus(text);
      },
    });
    // ═══ پاسخِ ناقص، نه واقعیتِ بازار ═══
    //
    // ممیزی (۱۴۰۵/۰۶/۲۴): سه روزی که واقعاً معامله داشتند «نماد پایه معامله
    // نشد» گرفتند، و با سرورِ تازه همان درخواست‌ها دادهٔ کامل دادند. یعنی
    // پاسخِ خالیِ لحظه‌ای کش می‌شد و تا پایان نشست می‌ماند.
    //
    // تشخیصش به پرسیدنِ بیرون نیاز ندارد: اختیار وقتی معامله می‌شود که
    // خودِ نماد باز است، پس «پاها معامله دارند ولی پایه صفر» متناقض است.
    // چنین روزی یک بار — و فقط یک بار — بی کش دوباره پرسیده می‌شود.
    const suspect = wanted.filter((date) => {
      const day = tradesCache.get(date) || loaded.days.get(date);
      if (!day || requiredMissing(day.failed).length) return false;
      return baseGapSuspect({
        baseTrades: day.byIns[String(ua.ins)] || [],
        legTrades: legs.map((leg) => day.byIns[String(leg.ins)] || []),
      });
    });
    let retried = new Map();
    let retryRequests = 0;
    if (suspect.length) {
      const text = `${fmt.int(suspect.length)} روز پاسخِ ناقص داد — دوباره و بی کش پرسیده می‌شود…`;
      tfNote(text); setStatus(text);
      await nextFrame();
      // پاسخِ ناقص هرگز کش نمی‌شود، وگرنه همان روز تا پایان نشست می‌ماند.
      for (const date of suspect) tradesCache.delete(date);
      const again = await loadTradeDays(suspect, codes, { fresh: true });
      retried = again.days;
      // شمار درخواست‌ها باید همه‌چیز را بگوید، وگرنه عددِ گزارش‌شده از
      // چیزی که واقعاً به بالادست رفت کمتر است.
      retryRequests = again.batches + (again.live ? 1 : 0);
    }

    const out = [];
    const coverage = [];
    // روزهایی که از سقف بیرون ماندند هم در فهرست می‌مانند — با علتِ خودشان.
    for (const date of dates) {
      if (!cutOff.has(date)) continue;
      coverage.push({ date, status: TF_DAY_STATUS.SKIPPED, dayStatus: dayStatus.get(date) || '', legs: [] });
    }
    for (const date of wanted) {
      const day = retried.get(date) || tradesCache.get(date) || loaded.days.get(date)
        || { byIns: {}, failed: codes, date };
      const row = { date, dayStatus: dayStatus.get(date) || '', legs: [] };
      // ── چهار علتِ متفاوت، چهار وضعیت ──────────────────────────────
      //
      // «خطای دریافت» یعنی دوباره تلاش کن؛ «نماد پایه معامله نشد» یعنی
      // واقعیتِ بازار است و تلاش دوباره فایده ندارد. یکی‌کردنشان تصمیمِ
      // کاربر را خراب می‌کند.
      if (requiredMissing(day.failed).length) {
        coverage.push({ ...row, status: TF_DAY_STATUS.FAILED, legs: legNames(requiredMissing(day.failed)) });
        continue;
      }
      const gap = baseGapSuspect({
        baseTrades: day.byIns[String(ua.ins)] || [],
        legTrades: legs.map((leg) => day.byIns[String(leg.ins)] || []),
      });
      // ناقص بودن پس از تلاشِ دوباره هم ادامه دارد: کش نمی‌شود و «معامله
      // نشده» هم شمرده نمی‌شود — چون نیست.
      if (gap) { coverage.push({ ...row, status: TF_DAY_STATUS.BASE_GAP }); continue; }
      if (!tradesCache.has(date)) tradesCache.set(date, day);
      if (!sessionTrades(day.byIns[String(ua.ins)]).length) {
        coverage.push({ ...row, status: TF_DAY_STATUS.NO_BASE });
        continue;
      }
      const quiet = legsWithoutTrades(day.byIns);
      if (quiet.length) { coverage.push({ ...row, status: TF_DAY_STATUS.NO_LEGS, legs: quiet }); continue; }
      const points = replayDay(day, date);
      if (points.length) { out.push({ date, points }); coverage.push({ ...row, status: TF_DAY_STATUS.OK, points: points.length }); }
      else coverage.push({ ...row, status: TF_DAY_STATUS.NO_POINTS });
    }
    coverage.sort((a, b) => a.date - b.date);
    return {
      days: out, coverage, summary: coverageSummary(coverage), ahead: loaded.ahead,
      requests: loaded.batches + (loaded.live ? 1 : 0) + retryRequests,
      retried: suspect.length, live: loaded.live,
      errors: [...new Set(batchErrors)],
      cap: TIMEFRAME_DAY_CAP, range: dates.length,
    };
  }

  /**
   * چه چیزی شد، به تفکیک.
   *
   * ممیزی ردیف ۵ و ۶: «روز خراب فقط در شمارندهٔ `empty` می‌رود… خرابی شبکه
   * با واقعیت "قرارداد معامله نشده" اشتباه می‌شود.» و شکافِ واقعیِ بالادست
   * هم هست — روزی که کال و پوت و پایه هر سه صفر دارند در حالی که روز قبل و
   * بعدش کامل‌اند. این دو باید جدا دیده شوند، وگرنه کاربر نمی‌داند دوباره
   * تلاش کند یا نه.
   */
  function loadedSummary(loaded) {
    if (!loaded) return '';
    const sum = loaded.summary || {};
    const parts = [];
    // هر علت جدا شمرده می‌شود. «خطای دریافت» یعنی دوباره تلاش کن؛ بقیه
    // واقعیتِ بازارند و تلاش دوباره عوضشان نمی‌کند.
    for (const [key, label] of [
      [TF_DAY_STATUS.BASE_GAP, TF_DAY_LABEL.baseGap],
      [TF_DAY_STATUS.NO_BASE, TF_DAY_LABEL.noBase],
      [TF_DAY_STATUS.NO_LEGS, TF_DAY_LABEL.noLegs],
      [TF_DAY_STATUS.NO_POINTS, TF_DAY_LABEL.noPoints],
      [TF_DAY_STATUS.FAILED, TF_DAY_LABEL.failed],
    ]) {
      if (sum[key]) parts.push(`${fmt.int(sum[key])} روز ${label}`);
    }
    if (loaded.ahead?.length) parts.push(`${fmt.int(loaded.ahead.length)} روز هنوز نرسیده`);
    // سقف، وقتی بگزد، صریح گفته می‌شود — «کل بازه» بی‌قید ادعای بزرگی است.
    if (sum[TF_DAY_STATUS.SKIPPED]) {
      parts.push(`${fmt.int(sum[TF_DAY_STATUS.SKIPPED])} روز قدیمی‌تر بررسی نشد (سقف ${fmt.int(loaded.cap || TIMEFRAME_DAY_CAP)} روز از ${fmt.int(loaded.range || 0)} روز بازه)`);
    }
    if (loaded.retried) {
      parts.push(`${fmt.int(loaded.retried)} روز پاسخِ ناقص داد و بی کش دوباره پرسیده شد`);
    }
    if (loaded.requests) {
      parts.push(`${fmt.int(loaded.requests)} درخواست${loaded.live ? ' (روز جاری از نوار زنده)' : ''}`);
    }
    const errors = loaded.errors?.length ? ` · علت: ${loaded.errors.slice(0, 2).join('؛ ')}` : '';
    return `${parts.length ? ` · ${parts.join(' · ')}` : ''}${errors}`;
  }

  /**
   * جدول پوشش: هر روزِ معاملاتیِ بازه، یک ردیف.
   *
   * خواستهٔ صریح صاحب پروژه: «تمام روزهای معاملاتی بین شروع و پایان در
   * فهرست مرجع باقی بمانند و برای هر روز وضعیت دقیق نمایش داده شود.»
   * خلاصهٔ عددی کافی نبود — کاربر باید بتواند بگوید **کدام** روز و **چرا**.
   */
  function paintCoverage(loaded) {
    const rows = loaded?.coverage || [];
    const sum = loaded?.summary || {};
    $('bt-tf-coverage-count').textContent = rows.length
      ? `${fmt.int(sum.ok || 0)} روز معتبر از ${fmt.int(rows.length)} روز بازه`
      : '—';
    if (!rows.length) { $('bt-tf-coverage').innerHTML = '<p class="empty-note">هنوز بازه‌ای بررسی نشده است.</p>'; return; }
    $('bt-tf-coverage').innerHTML = `<table class="history-table backtest-compact-table"><thead><tr><th>روز</th><th>وضعیت گام سوم</th><th>جزئیات</th><th>سطل/نقطه</th><th>وضعیت مسیر روزانه</th></tr></thead><tbody>${rows.map((row) => {
      const tone = row.status === TF_DAY_STATUS.OK ? 'gain'
        : (row.status === TF_DAY_STATUS.FAILED || row.status === TF_DAY_STATUS.BASE_GAP) ? 'loss' : '';
      const daily = row.dayStatus === 'ok' ? 'معتبر' : row.dayStatus === 'liquidity' ? 'حذف نقدشوندگی' : row.dayStatus === 'missing' ? 'قیمت ناقص' : '—';
      return `<tr class="${row.status === TF_DAY_STATUS.OK ? '' : 'history-missing'}"><td>${dateLabel(row.date)}</td><td class="${tone}">${TF_DAY_LABEL[row.status] || row.status}</td><td>${row.legs?.length ? esc(row.legs.join('، ')) : '—'}</td><td>${row.points ? fmt.int(row.points) : '—'}</td><td>${daily}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  function paintTimeframe(loaded) {
    const seconds = timeframeSeconds;
    const buckets = bucketIntradayPath(timeframeDays, { bucketSeconds: seconds });
    annotateBucketIv(buckets, { legs: replay.priced }, ivP());
    const observed = observedBuckets(buckets);
    if (!observed.length) {
      $('bt-tf-body').hidden = true;
      tfNote(`در هیچ روزی از این بازه، ثانیه‌ای پیدا نشد که همه پاها در آن قیمت مشاهده‌شده داشته باشند.${loadedSummary(loaded)}`,
        Boolean(loaded?.failed?.length));
      return;
    }
    $('bt-tf-body').hidden = false;
    const holding = intradayHoldingSummary(timeframeDays);
    const clock = timeOfDayProfile(timeframeDays, { bucketSeconds: seconds });
    const matrix = intradayEntryExitProfile(timeframeDays, { legs: replay.priced, bucketSeconds: seconds, fees: feesOf(state.settings) });

    tfNote(`${fmt.int(timeframeDays.length)} روز با نقطه مشترک${loadedSummary(loaded)}`
      + ' · هر عدد فقط از معاملات واقعی همان سطل ساخته شده و هیچ قیمتی درون‌یابی نشده است.',
      Boolean(loaded?.failed?.length));

    const hours = (value) => `${fmt.num(value / 3600)} ساعت`;
    const cards = [
      ['زمان مشاهده‌شده', hours(holding.observedSeconds), ''],
      ['زمان در سود', `${fmt.pct(holding.positivePct)}٪ · ${hours(holding.positiveSeconds)}`, 'gain'],
      ['زمان در زیان', `${fmt.pct(holding.negativePct)}٪ · ${hours(holding.negativeSeconds)}`, 'loss'],
      ['روز سودده / زیان‌ده', `${fmt.int(holding.positiveDays)} / ${fmt.int(holding.negativeDays)}`, holding.positiveDays >= holding.negativeDays ? 'gain' : 'loss'],
      ['بهترین سطل', `${fmt.money(Math.max(...observed.map((row) => row.highPnl)))}`, 'gain'],
      ['بدترین سطل', `${fmt.money(Math.min(...observed.map((row) => row.lowPnl)))}`, 'loss'],
      ['بهترین بازه ورود', matrix.bestEntry ? `${faDigits(clockLabel(matrix.bestEntry.second).slice(0, 5))} · میانه ${fmt.money(matrix.bestEntry.medianPnl)}` : 'نمونه کافی نیست', matrix.bestEntry ? 'gain' : ''],
      ['بهترین بازه خروج', matrix.bestExit ? `${faDigits(clockLabel(matrix.bestExit.second).slice(0, 5))} · میانه ${fmt.money(matrix.bestExit.medianPnl)}` : 'نمونه کافی نیست', matrix.bestExit ? 'gain' : ''],
    ];
    $('bt-tf-kpis').innerHTML = cards.map(([label, value, tone]) => `<article class="${tone}"><span>${label}</span><b>${value}</b></article>`).join('');

    // نقاط نمودار: هر سطل یک نقطه. محور بر پایه اندیس است چون سطل‌ها چند روز
    // را پشت هم می‌چینند و ساعت واقعی در روز دوم دوباره از ۹:۰۰ شروع می‌شود.
    // ── روزِ بی‌داده روی محور یک شکاف است، نه یک حذف ────────────────
    //
    // گزارش صاحب پروژه: «برخی روزها رو نمیاره.» پیش از این روزِ بی‌نقطه از
    // خروجی می‌افتاد و نمودار دو روزِ غیرمجاور را مستقیم به هم وصل می‌کرد.
    // معامله‌گر بیشینهٔ افت را از شکلِ همان خط می‌خواند؛ خطی که از روی یک
    // هفتهٔ بی‌معامله پریده، افتِ کمتری نشان می‌دهد از آنچه واقعاً بود.
    //
    // شکافِ یک روز کامل هیچ عددی ندارد و خط را قطع می‌کند. داخل یک روز،
    // فقط پس از اولین مشاهده آخرین ارزش‌گذاری با برچسب «کهنه» ادامه می‌یابد؛
    // قیمت روز قبل هیچ‌وقت به روز بعد حمل نمی‌شود.
    const points = timeframeChartPath(intradayPathWithGaps(buckets, loaded?.coverage || [])).map((row) => ({
      ...row, granularity: 'trade', timeLabel: row.dayGap ? dateLabel(row.date) : rangeLabel(row),
      dataStatusLabel: row.chartStatus === TF_BUCKET_STATUS.CARRIED
        ? `${TF_BUCKET_LABEL[TF_BUCKET_STATUS.CARRIED]} · ${fmt.int(Math.ceil(row.carriedAgeSec / 60))} دقیقه`
        : row.chartStatus === TF_BUCKET_STATUS.OBSERVED ? TF_BUCKET_LABEL[TF_BUCKET_STATUS.OBSERVED] : row.why,
      netPnl: row.chartPnl, returnPct: row.chartReturnPct,
      basePrice: row.chartBasePrice, basePct: row.chartBasePct,
      ...Object.fromEntries((row.chartPerLeg || []).flatMap((leg, index) => [[`legPnl${index}`, leg.netPnl], [`legPrice${index}`, leg.price]])),
    }));
    const legSeries = replay.priced.map((leg, index) => ({ key: `legPnl${index}`, label: `${faDigits(index + 1)} · ${nameOf(leg, 'پا')}`, color: LEG_COLORS[index % LEG_COLORS.length] }));
    // در «کل بازه» خالی‌بودنِ ابتدای/انتهای جلسه خودش اطلاعات است. رسّام
    // عمومی معمولاً این فضای مرده را می‌بُرد، اما اینجا باید ۹:۰۰ تا ۱۲:۳۰
    // سر جایش بماند. یک مشاهدهٔ تنها هم نقطه است، نه «نمودار نداریم».
    const fullSession = { preserveEmptyEdges: true, allowSingle: true };
    chart($('bt-tf-pnl-chart'), points, [{ key: 'netPnl', label: 'آفست موقعیت', color: 'var(--accent)' }], { money: true, step: true, ...fullSession });
    chart($('bt-tf-leg-chart'), points, legSeries, { money: true, step: true, ...fullSession });
    chart($('bt-tf-return-chart'), points, [{ key: 'returnPct', label: 'بازده استراتژی', color: 'var(--accent)' }, { key: 'basePct', label: 'تغییر نماد پایه', color: 'var(--cmp1)' }], { step: true, ...fullSession });
    chart($('bt-tf-base-chart'), points, [{ key: 'basePrice', label: 'قیمت نماد پایه', color: 'var(--cmp2)' }], { money: true, step: true, ...fullSession });

    $('bt-tf-holding').innerHTML = `<table class="history-table backtest-compact-table"><thead><tr><th>روز</th><th>نقطه</th><th>مشاهده‌شده</th><th>در سود</th><th>درصد در سود</th><th>باز</th><th>بسته</th><th>بیشینه</th><th>کمینه</th><th>بازده پایان</th><th>تغییر پایه</th></tr></thead><tbody>${holding.days.map((row) => `<tr><td>${dateLabel(row.date)}</td><td>${fmt.int(row.points)}</td><td>${hours(row.observedSeconds)}</td><td>${hours(row.positiveSeconds)}</td><td class="${signTone(row.positivePct - 50)}">${fmt.pct(row.positivePct)}٪</td><td class="${signTone(row.openPnl)}">${fmt.money(row.openPnl)}</td><td class="${signTone(row.closePnl)}">${fmt.money(row.closePnl)}</td><td class="gain">${fmt.money(row.bestPnl)}</td><td class="loss">${fmt.money(row.worstPnl)}</td><td class="${signTone(row.closeReturnPct)}">${fmt.pct(row.closeReturnPct)}٪</td><td class="${signTone(row.basePct)}">${fmt.pct(row.basePct)}٪</td></tr>`).join('')}</tbody></table>`;

    $('bt-tf-timeofday').innerHTML = `<table class="history-table backtest-compact-table"><thead><tr><th>بازه روز</th><th>روز</th><th>صعودی</th><th>نزولی</th><th>میانگین تغییر</th><th>میانه تغییر</th><th>یکنواختی جهت</th><th>میانگین حجم</th></tr></thead><tbody>${clock.map((row) => `<tr><td>${rangeLabel(row)}</td><td>${fmt.int(row.days)}</td><td class="gain">${fmt.int(row.upDays)}</td><td class="loss">${fmt.int(row.downDays)}</td><td class="${signTone(row.meanChange)}">${fmt.money(row.meanChange)}</td><td class="${signTone(row.medianChange)}">${fmt.money(row.medianChange)}</td><td>${fmt.pct(row.consistencyPct)}٪</td><td>${fmt.int(row.meanVolume)}</td></tr>`).join('')}</tbody></table>`;

    if (!matrix.cells.length) {
      $('bt-tf-matrix').innerHTML = '<p class="empty-note">برای ماتریس ورود×خروج، دست‌کم یک روز با دو بازه دارای معامله لازم است.</p>';
      $('bt-tf-matrix-best').textContent = '—';
      $('bt-tf-matrix-note').textContent = '';
    } else {
      const slots = matrix.slots;
      const byKey = new Map(matrix.cells.map((cell) => [`${cell.entrySecond}|${cell.exitSecond}`, cell]));
      const bound = Math.max(1, ...matrix.cells.map((cell) => Math.abs(cell.medianPnl)));
      $('bt-tf-matrix').innerHTML = `<table class="history-table backtest-correlation backtest-tf-matrix"><thead><tr><th>ورود \ خروج</th>${slots.map((second) => `<th>${faDigits(clockLabel(second).slice(0, 5))}</th>`).join('')}</tr></thead><tbody>${slots.map((entry) => `<tr><th>${faDigits(clockLabel(entry).slice(0, 5))}</th>${slots.map((exit) => {
        const cell = byKey.get(`${entry}|${exit}`);
        if (!cell) return '<td></td>';
        return `<td class="${signTone(cell.medianPnl)}" style="--weight:${Math.min(1, Math.abs(cell.medianPnl) / bound)}" title="میانه ${fmt.money(cell.medianPnl)} · میانگین ${fmt.money(cell.meanPnl)} · سودده ${fmt.pct(cell.winPct)}٪ · ${fmt.int(cell.samples)} روز">${fmt.money(cell.medianPnl)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
      $('bt-tf-matrix-best').textContent = matrix.best
        ? `بهترین جفت: ورود ${faDigits(clockLabel(matrix.best.entrySecond).slice(0, 5))} و خروج ${faDigits(clockLabel(matrix.best.exitSecond).slice(0, 5))} · میانه ${fmt.money(matrix.best.medianPnl)} روی ${fmt.int(matrix.best.samples)} روز`
        : '—';
      $('bt-tf-matrix-note').textContent = `هر خانه یعنی «اگر در بازه ردیف می‌ساختی و در بازه ستون می‌بستی»، با قیمت مشاهده‌شده هر دو سر و کارمزد هر دو سمت؛ رتبه‌بندی با میانه است تا یک روز استثنایی برنده نشود.`
        + (matrix.bucketSeconds !== matrix.requestedBucketSeconds ? ` این ماتریس روی سطل ${fmt.int(matrix.bucketSeconds / 60)} دقیقه‌ای ساخته شده، نه ${fmt.int(matrix.requestedBucketSeconds / 60)} دقیقه، چون تعداد جفت‌ها با سطل ریزتر از کنترل خارج می‌شود.` : '')
        + ' این توصیف گذشته است، نه پیشنهاد اجرا.';
    }

    const legHeads = replay.priced.map((leg, index) => `<th>قیمت ${faDigits(index + 1)}</th><th>اثر ${faDigits(index + 1)}</th><th>تلاطم ${faDigits(index + 1)}</th>`).join('');
    const shown = buckets.slice(-400);
    $('bt-tf-count').textContent = `${fmt.int(shown.length)} از ${fmt.int(buckets.length)} سطل`;
    $('bt-tf-table').innerHTML = `<table class="history-table backtest-tape-table"><thead><tr><th>روز</th><th>بازه</th><th>وضعیت</th><th>مشاهده</th><th>ارزش حمل‌شده</th><th>سن حمل</th><th>باز</th><th>بسته</th><th>بیشینه</th><th>کمینه</th><th>تغییر سطل</th><th>تغییر پیاپی</th><th>بازده</th><th>پایه</th><th>حجم پاها</th>${legHeads}</tr></thead><tbody>${shown.map((row) => {
      const missingLegCells = replay.priced.map(() => '<td>—</td><td>—</td><td>—</td>').join('');
      const legCells = row.perLeg.length
        ? row.perLeg.map((leg) => `<td>${fmt.money(leg.price)}</td><td class="${signTone(leg.netPnl)}">${fmt.money(leg.netPnl)}</td><td>${ivCell(leg.ivPct)}</td>`).join('')
        : missingLegCells;
      const bucketState = row.status === TF_BUCKET_STATUS.OBSERVED
        ? TF_BUCKET_LABEL[TF_BUCKET_STATUS.OBSERVED]
        : TF_BUCKET_LABEL[row.status] || 'فاقد قیمت کامل';
      return `<tr class="${row.status === TF_BUCKET_STATUS.OBSERVED ? '' : 'history-missing'}"><td>${dateLabel(row.date)}</td><td>${rangeLabel(row)}</td><td>${bucketState}</td><td>${fmt.int(row.observations)}</td><td class="${signTone(row.carriedPnl)}">${Number.isFinite(row.carriedPnl) ? fmt.money(row.carriedPnl) : '—'}</td><td>${Number.isFinite(row.carriedAgeSec) ? `${fmt.int(Math.ceil(row.carriedAgeSec / 60))} دقیقه` : '—'}</td><td class="${signTone(row.openPnl)}">${fmt.money(row.openPnl)}</td><td class="${signTone(row.closePnl)}">${fmt.money(row.closePnl)}</td><td class="gain">${fmt.money(row.highPnl)}</td><td class="loss">${fmt.money(row.lowPnl)}</td><td class="${signTone(row.changePnl)}">${fmt.money(row.changePnl)}</td><td class="${signTone(row.stepPnl)}">${Number.isFinite(row.stepPnl) ? fmt.money(row.stepPnl) : '—'}</td><td class="${signTone(row.returnPct)}">${fmt.pct(row.returnPct)}٪</td><td>${fmt.money(row.basePrice)}</td><td>${fmt.int(row.volume)}</td>${legCells}</tr>`;
    }).join('')}</tbody></table>`;
  }

  async function runTimeframe() {
    if (!replay?.ok) return;
    timeframeSeconds = Math.max(60, Number($('bt-tf-size').value) || 900);
    $('bt-tf-run').disabled = true;
    try {
      const loaded = await loadTimeframeDays();
      timeframeDays = loaded.days;
      // جدول پوشش حتی وقتی هیچ روزی نقطه نساخته هم رسم می‌شود: کاربر باید
      // بتواند ببیند **کدام** روز و **چرا**، نه فقط اینکه «چیزی پیدا نشد».
      paintCoverage(loaded);
      if (!timeframeDays.length) {
        const why = `در هیچ روز این بازه، ریزمعامله کامل همه پاها پیدا نشد.${loadedSummary(loaded)}`;
        setStatus(why, true); tfNote(why, true); $('bt-tf-body').hidden = true; return;
      }
      paintTimeframe(loaded);
      // حالا سطل‌های تایم‌فریم ساخته شده‌اند؛ پنل‌های تحلیلی هم باید همان
      // تایم‌فریم را ببینند وگرنه ریلِ «سطل تایم‌فریم» به مسیر روزانه
      // برمی‌گشت و کاربر تفاوتش را نمی‌فهمید.
      paintPanels();
      // دکمهٔ خروجی تا وقتی تحلیلی ساخته نشده پنهان است: دکمه‌ای که فایل
      // خالی می‌دهد، بدتر از دکمهٔ نبوده است.
      $('bt-tf-export').hidden = false;
      setStatus(`تحلیل ${fmt.int(timeframeDays.length)} روز روی سطل ${fmt.int(timeframeSeconds / 60)} دقیقه‌ای آماده شد.`);
      $('bt-tf-body').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      const text = errorText(error, 'تحلیل تایم‌فریم کامل نشد.');
      setStatus(text, true); tfNote(text, true);
    }
    finally { $('bt-tf-run').disabled = false; }
  }

  /** متن نوار اجرا: از چه چیزی ساخته شد و چه چیزی نامعلوم ماند. */
  function paintRunNote(day) {
    const allTrades = Object.values(day.byIns).flat();
    const cancelUnknown = allTrades.length > 0 && allTrades.some((trade) => trade.canceledKnown === false);
    // اگر بالادست وضعیت ابطال را نفرستد، ما نمی‌دانیم معامله‌ای باطل شده یا
    // نه. سکوت در این حالت یعنی ادعای ضمنی «هیچ‌کدام باطل نشده» — پس صریح
    // گفته می‌شود که نمی‌دانیم.
    const base = !allTrades.length
      ? 'برای این روز ریزمعامله‌ای دریافت نشد؛ مسیر روزانه معتبر است و عدد درون‌روزی ساخته نمی‌شود.'
      : cancelUnknown
        ? 'خط زمانی مشترک فقط از معاملات ۹:۰۰ تا ۱۲:۳۰ ساخته می‌شود؛ قیمت هر پا آخرین مشاهده تا همان ثانیه است و سن آن جدا نمایش داده می‌شود. منبع داده وضعیت ابطال را اعلام نکرده، پس ابطال احتمالی نامعلوم است.'
        : 'خط زمانی مشترک فقط از معاملات ۹:۰۰ تا ۱۲:۳۰ ساخته می‌شود؛ قیمت، حجم و سن هر پا در هر ثانیه نگه داشته شده و معامله باطل‌شده کنار گذاشته شده است. این مسیر تضمین اجرای هم‌زمان نیست.';
    const manualUsed = [
      Object.keys(manualEntry).length ? `ورود ${fmt.int(Object.keys(manualEntry).length)} پا` : '',
      Object.keys(manualExit).length ? `خروج ${fmt.int(Object.keys(manualExit).length)} پا` : '',
    ].filter(Boolean);
    $('bt-run-note').textContent = manualUsed.length
      ? `${base} قیمت دستی برای ${manualUsed.join(' و ')} به‌کار رفت؛ قیمت دستی خروج فقط روی همان روز سنجش می‌نشیند و مسیر ریزمعامله را عوض نمی‌کند، چون آن مسیر از معامله‌های واقعی همان روز ساخته می‌شود.`
      : base;
  }

  function stopLiveWatch(note = '') {
    clearInterval(liveTimer); liveTimer = null; liveWatching = false;
    $('bt-live').textContent = 'رصد زنده موقعیت از ورود تاریخی';
    $('bt-live').removeAttribute('data-active');
    if (note) setStatus(note);
  }

  /**
   * ورود از تاریخ انتخابی ثابت می‌ماند و فقط ارزش مشاهده‌شده امروز عوض
   * می‌شود. برای خروج زنده از آخرین معامله هر پا استفاده می‌شود؛ نه مظنه،
   * نه قیمت مدل و نه آخرین قیمت روز تاریخی.
   */
  async function refreshLivePosition() {
    if (!liveWatching || liveLoading || !replay?.ok || !legs || !ua) return;
    liveLoading = true; $('bt-live').disabled = true;
    try {
      const codes = [...new Set([...legs.map((leg) => String(leg.ins)), String(ua.ins)])];
      const response = await fetch(`/api/live-trades?ins=${encodeURIComponent(codes.join(','))}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'معاملات زنده دریافت نشد');
      const byIns = Object.fromEntries(codes.map((ins) => [ins, payload.items?.[ins]?.rows || []]));
      const failed = codes.filter((ins) => payload.items?.[ins]?.error);
      intradayDate = tehranDateNumber(payload.at);
      lastDayFetch = { byIns, failed, date: intradayDate };
      intraday = replayDay({ byIns }, intradayDate);
      $('bt-result').hidden = false;
      paintResult();
      paintPanels();
      showResultTabs();
      $('bt-intraday-title').textContent = `رصد زنده موقعیت در ${dateLabel(intradayDate)} · ۹:۰۰ تا ۱۲:۳۰`;
      $('bt-run-note').textContent = 'قیمت ورود از تاریخ انتخابی ثابت است؛ نتیجه زنده فقط با آخرین معاملات واقعی امروز محاسبه و در هر دریافت از نو ساخته می‌شود. این ارزش مشاهده‌شده است و تضمین آفست هم‌زمان نیست.';
      const warning = tradeWarningText(lastDayFetch);
      setStatus(intraday.length
        ? `رصد زنده ${faClock(new Date(payload.at))} · ${fmt.int(intraday.length)} نقطه مشترک${warning ? ` · ${warning}` : ''}`
        : `رصد زنده برقرار است؛ ${warning || 'هنوز همه پاها امروز معامله نشده‌اند'}.`, Boolean(warning));
    } catch (error) {
      setStatus(errorText(error, 'رصد زنده موقعیت به‌روز نشد.'), true);
      logError('رصد زنده بک‌تست', error);
    } finally { liveLoading = false; $('bt-live').disabled = false; }
  }

  async function startLiveWatch() {
    if (liveWatching) { stopLiveWatch('رصد زنده متوقف شد؛ آخرین مشاهده روی صفحه مانده است.'); return; }
    const startDate = Number($('bt-entry-date').dataset.value);
    const endDate = exitDates.at(-1);
    if (!legs || !startDate || !endDate) { setStatus('ابتدا تاریخ ورود و ترکیب معتبر را انتخاب کن.', true); return; }
    replay = replayHistory({
      legs, seriesByIns, baseIns: String(ua.ins), startDate, endDate,
      entryBasis: entryRail.dataset.value, exitBasis: exitRail.dataset.value,
      manualEntry, manualExit: {}, units: Math.max(1, Math.trunc(Number($('bt-units').value) || 1)),
      fees: feesOf(state.settings), settings: state.settings,
    });
    if (!replay.ok) { setStatus(replay.error || 'موقعیت تاریخی برای رصد ساخته نشد.', true); return; }
    annotateDailyIv(replay, ivP());
    tradesCache.clear(); timeframeDays = []; $('bt-tf-body').hidden = true; $('bt-tf-export').hidden = true;
    liveWatching = true; $('bt-live').textContent = 'توقف رصد زنده'; $('bt-live').setAttribute('data-active', 'true');
    setStatus('در حال دریافت معاملات امروز برای موقعیت تاریخی…');
    await refreshLivePosition();
    // شروع رصد، خواستهٔ صریح کاربر است: اگر روی فرم چیدمان بود او را روی
    // نتیجه می‌نشانیم. تیک‌های بعدی این کار را نمی‌کنند — همان‌جا بود که
    // کاربر را از تب باز خودش بیرون می‌انداخت.
    if (!$('bt-result').hidden) showResultTabs({ fromSetup: true });
    liveTimer = setInterval(refreshLivePosition, Math.max(3000, Math.min(30000, Number(state.settings.watchIntervalSec || 5) * 1000)));
    $('bt-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function runBacktest() {
    if (liveWatching) stopLiveWatch();
    const startDate = Number($('bt-entry-date').dataset.value), endDate = Number($('bt-exit-date').dataset.value);
    if (!legs || !startDate || !endDate) { setStatus('تاریخ و ترکیب معتبر را انتخاب کن.', true); return; }
    $('bt-run').disabled = true; setStatus('در حال محاسبه مسیر و دریافت ریزمعامله روز سنجش…');
    try {
      replay = replayHistory({ legs, seriesByIns, baseIns: String(ua.ins), startDate, endDate, entryBasis: entryRail.dataset.value, exitBasis: exitRail.dataset.value, manualEntry, manualExit, units: Math.max(1, Math.trunc(Number($('bt-units').value) || 1)), fees: feesOf(state.settings), settings: state.settings });
      if (!replay.ok) throw new Error(replay.error);
      annotateDailyIv(replay, ivP());
      // ترکیب یا بازه عوض شده؛ ریزمعامله‌های کش‌شده مال بازپخش قبلی‌اند.
      tradesCache.clear(); timeframeDays = []; $('bt-tf-body').hidden = true; $('bt-tf-export').hidden = true; $('bt-tf-export').hidden = true;
      const day = await fetchDayTrades(endDate);
      paintRunNote(day);
      intradayDate = endDate;
      intraday = replayDay(day, endDate);
      $('bt-result').hidden = false; paintResult(); paintPanels();
      showResultTabs({ fromSetup: true });
      const warning = tradeWarningText(day);
      if (intraday.length) setStatus(`${fmt.int(replay.summary.validDays)} روز و ${fmt.int(intraday.length)} نقطه مشترک درون‌روزی محاسبه شد${warning ? `؛ ${warning}` : ''}.`, Boolean(warning));
      else setStatus(`${fmt.int(replay.summary.validDays)} روز آماده شد؛ ${warning || 'در روز سنجش ریزمعامله کامل برای همه پاها پیدا نشد'}.`, Boolean(warning));
      $('bt-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setStatus(errorText(error, 'بک‌تست اجرا نشد.'), true); } finally { $('bt-run').disabled = false; }
  }

  /**
   * موقعیت دستیِ تحلیل تاریخی را بدون حدس‌زدن یک ترکیب دیگر بازسازی می‌کند.
   *
   * فهرست معمول بک‌تست از ترکیب‌ساز خودکار می‌آید، اما تحلیل تاریخی حالت
   * دستی هم دارد. ممکن است همان قراردادها در فهرست خودکار نباشند؛ در آن
   * صورت شناسه هر قرارداد به داده زنجیره وصل و سمت/نسبت از تعریف مشترک
   * استراتژی گرفته می‌شود. اگر حتی یک قرارداد یا قیمت ورود معتبر نباشد،
   * null برمی‌گردد تا مقصد صریحاً بگوید بازسازی نشد.
   */
  function exactHandoffCombo(plan, entryDate) {
    const def = byId(strategySelect.value);
    if (!def || !Array.isArray(plan.legIns)) return null;
    const selected = plan.legIns.map((ins) => contracts.find((contract) => String(contract.ins) === String(ins)));
    const optionTemplates = def.legs.filter((leg) => leg.kind !== 'underlying');
    if (selected.length !== optionTemplates.length || selected.some((contract) => !contract)) return null;
    const nearestExpiry = Math.min(...selected.map((contract) => Number(contract.expiry)).filter(Number.isFinite));
    const size = comboContractSize(selected.map((contract) => contract.size), state.settings.contractSize).size;
    let optionIndex = 0;
    const exactLegs = def.legs.map((template) => {
      if (template.kind === 'underlying') {
        return { kind: 'underlying', side: template.side, ratio: template.ratio, size, ins: String(ua.ins), name: ua.name, expiry: nearestExpiry };
      }
      const contract = selected[optionIndex++];
      if (contract.kind !== template.kind) return null;
      return { ...contract, side: template.side, ratio: template.ratio, slot: template.slot, exp: template.exp };
    });
    if (exactLegs.some((leg) => !leg)) return null;
    const basis = entryRail.dataset.value || 'LAST';
    const pricesReady = exactLegs.every((leg, index) => Number(plan.manualEntry?.[index]) > 0
      || Number(historyPrice(rowAt(leg.ins, entryDate), basis)) > 0);
    if (!pricesReady) return null;
    return {
      legs: exactLegs,
      strikes: exactLegs.filter((leg) => leg.kind !== 'underlying').map((leg) => leg.strike),
      expiries: [...new Set(exactLegs.filter((leg) => leg.kind !== 'underlying').map((leg) => leg.expiry))],
    };
  }

  /**
   * موقعیتی که یکی از تب‌های تحلیلی فرستاده را اینجا می‌چیند.
   *
   * هر چیزی که برداشته نشد، صریح گفته می‌شود. مثلاً اگر همان ترکیب قرارداد
   * در روز ورود انتخابی، ترکیب معتبری برای این استراتژی نباشد، بی‌صدا ترکیب
   * دیگری انتخاب نمی‌شود — کاربر باید بداند دارد چه چیزی را می‌بیند.
   */
  async function applyHandoff(plan) {
    const skipped = [];
    const sourceName = plan.from === 'history' ? 'تحلیل تاریخی'
      : plan.from === 'portfolio-backtest' ? 'آزمون همه استراتژی‌ها'
        : plan.from === 'top' ? 'برترین موقعیت‌ها' : 'تب استراتژی';
    if (!chain.has(String(plan.uaIns))) { setStatus(`نماد پایه «${plan.uaName}» در فهرست این تب نیست.`, true); return; }
    baseSelect.value = String(plan.uaIns);
    if ([...strategySelect.options].some((option) => option.value === plan.strategyId)) strategySelect.value = plan.strategyId;
    else skipped.push(`استراتژی «${plan.strategyName}» در این تب فقط برای ترکیب‌های قابل اجرا فهرست می‌شود`);
    $('bt-units').value = String(plan.units);
    setRail(entryRail, plan.entryBasis); setRail(exitRail, plan.exitBasis);

    await loadHistory({ requiredIns: plan.legIns });
    if (!entryDates.length) return;
    // ═══ «خودکار» یعنی روزی که **همین** ترکیب در آن هست ═══
    //
    // گزارش صاحب پروژه: ترکیبِ +۶۸۰۰۰/−۷۴۰۰۰ فرستاده شد و آزمایشگاه
    // ۱۶۰۰۰/۱۸۰۰۰ را انتخاب کرد.
    //
    // ریشه اینجا بود: `entryDates[0]` قدیمی‌ترین روزی است که **هر**
    // ترکیبی از این استراتژی اجراپذیر بوده — نه روزی که این ترکیب وجود
    // دارد. (`requiredIns` فقط خطای دریافت را می‌سنجید، نه بودنِ قرارداد
    // در آن روز.) قراردادهای تازه‌سررسید در آن روزِ قدیمی هنوز باز
    // نشده‌اند، پس تطبیق شکست می‌خورد و کشویی روی نخستین ترکیبِ آن روز
    // می‌ماند.
    //
    // حالا از **تازه‌ترین** روز به عقب می‌گردیم و نخستین روزی را
    // برمی‌داریم که همهٔ پاهای فرستاده‌شده در آن قیمت دارند. برای ردیفی
    // که همین حالا زنده است، همین درست هم هست: «این ترکیب، همان‌طور که
    // امروز هست». اگر هیچ روزی پیدا نشد، رفتار قبلی می‌ماند و بندِ
    // «بازسازی نشد» خودش را می‌گوید.
    // قاعده در `ui/handoff.mjs` است تا این تب و رصد یونانی دو رفتار
    // نداشته باشند؛ صفر یعنی «هیچ روزی همهٔ پاها را ندارد».
    const autoEntry = handoffEntryDate(plan, entryDates,
      (ins, date) => Number.isFinite(historyPrice(rowAt(ins, date), plan.entryBasis || 'LAST')));
    const wantEntry = plan.entryDate === 'auto' ? (autoEntry || entryDates[0]) : plan.entryDate;
    const entryReady = entryDates.includes(wantEntry);
    if (entryReady) entryWheel.select(wantEntry);
    else skipped.push(`روز ورود ${dateLabel(plan.entryDate)} برای این استراتژی ترکیب قابل اجرا ندارد`);

    // همان کلیدی که `refreshCombos` با آن انتخاب را نگه می‌دارد. تحویل فقط
    // شناسهٔ قرارداد دارد نه سمت و نسبت، پس مقایسه روی همان بخش انجام می‌شود.
    const insOf = (key) => key.split('::').map((part) => part.split('|')[0]).sort().join('|');
    const wanted = [...plan.legIns].map(String).sort().join('|');
    const index = combos.findIndex((combo) => insOf(comboKey(combo.legs)) === wanted);
    if (index >= 0) { $('bt-combo').value = String(index); renderCombo(); }
    else {
      const exact = entryReady ? exactHandoffCombo(plan, wantEntry) : null;
      if (exact) {
        const exactIndex = combos.length;
        combos.push(exact);
        const option = document.createElement('option');
        option.value = String(exactIndex);
        option.textContent = `موقعیت دقیق منتقل‌شده · ${comboLabel(exact)}`;
        $('bt-combo').appendChild(option);
        $('bt-combo').value = String(exactIndex);
        $('bt-combo-count').textContent = `${fmt.int(combos.length)} ترکیب · موقعیت دقیق تحلیل تاریخی افزوده شد`;
        renderCombo();
      } else {
        // ═══ ترکیبِ پیدانشده، انتخابِ غلط نمی‌گذارد ═══
        //
        // گزارش صاحب پروژه: «از Bull Call Spread اهرم با پاهای
        // +۶۸۰۰۰/−۷۴۰۰۰ … آزمایشگاه ترکیب ۱۶۰۰۰/۱۸۰۰۰ را انتخاب کرد.»
        //
        // تا امروز فقط یک بند به `skipped` اضافه می‌شد و کشویی روی
        // پیش‌فرضِ `refreshCombos` — یعنی نخستین ترکیبِ آن روز — می‌ماند.
        // نتیجه‌اش بدترین حالت بود: ترکیبی **دیگر** با ظاهری کاملاً
        // معتبر انتخاب‌شده می‌نشست و بندِ توضیح به‌راحتی از چشم می‌افتاد.
        // حالا کشویی روی گزینه‌ای می‌رود که ترکیب نیست، پس `renderCombo`
        // پانل را خالی می‌کند و هیچ عددی برای ترکیبِ اشتباه ساخته
        // نمی‌شود.
        const placeholder = document.createElement('option');
        placeholder.value = 'none';
        placeholder.textContent = 'ترکیبِ منتقل‌شده در این روز نیست — یکی را انتخاب کن';
        $('bt-combo').insertBefore(placeholder, $('bt-combo').firstChild);
        $('bt-combo').value = 'none';
        renderCombo();
        skipped.push(`ترکیب «${plan.comboName}» با داده معتبر این روز بازسازی نشد، پس هیچ ترکیبی انتخاب نشد`);
      }
    }

    // بی ترکیب، روز سنجش هم معنی ندارد — و بندِ «ترکیب بازسازی نشد» بالاتر
    // خودش دلیل را گفته، پس اینجا جملهٔ دومی اضافه نمی‌شود.
    const wantExit = plan.exitDate === 'auto' ? exitDates.at(-1) : plan.exitDate;
    if (!legs) { /* بند بالا گفته چرا */ }
    else if (exitDates.includes(wantExit)) exitWheel.select(wantExit);
    else skipped.push(`روز سنجش ${dateLabel(plan.exitDate)} برای همه پاها قیمت کامل ندارد`);

    // قیمت دستی تحلیل تاریخی، ورودی محاسبه است نه نتیجه؛ پس همراه همان پای
    // شماره‌دار بازسازی می‌شود. پس از انتخاب تاریخ خروج می‌نشیند، چون ساخت
    // دوباره چرخ تاریخ، کارت‌های قیمت را از نو رسم می‌کند.
    manualEntry = Object.fromEntries(Object.entries(plan.manualEntry || {})
      .filter(([index, value]) => Number.isInteger(Number(index))
        && Number(index) >= 0 && Number(index) < (legs?.length || 0)
        && Number.isFinite(Number(value)) && Number(value) > 0)
      .map(([index, value]) => [String(index), Number(value)]));
    if (Object.keys(manualEntry).length) paintSnapshots();

    if (!skipped.length && plan.autoRun) {
      setStatus(plan.live
        ? `موقعیت از ${sourceName} چیده شد؛ در حال اتصال به معاملات امروز…`
        : `موقعیت از ${sourceName} با همان پارامترها چیده شد؛ در حال اجرای بک‌تست…`);
      if (plan.live) await startLiveWatch(); else await runBacktest();
      return;
    }
    setStatus(skipped.length
      ? `موقعیت از ${sourceName} آمد، ولی ${skipped.join('؛ ')}.`
      : `موقعیت از ${sourceName} چیده شد؛ دکمه اجرای بک‌تست را بزن.`, skipped.length > 0);
    $('bt-work').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  entryRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(entryRail, button.dataset.basis); if (entryDates.length) refreshCombos(); } });
  exitRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(exitRail, button.dataset.basis); refreshExitDates(); } });
  $('bt-combo').addEventListener('change', renderCombo);
  $('bt-load').addEventListener('click', loadHistory); $('bt-run').addEventListener('click', runBacktest); $('bt-live').addEventListener('click', startLiveWatch);
  $('bt-export-intraday').addEventListener('click', exportIntraday);
  $('bt-days-table').addEventListener('click', (event) => {
    const row = event.target.closest('[data-day]');
    if (row) openDayIntraday(Number(row.dataset.day));
  });
  $('bt-days-table').addEventListener('keydown', (event) => {
    const row = event.target.closest('[data-day]');
    if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDayIntraday(Number(row.dataset.day)); }
  });
  $('bt-tf-run').addEventListener('click', runTimeframe);

  // ——————————————— بایگانی اجراها ———————————————
  //
  // ورودی‌ها و سرخطِ نتیجه ذخیره می‌شوند، نه مسیرِ روزانه: مسیر هزاران ردیف
  // است و اگر ذخیره می‌شد، دو نسخه از یک حقیقت می‌داشتیم که با عوض شدنِ
  // موتور از هم واگرا می‌شوند. برای مسیر کامل، همان خروجی اکسل هست.
  let runs = readRuns();
  let comparePick = ['', ''];

  function paintRuns() {
    $('bt-runs-list').innerHTML = runsListHtml(runs);
    const options = (selected) => `<option value="">— انتخاب کن —</option>`
      + runs.map((run) => `<option value="${run.id}" ${run.id === selected ? 'selected' : ''}>${escapeHtml(runLabelOf(run))}</option>`).join('');
    $('bt-runs-pick').innerHTML = runs.length >= 2
      ? `<div class="field"><label for="bt-run-a">اجرای اول</label><select id="bt-run-a">${options(comparePick[0])}</select></div>
         <div class="field"><label for="bt-run-b">اجرای دوم</label><select id="bt-run-b">${options(comparePick[1])}</select></div>`
      : '';
    const a = runs.find((run) => run.id === comparePick[0]);
    const b = runs.find((run) => run.id === comparePick[1]);
    $('bt-runs-compare').innerHTML = runs.length >= 2 && a && b ? runsCompareHtml(a, b) : '';
    for (const id of ['bt-run-a', 'bt-run-b']) {
      const select = $(id);
      if (!select) continue;
      select.addEventListener('change', () => {
        comparePick = [$('bt-run-a')?.value || '', $('bt-run-b')?.value || ''];
        paintRuns();
      });
    }
    for (const button of $('bt-runs-list').querySelectorAll('[data-run-drop]')) {
      button.addEventListener('click', () => {
        runs = runs.filter((run) => run.id !== button.dataset.runDrop);
        writeRuns(runs);
        paintRuns();
      });
    }
  }

  const runLabelOf = (run) => [run.uaName, run.strategyName || run.comboName,
    new Date(run.at).toLocaleString('fa-IR')].filter(Boolean).join(' · ');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));

  $('bt-run-save').addEventListener('click', () => {
    const msg = $('bt-run-msg');
    const record = makeRunRecord({
      at: Date.now(),
      uaName: ua?.name || '',
      strategyName: strategySelect.selectedOptions[0]?.textContent || '',
      comboName: $('bt-combo').selectedOptions[0]?.textContent || '',
      from: replay?.rows?.[0]?.date || 0,
      to: replay?.rows?.at(-1)?.date || 0,
      entryBasis: entryRail.dataset.value, exitBasis: exitRail.dataset.value,
      units: Math.max(1, Math.trunc(Number($('bt-units').value) || 1)),
      replay, settings: state.settings, note: $('bt-run-label').value,
    });
    // اجرایی بی روزِ معتبر چیزی برای مقایسه ندارد؛ رکوردِ نصفه ساخته نمی‌شود.
    if (!record) { msg.textContent = 'هنوز اجرایی با روز معتبر نداری که بایگانی شود.'; return; }
    runs = addRun(runs, record);
    msg.textContent = writeRuns(runs)
      ? 'بایگانی شد.'
      : 'حافظهٔ مرورگر در دسترس نیست؛ این اجرا فقط تا بستن صفحه می‌ماند.';
    $('bt-run-label').value = '';
    paintRuns();
  });

  paintRuns();

  /**
   * فایل جامع گام سوم.
   *
   * یونانی‌ها همین‌جا مهر می‌خورند، نه در جریان رنگ‌آمیزی: محاسبه‌شان برای
   * هر روز و هر پا یک ریشه‌یابی تلاطم دارد و انجامش در هر رنگ‌آمیزی، تبی را
   * که فقط جدول را مرتب می‌کند هم کند می‌کرد. برای فایل، یک‌بار بس است.
   */
  async function exportTimeframeExcel() {
    if (!replay?.ok || !timeframeDays.length) return;
    // ساخت فایل چند صد هزار ردیفی چند ثانیه طول می‌کشد و فشرده‌سازی هم
    // ناهمگام است. بی این قفل، کاربر دکمه را دو بار می‌زند و دو ساخت هم‌زمان
    // روی یک نخ می‌نشیند — نتیجه‌اش فقط کندتر شدن هر دو است.
    const button = $('bt-tf-export'), size = $('bt-tf-export-size');
    if (button.disabled) return;
    button.disabled = true;
    size.textContent = 'در حال ساخت فایل…';
    const params = ivP();
    annotateDailyGreeks(replay, params);
    const buckets = annotateBucketIv(
      bucketIntradayPath(timeframeDays, { bucketSeconds: timeframeSeconds }), { legs: replay.priced }, params,
    );
    try {
      const bytes = await downloadBacktestExcel({
        ua, strategyName: strategySelect.selectedOptions[0]?.textContent || '',
        comboName: $('bt-combo').selectedOptions[0]?.textContent || '',
        replay, intraday, buckets, params,
        holding: intradayHoldingSummary(timeframeDays),
        timeOfDay: timeOfDayProfile(timeframeDays, { bucketSeconds: timeframeSeconds }),
        entryExit: intradayEntryExitProfile(timeframeDays, {
          legs: replay.priced, bucketSeconds: timeframeSeconds, fees: feesOf(state.settings),
        }),
        timeframeSeconds, intradayDate, generatedAt: faClock(new Date()),
      });
      size.textContent = `${fmt.int(Math.max(1, Math.round(bytes / 1024)))} کیلوبایت`;
    } catch (error) {
      size.textContent = errorText(error, 'ساخت فایل انجام نشد.');
    } finally {
      button.disabled = false;
    }
  }

  $('bt-tf-export').addEventListener('click', exportTimeframeExcel);

  // عوض‌شدن پارامتر یعنی هر سه تایم‌فریم باید از نو مهر بخورند. جدول‌هایی
  // که تلاطم را در خانه‌هایشان نشان می‌دهند هم دوباره کشیده می‌شوند، وگرنه
  // عدد جدول و عدد نمودار دو حرف می‌زدند.
  function reapplyIv() {
    if (!replay?.ok) return;
    annotateDailyIv(replay, ivP());
    annotateIntradayIv(intraday, { legs: replay.priced, date: intradayDate }, ivP());
    paintDayTable();
    paintIntradayAnalysis();
    paintIv();
    if (!$('bt-tf-body').hidden) paintTimeframe(true);
    paintPanels();
  }

  paintIvParams();

  $('bt-iv-params').addEventListener('input', (event) => {
    const field = event.target.closest('[data-iv-param]');
    if (!field) return;
    const raw = field.value.trim();
    // خانهٔ خالی یعنی «همان تنظیمات سراسری»، نه صفر.
    if (raw === '') delete ivOverride[field.dataset.ivParam];
    else ivOverride[field.dataset.ivParam] = Number(raw);
    reapplyIv();
  });
  $('bt-iv-params').addEventListener('click', (event) => {
    if (!event.target.closest('#bt-iv-reset')) return;
    for (const key of Object.keys(ivOverride)) delete ivOverride[key];
    syncIvParams();
    reapplyIv();
  });
  $('bt-tf-size').addEventListener('change', () => {
    // تایم‌فریم فقط سطل‌بندی را عوض می‌کند، نه داده را. اگر روزها گرفته شده‌اند
    // دوباره درخواستی نمی‌رود.
    timeframeSeconds = Math.max(60, Number($('bt-tf-size').value) || 900);
    if (timeframeDays.length) { paintTimeframe(null); paintPanels(); }
  });
  $('bt-entry-market').addEventListener('input', onManualInput);
  $('bt-exit-market').addEventListener('input', onManualInput);
  baseSelect.addEventListener('change', () => { if (liveWatching) stopLiveWatch(); $('bt-work').hidden = true; $('bt-result').hidden = true; showSetupOnly(); });
  strategySelect.addEventListener('change', () => { if (liveWatching) stopLiveWatch(); $('bt-work').hidden = true; $('bt-result').hidden = true; showSetupOnly(); });

  // ——— فهرست قراردادها از **بازه** می‌آید، نه از تابلوی امروز ———
  //
  // پیش از این `/api/history/universe` بی‌تاریخ صدا می‌شد، پس هر تحلیلِ
  // گذشته فقط قراردادهای زندهٔ امروز را می‌دید و آن‌هایی که داخل بازهٔ
  // بررسی سررسید شده بودند اصلاً در فهرست نبودند.
  let rangeUi = null, rangeJob = null;

  function fillBases(payload) {
    const keep = baseSelect.value;
    chain = buildChain(payload.rows || []);
    baseSelect.innerHTML = '<option value="">نماد پایه را انتخاب کن</option>';
    baseGate.ready(chain.size);
    for (const item of [...chain.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fa'))) {
      const option = document.createElement('option'); option.value = item.ins; option.textContent = `${nameOf(item, 'نماد پایه')} · ${fmt.int(item.contracts)} قرارداد`; baseSelect.appendChild(option);
    }
    if (keep && chain.has(keep)) baseSelect.value = keep;
    const expired = payload.summary?.expiredInside || 0;
    setStatus(`${fmt.int(chain.size)} نماد پایه در این بازه؛ ${fmt.int(payload.rosterContracts || 0)} قرارداد که ${fmt.int(expired)} تای آن‌ها داخل همین بازه سررسید شده‌اند.`);
  }

  async function loadUniverseForRange(range) {
    rangeJob?.stop();
    baseGate.loading();
    rangeJob = loadRange(range, rangeUi, { onUpdate: fillBases });
    try { fillBases(await rangeJob.first); }
    catch (error) { baseGate.failed(); setStatus(errorText(error, 'فهرست قراردادهای این بازه دریافت نشد.'), true); }
  }

  rangeUi = mountHistoryRange($('bt-range'), { initialRange: handoffRange(state.handoff), onApply: (range) => loadUniverseForRange(range) });
  await loadUniverseForRange(rangeUi.range);

  // تحویل عمر یک کلیک دارد: همین‌جا برداشته و پاک می‌شود تا باز کردن دوباره
  // این تب، دوباره همان چیدمان را روی انتخاب تازه کاربر ننشاند.
  if (state.handoff?.to === 'backtest') {
    const plan = state.handoff;
    state.handoff = null;
    if (chain.size) await applyHandoff(plan);
  }

  return () => { clearInterval(liveTimer); rangeJob?.stop(); };
}
