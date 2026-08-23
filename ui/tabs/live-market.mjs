// تب «رصد لحظه‌ای بازار» — نوار کامل معاملات امروز برای یک پایه و
// قراردادهای اختیار معامله‌شده همان پایه.

import { fmt, faDigits, faClock } from '/ui/fmt.mjs';
import { makeTable } from '/ui/table.mjs';
import { onChain, chainState, pushRows, chainDetail } from '/ui/scanner.mjs';
import { liveOptionTape, liveReferenceTape } from '/core/live-market.mjs';
import { logError } from '/ui/errlog.mjs';

const COLORS = ['var(--accent)', 'var(--cmp1)', 'var(--cmp2)', 'var(--cmp3)', 'var(--cmp4)', 'var(--gain)', 'var(--loss)', 'var(--warn)'];
const MAX_OPTIONS = 23; // پایه ابزار بیست‌وچهارمِ سقف سرور است

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));

const timeLabel = (value, seconds = false) => {
  const raw = String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(6, '0').slice(-6);
  return faDigits(seconds ? `${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4)}` : `${raw.slice(0, 2)}:${raw.slice(2, 4)}`);
};

const kindLabel = (kind) => kind === 'call' ? 'اختیار خرید' : kind === 'put' ? 'اختیار فروش' : 'نماد پایه';

// جدول همه ردیف‌ها را نگه می‌دارد، اما فرستادن ده‌ها هزار نقطه به یک path
// SVG هر پنج ثانیه رابط را سنگین می‌کند. هر سطل، ابتدا/انتها و کمینه/بیشینه
// را نگه می‌دارد تا جهش‌ها با نمونه‌برداری ساده گم نشوند.
function chartSample(points, limit = 1600) {
  if (points.length <= limit) return points;
  const size = Math.max(2, Math.ceil(points.length / Math.floor(limit / 4)));
  const out = [];
  for (let at = 0; at < points.length; at += size) {
    const bucket = points.slice(at, at + size);
    let lo = bucket[0], hi = bucket[0];
    for (const point of bucket) {
      if (point.value < lo.value) lo = point;
      if (point.value > hi.value) hi = point;
    }
    for (const point of [bucket[0], lo, hi, bucket[bucket.length - 1]].sort((a, b) => a.second - b.second)) {
      if (out[out.length - 1] !== point) out.push(point);
    }
  }
  return out;
}

