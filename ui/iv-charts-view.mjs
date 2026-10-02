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
import { parseJalaliRange } from '../core/history-range.mjs';
import { tehranDateNumber } from '../core/tehran-day.mjs';
import { buildVolHistory, panelObservations, liveObservations, volParams, IV_PRICE_BASES } from '../core/vol-rank.mjs';
import { intradayContext } from '../core/vol-intraday.mjs';
import { deskFrom } from '../core/vol-desk.mjs';
import {
  contractDailySeries, underlyingDailySeries, expiriesOf, defaultPicks, contractLabel, contractIntradaySeries,
} from '../core/iv-chart.mjs';
import {
  MASTER_SERIES, RANGE_SPANS, RANGE_GRAINS, instrumentOptionsHtml, masterOption, expiryOption, rangeOption, masterSummary,
} from './iv-charts-options.mjs';

export { masterOption, expiryOption, rangeOption, instrumentOptionsHtml, masterSummary } from './iv-charts-options.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));
const isNum = (value) => Number.isFinite(value);
const dateLabel = (value) => faDigits(historyDateLabel(value));
const STORE = 'options-radar:iv-charts';

// ═══════════════════ سوارکردن ═══════════════════

function loadOpts() {
  const base = {
    instrument: 'index', priceBasis: 'close', show: { iv: true, ma: false, hv: true, price: true, volume: true, oi: true },
    expiry: 0, kind: 'both', withIndex: true, picks: {},
    rInstrument: 'index', span: 5, rFrom: '', rTo: '', grain: 'm5', mode: 'trades',
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    return { ...base, ...saved, show: { ...base.show, ...(saved.show || {}) } };
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
  let range = null, calendar = null, rangeApi = null, rangePoints = [], rangePoll = null, liveSeen = '';
  const charts = new Map();
  const seriesMemo = new Map();

  host.innerHTML = `<div class="ivc">
    <section class="card ivc-master">
      <div class="section-head"><div><p class="eyebrow">نمودار مادر · روزانه</p><h2 data-ivc-title>نوسان ضمنی در طول زمان</h2></div><span data-ivc-status class="note" role="status"></span></div>
      <div class="ivc-controls">
        <label class="ivc-wide">نماد<select data-ivc="instrument"></select></label>
        <label>مبنای قیمت<select data-ivc="priceBasis">${IV_PRICE_BASES.map(([v, t]) => `<option value="${v}"${v === opts.priceBasis ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <div class="ivc-range" data-ivc-range></div>
      </div>
      <div class="ivc-toggles" role="group" aria-label="سری‌های نمودار">${MASTER_SERIES.map(([id, label]) => `<label class="check"><input type="checkbox" data-ivc-show="${id}"${opts.show[id] !== false ? ' checked' : ''}> ${esc(label)}</label>`).join('')}</div>
      <div class="ivc-chart" data-ivc-chart="master"></div>
      <p class="note" data-ivc-summary></p>
    </section>
    <section class="card ivc-expiry">
      <div class="section-head"><div><p class="eyebrow">قراردادهای یک سررسید</p><h3>نوسان ضمنی قراردادها روی هم</h3></div><span class="note">هر قرارداد را با تیک اضافه یا حذف کن؛ همان بازه و مبنای قیمت نمودار مادر</span></div>
      <div class="ivc-controls">
        <label>سررسید<select data-ivc="expiry"></select></label>
        <label>نوع<select data-ivc="kind"><option value="both">خرید و فروش</option><option value="call">فقط خرید (کال)</option><option value="put">فقط فروش (پوت)</option></select></label>
        <label class="check"><input type="checkbox" data-ivc="withIndex"${opts.withIndex ? ' checked' : ''}> شاخص پایه هم</label>
        <div class="ivc-buttons"><button type="button" class="ghost" data-ivc-pick="near">نزدیک به پول</button><button type="button" class="ghost" data-ivc-pick="all">همه</button><button type="button" class="ghost" data-ivc-pick="none">هیچ</button></div>
      </div>
      <div class="ivc-chips" data-ivc-chips></div>
      <div class="ivc-chart" data-ivc-chart="expiry"></div>
    </section>
    <section class="card ivc-intraday">
      <div class="section-head"><div><p class="eyebrow">بازه و تایم‌فریم</p><h3>نوسان ضمنی در بازهٔ دلخواه</h3></div><span class="note">امروز از ضبط زنده؛ روزهای ضبط‌نشده از بازسازی ریزمعامله (با دکمه، هزینه پیش از آن گفته می‌شود)</span></div>
      <div class="ivc-controls">
        <label class="ivc-wide">نماد<select data-ivc="rInstrument"></select></label>
        <label>بازه<select data-ivc="span">${RANGE_SPANS.map(([v, t]) => `<option value="${v}"${Number(v) === Number(opts.span) ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label data-ivc-custom>از (شمسی)<input type="text" data-ivc="rFrom" dir="ltr" placeholder="۱۴۰۵/۰۷/۰۱" value="${esc(opts.rFrom)}"></label>
        <label data-ivc-custom>تا (شمسی)<input type="text" data-ivc="rTo" dir="ltr" placeholder="۱۴۰۵/۰۷/۰۹" value="${esc(opts.rTo)}"></label>
        <label>تایم‌فریم<select data-ivc="grain">${RANGE_GRAINS.map(([v, t]) => `<option value="${v}"${v === opts.grain ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>بازسازی از<select data-ivc="mode"><option value="trades"${opts.mode === 'trades' ? ' selected' : ''}>ریزمعامله</option><option value="book"${opts.mode === 'book' ? ' selected' : ''}>دفتر سفارش + ریزمعامله</option></select></label>
        <button type="button" class="primary" data-ivc-range-go>رسم نمودار</button>
      </div>
      <p class="note" data-ivc-rstatus role="status"></p>
      <div data-ivc-build></div>
      <div class="ivc-chart" data-ivc-chart="range"></div>
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
    else if (key === 'rInstrument' || key === 'grain' || key === 'mode') loadRange();
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
    if (event.target.closest('[data-ivc-range-go]')) { loadRange(); return; }
    if (event.target.closest('[data-ivc-build-go]')) loadRange({ build: true });
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
      data = null; seriesMemo.clear(); rangeApi = null; rangePoints = [];
      for (const handle of charts.values()) handle.dispose();
      charts.clear();
      // نماد تازه: قرارداد انتخابی نقشه پیش‌فرض نمودار مادر می‌شود.
      opts = { ...opts, instrument: sel.contractIns ? String(sel.contractIns) : 'index', rInstrument: sel.contractIns ? String(sel.contractIns) : 'index', expiry: Number(sel.endDate) || 0 };
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
    if (opts.instrument !== 'index' && !contracts.some((c) => String(c.ins) === String(opts.instrument))) opts.instrument = 'index';
    if (opts.rInstrument !== 'index' && !contracts.some((c) => String(c.ins) === String(opts.rInstrument))) opts.rInstrument = 'index';
    field('instrument').innerHTML = instrumentOptionsHtml(contracts, opts.instrument, { uaName: uaName(), today: t });
    field('rInstrument').innerHTML = instrumentOptionsHtml(contracts, opts.rInstrument, { uaName: uaName(), today: t });
    const expiries = expiriesOf(contracts, t);
    if (!expiries.includes(Number(opts.expiry))) opts.expiry = expiries[0] || 0;
    field('expiry').innerHTML = expiries.map((e) => `<option value="${e}"${e === Number(opts.expiry) ? ' selected' : ''}>${dateLabel(e)}${e < t ? ' (سررسیدشده)' : ''}</option>`).join('');
    const name = uaName();
    q('[data-ivc-title]').textContent = name ? `نوسان ضمنی در طول زمان · ${name}` : 'نوسان ضمنی در طول زمان';
    const b = data.api;
    q('[data-ivc-status]').textContent = `${faDigits(b.have)} از ${faDigits(b.days)} روز پروندهٔ قیمت دارد${b.build?.running || b.build?.queued ? ` · ساخت ادامه دارد (${faDigits(b.build.done)} از ${faDigits(b.build.total)})` : b.missing ? ` · ${faDigits(b.missing)} روز هنوز نیست` : ''} · ${faDigits(data.contracts.length)} قرارداد`;
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
    const rows = underlyingDailySeries(history, { baseRows: data.baseRows, oi: data.oi, from: data.from });
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
      contract, panels: data.panels, baseRows: data.baseRows, oi: data.oi, priceBasis: opts.priceBasis, settings: getSettings(), days,
      live: lc ? { date: live.date, spot: live.spot, price: opts.priceBasis === 'last' ? Number(lc.tradeLast) : Number(lc.close), volume: Number(lc.volume), oi: Number(lc.oi) } : null,
    });
    seriesMemo.set(key, rows);
    return rows;
  }

  async function setChart(key, build, empty) {
    charts.get(key)?.dispose();
    charts.delete(key);
    const handle = await mountChart(q(`[data-ivc-chart="${key}"]`), build, { empty });
    if (handle) charts.set(key, handle);
  }

  function paintMaster() {
    if (!data) return;
    const index = opts.instrument === 'index';
    const contract = index ? null : data.contracts.find((c) => String(c.ins) === String(opts.instrument));
    const rows = index ? indexRows() : contractRows(opts.instrument);
    const title = index ? `شاخص نوسان ضمنی ${uaName()}` : `تاریخچهٔ قرارداد ${contract ? contractLabel(contract) : ''}`;
    q('[data-ivc-summary]').textContent = masterSummary(rows);
    host.querySelector('[data-ivc-show="hv"]').closest('label').hidden = !index;
    setChart('master', (echarts, tokens) => masterOption(rows, { show: opts.show, title, index }, tokens),
      'در این بازه نوسان ضمنی ساخته نشد — پوشش پرونده‌ها را در خط وضعیت ببین.');
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
      picked.size ? 'قراردادهای انتخاب‌شده در این بازه نوسان ضمنی نساختند.' : 'دست‌کم یک قرارداد را تیک بزن.');
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

  async function loadRange({ build = false } = {}) {
    if (!ua) return;
    const want = ua;
    const my = ++rangeSeq;
    rangeCtrl?.abort();
    rangeCtrl = typeof AbortController === 'function' ? new AbortController() : null;
    const span = rangeDates();
    if (span.error) { q('[data-ivc-rstatus]').textContent = span.error; return; }
    const ins = opts.rInstrument === 'index' ? '' : String(opts.rInstrument);
    q('[data-ivc-rstatus]').textContent = 'در حال دریافت…';
    try {
      if (!calendar) {
        try { calendar = await (await fetcher('/api/vol/calendar', { cache: 'no-store' })).json(); } catch { calendar = { known: false, holidays: [] }; }
      }
      const url = `/api/vol/intraday?ua=${encodeURIComponent(want)}&from=${span.from}&to=${span.to}&grain=${opts.grain}&mode=${opts.mode}${ins ? `&ins=${ins}` : ''}${build ? '&build=1' : ''}`;
      const response = await fetcher(url, { cache: 'no-store', signal: rangeCtrl?.signal });
      const body = await response.json();
      if (my !== rangeSeq || want !== ua) return;
      if (!response.ok || body.error) throw new Error(body.error || `HTTP ${response.status}`);
      if (String(body.ua) !== want || String(body.ins || '') !== ins) return;
      // «N روز اخیر» یعنی N روز معاملاتیِ آخر؛ بازه را گشاد گرفتیم.
      const days = span.keep ? body.days.slice(-span.keep) : body.days;
      const api = { ...body, days };
      const settings = getSettings();
      let points;
      if (ins) {
        const ctx = intradayContext(settings, { holidays: calendar?.holidays || [], holidaysKnown: Boolean(calendar?.known) });
        points = contractIntradaySeries(days, ins, ctx);
      } else {
        const computed = await computeDeskDays(api, settings, calendar);
        points = computed.flatMap((d) => d.points.map((pt) => ({ ...pt, date: d.date })));
      }
      if (my !== rangeSeq || want !== ua) return;
      rangeApi = api;
      rangePoints = points;
      paintRange();
    } catch (e) {
      if (my !== rangeSeq || e?.name === 'AbortError') return;
      q('[data-ivc-rstatus]').textContent = `دریافت ناموفق بود: ${faDigits(String(e?.message || e))}`;
    }
  }

  function paintRange() {
    if (!rangeApi) return;
    const count = (src) => rangeApi.days.filter((d) => d.source === src).length;
    const rec = count('record'), built = count('trades') + count('book'), pending = count('pending');
    const parts = [`${faDigits(rangeApi.days.length)} روز: ${faDigits(rec)} ضبط زنده، ${faDigits(built)} بازسازی‌شده${pending ? `، ${faDigits(pending)} ساخته‌نشده` : ''}`];
    if (rangeApi.build?.running || rangeApi.build?.queued) parts.push(`ساخت ادامه دارد (${faDigits(rangeApi.build.done)} از ${faDigits(rangeApi.build.total)})`);
    if (rangeApi.grainServed?.rebuild && rangeApi.grainServed.rebuild !== rangeApi.grain) parts.push('روزهای بازسازی‌شده گام ۵ دقیقه دارند');
    const valid = rangePoints.filter((pt) => isNum(pt.value)).length;
    parts.push(`${faDigits(valid)} از ${faDigits(rangePoints.length)} لحظه نوسان دارد`);
    q('[data-ivc-rstatus]').textContent = parts.join(' · ');
    q('[data-ivc-build]').innerHTML = pending && !(rangeApi.build?.running || rangeApi.build?.queued)
      ? `<div class="vd-build"><span>${faDigits(pending)} روزِ گذشته ضبط نشده و هنوز بازسازی نشده. ساختشان حدود ${faDigits(fmt.int(rangeApi.cost?.requests || 0))} درخواست به بالادست می‌زند و یک بار برای همیشه ذخیره می‌شود.</span><button type="button" class="primary" data-ivc-build-go>ساخت روزهای گذشته</button></div>`
      : '';
    clearTimeout(rangePoll);
    if (rangeApi.build?.running || rangeApi.build?.queued) rangePoll = setTimeout(() => { if (isVisible()) loadRange(); }, 8000);
    const ins = opts.rInstrument === 'index' ? '' : String(opts.rInstrument);
    const c = ins ? data?.contracts.find((x) => String(x.ins) === ins) : null;
    setChart('range', (echarts, tokens) => rangeOption(rangePoints, { grain: opts.grain, label: c ? `نوسان ضمنی ${contractLabel(c)}` : 'شاخص نوسان ضمنی' }, tokens),
      pending ? 'روزهای این بازه هنوز ساخته نشده‌اند — دکمهٔ «ساخت روزهای گذشته».' : 'در این بازه لحظه‌ای نوسان ضمنی نساخت.');
  }

  return {
    /** با هر تیکِ داشبورد یا ورود به تب. */
    paint() {
      const next = String(getSelection()?.uaIns || '');
      if (next !== ua || !data) { loadDaily(); return; }
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
    dispose() { clearTimeout(poll); clearTimeout(rangePoll); dailySeq += 1; rangeSeq += 1; dailyCtrl?.abort(); rangeCtrl?.abort(); for (const handle of charts.values()) handle.dispose(); charts.clear(); },
    get ua() { return ua; },
    get data() { return data; },
  };
}
