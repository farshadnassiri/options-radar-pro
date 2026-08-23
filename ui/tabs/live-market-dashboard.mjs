// مجموعه داشبوردهای تصمیم‌گیری زنده بازار.
// سه تب عمودی، هر کدام بیست نمای تنبل دارند و انتخاب دامنه در همه مشترک است.

import { fmt, faDigits, faClock } from '/ui/fmt.mjs';
import { liveOptionTape, liveReferenceTape, marketBreadthSnapshot } from '/core/live-market.mjs';
import { dashboardScope } from '/core/decision-dashboard.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { breadthBars, breadthDonut, liveChart } from '/ui/tabs/live-market.mjs';
import { logError } from '/ui/errlog.mjs';

// شش اسلات، و بدون چرخش. اسلات هفتم یعنی رنگی که با یکی از شش تای قبلی
// اشتباه گرفته می‌شود؛ سریِ هفتم باید در «بقیه» جمع شود، نه رنگ تازه بگیرد.
const SERIES = Array.from({ length: 6 }, (_, index) => `var(--series-${index + 1})`);
const esc = (value) => String(value ?? '').replace(/[&<>'\"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;',
}[char]));
const dateLabel = (value) => faDigits(historyDateLabel(value));
const kindLabel = (kind) => kind === 'call' ? 'اختیار خرید' : kind === 'put' ? 'اختیار فروش' : 'نماد پایه';
const tone = (value) => Number(value) > 0 ? 'gain' : Number(value) < 0 ? 'loss' : '';
const timeLabel = (value) => {
  const raw = String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(6, '0').slice(-6);
  return faDigits(`${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4)}`);
};

const pulseViews = [
  ['breadth-donut', 'دایره جهت بازار', 'donut', 'contracts', 'changePct'],
  ['breadth-bars', 'میله قدرت جهت‌ها', 'breadth', 'contracts', 'changePct'],
  ['breadth-pct', 'روند درصد مثبت و منفی', 'timeline', 'timeline', 'positivePct'],
  ['breadth-net', 'روند خالص وسعت', 'timeline', 'timeline', 'breadth'],
  ['base-volume-path', 'حجم تجمعی پایه‌ها', 'timeline', 'timeline', 'cumulativeVolume'],
  ['base-change-table', 'تغییر همه پایه‌ها', 'table', 'underlyings', 'changePct'],
  ['gainers-table', 'بیشترین رشد', 'table', 'contracts', 'changePct'],
  ['losers-table', 'بیشترین افت', 'table-asc', 'contracts', 'changePct'],
  ['change-bars', 'میله تغییر آخرین', 'bar', 'contracts', 'changePct'],
  ['direction-value', 'ارزش به تفکیک جهت', 'bar', 'directions', 'value'],
  ['direction-volume', 'حجم به تفکیک جهت', 'bar', 'directions', 'volume'],
  ['direction-trades', 'تعداد معامله به تفکیک جهت', 'bar', 'directions', 'trades'],
  ['calls-change', 'جهت اختیار خرید', 'table', 'calls', 'changePct'],
  ['puts-change', 'جهت اختیار فروش', 'table', 'puts', 'changePct'],
  ['expiry-change', 'جهت سررسیدها', 'table', 'expiries', 'changePct'],
  ['strike-change', 'جهت قیمت‌های اعمال', 'bar', 'strikes', 'changePct'],
  ['unchanged', 'نمادهای بدون تغییر', 'table-zero', 'contracts', 'changePct'],
  ['traded-snapshot', 'عکس نمادهای معامله‌شده', 'table', 'contracts', 'trades'],
  ['market-snapshot', 'عکس کامل دامنه', 'table', 'contracts', 'value'],
  ['pulse-tape', 'ریزمعامله قرارداد', 'tape', 'contracts', 'value'],
];

