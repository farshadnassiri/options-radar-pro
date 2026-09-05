// تب «رادار فاصله» — اسپرد به معنی لغویش، در یک نگاه.
//
// ═══ چرا تبِ جدا و نه پنلی در تب‌های موجود ═══
//
// فاصله پرسشی است که در همهٔ خانواده‌های اسپرد و استرانگل یکی است و در
// هیچ‌کدام از تب‌های موجود «موضوعِ اصلی» نیست. گذاشتنش به‌عنوان پنلِ
// شانزدهم در «آزمون همه استراتژی‌ها» یعنی کسی که فقط دنبال فاصله است باید
// از پانزده پنلِ دیگر رد شود — همان دلیلی که «رصد یونانی» را تبِ مستقل
// کرد.
//
// ═══ سه پرسش، سه زیرتب ═══
//
//   اکنون     همهٔ ترکیب‌های فاصله‌دارِ این نماد، با فاصله‌شان و روندِ
//             کوچکشان. جدولی برای انتخاب.
//   تاریخچه   یک ترکیب، در عمق: مسیر، پرشدگی، توزیع، ساعت، عقربه.
//   هشدارها   شرط بگذار و برو. برنامه خبرت می‌کند.
//
// ═══ ترتیب: تاریخ، بعد نماد ═══
//
// همان قاعدهٔ بقیهٔ تب‌های تاریخ‌دار. فهرست نماد از خودِ بازه ساخته می‌شود.

import { faDigits, fmt } from '/ui/fmt.mjs';
import { buildChain } from '/core/chain.mjs';
import { byId } from '/strategies/catalog.mjs';
import {
  flattenActiveContracts, historyDateLabel,
} from '/core/history.mjs';
import { baseAfterRange, loadRange, mountHistoryRange } from '/ui/history-range.mjs';
import { loadHistoricalDailies } from '/ui/history-dailies.mjs';
import {
  DEFAULT_SCALE, GAP_SCALES, GAP_STRATEGY_IDS, comboSymbolText, gapNote, gapScale, measureGap,
} from '/core/spread-gap.mjs';
import {
  GAP_TIMEFRAMES, gapVerdict, indexedPair, intradayGapSeries, joinLive, resample, seriesStats,
  versusBase,
} from '/core/spread-gap-series.mjs';
import { buildRadarHistory, expiryShortfall, radarDataReport } from '/core/radar-history.mjs';
import {
  ALERT_METRICS, ALERT_OPS, DEFAULT_COOLDOWN_SEC, alertDistance, alertSnapshot, evaluateAlerts,
  normalizeRule, ruleNote,
} from '/core/gap-alert.mjs';
import { comboMetrics } from '/core/radar-metrics.mjs';
import {
  LIVE_INS_CAP, LIVE_PRIORITIES, comboLiveQuote, livePriority, liveQuoteBook, planLiveQuotes,
  tehranSecondOfDay,
} from '/core/live-quote.mjs';
import { makeDayRange } from '/core/day-range.mjs';
import { MOMENT_GRAINS, isIntradayGrain } from '/core/intraday-grid.mjs';
import { tehranDateNumber } from '/core/live-day.mjs';
import { chartGroup } from '/ui/chart-host.mjs';
import { makeTable } from '/ui/table.mjs';
import { RADAR_ALL_COLS, RADAR_COLS, symbolCell, toTableRow } from '/ui/radar-columns.mjs';
import { mountSubtabs } from '/ui/subtabs.mjs';
import {
  coverageChart, distributionChart, fillGauge, gapBandChart, gapPathChart, hourHeatmap,
  indexedChart, rangeChart, versusBaseChart, versusBaseScatter,
} from '/ui/gap-charts.mjs';
import {
  NOTIFY_LABEL, askNotifyPermission, clearLog, deliverBurst, metricText, notifyState, readLog,
  testDelivery,
} from '/ui/gap-alarm.mjs';
import { logError } from '/ui/errlog.mjs';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const finite = (value) => Number.isFinite(value);
const nameOf = (item, fallback = 'نماد پایه') => String(item?.name || '').trim() || fallback;
const RULES_KEY = 'gap-alerts:rules';

// خانواده‌های فاصله‌دار، از خودِ کاتالوگ. فهرست دستی یعنی روزی استراتژی
// تازه اضافه می‌شود و اینجا جا می‌ماند.
const GAP_DEFS = GAP_STRATEGY_IDS.map((id) => byId(id)).filter(Boolean);
const GAP_GROUPS = [...new Set(GAP_DEFS.map((def) => def.group))];


function readRules() {
  try {
    return JSON.parse(localStorage.getItem(RULES_KEY) || '[]')
      .map((raw) => normalizeRule(raw)).filter((row) => row.ok).map((row) => row.rule);
  } catch { return []; }
}
function saveRules(rules) {
  try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)); }
  catch { /* حافظه پر یا قفل؛ قاعده‌ها این جلسه کار می‌کنند و ذخیره نمی‌شوند */ }
}

