// رصد یونانی و تلاطم — عمر یک موقعیت، فقط با حساسیت‌هایش.
//
// بقیهٔ تب‌ها از یک موقعیت می‌پرسند «چقدر سود داد؟». این تب می‌پرسد «در چه
// وضعیتی بود؟» — و جواب، پنج یونانی و دو تلاطم است، از روز ایجاد تا روز
// بسته‌شدن. سود و زیان اینجا فقط یک خط مرجع است تا معلوم باشد هر تغییرِ
// حساسیت کِی اتفاق افتاده، نه موضوع صفحه.
//
// چرا تب مستقل و نه یک پنل در آزمایشگاه: آزمایشگاه دربارهٔ **یک آزمون**
// است — یک ورود، یک خروج، و همه‌چیزِ آن مسیر. این تب دربارهٔ **یک موقعیت
// در طول عمرش** است و باید بتواند در هر تایم‌فریمی همان چند عدد را دنبال
// کند، بی‌آنکه کاربر از میان پانزده پنل دیگر ردش کند.
//
// همهٔ اعداد از `core/monitor.mjs` می‌آیند و هیچ محاسبه‌ای اینجا نیست. اگر
// عددی از این تب با همان عدد در آزمایشگاه یا تحلیل تاریخی فرق کند، یعنی
// جایی موتور دور زده شده است.

import { CATALOG, byId } from '/strategies/catalog.mjs';
import { buildChain } from '/core/chain.mjs';
import { feesOf } from '/core/settings.mjs';
import {
  comboKey, flattenActiveContracts, generateHistoricalCombos, historyDateLabel,
  normalizeHistoryDate, replayHistory,
} from '/core/history.mjs';
import { replayIntraday, bucketIntradayPath } from '/core/backtest.mjs';
import { ivParams, IV_PARAMS } from '/core/leg-iv.mjs';
import { histVolPct, histVolSeries, resolveHistVol } from '/core/hist-vol.mjs';
import {
  GREEKS, annotateTrack, monitorSeries, monitorGreekSummary, monitorLegGreekSummary,
  monitorVolSummary, monitorCoverage, monitorExtremes, monitorStance,
} from '/core/monitor.mjs';
import { SCOPE_LIVE, scopeOptionsMarkup, applyLiveScope } from '/ui/live-scope.mjs';
import { mountDateWheel } from '/ui/datewheel.mjs';
import { mountSubtabs } from '/ui/subtabs.mjs';
import { chart, LEG_COLORS } from '/ui/track-chart.mjs';
import { fmt, faDigits, signTone } from '/ui/fmt.mjs';
import { attachExportsIn } from '/ui/export.mjs';
import { takeHandoff } from '/ui/handoff.mjs';
import { logError } from '/ui/errlog.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const nameOf = (entity, fallback = 'بدون نام') => {
  const value = String(entity?.name || '').trim();
  return value && value !== String(entity?.ins || '') ? value : fallback;
};
const dateLabel = (value) => faDigits(historyDateLabel(value));
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, (index + 1) * size));
const errorText = (error, fallback) => /fetch failed|network|failed to fetch/i.test(String(error?.message || error))
  ? 'اتصال به منبع داده برقرار نشد.' : (String(error?.message || '').trim() || fallback);

const fin = (value) => Number.isFinite(Number(value));
// یونانی‌ها دو مرتبهٔ بزرگی فاصله دارند: گامای یک قرارداد ۱۰ به توان منفی
// هفت است و وگا و تتا ریالی. `fmt.small` همین را حل می‌کند — رقم اعشار را
// از بزرگی خود عدد می‌گیرد و نماد نمایی هم نمی‌نویسد، که وسط ستون فارسی
// یک واژهٔ لاتین می‌شد.
const small = (value) => (fin(value) ? fmt.small(Number(value)) : '—');
const money = (value) => (fin(value) ? fmt.money(value) : '—');
const pctCell = (value) => (fin(value) ? `${fmt.pct(value)}٪` : '—');
const int = (value) => (fin(value) ? fmt.int(value) : '—');

const td = (html, tone = '') => `<td${tone ? ` class="${tone}"` : ''}>${html}</td>`;
const table = (headers, rows, empty = 'داده‌ای نیست.') => (rows.length
  ? `<table class="history-table"><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((cells) => `<tr>${cells.join('')}</tr>`).join('')}</tbody></table>`
  : `<p class="empty-note">${esc(empty)}</p>`);
const kpis = (items) => items.map(([label, value, tone = '']) => `<div class="kpi"><span>${esc(label)}</span><strong class="${tone}">${value}</strong></div>`).join('');
const headBlock = (eyebrow, title, note = '') => `<div class="section-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2></div>${note ? `<span>${esc(note)}</span>` : ''}</div>`;
const sub = (title, note = '') => `<div class="section-head"><h3>${esc(title)}</h3>${note ? `<span>${esc(note)}</span>` : ''}</div>`;
const chartBox = (id, title, note) => `<section>${sub(title, note)}<div id="${id}" class="backtest-chart"></div></section>`;

/**
 * تایم‌فریم‌های رصد.
 *
 * `daily` همیشه هست چون از سری روزانه می‌آید. دو تای دیگر ریزمعامله
 * می‌خواهند و تا وقتی گرفته نشده، دکمه‌شان غیرفعال می‌ماند — نه اینکه
 * فعال باشد و خالی نشان بدهد.
 */
const FRAMES = [
  ['daily', 'روزانه'],
  ['bucket', 'سطل تایم‌فریم'],
  ['intraday', 'درون‌روز — هر معامله'],
];

