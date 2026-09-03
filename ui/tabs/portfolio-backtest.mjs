import { CATALOG, GROUPS } from '/strategies/catalog.mjs';
import { goHandoff } from '/ui/handoff.mjs';
import { buildChain } from '/core/chain.mjs';
import { feesOf } from '/core/settings.mjs';
import {
  HISTORY_BASES, basisMatrix, censusNote, entrySensitivity, flattenActiveContracts,
  historyDateLabel, historyMarketMetrics, historyPrice,
  normalizeHistoryDate, replayHistory,
} from '/core/history.mjs';
import { mountDateWheel } from '/ui/datewheel.mjs';
import { SCOPE_LIVE, scopeOptionsMarkup, applyLiveScope } from '/ui/live-scope.mjs';
import { loadRange, mountHistoryRange } from '/ui/history-range.mjs';
import { fmt, faDigits, signTone } from '/ui/fmt.mjs';
import { attachExportsIn } from '/ui/export.mjs';
import { SETTINGS_CHANGED_EVENT } from '/ui/settings-sync.mjs';
import { MARK_MOMENTS, marksAt, applyIntradayMark, markNote } from '/core/intraday-mark.mjs';
import { ivParams } from '/core/leg-iv.mjs';
import { resolveHistVol } from '/core/hist-vol.mjs';
import { GREEKS, annotateReplay, monitorGreekSummary, monitorVolSummary } from '/core/monitor.mjs';
import { mountSubtabs } from '/ui/subtabs.mjs';
import { chartGroup } from '/ui/chart-host.mjs';
import {
  boxOption, bumpOption, calendarOption, equityOption, heatLevel, heatScale, heatmapOption, horizonHeatOption, sortStrategies,
  histogramOption, parallelOption, raceOption, sankeyOption, scatterOption, treeOption,
  treemapOption, trendOption,
} from '/ui/portfolio-analysis-view.mjs';
import { RETURN_BASES, DEFAULT_RETURN_BASIS, returnOnBasis } from '/core/portfolio-basis.mjs';
import { STATISTICS, WEIGHTINGS, DEFAULT_STATISTIC, DEFAULT_WEIGHTING } from '/core/portfolio-stats.mjs';
import {
  DEFAULT_HEATMAP_MODE, HEATMAP_MODES, METRICS, analyzePortfolio,
} from '/core/portfolio-report.mjs';
import { HEAT_PALETTES, HEAT_SORTS, isoDate } from '/ui/portfolio-analysis-view.mjs';
import {
  equityOption as bkEquity, versusBaseOption as bkVersus, stepBarOption as bkStep,
  memberPathOption as bkMemberPath, memberDrawdownOption as bkMemberDd,
  memberStackOption as bkMemberStack, memberHeatOption as bkMemberHeat,
  memberBumpOption as bkMemberBump, fundedLegs as bkFunded,
} from '/ui/basket-charts.mjs';
import {
  flowOption as bkFlow, sunburstOption as bkSun, weightTreeOption as bkTree,
  waterfallOption as bkFall, dumbbellOption as bkDumb, riskReturnOption as bkRisk,
  memberBoxOption as bkBox, stepHistogramOption as bkHist, memberRadarOption as bkRadar,
} from '/ui/basket-charts-mix.mjs';
import {
  correlationOption as bkCorr, calendarOption as bkCal, ecdfOption as bkEcdf,
  swarmOption as bkSwarm, marimekkoOption as bkMek, funnelOption as bkFunnel,
  rollingWinOption as bkRoll, riskShareOption as bkRiskShare,
} from '/ui/basket-charts-more.mjs';
import {
  scoreLollipopOption as labScore, halfDumbbellOption as labDumb, bulletOption as labBullet,
  radialScoreOption as labRadial, countPictorialOption as labCount,
} from '/ui/chart-lab.mjs';
import {
  familyWaffleOption as labWaffle, familyMekkoOption as labMekko, screenFunnelOption as labFunnel,
  ridgelineOption as labRidge, violinOption as labViolin, comboSwarmOption as labSwarm,
  butterflyOption as labFly, hexbinOption as labHex, regressionOption as labReg,
  rankSlopeOption as labSlope,
} from '/ui/chart-lab-shape.mjs';
import {
  horizonOption as labHorizon, riverOption as labRiver, raceOption as labRace,
  timelineOption as labTime, outcomeSankeyOption as labSankey, chordOption as labChord,
  treeOption as labTree, familyWaterfallOption as labFall, divergingOption as labDiv,
  excessAreaOption as labExcess,
} from '/ui/chart-lab-flow.mjs';
import {
  sunburstOption as labSun, treemapOption as labTreemap, parallelOption as labPar,
  strategyCorrOption as labCorr, metricHeatOption as labMetric, baseCalendarOption as labCal,
  familyEcdfOption as labEcdf, familyBoxOption as labBox, similarityGraphOption as labGraph,
  marketGaugeOption as labGauge,
} from '/ui/chart-lab-more.mjs';
import {
  waffleOption as bkWaffle, contributionLollipopOption as bkLolli, captureOption as bkCapture,
  gaugeOption as bkGauge, weekdayOption as bkWeekday, slopeOption as bkSlope,
  familyBubbleOption as bkBubble,
} from '/ui/basket-charts-extra.mjs';
import { payoffCurveOption as bkPayoff, payoffNote } from '/ui/basket-payoff.mjs';
import { allocatePortfolio } from '/core/portfolio-allocation.mjs';
import {
  addPick, applyBasketEdit, comboLotCost, combosFor, firstComboId, freePct, lotCostRial,
  normalizeBasketPicks, pickOn, pickWarning, usedPct,
} from '/core/basket-picks.mjs';
import {
  DEFAULT_GRAIN, MOMENT_GRAINS, grainMeta, intradayCost, isIntradayGrain,
  momentDate, momentLabel, momentSecond, momentsFor, normalizeGrain,
} from '/core/intraday-grid.mjs';
import { downloadPortfolioBacktest } from '/ui/portfolio-backtest-export.mjs';
import { dataSourceRows } from '/core/data-source.mjs';
import { FILTER_FIELDS, applyComboFilter, filterNote } from '/core/combo-filter.mjs';
import { selectMatrixRows } from '/core/portfolio-matrix.mjs';
import {
  correlationHeatOption, correlationOf, familyBarOption, funnelOption, paretoOption,
  roseOption, shareDonutOption, similarityGraphOption, sunburstOption,
} from '/ui/portfolio-charts-parts.mjs';
import {
  cumulativeDistOption, dailyWinOption, drawdownPathOption, familyRiverOption,
  metricRadarOption, polarScoreOption, quartileBandOption, scoreGaugeOption,
  scorePartsOption, stepHistogramOption,
} from '/ui/portfolio-charts-flow.mjs';

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

