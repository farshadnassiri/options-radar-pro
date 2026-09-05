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
import { buildRadarHistory, radarDataReport } from '/core/radar-history.mjs';
import {
  ALERT_OPS, DEFAULT_COOLDOWN_SEC, DEFAULT_WINDOW_DAYS, WATCH_METRICS, WATCH_METRIC_GROUPS,
  WATCH_REFS, conditionNote, evaluateWatch, normalizeCondition, normalizeWatchRule, watchMetric,
  watchRef, watchRuleNote, watchSnapshot,
} from '/core/watch-rule.mjs';
import { makeTable } from '/ui/table.mjs';
import { RADAR_ALL_COLS, RADAR_COLS, toTableRow } from '/ui/radar-columns.mjs';
import {
  NOTIFY_LABEL, askNotifyPermission, clearLog, deliverWatch, notifyState, readLog, testDelivery,
} from '/ui/gap-alarm.mjs';
import { logError } from '/ui/errlog.mjs';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const finite = (value) => Number.isFinite(value);
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
      <button type="button" class="primary" id="wt-save" disabled>ذخیرهٔ قاعده و شروع رصد</button>
      <button type="button" class="ghost" id="wt-watch-stop" hidden>توقف رصد</button>
      <span id="wt-watch-state" class="gap-live-state">خاموش</span>
    </div>
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
  let watchTimer = 0, watchRule = null, prevSnaps = {};
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
    $('wt-save').disabled = !(conditions.length && matched.length);
  }
  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-base],[data-def]')) paintCounts();
  });
  for (const button of root.querySelectorAll('[data-all],[data-none]')) {
    button.addEventListener('click', () => {
      const which = button.dataset.all || button.dataset.none;
      const on = !!button.dataset.all;
      const selector = which === 'bases' ? '[data-base]' : '[data-def]';
      for (const box of root.querySelectorAll(selector)) box.checked = on;
      paintCounts();
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
        if (!result.rows.length) { skipped.push(`${nameOf(ua)}: ترکیبی ساخته نشد`); continue; }
        for (const row of result.rows) built.push({ row, ua });
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

  /** شرط‌ها روی هرچه ساخته شده. `matched` است نه `fired` — هنوز زنگی نیست. */
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
    const verdict = evaluateWatch({ rules: [rule.rule], snapshots, prev: {}, nowMs: 0 });
    const hits = verdict.matched.get(rule.rule.id) || [];
    matched = hits.map((hit) => byKey.get(hit.snapshot.key)).filter(Boolean);
    paintMatch(skipped);
  }

  function mountTable() {
    if (table) return table;
    table = makeTable($('wt-table'), RADAR_COLS, {
      all: RADAR_ALL_COLS, storeKey: 'watchtower-cols', sortKey: 'returnPct',
      exportName: 'watchtower', rowHeight: 52,
    });
    return table;
  }

  function paintMatch(skipped = []) {
    mountTable().set(matched.map(({ row, ua }) => toTableRow(row, { baseName: nameOf(ua) })));
    mountTable().setEmptyMessage('هیچ ترکیبی همهٔ شرط‌ها را با هم ندارد. شرط‌ها با «و» جمع می‌شوند؛ یکی را شل کن.');
    const note = `${fmt.int(built.length)} ترکیب ساخته شد · ${fmt.int(matched.length)} ترکیب همهٔ شرط‌ها را با هم دارد.`;
    const why = skipped.length ? ` نمادهایی که ردیفی ندادند: ${skipped.join('؛ ')}.` : '';
    $('wt-match-note').textContent = `${note}${why} این فهرست، همان چیزی است که رصد رویش زنگ می‌زند.`;
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
    rules = [...rules, rule.rule];
    saveRules(rules);
    watchRule = rule.rule;
    paintRules();
    startWatch();
  });

  function startWatch() {
    stopWatch();
    if (!watchRule || !built.length) return;
    $('wt-watch-stop').hidden = false;
    $('wt-watch-state').textContent = 'روشن — هر ۱۰ ثانیه';
    const tick = () => void pollWatch();
    tick();
    watchTimer = setInterval(tick, 10000);
  }
  function stopWatch() {
    if (watchTimer) clearInterval(watchTimer);
    watchTimer = 0;
    $('wt-watch-stop').hidden = true;
    $('wt-watch-state').textContent = 'خاموش';
  }
  $('wt-watch-stop').addEventListener('click', stopWatch);

  /**
   * مظنهٔ زنده برای پاهای ترکیب‌های منطبق، و سنجشِ قاعده روی همان.
   *
   * سقفِ ۲۴ ابزار همان سقفِ `/api/live-trades` است. ترکیب‌هایی که پایشان
   * جا نشد، با عددِ روزانه سنجیده **نمی‌شوند** — بی‌صدا افتادنشان یعنی
   * قاعده‌ای که کاربر فکر می‌کند روی صد ترکیب کار می‌کند، روی دوازده‌تا
   * کار کند. شمارِ پوشش‌داده‌شده نوشته می‌شود.
   */
  async function pollWatch() {
    if (!watchRule) return;
    const pool = matched.length ? matched : built;
    if (!pool.length) return;
    const legIds = [];
    for (const { row } of pool) {
      for (const leg of row.legs) {
        if (leg.kind === 'underlying') continue;
        if (!legIds.includes(String(leg.ins))) legIds.push(String(leg.ins));
      }
      if (legIds.length >= 24) break;
    }
    const wanted = legIds.slice(0, 24);
    try {
      const response = await fetch(`/api/live-trades?ins=${wanted.join(',')}`);
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'مظنهٔ زنده دریافت نشد');
      const prices = {};
      for (const [ins, item] of Object.entries(payload.items || {})) {
        const price = Number(item?.summary?.lastPrice);
        if (price > 0) prices[ins] = price;
      }
      const snapshots = [];
      let covered = 0;
      for (const { row, ua } of pool) {
        const legs = row.legs.filter((leg) => leg.kind !== 'underlying');
        if (!legs.every((leg) => finite(prices[String(leg.ins)]))) continue;
        const gap = measureGap({ legs: row.legs, prices, strategyId: row.def.id,
          entry: row.entry, daysLeft: row.gap.daysLeft, scale: 'raw', units: units() });
        if (!gap.ok) continue;
        row.gap = gap;
        row.verdict = gapVerdict(row.series, gap);
        snapshots.push(watchSnapshot(row, { baseIns: String(ua.ins), baseName: nameOf(ua), basePrice: row.spot }));
        covered += 1;
      }
      const verdict = evaluateWatch({ rules: [watchRule], snapshots, prev: prevSnaps, nowMs: Date.now() });
      prevSnaps = verdict.prev;
      if (verdict.fired.length) {
        watchRule = verdict.rules[0];
        rules = rules.map((one) => (one.id === watchRule.id ? watchRule : one));
        saveRules(rules);
        const host = $('wt-alarm-host');
        for (const fired of verdict.fired) deliverWatch(fired, { host, sound: watchRule.sound });
        paintRules();
        paintLog();
      }
      const hits = (verdict.matched.get(watchRule.id) || []).length;
      $('wt-watch-state').textContent = `روشن · ${fmt.int(covered)} ترکیب با قیمت زنده · ${fmt.int(hits)} منطبق · ${faDigits(new Date(payload.at).toLocaleTimeString('fa-IR'))}`;
      mountTable().set(pool.map(({ row, ua }) => toTableRow(row, { baseName: nameOf(ua), live: true })));
    } catch (error) {
      $('wt-watch-state').textContent = `دریافت زنده نشد: ${error.message}`;
    }
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
    const log = readLog();
    if (!log.length) { $('wt-log').innerHTML = '<p class="empty-note">دفترچه خالی است.</p>'; return; }
    $('wt-log').innerHTML = log.slice(0, 60).map((row) => `<div class="gap-log-row">
      <time>${faDigits(row.clock)}</time><b>${esc(row.title)}</b><small>${esc(row.note)}</small>
    </div>`).join('');
  }

  function paintNotifyState() { $('wt-notify-state').textContent = NOTIFY_LABEL[notifyState()] || '—'; }
  $('wt-notify-ask').addEventListener('click', async () => { await askNotifyPermission(); paintNotifyState(); });
  $('wt-notify-test').addEventListener('click', () => { testDelivery({ host: $('wt-alarm-host'), sound: $('wt-sound').checked }); paintLog(); });
  $('wt-log-clear').addEventListener('click', () => { clearLog(); paintLog(); });

  // ————————————————————————— راه‌اندازی —————————————————————————

  paintNotifyState();
  paintCondHint();
  paintConds();
  paintRules();
  paintLog();
  rangeUi = mountHistoryRange($('wt-range'), { quickEntry: true, compactNote: true,
    onApply: (range) => loadUniverseForRange(range) });
  await loadUniverseForRange(rangeUi.range);

  return () => {
    mounted = false;
    cancelLoad();
    stopWatch();
    rangeJob?.stop();
  };
}