function liveChart(host, series, { valueFmt = fmt.pct, unit = 'درصد', zeroFloor = false } = {}) {
  const usable = series.map((item) => ({ ...item, points: chartSample(item.points.filter((point) => Number.isFinite(point.value) && Number.isFinite(point.second))) }))
    .filter((item) => item.points.length);
  if (!usable.length) {
    host.innerHTML = '<p class="empty-note">هنوز نقطه معتبر برای رسم نرسیده است.</p>';
    return;
  }
  const points = usable.flatMap((item) => item.points);
  let xMin = Math.min(...points.map((point) => point.second));
  let xMax = Math.max(...points.map((point) => point.second));
  let yMin = Math.min(...points.map((point) => point.value));
  let yMax = Math.max(...points.map((point) => point.value));
  if (!(xMax > xMin)) { xMin -= 60; xMax += 60; }
  if (!(yMax > yMin)) { const pad = Math.abs(yMin) * 0.02 || 1; yMin -= pad; yMax += pad; }
  const yPad = (yMax - yMin) * 0.1;
  yMin -= yPad; yMax += yPad;
  if (zeroFloor) yMin = 0;
  const W = 920, H = 300, P = { l: 76, r: 20, t: 24, b: 42 };
  const X = (value) => P.l + ((value - xMin) / (xMax - xMin)) * (W - P.l - P.r);
  const Y = (value) => P.t + (1 - ((value - yMin) / (yMax - yMin))) * (H - P.t - P.b);
  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4);
  const xTicks = Array.from({ length: 6 }, (_, index) => xMin + ((xMax - xMin) * index) / 5);
  const grid = yTicks.map((value) => `<line class="live-market-grid-line" x1="${P.l}" x2="${W - P.r}" y1="${Y(value)}" y2="${Y(value)}"/><text x="${P.l - 8}" y="${Y(value) + 4}" text-anchor="end">${valueFmt(value)}</text>`).join('');
  const axes = xTicks.map((value) => {
    const hour = Math.floor(value / 3600), minute = Math.floor((value % 3600) / 60);
    return `<text x="${X(value)}" y="${H - 12}" text-anchor="middle">${timeLabel(hour * 10000 + minute * 100)}</text>`;
  }).join('');
  const paths = usable.map((item) => {
    const d = item.points.map((point, index) => `${index ? 'L' : 'M'}${X(point.second).toFixed(1)},${Y(point.value).toFixed(1)}`).join(' ');
    return `<path class="live-market-series" style="--series:${item.color}" d="${d}"/>`;
  }).join('');
  const legend = usable.map((item) => `<span style="--series:${item.color}"><i></i>${esc(item.label)}</span>`).join('');
  host.innerHTML = `<div class="live-market-legend">${legend}</div><div class="live-market-chart-stage"><svg viewBox="0 0 ${W} ${H}" tabindex="0" aria-label="نمودار زنده بازار">
    ${grid}${axes}${paths}<line class="live-market-cursor" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}" hidden/>
  </svg><div class="live-market-tip" hidden></div></div><p class="note">محور عمودی: ${unit}. هر خط از اولین معامله همان نماد در پاسخ امروز ساخته می‌شود.</p>`;
  const svg = host.querySelector('svg'), cursor = host.querySelector('.live-market-cursor'), tip = host.querySelector('.live-market-tip');
  svg.addEventListener('pointermove', (event) => {
    const box = svg.getBoundingClientRect();
    const localX = ((event.clientX - box.left) / box.width) * W;
    const second = xMin + ((localX - P.l) / (W - P.l - P.r)) * (xMax - xMin);
    const picked = usable.map((item) => {
      let best = item.points[0];
      for (const point of item.points) if (Math.abs(point.second - second) < Math.abs(best.second - second)) best = point;
      return { ...item, point: best };
    });
    const anchor = picked.reduce((best, item) => Math.abs(item.point.second - second) < Math.abs(best.point.second - second) ? item : best, picked[0]);
    cursor.hidden = false;
    cursor.setAttribute('x1', X(anchor.point.second)); cursor.setAttribute('x2', X(anchor.point.second));
    tip.hidden = false;
    tip.innerHTML = `<b>${timeLabel(anchor.point.time, true)}</b>${picked.map((item) => `<span>${esc(item.label)}: ${valueFmt(item.point.value)}</span>`).join('')}`;
    tip.style.insetInlineStart = `${Math.min(78, Math.max(4, ((X(anchor.point.second) / W) * 100)))}%`;
  });
  svg.addEventListener('pointerleave', () => { cursor.hidden = true; tip.hidden = true; });
}

