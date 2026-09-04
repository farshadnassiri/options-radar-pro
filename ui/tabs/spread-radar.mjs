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

import { faDigits, fmt, signTone } from '/ui/fmt.mjs';
import { buildChain } from '/core/chain.mjs';
import { byId } from '/strategies/catalog.mjs';
import {
  flattenActiveContracts, historyDateLabel,
} from '/core/history.mjs';
import { baseAfterRange, loadRange, mountHistoryRange } from '/ui/history-range.mjs';
import { loadHistoricalDailies } from '/ui/history-dailies.mjs';
import { GAP_STRATEGY_IDS, gapNote, measureGap } from '/core/spread-gap.mjs';
import { gapVerdict, intradayGapSeries, seriesStats } from '/core/spread-gap-series.mjs';
import { buildRadarHistory, radarDataReport } from '/core/radar-history.mjs';
import {
  ALERT_METRICS, ALERT_OPS, DEFAULT_COOLDOWN_SEC, alertSnapshot, evaluateAlerts,
  normalizeRule, ruleNote,
} from '/core/gap-alert.mjs';
import { MOMENT_GRAINS, isIntradayGrain } from '/core/intraday-grid.mjs';
import { chartGroup } from '/ui/chart-host.mjs';
import { mountSubtabs } from '/ui/subtabs.mjs';
import {
  coverageChart, distributionChart, fillBar, fillGauge, gapPathChart, hourHeatmap, sparkline,
} from '/ui/gap-charts.mjs';
import {
  NOTIFY_LABEL, askNotifyPermission, clearLog, deliver, metricText, notifyState, readLog, testDelivery,
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

const pctCell = (value) => (finite(value)
  ? `<span class="${signTone(value)}">${fmt.pct(value)}٪</span>` : '—');
const moneyCell = (value) => (finite(value) ? fmt.money(value) : '—');

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
      <label>خانواده<select id="gr-family">
        <option value="all">همهٔ خانواده‌های فاصله‌دار</option>
        ${GAP_GROUPS.map((group) => `<option value="${esc(group)}">${esc(groupLabel(group))}</option>`).join('')}
      </select></label>
      <label>مبنای قیمت<select id="gr-basis">
        <option value="CLOSE">قیمت پایانی</option>
        <option value="LAST">آخرین معامله</option>
        <option value="FIRST">اولین معامله</option>
      </select></label>
      <label>تعداد واحد<input id="gr-units" type="number" min="1" max="10000" step="1" value="${Math.max(1, state.settings.qtyDefault || 1)}"></label>
      <button type="button" class="primary" id="gr-load">دریافت تاریخچه و ساخت فاصله‌ها</button>
      <button type="button" class="ghost" id="gr-stop" hidden>توقف دریافت و ساخت</button>
    </div>
    <div class="gap-data" id="gr-data" aria-live="polite"></div>
    <p class="gap-note">قیمت روزانه برای بررسی تاریخی است؛ آخرین معامله نیز تضمین اجرای هم‌زمان پاها نیست.</p>
    <p class="gap-note">فاصله فقط برای ساختارهایی معنی دارد که دست‌کم دو قیمت اعمال داشته باشند. تک‌پا و استرادل و کاوردکال در این تب نمی‌آیند — و این نبودن، نقص نیست.</p>
  </section>

  <div id="gr-tabs" class="subtabs" hidden></div>

  <div class="gap-panel" data-panel="now" hidden>
    <div class="gap-kpis" id="gr-kpis"></div>
    <section class="card">
      <div class="section-head">
        <div><p class="eyebrow">همهٔ ترکیب‌های فاصله‌دار</p><h2>فاصله در این لحظه</h2></div>
        <div class="gap-toolbar">
          <label>مرتب بر<select id="gr-sort">
            <option value="roomPct">بیشترین جای باقی‌مانده</option>
            <option value="coveragePct">بیشترین پرشدگی</option>
            <option value="upsidePct">بیشترین سود باقی‌مانده</option>
            <option value="perDay">بیشترین سود روزانه</option>
            <option value="rank">پایین‌ترین صدک تاریخی</option>
            <option value="current">بزرگ‌ترین فاصله</option>
          </select></label>
          <label class="check"><input type="checkbox" id="gr-live"> رصد زندهٔ بازار</label>
          <span id="gr-live-state" class="gap-live-state">خاموش</span>
        </div>
      </div>
      <p class="gap-note" id="gr-now-note">—</p>
      <div class="gap-table-wrap"><table class="gap-table" id="gr-table">
        <thead><tr>
          <th>استراتژی</th><th>قیمت اعمال</th><th>سررسید</th>
          <th>فاصلهٔ اعمال</th><th>فاصلهٔ اکنون</th><th>پر شده / جا دارد</th>
          <th>سود باقی‌مانده</th><th>روزانه</th><th>صدک تاریخی</th><th>روند بازه</th>
        </tr></thead>
        <tbody id="gr-rows"></tbody>
      </table></div>
    </section>
    <div id="gr-alarm-host" class="gap-alarm-host" aria-live="assertive"></div>
  </div>

  <div class="gap-panel" data-panel="history" hidden>
    <section class="card">
      <div class="section-head"><div><p class="eyebrow">یک ترکیب، در عمق</p><h2>تاریخچهٔ فاصله</h2></div>
        <div class="gap-toolbar">
          <label>ترکیب<select id="gr-pick"></select></label>
          <label>دانه‌بندی<select id="gr-grain">${MOMENT_GRAINS.map((row) => `<option value="${row.id}">${esc(row.label)}</option>`).join('')}</select></label>
          <label id="gr-day-wrap" hidden>روز سنجش<select id="gr-day"></select></label>
          <button type="button" class="ghost" id="gr-grain-run" hidden>دریافت ریزمعاملهٔ آن روز</button>
        </div>
      </div>
      <p class="gap-note" id="gr-grain-note"></p>
      <p class="gap-verdict" id="gr-verdict">—</p>
    </section>
    <div class="gap-chart-grid">
      <section class="card"><div class="section-head"><div><p class="eyebrow">مسیر</p><h3>فاصله در طول زمان</h3></div><span>ریال هر واحد</span></div><div id="gr-path" class="gap-chart gap-chart-lg"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">پرشدگی</p><h3>چقدر پر شد، چقدر جا ماند</h3></div><span>درصد</span></div><div id="gr-cover" class="gap-chart gap-chart-lg"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">توزیع</p><h3>اکنون کجای تاریخِ خودش ایستاده</h3></div><span>شمار نقاط</span></div><div id="gr-dist" class="gap-chart"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">حکم</p><h3>عقربهٔ پرشدگی</h3></div></div><div id="gr-gauge" class="gap-chart"></div></section>
      <section class="card gap-chart-wide"><div class="section-head"><div><p class="eyebrow">الگوی ساعتی</p><h3>روز در برابر ساعت</h3></div><span>فقط با دانه‌بندی درون‌روزی</span></div><div id="gr-heat" class="gap-chart gap-chart-lg"></div></section>
    </div>
  </div>

  <div class="gap-panel" data-panel="alerts" hidden>
    <section class="card">
      <div class="section-head"><div><p class="eyebrow">شرط بگذار و برو</p><h2>هشدار فاصله</h2></div><b id="gr-notify-state">—</b></div>
      <div class="gap-form gap-rule-form">
        <label>دامنه<select id="gr-rule-scope">
          <option value="">همهٔ ترکیب‌های این نماد</option>
          <option value="strategy">فقط یک خانواده</option>
          <option value="combo">فقط ترکیب انتخاب‌شده</option>
        </select></label>
        <label id="gr-rule-strategy-wrap" hidden>خانواده<select id="gr-rule-strategy">${GAP_DEFS.map((def) => `<option value="${esc(def.id)}">${esc(def.name)}</option>`).join('')}</select></label>
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
  let subtabs = null;
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
  $('gr-family').addEventListener('change', invalidate);
  $('gr-basis').addEventListener('change', invalidate);
  $('gr-sort').addEventListener('change', paintTable);

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
      <p>قیمت ورود ${dateText(report.dates[0])}: ${fmt.int(report.entryReady)} قرارداد · قیمت سنجش ${dateText(report.dates.at(-1))}: ${fmt.int(report.markReady)} قرارداد</p>
      ${problem.length ? `<details><summary>علت کمبود داده، به تفکیک ابزار (${fmt.int(problem.length)})</summary><div class="gap-table-wrap"><table class="gap-table"><thead><tr><th>ابزار</th><th>وضعیت</th><th>قیمت ورود</th><th>قیمت سنجش</th></tr></thead><tbody>${problem.map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(reasons[item.status])}${item.error ? `<details><summary>جزئیات خطای دریافت</summary><span>${esc(item.error)}</span></details>` : ''}</td><td>${item.entry && item.status !== 'error' ? 'دارد' : 'ندارد'}</td><td>${item.mark && item.status !== 'error' ? 'دارد' : 'ندارد'}</td></tr>`).join('')}</tbody></table></div></details>` : ''}`;
  }

  async function loadEverything() {
    const ins = baseSelect.value;
    if (!ins) { setStatus('اول بازه و بعد نماد پایه را انتخاب کن.', true); return; }
    cancelLoad();
    const job = new AbortController(); activeLoad = job;
    const current = () => mounted && activeLoad === job && !job.signal.aborted;
    const range = rangeUi.range, basis = $('gr-basis').value, family = $('gr-family').value;
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
      await buildRows({ range, basis, family, job, current });
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
  async function buildRows({ range, basis, family, job, current }) {
    const defs = GAP_DEFS.filter((def) => family === 'all' || def.group === family);
    const result = await buildRadarHistory({ defs, ua, seriesByIns, range, basis, settings: state.settings,
      cancel: () => job.signal.aborted || !current(), yieldControl: nextFrame,
      onProgress: ({ done, total, name, combos }) => {
        if (current()) setStatus(`ساخت فاصله‌ها: ${fmt.int(done)} از ${fmt.int(total)} استراتژی بررسی شد · ${fmt.int(combos)} ترکیب آماده${name ? ` · ${name}` : ''}`);
      } });
    if (!current()) return;
    rows = result.rows; dates = result.dates;
    const excluded = result.excluded;
    const breakdown = `${fmt.int(excluded.entry)} ترکیب فاقد قیمت ورود · ${fmt.int(excluded.mark)} ترکیب فاقد قیمت روز سنجش یا سررسیدشده · ${fmt.int(excluded.invalid)} ساختار بدون فاصلهٔ معتبر`;
    if (!rows.length) {
      $('gr-hero-tag').textContent = 'قیمت‌ها بررسی شد؛ ترکیب قابل نمایش نیست';
      setStatus(`با قیمت‌های دریافت‌شده و قیود فعلی ترکیبی برای نمایش ساخته نشد؛ ${breakdown}. قیمت ورود و سنجش ابزارها را بررسی کن؛ سپس بازه، خانواده یا فیلترهای استراتژی را تغییر بده.`, true);
      return;
    }
    $('gr-tabs').hidden = false;
    subtabs = mountRadarTabs(); subtabs.show('now');
    $('gr-hero-tag').textContent = `${fmt.int(rows.length)} ترکیب فاصله‌دار · ${nameOf(ua)}`;
    setStatus(`${fmt.int(rows.length)} ترکیب فاصله‌دار ساخته شد · ${breakdown}.`);
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
    const best = (field) => rows
      .filter((row) => finite(row.gap[field]))
      .sort((a, b) => b.gap[field] - a.gap[field])[0] || null;
    const topUpside = best('upsidePct'), topPer = best('perDay');
    const cheap = rows.filter((row) => finite(row.verdict?.rank) && row.verdict.rank <= 20).length;
    const which = (row) => (row ? `${row.def.name} · ${row.strikes.map((k) => fmt.money(k)).join('/')}` : '—');
    const cards = [
      ['ترکیب فاصله‌دار', fmt.int(rows.length), 'دست‌کم دو قیمت اعمال، ارزش خالص ناصفر، و قیمت کامل در بازه'],
      ['میانهٔ جای باقی‌مانده', room.length ? `${fmt.pct(median(room))}٪` : '—', 'از فاصلهٔ اعمال، چقدر هنوز پر نشده. میانه است نه میانگین، تا یک ردیفِ پرت جابه‌جایش نکند.'],
      ['بیشترین سود باقی‌مانده', topUpside ? `${fmt.pct(topUpside.gap.upsidePct)}٪` : '—', which(topUpside)],
      ['بهترین سود روزانه', topPer ? `${fmt.pct(topPer.gap.perDay)}٪` : '—', which(topPer)],
      ['زیر صدک ۲۰', fmt.int(cheap), 'فاصله‌شان نزدیک کمینهٔ تاریخیِ خودشان است'],
    ];
    $('gr-kpis').innerHTML = cards.map(([label, value, hint]) => `<article class="gap-kpi"><b>${esc(label)}</b><strong>${value}</strong><small>${esc(hint)}</small></article>`).join('');
  }

  function sortedRows() {
    const by = $('gr-sort').value;
    const pick = (row) => (by === 'rank' ? row.verdict?.rank : row.gap?.[by]);
    return [...rows].sort((a, b) => {
      const x = pick(a), y = pick(b);
      if (!finite(x)) return 1;
      if (!finite(y)) return -1;
      // صدکِ پایین بهتر است؛ بقیه بالاتر بهتر.
      return by === 'rank' ? x - y : y - x;
    });
  }

  function paintTable() {
    if (!rows.length) return;
    const list = sortedRows();
    $('gr-now-note').textContent = `روز ورود ${faDigits(historyDateLabel(dates[0]))} · روز سنجش ${faDigits(historyDateLabel(dates.at(-1)))}؛ روزهای موجود در بازهٔ انتخابی. مبنا: ${$('gr-basis').selectedOptions[0].textContent}. قیمت روزانه، تضمین اجرای هم‌زمان پاها نیست. «روند بازه» مسیر فاصله در همین بازه است.`;
    $('gr-rows').innerHTML = list.map((row) => {
      const gap = row.gap;
      const values = row.series.points.map((point) => point.current);
      return `<tr data-key="${esc(row.key)}"${livePrices ? ' class="live"' : ''}>
        <td><b>${esc(row.def.name)}</b><small>${esc(row.gap.kindLabel)}</small></td>
        <td class="num">${row.strikes.map((k) => fmt.money(k)).join(' / ')}</td>
        <td>${faDigits(historyDateLabel(row.expiry))}<small>${finite(gap.daysLeft) ? `${fmt.int(gap.daysLeft)} روز` : ''}</small></td>
        <td class="num">${moneyCell(gap.anchor)}<small>${esc(gap.anchorLabel)}</small></td>
        <td class="num"><b>${moneyCell(gap.current)}</b><small>${gap.side === 'credit' ? 'بستانکار' : 'بدهکار'}</small></td>
        <td>${fillBar(gap)}</td>
        <td class="num">${pctCell(gap.upsidePct)}</td>
        <td class="num">${pctCell(gap.perDay)}</td>
        <td class="num">${finite(row.verdict?.rank) ? `${fmt.pct(row.verdict.rank)}٪<small>${esc(row.verdict.tone)}</small>` : '—'}</td>
        <td class="spark-cell">${sparkline(values, { band: gap.anchor, label: `${row.def.name} — روند فاصله` })}</td>
      </tr>`;
    }).join('');
    for (const tr of $('gr-rows').querySelectorAll('tr')) {
      tr.addEventListener('click', () => {
        $('gr-pick').value = tr.dataset.key;
        paintHistory();
        subtabs?.show?.('history');
      });
    }
  }

  // ————————————————————————— زیرتب «تاریخچه» —————————————————————————

  function fillPicker() {
    const select = $('gr-pick');
    const keep = select.value;
    select.innerHTML = sortedRows().map((row) => `<option value="${esc(row.key)}">${esc(row.def.name)} · ${row.strikes.map((k) => fmt.money(k)).join('/')} · ${faDigits(historyDateLabel(row.expiry))}</option>`).join('');
    if (keep && rows.some((row) => row.key === keep)) select.value = keep;
  }

  $('gr-pick').addEventListener('change', paintHistory);
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

  function paintHistory(series = null) {
    const row = selectedRow();
    if (!row) return;
    $('gr-day').innerHTML = dates.map((date) => `<option value="${date}">${faDigits(historyDateLabel(date))}</option>`).join('');
    if (tapeDate) $('gr-day').value = String(tapeDate);
    const show = series || row.series;
    $('gr-verdict').textContent = `${gapNote(row.gap)} ${row.verdict?.ok ? `فاصله در صدک ⁨${fmt.pct(row.verdict.rank)}⁩ تاریخِ همین بازه است — ${row.verdict.tone}.` : ''}`;
    void charts.set('path', $('gr-path'), gapPathChart(show, { anchor: row.gap.anchor }), { empty: 'برای این ترکیب نقطه‌ای در این دانه‌بندی نیست' });
    void charts.set('cover', $('gr-cover'), coverageChart(show), { empty: 'برای این ترکیب نقطه‌ای در این دانه‌بندی نیست' });
    void charts.set('dist', $('gr-dist'), distributionChart(show, row.gap.current), { empty: 'برای ساختن توزیع دست‌کم سه نقطه لازم است' });
    void charts.set('gauge', $('gr-gauge'), fillGauge(row.gap), { empty: 'فاصله محاسبه نشد' });
    void charts.set('heat', $('gr-heat'), hourHeatmap(heatRows(show)), { empty: 'نقشهٔ ساعتی با دانه‌بندی درون‌روزی ساخته می‌شود' });
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

  async function loadIntraday() {
    const row = selectedRow();
    if (!row) return;
    const date = Number($('gr-day').value);
    const legs = row.legs.filter((leg) => leg.kind !== 'underlying');
    $('gr-grain-run').disabled = true;
    $('gr-grain-note').textContent = `دریافت ریزمعاملهٔ ${fmt.int(legs.length)} پا برای ${historyDateLabel(date)}…`;
    try {
      const requests = legs.map((leg) => ({ ins: String(leg.ins), date: String(date) }));
      const response = await fetch('/api/trades/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'ریزمعامله دریافت نشد');
      tapeByIns = {};
      for (const leg of legs) tapeByIns[String(leg.ins)] = payload.items?.[`${date}:${leg.ins}`]?.rows || [];
      tapeDate = date;
      const series = intradayGapSeries({
        legs: row.legs, tapeByIns, date, grain: $('gr-grain').value,
        strategyId: row.def.id, entry: row.entry, expiry: row.expiry,
      });
      series.day = date;
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

  function startLive() {
    stopLive();
    $('gr-live-state').textContent = 'روشن — هر ۱۰ ثانیه';
    const tick = () => void pollLive();
    tick();
    liveTimer = setInterval(tick, 10000);
  }

  function stopLive() {
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = 0; livePrices = null;
    const node = $('gr-live-state');
    if (node) node.textContent = 'خاموش';
  }

  /**
   * قیمت زندهٔ پاها، و سنجشِ هشدارها روی همان.
   *
   * سقف ۲۴ ابزار، همان سقفِ `/api/live-trades` است. با ده‌ها ترکیب،
   * پرمعامله‌ترین پاها اولویت می‌گیرند — نه اینکه بی‌صدا نصفشان بیفتد؛
   * شمارِ پوشش‌داده‌شده در نوار وضعیت گفته می‌شود.
   */
  async function pollLive() {
    if (!rows.length) return;
    const wanted = [...new Set(rows.flatMap((row) => row.legs)
      .filter((leg) => leg.kind !== 'underlying').map((leg) => String(leg.ins)))].slice(0, 24);
    try {
      const response = await fetch(`/api/live-trades?ins=${wanted.join(',')}`);
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'مظنهٔ زنده دریافت نشد');
      livePrices = {};
      for (const [ins, item] of Object.entries(payload.items || {})) {
        const price = Number(item?.summary?.lastPrice);
        if (price > 0) livePrices[ins] = price;
      }
      const covered = applyLive();
      $('gr-live-state').textContent = `روشن · ${fmt.int(covered)} ترکیب با قیمت زنده · ${faDigits(new Date(payload.at).toLocaleTimeString('fa-IR'))}`;
      runAlerts();
    } catch (error) {
      $('gr-live-state').textContent = `دریافت زنده نشد: ${error.message}`;
    }
  }

  /** فاصلهٔ هر ردیف را با قیمت زنده بازمی‌سازد. ردیفِ بی‌قیمتِ زنده دست‌نخورده می‌ماند. */
  function applyLive() {
    let covered = 0;
    for (const row of rows) {
      const legs = row.legs.filter((leg) => leg.kind !== 'underlying');
      if (!legs.every((leg) => finite(livePrices?.[String(leg.ins)]))) continue;
      const gap = measureGap({
        legs: row.legs, prices: livePrices, strategyId: row.def.id,
        entry: row.entry, daysLeft: row.gap.daysLeft,
      });
      if (!gap.ok) continue;
      row.gap = gap;
      row.verdict = gapVerdict(row.series, gap);
      covered += 1;
    }
    paintKpis();
    paintTable();
    return covered;
  }

  function runAlerts() {
    if (!rules.length) return;
    const snapshots = {};
    for (const row of rows) {
      const stats = seriesStats(row.series.points);
      snapshots[row.key] = alertSnapshot({
        gap: row.gap, verdict: row.verdict,
        day: { low: stats.min, high: stats.max },
        basePrice: NaN,
        label: `${row.def.name} · ${row.strikes.map((k) => fmt.money(k)).join('/')}`,
        strategyId: row.def.id, strategyName: row.def.name,
      });
    }
    const result = evaluateAlerts({ rules, snapshots, prev: prevSnapshots, nowMs: Date.now() });
    prevSnapshots = result.prev;
    if (result.fired.length) {
      rules = result.rules;
      saveRules(rules);
      const host = $('gr-alarm-host');
      for (const fired of result.fired) deliver(fired, { host });
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
      label: scope === 'combo' ? (selectedRow()?.def.name || '') : '',
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
    const log = readLog();
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
    testDelivery({ host: $('gr-alarm-host-2'), sound: $('gr-rule-sound').checked });
    paintLog();
  });
  $('gr-log-clear').addEventListener('click', () => { clearLog(); paintLog(); });

  // ————————————————————————— راه‌اندازی —————————————————————————

  paintNotifyState();
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