const liquidityViews = [
  ['base-value-table', 'ارزش بالای نمادهای پایه', 'table', 'underlyings', 'value'],
  ['base-value-bars', 'میله ارزش پایه‌ها', 'bar', 'underlyings', 'value'],
  ['contract-value-table', 'ارزش بالای قراردادها', 'table', 'contracts', 'value'],
  ['contract-value-bars', 'میله ارزش قراردادها', 'bar', 'contracts', 'value'],
  ['expiry-value-table', 'ارزش به تفکیک سررسید', 'table', 'expiries', 'value'],
  ['expiry-value-bars', 'میله ارزش سررسیدها', 'bar', 'expiries', 'value'],
  ['high-value-overall', 'رهبران ارزش کل بازار', 'table', 'contracts', 'value'],
  ['high-value-expiry', 'رهبران ارزش هر سررسید', 'expiry-leaders', 'contracts', 'value'],
  ['volume-table', 'رهبران حجم', 'table', 'contracts', 'volume'],
  ['volume-bars', 'میله حجم', 'bar', 'contracts', 'volume'],
  ['trades-table', 'رهبران تعداد معامله', 'table', 'contracts', 'trades'],
  ['trades-bars', 'میله تعداد معامله', 'bar', 'contracts', 'trades'],
  ['oi-table', 'بیشترین موقعیت باز', 'table', 'contracts', 'oi'],
  ['oi-bars', 'میله موقعیت باز', 'bar', 'contracts', 'oi'],
  ['spread-table', 'فاصله مظنه دوطرفه', 'table-asc', 'contracts', 'spreadPct'],
  ['spread-bars', 'میله فاصله مظنه', 'bar', 'contracts', 'spreadPct'],
  ['call-put-value', 'ارزش کال و پوت', 'bar', 'sides', 'value'],
  ['call-put-volume', 'حجم کال و پوت', 'bar', 'sides', 'volume'],
  ['expiry-concentration', 'تمرکز ارزش سررسید', 'bar', 'expiries', 'value'],
  ['liquidity-tape', 'مسیر ارزش قرارداد', 'tape', 'contracts', 'value'],
];

const volatilityViews = [
  ['iv-table', 'IV همه قراردادها', 'table', 'contracts', 'ivPct'],
  ['iv-bars', 'میله IV قراردادها', 'bar', 'contracts', 'ivPct'],
  ['iv-sides', 'IV کال در برابر پوت', 'bar', 'sides', 'ivPct'],
  ['iv-expiry-table', 'IV به تفکیک سررسید', 'table', 'expiries', 'ivPct'],
  ['iv-expiry-bars', 'میله IV سررسیدها', 'bar', 'expiries', 'ivPct'],
  ['iv-strike-table', 'IV به تفکیک اعمال', 'table', 'strikes', 'ivPct'],
  ['iv-smile', 'لبخند IV قیمت اعمال', 'bar', 'strikes', 'ivPct'],
  ['iv-value', 'IV قراردادهای پُرارزش', 'table', 'contracts', 'value'],
  ['iv-change', 'IV و تغییر آخرین', 'table', 'contracts', 'changePct'],
  ['oi-change', 'تغییر موقعیت باز', 'table', 'contracts', 'oiChange'],
  ['oi-change-bars', 'میله تغییر موقعیت باز', 'bar', 'contracts', 'oiChange'],
  ['pc-oi-expiry', 'نسبت OI پوت به کال', 'table', 'expiries', 'putCallOi'],
  ['pc-volume-expiry', 'نسبت حجم پوت به کال', 'table', 'expiries', 'putCallVolume'],
  ['call-iv-table', 'تلاطم اختیار خرید', 'table', 'calls', 'ivPct'],
  ['put-iv-table', 'تلاطم اختیار فروش', 'table', 'puts', 'ivPct'],
  ['iv-spread', 'IV در کنار فاصله مظنه', 'table', 'contracts', 'spreadPct'],
  ['iv-liquidity', 'IV در کنار نقدشوندگی', 'table', 'contracts', 'volume'],
  ['iv-direction', 'IV به تفکیک جهت', 'bar', 'directions', 'ivPct'],
  ['iv-tape', 'IV ریزمعامله قرارداد', 'tape', 'contracts', 'ivPct'],
  ['open-view-history', 'نگاه باز چندروزه', 'open-view', 'contracts', 'ivPct'],
];