export async function mount(root, { state }) {
  root.classList.add('gap-skin');
  root.innerHTML = `
  <section class="gap-hero">
    <div>
      <p class="eyebrow">اسپرد یعنی فاصله</p>
      <h1>رادار فاصله</h1>
      <p>بین دو قیمت اعمال چقدر جا هست، ساختار همین حالا چقدرش را پر کرده، و چقدر مانده که پر شود — برای هر اسپرد و هر استرانگل، در لحظه و در طول تاریخ.</p>
    </div>
    <span class="gap-hero-tag" id="gr-hero-tag">هنوز چیزی بارگذاری نشده</span>
  </section>

  <section class="card gap-setup">
    <div class="section-head"><div><p class="eyebrow">گام اول</p><h2>بازه، نماد، و خانواده</h2></div><b id="gr-status" role="status" aria-live="polite">در حال دریافت…</b></div>
    <div id="gr-range" class="step-first" data-step="۱"></div>
    <div class="gap-form">
      <label class="step-next" data-step="۲">نماد پایه<select id="gr-base" disabled><option value="">اول بازه را انتخاب کن</option></select></label>
      <label>استراتژی<select id="gr-strategy">
        <option value="all">همهٔ استراتژی‌های فاصله‌دار</option>
        ${GAP_GROUPS.map((group) => `<optgroup label="${esc(groupLabel(group))}">${GAP_DEFS.filter((def) => def.group === group).map((def) => `<option value="${esc(def.id)}">${esc(def.name)}</option>`).join('')}</optgroup>`).join('')}
      </select></label>
      <label>مبنای قیمت<select id="gr-basis">
        <option value="CLOSE">قیمت پایانی</option>
        <option value="LAST">آخرین معامله</option>
        <option value="FIRST">اولین معامله</option>
      </select></label>
      <label>مقیاس عدد<select id="gr-scale">
        ${GAP_SCALES.map((row) => `<option value="${esc(row.id)}"${row.id === DEFAULT_SCALE ? ' selected' : ''}>${esc(row.label)}</option>`).join('')}
      </select></label>
      <label>تعداد واحد<input id="gr-units" type="number" min="1" max="10000" step="1" value="${Math.max(1, state.settings.qtyDefault || 1)}"></label>
      <label>کمینه ارزش معاملهٔ هر پا<input id="gr-min-value" type="number" min="0" step="1000000" value="0" placeholder="ریال"></label>
      <label>کمینه حجم معاملهٔ هر پا<input id="gr-min-volume" type="number" min="0" step="1" value="0" placeholder="قرارداد"></label>
      <button type="button" class="primary" id="gr-load">دریافت تاریخچه و ساخت فاصله‌ها</button>
      <button type="button" class="ghost" id="gr-stop" hidden>توقف دریافت و ساخت</button>
    </div>
    <div class="gap-data" id="gr-data" aria-live="polite"></div>
    <p class="gap-note" id="gr-scale-note"></p>
    <p class="gap-note">قیمت روزانه برای بررسی تاریخی است؛ آخرین معامله نیز تضمین اجرای هم‌زمان پاها نیست.</p>
    <p class="gap-note">استراتژی را با نام خودش انتخاب کن؛ «همهٔ استراتژی‌ها» هر ${faDigits(String(GAP_DEFS.length))} ساختار فاصله‌دار را می‌سازد و ساختنش طول می‌کشد.</p>
    <p class="gap-note">فاصله فقط برای ساختارهایی معنی دارد که دست‌کم دو قیمت اعمال داشته باشند. تک‌پا و استرادل و کاوردکال در این تب نمی‌آیند — و این نبودن، نقص نیست.</p>
  </section>

  <div id="gr-tabs" class="subtabs" hidden></div>

  <div class="gap-panel" data-panel="now" hidden>
    <div class="gap-kpis" id="gr-kpis"></div>
    <section class="card">
      <div class="section-head">
        <div><p class="eyebrow">همهٔ ترکیب‌های فاصله‌دار</p><h2>فاصله در این لحظه</h2></div>
        <div class="gap-toolbar">
          <label class="check"><input type="checkbox" id="gr-live"> رصد زندهٔ بازار</label>
          <label>اولویت سهمیهٔ زنده<select id="gr-live-priority">${LIVE_PRIORITIES.map((row) => `<option value="${esc(row.id)}">${esc(row.label)}</option>`).join('')}</select></label>
          <span id="gr-live-state" class="gap-live-state">خاموش</span>
        </div>
      </div>
      <p class="gap-note" id="gr-live-note">—</p>
      <p class="gap-note" id="gr-now-note">—</p>
      <div id="gr-table" class="gap-grid"></div>
    </section>
    <div id="gr-alarm-host" class="gap-alarm-host" aria-live="assertive"></div>
  </div>

  <div class="gap-panel" data-panel="history" hidden>
    <section class="card">
      <div class="section-head"><div><p class="eyebrow">یک ترکیب، در عمق</p><h2>تاریخچهٔ فاصله</h2></div>
        <div class="gap-toolbar">
          <label>ترکیب<select id="gr-pick"></select></label>
          <label>تایم‌فریم<select id="gr-timeframe">${GAP_TIMEFRAMES.map((row) => `<option value="${esc(row.id)}">${esc(row.label)}</option>`).join('')}</select></label>
          <label>دانه‌بندی درون‌روزی<select id="gr-grain">${MOMENT_GRAINS.map((row) => `<option value="${row.id}">${esc(row.label)}</option>`).join('')}</select></label>
          <label id="gr-day-wrap" hidden>روز سنجش<select id="gr-day"></select></label>
          <button type="button" class="ghost" id="gr-grain-run" hidden>دریافت ریزمعاملهٔ آن روز</button>
        </div>
      </div>
      <p class="gap-note" id="gr-grain-note"></p>
      <p class="gap-note" id="gr-tail-note"></p>
      <div class="gap-ident" id="gr-ident" hidden></div>
      <p class="gap-verdict" id="gr-verdict">—</p>
    </section>
    <div class="gap-chart-grid">
      <section class="card gap-chart-wide"><div class="section-head"><div><p class="eyebrow">دو نرخ، و فاصله‌شان</p><h3 id="gr-band-title">تفاضل دو نرخ</h3></div><span id="gr-band-unit">—</span></div><p class="gap-hint" id="gr-band-hint"></p><div id="gr-band" class="gap-chart gap-chart-lg"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">مسیر</p><h3>فاصله در طول زمان</h3></div><span id="gr-path-unit">—</span></div><div id="gr-path" class="gap-chart gap-chart-lg"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">دامنه</p><h3>باز، بیشینه، کمینه، بسته</h3></div><span>فقط در تایم‌فریم هفتگی و ماهانه</span></div><div id="gr-range-chart" class="gap-chart gap-chart-lg"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">پرشدگی</p><h3>چقدر پر شد، چقدر جا ماند</h3></div><span>درصد</span></div><div id="gr-cover" class="gap-chart gap-chart-lg"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">توزیع</p><h3>اکنون کجای تاریخِ خودش ایستاده</h3></div><span>شمار نقاط</span></div><div id="gr-dist" class="gap-chart"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">حکم</p><h3>عقربهٔ پرشدگی</h3></div></div><div id="gr-gauge" class="gap-chart"></div></section>
      <section class="card gap-chart-wide"><div class="section-head"><div><p class="eyebrow">الگوی ساعتی</p><h3>روز در برابر ساعت</h3></div><span>فقط با دانه‌بندی درون‌روزی</span></div><div id="gr-heat" class="gap-chart gap-chart-lg"></div></section>
    </div>

    <section class="card"><div class="section-head"><div><p class="eyebrow">در برابر دارایی پایه</p><h2>فاصله با نماد پایه چه می‌کند</h2></div><b id="gr-base-verdict">—</b></div>
      <p class="gap-note">سه نگاه به یک پرسش: هم‌زمان روی دو محور، هم‌مقیاس‌شده به صد، و پراکنش با خط برازش. ساختاری که ادعای خنثی‌بودن دارد باید در پراکنش، ابرِ بی‌شکل بدهد؛ شیبِ نزدیک به یک یعنی در عمل یک شرط جهت‌دار بوده.</p>
    </section>
    <div class="gap-chart-grid">
      <section class="card gap-chart-wide"><div class="section-head"><div><p class="eyebrow">هم‌زمان</p><h3>فاصله و قیمت پایه، دو محور</h3></div></div><div id="gr-vs" class="gap-chart gap-chart-lg"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">هم‌مقیاس</p><h3>هر دو از صد شروع می‌کنند</h3></div><span>درصد</span></div><div id="gr-indexed" class="gap-chart gap-chart-lg"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">رابطه</p><h3>پراکنش و خط برازش</h3></div></div><div id="gr-scatter" class="gap-chart gap-chart-lg"></div></section>
    </div>
  </div>

  <div class="gap-panel" data-panel="alerts" hidden>
    <section class="card">
      <div class="section-head"><div><p class="eyebrow">شرط بگذار و برو</p><h2>هشدار فاصله</h2></div><b id="gr-notify-state">—</b></div>
      <div class="gap-form gap-rule-form">
        <label>دامنه<select id="gr-rule-scope">
          <option value="">همهٔ ترکیب‌های این نماد</option>
          <option value="strategy">فقط یک استراتژی</option>
          <option value="combo">فقط ترکیب انتخاب‌شده</option>
        </select></label>
        <label id="gr-rule-strategy-wrap" hidden>استراتژی<select id="gr-rule-strategy">${GAP_DEFS.map((def) => `<option value="${esc(def.id)}">${esc(def.name)}</option>`).join('')}</select></label>
        <label>سنجه<select id="gr-rule-metric">${ALERT_METRICS.map((row) => `<option value="${esc(row.id)}">${esc(row.label)}</option>`).join('')}</select></label>
        <label>شرط<select id="gr-rule-op">${ALERT_OPS.map((row) => `<option value="${esc(row.id)}">${esc(row.label)}</option>`).join('')}</select></label>
        <label>آستانه<input id="gr-rule-value" type="number" step="any" value="0"></label>
        <label>آرامش (ثانیه)<input id="gr-rule-cooldown" type="number" min="0" step="10" value="${DEFAULT_COOLDOWN_SEC}"></label>
        <label class="check"><input type="checkbox" id="gr-rule-sound"> صدا هم بزند</label>
        <button type="button" class="primary" id="gr-rule-add">افزودن هشدار</button>
      </div>
      <p class="gap-note" id="gr-rule-hint">—</p>
      <div class="gap-alarm-actions">
        <button type="button" class="ghost" id="gr-notify-ask">اجازهٔ اعلان مرورگر</button>
        <button type="button" class="ghost" id="gr-notify-test">آزمایش کانال‌ها</button>
      </div>
    </section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">فهرست</p><h3>هشدارهای فعال</h3></div><span id="gr-rule-count">—</span></div>
      <div id="gr-rule-list" class="gap-rule-list"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">دفترچه</p><h3>چه زمانی و روی چه عددی زد</h3></div><button type="button" class="ghost" id="gr-log-clear">پاک کردن دفترچه</button></div>
      <div id="gr-log" class="gap-log"></div></section>
    <div id="gr-alarm-host-2" class="gap-alarm-host" aria-live="assertive"></div>
  </div>`;

  // ————————————————————————— حالت —————————————————————————

  const charts = chartGroup();
  const baseSelect = $('gr-base');
  const baseGate = baseAfterRange(baseSelect);
  let rangeUi = null, rangeJob = null;
  let chain = new Map(), ua = null, seriesByIns = {}, dates = [], rows = [];
  let rules = readRules();
  let prevSnapshots = {};
  let liveTimer = 0, livePrices = null, tapeByIns = null, tapeDate = 0;
  // ── حالتِ رصد زنده ───────────────────────────────────────────────────
  //
  // `liveGen` نسلِ رصد است. «توقف هنگام درخواست کند قابل اعتماد نیست»:
  // رصد در میانهٔ یک پاسخِ پانزده‌ثانیه‌ای خاموش می‌شد و پاسخ که می‌رسید،
  // نوار دوباره «روشن» می‌نوشت و جدول را زنده می‌کرد. حالا هر پاسخ نسلِ
  // خودش را با نسلِ فعلی می‌سنجد و پاسخِ نسلِ مرده دور ریخته می‌شود.
  //
  // `liveBusy` و `liveJob` جوابِ «درخواست‌های زنده می‌توانند روی هم
  // بیفتند»‌اند: تیک ده‌ثانیه‌ای روی پاسخی که هنوز نیامده سوار نمی‌شود، و
  // توقف، درخواستِ جاری را واقعاً لغو می‌کند.
  let liveGen = 0, liveBusy = false, liveJob = null;
  let liveBook = null, liveBase = NaN, liveAt = 0;
  // دفترِ کف و سقفِ **امروز**. پیش از این «کف امروز» کمینهٔ کل بازهٔ
  // تاریخی بود؛ حالا فقط از مشاهده‌های همین رصد ساخته می‌شود.
  const dayRange = makeDayRange();
  // ── دنبالهٔ زندهٔ امروز ────────────────────────────────────────────────
  //
  // «رصدگر لحظه‌ای در هر زمان از روز … از شروع بازار تا آن لحظه را هم
  // نشان بدهد» و «نمودارهای تاریخی و روند گذشته نیز قابل رویت باشد، با
  // رنگ یا شکلی متفاوت». هر دو یک ساختار می‌خواهند: سریِ روزانه تا
  // دیروز، و ریزمعاملهٔ امروز از آغاز جلسه، پشت سر هم روی یک محور.
  //
  // فقط برای ترکیبِ باز در زیرتب تاریخچه گرفته می‌شود — نه برای هر ردیف
  // جدول. ریزمعاملهٔ هر پا یک درخواست است و صد ترکیب یعنی دویست درخواست
  // در هر تیک.
  let liveSeries = null, liveTailKey = '', liveTailBusy = false;
  let subtabs = null, table = null;
  // کلیدِ ترکیب‌هایی که در آخرین تیک، قیمت زنده داشتند. ستون «مظنهٔ زنده»
  // از همین می‌آید — بی آن، ردیفی که قیمت زنده نگرفته با ردیفی که گرفته
  // یک‌شکل دیده می‌شود و کاربر نمی‌داند کدام عدد کهنه است.
  const liveKeys = new Set();
  let activeLoad = null, mounted = true, report = null, universeVersion = 0;
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  const setStatus = (text, bad = false) => {
    const node = $('gr-status');
    node.textContent = text;
    node.classList.toggle('bad', !!bad);
  };
  const units = () => Math.max(1, Math.trunc(Number($('gr-units').value) || 1));

  // ————————————————————————— بازه و نماد —————————————————————————

  function fillBases(payload) {
    const keep = baseSelect.value;
    chain = buildChain(payload.rows || []);
    baseSelect.innerHTML = '<option value="">نماد پایه را انتخاب کن</option>';
    baseGate.ready(chain.size);
    for (const item of [...chain.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fa'))) {
      const option = document.createElement('option');
      option.value = item.ins;
      option.textContent = `${nameOf(item)} · ${fmt.int(item.contracts)} قرارداد`;
      baseSelect.appendChild(option);
    }
    if (keep && chain.has(keep)) baseSelect.value = keep;
    if (!activeLoad && !rows.length) {
      setStatus(`${fmt.int(chain.size)} نماد پایه آمادهٔ انتخاب است؛ جزئیات پوشش کل بازار زیر بازه قرار دارد.`);
      $('gr-hero-tag').textContent = 'فهرست قراردادها آماده است';
      paintData();
    }
  }

  async function loadUniverseForRange(range) {
    const version = ++universeVersion;
    cancelLoad();
    rangeJob?.stop();
    baseGate.loading();
    hideResults();
    chain = new Map(); report = null; paintData();
    const current = () => mounted && version === universeVersion;
    const rangeStatus = { note: (...args) => { if (current()) rangeUi?.note(...args); },
      build: (value) => current() ? rangeUi?.build(value) : false };
    rangeJob = loadRange(range, rangeStatus, { onUpdate: (payload) => { if (current()) fillBases(payload); } });
    try { const payload = await rangeJob.first; if (current()) fillBases(payload); }
    catch (error) {
      if (!current()) return;
      baseGate.failed();
      $('gr-hero-tag').textContent = 'دریافت فهرست ناموفق بود';
      setStatus(`فهرست قراردادهای این بازه دریافت نشد: ${error.message}`, true);
    }
  }

  function hideResults() {
    stopLive();
    charts.disposeAll();
    rows = [];
    $('gr-tabs').hidden = true;
    for (const panel of root.querySelectorAll('.gap-panel')) panel.hidden = true;
    $('gr-hero-tag').textContent = 'برای این انتخاب هنوز قیمت دریافت نشده';
  }

  function cancelLoad() {
    activeLoad?.abort(); activeLoad = null;
    $('gr-load').disabled = false; $('gr-stop').hidden = true;
  }
  function invalidate() {
    cancelLoad(); hideResults(); report = null; paintData();
    setStatus('انتخاب تغییر کرد؛ دریافت تاریخچه و ساخت فاصله‌ها را اجرا کن.');
  }
  baseSelect.addEventListener('change', invalidate);
  $('gr-strategy').addEventListener('change', invalidate);
  $('gr-min-value').addEventListener('change', invalidate);
  $('gr-min-volume').addEventListener('change', invalidate);
  $('gr-basis').addEventListener('change', invalidate);
  // مقیاس، خودِ عددها را عوض می‌کند (خام / ×اندازه / ×اندازه×تعداد)، پس
  // مثل مبنای قیمت، نتیجهٔ ساخته‌شده را باطل می‌کند. نسبت‌ها عوض
  // نمی‌شوند — واحد عوض می‌شود — ولی هر عددِ ریالیِ روی صفحه می‌شود.
  $('gr-scale').addEventListener('change', () => { paintScaleNote(); invalidate(); });
  $('gr-units').addEventListener('change', () => { paintScaleNote(); if ($('gr-scale').value === 'qty') invalidate(); });

  /** جملهٔ زیر فرم: این مقیاس یعنی چه، و چه چیزی را عوض نمی‌کند. */
  function paintScaleNote() {
    const meta = gapScale($('gr-scale').value);
    const tail = meta.id === 'qty' ? ` تعداد فعلی: ${fmt.int(units())}.` : '';
    $('gr-scale-note').textContent = `${meta.hint}${tail} مقیاس فقط واحدِ نمایش را عوض می‌کند؛ «چند درصد پر شده» در هر سه مقیاس یک عدد است، چون هم فاصلهٔ اعمال و هم ارزش کنونی با یک ضریب بزرگ می‌شوند.`;
  }

  // ————————————————————————— ساخت فاصله‌ها —————————————————————————

  $('gr-load').addEventListener('click', () => void loadEverything());
  $('gr-stop').addEventListener('click', () => {
    cancelLoad(); hideResults();
    $('gr-hero-tag').textContent = 'عملیات متوقف شد';
    setStatus('دریافت و ساخت متوقف شد؛ نتیجه‌ای از اجرای ناتمام نمایش داده نمی‌شود. برای تلاش دوباره دکمهٔ دریافت را بزن.');
  });

  function paintData() {
    const selected = chain.get(baseSelect.value);
    if (!selected) { $('gr-data').textContent = 'یک نماد انتخاب کن تا وضعیت قراردادهای همان نماد را ببینی.'; return; }
    const all = flattenActiveContracts(selected, ''), active = flattenActiveContracts(selected, state.settings.blockedExpiries);
    const header = `${nameOf(selected)}: ${fmt.int(all.length)} قرارداد در بازه · ${fmt.int(all.length - active.length)} قرارداد کنارگذاشته به‌علت سررسید سقف‌پر · ${fmt.int(active.length)} قرارداد برای دریافت قیمت`;
    if (!report) { $('gr-data').textContent = header; return; }
    const reasons = { error: 'دریافت ناموفق', empty: 'پاسخ خالی؛ قیمت دریافت نشد', outside: 'تاریخچه موجود است، اما بیرون از بازه', unpriced: 'در مبنای انتخابی قیمت معتبر ندارد', ready: 'قیمت در بازه دارد' };
    const dateText = (date) => date ? faDigits(historyDateLabel(date)) : '—';
    const baseText = report.base.status === 'ready' ? `پایه در بازه قیمت دارد؛ ${fmt.int(report.dates.length)} روز در تاریخچهٔ پایه` : `نماد پایه: ${reasons[report.base.status]}`;
    const problem = [report.base, ...report.items].filter((item) => item.status !== 'ready' || !item.entry || !item.mark);
    $('gr-data').innerHTML = `<p><b>${esc(header)}</b></p>
      <p>${esc(baseText)} · ${fmt.int(report.ready)} قرارداد دارای قیمت در بازه · ${fmt.int(report.failed)} قرارداد با خطای دریافت</p>
      <p>قیمت ابتدای بازه ${dateText(report.dates[0])}: ${fmt.int(report.entryReady)} قرارداد · قیمت سنجش ${dateText(report.dates.at(-1))}: ${fmt.int(report.markReady)} قرارداد. نداشتن قیمت ابتدای بازه مانع نمایش قرارداد تازه نیست.</p>
      ${problem.length ? `<details><summary>علت کمبود داده، به تفکیک ابزار (${fmt.int(problem.length)})</summary><div class="gap-table-wrap"><table class="gap-table"><thead><tr><th>ابزار</th><th>وضعیت</th><th>قیمت ابتدای بازه</th><th>قیمت سنجش</th></tr></thead><tbody>${problem.map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(reasons[item.status])}${item.error ? `<details><summary>جزئیات خطای دریافت</summary><span>${esc(item.error)}</span></details>` : ''}</td><td>${item.entry && item.status !== 'error' ? 'دارد' : 'ندارد'}</td><td>${item.mark && item.status !== 'error' ? 'دارد' : 'ندارد'}</td></tr>`).join('')}</tbody></table></div></details>` : ''}`;
  }

  async function loadEverything() {
    const ins = baseSelect.value;
    if (!ins) { setStatus('اول بازه و بعد نماد پایه را انتخاب کن.', true); return; }
    cancelLoad();
    const job = new AbortController(); activeLoad = job;
    const current = () => mounted && activeLoad === job && !job.signal.aborted;
    const range = rangeUi.range, basis = $('gr-basis').value, strategy = $('gr-strategy').value;
    report = null; paintData();
    $('gr-load').disabled = true;
    $('gr-stop').hidden = false;
    hideResults();
    $('gr-hero-tag').textContent = 'در حال دریافت قیمت‌ها';
    try {
      ua = chain.get(ins);
      const contracts = flattenActiveContracts(ua, state.settings.blockedExpiries);
      if (!contracts.length) throw new Error('برای این نماد در این بازه قراردادی نبود');
      setStatus(`دریافت تاریخچهٔ ${fmt.int(contracts.length + 1)} ابزار…`);
      const codes = [...new Set([String(ua.ins), ...contracts.map((row) => String(row.ins))])];
      const loaded = await loadHistoricalDailies(codes, ua.ins, fetch, { signal: job.signal, tolerateErrors: true,
        onProgress: ({ phase, done, total }) => {
          if (!current()) return;
          setStatus(`${phase === 'fallback' ? 'بررسی منبع دوم برای پاسخ‌های خالی' : 'دریافت تاریخچه'}: ${fmt.int(done)} از ${fmt.int(total)} ابزار بررسی شد.`);
        } });
      if (!current()) return;
      seriesByIns = loaded.seriesByIns;
      report = radarDataReport({ ua, seriesByIns, errors: loaded.errors, range, basis, settings: state.settings });
      dates = report.dates; paintData();
      if (report.base.status === 'error' || report.failed) {
        $('gr-hero-tag').textContent = 'دریافت قیمت ناقص است';
        setStatus('دریافت بخشی از قیمت‌ها ناموفق بود؛ این وضعیت به معنی نبود فرصت نیست. علت هر ابزار را باز کن و دریافت را دوباره اجرا کن.', true);
        return;
      }
      if (!dates.length || report.base.status !== 'ready') {
        $('gr-hero-tag').textContent = 'قیمت پایه در بازه موجود نیست';
        setStatus('نماد پایه در این بازه قیمت معتبر ندارد؛ وضعیت داده را بررسی کن یا بازه را تغییر بده.', true); return;
      }
      if (!report.ready) {
        $('gr-hero-tag').textContent = 'قیمت قراردادها در بازه موجود نیست';
        setStatus('برای قراردادهای انتخابی قیمت معتبری در بازه دریافت نشد. این پیام تأیید نمی‌کند که معامله‌ای انجام نشده؛ جزئیات ابزارها و بازه را بررسی کن.', true); return;
      }
      $('gr-hero-tag').textContent = 'قیمت‌ها دریافت شد؛ در حال ساخت فاصله‌ها';
      await buildRows({ range, basis, strategy, job, current });
    } catch (error) {
      if (!current()) return;
      logError('spread-radar', error);
      $('gr-hero-tag').textContent = 'عملیات کامل نشد';
      setStatus(`ساخت فاصله‌ها کامل نشد: ${error.message}`, true);
    } finally { if (activeLoad === job) cancelLoad(); }
  }

  /**
   * ترکیب‌ها را می‌سازد و برای هرکدام فاصله و تاریخچه‌اش را درمی‌آورد.
   *
   * روز مبنا **آخرین روزِ بازه** است نه امروز: بازه می‌تواند در گذشته
   * باشد و «فاصلهٔ اکنون»ِ یک بازهٔ گذشته یعنی فاصله در پایان همان بازه.
   * گرفتنِ امروز، عددی می‌داد که به بازهٔ انتخابی ربطی نداشت.
   */
  // کشویی خانواده برداشته شد و نام استراتژی جایش نشست — «Bull Call
  // Spread» نه «اسپرد عمودی» — چون خانواده انتخابِ کسی نیست که دنبال یک
  // ساختار مشخص است؛ انتخابِ «اسپرد عمودی» هشت استراتژی را با هم می‌ساخت
  // که هیچ‌کدام خواسته نشده بود. خانواده حالا فقط برچسبِ optgroup است.
  async function buildRows({ range, basis, strategy, job, current }) {
    const defs = GAP_DEFS.filter((def) => strategy === 'all' || def.id === strategy);
    const result = await buildRadarHistory({ defs, ua, seriesByIns, range, basis, settings: state.settings,
      scale: $('gr-scale').value, units: units(),
      minLegValue: Math.max(0, Number($('gr-min-value').value) || 0),
      minLegVolume: Math.max(0, Number($('gr-min-volume').value) || 0),
      cancel: () => job.signal.aborted || !current(), yieldControl: nextFrame,
      onProgress: ({ done, total, name, combos }) => {
        if (current()) setStatus(`ساخت فاصله‌ها: ${fmt.int(done)} از ${fmt.int(total)} استراتژی بررسی شد · ${fmt.int(combos)} ترکیب آماده${name ? ` · ${name}` : ''}`);
      } });
    if (!current()) return;
    // نسخهٔ روزِ سنجش کنار هر ردیف می‌ماند. رصد زنده روی `gap`/`metrics`
    // می‌نویسد و خاموش‌شدنش باید بتواند عددِ روزانه را برگرداند، وگرنه
    // جدولِ خاموش، عددِ نیمه‌زندهٔ آخرین تیک را نگه می‌دارد.
    rows = result.rows.map((row) => ({ ...row,
      daily: { gap: row.gap, metrics: row.metrics, verdict: row.verdict } }));
    dates = result.dates;
    const excluded = result.excluded;
    const win = result.expiryWindow;
    // پنجرهٔ «روز تا سررسید» بی‌صداترین علتِ صفر شدنِ نتیجه است، چون در
    // تنظیمات است نه در این صفحه. اگر چیزی انداخته، همین‌جا با دستگیره‌اش
    // گفته می‌شود.
    const windowNote = win && win.dropped
      ? ` · ${fmt.int(win.dropped)} سررسید از ${fmt.int(win.total)} بیرونِ پنجرهٔ «${fmt.int(win.minDays)} تا ${fmt.int(win.maxDays)} روز تا سررسید» نسبت به روز سنجش افتاد${win.farthest > win.maxDays ? `؛ دورترین سررسید ${fmt.int(win.farthest)} روز از روز سنجش فاصله دارد؛ برای بررسی آن «بیشینه روز تا سررسید» را در تنظیمات تغییر بده` : ''}`
      : '';
    const thinNote = excluded.thin ? ` · ${fmt.int(excluded.thin)} ترکیب زیر آستانهٔ ارزش یا حجم معاملهٔ پاها` : '';
    const breakdown = `${fmt.int(excluded.mark)} ترکیب فاقد قیمت روز سنجش · ${fmt.int(excluded.invalid)} ساختار بدون فاصلهٔ معتبر · ${fmt.int(win?.expired || 0)} سررسید در روز سنجش پایان یافته${thinNote}${windowNote}`;
    // ساختارِ دو سررسیدی با یک سررسید ساخته نمی‌شود، و این را باید صریح
    // گفت — نه اینکه کاربر را دنبالِ بررسی قیمت‌هایی بفرستیم که سالم‌اند.
    const shortfall = expiryShortfall(defs, win);
    if (!rows.length) {
      $('gr-hero-tag').textContent = 'قیمت‌ها بررسی شد؛ ترکیب قابل نمایش نیست';
      setStatus(shortfall.note
        ? `در روز سنجش ترکیبی ساخته نشد. ${shortfall.note} (${breakdown}.)`
        : `در روز سنجش و با قیود فعلی ترکیبی برای نمایش ساخته نشد؛ ${breakdown}. قیمت روز سنجش ابزارها را بررسی کن؛ سپس بازه، خانواده یا فیلترهای استراتژی را تغییر بده.`, true);
      return;
    }
    $('gr-tabs').hidden = false;
    subtabs = mountRadarTabs(); subtabs.show('now');
    $('gr-hero-tag').textContent = `${fmt.int(rows.length)} ترکیب فاصله‌دار · ${nameOf(ua)}`;
    setStatus(`${fmt.int(rows.length)} ترکیب فاصله‌دار ساخته شد · ${breakdown}.${shortfall.note ? ` ${shortfall.note}` : ''}`);
    paintKpis();
    paintTable();
    fillPicker();
    paintHistory();
    paintRules();
    paintLog();
  }

  function mountRadarTabs() {
    return mountSubtabs($('gr-tabs'), [
      { id: 'now', label: 'اکنون', hint: 'همهٔ ترکیب‌های فاصله‌دار در یک جدول' },
      { id: 'history', label: 'تاریخچه', hint: 'یک ترکیب، در عمق' },
      { id: 'alerts', label: 'هشدارها', hint: 'شرط بگذار و برو' },
    ], { root, onChange: () => charts.resizeAll() });
  }

  // ————————————————————————— زیرتب «اکنون» —————————————————————————

  /**
   * کارت‌های بالای جدول.
   *
   * دو کارتِ «بیشترین» نامِ ترکیبشان را هم می‌گویند. بی آن، عددی مثل
   * «۶۵۶۶٪ سود باقی‌مانده» یک ادعای معلق است که خواننده نمی‌تواند
   * بازبینی‌اش کند — و تقریباً همیشه مالِ اسپردی است که به بهای ناچیزی
   * خریده می‌شود و مخرجِ کوچکش نسبت را منفجر می‌کند. عدد درست است؛ آنچه
   * کم بود، بندِ «کدام».
   */
  function paintKpis() {
    const room = rows.map((row) => row.gap.roomPct).filter(finite);
    const best = (pick) => rows
      .map((row) => ({ row, value: pick(row) }))
      .filter((one) => finite(one.value))
      .sort((a, b) => b.value - a.value)[0] || null;
    const topReturn = best((row) => row.metrics?.returnPct);
    const topPer = best((row) => row.metrics?.perDayPct);
    const cheap = rows.filter((row) => finite(row.verdict?.rank) && row.verdict.rank <= 20).length;
    const thin = rows.filter((row) => (row.metrics?.thinLegs || 0) > 0).length;
    // نامِ ترکیب و نمادهایش، نه فقط عدد. بی آن، «۶۵۶۶٪» یک ادعای معلق
    // است که خواننده نمی‌تواند بازبینی‌اش کند — و بی نامِ نماد، نمی‌تواند
    // رویش سفارش بگذارد.
    const which = (one) => (one
      ? `${one.row.def.name} · ${comboSymbolText(one.row.legs)} · ${one.row.strikes.map((k) => fmt.money(k)).join('/')}`
      : '—');
    const cards = [
      ['ترکیب فاصله‌دار', fmt.int(rows.length), 'دست‌کم دو قیمت اعمال، ارزش خالص ناصفر، و قیمت کامل در روز سنجش'],
      ['میانهٔ جای باقی‌مانده', room.length ? `${fmt.pct(median(room))}٪` : '—', 'از لنگرِ ساختاری، چقدر هنوز پر نشده. میانه است نه میانگین، تا یک ردیفِ پرت جابه‌جایش نکند.'],
      ['بیشترین سود ٪', topReturn ? `${fmt.pct(topReturn.value)}٪` : '—', which(topReturn)],
      ['بهترین بازده روزانه', topPer ? `${fmt.pct(topPer.value)}٪` : '—', which(topPer)],
      ['زیر صدک ۲۰', fmt.int(cheap), 'فاصله‌شان نزدیک کمینهٔ تاریخیِ خودشان است'],
      ['پای بی‌معامله', fmt.int(thin), 'دست‌کم یک پایشان در روز سنجش ارزش معامله‌ای نداشت؛ روی کاغذ هستند و در بازار نه'],
    ];
    $('gr-kpis').innerHTML = cards.map(([label, value, hint]) => `<article class="gap-kpi"><b>${esc(label)}</b><strong>${value}</strong><small>${esc(hint)}</small></article>`).join('');
  }

  /**
   * جدولِ «اکنون» — همان جدولِ مشترکِ برنامه، نه یکی مخصوصِ این تب.
   *
   * ═══ چرا `makeTable` و نه جدولِ دست‌ساز ═══
   *
   * خواسته این بود: «تمامی ایتمهای تاثیر گذار داخل جدول بیار و قابلیت
   * حذف و اضافه داشته باشن … با الهام از سایر جداول برنامه.» آن جدول از
   * قبل هست و چیزهایی دارد که جدولِ دست‌سازِ رادار نداشت: انتخاب و
   * جابه‌جایی ستون با ذخیره در حافظهٔ مرورگر، مرتب‌سازی روی هر ستون،
   * طیف رنگی از خودِ داده، خروجی اکسل، و مجازی‌سازی که پانصد ردیف را
   * بی‌لکنت رسم می‌کند.
   *
   * تنها چیزی که کم داشت، سلولِ نگاره‌دار بود — نوار پرشدگی و
   * اسپارک‌لاین. همان به `ui/table.mjs` اضافه شد تا بقیهٔ جدول‌ها هم
   * بتوانند داشته باشند، نه اینکه رادار نسخهٔ خودش را نگه دارد.
   */
  function mountTable() {
    if (table) return table;
    table = makeTable($('gr-table'), RADAR_COLS, {
      all: RADAR_ALL_COLS,
      storeKey: 'gap-radar-cols',
      sortKey: 'returnPct',
      exportName: 'radar-gap',
      // ردیفِ بلندتر از پیش‌فرض، چون نوار پرشدگی و اسپارک‌لاین در ۲۷
      // پیکسل جا نمی‌شوند و مجازی‌سازی با ارتفاعِ نادرست، پیمایش را
      // می‌شکند.
      rowHeight: 52,
      onPick: (flat) => {
        if (!flat?.key) return;
        $('gr-pick').value = flat.key;
        paintHistory();
        subtabs?.show?.('history');
      },
    });
    return table;
  }

  function paintTable() {
    if (!rows.length) return;
    const baseName = nameOf(ua);
    mountTable().set(rows.map((row) => toTableRow(row, { baseName, live: livePrices ? !!liveKeys.has(row.key) : null })));
    $('gr-now-note').textContent = `روز سنجش ${faDigits(historyDateLabel(dates.at(-1)))}؛ انتخاب قرارداد و پنجرهٔ سررسید بر مبنای همین روز است. مبنا: ${$('gr-basis').selectedOptions[0].textContent}. مبدأ مقایسهٔ هر ردیف، اولین روز با قیمت معتبر همهٔ پاها در بازه است؛ ورود واقعی شما نیست. قیمت روزانه، تضمین اجرای هم‌زمان پاها نیست. ستون‌ها را از دکمهٔ «ستون‌ها» کم و زیاد کن؛ انتخابت می‌ماند.`;
  }

  // ————————————————————————— زیرتب «تاریخچه» —————————————————————————

  function fillPicker() {
    const select = $('gr-pick');
    const keep = select.value;
    // نامِ نمادها در فهرست ترکیب هم می‌آید: «Bull Call Spread · خرید
    // ضهرم۵۰ · فروش ضهرم۵۴» بی‌ابهام‌تر از فهرستی از قیمت‌های اعمال است.
    select.innerHTML = rows.map((row) => `<option value="${esc(row.key)}">${esc(row.def.name)} · ${esc(comboSymbolText(row.legs))} · ${row.strikes.map((k) => fmt.money(k)).join('/')} · ${faDigits(historyDateLabel(row.expiry))}</option>`).join('');
    if (keep && rows.some((row) => row.key === keep)) select.value = keep;
  }

  $('gr-pick').addEventListener('change', () => paintHistory());
  // تایم‌فریم داده را عوض نمی‌کند، فقط سطلش را. پس دریافت دوباره لازم
  // نیست و نمودارها از همان سریِ خام از نو ساخته می‌شوند.
  $('gr-timeframe').addEventListener('change', () => paintCharts(selectedRow()));
  $('gr-grain').addEventListener('change', () => {
    const intraday = isIntradayGrain($('gr-grain').value);
    $('gr-day-wrap').hidden = !intraday;
    $('gr-grain-run').hidden = !intraday;
    $('gr-grain-note').textContent = intraday
      ? 'دانه‌بندی درون‌روزی فقط روی یک روز کار می‌کند: ریزمعاملهٔ هر پا برای هر روز یک درخواست است. روز را انتخاب کن و دکمه را بزن.'
      : '';
    if (!intraday) paintHistory();
  });
  $('gr-grain-run').addEventListener('click', () => void loadIntraday());

  const selectedRow = () => rows.find((row) => row.key === $('gr-pick').value) || rows[0] || null;

  /** آخرین سریِ خامِ نمایش‌داده‌شده — تایم‌فریم روی همین اعمال می‌شود. */
  let shownSeries = null;

  function paintHistory(series = null) {
    const row = selectedRow();
    if (!row) return;
    $('gr-day').innerHTML = dates.map((date) => `<option value="${date}">${faDigits(historyDateLabel(date))}</option>`).join('');
    if (tapeDate) $('gr-day').value = String(tapeDate);
    shownSeries = series || row.series;
    paintCharts(row);
  }

  /**
   * نمودارها، از سریِ خام و تایم‌فریمِ انتخابی.
   *
   * تایم‌فریم روی سریِ **درون‌روزی** اعمال نمی‌شود: سطلِ هفتگیِ یک روز
   * بی‌معنی است و سطلِ ماهانه‌اش یک ستون. آنجا خودِ دانه‌بندی همان نقش را
   * دارد.
   */
  function paintCharts(row) {
    if (!row || !shownSeries) return;
    const timeframe = $('gr-timeframe').value;
    const intraday = isIntradayGrain(shownSeries.grain);
    // دنبالهٔ امروز فقط به سریِ روزانه می‌چسبد. روی سریِ درون‌روزی
    // چسباندنش یعنی دو بار همان روز.
    const tail = !intraday && liveSeries && liveTailKey === row.key ? liveSeries : null;
    const base = intraday ? shownSeries : resample(shownSeries, timeframe);
    const show = tail ? joinLive(base, tail) : base;
    const unitText = gapScale(row.gap.scale).unit;
    const isSum = row.gap.anchorSource === 'entry';

    // شناسنامهٔ ترکیب، بالای هر ده نمودار. بی نامِ نماد، نمودارها متعلق به
    // «یک اسپرد صعودی کال» بودند، نه به قراردادی که می‌شود سفارشش داد.
    const ident = $('gr-ident');
    ident.hidden = false;
    ident.innerHTML = `<b>${esc(row.def.name)}</b>${symbolCell(row.legs)}<span>قیمت اعمال ${row.strikes.map((k) => fmt.money(k)).join(' / ')}</span><span>سررسید ${faDigits(historyDateLabel(row.expiry))}</span><span>نماد پایه ${esc(nameOf(ua))}</span>`;

    $('gr-verdict').textContent = `مبدأ مقایسه ${faDigits(historyDateLabel(row.entryDate))}؛ نخستین قیمت مشترک معتبر در بازه، نه ورود واقعی شما. ${gapNote(row.gap)} ${row.verdict?.ok ? `فاصله در صدک ⁨${fmt.pct(row.verdict.rank)}⁩ تاریخِ همین بازه است — ${row.verdict.tone}.` : ''}`;

    // ── نمودار فاصله‌ای: دو نرخ، و فضای میانشان ──────────────────────
    $('gr-band-title').textContent = isSum ? 'جمع دو نرخ' : 'تفاضل دو نرخ';
    $('gr-band-unit').textContent = unitText;
    $('gr-band-hint').textContent = isSum
      ? 'دو پرمیومِ فروخته‌شده روی هم. ارتفاعِ کل، همان جمعی است که باید آب شود؛ خطِ چین، جمعِ روز ورود یعنی بیشینهٔ سود.'
      : 'دو نرخِ پاها، و فضای رنگیِ میانشان که خودِ فاصله است. خطِ چین، تفاضلِ دو قیمت اعمال یعنی سقفی که فاصله می‌تواند به آن برسد.';
    void charts.set('band', $('gr-band'),
      gapBandChart(show, {
        mode: isSum ? 'sum' : 'spread',
        anchor: isSum ? row.gap.entry : row.gap.strikeGap,
        anchorLabel: isSum ? 'جمع پرمیوم ورود' : 'فاصلهٔ اعمال',
      }),
      { empty: 'برای این ترکیب نقطه‌ای با قیمت هر دو پا نیست' });

    $('gr-path-unit').textContent = unitText;
    void charts.set('path', $('gr-path'), gapPathChart(show, { anchor: row.gap.anchor }), { empty: 'برای این ترکیب نقطه‌ای در این تایم‌فریم نیست' });
    void charts.set('range', $('gr-range-chart'), rangeChart(show), { empty: 'میلهٔ دامنه با تایم‌فریم هفتگی یا ماهانه ساخته می‌شود' });
    void charts.set('cover', $('gr-cover'), coverageChart(show), { empty: 'برای این ترکیب نقطه‌ای در این تایم‌فریم نیست' });
    void charts.set('dist', $('gr-dist'), distributionChart(show, row.gap.current), { empty: 'برای ساختن توزیع دست‌کم سه نقطه لازم است' });
    void charts.set('gauge', $('gr-gauge'), fillGauge(row.gap), { empty: row.gap.anchored ? 'فاصله محاسبه نشد' : 'بی قیمت ورود، درصدی برای عقربه نیست' });
    void charts.set('heat', $('gr-heat'), hourHeatmap(heatRows(show)), { empty: 'نقشهٔ ساعتی با دانه‌بندی درون‌روزی ساخته می‌شود' });

    // ── در برابر دارایی پایه ─────────────────────────────────────────
    const verdict = versusBase(show);
    $('gr-base-verdict').textContent = verdict.ok
      ? `همبستگی ⁨${fmt.pct(verdict.r * 100)}⁩٪ · شیب ⁨${fmt.num(verdict.slope)}⁩ — ${verdict.tone}`
      : verdict.why;
    void charts.set('vs', $('gr-vs'), versusBaseChart(show), { empty: 'قیمت نماد پایه برای این نقاط موجود نیست' });
    void charts.set('indexed', $('gr-indexed'), indexedChart(indexedPair(show)), { empty: 'برای هم‌مقیاس‌کردن، هر دو سری باید نقطهٔ شروع داشته باشند' });
    void charts.set('scatter', $('gr-scatter'), versusBaseScatter(verdict), { empty: verdict.why || 'داده‌ای برای پراکنش نیست' });
  }

  /** ردیف‌های نقشهٔ حرارتی از نقاطِ درون‌روزی. روزانه ساعت ندارد. */
  function heatRows(series) {
    if (!isIntradayGrain(series?.grain)) return [];
    const buckets = new Map();
    for (const point of series.points) {
      const hour = Math.floor((point.second || 0) / 3600);
      const key = `${series.day || tapeDate}|${hour}`;
      const bucket = buckets.get(key) || { day: historyDateLabel(tapeDate), hour: `${hour}:۰۰`, sum: 0, count: 0 };
      bucket.sum += point.current; bucket.count += 1;
      buckets.set(key, bucket);
    }
    return [...buckets.values()].map((row) => ({ day: row.day, hour: row.hour, value: row.sum / row.count }));
  }

  /**
   * ریزمعاملهٔ یک روز برای پاهای یک ترکیب، به‌علاوهٔ خودِ نماد پایه.
   *
   * پایه هم خواسته می‌شود، وگرنه نمودارهای «در برابر دارایی پایه» در
   * دانه‌بندی درون‌روزی خالی می‌مانند — همان نموداری که پرسیده شد.
   */
  async function fetchTape(row, date) {
    const legs = row.legs.filter((leg) => leg.kind !== 'underlying');
    const wanted = [...new Set([...legs.map((leg) => String(leg.ins)), String(ua?.ins ?? '')])].filter(Boolean);
    const response = await fetch('/api/trades/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: wanted.map((ins) => ({ ins, date: String(date) })) }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'ریزمعامله دریافت نشد');
    const byIns = {};
    for (const ins of wanted) byIns[ins] = payload.items?.[`${date}:${ins}`]?.rows || [];
    return byIns;
  }

  /** سریِ درون‌روزیِ یک ترکیب از نوارِ گرفته‌شده. */
  function buildIntraday(row, byIns, date, grain) {
    const series = intradayGapSeries({
      legs: row.legs, tapeByIns: byIns, date, grain,
      strategyId: row.def.id, entry: row.entry, expiry: row.expiry,
      scale: $('gr-scale').value, units: units(), baseIns: String(ua?.ins ?? ''),
    });
    series.day = date;
    return series;
  }

  async function loadIntraday() {
    const row = selectedRow();
    if (!row) return;
    const date = Number($('gr-day').value);
    const legs = row.legs.filter((leg) => leg.kind !== 'underlying');
    $('gr-grain-run').disabled = true;
    $('gr-grain-note').textContent = `دریافت ریزمعاملهٔ ${fmt.int(legs.length)} پا برای ${historyDateLabel(date)}…`;
    try {
      tapeByIns = await fetchTape(row, date);
      tapeDate = date;
      const series = buildIntraday(row, tapeByIns, date, $('gr-grain').value);
      if (!series.points.length) {
        $('gr-grain-note').textContent = `در ${historyDateLabel(date)} هیچ لحظه‌ای نبود که همهٔ پاها قیمت داشته باشند. لحظهٔ ناقص با قیمت لحظهٔ قبل پر نمی‌شود.`;
        return;
      }
      $('gr-grain-note').textContent = `${fmt.int(series.points.length)} لحظه ساخته شد · ${fmt.int(series.missing)} لحظه چون دست‌کم یک پا معامله نداشت نقطه نساخت.`;
      paintHistory(series);
    } catch (error) {
      logError('spread-radar-intraday', error);
      $('gr-grain-note').textContent = `ریزمعامله دریافت نشد: ${error.message}`;
    } finally { $('gr-grain-run').disabled = false; }
  }

  // ————————————————————————— رصد زنده و هشدار —————————————————————————

  $('gr-live').addEventListener('change', () => {
    if ($('gr-live').checked) startLive(); else stopLive();
  });
  $('gr-live-priority').addEventListener('change', () => {
    if (liveTimer) { $('gr-live-note').textContent = livePriorityNote(); void pollLive(); }
    else $('gr-live-note').textContent = livePriorityNote();
  });

  /**
   * روزِ سنجشِ این ساخت، امروز است؟
   *
   * «رصد زنده روی بازهٔ تاریخی نیز فعال می‌شود. قراردادها و روزهای مانده
   * بر اساس پایان بازهٔ انتخابی ساخته می‌شوند، نه امروز. با انتخاب یک
   * بازهٔ قدیمی ممکن است قرارداد منقضی یا روزماندهٔ تاریخی رصد شود.»
   *
   * درست بود و بدترین شکلِ ممکن را داشت: مظنهٔ زندهٔ امروز روی ترکیبی
   * می‌نشست که «روز مانده تا سررسید»ش از پایانِ یک بازهٔ گذشته حساب شده
   * بود، و قراردادش می‌توانست از همان موقع منقضی شده باشد. حالا رصد فقط
   * وقتی روشن می‌شود که روزِ سنجش، خودِ امروز باشد.
   */
  function liveDayGate() {
    const mark = Number(dates.at(-1)) || 0;
    const today = tehranDateNumber();
    if (!mark) return { ok: false, why: 'هنوز روز سنجشی ساخته نشده.' };
    if (!today) return { ok: false, why: 'ساعت مرورگر خوانده نشد؛ نمی‌شود گفت روز سنجش امروز است یا نه.' };
    if (mark !== today) {
      return { ok: false, mark, today,
        why: `روز سنجشِ این ساخت ${faDigits(historyDateLabel(mark))} است، نه امروز ${faDigits(historyDateLabel(today))}. قرارداد، پنجرهٔ سررسید و «روز مانده» همه بر مبنای همان روز ساخته شده‌اند؛ نشاندنِ مظنهٔ امروز رویشان، عددی می‌سازد که هیچ‌وقت وجود نداشته. بازه را تا امروز بیاور.` };
    }
    return { ok: true, mark, today, why: '' };
  }

  function livePriorityNote() {
    const meta = livePriority($('gr-live-priority').value);
    const total = rows.length;
    return `سقفِ مظنهٔ زنده ${fmt.int(LIVE_INS_CAP)} ابزار در هر تیک است و ${fmt.int(total)} ترکیب ساخته شده؛ سهمیه به ترکیبِ کامل داده می‌شود، نه به پا، تا ترکیبِ نیم‌قیمت ساخته نشود. اولویت فعلی: ${meta.label} — ${meta.hint}`;
  }

  function startLive() {
    stopLive();
    const gate = liveDayGate();
    if (!gate.ok) {
      $('gr-live').checked = false;
      $('gr-live-state').textContent = 'روی بازهٔ تاریخی روشن نمی‌شود';
      $('gr-live-note').textContent = gate.why;
      return;
    }
    dayRange.reset(gate.today);
    $('gr-live-state').textContent = 'روشن — هر ۱۰ ثانیه';
    $('gr-live-note').textContent = livePriorityNote();
    const tick = () => void pollLive();
    tick();
    liveTimer = setInterval(tick, 10000);
  }

  function stopLive() {
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = 0; livePrices = null;
    liveSeries = null; liveTailKey = '';
    liveKeys.clear();
    // نسل عوض می‌شود و درخواستِ جاری لغو: پاسخی که بعد از این برسد، مالِ
    // نسلِ مرده است و نه نوار را عوض می‌کند نه جدول را.
    liveGen += 1; liveBusy = false;
    liveJob?.abort(); liveJob = null;
    liveBook = null; liveBase = NaN; liveAt = 0;
    dayRange.reset(0);
    // ردیف‌ها با قیمتِ زنده بازنویسی شده بودند؛ عددِ روزِ سنجش را
    // برمی‌گردانیم تا جدولِ خاموش، عددِ نیمه‌زندهٔ آخرین تیک را نگه ندارد.
    restoreDaily();
    const node = $('gr-live-state');
    if (node) node.textContent = 'خاموش';
    const tail = $('gr-tail-note');
    if (tail) tail.textContent = '';
    if (mounted && rows.length) { paintKpis(); paintTable(); paintHistory(); }
  }

  /** فاصله، سنجه و حکمِ روزِ سنجش را برمی‌گرداند — همان که ساخت اولیه داد. */
  function restoreDaily() {
    for (const row of rows) {
      if (!row.daily) continue;
      row.gap = row.daily.gap; row.metrics = row.daily.metrics; row.verdict = row.daily.verdict;
    }
  }

  /**
   * ریزمعاملهٔ **امروز** برای ترکیبِ باز، از آغاز جلسه تا همین لحظه.
   *
   * هر تیک از نو گرفته می‌شود چون نوار در طول روز بلندتر می‌شود؛ ولی
   * فقط یک درخواست هم‌زمان، وگرنه تیک‌های ده‌ثانیه‌ای روی هم می‌افتند.
   */
  async function refreshLiveTail() {
    const row = selectedRow();
    if (!row || liveTailBusy) return;
    const date = tehranDateNumber();
    if (!date) return;
    liveTailBusy = true;
    try {
      const byIns = await fetchTape(row, date);
      const series = buildIntraday(row, byIns, date, $('gr-grain').value);
      if (!series.points.length) {
        liveSeries = null; liveTailKey = '';
        $('gr-tail-note').textContent = `امروز ${faDigits(historyDateLabel(date))} هنوز لحظه‌ای نبوده که همهٔ پاهای این ترکیب معامله داشته باشند؛ نمودارها فقط روند گذشته را نشان می‌دهند.`;
      } else {
        liveSeries = series; liveTailKey = row.key;
        $('gr-tail-note').textContent = `امروز ${faDigits(historyDateLabel(date))}: ${fmt.int(series.points.length)} لحظه از آغاز جلسه تا اکنون، با خط‌چین روی روند گذشته. ${fmt.int(series.missing)} لحظه چون دست‌کم یک پا معامله نداشت نقطه نساخت.`;
      }
      paintHistory();
    } catch (error) {
      // نبودِ نوارِ امروز، رصد زنده را نمی‌خواباند: قیمتِ مظنه هنوز
      // می‌آید و جدول کار می‌کند. فقط دنبالهٔ نمودار نیست.
      liveSeries = null; liveTailKey = '';
      $('gr-tail-note').textContent = `ریزمعاملهٔ امروز دریافت نشد: ${error.message}`;
    } finally { liveTailBusy = false; }
  }

  /**
   * قیمت زندهٔ پاها، و سنجشِ هشدارها روی همان.
   *
   * ═══ سه چیزی که اینجا عوض شد ═══
   *
   * **سهمیه به ترکیب، نه به پا.** `slice(0, 24)` روی فهرستِ پاها، ترکیب
   * را نصفه می‌کرد: پای اولش قیمت می‌گرفت، پای دومش نه، و آن ترکیب هم
   * پوشش نداشت و سهمیه‌اش هم سوخته بود. حالا `planLiveQuotes` بودجه را
   * ترکیب‌به‌ترکیب می‌دهد و اولویتش انتخابِ کاربر است.
   *
   * **قیمتِ نماد پایه هم زنده می‌آید.** یک خانه از بیست‌وچهار، تا شرطِ
   * «قیمت نماد پایه» از `NaN` دربیاید و وجه تضمین با اسپاتِ امروز حساب
   * شود.
   *
   * **یک درخواست در هر لحظه.** تیکِ ده‌ثانیه‌ای روی پاسخِ نیامده سوار
   * نمی‌شود و پاسخِ نسلِ خاموش‌شده دور ریخته می‌شود.
   */
  async function pollLive() {
    if (!rows.length) return;
    if (liveBusy) return;
    const gen = liveGen;
    const job = new AbortController();
    liveBusy = true; liveJob = job;
    try {
      const priority = livePriority($('gr-live-priority').value).id;
      const plan = planLiveQuotes({
        rows, cap: LIVE_INS_CAP, priority,
        reserve: ua?.ins ? [String(ua.ins)] : [],
        score: priority === 'near' ? nearScore() : null,
      });
      if (!plan.ins.length) { $('gr-live-state').textContent = 'ابزاری برای مظنهٔ زنده نبود'; return; }
      const response = await fetch(`/api/live-trades?ins=${plan.ins.join(',')}`, { signal: job.signal });
      const payload = await response.json();
      // پاسخ رسید، ولی رصد در این فاصله خاموش شده یا اولویت عوض شده:
      // نه نوار عوض می‌شود، نه جدول. این همان «توقفِ قابل اعتماد» است.
      if (gen !== liveGen || !mounted) return;
      if (!response.ok || payload.error) throw new Error(payload.error || 'مظنهٔ زنده دریافت نشد');
      liveBook = liveQuoteBook(payload);
      liveAt = Number(payload.at) || 0;
      liveBase = Number(liveBook.prices[String(ua?.ins ?? '')] ?? NaN);
      livePrices = liveBook.prices;
      const applied = applyLive();
      const clock = faDigits(new Date(payload.at).toLocaleTimeString('fa-IR'));
      $('gr-live-state').textContent = `روشن · ${fmt.int(applied.covered)} ترکیب با مظنهٔ هم‌زمان · ${clock}`;
      $('gr-live-note').textContent = `${livePriorityNote()} در این تیک ${fmt.int(plan.covered)} ترکیب سهمیه گرفت و ${fmt.int(plan.dropped)} ترکیب بیرون ماند؛ از سهمیه‌گرفته‌ها ${fmt.int(applied.covered)} ترکیب مظنهٔ هم‌زمان داشت و ${fmt.int(applied.stale)} ترکیب کنار گذاشته شد چون پاهایش در یک لحظه معامله نشده بودند یا آخرین معامله‌شان کهنه بود. ${Number.isFinite(liveBase) ? `قیمت زندهٔ ${nameOf(ua)}: ${fmt.money(liveBase)}.` : `برای ${nameOf(ua)} امروز معامله‌ای در پاسخ نبود؛ شرطِ «قیمت نماد پایه» عدد ندارد و برقرار نمی‌شود.`} ترکیبِ بیرون‌مانده با عددِ روز سنجش سنجیده نمی‌شود.`;
      runAlerts();
      void refreshLiveTail();
    } catch (error) {
      if (gen !== liveGen || !mounted || error?.name === 'AbortError') return;
      $('gr-live-state').textContent = `دریافت زنده نشد: ${error.message}`;
    } finally {
      liveBusy = false;
      if (liveJob === job) liveJob = null;
    }
  }

  /**
   * امتیازِ «نزدیک‌ترین به شرط» — ترکیبی که تا زنگ‌زدنِ هشدارت کم مانده،
   * اول سهمیهٔ زنده می‌گیرد.
   *
   * امتیاز از عددِ **روز سنجش** ساخته می‌شود، چون در لحظهٔ تصمیم‌گیریِ
   * سهمیه هنوز قیمتِ زنده‌ای نداریم. بی هشدارِ فعال، همه `NaN` می‌شوند و
   * `planLiveQuotes` به ترتیب جدول برمی‌گردد.
   */
  function nearScore() {
    if (!rules.length) return null;
    return (row) => {
      const stats = dayRange.get(row.key);
      const snapshot = alertSnapshot({
        gap: row.gap, verdict: row.verdict, day: stats,
        basePrice: Number.isFinite(liveBase) ? liveBase : row.spot,
        strategyId: row.def.id, strategyName: row.def.name,
      });
      snapshot.key = row.key;
      const distance = alertDistance(rules, snapshot);
      return Number.isFinite(distance) ? -distance : NaN;
    };
  }

  /**
   * فاصله **و سنجه‌های** هر ردیف را با قیمت زنده بازمی‌سازد.
   *
   * ═══ چرا سنجه‌ها هم، نه فقط فاصله ═══
   *
   * «سود، زیان و بازده با قیمت زنده دوباره محاسبه نمی‌شوند … فاصله از
   * ۱٬۱۲۴ به ۲٬۲۴۸ رسید، اما حداکثر سود ٪ همچنان ۴۲۷٫۴۹٪ باقی ماند.»
   *
   * درست بود: `measureGap` فقط فاصله را می‌ساخت و `row.metrics` — که
   * حداکثر سود، حداکثر زیان، بازده، سرمایه و وجه تضمین از آن می‌آید —
   * دست‌نخورده از روز سنجش می‌ماند. پس هشدارِ «حداکثر سود ≥ ۴۰٪» روی
   * عددِ دیروز آتش می‌کرد. حالا هر تیک، همان خط لولهٔ مشترکِ برنامه
   * (`comboMetrics`) با قیمتِ زنده و اسپاتِ زنده دوباره اجرا می‌شود.
   *
   * ═══ و چرا هر ردیفی زنده نمی‌شود ═══
   *
   * `comboLiveQuote` سه چیز را می‌سنجد: همهٔ پاها قیمت دارند، زمانشان
   * معلوم است، و در یک بازهٔ کوتاه معامله شده‌اند. ردیفی که یکی از این
   * سه را ندارد **دست‌نخورده** می‌ماند و در `liveKeys` نمی‌آید — یعنی نه
   * جدول «زنده» صدایش می‌کند و نه هشدار رویش می‌نشیند.
   */
  function applyLive() {
    let covered = 0, stale = 0;
    liveKeys.clear();
    const nowSec = tehranSecondOfDay();
    const today = tehranDateNumber();
    const scale = $('gr-scale').value;
    for (const row of rows) {
      const quote = comboLiveQuote({ legs: row.legs, book: liveBook, nowSec });
      if (!quote.ok) {
        if (quote.priced === quote.legs && quote.legs > 0) stale += 1;
        continue;
      }
      const gap = measureGap({
        legs: row.legs, prices: livePrices, strategyId: row.def.id,
        entry: row.entry, daysLeft: row.gap.daysLeft,
        scale, units: units(),
      });
      if (!gap.ok) continue;
      // اسپاتِ زنده اگر پایه امروز معامله شده، وگرنه اسپاتِ روز سنجش —
      // که مبنای وجه تضمین است و نبودش یعنی سرمایه و درصدها عدد ندارند.
      const spot = Number.isFinite(liveBase) && liveBase > 0 ? liveBase : row.spot;
      // `rowByIns` خالی است چون ارزش و حجمِ معامله از تابلوی روزانه
      // می‌آید و مظنهٔ زنده آن را نمی‌دهد؛ همان‌ها پایین‌تر از نسخهٔ روزانه
      // برگردانده می‌شوند.
      const metrics = comboMetrics({
        legs: row.legs, prices: livePrices, spot, rowByIns: {},
        settings: state.settings, daysLeft: row.gap.daysLeft, scale, units: units(),
      });
      row.gap = gap;
      row.verdict = gapVerdict(row.series, gap);
      // ارزش و حجمِ معاملهٔ پاها از تابلوی روزانه می‌آید و مظنهٔ زنده آن را
      // نمی‌دهد؛ همان عددِ روز سنجش نگه داشته می‌شود تا ستون خالی نشود و
      // ادعای تازه‌ای هم ساخته نشود.
      row.metrics = metrics.ok
        ? { ...metrics,
          legValue: row.daily?.metrics?.legValue ?? metrics.legValue,
          legVolume: row.daily?.metrics?.legVolume ?? metrics.legVolume,
          legTrades: row.daily?.metrics?.legTrades ?? metrics.legTrades,
          thinLegs: row.daily?.metrics?.thinLegs ?? metrics.thinLegs }
        : row.daily?.metrics || row.metrics;
      dayRange.observe(row.key, gap.current, { date: today });
      liveKeys.add(row.key);
      covered += 1;
    }
    paintKpis();
    paintTable();
    return { covered, stale };
  }

  /**
   * هشدارها — **فقط** روی ردیف‌هایی که همین حالا مظنهٔ زنده دارند.
   *
   * «رادار بدون داشتن قیمت زنده، اعلان زنده می‌فرستد. در آزمون، وضعیت
   * ۰ ترکیب با قیمت زنده بود؛ با این حال شرط فاصله ≥ ۰ روی قیمت تاریخی
   * اجرا شد و ده‌ها اعلان ثبت کرد.»
   *
   * علتش همین بود که حلقه روی `rows` می‌چرخید نه روی `liveKeys`. یک
   * هشدارِ زنده که عددش مالِ روز سنجش است، بدتر از نبودِ هشدار است.
   */
  function runAlerts() {
    if (!rules.length || !liveTimer) return;
    if (!liveKeys.size) return;
    const snapshots = {};
    const today = tehranDateNumber();
    for (const row of rows) {
      if (!liveKeys.has(row.key)) continue;
      snapshots[row.key] = alertSnapshot({
        gap: row.gap, verdict: row.verdict,
        // کف و سقفِ امروز، از دفترِ مشاهده‌های امروز — نه از کمینه و
        // بیشینهٔ کل بازهٔ تاریخی، که پیش از این جایش نشسته بود.
        day: dayRange.date === today ? dayRange.get(row.key) : null,
        // قیمتِ زندهٔ پایه. پیش از این عمداً `NaN` فرستاده می‌شد و شرطِ
        // «قیمت نماد پایه» هیچ‌وقت کار نمی‌کرد.
        basePrice: liveBase,
        // اعلان بی نامِ نماد، خبری است که نمی‌شود رویش سفارش گذاشت.
        label: `${row.def.name} · ${comboSymbolText(row.legs)} · ${row.strikes.map((k) => fmt.money(k)).join('/')}`,
        strategyId: row.def.id, strategyName: row.def.name,
      });
    }
    const result = evaluateAlerts({ rules, snapshots, prev: prevSnapshots, nowMs: Date.now() });
    prevSnapshots = result.prev;
    if (result.fired.length) {
      rules = result.rules;
      saveRules(rules);
      // موجِ بزرگ: همه در دفترچه، چند کارت روی صفحه، یک جمع‌بندی.
      deliverBurst(result.fired, { host: $('gr-alarm-host'), scope: 'radar', kind: 'gap' });
      paintRules();
      paintLog();
    }
  }

  // ————————————————————————— زیرتب «هشدارها» —————————————————————————

  $('gr-rule-scope').addEventListener('change', () => {
    $('gr-rule-strategy-wrap').hidden = $('gr-rule-scope').value !== 'strategy';
  });
  $('gr-rule-metric').addEventListener('change', paintRuleHint);
  $('gr-rule-op').addEventListener('change', paintRuleHint);

  function paintRuleHint() {
    const metric = ALERT_METRICS.find((row) => row.id === $('gr-rule-metric').value);
    const op = ALERT_OPS.find((row) => row.id === $('gr-rule-op').value);
    $('gr-rule-hint').textContent = `${metric?.hint || ''} ${op?.needsPrev
      ? 'این شرط فقط در لحظهٔ رد شدن از خط آتش می‌کند، نه در هر سنجشی که آن‌سوی خط باشی.'
      : 'این شرط تا وقتی برقرار باشد در هر سنجش آتش می‌کند؛ «آرامش» جلوی تکرارش را می‌گیرد.'}`;
  }

  $('gr-rule-add').addEventListener('click', () => {
    const scope = $('gr-rule-scope').value;
    const built = normalizeRule({
      metric: $('gr-rule-metric').value,
      op: $('gr-rule-op').value,
      value: Number($('gr-rule-value').value),
      cooldownSec: Number($('gr-rule-cooldown').value),
      sound: $('gr-rule-sound').checked,
      strategyId: scope === 'strategy' ? $('gr-rule-strategy').value : '',
      comboKey: scope === 'combo' ? ($('gr-pick').value || '') : '',
      label: scope === 'combo' && selectedRow()
        ? `${selectedRow().def.name} · ${comboSymbolText(selectedRow().legs)}` : '',
    });
    if (!built.ok) { $('gr-rule-hint').textContent = `هشدار ساخته نشد: ${built.why}`; return; }
    rules = [...rules, built.rule];
    saveRules(rules);
    paintRules();
    paintRuleHint();
  });

  function paintRules() {
    $('gr-rule-count').textContent = `${fmt.int(rules.length)} هشدار`;
    if (!rules.length) {
      $('gr-rule-list').innerHTML = '<p class="empty-note">هنوز هشداری نگذاشته‌ای. برای دیدنِ کارکردش، «آزمایش کانال‌ها» را بزن.</p>';
      return;
    }
    $('gr-rule-list').innerHTML = rules.map((rule) => `<article class="gap-rule${rule.enabled ? '' : ' off'}" data-rule="${esc(rule.id)}">
      <header><b>${esc(ruleNote(rule))}</b><span>${esc(scopeLabel(rule))}</span></header>
      <footer>
        <small>${rule.firedCount ? `${fmt.int(rule.firedCount)} بار زده` : 'هنوز نزده'} · آرامش ${fmt.int(rule.cooldownSec)} ثانیه${rule.sound ? ' · با صدا' : ''}</small>
        <button type="button" class="ghost" data-act="toggle">${rule.enabled ? 'خاموش' : 'روشن'}</button>
        <button type="button" class="ghost danger" data-act="drop">حذف</button>
      </footer></article>`).join('');
    for (const card of $('gr-rule-list').querySelectorAll('.gap-rule')) {
      card.querySelector('[data-act="toggle"]').addEventListener('click', () => {
        rules = rules.map((rule) => (rule.id === card.dataset.rule ? { ...rule, enabled: !rule.enabled } : rule));
        saveRules(rules); paintRules();
      });
      card.querySelector('[data-act="drop"]').addEventListener('click', () => {
        rules = rules.filter((rule) => rule.id !== card.dataset.rule);
        saveRules(rules); paintRules();
      });
    }
  }

  function scopeLabel(rule) {
    if (rule.comboKey) return 'فقط ترکیب انتخاب‌شده';
    if (rule.strategyId) return byId(rule.strategyId)?.name || rule.strategyId;
    return 'همهٔ ترکیب‌های این نماد';
  }

  function paintLog() {
    const log = readLog('radar');
    if (!log.length) { $('gr-log').innerHTML = '<p class="empty-note">دفترچه خالی است.</p>'; return; }
    $('gr-log').innerHTML = log.slice(0, 60).map((row) => `<div class="gap-log-row">
      <time>${faDigits(row.clock)}</time>
      <b>${esc(row.title)}</b>
      <span>${esc(metricText(row.metric, row.value))}</span>
      <small>${esc(row.note)}</small>
    </div>`).join('');
  }

  function paintNotifyState() {
    $('gr-notify-state').textContent = NOTIFY_LABEL[notifyState()] || '—';
  }

  $('gr-notify-ask').addEventListener('click', async () => {
    await askNotifyPermission();
    paintNotifyState();
  });
  $('gr-notify-test').addEventListener('click', () => {
    testDelivery({ host: $('gr-alarm-host-2'), sound: $('gr-rule-sound').checked, scope: 'radar' });
    paintLog();
  });
  $('gr-log-clear').addEventListener('click', () => { clearLog('radar'); paintLog(); });

  // ————————————————————————— راه‌اندازی —————————————————————————

  paintNotifyState();
  paintScaleNote();
  paintRuleHint();
  paintRules();
  paintLog();
  rangeUi = mountHistoryRange($('gr-range'), { quickEntry: true, compactNote: true, onApply: (range) => loadUniverseForRange(range) });
  await loadUniverseForRange(rangeUi.range);

  return () => {
    mounted = false; cancelLoad();
    stopLive();
    rangeJob?.stop();
    charts.disposeAll();
  };
}

function median(values) {
  const list = [...values].sort((a, b) => a - b);
  if (!list.length) return NaN;
  const at = (list.length - 1) / 2;
  return list.length % 2 ? list[at] : (list[Math.floor(at)] + list[Math.ceil(at)]) / 2;
}

function groupLabel(group) {
  return {
    vertical: 'اسپرد عمودی', vol: 'تلاطم — استرانگل', wing: 'باترفلای و کندور',
    ratio: 'نسبت و بک‌اسپرد', calendar: 'تقویمی و مورب', arb: 'آربیتراژ',
  }[group] || group;
}
