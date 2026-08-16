import { CATALOG, GROUPS, byId } from '/strategies/catalog.mjs';
import { buildChain } from '/core/chain.mjs';
import { feesOf } from '/core/settings.mjs';
import {
  HISTORY_BASES, flattenActiveContracts, generateHistoricalCombos, historyDateLabel,
  historyDayName, historyMarketMetrics, historyPrice, normalizeHistoryDate,
  replayHistory, rollingEntryMatrix, holdingPeriodProfile,
} from '/core/history.mjs';
import { replayIntraday, combinedBacktestPath } from '/core/backtest.mjs';
import { fmt, faDigits, signTone } from '/ui/fmt.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[c]));
const nameOf = (entity, fallback = 'بدون نام') => {
  const value = String(entity?.name || '').trim();
  return value && value !== String(entity?.ins || '') ? value : fallback;
};
const dateLabel = (value) => faDigits(historyDateLabel(value));
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, (index + 1) * size));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const errorText = (error, fallback) => /fetch failed|network|failed to fetch/i.test(String(error?.message || error))
  ? 'اتصال به منبع داده برقرار نشد.' : (String(error?.message || '').trim() || fallback);

function basisRail(id, selected = 'LAST') {
  return `<div class="backtest-basis" id="${id}" role="radiogroup" aria-label="مبنای قیمت">${HISTORY_BASES.map(([value, label]) => `<button type="button" data-basis="${value}" role="radio" aria-checked="${value === selected}">${label}</button>`).join('')}</div>`;
}