export const DASHBOARD_MODES = [
  { id: 'pulse', title: 'نبض و جهت بازار', hint: 'وسعت، روند و تغییر نسبت به دیروز', views: pulseViews },
  { id: 'liquidity', title: 'نقدینگی و سررسید', hint: 'ارزش، حجم، موقعیت باز و تمرکز', views: liquidityViews },
  { id: 'volatility', title: 'تلاطم و انتظارات', hint: 'IV لحظه‌ای و تحلیل نگاه باز', views: volatilityViews },
];

const METRICS = {
  changePct: ['تغییر آخرین نسبت به پایانی دیروز ٪', (value) => `${fmt.pct(value)}٪`],
  value: ['ارزش معامله', fmt.money], volume: ['حجم', fmt.int], trades: ['تعداد معامله', fmt.int],
  oi: ['موقعیت باز', fmt.int], oiChange: ['تغییر موقعیت باز', fmt.int],
  oiChangePct: ['تغییر موقعیت باز ٪', (value) => `${fmt.pct(value)}٪`],
  ivPct: ['تلاطم ضمنی ٪', (value) => `${fmt.pct(value)}٪`],
  spreadPct: ['فاصله مظنه ٪', (value) => `${fmt.pct(value)}٪`],
  putCallOi: ['نسبت OI پوت به کال', fmt.num], putCallVolume: ['نسبت حجم پوت به کال', fmt.num],
};

const rowName = (row) => row.name || row.uaName || row.label
  || (row.endDate ? `سررسید ${dateLabel(row.endDate)}` : row.strike ? `اعمال ${fmt.money(row.strike)}` : '—');

function aggregateRows(rows, keyOf, labelOf) {
  const map = new Map();
  for (const row of rows) {
    const key = String(keyOf(row));
    let item = map.get(key);
    if (!item) {
      item = { key, label: labelOf(row), value: 0, volume: 0, trades: 0, oi: 0, oiChange: 0,
        _change: 0, _changeWeight: 0, _iv: 0, _ivWeight: 0, _spread: 0, _spreadCount: 0 };
      map.set(key, item);
    }
    for (const metric of ['value', 'volume', 'trades', 'oi', 'oiChange']) item[metric] += Number(row[metric]) || 0;
    const weight = Number(row.value) > 0 ? Number(row.value) : 1;
    if (Number.isFinite(row.changePct)) { item._change += row.changePct * weight; item._changeWeight += weight; }
    if (Number.isFinite(row.ivPct)) { item._iv += row.ivPct * weight; item._ivWeight += weight; }
    if (Number.isFinite(row.spreadPct)) { item._spread += row.spreadPct; item._spreadCount += 1; }
  }
  return [...map.values()].map((item) => ({ ...item,
    changePct: item._changeWeight ? item._change / item._changeWeight : NaN,
    ivPct: item._ivWeight ? item._iv / item._ivWeight : NaN,
    spreadPct: item._spreadCount ? item._spread / item._spreadCount : NaN,
  }));
}

function rowsFor(view, scoped) {
  const contracts = scoped.contracts || [];
  if (view[3] === 'underlyings') return scoped.underlyings || [];
  if (view[3] === 'expiries') return scoped.expiries || [];
  if (view[3] === 'calls') return contracts.filter((row) => row.kind === 'call');
  if (view[3] === 'puts') return contracts.filter((row) => row.kind === 'put');
  if (view[3] === 'sides') return aggregateRows(contracts, (row) => row.kind, (row) => kindLabel(row.kind));
  if (view[3] === 'strikes') return aggregateRows(contracts, (row) => row.strike, (row) => `اعمال ${fmt.money(row.strike)}`);
  if (view[3] === 'directions') return aggregateRows(contracts,
    (row) => Number(row.changePct) > 0 ? 'positive' : Number(row.changePct) < 0 ? 'negative' : 'unchanged',
    (row) => Number(row.changePct) > 0 ? 'مثبت' : Number(row.changePct) < 0 ? 'منفی' : 'بدون تغییر');
  return contracts;
}

