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
import { mountSubtabs } from '/ui/subtabs.mjs';
import { chartGroup } from '/ui/chart-host.mjs';
import {
  boxOption, bumpOption, calendarOption, equityOption, heatLevel, heatScale, heatmapOption,
  histogramOption, parallelOption, raceOption, sankeyOption, scatterOption, treeOption,
  treemapOption, trendOption,
} from '/ui/portfolio-analysis-view.mjs';
import { RETURN_BASES, DEFAULT_RETURN_BASIS, returnOnBasis } from '/core/portfolio-basis.mjs';
import { STATISTICS, WEIGHTINGS, DEFAULT_STATISTIC, DEFAULT_WEIGHTING } from '/core/portfolio-stats.mjs';
import {
  DEFAULT_HEATMAP_MODE, HEATMAP_MODES, METRICS, analyzePortfolio,
} from '/core/portfolio-report.mjs';
import { allocatePortfolio } from '/core/portfolio-allocation.mjs';

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

// نمودارهای دستیِ پیشین — میله‌های رتبه، نقشهٔ حرارتی چهارپله و خط
// جابه‌جایی رتبه — جایشان را به همتاهای ECharts دادند: رنگ پیوسته به‌جای
// چهار پله، و برچسب پایانی و کانونی‌شدن سری به‌جای عنوان کناری.

