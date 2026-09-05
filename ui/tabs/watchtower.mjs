// تب «دیده‌بان شرطی» — شرط بگذار، ببین چه چیزی منطبق است، بعد رصد کن.
//
// ═══ خواستهٔ صاحب پروژه ═══
//
// «یک تب برای سیستم اعلان بساز که با انتخاب استراتژی و تعریف کردن
// فیلترها و شرط‌ها برای آن استراتژی … آیتم‌های کامل و قابل انتخاب داشته
// باشیم و با تأیید کاربر اطلاعات کامل و ریز و جامع آن استراتژی با
// مشخصات مشخص‌شده را بدهد و شروع به رادار کردن و اعلان فرستادن بکند.»
//
// و: «سیستم شرط‌گذاری قابلیت اجرا روی یک ترکیب خاص یا روی یک ترکیب
// عمومی بدون مشخص کردن اعمال‌ها را داشته باشد … حتی انتخاب نمادهای
// مختلف امکان‌پذیر باشد.»
//
// ═══ چرا تبِ جدا و نه زیرتبِ «هشدارها»ی رادار ═══
//
// آن یکی یک شرط روی ترکیب‌های **یک نماد** می‌گذارد؛ رادار پیش از آن باید
// همان یک نماد را ساخته باشد. این یکی از نماد شروع نمی‌کند: از شرط شروع
// می‌کند و بعد می‌گردد ببیند کدام ترکیب — در هر نمادی — به آن می‌خورد.
// دو جهتِ متضاد، و ریختنشان در یک صفحه هر دو را گیج می‌کرد.
//
// ═══ سه گام، و تأییدِ کاربر وسطشان ═══
//
//   ۱ دامنه    بازه، نمادها، استراتژی‌ها
//   ۲ شرط‌ها    یکی‌یکی، با «و» بین‌شان
//   ۳ تطبیق    «چه چیزی همین حالا منطبق است» — جدولِ کامل، پیش از هر زنگی
//
// گامِ سوم عمداً پیش از رصد است. قاعده‌ای که کاربر ندیده روی چه چیزی
// می‌نشیند، یا هیچ‌وقت زنگ نمی‌زند یا صد بار می‌زند — و هر دو یعنی خاموشش
// می‌کند.

import { faDigits, fmt } from '/ui/fmt.mjs';
import { buildChain } from '/core/chain.mjs';
import { byId } from '/strategies/catalog.mjs';
import { flattenActiveContracts } from '/core/history.mjs';
import { loadRange, mountHistoryRange } from '/ui/history-range.mjs';
import { loadHistoricalDailies } from '/ui/history-dailies.mjs';
import { GAP_STRATEGY_IDS, measureGap } from '/core/spread-gap.mjs';
import { gapVerdict } from '/core/spread-gap-series.mjs';
import { buildRadarHistory, expiryShortfall, radarDataReport } from '/core/radar-history.mjs';
import { comboMetrics } from '/core/radar-metrics.mjs';
import {
  ALERT_OPS, DEFAULT_COOLDOWN_SEC, DEFAULT_WINDOW_DAYS, WATCH_METRICS, WATCH_METRIC_GROUPS,
  WATCH_REFS, conditionNote, evaluateWatch, normalizeCondition, normalizeWatchRule, watchDistance,
  watchMetric, watchRef, watchRuleNote, watchSnapshot,
} from '/core/watch-rule.mjs';
import {
  LIVE_INS_CAP, LIVE_PRIORITIES, comboLiveQuote, livePriority, liveQuoteBook, planLiveQuotes,
  tehranSecondOfDay,
} from '/core/live-quote.mjs';
import { makeDayRange } from '/core/day-range.mjs';
import { tehranDateNumber } from '/core/live-day.mjs';
import { makeTable } from '/ui/table.mjs';
import { RADAR_ALL_COLS, RADAR_COLS, toTableRow } from '/ui/radar-columns.mjs';
import {
  NOTIFY_LABEL, askNotifyPermission, clearLog, deliverBurst, notifyState, readLog, testDelivery,
} from '/ui/gap-alarm.mjs';
import { logError } from '/ui/errlog.mjs';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const finite = (value) => Number.isFinite(value);
const num = (value, fallback = NaN) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const nameOf = (item, fallback = 'نماد پایه') => String(item?.name || '').trim() || fallback;
const RULES_KEY = 'watchtower:rules';
const DEFS = GAP_STRATEGY_IDS.map((id) => byId(id)).filter(Boolean);

