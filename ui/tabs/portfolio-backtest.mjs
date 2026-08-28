import { CATALOG, GROUPS } from '/strategies/catalog.mjs';
import { goHandoff } from '/ui/handoff.mjs';
import { buildChain } from '/core/chain.mjs';
import { feesOf } from '/core/settings.mjs';
import {
  HISTORY_BASES, basisMatrix, entrySensitivity, flattenActiveContracts,
  historyDateLabel, historyMarketMetrics, historyPrice,
  normalizeHistoryDate, replayHistory,
} from '/core/history.mjs';
import { mountDateWheel } from '/ui/datewheel.mjs';
import { SCOPE_LIVE, scopeOptionsMarkup, applyLiveScope } from '/ui/live-scope.mjs';
import { fmt, faDigits, signTone } from '/ui/fmt.mjs';
import { attachExportsIn } from '/ui/export.mjs';
import { MARK_MOMENTS, marksAt, applyIntradayMark, markNote } from '/core/intraday-mark.mjs';
import { ivParams } from '/core/leg-iv.mjs';
import { resolveHistVol } from '/core/hist-vol.mjs';
import { GREEKS, annotateReplay, monitorGreekSummary, monitorVolSummary } from '/core/monitor.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const nameOf = (entity, fallback = 'بدون نام') => {
  const value = String(entity?.name || '').trim();
  return value && value !== String(entity?.ins || '') ? value : fallback;
};
const dateLabel = (value) => faDigits(historyDateLabel(value));
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, (index + 1) * size));
const safeNum = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const errorText = (error, fallback) => /fetch failed|network|failed to fetch/i.test(String(error?.message || error))
  ? 'اتصال به منبع داده برقرار نشد.' : (String(error?.message || '').trim() || fallback);

function basisRail(id, selected = 'LAST') {
  return `<div class="backtest-basis" id="${id}" role="radiogroup" aria-label="مبنای قیمت">${HISTORY_BASES.map(([value, label]) => `<button type="button" data-basis="${value}" role="radio" aria-checked="${value === selected}">${label}</button>`).join('')}</div>`;
}