export async function mount(root, { state, api }) {
  // پوستهٔ این صفحه در `.pb-skin` بسته می‌شود، نه در کنترل‌های سراسری:
  // دکمه و ورودیِ همین تب عوض می‌شود و بقیهٔ برنامه دست نمی‌خورد.
  root.classList.add('pb-skin');
  root.innerHTML = `<section class="portfolio-hero pb-hero"><div><p class="eyebrow">غربال تاریخی همه استراتژی‌ها</p><h1>در این بازه، بهترین و بدترین کدام بود؟</h1><p>همه استراتژی‌ها و ترکیب‌های معتبر یک نماد در روز ورود ساخته و در یک بازهٔ یکسان سنجیده می‌شوند؛ بدون پرکردن قیمت گمشده و بدون انتخاب پس‌نگر یک برنده.</p></div><span id="pb-hero-verdict">هنوز اجرایی انجام نشده</span></section>
  <div id="pb-tabs" hidden></div>
  <div class="pb-workbook" id="pb-workbook" hidden>
    <button type="button" class="primary" id="pb-workbook-run">دفترچهٔ کامل اکسل</button>
    <p class="portfolio-note" id="pb-workbook-note">یازده برگ در یک فایل: سرشناسه و عدسی، سرخط‌ها، چهارده سنجهٔ هر استراتژی، خانواده‌ها، همهٔ ترکیب‌ها با اجزای مخرج، مسیر روزانه برای PivotTable، افق نگهداری، توزیع، همبستگی، سبد فرضی، و برگ محدودیت‌های داده. خانهٔ خالی یعنی داده نبود؛ صفر یعنی سر به سر.</p>
  </div>
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
      <label>دانه‌بندی زمان<select id="pb-grain">${MOMENT_GRAINS.map((row) => `<option value="${row.id}" title="${esc(row.hint)}"${row.id === DEFAULT_GRAIN ? ' selected' : ''}>${esc(row.label)}</option>`).join('')}</select></label>
      <label>از روز<select id="pb-from"></select></label>
      <label>تا روز<select id="pb-to"></select></label>
      <button type="button" class="ghost" id="pb-lens-reset">بازگشت به بازهٔ کامل</button>
    </div>
    <p class="portfolio-note" id="pb-lens-note"></p>
    <div class="pb-grain-run" id="pb-grain-run" hidden>
      <button type="button" class="primary" id="pb-grain-go">اجرای درون‌روزی</button>
      <p class="portfolio-note" id="pb-grain-note"></p>
    </div>
    </div>
  </section>

  <aside class="pb-drawer" id="pb-drawer" hidden aria-live="polite">
    <div class="pb-drawer-head">
      <b id="pb-drawer-title">جزئیات</b>
      <div class="pb-drawer-tabs" id="pb-drawer-tabs"></div>
      <button type="button" class="ghost" id="pb-drawer-close" title="بستن">بستن</button>
    </div>
    <div class="pb-drawer-body" id="pb-drawer-body"></div>
  </aside>
  <div class="pb-panel" data-panel="setup">
    <section class="card portfolio-controls"><div class="section-head"><div><p class="eyebrow">مرحله اول</p><h2>نماد، نقدشوندگی و دامنه آزمون</h2></div><b id="pb-status" role="status" aria-live="polite">در حال دریافت نمادها…</b></div>
    <div class="portfolio-form"><label>نماد پایه<select id="pb-base"><option value="">در حال دریافت…</option></select></label><label>دامنه استراتژی<select id="pb-scope"><option value="feasible">فقط استراتژی‌های قابل اجرا</option><option value="all">همه ساختاری، با برچسب غیرقابل اجرا</option></select></label><label>دامنهٔ داده<select id="pb-data-scope">${scopeOptionsMarkup()}</select></label><label>تعداد واحد<input id="pb-units" type="number" min="1" max="10000" step="1" value="${Math.max(1, state.settings.qtyDefault || 1)}"></label><label>سقف ترکیب هر استراتژی<input id="pb-cap" type="number" min="10" max="1000" step="10" value="120"></label>
      <label>حداقل ارزش پایه (میلیارد ریال)<input id="pb-base-value" type="number" min="0" step="0.1" value="0"></label><label>حداقل ارزش هر قرارداد (میلیون ریال)<input id="pb-leg-value" type="number" min="0" step="0.1" value="0"></label><label>حداقل حجم پایه<input id="pb-base-volume" type="number" min="0" step="1" value="0"></label><label>حداقل حجم هر قرارداد<input id="pb-leg-volume" type="number" min="0" step="1" value="0"></label>
      <button type="button" class="primary" id="pb-load">دریافت تاریخچه نماد</button></div>
    <div id="pb-range"></div>
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
    <p class="pb-census" id="pb-census" role="status" aria-live="polite"></p>
    <div class="backtest-kpis" id="pb-kpis"></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">سرخط‌ها</p><h2>ده سؤالی که آدم واقعاً می‌پرسد</h2></div><span>روی هر کارت کلیک کن تا همان استراتژی انتخاب شود</span></div><div id="pb-highlights" class="pb-highlights"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">گزارش خانواده‌ها</p><h2>بهترین و بدترین عضو هر خانواده</h2></div></div><div id="pb-groups" class="history-table-wrap"></div></section>
  </div>

  <div class="pb-panel" data-panel="ranking" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">پالایه</p><h2>کدام ترکیب‌ها بمانند</h2></div><button type="button" class="ghost" id="pb-filter-clear">پاک کردن همه</button></div>
      <p class="pb-hint">هر خانه خالی یعنی آن قید خاموش است. پالایه روی ورودی می‌نشیند، پس رتبه‌بندی و نمودارها و خروجی اکسل همه با همین ردیف‌ها ساخته می‌شوند. ردیفی که مقدارِ یک قید را ندارد کنار نمی‌رود — جدا شمرده می‌شود.</p>
      <div id="pb-filter-grid" class="pb-filter-grid"></div>
      <p class="pb-filter-note" id="pb-filter-note" role="status" aria-live="polite"></p>
    </section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">جدول اصلی</p><h2>رتبه‌بندی با نمرهٔ ترکیبی</h2></div><span id="pb-audit">—</span></div>
      <p class="pb-hint">ترتیب از نمرهٔ ترکیبی می‌آید، نه فقط از بازده. وزن سنجه‌ها را در تب «سنجه‌ها» می‌توانی عوض کنی و همین جدول همان لحظه از نو مرتب می‌شود. روی هر ردیف کلیک کن تا ترکیب‌هایش را ببینی.</p>
      <div id="pb-strategies" class="history-table-wrap"></div>
    </section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">مسابقهٔ بازده</p><h2>مسیر تجمعی، از روز ورود تا پایان بازه</h2></div><button type="button" class="ghost" id="pb-race-replay">پخش دوباره</button></div>
      <p class="pb-hint">خط‌ها با هم از چپ به راست جلو می‌روند تا ببینی هر استراتژی کِی از بقیه جدا شد. با تراشه‌های تب «روند» انتخاب می‌شود کدام‌ها بیایند.</p>
      <div id="pb-race" class="pb-chart pb-chart-lg"></div>
    </section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">پایداری رتبه</p><h2>چه کسی کِی جلو افتاد</h2></div><span>روی هر خط کلیک کن</span></div>
      <p class="pb-hint">محور عمودی وارونه است: بالا یعنی رتبهٔ بهتر. خطی که صاف بالا می‌ماند، هر روز جلو بوده؛ خطی که بالا و پایین می‌پرد، بردش بیشتر شانس بوده تا پایداری.</p>
      <div id="pb-bump" class="pb-chart pb-chart-lg"></div>
    </section>
  </div>

  <div class="pb-panel" data-panel="heatmap" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">همهٔ روزهای بازه</p><h2>نقشهٔ حرارتی</h2></div><div class="pb-toggle-row">
      <label class="pb-inline-pick">حالت خانه<select id="pb-heat-mode">${HEATMAP_MODES.map((row) => `<option value="${row.id}"${row.id === DEFAULT_HEATMAP_MODE ? ' selected' : ''}>${esc(row.label)}</option>`).join('')}</select></label>
      <label class="pb-inline-pick">ترتیب سطرها<select id="pb-heat-sort">${HEAT_SORTS.map((row) => `<option value="${row.id}" title="${esc(row.hint)}">${esc(row.label)}</option>`).join('')}</select></label>
      <label class="pb-inline-pick">طیف رنگ<select id="pb-heat-palette">${HEAT_PALETTES.map((row) => `<option value="${row.id}" title="${esc(row.hint)}">${esc(row.label)}</option>`).join('')}</select></label>
    </div></div><p class="portfolio-note" id="pb-heat-note"></p><div id="pb-heatmap" class="pb-chart pb-chart-xl"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">افق در برابر استراتژی</p><h2>کدام استراتژی در کدام افق بهتر بود؟</h2></div></div>
      <p class="pb-hint">سطرها استراتژی‌اند و ستون‌ها «اگر بعد از n روز می‌بستیم». خانهٔ سبزِ پررنگ یعنی آن استراتژی در آن افق بهترین نتیجه را داده — و اگر یک ستون کلاً سبز باشد، آن افق برای همه خوب بوده، نه فقط برای یکی.</p>
      <div id="pb-horizon" class="pb-chart pb-chart-lg"></div>
    </section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">الگوی زمانی</p><h2>تقویم روزانه</h2></div><label class="pb-inline-pick">استراتژی<select id="pb-calendar-pick"></select></label></div><div id="pb-calendar" class="pb-chart pb-chart-lg"></div></section>
  </div>

  <div class="pb-panel" data-panel="trend" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">روند بازده</p><h2>در برابر نگه‌داشتن خودِ سهم</h2></div><div class="pb-toggle-row"><label><input type="checkbox" id="pb-trend-base" checked> نماد پایه</label><label><input type="checkbox" id="pb-trend-area"> ناحیه‌ای</label></div></div>
      <p class="pb-hint">هر خط، مسیر بازده یک استراتژی از روز ورود است. خط خط‌چین، خودِ سهم را نشان می‌دهد: اگر خطی زیر آن بماند، آن استراتژی از نگه‌داشتن ساده سهم بدتر بوده. با تراشه‌های زیر، استراتژی‌ها را کم و زیاد کن؛ با کشیدن روی نوار پایین، بازه را بزرگ کن.</p>
      <div id="pb-trend-pick" class="pb-chip-row"></div><div id="pb-trend" class="pb-chart pb-chart-xl"></div>
    </section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">قطعیتِ دروغین</p><h2>میانه، با باند چارک‌ها دورش</h2></div><label class="pb-inline-pick">دامنه<select id="pb-band-pick"></select></label></div>
      <p class="pb-hint">خط وسط می‌گوید «معمولاً چه شد» و ناحیهٔ رنگی می‌گوید «چقدر می‌توانست فرق کند». باند پهن یعنی نتیجه بیشتر به این بستگی داشت که کدام ترکیب را انتخاب کنی، نه به خود استراتژی.</p>
      <div id="pb-band" class="pb-chart pb-chart-lg"></div>
    </section>
    <div class="portfolio-report-grid">
      <section class="card"><div class="section-head"><div><p class="eyebrow">درد مسیر</p><h2>افت از سقف، روزبه‌روز</h2></div></div>
        <p class="pb-hint">صفر یعنی همان لحظه روی بهترین نقطهٔ مسیرش بوده. هرچه خط پایین‌تر برود، از قله بیشتر عقب افتاده — همان دردی که آدم را از معامله بیرون می‌کند.</p>
        <div id="pb-dd-path" class="pb-chart"></div>
      </section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">نرخ برد روزانه</p><h2>هر روز چند درصد ترکیب‌ها سبز بودند</h2></div></div>
        <p class="pb-hint">خط‌چین وسط، پنجاه درصد است. بالای آن یعنی آن روز بیشترِ ترکیب‌های آن استراتژی در سود بودند.</p>
        <div id="pb-daily-win" class="pb-chart"></div>
      </section>
    </div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">رودخانهٔ خانواده‌ها</p><h2>در هر روز، سود کدام خانواده بیشتر بود</h2></div></div>
      <p class="pb-hint">پهنای هر نوار، سود مثبت آن خانواده در آن روز است. فقط سود مثبت وارد می‌شود چون رودخانه پهنای منفی نمی‌کشد — پس این نمودار «کجا سود بود» را می‌گوید، نه «کجا زیان بود».</p>
      <div id="pb-river" class="pb-chart pb-chart-lg"></div>
    </section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">افق نگهداری</p><h2>اگر زودتر می‌بستیم چه می‌شد؟</h2></div><span>هر ردیف، یک پنجرهٔ نگهداری کوتاه‌تر داخل همین بازه</span></div>
      <p class="pb-hint">چون همهٔ ترکیب‌ها یک روز ورود دارند، «نگهداری n روز» دقیقاً همان ستون n است. ردیف سبزتر یعنی آن افق، بهتر جواب داده.</p>
      <div id="pb-holding" class="history-table-wrap"></div>
    </section>
  </div>

  <div class="pb-panel" data-panel="metrics" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">قضاوت، دیدنی</p><h2>وزن هر سنجه در نمرهٔ نهایی</h2></div><button type="button" class="ghost" id="pb-weights-reset">وزن‌های پیش‌فرض</button></div>
      <p class="pb-hint">«بهترین» یک عدد نیست، یک قضاوت است. اینجا می‌بینی آن قضاوت از چه ساخته شده و می‌توانی عوضش کنی: لغزنده را که بکشی، رتبه‌بندی همان لحظه از نو ساخته می‌شود. وزن صفر یعنی آن سنجه فقط نمایش داده می‌شود و در نمره نمی‌آید.</p>
      <div id="pb-weights" class="pb-weights"></div>
    </section>
    <div class="portfolio-report-grid">
      <section class="card"><div class="section-head"><div><p class="eyebrow">نمرهٔ صدر جدول</p><h2>عقربهٔ بهترین</h2></div></div>
        <p class="pb-hint">نمره از صفر تا صد است و از <b>رتبهٔ درصدی</b> می‌آید، نه از خودِ عدد سنجه‌ها. صد یعنی در همهٔ سنجه‌های وزن‌دار، اول بوده.</p>
        <div id="pb-gauge" class="pb-chart"></div>
      </section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">نمرهٔ همه</p><h2>روی یک دایره</h2></div></div>
        <p class="pb-hint">هر تیغه یک استراتژی است؛ بلندتر یعنی نمرهٔ بالاتر. رنگ از بازده می‌آید، پس تیغهٔ بلندِ قرمز یعنی «نمره‌اش خوب بود ولی بازدهش نه» — و آن، همان جایی است که باید وزن‌ها را بازبینی کنی.</p>
        <div id="pb-polar" class="pb-chart"></div>
      </section>
    </div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">این نمره از کجا آمد؟</p><h2>سهم هر سنجه در نمرهٔ هر استراتژی</h2></div></div>
      <p class="pb-hint">هر میله، نمرهٔ یک استراتژی است که به اجزایش شکسته شده. تکهٔ بزرگ‌تر یعنی آن سنجه بیشتر نمره را ساخته. اگر یک استراتژی سنجه‌ای را نداشته باشد، تکه‌اش نیست — صفر نمی‌گیرد.</p>
      <div id="pb-score-parts" class="pb-chart pb-chart-lg"></div>
    </section>
    <div class="portfolio-report-grid">
      <section class="card"><div class="section-head"><div><p class="eyebrow">مختصات موازی</p><h2>هر خط، یک استراتژی روی همهٔ محورها</h2></div></div>
        <p class="pb-hint">در همهٔ محورها، بالا یعنی بهتر — سنجه‌هایی که «کمتر بهتر» است وارونه شده‌اند. خطی که همه‌جا بالاست، همه‌جوره خوب بوده.</p>
        <div id="pb-parallel" class="pb-chart pb-chart-lg"></div>
      </section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">رادار</p><h2>چند استراتژی، رودررو</h2></div></div>
        <p class="pb-hint">هر محور به صفر تا صد نگاشته شده، وگرنه «درصد بازده» و «شمار ترکیب» روی یک شکل جمع‌شدنی نبودند. دورتر از مرکز یعنی بهتر. عدد واقعی در راهنمای شناور است.</p>
        <div id="pb-radar" class="pb-chart pb-chart-lg"></div>
      </section>
    </div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">جدول سنجه‌ها</p><h2>عدد خام هر سنجه</h2></div><span>روی هر ردیف کلیک کن</span></div><div id="pb-metrics-table" class="history-table-wrap"></div></section>
  </div>

  <div class="pb-panel" data-panel="distribution" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">سود در برابر درد</p><h2>گوشهٔ بالا-راست همان جایی است که دنبالش می‌گردیم</h2></div></div>
      <p class="pb-hint">محور افقی بیشترین افت مسیر است و محور عمودی بازده. هرچه نقطه بالاتر و راست‌تر باشد، سود بیشتری با درد کمتری داده. اندازهٔ دایره، شمار ترکیب‌های آن استراتژی است. روی هر نقطه کلیک کن تا جزئیاتش را ببینی.</p>
      <div id="pb-scatter" class="pb-chart pb-chart-lg"></div>
    </section>
    <div class="portfolio-report-grid">
      <section class="card"><div class="section-head"><div><p class="eyebrow">توزیع نتیجه</p><h2>بازده همهٔ ترکیب‌ها</h2></div></div>
        <p class="pb-hint">هر میله می‌گوید چند ترکیب بازدهی در آن حدود داشتند. توده‌ای که سمت راستِ صفر جمع شده یعنی بیشتر ترکیب‌ها سود دادند.</p>
        <div id="pb-histogram" class="pb-chart"></div>
      </section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">توزیع تجمعی</p><h2>چند درصد ترکیب‌ها زیر یک عدد ماندند؟</h2></div></div>
        <p class="pb-hint">جای برخورد خط با خط‌چینِ «سر به سر»، همان درصد ترکیب‌هایی است که زیان دادند. هرچه خط دیرتر بالا برود، نتیجه بهتر بوده.</p>
        <div id="pb-cdf" class="pb-chart"></div>
      </section>
    </div>
    <div class="portfolio-report-grid">
      <section class="card"><div class="section-head"><div><p class="eyebrow">پراکندگی درون هر استراتژی</p><h2>نتیجه به استراتژی بود یا به انتخاب ترکیب؟</h2></div></div>
        <p class="pb-hint">هر جعبه یک استراتژی است: خط وسط میانه، بدنهٔ جعبه چارک پایین تا بالا، و خط‌های بیرونی کمینه و بیشینه. جعبهٔ بلند یعنی همان استراتژی با ترکیب‌های مختلف نتیجه‌های خیلی متفاوتی داد.</p>
        <div id="pb-box" class="pb-chart"></div>
      </section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">تندی حرکت</p><h2>توزیع تغییر روزانهٔ بازده</h2></div></div>
        <p class="pb-hint">هر میله می‌گوید چند بار تغییر روزانه در آن حدود بوده. توزیع پهن یعنی مسیرها پرتکان‌اند؛ توزیع باریکِ دور صفر یعنی آرام.</p>
        <div id="pb-step-hist" class="pb-chart"></div>
      </section>
    </div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">جدول توزیع</p><h2>چارک‌ها و دُم‌ها، به عدد</h2></div></div><div id="pb-dist-table" class="history-table-wrap"></div></section>
  </div>

  <div class="pb-panel" data-panel="parts" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">قیف غربال</p><h2>از هر چه ساخته شد تا هر چه به رتبه‌بندی رسید</h2></div></div>
      <p class="pb-hint">جواب سؤالی که همیشه پرسیده می‌شود: چرا از این‌همه ترکیب فقط این‌قدر ماند؟ هر پله، یک شرط را می‌اندازد.</p>
      <div id="pb-funnel" class="pb-chart"></div>
    </section>
    <div class="portfolio-report-grid">
      <section class="card"><div class="section-head"><div><p class="eyebrow">سه حلقه</p><h2>خانواده ← استراتژی ← ترکیب</h2></div></div>
        <p class="pb-hint">هر حلقه یک پله جزئی‌تر است. کمان بزرگ‌تر یعنی ترکیب بیشتر؛ سبز یعنی آن شاخه سود داد.</p>
        <div id="pb-sunburst" class="pb-chart pb-chart-lg"></div>
      </section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">سهم خانواده‌ها</p><h2>هر خانواده چند درصد ترکیب‌ها را دارد</h2></div></div>
        <p class="pb-hint">درصد روی خودِ قاچ نوشته شده. اگر یک خانواده نصف نمودار را گرفته، نتیجهٔ کل بیشتر حرفِ همان خانواده است.</p>
        <div id="pb-donut" class="pb-chart pb-chart-lg"></div>
      </section>
    </div>
    <div class="portfolio-report-grid">
      <section class="card"><div class="section-head"><div><p class="eyebrow">وزن خانواده‌ها</p><h2>شمار ترکیب هر خانواده</h2></div></div>
        <p class="pb-hint">هر مربع کوچک یک واحد است؛ ردیف بلندتر یعنی آن خانواده انتخاب بیشتری پیش رویت می‌گذارد.</p>
        <div id="pb-family-bar" class="pb-chart"></div>
      </section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">درخت‌نقشه</p><h2>مساحت از شمار ترکیب، رنگ از بازده</h2></div></div>
        <p class="pb-hint">برای دیدن اینکه پول و انتخاب کجا جمع شده، و آن جا سود داد یا نه.</p>
        <div id="pb-treemap" class="pb-chart"></div>
      </section>
    </div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">گل رز</p><h2>بازده هر استراتژی، همه در یک نگاه</h2></div></div>
      <p class="pb-hint">طول هر گلبرگ بازده آن استراتژی است. برای مقایسهٔ بیست‌وچند استراتژی، میلهٔ افقی صفحه را می‌کشد و این یکی همه را جا می‌دهد. گلبرگِ کوتاه یعنی زیان — عدد واقعی در راهنمای شناور است.</p>
      <div id="pb-rose" class="pb-chart pb-chart-lg"></div>
    </section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">پارتو</p><h2>چند استراتژی، چند درصد سود را ساختند؟</h2></div></div>
      <p class="pb-hint">اگر خط نارنجی زود به هشتاد درصد برسد، یعنی نتیجه به دو سه استراتژی وابسته است — و آن، تنوعِ روی کاغذ است نه واقعی.</p>
      <div id="pb-pareto" class="pb-chart pb-chart-lg"></div>
    </section>
    <div class="portfolio-report-grid">
      <section class="card"><div class="section-head"><div><p class="eyebrow">تنوع دروغین</p><h2>کدام استراتژی‌ها یک شرط‌بندی‌اند؟</h2></div><label class="pb-inline-pick">آستانهٔ همبستگی<select id="pb-graph-threshold"><option value="0.6">۰٫۶</option><option value="0.75" selected>۰٫۷۵</option><option value="0.9">۰٫۹</option></select></label></div>
        <p class="pb-hint">هر گره یک استراتژی است و خطی که دو گره را وصل می‌کند یعنی مسیرشان با هم می‌رود. خوشهٔ پرخط یعنی چند استراتژی که در عمل یک شرط‌بندی‌اند.</p>
        <div id="pb-graph" class="pb-chart pb-chart-lg"></div>
      </section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">ماتریس همبستگی</p><h2>زوج‌به‌زوج، چقدر شبیه‌اند</h2></div></div>
        <p class="pb-hint">آبی یعنی هم‌جهت، قرمز یعنی خلاف هم. قطر همیشه آبیِ پررنگ است چون هر استراتژی با خودش کاملاً هم‌جهت است.</p>
        <div id="pb-corr" class="pb-chart pb-chart-lg"></div>
      </section>
    </div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">درخت کاوش</p><h2>خانواده ← نوع ← استراتژی</h2></div><span>روی هر گره کلیک کن</span></div>
      <div id="pb-tree" class="pb-chart pb-chart-lg"></div>
    </section>
    <div class="portfolio-report-grid">
      <section class="card"><div class="section-head"><div><p class="eyebrow">جدول خانواده‌ها</p><h2>عدد خام هر خانواده</h2></div></div><div id="pb-parts-groups" class="history-table-wrap"></div></section>
      <section class="card"><div class="section-head"><div><p class="eyebrow">جدول شباهت</p><h2>شبیه‌ترین زوج‌ها</h2></div></div><div id="pb-parts-pairs" class="history-table-wrap"></div></section>
    </div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">جدول سهم سود</p><h2>پارتو، به عدد</h2></div></div><div id="pb-parts-pareto" class="history-table-wrap"></div></section>
  </div>

  <div class="pb-panel" data-panel="drill" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">ترکیب‌های واقعی</p><h2 id="pb-combo-title">برای مشاهده جزئیات یک استراتژی را انتخاب کن</h2></div><span>هر ردیف یک ترکیب قرارداد</span></div><div id="pb-combos" class="history-table-wrap"></div></section>
    <section id="pb-detail" class="portfolio-detail" hidden></section>
  </div>


  <div class="pb-panel" data-panel="lab" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">آزمایشگاه نمودار</p><h2>بازار از هفت زاویه</h2></div><span id="lab-count-note">—</span></div><p class="pb-hint">هفت دسته‌ای که کتابخانه‌های نموداری امروز مشترک دارند، هر کدام به سؤالی جواب می‌دهند که بقیه نمی‌دهند: <b>مقایسه</b> می‌گوید کدام بیشتر، <b>توزیع</b> می‌گوید چقدر قابل اتکا، <b>رابطه</b> می‌گوید چه با چه می‌آید، <b>زمان</b> می‌گوید کِی، <b>جریان</b> می‌گوید از کجا به کجا، و <b>انحراف</b> می‌گوید چقدر از معیار دور. روی هر بخش از هر نمودار کلیک کن تا کشوی جزئیات همان استراتژی از پایین باز شود.</p></section>
    <div id="lab-tabs"></div>
    <div class="pb-sub" data-panel="lab-compare" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">نمره</p><h2>لالی‌پاپ نمرهٔ ترکیبی</h2></div></div><p class="pb-hint">کوتاه‌ترین راه به «کدام بهتر». نقطه نمره است و خط، فاصله‌اش از صفر.</p><div id="lab-score" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">پایداری</p><h2>نیمهٔ دوره در برابر پایان</h2></div></div><p class="pb-hint">میلهٔ خاکستری وضعیت نیمهٔ راه است. اگر میلهٔ رنگی از آن جلو زده، استراتژی در نیمهٔ دوم قوی‌تر شده.</p><div id="lab-dumb" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">در برابر خانواده</p><h2>میلهٔ گلوله‌ای</h2></div></div><p class="pb-hint">خط عمودی، میانهٔ خانوادهٔ خودِ استراتژی است. میله‌ای که از آن رد نشده، حتی از هم‌خانواده‌هایش عقب مانده.</p><div id="lab-bullet" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">چگالی</p><h2>نمره روی محور قطبی</h2></div></div><p class="pb-hint">همان ترتیب نمره، در شکلی که استراتژی‌های بیشتری را در یک نگاه جا می‌دهد.</p><div id="lab-radial" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">شمارش</p><h2>ترکیب‌های هر خانواده</h2></div></div><p class="pb-hint">هر مستطیل یک ترکیب. خانواده‌ای با ترکیب‌های بسیار، شانس بیشتری برای برندهٔ تصادفی دارد.</p><div id="lab-count" class="pb-chart pb-chart-lg"></div></section></div>
    <div class="pb-sub" data-panel="lab-share" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">صد خانه</p><h2>وافل سهم خانواده‌ها</h2></div></div><p class="pb-hint">هر خانه یک درصد از ترکیب‌های معتبر. برای دیدن تمرکز، نه ترتیب.</p><div id="lab-waffle" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">سهم و اثر</p><h2>ماریمکو خانواده‌ها</h2></div></div><p class="pb-hint">عرض ستون سهم خانواده از ترکیب‌هاست و ارتفاعش میانهٔ بازدهش. ستون پهن و کوتاه یعنی شلوغی بی‌حاصل.</p><div id="lab-mekko" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">غربال</p><h2>از همه تا سودده</h2></div></div><p class="pb-hint">سه پله: همهٔ ترکیب‌ها، آن‌ها که مسیر معتبر داشتند، و آن‌ها که سود دادند.</p><div id="lab-funnel" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">سه پله</p><h2>آفتاب‌نمای خانواده و استراتژی</h2></div></div><p class="pb-hint">حلقهٔ درونی خانواده است و بیرونی استراتژی. کلیک روی هر بخش همان شاخه را باز می‌کند.</p><div id="lab-sun" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">نقشهٔ سطح</p><h2>درخت‌نقشهٔ خانواده‌ها</h2></div></div><p class="pb-hint">مساحت شمار ترکیب است و رنگ، میانهٔ بازده. خانهٔ بزرگِ قرمز بدترین حالت است.</p><div id="lab-treemap" class="pb-chart pb-chart-lg"></div></section></div>
    <div class="pb-sub" data-panel="lab-dist" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">شکل توزیع</p><h2>ریج‌لاین بازده خانواده‌ها</h2></div></div><p class="pb-hint">هر تپه توزیع بازده یک خانواده است. تپهٔ باریک یعنی نتیجهٔ قابل اتکا؛ تپهٔ پهن یعنی شانس.</p><div id="lab-ridge" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">تقارن</p><h2>ویولن خانواده‌ها</h2></div></div><p class="pb-hint">همان توزیع، آینه‌شده. شکل کج به بالا یعنی چند برندهٔ بزرگ و بقیه معمولی.</p><div id="lab-violin" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">خودِ داده</p><h2>ازدحام ترکیب‌ها</h2></div></div><p class="pb-hint">هر نقطه یک ترکیب واقعی است، نه خلاصه‌اش. نقطهٔ دورافتاده همان استثناست.</p><div id="lab-swarm" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">سود و زیان</p><h2>هیستوگرام پروانه‌ای</h2></div></div><p class="pb-hint">دو سوی محور، قدر مطلق یکسان دارند. اگر بال چپ بلندتر است، زیان‌ها بزرگ‌تر از سودها بوده‌اند.</p><div id="lab-fly" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">توزیع تجمعی</p><h2>مقایسهٔ خانواده‌ها</h2></div></div><p class="pb-hint">منحنی‌ای که زودتر بالا می‌رود یعنی آن خانواده بیشتر ترکیب ضعیف دارد.</p><div id="lab-ecdf" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">پراکندگی روزانه</p><h2>جعبه‌ای گام خانواده‌ها</h2></div></div><p class="pb-hint">جعبهٔ کوتاه یعنی روزهای یکنواخت؛ جعبهٔ بلند یعنی سواری پرتکان.</p><div id="lab-box" class="pb-chart pb-chart-lg"></div></section></div>
    <div class="pb-sub" data-panel="lab-rel" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">چگالی</p><h2>هگزبین بازده در برابر افت</h2></div></div><p class="pb-hint">وقتی نقطه‌ها روی هم می‌افتند، خانه‌ها را می‌شماریم نه نقطه‌ها را. خانهٔ پررنگ یعنی بیشتر ترکیب‌ها همان‌جا نشسته‌اند.</p><div id="lab-hex" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">برازش</p><h2>رگرسیون بازده بر افت</h2></div></div><p class="pb-hint">خط‌چین، انتظار است. نقطهٔ بالای خط یعنی بیش از آنچه ریسکش ایجاب می‌کرد بازده داده.</p><div id="lab-reg" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">جابه‌جایی</p><h2>رتبهٔ روز اول در برابر روز آخر</h2></div></div><p class="pb-hint">خط افقی یعنی رتبه ثابت مانده. خط پرشیب یعنی نتیجه در طول دوره وارونه شده.</p><div id="lab-slope" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">هم‌حرکتی</p><h2>ماتریس همبستگی استراتژی‌ها</h2></div></div><p class="pb-hint">دو استراتژی با همبستگی نزدیک یک، در واقع یک شرط‌بندی‌اند.</p><div id="lab-corr" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">چندسنجه‌ای</p><h2>مختصات موازی</h2></div></div><p class="pb-hint">هر خط یک استراتژی است که از همهٔ سنجه‌ها می‌گذرد. خط‌هایی که با هم می‌روند، رفتار مشابه دارند.</p><div id="lab-par" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">صدک سنجه‌ها</p><h2>نقشهٔ سنجه در برابر استراتژی</h2></div></div><p class="pb-hint">رنگ، صدک است نه خودِ عدد — وگرنه سنجه‌هایی با واحد متفاوت کنار هم بی‌معنا می‌شوند.</p><div id="lab-metric" class="pb-chart pb-chart-lg"></div></section></div>
    <div class="pb-sub" data-panel="lab-time" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">افق</p><h2>نوار زمانی همهٔ استراتژی‌ها</h2></div></div><p class="pb-hint">به‌جای سی خط روی هم، سی نوار رنگی. ستون یکدست قرمز یعنی آن روز همه با هم باختند.</p><div id="lab-horizon" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">مسابقه</p><h2>مسیر تجمعی، از ورود تا پایان</h2></div></div><p class="pb-hint">برای دیدن اینکه هر استراتژی کِی از بقیه جدا شد.</p><div id="lab-race" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">جریان</p><h2>رودخانهٔ ترکیب‌های سودده</h2></div></div><p class="pb-hint">ضخامت هر جریان، شمار ترکیب‌های سودده آن خانواده در همان روز است.</p><div id="lab-river" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">رویدادها</p><h2>بهترین و بدترین روز هر خانواده</h2></div></div><p class="pb-hint">اندازهٔ نقطه شدت آن روز است. نقاط هم‌ردیف یعنی یک تکانهٔ مشترک بازار.</p><div id="lab-timeline" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">بستر بازار</p><h2>تقویم گام نماد پایه</h2></div></div><p class="pb-hint">بازار خودش چه می‌کرد. بی این، هر قضاوتی دربارهٔ استراتژی‌ها بی‌بستر است.</p><div id="lab-cal" class="pb-chart pb-chart-lg"></div></section></div>
    <div class="pb-sub" data-panel="lab-flow" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">نتیجه</p><h2>سنکی خانواده به نتیجه</h2></div></div><p class="pb-hint">پهنای هر نوار شمار ترکیب است. نواری که به «زیان‌ده» می‌رود هم دیده می‌شود.</p><div id="lab-sankey" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">چرخ</p><h2>هم‌حرکتی خانواده‌ها</h2></div></div><p class="pb-hint">کمانِ ضخیم میان دو خانواده یعنی با هم بالا و پایین رفته‌اند — تنوعی در کار نیست.</p><div id="lab-chord" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">شبکه</p><h2>خوشهٔ شباهت استراتژی‌ها</h2></div></div><p class="pb-hint">استراتژی‌هایی که با هم حرکت می‌کنند به هم نزدیک می‌نشینند. خوشهٔ بزرگ یعنی تنوع ظاهری.</p><div id="lab-graph" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">سلسله‌مراتب</p><h2>درخت خانواده و استراتژی</h2></div></div><p class="pb-hint">برای رفتن از کل به جزء با چشم. کلیک روی هر گره، شاخه‌اش را باز و بسته می‌کند.</p><div id="lab-tree" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">سلامت بازه</p><h2>چند درصد ترکیب‌ها سود دادند</h2></div></div><p class="pb-hint">اگر این عدد پایین است، ضعف یک استراتژی لزوماً تقصیر خودش نیست.</p><div id="lab-gauge" class="pb-chart pb-chart-lg"></div></section></div>
    <div class="pb-sub" data-panel="lab-dev" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">سهم خانواده‌ها</p><h2>آبشار میانهٔ بازده</h2></div></div><p class="pb-hint">هر ستون یک خانواده. ستون‌های قرمز آنچه را سبزها ساخته‌اند پس می‌گیرند.</p><div id="lab-fall" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">فاصله از میانه</p><h2>میلهٔ واگرا</h2></div></div><p class="pb-hint">صفر، میانهٔ همهٔ استراتژی‌هاست. طول میله می‌گوید چقدر از متوسط بازار فاصله گرفته.</p><div id="lab-div" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">مازاد بر بازار</p><h2>فاصله از نماد پایه در طول زمان</h2></div></div><p class="pb-hint">بالای خط‌چین یعنی بهتر از خودِ سهم. استراتژی‌ای که همیشه زیر خط است، ارزش دردسرش را نداشته.</p><div id="lab-excess" class="pb-chart pb-chart-lg"></div></section></div>
  </div>

  <div class="pb-panel" data-panel="basket" hidden>
    <section class="card"><div class="section-head"><div><p class="eyebrow">سبد فرضی</p><h2>سرمایهٔ اول دوره را بین استراتژی‌ها تقسیم کن</h2></div><button type="button" class="primary" id="pb-basket-run">ساخت سبد</button></div>
      <div class="portfolio-form"><label>سرمایهٔ اول دوره (میلیون ریال)<input id="pb-basket-capital" type="number" min="1" step="1" value="1000"></label></div>
      <div id="pb-basket-rows" class="pb-basket-rows"></div>
      <div class="pb-basket-foot">
        <button type="button" class="ghost" id="pb-basket-add">افزودن استراتژی به سبد</button>
        <p class="pb-basket-tally" id="pb-basket-tally" data-tone="ok"></p>
      </div>
      <p class="portfolio-note" id="pb-basket-note">این تب فقط از همین مبلغ کار می‌کند: سهم هر استراتژی را می‌گیرد و خودش می‌شمارد چند قرارداد می‌خرد. «تعداد واحد» تب راه‌اندازی در این شمارش دخالت ندارد. باقی‌ماندهٔ هر سهم که به یک قرارداد کامل نرسد نقد می‌ماند و در ارزش سبد شمرده می‌شود.</p>
    </section>
    <div class="backtest-kpis" id="pb-basket-kpis"></div>
    <div id="bk-tabs" hidden></div>
    <div class="pb-sub" data-panel="bk-mix" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">تخصیص</p><h2>وافل سرمایه — هر خانه یک درصد</h2></div></div><p class="pb-hint">صد خانه، صد درصد سرمایه. خانهٔ خاکستری یعنی نقدِ تخصیص‌نیافته.</p><div id="bk-waffle" class="pb-chart pb-chart"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">غربال</p><h2>از سرمایه تا ارزش پایانی</h2></div></div><p class="pb-hint">سه پله: آنچه داشتی، آنچه واقعاً درگیر شد، و آنچه ماند.</p><div id="bk-funnel" class="pb-chart pb-chart"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">جریان سرمایه</p><h2>پول از کجا به کجا رفت</h2></div></div><p class="pb-hint">پهنای هر نوار، مقدار پول است. جزئی که ارزش پایانی مثبت ندارد، جریانی از آن بیرون نمی‌رود.</p><div id="bk-flow" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">لایه‌ها</p><h2>خانواده ← استراتژی ← ترکیب</h2></div></div><p class="pb-hint">هر حلقه یک پله ریزتر. کلیک روی هر بخش، همان شاخه را باز می‌کند.</p><div id="bk-sun" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">وزن و نتیجه</p><h2>درخت‌نقشهٔ پول درگیر</h2></div></div><p class="pb-hint">مساحت هر خانه پول درگیر است و رنگش بازده همان جزء.</p><div id="bk-tree" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">هدف و واقعیت</p><h2>بودجهٔ هدف در برابر پول درگیر</h2></div></div><p class="pb-hint">فاصلهٔ دو میله، پولی است که به یک قرارداد کامل نرسید و نقد ماند.</p><div id="bk-dumb" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">سهم و اثر</p><h2>ماریمکو: عرض سهم، ارتفاع بازده</h2></div></div><p class="pb-hint">ستون پهن و کوتاه یعنی پول زیاد با بازده کم — بدترین ترکیب برای سبد.</p><div id="bk-mek" class="pb-chart pb-chart-lg"></div></section></div>
    <div class="pb-sub" data-panel="bk-path" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">مسیر ارزش سبد</p><h2>از سرمایهٔ اول دوره تا پایان</h2></div></div><p class="pb-hint">سایهٔ کم‌رنگ، بازهٔ بیشترین افت است. با غلتاندن روی نمودار می‌توانی بزرگ‌نمایی کنی.</p><div id="bk-equity" class="pb-chart pb-chart-xl"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">ریتم</p><h2>بازده گام‌به‌گام سبد</h2></div></div><p class="pb-hint">هر میله یک دوره. رشتهٔ میله‌های هم‌رنگ یعنی روند، نه شانس.</p><div id="bk-step" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">پایداری</p><h2>نرخ برد غلتان پنج دوره‌ای</h2></div></div><p class="pb-hint">بالای خط‌چین یعنی در آن پنجره بیشتر دوره‌ها مثبت بوده‌اند.</p><div id="bk-roll" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">توزیع</p><h2>هیستوگرام گام‌های سبد</h2></div></div><p class="pb-hint">شکل توزیع مهم‌تر از میانگین است: دم بلندِ چپ یعنی زیان‌های نادر ولی بزرگ.</p><div id="bk-hist" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">توزیع تجمعی</p><h2>چند درصد دوره‌ها از این بدتر بودند</h2></div></div><p class="pb-hint">برای خواندن: یک عدد روی محور افقی بگیر، ارتفاع منحنی می‌گوید چند درصد دوره‌ها بدتر یا برابر بودند.</p><div id="bk-ecdf" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">تقویم</p><h2>گام هر روز، روی تقویم</h2></div></div><p class="pb-hint">برای دیدن الگوی زمانی — سه روز بد پشت هم، یا همیشه اول هفته.</p><div id="bk-cal" class="pb-chart pb-chart-lg"></div></section></div>
    <div class="pb-sub" data-panel="bk-vs" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">منحنی سود و زیان</p><h2>بازده سبد در برابر قیمت نماد پایه</h2></div><label class="pb-inline-pick">پلهٔ قیمت<select id="bk-payoff-bins"><option value="0">بی‌میانگین</option><option value="12">۱۲ پله</option><option value="24" selected>۲۴ پله</option><option value="48">۴۸ پله</option></select></label></div>
      <p class="pb-hint">محور افقی قیمت نماد پایه است و محور عمودی بازده سبد. نقطه‌ها به ترتیب زمان به هم وصل‌اند و رنگشان از کم‌رنگ (اول دوره) به پررنگ (آخر دوره) می‌رود، چون یک قیمت چند بار تکرار می‌شود و هر بار بازده دیگری دارد. دانهٔ زمان را از «دانه‌بندی زمان» در مرحلهٔ راه‌اندازی عوض کن: از روزانه تا یک‌دقیقه‌ای، همین نمودار ریزتر می‌شود.</p>
      <div id="bk-payoff" class="pb-chart pb-chart-xl"></div>
      <p class="portfolio-note" id="bk-payoff-note"></p></section><section class="card"><div class="section-head"><div><p class="eyebrow">در برابر بازار</p><h2>سبد فرضی در برابر نماد پایه</h2></div></div><p class="pb-hint">هر دو از صفر شروع می‌شوند. میلهٔ پایین، مازاد سبد بر نماد پایه در همان دوره است.</p><div id="bk-versus" class="pb-chart pb-chart-xl"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">ضبط بازار</p><h2>در صعود چند گرفتیم، در نزول چند خوردیم</h2></div></div><p class="pb-hint">زیر صد در نزول یعنی کمتر از بازار آسیب دیدی — گاهی از بازده بیشتر مهم‌تر است.</p><div id="bk-capture" class="pb-chart pb-chart"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">حکم</p><h2>بازده سبد در برابر نماد پایه</h2></div></div><p class="pb-hint">عقربهٔ رنگی سبد است و عقربهٔ خاکستری نماد پایه.</p><div id="bk-gauge" class="pb-chart pb-chart"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">الگوی هفتگی</p><h2>میانگین گام در هر روز هفته</h2></div></div><p class="pb-hint">اگر همهٔ ستون‌ها هم‌اندازه‌اند، الگوی هفتگی‌ای در کار نیست.</p><div id="bk-weekday" class="pb-chart pb-chart"></div></section></div>
    <div class="pb-sub" data-panel="bk-members" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">رفتار اعضا</p><h2>مسیر تجمعی هر عضو</h2></div></div><p class="pb-hint">هر خط یک عضو، روی سرمایهٔ درگیر خودش. عضوی که آخر سربه‌سر است شاید وسط راه نصف شده باشد.</p><div id="bk-mpath" class="pb-chart pb-chart-xl"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">سهم در طول زمان</p><h2>سود انباشتهٔ اعضا</h2></div></div><p class="pb-hint">ضخامت هر لایه، سهم همان عضو از سود آن دوره است.</p><div id="bk-mstack" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">جابه‌جایی رتبه</p><h2>چه کسی کِی جلو افتاد</h2></div></div><p class="pb-hint">محور وارونه است: بالا یعنی رتبهٔ بهتر. خط پرنوسان یعنی بردش شانسی بوده.</p><div id="bk-mbump" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">گام هر عضو</p><h2>نقشهٔ حرارتی عضو در برابر دوره</h2></div></div><p class="pb-hint">ستون یکدست قرمز یعنی آن دوره همه با هم باختند — یعنی تنوع سبد کار نکرده.</p><div id="bk-mheat" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">درد هر عضو</p><h2>افت هر عضو از سقف خودش</h2></div></div><p class="pb-hint">عمق هر ناحیه، بدترین عقب‌نشینی آن عضو تا آن لحظه است.</p><div id="bk-mdd" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">نیمهٔ اول و دوم</p><h2>چه کسی در نیمهٔ دوم قوی‌تر شد</h2></div></div><p class="pb-hint">خط بالارونده یعنی عضو در نیمهٔ دوم بهتر شد؛ پایین‌رونده یعنی سوختِ اولش تمام شد.</p><div id="bk-slope" class="pb-chart pb-chart-lg"></div></section></div>
    <div class="pb-sub" data-panel="bk-risk" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">ریسک و بازده</p><h2>هر عضو، یک حباب</h2></div></div><p class="pb-hint">اندازهٔ حباب پول درگیر است. بالا و راست بهتر: بازده بیشتر با افت کمتر.</p><div id="bk-risk" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">تنوع واقعی</p><h2>همبستگی گام اعضا</h2></div></div><p class="pb-hint">دو عضو با همبستگی نزدیک یک، تنوع نمی‌سازند — هرچند اسمشان فرق کند.</p><div id="bk-corr" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">سهم از ریسک</p><h2>سهم از سرمایه در برابر سهم از نوسان</h2></div></div><p class="pb-hint">عضوی که میلهٔ نوسانش بلندتر از میلهٔ سرمایه‌اش است، بیش از سهمش ریسک می‌آورد.</p><div id="bk-riskshare" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">پراکندگی</p><h2>جعبه‌ای گام روزانهٔ هر عضو</h2></div></div><p class="pb-hint">طول جعبه یعنی بی‌ثباتی. جعبهٔ کوتاهِ بالا، بهترین حالت است.</p><div id="bk-box" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">ازدحام</p><h2>هر نقطه یک دوره</h2></div></div><p class="pb-hint">برای دیدن خودِ داده‌ها، نه خلاصه‌شان: نقاط دورافتاده همان روزهای استثنایی‌اند.</p><div id="bk-swarm" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">چهار سنجه</p><h2>رادار اعضا</h2></div></div><p class="pb-hint">شکل بزرگ‌تر بهتر است؛ شکل کج یعنی عضو در یک بعد قوی و در بقیه ضعیف.</p><div id="bk-radar" class="pb-chart pb-chart-lg"></div></section></div>
    <div class="pb-sub" data-panel="bk-shape" hidden><section class="card"><div class="section-head"><div><p class="eyebrow">آبشار</p><h2>از سرمایه، جزء به جزء، تا ارزش پایانی</h2></div></div><p class="pb-hint">هر ستون یک عضو. ستون‌های قرمز آنچه را ستون‌های سبز ساخته‌اند پس می‌گیرند.</p><div id="bk-fall" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">چه کسی سود را ساخت</p><h2>سهم هر عضو از سود کل</h2></div></div><p class="pb-hint">عضوی که تنها سود را ساخته یعنی سبد در واقع تک‌پایه بوده.</p><div id="bk-lolli" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">خانواده‌ها</p><h2>حباب‌های هم‌خانواده</h2></div></div><p class="pb-hint">اندازهٔ حباب پول درگیر است و رنگ، خانواده. برای دیدن تمرکز سبد روی یک خانواده.</p><div id="bk-bubble" class="pb-chart pb-chart-lg"></div></section><section class="card"><div class="section-head"><div><p class="eyebrow">جدول اجزا</p><h2>هر جزء با عدد کاملش</h2></div><span id="pb-sankey-note"></span></div><p class="pb-hint">کلیک روی هر ردیف، کشوی جزئیات همان ترکیب را باز می‌کند.</p><div id="pb-basket-table" class="history-table-wrap"></div></section></div>
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
  let heatMode = DEFAULT_HEATMAP_MODE, heatSort = 'score', heatPalette = 'signed';
  // دانه‌بندی انتخابی، و ماتریسِ روزانهٔ اصلی که با بازگشت به «روزانه»
  // دوباره سر جایش می‌نشیند. بدون نگه‌داشتنش، برگشتن از حالت درون‌روزی
  // یعنی اجرای دوباره.
  let grain = DEFAULT_GRAIN, dailyMatrix = null, dailyRows = [];
  let metricWeights = Object.fromEntries(METRICS.map((row) => [row.id, row.weight]));
  let trendPick = [], basketPicks = [], calendarPick = '', bandPick = '';
  /**
   * کتابخانهٔ اجرا — هر اجرای کامل‌شده اینجا می‌ماند.
   *
   * سبد فرضی از همین می‌خواند، پس می‌شود روی یک نماد اسپرد عمودی گذاشت و
   * روی نماد دیگر خفه‌کن. تحلیل هر اجرا با **عدسی جاری** بازساخته می‌شود تا
   * همهٔ اجزای سبد روی یک مبنا سنجیده شوند، نه هر کدام با مبنای روزِ خودش.
   */
  let runs = [];
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
    { id: 'parts', label: 'کل به جزء', hint: 'ترکیب سبد، از خانواده تا یک ترکیب' },
    { id: 'drill', label: 'کاوش', hint: 'از کل تا یک ترکیب' },
    { id: 'basket', label: 'سبد فرضی', hint: 'تخصیص سرمایه' },
    { id: 'lab', label: 'آزمایشگاه نمودار', hint: 'بازار از هفت زاویه' },
  ];

  /**
   * برچسب یک ستون — روز یا لحظه.
   *
   * در حالت درون‌روزی، ستون‌ها کلیدِ «تاریخ و ثانیه»‌اند. نمایش‌دادنشان
   * به‌شکل تاریخ، عددی چهارده‌رقمی می‌داد که هیچ‌کس نمی‌خواندش.
   */
  const columnLabel = (value) => (isIntradayGrain(grain)
    ? `${dateLabel(momentDate(value))} ${momentLabel(momentSecond(value))}`
    : dateLabel(value));
  const labelsOf = () => (analysis?.dates || []).map(columnLabel);
  const pctCell = (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—');
  const numCellOf = (value) => (Number.isFinite(value) ? fmt.num(value) : '—');

  const status = $('pb-status'), baseSelect = $('pb-base'), entryRail = $('pb-entry-basis'), exitRail = $('pb-exit-basis');
  let comboFilter = null;
  let chain = new Map(), ua = null, seriesByIns = {}, seriesErrors = {}, seriesSource = {}, baseDates = [], generated = [], census = null, activeWorker = null, selectedStrategyId = '';
  let settingsEpoch = 0;
  // تاریخچه با فهرست قراردادهای همان لحظه بارگیری می‌شود. اگر سررسیدی هنگام
  // بارگیری سقف‌پر بوده باشد، سری قراردادهایش اصلاً در `seriesByIns` نیست؛
  // پس صرفاً اجرای دوباره نمی‌تواند آن را بعد از برداشتن تیک برگرداند.
  // این دو پرچم بارگیری را تک‌مسیره می‌کنند و تغییر هم‌زمان تیک را برای یک
  // دور تازه صف می‌گذارند، تا پاسخ قدیمی روی انتخاب تازه ننشیند.
  let historyLoading = false, historyReloadRequested = false;
  // سری‌هایی که **آخرین اجرا** با آن‌ها انجام شد. با پایان روز، همان
  // `seriesByIns` است؛ با لحظهٔ درون‌روز، نسخهٔ مهرخورده. پنل جزئیات و
  // تحلیل حساسیت باید از همین بخوانند، وگرنه رتبه‌بندی ساعت ده و نیم را
  // می‌گوید و جزئیاتِ همان ردیف، پایان روز را — و هیچ‌کدام غلط به نظر
  // نمی‌رسد.
  let runSeriesByIns = {};
  // روز جاریِ چسبانده‌شده. صفر یعنی همه‌چیز بسته‌شده است.
  let liveDate = 0;
  // محدودهٔ هر قید. خالی یعنی خاموش؛ هیچ قیدی پیش‌فرض روشن نیست، چون
  // پالایهٔ روشنِ نادیده بدتر از نبودنِ پالایه است.
  let comboRanges = {};
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
    // یک بارگیریِ در حال اجرا قطع نمی‌شود؛ دور تازه پشت همان بارگیری می‌آید.
    // این حالت دقیقاً وقتی رخ می‌دهد که کاربر وسط دریافت، تیک سررسید را عوض
    // کند. دو درخواست موازی می‌توانستند به ترتیب وارونه تمام شوند.
    if (historyLoading) { historyReloadRequested = true; return; }
    historyLoading = true;
    $('pb-load').disabled = true;
    try {
      do {
        historyReloadRequested = false;
        // ممکن است تیک سقف سررسید در تب یا پنجرهٔ دیگری عوض شده باشد. پیش از
        // ساخت فهرست ابزار، تنظیم قطعی سرور خوانده می‌شود.
        await api.loadSettings();
        ua = chain.get(baseSelect.value);
        if (!ua) { setStatus('ابتدا نماد پایه را انتخاب کن.', true); return; }
        const contracts = flattenActiveContracts(ua, state.settings.blockedExpiries);
        const codes = [...new Set([String(ua.ins), ...contracts.map((contract) => String(contract.ins))])];
        hideReport();
        setStatus(`دریافت تاریخچه ${fmt.int(codes.length)} نماد…`);
        try {
          const payloads = await Promise.all(chunks(codes, 70).map(async (part) => {
            const response = await fetch(`/api/dailies?ins=${part.join(',')}&n=0`), payload = await response.json();
            if (!response.ok || payload.error) throw new Error(payload.error || 'تاریخچه دریافت نشد');
            return payload;
          }));
          seriesByIns = {};
          runSeriesByIns = {};
          // خطای هر ابزار جدا نگه داشته می‌شود. پیش از این `value.rows || []`
          // خطا را به «صفر ردیف» تبدیل می‌کرد و آن‌وقت «درخواست شکست خورد» از
          // «هیچ روزی معامله نشده» قابل تشخیص نبود — دو چیزِ کاملاً متفاوت.
          seriesErrors = {};
          seriesSource = {};
          for (const payload of payloads) {
            for (const [ins, value] of Object.entries(payload)) {
              seriesByIns[ins] = value.rows || [];
              seriesSource[ins] = value.source || 'list';
              if (value.error) seriesErrors[ins] = String(value.error);
            }
          }

          // ── منبع دوم، فقط برای آنچه خالی برگشت ────────────────────────────
          //
          // `GetClosingPriceDailyList` برای ابزارِ حذف‌شده از تابلو خالی
          // برمی‌گردد، و قرارداد اختیار پس از سررسید حذف می‌شود. یعنی هر
          // بک‌تستِ گذشته دقیقاً همان قراردادهایی را از دست می‌داد که
          // موضوعش بودند.
          //
          // تاریخِ منبع دوم حدس زده نمی‌شود: آخرین روزِ سریِ خودِ نماد پایه
          // است، که قطعاً یک روز معاملاتیِ تکمیل‌شده است.
          const baseSeries = seriesByIns[String(ua.ins)] || [];
          const asOf = baseSeries.length
            ? Math.max(...baseSeries.map((row) => normalizeHistoryDate(row.date)).filter(Boolean))
            : 0;
          const emptyCodes = codes.filter((code) => !(seriesByIns[code] || []).length && !seriesErrors[code]);
          if (asOf && emptyCodes.length) {
            setStatus(`${fmt.int(emptyCodes.length)} ابزار از فهرست روزانه خالی برگشت — منبع دوم…`);
            const retries = await Promise.all(chunks(emptyCodes, 70).map(async (part) => {
              const response = await fetch(`/api/dailies?ins=${part.join(',')}&n=0&asOf=${asOf}`);
              const payload = await response.json();
              if (!response.ok || payload.error) throw new Error(payload.error || 'منبع دوم پاسخ نداد');
              return payload;
            }));
            for (const payload of retries) {
              for (const [ins, value] of Object.entries(payload)) {
                if ((value.rows || []).length) seriesByIns[ins] = value.rows;
                seriesSource[ins] = value.source || seriesSource[ins] || 'list';
                if (value.fallbackError) seriesErrors[ins] = String(value.fallbackError);
              }
            }
          }
          // روز جاری پس از فهرست بسته‌شده می‌نشیند، نه به‌جای آن. اگر نچسبد،
          // همان سری‌های بسته‌شده برمی‌گردند و رفتار دقیقاً قبلی می‌ماند.
          await applyScope();
          baseDates = (seriesByIns[String(ua.ins)] || []).map((row) => normalizeHistoryDate(row.date)).filter(Boolean).sort((a, b) => a - b);
          if (!baseDates.length) throw new Error('برای نماد پایه تاریخچه‌ای دریافت نشد');
          $('pb-work').hidden = false; refreshDates();
          setStatus(`${fmt.int(baseDates.length)} روز معاملاتی آماده است.`);
        } catch (error) { setStatus(errorText(error, 'تاریخچه دریافت نشد.'), true); }
      } while (historyReloadRequested);
    } finally {
      historyLoading = false;
      $('pb-load').disabled = false;
    }
  }

  function runWorker(message) {
    activeWorker?.terminate();
    activeWorker = new Worker('/worker/history-worker.mjs', { type: 'module' });
    return new Promise((resolve, reject) => {
      activeWorker.onmessage = (event) => {
        const payload = event.data;
        if (payload.id !== message.id) return;
        if (payload.type === 'portfolio-intraday-progress') {
          setStatus(`قیمت‌گذاری لحظه‌ها: ${fmt.int(payload.done)} از ${fmt.int(payload.total)} · ${fmt.int(payload.priced)} قیمت معتبر`);
        } else if (payload.type === 'portfolio-intraday') resolve(payload);
        else if (payload.type === 'portfolio-progress') {
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
    // برچسب از `columnLabel` می‌آید نه `dateLabel`: کلیدِ لحظه چهارده‌رقمی
    // است و تقویم جلالی رویش «—» می‌دهد، پس فهرست بازه بی‌برچسب می‌شد.
    const options = (selected) => dates
      .map((date) => `<option value="${date}"${Number(selected) === date ? ' selected' : ''}>${esc(columnLabel(date))}</option>`)
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
    return [
      analysis.basis.short,
      analysis.statisticLabel,
      analysis.weighting === 'equal' ? 'هم‌وزن' : 'وزن ارزش',
      isIntradayGrain(grain) ? `${fmt.int(analysis.range.days)} لحظه` : `${fmt.int(analysis.range.days)} روز`,
      analysis.range.from ? `${columnLabel(analysis.range.from)} تا ${columnLabel(analysis.range.to)}` : '',
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
      `${fmt.int(analysis.range.days)} ${isIntradayGrain(grain) ? 'لحظهٔ' : 'روز'} معتبر، ${fmt.int(analysis.usable)} ترکیب.`,
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
    // پالایه روی **ورودی** می‌نشیند، نه روی یک جدول. وگرنه رتبه‌بندی و
    // نمودارها و خروجی اکسل هر کدام عدد خودشان را می‌دادند.
    //
    // ماتریس با همان اندیس‌ها بریده می‌شود: ردیف‌ها را با اندیس
    // می‌شناسد و برشِ نامتقارن، مسیر روزانهٔ هر ردیف را به ردیف دیگری
    // می‌چسباند بی‌آنکه خطایی بدهد.
    comboFilter = applyComboFilter(payloadRows, comboRanges);
    const matrix = comboFilter.indexes
      ? selectMatrixRows(payloadMatrix, comboFilter.indexes)
      : payloadMatrix;
    analysis = analyzePortfolio({
      rows: comboFilter.rows, matrix,
      basisId: lens.basisId, statistic: lens.statistic, weighting: lens.weighting,
      from: lens.from, to: lens.to, weights: metricWeights,
    });
    paintFilterNote();
    if (!trendPick.length) trendPick = analysis.strategies.slice(0, 4).map((row) => row.strategyId);
    paintLensNote();
    paintHero();
    for (const tab of PB_TABS) if (tab.id !== 'setup') dirty.add(tab.id);
    paintPanel(tabsApi?.current || 'overview');
  }

  /**
   * شبکهٔ قیدها — یک بار ساخته می‌شود و بعد فقط مقدارها خوانده می‌شوند.
   *
   * `input` به‌جای `change` گوش داده می‌شود ولی با تأخیر، چون هر تغییر
   * کل تحلیل را از نو می‌سازد و تایپِ «۱۰۰۰۰۰» پنج بار اجرایش می‌کرد.
   */
  function mountFilters() {
    const host = $('pb-filter-grid');
    if (!host || host.dataset.ready) return;
    host.dataset.ready = '1';
    host.innerHTML = FILTER_FIELDS.map((f) => `
      <div class="pb-filter-cell">
        <label for="pbf-${f.id}-min">${esc(f.label)}${f.unit ? ` <small>${esc(f.unit)}</small>` : ''}</label>
        <div class="pb-filter-pair">
          <input type="number" id="pbf-${f.id}-min" data-field="${f.id}" data-edge="min" placeholder="از" step="any">
          <input type="number" id="pbf-${f.id}-max" data-field="${f.id}" data-edge="max" placeholder="تا" step="any">
        </div>
        ${f.hint ? `<small class="pb-filter-hint">${esc(f.hint)}</small>` : ''}
      </div>`).join('');

    let timer = 0;
    host.addEventListener('input', (event) => {
      const el = event.target.closest('input[data-field]');
      if (!el) return;
      const id = el.dataset.field, edge = el.dataset.edge;
      const raw = el.value.trim();
      const next = { ...(comboRanges[id] || {}) };
      next[edge] = raw === '' ? null : Number(raw);
      if (next.min == null && next.max == null) delete comboRanges[id];
      else comboRanges[id] = next;
      clearTimeout(timer);
      timer = setTimeout(() => { if (payloadMatrix) recompute(); }, 250);
    });
    $('pb-filter-clear').onclick = () => {
      comboRanges = {};
      for (const el of host.querySelectorAll('input[data-field]')) el.value = '';
      if (payloadMatrix) recompute();
    };
  }

  function paintFilterNote() {
    const el = $('pb-filter-note');
    if (el) el.textContent = comboFilter ? filterNote(comboFilter) : '';
  }

  function paintHero() {
    if (!analysis?.best) { $('pb-hero-verdict').textContent = 'نتیجه‌ای برای رتبه‌بندی نیست'; return; }
    $('pb-hero-verdict').textContent = `بهترین: ${analysis.best.strategyName} · بدترین: ${analysis.worst?.strategyName || '—'}`;
  }

  /** پنل دیده‌شده را رسم می‌کند؛ بقیه تا دیده‌نشدن دست‌نخورده می‌مانند. */
  function paintPanel(id) {
    // پیش از هر تعویض پنل، انیمیشن‌های در جریان می‌خوابند: نمودار پنهان
    // نباید نخِ اصلی را نگه دارد.
    charts.stopAll();
    // شبکهٔ قیدها پیش از `dirty` سوار می‌شود: پنلِ تازه‌سازی‌نشده هم باید
    // ورودی‌هایش را داشته باشد، وگرنه بار اول خالی باز می‌شود.
    if (id === 'ranking') mountFilters();
    if (!analysis || !dirty.has(id)) { charts.resizeAll(); return; }
    dirty.delete(id);
    if (id === 'overview') paintOverview();
    else if (id === 'ranking') paintRanking();
    else if (id === 'heatmap') paintHeatmapPanel();
    else if (id === 'trend') paintTrend();
    else if (id === 'metrics') paintMetrics();
    else if (id === 'distribution') paintDistribution();
    else if (id === 'parts') paintParts();
    else if (id === 'drill') paintDrill();
    else if (id === 'basket') paintBasket();
    else if (id === 'lab') paintLab();
  }

  // ═══════════════════ کشوی جزئیات ═══════════════════
  //
  // یک مسیر برای همهٔ نمودارها. سیزده نمودار با سیزده رفتارِ کلیک، یعنی
  // کاربر باید یاد بگیرد کدام‌شان چه می‌کند — و همان چیزی است که صفحهٔ پر
  // از نمودار را ترسناک می‌کند.
  //
  // کشو پایین صفحه می‌نشیند و جای کاربر را در تبِ خودش نگه می‌دارد؛
  // پریدن به تب دیگر برای دیدن یک عدد، رشتهٔ فکر را پاره می‌کند.

  const DRAWER_VIEWS = [
    { id: 'metrics', label: 'سنجه‌ها' },
    { id: 'combos', label: 'ترکیب‌ها' },
    { id: 'path', label: 'مسیر گام‌به‌گام' },
  ];
  let drawerStrategy = '', drawerView = 'metrics';

  function openDetail(strategyId) {
    if (!analysis) return;
    const row = analysis.strategies.find((item) => item.strategyId === strategyId);
    if (!row) return;
    drawerStrategy = strategyId;
    selectedStrategyId = strategyId;
    root.querySelectorAll('[data-strategy]').forEach((node) => node.classList.toggle('selected', node.dataset.strategy === strategyId));
    $('pb-drawer').hidden = false;
    $('pb-drawer-title').textContent = `${row.strategyName} · ${row.groupName} · رتبه ${fmt.int(row.rank)}`;
    $('pb-drawer-tabs').innerHTML = DRAWER_VIEWS.map((view) => `<button type="button" data-drawer-view="${view.id}" aria-selected="${view.id === drawerView}">${esc(view.label)}</button>`).join('');
    paintDrawerBody(row);
  }

  function paintDrawerBody(row) {
    const host = $('pb-drawer-body');
    if (drawerView === 'combos') {
      const combos = combosFor({ analysis }, row.strategyId, lens.basisId)
        .slice()
        .sort((a, b) => (b.series.finalPct ?? -Infinity) - (a.series.finalPct ?? -Infinity));
      const bound = heatScale(combos.map((combo) => combo.series.finalPct));
      host.innerHTML = combos.length
        ? `<div class="history-table-wrap"><table class="history-table portfolio-small-table"><thead><tr><th>رتبه</th><th>ترکیب</th><th>مخرج</th><th>سود/زیان</th><th>بازده</th><th>بیشترین افت</th><th>گام تا نخستین سود</th></tr></thead><tbody>${
          combos.map((combo, index) => {
            const band = heatLevel(combo.series.finalPct, bound);
            return `<tr data-tone="${band.tone}" data-level="${band.level ?? ''}" data-result="${esc(combo.id)}" tabindex="0"><td>${fmt.int(index + 1)}</td><td>${esc(comboName(combo))}</td><td>${fmt.money(combo.series.denominator)}</td><td class="${signTone(combo.series.finalPnl)}">${fmt.money(combo.series.finalPnl)}</td><td class="${signTone(combo.series.finalPct)}">${pctCell(combo.series.finalPct)}</td><td class="${signTone(combo.series.maxDrawdownPct)}">${pctCell(combo.series.maxDrawdownPct)}</td><td>${combo.series.firstProfitIndex === null ? 'رخ نداد' : fmt.int(combo.series.firstProfitIndex)}</td></tr>`;
          }).join('')}</tbody></table></div>`
        : '<p class="empty-note">هیچ ترکیبی از این استراتژی روی مبنای انتخابی معتبر نیست.</p>';
      host.onclick = (event) => {
        const line = event.target.closest('[data-result]');
        if (!line) return;
        const combo = analysis.combos.find((item) => item.id === line.dataset.result);
        if (combo) { dirty.delete('drill'); tabsApi?.show('drill'); showDetail(rawRow(combo)); }
      };
      return;
    }
    if (drawerView === 'path') {
      const bound = heatScale(row.path.cumulative);
      host.innerHTML = `<div class="history-table-wrap"><table class="history-table portfolio-small-table"><thead><tr><th>گام</th><th>زمان</th><th>بازده تجمعی</th><th>تغییر همان گام</th><th>افت از سقف</th><th>نرخ برد</th><th>رتبه</th><th>نمونه</th></tr></thead><tbody>${
        analysis.dates.map((date, column) => {
          const band = heatLevel(row.path.cumulative[column], bound);
          return `<tr data-tone="${band.tone}" data-level="${band.level ?? ''}"><td>${fmt.int(column)}</td><td>${esc(columnLabel(date))}</td><td class="${signTone(row.path.cumulative[column])}">${pctCell(row.path.cumulative[column])}</td><td class="${signTone(row.path.step[column])}">${pctCell(row.path.step[column])}</td><td class="${signTone(row.path.drawdown[column])}">${pctCell(row.path.drawdown[column])}</td><td>${pctCell(row.path.winPct[column])}</td><td>${row.path.rank[column] === null ? '—' : fmt.int(row.path.rank[column])}</td><td>${fmt.int(row.path.samples[column])}</td></tr>`;
        }).join('')}</tbody></table></div>`;
      host.onclick = null;
      return;
    }
    host.innerHTML = `<div class="history-table-wrap"><table class="history-table portfolio-small-table"><thead><tr><th>سنجه</th><th>مقدار</th><th>جهت</th><th>وزن در نمره</th><th>سهم از نمره</th><th>یعنی چه</th></tr></thead><tbody>${
      METRICS.map((metric) => {
        const value = row.metrics[metric.id];
        const part = (row.scoreParts || []).find((item) => item.id === metric.id);
        const text = metric.unit === 'pct' ? pctCell(value)
          : metric.unit === 'money' ? (Number.isFinite(value) ? fmt.money(value) : '—')
            : metric.unit === 'int' ? (Number.isFinite(value) ? fmt.int(value) : '—')
              : numCellOf(value);
        return `<tr><td><b>${esc(metric.label)}</b></td><td class="${metric.unit === 'pct' && metric.better === 'high' ? signTone(value) : ''}">${text}</td><td>${metric.better === 'high' ? 'بالاتر بهتر' : 'پایین‌تر بهتر'}</td><td>${fmt.int(metricWeights[metric.id])}</td><td>${part ? numCellOf(part.score) : '<span class="loss">این سنجه را ندارد</span>'}</td><td>${esc(metric.hint)}</td></tr>`;
      }).join('')}</tbody></table></div><p class="portfolio-note">نمرهٔ نهایی <b>${numCellOf(row.score)}</b> از میانگین وزنیِ ستون «سهم از نمره» می‌آید. سنجه‌ای که این استراتژی ندارد، صفر نمی‌گیرد — از مخرج بیرون می‌رود، و پوشش نمره ${pctCell(row.scoreCoverage)} است.</p>`;
    host.onclick = null;
  }

  $('pb-drawer-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-drawer-view]');
    if (!button) return;
    drawerView = button.dataset.drawerView;
    $('pb-drawer-tabs').querySelectorAll('[data-drawer-view]').forEach((node) => node.setAttribute('aria-selected', String(node.dataset.drawerView === drawerView)));
    const row = analysis?.strategies.find((item) => item.strategyId === drawerStrategy);
    if (row) paintDrawerBody(row);
  });
  $('pb-drawer-close').addEventListener('click', () => { $('pb-drawer').hidden = true; });

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
    charts.set('heatmap', $('pb-heatmap'), (echarts, tokens) => heatmapOption(analysis, heatMode, labels, tokens, {
      sort: heatSort, palette: heatPalette,
    }), {
      onClick: (params) => {
        const row = analysis.strategies[params?.value?.[1]];
        if (row) selectStrategy(row.strategyId);
      },
      empty: 'برای نقشهٔ زمانی، روز معتبر کافی وجود ندارد.',
    });
    $('pb-calendar-pick').innerHTML = `<option value="">میانهٔ همهٔ استراتژی‌ها</option>${
      analysis.strategies.map((row) => `<option value="${esc(row.strategyId)}"${row.strategyId === calendarPick ? ' selected' : ''}>${esc(row.strategyName)}</option>`).join('')}`;
    charts.set('horizon', $('pb-horizon'), (echarts, tokens) => horizonHeatOption(analysis, tokens, {
      sort: heatSort, palette: heatPalette,
    }), { onClick: (params) => {
      const row = sortStrategies(analysis.strategies, heatSort)[params?.value?.[1]];
      if (row) selectStrategy(row.strategyId);
    }, empty: 'برای نقشهٔ افق، دست‌کم دو روز معتبر لازم است.' });
    charts.set('calendar', $('pb-calendar'),
      (echarts, tokens) => calendarOption(analysis, tokens, { strategyId: calendarPick, mode: heatMode === 'cumulative' ? 'step' : heatMode }));
  }

  // ═══════════════════ روند و افق نگهداری ═══════════════════

  function paintTrend() {
    const labels = labelsOf();
    $('pb-trend-pick').innerHTML = analysis.strategies.slice(0, 18).map((row) => `<button type="button" class="pb-chip${trendPick.includes(row.strategyId) ? ' on' : ''}" data-trend="${esc(row.strategyId)}" aria-pressed="${trendPick.includes(row.strategyId)}">${esc(row.strategyName)}</button>`).join('');
    charts.set('trend', $('pb-trend'), (echarts, tokens) => trendOption(analysis, labels, tokens, {
      pick: trendPick, showBase: $('pb-trend-base').checked, area: $('pb-trend-area').checked,
    }), { onClick: (params) => selectStrategyByName(params?.seriesName) });
    $('pb-band-pick').innerHTML = `<option value="">همهٔ ترکیب‌ها</option>${
      analysis.strategies.map((row) => `<option value="${esc(row.strategyId)}"${row.strategyId === bandPick ? ' selected' : ''}>${esc(row.strategyName)}</option>`).join('')}`;
    charts.set('band', $('pb-band'), (echarts, tokens) => quartileBandOption(analysis, labels, tokens, { strategyId: bandPick }), {
      empty: 'برای باند چارک‌ها، دست‌کم سه ترکیب معتبر لازم است.',
    });
    charts.set('ddPath', $('pb-dd-path'), (echarts, tokens) => drawdownPathOption(analysis, labels, tokens, { pick: trendPick }), {
      onClick: (params) => selectStrategyByName(params?.seriesName),
    });
    charts.set('dailyWin', $('pb-daily-win'), (echarts, tokens) => dailyWinOption(analysis, labels, tokens, { pick: trendPick }), {
      onClick: (params) => selectStrategyByName(params?.seriesName),
    });
    charts.set('river', $('pb-river'), (echarts, tokens) => familyRiverOption(analysis, labels, tokens), {
      empty: 'برای رودخانه، دست‌کم دو خانواده و سه روز لازم است.',
    });
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
        return `<tr data-tone="${band.tone}" data-level="${band.level ?? ''}"><td>${fmt.int(row.column)}</td><td>${esc(columnLabel(row.date))}</td><td>${fmt.int(row.samples)}</td><td class="${signTone(row.median)}">${pctCell(row.median)}</td><td>${pctCell(row.winPct)}</td><td class="gain">${pctCell(row.best)}</td><td class="loss">${pctCell(row.worst)}</td></tr>`;
      }).join('')}</tbody></table>`;
  }

  // ═══════════════════ سنجه‌ها ═══════════════════

  function paintMetrics() {
    $('pb-weights').innerHTML = METRICS.map((metric) => `<label class="pb-weight"><span>${esc(metric.label)}<small>${esc(metric.hint)}</small></span><input type="range" min="0" max="50" step="5" data-weight="${esc(metric.id)}" value="${metricWeights[metric.id]}"><b data-weight-out="${esc(metric.id)}">${fmt.int(metricWeights[metric.id])}</b></label>`).join('');
    const active = METRICS.filter((metric) => metricWeights[metric.id] > 0);
    charts.set('gauge', $('pb-gauge'), (echarts, tokens) => scoreGaugeOption(analysis, tokens), {
      empty: 'نمره‌ای برای نمایش نیست.',
    });
    charts.set('polar', $('pb-polar'), (echarts, tokens) => polarScoreOption(analysis, tokens), {
      onClick: (params) => { if (params?.data?.strategyId) selectStrategy(params.data.strategyId); },
      empty: 'برای نمای دایره‌ای، دست‌کم سه استراتژی نمره‌دار لازم است.',
    });
    charts.set('scoreParts', $('pb-score-parts'), (echarts, tokens) => scorePartsOption(analysis, tokens), {
      empty: 'اجزای نمره ساخته نشد؛ هیچ سنجه‌ای وزن ندارد.',
    });
    charts.set('parallel', $('pb-parallel'), (echarts, tokens) => parallelOption(analysis, active, tokens), {
      empty: 'برای مختصات موازی، دست‌کم دو استراتژی و دو سنجهٔ وزن‌دار لازم است.',
    });
    charts.set('radar', $('pb-radar'), (echarts, tokens) => metricRadarOption(analysis, active, tokens, { pick: trendPick }), {
      onClick: (params) => { if (params?.data?.strategyId) selectStrategy(params.data.strategyId); },
      empty: 'برای رادار، دست‌کم دو استراتژی و سه سنجهٔ وزن‌دار لازم است.',
    });
    $('pb-metrics-table').innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>استراتژی</th>${METRICS.map((metric) => `<th title="${esc(metric.hint)}">${esc(metric.label)}</th>`).join('')}</tr></thead><tbody>${
      analysis.strategies.map((row) => `<tr data-strategy="${esc(row.strategyId)}" tabindex="0"><td><b>${esc(row.strategyName)}</b></td>${METRICS.map((metric) => {
        const value = row.metrics[metric.id];
        const text = metric.unit === 'pct' ? pctCell(value)
          : metric.unit === 'money' ? (Number.isFinite(value) ? fmt.money(value) : '—')
            : metric.unit === 'int' ? (Number.isFinite(value) ? fmt.int(value) : '—')
              : metric.unit === 'days' || metric.unit === 'rank' ? (Number.isFinite(value) ? fmt.num(value) : '—')
                : numCellOf(value);
        return `<td class="${metric.unit === 'pct' && metric.better === 'high' ? signTone(value) : ''}">${text}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
    $('pb-metrics-table').onclick = (event) => {
      const row = event.target.closest('[data-strategy]');
      if (row) selectStrategy(row.dataset.strategy);
    };
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
    charts.set('cdf', $('pb-cdf'), (echarts, tokens) => cumulativeDistOption(analysis, tokens), {
      empty: 'برای توزیع تجمعی، دست‌کم پنج ترکیب معتبر لازم است.',
    });
    charts.set('box', $('pb-box'), (echarts, tokens) => boxOption(analysis, tokens), {
      empty: 'برای نمودار جعبه‌ای، هر استراتژی دست‌کم سه ترکیب معتبر لازم دارد.',
    });
    charts.set('stepHist', $('pb-step-hist'), (echarts, tokens) => stepHistogramOption(analysis, tokens), {
      empty: 'برای توزیع تغییر روزانه، دست‌کم ده مشاهده لازم است.',
    });
    paintDistributionTable();
  }

  /** چارک‌ها و دُم‌های هر استراتژی، به عدد — همان چیزی که جعبه‌ای تصویرش می‌کند. */
  function paintDistributionTable() {
    const rows = analysis.strategies.map((row) => ({ row, p25: row.p25, p75: row.p75 }));
    $('pb-dist-table').innerHTML = rows.length
      ? `<table class="history-table portfolio-small-table"><thead><tr><th>استراتژی</th><th>ترکیب</th><th>بدترین</th><th>چارک پایین</th><th>${esc(analysis.statisticLabel)}</th><th>چارک بالا</th><th>بهترین</th><th>پهنای چارک‌ها</th><th>خواندنش</th></tr></thead><tbody>${
        rows.map(({ row, p25, p75 }) => `<tr data-strategy="${esc(row.strategyId)}" tabindex="0"><td>${esc(row.strategyName)}</td><td>${fmt.int(row.samples)}</td><td class="loss">${pctCell(row.worst)}</td><td>${pctCell(p25)}</td><td class="${signTone(row.metrics.return)}">${pctCell(row.metrics.return)}</td><td>${pctCell(p75)}</td><td class="gain">${pctCell(row.best)}</td><td>${pctCell(row.metrics.spread)}</td><td>${
          row.metrics.spread === null ? '—'
            : row.metrics.spread > Math.abs(row.metrics.return ?? 0) * 2 ? 'نتیجه بیشتر به انتخاب ترکیب بستگی داشت'
              : 'نتیجه بین ترکیب‌ها یکدست بود'}</td></tr>`).join('')}</tbody></table>`
      : '<p class="empty-note">جدول توزیع بدون استراتژی معتبر ساخته نمی‌شود.</p>';
    $('pb-dist-table').onclick = (event) => {
      const row = event.target.closest('[data-strategy]');
      if (row) selectStrategy(row.dataset.strategy);
    };
  }

  // ═══════════════════ کل به جزء ═══════════════════

  /**
   * ده نمودار و سه جدول، همه در جواب یک سؤال: پول و نتیجه کجا جمع شده؟
   *
   * هر کدام چیزی می‌گویند که بقیه نمی‌گویند. اگر دو نمودار یک حرف بزنند،
   * یکی‌شان باید برود — ده نمودارِ هم‌حرف، صفحه را شلوغ می‌کند نه گویا.
   */
  function paintParts() {
    const audit = generated.reduce((sum, row) => ({
      built: sum.built + (Number(row.built) || 0),
      candidates: sum.candidates + (Number(row.candidates) || 0),
    }), { built: 0, candidates: 0 });
    const pick = (params) => {
      const id = params?.data?.strategyId || params?.data?.id;
      if (id) selectStrategy(id);
    };
    charts.set('funnel', $('pb-funnel'), (echarts, tokens) => funnelOption(analysis, audit, tokens), {
      empty: 'برای قیف غربال، شمار ساخته‌شده‌ها ثبت نشده است.',
    });
    charts.set('sunburst', $('pb-sunburst'), (echarts, tokens) => sunburstOption(analysis, tokens), { onClick: pick });
    charts.set('donut', $('pb-donut'), (echarts, tokens) => shareDonutOption(analysis, tokens));
    charts.set('familyBar', $('pb-family-bar'), (echarts, tokens) => familyBarOption(analysis, tokens));
    charts.set('treemap', $('pb-treemap'), (echarts, tokens) => treemapOption(analysis, tokens));
    charts.set('rose', $('pb-rose'), (echarts, tokens) => roseOption(analysis, tokens), { onClick: pick });
    charts.set('pareto', $('pb-pareto'), (echarts, tokens) => paretoOption(analysis, tokens), { onClick: pick });
    charts.set('graph', $('pb-graph'), (echarts, tokens) => similarityGraphOption(analysis, tokens, {
      threshold: Math.max(0, Math.min(1, safeNum($('pb-graph-threshold').value, 0.75))),
    }), { onClick: pick, empty: 'برای شبکهٔ شباهت، دست‌کم سه استراتژی با مسیر معتبر لازم است.' });
    charts.set('corr', $('pb-corr'), (echarts, tokens) => correlationHeatOption(analysis, tokens));
    charts.set('tree', $('pb-tree'), (echarts, tokens) => treeOption(analysis, tokens), { onClick: pick });
    paintPartsTables();
  }

  function paintPartsTables() {
    const totalSamples = analysis.groups.reduce((sum, row) => sum + row.samples, 0);
    $('pb-parts-groups').innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>خانواده</th><th>ترکیب</th><th>سهم از کل</th><th>استراتژی</th><th>بازده</th><th>نرخ برد</th><th>بهترین عضو</th></tr></thead><tbody>${
      analysis.groups.map((row) => `<tr data-strategy="${esc(row.bestStrategy?.strategyId || '')}" tabindex="0"><td>${esc(row.groupName)}</td><td>${fmt.int(row.samples)}</td><td>${pctCell(totalSamples ? (row.samples / totalSamples) * 100 : null)}</td><td>${fmt.int(row.strategies)}</td><td class="${signTone(row.returnStat)}">${pctCell(row.returnStat)}</td><td>${pctCell(row.winPct)}</td><td>${esc(row.bestStrategy?.strategyName || '—')}</td></tr>`).join('')}</tbody></table>`;

    // شبیه‌ترین زوج‌ها — همان چیزی که شبکه نشان می‌دهد، ولی قابل خواندن و
    // مرتب. نمودار الگو را می‌گوید و جدول عدد را.
    const rows = analysis.strategies.filter((row) => (row.path?.cumulative || []).some((value) => value !== null));
    const pairs = [];
    for (let a = 0; a < rows.length; a++) {
      for (let b = a + 1; b < rows.length; b++) {
        const value = correlationOf(rows[a].path.cumulative, rows[b].path.cumulative);
        if (value === null) continue;
        pairs.push({ a: rows[a], b: rows[b], value });
      }
    }
    pairs.sort((x, y) => y.value - x.value);
    const bound = heatScale(pairs.map((row) => row.value));
    $('pb-parts-pairs').innerHTML = pairs.length
      ? `<table class="history-table portfolio-small-table"><thead><tr><th>استراتژی</th><th>استراتژی</th><th>همبستگی مسیر</th><th>خواندنش</th></tr></thead><tbody>${
        pairs.slice(0, 25).map((row) => {
          const band = heatLevel(row.value, bound);
          return `<tr data-tone="${band.tone}" data-level="${band.level ?? ''}"><td>${esc(row.a.strategyName)}</td><td>${esc(row.b.strategyName)}</td><td>${numCellOf(row.value)}</td><td>${
            row.value > 0.9 ? 'تقریباً یک شرط‌بندی‌اند' : row.value > 0.6 ? 'هم‌جهت‌اند' : row.value < -0.3 ? 'خلاف هم می‌روند' : 'مستقل‌اند'}</td></tr>`;
        }).join('')}</tbody></table>`
      : '<p class="empty-note">برای همبستگی، دست‌کم سه روز مشترک لازم است.</p>';

    const profits = analysis.strategies.map((row) => ({
      row,
      pnl: analysis.combos
        .filter((combo) => combo.strategyId === row.strategyId && combo.series.finalPnl !== null)
        .reduce((sum, combo) => sum + combo.series.finalPnl, 0),
    })).filter((item) => item.pnl > 0).sort((a, b) => b.pnl - a.pnl);
    const totalPnl = profits.reduce((sum, item) => sum + item.pnl, 0);
    let running = 0;
    $('pb-parts-pareto').innerHTML = profits.length
      ? `<table class="history-table portfolio-small-table"><thead><tr><th>رتبه</th><th>استراتژی</th><th>سود</th><th>سهم از سود کل</th><th>تا اینجا روی هم</th></tr></thead><tbody>${
        profits.map((item, index) => {
          running += item.pnl;
          return `<tr data-strategy="${esc(item.row.strategyId)}" tabindex="0"><td>${fmt.int(index + 1)}</td><td>${esc(item.row.strategyName)}</td><td class="gain">${fmt.money(item.pnl)}</td><td>${pctCell((item.pnl / totalPnl) * 100)}</td><td>${pctCell((running / totalPnl) * 100)}</td></tr>`;
        }).join('')}</tbody></table>`
      : '<p class="empty-note">هیچ استراتژی‌ای در این بازه سود خالص مثبت نساخت.</p>';

    for (const id of ['pb-parts-groups', 'pb-parts-pareto']) {
      $(id).onclick = (event) => {
        const row = event.target.closest('[data-strategy]');
        if (row?.dataset.strategy) selectStrategy(row.dataset.strategy);
      };
    }
  }

  // ═══════════════════ کاوش ═══════════════════

  function paintDrill() {
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
    const sources = basketSources();
    const source = sources.find((row) => row.id === pick.sourceId) || sources[0] || null;
    const strategies = source?.analysis?.strategies || [];
    // همان مجموعه‌ای که جدول رتبه‌بندی نشان می‌دهد — یک تعریف، سه خواننده —
    // با اعمال پایۀ اول به‌عنوان کلید اصلی و اعمال‌های بعدی به‌عنوان گره.
    const combos = combosFor(source, pick.strategyId, lens.basisId);
    // ستون «اجرا» تا وقتی کتابخانه یک اجرا بیشتر ندارد، ستونی است که
    // همیشه یک مقدار دارد — یعنی جای خالیِ گران. پهنایش به نام استراتژی
    // و ترکیب می‌رسد که واقعاً بلندند.
    const many = sources.length > 1;
    const runField = many
      ? `<label>اجرا<select data-basket="sourceId" data-index="${index}">${sources.map((row) => `<option value="${esc(row.id)}"${row.id === (source?.id ?? '') ? ' selected' : ''}>${esc(row.label)}</option>`).join('')}</select></label>`
      : '';
    // نامِ بلند در `select` با سه‌نقطه بریده می‌شود؛ `title` همان متن کامل
    // را برمی‌گرداند تا چیزی از دسترس بیرون نرود.
    // بها همچنان در خودِ برچسب می‌آید تا کاربر هم‌زمان ببیند آیا سهمش یک
    // قرارداد کامل می‌خرد؛ اما دیگر کلید مرتب‌سازی نیست.
    const comboLabel = (combo) => {
      const each = comboLotCost(combo, lens.basisId);
      return `${comboName(combo)} · ${each === null ? 'بهای قرارداد نامعلوم' : fmt.money(each)} · ${pctCell(combo.series.finalPct)}`;
    };
    // چرا این سطر در سبد نمی‌نشیند، همین‌جا گفته می‌شود — نه بعد از ساخت.
    const cost = lotCostRial(source, pick.comboId, lens.basisId);
    const warn = pickWarning({ pick, source, capitalRial: basketCapital(), basisId: lens.basisId, picks: basketPicks });
    const on = pickOn(pick);
    return `<div class="pb-basket-row" data-basket-row="${index}"${many ? '' : ' data-single-run'}${warn ? ' data-warn' : ''}${on ? '' : ' data-off'}>
      <label class="pb-basket-on" title="${on ? 'در سبد هست — برای کنارگذاشتن تیک را بردار' : 'کنار گذاشته شده — برای برگرداندن تیک بزن'}"><input type="checkbox" data-basket="on" data-index="${index}"${on ? ' checked' : ''}><span>${on ? 'در سبد' : 'کنار'}</span></label>
      ${runField}
      <label>استراتژی<select data-basket="strategyId" data-index="${index}" title="${esc(strategies.find((row) => row.strategyId === pick.strategyId)?.strategyName || '')}">${strategies.map((row) => `<option value="${esc(row.strategyId)}"${row.strategyId === pick.strategyId ? ' selected' : ''}>${esc(row.strategyName)}</option>`).join('')}</select></label>
      <label>ترکیب<select data-basket="comboId" data-index="${index}" title="${esc(combos.find((combo) => combo.id === pick.comboId) ? comboLabel(combos.find((combo) => combo.id === pick.comboId)) : '')}">${combos.length ? combos.map((combo) => `<option value="${esc(combo.id)}"${combo.id === pick.comboId ? ' selected' : ''}>${esc(comboLabel(combo))}</option>`).join('') : '<option value="">ترکیب معتبری ندارد</option>'}</select></label>
      <label>سهم (درصد)<input type="number" min="0" max="100" step="1" data-basket="pct" data-index="${index}" value="${pick.pct}"></label>
      <button type="button" class="ghost" data-basket-remove="${index}">حذف</button>
      ${warn ? `<p class="pb-basket-warn" data-kind="${esc(warn.kind)}">${esc(warn.text)}${cost === null ? '' : ` · بهای هر قرارداد ${fmt.money(cost)}`}</p>` : ''}
    </div>`;
  }

  // سرمایه در دو جا خوانده می‌شد و یک جا در میلیون ضرب می‌شد؛ سومین
  // خواننده همان اشتباه را تکرار می‌کرد.
  const basketCapital = () => Math.max(0, safeNum($('pb-basket-capital').value, 0)) * 1e6;

  // خبرِ بازچینش فقط به همان افزودن مربوط است. اگر نماند، در هر رسمِ
  // بعدی تکرار می‌شود و کاربر فکر می‌کند باز هم چیزی عوض شده.
  let basketRebalanced = false;

  function paintBasketForm() {
    if (!analysis) return;
    if (!basketPicks.length && analysis.strategies.length) {
      const here = currentRunId();
      basketPicks = analysis.strategies.slice(0, 3).map((row, index) => {
        return { sourceId: here, strategyId: row.strategyId, comboId: firstComboId({ analysis }, row.strategyId), pct: [40, 35, 25][index] ?? 20 };
      });
    }
    // آنچه در فرم دیده می‌شود باید همانی باشد که ساخته می‌شود.
    basketPicks = normalizeBasketPicks(basketPicks, basketSources());
    $('pb-basket-rows').innerHTML = basketPicks.map(basketRowMarkup).join('');
    paintBasketTally();
  }

  /**
   * مجموع درصدها، زنده.
   *
   * مجموعِ بیش از صد، کل سبد را رد می‌کند. تا پیش از این، کاربر این را
   * فقط با ناپدیدشدن سبد می‌فهمید — بدون اینکه بداند کدام عدد مقصر است.
   */
  function paintBasketTally() {
    // از `usedPct`، نه از `100 - freePct`: کفِ صفرِ آن، ۱۷۵٪ را صد نشان می‌داد.
    const used = usedPct(basketPicks);
    const over = used > 100 + 1e-9;
    const free = freePct(basketPicks);
    $('pb-basket-tally').innerHTML = over
      ? `<b class="loss">مجموع ${fmt.num(used)}٪ — بیش از صد</b><span>تا سبد ساخته شود باید ${fmt.num(Math.round((used - 100) * 100) / 100)}٪ کم شود.</span>`
      : `<b>مجموع ${fmt.num(used)}٪</b><span>${free > 0 ? `${fmt.num(free)}٪ تخصیص‌نیافته نقد می‌ماند و بازده را رقیق می‌کند.` : 'همهٔ سرمایه تخصیص یافته است.'}</span>`;
    $('pb-basket-tally').dataset.tone = over ? 'over' : 'ok';
    if (basketRebalanced) {
      $('pb-basket-tally').insertAdjacentHTML('beforeend',
        '<em>جایی نمانده بود؛ سهم‌های پیشین به نسبت خودشان کوچک شدند تا سطر تازه جا بگیرد.</em>');
    }
  }

  /**
   * هر اجرای کتابخانه، با عدسی **جاری** تحلیل می‌شود.
   *
   * اگر هر اجرا با مبنای زمان اجرای خودش می‌ماند، دو جزء سبد روی دو مخرج
   * متفاوت جمع می‌شدند و عددِ کل هیچ معنایی نداشت.
   */
  function basketSources() {
    return runs.map((run) => ({
      id: run.id, label: run.label,
      analysis: run.id === currentRunId() ? analysis : analyzePortfolio({
        rows: run.rows, matrix: run.matrix,
        basisId: lens.basisId, statistic: lens.statistic, weighting: lens.weighting,
        weights: metricWeights,
      }),
    }));
  }
  const currentRunId = () => `${String(ua?.ins ?? '')}:${$('pb-entry-date').dataset.value}:${$('pb-exit-date').dataset.value}`;
  const sourceOf = (id) => basketSources().find((row) => row.id === id) || null;

  // ═══ آزمایشگاه نمودار ═══
  //
  // هفت دستهٔ نموداری، همان تقسیمی که کتابخانه‌های امروز مشترک دارند.
  // مثل پنل سبد، فقط دستهٔ دیده‌شده رسم می‌شود.
  const LAB_GROUPS = [
    { id: 'lab-compare', label: 'مقایسه', hint: 'کدام بهتر بود' },
    { id: 'lab-share', label: 'سهم از کل', hint: 'بازار از چه ساخته شده' },
    { id: 'lab-dist', label: 'توزیع', hint: 'چقدر قابل اتکا' },
    { id: 'lab-rel', label: 'رابطه', hint: 'چه با چه می‌آید' },
    { id: 'lab-time', label: 'زمان', hint: 'کِی چه شد' },
    { id: 'lab-flow', label: 'جریان و شبکه', hint: 'از کجا به کجا' },
    { id: 'lab-dev', label: 'انحراف', hint: 'فاصله از معیار' },
  ];
  const LAB_CHARTS = {
    'lab-score': ['lab-compare', (a, c, t) => labScore(a, t)],
    'lab-dumb': ['lab-compare', (a, c, t) => labDumb(a, t)],
    'lab-bullet': ['lab-compare', (a, c, t) => labBullet(a, t)],
    'lab-radial': ['lab-compare', (a, c, t) => labRadial(a, t)],
    'lab-count': ['lab-compare', (a, c, t) => labCount(a, t)],
    'lab-waffle': ['lab-share', (a, c, t) => labWaffle(a, t)],
    'lab-mekko': ['lab-share', (a, c, t) => labMekko(a, t)],
    'lab-funnel': ['lab-share', (a, c, t) => labFunnel(a, t), null, 'ranking'],
    'lab-sun': ['lab-share', (a, c, t) => labSun(a, t)],
    'lab-treemap': ['lab-share', (a, c, t) => labTreemap(a, t)],
    'lab-ridge': ['lab-dist', (a, c, t) => labRidge(a, t)],
    'lab-violin': ['lab-dist', (a, c, t) => labViolin(a, t)],
    'lab-swarm': ['lab-dist', (a, c, t) => labSwarm(a, t), null, 'distribution'],
    'lab-fly': ['lab-dist', (a, c, t) => labFly(a, t), null, 'distribution'],
    'lab-ecdf': ['lab-dist', (a, c, t) => labEcdf(a, t)],
    'lab-box': ['lab-dist', (a, c, t) => labBox(a, t)],
    'lab-hex': ['lab-rel', (a, c, t) => labHex(a, t)],
    'lab-reg': ['lab-rel', (a, c, t) => labReg(a, t)],
    'lab-slope': ['lab-rel', (a, c, t) => labSlope(a, t)],
    'lab-corr': ['lab-rel', (a, c, t) => labCorr(a, t)],
    'lab-par': ['lab-rel', (a, c, t) => labPar(a, METRICS, t)],
    'lab-metric': ['lab-rel', (a, c, t) => labMetric(a, METRICS, t)],
    'lab-horizon': ['lab-time', (a, c, t) => labHorizon(a, c.labels, t)],
    'lab-race': ['lab-time', (a, c, t) => labRace(a, c.labels, t)],
    'lab-river': ['lab-time', (a, c, t) => labRiver(a, c.labels, t)],
    'lab-timeline': ['lab-time', (a, c, t) => labTime(a, c.labels, t)],
    'lab-cal': ['lab-time', (a, c, t) => labCal(a, c.iso, t),
      (c) => (c.intraday ? 'در دانه‌بندی درون‌روزی، تقویم روزانه یک خانه بیشتر ندارد.'
        : 'مسیر نماد پایه در این اجرا ثبت نشده است.'), 'trend'],
    'lab-sankey': ['lab-flow', (a, c, t) => labSankey(a, t)],
    'lab-chord': ['lab-flow', (a, c, t) => labChord(a, t)],
    'lab-graph': ['lab-flow', (a, c, t) => labGraph(a, t)],
    'lab-tree': ['lab-flow', (a, c, t) => labTree(a, t)],
    'lab-gauge': ['lab-flow', (a, c, t) => labGauge(a, t), null, 'ranking'],
    'lab-fall': ['lab-dev', (a, c, t) => labFall(a, t)],
    'lab-div': ['lab-dev', (a, c, t) => labDiv(a, t)],
    'lab-excess': ['lab-dev', (a, c, t) => labExcess(a, c.labels, t),
      'مسیر نماد پایه در این اجرا ثبت نشده؛ بی آن «مازاد» معنا ندارد.'],
  };
  let labGroup = 'lab-compare', labTabsApi = null;

  function mountLabTabs() {
    labTabsApi = mountSubtabs($('lab-tabs'), LAB_GROUPS, {
      root: root.querySelector('[data-panel="lab"]'),
      initial: labGroup,
      onChange: (id) => { labGroup = id; paintLabGroup(id); },
    }) || labTabsApi;
  }

  function paintLabGroup(id) {
    if (!analysis) return;
    charts.stopAll();
    const context = basketContext();
    for (const [host, [group, build, empty, jump]] of Object.entries(LAB_CHARTS)) {
      if (group !== id) continue;
      charts.set(host, $(host), (echarts, tokens) => build(analysis, context, tokens), {
        onClick: (params) => openLabDetail(params, jump),
        empty: typeof empty === 'function' ? empty(context) : empty,
      });
    }
  }

  /**
   * کلیک روی هر بخش از هر نمودار آزمایشگاه، به جزئیات همان استراتژی
   * می‌رود — همان چیزی که «از کل به جزء» یعنی.
   */
  function openLabDetail(params, jump = null) {
    const id = params?.data?.strategyId ?? null;
    if (id) { openDetail(id); return; }
    // نمودارهایی که دربارهٔ یک استراتژی نیستند — غربال، سلامت بازه،
    // پروانه — استراتژی‌ای برای باز کردن ندارند. کلیکِ بی‌اثر بدترین
    // پاسخ است، پس به تبی می‌روند که همان موضوع را ریز می‌کند.
    if (jump) { dirty.delete(jump); tabsApi?.show(jump); }
  }

  function paintLab() {
    if (!analysis) return;
    const total = Object.keys(LAB_CHARTS).length;
    $('lab-count-note').textContent = `${fmt.int(total)} نمودار در ${fmt.int(LAB_GROUPS.length)} دسته`;
    mountLabTabs();
    paintLabGroup(labGroup);
  }

  // ═══ نمودارهای سبد ═══
  //
  // سی‌ودو نمودار روی یک پنل، هم رشتهٔ اصلی را می‌خواباند و هم چشم را.
  // پس پنل خودش شش دستهٔ درونی دارد و فقط دستهٔ دیده‌شده رسم می‌شود —
  // همان قاعده‌ای که برای تب‌های بیرونی هم برقرار است.
  const BK_GROUPS = [
    { id: 'bk-mix', label: 'تخصیص', hint: 'پول کجا رفت' },
    { id: 'bk-path', label: 'مسیر سبد', hint: 'ارزش، ریتم و توزیع' },
    { id: 'bk-vs', label: 'در برابر بازار', hint: 'مقایسه با نماد پایه' },
    { id: 'bk-members', label: 'اعضا', hint: 'رفتار هر عضو در طول زمان' },
    { id: 'bk-risk', label: 'ریسک', hint: 'تنوع، پراکندگی و همبستگی' },
    { id: 'bk-shape', label: 'سهم و آبشار', hint: 'چه کسی سود را ساخت' },
  ];
  const BK_CHARTS = {
    'bk-waffle': ['bk-mix', (b, c, t) => bkWaffle(b, t)],
    'bk-funnel': ['bk-mix', (b, c, t) => bkFunnel(b, t)],
    'bk-flow': ['bk-mix', (b, c, t) => bkFlow(b, t)],
    'bk-sun': ['bk-mix', (b, c, t) => bkSun(b, t)],
    'bk-tree': ['bk-mix', (b, c, t) => bkTree(b, t)],
    'bk-dumb': ['bk-mix', (b, c, t) => bkDumb(b, t)],
    'bk-mek': ['bk-mix', (b, c, t) => bkMek(b, t)],
    'bk-equity': ['bk-path', (b, c, t) => bkEquity(b, c.labels, t)],
    'bk-step': ['bk-path', (b, c, t) => bkStep(b, c.labels, t)],
    'bk-roll': ['bk-path', (b, c, t) => bkRoll(b, c.labels, t)],
    'bk-hist': ['bk-path', (b, c, t) => bkHist(b, t)],
    'bk-ecdf': ['bk-path', (b, c, t) => bkEcdf(b, t)],
    'bk-cal': ['bk-path', (b, c, t) => bkCal(b, c.iso, t),
      (c) => (c.intraday ? 'در دانه‌بندی درون‌روزی، تقویم روزانه یک خانه بیشتر ندارد.'
        : 'برای تقویم دست‌کم دو روز با گام معلوم لازم است.')],
    'bk-payoff': ['bk-vs', (b, c, t) => bkPayoff(b, c.basePrices, c.labels, t, { bins: c.payoffBins }),
      'برای این نمودار هر لحظه باید هم قیمت نماد پایه را داشته باشد هم ارزش کامل سبد را؛ در این اجرا دو لحظه هم پیدا نشد.'],
    'bk-versus': ['bk-vs', (b, c, t) => bkVersus(b, c.base, c.labels, t),
      'ارزش سبد در هیچ دوره‌ای کامل معلوم نشد؛ دست‌کم یک جزء هر دوره قیمت نداشت.'],
    'bk-capture': ['bk-vs', (b, c, t) => bkCapture(b, c.base, t),
      'مسیر نماد پایه در این اجرا ثبت نشده؛ بی آن نمی‌شود گفت چند درصد بازار را گرفته‌ای.'],
    'bk-gauge': ['bk-vs', (b, c, t) => bkGauge(b, c.baseFinal, t)],
    'bk-weekday': ['bk-vs', (b, c, t) => bkWeekday(b, c.weekdays, t),
      (c) => (c.intraday ? 'در دانه‌بندی درون‌روزی همهٔ لحظه‌ها یک روزند؛ الگوی هفتگی معنا ندارد.'
        : 'برای الگوی هفتگی دست‌کم دو روز هفتهٔ متفاوت لازم است.')],
    'bk-mpath': ['bk-members', (b, c, t) => bkMemberPath(b, c.labels, t)],
    'bk-mstack': ['bk-members', (b, c, t) => bkMemberStack(b, c.labels, t)],
    'bk-mbump': ['bk-members', (b, c, t) => bkMemberBump(b, c.labels, t)],
    'bk-mheat': ['bk-members', (b, c, t) => bkMemberHeat(b, c.labels, t)],
    'bk-mdd': ['bk-members', (b, c, t) => bkMemberDd(b, c.labels, t)],
    'bk-slope': ['bk-members', (b, c, t) => bkSlope(b, t)],
    'bk-risk': ['bk-risk', (b, c, t) => bkRisk(b, t)],
    'bk-corr': ['bk-risk', (b, c, t) => bkCorr(b, t)],
    'bk-riskshare': ['bk-risk', (b, c, t) => bkRiskShare(b, t)],
    'bk-box': ['bk-risk', (b, c, t) => bkBox(b, t)],
    'bk-swarm': ['bk-risk', (b, c, t) => bkSwarm(b, t)],
    'bk-radar': ['bk-risk', (b, c, t) => bkRadar(b, t)],
    'bk-fall': ['bk-shape', (b, c, t) => bkFall(b, t)],
    'bk-lolli': ['bk-shape', (b, c, t) => bkLolli(b, t)],
    'bk-bubble': ['bk-shape', (b, c, t) => bkBubble(b, t)],
  };
  let lastBasket = null, basketGroup = 'bk-mix', basketTabsApi = null;

  function mountBasketTabs() {
    basketTabsApi = mountSubtabs($('bk-tabs'), BK_GROUPS, {
      root: root.querySelector('[data-panel="basket"]'),
      initial: basketGroup,
      onChange: (id) => { basketGroup = id; paintBasketGroup(id); },
    }) || basketTabsApi;
  }

  // صفر یعنی «خط میانگین را نکش». مقدار از خودِ کشویی خوانده می‌شود نه از
  // یک متغیر موازی، تا حالت دیده‌شده و حالت رسم‌شده نتوانند از هم جدا شوند.
  const payoffBinCount = () => Math.max(0, Math.trunc(safeNum($('bk-payoff-bins')?.value, 24)));

  /** بستهٔ داده‌ای که همهٔ نمودارهای سبد از آن می‌خوانند. */
  function basketContext() {
    const dates = analysis?.dates || [];
    return {
      labels: labelsOf(),
      iso: dates.map(isoDate),
      base: analysis?.baseSeries || [],
      basePrices: analysis?.basePrices || [],
      baseFinal: analysis?.baseFinal ?? null,
      payoffBins: payoffBinCount(),
      intraday: isIntradayGrain(grain),
      // روز هفتهٔ جلالی از تاریخ میلادیِ معادل می‌آید؛ روزی که تبدیلش
      // ممکن نباشد `null` می‌ماند و در الگوی هفتگی شمرده نمی‌شود.
      weekdays: dates.map((value) => {
        const iso = isoDate(value);
        if (!iso) return null;
        const stamp = Date.parse(`${iso}T00:00:00Z`);
        return Number.isFinite(stamp) ? new Date(stamp).getUTCDay() : null;
      }),
    };
  }

  function paintBasketGroup(id) {
    if (!lastBasket) return;
    const noteEl = $('bk-payoff-note');
    if (noteEl) noteEl.textContent = payoffNote(lastBasket, analysis?.basePrices || [], labelsOf());
    // نمودارِ پنهان را نه می‌شود اندازه گرفت و نه ارزش رسم‌کردن دارد.
    charts.stopAll();
    const context = basketContext();
    for (const [host, [group, build, empty]] of Object.entries(BK_CHARTS)) {
      if (group !== id) continue;
      charts.set(host, $(host), (echarts, tokens) => build(lastBasket, context, tokens), {
        onClick: (params) => openBasketDetail(params),
        // نمودار خالی باید بگوید چرا خالی است. «داده‌ای نیست» وقتی علتش
        // معلوم است — مثلاً دانه‌بندی درون‌روزی که همه‌اش یک روز است —
        // کاربر را دنبال نخود سیاه می‌فرستد.
        empty: typeof empty === 'function' ? empty(context) : empty,
      });
    }
  }

  /**
   * کلیک روی هر بخش نمودار سبد، کشوی همان استراتژی را باز می‌کند.
   *
   * شناسهٔ ترکیب از هر جایی که سازندهٔ نمودار گذاشته باشد خوانده می‌شود —
   * روی خودِ نقطه، روی سری، یا در آرایهٔ هم‌ترتیبِ `comboIds`. سپس از
   * ترکیب به استراتژی‌اش می‌رسیم، چون کشو بر استراتژی باز می‌شود.
   */
  function openBasketDetail(params) {
    // پارامترهای کلیکِ ECharts فقط `data` را می‌دهند — نه سری را و نه
    // گزینه‌اش. پس شناسه روی خودِ خانه می‌نشیند، و اینجا فقط از همان‌جا
    // خوانده می‌شود. یک بار روی سری گذاشته شد و هیچ کلیکی کار نکرد.
    const id = params?.data?.comboId ?? null;
    if (!id) return;
    const combo = (analysis?.combos || []).find((row) => String(row.id) === String(id));
    if (combo?.strategyId) openDetail(combo.strategyId);
  }

  function paintBasket() {
    paintBasketForm();
    const capital = basketCapital();
    const basket = allocatePortfolio({
      capitalRial: capital, picks: basketPicks, sources: basketSources(), basisId: lens.basisId,
    });
    if (!basket.ok) {
      lastBasket = null;
      $('pb-basket-kpis').innerHTML = `<article class="loss"><span>سبد ساخته نشد</span><b>${esc(basket.why)}</b></article>`;
      $('pb-basket-table').innerHTML = `<p class="empty-note">${esc(basket.why)}</p>`;
      $('bk-tabs').hidden = true;
      for (const id of Object.keys(BK_CHARTS)) charts.set(id, $(id), () => null, { empty: basket.why });
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
      ['نخستین گام سود', summary.firstProfitIndex === null ? 'رخ نداد' : esc(columnLabel(analysis.dates[summary.firstProfitIndex])), ''],
      ['روز معلوم از کل', `${fmt.int(summary.knownDays)} از ${fmt.int(summary.totalDays)}`, summary.knownDays < summary.totalDays ? 'loss' : ''],
    ].map(([label, value, tone]) => `<article class="${tone}"><span>${esc(label)}</span><b>${value}</b></article>`).join('');

    lastBasket = basket;
    $('bk-tabs').hidden = false;
    mountBasketTabs();
    paintBasketGroup(basketGroup);
    const wiped = basket.legs.filter((leg) => leg.ok && leg.finalPnlRial !== null && leg.deployedRial + leg.finalPnlRial <= 0);
    $('pb-sankey-note').textContent = wiped.length
      ? `${fmt.int(wiped.length)} سهم ارزش پایانی مثبتی نداشت و جریانی از آن بیرون نمی‌رود.`
      : '';

    const unfunded = basket.legs.filter((leg) => !leg.ok);
    $('pb-basket-table').innerHTML = `<table class="history-table portfolio-small-table"><thead><tr><th>اجرا</th><th>استراتژی</th><th>ترکیب</th><th>قرارداد</th><th>بهای هر قرارداد</th><th>پول درگیر</th><th>نقد مانده</th><th>سود/زیان</th><th>بازده جزء</th><th>سهم از سود کل</th></tr></thead><tbody>${
      basket.legs.map((leg) => (leg.ok
        ? `<tr><td>${esc(leg.sourceLabel || '—')}</td><td>${esc(leg.strategyName)}</td><td>${esc(leg.comboId)}</td><td>${fmt.int(leg.contracts)}</td><td>${fmt.money(leg.unitCostRial)}</td><td>${fmt.money(leg.deployedRial)}</td><td>${fmt.money(leg.idleRial)}</td><td class="${signTone(leg.finalPnlRial)}">${fmt.money(leg.finalPnlRial)}</td><td class="${signTone(basket.contributions.find((row) => row.comboId === leg.comboId)?.returnPct)}">${pctCell(basket.contributions.find((row) => row.comboId === leg.comboId)?.returnPct)}</td><td>${pctCell(basket.contributions.find((row) => row.comboId === leg.comboId)?.sharePct)}</td></tr>`
        : `<tr><td>${esc(leg.sourceLabel || '—')}</td><td>${esc(leg.strategyName || '—')}</td><td colspan="8"><span class="loss">${esc(leg.why)}</span> — ${fmt.money(leg.targetRial)} نقد ماند${leg.unitCostRial ? `؛ بهای هر قرارداد ${fmt.money(leg.unitCostRial)}` : ''}</td></tr>`)).join('')}</tbody></table>${
      unfunded.length ? `<p class="portfolio-note">${fmt.int(unfunded.length)} سهم تأمین نشد و پولش نقد ماند. بازده سبد روی کل سرمایهٔ اول دوره حساب شده، نه فقط روی پول درگیر — پس نقدِ بی‌کار، بازده را رقیق می‌کند، همان‌طور که در واقعیت می‌کند.</p>` : ''}`;
  }

  // ═══════════════════ ورود نتیجهٔ اجرا ═══════════════════

  function renderReport(payload) {
    payloadRows = payload.rows;
    payloadMatrix = payload.matrix
      ? { ...payload.matrix, pnl: payload.matrix.pnl instanceof Float64Array ? payload.matrix.pnl : Float64Array.from(payload.matrix.pnl || []) }
      : null;
    generated = payload.generatedByStrategy;
    census = payload.census || null;
    dailyMatrix = payloadMatrix;
    dailyRows = payloadRows;
    grain = DEFAULT_GRAIN;
    $('pb-grain').value = DEFAULT_GRAIN;
    lens = { ...lens, from: null, to: null };
    trendPick = []; basketPicks = []; calendarPick = ''; bandPick = ''; selectedStrategyId = '';
    if (!payloadMatrix) { setStatus('این اجرا ماتریس روزانه نساخت.', true); return; }
    paintLensOptions();
    $('pb-lens').hidden = false;
    $('pb-workbook').hidden = false;
    setLensOpen(lensWasOpen());
    paintGrainNote();
    $('pb-tabs').hidden = false;
    tabsApi = mountSubtabs($('pb-tabs'), PB_TABS, {
      root,
      initial: 'overview',
      onChange: (id) => {
        $('pb-lens').hidden = id === 'setup';
        paintPanel(id);
      },
    });
    const label = `${nameOf(ua, 'نماد')} · ${dateLabel(Number($('pb-entry-date').dataset.value))} تا ${dateLabel(Number($('pb-exit-date').dataset.value))}`;
    const runId = `${String(ua?.ins ?? '')}:${$('pb-entry-date').dataset.value}:${$('pb-exit-date').dataset.value}`;
    runs = [
      ...runs.filter((row) => row.id !== runId),
      { id: runId, label, baseIns: String(ua?.ins ?? ''), rows: payloadRows, matrix: payloadMatrix },
    ].slice(-6);
    const capped = generated.filter((row) => row.capped).length;
    $('pb-audit').textContent = `${fmt.int(generated.length)} استراتژی بررسی شد · ${fmt.int(payload.excluded.invalidAtEnd)} ترکیب فاقد داده معتبر روز سنجش · ${fmt.int(capped)} استراتژی سقف‌خورده`;
    // سرشماری قرارداد بالای همه چیز. شمارِ ترکیب بدون شمارِ قرارداد
    // قابل قضاوت نیست و کاربر نباید برای فهمیدنش اجرا را دوباره بزند.
    const censusEl = $('pb-census');
    if (censusEl) censusEl.textContent = census ? censusNote(census, 2) : '';
    recompute();
    tabsApi?.show('overview');
  }

  function selectStrategy(strategyId, { jump = true } = {}) {
    if (!analysis) return;
    // هر انتخابی کشو را هم پر می‌کند: یک مسیر، نه دو تا.
    if (analysis.strategies.some((row) => row.strategyId === strategyId)) openDetail(strategyId);
    const strategy = analysis.strategies.find((row) => row.strategyId === strategyId);
    if (!strategy) return;
    selectedStrategyId = strategyId;
    root.querySelectorAll('[data-strategy]').forEach((row) => row.classList.toggle('selected', row.dataset.strategy === strategyId));
    const rows = combosFor({ analysis }, strategyId, lens.basisId)
      .slice()
      .sort((a, b) => (b.series.finalPct ?? -Infinity) - (a.series.finalPct ?? -Infinity));
    $('pb-combo-title').textContent = `${strategy.strategyName} · ${fmt.int(rows.length)} ترکیب`;
    $('pb-combos').innerHTML = rows.length
      ? `<table class="history-table"><thead><tr><th>رتبه</th><th>ترکیب قرارداد</th><th>سررسید</th><th>مخرج (${esc(analysis.basis.short)})</th><th>سود/زیان</th><th>بازده</th><th>بیشترین افت</th><th>اولین سود</th><th>ارزش معاملهٔ ورود</th></tr></thead><tbody>${
        rows.map((item, index) => `<tr data-result="${esc(item.id)}" tabindex="0"><td>${fmt.int(index + 1)}</td><td>${esc(comboName(item))}</td><td>${(item.expiries || []).map(dateLabel).join(' / ')}</td><td>${fmt.money(item.series.denominator)}</td><td class="${signTone(item.series.finalPnl)}">${fmt.money(item.series.finalPnl)}</td><td class="${signTone(item.series.finalPct)}">${pctCell(item.series.finalPct)}${item.series.beyondBasis ? ' <small>از مبنا رد شده</small>' : ''}</td><td class="${signTone(item.series.maxDrawdownPct)}">${pctCell(item.series.maxDrawdownPct)}</td><td>${item.series.firstProfitIndex === null ? 'رخ نداد' : `${esc(columnLabel(analysis.dates[item.series.firstProfitIndex]))} · ${fmt.int(item.series.firstProfitIndex)} گام`}</td><td>${item.entry?.legValueComplete ? fmt.money(item.entry.legValue) : 'ناقص'}</td></tr>`).join('')}</tbody></table>`
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

  /**
   * سقفِ ترکیبِ هر استراتژی، پس از کران.
   *
   * یک جا حساب می‌شود چون دو جا لازم است: یکی برای اجرا و یکی برای
   * گزارش. دو نسخهٔ جدا یعنی روزی که کران عوض شود، گزارش از اجرا جدا
   * می‌افتد — و همین شد: کران `Math.min(1000, …)` فقط در مسیر اجرا بود.
   */
  function effectiveCap() {
    return Math.max(10, Math.min(1000, Math.trunc(safeNum($('pb-cap').value, 120))));
  }

  async function runAll() {
    const startDate = Number($('pb-entry-date').dataset.value), endDate = Number($('pb-exit-date').dataset.value);
    if (!ua || !startDate || !endDate || endDate < startDate) { setStatus('نماد و بازه معتبر را انتخاب کن.', true); return; }
    $('pb-run').disabled = true; hideReport();
    setStatus('آماده‌سازی اجرای همه استراتژی‌ها…');
    try {
      // ذخیرهٔ تیکی که درست پیش از اجرا زده شده تمام می‌شود و تغییرِ تب
      // دیگر هم از سرور می‌آید؛ Worker هرگز عکس کهنهٔ تنظیمات را نمی‌گیرد.
      await api.loadSettings();
      const runEpoch = settingsEpoch;
      const runSeries = await seriesForRun(endDate);
      runSeriesByIns = runSeries;
      const payload = await runWorker({
        id: `portfolio-${Date.now()}`, type: 'portfolio', ua, seriesByIns: runSeries, startDate, endDate,
        entryBasis: entryRail.dataset.value || 'LAST', exitBasis: exitRail.dataset.value || 'LAST',
        units: Math.max(1, Math.trunc(safeNum($('pb-units').value, 1))), fees: feesOf(state.settings), settings: state.settings,
        filtered: true, liquidity: liquidity(), maxPerStrategy: effectiveCap(),
        includeInfeasible: $('pb-scope').value === 'all',
      });
      if (runEpoch !== settingsEpoch) throw new Error('فهرست سررسیدهای سقف‌پر هنگام اجرا عوض شد؛ آزمون را دوباره اجرا کن.');
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
    $('pb-workbook').hidden = true;
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
  /**
   * دفترچهٔ کامل — یک فایل، همان تحلیلی که روی صفحه است.
   *
   * سبد فرضی هم اگر ساخته شده باشد داخلش می‌آید، ولی از نو ساخته می‌شود تا
   * برگ اکسل با آنچه روی صفحه است یکی باشد، نه با یک محاسبهٔ قدیمی‌تر.
   */
  $('pb-workbook-run').addEventListener('click', async () => {
    if (!analysis) return;
    const button = $('pb-workbook-run');
    button.disabled = true;
    const note = $('pb-workbook-note');
    const before = note.textContent;
    try {
      const capital = Math.max(0, safeNum($('pb-basket-capital').value, 0)) * 1e6;
      const basket = basketPicks.length
        ? allocatePortfolio({ capitalRial: capital, picks: basketPicks, analysis, basisId: lens.basisId })
        : null;
      // نشانیِ هر ابزار، چه داده آمده باشد چه نیامده. مبنا همان
      // `flattenActiveContracts` است که خودِ ترکیب‌ساز از آن می‌خواند، نه
      // فهرست دیگری — وگرنه فایل نشانیِ ابزاری را می‌داد که اصلاً صدا زده
      // نشده بود.
      const sources = dataSourceRows({
        base: state.settings.baseUrl,
        ua: { ins: String(ua?.ins ?? ''), name: nameOf(ua, 'نماد پایه') },
        contracts: flattenActiveContracts(ua, state.settings.blockedExpiries),
        seriesByIns, errors: seriesErrors, sources: seriesSource, n: 0,
        markDate: Number($('pb-mark').value) ? Number($('pb-exit-date').dataset.value) || 0 : 0,
      });
      await downloadPortfolioBacktest(analysis, {
        basket, generated, census, sources, dateLabel,
        filter: comboFilter, filterRanges: comboRanges,
        context: {
          baseName: nameOf(ua, 'نماد پایه'), baseIns: String(ua?.ins ?? ''),
          entryDate: Number($('pb-entry-date').dataset.value) || null,
          exitDate: Number($('pb-exit-date').dataset.value) || null,
          markLabel: $('pb-mark-state').textContent,
          entryBasis: HISTORY_BASES.find(([key]) => key === (entryRail.dataset.value || 'LAST'))?.[1] || '',
          exitBasis: HISTORY_BASES.find(([key]) => key === (exitRail.dataset.value || 'LAST'))?.[1] || '',
          units: Math.max(1, Math.trunc(safeNum($('pb-units').value, 1))),
          // سقفِ **مؤثر**، نه عددی که تایپ شده. کاربر ۱۰۰۰۰۰۰ زد و اجرا
          // با ۱۰۰۰ رفت، ولی سرشناسه ۱۰۰۰۰۰۰ نوشت — عددی که هیچ‌جا اعمال
          // نشده بود.
          cap: effectiveCap(),
        },
      });
    } catch (error) {
      note.textContent = errorText(error, 'ساخت دفترچه کامل نشد.');
      setTimeout(() => { note.textContent = before; }, 6000);
    } finally { button.disabled = false; }
  });

  /** یادداشت هزینه — پیش از فشردن دکمه، نه بعدش. */
  function paintGrainNote() {
    const meta = grainMeta(grain);
    const intraday = isIntradayGrain(grain);
    $('pb-grain-run').hidden = !intraday;
    if (!intraday) { $('pb-grain-note').textContent = ''; return; }
    const cost = intradayCost({ instruments: Object.keys(seriesByIns).length, grain });
    $('pb-grain-note').textContent = `${meta.hint}. برای این کار ریزمعاملهٔ ${fmt.int(cost.requests)} ابزار در روز سنجش گرفته می‌شود و ${fmt.int(cost.moments)} لحظه قیمت‌گذاری می‌شود. فقط **روز سنجش** ریز می‌شود؛ بقیهٔ بازه همان‌طور می‌ماند. لحظه‌ای که هیچ ابزاری تا آن ثانیه معامله نشده باشد، ستون خالی می‌ماند — قیمت لحظهٔ قبل جایش نمی‌نشیند.`;
  }

  /**
   * اجرای درون‌روزی — همان ترکیب‌ها، لحظه‌به‌لحظه.
   *
   * ماتریس روزانه کنار گذاشته نمی‌شود؛ نگه داشته می‌شود تا بازگشت به
   * «روزانه» اجرای دوباره نخواهد.
   */
  async function runIntraday() {
    if (!analysis || !payloadRows.length) return;
    const endDate = Number($('pb-exit-date').dataset.value);
    const button = $('pb-grain-go');
    button.disabled = true;
    try {
      setStatus('دریافت ریزمعاملهٔ روز سنجش…');
      const { tape, failed, total } = await fetchTape(endDate);
      const combos = payloadRows.map((row) => ({ id: row.id, legs: row.legs }));
      const payload = await runWorker({
        id: `intraday-${Date.now()}`, type: 'portfolio-intraday',
        ua, seriesByIns: runSeriesByIns, tape, grain,
        startDate: Number($('pb-entry-date').dataset.value), endDate,
        entryBasis: entryRail.dataset.value || 'LAST', exitBasis: exitRail.dataset.value || 'LAST',
        units: Math.max(1, Math.trunc(safeNum($('pb-units').value, 1))),
        fees: feesOf(state.settings), settings: state.settings, liquidity: liquidity(), combos,
      });
      const live = payload.columns.filter((column) => column.marked);
      if (!live.length) throw new Error('در هیچ لحظه‌ای از روز سنجش، ابزاری معامله نشده بود');
      // ماتریس تازه: ستون‌ها لحظه‌اند، سطرها همان ترکیب‌های اجرای روزانه.
      const dates = live.map((column) => column.key);
      const columnOf = new Map(dates.map((key, index) => [key, index]));
      const rowOf = new Map(payloadRows.map((row, index) => [row.id, index]));
      const pnl = new Float64Array(payloadRows.length * dates.length).fill(NaN);
      for (const row of payload.rows) {
        const y = rowOf.get(row.comboId), x = columnOf.get(row.key);
        if (y === undefined || x === undefined) continue;
        pnl[(y * dates.length) + x] = row.netPnl;
      }
      // قیمت نماد پایه در هر لحظه از خودِ ستون‌ها می‌آید. `baseSeries` هم
      // دیگر یکسره `null` نیست: درصدِ حرکت پایه نسبت به نخستین لحظهٔ
      // قیمت‌دارِ همان روز، که در دانه‌بندی درون‌روزی همان مبدأ درست است.
      const priceAt = new Map(live.map((column) => [column.key, column.basePrice ?? null]));
      const basePrices = dates.map((key) => priceAt.get(key) ?? null);
      const firstPrice = basePrices.find((value) => value !== null && value > 0) ?? null;
      const baseSeries = basePrices.map((value) => (value !== null && value > 0 && firstPrice > 0
        ? ((value / firstPrice) - 1) * 100 : null));
      payloadMatrix = { dates, pnl, rowCount: payloadRows.length, baseSeries, basePrices };
      lens = { ...lens, from: null, to: null };
      paintLensOptions();
      recompute();
      setStatus(`${fmt.int(live.length)} لحظه از ${fmt.int(payload.moments)} لحظه قیمت داشت${failed ? ` · ریزمعاملهٔ ${fmt.int(failed)} از ${fmt.int(total)} ابزار دریافت نشد` : ''}.`);
    } catch (error) {
      setStatus(errorText(error, 'اجرای درون‌روزی کامل نشد.'), true);
    } finally { button.disabled = false; }
  }

  $('pb-grain').addEventListener('change', (event) => {
    grain = normalizeGrain(event.target.value);
    paintGrainNote();
    // بازگشت به روزانه، ماتریس نگه‌داشته‌شده را برمی‌گرداند — بی‌اجرای دوباره.
    if (!isIntradayGrain(grain) && dailyMatrix) {
      payloadMatrix = dailyMatrix;
      payloadRows = dailyRows;
      lens = { ...lens, from: null, to: null };
      paintLensOptions();
      recompute();
      setStatus('بازگشت به دانه‌بندی روزانه.');
    }
  });
  $('pb-grain-go').addEventListener('click', runIntraday);
  $('bk-payoff-bins').addEventListener('change', () => paintBasketGroup(basketGroup));

  $('pb-lens-toggle').addEventListener('click', () => {
    setLensOpen($('pb-lens').dataset.open !== 'true');
  });
  $('pb-lens-reset').addEventListener('click', () => {
    lens = { ...lens, from: null, to: null };
    paintLensOptions();
    recompute();
  });

  $('pb-graph-threshold').addEventListener('change', () => { dirty.add('parts'); paintPanel('parts'); });
  $('pb-heat-mode').addEventListener('change', (event) => {
    heatMode = event.target.value;
    dirty.add('heatmap');
    paintPanel('heatmap');
  });
  for (const [id, set] of [['pb-heat-sort', (value) => { heatSort = value; }], ['pb-heat-palette', (value) => { heatPalette = value; }]]) {
    $(id).addEventListener('change', (event) => { set(event.target.value); dirty.add('heatmap'); paintPanel('heatmap'); });
  }
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
  $('pb-band-pick').addEventListener('change', (event) => {
    bandPick = event.target.value;
    dirty.add('trend');
    paintPanel('trend');
  });
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
    const next = (analysis?.strategies || []).find((row) => !basketPicks.some((pick) => pick.strategyId === row.strategyId))
      || (analysis?.strategies || [])[0];
    if (!next) return;
    const here = currentRunId();
    const source = sourceOf(here) || { analysis };
    const comboId = firstComboId(source, next.strategyId);
    // سهم از آنچه آزاد مانده برداشته می‌شود، نه یک عدد ثابت: ۴۰+۳۵+۲۵
    // دقیقاً صد است و ۱۰٪ ثابت، مجموع را به ۱۱۰ می‌برد و کل سبد رد
    // می‌شود. و اگر بهای یک قرارداد معلوم باشد، سهم دست‌کم یکی است.
    const added = addPick({
      picks: basketPicks, pick: { sourceId: here, strategyId: next.strategyId, comboId },
      capitalRial: basketCapital(), lotCost: lotCostRial(source, comboId, lens.basisId),
    });
    basketPicks = added.picks;
    // پیش از رسم، نه بعدش: خبر باید با همان چیدمانی بیاید که توصیفش
    // می‌کند، وگرنه یک بار عقب می‌افتد.
    basketRebalanced = added.rebalanced;
    paintBasket();
  });
  $('pb-basket-rows').addEventListener('change', (event) => {
    const field = event.target.closest('[data-basket]');
    if (!field) return;
    basketPicks = applyBasketEdit({
      picks: basketPicks,
      index: Number(field.dataset.index),
      key: field.dataset.basket,
      value: field.dataset.basket === 'pct' ? Math.max(0, safeNum(field.value, 0))
        : field.dataset.basket === 'on' ? field.checked : field.value,
      sources: basketSources(),
    });
    basketRebalanced = false;
    paintBasket();
  });
  $('pb-basket-rows').addEventListener('click', (event) => {
    const button = event.target.closest('[data-basket-remove]');
    if (!button) return;
    const index = Number(button.dataset.basketRemove);
    basketPicks = basketPicks.filter((pick, at) => at !== index);
    basketRebalanced = false;
    paintBasket();
  });
  $('pb-basket-run').addEventListener('click', () => { basketRebalanced = false; paintBasket(); });
  $('pb-basket-capital').addEventListener('change', () => { basketRebalanced = false; paintBasket(); });

  entryRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(entryRail, button.dataset.basis); if (ua) refreshDates(); } });
  exitRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(exitRail, button.dataset.basis); if (ua) refreshDates(); } });
  $('pb-load').addEventListener('click', loadHistory); $('pb-run').addEventListener('click', runAll);
  const onSettingsChanged = (event) => {
    if (!(event.detail?.keys || []).includes('blockedExpiries')) return;
    // اگر قبلاً تاریخچه گرفته شده، مجموعه سری‌ها به فهرست قراردادهای قدیمی
    // تعلق دارد. به‌ویژه با برداشتن تیک، قرارداد تازه‌آزادشده هیچ سری‌ای
    // ندارد و اجرای مجدد به‌تنهایی نمی‌تواند آن را وارد ترکیب کند.
    const hadHistory = historyLoading || Object.keys(seriesByIns).length > 0;
    settingsEpoch += 1;
    hideReport();
    if (hadHistory && baseSelect.value) {
      setStatus('فهرست سررسیدهای سقف‌پر تغییر کرد؛ تاریخچهٔ قراردادها دوباره بارگیری می‌شود…');
      void loadHistory();
    } else {
      setStatus('فهرست سررسیدهای سقف‌پر تغییر کرد؛ بارگیری بعدی با همین فهرست انجام می‌شود.');
    }
  };
  document.addEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
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

  // ——— فهرست قراردادها از **بازه** می‌آید، نه از تابلوی امروز ———
  //
  // پیش از این همین‌جا `/api/history/universe` بی‌تاریخ صدا می‌شد. یعنی
  // هر آزمونِ گذشته فقط روی قراردادهایی اجرا می‌شد که تا امروز زنده
  // مانده‌اند، و آن‌هایی که داخل بازهٔ آزمون سررسید شده بودند — یعنی
  // مرتبط‌ترینشان — اصلاً وارد هیچ ترکیبی نمی‌شدند.
  let rangeUi = null, rangeJob = null;

  function fillBases(payload) {
    const keep = baseSelect.value;
    chain = buildChain(payload.rows || []);
    baseSelect.innerHTML = '<option value="">نماد پایه را انتخاب کن</option>';
    for (const item of [...chain.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fa'))) {
      const option = document.createElement('option'); option.value = item.ins; option.textContent = `${nameOf(item, 'نماد پایه')} · ${fmt.int(item.contracts)} قرارداد`; baseSelect.appendChild(option);
    }
    // انتخابِ کاربر با عوض شدن بازه پاک نمی‌شود، اگر همان نماد هنوز در
    // بازهٔ تازه قرارداد داشته باشد.
    if (keep && chain.has(keep)) baseSelect.value = keep;
    const expired = payload.summary?.expiredInside || 0;
    setStatus(`${fmt.int(chain.size)} نماد پایه در این بازه؛ ${fmt.int(payload.rosterContracts || 0)} قرارداد که ${fmt.int(expired)} تای آن‌ها داخل همین بازه سررسید شده‌اند. ${fmt.int(CATALOG.filter((item) => item.feasible).length)} استراتژی قابل اجرا.`);
  }

  async function loadUniverseForRange(range) {
    rangeJob?.stop();
    baseSelect.innerHTML = '<option value="">در حال دریافت…</option>';
    rangeJob = loadRange(range, rangeUi, { onUpdate: fillBases });
    try { fillBases(await rangeJob.first); }
    catch (error) {
      baseSelect.innerHTML = '<option value="">دریافت ناموفق</option>';
      setStatus(errorText(error, 'فهرست قراردادهای این بازه دریافت نشد.'), true);
    }
  }

  rangeUi = mountHistoryRange($('pb-range'), { onApply: (range) => { hideReport(); loadUniverseForRange(range); } });
  await loadUniverseForRange(rangeUi.range);

  return () => {
    activeWorker?.terminate();
    rangeJob?.stop();
    charts.disposeAll();
    document.removeEventListener(SETTINGS_CHANGED_EVENT, onSettingsChanged);
  };
}