/** پهنای سطل، بر حسب ثانیه. یک دقیقه کف است چون خودِ موتور کف را همان گذاشته. */
const BUCKETS = [
  [60, 'یک دقیقه'], [300, 'پنج دقیقه'], [900, 'پانزده دقیقه'],
  [1800, 'نیم‌ساعت'], [3600, 'یک ساعت'],
];

/** برای جدول‌های بلند، نقطه‌ها با فاصلهٔ یکنواخت نازک می‌شوند. */
function thin(list, cap = 400) {
  if (list.length <= cap) return list;
  const stride = list.length / cap;
  return Array.from({ length: cap }, (_, index) => list[Math.min(list.length - 1, Math.floor(index * stride))]);
}

const rail = (id, options, selected) => `<div class="backtest-basis" id="${id}" data-rail role="radiogroup">${options
  .map(([value, label]) => `<button type="button" data-value="${value}" role="radio" aria-checked="${value === selected}">${esc(label)}</button>`).join('')}</div>`;

function setRail(host, value) {
  if (!host) return;
  host.dataset.value = value;
  for (const button of host.querySelectorAll('[data-value]')) {
    button.setAttribute('aria-checked', String(button.dataset.value === value));
  }
}

const PANELS = [
  { id: 'gw-pulse', label: 'نبض موقعیت', hint: 'همین حالا کجاست: پنج یونانی، دو تلاطم، و ترجمهٔ فارسی‌شان' },
  { id: 'gw-greeks', label: 'مسیر یونانی‌ها', hint: 'هر یونانی در طول عمر، برای کل موقعیت و هر پا' },
  { id: 'gw-vol', label: 'مسیر تلاطم', hint: 'تلاطم ضمنی هر پا، میانگین موقعیت، و تلاطم تاریخی پایه' },
  { id: 'gw-track', label: 'جدول رصد', hint: 'نقطه‌به‌نقطه، با همهٔ ستون‌ها و خروجی اکسل' },
  { id: 'gw-extremes', label: 'نقاط عطف', hint: 'هر حساسیت کِی به انتهای دامنه‌اش رسید' },
];

