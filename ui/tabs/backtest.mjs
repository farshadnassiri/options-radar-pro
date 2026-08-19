import { CATALOG, GROUPS, byId } from '/strategies/catalog.mjs';
import { buildChain } from '/core/chain.mjs';
import { feesOf } from '/core/settings.mjs';
import {
  HISTORY_BASES, flattenActiveContracts, generateHistoricalCombos, historyDateLabel,
  historyMarketMetrics, historyPrice, normalizeHistoryDate,
  replayHistory, rollingEntryMatrix, holdingPeriodProfile, strategyLegSnapshots,
} from '/core/history.mjs';
import {
  replayIntraday, combinedBacktestPath, summarizeIntraday,
  INTRADAY_START_SECOND, INTRADAY_END_SECOND,
} from '/core/backtest.mjs';
import { mountDateWheel } from '/ui/datewheel.mjs';
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
const LEG_COLORS = ['var(--accent)', 'var(--cmp1)', 'var(--cmp2)', 'var(--cmp3)', 'var(--cmp4)'];
const errorText = (error, fallback) => /fetch failed|network|failed to fetch/i.test(String(error?.message || error))
  ? 'اتصال به منبع داده برقرار نشد.' : (String(error?.message || '').trim() || fallback);
const clockLabel = (second) => {
  const value = Math.max(0, Math.trunc(Number(second) || 0));
  return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor((value % 3600) / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};
const ageLabel = (second) => Number.isFinite(Number(second)) ? `${fmt.int(second)} ثانیه` : '—';

function intradayChartRows(points, date) {
  return points.map((point) => {
    const row = { ...point, date, granularity: 'trade' };
    point.perLeg.forEach((leg, index) => {
      row[`legPnl${index}`] = leg.netPnl;
      row[`legPrice${index}`] = leg.pricePct;
      row[`legVolume${index}`] = leg.cumulativeVolume;
    });
    return row;
  });
}

function basisRail(id, selected = 'LAST') {
  return `<div class="backtest-basis" id="${id}" role="radiogroup" aria-label="مبنای قیمت">${HISTORY_BASES.map(([value, label]) => `<button type="button" data-basis="${value}" role="radio" aria-checked="${value === selected}">${label}</button>`).join('')}</div>`;
}

function setRail(host, value) {
  host.dataset.value = value;
  host.querySelectorAll('[data-basis]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.basis === value)));
}

function marketSnapshot(snapshots, selectedBasis) {
  if (!snapshots?.length) return '<p class="empty-note">ابتدا یک ترکیب معتبر انتخاب کن.</p>';
  return `<div class="backtest-leg-markets">${snapshots.map((snapshot) => {
    const kind = snapshot.kind === 'call' ? 'اختیار خرید' : snapshot.kind === 'put' ? 'اختیار فروش' : 'نماد پایه';
    const prices = HISTORY_BASES.map(([basis, label]) => `<div data-active="${basis === selectedBasis}"><span>${label}</span><b>${fmt.money(snapshot.prices[basis])}</b></div>`).join('');
    return `<article><div class="backtest-leg-market-head"><div><small>پای ${fmt.int(snapshot.index + 1)} · ${snapshot.side === 'buy' ? 'خرید' : 'فروش'} ${kind}</small><b>${esc(nameOf(snapshot, `پای ${snapshot.index + 1}`))}</b></div><span>${snapshot.kind === 'underlying' ? 'دارایی پایه' : `اعمال ${fmt.int(snapshot.strike)}`}</span></div><div class="backtest-price-grid">${prices}</div><div class="backtest-market-strip"><span>حجم <b>${fmt.int(snapshot.market.volume)}</b></span><span>معامله <b>${fmt.int(snapshot.market.trades)}</b></span><span>ارزش ${snapshot.market.valueEstimated ? 'تقریبی' : 'رسمی'} <b>${fmt.money(snapshot.market.value)}</b></span></div></article>`;
  }).join('')}</div>`;
}

function chart(host, points, series, { money = false, count = false, timeScale = false, step = false } = {}) {
  const rows = points.filter((point) => series.some((item) => Number.isFinite(Number(point[item.key]))));
  if (rows.length < 2) { host.innerHTML = '<p class="empty-note">برای نمودار دست‌کم دو نقطه معتبر لازم است.</p>'; return; }
  const W = 900, H = 330, L = 92, R = 28, T = 28, B = 55;
  const values = rows.flatMap((row) => series.map((item) => Number(row[item.key])).filter(Number.isFinite));
  let lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  if (Math.abs(hi - lo) < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo = count ? 0 : lo - pad; hi += pad;
  const x = (row, index) => timeScale
    ? L + ((Math.max(INTRADAY_START_SECOND, Math.min(INTRADAY_END_SECOND, Number(row.second))) - INTRADAY_START_SECOND) / (INTRADAY_END_SECOND - INTRADAY_START_SECOND)) * (W - L - R)
    : L + (index / Math.max(1, rows.length - 1)) * (W - L - R);
  const y = (value) => T + ((hi - value) / (hi - lo)) * (H - T - B);
  const label = (value) => money ? fmt.money(value) : count ? fmt.int(value) : fmt.pct(value);
  const ticks = Array.from({ length: 5 }, (_, index) => lo + ((hi - lo) * index) / 4);
  // یک خط منطقی می‌تواند بین دو نام میدان تقسیم شده باشد (سطر روزانه
  // `baseCumulativePct`، سطر ریزمعامله `basePct`). آن‌ها هم‌رنگ‌اند چون یک
  // چیزند؛ پس راهنما هم باید یک چیپ نشان دهد، نه دو چیپ هم‌رنگ با دو نام.
  const legend = series.filter((item, index) => series.findIndex((other) => other.label === item.label) === index);
  // برچسب سری تا امروز رشته ثابتِ خودِ کد بود؛ حالا نام قرارداد بالادست هم
  // درونش می‌نشیند. هر جای دیگر این فایل نام را با esc می‌نویسد. اینجا هم
  // باید — و در خودِ chart، تا فراخوان بعدی نتواند دوباره فراموشش کند.
  const seriesLabel = (item) => esc(item.label);

  // مرز روز آخر. محور افقی بر پایه اندیس است، پس چند صد نقطه ریزمعامله
  // بخش روزانه را باریک می‌کند. بدون این خط، کاربر نمی‌فهمد از کجا مقیاس
  // زمان عوض شده و شیب تند انتهای نمودار را با حرکت چند روزه اشتباه می‌گیرد.
  const firstTick = rows.findIndex((row) => row.granularity === 'trade');
  const boundary = !timeScale && firstTick > 0 ? `<line x1="${x(rows[firstTick], firstTick)}" x2="${x(rows[firstTick], firstTick)}" y1="${T}" y2="${H - B}" class="backtest-split"/><text x="${x(rows[firstTick], firstTick)}" y="${H - B + 18}" text-anchor="middle" class="backtest-split-label">شروع ریزمعامله روز آخر</text>` : '';
  const timeTicks = timeScale ? [9 * 3600, 10 * 3600, 11 * 3600, 12 * 3600, INTRADAY_END_SECOND] : [];
  const seriesShape = (item) => {
    const values = rows.map((row, index) => Number.isFinite(Number(row[item.key])) ? { x: x(row, index), y: y(Number(row[item.key])) } : null).filter(Boolean);
    if (!values.length) return '';
    if (!step) return `<polyline fill="none" stroke="${item.color}" points="${values.map((point) => `${point.x},${point.y}`).join(' ')}"/>`;
    const d = values.slice(1).reduce((path, point) => `${path} H ${point.x} V ${point.y}`, `M ${values[0].x} ${values[0].y}`);
    return `<path fill="none" stroke="${item.color}" d="${d}"/>`;
  };

  host.innerHTML = `<div class="backtest-chart-legend">${legend.map((item) => `<span style="--series:${item.color}"><i></i>${seriesLabel(item)}</span>`).join('')}</div><div class="backtest-chart-stage"><svg viewBox="0 0 ${W} ${H}" tabindex="0" aria-label="نمودار تعاملی بک‌تست">
    ${ticks.map((value) => `<line x1="${L}" x2="${W - R}" y1="${y(value)}" y2="${y(value)}" class="backtest-grid"/><text x="${L - 10}" y="${y(value) + 4}" text-anchor="end">${label(value)}</text>`).join('')}
    ${timeTicks.map((second) => `<line x1="${x({ second }, 0)}" x2="${x({ second }, 0)}" y1="${T}" y2="${H - B}" class="backtest-time-grid"/><text x="${x({ second }, 0)}" y="${H - B + 22}" text-anchor="middle">${faDigits(clockLabel(second).slice(0, 5))}</text>`).join('')}
    <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="backtest-zero"/>
    ${boundary}
    ${series.map(seriesShape).join('')}
    <g class="backtest-cursor" hidden><line y1="${T}" y2="${H - B}"/><g></g></g>
    <rect class="backtest-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
  </svg><div class="backtest-tip" hidden></div></div>`;
  const svg = host.querySelector('svg'), cursor = host.querySelector('.backtest-cursor'), tip = host.querySelector('.backtest-tip');
  const show = (index, clientX, clientY) => {
    const row = rows[index], px = x(row, index);
    cursor.hidden = false;
    cursor.querySelector('line').setAttribute('x1', px); cursor.querySelector('line').setAttribute('x2', px);
    cursor.querySelector('g').innerHTML = series.map((item) => Number.isFinite(Number(row[item.key])) ? `<circle cx="${px}" cy="${y(Number(row[item.key]))}" r="4" fill="${item.color}"/>` : '').join('');
    const when = row.granularity === 'trade' ? `${dateLabel(row.date)} · ${faDigits(row.timeLabel)}` : faDigits(row.dateLabel || historyDateLabel(row.date));
    tip.innerHTML = `<b>${when}</b>${series.map((item) => Number.isFinite(Number(row[item.key])) ? `<span style="--series:${item.color}"><i></i>${seriesLabel(item)}: <strong class="${signTone(row[item.key])}">${label(row[item.key])}</strong></span>` : '').join('')}`;
    tip.hidden = false;
    const box = host.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(box.width - 190, clientX - box.left + 12))}px`;
    tip.style.top = `${Math.max(8, clientY - box.top - 75)}px`;
  };
  const move = (event) => {
    const rect = svg.getBoundingClientRect();
    const ux = ((event.clientX - rect.left) / rect.width) * W;
    let index;
    if (timeScale) {
      const target = INTRADAY_START_SECOND + ((ux - L) / (W - L - R)) * (INTRADAY_END_SECOND - INTRADAY_START_SECOND);
      let low = 0, high = rows.length - 1;
      while (low < high) { const middle = Math.floor((low + high) / 2); if (rows[middle].second < target) low = middle + 1; else high = middle; }
      index = low > 0 && Math.abs(rows[low - 1].second - target) < Math.abs(rows[low].second - target) ? low - 1 : low;
    } else index = Math.round(((ux - L) / (W - L - R)) * (rows.length - 1));
    index = Math.max(0, Math.min(rows.length - 1, index));
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
    <div class="backtest-date-grid"><section class="card"><div class="section-head"><div><p class="eyebrow">روز ایجاد</p><h2>تاریخ ورود</h2></div><span>فقط روز دارای ترکیب معتبر</span></div><div id="bt-entry-date"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">روز سنجش</p><h2>تاریخ خروج آزمایشی</h2></div><span>فقط روز دارای قیمت همه پاها</span></div><div id="bt-exit-date"></div></section></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">قراردادهای واقعی</p><h2>ترکیب استراتژی</h2></div><span id="bt-combo-count">—</span></div><label class="backtest-combo">ترکیب قراردادها<select id="bt-combo"></select></label><div id="bt-legs" class="backtest-legs"></div></section>
    <div class="backtest-date-grid"><section class="card"><div class="section-head"><div><p class="eyebrow">دکمه ریلی ورود</p><h2>قیمت پاها در روز ایجاد</h2></div><span>هر کارت یک پای استراتژی</span></div>${basisRail('bt-entry-basis', 'LAST')}<div id="bt-entry-market"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">دکمه ریلی سنجش</p><h2>قیمت پاها در روز خروج</h2></div><span>همان قراردادهای ترکیب</span></div>${basisRail('bt-exit-basis', 'LAST')}<div id="bt-exit-market"></div></section></div>
    <section class="card backtest-runbar"><div><p class="eyebrow">نمای مسیر</p><select id="bt-path-mode"><option value="combined">روزهای قبل + ریزمعامله روز آخر</option><option value="daily">فقط مسیر روزانه</option><option value="intraday">فقط ریزمعامله روز سنجش</option></select></div><p id="bt-run-note">برای هر ثانیهٔ معامله بین ۹:۰۰ تا ۱۲:۳۰، آخرین قیمت مشاهده‌شده تمام پاها روی یک خط زمانی مشترک قرار می‌گیرد. این ارزش‌گذاری مشاهده‌ای است و تضمین اجرای هم‌زمان نیست.</p><button type="button" class="primary" id="bt-run">اجرای بک‌تست</button></section>
    <section id="bt-result" hidden><div class="backtest-kpis" id="bt-kpis"></div>
      <div class="backtest-chart-grid"><section class="card"><div class="section-head"><h2>سود و زیان مبلغی</h2><span>ریال</span></div><div id="bt-money-chart" class="backtest-chart"></div></section><section class="card"><div class="section-head"><h2>بازده و تغییر نماد پایه</h2><span>درصد</span></div><div id="bt-return-chart" class="backtest-chart"></div></section></div>
      <section class="card backtest-intraday-panel"><div class="section-head"><div><p class="eyebrow">خط زمانی مشترک همه پاها</p><h2>تحلیل درون‌روزی ۹:۰۰ تا ۱۲:۳۰</h2></div><div class="backtest-head-actions"><span id="bt-intraday-source">—</span><button type="button" id="bt-export-intraday">خروجی همه نقاط</button></div></div><div id="bt-intraday-kpis" class="backtest-kpis"></div>
        <div class="backtest-chart-grid"><section><div class="section-head"><h3>آفست لحظه‌ای موقعیت</h3><span>ریال · مسیر پله‌ای</span></div><div id="bt-intraday-pnl-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>اثر خالص هر پا</h3><span>تفکیک ریالی</span></div><div id="bt-intraday-leg-chart" class="backtest-chart"></div></section></div>
        <div class="backtest-chart-grid"><section><div class="section-head"><h3>حرکت قیمت هر پا</h3><span>نسبت به اولین معامله همان پا</span></div><div id="bt-intraday-price-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>حجم تجمعی هر پا</h3><span>قرارداد</span></div><div id="bt-intraday-volume-chart" class="backtest-chart"></div></section></div>
        <div class="backtest-analysis-grid"><section><div class="section-head"><h3>پنجره‌های ۱۵ دقیقه‌ای</h3><span>دامنه و جریان آفست</span></div><div id="bt-interval-table" class="history-table-wrap"></div></section><section><div class="section-head"><h3>ماتریس هم‌حرکتی اثر پاها</h3><span>تغییرات نقطه‌به‌نقطه</span></div><div id="bt-correlation-table" class="history-table-wrap"></div><p id="bt-correlation-note" class="backtest-table-note"></p></section></div>
        <section class="backtest-tape"><div class="section-head"><div><h3>نوار مشترک قیمت و حجم</h3><p>نمودارها همه نقاط را دارند؛ جدول برای حفظ سرعت حداکثر ۳۰۰ نقطه را با فاصله یکنواخت نشان می‌دهد.</p></div><span id="bt-tape-count">—</span></div><div id="bt-tape-table" class="history-table-wrap"></div></section>
      </section>
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
    refreshExitDates();
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
    mountDateWheel($('bt-exit-date'), exitDates, selected, () => paintSnapshots(), { empty: 'روز دارای قیمت همه پاها پیدا نشد.' });
    paintSnapshots();
  }

  function paintSnapshots() {
    const entry = Number($('bt-entry-date').dataset.value), exit = Number($('bt-exit-date').dataset.value);
    $('bt-entry-market').innerHTML = marketSnapshot(strategyLegSnapshots(legs, seriesByIns, entry), entryRail.dataset.value || 'LAST');
    $('bt-exit-market').innerHTML = marketSnapshot(strategyLegSnapshots(legs, seriesByIns, exit), exitRail.dataset.value || 'LAST');
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
      mountDateWheel($('bt-entry-date'), entryDates, selected, () => refreshCombos(), { empty: 'روز قابل‌اجرا پیدا نشد.' });
      refreshCombos(); setStatus(`${fmt.int(entryDates.length)} روز قابل اجرا آماده است.`);
    } catch (error) { setStatus(errorText(error, 'تاریخچه دریافت نشد.'), true); } finally { $('bt-load').disabled = false; }
  }

  async function fetchTrades(ins, date) {
    const response = await fetch(`/api/trades?ins=${encodeURIComponent(ins)}&date=${date}`), payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'ریزمعامله دریافت نشد');
    return payload.rows || [];
  }

  function paintIntradayAnalysis() {
    const summary = summarizeIntraday(intraday);
    const hosts = ['bt-intraday-pnl-chart', 'bt-intraday-leg-chart', 'bt-intraday-price-chart', 'bt-intraday-volume-chart', 'bt-interval-table', 'bt-correlation-table', 'bt-tape-table'];
    if (!summary.points) {
      $('bt-intraday-source').textContent = 'فاقد خط زمانی کامل';
      $('bt-intraday-kpis').innerHTML = '';
      $('bt-tape-count').textContent = '—';
      $('bt-correlation-note').textContent = '';
      hosts.forEach((id) => { $(id).innerHTML = '<p class="empty-note">برای این روز، قیمت تمام پاها در بازهٔ ۹:۰۰ تا ۱۲:۳۰ کامل نشده است.</p>'; });
      return;
    }

    const rows = intradayChartRows(intraday, replay.endDate);
    const legSeries = summary.legs.map((leg, index) => ({ key: `legPnl${index}`, label: `${faDigits(index + 1)} · ${nameOf(leg, 'پا')}`, color: LEG_COLORS[index % LEG_COLORS.length] }));
    const priceSeries = [
      { key: 'returnPct', label: 'بازده استراتژی از ورود', color: 'var(--gain)' },
      ...summary.legs.map((leg, index) => ({ key: `legPrice${index}`, label: `قیمت ${faDigits(index + 1)} · ${nameOf(leg, 'پا')}`, color: LEG_COLORS[index % LEG_COLORS.length] })),
    ];
    const volumeSeries = summary.legs.map((leg, index) => ({ key: `legVolume${index}`, label: `${faDigits(index + 1)} · ${nameOf(leg, 'پا')}`, color: LEG_COLORS[index % LEG_COLORS.length] }));
    $('bt-intraday-source').textContent = `${fmt.int(summary.points)} نقطه · ${faDigits(summary.first.timeLabel)} تا ${faDigits(summary.last.timeLabel)} · پنجره ${fmt.pct(summary.coveragePct)}٪ جلسه`;
    const cards = [
      ['آفست پایان مشاهده', fmt.money(summary.last.netPnl), signTone(summary.last.netPnl)],
      ['بازده پایان مشاهده', `${fmt.pct(summary.last.returnPct)}٪`, signTone(summary.last.returnPct)],
      ['بهترین لحظه', `${fmt.money(summary.best.netPnl)} · ${faDigits(summary.best.timeLabel)}`, 'gain'],
      ['بدترین لحظه', `${fmt.money(summary.worst.netPnl)} · ${faDigits(summary.worst.timeLabel)}`, 'loss'],
      ['بیشترین افت از قله', fmt.money(summary.maxDrawdown), signTone(summary.maxDrawdown)],
      ['زمان مشاهده‌شده در سود', `${fmt.pct(summary.positiveTimePct)}٪`, signTone(summary.positiveTimePct)],
      ['زمان با تازگی همه پاها', `${fmt.pct(summary.freshTimePct)}٪`, ''],
      ['بیشترین سن پا در پایان', ageLabel(summary.last.maxAgeSec), summary.last.allFresh ? 'gain' : 'loss'],
    ];
    $('bt-intraday-kpis').innerHTML = cards.map(([label, value, tone]) => `<article class="${tone}"><span>${label}</span><b>${value}</b></article>`).join('');
    chart($('bt-intraday-pnl-chart'), rows, [{ key: 'netPnl', label: 'سود و زیان خالص کل', color: 'var(--accent)' }], { money: true, timeScale: true, step: true });
    chart($('bt-intraday-leg-chart'), rows, legSeries, { money: true, timeScale: true, step: true });
    chart($('bt-intraday-price-chart'), rows, priceSeries, { timeScale: true, step: true });
    chart($('bt-intraday-volume-chart'), rows, volumeSeries, { count: true, timeScale: true, step: true });

    $('bt-interval-table').innerHTML = `<table class="history-table backtest-compact-table"><thead><tr><th>بازه</th><th>ابتدا</th><th>انتها</th><th>بیشینه</th><th>کمینه</th><th>تغییر</th><th>حجم پاها</th><th>نقاط تازه</th></tr></thead><tbody>${summary.intervals.map((row) => `<tr><td>${faDigits(clockLabel(row.startSecond).slice(0, 5))}–${faDigits(clockLabel(row.endSecond).slice(0, 5))}</td><td class="${signTone(row.openPnl)}">${fmt.money(row.openPnl)}</td><td class="${signTone(row.closePnl)}">${fmt.money(row.closePnl)}</td><td class="gain">${fmt.money(row.highPnl)}</td><td class="loss">${fmt.money(row.lowPnl)}</td><td class="${signTone(row.changePnl)}">${fmt.money(row.changePnl)}</td><td>${row.observations ? `${fmt.int(row.volume)} · ${fmt.int(row.trades)} معامله` : 'فاقد مشاهده'}</td><td>${row.observations ? `${fmt.pct(row.freshPct)}٪` : '—'}</td></tr>`).join('')}</tbody></table>`;

    const legHeads = summary.legs.map((leg, index) => `<th>${faDigits(index + 1)} · ${esc(nameOf(leg, 'پا'))}</th>`).join('');
    $('bt-correlation-table').innerHTML = `<table class="history-table backtest-correlation"><thead><tr><th>پا</th>${legHeads}</tr></thead><tbody>${summary.legs.map((leg, row) => `<tr><th>${faDigits(row + 1)} · ${esc(nameOf(leg, 'پا'))}</th>${summary.correlation[row].map((value) => `<td data-correlation="${Number.isFinite(value) ? Math.abs(value).toFixed(2) : ''}" class="${signTone(value)}">${fmt.num(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    // توضیح ماتریس بیرون از جعبه پیمایش می‌نشیند. اگر داخلش باشد با جدول
    // ۹۲۰ پیکسلی افقی کشیده و از دید کاربر بیرون می‌رود — و این جمله دقیقاً
    // همان چیزی است که «مقدار نامعلوم» را از «همبستگی صفر» جدا می‌کند.
    $('bt-correlation-note').textContent = 'همبستگی از تغییر اثر خالص پاها بین نقاط پیاپی محاسبه می‌شود؛ مقدار نامعلوم یعنی تغییر مشترک کافی وجود نداشته است.';

    const maxTape = 300, stride = Math.max(1, Math.ceil(intraday.length / maxTape));
    const tape = intraday.filter((_, index) => index % stride === 0 || index === intraday.length - 1);
    $('bt-tape-count').textContent = `${fmt.int(tape.length)} از ${fmt.int(intraday.length)} نقطه`;
    const tapeHeads = summary.legs.map((leg, index) => `<th>قیمت پای ${faDigits(index + 1)}</th><th>حجم ثانیه/تجمعی</th><th>سن</th>`).join('');
    $('bt-tape-table').innerHTML = `<table class="history-table backtest-tape-table"><thead><tr><th>زمان</th><th>آفست</th><th>بازده</th><th>قیمت پایه</th><th>سن بیشینه</th>${tapeHeads}</tr></thead><tbody>${tape.map((row) => `<tr data-fresh="${row.allFresh}"><td>${faDigits(row.timeLabel)}</td><td class="${signTone(row.netPnl)}">${fmt.money(row.netPnl)}</td><td class="${signTone(row.returnPct)}">${fmt.pct(row.returnPct)}٪</td><td>${fmt.money(row.basePrice)}</td><td>${ageLabel(row.maxAgeSec)}</td>${row.perLeg.map((leg) => `<td>${fmt.money(leg.exitPrice)}</td><td>${fmt.int(leg.secondVolume)} / ${fmt.int(leg.cumulativeVolume)}</td><td>${ageLabel(leg.ageSec)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function exportIntraday() {
    if (!intraday.length || !replay) return;
    const headers = ['زمان', 'سود و زیان خالص', 'بازده درصد', 'قیمت نماد پایه', 'تغییر نماد پایه درصد', 'بیشترین سن ثانیه'];
    replay.priced.forEach((leg, index) => headers.push(`پای ${index + 1} قیمت`, `پای ${index + 1} حجم ثانیه`, `پای ${index + 1} حجم تجمعی`, `پای ${index + 1} اثر خالص`, `پای ${index + 1} سن ثانیه`));
    const lines = [headers, ...intraday.map((row) => {
      const values = [row.timeLabel, row.netPnl, row.returnPct, row.basePrice, row.basePct, row.maxAgeSec];
      row.perLeg.forEach((leg) => values.push(leg.exitPrice, leg.secondVolume, leg.cumulativeVolume, leg.netPnl, leg.ageSec));
      return values;
    })].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','));
    const href = URL.createObjectURL(new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = href; link.download = `intraday-${replay.endDate}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
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
    paintIntradayAnalysis();
    const finalLegs = lastTick?.perLeg || lastDaily?.perLeg || [];
    $('bt-final-source').textContent = lastTick ? `آخرین ریزمعامله کامل در ${faDigits(lastTick.timeLabel)}` : 'قیمت روزانه انتخاب‌شده';
    $('bt-leg-table').innerHTML = `<table class="history-table"><thead><tr><th>پا</th><th>جهت</th><th>قیمت ورود</th><th>قیمت سنجش</th><th>اثر ناخالص</th><th>کارمزد</th><th>اثر خالص</th><th>حجم/ارزش روز</th></tr></thead><tbody>${finalLegs.map((leg, index) => {
      const dailyLeg = lastDaily?.perLeg?.[index];
      const activity = lastTick ? `حجم ${fmt.int(leg.cumulativeVolume)} · ${fmt.int(leg.tradeCount)} معامله · سن ${ageLabel(leg.ageSec)}` : `حجم ${fmt.int(dailyLeg?.volume)} · ارزش ${fmt.money(dailyLeg?.value)}`;
      return `<tr><td>${faDigits(index + 1)} · ${esc(nameOf(leg, `پای ${index + 1}`))}</td><td>${replay.priced[index]?.side === 'buy' ? 'خرید' : 'فروش'}</td><td>${fmt.money(leg.entryPrice)}</td><td>${fmt.money(leg.exitPrice)}</td><td class="${signTone(leg.grossPnl)}">${fmt.money(leg.grossPnl)}</td><td>${fmt.money((leg.entryFee || 0) + (leg.exitFee || 0))}</td><td class="${signTone(leg.netPnl)}">${fmt.money(leg.netPnl)}</td><td>${activity}</td></tr>`;
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
      const requestedCodes = [...new Set([...legs.map((leg) => String(leg.ins)), String(ua.ins)])];
      const fetched = await Promise.allSettled(requestedCodes.map(async (ins) => [ins, await fetchTrades(ins, endDate)]));
      const rows = fetched.filter((item) => item.status === 'fulfilled').map((item) => item.value);
      const failedCodes = fetched.map((item, index) => item.status === 'rejected' ? requestedCodes[index] : null).filter(Boolean);
      const requiredCodes = new Set(legs.map((leg) => String(leg.ins)));
      const failedRequired = failedCodes.filter((ins) => requiredCodes.has(ins));
      const tradeWarning = failedCodes.length
        ? (failedRequired.length ? `ریزمعامله ${fmt.int(failedRequired.length)} پای استراتژی دریافت نشد` : 'ریزمعامله نماد پایه دریافت نشد')
        : '';
      const byIns = Object.fromEntries(rows);
      // اگر بالادست وضعیت ابطال را نفرستد، ما نمی‌دانیم معامله‌ای باطل شده یا
      // نه. سکوت در این حالت یعنی ادعای ضمنی «هیچ‌کدام باطل نشده» — پس صریح
      // گفته می‌شود که نمی‌دانیم.
      const allTrades = rows.flatMap(([, list]) => list);
      const cancelUnknown = allTrades.length > 0 && allTrades.some((trade) => trade.canceledKnown === false);
      $('bt-run-note').textContent = !allTrades.length
        ? 'برای روز سنجش ریزمعامله‌ای دریافت نشد؛ مسیر روزانه معتبر است و عدد درون‌روزی ساخته نمی‌شود.'
        : cancelUnknown
          ? 'خط زمانی مشترک فقط از معاملات ۹:۰۰ تا ۱۲:۳۰ ساخته می‌شود؛ قیمت هر پا آخرین مشاهده تا همان ثانیه است و سن آن جدا نمایش داده می‌شود. منبع داده وضعیت ابطال را اعلام نکرده، پس ابطال احتمالی نامعلوم است.'
          : 'خط زمانی مشترک فقط از معاملات ۹:۰۰ تا ۱۲:۳۰ ساخته می‌شود؛ قیمت، حجم و سن هر پا در هر ثانیه نگه داشته شده و معامله باطل‌شده کنار گذاشته شده است. این مسیر تضمین اجرای هم‌زمان نیست.';
      intraday = replayIntraday({ replay, tradesByIns: byIns, baseTrades: byIns[String(ua.ins)] || [], fees: feesOf(state.settings) });
      $('bt-result').hidden = false; paintResult();
      if (intraday.length) setStatus(`${fmt.int(replay.summary.validDays)} روز و ${fmt.int(intraday.length)} نقطه مشترک درون‌روزی محاسبه شد${tradeWarning ? `؛ ${tradeWarning}` : ''}.`, Boolean(tradeWarning));
      else setStatus(`${fmt.int(replay.summary.validDays)} روز آماده شد؛ ${tradeWarning || 'در روز سنجش ریزمعامله کامل برای همه پاها پیدا نشد'}.`, Boolean(tradeWarning));
      $('bt-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setStatus(errorText(error, 'بک‌تست اجرا نشد.'), true); } finally { $('bt-run').disabled = false; }
  }

  entryRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(entryRail, button.dataset.basis); if (entryDates.length) refreshCombos(); } });
  exitRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(exitRail, button.dataset.basis); refreshExitDates(); } });
  $('bt-combo').addEventListener('change', renderCombo); $('bt-path-mode').addEventListener('change', () => { if (replay) paintResult(); });
  $('bt-load').addEventListener('click', loadHistory); $('bt-run').addEventListener('click', runBacktest);
  $('bt-export-intraday').addEventListener('click', exportIntraday);
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