function readRules() {
  try {
    return JSON.parse(localStorage.getItem(RULES_KEY) || '[]')
      .map((raw) => normalizeWatchRule(raw)).filter((row) => row.ok).map((row) => row.rule);
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
      <p class="eyebrow">شرط بگذار، برنامه بگردد</p>
      <h1>دیده‌بان شرطی</h1>
      <p>«بول‌کال‌اسپردهایی با حداکثر زیان ۱۵٪ و حداکثر سود ۴۰٪، در میان همهٔ نمادها» — شرط را بنویس، ببین همین حالا چه چیزی منطبق است، و بعد بگذار رصد کند و خبرت کند.</p>
    </div>
    <span class="gap-hero-tag" id="wt-hero-tag">هنوز شرطی گذاشته نشده</span>
  </section>

  <section class="card gap-setup">
    <div class="section-head"><div><p class="eyebrow">گام یک</p><h2>دامنه — کجا بگردد</h2></div><b id="wt-status" role="status" aria-live="polite">در حال دریافت…</b></div>
    <div id="wt-range" class="step-first" data-step="۱"></div>
    <div class="wt-scope">
      <div class="wt-pick">
        <header><b>نمادهای پایه</b><span id="wt-base-count">—</span>
          <button type="button" class="ghost" data-all="bases">همه</button>
          <button type="button" class="ghost" data-none="bases">هیچ</button></header>
        <div class="wt-list" id="wt-bases"><p class="empty-note">اول بازه را انتخاب کن.</p></div>
      </div>
      <div class="wt-pick">
        <header><b>استراتژی‌ها</b><span id="wt-def-count">—</span>
          <button type="button" class="ghost" data-all="defs">همه</button>
          <button type="button" class="ghost" data-none="defs">هیچ</button></header>
        <div class="wt-list" id="wt-defs">${DEFS.map((def) => `<label class="check"><input type="checkbox" data-def="${esc(def.id)}"> ${esc(def.name)}</label>`).join('')}</div>
      </div>
    </div>
    <div class="gap-form">
      <label>مبنای قیمت<select id="wt-basis">
        <option value="CLOSE">قیمت پایانی</option>
        <option value="LAST">آخرین معامله</option>
        <option value="FIRST">اولین معامله</option>
      </select></label>
      <label>کمینه ارزش معاملهٔ هر پا<input id="wt-min-value" type="number" min="0" step="1000000" value="0" placeholder="ریال"></label>
      <label>تعداد واحد<input id="wt-units" type="number" min="1" max="10000" step="1" value="${Math.max(1, state.settings.qtyDefault || 1)}"></label>
    </div>
    <p class="gap-note">هر نمادِ انتخاب‌شده یک دورِ کاملِ دریافت و ساخت است. با ده نماد، ساختن دقایقی طول می‌کشد و دکمهٔ توقف کار می‌کند.</p>
  </section>

  <section class="card">
    <div class="section-head"><div><p class="eyebrow">گام دو</p><h2>شرط‌ها — همه با «و»</h2></div><span id="wt-cond-count">—</span></div>
    <div class="gap-form gap-rule-form">
      <label>سنجه<select id="wt-metric">${WATCH_METRIC_GROUPS.map((groupName) => `<optgroup label="${esc(groupName)}">${WATCH_METRICS.filter((row) => row.group === groupName).map((row) => `<option value="${esc(row.id)}">${esc(row.label)}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label>شرط<select id="wt-op">${ALERT_OPS.map((row) => `<option value="${esc(row.id)}">${esc(row.label)}</option>`).join('')}</select></label>
      <label>مرجع آستانه<select id="wt-ref">${WATCH_REFS.map((row) => `<option value="${esc(row.id)}">${esc(row.label)}</option>`).join('')}</select></label>
      <label>مقدار<input id="wt-value" type="number" step="any" value="0"></label>
      <label id="wt-window-wrap" hidden>پنجره (روز)<input id="wt-window" type="number" min="1" max="250" step="1" value="${DEFAULT_WINDOW_DAYS}"></label>
      <button type="button" class="primary" id="wt-cond-add">افزودن شرط</button>
    </div>
    <p class="gap-note" id="wt-cond-hint">—</p>
    <div class="wt-conds" id="wt-conds"></div>
  </section>

  <section class="card">
    <div class="section-head"><div><p class="eyebrow">گام سه</p><h2>چه چیزی همین حالا منطبق است</h2></div>
      <div class="gap-toolbar">
        <button type="button" class="primary" id="wt-run">ساخت و تطبیق</button>
        <button type="button" class="ghost" id="wt-stop" hidden>توقف</button>
      </div>
    </div>
    <p class="gap-note" id="wt-match-note">شرط‌هایت را بگذار و «ساخت و تطبیق» را بزن. تا نبینی چه چیزی منطبق می‌شود، رصد را شروع نکن.</p>
    <div id="wt-table" class="gap-grid"></div>
  </section>

  <section class="card">
    <div class="section-head"><div><p class="eyebrow">گام چهار</p><h2>رصد و اعلان</h2></div><b id="wt-notify-state">—</b></div>
    <div class="gap-form gap-rule-form">
      <label>نامِ قاعده<input id="wt-name" type="text" placeholder="مثلاً: اسپردهای ارزانِ اهرم"></label>
      <label>آرامش (ثانیه)<input id="wt-cooldown" type="number" min="0" step="10" value="${DEFAULT_COOLDOWN_SEC}"></label>
      <label class="check"><input type="checkbox" id="wt-sound"> صدا هم بزند</label>
      <label>اولویت سهمیهٔ زنده<select id="wt-live-priority">${LIVE_PRIORITIES.map((row) => `<option value="${esc(row.id)}">${esc(row.label)}</option>`).join('')}</select></label>
      <button type="button" class="primary" id="wt-save" disabled>ذخیرهٔ قاعده و شروع رصد</button>
      <button type="button" class="ghost" id="wt-watch-stop" hidden>توقف رصد</button>
      <span id="wt-watch-state" class="gap-live-state">خاموش</span>
    </div>
    <p class="gap-note" id="wt-watch-note">رصد روی همهٔ ترکیب‌های دامنه اجرا می‌شود، نه فقط آن‌هایی که در پیش‌نمایش منطبق بودند — وگرنه ترکیبی که ده دقیقه بعد وارد شرط می‌شود هرگز دیده نمی‌شد.</p>
    <div class="gap-alarm-actions">
      <button type="button" class="ghost" id="wt-notify-ask">اجازهٔ اعلان مرورگر</button>
      <button type="button" class="ghost" id="wt-notify-test">آزمایش کانال‌ها</button>
    </div>
    <div id="wt-alarm-host" class="gap-alarm-host" aria-live="assertive"></div>
  </section>

  <section class="card"><div class="section-head"><div><p class="eyebrow">فهرست</p><h3>قاعده‌های ذخیره‌شده</h3></div><span id="wt-rule-count">—</span></div>
    <div id="wt-rules" class="gap-rule-list"></div></section>
  <section class="card"><div class="section-head"><div><p class="eyebrow">دفترچه</p><h3>چه زمانی و روی چه عددی زد</h3></div><button type="button" class="ghost" id="wt-log-clear">پاک کردن دفترچه</button></div>
    <div id="wt-log" class="gap-log"></div></section>`;

  // ————————————————————————— حالت —————————————————————————

  let rangeUi = null, rangeJob = null, chain = new Map();
  let conditions = [], rules = readRules();
  let built = [], matched = [], table = null;
  let activeLoad = null, mounted = true, universeVersion = 0;
  // ── رصد ───────────────────────────────────────────────────────────────
  //
  // `watchRules` جمع است، نه مفرد. «چند قاعده ذخیره می‌شود، اما فقط آخرین
  // قاعده واقعاً رصد می‌شود؛ قواعد قبلی در فهرست ظاهراً فعال باقی
  // می‌مانند، ولی حلقه فقط یک `watchRule` را ارزیابی می‌کند.» درست بود:
  // فهرست، وعدهٔ چند قاعده می‌داد و حلقه یکی را می‌سنجید.
  let watchTimer = 0, watchRules = [], prevSnaps = {};
  // نسل و قفل — همان دو چیزی که «توقفِ قابل اعتماد» و «درخواستِ روی هم
  // نیفتادن» را ممکن می‌کنند.
  let watchGen = 0, watchBusy = false, watchJob = null;
  // ترکیب‌هایی که در آخرین تیک مظنهٔ هم‌زمان داشتند. جدول از همین می‌فهمد
  // کدام ردیف «زنده» است — پیش از این همهٔ ردیف‌ها زنده برچسب می‌خوردند.
  const liveKeys = new Set();
  const dayRange = makeDayRange();
  // ── تازگیِ پیش‌نمایش ────────────────────────────────────────────────
  //
  // «تغییر شرط یا دامنه، نتیجهٔ پیش‌نمایش را باطل نمی‌کند»: شرطِ ناممکن
  // اضافه می‌شد و جدول همان ۱۰۳ ترکیبِ قبلی را منطبق نشان می‌داد و اجازهٔ
  // شروع رصد می‌داد. حالا هر تغییری در شرط یا دامنه، پیش‌نمایش را کهنه
  // می‌کند و دکمهٔ رصد تا «ساخت و تطبیق»ِ دوباره خاموش می‌ماند.
  let previewFresh = false, previewNote = '';
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  const setStatus = (text, bad = false) => {
    const node = $('wt-status');
    node.textContent = text;
    node.classList.toggle('bad', !!bad);
  };
  const units = () => Math.max(1, Math.trunc(Number($('wt-units').value) || 1));
  const pickedBases = () => [...root.querySelectorAll('[data-base]:checked')].map((box) => box.dataset.base);
  const pickedDefs = () => [...root.querySelectorAll('[data-def]:checked')].map((box) => box.dataset.def);

  // ————————————————————————— گام یک: دامنه —————————————————————————

  function fillBases(payload) {
    const keep = new Set(pickedBases());
    chain = buildChain(payload.rows || []);
    const list = [...chain.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fa'));
    $('wt-bases').innerHTML = list.length
      ? list.map((item) => `<label class="check"><input type="checkbox" data-base="${esc(item.ins)}"${keep.has(String(item.ins)) ? ' checked' : ''}> ${esc(nameOf(item))} <small>${fmt.int(item.contracts)} قرارداد</small></label>`).join('')
      : '<p class="empty-note">در این بازه نمادی نبود.</p>';
    paintCounts();
    setStatus(`${fmt.int(chain.size)} نماد پایه آمادهٔ انتخاب است.`);
  }

  async function loadUniverseForRange(range) {
    const version = ++universeVersion;
    cancelLoad();
    rangeJob?.stop();
    chain = new Map();
    $('wt-bases').innerHTML = '<p class="empty-note">در حال دریافت فهرست نمادها…</p>';
    const current = () => mounted && version === universeVersion;
    const rangeStatus = { note: (...args) => { if (current()) rangeUi?.note(...args); },
      build: (value) => (current() ? rangeUi?.build(value) : false) };
    rangeJob = loadRange(range, rangeStatus, { onUpdate: (payload) => { if (current()) fillBases(payload); } });
    try { const payload = await rangeJob.first; if (current()) fillBases(payload); }
    catch (error) {
      if (!current()) return;
      $('wt-bases').innerHTML = '<p class="empty-note">فهرست نمادهای این بازه دریافت نشد.</p>';
      setStatus(`فهرست قراردادهای این بازه دریافت نشد: ${error.message}`, true);
    }
  }

  function paintCounts() {
    const bases = pickedBases().length, defs = pickedDefs().length;
    $('wt-base-count').textContent = bases ? `${fmt.int(bases)} انتخاب‌شده` : 'هیچ‌کدام';
    $('wt-def-count').textContent = defs ? `${fmt.int(defs)} انتخاب‌شده` : 'هیچ‌کدام';
    // سه شرطِ لازم، و «تازه بودنِ پیش‌نمایش» یکی از آن‌هاست: قاعده‌ای که
    // روی فهرستی از پیشِ باطل‌شده ذخیره شود، همان چیزی است که کاربر
    // ندیده روی چه می‌نشیند.
    $('wt-save').disabled = !(conditions.length && matched.length && previewFresh);
  }

  /**
   * پیش‌نمایش را کهنه اعلام می‌کند.
   *
   * هر چیزی که می‌تواند فهرستِ منطبق‌ها را عوض کند اینجا می‌آید: شرط،
   * نماد، استراتژی، مبنای قیمت، تعداد واحد، آستانهٔ نقدشوندگی، و بازه.
   */
  function stalePreview(why = 'دامنه یا شرط‌ها عوض شد') {
    if (!previewFresh && previewNote === why) { paintCounts(); return; }
    previewFresh = false; previewNote = why;
    if (matched.length || built.length) {
      $('wt-match-note').textContent = `${why}؛ فهرستِ زیر مالِ تطبیقِ قبلی است و دیگر معتبر نیست. «ساخت و تطبیق» را دوباره بزن تا ببینی همین حالا چه چیزی منطبق است.`;
      $('wt-hero-tag').textContent = 'پیش‌نمایش کهنه شد';
    }
    paintCounts();
  }

  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-base],[data-def]')) stalePreview('دامنه عوض شد');
  });
  for (const id of ['wt-basis', 'wt-min-value', 'wt-units']) {
    $(id).addEventListener('change', () => stalePreview('مبنای ساخت عوض شد'));
  }
  for (const button of root.querySelectorAll('[data-all],[data-none]')) {
    button.addEventListener('click', () => {
      const which = button.dataset.all || button.dataset.none;
      const on = !!button.dataset.all;
      const selector = which === 'bases' ? '[data-base]' : '[data-def]';
      for (const box of root.querySelectorAll(selector)) box.checked = on;
      stalePreview('دامنه عوض شد');
    });
  }

  // ————————————————————————— گام دو: شرط‌ها —————————————————————————

  function paintCondHint() {
    const metric = watchMetric($('wt-metric').value);
    const ref = watchRef($('wt-ref').value);
    const op = ALERT_OPS.find((row) => row.id === $('wt-op').value);
    $('wt-window-wrap').hidden = !ref.window;
    const parts = [metric?.hint || '', ref.hint || ''];
    if (ref.window && !metric?.history) {
      parts.push(`«${ref.label}» روی این سنجه کار نمی‌کند، چون تاریخچه ندارد.`);
    }
    parts.push(op?.needsPrev
      ? 'این شرط فقط در لحظهٔ رد شدن از خط آتش می‌کند، نه در هر سنجشی که آن‌سوی خط باشی.'
      : 'این شرط تا وقتی برقرار باشد در هر سنجش آتش می‌کند؛ «آرامش» جلوی تکرارش را می‌گیرد.');
    $('wt-cond-hint').textContent = parts.filter(Boolean).join(' ');
  }
  for (const id of ['wt-metric', 'wt-op', 'wt-ref']) $(id).addEventListener('change', paintCondHint);

  $('wt-cond-add').addEventListener('click', () => {
    const built = normalizeCondition({
      metric: $('wt-metric').value, op: $('wt-op').value, ref: $('wt-ref').value,
      value: Number($('wt-value').value), windowDays: Number($('wt-window').value),
    });
    if (!built.ok) { $('wt-cond-hint').textContent = `شرط اضافه نشد: ${built.why}`; return; }
    conditions = [...conditions, built.condition];
    stalePreview('شرط تازه اضافه شد');
    paintConds();
  });

  function paintConds() {
    $('wt-cond-count').textContent = conditions.length ? `${fmt.int(conditions.length)} شرط` : 'هنوز شرطی نیست';
    $('wt-conds').innerHTML = conditions.length
      ? conditions.map((condition, at) => `<article class="wt-cond"><b>${esc(conditionNote(condition))}</b><button type="button" class="ghost danger" data-drop="${at}">حذف</button></article>`).join('')
      : '<p class="empty-note">هنوز شرطی نگذاشته‌ای. بی دست‌کم یک شرط، قاعده ساخته نمی‌شود.</p>';
    for (const button of $('wt-conds').querySelectorAll('[data-drop]')) {
      button.addEventListener('click', () => {
        conditions = conditions.filter((_, at) => at !== Number(button.dataset.drop));
        stalePreview('شرطی حذف شد');
        paintConds();
      });
    }
    paintCounts();
  }

  // ————————————————————————— گام سه: تطبیق —————————————————————————

  function cancelLoad() {
    activeLoad?.abort(); activeLoad = null;
    $('wt-run').disabled = false; $('wt-stop').hidden = true;
  }
  $('wt-stop').addEventListener('click', () => {
    cancelLoad();
    $('wt-hero-tag').textContent = 'ساخت متوقف شد';
    setStatus('ساخت متوقف شد؛ نتیجهٔ ناتمام نمایش داده نمی‌شود.');
  });
  $('wt-run').addEventListener('click', () => void runMatch());

  /**
   * برای هر نمادِ انتخاب‌شده یک دورِ کامل: دریافت تاریخچه، ساخت ترکیب‌ها،
   * و سنجهٔ کامل. بعد شرط‌ها روی همه.
   *
   * نمادها یکی‌یکی ساخته می‌شوند نه موازی — هر کدام ده‌ها درخواست است و
   * موازی‌کردنشان فقط صف را جای دیگری می‌سازد.
   */
  async function runMatch() {
    const bases = pickedBases(), defIds = pickedDefs();
    if (!bases.length) { setStatus('دست‌کم یک نماد پایه انتخاب کن.', true); return; }
    if (!defIds.length) { setStatus('دست‌کم یک استراتژی انتخاب کن.', true); return; }
    if (!conditions.length) { setStatus('دست‌کم یک شرط بگذار؛ بی شرط، «منطبق» معنی ندارد.', true); return; }

    cancelLoad();
    const job = new AbortController(); activeLoad = job;
    const current = () => mounted && activeLoad === job && !job.signal.aborted;
    const range = rangeUi.range, basis = $('wt-basis').value;
    const defs = DEFS.filter((def) => defIds.includes(def.id));
    $('wt-run').disabled = true; $('wt-stop').hidden = false;
    built = []; matched = [];
    $('wt-hero-tag').textContent = 'در حال ساخت';
    const skipped = [];
    try {
      for (let at = 0; at < bases.length; at += 1) {
        if (!current()) return;
        const ua = chain.get(bases[at]);
        if (!ua) continue;
        setStatus(`نماد ${fmt.int(at + 1)} از ${fmt.int(bases.length)} — ${nameOf(ua)}: دریافت تاریخچه…`);
        const contracts = flattenActiveContracts(ua, state.settings.blockedExpiries);
        if (!contracts.length) { skipped.push(`${nameOf(ua)}: قراردادی در بازه نبود`); continue; }
        const codes = [...new Set([String(ua.ins), ...contracts.map((row) => String(row.ins))])];
        const loaded = await loadHistoricalDailies(codes, ua.ins, fetch, {
          signal: job.signal, tolerateErrors: true,
          onProgress: ({ done, total }) => {
            if (current()) setStatus(`${nameOf(ua)}: ${fmt.int(done)} از ${fmt.int(total)} ابزار دریافت شد.`);
          },
        });
        if (!current()) return;
        const report = radarDataReport({ ua, seriesByIns: loaded.seriesByIns, errors: loaded.errors,
          range, basis, settings: state.settings });
        if (!report.dates.length || report.base.status !== 'ready') {
          skipped.push(`${nameOf(ua)}: قیمت پایه در بازه نبود`); continue;
        }
        setStatus(`${nameOf(ua)}: ساخت ترکیب‌ها…`);
        const result = await buildRadarHistory({
          defs, ua, seriesByIns: loaded.seriesByIns, range, basis, settings: state.settings,
          scale: 'raw', units: units(),
          minLegValue: Math.max(0, Number($('wt-min-value').value) || 0),
          cancel: () => job.signal.aborted || !current(), yieldControl: nextFrame,
        });
        if (!current()) return;
        if (!result.rows.length) {
          // ساختارِ دو سررسیدی با یک سررسید ساخته نمی‌شود، و این را باید
          // صریح گفت — نه اینکه فقط بنویسیم «ترکیبی ساخته نشد».
          const shortfall = expiryShortfall(defs, result.expiryWindow);
          skipped.push(`${nameOf(ua)}: ${shortfall.note || 'ترکیبی ساخته نشد'}`);
          continue;
        }
        // نسخهٔ روزِ سنجش کنار هر ردیف می‌ماند تا خاموش‌شدنِ رصد بتواند
        // عددِ روزانه را برگرداند.
        for (const row of result.rows) {
          built.push({ row: Object.assign(row, {
            daily: { gap: row.gap, metrics: row.metrics, verdict: row.verdict } }), ua });
        }
      }
      if (!current()) return;
      evaluateNow(skipped);
    } catch (error) {
      if (!current()) return;
      logError('watchtower', error);
      $('wt-hero-tag').textContent = 'ساخت کامل نشد';
      setStatus(`ساخت کامل نشد: ${error.message}`, true);
    } finally { if (activeLoad === job) cancelLoad(); }
  }

  /**
   * شرط‌ها روی هرچه ساخته شده. `matched` است نه `fired` — هنوز زنگی نیست.
   *
   * `previewCross` جوابِ بن‌بستِ «عبور از آستانه» است: پیش‌نمایش یک سنجش
   * است و عبور در یک سنجش دیده نمی‌شود، پس صفر ترکیب منطبق می‌شد و دکمهٔ
   * رصد هیچ‌وقت روشن نمی‌شد. اینجا — و فقط اینجا — «رد شد» مثل «آن‌سوی
   * خط هست» سنجیده می‌شود؛ زنگِ واقعی همچنان فقط در لحظهٔ عبور می‌زند.
   */
  function evaluateNow(skipped = []) {
    const rule = normalizeWatchRule({
      name: $('wt-name').value, conditions,
      strategyIds: pickedDefs(), baseIns: pickedBases(),
      cooldownSec: Number($('wt-cooldown').value), sound: $('wt-sound').checked,
    });
    if (!rule.ok) { setStatus(`قاعده ساخته نشد: ${rule.why}`, true); return; }
    const snapshots = built.map(({ row, ua }) => watchSnapshot(row, {
      baseIns: String(ua.ins), baseName: nameOf(ua), basePrice: row.spot,
    }));
    const byKey = new Map(built.map(({ row, ua }) => [row.key, { row, ua }]));
    const verdict = evaluateWatch({ rules: [rule.rule], snapshots, prev: {}, nowMs: 0, previewCross: true });
    const hits = verdict.matched.get(rule.rule.id) || [];
    matched = hits.map((hit) => byKey.get(hit.snapshot.key)).filter(Boolean);
    previewFresh = true; previewNote = '';
    paintMatch(skipped, rule.rule);
  }

  function mountTable() {
    if (table) return table;
    table = makeTable($('wt-table'), RADAR_COLS, {
      all: RADAR_ALL_COLS, storeKey: 'watchtower-cols', sortKey: 'returnPct',
      exportName: 'watchtower', rowHeight: 52,
    });
    return table;
  }

  function paintMatch(skipped = [], rule = null) {
    mountTable().set(matched.map(({ row, ua }) => toTableRow(row, { baseName: nameOf(ua), live: null })));
    mountTable().setEmptyMessage('هیچ ترکیبی همهٔ شرط‌ها را با هم ندارد. شرط‌ها با «و» جمع می‌شوند؛ یکی را شل کن.');
    const note = `${fmt.int(built.length)} ترکیب ساخته شد · ${fmt.int(matched.length)} ترکیب همهٔ شرط‌ها را با هم دارد.`;
    const why = skipped.length ? ` نمادهایی که ردیفی ندادند: ${skipped.join('؛ ')}.` : '';
    // شرطِ «عبور» در پیش‌نمایش مثل «بودن» سنجیده شده و کاربر باید بداند.
    const crossed = (rule?.conditions || []).some((one) => one.op === 'crossUp' || one.op === 'crossDown');
    const crossNote = crossed
      ? ' شرطِ «رد شدن از عدد» در این پیش‌نمایش مثل «آن‌سوی عدد بودن» سنجیده شد، چون عبور با یک سنجش دیده نمی‌شود؛ در رصد، فقط لحظهٔ خودِ عبور زنگ می‌زند و این فهرست از آن بزرگ‌تر است.'
      : '';
    $('wt-match-note').textContent = `${note}${why} رصد روی هر ${fmt.int(built.length)} ترکیبِ دامنه اجرا می‌شود، نه فقط این ${fmt.int(matched.length)} تا؛ این فهرست می‌گوید همین حالا چه چیزی منطبق است.${crossNote}`;
    $('wt-hero-tag').textContent = matched.length
      ? `${fmt.int(matched.length)} ترکیب منطبق` : 'هیچ ترکیبی منطبق نشد';
    setStatus(note);
    paintCounts();
  }

  // ————————————————————————— گام چهار: رصد —————————————————————————

  $('wt-save').addEventListener('click', () => {
    const rule = normalizeWatchRule({
      name: $('wt-name').value || watchRuleNote({ conditions, strategyIds: pickedDefs(), baseIns: pickedBases() }),
      conditions, strategyIds: pickedDefs(), baseIns: pickedBases(),
      cooldownSec: Number($('wt-cooldown').value), sound: $('wt-sound').checked,
    });
    if (!rule.ok) { setStatus(`قاعده ذخیره نشد: ${rule.why}`, true); return; }
    if (!previewFresh) { setStatus('پیش‌نمایش کهنه است؛ اول «ساخت و تطبیق» را دوباره بزن.', true); return; }
    rules = [...rules, rule.rule];
    saveRules(rules);
    paintRules();
    startWatch();
  });

  $('wt-live-priority').addEventListener('change', () => {
    $('wt-watch-note').textContent = watchNote();
    if (watchTimer) void pollWatch();
  });

  /** قاعده‌های فعالِ ذخیره‌شده — همهٔ آن‌ها رصد می‌شوند، نه فقط آخری. */
  const activeRules = () => rules.filter((rule) => rule.enabled !== false);

  function watchNote() {
    const meta = livePriority($('wt-live-priority').value);
    return `رصد روی همهٔ ${fmt.int(built.length)} ترکیبِ دامنه اجرا می‌شود، نه فقط منطبق‌های پیش‌نمایش — ترکیبی که ده دقیقه بعد وارد شرط شود باید دیده شود. سقفِ مظنهٔ زنده ${fmt.int(LIVE_INS_CAP)} ابزار در هر تیک است و سهمیه به ترکیبِ کامل داده می‌شود، نه به پا. اولویت فعلی: ${meta.label} — ${meta.hint}`;
  }

  /**
   * روزِ سنجشِ ساخت، امروز است؟ رصدِ زنده روی بازهٔ گذشته اجرا نمی‌شود.
   *
   * قرارداد، پنجرهٔ سررسید و «روز مانده» همه از پایانِ بازهٔ انتخابی
   * ساخته می‌شوند؛ نشاندنِ مظنهٔ امروز رویشان یعنی سنجیدنِ قراردادی که
   * ممکن است ماه‌ها پیش منقضی شده باشد.
   */
  function watchDayGate() {
    const today = tehranDateNumber();
    if (!today) return { ok: false, today: 0, why: 'ساعت مرورگر خوانده نشد؛ نمی‌شود گفت ساخت مالِ امروز است یا نه.' };
    const marks = [...new Set(built.map(({ row }) => Number(row.markDate) || 0))].filter(Boolean);
    if (!marks.length) return { ok: false, today, why: 'هنوز ترکیبی ساخته نشده.' };
    const old = marks.filter((one) => one !== today);
    if (old.length) {
      return { ok: false, today, why: `روز سنجشِ این ساخت ${old.map((one) => faDigits(String(one))).join('، ')} است، نه امروز. قرارداد، پنجرهٔ سررسید و «روز مانده» بر مبنای همان روز ساخته شده‌اند؛ رصدِ زنده رویشان عددی می‌سازد که هیچ‌وقت وجود نداشته. بازه را تا امروز بیاور و دوباره بساز.` };
    }
    return { ok: true, today, why: '' };
  }

  function startWatch() {
    stopWatch();
    if (!built.length) { $('wt-watch-state').textContent = 'ترکیبی برای رصد نیست'; return; }
    const active = activeRules();
    if (!active.length) { $('wt-watch-state').textContent = 'قاعدهٔ فعالی نیست'; return; }
    const gate = watchDayGate();
    if (!gate.ok) {
      $('wt-watch-state').textContent = 'روی بازهٔ تاریخی روشن نمی‌شود';
      $('wt-watch-note').textContent = gate.why;
      return;
    }
    watchRules = active;
    dayRange.reset(gate.today);
    $('wt-watch-stop').hidden = false;
    $('wt-watch-state').textContent = `روشن — هر ۱۰ ثانیه · ${fmt.int(active.length)} قاعده`;
    $('wt-watch-note').textContent = watchNote();
    const tick = () => void pollWatch();
    tick();
    watchTimer = setInterval(tick, 10000);
  }

  function stopWatch() {
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = 0;
    // نسل عوض می‌شود و درخواستِ جاری لغو: پاسخی که بعد از این برسد نه
    // نوار را «روشن» می‌کند و نه جدول را زنده نشان می‌دهد.
    watchGen += 1; watchBusy = false;
    watchJob?.abort(); watchJob = null;
    watchRules = [];
    liveKeys.clear();
    dayRange.reset(0);
    restoreDaily();
    $('wt-watch-stop').hidden = true;
    $('wt-watch-state').textContent = 'خاموش';
    if (mounted && built.length) paintPool();
  }
  $('wt-watch-stop').addEventListener('click', stopWatch);

  /** عددِ روزِ سنجش را به ردیف‌ها برمی‌گرداند، تا جدولِ خاموش عددِ نیمه‌زنده نگه ندارد. */
  function restoreDaily() {
    for (const { row } of built) {
      if (!row.daily) continue;
      row.gap = row.daily.gap; row.metrics = row.daily.metrics; row.verdict = row.daily.verdict;
    }
  }

  /** جدولِ رصد: کلِ دامنه، با برچسبِ زنده/روزانهٔ **هر ردیف**. */
  function paintPool() {
    mountTable().set(built.map(({ row, ua }) => toTableRow(row, {
      baseName: nameOf(ua),
      // «همهٔ ردیف‌های جدول دیده‌بان برچسب زنده می‌گیرند» — پرچمِ زنده
      // برای کل جدول ثابت و روشن بود، حتی وقتی ۲۴۴ ترکیب در دامنه و ۲۲۸
      // ترکیب پوشش زنده داشت. حالا هر ردیف وضعیت خودش را می‌گوید.
      live: watchTimer ? liveKeys.has(row.key) : null,
    })));
  }

  /**
   * مظنهٔ زنده برای **کلِ دامنه**، و سنجشِ همهٔ قاعده‌های فعال روی همان.
   *
   * ═══ چرا کلِ دامنه و نه منطبق‌های پیش‌نمایش ═══
   *
   * «فقط ترکیب‌هایی رصد می‌شوند که در پیش‌نمایش اولیه منطبق بوده‌اند.
   * ترکیبی که هنگام ساخت زیر آستانه بوده و ده دقیقه بعد وارد محدودهٔ شرط
   * شود، اصلاً بررسی نمی‌شود. این دقیقاً خلاف هدف پیدا کردن فرصت تازه
   * است.»
   *
   * دقیقاً همین بود: استخرِ رصد وقتی پیش‌نمایش چیزی پیدا کرده بود به
   * همان فهرستِ منطبق‌ها قفل می‌شد و بقیهٔ دامنه اصلاً سنجیده نمی‌شد. حالا
   * استخر همیشه `built` است — همان دامنه‌ای که کاربر انتخاب کرده — و
   * پیش‌نمایش فقط «همین حالا چه چیزی منطبق است» را می‌گوید.
   *
   * سهمیهٔ ۲۴ ابزار همچنان واقعی است، پس ترتیبِ گرفتنش انتخابِ کاربر
   * است و ترکیبِ بیرون‌مانده با عددِ روزانه سنجیده نمی‌شود.
   */
  async function pollWatch() {
    if (!watchRules.length || !built.length) return;
    if (watchBusy) return;
    const gen = watchGen;
    const job = new AbortController();
    watchBusy = true; watchJob = job;
    try {
      const priority = livePriority($('wt-live-priority').value).id;
      const plan = planLiveQuotes({
        rows: built.map(({ row }) => row),
        cap: LIVE_INS_CAP, priority,
        score: priority === 'near' ? nearScore() : null,
      });
      if (!plan.ins.length) { $('wt-watch-state').textContent = 'ابزاری برای مظنهٔ زنده نبود'; return; }
      const response = await fetch(`/api/live-trades?ins=${plan.ins.join(',')}`, { signal: job.signal });
      const payload = await response.json();
      // رصد در این فاصله خاموش شده: پاسخ دور ریخته می‌شود. این همان
      // «توقفِ قابل اعتماد» است — پیش از این پاسخِ کندِ پانزده‌ثانیه‌ای
      // نوار را دوباره «روشن» می‌کرد.
      if (gen !== watchGen || !mounted) return;
      if (!response.ok || payload.error) throw new Error(payload.error || 'مظنهٔ زنده دریافت نشد');
      const book = liveQuoteBook(payload);
      const nowSec = tehranSecondOfDay();
      const today = tehranDateNumber();
      const snapshots = [];
      let covered = 0, stale = 0;
      liveKeys.clear();
      for (const { row, ua } of built) {
        const quote = comboLiveQuote({ legs: row.legs, book, nowSec });
        if (!quote.ok) {
          if (quote.priced === quote.legs && quote.legs > 0) stale += 1;
          continue;
        }
        const gap = measureGap({ legs: row.legs, prices: book.prices, strategyId: row.def.id,
          entry: row.entry, daysLeft: row.gap.daysLeft, scale: 'raw', units: units() });
        if (!gap.ok) continue;
        // اسپاتِ زنده اگر پایه امروز معامله شده باشد. پایه در سهمیه نیست
        // مگر خودش پای ترکیبی باشد، پس نبودش عادی است و عددِ روز سنجش
        // جایش می‌ماند — نه عددِ ساختگی.
        const spot = num(book.prices[String(ua.ins)], row.spot);
        // سود، زیان، بازده، سرمایه و وجه تضمین هم با قیمتِ زنده از نو
        // ساخته می‌شوند؛ پیش از این فقط فاصله زنده می‌شد و شرطِ «حداکثر
        // سود ٪» روی عددِ روز سنجش آتش می‌کرد.
        const metrics = comboMetrics({ legs: row.legs, prices: book.prices, spot, rowByIns: {},
          settings: state.settings, daysLeft: row.gap.daysLeft, scale: 'raw', units: units() });
        row.gap = gap;
        row.verdict = gapVerdict(row.series, gap);
        row.metrics = metrics.ok
          ? { ...metrics,
            legValue: row.daily?.metrics?.legValue ?? metrics.legValue,
            legVolume: row.daily?.metrics?.legVolume ?? metrics.legVolume,
            legTrades: row.daily?.metrics?.legTrades ?? metrics.legTrades,
            thinLegs: row.daily?.metrics?.thinLegs ?? metrics.thinLegs }
          : row.daily?.metrics || row.metrics;
        dayRange.observe(row.key, gap.current, { date: today });
        liveKeys.add(row.key);
        snapshots.push(watchSnapshot(row, {
          baseIns: String(ua.ins), baseName: nameOf(ua),
          basePrice: num(book.prices[String(ua.ins)], NaN),
          day: dayRange.get(row.key),
        }));
        covered += 1;
      }
      const verdict = evaluateWatch({ rules: watchRules, snapshots, prev: prevSnaps, nowMs: Date.now() });
      prevSnaps = verdict.prev;
      if (verdict.fired.length) {
        watchRules = verdict.rules;
        const byId = new Map(watchRules.map((one) => [one.id, one]));
        rules = rules.map((one) => byId.get(one.id) || one);
        saveRules(rules);
        deliverBurst(verdict.fired, { host: $('wt-alarm-host'), scope: 'watch', kind: 'watch' });
        paintRules();
        paintLog();
      }
      const hits = watchRules.reduce((sum, one) => sum + (verdict.matched.get(one.id) || []).length, 0);
      $('wt-watch-state').textContent = `روشن · ${fmt.int(watchRules.length)} قاعده · ${fmt.int(covered)} ترکیب با مظنهٔ هم‌زمان · ${fmt.int(hits)} منطبق · ${faDigits(new Date(payload.at).toLocaleTimeString('fa-IR'))}`;
      $('wt-watch-note').textContent = `${watchNote()} در این تیک ${fmt.int(plan.covered)} ترکیب از ${fmt.int(built.length)} ترکیبِ دامنه سهمیه گرفت؛ ${fmt.int(covered)} ترکیب مظنهٔ هم‌زمان داشت و ${fmt.int(stale)} ترکیب کنار گذاشته شد چون پاهایش در یک لحظه معامله نشده بودند یا آخرین معامله‌شان کهنه بود. ترکیبِ بیرون‌مانده با عددِ روز سنجش سنجیده نمی‌شود.`;
      paintPool();
    } catch (error) {
      if (gen !== watchGen || !mounted || error?.name === 'AbortError') return;
      $('wt-watch-state').textContent = `دریافت زنده نشد: ${error.message}`;
    } finally {
      watchBusy = false;
      if (watchJob === job) watchJob = null;
    }
  }

  /** امتیازِ «نزدیک‌ترین به شرط» برای سهمیهٔ زنده — بدترین شرطِ هر قاعده ملاک است. */
  function nearScore() {
    const active = watchRules.length ? watchRules : activeRules();
    if (!active.length) return null;
    const byKey = new Map(built.map(({ row, ua }) => [row.key, { row, ua }]));
    return (row) => {
      const found = byKey.get(row.key);
      if (!found) return NaN;
      const snapshot = watchSnapshot(found.row, {
        baseIns: String(found.ua.ins), baseName: nameOf(found.ua), basePrice: found.row.spot,
        day: dayRange.get(row.key),
      });
      let best = NaN;
      for (const rule of active) {
        const distance = watchDistance(rule, snapshot);
        if (Number.isFinite(distance) && (!Number.isFinite(best) || distance < best)) best = distance;
      }
      return Number.isFinite(best) ? -best : NaN;
    };
  }

  // ————————————————————————— قاعده‌ها و دفترچه —————————————————————————

  function paintRules() {
    $('wt-rule-count').textContent = `${fmt.int(rules.length)} قاعده`;
    if (!rules.length) {
      $('wt-rules').innerHTML = '<p class="empty-note">هنوز قاعده‌ای ذخیره نشده.</p>';
      return;
    }
    $('wt-rules').innerHTML = rules.map((rule) => `<article class="gap-rule${rule.enabled ? '' : ' off'}" data-rule="${esc(rule.id)}">
      <header><b>${esc(rule.name || watchRuleNote(rule))}</b><span>${esc(watchRuleNote(rule))}</span></header>
      <footer>
        <small>${rule.firedCount ? `${fmt.int(rule.firedCount)} بار زده` : 'هنوز نزده'} · آرامش ${fmt.int(rule.cooldownSec)} ثانیه${rule.sound ? ' · با صدا' : ''}</small>
        <button type="button" class="ghost" data-act="load">بارگذاری در فرم</button>
        <button type="button" class="ghost danger" data-act="drop">حذف</button>
      </footer></article>`).join('');
    for (const card of $('wt-rules').querySelectorAll('.gap-rule')) {
      card.querySelector('[data-act="drop"]').addEventListener('click', () => {
        rules = rules.filter((rule) => rule.id !== card.dataset.rule);
        saveRules(rules); paintRules();
        // «حذف قاعدهٔ فعال، رصد آن را متوقف نمی‌کند»: فهرست خالی می‌شد و
        // نوار همچنان «روشن» بود و دریافت زنده ادامه داشت. حالا حذف،
        // مجموعهٔ رصد را از نو می‌سازد و با خالی شدنش رصد می‌ایستد.
        if (!watchTimer) return;
        if (activeRules().length) startWatch();
        else { stopWatch(); setStatus('آخرین قاعدهٔ فعال حذف شد؛ رصد ایستاد.'); }
      });
      card.querySelector('[data-act="load"]').addEventListener('click', () => {
        const rule = rules.find((one) => one.id === card.dataset.rule);
        if (!rule) return;
        conditions = [...rule.conditions];
        $('wt-name').value = rule.name || '';
        $('wt-cooldown').value = String(rule.cooldownSec);
        $('wt-sound').checked = !!rule.sound;
        for (const box of root.querySelectorAll('[data-def]')) box.checked = rule.strategyIds.includes(box.dataset.def);
        for (const box of root.querySelectorAll('[data-base]')) box.checked = rule.baseIns.includes(box.dataset.base);
        paintConds();
        setStatus('قاعده در فرم بارگذاری شد؛ «ساخت و تطبیق» را بزن تا ببینی همین حالا روی چه چیزی می‌نشیند.');
      });
    }
  }

  function paintLog() {
    const log = readLog('watch');
    if (!log.length) { $('wt-log').innerHTML = '<p class="empty-note">دفترچه خالی است.</p>'; return; }
    $('wt-log').innerHTML = log.slice(0, 60).map((row) => `<div class="gap-log-row">
      <time>${faDigits(row.clock)}</time><b>${esc(row.title)}</b><small>${esc(row.note)}</small>
    </div>`).join('');
  }

  function paintNotifyState() { $('wt-notify-state').textContent = NOTIFY_LABEL[notifyState()] || '—'; }
  $('wt-notify-ask').addEventListener('click', async () => { await askNotifyPermission(); paintNotifyState(); });
  $('wt-notify-test').addEventListener('click', () => { testDelivery({ host: $('wt-alarm-host'), sound: $('wt-sound').checked, scope: 'watch' }); paintLog(); });
  $('wt-log-clear').addEventListener('click', () => { clearLog('watch'); paintLog(); });

  // ————————————————————————— راه‌اندازی —————————————————————————

  paintNotifyState();
  paintCondHint();
  paintConds();
  paintRules();
  paintLog();
  rangeUi = mountHistoryRange($('wt-range'), { quickEntry: true, compactNote: true,
    onApply: (range) => { stalePreview('بازه عوض شد'); return loadUniverseForRange(range); } });
  await loadUniverseForRange(rangeUi.range);

  return () => {
    mounted = false;
    cancelLoad();
    stopWatch();
    rangeJob?.stop();
  };
}
