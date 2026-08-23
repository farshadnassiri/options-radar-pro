// داشبورد زنده بازار و مسیر انتخاب پایه ← سررسید ← قرارداد.
//
// عکس کل بازار از جریان دیده‌بان می‌آید؛ مسیر تجمعی از ریزمعامله‌های واقعی
// امروز. جزئیات قرارداد فقط پس از کلیک کاربر گرفته می‌شود تا بازار با صدها
// درخواست بی‌هدف کوبیده نشود.

import { fmt, faDigits, faClock } from '/ui/fmt.mjs';
import { makeTable } from '/ui/table.mjs';
import { onChain, pushRows, chainDetail } from '/ui/scanner.mjs';
import {
  liveOptionTape, liveQuoteIv, liveReferenceTape, marketBreadthSnapshot,
} from '/core/live-market.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { breadthBars, breadthDonut, liveChart, moverBars } from '/ui/tabs/live-market.mjs';
import { logError } from '/ui/errlog.mjs';

const COLORS = ['var(--accent)', 'var(--cmp1)', 'var(--cmp2)', 'var(--cmp3)', 'var(--cmp4)', 'var(--gain)', 'var(--loss)', 'var(--warn)'];
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const kindLabel = (kind) => kind === 'call' ? 'اختیار خرید' : kind === 'put' ? 'اختیار فروش' : 'نماد پایه';
const timeLabel = (value, seconds = false) => {
  const raw = String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(6, '0').slice(-6);
  return faDigits(seconds ? `${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4)}` : `${raw.slice(0, 2)}:${raw.slice(2, 4)}`);
};
const dateLabel = (value) => faDigits(historyDateLabel(value));
const changePct = (price, yday) => Number(price) > 0 && Number(yday) > 0 ? ((Number(price) / Number(yday)) - 1) * 100 : NaN;

const SUMMARY_COLS = [
  { key: 'name', label: 'نماد', fmt: 'sym', group: 'شناسه' },
  { key: 'kindLabel', label: 'نوع', fmt: 'text', group: 'شناسه' },
  { key: 'expiryLabel', label: 'سررسید', fmt: 'text', group: 'شناسه' },
  { key: 'strike', label: 'قیمت اعمال', fmt: 'money', group: 'شناسه' },
  { key: 'lastTimeLabel', label: 'آخرین زمان', fmt: 'text', group: 'امروز' },
  { key: 'lastPrice', label: 'آخرین', fmt: 'money', group: 'امروز' },
  { key: 'changePct', label: 'تغییر از اولین معامله ٪', fmt: 'pct', group: 'امروز', heat: 'prob' },
  { key: 'low', label: 'کمترین', fmt: 'money', group: 'امروز' },
  { key: 'high', label: 'بیشترین', fmt: 'money', group: 'امروز' },
  { key: 'vwap', label: 'میانگین موزون', fmt: 'money', group: 'امروز' },
  { key: 'count', label: 'تعداد معامله', fmt: 'int', group: 'گردش', heat: 'gain' },
  { key: 'volume', label: 'حجم', fmt: 'int', group: 'گردش', heat: 'gain' },
  { key: 'value', label: 'ارزش', fmt: 'money', group: 'گردش', heat: 'gain' },
  { key: 'ivPct', label: 'آخرین تلاطم ضمنی ٪', fmt: 'pct', group: 'مدل', heat: 'prob' },
];