function setRail(host, value) {
  host.dataset.value = value;
  host.querySelectorAll('[data-basis]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.basis === value)));
}

function mountWheel(host, dates, selected, onChange) {
  host.innerHTML = dates.length ? dates.map((date) => `<button type="button" role="option" data-date="${date}" aria-selected="${date === selected}"><small>${historyDayName(date)}</small><b>${dateLabel(date)}</b></button>`).join('') : '<p>روز قابل‌اجرا پیدا نشد.</p>';
  const select = (date, notify = true) => {
    const value = Number(date);
    host.querySelectorAll('[data-date]').forEach((button) => button.setAttribute('aria-selected', String(Number(button.dataset.date) === value)));
    const active = host.querySelector(`[data-date="${value}"]`);
    active?.scrollIntoView({ block: 'center', behavior: notify ? 'smooth' : 'auto' });
    host.dataset.value = String(value || '');
    if (notify && value) onChange(value);
  };
  host.onclick = (event) => {
    const button = event.target.closest('[data-date]');
    if (button) select(button.dataset.date);
  };
  host.onkeydown = (event) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || !dates.length) return;
    event.preventDefault();
    const current = Math.max(0, dates.indexOf(Number(host.dataset.value)));
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? dates.length - 1
      : Math.max(0, Math.min(dates.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
    select(dates[index]);
    host.querySelector(`[data-date="${dates[index]}"]`)?.focus();
  };
  if (selected) select(selected, false);
  return select;
}

function marketSnapshot(row) {
  if (!row) return '<p class="empty-note">برای این روز داده‌ای موجود نیست.</p>';
  const market = historyMarketMetrics(row);
  const prices = HISTORY_BASES.map(([basis, label]) => `<div><span>${label}</span><b>${fmt.money(historyPrice(row, basis))}</b></div>`).join('');
  return `<div class="backtest-price-grid">${prices}</div><div class="backtest-market-strip">
    <span>حجم <b>${fmt.int(market.volume)}</b></span><span>معامله <b>${fmt.int(market.trades)}</b></span>
    <span>ارزش ${market.valueEstimated ? 'تقریبی' : 'رسمی'} <b>${fmt.money(market.value)}</b></span>
  </div>`;
}

function chart(host, points, series, { money = false } = {}) {
  const rows = points.filter((point) => series.some((item) => Number.isFinite(Number(point[item.key]))));
  if (rows.length < 2) { host.innerHTML = '<p class="empty-note">برای نمودار دست‌کم دو نقطه معتبر لازم است.</p>'; return; }
  const W = 900, H = 330, L = 92, R = 28, T = 28, B = 55;
  const values = rows.flatMap((row) => series.map((item) => Number(row[item.key])).filter(Number.isFinite));
  let lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  if (Math.abs(hi - lo) < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const x = (index) => L + (index / Math.max(1, rows.length - 1)) * (W - L - R);
  const y = (value) => T + ((hi - value) / (hi - lo)) * (H - T - B);
  const label = (value) => money ? fmt.money(value) : fmt.pct(value);
  const ticks = Array.from({ length: 5 }, (_, index) => lo + ((hi - lo) * index) / 4);
  // یک خط منطقی می‌تواند بین دو نام میدان تقسیم شده باشد (سطر روزانه
  // `baseCumulativePct`، سطر ریزمعامله `basePct`). آن‌ها هم‌رنگ‌اند چون یک
  // چیزند؛ پس راهنما هم باید یک چیپ نشان دهد، نه دو چیپ هم‌رنگ با دو نام.
  const legend = series.filter((item, index) => series.findIndex((other) => other.label === item.label) === index);

  // مرز روز آخر. محور افقی بر پایه اندیس است، پس چند صد نقطه ریزمعامله
  // بخش روزانه را باریک می‌کند. بدون این خط، کاربر نمی‌فهمد از کجا مقیاس
  // زمان عوض شده و شیب تند انتهای نمودار را با حرکت چند روزه اشتباه می‌گیرد.
  const firstTick = rows.findIndex((row) => row.granularity === 'trade');
  const boundary = firstTick > 0 ? `<line x1="${x(firstTick)}" x2="${x(firstTick)}" y1="${T}" y2="${H - B}" class="backtest-split"/><text x="${x(firstTick)}" y="${H - B + 18}" text-anchor="middle" class="backtest-split-label">شروع ریزمعامله روز آخر</text>` : '';

  host.innerHTML = `<div class="backtest-chart-legend">${legend.map((item) => `<span style="--series:${item.color}"><i></i>${item.label}</span>`).join('')}</div><div class="backtest-chart-stage"><svg viewBox="0 0 ${W} ${H}" tabindex="0" aria-label="نمودار تعاملی بک‌تست">
    ${ticks.map((value) => `<line x1="${L}" x2="${W - R}" y1="${y(value)}" y2="${y(value)}" class="backtest-grid"/><text x="${L - 10}" y="${y(value) + 4}" text-anchor="end">${label(value)}</text>`).join('')}
    <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="backtest-zero"/>
    ${boundary}
    ${series.map((item) => `<polyline fill="none" stroke="${item.color}" points="${rows.map((row, index) => Number.isFinite(Number(row[item.key])) ? `${x(index)},${y(Number(row[item.key]))}` : '').filter(Boolean).join(' ')}"/>`).join('')}
    <g class="backtest-cursor" hidden><line y1="${T}" y2="${H - B}"/><g></g></g>
    <rect class="backtest-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
  </svg><div class="backtest-tip" hidden></div></div>`;
  const svg = host.querySelector('svg'), cursor = host.querySelector('.backtest-cursor'), tip = host.querySelector('.backtest-tip');
  const show = (index, clientX, clientY) => {
    const row = rows[index], px = x(index);
    cursor.hidden = false;
    cursor.querySelector('line').setAttribute('x1', px); cursor.querySelector('line').setAttribute('x2', px);
    cursor.querySelector('g').innerHTML = series.map((item) => Number.isFinite(Number(row[item.key])) ? `<circle cx="${px}" cy="${y(Number(row[item.key]))}" r="4" fill="${item.color}"/>` : '').join('');
    const when = row.granularity === 'trade' ? `${dateLabel(row.date)} · ${faDigits(row.timeLabel)}` : faDigits(row.dateLabel || historyDateLabel(row.date));
    tip.innerHTML = `<b>${when}</b>${series.map((item) => Number.isFinite(Number(row[item.key])) ? `<span style="--series:${item.color}"><i></i>${item.label}: <strong class="${signTone(row[item.key])}">${label(row[item.key])}</strong></span>` : '').join('')}`;
    tip.hidden = false;
    const box = host.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(box.width - 190, clientX - box.left + 12))}px`;
    tip.style.top = `${Math.max(8, clientY - box.top - 75)}px`;
  };
  const move = (event) => {
    const rect = svg.getBoundingClientRect();
    const ux = ((event.clientX - rect.left) / rect.width) * W;
    const index = Math.max(0, Math.min(rows.length - 1, Math.round(((ux - L) / (W - L - R)) * (rows.length - 1))));
    show(index, event.clientX, event.clientY);
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', () => { cursor.hidden = true; tip.hidden = true; });
}

export async function mount(root, { state }) {
  root.innerHTML = `<section class="backtest-hero"><div><p class="eyebrow">بعد از ماتریس‌ها · آزمون یک مسیر مشخص</p><h1>بک‌تست سریع</h1><p>یک استراتژی را با قیمت مشاهده‌شده روز ورود بچین، مسیر روزانه را ببین و روز سنجش را با ریزمعامله‌های واقعی همان روز بازپخش کن.</p></div><span>بدون قیمت ساختگی</span></section>
  <section class="card backtest-setup"><div class="section-head"><div><p class="eyebrow">گام اول</p><h2>انتخاب سناریو</h2></div><b id="bt-status" role="status">در حال دریافت نمادها…</b></div>
    <div class="backtest-form"><label>نماد پایه<select id="bt-base"><option value="">در حال دریافت…</option></select></label><label>استراتژی<select id="bt-strategy"></select></label><label>تعداد واحد<input id="bt-units" type="number" min="1" max="10000" step="1" value="${Math.max(1, state.settings.qtyDefault || 1)}"></label><button type="button" class="primary" id="bt-load">دریافت روزهای قابل اجرا</button></div>
  </section>
  <section id="bt-work" hidden>
    <div class="backtest-date-grid"><section class="card"><div class="section-head"><div><p class="eyebrow">روز ایجاد</p><h2>تاریخ ورود</h2></div><span>فقط روز دارای ترکیب معتبر</span></div><div class="backtest-wheel" id="bt-entry-date" role="listbox" tabindex="0"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">روز سنجش</p><h2>تاریخ خروج آزمایشی</h2></div><span>فقط روز دارای قیمت همه پاها</span></div><div class="backtest-wheel" id="bt-exit-date" role="listbox" tabindex="0"></div></section></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">قراردادهای واقعی</p><h2>ترکیب استراتژی</h2></div><span id="bt-combo-count">—</span></div><label class="backtest-combo">ترکیب قراردادها<select id="bt-combo"></select></label><div id="bt-legs" class="backtest-legs"></div></section>
    <div class="backtest-date-grid"><section class="card"><div class="section-head"><div><p class="eyebrow">دکمه ریلی ورود</p><h2>قیمت روز ایجاد</h2></div></div>${basisRail('bt-entry-basis', 'LAST')}<div id="bt-entry-market"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">دکمه ریلی سنجش</p><h2>قیمت روز خروج</h2></div></div>${basisRail('bt-exit-basis', 'LAST')}<div id="bt-exit-market"></div></section></div>
    <section class="card backtest-runbar"><div><p class="eyebrow">نمای مسیر</p><select id="bt-path-mode"><option value="combined">روزهای قبل + ریزمعامله روز آخر</option><option value="daily">فقط مسیر روزانه</option><option value="intraday">فقط ریزمعامله روز سنجش</option></select></div><p id="bt-run-note">ریز روز آخر از آخرین معامله مشاهده‌شده هر پا تا همان لحظه ساخته می‌شود و تضمین آفست هم‌زمان نیست.</p><button type="button" class="primary" id="bt-run">اجرای بک‌تست</button></section>
    <section id="bt-result" hidden><div class="backtest-kpis" id="bt-kpis"></div>
      <div class="backtest-chart-grid"><section class="card"><div class="section-head"><h2>سود و زیان مبلغی</h2><span>ریال</span></div><div id="bt-money-chart" class="backtest-chart"></div></section><section class="card"><div class="section-head"><h2>بازده و تغییر نماد پایه</h2><span>درصد</span></div><div id="bt-return-chart" class="backtest-chart"></div></section></div>
      <section class="card"><div class="section-head"><div><p class="eyebrow">اثر هر پایه</p><h2>جزئیات پاهای استراتژی در روز سنجش</h2></div><span id="bt-final-source">—</span></div><div id="bt-leg-table" class="history-table-wrap"></div></section>
      <section class="card backtest-matrix-link"><div class="section-head"><div><p class="eyebrow">رابطه با ماتریس ورود × خروج</p><h2>اعتبارسنجی افق کوتاه</h2></div></div><div id="bt-matrix-idea"></div></section>
    </section>
  </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const status = $('bt-status'), baseSelect = $('bt-base'), strategySelect = $('bt-strategy');
  const entryRail = $('bt-entry-basis'), exitRail = $('bt-exit-basis');
  let chain = new Map(), ua = null, contracts = [], seriesByIns = {}, entryDates = [], combos = [], legs = null;
  let replay = null, intraday = [], exitDates = [];
  const setStatus = (text, error = false) => { status.textContent = text; status.toggleAttribute('data-error', error); };

  for (const [group, title] of Object.entries(GROUPS)) {
    const optgroup = document.createElement('optgroup'); optgroup.label = title;
    for (const def of CATALOG.filter((item) => item.group === group && item.feasible)) {
      const option = document.createElement('option'); option.value = def.id; option.textContent = def.name; optgroup.appendChild(option);
    }
    strategySelect.appendChild(optgroup);
  }
  strategySelect.value = 'short-strangle';

  const rowAt = (ins, date) => (seriesByIns[String(ins)] || []).find((row) => normalizeHistoryDate(row.date) === Number(date));
  const comboLabel = (combo) => `${combo.legs.map((leg) => nameOf(leg, 'قرارداد')).join(' + ')} · اعمال ${combo.strikes.map((strike) => fmt.int(strike)).join(' / ')} · سررسید ${combo.expiries.map(dateLabel).join(' / ')}`;

  function renderCombo() {
    const index = Number($('bt-combo').value);
    legs = combos[index]?.legs || null;
    if (!legs) { $('bt-legs').innerHTML = '<p class="empty-note">ترکیب معتبری برای این روز و مبنای قیمت نیست.</p>'; return; }
    const entryDate = Number($('bt-entry-date').dataset.value), basis = entryRail.dataset.value || 'LAST';
    $('bt-legs').innerHTML = legs.map((leg, index) => {
      const row = rowAt(leg.ins, entryDate), market = historyMarketMetrics(row);
      return `<article><span>${faDigits(index + 1)} · ${leg.side === 'buy' ? 'خرید' : 'فروش'} ${leg.kind === 'call' ? 'اختیار خرید' : leg.kind === 'put' ? 'اختیار فروش' : 'نماد پایه'}</span><b>${esc(nameOf(leg, 'پایه'))}</b><small>اعمال ${leg.kind === 'underlying' ? '—' : fmt.int(leg.strike)} · نسبت ${fmt.num(leg.ratio)} · اندازه ${fmt.int(leg.size)}</small><small>قیمت ورود ${fmt.money(historyPrice(row, basis))} · حجم ${fmt.int(market.volume)} · ارزش ${fmt.money(market.value)}</small></article>`;
    }).join('');
    refreshExitDates(); paintSnapshots();
  }

  function refreshCombos() {
    const entryDate = Number($('bt-entry-date').dataset.value);
    if (!entryDate) return;
    const generated = generateHistoricalCombos({ def: byId(strategySelect.value), ua, seriesByIns, startDate: entryDate, entryBasis: entryRail.dataset.value || 'LAST', settings: state.settings, filtered: true });
    combos = generated.combos || [];
    $('bt-combo').innerHTML = combos.length ? combos.slice(0, 1000).map((combo, index) => `<option value="${index}">${esc(comboLabel(combo))}</option>`).join('') : '<option value="">ترکیب معتبر پیدا نشد</option>';
    $('bt-combo-count').textContent = `${fmt.int(combos.length)} ترکیب قابل اجرا`;
    renderCombo();
  }

  function refreshExitDates() {
    if (!legs) return;
    const entryDate = Number($('bt-entry-date').dataset.value);
    const allBaseDates = (seriesByIns[String(ua.ins)] || []).map((row) => normalizeHistoryDate(row.date)).filter((date) => date >= entryDate);
    const maxDate = Math.min(Math.max(...allBaseDates), ...legs.filter((leg) => leg.kind !== 'underlying').map((leg) => normalizeHistoryDate(leg.expiry)));
    const result = replayHistory({ legs, seriesByIns, baseIns: String(ua.ins), startDate: entryDate, endDate: maxDate, entryBasis: entryRail.dataset.value || 'LAST', exitBasis: exitRail.dataset.value || 'LAST', units: 1, fees: feesOf(state.settings), settings: state.settings });
    exitDates = result.ok ? result.rows.filter((row) => row.status === 'ok').map((row) => row.date) : [];
    const selected = exitDates.includes(Number($('bt-exit-date').dataset.value)) ? Number($('bt-exit-date').dataset.value) : exitDates[Math.min(exitDates.length - 1, 4)];
    mountWheel($('bt-exit-date'), exitDates, selected, () => paintSnapshots());
  }

  function paintSnapshots() {
    const entry = Number($('bt-entry-date').dataset.value), exit = Number($('bt-exit-date').dataset.value);
    $('bt-entry-market').innerHTML = marketSnapshot(rowAt(ua?.ins, entry));
    $('bt-exit-market').innerHTML = marketSnapshot(rowAt(ua?.ins, exit));
  }

  async function findExecutableDates() {
    const def = byId(strategySelect.value), basis = entryRail.dataset.value || 'LAST';
    const baseDates = (seriesByIns[String(ua.ins)] || []).map((row) => normalizeHistoryDate(row.date)).filter(Boolean);
    const found = [];
    for (let index = 0; index < baseDates.length; index++) {
      const date = baseDates[index];
      const generated = generateHistoricalCombos({ def, ua, seriesByIns, startDate: date, entryBasis: basis, settings: { ...state.settings, maxRows: 1 }, filtered: true });
      if (generated.combos.length) found.push(date);
      if (index % 10 === 0) { setStatus(`سنجش روزهای قابل اجرا: ${fmt.int(index + 1)} از ${fmt.int(baseDates.length)}`); await nextFrame(); }
    }
    return found;
  }

  async function loadHistory() {
    ua = chain.get(baseSelect.value);
    if (!ua) { setStatus('ابتدا نماد پایه را انتخاب کن.', true); return; }
    contracts = flattenActiveContracts(ua);
    const codes = [...new Set([String(ua.ins), ...contracts.map((contract) => String(contract.ins))])];
    $('bt-load').disabled = true; setStatus(`دریافت تاریخچه ${fmt.int(codes.length)} نماد…`);
    try {
      const payloads = await Promise.all(chunks(codes, 70).map(async (part) => {
        const response = await fetch(`/api/dailies?ins=${part.join(',')}&n=0`), payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || 'تاریخچه دریافت نشد');
        return payload;
      }));
      seriesByIns = {};
      for (const payload of payloads) for (const [ins, value] of Object.entries(payload)) seriesByIns[ins] = value.rows || [];
      entryDates = await findExecutableDates();
      if (!entryDates.length) throw new Error('با این نماد و استراتژی روز قابل‌اجرایی پیدا نشد');
      $('bt-work').hidden = false;
      const selected = entryDates[Math.max(0, entryDates.length - 10)];
      mountWheel($('bt-entry-date'), entryDates, selected, () => refreshCombos());
      refreshCombos(); setStatus(`${fmt.int(entryDates.length)} روز قابل اجرا آماده است.`);
    } catch (error) { setStatus(errorText(error, 'تاریخچه دریافت نشد.'), true); } finally { $('bt-load').disabled = false; }
  }

  async function fetchTrades(ins, date) {
    const response = await fetch(`/api/trades?ins=${encodeURIComponent(ins)}&date=${date}`), payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'ریزمعامله دریافت نشد');
    return payload.rows || [];
  }

  function paintResult() {
    const mode = $('bt-path-mode').value;
    const path = combinedBacktestPath(replay, intraday, mode);
    const lastDaily = replay.summary.last, lastTick = intraday.at(-1);
    const final = mode !== 'daily' && lastTick ? lastTick : lastDaily;
    const firstProfit = path.find((point) => point.netPnl > 0);
    const best = path.filter((point) => Number.isFinite(point.netPnl)).reduce((a, point) => !a || point.netPnl > a.netPnl ? point : a, null);
    const worst = path.filter((point) => Number.isFinite(point.netPnl)).reduce((a, point) => !a || point.netPnl < a.netPnl ? point : a, null);
    const firstLabel = firstProfit ? (firstProfit.granularity === 'trade' ? `روز سنجش · ${faDigits(firstProfit.timeLabel)}` : `${faDigits(firstProfit.dateLabel)} · روز ${fmt.int(firstProfit.holdingDays)}`) : 'در این بازه رخ نداد';
    const cards = [
      ['سود/زیان نهایی', fmt.money(final?.netPnl), signTone(final?.netPnl)], ['بازده نهایی', fmt.pct(final?.returnPct), signTone(final?.returnPct)],
      ['تغییر نماد پایه', fmt.pct(final?.basePct ?? lastDaily?.baseCumulativePct), signTone(final?.basePct ?? lastDaily?.baseCumulativePct)], ['کوتاه‌ترین زمان سود', firstLabel, firstProfit ? 'gain' : ''],
      ['بهترین نقطه', best ? `${fmt.money(best.netPnl)} · ${fmt.pct(best.returnPct)}` : '—', 'gain'], ['بدترین نقطه', worst ? `${fmt.money(worst.netPnl)} · ${fmt.pct(worst.returnPct)}` : '—', 'loss'],
    ];
    $('bt-kpis').innerHTML = cards.map(([label, value, tone]) => `<article class="${tone}"><span>${label}</span><b>${value}</b></article>`).join('');
    chart($('bt-money-chart'), path, [{ key: 'netPnl', label: 'سود و زیان خالص', color: 'var(--accent)' }], { money: true });
    chart($('bt-return-chart'), path, [{ key: 'returnPct', label: 'بازده استراتژی', color: 'var(--accent)' }, { key: 'basePct', label: 'تغییر پایه', color: 'var(--cmp1)' }, { key: 'baseCumulativePct', label: 'تغییر پایه', color: 'var(--cmp1)' }]);
    const finalLegs = lastTick?.perLeg || lastDaily?.perLeg || [];
    $('bt-final-source').textContent = lastTick ? `آخرین ریزمعامله کامل در ${faDigits(lastTick.timeLabel)}` : 'قیمت روزانه انتخاب‌شده';
    $('bt-leg-table').innerHTML = `<table class="history-table"><thead><tr><th>پا</th><th>جهت</th><th>قیمت ورود</th><th>قیمت سنجش</th><th>اثر ناخالص</th><th>کارمزد</th><th>اثر خالص</th><th>حجم/ارزش روز</th></tr></thead><tbody>${finalLegs.map((leg, index) => {
      const dailyLeg = lastDaily?.perLeg?.[index];
      return `<tr><td>${faDigits(index + 1)} · ${esc(nameOf(leg, `پای ${index + 1}`))}</td><td>${replay.priced[index]?.side === 'buy' ? 'خرید' : 'فروش'}</td><td>${fmt.money(leg.entryPrice)}</td><td>${fmt.money(leg.exitPrice)}</td><td class="${signTone(leg.grossPnl)}">${fmt.money(leg.grossPnl)}</td><td>${fmt.money((leg.entryFee || 0) + (leg.exitFee || 0))}</td><td class="${signTone(leg.netPnl)}">${fmt.money(leg.netPnl)}</td><td>حجم ${fmt.int(dailyLeg?.volume)} · ارزش ${fmt.money(dailyLeg?.value)}</td></tr>`;
    }).join('')}</tbody></table>`;

    const args = { legs, seriesByIns, baseIns: String(ua.ins), startDate: entryDates[0], endDate: Number($('bt-exit-date').dataset.value), entryBasis: entryRail.dataset.value, exitBasis: exitRail.dataset.value, units: Math.max(1, Math.trunc(Number($('bt-units').value) || 1)), fees: feesOf(state.settings), settings: state.settings };
    const matrix = rollingEntryMatrix(args), profile = holdingPeriodProfile(matrix), recommended = profile.best;
    const selectedDays = Math.max(0, replay.rows.findIndex((row) => row.date === replay.endDate));
    $('bt-matrix-idea').innerHTML = recommended ? `<div class="backtest-matrix-kpis"><article><span>افق مقاوم ماتریس</span><b>${fmt.int(recommended.holdingTradingDays)} روز معاملاتی</b></article><article><span>میانه بازده آن افق</span><b class="${signTone(recommended.medianReturn)}">${fmt.pct(recommended.medianReturn)}</b></article><article><span>درصد نمونه‌های سودده</span><b>${fmt.pct(recommended.winPct)}</b></article><article><span>افق انتخابی این بک‌تست</span><b>${fmt.int(selectedDays)} روز معاملاتی</b></article></div><p>ماتریس فقط افق پرتکرار و کم‌پراکندگی را پیشنهاد می‌کند؛ این بک‌تست قرارداد، قیمت ورود، حجم و مسیر واقعی انتخاب‌شده را جداگانه می‌سنجد. یک خانه سبز به‌تنهایی «بهینه» نیست و ممکن است حاصل انتخاب پس‌نگر باشد.</p>` : '<p>برای این ترکیب نمونه کافی جهت پیشنهاد افق مقاوم ماتریس وجود ندارد؛ نتیجه همین مسیر را می‌بینی، بدون ادعای بهینه‌بودن.</p>';
  }

  async function runBacktest() {
    const startDate = Number($('bt-entry-date').dataset.value), endDate = Number($('bt-exit-date').dataset.value);
    if (!legs || !startDate || !endDate) { setStatus('تاریخ و ترکیب معتبر را انتخاب کن.', true); return; }
    $('bt-run').disabled = true; setStatus('در حال محاسبه مسیر و دریافت ریزمعامله روز سنجش…');
    try {
      replay = replayHistory({ legs, seriesByIns, baseIns: String(ua.ins), startDate, endDate, entryBasis: entryRail.dataset.value, exitBasis: exitRail.dataset.value, units: Math.max(1, Math.trunc(Number($('bt-units').value) || 1)), fees: feesOf(state.settings), settings: state.settings });
      if (!replay.ok) throw new Error(replay.error);
      let rows = [];
      try {
        rows = await Promise.all([...new Set([...legs.map((leg) => String(leg.ins)), String(ua.ins)])].map(async (ins) => [ins, await fetchTrades(ins, endDate)]));
      } catch (error) { setStatus(`مسیر روزانه آماده شد؛ ریز روز آخر در دسترس نبود: ${error.message}`, true); }
      const byIns = Object.fromEntries(rows);
      // اگر بالادست وضعیت ابطال را نفرستد، ما نمی‌دانیم معامله‌ای باطل شده یا
      // نه. سکوت در این حالت یعنی ادعای ضمنی «هیچ‌کدام باطل نشده» — پس صریح
      // گفته می‌شود که نمی‌دانیم.
      const allTrades = rows.flatMap(([, list]) => list);
      const cancelUnknown = allTrades.length > 0 && allTrades.some((trade) => trade.canceledKnown === false);
      $('bt-run-note').textContent = cancelUnknown
        ? 'ریز روز آخر از آخرین معامله مشاهده‌شده هر پا تا همان لحظه ساخته می‌شود و تضمین آفست هم‌زمان نیست. منبع داده وضعیت ابطال معامله را اعلام نکرده، پس معامله باطل‌شده احتمالی کنار گذاشته نشده است.'
        : 'ریز روز آخر از آخرین معامله مشاهده‌شده هر پا تا همان لحظه ساخته می‌شود و تضمین آفست هم‌زمان نیست. معامله باطل‌شده کنار گذاشته شده است.';
      intraday = replayIntraday({ replay, tradesByIns: byIns, baseTrades: byIns[String(ua.ins)] || [], fees: feesOf(state.settings) });
      $('bt-result').hidden = false; paintResult();
      if (intraday.length) setStatus(`${fmt.int(replay.summary.validDays)} روز و ${fmt.int(intraday.length)} نقطه ریزمعامله محاسبه شد.`);
      $('bt-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setStatus(errorText(error, 'بک‌تست اجرا نشد.'), true); } finally { $('bt-run').disabled = false; }
  }

  entryRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(entryRail, button.dataset.basis); if (entryDates.length) refreshCombos(); } });
  exitRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(exitRail, button.dataset.basis); refreshExitDates(); } });
  $('bt-combo').addEventListener('change', renderCombo); $('bt-path-mode').addEventListener('change', () => { if (replay) paintResult(); });
  $('bt-load').addEventListener('click', loadHistory); $('bt-run').addEventListener('click', runBacktest);
  baseSelect.addEventListener('change', () => { $('bt-work').hidden = true; $('bt-result').hidden = true; });
  strategySelect.addEventListener('change', () => { $('bt-work').hidden = true; $('bt-result').hidden = true; });

  try {
    const response = await fetch('/api/history/universe'), payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'فهرست دریافت نشد');
    chain = buildChain(payload.rows || []); baseSelect.innerHTML = '<option value="">نماد پایه را انتخاب کن</option>';
    for (const item of [...chain.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fa'))) {
      const option = document.createElement('option'); option.value = item.ins; option.textContent = `${nameOf(item, 'نماد پایه')} · ${fmt.int(item.contracts)} قرارداد`; baseSelect.appendChild(option);
    }
    setStatus(`${fmt.int(chain.size)} نماد پایه آماده است.`);
  } catch (error) { setStatus(errorText(error, 'فهرست نمادها دریافت نشد.'), true); }

  return () => {};
}