function ranked(view, scoped, limit = 24) {
  const metric = view[4], rows = rowsFor(view, scoped).filter((row) => Number.isFinite(row[metric]));
  const asc = view[2] === 'table-asc';
  let filtered = view[2] === 'table-zero' ? rows.filter((row) => Number(row[metric]) === 0) : rows;
  filtered = [...filtered].sort((a, b) => asc ? Number(a[metric]) - Number(b[metric]) : Number(b[metric]) - Number(a[metric]));
  return filtered.slice(0, limit);
}

function snapshotTable(rows, metric) {
  if (!rows.length) return '<p class="empty-note">در دامنه انتخابی داده معتبر برای این نما نیست.</p>';
  const [metricLabel, metricFmt] = METRICS[metric] || [metric, fmt.num];
  return `<div class="history-table-wrap"><table class="history-table decision-table"><thead><tr><th>رتبه</th><th>نماد / گروه</th><th>آخرین</th><th>پایانی دیروز</th><th>تغییر آخرین نسبت به پایانی دیروز ٪</th><th>${metricLabel}</th><th>حجم</th><th>تعداد معامله</th><th>ارزش</th><th>موقعیت باز</th><th>تغییر موقعیت باز</th><th>IV ٪</th><th>سررسید</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${fmt.int(index + 1)}</td><td><b>${esc(rowName(row))}</b>${row.uaName && row.name ? `<small>${esc(row.uaName)}</small>` : ''}</td><td>${fmt.money(row.last)}</td><td>${fmt.money(row.yday)}</td><td class="${tone(row.changePct)}">${fmt.pct(row.changePct)}٪</td><td>${metricFmt(row[metric])}</td><td>${fmt.int(row.volume)}</td><td>${fmt.int(row.trades)}</td><td>${fmt.money(row.value)}</td><td>${fmt.int(row.oi)}</td><td class="${tone(row.oiChange)}">${fmt.int(row.oiChange)}</td><td>${fmt.pct(row.ivPct)}٪</td><td>${row.endDate ? dateLabel(row.endDate) : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}

// نمودار میله‌ای رتبه‌ای: یک فام برای همه میله‌ها.
//
// پیش از این هر میله رنگ بعدیِ فهرست سری را می‌گرفت (`SERIES[index % ...]`).
// این رنگ‌کردن «بر اساس رتبه» است نه بر اساس هویت: میله اول با عوض‌شدن
// فیلتر رنگ عوض می‌کرد، و شانزده رنگ کنار هم چیزی جز شلوغی نمی‌ساخت —
// طولِ میله خودش مقدار را می‌گوید.
//
// تنها استثنا، سنجه‌های علامت‌دار (تغییر قیمت، تغییر موقعیت باز) است: آنجا
// علامت یک معنی واقعی دارد و رنگ سود/زیان همان را می‌گوید، نه هویت را.
function barChart(rows, metric) {
  if (!rows.length) return '<p class="empty-note">داده معتبری برای رسم این نمودار نیست.</p>';
  const [label, formatter] = METRICS[metric] || [metric, fmt.num];
  const signed = metric === 'changePct' || metric === 'oiChange' || metric === 'oiChangePct';
  const max = Math.max(...rows.map((row) => Math.abs(Number(row[metric]) || 0)), 1);
  return `<div class="decision-bars" aria-label="${esc(label)}">${rows.slice(0, 16).map((row) => {
    const value = Number(row[metric]);
    const fill = signed ? (value > 0 ? 'var(--gain)' : value < 0 ? 'var(--loss)' : 'var(--muted)') : 'var(--bar-fill)';
    return `<article><header><b>${esc(rowName(row))}</b><strong class="${tone(signed ? value : 0)}">${formatter(value)}</strong></header><i><b style="--bar:${Math.min(100, Math.abs(value) / max * 100)}%;--series:${fill}"></b></i><small>تغییر آخرین با پایانی دیروز: ${fmt.pct(row.changePct)}٪ · ارزش ${fmt.money(row.value)}</small></article>`;
  }).join('')}</div>`;
}

function scopedBreadth(scoped) {
  const rows = (scoped.contracts || []).map((row) => ({
    ...row, ins: row.ins, name: row.name, last: row.last, yday: row.yday,
    uaVolume: row.volume, uaValue: row.value, uaTrades: row.trades,
  }));
  return marketBreadthSnapshot(rows);
}

function expiryLeaders(scoped) {
  const groups = new Map();
  for (const row of scoped.contracts || []) {
    const key = `${row.uaIns}:${row.endDate}`, list = groups.get(key) || [];
    list.push(row); groups.set(key, list);
  }
  const leaders = [...groups.values()].map((rows) => [...rows].sort((a, b) => b.value - a.value)[0]).filter(Boolean)
    .sort((a, b) => b.value - a.value);
  return snapshotTable(leaders, 'value');
}

function tapeTable(tape, contract) {
  if (!contract) return '<p class="empty-note">دامنه را روی «قرارداد» بگذار و یک قرارداد انتخاب کن.</p>';
  if (!tape?.length) return '<p class="empty-note">برای قرارداد انتخابی ریزمعامله معتبر دریافت نشده است.</p>';
  const shown = tape.slice(-400).reverse();
  return `<p class="note">${fmt.int(shown.length)} معامله آخر از ${fmt.int(tape.length)} معامله معتبر؛ محاسبات تجمعی روی نوار کامل انجام شده است.</p><div class="history-table-wrap"><table class="history-table decision-tape"><thead><tr><th>زمان</th><th>نماد</th><th>قیمت</th><th>تغییر آخرین نسبت به پایانی دیروز ٪</th><th>حجم</th><th>ارزش</th><th>حجم تجمعی</th><th>ارزش تجمعی</th><th>پایه مرجع</th><th>IV ٪</th></tr></thead><tbody>${shown.map((row) => `<tr><td>${timeLabel(row.time)}</td><td>${esc(contract.name)}</td><td>${fmt.money(row.price)}</td><td class="${tone(contract.changePct)}">${fmt.pct(contract.changePct)}٪</td><td>${fmt.int(row.quantity)}</td><td>${fmt.money(row.value)}</td><td>${fmt.int(row.cumulativeVolume)}</td><td>${fmt.money(row.cumulativeValue)}</td><td>${fmt.money(row.basePrice)}</td><td>${fmt.pct(row.ivPct)}٪</td></tr>`).join('')}</tbody></table></div>`;
}

export async function mount(root, { state }) {
  root.innerHTML = `<section class="live-dashboard-hero"><div><p class="eyebrow">مرکز تصمیم‌گیری زنده بازار اختیار</p><h1>داشبورد معاملاتی لحظه‌ای</h1><p>هر جدول و نمودار از عکس واقعی بازار و معاملات امروز بازسازی می‌شود. درصد تغییر، آخرین قیمت را فقط با قیمت پایانی دیروز مقایسه می‌کند.</p></div><div><button type="button" class="ghost" id="dd-refresh">به‌روزرسانی اکنون</button><button type="button" class="ghost" id="dd-pause">توقف خودکار</button><span id="dd-status" role="status">در انتظار نخستین عکس…</span></div></section>
    <section class="card decision-toolbar"><div class="decision-refresh-control"><label for="dd-interval">زمان به‌روزرسانی</label><input id="dd-interval" type="range" min="5" max="60" step="5"><output id="dd-interval-label"></output></div><div class="decision-scope-controls"><label>دامنه<select id="dd-scope"><option value="market">کل بازار</option><option value="underlying">یک نماد پایه</option><option value="expiry">یک سررسید از پایه</option><option value="contract">یک قرارداد از سررسید</option></select></label><label>نماد پایه<select id="dd-underlying"></select></label><label>سررسید<select id="dd-expiry"></select></label><label>قرارداد<select id="dd-contract"></select></label></div><p id="dd-scope-note" class="note">کل بازار اختیار</p></section>
    <div class="decision-shell"><aside class="decision-mode-rail" aria-label="حالت‌های تصمیم‌گیری">${DASHBOARD_MODES.map((mode, index) => `<button type="button" data-mode="${mode.id}" aria-pressed="${index === 0}"><b>${mode.title}</b><small>${mode.hint}</small><span>${fmt.int(mode.views.length)} نما</span></button>`).join('')}</aside><main class="decision-main">${DASHBOARD_MODES.map((mode, modeIndex) => `<section class="decision-mode" data-mode-panel="${mode.id}" ${modeIndex ? 'hidden' : ''}><div class="section-head"><div><p class="eyebrow">حالت تصمیم‌گیری</p><h2>${mode.title}</h2></div><span>از میان ${fmt.int(mode.views.length)} جدول و نمودار فقط نمای موردنیاز را باز کن</span></div><div class="decision-view-buttons">${mode.views.map((view, index) => `<button type="button" data-view="${view[0]}" aria-pressed="${index === 0}">${fmt.int(index + 1)}. ${view[1]}</button>`).join('')}</div><section class="card decision-view-card"><div class="section-head"><h3 data-view-title>${mode.views[0][1]}</h3><span data-view-scope>کل بازار</span></div><div data-view-host></div><div data-open-view-host class="decision-open-view" hidden></div></section></section>`).join('')}</main></div>`;

  const $ = (id) => root.querySelector(`#${id}`);
  let payload = { universe: { underlyings: [], expiries: [], marketExpiries: [], contracts: [] }, timeline: [], snapshot: { rows: [] } };
  let activeMode = DASHBOARD_MODES[0].id;
  const activeViews = Object.fromEntries(DASHBOARD_MODES.map((mode) => [mode.id, mode.views[0][0]]));
  let loading = false, paused = false, timer = null, nextAt = 0, tape = [], openViewMounted = false;
  let intervalSec = Math.max(5, Math.min(60, Number(localStorage.getItem('options-radar:dashboard-interval')) || Number(state.settings.watchIntervalSec) || 15));
  $('dd-interval').value = String(intervalSec);

  const selected = () => ({ level: $('dd-scope').value, uaIns: $('dd-underlying').value, endDate: $('dd-expiry').value, contractIns: $('dd-contract').value });
  const activeContract = () => payload.universe.contracts.find((row) => String(row.ins) === $('dd-contract').value);
  const modeOf = () => DASHBOARD_MODES.find((mode) => mode.id === activeMode);
  const viewOf = () => modeOf().views.find((view) => view[0] === activeViews[activeMode]);

  function paintInterval() {
    $('dd-interval-label').textContent = `${faDigits(intervalSec)} ثانیه`;
    $('dd-interval').setAttribute('aria-valuetext', `${faDigits(intervalSec)} ثانیه`);
  }

  function fillSelectors(preserve = true) {
    const before = selected(), underlyings = payload.universe.underlyings || [];
    $('dd-underlying').innerHTML = underlyings.map((row) => `<option value="${esc(row.ins)}">${esc(row.name)} · تغییر ${fmt.pct(row.changePct)}٪</option>`).join('');
    if (preserve && underlyings.some((row) => String(row.ins) === before.uaIns)) $('dd-underlying').value = before.uaIns;
    const uaIns = $('dd-underlying').value;
    const expiries = (payload.universe.expiries || []).filter((row) => String(row.uaIns) === uaIns).sort((a, b) => a.days - b.days);
    $('dd-expiry').innerHTML = expiries.map((row) => `<option value="${row.endDate}">${dateLabel(row.endDate)} · ${fmt.int(row.days)} روز</option>`).join('');
    if (preserve && expiries.some((row) => String(row.endDate) === before.endDate)) $('dd-expiry').value = before.endDate;
    const endDate = $('dd-expiry').value;
    const contracts = (payload.universe.contracts || []).filter((row) => String(row.uaIns) === uaIns && String(row.endDate) === endDate);
    $('dd-contract').innerHTML = contracts.map((row) => `<option value="${esc(row.ins)}">${esc(row.name)} · ${kindLabel(row.kind)} · ${fmt.money(row.strike)}</option>`).join('');
    if (preserve && contracts.some((row) => String(row.ins) === before.contractIns)) $('dd-contract').value = before.contractIns;
    const level = $('dd-scope').value;
    $('dd-underlying').disabled = level === 'market'; $('dd-expiry').disabled = !['expiry', 'contract'].includes(level); $('dd-contract').disabled = level !== 'contract';
  }

  function scopeLabel(scoped) {
    const pick = selected(), ua = payload.universe.underlyings.find((row) => String(row.ins) === pick.uaIns), contract = activeContract();
    if (pick.level === 'market') return `کل بازار · ${fmt.int(scoped.contracts.length)} قرارداد`;
    if (pick.level === 'underlying') return `${ua?.name || 'پایه'} · همه سررسیدها`;
    if (pick.level === 'expiry') return `${ua?.name || 'پایه'} · سررسید ${dateLabel(pick.endDate)}`;
    return `${ua?.name || 'پایه'} · ${contract?.name || 'قرارداد'} · سررسید ${dateLabel(pick.endDate)}`;
  }

  async function syncOpenView() {
    const host = root.querySelector('[data-mode-panel="volatility"] [data-open-view-host]');
    if (!openViewMounted) {
      host.innerHTML = '<p class="empty-note">در حال آماده‌سازی تحلیل چندروزه…</p>';
      const mod = await import('/ui/tabs/open-view.mjs'); await mod.mount(host, { state }); openViewMounted = true;
    }
    const base = host.querySelector('#ov-base'), value = $('dd-underlying').value;
    if (base && value && base.value !== value && [...base.options].some((option) => option.value === value)) {
      base.value = value; base.dispatchEvent(new Event('change'));
    }
  }

  function paintTimeline(host, view, scoped) {
    if (selected().level !== 'market') {
      const metric = view[4] === 'cumulativeVolume' ? 'volume' : 'changePct';
      host.innerHTML = `<p class="note">مسیر دقیقه‌ای تجمعی فقط برای کل بازار ساخته می‌شود؛ در این دامنه عکس مقطعی همان سنجه نمایش داده شده است.</p>${barChart(ranked(['', '', 'bar', 'contracts', metric], scoped, 16), metric)}`;
      return;
    }
    const timeline = payload.timeline || [];
    if (!timeline.length) { host.innerHTML = '<p class="empty-note">هنوز مسیر دقیقه‌ای معتبری دریافت نشده است.</p>'; return; }
    if (view[0] === 'breadth-pct') {
      liveChart(host, [
        { label: 'مثبت', color: SERIES[0], points: timeline.map((row) => ({ ...row, value: row.positivePct })) },
        { label: 'منفی', color: SERIES[1], points: timeline.map((row) => ({ ...row, value: row.negativePct })) },
      ], { valueFmt: fmt.pct, unit: 'درصد نمادهای معامله‌شده' });
    } else {
      const metric = view[4], label = metric === 'breadth' ? 'خالص وسعت' : 'حجم تجمعی پایه‌ها';
      liveChart(host, [{ label, color: SERIES[0], points: timeline.map((row) => ({ ...row, value: row[metric] })) }], { valueFmt: fmt.int, unit: label, zeroFloor: metric !== 'breadth' });
    }
  }

  async function paintView() {
    const panel = root.querySelector(`[data-mode-panel="${activeMode}"]`), view = viewOf();
    if (!panel || !view) return;
    const scoped = dashboardScope(payload.universe, selected()), host = panel.querySelector('[data-view-host]'), openHost = panel.querySelector('[data-open-view-host]');
    panel.querySelector('[data-view-title]').textContent = view[1]; panel.querySelector('[data-view-scope]').textContent = scopeLabel(scoped);
    $('dd-scope-note').textContent = scopeLabel(scoped);
    host.hidden = view[2] === 'open-view'; openHost.hidden = view[2] !== 'open-view';
    if (view[2] === 'open-view') { await syncOpenView(); return; }
    if (view[2] === 'donut') { breadthDonut(host, scopedBreadth(scoped)); return; }
    if (view[2] === 'breadth') { breadthBars(host, scopedBreadth(scoped)); return; }
    if (view[2] === 'timeline') { paintTimeline(host, view, scoped); return; }
    if (view[2] === 'expiry-leaders') { host.innerHTML = expiryLeaders(scoped); return; }
    if (view[2] === 'tape') { host.innerHTML = tapeTable(tape, selected().level === 'contract' ? activeContract() : null); return; }
    const rows = ranked(view, scoped, view[2] === 'bar' ? 16 : 40);
    host.innerHTML = view[2] === 'bar' ? barChart(rows, view[4]) : snapshotTable(rows, view[4]);
  }

  async function fetchTape() {
    tape = [];
    const contract = activeContract(), pick = selected(); if (!contract || pick.level !== 'contract') return;
    try {
      const response = await fetch(`/api/live-trades?ins=${encodeURIComponent(`${pick.uaIns},${contract.ins}`)}`, { cache: 'no-store' });
      const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
      const optionRows = data.items?.[contract.ins]?.rows || [], baseRows = data.items?.[pick.uaIns]?.rows || [];
      tape = liveOptionTape({ trades: optionRows, contract, underlyingTape: liveReferenceTape(baseRows), settings: state.settings });
    } catch (error) { logError('ریزمعامله داشبورد تصمیم‌گیری', error); }
  }

  function schedule() {
    clearTimeout(timer); if (paused) return;
    nextAt = Date.now() + intervalSec * 1000;
    timer = setTimeout(refresh, intervalSec * 1000);
  }

  async function refresh() {
    if (loading) return;
    loading = true; $('dd-refresh').disabled = true; $('dd-status').textContent = 'در حال دریافت عکس تازه بازار…';
    try {
      const response = await fetch('/api/live-dashboard', { cache: 'no-store' }), next = await response.json();
      if (!response.ok || next.error) throw new Error(next.error || `HTTP ${response.status}`);
      payload = next; fillSelectors(true); await fetchTape(); await paintView();
      $('dd-status').textContent = `${faClock(new Date(next.at || Date.now()))} · ${fmt.int(next.universe?.contracts?.length || 0)} قرارداد · ${fmt.int(next.traded || 0)} پایه معامله‌شده`;
    } catch (error) {
      $('dd-status').textContent = `به‌روزرسانی ناموفق: ${error.message}`; logError('داشبورد تصمیم‌گیری', error);
    } finally { loading = false; $('dd-refresh').disabled = false; schedule(); }
  }

  root.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', async () => {
    activeMode = button.dataset.mode;
    root.querySelectorAll('[data-mode]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    root.querySelectorAll('[data-mode-panel]').forEach((panel) => { panel.hidden = panel.dataset.modePanel !== activeMode; });
    await paintView();
  }));
  root.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', async () => {
    const panel = button.closest('[data-mode-panel]'), mode = panel.dataset.modePanel; activeViews[mode] = button.dataset.view;
    panel.querySelectorAll('[data-view]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    await paintView();
  }));
  $('dd-scope').addEventListener('change', async () => { fillSelectors(true); await fetchTape(); await paintView(); });
  $('dd-underlying').addEventListener('change', async () => { fillSelectors(true); await fetchTape(); await paintView(); });
  $('dd-expiry').addEventListener('change', async () => { fillSelectors(true); await fetchTape(); await paintView(); });
  $('dd-contract').addEventListener('change', async () => { await fetchTape(); await paintView(); });
  $('dd-refresh').addEventListener('click', refresh);
  $('dd-pause').addEventListener('click', () => { paused = !paused; $('dd-pause').textContent = paused ? 'ادامه خودکار' : 'توقف خودکار'; if (paused) clearTimeout(timer); else refresh(); });
  $('dd-interval').addEventListener('input', () => { intervalSec = Number($('dd-interval').value); paintInterval(); });
  $('dd-interval').addEventListener('change', () => { localStorage.setItem('options-radar:dashboard-interval', String(intervalSec)); schedule(); });
  const countdown = setInterval(() => {
    if (!paused && nextAt > Date.now() && !loading) $('dd-interval-label').textContent = `${faDigits(intervalSec)} ثانیه · نوبت بعد ${faDigits(Math.ceil((nextAt - Date.now()) / 1000))} ثانیه`;
  }, 1000);
  paintInterval(); await refresh();
  return () => { clearTimeout(timer); clearInterval(countdown); };
}
