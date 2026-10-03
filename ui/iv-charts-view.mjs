// تب «نوسان ضمنی» در رصد لحظه‌ای — سه نمودار، نماد از همان نقشه.
//
//   ۱  نمودار مادر: نوسان ضمنی روزانهٔ شاخص پایه یا هر قرارداد در طول زمان،
//      کنار قیمت، حجم و موقعیت باز؛ بازه، مبنای قیمت و سری‌ها قابل تنظیم.
//   ۲  قراردادهای یک سررسید: نوسان ضمنی روزانهٔ چند قرارداد روی هم، با
//      افزودن و برداشتن.
//   ۳  بازه و تایم‌فریم: نوسان ضمنی درون‌روزی شاخص یا یک قرارداد در بازهٔ
//      دلخواه و دانهٔ ۵ تا ۶۰ دقیقه یا روزانه.
//
// داده از `/api/vol/history` (قیمت روزانهٔ قراردادها، سررسیدشده‌ها هم، و
// موقعیت باز ضبط‌شده) و `/api/vol/intraday` (ضبط زنده یا بازسازی). هر عدد از
// `core/iv-chart.mjs`، `core/vol-rank.mjs` و `core/vol-intraday.mjs`؛ اینجا
// فقط کنترل و گزینهٔ نمودار. سازنده‌های گزینه خالص‌اند تا آزمون بسنجدشان.
//
// هر دریافت شماره دارد و پاسخِ نمادی که دیگر انتخاب نیست دور ریخته می‌شود
// (همان قاعدهٔ گزارش آزمون ۳۷۱۲e1a).

import { fmt, faDigits } from './fmt.mjs';
import { mountChart } from './chart-host.mjs';
import { mountHistoryRange } from './history-range.mjs';
import { fetchDailies } from './daily-intake.mjs';
import { rankOpts } from './vol-context.mjs';
import { computeDeskDays } from './vol-desk-compute.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { parseJalaliRange, daysBefore } from '../core/history-range.mjs';
import { momentLabel } from '../core/intraday-grid.mjs';
import { tehranDateNumber } from '../core/tehran-day.mjs';
import { buildVolHistory, panelObservations, liveObservations, volParams, IV_PRICE_BASES } from '../core/vol-rank.mjs';
import { intradayContext } from '../core/vol-intraday.mjs';
import { deskFrom } from '../core/vol-desk.mjs';
import {
  contractDailySeries, underlyingDailySeries, expiriesOf, defaultPicks, contractLabel, contractIntradaySeries,
} from '../core/iv-chart.mjs';
import {
  MASTER_SERIES, RANGE_SPANS, RANGE_GRAINS, INDEX_LABEL, instrumentOptionsHtml, masterOption, expiryOption, rangeOption, masterSummary,
} from './iv-charts-options.mjs';

export { masterOption, expiryOption, rangeOption, instrumentOptionsHtml, masterSummary } from './iv-charts-options.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));
const isNum = (value) => Number.isFinite(value);
const dateLabel = (value) => faDigits(historyDateLabel(value));
const STORE = 'options-radar:iv-charts';

// ═══════════════════ سوارکردن ═══════════════════

/** بزرگ‌نمایی و سری‌های خاموشِ نمودار فعلی، برای نگه‌داشتن در به‌روزرسانی. */
function viewState(instance) {
  try {
    const option = instance?.getOption?.() || {};
    const zoom = (option.dataZoom || []).map((z) => ({ start: z.start, end: z.end }));
    const zoomed = zoom.some((z) => z.start > 0 || z.end < 100);
    return { zoom: zoomed ? zoom : null, legend: option.legend?.[0]?.selected || null };
  } catch { return { zoom: null, legend: null }; }
}
function withView(option, kept, keepLegend) {
  if (!option || !kept) return option;
  const out = { ...option };
  if (kept.zoom && Array.isArray(out.dataZoom)) out.dataZoom = out.dataZoom.map((z, i) => ({ ...z, ...(kept.zoom[i] || kept.zoom[0]) }));
  if (keepLegend && kept.legend && out.legend) out.legend = { ...out.legend, selected: { ...(out.legend.selected || {}), ...kept.legend } };
  return out;
}

function loadOpts() {
  const base = {
    instrument: '', priceBasis: 'close', show: { index: true, iv: true, ma: false, hv: true, price: true, volume: true, oi: true },
    expiry: 0, kind: 'both', withIndex: true, picks: {},
    rInstrument: '', rIndex: true, span: 5, rFrom: '', rTo: '', grain: 'm5', mode: 'trades',
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    const out = { ...base, ...saved, show: { ...base.show, ...(saved.show || {}) } };
    // شاخص پایه دیگر گزینهٔ فهرست نیست؛ انتخابِ ذخیره‌شدهٔ قدیمی به تیک می‌رود.
    if (out.instrument === 'index') { out.instrument = ''; out.show.index = true; }
    if (out.rInstrument === 'index') { out.rInstrument = ''; out.rIndex = true; }
    return out;
  } catch { return base; }
}
function saveOpts(opts) {
  try { localStorage.setItem(STORE, JSON.stringify(opts)); } catch { /* حافظهٔ مرورگر در دسترس نیست */ }
}

/**
 * `getSelection()` نقشه (`uaIns`، `endDate`، `contractIns`)، `getPayload()` عکس
 * زندهٔ داشبورد (برای امروز)، `getSettings()` تنظیمات، `isVisible()`.
 */