export async function mount(root, { state }) {
  root.innerHTML = `<section class="portfolio-hero"><div><p class="eyebrow">غربال تاریخی همه استراتژی‌ها</p><h1>در این بازه، بهترین و بدترین کدام بود؟</h1><p>همه استراتژی‌ها و ترکیب‌های معتبر یک نماد در روز ورود ساخته و در یک بازهٔ یکسان سنجیده می‌شوند؛ بدون پرکردن قیمت گمشده و بدون انتخاب پس‌نگر یک برنده.</p></div><span id="pb-hero-verdict">هنوز اجرایی انجام نشده</span></section>
  <div id="pb-tabs" hidden></div>
  <section class="card pb-lens" id="pb-lens" hidden data-open="false">
    <button type="button" class="pb-lens-toggle" id="pb-lens-toggle" aria-expanded="false" aria-controls="pb-lens-body" title="عدسی گزارش">
      <span class="pb-lens-chip">عدسی</span><b id="pb-lens-summary">—</b><i aria-hidden="true"></i>
    </button>
    <div class="pb-lens-body" id="pb-lens-body" hidden>
    <p class="portfolio-note pb-lens-why">هر جدول و نمودارِ این صفحه از همین انتخاب‌ها می‌آید.</p>
    <div class="pb-lens-grid">
      <label>مبنای بازده<select id="pb-basis">${RETURN_BASES.map((row) => `<option value="${row.id}"${row.id === DEFAULT_RETURN_BASIS ? ' selected' : ''}>${esc(row.label)}</option>`).join('')}</select></label>
      <label>آمارهٔ دسته<select id="pb-stat">${STATISTICS.map((row) => `<option value="${row.id}"${row.id === DEFAULT_STATISTIC ? ' selected' : ''}>${esc(row.label)}</option>`).join('')}</select></label>
      <label>وزن‌دهی<select id="pb-weighting">${WEIGHTINGS.map((row) => `<option value="${row.id}"${row.id === DEFAULT_WEIGHTING ? ' selected' : ''}>${esc(row.label)}</option>`).join('')}</select></label>
      <label>از روز<select id="pb-from"></select></label>
      <label>تا روز<select id="pb-to"></select></label>
      <button type="button" class="ghost" id="pb-lens-reset">بازگشت به بازهٔ کامل</button>
    </div>
    <p class="portfolio-note" id="pb-lens-note"></p>
    </div>
  </section>

  <div class="pb-panel" data-panel="setup">
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
  </div>

  <div class="pb-panel" data-panel="overview" hidden>
    <div class="backtest-kpis" id="pb-kpis"></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">سرخط‌ها</p><h2>ده سؤالی که آدم واقعاً می‌پرسد</h2></div><span>روی هر کارت کلیک کن تا همان استراتژی انتخاب شود</span></div><div id="pb-highlights" class="pb-highlights"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">از کل به جزء</p><h2>کدام خانواده وزن دارد و کدام سود داد؟</h2></div><span id="pb-treemap-note">اندازه از شمار ترکیب، رنگ از بازده</span></div><div id="pb-treemap" class="pb-chart pb-chart-lg"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">گزارش خانواده‌ها</p><h2>بهترین و بدترین عضو هر خانواده</h2></div></div><div id="pb-groups" class="history-table-wrap"></div></section>
  </div>

  <div class="pb-panel" data-panel="ranking" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">پایداری رتبه</p><h2>چه کسی کِی جلو افتاد</h2></div><span>روی هر خط کلیک کن تا همان استراتژی انتخاب شود</span></div><div id="pb-bump" class="pb-chart pb-chart-lg"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">مسابقهٔ بازده</p><h2>مسیر تجمعی، از روز ورود تا پایان بازه</h2></div><button type="button" class="ghost" id="pb-race-replay">پخش دوباره</button></div><div id="pb-race" class="pb-chart pb-chart-lg"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">برنده و بازنده</p><h2>رتبه‌بندی با نمرهٔ ترکیبی</h2></div><span id="pb-audit">—</span></div><div id="pb-strategies" class="history-table-wrap"></div></section>
  </div>

  <div class="pb-panel" data-panel="heatmap" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">همهٔ روزهای بازه</p><h2>نقشهٔ حرارتی</h2></div><label class="pb-inline-pick">حالت خانه<select id="pb-heat-mode">${HEATMAP_MODES.map((row) => `<option value="${row.id}"${row.id === DEFAULT_HEATMAP_MODE ? ' selected' : ''}>${esc(row.label)}</option>`).join('')}</select></label></div><p class="portfolio-note" id="pb-heat-note"></p><div id="pb-heatmap" class="pb-chart pb-chart-xl"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">الگوی زمانی</p><h2>تقویم روزانه</h2></div><label class="pb-inline-pick">استراتژی<select id="pb-calendar-pick"></select></label></div><div id="pb-calendar" class="pb-chart pb-chart-lg"></div></section>
  </div>

  <div class="pb-panel" data-panel="trend" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">روند بازده</p><h2>در برابر نگه‌داشتن خودِ سهم</h2></div><div class="pb-toggle-row"><label><input type="checkbox" id="pb-trend-base" checked> نماد پایه</label><label><input type="checkbox" id="pb-trend-area"> ناحیه‌ای</label></div></div><div id="pb-trend-pick" class="pb-chip-row"></div><div id="pb-trend" class="pb-chart pb-chart-xl"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">افق نگهداری</p><h2>اگر زودتر می‌بستیم چه می‌شد؟</h2></div><span>هر ستون، یک پنجرهٔ نگهداری کوتاه‌تر داخل همین بازه</span></div><div id="pb-holding" class="history-table-wrap"></div></section>
  </div>

  <div class="pb-panel" data-panel="metrics" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">قضاوت، دیدنی</p><h2>وزن هر سنجه در نمرهٔ نهایی</h2></div><button type="button" class="ghost" id="pb-weights-reset">وزن‌های پیش‌فرض</button></div><div id="pb-weights" class="pb-weights"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">همهٔ سنجه‌ها با هم</p><h2>هر خط، یک استراتژی</h2></div><span>در همهٔ محورها، بالا یعنی بهتر</span></div><div id="pb-parallel" class="pb-chart pb-chart-lg"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">جدول سنجه‌ها</p><h2>عدد خام هر سنجه</h2></div></div><div id="pb-metrics-table" class="history-table-wrap"></div></section>
  </div>

  <div class="pb-panel" data-panel="distribution" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">سود در برابر درد</p><h2>گوشهٔ بالا-راست همان جایی است که دنبالش می‌گردیم</h2></div></div><div id="pb-scatter" class="pb-chart pb-chart-lg"></div></section>
    <div class="portfolio-report-grid">
      <section class="card"><div class="section-head"><div><p class="eyebrow">توزیع نتیجه</p><h2>بازده همهٔ ترکیب‌ها</h2></div></div><div id="pb-histogram" class="pb-chart"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">پراکندگی درون هر استراتژی</p><h2>نتیجه به استراتژی بود یا به انتخاب ترکیب؟</h2></div></div><div id="pb-box" class="pb-chart"></div></section>
    </div>
  </div>

  <div class="pb-panel" data-panel="drill" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">کاوش از کل به جزء</p><h2>خانواده ← نوع ← استراتژی</h2></div><span>روی هر گره کلیک کن</span></div><div id="pb-tree" class="pb-chart pb-chart-lg"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">ترکیب‌های واقعی</p><h2 id="pb-combo-title">برای مشاهده جزئیات یک استراتژی را انتخاب کن</h2></div><span>هر ردیف یک ترکیب قرارداد</span></div><div id="pb-combos" class="history-table-wrap"></div></section>
    <section id="pb-detail" class="portfolio-detail" hidden></section>
  </div>

  <div class="pb-panel" data-panel="basket" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">سبد فرضی</p><h2>سرمایهٔ اول دوره را بین استراتژی‌ها تقسیم کن</h2></div><button type="button" class="primary" id="pb-basket-run">ساخت سبد</button></div>
      <div class="portfolio-form"><label>سرمایهٔ اول دوره (میلیون ریال)<input id="pb-basket-capital" type="number" min="1" step="1" value="1000"></label></div>
      <div id="pb-basket-rows" class="pb-basket-rows"></div>
      <button type="button" class="ghost" id="pb-basket-add">افزودن استراتژی به سبد</button>
      <p class="portfolio-note" id="pb-basket-note">درصدها روی هم نباید از صد بیشتر شوند. باقی‌ماندهٔ هر سهم که به یک دست کامل نرسد، نقد می‌ماند و در ارزش سبد شمرده می‌شود.</p>
    </section>
    <div class="backtest-kpis" id="pb-basket-kpis"></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">مسیر ارزش سبد</p><h2>از سرمایهٔ اول دوره تا پایان، با افت مسیر</h2></div></div><div id="pb-basket-equity" class="pb-chart pb-chart-lg"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">جریان سرمایه</p><h2>پول از کجا به کجا رفت</h2></div><span id="pb-sankey-note"></span></div><div id="pb-basket-sankey" class="pb-chart pb-chart-lg"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">سهم هر جزء</p><h2>چه کسی سود را ساخت</h2></div></div><div id="pb-basket-table" class="history-table-wrap"></div></section>
  </div>`;

  // هر ظرف جدول، دکمهٔ خروجی خودش را می‌گیرد. ظرف‌ها در همین قالب‌اند حتی
  // وقتی خالی‌اند، و خواندن لحظهٔ کلیک انجام می‌شود — پس یک بار کافی است.
  attachExportsIn(root, 'portfolio');


  const $ = (id) => root.querySelector(`#${id}`);
  const charts = chartGroup();

  // ═══ حالت گزارش ═══
  // `payloadRows` و `payloadMatrix` خامِ یک اجرا هستند و تا اجرای بعدی
  // دست‌نخورده می‌مانند. هر چیز دیگری — مبنا، آماره، وزن، بازه، وزن سنجه‌ها
  // — روی همین دو ساخته می‌شود. برای همین عوض‌کردنشان لحظه‌ای است.
  let payloadRows = [], payloadMatrix = null, analysis = null;
  let lens = {
    basisId: DEFAULT_RETURN_BASIS, statistic: DEFAULT_STATISTIC,
    weighting: DEFAULT_WEIGHTING, from: null, to: null,
  };
  let heatMode = DEFAULT_HEATMAP_MODE;
  let metricWeights = Object.fromEntries(METRICS.map((row) => [row.id, row.weight]));
  let trendPick = [], basketPicks = [], calendarPick = '';
  let tabsApi = null;
  // هر پنل وقتی دیده می‌شود رسم می‌شود، نه زودتر: نمودار روی ظرف پنهان
  // عرض صفر می‌گیرد و بی‌صدا خالی درمی‌آید.
  const dirty = new Set();

  const PB_TABS = [
    { id: 'setup', label: 'راه‌اندازی', hint: 'نماد، بازه و اجرای دسته‌ای' },
    { id: 'overview', label: 'نمای کل', hint: 'خانواده‌ها در یک نگاه' },
    { id: 'ranking', label: 'رتبه‌بندی', hint: 'بهترین و بدترین' },
    { id: 'heatmap', label: 'نقشه', hint: 'همهٔ روزها، همهٔ استراتژی‌ها' },
    { id: 'trend', label: 'روند', hint: 'مسیر بازده و افق نگهداری' },
    { id: 'metrics', label: 'سنجه‌ها', hint: 'وزن قضاوت' },
    { id: 'distribution', label: 'توزیع', hint: 'پراکندگی نتیجه' },
    { id: 'drill', label: 'کاوش', hint: 'از کل تا یک ترکیب' },
    { id: 'basket', label: 'سبد فرضی', hint: 'تخصیص سرمایه' },
  ];

  const labelsOf = () => (analysis?.dates || []).map(dateLabel);
  const pctCell = (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—');
  const numCellOf = (value) => (Number.isFinite(value) ? fmt.num(value) : '—');

  const status = $('pb-status'), baseSelect = $('pb-base'), entryRail = $('pb-entry-basis'), exitRail = $('pb-exit-basis');
  let chain = new Map(), ua = null, seriesByIns = {}, baseDates = [], generated = [], activeWorker = null, selectedStrategyId = '';
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
    $('pb-load').disabled = true; hideReport();
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

  // ═══════════════════ عدسی گزارش ═══════════════════

  function paintLensOptions() {
    const dates = payloadMatrix?.dates || [];
    const options = (selected) => dates
      .map((date) => `<option value="${date}"${Number(selected) === date ? ' selected' : ''}>${esc(dateLabel(date))}</option>`)
      .join('');
    $('pb-from').innerHTML = options(lens.from ?? dates[0]);
    $('pb-to').innerHTML = options(lens.to ?? dates.at(-1));
  }

  /**
   * خلاصهٔ یک‌خطیِ عدسی برای حالت بسته.
   *
   * وقتی نوار جمع است، کاربر باید بدون بازکردنش بداند عددهایی که می‌بیند
   * روی چه مبنا و چه بازه‌ای ساخته شده‌اند. نوارِ بسته و بی‌برچسب، بدتر از
   * نوارِ بزرگ است: جا نمی‌گیرد ولی عدد را هم بی‌قید می‌کند.
   */
  function lensSummary() {
    if (!analysis) return 'هنوز اجرایی انجام نشده';
    const grain = analysis.range.days;
    return [
      analysis.basis.short,
      analysis.statisticLabel,
      analysis.weighting === 'equal' ? 'هم‌وزن' : 'وزن ارزش',
      `${fmt.int(grain)} روز`,
      analysis.range.from ? `${dateLabel(analysis.range.from)} تا ${dateLabel(analysis.range.to)}` : '',
    ].filter(Boolean).join(' · ');
  }

  const LENS_KEY = 'pb-lens-open';
  function setLensOpen(open) {
    const card = $('pb-lens');
    card.dataset.open = String(open);
    $('pb-lens-body').hidden = !open;
    $('pb-lens-toggle').setAttribute('aria-expanded', String(open));
    // ماندگاری فقط یک راحتی است؛ اگر حافظهٔ مرورگر نبود، صفحه باید همان‌طور
    // کار کند. پس هر خواندن و نوشتنی داخل try است.
    try { localStorage.setItem(LENS_KEY, open ? '1' : '0'); } catch { /* حافظهٔ مرورگر در دسترس نیست */ }
  }
  const lensWasOpen = () => {
    try { return localStorage.getItem(LENS_KEY) === '1'; } catch { return false; }
  };

  function paintLensNote() {
    $('pb-lens-summary').textContent = lensSummary();
    if (!analysis) { $('pb-lens-note').textContent = ''; return; }
    const beyond = analysis.beyondBasis;
    const parts = [
      `بازده روی «${analysis.basis.label}» — ${analysis.basis.hint}.`,
      `آمارهٔ دسته‌ها «${analysis.statisticLabel}» و وزن‌دهی «${analysis.weightingLabel}» است.`,
      `${fmt.int(analysis.range.days)} روز معتبر، ${fmt.int(analysis.usable)} ترکیب.`,
    ];
    if (analysis.unusable) parts.push(`${fmt.int(analysis.unusable)} ترکیب مخرج یا پایان معتبر نداشت و وارد رتبه‌بندی نشد.`);
    if (beyond) {
      parts.push(`در ${fmt.int(beyond)} ترکیب، زیان از خودِ مبنا رد شده و بازده از ۱۰۰− درصد پایین‌تر رفته است. عدد بریده نشده — در فروش برهنه زیان سقف ندارد ولی مخرج دارد. اگر می‌خواهی ۱۰۰− کف باشد، مبنای «سرمایهٔ درگیر ناخالص» را انتخاب کن.`);
    }
    $('pb-lens-note').textContent = parts.join(' ');
  }

  /**
   * بازساخت تحلیل از ماتریسِ همان اجرا.
   *
   * هیچ بازپخشی اینجا انجام نمی‌شود؛ برای همین عوض‌کردن هر انتخابی در
   * عدسی، به‌جای چند دقیقه، چند میلی‌ثانیه طول می‌کشد.
   */
  function recompute() {
    if (!payloadMatrix) return;
    analysis = analyzePortfolio({
      rows: payloadRows, matrix: payloadMatrix,
      basisId: lens.basisId, statistic: lens.statistic, weighting: lens.weighting,
      from: lens.from, to: lens.to, weights: metricWeights,
    });
    if (!trendPick.length) trendPick = analysis.strategies.slice(0, 4).map((row) => row.strategyId);
    paintLensNote();
    paintHero();
    for (const tab of PB_TABS) if (tab.id !== 'setup') dirty.add(tab.id);
    paintPanel(tabsApi?.current || 'overview');
  }

  function paintHero() {
    if (!analysis?.best) { $('pb-hero-verdict').textContent = 'نتیجه‌ای برای رتبه‌بندی نیست'; return; }
    $('pb-hero-verdict').textContent = `بهترین: ${analysis.best.strategyName} · بدترین: ${analysis.worst?.strategyName || '—'}`;
  }

  /** پنل دیده‌شده را رسم می‌کند؛ بقیه تا دیده‌نشدن دست‌نخورده می‌مانند. */
  function paintPanel(id) {
    if (!analysis || !dirty.has(id)) { charts.resizeAll(); return; }
    dirty.delete(id);
    if (id === 'overview') paintOverview();
    else if (id === 'ranking') paintRanking();
    else if (id === 'heatmap') paintHeatmapPanel();
    else if (id === 'trend') paintTrend();
    else if (id === 'metrics') paintMetrics();
    else if (id === 'distribution') paintDistribution();
    else if (id === 'drill') paintDrill();
    else if (id === 'basket') paintBasket();
  }

  // ═══════════════════ نمای کل ═══════════════════

  function paintOverview() {
    const best = analysis.best, worst = analysis.worst;
    const cards = [
      ['ترکیب وارد رتبه‌بندی', fmt.int(analysis.usable), ''],
      ['روز معتبر بازه', fmt.int(analysis.range.days), ''],
      ['استراتژی سنجیده‌شده', fmt.int(analysis.strategies.length), ''],
      ['بهترین', best ? `${best.strategyName} · نمره ${fmt.num(best.score)}` : '—', 'gain'],
      ['بدترین', worst ? `${worst.strategyName} · نمره ${fmt.num(worst.score)}` : '—', 'loss'],
      ['مسیر خودِ نماد پایه', pctCell(analysis.baseFinal), signTone(analysis.baseFinal)],
    ];
    $('pb-kpis').innerHTML = cards.map(([label, value, tone]) => `<article class="${tone}"><span>${esc(label)}</span><b>${value}</b></article>`).join('');
    paintHighlights();
    charts.set('treemap', $('pb-treemap'), (echarts, tokens) => treemapOption(analysis, tokens));
    $('pb-groups').innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>خانواده</th><th>استراتژی</th><th>ترکیب</th><th>سودده</th><th>بازده (${esc(analysis.statisticLabel)})</th><th>بهترین عضو</th><th>بدترین عضو</th></tr></thead><tbody>${
      analysis.groups.map((row) => `<tr><td>${esc(row.groupName)}</td><td>${fmt.int(row.strategies)}</td><td>${fmt.int(row.samples)}</td><td>${fmt.int(row.wins)} · ${pctCell(row.winPct)}</td><td class="${signTone(row.returnStat)}">${pctCell(row.returnStat)}</td><td>${esc(row.bestStrategy?.strategyName || '—')}</td><td>${esc(row.worstStrategy?.strategyName || '—')}</td></tr>`).join('')}</tbody></table>`;
  }

  /**
   * سرخط‌ها — هر کدام یک سؤال تک‌جمله‌ای با یک جواب و دلیلش.
   *
   * عمداً جدا از نمرهٔ ترکیبی‌اند: «پایدارترین» با «بهترین» یکی نیست و
   * قاطی‌کردنشان همان چیزی است که گزارش را گنگ می‌کند.
   */
  function paintHighlights() {
    const unitOf = (metric) => METRICS.find((row) => row.id === metric);
    $('pb-highlights').innerHTML = (analysis.highlights || []).map((item) => {
      const meta = unitOf(item.metric);
      const raw = item.metric === 'score' ? item.row.score : item.row.metrics[item.metric];
      const text = !meta ? numCellOf(raw)
        : meta.unit === 'pct' ? pctCell(raw)
          : meta.unit === 'money' ? fmt.money(raw)
            : meta.unit === 'int' ? fmt.int(raw)
              : numCellOf(raw);
      return `<button type="button" class="pb-highlight" data-strategy="${esc(item.row.strategyId)}" title="${esc(item.hint)}">
        <span class="pb-highlight-label">${esc(item.label)}</span>
        <b>${esc(item.row.strategyName)}</b>
        <span class="pb-highlight-value">${esc(meta?.label || 'نمره')}: <em>${text}</em></span>
        <small>${esc(item.hint)}</small>
      </button>`;
    }).join('') || '<p class="empty-note">سرخطی ساخته نشد؛ نتیجهٔ معتبری در این بازه نیست.</p>';
    $('pb-highlights').onclick = (event) => {
      const card = event.target.closest('[data-strategy]');
      if (card) selectStrategy(card.dataset.strategy);
    };
  }

  // ═══════════════════ رتبه‌بندی ═══════════════════

  function paintRanking() {
    const labels = labelsOf();
    charts.set('bump', $('pb-bump'), (echarts, tokens) => bumpOption(analysis, labels, tokens), {
      onClick: (params) => { if (params?.seriesName) selectStrategyByName(params.seriesName); },
      empty: 'برای نمایش تغییر رتبه، دست‌کم دو روز و دو استراتژی لازم است.',
    });
    charts.set('race', $('pb-race'), (echarts, tokens) => raceOption(analysis, labels, tokens, { pick: trendPick }));
    $('pb-strategies').innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>رتبه</th><th>استراتژی</th><th>خانواده</th><th>ترکیب</th><th>نمره</th><th>بازده</th><th>نرخ برد</th><th>بیشترین افت</th><th>سود به درد</th><th>پوشش داده</th></tr></thead><tbody>${
      analysis.strategies.map((row) => `<tr data-strategy="${esc(row.strategyId)}" tabindex="0"><td>${fmt.int(row.rank)}</td><td><b>${esc(row.strategyName)}</b>${row.feasible ? '' : '<small>ساختاری؛ غیرقابل اجرا در تابلو</small>'}${row.beyondBasis ? '<small>زیان از مبنا رد شده</small>' : ''}</td><td>${esc(row.groupName)}</td><td>${fmt.int(row.samples)}</td><td><b>${numCellOf(row.score)}</b>${row.scoreCoverage !== null && row.scoreCoverage < 100 ? `<small>${pctCell(row.scoreCoverage)} پوشش سنجه</small>` : ''}</td><td class="${signTone(row.metrics.return)}">${pctCell(row.metrics.return)}</td><td>${pctCell(row.metrics.winPct)}</td><td class="${signTone(row.metrics.drawdown)}">${pctCell(row.metrics.drawdown)}</td><td>${numCellOf(row.metrics.painRatio)}</td><td>${pctCell(row.metrics.coverage)}</td></tr>`).join('')}</tbody></table>`;
    $('pb-strategies').onclick = (event) => { const row = event.target.closest('[data-strategy]'); if (row) selectStrategy(row.dataset.strategy); };
    $('pb-strategies').onkeydown = (event) => {
      const row = event.target.closest('[data-strategy]');
      if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectStrategy(row.dataset.strategy); }
    };
  }

  const selectStrategyByName = (name) => {
    const found = analysis.strategies.find((row) => row.strategyName === name);
    if (found) selectStrategy(found.strategyId);
  };

  // ═══════════════════ نقشه ═══════════════════

  function paintHeatmapPanel() {
    const labels = labelsOf();
    const meta = HEATMAP_MODES.find((row) => row.id === heatMode);
    $('pb-heat-note').textContent = `${meta?.label || ''} — ${meta?.hint || ''} خانهٔ خالی یعنی آن روز برای آن استراتژی قیمت معتبری نبود؛ صفر جایش نمی‌نشیند.`;
    charts.set('heatmap', $('pb-heatmap'), (echarts, tokens) => heatmapOption(analysis, heatMode, labels, tokens), {
      onClick: (params) => {
        const row = analysis.strategies[params?.value?.[1]];
        if (row) selectStrategy(row.strategyId);
      },
      empty: 'برای نقشهٔ زمانی، روز معتبر کافی وجود ندارد.',
    });
    $('pb-calendar-pick').innerHTML = `<option value="">میانهٔ همهٔ استراتژی‌ها</option>${
      analysis.strategies.map((row) => `<option value="${esc(row.strategyId)}"${row.strategyId === calendarPick ? ' selected' : ''}>${esc(row.strategyName)}</option>`).join('')}`;
    charts.set('calendar', $('pb-calendar'),
      (echarts, tokens) => calendarOption(analysis, tokens, { strategyId: calendarPick, mode: heatMode === 'cumulative' ? 'step' : heatMode }));
  }

  // ═══════════════════ روند و افق نگهداری ═══════════════════

  function paintTrend() {
    const labels = labelsOf();
    $('pb-trend-pick').innerHTML = analysis.strategies.slice(0, 18).map((row) => `<button type="button" class="pb-chip${trendPick.includes(row.strategyId) ? ' on' : ''}" data-trend="${esc(row.strategyId)}" aria-pressed="${trendPick.includes(row.strategyId)}">${esc(row.strategyName)}</button>`).join('');
    charts.set('trend', $('pb-trend'), (echarts, tokens) => trendOption(analysis, labels, tokens, {
      pick: trendPick, showBase: $('pb-trend-base').checked, area: $('pb-trend-area').checked,
    }));
    paintHolding();
  }

  /**
   * افق نگهداری: اگر همین موقعیت را زودتر می‌بستیم چه می‌شد؟
   *
   * چون همهٔ ترکیب‌ها یک روز ورود دارند، «نگهداری k روز» دقیقاً همان ستون
   * k است — پس این جدول از همان ماتریس درمی‌آید و بازپخش تازه نمی‌خواهد.
   */
  function paintHolding() {
    const rows = (analysis.dates || []).map((date, column) => {
      const values = analysis.combos
        .filter((combo) => combo.series.ok)
        .map((combo) => combo.series.pct[column])
        .filter((value) => value !== null);
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return {
        column, date,
        samples: values.length,
        median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
        best: sorted.at(-1), worst: sorted[0],
        winPct: (values.filter((value) => value > 0).length / values.length) * 100,
      };
    }).filter(Boolean);
    if (!rows.length) { $('pb-holding').innerHTML = '<p class="empty-note">افق نگهداری بدون روز معتبر ساخته نمی‌شود.</p>'; return; }
    const bound = heatScale(rows.map((row) => row.median));
    $('pb-holding').innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>روز نگهداری</th><th>تاریخ خروج</th><th>ترکیب معتبر</th><th>میانهٔ بازده</th><th>نرخ برد</th><th>بهترین</th><th>بدترین</th></tr></thead><tbody>${
      rows.map((row) => {
        const band = heatLevel(row.median, bound);
        return `<tr data-tone="${band.tone}" data-level="${band.level ?? ''}"><td>${fmt.int(row.column)}</td><td>${esc(dateLabel(row.date))}</td><td>${fmt.int(row.samples)}</td><td class="${signTone(row.median)}">${pctCell(row.median)}</td><td>${pctCell(row.winPct)}</td><td class="gain">${pctCell(row.best)}</td><td class="loss">${pctCell(row.worst)}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  // ═══════════════════ سنجه‌ها ═══════════════════

  function paintMetrics() {
    $('pb-weights').innerHTML = METRICS.map((metric) => `<label class="pb-weight"><span>${esc(metric.label)}<small>${esc(metric.hint)}</small></span><input type="range" min="0" max="50" step="5" data-weight="${esc(metric.id)}" value="${metricWeights[metric.id]}"><b data-weight-out="${esc(metric.id)}">${fmt.int(metricWeights[metric.id])}</b></label>`).join('');
    charts.set('parallel', $('pb-parallel'), (echarts, tokens) => parallelOption(analysis, METRICS.filter((metric) => metricWeights[metric.id] > 0), tokens), {
      empty: 'برای مختصات موازی، دست‌کم دو استراتژی و دو سنجهٔ وزن‌دار لازم است.',
    });
    $('pb-metrics-table').innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>استراتژی</th>${METRICS.map((metric) => `<th title="${esc(metric.hint)}">${esc(metric.label)}</th>`).join('')}</tr></thead><tbody>${
      analysis.strategies.map((row) => `<tr><td><b>${esc(row.strategyName)}</b></td>${METRICS.map((metric) => {
        const value = row.metrics[metric.id];
        const text = metric.unit === 'pct' ? pctCell(value) : metric.unit === 'days' || metric.unit === 'rank' ? (Number.isFinite(value) ? fmt.num(value) : '—') : numCellOf(value);
        return `<td class="${metric.unit === 'pct' && metric.better === 'high' ? signTone(value) : ''}">${text}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
  }

  // ═══════════════════ توزیع ═══════════════════

  function paintDistribution() {
    charts.set('scatter', $('pb-scatter'), (echarts, tokens) => scatterOption(analysis, tokens), {
      onClick: (params) => { if (params?.data?.id) selectStrategy(params.data.id); },
      empty: 'برای پراکندگی، دست‌کم دو استراتژی با افت و بازده معتبر لازم است.',
    });
    charts.set('histogram', $('pb-histogram'), (echarts, tokens) => histogramOption(analysis, tokens), {
      empty: 'برای توزیع، دست‌کم سه ترکیب معتبر لازم است.',
    });
    charts.set('box', $('pb-box'), (echarts, tokens) => boxOption(analysis, tokens), {
      empty: 'برای نمودار جعبه‌ای، هر استراتژی دست‌کم سه ترکیب معتبر لازم دارد.',
    });
  }

  // ═══════════════════ کاوش ═══════════════════

  function paintDrill() {
    charts.set('tree', $('pb-tree'), (echarts, tokens) => treeOption(analysis, tokens), {
      onClick: (params) => { if (params?.data?.strategyId) selectStrategy(params.data.strategyId); },
    });
    // اگر کاربر مستقیم وارد این تب شود و هنوز چیزی انتخاب نکرده باشد،
    // جدول ترکیب‌ها خالی می‌ماند و صفحه شکسته به نظر می‌رسد. پس بهترینِ
    // همین تحلیل، انتخاب پیش‌فرض است — نه جدولی خالی با یک عنوان دعوت‌کننده.
    const fallback = analysis.strategies.find((row) => row.strategyId === selectedStrategyId)
      ? selectedStrategyId
      : analysis.best?.strategyId;
    if (fallback) selectStrategy(fallback, { jump: false });
  }

  // ═══════════════════ سبد فرضی ═══════════════════

  function basketRowMarkup(pick, index) {
    const strategies = analysis?.strategies || [];
    const combos = (analysis?.combos || []).filter((combo) => combo.strategyId === pick.strategyId && combo.series.ok);
    return `<div class="pb-basket-row" data-basket-row="${index}">
      <label>استراتژی<select data-basket="strategyId" data-index="${index}">${strategies.map((row) => `<option value="${esc(row.strategyId)}"${row.strategyId === pick.strategyId ? ' selected' : ''}>${esc(row.strategyName)}</option>`).join('')}</select></label>
      <label>ترکیب<select data-basket="comboId" data-index="${index}">${combos.length ? combos.map((combo) => `<option value="${esc(combo.id)}"${combo.id === pick.comboId ? ' selected' : ''}>${esc(comboName(combo))} · ${pctCell(combo.series.finalPct)}</option>`).join('') : '<option value="">ترکیب معتبری ندارد</option>'}</select></label>
      <label>سهم (درصد)<input type="number" min="1" max="100" step="1" data-basket="pct" data-index="${index}" value="${pick.pct}"></label>
      <button type="button" class="ghost" data-basket-remove="${index}">حذف</button>
    </div>`;
  }

  function paintBasketForm() {
    if (!analysis) return;
    if (!basketPicks.length && analysis.strategies.length) {
      basketPicks = analysis.strategies.slice(0, 3).map((row, index) => {
        const combo = analysis.combos.find((item) => item.strategyId === row.strategyId && item.series.ok);
        return { strategyId: row.strategyId, comboId: combo?.id || '', pct: [40, 35, 25][index] ?? 20 };
      });
    }
    $('pb-basket-rows').innerHTML = basketPicks.map(basketRowMarkup).join('');
  }

  function paintBasket() {
    paintBasketForm();
    const capital = Math.max(0, safeNum($('pb-basket-capital').value, 0)) * 1e6;
    const basket = allocatePortfolio({
      capitalRial: capital, picks: basketPicks, analysis, basisId: lens.basisId,
    });
    if (!basket.ok) {
      $('pb-basket-kpis').innerHTML = `<article class="loss"><span>سبد ساخته نشد</span><b>${esc(basket.why)}</b></article>`;
      $('pb-basket-table').innerHTML = `<p class="empty-note">${esc(basket.why)}</p>`;
      charts.set('equity', $('pb-basket-equity'), () => null, { empty: basket.why });
      charts.set('sankey', $('pb-basket-sankey'), () => null, { empty: basket.why });
      return;
    }
    const summary = basket.summary;
    $('pb-basket-kpis').innerHTML = [
      ['سرمایهٔ اول دوره', fmt.money(basket.capitalRial), ''],
      ['پول واقعاً درگیر', `${fmt.money(basket.deployedRial)} · ${pctCell(basket.deployedPct)}`, ''],
      ['نقد تخصیص‌نیافته', fmt.money(basket.idleRial), ''],
      ['سود یا زیان پایان دوره', fmt.money(summary.finalPnlRial), signTone(summary.finalPnlRial)],
      ['بازده روی سرمایهٔ اول دوره', pctCell(summary.finalReturnPct), signTone(summary.finalReturnPct)],
      ['بیشترین افت سبد', `${fmt.money(summary.maxDrawdownRial)} · ${pctCell(summary.maxDrawdownPct)}`, 'loss'],
      ['نخستین روز سود', summary.firstProfitIndex === null ? 'رخ نداد' : esc(dateLabel(analysis.dates[summary.firstProfitIndex])), ''],
      ['روز معلوم از کل', `${fmt.int(summary.knownDays)} از ${fmt.int(summary.totalDays)}`, summary.knownDays < summary.totalDays ? 'loss' : ''],
    ].map(([label, value, tone]) => `<article class="${tone}"><span>${esc(label)}</span><b>${value}</b></article>`).join('');

    const labels = labelsOf();
    charts.set('equity', $('pb-basket-equity'), (echarts, tokens) => equityOption(basket, labels, tokens), {
      empty: 'ارزش سبد در هیچ روزی کامل معلوم نشد؛ دست‌کم یک جزء هر روز قیمت نداشت.',
    });
    charts.set('sankey', $('pb-basket-sankey'), (echarts, tokens) => sankeyOption(basket, tokens));
    const wiped = basket.legs.filter((leg) => leg.ok && leg.finalPnlRial !== null && leg.deployedRial + leg.finalPnlRial <= 0);
    $('pb-sankey-note').textContent = wiped.length
      ? `${fmt.int(wiped.length)} سهم ارزش پایانی مثبتی نداشت و جریانی از آن بیرون نمی‌رود.`
      : '';

    const unfunded = basket.legs.filter((leg) => !leg.ok);
    $('pb-basket-table').innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>استراتژی</th><th>ترکیب</th><th>دست</th><th>پول درگیر</th><th>نقد مانده</th><th>سود/زیان</th><th>بازده جزء</th><th>سهم از سود کل</th></tr></thead><tbody>${
      basket.legs.map((leg) => (leg.ok
        ? `<tr><td>${esc(leg.strategyName)}</td><td>${esc(leg.comboId)}</td><td>${fmt.int(leg.lots)}</td><td>${fmt.money(leg.deployedRial)}</td><td>${fmt.money(leg.idleRial)}</td><td class="${signTone(leg.finalPnlRial)}">${fmt.money(leg.finalPnlRial)}</td><td class="${signTone(basket.contributions.find((row) => row.comboId === leg.comboId)?.returnPct)}">${pctCell(basket.contributions.find((row) => row.comboId === leg.comboId)?.returnPct)}</td><td>${pctCell(basket.contributions.find((row) => row.comboId === leg.comboId)?.sharePct)}</td></tr>`
        : `<tr><td>${esc(leg.strategyName || '—')}</td><td colspan="7"><span class="loss">${esc(leg.why)}</span> — ${fmt.money(leg.targetRial)} نقد ماند${leg.unitCostRial ? `؛ بهای هر دست ${fmt.money(leg.unitCostRial)}` : ''}</td></tr>`)).join('')}</tbody></table>${
      unfunded.length ? `<p class="portfolio-note">${fmt.int(unfunded.length)} سهم تأمین نشد و پولش نقد ماند. بازده سبد روی کل سرمایهٔ اول دوره حساب شده، نه فقط روی پول درگیر — پس نقدِ بی‌کار، بازده را رقیق می‌کند، همان‌طور که در واقعیت می‌کند.</p>` : ''}`;
  }

  // ═══════════════════ ورود نتیجهٔ اجرا ═══════════════════

  function renderReport(payload) {
    payloadRows = payload.rows;
    payloadMatrix = payload.matrix
      ? { ...payload.matrix, pnl: payload.matrix.pnl instanceof Float64Array ? payload.matrix.pnl : Float64Array.from(payload.matrix.pnl || []) }
      : null;
    generated = payload.generatedByStrategy;
    lens = { ...lens, from: null, to: null };
    trendPick = []; basketPicks = []; calendarPick = ''; selectedStrategyId = '';
    if (!payloadMatrix) { setStatus('این اجرا ماتریس روزانه نساخت.', true); return; }
    paintLensOptions();
    $('pb-lens').hidden = false;
    setLensOpen(lensWasOpen());
    $('pb-tabs').hidden = false;
    tabsApi = mountSubtabs($('pb-tabs'), PB_TABS, {
      root,
      initial: 'overview',
      onChange: (id) => {
        $('pb-lens').hidden = id === 'setup';
        paintPanel(id);
      },
    });
    const capped = generated.filter((row) => row.capped).length;
    $('pb-audit').textContent = `${fmt.int(generated.length)} استراتژی بررسی شد · ${fmt.int(payload.excluded.invalidAtEnd)} ترکیب فاقد داده معتبر روز سنجش · ${fmt.int(capped)} استراتژی سقف‌خورده`;
    recompute();
    tabsApi?.show('overview');
  }

  function selectStrategy(strategyId, { jump = true } = {}) {
    if (!analysis) return;
    const strategy = analysis.strategies.find((row) => row.strategyId === strategyId);
    if (!strategy) return;
    selectedStrategyId = strategyId;
    root.querySelectorAll('[data-strategy]').forEach((row) => row.classList.toggle('selected', row.dataset.strategy === strategyId));
    const rows = analysis.combos
      .filter((combo) => combo.strategyId === strategyId && combo.series.ok)
      .sort((a, b) => (b.series.finalPct ?? -Infinity) - (a.series.finalPct ?? -Infinity));
    $('pb-combo-title').textContent = `${strategy.strategyName} · ${fmt.int(rows.length)} ترکیب`;
    $('pb-combos').innerHTML = rows.length
      ? `<table class="history-table"><thead><tr><th>رتبه</th><th>ترکیب قرارداد</th><th>سررسید</th><th>مخرج (${esc(analysis.basis.short)})</th><th>سود/زیان</th><th>بازده</th><th>بیشترین افت</th><th>اولین سود</th><th>ارزش معاملهٔ ورود</th></tr></thead><tbody>${
        rows.map((item, index) => `<tr data-result="${esc(item.id)}" tabindex="0"><td>${fmt.int(index + 1)}</td><td>${esc(comboName(item))}</td><td>${(item.expiries || []).map(dateLabel).join(' / ')}</td><td>${fmt.money(item.series.denominator)}</td><td class="${signTone(item.series.finalPnl)}">${fmt.money(item.series.finalPnl)}</td><td class="${signTone(item.series.finalPct)}">${pctCell(item.series.finalPct)}${item.series.beyondBasis ? ' <small>از مبنا رد شده</small>' : ''}</td><td class="${signTone(item.series.maxDrawdownPct)}">${pctCell(item.series.maxDrawdownPct)}</td><td>${item.series.firstProfitIndex === null ? 'رخ نداد' : `${esc(dateLabel(analysis.dates[item.series.firstProfitIndex]))} · ${fmt.int(item.series.firstProfitIndex)} روز`}</td><td>${item.entry?.legValueComplete ? fmt.money(item.entry.legValue) : 'ناقص'}</td></tr>`).join('')}</tbody></table>`
      : '<p class="empty-note">هیچ ترکیبی از این استراتژی روی مبنای انتخابی، مخرج و پایان معتبر ندارد.</p>';
    const pick = (id) => { const item = rows.find((row) => row.id === id); if (item) showDetail(rawRow(item)); };
    $('pb-combos').onclick = (event) => { const row = event.target.closest('[data-result]'); if (row) pick(row.dataset.result); };
    $('pb-combos').onkeydown = (event) => { const row = event.target.closest('[data-result]'); if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); pick(row.dataset.result); } };
    if (jump) { dirty.delete('drill'); tabsApi?.show('drill'); charts.resizeAll(); }
    if (rows.length) showDetail(rawRow(rows[0]));
  }

  // پنل جزئیات با ردیف **خام** ریسه کار می‌کند، نه با نسخهٔ تحلیل‌شده:
  // بازپخش دستی و یونانی‌ها به `legs` و `final` اصلی نیاز دارند.
  const rawRow = (combo) => payloadRows.find((row) => row.id === combo.id) || combo;

  function comboName(item) {
    return `${item.legs.map((leg) => nameOf(leg, 'قرارداد')).join(' + ')} · اعمال ${item.strikes.map((strike) => fmt.int(strike)).join(' / ')}`;
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

  /**
   * همان ترکیب، در ساعت‌های مختلف روز سنجش.
   *
   * این «تایم‌فریم پایین» است: پنجرهٔ نگهداری همان است ولی لحظهٔ خروج ریزتر
   * می‌شود. ریزمعامله فقط برای پاهای همین ترکیب و نماد پایه گرفته می‌شود —
   * کل تابلو چند صد درخواست است و برای یک ترکیب لازم نیست.
   *
   * ساعتی که یکی از پاها تا آن لحظه معامله نشده باشد ردیف نمی‌سازد. این
   * همان قاعدهٔ همیشگی است: نبودِ قیمت با قیمتِ دیروز پر نمی‌شود.
   */
  async function renderIntraday(item) {
    const host = root.querySelector('#pb-intraday');
    const note = root.querySelector('#pb-intraday-note');
    const button = root.querySelector('#pb-intraday-run');
    const endDate = Number($('pb-exit-date').dataset.value);
    if (!endDate || !ua) { host.innerHTML = '<p class="empty-note">روز سنجش انتخاب نشده است.</p>'; return; }
    button.disabled = true;
    host.innerHTML = '<p class="empty-note">در حال دریافت ریزمعاملهٔ پاهای همین ترکیب…</p>';
    try {
      const codes = [...new Set([String(ua.ins), ...item.legs.map((leg) => String(leg.ins))])];
      const settled = await Promise.allSettled(codes.map(async (ins) => {
        const response = await fetch(`/api/trades?ins=${encodeURIComponent(ins)}&date=${endDate}`);
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || 'ریزمعامله دریافت نشد');
        return [ins, payload.rows || []];
      }));
      const tape = Object.fromEntries(settled.filter((row) => row.status === 'fulfilled').map((row) => row.value));
      const failed = settled.filter((row) => row.status === 'rejected').length;
      const rows = [];
      for (const [second, label] of MARK_MOMENTS) {
        const marked = applyIntradayMark(seriesByIns, marksAt(tape, second), { date: endDate, second });
        if (!marked.marked) { rows.push({ label, ok: false, why: 'تا این ساعت هیچ پایی معامله نشده بود' }); continue; }
        const replay = replayHistory({ ...replayArgs(item), seriesByIns: marked.series });
        const final = replay.ok ? replay.rows.find((row) => row.date === endDate && row.status === 'ok') : null;
        if (!final) { rows.push({ label, ok: false, why: 'یکی از پاها تا این ساعت قیمت نداشت' }); continue; }
        rows.push({
          label, ok: true, netPnl: final.netPnl,
          pct: returnOnBasis(final.netPnl, {
            marginGross: replay.entry.margin?.margin, marginNet: replay.entry.margin?.marginNet,
            netCash: replay.entry.netCash, capital: replay.entry.capital?.value, notional: replay.entry.notional,
          }, lens.basisId).pct,
          // `marked.dropped` اینجا معنا ندارد: ریزمعامله عمداً فقط برای
          // پاهای همین ترکیب گرفته شده، پس هر ابزار دیگری «افتاده» شمرده
          // می‌شود در حالی که اصلاً پرسیده نشده. گزارشش، دروغِ آماری بود.
          legs: final.perLeg.length,
          exitAt: final.perLeg.map((leg) => leg.exitPrice),
        });
      }
      const known = rows.filter((row) => row.ok);
      const bound = heatScale(known.map((row) => row.pct));
      host.innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>ساعت روز سنجش</th><th>سود/زیان</th><th>بازده (${esc(analysis?.basis?.short || '')})</th><th>قیمت خروج هر پا در این ساعت</th></tr></thead><tbody>${
        rows.map((row) => {
          if (!row.ok) return `<tr><td>${esc(row.label)}</td><td>—</td><td>—</td><td class="loss">${esc(row.why)}</td></tr>`;
          const band = heatLevel(row.pct, bound);
          return `<tr data-tone="${band.tone}" data-level="${band.level ?? ''}"><td>${esc(row.label)}</td><td class="${signTone(row.netPnl)}">${fmt.money(row.netPnl)}</td><td class="${signTone(row.pct)}">${pctCell(row.pct)}</td><td>${fmt.int(row.legs)} پا با قیمت ${row.exitAt.map((price) => fmt.money(price)).join(' / ')}</td></tr>`;
        }).join('')}</tbody></table>`;
      note.textContent = known.length
        ? `${fmt.int(known.length)} ساعت از ${fmt.int(MARK_MOMENTS.length)} ساعت، برای همهٔ پاهای این ترکیب قیمت داشت. عددها میان‌روزی‌اند و پایانِ روز نیستند.${failed ? ` ریزمعاملهٔ ${fmt.int(failed)} ابزار دریافت نشد.` : ''}`
        : 'در هیچ‌کدام از ساعت‌های جلسه، همهٔ پاهای این ترکیب قیمت نداشتند.';
    } catch (error) {
      host.innerHTML = `<p class="empty-note">${esc(errorText(error, 'ریزمعاملهٔ روز سنجش دریافت نشد.'))}</p>`;
    } finally { button.disabled = false; }
  }

  function showDetail(item) {
    root.querySelectorAll('[data-result]').forEach((row) => row.classList.toggle('selected', row.dataset.result === item.id));
    const detail = $('pb-detail'); detail.hidden = false;
    const replay = replayHistory(replayArgs(item));
    if (!replay.ok) { detail.innerHTML = `<section class="card"><p class="empty-note">${esc(replay.error)}</p></section>`; return; }
    detail.innerHTML = `<section class="card"><div class="section-head"><div><p class="eyebrow">جزئیات قابل کلیک</p><h2>${esc(item.strategyName)} · ${esc(comboName(item))}</h2></div><div class="backtest-head-actions"><span>${item.feasible ? 'قابل اجرا در ساختار بازار' : 'فقط سناریوی ساختاری'}</span><button type="button" id="pb-watch">ادامه در آزمایشگاه آپشن</button><button type="button" class="ghost" id="pb-live-watch">رصد زنده با معاملات امروز</button><button type="button" class="ghost" id="pb-greeks-watch">رصد یونانی و تلاطم</button></div></div><div id="pb-detail-result"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">قیمت دستی واقعی برای هر قرارداد</p><h2>بازمحاسبه بدون دست‌کاری قیمت سایر پاها</h2></div><button type="button" class="primary" id="pb-manual-run">بازمحاسبه دستی</button></div><div class="portfolio-manual">${replay.priced.map((leg, index) => `<label>${fmt.int(index + 1)} · ${esc(nameOf(leg, 'پایه'))}<input type="number" min="0" step="1" data-manual="${index}" value="${leg.price}"></label>`).join('')}</div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">حساسیت، در کنار سود</p><h2>یونانی‌ها و تلاطم این ترکیب</h2></div><span id="pb-greeks-state">—</span></div><p class="portfolio-note" id="pb-greeks-note"></p><div class="backtest-kpis" id="pb-greeks-kpis"></div><div class="history-analysis-grid"><div><div class="section-head"><h3>خلاصهٔ یونانی موقعیت</h3></div><div id="pb-greeks-summary" class="history-table-wrap"></div></div><div><div class="section-head"><h3>خلاصهٔ تلاطم</h3></div><div id="pb-vol-summary" class="history-table-wrap"></div></div></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">تایم‌فریم پایین</p><h2>همین ترکیب، ساعت‌به‌ساعت روز سنجش</h2></div><button type="button" class="ghost" id="pb-intraday-run">سنجش ساعت‌به‌ساعت</button></div><p class="portfolio-note" id="pb-intraday-note">فقط ریزمعاملهٔ پاهای همین ترکیب و نماد پایه گرفته می‌شود، نه کل تابلو. ساعتی که هر سه پا تا آن لحظه معامله نشده باشند، ردیف نمی‌سازد — قیمت پایانی روز یا قیمت دیروز جایش نمی‌نشیند.</p><div id="pb-intraday" class="history-table-wrap"></div></section>
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
    detail.querySelector('#pb-intraday-run').onclick = () => renderIntraday(item);
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
    $('pb-run').disabled = true; hideReport();
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
      setStatus(`${fmt.int(payload.rows.length)} ترکیب معتبر از ${fmt.int(payload.generatedByStrategy.length)} استراتژی گزارش شد.`);
      $('pb-tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setStatus(errorText(error, 'اجرای دسته‌ای کامل نشد.'), true); }
    finally { $('pb-run').disabled = false; }
  }

  /**
   * نتیجهٔ اجرای قبلی را کنار می‌گذارد.
   *
   * ماندنِ گزارشِ قدیم کنار انتخاب تازه، بدترین حالت است: کاربر فکر می‌کند
   * آنچه می‌بیند مال انتخاب تازه است.
   */
  function hideReport() {
    charts.disposeAll();
    dirty.clear();
    analysis = null; payloadMatrix = null; payloadRows = [];
    $('pb-tabs').hidden = true;
    $('pb-lens').hidden = true;
    $('pb-detail').hidden = true;
    for (const panel of root.querySelectorAll('.pb-panel')) panel.hidden = panel.dataset.panel !== 'setup';
    $('pb-hero-verdict').textContent = 'هنوز اجرایی انجام نشده';
  }

  // ═══ عدسی: هر تغییری فقط بازساخت است، نه اجرای دوباره ═══
  const relens = (patch) => { lens = { ...lens, ...patch }; recompute(); };
  $('pb-basis').addEventListener('change', (event) => relens({ basisId: event.target.value }));
  $('pb-stat').addEventListener('change', (event) => relens({ statistic: event.target.value }));
  $('pb-weighting').addEventListener('change', (event) => relens({ weighting: event.target.value }));
  $('pb-from').addEventListener('change', (event) => relens({ from: Number(event.target.value) || null }));
  $('pb-to').addEventListener('change', (event) => relens({ to: Number(event.target.value) || null }));
  $('pb-lens-toggle').addEventListener('click', () => {
    setLensOpen($('pb-lens').dataset.open !== 'true');
  });
  $('pb-lens-reset').addEventListener('click', () => {
    lens = { ...lens, from: null, to: null };
    paintLensOptions();
    recompute();
  });

  $('pb-heat-mode').addEventListener('change', (event) => {
    heatMode = event.target.value;
    dirty.add('heatmap');
    paintPanel('heatmap');
  });
  $('pb-calendar-pick').addEventListener('change', (event) => {
    calendarPick = event.target.value;
    dirty.add('heatmap');
    paintPanel('heatmap');
  });

  $('pb-trend-pick').addEventListener('click', (event) => {
    const button = event.target.closest('[data-trend]');
    if (!button) return;
    const id = button.dataset.trend;
    trendPick = trendPick.includes(id) ? trendPick.filter((row) => row !== id) : [...trendPick, id];
    dirty.add('trend'); dirty.add('ranking');
    paintPanel('trend');
  });
  for (const id of ['pb-trend-base', 'pb-trend-area']) {
    $(id).addEventListener('change', () => { dirty.add('trend'); paintPanel('trend'); });
  }
  $('pb-race-replay').addEventListener('click', () => {
    dirty.add('ranking');
    paintPanel('ranking');
  });

  $('pb-weights').addEventListener('input', (event) => {
    const slider = event.target.closest('[data-weight]');
    if (!slider) return;
    metricWeights = { ...metricWeights, [slider.dataset.weight]: Math.max(0, safeNum(slider.value, 0)) };
    const out = $('pb-weights').querySelector(`[data-weight-out="${slider.dataset.weight}"]`);
    if (out) out.textContent = fmt.int(metricWeights[slider.dataset.weight]);
    recompute();
  });
  $('pb-weights-reset').addEventListener('click', () => {
    metricWeights = Object.fromEntries(METRICS.map((row) => [row.id, row.weight]));
    recompute();
  });

  // ═══ سبد فرضی ═══
  $('pb-basket-add').addEventListener('click', () => {
    const next = (analysis?.strategies || []).find((row) => !basketPicks.some((pick) => pick.strategyId === row.strategyId));
    if (!next) return;
    const combo = analysis.combos.find((item) => item.strategyId === next.strategyId && item.series.ok);
    basketPicks = [...basketPicks, { strategyId: next.strategyId, comboId: combo?.id || '', pct: 10 }];
    paintBasket();
  });
  $('pb-basket-rows').addEventListener('change', (event) => {
    const field = event.target.closest('[data-basket]');
    if (!field) return;
    const index = Number(field.dataset.index);
    const key = field.dataset.basket;
    const value = key === 'pct' ? Math.max(0, safeNum(field.value, 0)) : field.value;
    basketPicks = basketPicks.map((pick, at) => {
      if (at !== index) return pick;
      if (key !== 'strategyId') return { ...pick, [key]: value };
      // عوض‌شدن استراتژی یعنی ترکیب قبلی دیگر عضو این استراتژی نیست؛
      // نگه‌داشتنش یعنی سبدی که کاربر فکر می‌کند چیده با آنچه ساخته می‌شود
      // فرق دارد.
      const combo = analysis.combos.find((item) => item.strategyId === value && item.series.ok);
      return { ...pick, strategyId: value, comboId: combo?.id || '' };
    });
    paintBasket();
  });
  $('pb-basket-rows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-basket-remove]');
    if (!button) return;
    const index = Number(button.dataset.basketRemove);
    basketPicks = basketPicks.filter((pick, at) => at !== index);
    paintBasket();
  });
  $('pb-basket-run').addEventListener('click', () => paintBasket());
  $('pb-basket-capital').addEventListener('change', () => paintBasket());

  entryRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(entryRail, button.dataset.basis); if (ua) refreshDates(); } });
  exitRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(exitRail, button.dataset.basis); if (ua) refreshDates(); } });
  $('pb-load').addEventListener('click', loadHistory); $('pb-run').addEventListener('click', runAll);
  baseSelect.addEventListener('change', () => { $('pb-work').hidden = true; hideReport(); });
  // عوض‌کردن دامنه یعنی مجموعهٔ روزهای موجود عوض می‌شود. نتیجهٔ قبلی کنار
  // انتخاب تازه، بدترین حالت است: کاربر فکر می‌کند آنچه می‌بیند مال دامنهٔ
  // تازه است.
  $('pb-data-scope').addEventListener('change', () => {
    const note = $('pb-scope-note');
    note.hidden = true; note.textContent = ''; note.removeAttribute('data-error');
    hideReport();
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

  return () => {
    activeWorker?.terminate();
    charts.disposeAll();
  };
}