function setRail(host, value) {
  host.dataset.value = value;
  host.querySelectorAll('[data-basis]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.basis === value)));
}

function lineChart(host, rows, { xLabel, yLabel } = {}) {
  const points = rows.filter((row) => row.status === 'ok' && Number.isFinite(row.netPnl) && Number.isFinite(row.returnPct));
  if (points.length < 2) { host.innerHTML = '<p class="empty-note">برای نمودار دست‌کم دو روز معتبر لازم است.</p>'; return; }
  const series = [
    { key: 'returnPct', label: 'بازده استراتژی', color: 'var(--accent)' },
    { key: 'baseCumulativePct', label: 'تغییر نماد پایه', color: 'var(--cmp1)' },
  ];
  const W = 900, H = 340, L = 92, R = 24, T = 24, B = 62;
  const values = points.flatMap((row) => series.map((item) => row[item.key]).filter(Number.isFinite));
  let low = Math.min(0, ...values), high = Math.max(0, ...values);
  if (Math.abs(high - low) < 1e-9) { low -= 1; high += 1; }
  const pad = (high - low) * 0.08; low -= pad; high += pad;
  const x = (index) => L + (index / Math.max(1, points.length - 1)) * (W - L - R);
  const y = (value) => T + ((high - value) / (high - low)) * (H - T - B);
  const ticks = Array.from({ length: 5 }, (_, index) => low + ((high - low) * index) / 4);
  host.innerHTML = `<div class="portfolio-chart-legend">${series.map((item) => `<span style="--series:${item.color}"><i></i>${item.label}</span>`).join('')}</div><div class="portfolio-chart-stage"><svg viewBox="0 0 ${W} ${H}" tabindex="0" aria-label="نمودار تعاملی مسیر بازده استراتژی و نماد پایه">
    ${ticks.map((value) => `<line x1="${L}" x2="${W - R}" y1="${y(value)}" y2="${y(value)}" class="portfolio-grid"/><text x="${L - 9}" y="${y(value) + 4}" text-anchor="end">${fmt.pct(value)}</text>`).join('')}
    <text class="axis-title" x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle">${xLabel || 'روز مسیر'}</text>
    <text class="axis-title" transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${yLabel || 'بازده (درصد)'}</text>
    ${series.map((item) => `<polyline fill="none" stroke="${item.color}" points="${points.map((row, index) => `${x(index)},${y(row[item.key])}`).join(' ')}"/>`).join('')}
    <g class="portfolio-cursor" hidden><line y1="${T}" y2="${H - B}"/><g></g></g>
    <rect class="portfolio-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
  </svg><div class="backtest-tip" hidden></div></div>`;
  const svg = host.querySelector('svg'), cursor = host.querySelector('.portfolio-cursor'), tip = host.querySelector('.backtest-tip');
  const move = (event) => {
    const box = svg.getBoundingClientRect();
    const localX = ((event.clientX - box.left) / box.width) * W;
    const index = Math.max(0, Math.min(points.length - 1, Math.round(((localX - L) / (W - L - R)) * (points.length - 1))));
    const row = points[index], px = x(index);
    cursor.hidden = false;
    cursor.querySelector('line').setAttribute('x1', px); cursor.querySelector('line').setAttribute('x2', px);
    cursor.querySelector('g').innerHTML = series.map((item) => `<circle cx="${px}" cy="${y(row[item.key])}" r="4" fill="${item.color}"/>`).join('');
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(row.dayName)} ${esc(row.dateLabel)}</b><span>سود خالص: <strong class="${signTone(row.netPnl)}">${fmt.money(row.netPnl)}</strong></span><span>بازده: <strong class="${signTone(row.returnPct)}">${fmt.pct(row.returnPct)}</strong></span><span>تغییر پایه: <strong class="${signTone(row.baseCumulativePct)}">${fmt.pct(row.baseCumulativePct)}</strong></span>`;
    tip.style.insetInlineStart = `${Math.min(76, Math.max(2, ((px / W) * 100) - 8))}%`;
    tip.style.top = '8px';
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', () => { cursor.hidden = true; tip.hidden = true; });
}

function strategyBars(host, strategies, onPick) {
  if (!strategies.length) { host.innerHTML = '<p class="empty-note">استراتژی معتبری برای نمودار نیست.</p>'; return; }
  const bound = Math.max(1, ...strategies.map((row) => Math.abs(row.medianReturn)));
  host.innerHTML = strategies.map((row, index) => `<button type="button" class="portfolio-bar" data-strategy="${row.strategyId}"><span>${faDigits(index + 1)} · ${esc(row.strategyName)}</span><i class="portfolio-bar-track"><b class="portfolio-bar-fill ${signTone(row.medianReturn)}" style="--bar:${Math.max(2, Math.abs(row.medianReturn) / bound * 50)}%"></b></i><strong class="${signTone(row.medianReturn)}">${fmt.pct(row.medianReturn)}٪</strong></button>`).join('');
  host.onclick = (event) => {
    const button = event.target.closest('[data-strategy]');
    if (button) onPick(button.dataset.strategy);
  };
}

const heatLevel = (value, bound) => Math.max(1, Math.min(4,
  Math.ceil((Math.abs(value) / Math.max(bound, 1e-9)) * 4)));

function timelineHeatmap(host, timeline, onPick) {
  if (!timeline?.dates?.length || !timeline?.strategies?.length) {
    host.innerHTML = '<p class="empty-note">برای نقشه زمانی، روز معتبر کافی وجود ندارد.</p>';
    return;
  }
  const rows = [...timeline.strategies].sort((a, b) => (a.medianRank - b.medianRank)
    || (b.medianReturn - a.medianReturn));
  const values = rows.flatMap((row) => row.points.map((point) => point.medianReturn)).filter(Number.isFinite);
  const bound = Math.max(1e-9, ...values.map(Math.abs));
  const columns = `style="--days:${timeline.dates.length}"`;
  host.innerHTML = `<div class="portfolio-viz-scroll"><div class="portfolio-heatmap">
    <div class="portfolio-heat-row portfolio-heat-head" ${columns}><b>استراتژی</b>${timeline.dates.map((date) => `<span>${dateLabel(date)}</span>`).join('')}</div>
    ${rows.map((row) => {
      const points = new Map(row.points.map((point) => [point.date, point]));
      return `<div class="portfolio-heat-row" data-strategy="${esc(row.strategyId)}" ${columns}><b>${esc(row.strategyName)}</b>${timeline.dates.map((date) => {
        const point = points.get(date);
        if (!point) return '<i class="missing" aria-label="فاقد داده معتبر"></i>';
        const tone = point.medianReturn > 0 ? 'gain' : point.medianReturn < 0 ? 'loss' : 'flat';
        const label = `${row.strategyName}، ${dateLabel(date)}، رتبه ${fmt.int(point.rank)}، بازده ${fmt.pct(point.medianReturn)} درصد، ${fmt.int(point.samples)} ترکیب`;
        return `<button type="button" class="${tone} heat-${heatLevel(point.medianReturn, bound)}" data-strategy="${esc(row.strategyId)}" title="${esc(label)}" aria-label="${esc(label)}"><span>${fmt.pct(point.medianReturn)}</span></button>`;
      }).join('')}</div>`;
    }).join('')}
  </div></div><p class="portfolio-note">هر خانه میانه بازده ترکیب‌های معتبر از روز ورود تا همان روز است؛ خانه خالی یعنی داده معتبر کافی وجود نداشته است.</p>`;
  host.onclick = (event) => {
    const cell = event.target.closest('button[data-strategy]');
    if (cell) onPick(cell.dataset.strategy);
  };
}

function rankBumpChart(host, timeline, onPick) {
  if (!timeline?.dates?.length || timeline.dates.length < 2 || !timeline?.strategies?.length) {
    host.innerHTML = '<p class="empty-note">برای نمایش تغییر رتبه، دست‌کم دو روز معتبر لازم است.</p>';
    return;
  }
  const W = 960, H = Math.max(360, timeline.strategies.length * 18), L = 76, R = 175, T = 32, B = 40;
  const maxRank = Math.max(1, ...timeline.strategies.flatMap((row) => row.points.map((point) => point.rank)));
  const x = (date) => L + (timeline.dates.indexOf(date) / Math.max(1, timeline.dates.length - 1)) * (W - L - R);
  const y = (rank) => T + ((rank - 1) / Math.max(1, maxRank - 1)) * (H - T - B);
  const ticks = [1, Math.max(1, Math.round(maxRank / 2)), maxRank]
    .filter((value, index, all) => all.indexOf(value) === index);
  host.innerHTML = `<div class="portfolio-viz-scroll"><svg class="portfolio-rank-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="تغییر رتبه استراتژی‌ها در طول بازه">
    ${ticks.map((rank) => `<line x1="${L}" x2="${W - R}" y1="${y(rank)}" y2="${y(rank)}"/><text x="${L - 12}" y="${y(rank) + 4}" text-anchor="end">رتبه ${fmt.int(rank)}</text>`).join('')}
    ${timeline.strategies.map((row) => {
      const last = row.points.at(-1);
      let previousIndex = -2;
      const path = row.points.map((point) => {
        const index = timeline.dates.indexOf(point.date);
        const command = index === previousIndex + 1 ? 'L' : 'M';
        previousIndex = index;
        return `${command} ${x(point.date)} ${y(point.rank)}`;
      }).join(' ');
      return `<g tabindex="0" role="button" data-strategy="${esc(row.strategyId)}"><path d="${path}"/><circle cx="${x(last.date)}" cy="${y(last.rank)}" r="4"/><text x="${W - R + 10}" y="${y(last.rank) + 4}">${esc(row.strategyName)} · ${fmt.int(last.rank)}</text><title>${esc(row.strategyName)} · میانه رتبه ${fmt.num(row.medianRank)} · ${fmt.int(row.topDays)} روز رتبه نخست</title></g>`;
    }).join('')}
  </svg></div><p class="portfolio-note">خط رو به بالا یعنی بهترشدن رتبه؛ کلیک روی هر خط همان استراتژی و ترکیب‌هایش را انتخاب می‌کند.</p>`;
  const pick = (event) => {
    const line = event.target.closest('[data-strategy]');
    if (line) onPick(line.dataset.strategy);
  };
  host.onclick = pick;
  host.onkeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(event); }
  };
}

export async function mount(root, { state }) {
  root.innerHTML = `<section class="portfolio-hero"><div><p class="eyebrow">غربال تاریخی همه استراتژی‌ها</p><h1>اگر آن روز همه را می‌ساختیم چه می‌شد؟</h1><p>همه استراتژی‌ها و ترکیب‌های معتبر یک نماد در روز ایجاد ساخته و در یک تاریخ یکسان سنجیده می‌شوند؛ بدون پرکردن قیمت گمشده و بدون انتخاب پس‌نگر یک برنده.</p></div><span>رتبه‌بندی با میانه بازده</span></section>
  <section class="card portfolio-controls"><div class="section-head"><div><p class="eyebrow">مرحله اول</p><h2>نماد، نقدشوندگی و دامنه آزمون</h2></div><b id="pb-status" role="status" aria-live="polite">در حال دریافت نمادها…</b></div>
    <div class="portfolio-form"><label>نماد پایه<select id="pb-base"><option value="">در حال دریافت…</option></select></label><label>دامنه استراتژی<select id="pb-scope"><option value="feasible">فقط استراتژی‌های قابل اجرا</option><option value="all">همه ساختاری، با برچسب غیرقابل اجرا</option></select></label><label>دامنهٔ داده<select id="pb-data-scope">${scopeOptionsMarkup()}</select></label><label>تعداد واحد<input id="pb-units" type="number" min="1" max="10000" step="1" value="${Math.max(1, state.settings.qtyDefault || 1)}"></label><label>سقف ترکیب هر استراتژی<input id="pb-cap" type="number" min="10" max="1000" step="10" value="120"></label>
      <label>حداقل ارزش پایه (میلیارد ریال)<input id="pb-base-value" type="number" min="0" step="0.1" value="0"></label><label>حداقل ارزش هر قرارداد (میلیون ریال)<input id="pb-leg-value" type="number" min="0" step="0.1" value="0"></label><label>حداقل حجم پایه<input id="pb-base-volume" type="number" min="0" step="1" value="0"></label><label>حداقل حجم هر قرارداد<input id="pb-leg-volume" type="number" min="0" step="1" value="0"></label>
      <button type="button" class="primary" id="pb-load">دریافت تاریخچه نماد</button></div>
    <p class="live-scope-note" id="pb-scope-note" hidden></p>
    <p class="portfolio-note">سقف ترکیب برای کنترل زمان اجراست و در گزارش شفاف ثبت می‌شود. «همه استراتژی‌ها» یعنی همه الگوها بررسی می‌شوند؛ تعداد ترکیب قراردادهای هر الگو می‌تواند با این سقف محدود شود.</p>
  </section>
  <section id="pb-work" hidden>
    <div class="backtest-date-grid"><section class="card"><div class="section-head"><div><p class="eyebrow">روز ایجاد</p><h2>تاریخ ورود همه استراتژی‌ها</h2></div><span id="pb-entry-market">—</span></div><div id="pb-entry-date"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">روز سنجش</p><h2>تاریخ مقایسه نهایی</h2></div><span id="pb-exit-market">—</span></div><div id="pb-exit-date"></div></section></div>
    <div class="backtest-date-grid"><section class="card"><div class="section-head"><h2>مبنای قیمت ورود</h2><span>مشاهده‌شده برای اجرای دسته‌ای</span></div>${basisRail('pb-entry-basis', 'LAST')}<p class="portfolio-note">پس از انتخاب هر ترکیب، قیمت دستی هر پا جداگانه قابل ویرایش است.</p></section><section class="card"><div class="section-head"><h2>مبنای قیمت خروج</h2><span>یکسان برای مقایسه منصفانه</span></div>${basisRail('pb-exit-basis', 'LAST')}</section></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">لحظهٔ سنجش</p><h2>پایان روز، یا یک ساعت مشخص از همان روز</h2></div><span id="pb-mark-state">پایان روز سنجش</span></div>
      <div class="portfolio-form">
        <label>لحظهٔ خروج<select id="pb-mark">
          <option value="">پایان روز سنجش — قیمت پایانی همان روز</option>
          ${MARK_MOMENTS.map(([second, label]) => `<option value="${second}">ساعت ${label} همان روز</option>`).join('')}
        </select></label>
      </div>
      <p class="portfolio-note" id="pb-mark-note">با انتخاب یک ساعت، قیمت خروج هر قرارداد آخرین معاملهٔ پیش از همان لحظه می‌شود و ریزمعاملهٔ روز سنجش گرفته می‌شود. قراردادی که تا آن لحظه معامله نشده قیمت نمی‌گیرد و ترکیب‌های وابسته‌اش از رتبه‌بندی بیرون می‌مانند — قیمت پایانی روز یا قیمت دیروز جایش نمی‌نشیند. حجم و ارزش هم تا همان لحظه شمرده می‌شوند، پس غربال نقدشوندگی روی عدد واقعیِ آن ساعت می‌نشیند نه عدد پایان روز.</p>
    </section>
    <section class="card portfolio-run"><div><p class="eyebrow">مرحله دوم</p><h2>ساخت و بازپخش دسته‌ای</h2><p>فقط ترکیبی وارد رتبه‌بندی می‌شود که دقیقاً در روز سنجش برای همه پاها قیمت و نقدشوندگی معتبر داشته باشد.</p></div><button type="button" class="primary" id="pb-run">اجرای همه استراتژی‌ها</button></section>
  </section>
  <section id="pb-report" hidden>
    <div class="backtest-kpis" id="pb-kpis"></div>
    <div class="portfolio-report-grid"><section class="card"><div class="section-head"><div><p class="eyebrow">رتبه‌بندی مقاوم</p><h2>میانه بازده هر استراتژی</h2></div><span>برای فیلتر جزئیات کلیک کن</span></div><div id="pb-bars" class="portfolio-bars"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">گزارش دسته‌ها</p><h2>نوع استراتژی چه نتیجه‌ای داشت؟</h2></div></div><div id="pb-groups" class="history-table-wrap"></div></section></div>
    <div class="portfolio-timeline-grid"><section class="card"><div class="section-head"><div><p class="eyebrow">تمام روزهای بازه</p><h2>نقشه حرارتی بهترین تا بدترین</h2></div><span id="pb-heat-audit">—</span></div><div id="pb-heatmap"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">پایداری رتبه</p><h2>تغییر جایگاه استراتژی‌ها</h2></div><span>برای انتخاب روی خط کلیک کن</span></div><div id="pb-rank-chart"></div></section></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">برنده و بازنده</p><h2>نتیجه همه استراتژی‌ها</h2></div><span id="pb-audit">—</span></div><div id="pb-strategies" class="history-table-wrap"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">ترکیب‌های واقعی</p><h2 id="pb-combo-title">برای مشاهده جزئیات یک استراتژی را انتخاب کن</h2></div><span>هر ردیف یک ترکیب قرارداد</span></div><div id="pb-combos" class="history-table-wrap"></div></section>
    <section id="pb-detail" class="portfolio-detail" hidden></section>
  </section>`;

  // هر ظرف جدول، دکمهٔ خروجی خودش را می‌گیرد. ظرف‌ها در همین قالب‌اند حتی
  // وقتی خالی‌اند، و خواندن لحظهٔ کلیک انجام می‌شود — پس یک بار کافی است.
  attachExportsIn(root, 'portfolio');


  const $ = (id) => root.querySelector(`#${id}`);
  const status = $('pb-status'), baseSelect = $('pb-base'), entryRail = $('pb-entry-basis'), exitRail = $('pb-exit-basis');
  let chain = new Map(), ua = null, seriesByIns = {}, baseDates = [], resultRows = [], report = null, generated = [], activeWorker = null, selectedResult = null;
  // سری‌هایی که **آخرین اجرا** با آن‌ها انجام شد. با پایان روز، همان
  // `seriesByIns` است؛ با لحظهٔ درون‌روز، نسخهٔ مهرخورده. پنل جزئیات و
  // تحلیل حساسیت باید از همین بخوانند، وگرنه رتبه‌بندی ساعت ده و نیم را
  // می‌گوید و جزئیاتِ همان ردیف، پایان روز را — و هیچ‌کدام غلط به نظر
  // نمی‌رسد.
  let runSeriesByIns = {};
  // روز جاریِ چسبانده‌شده. صفر یعنی همه‌چیز بسته‌شده است.
  let liveDate = 0;
  const setStatus = (text, error = false) => { status.textContent = text; status.toggleAttribute('data-error', error); };
  const rowAt = (ins, date) => (seriesByIns[String(ins)] || []).find((row) => normalizeHistoryDate(row.date) === Number(date));
  const liquidity = () => ({
    minBaseValue: Math.max(0, safeNum($('pb-base-value').value)) * 1e9,
    minLegValue: Math.max(0, safeNum($('pb-leg-value').value)) * 1e6,
    minBaseVolume: Math.max(0, safeNum($('pb-base-volume').value)),
    minLegVolume: Math.max(0, safeNum($('pb-leg-volume').value)),
  });
  const replayArgs = (item, manualEntry = {}) => ({
    legs: item.legs, seriesByIns: Object.keys(runSeriesByIns).length ? runSeriesByIns : seriesByIns, baseIns: String(ua.ins),
    startDate: Number($('pb-entry-date').dataset.value), endDate: Number($('pb-exit-date').dataset.value),
    entryBasis: entryRail.dataset.value || 'LAST', exitBasis: exitRail.dataset.value || 'LAST',
    manualEntry, units: Math.max(1, Math.trunc(safeNum($('pb-units').value, 1))),
    fees: feesOf(state.settings), settings: state.settings, liquidity: liquidity(),
  });

  function marketText(date) {
    const market = historyMarketMetrics(rowAt(ua?.ins, date));
    // روز جاری همان‌جا که خوانده می‌شود برچسب می‌گیرد، نه ده سطر پایین‌تر
    const live = liveDate && Number(date) === liveDate ? ' · لحظه‌ای، بسته‌نشده' : '';
    return `ارزش ${fmt.money(market.value)} · حجم ${fmt.int(market.volume)}${live}`;
  }

  function refreshDates() {
    const entryBasis = entryRail.dataset.value || 'LAST', exitBasis = exitRail.dataset.value || 'LAST';
    const entries = baseDates.filter((date) => Number.isFinite(historyPrice(rowAt(ua.ins, date), entryBasis)));
    const oldEntry = Number($('pb-entry-date').dataset.value);
    const entry = entries.includes(oldEntry) ? oldEntry : entries[Math.max(0, entries.length - 8)];
    const exits = baseDates.filter((date) => date >= entry && Number.isFinite(historyPrice(rowAt(ua.ins, date), exitBasis)));
    const oldExit = Number($('pb-exit-date').dataset.value);
    const exit = exits.includes(oldExit) ? oldExit : exits[Math.min(exits.length - 1, 5)];
    mountDateWheel($('pb-entry-date'), entries, entry, () => refreshDates(), { empty: 'روز دارای قیمت پایه پیدا نشد.' });
    mountDateWheel($('pb-exit-date'), exits, exit, (date) => { $('pb-exit-market').textContent = marketText(date); }, { empty: 'روز دارای قیمت پایه پیدا نشد.' });
    $('pb-entry-market').textContent = marketText(entry); $('pb-exit-market').textContent = marketText(exit);
  }

  /**
   * دامنهٔ انتخابی کاربر را روی سری‌های تازه‌گرفته اعمال می‌کند.
   *
   * در حالت «تا آخرین روز بسته‌شده» هیچ درخواستی نمی‌رود و یادداشت پنهان
   * می‌ماند — قابلیت تازه نباید به مسیر قدیمی هزینه اضافه کند.
   */
  async function applyScope() {
    const note = $('pb-scope-note');
    if ($('pb-data-scope').value !== SCOPE_LIVE) {
      note.hidden = true; note.textContent = ''; note.removeAttribute('data-error');
      liveDate = 0;
      return;
    }
    const result = await applyLiveScope(seriesByIns);
    seriesByIns = result.series;
    liveDate = result.ok ? result.date : 0;
    note.hidden = false;
    note.textContent = result.note;
    note.toggleAttribute('data-error', !result.ok);
  }

  async function loadHistory() {
    ua = chain.get(baseSelect.value);
    if (!ua) { setStatus('ابتدا نماد پایه را انتخاب کن.', true); return; }
    const contracts = flattenActiveContracts(ua, state.settings.blockedExpiries);
    const codes = [...new Set([String(ua.ins), ...contracts.map((contract) => String(contract.ins))])];
    $('pb-load').disabled = true; $('pb-report').hidden = true;
    setStatus(`دریافت تاریخچه ${fmt.int(codes.length)} نماد…`);
    try {
      const payloads = await Promise.all(chunks(codes, 70).map(async (part) => {
        const response = await fetch(`/api/dailies?ins=${part.join(',')}&n=0`), payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || 'تاریخچه دریافت نشد');
        return payload;
      }));
      seriesByIns = {};
      runSeriesByIns = {};
      for (const payload of payloads) for (const [ins, value] of Object.entries(payload)) seriesByIns[ins] = value.rows || [];
      // روز جاری پس از فهرست بسته‌شده می‌نشیند، نه به‌جای آن. اگر نچسبد،
      // همان سری‌های بسته‌شده برمی‌گردند و رفتار دقیقاً قبلی می‌ماند.
      await applyScope();
      baseDates = (seriesByIns[String(ua.ins)] || []).map((row) => normalizeHistoryDate(row.date)).filter(Boolean).sort((a, b) => a - b);
      if (!baseDates.length) throw new Error('برای نماد پایه تاریخچه‌ای دریافت نشد');
      $('pb-work').hidden = false; refreshDates();
      setStatus(`${fmt.int(baseDates.length)} روز معاملاتی آماده است.`);
    } catch (error) { setStatus(errorText(error, 'تاریخچه دریافت نشد.'), true); }
    finally { $('pb-load').disabled = false; }
  }

  function runWorker(message) {
    activeWorker?.terminate();
    activeWorker = new Worker('/worker/history-worker.mjs', { type: 'module' });
    return new Promise((resolve, reject) => {
      activeWorker.onmessage = (event) => {
        const payload = event.data;
        if (payload.id !== message.id) return;
        if (payload.type === 'portfolio-progress') {
          setStatus(`${payload.strategyName}: ${fmt.int(payload.done)} از ${fmt.int(payload.total)} استراتژی · ${fmt.int(payload.results)} نتیجه معتبر`);
        } else if (payload.type === 'portfolio') resolve(payload);
        else if (payload.type === 'error') reject(new Error(payload.error));
      };
      activeWorker.onerror = () => reject(new Error('ریسه محاسباتی متوقف شد'));
      activeWorker.postMessage(message);
    });
  }

  function renderReport(payload) {
    resultRows = payload.rows; report = payload.report; generated = payload.generatedByStrategy;
    const cards = [
      ['ترکیب معتبر', fmt.int(report.total), ''], ['سودده', `${fmt.int(report.wins)} · ${fmt.pct(report.winPct)}٪`, 'gain'],
      ['زیان‌ده', `${fmt.int(report.losses)} · ${fmt.pct(report.lossPct)}٪`, 'loss'], ['خنثی', fmt.int(report.flat), ''],
      ['بهترین در پایان بازه', report.bestStrategy ? `${report.bestStrategy.strategyName} · ${fmt.pct(report.bestStrategy.medianReturn)}٪` : '—', 'gain'],
      ['بدترین در پایان بازه', report.worstStrategy ? `${report.worstStrategy.strategyName} · ${fmt.pct(report.worstStrategy.medianReturn)}٪` : '—', 'loss'],
      ['پایدارترین در بازه', report.timeline.best ? `${report.timeline.best.strategyName} · میانه رتبه ${fmt.num(report.timeline.best.medianRank)}` : '—', 'gain'],
      ['ضعیف‌ترین در بازه', report.timeline.worst ? `${report.timeline.worst.strategyName} · میانه رتبه ${fmt.num(report.timeline.worst.medianRank)}` : '—', 'loss'],
    ];
    $('pb-kpis').innerHTML = cards.map(([label, value, tone]) => `<article class="${tone}"><span>${label}</span><b>${value}</b></article>`).join('');
    strategyBars($('pb-bars'), report.strategies, selectStrategy);
    timelineHeatmap($('pb-heatmap'), report.timeline, selectStrategy);
    rankBumpChart($('pb-rank-chart'), report.timeline, selectStrategy);
    $('pb-heat-audit').textContent = report.timeline.dates.length
      ? `${fmt.int(report.timeline.dates.length)} روز معتبر · ${fmt.int(report.timeline.strategies.length)} استراتژی`
      : 'داده زمانی کافی نیست';
    $('pb-groups').innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>دسته</th><th>ترکیب</th><th>سودده</th><th>میانه بازده</th><th>مجموع سود/زیان</th></tr></thead><tbody>${report.groups.map((row) => `<tr><td>${esc(row.groupName)}</td><td>${fmt.int(row.samples)}</td><td>${fmt.int(row.wins)} · ${fmt.pct(row.winPct)}٪</td><td class="${signTone(row.medianReturn)}">${fmt.pct(row.medianReturn)}٪</td><td class="${signTone(row.totalPnl)}">${fmt.money(row.totalPnl)}</td></tr>`).join('')}</tbody></table>`;
    $('pb-strategies').innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>رتبه</th><th>استراتژی</th><th>نوع / جهت</th><th>تعداد</th><th>سودده / زیان‌ده</th><th>میانه بازده</th><th>میانگین سود</th><th>بهترین / بدترین</th></tr></thead><tbody>${report.strategies.map((row, index) => `<tr data-strategy="${row.strategyId}" tabindex="0"><td>${fmt.int(index + 1)}</td><td><b>${esc(row.strategyName)}</b>${row.feasible ? '' : '<small>ساختاری؛ غیرقابل اجرا در تابلو</small>'}</td><td>${esc(row.groupName)} · ${esc(row.direction || '—')}</td><td>${fmt.int(row.samples)}</td><td>${fmt.int(row.wins)} / ${fmt.int(row.losses)} · ${fmt.pct(row.winPct)}٪</td><td class="${signTone(row.medianReturn)}">${fmt.pct(row.medianReturn)}٪</td><td class="${signTone(row.meanPnl)}">${fmt.money(row.meanPnl)}</td><td><span class="gain">${fmt.pct(row.best?.final?.returnPct)}٪</span> / <span class="loss">${fmt.pct(row.worst?.final?.returnPct)}٪</span></td></tr>`).join('')}</tbody></table>`;
    const capped = generated.filter((row) => row.capped).length;
    $('pb-audit').textContent = `${fmt.int(generated.length)} استراتژی بررسی شد · ${fmt.int(payload.excluded.invalidAtEnd)} ترکیب فاقد داده معتبر روز سنجش · ${fmt.int(capped)} استراتژی سقف‌خورده`;
    $('pb-strategies').onclick = (event) => { const row = event.target.closest('[data-strategy]'); if (row) selectStrategy(row.dataset.strategy); };
    $('pb-strategies').onkeydown = (event) => { const row = event.target.closest('[data-strategy]'); if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectStrategy(row.dataset.strategy); } };
    $('pb-report').hidden = false;
    if (report.bestStrategy) selectStrategy(report.bestStrategy.strategyId);
  }

  function comboName(item) {
    return `${item.legs.map((leg) => nameOf(leg, 'قرارداد')).join(' + ')} · اعمال ${item.strikes.map((strike) => fmt.int(strike)).join(' / ')}`;
  }

  function selectStrategy(strategyId) {
    const strategy = report.strategies.find((row) => row.strategyId === strategyId);
    if (!strategy) return;
    root.querySelectorAll('[data-strategy]').forEach((row) => row.classList.toggle('selected', row.dataset.strategy === strategyId));
    const rows = resultRows.filter((row) => row.strategyId === strategyId).sort((a, b) => b.final.returnPct - a.final.returnPct);
    $('pb-combo-title').textContent = `${strategy.strategyName} · ${fmt.int(rows.length)} ترکیب`;
    $('pb-combos').innerHTML = `<table class="history-table"><thead><tr><th>رتبه</th><th>ترکیب قرارداد</th><th>سررسید</th><th>سرمایه</th><th>سود/زیان</th><th>بازده</th><th>تغییر پایه</th><th>اولین سود</th><th>افت بیشینه</th></tr></thead><tbody>${rows.map((item, index) => `<tr data-result="${esc(item.id)}" tabindex="0"><td>${fmt.int(index + 1)}</td><td>${esc(comboName(item))}</td><td>${item.expiries.map(dateLabel).join(' / ')}</td><td>${fmt.money(item.entry.capital)}</td><td class="${signTone(item.final.netPnl)}">${fmt.money(item.final.netPnl)}</td><td class="${signTone(item.final.returnPct)}">${fmt.pct(item.final.returnPct)}٪</td><td class="${signTone(item.final.baseCumulativePct)}">${fmt.pct(item.final.baseCumulativePct)}٪</td><td>${item.path.firstProfit ? `${dateLabel(item.path.firstProfit.date)} · ${fmt.int(item.path.firstProfit.holdingDays)} روز` : 'رخ نداد'}</td><td class="${signTone(item.path.maxDrawdown)}">${fmt.money(item.path.maxDrawdown)}</td></tr>`).join('')}</tbody></table>`;
    const pick = (id) => { const item = rows.find((row) => row.id === id); if (item) showDetail(item); };
    $('pb-combos').onclick = (event) => { const row = event.target.closest('[data-result]'); if (row) pick(row.dataset.result); };
    $('pb-combos').onkeydown = (event) => { const row = event.target.closest('[data-result]'); if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); pick(row.dataset.result); } };
    if (rows.length) showDetail(rows[0]);
  }

  function renderReplay(item, replay, manual = false) {
    const final = replay.rows.find((row) => row.date === Number($('pb-exit-date').dataset.value) && row.status === 'ok');
    if (!final) { root.querySelector('#pb-detail-result').innerHTML = '<p class="empty-note">با این قیمت‌های دستی، نتیجه معتبر روز سنجش ساخته نشد.</p>'; return; }
    root.querySelector('#pb-detail-result').innerHTML = `<div class="portfolio-detail-kpis"><article><span>سود/زیان ${manual ? 'دستی' : 'مشاهده‌شده'}</span><b class="${signTone(final.netPnl)}">${fmt.money(final.netPnl)}</b></article><article><span>بازده</span><b class="${signTone(final.returnPct)}">${fmt.pct(final.returnPct)}٪</b></article><article><span>تغییر پایه</span><b class="${signTone(final.baseCumulativePct)}">${fmt.pct(final.baseCumulativePct)}٪</b></article><article><span>کل کارمزد</span><b>${fmt.money(final.totalFees)}</b></article></div><div id="pb-path-chart" class="portfolio-line-chart"></div><div class="history-table-wrap"><table class="history-table"><thead><tr><th>پا</th><th>جهت</th><th>ورود</th><th>خروج</th><th>اثر ناخالص</th><th>کارمزد</th><th>اثر خالص</th><th>حجم / ارزش خروج</th></tr></thead><tbody>${final.perLeg.map((leg, index) => `<tr><td>${fmt.int(index + 1)} · ${esc(nameOf(leg, 'پایه'))}</td><td>${replay.priced[index].side === 'buy' ? 'خرید' : 'فروش'}</td><td>${fmt.money(leg.entryPrice)}</td><td>${fmt.money(leg.exitPrice)}</td><td class="${signTone(leg.grossPnl)}">${fmt.money(leg.grossPnl)}</td><td>${fmt.money(leg.entryFee + leg.exitFee)}</td><td class="${signTone(leg.netPnl)}">${fmt.money(leg.netPnl)}</td><td>${fmt.int(leg.volume)} · ${fmt.money(leg.value)}</td></tr>`).join('')}</tbody></table></div>`;
    lineChart(root.querySelector('#pb-path-chart'), replay.rows);
  }

  function renderSensitivity(item, args) {
    const range = Math.max(1, Math.min(50, safeNum(root.querySelector('#pb-shock-range').value, 10)));
    const step = Math.max(1, Math.min(range, safeNum(root.querySelector('#pb-shock-step').value, 5)));
    const shocks = [0];
    for (let value = step; value < range; value += step) shocks.push(-value, value);
    shocks.push(-range, range);
    shocks.sort((a, b) => a - b);
    const sensitivity = entrySensitivity(args, shocks);
    const matrix = basisMatrix(args);
    const host = root.querySelector('#pb-sensitivity');
    host.innerHTML = `<div class="portfolio-sensitivity-grid"><section><h3>شوک قیمت ورود هر پا</h3><div class="history-table-wrap"><table class="history-table portfolio-small-table"><thead><tr><th>پا</th>${shocks.map((shock) => `<th>${fmt.pct(shock)}٪</th>`).join('')}</tr></thead><tbody>${item.legs.map((leg, legIndex) => `<tr><td>${esc(nameOf(leg, `پای ${legIndex + 1}`))}</td>${shocks.map((shock) => { const cell = sensitivity.find((row) => row.legIndex === legIndex && row.shockPct === shock); return `<td><button type="button" class="portfolio-cell ${signTone(cell?.result?.returnPct)}" data-shock="${shock}" data-leg="${legIndex}">${fmt.pct(cell?.result?.returnPct)}٪</button></td>`; }).join('')}</tr>`).join('')}</tbody></table></div></section><section><h3>ماتریس مبنای ورود × خروج</h3><div class="portfolio-basis-matrix">${matrix.map((cell) => `<button type="button" class="${signTone(cell.result?.returnPct)}" data-entry="${cell.entry}" data-exit="${cell.exit}"><small>${HISTORY_BASES.find(([key]) => key === cell.entry)?.[1]} ← ${HISTORY_BASES.find(([key]) => key === cell.exit)?.[1]}</small><b>${fmt.pct(cell.result?.returnPct)}٪</b></button>`).join('')}</div></section></div><p id="pb-cell-detail" class="portfolio-note">روی هر خانه کلیک کن تا سناریوی قیمت همان خانه را ببینی.</p>`;
    host.onclick = (event) => {
      const shock = event.target.closest('[data-shock]'), basis = event.target.closest('[data-entry]');
      if (shock) {
        const cell = sensitivity.find((row) => row.legIndex === Number(shock.dataset.leg) && row.shockPct === Number(shock.dataset.shock));
        root.querySelector('#pb-cell-detail').textContent = cell?.result ? `پای ${fmt.int(Number(shock.dataset.leg) + 1)} با شوک ${fmt.pct(cell.shockPct)}٪: قیمت ورود ${fmt.money(cell.entryPrice)}، سود خالص ${fmt.money(cell.result.netPnl)} و بازده ${fmt.pct(cell.result.returnPct)}٪.` : 'این سناریو داده معتبر ندارد.';
      } else if (basis) {
        const cell = matrix.find((row) => row.entry === basis.dataset.entry && row.exit === basis.dataset.exit);
        root.querySelector('#pb-cell-detail').textContent = cell?.result ? `ورود ${basis.textContent.trim()}: سود خالص ${fmt.money(cell.result.netPnl)} و بازده ${fmt.pct(cell.result.returnPct)}٪.` : 'این مبنای ورود و خروج داده معتبر ندارد.';
      }
    };
  }

  /**
   * یونانی و تلاطم همان بازپخشی که جدول سود را ساخت.
   *
   * مهر روی همان `replay` می‌نشیند، نه یک بازپخش دوم — همان قاعده‌ای که در
   * تحلیل تاریخی هم هست: دو بازپخش یعنی «دلتای این روز» و «سود این روز»
   * می‌توانند از دو ردیف متفاوت بیایند.
   */
  function renderGreeks(replay) {
    const params = ivParams(state.settings, {});
    const closes = (seriesByIns[String(ua?.ins)] || []).map((row) => Number(row.close)).filter((value) => value > 0);
    const hv = resolveHistVol(closes, {
      tradingDaysYear: params.tradingDaysYear, window: params.hvWindow, manualPct: params.hvManualPct,
    });
    annotateReplay(replay, { hvPct: hv.pct, hvSource: hv.source }, params);
    const rows = replay.rows.filter((row) => row.status !== 'missing');
    const legs = replay.priced;
    const last = rows.at(-1);
    const gk = (value) => (Number.isFinite(value) ? fmt.small(value) : '—');
    const ivCell = (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—');

    $('pb-greeks-state').textContent = `${fmt.int(rows.length)} روز مهرخورده`;
    $('pb-greeks-note').textContent = hv.source === 'manual'
      ? `تلاطم تاریخی از سری قیمت درنیامد؛ ${hv.why}`
      : hv.enough
        ? 'یونانی هر پا از تلاطم ضمنی همان پا می‌آید و جمعِ موقعیت وزن‌دار است. پارامترها در تنظیمات، بخش «یونانی‌ها، تلاطم و احتمال» قابل تغییرند.'
        : `تلاطم تاریخی ساخته نشد؛ ${hv.why}`;
    $('pb-greeks-kpis').innerHTML = [
      ...GREEKS.map(({ key, label }) => [label, gk(last?.greeks?.[key]), signTone(last?.greeks?.[key])]),
      ['تلاطم ضمنی موقعیت', ivCell(last?.meanIvPct), ''],
      ['تلاطم تاریخی پایه', ivCell(last?.hvPct), ''],
    ].map(([label, value, tone]) => `<article class="${tone}"><span>${esc(label)}</span><b>${value}</b></article>`).join('');

    const cells = (list) => `<tr>${list.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;
    $('pb-greeks-summary').innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>یونانی</th><th>واحد</th><th>مشاهده</th><th>ابتدا</th><th>انتها</th><th>تغییر</th><th>کمینه</th><th>بیشینه</th></tr></thead><tbody>${
      monitorGreekSummary(rows).map((row) => cells([esc(row.label), esc(row.unit), fmt.int(row.samples),
        gk(row.first), gk(row.last), gk(row.change), gk(row.min), gk(row.max)])).join('')}</tbody></table>`;
    $('pb-vol-summary').innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>سری</th><th>مشاهده</th><th>ابتدا</th><th>انتها</th><th>تغییر</th><th>کمینه</th><th>بیشینه</th></tr></thead><tbody>${
      monitorVolSummary(rows, { legs }).map((row) => cells([
        row.kind === 'leg' ? `${faDigits(row.index + 1)} · ${esc(nameOf(legs[row.index], 'پا'))}` : esc(row.label),
        fmt.int(row.samples), ivCell(row.first), ivCell(row.last),
        gk(row.changePp), ivCell(row.min), ivCell(row.max)])).join('')}</tbody></table>`;
  }

  function showDetail(item) {
    selectedResult = item;
    root.querySelectorAll('[data-result]').forEach((row) => row.classList.toggle('selected', row.dataset.result === item.id));
    const detail = $('pb-detail'); detail.hidden = false;
    const replay = replayHistory(replayArgs(item));
    if (!replay.ok) { detail.innerHTML = `<section class="card"><p class="empty-note">${esc(replay.error)}</p></section>`; return; }
    detail.innerHTML = `<section class="card"><div class="section-head"><div><p class="eyebrow">جزئیات قابل کلیک</p><h2>${esc(item.strategyName)} · ${esc(comboName(item))}</h2></div><div class="backtest-head-actions"><span>${item.feasible ? 'قابل اجرا در ساختار بازار' : 'فقط سناریوی ساختاری'}</span><button type="button" id="pb-watch">ادامه در آزمایشگاه آپشن</button><button type="button" class="ghost" id="pb-live-watch">رصد زنده با معاملات امروز</button><button type="button" class="ghost" id="pb-greeks-watch">رصد یونانی و تلاطم</button></div></div><div id="pb-detail-result"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">قیمت دستی واقعی برای هر قرارداد</p><h2>بازمحاسبه بدون دست‌کاری قیمت سایر پاها</h2></div><button type="button" class="primary" id="pb-manual-run">بازمحاسبه دستی</button></div><div class="portfolio-manual">${replay.priced.map((leg, index) => `<label>${fmt.int(index + 1)} · ${esc(nameOf(leg, 'پایه'))}<input type="number" min="0" step="1" data-manual="${index}" value="${leg.price}"></label>`).join('')}</div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">حساسیت، در کنار سود</p><h2>یونانی‌ها و تلاطم این ترکیب</h2></div><span id="pb-greeks-state">—</span></div><p class="portfolio-note" id="pb-greeks-note"></p><div class="backtest-kpis" id="pb-greeks-kpis"></div><div class="history-analysis-grid"><div><div class="section-head"><h3>خلاصهٔ یونانی موقعیت</h3></div><div id="pb-greeks-summary" class="history-table-wrap"></div></div><div><div class="section-head"><h3>خلاصهٔ تلاطم</h3></div><div id="pb-vol-summary" class="history-table-wrap"></div></div></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">تحلیل حساسیت پویا</p><h2>اگر قیمت ورود یا مبنای خروج فرق می‌کرد</h2></div><div class="portfolio-shock-controls"><label>دامنه شوک<input id="pb-shock-range" type="number" min="1" max="50" step="1" value="10"></label><label>گام<input id="pb-shock-step" type="number" min="1" max="25" step="1" value="5"></label></div></div><div id="pb-sensitivity"></div></section>`;
    renderReplay(item, replay);
    renderGreeks(replay);
    renderSensitivity(item, replayArgs(item));
    detail.querySelector('#pb-manual-run').onclick = () => {
      const manualEntry = Object.fromEntries([...detail.querySelectorAll('[data-manual]')].map((input) => [input.dataset.manual, safeNum(input.value, NaN)]));
      const manualReplay = replayHistory(replayArgs(item, manualEntry));
      if (manualReplay.ok) renderReplay(item, manualReplay, true);
      else detail.querySelector('#pb-detail-result').innerHTML = `<p class="empty-note">${esc(manualReplay.error)}</p>`;
    };
    detail.querySelector('#pb-watch').onclick = () => watchInBacktest(item, false);
    detail.querySelector('#pb-live-watch').onclick = () => watchInBacktest(item, true);
    // همان نقشهٔ انتقال، فقط با مقصد دیگر. هر دو تب یک ورودی می‌خواهند و
    // قرارداد دوم یعنی دو جا که باید هم‌زمان به‌روز بمانند.
    detail.querySelector('#pb-greeks-watch').onclick = () => {
      const plan = handoffPlanFor(item, false);
      goHandoff(state, { ...plan, to: 'greeks-watch' }, 'greeks-watch');
    };
    const updateSensitivity = () => renderSensitivity(item, replayArgs(item));
    detail.querySelector('#pb-shock-range').oninput = updateSensitivity;
    detail.querySelector('#pb-shock-step').oninput = updateSensitivity;
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * همین موقعیت را به بک‌تست سریع می‌سپارد و کاربر را همان‌جا می‌برد.
   *
   * فقط انتخاب‌ها منتقل می‌شوند، نه نتیجه‌ها: نماد، استراتژی، قراردادهای
   * همین ترکیب، هر دو تاریخ، مبناهای قیمت و تعداد واحد. بک‌تست سریع خودش
   * از نو محاسبه می‌کند — اگر عددی از اینجا کپی می‌شد، دو تب می‌توانستند دو
   * حرف بزنند و معلوم نبود کدام مال کدام محاسبه است.
   */
  /** نقشهٔ انتقال یک ردیف — یک قرارداد، چند مقصد. */
  const handoffPlanFor = (item, live = false) => ({
    to: 'backtest', from: 'portfolio-backtest',
    uaIns: String(ua.ins), uaName: nameOf(ua, 'نماد پایه'),
    strategyId: item.strategyId, strategyName: item.strategyName,
    legIns: item.legs.map((leg) => String(leg.ins)),
    comboName: comboName(item),
    entryDate: Number($('pb-entry-date').dataset.value),
    exitDate: Number($('pb-exit-date').dataset.value),
    entryBasis: entryRail.dataset.value || 'LAST',
    exitBasis: exitRail.dataset.value || 'LAST',
    units: Math.max(1, Math.trunc(safeNum($('pb-units').value, 1))),
    live: live === true,
    autoRun: live === true,
  });

  function watchInBacktest(item, live = false) {
    goHandoff(state, handoffPlanFor(item, live));
  }

  /**
   * ریزمعاملهٔ روز سنجش برای همهٔ قراردادهای این پایه.
   *
   * یک درخواست به‌ازای هر قرارداد، ولی فقط برای **یک روز** — و فقط وقتی
   * کاربر صریحاً لحظه‌ای را انتخاب کرده. سنجش پایان روز، مثل قبل، هیچ
   * درخواست تازه‌ای نمی‌خورد.
   *
   * پاسخِ نیامده «معامله نشده» فرض نمی‌شود: کلیدش اصلاً ساخته نمی‌شود و
   * `applyIntradayMark` همان‌طور با آن رفتار می‌کند که با قراردادِ واقعاً
   * بی‌معامله — ردیف آن روز را نمی‌سازد. تفاوت این دو در عدد اثری ندارد،
   * چون هر دو یعنی «قیمتی برای آن لحظه نداریم».
   */
  async function fetchTape(date) {
    const codes = Object.keys(seriesByIns);
    const tape = {};
    let failed = 0;
    for (const part of chunks(codes, 12)) {
      const settled = await Promise.allSettled(part.map(async (ins) => {
        const response = await fetch(`/api/trades?ins=${encodeURIComponent(ins)}&date=${date}`);
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || 'ریزمعامله دریافت نشد');
        return [ins, payload.rows || []];
      }));
      for (const item of settled) {
        if (item.status === 'fulfilled') tape[item.value[0]] = item.value[1];
        else failed += 1;
      }
      setStatus(`دریافت ریزمعاملهٔ روز سنجش: ${fmt.int(Object.keys(tape).length)} از ${fmt.int(codes.length)} ابزار`);
    }
    return { tape, failed, total: codes.length };
  }

  /**
   * سری‌هایی که بازپخش با آن‌ها اجرا می‌شود.
   *
   * پایان روز: همان `seriesByIns`. لحظهٔ درون‌روز: همان سری‌ها با ردیفِ روز
   * سنجش جایگزین‌شده. موتور بازپخش، تولید ترکیب و رتبه‌بندی هیچ‌کدام
   * نمی‌فهمند کدام حالت است — یک موتور، دو ورودی.
   */
  async function seriesForRun(endDate) {
    const second = Number($('pb-mark').value);
    if (!Number.isFinite(second) || !second) {
      $('pb-mark-state').textContent = 'پایان روز سنجش';
      return seriesByIns;
    }
    const label = MARK_MOMENTS.find(([value]) => value === second)?.[1] || '';
    const { tape, failed, total } = await fetchTape(endDate);
    const result = applyIntradayMark(seriesByIns, marksAt(tape, second), { date: endDate, second });
    const note = markNote(result, { label, total });
    $('pb-mark-note').textContent = failed
      ? `${note} ریزمعاملهٔ ${fmt.int(failed)} ابزار دریافت نشد و آن‌ها هم قیمت نگرفتند.`
      : note;
    $('pb-mark-state').textContent = result.marked ? `ساعت ${label} روز سنجش` : 'پایان روز سنجش';
    if (!result.marked) throw new Error(`تا ساعت ${label} هیچ ابزاری معامله نشده بود`);
    return result.series;
  }

  async function runAll() {
    const startDate = Number($('pb-entry-date').dataset.value), endDate = Number($('pb-exit-date').dataset.value);
    if (!ua || !startDate || !endDate || endDate < startDate) { setStatus('نماد و بازه معتبر را انتخاب کن.', true); return; }
    $('pb-run').disabled = true; $('pb-report').hidden = true;
    setStatus('آماده‌سازی اجرای همه استراتژی‌ها…');
    try {
      const runSeries = await seriesForRun(endDate);
      runSeriesByIns = runSeries;
      const payload = await runWorker({
        id: `portfolio-${Date.now()}`, type: 'portfolio', ua, seriesByIns: runSeries, startDate, endDate,
        entryBasis: entryRail.dataset.value || 'LAST', exitBasis: exitRail.dataset.value || 'LAST',
        units: Math.max(1, Math.trunc(safeNum($('pb-units').value, 1))), fees: feesOf(state.settings), settings: state.settings,
        filtered: true, liquidity: liquidity(), maxPerStrategy: Math.max(10, Math.min(1000, Math.trunc(safeNum($('pb-cap').value, 120)))),
        includeInfeasible: $('pb-scope').value === 'all',
      });
      if (!payload.rows.length) throw new Error('هیچ ترکیبی با قیمت و نقدشوندگی معتبر در هر دو تاریخ پیدا نشد');
      renderReport(payload);
      setStatus(`${fmt.int(payload.report.total)} ترکیب معتبر از ${fmt.int(payload.generatedByStrategy.length)} استراتژی گزارش شد.`);
      $('pb-report').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setStatus(errorText(error, 'اجرای دسته‌ای کامل نشد.'), true); }
    finally { $('pb-run').disabled = false; }
  }

  entryRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(entryRail, button.dataset.basis); if (ua) refreshDates(); } });
  exitRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(exitRail, button.dataset.basis); if (ua) refreshDates(); } });
  $('pb-load').addEventListener('click', loadHistory); $('pb-run').addEventListener('click', runAll);
  baseSelect.addEventListener('change', () => { $('pb-work').hidden = true; $('pb-report').hidden = true; });
  // عوض‌کردن دامنه یعنی مجموعهٔ روزهای موجود عوض می‌شود. نتیجهٔ قبلی کنار
  // انتخاب تازه، بدترین حالت است: کاربر فکر می‌کند آنچه می‌بیند مال دامنهٔ
  // تازه است.
  $('pb-data-scope').addEventListener('change', () => {
    const note = $('pb-scope-note');
    note.hidden = true; note.textContent = ''; note.removeAttribute('data-error');
    $('pb-report').hidden = true;
    if (ua && Object.keys(seriesByIns).length) loadHistory();
  });

  try {
    const response = await fetch('/api/history/universe'), payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'فهرست دریافت نشد');
    chain = buildChain(payload.rows || []); baseSelect.innerHTML = '<option value="">نماد پایه را انتخاب کن</option>';
    for (const item of [...chain.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fa'))) {
      const option = document.createElement('option'); option.value = item.ins; option.textContent = `${nameOf(item, 'نماد پایه')} · ${fmt.int(item.contracts)} قرارداد`; baseSelect.appendChild(option);
    }
    setStatus(`${fmt.int(chain.size)} نماد پایه آماده است؛ ${fmt.int(CATALOG.filter((item) => item.feasible).length)} استراتژی قابل اجرا و ${fmt.int(Object.keys(GROUPS).length)} دسته.`);
  } catch (error) { setStatus(errorText(error, 'فهرست نمادها دریافت نشد.'), true); }

  return () => activeWorker?.terminate();
}