const TAPE_COLS = [
  { key: 'timeLabel', label: 'زمان', fmt: 'text', group: 'معامله' },
  { key: 'name', label: 'نماد', fmt: 'sym', group: 'معامله' },
  { key: 'sequence', label: 'شماره معامله', fmt: 'int', group: 'معامله' },
  { key: 'price', label: 'قیمت', fmt: 'money', group: 'معامله' },
  { key: 'quantity', label: 'حجم', fmt: 'int', group: 'معامله' },
  { key: 'value', label: 'ارزش', fmt: 'money', group: 'معامله' },
  { key: 'cumulativeVolume', label: 'حجم تجمعی', fmt: 'int', group: 'تجمعی' },
  { key: 'cumulativeValue', label: 'ارزش تجمعی', fmt: 'money', group: 'تجمعی' },
  { key: 'strike', label: 'اعمال', fmt: 'money', group: 'اختیار' },
  { key: 'expiryLabel', label: 'سررسید', fmt: 'text', group: 'اختیار' },
  { key: 'basePrice', label: 'آخرین پایه پیش از معامله', fmt: 'money', group: 'اختیار' },
  { key: 'ivPct', label: 'تلاطم ضمنی ٪', fmt: 'pct', group: 'اختیار', heat: 'prob' },
];

const contractList = (expiry) => (expiry?.strikes || []).flatMap((strike) => [
  { ...strike.call, strike: strike.strike, size: strike.size, days: expiry.days, endDate: expiry.endDate },
  { ...strike.put, strike: strike.strike, size: strike.size, days: expiry.days, endDate: expiry.endDate },
]).filter((contract) => contract.ins && (Number(contract.vol) > 0 || Number(contract.trades) > 0))
  .sort((a, b) => a.strike - b.strike || a.kind.localeCompare(b.kind));