export async function mount(root, { state }) {
  let chain = new Map();
  let ua = null;
  let contracts = [];
  let seriesByIns = {};
  let entryDates = [];
  let combos = [];
  let legs = null;
  let replay = null;
  let intradayDays = [];              // [{ date, points }] — ریزمعاملهٔ روزهای گرفته‌شده
  let hv = null;                      // نتیجهٔ `resolveHistVol` روی سری پایه
  let frame = 'daily';
  let bucketSeconds = 900;
  let entryWheel = null;
  let subtabs = null;
  let pendingPlan = null;
  const ivOverride = {};

  const $ = (id) => root.querySelector(`#${id}`);
  const ivP = () => ivParams(state.settings, ivOverride);

  root.innerHTML = `
  <section class="backtest-hero"><div><p class="eyebrow">حساسیت، نه سود</p><h1>رصد یونانی و تلاطم</h1><p>یک موقعیت را از روز ایجاد تا روز بسته‌شدن، فقط با پنج یونانی و دو تلاطم دنبال کن — برای هر پا جدا و برای کل موقعیت.</p></div><span>هر عدد از قیمت مشاهده‌شده</span></section>

  <section class="card backtest-setup"><div class="section-head"><div><p class="eyebrow">گام اول</p><h2>موقعیتی که می‌خواهی رصد کنی</h2></div><b id="gw-status" role="status" aria-live="polite">در حال دریافت نمادها…</b></div>
    <div class="backtest-form">
      <label>نماد پایه<select id="gw-base"><option value="">در حال دریافت…</option></select></label>
      <label>استراتژی<select id="gw-strategy"></select></label>
      <label>تعداد واحد<input id="gw-units" type="number" min="1" max="10000" step="1" value="${Math.max(1, state.settings.qtyDefault || 1)}"></label>
      <label>دامنهٔ داده<select id="gw-scope">${scopeOptionsMarkup()}</select></label>
      <button type="button" class="primary" id="gw-load">دریافت تاریخچه</button>
    </div>
    <p class="backtest-table-note" id="gw-scope-note" hidden></p>
  </section>

  <section id="gw-work" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">گام دوم</p><h2>روز ایجاد و ترکیب</h2></div><span id="gw-combo-count">—</span></div>
      <div class="backtest-date-grid">
        <section><h3>روز ایجاد</h3><div id="gw-entry-date"></div></section>
        <section><h3>ترکیب</h3><select id="gw-combo"></select><p class="backtest-table-note" id="gw-combo-note"></p></section>
      </div>
      <div class="backtest-form">
        <button type="button" class="primary" id="gw-run">رصد کن</button>
        <label>ریزمعاملهٔ چند روز آخر<input id="gw-days" type="number" min="1" max="20" step="1" value="1"></label>
        <button type="button" class="ghost" id="gw-fetch-intraday" disabled>دریافت ریزمعامله</button>
      </div>
      <p class="backtest-table-note" id="gw-intraday-note">تایم‌فریم درون‌روز و سطل، ریزمعاملهٔ همان روزها را می‌خواهند. تا گرفته نشده، فقط تایم‌فریم روزانه در دسترس است.</p>
    </section>

    <section class="card" id="gw-params-card"><div class="section-head"><div><p class="eyebrow">پارامترها</p><h2>مبنای محاسبهٔ یونانی و تلاطم</h2></div><span>قابل تنظیم</span></div>
      <p class="backtest-table-note">همهٔ این‌ها از تب <b>تنظیمات</b> بخش «یونانی‌ها، تلاطم و احتمال» می‌آیند و همان‌جا برای کل برنامه تنظیم می‌شوند. تغییرشان اینجا فقط روی همین تب می‌نشیند و با بستن تب می‌رود — تا کسی که می‌خواهد اثر نرخ بدون ریسک را روی همین یک رصد ببیند، مجبور نشود تنظیمات سراسری را عوض کند و بعد یادش برود برگرداند.</p>
      <div class="backtest-form" id="gw-params"></div>
    </section>

    <nav id="gw-subtabs"></nav>

    <div class="bt-panel" data-panel="gw-pulse">
      <section class="card">${headBlock('آخرین نقطهٔ مسیر', 'نبض موقعیت', 'مدل بلک‌شولز روی قیمت مشاهده‌شده')}
        <div class="backtest-kpis" id="gw-pulse-kpis"></div>
        <p class="backtest-table-note" id="gw-pulse-stance"></p>
        <section class="backtest-tape">${sub('پوشش رصد', 'از چند نقطهٔ مسیر، یونانیِ کامل درآمد')}<div id="gw-pulse-coverage" class="history-table-wrap"></div></section>
        <section class="backtest-tape">${sub('سهم هر پا از یونانی موقعیت', 'وزن علامت‌دار × یونانی خود پا؛ جمع این ستون‌ها همان سطر جمع است')}<div id="gw-pulse-legs" class="history-table-wrap"></div></section>
      </section>
    </div>

    <div class="bt-panel" data-panel="gw-greeks" hidden>
      <section class="card">${headBlock('پنج حساسیت، در طول عمر', 'مسیر یونانی‌ها', 'کل موقعیت و هر پا، روی یک محور زمان')}
        <div class="backtest-frame-bar">${rail('gw-gk-frame', FRAMES, 'daily')}<label>پهنای سطل<select id="gw-bucket">${BUCKETS.map(([value, label]) => `<option value="${value}"${value === 900 ? ' selected' : ''}>${label}</option>`).join('')}</select></label><span id="gw-gk-count">—</span></div>
        <p class="backtest-table-note">خط پررنگ، یونانی کل موقعیت است — وزن‌دار و علامت‌دار. خط هر پا، یونانی وزن‌نخوردهٔ خودِ آن قرارداد است. پایی که تلاطم ضمنی ندارد یونانی هم ندارد و آن نقطه خالی می‌ماند؛ جمع همان نقطه «ناقص» علامت می‌خورد.</p>
        <div class="backtest-chart-grid" id="gw-gk-charts"></div>
        <section class="backtest-tape">${sub('خلاصهٔ یونانی موقعیت', 'کجا شروع شد، تا کجا رفت')}<div id="gw-gk-summary" class="history-table-wrap"></div></section>
        <section class="backtest-tape">${sub('خلاصهٔ یونانی هر پا')}<div id="gw-gk-legs" class="history-table-wrap"></div></section>
      </section>
    </div>

    <div class="bt-panel" data-panel="gw-vol" hidden>
      <section class="card">${headBlock('انتظار بازار در برابر گذشته', 'مسیر تلاطم', 'ضمنی از قیمت پا، تاریخی از سری پایه')}
        <div class="backtest-frame-bar">${rail('gw-vol-frame', FRAMES, 'daily')}<span id="gw-vol-count">—</span></div>
        <p class="backtest-table-note" id="gw-hv-note"></p>
        <div class="backtest-chart-grid">${chartBox('gw-vol-chart', 'تلاطم ضمنی هر پا و تلاطم تاریخی پایه', 'درصد سالانه')}${chartBox('gw-vol-spread-chart', 'ضمنی منهای تاریخی', 'واحد درصد · مثبت یعنی بازار گران‌تر از گذشته قیمت می‌دهد')}</div>
        <section class="backtest-tape">${sub('خلاصهٔ تلاطم', 'هر پا، میانگین موقعیت، تاریخی، و فاصلهٔ این دو')}<div id="gw-vol-summary" class="history-table-wrap"></div></section>
      </section>
    </div>

    <div class="bt-panel" data-panel="gw-track" hidden>
      <section class="card">${headBlock('نقطه‌به‌نقطه', 'جدول رصد', 'همان اعدادی که نمودارها را ساخته‌اند')}
        <div class="backtest-frame-bar">${rail('gw-track-frame', FRAMES, 'daily')}<span id="gw-track-count">—</span></div>
        <div id="gw-track-table" class="history-table-wrap" data-export="جدول-رصد-یونانی"></div>
      </section>
    </div>

    <div class="bt-panel" data-panel="gw-extremes" hidden>
      <section class="card">${headBlock('کِی، نه چقدر', 'نقاط عطف حساسیت', 'هر حساسیت کجا به انتهای دامنه‌اش رسید')}
        <div class="backtest-frame-bar">${rail('gw-ex-frame', FRAMES, 'daily')}<span id="gw-ex-count">—</span></div>
        <p class="backtest-table-note">این جدول به «چقدر» جواب نمی‌دهد، به «کِی» جواب می‌دهد: بیشترین ریسک جهت، بیشترین گرفتاری تلاطم، و تندترین زوال زمانی، هر کدام روی کدام روز افتاده‌اند.</p>
        <div id="gw-extremes-table" class="history-table-wrap" data-export="نقاط-عطف-حساسیت"></div>
      </section>
    </div>
  </section>`;

  const setStatus = (text, isError = false) => {
    const host = $('gw-status');
    host.textContent = text;
    host.toggleAttribute('data-error', isError);
  };

  $('gw-strategy').innerHTML = CATALOG
    .map((def) => `<option value="${def.id}">${esc(def.name)}</option>`).join('');

  // ——————————————————————— پارامترها ———————————————————————

  function paintParams() {
    const p = ivP();
    $('gw-params').innerHTML = IV_PARAMS.map((item) => `<label>${esc(item.label)}
      <input type="number" data-iv-param="${item.key}" min="${item.min}" max="${item.max}" step="${item.step}"
             value="${fin(p[item.key]) ? p[item.key] : ''}"></label>`).join('')
      + '<button type="button" class="ghost" id="gw-params-reset">بازگشت به تنظیمات سراسری</button>';
  }

  root.addEventListener('input', (event) => {
    const field = event.target.closest('[data-iv-param]');
    if (!field) return;
    const raw = field.value.trim();
    if (raw === '' || !Number.isFinite(Number(raw))) delete ivOverride[field.dataset.ivParam];
    else ivOverride[field.dataset.ivParam] = Number(raw);
    repaint();
  });

  root.addEventListener('click', (event) => {
    if (event.target.id !== 'gw-params-reset') return;
    for (const key of Object.keys(ivOverride)) delete ivOverride[key];
    paintParams();
    repaint();
  });

  // ——————————————————————— دریافت داده ———————————————————————

  async function loadUniverse() {
    try {
      const response = await fetch('/api/history/universe');
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'فهرست دریافت نشد');
      chain = buildChain(payload.rows || []);
      $('gw-base').innerHTML = '<option value="">نماد پایه را انتخاب کن</option>'
        + [...chain.values()].sort((a, b) => a.name.localeCompare(b.name, 'fa'))
          .map((item) => `<option value="${esc(item.ins)}">${esc(nameOf(item, 'دارایی پایه'))} — ${fmt.int(item.contracts)} قرارداد</option>`).join('');
      setStatus(`${fmt.int(chain.size)} نماد پایه آماده است.`);
      if (pendingPlan) applyPlan(pendingPlan);
    } catch (error) {
      setStatus(errorText(error, 'فهرست قراردادهای فعال دریافت نشد.'), true);
    }
  }

  /**
   * دامنهٔ داده را روی سری‌ها می‌نشاند.
   *
   * همان مسیر مشترکی که تحلیل تاریخی و آزمون همه استراتژی‌ها دارند. اگر
   * روز جاری نچسبد، همان روزهای بسته‌شده مبنا می‌مانند و جمله‌اش گفته
   * می‌شود — نه اینکه عکس تابلو بی‌صدا به امروز نسبت داده شود.
   */
  async function applyScope() {
    const note = $('gw-scope-note');
    if ($('gw-scope').value !== SCOPE_LIVE) {
      note.hidden = true; note.textContent = ''; note.removeAttribute('data-error');
      return;
    }
    const result = await applyLiveScope(seriesByIns);
    seriesByIns = result.series;
    note.hidden = false;
    note.textContent = result.note;
    note.toggleAttribute('data-error', !result.ok);
  }

  /** تلاطم تاریخی پایه، با همان قاعدهٔ برگشت به اعلام کاربر. */
  function computeHistVol() {
    const params = ivP();
    const closes = (seriesByIns[String(ua?.ins)] || []).map((row) => Number(row.close)).filter((value) => value > 0);
    hv = resolveHistVol(closes, {
      tradingDaysYear: params.tradingDaysYear,
      window: params.hvWindow,
      manualPct: params.hvManualPct,
    });
    return hv;
  }

  async function loadHistory() {
    ua = chain.get($('gw-base').value);
    if (!ua) { setStatus('اول نماد پایه را انتخاب کن.', true); return; }
    contracts = flattenActiveContracts(ua, state.settings.blockedExpiries);
    if (!contracts.length) { setStatus('برای این نماد قرارداد فعالی پیدا نشد.', true); return; }
    const codes = [...new Set([String(ua.ins), ...contracts.map((contract) => String(contract.ins))])];
    $('gw-load').disabled = true;
    setStatus(`دریافت تاریخچه ${fmt.int(codes.length)} نماد…`);
    try {
      const payloads = await Promise.all(chunks(codes, 70).map(async (part) => {
        const response = await fetch(`/api/dailies?ins=${part.join(',')}&n=0`);
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || 'تاریخچه دریافت نشد');
        return payload;
      }));
      seriesByIns = {};
      for (const payload of payloads) for (const [ins, value] of Object.entries(payload)) seriesByIns[ins] = value.rows || [];
      await applyScope();
      computeHistVol();
      entryDates = (seriesByIns[String(ua.ins)] || [])
        .map((row) => normalizeHistoryDate(row.date)).filter(Boolean).sort((a, b) => a - b);
      if (!entryDates.length) throw new Error('برای نماد پایه تاریخچه‌ای برنگشت');
      $('gw-work').hidden = false;
      entryWheel = mountDateWheel($('gw-entry-date'), entryDates,
        entryDates[Math.max(0, entryDates.length - 10)], () => refreshCombos(),
        { empty: 'روز معاملاتی پیدا نشد.' });
      paintParams();
      refreshCombos();
      setStatus(`تاریخچه آماده است — ${fmt.int(entryDates.length)} روز معاملاتی.`);
      if (pendingPlan?.autoRun) { const plan = pendingPlan; pendingPlan = null; pickPlanCombo(plan); }
    } catch (error) {
      setStatus(errorText(error, 'دریافت تاریخچه کامل نشد.'), true);
    } finally {
      $('gw-load').disabled = false;
    }
  }

  const comboLabel = (combo) => combo.legs
    .map((leg) => `${leg.side === 'sell' ? '−' : '+'}${nameOf(leg, 'پا')}`).join('  ');

  function refreshCombos() {
    const entryDate = Number($('gw-entry-date').dataset.value);
    if (!entryDate || !ua) return;
    const keep = legs ? comboKey(legs) : '';
    const generated = generateHistoricalCombos({
      def: byId($('gw-strategy').value), ua, seriesByIns, startDate: entryDate,
      entryBasis: 'LAST', settings: state.settings, filtered: true,
    });
    combos = (generated.combos || []).slice(0, 1000);
    $('gw-combo').innerHTML = combos.length
      ? combos.map((combo, index) => `<option value="${index}">${esc(comboLabel(combo))}</option>`).join('')
      : '<option value="">ترکیب معتبری در این روز نبود</option>';
    const at = keep ? combos.findIndex((combo) => comboKey(combo.legs) === keep) : -1;
    if (at >= 0) $('gw-combo').value = String(at);
    $('gw-combo-count').textContent = `${fmt.int(combos.length)} ترکیب قابل اجرا`;
    $('gw-run').disabled = !combos.length;
  }

  // ——————————————————————— اجرا ———————————————————————

  function runReplay() {
    const at = Number($('gw-combo').value);
    const combo = combos[at];
    if (!combo) { setStatus('اول یک ترکیب انتخاب کن.', true); return; }
    legs = combo.legs;
    const entryDate = Number($('gw-entry-date').dataset.value);
    const baseDates = (seriesByIns[String(ua.ins)] || [])
      .map((row) => normalizeHistoryDate(row.date)).filter((date) => date >= entryDate);
    const expiries = legs.filter((leg) => leg.kind !== 'underlying').map((leg) => normalizeHistoryDate(leg.expiry));
    const endDate = Math.min(Math.max(...baseDates), ...expiries);
    const units = Math.max(1, Math.trunc(Number($('gw-units').value) || 1));
    replay = replayHistory({
      legs, seriesByIns, baseIns: String(ua.ins), startDate: entryDate, endDate,
      entryBasis: 'LAST', exitBasis: 'LAST', units,
      fees: feesOf(state.settings), settings: state.settings,
    });
    if (!replay?.ok) {
      setStatus(replay?.error || 'بازپخش این ترکیب ممکن نشد.', true);
      $('gw-run').disabled = false;
      return;
    }
    intradayDays = [];
    $('gw-fetch-intraday').disabled = false;
    setRail($('gw-gk-frame'), 'daily'); setRail($('gw-vol-frame'), 'daily');
    setRail($('gw-track-frame'), 'daily'); setRail($('gw-ex-frame'), 'daily');
    frame = 'daily';
    computeHistVol();
    subtabs = mountSubtabs($('gw-subtabs'), PANELS, { root });
    repaint();
    setStatus(`رصد از ${dateLabel(replay.startDate)} تا ${dateLabel(replay.endDate)} آماده است.`);
  }

  // ——————————————————————— ریزمعامله ———————————————————————

  async function fetchTrades(ins, date) {
    const response = await fetch(`/api/trades?ins=${encodeURIComponent(ins)}&date=${date}`);
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'ریزمعامله دریافت نشد');
    return payload.rows || [];
  }

  /**
   * ریزمعاملهٔ چند روز آخرِ مسیر.
   *
   * روزی که همهٔ پاهایش را نگرفتیم اصلاً وارد نمی‌شود. یک روزِ ناقص در
   * میان روزهای کامل، شکافی می‌سازد که در نمودار شبیه یک حرکت واقعی است.
   */
  async function fetchIntraday() {
    if (!replay?.ok || !legs) return;
    const want = Math.max(1, Math.min(20, Math.trunc(Number($('gw-days').value) || 1)));
    const days = replay.rows.filter((row) => row.status === 'ok').map((row) => row.date).slice(-want);
    if (!days.length) { $('gw-intraday-note').textContent = 'روز دارای قیمت کامل در این مسیر نبود.'; return; }
    const codes = [...new Set([...legs.map((leg) => String(leg.ins)), String(ua.ins)])];
    const button = $('gw-fetch-intraday');
    button.disabled = true;
    const collected = [];
    const skipped = [];
    try {
      for (const date of days) {
        $('gw-intraday-note').textContent = `دریافت ریزمعاملهٔ ${dateLabel(date)}…`;
        const fetched = await Promise.allSettled(codes.map(async (ins) => [ins, await fetchTrades(ins, date)]));
        if (fetched.some((item) => item.status === 'rejected')) { skipped.push(date); continue; }
        const byIns = Object.fromEntries(fetched.map((item) => item.value));
        const points = replayIntraday({
          replay, tradesByIns: byIns, baseTrades: byIns[String(ua.ins)] || [],
          fees: feesOf(state.settings),
        });
        // فیلتر جلسه اینجا لازم نیست و اگر بود هم غلط بود: `replayIntraday`
        // خودش رویداد بیرون از ۹:۰۰ تا ۱۲:۳۰ را نمی‌پذیرد، و
        // `inIntradaySession` ورودی HHMMSS می‌خواهد نه ثانیهٔ روز — دادن
        // `point.second` به آن، ۳۲۴۰۰ را «۰۳:۲۴:۰۰» می‌خواند و همهٔ روزها
        // را بی‌صدا می‌انداخت.
        if (points.length) collected.push({ date, points });
        else skipped.push(date);
      }
      intradayDays = collected;
      const parts = [`${fmt.int(collected.length)} روز ریزمعامله آماده شد`];
      if (skipped.length) parts.push(`${fmt.int(skipped.length)} روز کنار گذاشته شد چون داده‌اش کامل نبود`);
      // ادعای «در دسترس است» فقط وقتی گفته می‌شود که واقعاً روزی جمع شده
      // باشد. صفر روز و همان جمله، یعنی کاربر دکمهٔ درون‌روز را می‌زند و
      // چیزی نمی‌بیند و دنبال دلیلش می‌گردد.
      $('gw-intraday-note').textContent = collected.length
        ? `${parts.join(' · ')}. حالا تایم‌فریم درون‌روز و سطل در دسترس است.`
        : `${parts.join(' · ')}. تایم‌فریم درون‌روز داده‌ای ندارد و روزانه مبنا می‌ماند.`;
      repaint();
    } catch (error) {
      $('gw-intraday-note').textContent = errorText(error, 'دریافت ریزمعامله کامل نشد.');
      logError('ریزمعاملهٔ رصد یونانی', error);
    } finally {
      button.disabled = false;
    }
  }

  // ——————————————————————— ساخت مسیر مهرخورده ———————————————————————

  /**
   * ردیف‌های تایم‌فریم انتخابی، با تلاطم و یونانی مهرخورده.
   *
   * تلاطم تاریخی روی مسیر روزانه **غلتان** است و روی دو تایم‌فریم دیگر
   * ثابت: پنجرهٔ تاریخی از قیمت پایانی روزانه می‌آید و درون یک روز عوض
   * نمی‌شود. کشیدن یک خط غلتانِ ساختگی روی محور ثانیه، حرکتی نشان می‌داد
   * که وجود ندارد.
   */
  function framedRows() {
    if (!replay?.ok) return { rows: [], name: '' };
    const params = ivP();
    const legList = replay.priced;
    if (frame === 'intraday' && intradayDays.length) {
      const rows = intradayDays.flatMap((day) => annotateTrack(day.points, {
        legs: legList, shape: 'intraday', date: day.date,
        hvPct: hv?.pct, hvSource: hv?.source,
      }, params));
      return { rows, name: 'درون‌روز' };
    }
    if (frame === 'bucket' && intradayDays.length) {
      const buckets = bucketIntradayPath(intradayDays, { bucketSeconds });
      annotateTrack(buckets, { legs: legList, shape: 'bucket', hvPct: hv?.pct, hvSource: hv?.source }, params);
      return { rows: buckets, name: `سطل ${BUCKETS.find(([value]) => value === bucketSeconds)?.[1] || ''}` };
    }
    const rows = replay.rows.filter((row) => row.status !== 'missing');
    // پنجرهٔ غلتان روی **کل** سری پایه بسته می‌شود، نه روی روزهای همین
    // موقعیت. یک موقعیت ده‌روزه هیچ‌وقت پنجرهٔ شصت‌روزه را پر نمی‌کند و اگر
    // مبنا فقط همین ده روز بود، ستون تلاطم تاریخی همیشه خالی می‌ماند —
    // در حالی که تاریخچهٔ پایه سال‌ها عقب می‌رود و عدد کاملاً موجود است.
    const baseSeries = seriesByIns[String(ua.ins)] || [];
    const rolling = histVolSeries(baseSeries.map((row) => Number(row.close)), {
      tradingDaysYear: params.tradingDaysYear, window: params.hvWindow, manualPct: params.hvManualPct,
    });
    const byDate = new Map(baseSeries.map((row, at) => [normalizeHistoryDate(row.date), rolling[at]]));
    annotateTrack(rows, {
      legs: legList, shape: 'daily',
      hvSeries: rows.map((row) => byDate.get(Number(row.date))),
      hvSource: hv?.source,
    }, params);
    return { rows, name: 'روزانه' };
  }

  const legLabel = (leg, index) => `${faDigits(index + 1)} · ${nameOf(leg, `پای ${faDigits(index + 1)}`)}`;

  // ——————————————————————— رنگ‌آمیزی ———————————————————————

  function repaint() {
    if (!replay?.ok) return;
    const built = framedRows();
    const rows = built.rows;
    const legList = replay.priced;
    const points = monitorSeries(rows, { legCount: legList.length });
    for (const id of ['gw-gk-count', 'gw-vol-count', 'gw-track-count', 'gw-ex-count']) {
      $(id).textContent = points.length ? `${fmt.int(points.length)} نقطه · ${built.name}` : 'نقطه‌ای نیست';
    }
    paintPulse(rows, legList);
    paintGreeks(points, rows, legList, built.name);
    paintVol(points, rows, legList);
    paintTrack(points, legList);
    paintExtremes(rows);
    attachExportsIn(root, 'gw');
  }

  function paintPulse(rows, legList) {
    const last = rows.at(-1);
    const g = last?.greeks;
    $('gw-pulse-kpis').innerHTML = kpis([
      ...GREEKS.map(({ key, label }) => [label, small(g?.[key]), signTone(g?.[key])]),
      ['تلاطم ضمنی موقعیت', pctCell(last?.meanIvPct)],
      ['تلاطم تاریخی پایه', pctCell(last?.hvPct)],
      ['ضمنی منهای تاریخی', small(last?.ivHvSpreadPp), signTone(last?.ivHvSpreadPp)],
      ['وضعیت', g ? (g.incomplete ? 'ناقص — پایی بی‌تلاطم' : 'کامل') : '—', g?.incomplete ? 'loss' : 'gain'],
    ]);
    const stance = monitorStance(g || {});
    $('gw-pulse-stance').innerHTML = g
      ? `در آخرین نقطهٔ این مسیر، موقعیت <b>${esc(stance.delta)}</b> است، نسبت به حرکت بزرگ <b>${esc(stance.gamma)}</b>، نسبت به تلاطم <b>${esc(stance.vega)}</b>، و <b>${esc(stance.theta)}</b>. این چهار جمله ترجمهٔ همان چهار عدد بالاست، نه چیز تازه‌ای.`
      : 'برای این مسیر هنوز یونانی کاملی درنیامده است.';

    const cov = monitorCoverage(rows);
    $('gw-pulse-coverage').innerHTML = table(
      ['کل نقطه', 'یونانی کامل', 'ناقص — پایی بی‌تلاطم', 'بی‌یونانی', 'پوشش'],
      [[td(int(cov.total)), td(int(cov.complete)), td(int(cov.partial), cov.partial ? 'loss' : ''),
        td(int(cov.none), cov.none ? 'loss' : ''), td(pctCell(cov.coveragePct), cov.coveragePct >= 99 ? 'gain' : 'loss')]],
    );

    const snap = last?.monitor;
    $('gw-pulse-legs').innerHTML = table(
      ['پا', 'وزن علامت‌دار', 'تلاطم ضمنی', ...GREEKS.map(({ label }) => `سهم ${label}`)],
      (snap?.share || []).map((share, index) => [
        td(esc(legLabel(legList[index], index))),
        td(small(share.weight)),
        td(pctCell(snap.ivPct[index])),
        ...GREEKS.map(({ key }) => td(small(share[key]), signTone(share[key]))),
      ]),
      'برای آخرین نقطه، سهمی محاسبه نشد.',
    );
  }

  function paintGreeks(points, rows, legList, frameName) {
    $('gw-gk-charts').innerHTML = GREEKS
      .map(({ key, label, unit }) => chartBox(`gw-gk-chart-${key}`, label, unit)).join('');
    for (const { key, label } of GREEKS) {
      const series = [
        { key, label: `کل موقعیت · ${label}`, color: 'var(--accent)' },
        ...legList.map((leg, index) => ({
          key: `${key}${index + 1}`, label: legLabel(leg, index), color: LEG_COLORS[index % LEG_COLORS.length],
        })),
      ];
      chart($(`gw-gk-chart-${key}`), points, series, {
        timeScale: frame === 'intraday', step: frame !== 'daily',
        xLabel: frameName, yLabel: label,
      });
    }

    const summaryRow = (row) => [
      td(esc(row.label)), td(esc(row.unit)), td(int(row.samples)), td(int(row.gaps)),
      td(small(row.first)), td(small(row.last)), td(small(row.change), signTone(row.change)),
      td(small(row.min)), td(small(row.max)), td(small(row.mean)),
    ];
    const headers = ['یونانی', 'واحد', 'مشاهده', 'بی‌داده', 'ابتدا', 'انتها', 'تغییر', 'کمینه', 'بیشینه', 'میانگین'];
    $('gw-gk-summary').innerHTML = table(headers, monitorGreekSummary(rows).map(summaryRow));

    const legRows = [];
    legList.forEach((leg, index) => {
      for (const row of monitorLegGreekSummary(rows, index)) {
        legRows.push([td(esc(legLabel(leg, index))), ...summaryRow(row)]);
      }
    });
    $('gw-gk-legs').innerHTML = table(['پا', ...headers], legRows,
      'این ترکیب پای اختیاری ندارد؛ یونانی تعریف نمی‌شود.');
  }

  function paintVol(points, rows, legList) {
    const auto = histVolPct((seriesByIns[String(ua?.ins)] || []).map((row) => Number(row.close)), {
      tradingDaysYear: ivP().tradingDaysYear, window: ivP().hvWindow,
    });
    $('gw-hv-note').innerHTML = hv?.source === 'manual'
      ? `تلاطم تاریخی از سری قیمت درنیامد — ${esc(hv.why)} خط تاریخی در این نمودار، عدد اعلام‌شدهٔ توست (${pctCell(hv.pct)}) و از قیمت استخراج نشده.`
      : hv?.enough
        ? `تلاطم تاریخی از ${fmt.int(auto.samples)} قیمت پایانی پایه ساخته شده، با سالانه‌سازی روی ${fmt.int(auto.tradingDaysYear)} روز معاملاتی. هر دو عدد در تنظیمات قابل تغییرند.`
        : `تلاطم تاریخی ساخته نشد — ${esc(hv?.why || '')}`;

    const series = [
      ...legList.map((leg, index) => ({
        key: `iv${index + 1}`, label: `ضمنی ${legLabel(leg, index)}`, color: LEG_COLORS[index % LEG_COLORS.length],
      })),
      { key: 'ivMean', label: 'میانگین ضمنی موقعیت', color: 'var(--accent)' },
      { key: 'hv', label: `تاریخی پایه${hv?.source === 'manual' ? ' — اعلام دستی' : ''}`, color: 'var(--muted)' },
    ];
    chart($('gw-vol-chart'), points, series, {
      timeScale: frame === 'intraday', step: frame !== 'daily',
      xLabel: 'مسیر زمانی', yLabel: 'تلاطم سالانه (٪)',
    });
    chart($('gw-vol-spread-chart'), points, [
      { key: 'ivHv', label: 'ضمنی منهای تاریخی', color: 'var(--accent)' },
    ], { timeScale: frame === 'intraday', step: frame !== 'daily', xLabel: 'مسیر زمانی', yLabel: 'واحد درصد' });

    $('gw-vol-summary').innerHTML = table(
      ['سری', 'مشاهده', 'بی‌داده', 'ابتدا', 'انتها', 'تغییر', 'کمینه', 'بیشینه', 'میانگین'],
      monitorVolSummary(rows, { legs: legList }).map((row) => [
        td(row.kind === 'leg' ? esc(legLabel(legList[row.index], row.index)) : esc(row.label)),
        td(int(row.samples)), td(int(row.gaps)),
        td(pctCell(row.first)), td(pctCell(row.last)),
        td(small(row.changePp), signTone(row.changePp)),
        td(pctCell(row.min)), td(pctCell(row.max)), td(pctCell(row.mean)),
      ]),
    );
  }

  /**
   * برچسب لحظهٔ یک نقطه.
   *
   * سطل تایم‌فریم هم ساعت دارد هم تاریخ، و بازهٔ چندروزه یعنی «۰۹:۰۰:۰۰»
   * تنها، سه بار در جدول تکرار می‌شود بی‌آنکه معلوم باشد کدام روز است.
   */
  const stamp = (point) => {
    const day = fin(point.date) ? dateLabel(point.date) : '';
    const clock = point.timeLabel ? faDigits(point.timeLabel) : '';
    if (day && clock) return `${day} · ${clock}`;
    return clock || faDigits(point.dateLabel || day || '');
  };

  function paintTrack(points, legList) {
    const headers = ['لحظه', 'قیمت پایه', ...GREEKS.map(({ label }) => label),
      ...legList.map((leg, index) => `ضمنی ${legLabel(leg, index)}`),
      'میانگین ضمنی', 'تاریخی', 'ضمنی−تاریخی', 'سود خالص', 'وضعیت'];
    $('gw-track-table').innerHTML = table(headers, thin(points).map((point) => [
      td(stamp(point)),
      td(money(point.spot)),
      ...GREEKS.map(({ key }) => td(small(point[key]))),
      ...legList.map((leg, index) => td(pctCell(point[`iv${index + 1}`]))),
      td(pctCell(point.ivMean)), td(pctCell(point.hv)),
      td(small(point.ivHv), signTone(point.ivHv)),
      td(money(point.netPnl), signTone(point.netPnl)),
      td(point.incomplete ? 'ناقص' : 'کامل', point.incomplete ? 'loss' : ''),
    ]), 'برای این تایم‌فریم نقطه‌ای نیست.');
  }

  function paintExtremes(rows) {
    $('gw-extremes-table').innerHTML = table(
      ['حساسیت', 'ابتدا', 'انتها', 'بیشینه', 'کِی', 'کمینه', 'کِی'],
      monitorExtremes(rows).map((row) => [
        td(esc(row.label)), td(small(row.firstValue)), td(small(row.lastValue)),
        td(small(row.maxValue), signTone(row.maxValue)), td(faDigits(row.maxAt)),
        td(small(row.minValue), signTone(row.minValue)), td(faDigits(row.minAt)),
      ]),
      'برای این مسیر نقطهٔ مهرخورده‌ای نیست.',
    );
  }

  // ——————————————————————— کنترل‌ها ———————————————————————

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rail] button');
    if (!button) return;
    const host = button.closest('[data-rail]');
    const wanted = button.dataset.value;
    if (wanted !== 'daily' && !intradayDays.length) {
      $('gw-intraday-note').textContent = 'اول ریزمعاملهٔ روزها را بگیر؛ بدون آن، تایم‌فریم درون‌روز داده‌ای ندارد.';
      return;
    }
    if (frame === wanted) return;
    frame = wanted;
    for (const id of ['gw-gk-frame', 'gw-vol-frame', 'gw-track-frame', 'gw-ex-frame']) setRail($(id), frame);
    repaint();
  });

  $('gw-load').addEventListener('click', loadHistory);
  $('gw-run').addEventListener('click', runReplay);
  $('gw-fetch-intraday').addEventListener('click', fetchIntraday);
  $('gw-strategy').addEventListener('change', refreshCombos);
  $('gw-combo').addEventListener('change', () => { $('gw-run').disabled = !combos.length; });
  $('gw-bucket').addEventListener('change', (event) => {
    bucketSeconds = Math.max(60, Math.trunc(Number(event.target.value) || 900));
    if (frame === 'bucket') repaint();
  });

  // ——————————————————————— انتقال از تب‌های دیگر ———————————————————————

  /**
   * ترکیبی که تب مبدأ فرستاده را انتخاب می‌کند.
   *
   * تطبیق با شناسهٔ قرارداد است نه با اندیس: فهرست ترکیب‌های یک روز به
   * فیلترهای نقدشوندگی بستگی دارد و اندیس بین دو نشست یکی نمی‌ماند. اگر
   * همان قراردادها در فهرست نبودند، چیزی بی‌صدا انتخاب نمی‌شود.
   */
  function pickPlanCombo(plan) {
    const want = new Set((plan.legIns || []).map(String));
    const at = combos.findIndex((combo) => {
      const have = new Set(combo.legs.filter((leg) => leg.kind !== 'underlying').map((leg) => String(leg.ins)));
      return have.size === want.size && [...want].every((ins) => have.has(ins));
    });
    if (at < 0) { setStatus('ترکیب فرستاده‌شده در این روز پیدا نشد؛ خودت انتخابش کن.', true); return; }
    $('gw-combo').value = String(at);
    runReplay();
  }

  function applyPlan(plan) {
    if (!plan?.uaIns || !chain.has(String(plan.uaIns))) return;
    $('gw-base').value = String(plan.uaIns);
    if (plan.strategyId && CATALOG.some((def) => def.id === plan.strategyId)) $('gw-strategy').value = plan.strategyId;
    if (plan.units) $('gw-units').value = String(Math.max(1, Math.trunc(Number(plan.units) || 1)));
    if (plan.live) $('gw-scope').value = SCOPE_LIVE;
    pendingPlan = { ...plan, autoRun: true };
    loadHistory().then(() => {
      const entry = Number(plan.entryDate);
      if (entry && entryWheel && entryDates.includes(entry)) { entryWheel.select(entry, false); refreshCombos(); }
    });
  }

  const hash = String(location.hash || '');
  const token = hash.includes('!') ? hash.slice(hash.indexOf('!') + 1) : '';
  const plan = state.handoff?.to === 'greeks-watch' ? state.handoff : takeHandoff(token);
  if (plan?.to === 'greeks-watch') { state.handoff = null; pendingPlan = plan; }

  await loadUniverse();
}