const SUMMARY_COLS = [
  { key: 'name', label: 'نماد', fmt: 'sym', group: 'شناسه' },
  { key: 'kindLabel', label: 'نوع', fmt: 'text', group: 'شناسه' },
  { key: 'expiryLabel', label: 'سررسید', fmt: 'text', group: 'شناسه' },
  { key: 'strike', label: 'قیمت اعمال', fmt: 'money', group: 'شناسه' },
  { key: 'lastTimeLabel', label: 'آخرین زمان', fmt: 'text', group: 'امروز' },
  { key: 'lastPrice', label: 'آخرین', fmt: 'money', group: 'امروز' },
  { key: 'changePct', label: 'تغییر از اولین ٪', fmt: 'pct', group: 'امروز', heat: 'prob' },
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
  { key: 'kindLabel', label: 'نوع', fmt: 'text', group: 'معامله' },
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

export async function mount(root, { state, api }) {
  root.innerHTML = `<div class="page-head"><div><p class="eyebrow">نوار معاملات امروز</p><h2>رصد لحظه‌ای بازار</h2><p>همه معاملات ثبت‌شده از شروع بازار تا آخرین پاسخ برای نماد پایه و قراردادهای انتخابی. آخرین معامله مرجع مشاهده بازار است، نه قیمت تضمین‌شده اجرا.</p></div></div>
    <section class="card live-market-controls"><div class="live-market-control-head"><label>نماد پایه<select id="lm-base"><option>در حال دریافت…</option></select></label><div><button type="button" class="ghost" id="lm-refresh">دریافت الآن</button><button type="button" class="ghost" id="lm-toggle">توقف خودکار</button></div></div>
      <div class="live-market-model" id="lm-model"></div><div class="live-market-pick-tools"><input id="lm-search" type="search" placeholder="جست‌وجوی قرارداد"><button type="button" class="ghost" data-lm-pick="top">پرحجم‌ها</button><button type="button" class="ghost" data-lm-pick="call">همه کال</button><button type="button" class="ghost" data-lm-pick="put">همه پوت</button><button type="button" class="ghost" data-lm-pick="none">پاک‌کردن</button><span id="lm-selected"></span></div>
      <div id="lm-contracts" class="live-market-contracts"><p class="empty-note">پس از انتخاب پایه، قراردادهای معامله‌شده اینجا می‌آیند.</p></div><p class="note" id="lm-status" role="status">در انتظار فهرست بازار…</p>
    </section>
    <div class="kpis" id="lm-kpis"></div>
    <div class="live-market-chart-grid"><section class="card"><div class="section-head"><h3>تغییر قیمت از اولین معامله امروز</h3><span>مقایسه‌پذیر میان نمادها</span></div><div id="lm-price-chart"></div></section><section class="card"><div class="section-head"><h3>تلاطم ضمنی هر معامله</h3><span>با آخرین پایه در ثانیه قبلی</span></div><div id="lm-iv-chart"></div></section><section class="card live-market-wide"><div class="section-head"><h3>حجم تجمعی از شروع بازار</h3><span>هر خط یک نماد</span></div><div id="lm-volume-chart"></div></section></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">خلاصه انتخاب</p><h3>وضعیت نمادها تا آخرین معامله</h3></div></div><div id="lm-summary"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">نوار به‌روزشونده</p><h3>تک‌تک معاملات و تلاطم ضمنی</h3></div><span>ردیف‌های تازه در دریافت بعدی اضافه می‌شوند</span></div><div id="lm-tape"></div><p class="note">IV فقط وقتی ساخته می‌شود که پیش از همان معامله اختیار، معامله معتبری برای پایه وجود داشته باشد. برای سررسید صفرروزه یا قیمت ناسازگار با کران نظری، خانه خالی می‌ماند.</p></section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const summaryTable = makeTable($('lm-summary'), SUMMARY_COLS, { all: SUMMARY_COLS, sortKey: 'value', storeKey: 'live-market:summary', exportName: 'live-market-summary' });
  const tapeTable = makeTable($('lm-tape'), TAPE_COLS, { all: TAPE_COLS, sortKey: 'sequence', storeKey: 'live-market:tape', exportName: 'live-market-tape' });
  summaryTable.setEmptyMessage('هنوز معامله‌ای برای انتخاب فعلی دریافت نشده است.');
  tapeTable.setEmptyMessage('نوار معامله هنوز خالی است.');

  let underlyings = [], detail = null, selectedUa = '', contracts = [], filteredContracts = [];
  let selected = new Set(), snapshots = {}, previousKeys = new Set(), previousLast = new Map();
  let loading = false, paused = false, timer = null, loadSeq = 0;
  let baseOptionSignature = '', contractSyncing = false, lastContractSync = 0;
  const intervalMs = Math.max(3000, Math.min(30000, Number(state.settings.watchIntervalSec || 5) * 1000));

  $('lm-model').textContent = `فرض‌های IV: نرخ بدون ریسک ${fmt.pct(Number(state.settings.rFree) * 100)}٪، بازده نقدی ${fmt.pct(Number(state.settings.divYield) * 100)}٪، مبنای ${fmt.int(Number(state.settings.dayCountYear))} روز. کران حل ${fmt.pct(Number(state.settings.ivLo) * 100)}٪ تا ${fmt.pct(Number(state.settings.ivHi) * 100)}٪.`;

  function contractFlat(ua) {
    return (ua?.expiries || []).flatMap((expiry) => expiry.strikes.flatMap((strike) => [
      { ...strike.call, strike: strike.strike, size: strike.size, days: expiry.days, endDate: expiry.endDate },
      { ...strike.put, strike: strike.strike, size: strike.size, days: expiry.days, endDate: expiry.endDate },
    ])).filter((contract) => contract.ins && (Number(contract.vol) > 0 || Number(contract.trades) > 0))
      .sort((a, b) => Number(b.vol) - Number(a.vol) || Number(b.value) - Number(a.value));
  }

  function renderBaseOptions() {
    const signature = underlyings.map((item) => `${item.ins}:${item.name}`).join('|');
    if (signature === baseOptionSignature) return;
    baseOptionSignature = signature;
    const current = selectedUa || $('lm-base').value;
    $('lm-base').innerHTML = underlyings.map((item) => `<option value="${esc(item.ins)}">${esc(item.name)} — حجم اختیار ${fmt.int(item.volume)}</option>`).join('');
    if (underlyings.some((item) => item.ins === current)) $('lm-base').value = current;
  }

  function renderContracts() {
    const query = $('lm-search').value.trim();
    filteredContracts = contracts.filter((contract) => !query || `${contract.name} ${contract.strike} ${contract.days}`.includes(query));
    $('lm-selected').textContent = `${fmt.int(selected.size)} قرارداد از سقف ${fmt.int(MAX_OPTIONS)}`;
    if (!filteredContracts.length) {
      $('lm-contracts').innerHTML = '<p class="empty-note">برای این پایه قرارداد معامله‌شده‌ای با فیلتر فعلی نیست.</p>';
      return;
    }
    $('lm-contracts').innerHTML = filteredContracts.map((contract) => `<label class="live-market-contract"><input type="checkbox" value="${esc(contract.ins)}" ${selected.has(contract.ins) ? 'checked' : ''}><span><b>${esc(contract.name)}</b><small>${kindLabel(contract.kind)} · اعمال ${fmt.money(contract.strike)} · ${fmt.int(contract.days)} روز · حجم ${fmt.int(contract.vol)}</small></span></label>`).join('');
  }

  async function chooseUnderlying(ins, chooseDefaults = true) {
    const seq = ++loadSeq;
    selectedUa = String(ins || ''); detail = null; contracts = []; snapshots = {}; previousKeys = new Set(); previousLast = new Map();
    $('lm-status').textContent = 'در حال ساخت فهرست قراردادهای معامله‌شده…';
    const result = await chainDetail(selectedUa);
    if (seq !== loadSeq) return;
    if (result.error) { $('lm-status').textContent = result.error; return; }
    detail = result.ua; contracts = contractFlat(detail);
    selected = chooseDefaults ? new Set(contracts.slice(0, Math.min(6, MAX_OPTIONS)).map((contract) => contract.ins)) : new Set([...selected].filter((code) => contracts.some((contract) => contract.ins === code)));
    renderContracts();
    $('lm-status').textContent = contracts.length ? 'آماده دریافت معاملات امروز.' : 'قرارداد معامله‌شده‌ای برای این پایه در عکس فعلی نیست.';
    await refresh();
  }

  async function syncContractUniverse() {
    if (!selectedUa || !detail || contractSyncing || Date.now() - lastContractSync < 30000) return;
    contractSyncing = true; lastContractSync = Date.now();
    const target = selectedUa;
    try {
      const result = await chainDetail(target);
      if (result.error || target !== selectedUa) return;
      const next = contractFlat(result.ua);
      const beforeIds = contracts.map((item) => item.ins).join('|');
      const nextIds = next.map((item) => item.ins).join('|');
      detail = result.ua;
      if (beforeIds !== nextIds) {
        contracts = next;
        selected = new Set([...selected].filter((code) => contracts.some((contract) => contract.ins === code)));
        renderContracts();
      }
    } finally { contractSyncing = false; }
  }

  function paintKpis(summaryRows, at) {
    const traded = summaryRows.filter((row) => row.count > 0);
    const lastTime = Math.max(0, ...traded.map((row) => row.lastTime));
    const volume = traded.reduce((sum, row) => sum + row.volume, 0);
    const value = traded.reduce((sum, row) => sum + row.value, 0);
    const validIv = summaryRows.filter((row) => Number.isFinite(row.ivPct));
    const items = [
      ['ابزار انتخابی', fmt.int(summaryRows.length), 'پایه + اختیار'],
      ['معامله معتبر', fmt.int(traded.reduce((sum, row) => sum + row.count, 0)), 'از شروع بازار'],
      ['حجم منتخب', fmt.int(volume), 'سهم/قرارداد'],
      ['ارزش منتخب', fmt.money(value), 'ریال'],
      ['آخرین زمان بازار', lastTime ? timeLabel(lastTime, true) : '—', 'تهران'],
      ['IV معتبر', fmt.int(validIv.length), `از ${fmt.int(selected.size)} اختیار`],
      ['آخرین دریافت', at ? faClock(new Date(at)) : '—', 'ساعت سیستم'],
    ];
    $('lm-kpis').innerHTML = items.map(([key, valueText, sub]) => `<div class="kpi"><div class="k">${key}</div><div class="v">${valueText}</div><div class="s">${sub}</div></div>`).join('');
  }

  function paint(payload) {
    snapshots = payload.items || {};
    const baseRows = snapshots[selectedUa]?.rows || [];
    const baseSeries = liveReferenceTape(baseRows, { ins: detail.ins, name: detail.name, kind: 'underlying' });
    const optionTapes = new Map();
    for (const contract of contracts.filter((item) => selected.has(item.ins))) {
      optionTapes.set(contract.ins, liveOptionTape({ trades: snapshots[contract.ins]?.rows || [], baseTrades: baseRows, contract, settings: state.settings }));
    }
    const allTape = [
      ...baseSeries.map((row) => ({ ...row, strike: NaN, endDate: NaN, days: NaN, basePrice: row.price, ivPct: NaN })),
      ...[...optionTapes.values()].flat(),
    ].map((row) => ({
      ...row, id: row.id, timeLabel: timeLabel(row.time, true), kindLabel: kindLabel(row.kind),
      expiryLabel: Number.isFinite(row.days) ? `${fmt.int(row.days)} روز` : '—',
      __flash: previousKeys.size > 0 && !previousKeys.has(row.id),
    }));

    const instruments = [{ ins: detail.ins, name: detail.name, kind: 'underlying', days: NaN, strike: NaN }, ...contracts.filter((item) => selected.has(item.ins))];
    const summaryRows = instruments.map((instrument) => {
      const summary = snapshots[instrument.ins]?.summary || {};
      const tape = instrument.kind === 'underlying' ? baseSeries : (optionTapes.get(instrument.ins) || []);
      const lastIv = [...tape].reverse().find((row) => Number.isFinite(row.ivPct))?.ivPct;
      const lastSequence = tape[tape.length - 1]?.sequence || 0;
      const row = {
        id: instrument.ins, name: instrument.name, kindLabel: kindLabel(instrument.kind),
        expiryLabel: Number.isFinite(instrument.days) ? `${fmt.int(instrument.days)} روز` : '—', strike: instrument.strike,
        ...summary, ivPct: Number.isFinite(lastIv) ? lastIv : NaN,
        lastTime: summary.lastTime || 0, lastTimeLabel: summary.lastTime ? timeLabel(summary.lastTime, true) : '—',
        __flash: previousLast.has(instrument.ins) && previousLast.get(instrument.ins) !== lastSequence,
      };
      previousLast.set(instrument.ins, lastSequence);
      return row;
    });
    previousKeys = new Set(allTape.map((row) => row.id));
    summaryTable.set(summaryRows); tapeTable.set(allTape);
    paintKpis(summaryRows, payload.at);

    const seriesRows = [{ instrument: instruments[0], tape: baseSeries }, ...instruments.slice(1).map((instrument) => ({ instrument, tape: optionTapes.get(instrument.ins) || [] }))];
    liveChart($('lm-price-chart'), seriesRows.map(({ instrument, tape }, index) => ({
      label: instrument.name, color: COLORS[index % COLORS.length],
      points: tape.map((row) => ({ second: row.second, time: row.time, value: Number.isFinite(row.changePct) ? row.changePct : (tape[0]?.price > 0 ? ((row.price / tape[0].price) - 1) * 100 : NaN) })),
    })), { valueFmt: fmt.pct, unit: 'درصد تغییر' });
    liveChart($('lm-volume-chart'), seriesRows.map(({ instrument, tape }, index) => ({
      label: instrument.name, color: COLORS[index % COLORS.length], points: tape.map((row) => ({ second: row.second, time: row.time, value: row.cumulativeVolume })),
    })), { valueFmt: fmt.int, unit: 'حجم تجمعی', zeroFloor: true });
    liveChart($('lm-iv-chart'), [...optionTapes.entries()].map(([ins, tape], index) => ({
      label: contracts.find((item) => item.ins === ins)?.name || ins, color: COLORS[index % COLORS.length], points: tape.map((row) => ({ second: row.second, time: row.time, value: row.ivPct })),
    })), { valueFmt: fmt.pct, unit: 'درصد تلاطم سالانه' });
  }

  async function refresh() {
    if (loading || !detail) return;
    loading = true; $('lm-refresh').disabled = true;
    const codes = [selectedUa, ...selected].filter(Boolean);
    try {
      const response = await fetch(`/api/live-trades?ins=${encodeURIComponent(codes.join(','))}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `خطای شبکه ${faDigits(response.status)}`);
      paint(payload);
      const failures = Object.values(payload.items || {}).filter((item) => item.error).length;
      $('lm-status').textContent = failures
        ? `${fmt.int(failures)} ابزار پاسخ نداد؛ بقیه در ${faClock(new Date(payload.at))} به‌روز شدند.`
        : `به‌روز شد: ${faClock(new Date(payload.at))} · دریافت بعدی ${fmt.int(intervalMs / 1000)} ثانیه دیگر.`;
    } catch (error) {
      $('lm-status').textContent = `دریافت زنده ناموفق بود: ${error.message}`;
      logError('رصد لحظه‌ای بازار', error);
    } finally { loading = false; $('lm-refresh').disabled = false; }
  }

  function schedule() {
    clearInterval(timer);
    if (!paused) timer = setInterval(refresh, intervalMs);
    $('lm-toggle').textContent = paused ? 'شروع خودکار' : 'توقف خودکار';
  }

  function applyPreset(kind) {
    const source = kind === 'call' ? contracts.filter((item) => item.kind === 'call')
      : kind === 'put' ? contracts.filter((item) => item.kind === 'put')
        : kind === 'none' ? [] : contracts.slice(0, 6);
    selected = new Set(source.slice(0, MAX_OPTIONS).map((item) => item.ins));
    renderContracts(); refresh();
  }

  $('lm-base').addEventListener('change', () => chooseUnderlying($('lm-base').value));
  $('lm-search').addEventListener('input', renderContracts);
  $('lm-contracts').addEventListener('change', (event) => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    if (input.checked && selected.size >= MAX_OPTIONS) {
      input.checked = false; $('lm-status').textContent = `سقف انتخاب ${fmt.int(MAX_OPTIONS)} قرارداد است؛ چند مورد را بردار.`; return;
    }
    if (input.checked) selected.add(input.value); else selected.delete(input.value);
    renderContracts(); refresh();
  });
  root.querySelectorAll('[data-lm-pick]').forEach((button) => button.addEventListener('click', () => applyPreset(button.dataset.lmPick)));
  $('lm-refresh').addEventListener('click', refresh);
  $('lm-toggle').addEventListener('click', () => { paused = !paused; schedule(); });

  const offChain = onChain((chain) => {
    underlyings = chain.list || [];
    renderBaseOptions();
    if (!selectedUa && underlyings.length) {
      selectedUa = underlyings[0].ins; $('lm-base').value = selectedUa; chooseUnderlying(selectedUa);
    }
    else syncContractUniverse();
  });
  const offWatch = api.subscribeWatch((watch) => pushRows(watch, !watch.changed));
  schedule();

  return () => { offWatch(); offChain(); clearInterval(timer); loadSeq += 1; };
}