export async function mount(root, { state, api }) {
  root.innerHTML = `<section class="live-dashboard-hero"><div><p class="eyebrow">تصویر کل بازار اختیار و دارایی‌های پایه</p><h1>داشبورد معاملاتی لحظه‌ای</h1><p>تعداد نمادهای مثبت و منفی، گردش بازار و مسیر تجمعی از اولین معاملات امروز. نماد بدون معامله از درصد جهت بازار کنار گذاشته می‌شود.</p></div><div><button type="button" class="ghost" id="lm-dashboard-refresh">بازسازی مسیر امروز</button><span id="lm-dashboard-status" role="status">در انتظار جریان بازار…</span></div></section>
    <div class="kpis live-dashboard-kpis" id="lm-market-kpis"></div>
    <div class="live-dashboard-overview"><section class="card"><div class="section-head"><div><p class="eyebrow">وسعت بازار</p><h2>مثبت، منفی و بدون تغییر</h2></div><span>درصد از نمادهای معامله‌شده</span></div><div id="lm-breadth-donut"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">قدرت دو سوی بازار</p><h2>تعداد، حجم و ارزش</h2></div></div><div id="lm-breadth-bars"></div></section></div>
    <div class="live-market-chart-grid live-dashboard-charts"><section class="card"><div class="section-head"><h3>درصد نمادهای مثبت و منفی</h3><span>از اولین معامله امروز</span></div><div id="lm-breadth-pct"></div></section><section class="card"><div class="section-head"><h3>شاخص خالص وسعت بازار</h3><span>مثبت منهای منفی</span></div><div id="lm-breadth-line"></div></section><section class="card"><div class="section-head"><h3>گردش تجمعی نمادهای پایه</h3><span>حجم واقعی معاملات</span></div><div id="lm-market-volume"></div></section><section class="card"><div class="section-head"><h3>بیشترین تغییرات امروز</h3><span>نسبت به قیمت دیروز</span></div><div id="lm-movers"></div></section></div>
    <section class="card live-market-picker"><div class="section-head"><div><p class="eyebrow">مسیر انتخاب</p><h2>نماد پایه ← سررسید ← قرارداد</h2></div><div class="live-market-actions"><button type="button" class="ghost" id="lm-refresh">دریافت معامله‌های قرارداد</button><button type="button" class="ghost" id="lm-toggle">توقف خودکار</button></div></div>
      <label class="live-base-search">جست‌وجوی نماد پایه<input id="lm-base-search" type="search" placeholder="نام نماد پایه"></label><div id="lm-base-rail" class="live-base-rail"></div>
      <div class="live-selection-step"><span>سررسیدهای دارای معامله</span><div id="lm-expiry-rail" class="live-expiry-rail"></div></div>
      <div class="live-selection-step"><span>قراردادهای معامله‌شده سررسید</span><div id="lm-contract-table" class="history-table-wrap"></div></div>
      <p class="note" id="lm-status" role="status">برای دیدن ریزمعامله و نمودار، یک قرارداد را انتخاب کن.</p></section>
    <section id="lm-contract-detail" hidden>
      <div class="kpis" id="lm-contract-kpis"></div>
      <div class="live-market-chart-grid"><section class="card"><div class="section-head"><h3>تغییر قیمت پایه و قرارداد</h3><span>از اولین معامله هر نماد</span></div><div id="lm-price-chart"></div></section><section class="card"><div class="section-head"><h3>تلاطم ضمنی قرارداد</h3><span>با آخرین پایه در ثانیه قبلی</span></div><div id="lm-iv-chart"></div></section><section class="card live-market-wide"><div class="section-head"><h3>حجم تجمعی پایه و قرارداد</h3><span>از شروع بازار</span></div><div id="lm-volume-chart"></div></section></div>
      <section class="card"><div class="section-head"><div><p class="eyebrow">عکس قرارداد</p><h3>خلاصه پایه و قرارداد انتخابی</h3></div></div><div id="lm-summary"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">نوار کامل قرارداد</p><h3 id="lm-tape-title">معاملات و تلاطم ضمنی</h3></div><span>ردیف تازه در دریافت بعدی مشخص می‌شود</span></div><div id="lm-tape"></div><p class="note">IV فقط با معامله پایه در ثانیه‌ای زودتر ساخته می‌شود؛ ترتیب دو نماد در یک ثانیه معلوم نیست. آخرین معامله مرجع مشاهده بازار است، نه قیمت تضمین‌شده آفست.</p></section>
    </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const summaryTable = makeTable($('lm-summary'), SUMMARY_COLS, { all: SUMMARY_COLS, sortKey: 'value', storeKey: 'live-dashboard:summary', exportName: 'live-dashboard-summary' });
  const tapeTable = makeTable($('lm-tape'), TAPE_COLS, { all: TAPE_COLS, sortKey: 'sequence', storeKey: 'live-dashboard:tape', exportName: 'live-dashboard-tape' });
  summaryTable.setEmptyMessage('هنوز خلاصه‌ای دریافت نشده است.');
  tapeTable.setEmptyMessage('برای این قرارداد معامله معتبری دریافت نشده است.');

  let underlyings = [], chainStats = {}, timeline = [], breadthProof = new Map(), detail = null;
  let selectedUa = '', selectedExpiry = '', selectedContract = '', snapshots = {};
  let previousKeys = new Set(), loading = false, dashboardLoading = false, paused = false;
  let refreshTimer = null, dashboardTimer = null, loadSeq = 0, lastDetailSync = 0;
  const intervalMs = Math.max(3000, Math.min(30000, Number(state.settings.watchIntervalSec || 5) * 1000));

  function paintDashboard(at = Date.now()) {
    // جریان دیده‌بان قیمت پایه را هر چند ثانیه تازه می‌کند، اما حجم پایه در
    // آن endpoint نیست. اثبات «امروز معامله شده» از نوار داشبورد می‌آید و
    // قیمت تازه از جریان روی آن می‌نشیند؛ جهت زنده می‌ماند، حجم ساخته نمی‌شود.
    const breadthRows = underlyings.map((item) => {
      const proof = breadthProof.get(String(item.ins));
      return proof ? { ...item, uaVolume: proof.volume, uaValue: proof.value, uaTrades: proof.trades } : item;
    });
    const summary = marketBreadthSnapshot(breadthRows);
    const callVolume = underlyings.reduce((sum, item) => sum + Number(item.callVol || 0), 0);
    const putVolume = underlyings.reduce((sum, item) => sum + Number(item.putVol || 0), 0);
    const cards = [
      ['مثبت', `${fmt.int(summary.positive)} · ${fmt.pct(summary.positivePct)}٪`, 'از معامله‌شده‌ها'],
      ['منفی', `${fmt.int(summary.negative)} · ${fmt.pct(summary.negativePct)}٪`, 'از معامله‌شده‌ها'],
      ['شاخص وسعت', fmt.int(summary.breadth), 'مثبت منهای منفی'],
      ['نماد پایه معامله‌شده', `${fmt.int(summary.traded)} از ${fmt.int(summary.total)}`, `${fmt.int(summary.untraded)} بی‌معامله`],
      ['حجم اختیار', fmt.int(chainStats.vol), `${fmt.int(chainStats.contracts)} قرارداد`],
      ['نسبت حجم پوت به کال', callVolume > 0 ? fmt.num(putVolume / callVolume) : '—', `${fmt.int(putVolume)} / ${fmt.int(callVolume)}`],
      ['ارزش اختیار', fmt.money(chainStats.value), 'ریال'],
      ['آخرین عکس', at ? faClock(new Date(at)) : '—', state.watch.stale ? 'عکس آخرین جلسه' : 'جریان زنده'],
    ];
    $('lm-market-kpis').innerHTML = cards.map(([key, value, sub]) => `<div class="kpi"><div class="k">${key}</div><div class="v">${value}</div><div class="s">${sub}</div></div>`).join('');
    breadthDonut($('lm-breadth-donut'), summary);
    breadthBars($('lm-breadth-bars'), summary);
    moverBars($('lm-movers'), summary);
    if (!timeline.length) return;
    liveChart($('lm-breadth-pct'), [
      { label: 'مثبت', color: 'var(--gain)', points: timeline.map((row) => ({ ...row, value: row.positivePct })) },
      { label: 'منفی', color: 'var(--loss)', points: timeline.map((row) => ({ ...row, value: row.negativePct })) },
    ], { valueFmt: fmt.pct, unit: 'درصد نمادهای معامله‌شده' });
    liveChart($('lm-breadth-line'), [{ label: 'خالص وسعت', color: 'var(--accent)', points: timeline.map((row) => ({ ...row, value: row.breadth })) }], { valueFmt: fmt.int, unit: 'تعداد نماد' });
    liveChart($('lm-market-volume'), [{ label: 'حجم تجمعی پایه‌ها', color: 'var(--cmp2)', points: timeline.map((row) => ({ ...row, value: row.cumulativeVolume })) }], { valueFmt: fmt.int, unit: 'حجم تجمعی', zeroFloor: true });
  }

  async function fetchDashboardHistory() {
    if (dashboardLoading) return;
    dashboardLoading = true; $('lm-dashboard-refresh').disabled = true;
    $('lm-dashboard-status').textContent = 'در حال بازسازی مسیر دقیقه‌ای از معاملات امروز…';
    try {
      const response = await fetch('/api/live-dashboard', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `خطای شبکه ${faDigits(response.status)}`);
      timeline = payload.timeline || [];
      breadthProof = new Map((payload.snapshot?.rows || []).map((row) => [String(row.ins), row]));
      paintDashboard(payload.at);
      $('lm-dashboard-status').textContent = `${fmt.int(timeline.length)} دقیقه از شروع معاملات · ${fmt.int(payload.traded)} نماد معامله‌شده${payload.failed?.length ? ` · ${fmt.int(payload.failed.length)} نوار ناموفق` : ''}`;
    } catch (error) {
      $('lm-dashboard-status').textContent = `مسیر تجمعی دریافت نشد: ${error.message}`;
      logError('داشبورد زنده بازار', error);
    } finally { dashboardLoading = false; $('lm-dashboard-refresh').disabled = false; }
  }

  function renderBaseRail() {
    const query = $('lm-base-search').value.trim();
    const rows = underlyings.filter((item) => !query || item.name.includes(query));
    $('lm-base-rail').innerHTML = rows.length ? rows.map((item) => `<button type="button" data-base="${esc(item.ins)}" aria-pressed="${item.ins === selectedUa}"><b>${esc(item.name)}</b><small class="${Number(item.changePct) >= 0 ? 'gain' : 'loss'}">${fmt.pct(item.changePct)}٪ · حجم اختیار ${fmt.int(item.volume)}</small></button>`).join('') : '<p class="empty-note">نمادی با این جست‌وجو نیست.</p>';
  }

  const availableExpiries = () => (detail?.expiries || []).filter((expiry) => contractList(expiry).length);
  function renderExpiryRail() {
    const expiries = availableExpiries();
    $('lm-expiry-rail').innerHTML = expiries.length ? expiries.map((expiry) => `<button type="button" data-expiry="${expiry.endDate}" aria-pressed="${String(expiry.endDate) === selectedExpiry}"><b>${dateLabel(expiry.endDate)}</b><small>${fmt.int(expiry.days)} روز · ${fmt.int(contractList(expiry).length)} قرارداد</small></button>`).join('') : '<p class="empty-note">این پایه سررسید دارای معامله ندارد.</p>';
  }

  const activeExpiry = () => availableExpiries().find((expiry) => String(expiry.endDate) === selectedExpiry);
  const activeContracts = () => contractList(activeExpiry());
  const activeContract = () => activeContracts().find((contract) => String(contract.ins) === selectedContract);

  function renderContractTable() {
    const rows = activeContracts();
    if (!rows.length) { $('lm-contract-table').innerHTML = '<p class="empty-note">در این سررسید قرارداد معامله‌شده‌ای نیست.</p>'; return; }
    const basePrice = Number(detail?.last || detail?.close);
    $('lm-contract-table').innerHTML = `<table class="history-table live-contract-table"><thead><tr><th>نماد</th><th>نوع</th><th>اعمال</th><th>آخرین</th><th>تغییر با دیروز</th><th>تقاضا / عرضه</th><th>حجم</th><th>معامله</th><th>ارزش</th><th>موقعیت باز</th><th>IV عکس بازار</th></tr></thead><tbody>${rows.map((contract) => {
      const price = Number(contract.last || contract.close);
      const delta = changePct(price, contract.yday);
      const ivPct = liveQuoteIv(contract, basePrice, state.settings);
      return `<tr data-contract="${esc(contract.ins)}" tabindex="0" aria-selected="${String(contract.ins) === selectedContract}"><td><b>${esc(contract.name)}</b><small>${esc(contract.ins)}</small></td><td>${kindLabel(contract.kind)}</td><td>${fmt.money(contract.strike)}</td><td>${fmt.money(price)}</td><td class="${delta >= 0 ? 'gain' : 'loss'}">${fmt.pct(delta)}٪</td><td>${fmt.money(contract.bid)} / ${fmt.money(contract.ask)}</td><td>${fmt.int(contract.vol)}</td><td>${fmt.int(contract.trades)}</td><td>${fmt.money(contract.value)}</td><td>${fmt.int(contract.oi)}</td><td>${fmt.pct(ivPct)}٪</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  async function chooseUnderlying(ins, preserve = false) {
    const seq = ++loadSeq;
    selectedUa = String(ins || ''); detail = null; snapshots = {}; previousKeys = new Set();
    if (!preserve) { selectedExpiry = ''; selectedContract = ''; }
    renderBaseRail(); $('lm-status').textContent = 'در حال دریافت سررسیدهای نماد پایه…';
    const result = await chainDetail(selectedUa);
    if (seq !== loadSeq) return;
    if (result.error) { $('lm-status').textContent = result.error; return; }
    detail = result.ua; lastDetailSync = Date.now();
    const expiries = availableExpiries();
    if (!expiries.some((expiry) => String(expiry.endDate) === selectedExpiry)) selectedExpiry = String(expiries[0]?.endDate || '');
    const contracts = activeContracts();
    if (!contracts.some((contract) => String(contract.ins) === selectedContract)) selectedContract = String(contracts[0]?.ins || '');
    renderExpiryRail(); renderContractTable();
    if (selectedContract) await refreshContract();
    else { $('lm-contract-detail').hidden = true; $('lm-status').textContent = 'برای این پایه قرارداد معامله‌شده‌ای در عکس فعلی نیست.'; }
  }

  async function syncDetail() {
    if (!selectedUa || Date.now() - lastDetailSync < 30000 || loading) return;
    await chooseUnderlying(selectedUa, true);
  }

  function paintContract(payload) {
    snapshots = payload.items || {};
    const contract = activeContract();
    if (!contract || !detail) return;
    const baseRows = snapshots[selectedUa]?.rows || [];
    const optionRows = snapshots[selectedContract]?.rows || [];
    const baseTape = liveReferenceTape(baseRows, { ins: detail.ins, name: detail.name, kind: 'underlying' });
    const optionTape = liveOptionTape({ trades: optionRows, baseTrades: baseRows, contract, settings: state.settings });
    const baseSummary = snapshots[selectedUa]?.summary || {};
    const optionSummary = snapshots[selectedContract]?.summary || {};
    const lastIv = [...optionTape].reverse().find((row) => Number.isFinite(row.ivPct))?.ivPct;
    const rows = [
      { id: detail.ins, name: detail.name, kindLabel: 'نماد پایه', expiryLabel: '—', strike: NaN, ...baseSummary, ivPct: NaN },
      { id: contract.ins, name: contract.name, kindLabel: kindLabel(contract.kind), expiryLabel: dateLabel(contract.endDate), strike: contract.strike, ...optionSummary, ivPct: lastIv },
    ].map((row) => ({ ...row, lastTimeLabel: row.lastTime ? timeLabel(row.lastTime, true) : '—' }));
    summaryTable.set(rows);
    const tapeRows = optionTape.map((row) => ({
      ...row, expiryLabel: dateLabel(contract.endDate), timeLabel: timeLabel(row.time, true),
      __flash: previousKeys.size > 0 && !previousKeys.has(row.id),
    }));
    previousKeys = new Set(tapeRows.map((row) => row.id));
    tapeTable.set(tapeRows);
    $('lm-tape-title').textContent = `معاملات ${contract.name} و تلاطم ضمنی هر ردیف`;
    const last = optionTape.at(-1);
    const cards = [
      ['قرارداد', contract.name, `${kindLabel(contract.kind)} · ${dateLabel(contract.endDate)}`],
      ['آخرین قیمت', fmt.money(optionSummary.lastPrice), last?.time ? timeLabel(last.time, true) : '—'],
      ['تغییر با دیروز', `${fmt.pct(changePct(optionSummary.lastPrice, contract.yday))}٪`, 'بر پایه قیمت دیروز تابلو'],
      ['حجم امروز', fmt.int(optionSummary.volume), `${fmt.int(optionSummary.count)} معامله`],
      ['ارزش امروز', fmt.money(optionSummary.value), 'ریال'],
      ['IV آخرین معامله معتبر', Number.isFinite(lastIv) ? `${fmt.pct(lastIv)}٪` : '—', 'پایه در ثانیه قبلی'],
      ['آخرین دریافت', faClock(new Date(payload.at)), state.watch.stale ? 'عکس آخرین جلسه' : 'زنده'],
    ];
    $('lm-contract-kpis').innerHTML = cards.map(([key, value, sub]) => `<div class="kpi"><div class="k">${key}</div><div class="v">${value}</div><div class="s">${sub}</div></div>`).join('');
    const priceSeries = [
      { instrument: detail, tape: baseTape }, { instrument: contract, tape: optionTape },
    ].map(({ instrument, tape }, index) => ({
      label: instrument.name, color: COLORS[index],
      points: tape.map((row) => ({ ...row, value: tape[0]?.price > 0 ? ((row.price / tape[0].price) - 1) * 100 : NaN })),
    }));
    liveChart($('lm-price-chart'), priceSeries, { valueFmt: fmt.pct, unit: 'درصد تغییر' });
    liveChart($('lm-iv-chart'), [{ label: contract.name, color: 'var(--accent)', points: optionTape.map((row) => ({ ...row, value: row.ivPct })) }], { valueFmt: fmt.pct, unit: 'درصد تلاطم سالانه' });
    liveChart($('lm-volume-chart'), [
      { label: detail.name, color: 'var(--cmp1)', points: baseTape.map((row) => ({ ...row, value: row.cumulativeVolume })) },
      { label: contract.name, color: 'var(--accent)', points: optionTape.map((row) => ({ ...row, value: row.cumulativeVolume })) },
    ], { valueFmt: fmt.int, unit: 'حجم تجمعی', zeroFloor: true });
    $('lm-contract-detail').hidden = false;
  }

  async function refreshContract() {
    if (loading || !detail || !selectedContract) return;
    loading = true; $('lm-refresh').disabled = true;
    try {
      const response = await fetch(`/api/live-trades?ins=${encodeURIComponent(`${selectedUa},${selectedContract}`)}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `خطای شبکه ${faDigits(response.status)}`);
      paintContract(payload);
      const failed = Object.values(payload.items || {}).filter((item) => item.error).length;
      $('lm-status').textContent = failed
        ? `${fmt.int(failed)} نماد پاسخ نداد؛ داده دیگر نماد به‌روز شد.`
        : `قرارداد در ${faClock(new Date(payload.at))} به‌روز شد · دریافت بعدی ${fmt.int(intervalMs / 1000)} ثانیه دیگر.`;
    } catch (error) {
      $('lm-status').textContent = `دریافت معاملات قرارداد ناموفق بود: ${error.message}`;
      logError('جزئیات زنده قرارداد', error);
    } finally { loading = false; $('lm-refresh').disabled = false; }
  }

  function schedule() {
    clearInterval(refreshTimer);
    if (!paused) refreshTimer = setInterval(refreshContract, intervalMs);
    $('lm-toggle').textContent = paused ? 'شروع خودکار' : 'توقف خودکار';
  }

  $('lm-dashboard-refresh').addEventListener('click', fetchDashboardHistory);
  $('lm-refresh').addEventListener('click', refreshContract);
  $('lm-toggle').addEventListener('click', () => { paused = !paused; schedule(); });
  $('lm-base-search').addEventListener('input', renderBaseRail);
  $('lm-base-rail').addEventListener('click', (event) => { const button = event.target.closest('[data-base]'); if (button) chooseUnderlying(button.dataset.base); });
  $('lm-expiry-rail').addEventListener('click', (event) => {
    const button = event.target.closest('[data-expiry]');
    if (!button) return;
    selectedExpiry = button.dataset.expiry; selectedContract = String(contractList(activeExpiry())[0]?.ins || ''); previousKeys = new Set();
    renderExpiryRail(); renderContractTable(); refreshContract();
  });
  const pickContract = (row) => {
    if (!row) return;
    selectedContract = row.dataset.contract; previousKeys = new Set(); renderContractTable(); refreshContract();
  };
  $('lm-contract-table').addEventListener('click', (event) => pickContract(event.target.closest('[data-contract]')));
  $('lm-contract-table').addEventListener('keydown', (event) => {
    const row = event.target.closest('[data-contract]');
    if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); pickContract(row); }
  });

  const offChain = onChain((chain) => {
    underlyings = chain.list || []; chainStats = chain.stats || {};
    renderBaseRail(); paintDashboard(chain.at);
    if (!selectedUa && underlyings.length) chooseUnderlying(underlyings[0].ins);
    else syncDetail();
  });
  const offWatch = api.subscribeWatch((watch) => pushRows(watch, !watch.changed));
  schedule();
  dashboardTimer = setInterval(fetchDashboardHistory, 30000);
  fetchDashboardHistory();

  return () => {
    offWatch(); offChain(); clearInterval(refreshTimer); clearInterval(dashboardTimer); loadSeq += 1;
  };
}