export function mountIvCharts(host, { getSelection, getPayload = () => null, getSettings = () => ({}), isVisible = () => true, fetcher = (...a) => fetch(...a) } = {}) {
  let opts = loadOpts();
  let ua = '', data = null, dailySeq = 0, rangeSeq = 0, dailyCtrl = null, rangeCtrl = null, poll = null, tries = 0;
  let range = null, calendar = null, rangeApi = null, rangePoints = {}, rangePoll = null, liveSeen = '';
  let todayAt = 0, todayBusy = false;
  const charts = new Map();
  const chartSeq = {};
  const seriesMemo = new Map();

  host.innerHTML = `<div class="ivc">
    <section class="card ivc-master">
      <div class="section-head"><div><p class="eyebrow">نمودار مادر · روزانه</p><h2 data-ivc-title>نوسان ضمنی در طول زمان</h2></div><span data-ivc-status class="note" role="status"></span></div>
      <div class="ivc-controls">
        <label class="ivc-wide">قرارداد<select data-ivc="instrument"></select></label>
        <label>مبنای قیمت<select data-ivc="priceBasis">${IV_PRICE_BASES.map(([v, t]) => `<option value="${v}"${v === opts.priceBasis ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <div class="ivc-range" data-ivc-range></div>
      </div>
      <div class="ivc-toggles" role="group" aria-label="سری‌های نمودار">${MASTER_SERIES.map(([id, label]) => `<label class="check${id === 'index' ? ' ivc-index-toggle' : ''}"><input type="checkbox" data-ivc-show="${id}"${opts.show[id] !== false ? ' checked' : ''}> ${esc(label)}</label>`).join('')}</div>
      <div class="ivc-chart" data-ivc-chart="master"></div>
      <p class="note" data-ivc-summary></p>
    </section>
    <section class="card ivc-expiry">
      <div class="section-head"><div><p class="eyebrow">قراردادهای یک سررسید</p><h3>نوسان ضمنی قراردادها روی هم</h3></div><span class="note">هر قرارداد را با تیک اضافه یا حذف کن؛ همان بازه و مبنای قیمت نمودار مادر</span></div>
      <div class="ivc-controls">
        <label>سررسید<select data-ivc="expiry"></select></label>
        <label>نوع<select data-ivc="kind"><option value="both">خرید و فروش</option><option value="call">فقط خرید (کال)</option><option value="put">فقط فروش (پوت)</option></select></label>
        <label class="check ivc-index-toggle"><input type="checkbox" data-ivc="withIndex"${opts.withIndex ? ' checked' : ''}> ${INDEX_LABEL}</label>
        <div class="ivc-buttons"><button type="button" class="ghost" data-ivc-pick="near">نزدیک به پول</button><button type="button" class="ghost" data-ivc-pick="all">همه</button><button type="button" class="ghost" data-ivc-pick="none">هیچ</button></div>
      </div>
      <div class="ivc-chips" data-ivc-chips></div>
      <div class="ivc-chart" data-ivc-chart="expiry"></div>
    </section>
    <section class="card ivc-intraday">
      <div class="section-head"><div><p class="eyebrow">بازه و تایم‌فریم</p><h3>نوسان ضمنی در بازهٔ دلخواه</h3></div><span class="note">امروز از ضبط زنده و با هر تیک تازه می‌شود؛ روزهای ضبط‌نشده از بازسازی ریزمعامله (با دکمه، هزینه پیش از آن گفته می‌شود)</span></div>
      <div class="ivc-controls">
        <label class="ivc-wide">قرارداد<select data-ivc="rInstrument"></select></label>
        <label class="check ivc-index-toggle"><input type="checkbox" data-ivc="rIndex"${opts.rIndex ? ' checked' : ''}> ${INDEX_LABEL}</label>
        <label>بازه<select data-ivc="span">${RANGE_SPANS.map(([v, t]) => `<option value="${v}"${Number(v) === Number(opts.span) ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label data-ivc-custom>از (شمسی)<input type="text" data-ivc="rFrom" dir="ltr" placeholder="۱۴۰۵/۰۷/۰۱" value="${esc(opts.rFrom)}"></label>
        <label data-ivc-custom>تا (شمسی)<input type="text" data-ivc="rTo" dir="ltr" placeholder="۱۴۰۵/۰۷/۰۹" value="${esc(opts.rTo)}"></label>
        <label>تایم‌فریم<select data-ivc="grain">${RANGE_GRAINS.map(([v, t]) => `<option value="${v}"${v === opts.grain ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>بازسازی از<select data-ivc="mode"><option value="trades"${opts.mode === 'trades' ? ' selected' : ''}>ریزمعامله</option><option value="book"${opts.mode === 'book' ? ' selected' : ''}>دفتر سفارش + ریزمعامله</option></select></label>
        <button type="button" class="primary" data-ivc-range-go>رسم نمودار</button>
      </div>
      <p class="note" data-ivc-rstatus role="status"></p>
      <div data-ivc-build></div>
      <div data-ivc-clip></div>
      <div class="ivc-chart" data-ivc-chart="range"></div>
      <p class="note">مبنای این نمودار با نمودار مادر یکی نیست: اینجا هر لحظه از مظنهٔ همان لحظه (میانهٔ خرید و فروش، وگرنه آخرین معاملهٔ تازه با برچسب جایگزین) و زمان معاملاتی تا سررسید است؛ نمودار مادر از قیمت پایانی یا آخرین روز و زمان تقویمی. پس دانهٔ «روزانه» اینجا لزوماً همان عدد نمودار مادر نیست.</p>
    </section>
  </div>`;
  const q = (sel) => host.querySelector(sel);
  const field = (name) => q(`[data-ivc="${name}"]`);
  const today = () => tehranDateNumber();
  const paintCustom = () => host.querySelectorAll('[data-ivc-custom]').forEach((el) => { el.hidden = Number(opts.span) !== 0; });
  field('kind').value = opts.kind;
  paintCustom();

  const rangeUi = mountHistoryRange(q('[data-ivc-range]'), {
    preset: 'm6', quickEntry: true, compactNote: false,
    onApply: (next) => { range = next; if (ua) loadDaily(); },
  });
  range = rangeUi.range;

  host.addEventListener('change', (event) => {
    const el = event.target;
    const show = el.closest('[data-ivc-show]');
    if (show) { opts = { ...opts, show: { ...opts.show, [show.dataset.ivcShow]: show.checked } }; saveOpts(opts); paintMaster(); return; }
    const pick = el.closest('[data-ivc-contract]');
    if (pick) { setPicks(el.checked ? [...currentPicks(), pick.dataset.ivcContract] : currentPicks().filter((ins) => ins !== pick.dataset.ivcContract)); paintExpiry(); return; }
    const key = el.dataset?.ivc;
    if (!key) return;
    const value = el.type === 'checkbox' ? el.checked : el.value;
    opts = { ...opts, [key]: ['span', 'expiry'].includes(key) ? Number(value) : value };
    saveOpts(opts);
    if (key === 'priceBasis') { seriesMemo.clear(); paintMaster(); paintExpiry(); }
    else if (key === 'instrument') paintMaster();
    else if (key === 'expiry' || key === 'kind' || key === 'withIndex') paintExpiry();
    else if (key === 'span') { paintCustom(); if (Number(value) !== 0) loadRange(); }
    else if (key === 'rInstrument' || key === 'rIndex' || key === 'grain' || key === 'mode') loadRange();
  });
  host.addEventListener('click', (event) => {
    const pick = event.target.closest('[data-ivc-pick]');
    if (pick && data) {
      const list = expiryContracts();
      const mode = pick.dataset.ivcPick;
      setPicks(mode === 'all' ? list.map((c) => String(c.ins)) : mode === 'none' ? [] : defaultPicks(list, { expiry: opts.expiry, spot: spotNow(), kind: opts.kind }));
      paintExpiry();
      return;
    }
    const go = event.target.closest('[data-ivc-range-go]');
    if (go) { loadRange({ build: go.dataset.build === '1' }); return; }
    // بازهٔ بلندتر از سقف: «روزهای قبل‌تر» پایان بازه را پیش از اولین روزِ آمده می‌برد.
    const prev = event.target.closest('[data-ivc-range-prev]');
    if (prev) {
      opts = { ...opts, rTo: historyDateLabel(daysBefore(Number(prev.dataset.ivcRangePrev), 1)) };
      field('rTo').value = opts.rTo;
      saveOpts(opts);
      loadRange();
    }
  });

  // ═══ دادهٔ روزانه (نمودار ۱ و ۲) ═══

  async function loadDaily() {
    const sel = getSelection() || {};
    const want = String(sel.uaIns || '');
    const my = ++dailySeq;
    dailyCtrl?.abort();
    dailyCtrl = typeof AbortController === 'function' ? new AbortController() : null;
    clearTimeout(poll);
    if (want !== ua) {
      data = null; seriesMemo.clear(); rangeApi = null; rangePoints = {};
      for (const handle of charts.values()) handle.dispose();
      charts.clear();
      // نماد تازه: قرارداد انتخابی نقشه پیش‌فرض نمودار مادر می‌شود.
      opts = { ...opts, instrument: sel.contractIns ? String(sel.contractIns) : '', rInstrument: sel.contractIns ? String(sel.contractIns) : '', expiry: Number(sel.endDate) || 0 };
    }
    ua = want;
    if (!ua) {
      q('[data-ivc-status]').textContent = '';
      q('[data-ivc-summary]').textContent = 'اول روی تب «نقشه و زنجیره» یک نماد پایه انتخاب کن.';
      return;
    }
    q('[data-ivc-status]').textContent = 'در حال دریافت قیمت روزانهٔ قراردادها…';
    try {
      const from = range?.from || deskFrom(today(), 120), to = Math.min(range?.to || today(), today());
      const [daily, response] = await Promise.all([
        fetchDailies([want], { n: 0, fetcher, signal: dailyCtrl?.signal }),
        fetcher(`/api/vol/history?ua=${encodeURIComponent(want)}&from=${from}&to=${to}`, { cache: 'no-store', signal: dailyCtrl?.signal }),
      ]);
      const body = await response.json();
      if (my !== dailySeq || want !== ua) return;
      if (!response.ok || body.error) throw new Error(body.error || `HTTP ${response.status}`);
      if (String(body.ua) !== want) return;
      data = { ua: want, from, to, today: body.today, contracts: body.contracts || [], panels: body.panels || {}, oi: body.oi || {}, baseRows: daily.byIns?.[want]?.rows || [], api: body };
      seriesMemo.clear();
      liveSeen = liveKey();
      fillSelects();
      paintMaster();
      paintExpiry();
      if (!rangeApi) loadRange();
      const building = body.build?.running || body.build?.queued || body.roster?.build?.running;
      if (building && tries < 400) { tries += 1; poll = setTimeout(() => { if (isVisible()) loadDaily(); }, 6000); }
    } catch (e) {
      if (my !== dailySeq || e?.name === 'AbortError') return;
      q('[data-ivc-status]').textContent = `دریافت ناموفق بود: ${faDigits(String(e?.message || e))}`;
    }
  }

  const uaName = () => getPayload()?.universe?.underlyings?.find((row) => String(row.ins) === ua)?.name || '';
  function spotNow() {
    const live = getPayload()?.universe?.underlyings?.find((row) => String(row.ins) === ua);
    const fromLive = Number(live?.last) || Number(live?.close);
    return fromLive > 0 ? fromLive : Number(data?.baseRows?.at(-1)?.close) || NaN;
  }

  function fillSelects() {
    const contracts = data.contracts;
    const t = data.today;
    // قرارداد پیش‌فرض: انتخاب نقشه، وگرنه کالِ نزدیک به پولِ نزدیک‌ترین سررسید باز.
    const valid = (ins) => contracts.some((c) => String(c.ins) === String(ins));
    if (!valid(opts.instrument)) opts.instrument = defaultContract();
    if (!valid(opts.rInstrument)) opts.rInstrument = opts.instrument;
    field('instrument').innerHTML = instrumentOptionsHtml(contracts, opts.instrument, { today: t });
    field('rInstrument').innerHTML = instrumentOptionsHtml(contracts, opts.rInstrument, { today: t });
    const expiries = expiriesOf(contracts, t);
    if (!expiries.includes(Number(opts.expiry))) opts.expiry = expiries[0] || 0;
    field('expiry').innerHTML = expiries.map((e) => `<option value="${e}"${e === Number(opts.expiry) ? ' selected' : ''}>${dateLabel(e)}${e < t ? ' (سررسیدشده)' : ''}</option>`).join('');
    const name = uaName();
    q('[data-ivc-title]').textContent = name ? `نوسان ضمنی در طول زمان · ${name}` : 'نوسان ضمنی در طول زمان';
    const b = data.api;
    q('[data-ivc-status]').textContent = `${faDigits(b.have)} از ${faDigits(b.days)} روز پروندهٔ قیمت دارد${b.build?.running || b.build?.queued ? ` · ساخت ادامه دارد (${faDigits(b.build.done)} از ${faDigits(b.build.total)})` : b.missing ? ` · ${faDigits(b.missing)} روز هنوز نیست` : ''} · ${faDigits(data.contracts.length)} قرارداد`;
  }

  function defaultContract() {
    const contracts = data?.contracts || [];
    const sel = getSelection() || {};
    if (sel.contractIns && contracts.some((c) => String(c.ins) === String(sel.contractIns))) return String(sel.contractIns);
    const expiry = expiriesOf(contracts, data?.today || 0)[0];
    return defaultPicks(contracts, { expiry, spot: spotNow(), kind: 'call', perKind: 1 })[0]
      || defaultPicks(contracts, { expiry, spot: spotNow(), kind: 'put', perKind: 1 })[0] || '';
  }

  /** امضای عکس زندهٔ همین نماد — برای اینکه تیکِ بی‌تغییر نمودار را از نو نسازد. */
  function liveKey() {
    const payload = getPayload();
    const under = payload?.universe?.underlyings?.find((row) => String(row.ins) === ua);
    const mine = (payload?.universe?.contracts || []).filter((c) => String(c.uaIns) === ua).map((c) => [c.ins, c.close, c.tradeLast, c.volume, c.oi]);
    return JSON.stringify([payload?.session?.current, payload?.session?.date, under?.close, under?.tradeLast, under?.last, mine]);
  }

  /** امروز، اگر جلسهٔ امروز واقعاً باز است. */
  function liveNow() {
    const payload = getPayload();
    const session = payload?.session;
    if (!session?.current || !(session.date > 0)) return null;
    // امروز فقط وقتی در بازهٔ نمودار است؛ بازهٔ تاریخی «امروز» نمی‌گیرد (گزارش
    // آزمون ۴۰b2533، بند ۱: خلاصهٔ بازهٔ ۰۵ تا ۰۶ مهر، ۷۰٪ امروز را آخرین گفت).
    if (data && (session.date < data.from || session.date > data.to)) return null;
    const under = payload.universe?.underlyings?.find((row) => String(row.ins) === ua);
    const spot = opts.priceBasis === 'last' ? (Number(under?.tradeLast) || Number(under?.last)) : Number(under?.close);
    return spot > 0 ? { date: session.date, spot, contracts: payload.universe?.contracts || [] } : null;
  }

  function indexRows() {
    const key = `index|${opts.priceBasis}`;
    if (seriesMemo.has(key)) return seriesMemo.get(key);
    const live = liveNow();
    const params = volParams(rankOpts());
    const history = buildVolHistory({
      baseRows: data.baseRows, observations: panelObservations(data.contracts, data.panels, opts.priceBasis),
      live: live ? { date: live.date, spot: live.spot, observations: liveObservations(live.contracts, ua, opts.priceBasis) } : null,
      from: data.from, params, settings: getSettings(),
    });
    const rows = underlyingDailySeries(history, { baseRows: data.baseRows, oi: data.oi, from: data.from, to: data.to });
    seriesMemo.set(key, rows);
    return rows;
  }

  function contractRows(ins) {
    const key = `${ins}|${opts.priceBasis}`;
    if (seriesMemo.has(key)) return seriesMemo.get(key);
    const contract = data.contracts.find((c) => String(c.ins) === String(ins));
    if (!contract) return [];
    const live = liveNow();
    const lc = live?.contracts.find((c) => String(c.ins) === String(ins));
    const days = data.baseRows.map((row) => row.date).filter((d) => d >= data.from && d <= data.to && d < data.today);
    const rows = contractDailySeries({
      contract, panels: data.panels, baseRows: data.baseRows, oi: data.oi, priceBasis: opts.priceBasis, settings: getSettings(), days, from: data.from, to: data.to,
      live: lc ? { date: live.date, spot: live.spot, price: opts.priceBasis === 'last' ? Number(lc.tradeLast) : Number(lc.close), volume: Number(lc.volume), oi: Number(lc.oi) } : null,
    });
    seriesMemo.set(key, rows);
    return rows;
  }

  /**
   * نمودار را می‌کشد. با همان `ctx` (همان نماد، قرارداد و بازه) نمودار موجود
   * در جا به‌روز می‌شود و بزرگ‌نمایی و سری‌های خاموش‌شدهٔ کاربر می‌مانند؛ قبلاً
   * هر تیک نمودار را از نو می‌ساخت (گزارش آزمون ۴۰b2533، سرعت). `ctx` تازه
   * یعنی نمای تازه، پس از نو.
   */
  async function setChart(key, build, empty, ctx = '', { keepLegend = true } = {}) {
    const seq = (chartSeq[key] = (chartSeq[key] || 0) + 1);
    const prev = charts.get(key);
    if (prev && prev.ctx === ctx) {
      const kept = viewState(prev.instance);
      if (prev.update((echarts, tokens) => withView(build(echarts, tokens), kept, keepLegend)) !== false) return;
    }
    prev?.dispose();
    charts.delete(key);
    const handle = await mountChart(q(`[data-ivc-chart="${key}"]`), build, { empty });
    if (seq !== chartSeq[key]) { handle?.dispose(); return; }
    if (!handle) return;
    handle.ctx = ctx;
    charts.set(key, handle);
    if (key === 'master') {
      // راهنمای نمودار و تیک‌ها یک حالت‌اند: کلیک روی راهنما تیک را هم عوض می‌کند.
      handle.instance.on('legendselectchanged', ({ selected = {} }) => {
        const show = { ...opts.show };
        for (const [id, label] of MASTER_SERIES) if (label in selected) show[id] = selected[label];
        opts = { ...opts, show };
        saveOpts(opts);
        host.querySelectorAll('[data-ivc-show]').forEach((el) => { el.checked = show[el.dataset.ivcShow] !== false; });
      });
    }
  }

  function paintMaster() {
    if (!data) return;
    const contract = opts.instrument ? data.contracts.find((c) => String(c.ins) === String(opts.instrument)) : null;
    const rows = contract ? contractRows(contract.ins) : [];
    // شاخص پایه همیشه ساخته می‌شود: خطش با تیک، و HV و IVR/IVP هم از آن است.
    const idx = indexRows();
    const title = contract ? `تاریخچهٔ قرارداد ${contractLabel(contract)}${opts.show.index !== false ? ` و ${INDEX_LABEL}` : ''}` : `${INDEX_LABEL} ${uaName()}`;
    q('[data-ivc-summary]').textContent = masterSummary(contract ? rows : idx);
    setChart('master', (echarts, tokens) => masterOption(rows, { indexRows: idx, show: opts.show, title }, tokens),
      'سری‌های روشن در این بازه داده‌ای ندارند — پوشش پرونده‌ها را در خط وضعیت ببین یا سری دیگری را روشن کن.',
      `${ua}|${opts.instrument}|${data.from}|${data.to}|${opts.priceBasis}`, { keepLegend: false });
  }

  const expiryContracts = () => (data?.contracts || []).filter((c) => Number(c.expiry) === Number(opts.expiry) && (opts.kind === 'both' || c.kind === opts.kind));
  const pickKey = () => `${ua}|${opts.expiry}`;
  function currentPicks() {
    const saved = opts.picks?.[pickKey()];
    if (Array.isArray(saved)) return saved;
    return defaultPicks(expiryContracts(), { expiry: opts.expiry, spot: spotNow(), kind: opts.kind });
  }
  function setPicks(list) {
    const picks = { ...(opts.picks || {}), [pickKey()]: [...new Set(list.map(String))] };
    const keys = Object.keys(picks);
    if (keys.length > 60) delete picks[keys[0]];
    opts = { ...opts, picks };
    saveOpts(opts);
  }

  function paintExpiry() {
    if (!data) return;
    const list = expiryContracts().sort((a, b) => (a.kind === b.kind ? a.strike - b.strike : a.kind === 'call' ? -1 : 1));
    const picked = new Set(currentPicks());
    q('[data-ivc-chips]').innerHTML = list.length
      ? list.map((c) => `<label class="ivc-chip" data-kind="${c.kind}"><input type="checkbox" data-ivc-contract="${esc(c.ins)}"${picked.has(String(c.ins)) ? ' checked' : ''}> ${esc(contractLabel(c))} <small>${c.kind === 'put' ? 'فروش' : 'خرید'} ${esc(faDigits(fmt.int(c.strike)))}</small></label>`).join('')
      : '<p class="empty-note">برای این سررسید قراردادی در بازه نیست.</p>';
    const lines = list.filter((c) => picked.has(String(c.ins))).map((c) => ({ label: `${contractLabel(c)} (${c.kind === 'put' ? 'فروش' : 'خرید'} ${faDigits(fmt.int(c.strike))})`, rows: contractRows(c.ins) }));
    setChart('expiry', (echarts, tokens) => expiryOption(lines, { indexRows: opts.withIndex ? indexRows() : null }, tokens),
      picked.size ? 'قراردادهای انتخاب‌شده در این بازه نوسان ضمنی نساختند.' : 'دست‌کم یک قرارداد را تیک بزن.',
      `${ua}|${opts.expiry}|${data.from}|${data.to}|${opts.priceBasis}`);
  }

  // ═══ بازه و تایم‌فریم (نمودار ۳) ═══

  function rangeDates() {
    const t = today();
    if (Number(opts.span) === 0) {
      const parsed = parseJalaliRange(opts.rFrom, opts.rTo, t);
      return parsed.ok ? { ...parsed.range, keep: 0 } : { error: parsed.error };
    }
    return { from: deskFrom(t, Number(opts.span)), to: t, keep: Number(opts.span) };
  }

  // ═══ بازه و تایم‌فریم: دریافت، ساخت و رسم ═══
  //
  // گزارش صاحب پروژه (۱۴۰۵/۰۷/۱۱): «کار نمی‌کند و نمودار را نمی‌سازد».
  // سه ایراد بود: (۱) سرور پیش از پاسخ منتظر دامنهٔ مجاز هر روز از بالادست
  // می‌ماند و رابط روی «در حال دریافت…» گیر می‌کرد (حالا سرور منتظر نمی‌ماند
  // و اینجا هم پس از چند ثانیه گفته می‌شود سرور هنوز پاسخ نداده)؛ (۲) دکمهٔ
  // ساخت کل بازهٔ گشاد را می‌ساخت نه روزهای نمایش‌داده را، و هزینه‌اش با
  // شمار روزها نمی‌خواند؛ (۳) روزِ ساخته‌نشده یا شکست‌خورده جز پیامِ کلی
  // چیزی نمی‌گفت. حالا «رسم نمودار» همان روزهای نمایش‌داده را — اگر ضبط و
  // ساخته نشده‌اند — با هزینهٔ نوشته‌شده روی خود دکمه می‌سازد و می‌کشد، و
  // روزِ شکست‌خورده علتش را می‌گوید.
  let rangeView = null, slowTimer = null;

  function rangeKey(span) {
    return `${ua}|${span.keep}|${span.from}|${span.to}|${opts.grain}|${opts.mode}|${opts.rInstrument}|${opts.rIndex}`;
  }

  /** یک سری: قرارداد (`ins`) یا شاخص پایه (بی `ins`). */
  async function fetchRangeSeries({ want, from, span, ins, build }) {
    const url = `/api/vol/intraday?ua=${encodeURIComponent(want)}&from=${from}&to=${span.to}&grain=${opts.grain}&mode=${opts.mode}${ins ? `&ins=${ins}` : ''}${build ? '&build=1' : ''}`;
    const response = await fetcher(url, { cache: 'no-store', signal: rangeCtrl?.signal });
    const body = await response.json();
    if (!response.ok || body.error) throw new Error(body.error || `HTTP ${response.status}`);
    if (String(body.ua) !== want) throw new Error('پاسخ سرور مال نماد دیگری بود');
    // «N روز اخیر» یعنی N روز معاملاتیِ آخر؛ بازه را گشاد گرفتیم.
    const days = span.keep ? body.days.slice(-span.keep) : body.days;
    return { ...body, days };
  }

  async function loadRange({ build = false } = {}) {
    if (!ua) return;
    const want = ua;
    const my = ++rangeSeq;
    rangeCtrl?.abort();
    rangeCtrl = typeof AbortController === 'function' ? new AbortController() : null;
    const span = rangeDates();
    if (span.error) { q('[data-ivc-rstatus]').textContent = span.error; return; }
    const ins = String(opts.rInstrument || '');
    // شاخص پایه با تیک؛ بی قرارداد، شاخص تنها سری است.
    const withIndex = Boolean(opts.rIndex) || !ins;
    // ساخت فقط برای روزهایی که نمایش داده می‌شوند، نه بازهٔ گشادِ پرسش.
    const from = build && rangeView?.key === rangeKey(span) && rangeView.firstDay ? rangeView.firstDay : span.from;
    clearTimeout(slowTimer);
    q('[data-ivc-rstatus]').textContent = build ? 'ساخت روزهای ضبط‌نشده آغاز شد…' : 'در حال دریافت…';
    slowTimer = setTimeout(() => {
      if (my === rangeSeq) q('[data-ivc-rstatus]').textContent = 'در حال دریافت… سرور هنوز پاسخ نداده (رصد لحظه‌ای هم در حال دریافت است)';
    }, 4000);
    try {
      if (!calendar) {
        try { calendar = await (await fetcher('/api/vol/calendar', { cache: 'no-store' })).json(); } catch { calendar = { known: false, holidays: [] }; }
      }
      const [apiC, apiI] = await Promise.all([
        ins ? fetchRangeSeries({ want, from, span, ins, build }) : null,
        withIndex ? fetchRangeSeries({ want, from, span, ins: '', build }) : null,
      ]);
      if (my !== rangeSeq || want !== ua) return;
      const settings = getSettings();
      let pointsC = null, pointsI = null;
      if (apiC) {
        const ctx = intradayContext(settings, { holidays: calendar?.holidays || [], holidaysKnown: Boolean(calendar?.known) });
        pointsC = contractIntradaySeries(apiC.days, ins, ctx);
      }
      if (apiI) pointsI = await indexPoints(apiI, settings);
      if (my !== rangeSeq || want !== ua) return;
      rangeApi = { contract: apiC, index: apiI };
      rangePoints = { contract: pointsC, index: pointsI };
      const primary = apiC || apiI;
      rangeView = { key: rangeKey(span), firstDay: primary.days[0]?.date || 0, ins };
      todayAt = Date.now();
      paintRange();
    } catch (e) {
      if (my !== rangeSeq || e?.name === 'AbortError') return;
      q('[data-ivc-rstatus]').textContent = `دریافت ناموفق بود: ${faDigits(String(e?.message || e))}`;
    } finally {
      if (my === rangeSeq) clearTimeout(slowTimer);
    }
  }

  async function indexPoints(api, settings) {
    const computed = await computeDeskDays(api, settings, calendar);
    return computed.flatMap((d) => d.points.map((pt) => ({ ...pt, date: d.date, source: d.source })));
  }

  // ═══ تازه‌سازی امروزِ نمودار بازه با تیک بازار ═══
  //
  // گزارش آزمون ۴۰b2533، بند ۲: تیک داشبورد نمودار مادر را تازه می‌کرد ولی
  // نمودار بازه روی عدد قدیمی می‌ماند تا «رسم نمودار» زده شود. حالا با هر
  // تیک فقط روزِ امروز دوباره گرفته و جایگزین می‌شود؛ روزهای گذشته دست
  // نمی‌خورند و بزرگ‌نمایی می‌ماند. فاصلهٔ دو دریافت دست‌کم ۱۰ ثانیه است (ضبط
  // هر ۶۰ ثانیه قاب می‌نویسد و سرور پروندهٔ امروز را با اندازه‌اش کش می‌کند)؛
  // تیکِ درون این فاصله گم نمی‌شود و پایانش اجرا می‌شود. بازهٔ کاملاً تاریخی
  // تازه‌سازی نمی‌خواهد.
  const TODAY_EVERY_MS = 10000;
  let todayTimer = null;
  function refreshRangeToday() {
    if (!rangeApi || !rangeView || todayBusy) return;
    const span = rangeDates();
    const t = today();
    if (span.error || rangeView.key !== rangeKey(span) || !(span.to >= t)) return;
    const primary = rangeApi.contract || rangeApi.index;
    if (!primary.days.some((d) => d.date === t)) return;
    const wait = TODAY_EVERY_MS - (Date.now() - todayAt);
    if (wait > 0) {
      if (!todayTimer) todayTimer = setTimeout(() => { todayTimer = null; if (isVisible()) refreshRangeToday(); }, wait);
      return;
    }
    fetchRangeToday(t);
  }
  async function fetchRangeToday(t) {
    const my = rangeSeq, want = ua, ins = rangeView.ins;
    todayAt = Date.now();
    todayBusy = true;
    try {
      const one = { from: t, to: t, keep: 0 };
      const [c, i] = await Promise.all([
        rangeApi.contract ? fetchRangeSeries({ want, from: t, span: one, ins, build: false }) : null,
        rangeApi.index ? fetchRangeSeries({ want, from: t, span: one, ins: '', build: false }) : null,
      ]);
      const dayC = c?.days.find((d) => d.date === t), dayI = i?.days.find((d) => d.date === t);
      const settings = getSettings();
      const ptsC = dayC ? contractIntradaySeries([dayC], ins, intradayContext(settings, { holidays: calendar?.holidays || [], holidaysKnown: Boolean(calendar?.known) })) : null;
      const ptsI = dayI ? await indexPoints({ ...i, days: [dayI] }, settings) : null;
      if (my !== rangeSeq || want !== ua || !rangeApi) return;
      const swap = (api, body, day) => (api && day ? { ...api, days: api.days.map((d) => (d.date === t ? day : d)), nowSecond: body.nowSecond } : api);
      rangeApi = { contract: swap(rangeApi.contract, c, dayC), index: swap(rangeApi.index, i, dayI) };
      const splice = (list, pts) => (list && pts ? [...list.filter((pt) => pt.date !== t), ...pts] : list);
      rangePoints = { contract: splice(rangePoints.contract, ptsC), index: splice(rangePoints.index, ptsI) };
      paintRange();
    } catch { /* تیک بعد دوباره امتحان می‌کند */ } finally { todayBusy = false; }
  }

  /** وضعیت روزهای نمایش‌داده — جمعِ سری قرارداد و شاخص. */
  function rangeState() {
    const apis = [rangeApi?.contract, rangeApi?.index].filter(Boolean);
    const primary = apis[0];
    const days = primary?.days || [];
    const count = (src) => days.filter((d) => d.source === src).length;
    // شمار روزها یکتا (روزی که هم قرارداد و هم شاخص ندارد یک روز است)؛ هزینه
    // جمعِ هر دو، چون هر سری جدا ساخته می‌شود.
    const pendingDays = new Set(), queuedDays = new Set(), failedOf = new Map();
    let cost = 0, building = false;
    for (const api of apis) {
      const p = api.days.filter((d) => d.source === 'pending' && !d.queued);
      const f = api.days.filter((d) => d.source === 'failed');
      const qd = api.days.filter((d) => d.source === 'pending' && d.queued);
      for (const d of p) pendingDays.add(d.date);
      for (const d of qd) queuedDays.add(d.date);
      for (const d of f) if (!failedOf.has(d.date)) failedOf.set(d.date, d);
      cost += (p.length + f.length) * (Number(api.cost?.perDay) || 0);
      if ((api.build?.running || api.build?.queued) && qd.length) building = true;
    }
    return {
      days: days.length, record: count('record'), built: count('trades') + count('book'), none: count('none'),
      pending: pendingDays.size, queued: queuedDays.size, failed: [...failedOf.values()], building, cost, build: primary?.build || {},
    };
  }

  function paintRange() {
    if (!rangeApi) return;
    const st = rangeState();
    const parts = [`${faDigits(st.days)} روز: ${faDigits(st.record)} ضبط زنده، ${faDigits(st.built)} بازسازی‌شده`];
    if (st.pending) parts.push(`${faDigits(st.pending)} ساخته‌نشده`);
    if (st.queued) parts.push(`${faDigits(st.queued)} در صف ساخت`);
    if (st.none) parts.push(`${faDigits(st.none)} بی ضبط (امروز)`);
    if (st.building) parts.push(`ساخت ادامه دارد (${faDigits(st.build.done)} از ${faDigits(st.build.total)})`);
    if (st.failed.length) parts.push(`${faDigits(st.failed.length)} روز ساخته نشد: ${faDigits(st.failed[0].why || '')}`);
    const primaryApi = rangeApi.contract || rangeApi.index;
    if (primaryApi.grainServed?.rebuild && primaryApi.grainServed.rebuild !== primaryApi.grain && st.built) parts.push('روزهای بازسازی‌شده گام ۵ دقیقه دارند');
    const mainPoints = rangePoints.contract || rangePoints.index || [];
    const valid = mainPoints.filter((pt) => isNum(pt.value)).length;
    parts.push(`${faDigits(valid)} از ${faDigits(mainPoints.length)} لحظه نوسان دارد`);
    // زمان آخرین دادهٔ امروز، تا کهنه‌بودن نمودار پنهان نماند.
    const t = today();
    const lastToday = mainPoints.filter((pt) => pt.date === t).at(-1);
    if (lastToday) parts.push(`امروز تا ساعت ${faDigits(momentLabel(lastToday.second))} (با تیک تازه می‌شود)`);
    q('[data-ivc-rstatus]').textContent = parts.join(' · ');
    // بازهٔ بلندتر از سقف هر پاسخ: بازهٔ مؤثر و روزهای کنارمانده گفته می‌شوند (بند ۶).
    const clip = primaryApi.clipped;
    q('[data-ivc-clip]').innerHTML = clip
      ? `<div class="vd-build"><span>بازهٔ خواسته‌شده ${faDigits(fmt.int(clip.asked))} روز معاملاتی است و هر بار حداکثر ${faDigits(fmt.int(clip.served))} روز رسم می‌شود: ${faDigits(fmt.int(clip.served))} روز آخر (از ${esc(dateLabel(clip.from))}) آمد و ${faDigits(fmt.int(clip.dropped))} روز اول (از ${esc(dateLabel(clip.firstAsked))}) کنار ماند.</span>${Number(opts.span) === 0 ? ` <button type="button" class="ghost" data-ivc-range-prev="${clip.from}">روزهای قبل‌تر</button>` : ''}</div>`
      : '';
    const toBuild = st.pending + st.failed.length;
    const go = q('[data-ivc-range-go]');
    go.textContent = toBuild && !st.building
      ? `رسم نمودار و ساخت روزهای ضبط‌نشده (حدود ${faDigits(fmt.int(st.cost))} درخواست)`
      : 'رسم نمودار';
    go.dataset.build = toBuild && !st.building ? '1' : '';
    q('[data-ivc-build]').innerHTML = toBuild && !st.building
      ? `<div class="vd-build"><span>بخشی از روزهای این بازه ضبط زنده ندارد و هنوز از ریزمعامله بازسازی نشده. «رسم نمودار» آن‌ها را می‌سازد (حدود ${faDigits(fmt.int(st.cost))} درخواست به بالادست، یک بار برای همیشه) و نمودار با رسیدن هر روز کامل‌تر می‌شود.</span></div>`
      : '';
    clearTimeout(rangePoll);
    const arm = () => { rangePoll = setTimeout(() => { if (isVisible()) loadRange(); else arm(); }, 8000); };
    if (st.building || st.queued) arm();
    const c = rangeView?.ins ? data?.contracts.find((x) => String(x.ins) === rangeView.ins) : null;
    const contractPoints = rangePoints.contract;
    const days = [...(rangeApi.contract?.days || []), ...(rangeApi.index?.days || [])];
    setChart('range', (echarts, tokens) => (contractPoints
      ? rangeOption(contractPoints, { indexPoints: rangePoints.index, days, grain: opts.grain, label: `نوسان ضمنی ${c ? contractLabel(c) : 'قرارداد'}` }, tokens)
      : rangeOption(rangePoints.index || [], { days, grain: opts.grain, label: INDEX_LABEL }, tokens)),
    toBuild || st.building || st.queued ? 'روزهای این بازه هنوز ساخته نشده‌اند — «رسم نمودار» را بزن؛ نمودار با ساخته‌شدن هر روز پر می‌شود.' : 'در این بازه لحظه‌ای نوسان ضمنی نساخت.',
    rangeView?.key || '');
  }

  return {
    /** با هر تیکِ داشبورد یا ورود به تب. */
    paint() {
      const next = String(getSelection()?.uaIns || '');
      if (next !== ua || !data) { loadDaily(); return; }
      // نمودار بازه از ضبط می‌آید نه از عکس تابلو (مظنه هم عوض می‌شود)، پس
      // تازه‌سازی امروزش به امضای عکس بسته نیست؛ خودش فاصله را نگه می‌دارد.
      refreshRangeToday();
      // فقط «امروز» ممکن است عوض شده باشد: اگر عکس زنده برای همین نماد عوض
      // نشده، نمودارها دست نمی‌خورند (بزرگ‌نمایی کاربر نمی‌پرد).
      const key = liveKey();
      if (key === liveSeen) return;
      liveSeen = key;
      seriesMemo.clear();
      paintMaster();
      paintExpiry();
    },
    resize() { for (const handle of charts.values()) handle.resize(); },
    dispose() { clearTimeout(poll); clearTimeout(rangePoll); clearTimeout(slowTimer); clearTimeout(todayTimer); dailySeq += 1; rangeSeq += 1; dailyCtrl?.abort(); rangeCtrl?.abort(); for (const handle of charts.values()) handle.dispose(); charts.clear(); },
    get ua() { return ua; },
    get data() { return data; },
  };
}
