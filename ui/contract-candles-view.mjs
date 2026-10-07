// تب‌های «کندل قیمت امروز قراردادها» و «کندل بازار در گذشته» در رصد لحظه‌ای.
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۵): کندل امروز از تب «نقشه و زنجیره» به
// تبی جدا آمد، با گزینش مستقل (نه از نقشه). بالای تب نمودار مادر است: همهٔ
// کندل‌های گزینش، عمودی، روی یک محور قابل مقایسه (لگاریتمی) و با شاخص
// قابل انتخاب. زیرش روایت به زبان معامله‌گر، نمودار توزیع، و همان کندل‌های
// افقی قبلی. منطق عددی همه در `core/contract-candles.mjs` است.
//
// دور دوم (همان روز): دستگیره‌های کشویی هم‌زمان (ارزش، حجم، …)، رنگ جدا برای
// پوت، حذف کندل پرت (کلیک، خودکار، مقیاس مقاوم)، میلهٔ ارزش/حجم/… زیر هر
// کندل، نمودار توزیع دقیق‌تر با آمار کامل، و همین نما برای یک روز گذشته
// (`mode: 'past'`، داده از `ui/contract-candles-past.mjs`).

import { fmt, faDigits } from './fmt.mjs';
import { mountChart, chartBase } from './chart-host.mjs';
import { mountCandlePoints } from './candle-points.mjs';
import { fetchInfos } from './quote-intake.mjs';
import { saveBlob } from './save-file.mjs';
import { icon } from './icons.mjs';
import { mountDateWheel } from './datewheel.mjs';
import { historyDates } from './strategy-history.mjs';
import { fetchPastUniverse, pastUnderlyings, loadPastDay } from './contract-candles-past.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { todayCompact } from '../core/history-range.mjs';
import { tradingDays } from '../core/roster-scan.mjs';
import { rangeHeading } from '../core/range-info.mjs';
import { pctVsYesterday } from '../core/price-change.mjs';
import { IV_WHY_LABEL } from '../core/live-market.mjs';
import {
  CANDLE_POINTS, POINT_LABEL, CANDLE_METRICS, X_MODES, SORT_KEYS, sortValue, COMPOSITE_WEIGHTS, compositeCandle, compositeByGroup, compositeValue, backgroundBarAxis, metricOf, useLog, toAxis, fromAxis, logTicks,
  metricShape, candleRecord, underlyingDay, filterCandles, underlyingTurnover, orderCandles,
  groupBands, candleStats, flagUnusual, candleNarrative, staleInfoIds, histogram,
  SLIDER_FIELDS, SLIDER_STEPS, sliderScale, applyRanges, outlierIds, robustExtent, HIST_WEIGHTS, HIST_GROUPS, candleSummary, chainBreakevens, chainKey,
} from '../core/contract-candles.mjs';
import { downloadCandleWorkbook } from './contract-candles-export.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const dateLabel = (value) => faDigits(historyDateLabel(value));
const kindLabel = (kind) => (kind === 'call' ? 'اختیار خرید' : 'اختیار فروش');
const tone = (value) => (Number(value) > 0 ? 'gain' : Number(value) < 0 ? 'loss' : '');
const pctVsYday = pctVsYesterday;
const STORE = 'options-radar:contract-candles';
const PRESETS = 'options-radar:contract-candles-presets';
const INFO_TTL_MS = 60_000;
const LIST_STEP = 40;
const COLOR_BY = [['direction', 'جهت · کال سبز/قرمز، پوت بنفش/نارنجی'], ['kind', 'کال و پوت'], ['underlying', 'نماد پایه'], ['expiry', 'سررسید']];
const HIST_POINTS = [['last', 'آخرین'], ['close', 'پایانی'], ['first', 'اولین'], ['low', 'کمینه'], ['high', 'بیشینه'], ['range', 'طول کندل (بیشینه − کمینه)']];
const BAR_KEYS = [['none', 'بدون میله'], ['value', 'ارزش معاملات'], ['volume', 'حجم'], ['oi', 'موقعیت باز'], ['trades', 'تعداد معامله']];
const SORT_DIRS = [['desc', 'نزولی'], ['asc', 'صعودی']];
const COMPOSITE_POINTS = [['last', 'آخرین'], ['close', 'پایانی'], ['first', 'اولین'], ['low', 'کمینه'], ['high', 'بیشینه']];
const TAILS = [[0, 'بی‌برش'], [0.01, '۱٪ هر سر'], [0.02, '۲٪ هر سر'], [0.05, '۵٪ هر سر']];

const DEFAULTS = {
  side: 'all', metric: 'change', log: true, xMode: 'grouped', sortKey: 'strike', sortDir: 'auto', composite: 'value', compositePoint: 'last', colorBy: 'direction',
  underlyings: [], dates: [], expiries: [], top: 0, unusualOnly: false, uaSort: 'value', uaSearch: '',
  ranges: {}, hidden: [], clickRemove: false, robust: false, bars: 'value', barsLog: true,
  histMetric: 'change', histPoint: 'last', histBins: 12, histWidth: 0, histUnit: 'contract', histWeight: 'count',
  histGroup: 'kind', histTails: 0.02, histPercent: false, histLines: true, histKde: true, histCum: false,
  listSort: 'value', listDir: 'desc',
};
const FILTER_KEYS = ['side', 'underlyings', 'dates', 'expiries', 'top', 'unusualOnly', 'ranges', 'metric', 'log', 'xMode', 'sortKey', 'sortDir', 'composite', 'compositePoint', 'colorBy', 'bars'];

/** برچسب محور: بی دنبالهٔ «٫۰۰»؛ عدد کوچک یک یا دو رقم اعشار. */
function axisText(metric, value, decimals = null) {
  const m = metricOf(metric);
  if (!Number.isFinite(value)) return '';
  const a = Math.abs(value), digits = decimals ?? (a >= 10 ? 0 : a >= 1 ? 1 : 2);
  const text = faDigits(String(Number(value.toFixed(digits))).replace('-', '−').replace('.', '٫'));
  return m.unit === 'pct' ? `${text}٪` : text;
}

/** قالب نمایشی هر شاخص. */
function metricText(metric, value) {
  const m = metricOf(metric);
  if (!Number.isFinite(value)) return '—';
  return m.unit === 'pct' ? `${fmt.pct(value)}٪` : fmt.num(value);
}

/** قالب میدان دستگیره. */
function fieldText(unit, value) {
  if (!Number.isFinite(value)) return '—';
  if (unit === 'rial') return fmt.rialText(value);
  if (unit === 'pct') return `${fmt.pct(value)}٪`;
  return fmt.int(Math.round(value));
}

/**
 * سوار کردن تب. `getPayload` همان بدنهٔ `/api/live-dashboard` است،
 * `getSettings` تنظیمات (برای حل‌گر تلاطم)، `greekParams` پارامتر یونانی‌ها.
 * `mode: 'past'` همان نما را برای یک روز گذشته می‌سازد: بالای تب انتخاب روز
 * و نماد است و داده از `loadPastDay` می‌آید، نه از عکس زنده.
 */
export function mountContractCandles(host, { mode = 'live', getPayload, getSettings = () => ({}), greekParams = () => ({}), isVisible = () => true, onOpenContract = null } = {}) {
  const past = mode === 'past';
  const storeKey = past ? `${STORE}:past` : STORE;
  const readOpts = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
      const body = saved && typeof saved === 'object' ? saved : {};
      // نسخهٔ پیشین «رتبه بر» داشت؛ همان انتخاب به مرتب‌سازی تازه می‌رود.
      if (body.rankKey && !body.sortKey) body.sortKey = body.rankKey;
      return { ...DEFAULTS, ...body };
    } catch { return { ...DEFAULTS }; }
  };
  const readPresets = () => {
    try { const v = JSON.parse(localStorage.getItem(PRESETS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
  };
  let opts = readOpts();
  if (!opts.ranges || typeof opts.ranges !== 'object') opts.ranges = {};
  if (!Array.isArray(opts.hidden)) opts.hidden = [];
  let presets = readPresets();
  const infoCache = new Map();
  let infoVersion = 0, fetching = false, fetchError = '', listLimit = LIST_STEP;
  let recordCache = { key: '', map: new Map() };
  let drawable = [], shapes = [], flags = new Map(), pinned = '', zoom = { sig: '', ranges: null };
  let mother = null, hist = null, motherSeq = 0, histSeq = 0, lastHist = null, lastHistComp = null;
  let sliderSig = '', scales = {}, paintQueued = false;
  // حالت گذشته: روز، فهرست آن روز، و بدنهٔ ساخته‌شده.
  let pastState = { date: 0, universe: null, unders: [], picked: new Set(), loading: false, note: '', payload: null, progress: '' };

  const save = () => { try { localStorage.setItem(storeKey, JSON.stringify(opts)); } catch { /* حافظهٔ بسته؛ همین نشست می‌ماند */ } };
  const set = (patch) => { opts = { ...opts, ...patch }; save(); paint(); };
  /** رنگ‌آمیزی هم‌زمان با کشیدن دستگیره، حداکثر یک بار در هر فریم. */
  const paintSoon = () => {
    if (paintQueued) return;
    paintQueued = true;
    (globalThis.requestAnimationFrame || ((f) => setTimeout(f, 16)))(() => { paintQueued = false; paint(); });
  };

  const opt = (list, value) => list.map(([v, t]) => `<option value="${v}"${String(v) === String(value) ? ' selected' : ''}>${t}</option>`).join('');
  host.innerHTML = `<div class="ccv">
    ${past ? `<section class="card ccv-past">
      <div class="section-head"><div><p class="eyebrow">کندل بازار در گذشته</p><h2>یک روز گذشته را انتخاب کن</h2></div><span class="note" data-ccv-past-status role="status"></span></div>
      <div class="ccv-past-grid"><div class="ccv-past-cal" data-ccv-past-cal></div>
        <div class="ccv-past-pick"><div class="ccv-pick-head"><b>نمادهای پایهٔ آن روز</b><span class="ccv-buttons"><button type="button" class="ghost" data-ccv-past-all>همه</button><button type="button" class="ghost" data-ccv-past-top>۱۰ نماد پرقرارداد</button><button type="button" class="ghost" data-ccv-past-none>هیچ</button></span></div>
          <div class="ccv-chips" data-ccv-past-uas><p class="empty-note">اول روز را انتخاب کن.</p></div>
          <div class="ccv-row"><button type="button" class="primary" data-ccv-past-load disabled>دریافت کندل‌های این روز</button><span class="note" data-ccv-past-cost></span></div></div></div>
      <p class="note">قیمت‌ها از ردیف روزانهٔ همان روز (اولین، کمینه، بیشینه، آخرین، پایانی، حجم و ارزش)؛ فهرست قراردادها از بایگانی همان روز یا دفتر قراردادها، پس قرارداد سررسیدشده هم هست. دفتر سفارش گذشته وجود ندارد: تلاطم اجرایی و اسپرد خالی می‌مانند.</p>
    </section>` : ''}
    <section class="card ccv-filters">
      <div class="section-head"><div><p class="eyebrow">${past ? 'گزینش روی دادهٔ همان روز' : 'گزینش مستقل از نقشه'}</p><h2 data-ccv-title>${past ? 'کندل قیمت قراردادها در گذشته' : 'کندل قیمت امروز قراردادها'}</h2></div>
        <div class="ccv-actions"><button type="button" class="ghost" data-ccv-export="xlsx">خروجی کامل اکسل</button><button type="button" class="ghost" data-ccv-export="png">تصویر نمودار مادر</button></div></div>
      <p class="note" data-ccv-status role="status"></p>
      <div class="ccv-row">
        <div class="ccv-seg" role="group" aria-label="نوع قرارداد">${[['all', 'کال و پوت'], ['call', 'فقط کال'], ['put', 'فقط پوت']].map(([v, t]) => `<button type="button" data-ccv-side="${v}">${t}</button>`).join('')}</div>
        <label>فقط N قرارداد پرارزش‌تر<select data-ccv="top">${[0, 20, 50, 100, 200, 500].map((v) => `<option value="${v}">${v ? fmt.int(v) : 'همه'}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-ccv="unusualOnly"> فقط غیرعادی‌ها</label>
        <label>پیش‌تنظیم<select data-ccv-preset></select></label>
        <button type="button" class="ghost" data-ccv-preset-save>ذخیرهٔ گزینش</button><button type="button" class="ghost" data-ccv-preset-del>حذف پیش‌تنظیم</button>
      </div>
      <div class="ccv-pick">
        <div class="ccv-pick-head"><b>نمادهای پایه</b><input type="search" data-ccv="uaSearch" placeholder="جست‌وجوی نماد"><label>ترتیب<select data-ccv="uaSort"><option value="value">ارزش کل اختیار</option><option value="callValue">ارزش کال</option><option value="putValue">ارزش پوت</option><option value="name">نام</option></select></label>
          <span class="ccv-buttons"><button type="button" class="ghost" data-ccv-ua="all">همه</button><button type="button" class="ghost" data-ccv-ua="top-callValue">۱۰ نماد برتر ارزش کال</button><button type="button" class="ghost" data-ccv-ua="top-putValue">۱۰ نماد برتر ارزش پوت</button><button type="button" class="ghost" data-ccv-ua="top-value">۱۰ نماد برتر کل</button></span></div>
        <div class="ccv-chips" data-ccv-uas></div>
      </div>
      <div class="ccv-pick">
        <div class="ccv-pick-head"><b>سررسید</b><span class="note">تاریخ‌های کل بازار؛ اگر نماد انتخاب کنی، سررسیدهای هر نماد جدا هم می‌آید و فقط همان نماد را محدود می‌کند.</span><button type="button" class="ghost" data-ccv-exp-clear>همهٔ سررسیدها</button></div>
        <div class="ccv-chips" data-ccv-dates></div>
        <div class="ccv-ua-exp" data-ccv-ua-exp></div>
      </div>
    </section>
    <section class="card ccv-mother">
      <div class="section-head"><div><p class="eyebrow">نمودار مادر</p><h3>همهٔ کندل‌های گزینش روی یک محور</h3><span class="note" data-ccv-count></span></div>
        <div class="ccv-icons"><button type="button" class="ghost ccv-icon" data-ccv-export="png" title="ذخیرهٔ تصویر نمودار" aria-label="ذخیرهٔ تصویر نمودار">${icon('camera')}</button><button type="button" class="ghost ccv-icon" data-ccv-full title="تمام‌صفحه" aria-label="تمام‌صفحه">${icon('expand')}</button></div></div>
      <div class="ccv-row">
        <label>محور عمودی<select data-ccv="metric">${CANDLE_METRICS.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}</select></label>
        <label class="check" data-ccv-log-wrap><input type="checkbox" data-ccv="log"> محور لگاریتمی</label>
        <label>محور افقی<select data-ccv="xMode">${X_MODES.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}</select></label>
        <label data-ccv-rank-wrap>مرتب‌سازی قراردادها<select data-ccv="sortKey">${SORT_KEYS.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}</select></label>
        <label data-ccv-dir-wrap>جهت<select data-ccv="sortDir"><option value="auto">پیش‌فرض</option>${opt(SORT_DIRS, opts.sortDir)}</select></label>
        <label title="یک خط افقی از همهٔ کندل‌های گزینش: میانگین وزنی همان نقطه">شاخص ترکیبی<select data-ccv="composite">${opt(COMPOSITE_WEIGHTS, opts.composite)}</select></label>
        <label data-ccv-comp-point-wrap>خط شاخص روی<select data-ccv="compositePoint">${opt(COMPOSITE_POINTS, opts.compositePoint)}</select></label>
        <label>رنگ بر اساس<select data-ccv="colorBy">${opt(COLOR_BY, opts.colorBy)}</select></label>
        <label>لایهٔ میله پشت کندل‌ها<select data-ccv="bars">${opt(BAR_KEYS, opts.bars)}</select></label>
        <label class="check" data-ccv-barslog-wrap><input type="checkbox" data-ccv="barsLog"> میلهٔ لگاریتمی</label>
      </div>
      <details class="ccv-sliders-box" open><summary>فیلترهای کشویی — همان لحظه اعمال می‌شوند <button type="button" class="ghost" data-ccv-ranges-reset>بازنشانی همه</button></summary>
        <div class="ccv-sliders" data-ccv-sliders></div>
        <p class="note">ارزش، حجم، تعداد و موقعیت باز روی مقیاس لگاریتمی حرکت می‌کنند (اولین خانه صفر است). قراردادی که میدان یک دستگیرهٔ فعال را ندارد کنار می‌رود و شمرده می‌شود.</p>
      </details>
      <div class="ccv-outliers">
        <b>کندل‌های پرت</b>
        <label class="check"><input type="checkbox" data-ccv="clickRemove"> کلیک = حذف کندل از نمودار</label>
        <label class="check"><input type="checkbox" data-ccv="robust"> مقیاس مقاوم (محور از صدک ۲ تا ۹۸؛ بیرون‌زده‌ها پیکان لبه می‌گیرند)</label>
        <button type="button" class="ghost" data-ccv-auto-outliers>حذف خودکار پرت‌ها (بیرون از ۳ × فاصلهٔ میان‌چارکی)</button>
        <div class="ccv-hidden" data-ccv-hidden></div>
      </div>
      <div class="ccv-legend" data-ccv-legend></div>
      <div class="ccv-chart" data-ccv-chart="mother"></div>
      <div class="ccv-pin" data-ccv-pin hidden></div>
      <div class="ccv-composite" data-ccv-composite></div>
      <div class="ccv-summary" data-ccv-summary></div>
      <div class="ccv-stats" data-ccv-stats></div>
      <div class="ccv-story"><h4>این نمودار چه می‌گوید</h4><ul data-ccv-story></ul></div>
    </section>
    <section class="card ccv-hist">
      <div class="section-head"><div><p class="eyebrow">توزیع آماری</p><h3>چند قرارداد در هر بازه</h3></div><span class="note">هر میله یک بازهٔ دقیق [از، تا) است؛ دو سرِ بریده در «کمتر از» و «بیشتر از» جمع می‌شوند و گم نمی‌شوند.</span></div>
      <div class="ccv-row">
        <label>شاخص<select data-ccv="histMetric">${CANDLE_METRICS.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}</select></label>
        <label data-ccv-hist-point>نقطهٔ کندل<select data-ccv="histPoint">${opt(HIST_POINTS, opts.histPoint)}</select></label>
        <label>واحد شمارش<select data-ccv="histUnit"><option value="contract">قرارداد</option><option value="underlying">نماد پایه (میانهٔ قراردادهایش)</option></select></label>
        <label>وزن میله<select data-ccv="histWeight">${opt(HIST_WEIGHTS, opts.histWeight)}</select></label>
        <label>گروه‌بندی<select data-ccv="histGroup">${opt(HIST_GROUPS, opts.histGroup)}</select></label>
        <label>شمار بازه‌ها<select data-ccv="histBins">${[6, 8, 10, 12, 16, 20, 24, 32, 40].map((v) => `<option value="${v}">${fmt.int(v)}</option>`).join('')}</select></label>
        <label>پهنای بازه (۰ = خودکار)<input type="number" min="0" step="any" data-ccv="histWidth" dir="ltr"></label>
        <label>برش دنباله‌ها<select data-ccv="histTails">${opt(TAILS, opts.histTails)}</select></label>
      </div>
      <div class="ccv-row">
        <label class="check"><input type="checkbox" data-ccv="histPercent"> محور عمودی به درصد</label>
        <label class="check"><input type="checkbox" data-ccv="histLines"> خط میانگین، میانه و چارک‌ها</label>
        <label class="check"><input type="checkbox" data-ccv="histKde"> منحنی چگالی</label>
        <label class="check"><input type="checkbox" data-ccv="histCum"> خط تجمعی</label>
      </div>
      <div class="ccv-chart ccv-chart-short" data-ccv-chart="hist"></div>
      <div class="ccv-stats" data-ccv-hist-stats></div>
      <p class="note" data-ccv-hist-note></p>
    </section>
    <section class="card ccv-list-card">
      <div class="lmm-step-head"><div><h3>کندل افقی هر قرارداد</h3><span>سایه: کمترین تا بیشترین · بدنه: اولین تا آخرین · لوزی: قیمت پایانی</span></div><div class="lmm-range-sort" data-lmm-range-sort role="group" aria-label="مرتب‌سازی نمودار کندلی روزانه"></div></div>
      <div data-lmm-range-status class="note"></div><div data-lmm-range-chart></div>
    </section>
  </div>`;

  const q = (sel) => host.querySelector(sel);
  const field = (name) => q(`[data-ccv="${name}"]`);
  const payload = () => (past ? pastState.payload : getPayload?.()) || {};
  const universe = () => payload().universe || { underlyings: [], contracts: [] };

  // ── گزینش ─────────────────────────────────────────────────────────
  const filterOf = () => ({
    side: opts.side, underlyings: opts.underlyings, dates: opts.dates, expiries: opts.expiries,
    top: Number(opts.top) || 0,
  });

  function uaDayMap() {
    const out = new Map();
    const spotOf = new Map((universe().contracts || []).map((row) => [String(row.uaIns), row.spot]));
    for (const ua of universe().underlyings || []) {
      out.set(String(ua.ins), underlyingDay(ua, infoCache.get(String(ua.ins))?.info || null, spotOf.get(String(ua.ins))));
    }
    return out;
  }

  /** رکوردها فقط وقتی عکس یا پاسخ اطلاعات عوض شد دوباره ساخته می‌شوند. */
  function recordsFor(pool, uaDays) {
    const key = `${payload().at || ''}:${payload().snapshotAt || ''}:${infoVersion}`;
    if (recordCache.key !== key) recordCache = { key, map: new Map(), chains: chainBreakevens(universe().contracts || []) };
    const settings = getSettings() || {}, params = greekParams() || {};
    return pool.map((row) => {
      let rec = recordCache.map.get(String(row.ins));
      if (!rec) {
        rec = candleRecord(row, { info: infoCache.get(String(row.ins))?.info || null, uaDay: uaDays.get(String(row.uaIns)), settings, params, chainBe: recordCache.chains.get(chainKey(row)) });
        recordCache.map.set(String(row.ins), rec);
      }
      return rec;
    });
  }

  // ── دریافت کمینه/بیشینه: فقط وقتی تب دیده می‌شود و فقط کهنه‌ها ─────
  async function ensureInfos(pool) {
    if (past || fetching || !isVisible()) return;
    const ids = [...pool.map((row) => String(row.ins)), ...new Set(pool.map((row) => String(row.uaIns)))];
    const stale = staleInfoIds(ids, infoCache, Date.now(), INFO_TTL_MS);
    if (!stale.length) return;
    fetching = true; fetchError = '';
    paintStatus(pool.length, drawable.length);
    try {
      const got = await fetchInfos(stale);
      const at = Date.now();
      for (const [ins, info] of Object.entries(got.byIns || {})) infoCache.set(String(ins), { at, info });
      if (got.errors?.length) fetchError = got.errors[0].why || '';
      infoVersion += 1;
    } catch (error) {
      fetchError = String(error?.message || error);
    } finally {
      fetching = false;
    }
    paint();
  }

  // ── رنگ ──────────────────────────────────────────────────────────
  //
  // «در نمودار مادر پوت‌ها را توخالی نکش، رنگ دیگری برایش تعریف کن.» کال
  // سبز/قرمز، پوت بنفش/نارنجی (`--candle-put-up`/`--candle-put-down`).
  function colorOf(r, s, t, groups) {
    if (opts.colorBy === 'kind') return r.kind === 'put' ? t.putUp : t.series[0];
    if (opts.colorBy === 'underlying') return t.palette[groups.ua.get(r.uaIns) % t.palette.length];
    if (opts.colorBy === 'expiry') return t.palette[groups.exp.get(r.endDate) % t.palette.length];
    // جهت: کندل از اولین به آخرینِ همان شاخص؛ نقطه و بازه از جهت روزِ قرارداد.
    const d = s.shape === 'candle' ? s.close - s.open : r.points.change.last;
    if (r.kind === 'put') return d > 0 ? t.putUp : d < 0 ? t.putDown : t.muted;
    return d > 0 ? t.gain : d < 0 ? t.loss : t.muted;
  }
  const extraTokens = (t) => {
    const style = getComputedStyle(document.body);
    return { ...t, putUp: style.getPropertyValue('--candle-put-up').trim(), putDown: style.getPropertyValue('--candle-put-down').trim() };
  };

  // ── راهنمای شناور و جزئیات ──────────────────────────────────────
  function detailHtml(r) {
    const m = metricOf(opts.metric), s = metricShape(r, m.key);
    const rows = CANDLE_POINTS.map((p) => `<tr><th>${POINT_LABEL[p]}</th><td>${fmt.money(r[p])}</td><td class="${tone(r.points.change[p])}">${fmt.pct(r.points.change[p])}٪</td><td>${fmt.money(r.ua[p])}</td><td>${Number.isFinite(r.points.iv[p]) ? `${fmt.pct(r.points.iv[p])}٪` : `<small>${esc(IV_WHY_LABEL[r.ivWhy[p]] || '—')}</small>`}</td><td>${metricText('premium', r.points.premium[p])}</td></tr>`).join('');
    const shapeLine = s ? (s.shape === 'candle'
      ? `${esc(m.short)}: اولین ${metricText(m.key, s.open)} · آخرین ${metricText(m.key, s.close)} · پایانی ${metricText(m.key, s.mark)} · بازه ${metricText(m.key, s.low)} تا ${metricText(m.key, s.high)}`
      : s.shape === 'range'
        ? `تلاطم مظنه خرید ${metricText('iv', s.marks.bid)} · میانه ${metricText('iv', s.marks.mid)} · فروش ${metricText('iv', s.marks.ask)} · آخرین ${metricText('iv', s.marks.last)}`
        : `${esc(m.label)}: ${metricText(m.key, s.mark)}`) : '';
    const flag = flags.get(r.ins);
    // دو ستون: جدول پنج قیمت یک طرف، بقیه طرف دیگر — تا راهنما کوتاه بماند و
    // در هر پنجره‌ای جا شود.
    return `<div class="ccv-tip is-wide" dir="rtl">
      <header><b>${esc(r.name)}</b><span>${kindLabel(r.kind)} · ${esc(r.uaName)} · اعمال ${fmt.money(r.strike)} · سررسید ${dateLabel(r.endDate)} · ${fmt.int(r.days)} روز</span></header>
      ${shapeLine ? `<p class="ccv-tip-metric">${shapeLine}</p>` : ''}
      <div class="ccv-tip-col"><table><thead><tr><th></th><th>قیمت</th><th>٪ دیروز</th><th>پایهٔ جفت</th><th>تلاطم</th><th>٪ پایه</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="ccv-tip-col"><p>پایانی روز قبل ${fmt.money(r.yday)} · دامنه روز ${fmt.pct(r.dayRangePct)}٪ · جای آخرین در بازه ${fmt.pct(r.dayPositionPct)}٪ · پایه همان روز <span class="${tone(r.uaChangePct)}">${fmt.pct(r.uaChangePct)}٪</span></p>
      <p>ارزش ${fmt.rialText(r.value)} · حجم ${fmt.int(r.volume)} · ${fmt.int(r.trades)} معامله · موقعیت باز ${fmt.int(r.oi)} (${fmt.pct(r.oiChangePct)}٪)</p>
      <table class="ccv-tip-be"><tbody>
        <tr><th>سربه‌سر قرارداد</th><td>${fmt.money(r.breakeven)}</td><td>فاصلهٔ پایه تا آن ${fmt.money(r.breakevenGap)} (${fmt.pct(r.breakevenGapPct)}٪)</td></tr>
        <tr><th>سربه‌سر وزنی زنجیره</th><td>${fmt.money(r.chainBreakeven)}</td><td>${Number.isFinite(r.chainBreakeven) ? `${fmt.int(r.chainBreakevenCount)} ${r.kind === 'put' ? 'پوت' : 'کال'} هم‌سررسید، وزن ارزش` : 'زنجیره معاملهٔ وزن‌دار نداشت'}</td></tr>
        <tr><th>فاصله از سربه‌سر وزنی</th><td class="${tone(r.beVsChain)}">${fmt.money(r.beVsChain)}</td><td>${Number.isFinite(r.beVsChainPct) ? `${fmt.pct(r.beVsChainPct)}٪ — ${r.beVsChain > 0 ? 'بالاتر از' : r.beVsChain < 0 ? 'پایین‌تر از' : 'برابر'} میانگین زنجیره` : '—'}</td></tr>
      </tbody></table>
      <p>مظنه ${fmt.money(r.bid)} / ${fmt.money(r.ask)} · اسپرد ${fmt.pct(r.spreadPct)}٪ · دلتا ${fmt.num(r.delta)} · اهرم مؤثر ${fmt.num(r.effectiveLeverage)} · فاصله اعمال ${fmt.pct(r.moneynessPct)}٪</p>
      ${r.rangeSource === 'infoLag' ? '<p class="note">کمینه/بیشینه از چند ثانیه قبل است و با آخرین قیمت عکس گسترده شد.</p>' : ''}
      ${flag ? `<p class="warn">غیرعادی نسبت به هم‌سررسیدها: ${flag.map((f) => (f === 'value' ? 'ارزش معامله' : 'دامنه روز')).join('، ')}</p>` : ''}
      </div>
    </div>`;
  }

  // ── جزئیات ثابت زیر نمودار (با کلیک) ───────────────────────────
  function paintPin() {
    const box = q('[data-ccv-pin]');
    const r = drawable.find((item) => item.ins === pinned);
    box.hidden = !r;
    if (!r) { box.innerHTML = ''; return; }
    box.innerHTML = `${detailHtml(r)}<div class="ccv-pin-actions"><button type="button" class="ghost" data-ccv-hide="${esc(r.ins)}">حذف این کندل از نمودار</button>${onOpenContract && !past ? '<button type="button" class="ghost" data-ccv-open>دیدن در زنجیره</button>' : ''}<button type="button" class="ghost" data-ccv-unpin>بستن</button></div>`;
  }

  /**
   * جای راهنمای شناور: کنار نشانگر، ولی همیشه داخل پنجرهٔ مرورگر.
   * «توضیحات هاور مثل قبل باشد، طوری که در صفحه جا شود.» راهنما به `body`
   * می‌چسبد (نه قاب نمودار) و اگر از لبهٔ پایین یا کنار پنجره بیرون بزند، به
   * داخل برمی‌گردد. ECharts مختصات را نسبت به قاب نمودار می‌خواهد.
   */
  function tipPosition(point, params, dom, rect, size) {
    const box = q('[data-ccv-chart="mother"]').getBoundingClientRect();
    const [w, h] = size.contentSize, pad = 10;
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = point[0] + 18, y = point[1] - h / 2;
    if (box.left + x + w > vw - pad) x = point[0] - w - 18;
    x = Math.max(pad - box.left, Math.min(vw - pad - box.left - w, x));
    y = Math.max(pad - box.top, Math.min(vh - pad - box.top - h, y));
    return [x, y];
  }

  // ── نمودار مادر ─────────────────────────────────────────────────
  function buildMother(echarts, base) {
    if (!drawable.length) return null;
    const t = extraTokens(base);
    const m = metricOf(opts.metric), L = useLog(m, opts.log), cat = opts.xMode !== 'moneyness';
    const ax = (v) => toAxis(m, v, opts.log);
    const uaIdx = new Map(), expIdx = new Map();
    for (const r of drawable) {
      if (!uaIdx.has(r.uaIns)) uaIdx.set(r.uaIns, uaIdx.size);
      if (!expIdx.has(r.endDate)) expIdx.set(r.endDate, expIdx.size);
    }
    const groups = { ua: uaIdx, exp: expIdx };
    // «شاخص ترکیبی… کندل نباشد، همان خط افقی باشد؛ در منوی کشویی قابل
    // انتخاب؛ صرفاً یک خط، نه نوار.» یک خط افقی سراسری روی نقطهٔ انتخابی
    // (آخرین، پایانی، …) از میانگین وزنی همان نقطه. عدد هر گروه در جدول.
    const comp = compositeCandle(drawable, m.key, opts.composite);
    const data = drawable.map((r, i) => {
      const s = shapes[i];
      const v = [cat ? i : r.moneynessPct, ax(s.low), ax(s.high), ax(s.open), ax(s.close), ax(s.mark), ax(s.last), i];
      return v.map((x) => (Number.isFinite(x) ? x : '-'));
    });
    const lows = data.map((d) => d[1]).filter(Number.isFinite), highs = data.map((d) => d[2]).filter(Number.isFinite);
    const robust = opts.robust ? robustExtent(drawable, m.key, { log: opts.log }) : null;
    const yLo = robust ? robust.lo : Math.min(...lows), yHi = robust ? robust.hi : Math.max(...highs);
    const ticks = L ? logTicks(m, yLo, yHi) : undefined;
    const showBars = opts.bars && opts.bars !== 'none';

    const renderItem = (params, api) => {
      const i = api.value(7), r = drawable[i], s = shapes[i];
      if (!r || !s) return null;
      const x = api.value(0);
      const box = params.coordSys;
      const clampY = (y) => Math.max(box.y, Math.min(box.y + box.height, y));
      const pLo = api.coord([x, api.value(1)]), pHi = api.coord([x, api.value(2)]);
      const cx = pLo[0];
      if (!Number.isFinite(cx) || !Number.isFinite(pLo[1]) || !Number.isFinite(pHi[1])) return null;
      const bw = cat ? Math.max(2, Math.min(14, api.size([1, 0])[0] * 0.62)) : 7;
      const color = colorOf(r, s, t, groups);
      const flagged = flags.has(r.ins);
      const edge = flagged ? t.warn : color, edgeW = flagged ? 2.5 : 1.2;
      const kids = [];
      const yOf = (k) => { const v = api.value(k); return Number.isFinite(v) ? api.coord([x, v])[1] : NaN; };
      // پیکان لبه برای کندلی که از مقیاس مقاوم بیرون می‌زند.
      const arrow = (y, up) => ({ type: 'polygon', shape: { points: up ? [[cx, y], [cx + 5, y + 7], [cx - 5, y + 7]] : [[cx, y], [cx + 5, y - 7], [cx - 5, y - 7]] }, style: { fill: color, stroke: t.panel, lineWidth: 0.8 } });
      if (s.shape === 'point') {
        const y = yOf(5), rad = flagged ? 5.5 : 4.5;
        if (!Number.isFinite(y)) return null;
        if (y < box.y) return { type: 'group', children: [arrow(box.y + 1, true)] };
        if (y > box.y + box.height) return { type: 'group', children: [arrow(box.y + box.height - 1, false)] };
        kids.push(r.kind === 'put'
          ? { type: 'polygon', shape: { points: [[cx, y - rad], [cx + rad, y], [cx, y + rad], [cx - rad, y]] }, style: { fill: color, stroke: edge, lineWidth: edgeW } }
          : { type: 'circle', shape: { cx, cy: y, r: rad }, style: { fill: color, stroke: edge, lineWidth: edgeW } });
      } else {
        const top = clampY(Math.min(pLo[1], pHi[1])), bottom = clampY(Math.max(pLo[1], pHi[1]));
        kids.push({ type: 'line', shape: { x1: cx, y1: top, x2: cx, y2: bottom }, style: { stroke: color, lineWidth: 1.3 } });
        if (pHi[1] < box.y) kids.push(arrow(box.y + 1, true));
        if (pLo[1] > box.y + box.height) kids.push(arrow(box.y + box.height - 1, false));
        if (s.shape === 'candle') {
          const o = yOf(3), c = yOf(4);
          if (Number.isFinite(o) && Number.isFinite(c)) {
            const y1 = clampY(Math.min(o, c)), y2 = clampY(Math.max(o, c));
            kids.push({ type: 'rect', shape: { x: cx - bw / 2, y: y1, width: bw, height: Math.max(1.5, y2 - y1) }, style: { fill: color, stroke: edge, lineWidth: edgeW } });
          }
          const mk = yOf(5);
          if (Number.isFinite(mk) && mk >= box.y && mk <= box.y + box.height) {
            const d = Math.max(2.5, Math.min(4.5, bw / 2));
            kids.push({ type: 'polygon', shape: { points: [[cx, mk - d], [cx + d, mk], [cx, mk + d], [cx - d, mk]] }, style: { fill: t.warn, stroke: t.panel, lineWidth: 0.8 } });
          }
        } else {
          const mid = yOf(5), last = yOf(6);
          kids.push({ type: 'rect', shape: { x: cx - bw / 2, y: top, width: bw, height: Math.max(1.5, bottom - top) }, style: { fill: 'transparent', stroke: edge, lineWidth: edgeW } });
          if (Number.isFinite(mid)) kids.push({ type: 'line', shape: { x1: cx - bw / 2 - 2, y1: clampY(mid), x2: cx + bw / 2 + 2, y2: clampY(mid) }, style: { stroke: color, lineWidth: 2 } });
          if (Number.isFinite(last) && last >= box.y && last <= box.y + box.height) kids.push({ type: 'circle', shape: { cx, cy: last, r: 2.6 }, style: { fill: t.ink } });
        }
      }
      return { type: 'group', children: kids };
    };

    // ── لایهٔ میله پشت کندل‌ها ─────────────────────────────────────
    //
    // «میلهٔ زیر هر کندل جدا نباشد؛ در همان نمودار اصلی، لایه‌ای پشت کادر.»
    // محور دوم پنهان است و طوری اندازه می‌گیرد که بلندترین میله ۳۰٪ پایین
    // کادر را بگیرد (`backgroundBarAxis`)؛ میله کم‌رنگ و بی‌واکنش است تا هاور
    // و کلیک همیشه به خودِ کندل برسد.
    const barAxis = showBars ? backgroundBarAxis(drawable.map((r) => r[opts.bars]), { log: !!opts.barsLog }) : null;
    const barData = barAxis ? drawable.map((r, i) => {
      const v = Number(r[opts.bars]);
      return [cat ? i : r.moneynessPct, Number.isFinite(v) && (!opts.barsLog || v > 0) ? v : '-', i];
    }) : [];
    const renderBar = (params, api) => {
      const i = api.value(2), r = drawable[i], s = shapes[i];
      const v = api.value(1);
      if (!r || !Number.isFinite(v)) return null;
      const box = params.coordSys;
      const [cx, y] = api.coord([api.value(0), v]);
      const bw = cat ? Math.max(2, Math.min(18, api.size([1, 0])[0] * 0.86)) : 8;
      const bottom = box.y + box.height, top = Math.max(box.y, Math.min(bottom - 1, y));
      return { type: 'rect', shape: { x: cx - bw / 2, y: top, width: bw, height: bottom - top }, style: { fill: colorOf(r, s, t, groups), opacity: 0.2 } };
    };

    // خط‌های مرجع: صفر، و تغییر خودِ پایه وقتی فقط یک نماد هست.
    const refs = [];
    if (['change', 'delta', 'breakevenGapPct', 'oiChangePct', 'timeValue'].includes(m.key)) refs.push({ yAxis: ax(0), label: { formatter: 'صفر' } });
    if (m.key === 'dayPositionPct') refs.push({ yAxis: 50, label: { formatter: 'میانهٔ بازه' } });
    if (m.key === 'change' && uaIdx.size === 1) {
      const u = drawable[0].uaChangePct;
      if (Number.isFinite(ax(u))) refs.push({ yAxis: ax(u), label: { formatter: `پایه ${fmt.pct(u)}٪` }, lineStyle: { color: t.accent, type: 'solid' } });
    }
    if (!cat) refs.push({ xAxis: 0, label: { formatter: 'به پول', position: 'insideStartTop' } });
    const bands = opts.xMode === 'grouped' ? groupBands(drawable) : [];
    if (comp) {
      const point = m.shape === 'candle' ? opts.compositePoint : 'mark';
      const value = comp[point] ?? comp.mark;
      const pointLabel = m.shape === 'candle' ? COMPOSITE_POINTS.find(([k]) => k === point)?.[1] || '' : '';
      if (Number.isFinite(ax(value))) refs.push({ yAxis: ax(value), lineStyle: { color: t.accent, type: 'solid', width: 2.5 }, label: { formatter: `شاخص ترکیبی${pointLabel ? ` (${pointLabel})` : ''} ${axisText(m.key, value)}`, color: t.accent, fontSize: 11, fontWeight: 700, position: 'insideStartTop' } });
    }
    const chartBaseTip = chartBase(t).tooltip;
    const zoomRange = (k) => (zoom.ranges && zoom.sig === zoomSig() ? zoom.ranges[k] || {} : {});
    const barLabel = BAR_KEYS.find(([k]) => k === opts.bars)?.[1] || '';
    const bottomPad = cat ? 104 : 72;
    return {
      grid: [{ left: 64, right: 54, top: 30, bottom: bottomPad }],
      // راهنمای کامل کنار نشانگر، همیشه داخل پنجره (`tipPosition`).
      tooltip: { ...chartBaseTip, trigger: 'item', confine: false, appendTo: 'body', enterable: false, position: tipPosition, formatter: (p) => detailHtml(drawable[p.value?.[7]] || drawable[0]), extraCssText: `${chartBaseTip.extraCssText} max-width: min(660px, 94vw); white-space: normal; padding: 8px 10px;` },
      xAxis: [cat
        ? { type: 'category', data: drawable.map((r) => r.name), axisLabel: { rotate: 60, fontSize: 10, color: t.muted, hideOverlap: true }, axisLine: { lineStyle: { color: t.line } }, triggerEvent: true }
        : { type: 'value', scale: true, name: 'فاصله اعمال از پایه ٪', nameLocation: 'middle', nameGap: 28, axisLabel: { color: t.muted, formatter: (v) => axisText('change', v) }, splitLine: { lineStyle: { color: t.lineSoft } }, triggerEvent: true }],
      yAxis: [
        {
          type: 'value', scale: true, axisLine: { onZero: false }, name: m.short + (L ? ' · لگاریتمی' : '') + (robust ? ' · مقاوم' : ''), nameTextStyle: { color: t.muted },
          ...(robust ? { min: robust.lo, max: robust.hi } : {}),
          axisLabel: { color: t.muted, formatter: (v) => axisText(m.key, fromAxis(m, v, opts.log)), ...(ticks ? { customValues: ticks } : {}) },
          ...(ticks ? { axisTick: { customValues: ticks } } : {}),
          splitLine: { lineStyle: { color: t.lineSoft } }, triggerEvent: true,
        },
        ...(barAxis ? [{ type: opts.barsLog ? 'log' : 'value', min: barAxis.min, max: barAxis.max, show: false, name: barLabel }] : []),
      ],
      dataZoom: [
        { type: 'inside', xAxisIndex: [0], ...zoomRange(0) },
        { type: 'slider', xAxisIndex: [0], height: 16, bottom: 8, ...zoomRange(1) },
        { type: 'slider', yAxisIndex: 0, width: 14, right: 8, filterMode: 'none', ...zoomRange(2) },
      ],
      series: [
        ...(barAxis ? [{
          type: 'custom', renderItem: renderBar, data: barData, yAxisIndex: 1, clip: true, silent: true, z: 1,
          dimensions: ['x', 'v', 'i'], encode: { x: 0, y: 1, tooltip: [] },
        }] : []),
        {
          id: 'candles', type: 'custom', renderItem, data, clip: !opts.robust, z: 3,
          dimensions: ['x', 'low', 'high', 'open', 'close', 'mark', 'last', 'i'],
          encode: { x: 0, y: [1, 2, 5, 6], tooltip: [] },
          markLine: refs.length ? { silent: true, symbol: 'none', lineStyle: { color: t.muted, type: 'dashed' }, label: { color: t.muted, fontSize: 10 }, data: refs } : undefined,
          markArea: bands.length > 1 ? {
            silent: true,
            data: [...bands.filter((_, i) => i % 2 === 0).map((b) => [
              { xAxis: b.from, itemStyle: { color: t.accentSoft, opacity: 0.35 }, label: { show: bands.length <= 30, position: 'insideTop', color: t.muted, fontSize: 10, formatter: `${b.uaName} ${dateLabel(b.endDate)}` } },
              { xAxis: b.to },
            ])],
          } : undefined,
        },
      ],
    };
  }
  const zoomSig = () => JSON.stringify([opts.xMode, opts.metric, opts.log, opts.sortKey, opts.sortDir, opts.robust, drawable.length, drawable[0]?.ins]);

  // ── بزرگ و کوچک کردن هر محور با کلیک و کشیدن ────────────────────
  //
  // «هر محور را با کلیک کردن و درگ کردن بشود بزرگ و کوچک کرد.» روی ناحیهٔ
  // برچسب محور عمودی، کشیدن به بالا بزرگ‌نمایی و به پایین کوچک‌نمایی است؛
  // روی محور افقی، کشیدن به راست/چپ. مرکزِ بزرگ‌نمایی همان جایی است که
  // کلیک شد. دوبار کلیک روی محور، همان محور را به حالت کامل برمی‌گرداند.
  function attachAxisDrag(chart) {
    const zr = chart.getZr();
    let drag = null;
    const rect = () => chart.getModel()?.getComponent('grid', 0)?.coordinateSystem?.getRect?.();
    const zoneOf = (x, y) => {
      const g = rect();
      if (!g) return '';
      if (x < g.x && x > g.x - 70 && y >= g.y && y <= g.y + g.height) return 'y';
      if (y > g.y + g.height && y < g.y + g.height + 90 && x >= g.x && x <= g.x + g.width) return 'x';
      return '';
    };
    const windowOf = (index) => {
      const dz = chart.getOption().dataZoom?.[index] || {};
      return { start: Number.isFinite(dz.start) ? dz.start : 0, end: Number.isFinite(dz.end) ? dz.end : 100 };
    };
    const apply = (axis, start, end) => {
      const lo = Math.max(0, Math.min(start, end - 0.5)), hi = Math.min(100, Math.max(end, lo + 0.5));
      chart.dispatchAction({ type: 'dataZoom', dataZoomIndex: axis === 'y' ? 2 : 0, start: lo, end: hi });
    };
    zr.on('mousemove', (e) => {
      if (drag) {
        const g = rect();
        const delta = drag.axis === 'y' ? (drag.py - e.offsetY) / g.height : (e.offsetX - drag.px) / g.width;
        const factor = Math.exp(-delta * 2.2);
        const span = Math.min(100, Math.max(0.5, (drag.w.end - drag.w.start) * factor));
        const start = drag.anchor - (drag.anchor - drag.w.start) * (span / (drag.w.end - drag.w.start));
        apply(drag.axis, start, start + span);
        return;
      }
      const zone = zoneOf(e.offsetX, e.offsetY);
      zr.setCursorStyle(zone === 'y' ? 'ns-resize' : zone === 'x' ? 'ew-resize' : 'default');
    });
    zr.on('mousedown', (e) => {
      const axis = zoneOf(e.offsetX, e.offsetY);
      if (!axis) return;
      const g = rect(), w = windowOf(axis === 'y' ? 2 : 0);
      const frac = axis === 'y' ? 1 - (e.offsetY - g.y) / g.height : (e.offsetX - g.x) / g.width;
      drag = { axis, px: e.offsetX, py: e.offsetY, w, anchor: w.start + (w.end - w.start) * Math.max(0, Math.min(1, frac)) };
    });
    const end = () => { drag = null; };
    zr.on('mouseup', end);
    zr.on('globalout', end);
    zr.on('dblclick', (e) => {
      const axis = zoneOf(e.offsetX, e.offsetY);
      if (axis) apply(axis, 0, 100);
    });
  }

  async function paintMother() {
    const target = q('[data-ccv-chart="mother"]');
    if (!drawable.length) {
      mother?.dispose(); mother = null;
      target.innerHTML = `<p class="empty-note">${past && !pastState.payload ? 'روز و نماد را انتخاب کن و «دریافت کندل‌های این روز» را بزن.' : fetching ? 'در حال دریافت کمینه/بیشینهٔ امروز…' : 'در این گزینش قرارداد معامله‌شده‌ای با داده برای این شاخص نیست.'}</p>`;
      return;
    }
    if (mother) { mother.update(buildMother); return; }
    const seq = ++motherSeq;
    const handle = await mountChart(target, buildMother, {
      onClick: (p) => {
        const r = p.componentType === 'series' && p.seriesId === 'candles' ? drawable[p.value?.[7]] : null;
        if (!r) return;
        if (opts.clickRemove) { hide(r.ins); return; }
        pinned = r.ins; paintPin();
      },
    });
    if (seq !== motherSeq) { handle?.dispose(); return; }
    mother = handle;
    if (mother) {
      attachAxisDrag(mother.instance);
    }
    mother?.instance.on('datazoom', () => {
      const dz = mother.instance.getOption().dataZoom || [];
      zoom = { sig: zoomSig(), ranges: dz.map((z) => ({ start: z.start, end: z.end })) };
    });
  }

  // ── نمودار توزیع ────────────────────────────────────────────────
  function groupColor(t, key, index) {
    if (opts.histGroup === 'kind') return key === 'put' ? t.putUp : t.series[0];
    if (opts.histGroup === 'moneyness') return { itm: t.gain, atm: t.warn, otm: t.series[0], unknown: t.muted }[key] || t.muted;
    if (opts.histGroup === 'none') return t.accent;
    return index < 9 ? t.palette[index % t.palette.length] : t.muted;
  }
  function buildHist(echarts, base) {
    const h = lastHist;
    if (!h?.bars.length) return null;
    const t = extraTokens(base);
    const m = metricOf(opts.histMetric);
    const pct = !!opts.histPercent && h.total > 0;
    const scale = (w) => (pct ? (w / h.total) * 100 : w);
    const step = h.step, d = h.decimals;
    const xMin = h.bars[0].kind === 'under' ? h.start - step : h.start;
    const xMax = h.bars[h.bars.length - 1].kind === 'over' ? h.end + step : h.end;
    const span = (b) => (b.kind === 'under' ? [h.start - step, h.start] : b.kind === 'over' ? [h.end, h.end + step] : [b.from, b.to]);
    const label = (b) => (b.kind === 'under' ? `کمتر از ${axisText(m.key, b.to, d)}`
      : b.kind === 'over' ? `${axisText(m.key, b.from, d)} و بیشتر`
        : `${axisText(m.key, b.from, d)} تا کمتر از ${axisText(m.key, b.to, d)}`);
    const weightLabel = HIST_WEIGHTS.find(([k]) => k === opts.histWeight)?.[1] || 'شمار';
    const unit = opts.histUnit === 'underlying' ? 'نماد' : 'قرارداد';
    const valueText = (w) => (pct ? `${fmt.pct(w)}٪` : opts.histWeight === 'value' ? fmt.rialText(w) : fmt.int(w));
    const groupKeys = h.groups.map((g) => g.key);
    // میلهٔ انباشته: هر گروه یک تکه، از پایین به بالا به ترتیب وزن کل.
    const data = h.bars.map((b, i) => [...span(b), scale(b.total), i]);
    const renderItem = (params, api) => {
      const b = h.bars[api.value(3)];
      if (!b) return null;
      const [x0] = api.coord([api.value(0), 0]), [x1] = api.coord([api.value(1), 0]);
      let acc = 0;
      const kids = [];
      groupKeys.forEach((key, gi) => {
        const w = b.byGroup[key] || 0;
        if (!w) return;
        const [, yBottom] = api.coord([api.value(0), scale(acc)]);
        acc += w;
        const [, yTop] = api.coord([api.value(0), scale(acc)]);
        kids.push({ type: 'rect', shape: { x: Math.min(x0, x1) + 1, y: yTop, width: Math.max(1, Math.abs(x1 - x0) - 2), height: Math.max(0.5, yBottom - yTop) }, style: { fill: groupColor(t, key, gi), opacity: b.kind === 'bin' ? 0.92 : 0.55 } });
      });
      const total = scale(b.total);
      if (total > 0) {
        const [, yT] = api.coord([api.value(0), total]);
        kids.push({ type: 'text', style: { text: pct ? `${faDigits(total.toFixed(1))}٪` : opts.histWeight === 'count' ? fmt.int(total) : '', x: (x0 + x1) / 2, y: yT - 4, fill: t.muted, fontSize: 10, align: 'center', verticalAlign: 'bottom' } });
      }
      return { type: 'group', children: kids };
    };
    const edges = [...new Set(h.bars.flatMap((b) => span(b)))].sort((a, b) => a - b);
    const every = Math.max(1, Math.ceil(edges.length / 14));
    const ticks = edges.filter((_, i) => i % every === 0);
    const s = h.stats;
    const lines = !opts.histLines ? [] : [
      ['میانگین', s.mean, t.ink, 'dashed'], ['میانه', s.median, t.warn, 'solid'], ['چارک اول', s.q1, t.muted, 'dashed'], ['چارک سوم', s.q3, t.muted, 'dashed'],
      ...(Number.isFinite(s.wMean) ? [['میانگین وزنی', s.wMean, t.accent2, 'dotted']] : []),
    ].filter(([, v]) => Number.isFinite(v) && v >= xMin && v <= xMax)
      .map(([name, v, color, type]) => ({ xAxis: v, lineStyle: { color, type, width: 1.5 }, label: { formatter: `${name} ${axisText(m.key, v, Math.min(2, d + 1))}`, color, fontSize: 10, position: 'end' } }));
    // همان خط شاخص ترکیبیِ نمودار مادر، این‌جا عمودی و روی شاخص و نقطهٔ
    // همین نمودار. بیرون از بازهٔ نمایش (دنبالهٔ بریده)، روی لبه با برچسب.
    if (lastHistComp && Number.isFinite(lastHistComp.value)) {
      const cv = lastHistComp.value, at = Math.max(xMin, Math.min(xMax, cv));
      const wLabel = COMPOSITE_WEIGHTS.find(([k]) => k === opts.composite)?.[1] || '';
      lines.push({ xAxis: at, lineStyle: { color: t.accent, type: 'solid', width: 3 }, label: { formatter: `شاخص ترکیبی ${axisText(m.key, cv, Math.min(2, d + 1))}${at !== cv ? ' (بیرون از بازهٔ نمایش)' : ''}`, color: t.accent, fontSize: 11, fontWeight: 700, position: 'insideEndTop' }, name: wLabel });
    }
    const kde = opts.histKde && h.kde.length ? h.kde.map(([xv, yv]) => [xv, scale(yv)]) : [];
    const cum = opts.histCum ? h.bars.map((b) => [span(b)[1], b.cumulative]) : [];
    const chartBaseTip = chartBase(t).tooltip;
    return {
      grid: { left: 60, right: opts.histCum ? 54 : 20, top: 44, bottom: 64, containLabel: false },
      legend: { top: 0, textStyle: { color: t.ink }, data: [...h.groups.slice(0, 10).map((g) => g.label), ...(kde.length ? ['چگالی'] : []), ...(cum.length ? ['تجمعی'] : [])] },
      tooltip: {
        ...chartBaseTip, trigger: 'item', confine: true,
        formatter: (p) => {
          if (p.seriesType !== 'custom') return '';
          const b = h.bars[p.value?.[3]];
          if (!b) return '';
          const parts = h.groups.filter((g) => b.byGroup[g.key]).map((g) => `${esc(g.label)} ${valueText(scale(b.byGroup[g.key]))}`).join(' · ');
          const names = b.items.slice(0, 16).map((x) => `${esc(x.name)} <small>${metricText(m.key, x.value)}</small>`).join('، ');
          return `<div dir="rtl" class="ccv-tip"><b>${label(b)}</b><p>${weightLabel}: ${valueText(scale(b.total))} از ${valueText(scale(h.total))} · ${fmt.int(b.items.length)} ${unit} · سهم ${fmt.pct(h.total > 0 ? (b.total / h.total) * 100 : NaN)}٪ · تجمعی تا اینجا ${fmt.pct(b.cumulative)}٪</p><p>${parts}</p><p>${names}${b.items.length > 16 ? ' …' : ''}</p></div>`;
        },
        extraCssText: `${chartBaseTip.extraCssText} max-width: 440px; white-space: normal;`,
      },
      xAxis: {
        type: 'value', min: xMin, max: xMax, name: m.short, nameLocation: 'middle', nameGap: 40, nameTextStyle: { color: t.muted },
        axisLabel: { color: t.muted, fontSize: 10, rotate: 30, customValues: ticks, formatter: (v) => (v < h.start - 1e-9 || v > h.end + 1e-9 ? '' : axisText(m.key, v, d)) },
        axisTick: { customValues: ticks }, splitLine: { show: false }, axisLine: { lineStyle: { color: t.line } },
      },
      yAxis: [
        { type: 'value', min: 0, axisLine: { onZero: false }, name: pct ? `سهم ${weightLabel} ٪` : `${weightLabel} (${unit})`, nameTextStyle: { color: t.muted }, axisLabel: { color: t.muted, formatter: (v) => (pct ? `${fmt.int(v)}٪` : opts.histWeight === 'value' ? fmt.mrial(v) : fmt.int(v)) }, splitLine: { lineStyle: { color: t.lineSoft } } },
        ...(cum.length ? [{ type: 'value', min: 0, max: 100, position: 'right', name: 'تجمعی ٪', nameTextStyle: { color: t.muted }, axisLabel: { color: t.muted, formatter: (v) => `${fmt.int(v)}٪` }, splitLine: { show: false } }] : []),
      ],
      series: [
        // سری‌های بی‌داده فقط برای راهنمای رنگ گروه‌ها.
        ...h.groups.slice(0, 10).map((g, gi) => ({ name: g.label, type: 'bar', data: [], itemStyle: { color: groupColor(t, g.key, gi) } })),
        { type: 'custom', renderItem, data, encode: { x: [0, 1], y: 2, tooltip: [] }, dimensions: ['from', 'to', 'total', 'i'], markLine: lines.length ? { silent: true, symbol: 'none', data: lines } : undefined },
        ...(kde.length ? [{ name: 'چگالی', type: 'line', data: kde, smooth: true, showSymbol: false, lineStyle: { color: t.ink, width: 1.5 }, itemStyle: { color: t.ink }, tooltip: { show: false } }] : []),
        ...(cum.length ? [{ name: 'تجمعی', type: 'line', yAxisIndex: 1, data: cum, step: false, showSymbol: true, symbolSize: 4, lineStyle: { color: t.accent2, width: 1.5 }, itemStyle: { color: t.accent2 }, tooltip: { show: false } }] : []),
      ],
    };
  }
  async function paintHist(records) {
    const m = metricOf(opts.histMetric);
    q('[data-ccv-hist-point]').hidden = m.shape !== 'candle';
    const h = histogram(records, {
      metric: m.key, point: m.shape === 'candle' ? opts.histPoint : 'last', bins: Number(opts.histBins) || 12,
      binWidth: Number(opts.histWidth) || 0, unit: opts.histUnit, weight: opts.histWeight, groupBy: opts.histGroup,
      tails: Number(opts.histTails) || 0, kde: !!opts.histKde,
    });
    lastHist = h;
    const histPointUsed = m.shape === 'candle' ? opts.histPoint : 'last';
    lastHistComp = compositeValue(records, m.key, histPointUsed, opts.composite);
    const s = h.stats, d = Math.min(2, h.decimals + 1);
    const v = (x) => metricText(m.key, x);
    q('[data-ccv-hist-stats]').innerHTML = h.count ? `<table class="ccv-stat-table"><caption>آمار ${esc(m.label)} — ${fmt.int(s.n)} ${opts.histUnit === 'underlying' ? 'نماد' : 'قرارداد'}، بی‌وزن${Number.isFinite(s.wMean) ? ' (و وزنی)' : ''}</caption>
      <thead><tr><th>میانگین</th><th>انحراف معیار</th><th>کمینه</th><th>چارک اول</th><th>میانه</th><th>چارک سوم</th><th>بیشینه</th><th>فاصلهٔ میان‌چارکی</th><th>چولگی</th><th>کشیدگی اضافه</th><th>مثبت / منفی</th>${Number.isFinite(s.wMean) ? '<th>میانگین وزنی</th><th>میانهٔ وزنی</th>' : ''}</tr></thead>
      <tbody><tr><td>${v(s.mean)}</td><td>${v(s.std)}</td><td>${v(s.min)}</td><td>${v(s.q1)}</td><td>${v(s.median)}</td><td>${v(s.q3)}</td><td>${v(s.max)}</td><td>${v(s.iqr)}</td><td>${fmt.num(s.skew)}</td><td>${fmt.num(s.kurt)}</td><td><span class="gain">${fmt.int(s.positive)}</span> / <span class="loss">${fmt.int(s.negative)}</span></td>${Number.isFinite(s.wMean) ? `<td>${v(s.wMean)}</td><td>${v(s.wMedian)}</td>` : ''}</tr></tbody></table>` : '';
    const busiest = [...h.bars].sort((a, b) => b.total - a.total)[0];
    const skewText = Number.isFinite(s.skew) ? (s.skew > 0.5 ? 'دنبالهٔ راست بلند است: چند قرارداد خیلی بیشتر از بقیه رفته‌اند.' : s.skew < -0.5 ? 'دنبالهٔ چپ بلند است: چند قرارداد خیلی بیشتر از بقیه افت کرده‌اند.' : 'توزیع تقریباً متقارن است.') : '';
    q('[data-ccv-hist-note]').textContent = h.count
      ? `گام هر بازه ${axisText(m.key, h.step, h.decimals)}${busiest ? ` · پرجمعیت‌ترین بازه: ${busiest.kind === 'bin' ? `${axisText(m.key, busiest.from, h.decimals)} تا ${axisText(m.key, busiest.to, h.decimals)}` : 'دنباله'} با ${fmt.int(busiest.items.length)} ${opts.histUnit === 'underlying' ? 'نماد' : 'قرارداد'}` : ''}${h.outside ? ` · ${fmt.int(h.outside)} مورد در دو سر بریده (در میله‌های کم‌رنگ دو لبه)` : ''}${lastHistComp && Number.isFinite(lastHistComp.value) ? ` · خط شاخص ترکیبی (${COMPOSITE_WEIGHTS.find(([k]) => k === opts.composite)?.[1] || ''}): ${v(lastHistComp.value)}${lastHistComp.missingWeight ? `، ${fmt.int(lastHistComp.missingWeight)} قرارداد بی‌وزن شمرده نشد` : ''}` : ''}. ${skewText} موس را روی هر میله ببر تا نام‌ها و سهم هر گروه را ببینی.`
      : 'برای این شاخص در گزینش فعلی عددی نیست.';
    const target = q('[data-ccv-chart="hist"]');
    if (!h.bars.length) { hist?.dispose(); hist = null; target.innerHTML = '<p class="empty-note">داده‌ای برای نمودار توزیع نیست.</p>'; return; }
    if (hist) { hist.update(buildHist); return; }
    const seq = ++histSeq;
    const handle = await mountChart(target, buildHist);
    if (seq !== histSeq) { handle?.dispose(); return; }
    hist = handle;
  }

  // ── کندل‌های افقی (همان نمای قبلی، روی همین گزینش) ─────────────
  function paintList(records) {
    const rangeStatus = q('[data-lmm-range-status]'), rangeChart = q('[data-lmm-range-chart]');
    const rangeSort = SORT_KEYS.some((k) => k.key === opts.listSort) ? opts.listSort : 'value';
    const sortLabel = SORT_KEYS.find((k) => k.key === rangeSort)?.label || '';
    const sortBox = q('[data-lmm-range-sort]');
    if (!sortBox.contains(document.activeElement)) {
      sortBox.innerHTML = `<label>مرتب بر<select data-ccv="listSort">${SORT_KEYS.map((k) => `<option value="${k.key}"${k.key === rangeSort ? ' selected' : ''}>${esc(k.label)}</option>`).join('')}</select></label><label>جهت<select data-ccv="listDir">${opt(SORT_DIRS, opts.listDir)}</select></label>`;
    }
    // همان مرتب‌ساز نمودار مادر؛ نامعلوم همیشه ته صف.
    const rows = orderCandles(records.filter((row) => row.valid), { xMode: 'ranked', sortKey: rangeSort, sortDir: opts.listDir, metric: opts.metric });
    const lagged = rows.filter((row) => row.rangeSource === 'infoLag').length;
    const other = records.filter((row) => row.rangeSource === 'otherSession').length;
    rangeStatus.textContent = `${fmt.int(rows.length)} قرارداد دارای بازه معتبر از ${fmt.int(records.length)} قرارداد گزینش · مرتب بر ${sortLabel}`
      + (past ? ' · همه از ردیف روزانهٔ همان روز' : ' · ارزش، حجم، موقعیت باز و قیمت‌ها همان عدد زنجیره‌اند')
      + `${lagged ? ` · کمینه/بیشینهٔ ${fmt.int(lagged)} قرارداد از چند ثانیه قبل است و با آخرین قیمت عکس گسترده شد` : ''}`
      + `${other ? ` · ${fmt.int(other)} قرارداد: پاسخ کمینه/بیشینه مال جلسهٔ دیگری بود و کنار گذاشته شد` : ''}`;
    if (!rows.length) { rangeChart.innerHTML = `<p class="empty-note">${fetching ? 'در حال دریافت…' : 'برای قراردادهای این گزینش بازه معتبر روز نیامد.'}</p>`; return; }
    const shown = rows.slice(0, listLimit);
    rangeChart.innerHTML = `<div class="lmm-range-legend"><span>سایه: کمینه تا بیشینه</span><span>بدنه: اولین تا آخرین</span><span>نقاط: پنج قیمت مستقل</span><span>قیمت‌ها: ریال، برای هر واحد دارایی پایه</span><small>موس را روی هر کندل حرکت بده تا همه قیمت‌ها دیده شوند؛ کلیک، جزئیات را باز نگه می‌دارد.</small></div><div class="lmm-range-list">${shown.map((row) => {
      const low = Number(row.low), high = Number(row.high), first = Number(row.first), last = Number(row.last), close = Number(row.close);
      // هر عدد با واحدِ خودش: ارزش ریال، حجم و موقعیت باز «قرارداد» (نه سهم).
      const rankValue = rangeSort === 'value' ? fmt.rialText(row.value)
        : ['volume', 'oi', 'oiChange'].includes(rangeSort) ? (Number.isFinite(Number(row[rangeSort])) ? `${fmt.int(Number(row[rangeSort]))} قرارداد` : '—')
          : rangeSort === 'trades' ? `${fmt.int(row.trades)} معامله`
            : rangeSort === 'strike' ? `اعمال ${fmt.money(row.strike)}`
              : rangeSort === 'days' ? `${fmt.int(row.days)} روز`
                : ['delta', 'effectiveLeverage'].includes(rangeSort) ? fmt.num(sortValue(row, rangeSort))
                  : rangeSort === 'metric' ? metricText(opts.metric, sortValue(row, 'metric', opts.metric))
                    : `${fmt.pct(sortValue(row, rangeSort))}٪`;
      const lastPct = pctVsYday(last, row.yday), closePct = pctVsYday(close, row.yday);
      return `<article class="${tone(last - first)}" data-lmm-range-card="${esc(row.ins)}"><header><button type="button" data-lmm-range-contract="${esc(row.ins)}"><b>${esc(row.name)}</b><small>${kindLabel(row.kind)} · ${esc(row.uaName)} · اعمال ${fmt.money(row.strike)} · ${dateLabel(row.endDate)}</small></button><div class="lmm-range-stats"><strong${rangeSort === 'value' && Number.isFinite(Number(row.value)) ? ` title="${fmt.rial(Number(row.value))} ریال"` : ''}>${rankValue}</strong><span class="${tone(lastPct)}">آخرین ${fmt.pct(lastPct)}٪</span><span class="${tone(closePct)}">پایانی ${fmt.pct(closePct)}٪</span></div></header><button type="button" class="lmm-range-track" data-lmm-range-focus="${esc(row.ins)}" aria-expanded="false" aria-label="کندل روزانه ${esc(row.name)}؛ تغییر آخرین ${fmt.pct(lastPct)} درصد و پایانی ${fmt.pct(closePct)} درصد"></button><footer><span>کمینه ${fmt.money(low)}</span><span>اولین ${fmt.money(first)}</span><span>آخرین ${fmt.money(last)}</span><span>پایانی ${fmt.money(close)}</span><span>بیشینه ${fmt.money(high)}</span></footer></article>`;
    }).join('')}</div>${rows.length > shown.length ? `<button type="button" class="ghost ccv-more" data-ccv-more>نمایش ${fmt.int(Math.min(LIST_STEP, rows.length - shown.length))} کندل دیگر (از ${fmt.int(rows.length - shown.length)} باقی‌مانده)</button>` : ''}`;
    rangeChart.querySelectorAll('[data-lmm-range-focus]').forEach((button) => {
      mountCandlePoints(button, shown.find((row) => String(row.ins) === button.dataset.lmmRangeFocus));
    });
  }

  // ── دستگیره‌های کشویی ───────────────────────────────────────────
  //
  // مقیاس هر دستگیره از رکوردهای **پیش از** دستگیره‌ها ساخته می‌شود تا با
  // کشیدن یکی، بقیه جابه‌جا نشوند. DOM فقط وقتی دامنه عوض شد از نو ساخته
  // می‌شود؛ وسط کشیدن فقط شمار و برچسب تازه می‌شود.
  function paintSliders(base, keptCount) {
    const next = {};
    for (const f of SLIDER_FIELDS) next[f.key] = sliderScale(base.map((r) => r[f.key]), f.log);
    const sig = JSON.stringify(SLIDER_FIELDS.map((f) => (next[f.key] ? [next[f.key].lo, next[f.key].hi] : null)));
    scales = next;
    const box = q('[data-ccv-sliders]');
    const dragging = box.contains(document.activeElement) && document.activeElement?.type === 'range';
    if (sig !== sliderSig && !dragging) {
      sliderSig = sig;
      box.innerHTML = SLIDER_FIELDS.map((f) => {
        const sc = next[f.key];
        if (!sc) return `<div class="ccv-slider is-empty"><b>${esc(f.label)}</b><small>در این گزینش عددی ندارد</small></div>`;
        const r = opts.ranges[f.key] || {};
        const a = Number.isFinite(r.lo) ? sc.toPos(r.lo) : 0, b = Number.isFinite(r.hi) ? sc.toPos(r.hi) : SLIDER_STEPS;
        return `<div class="ccv-slider" data-ccv-slider="${f.key}"><div class="ccv-slider-head"><b>${esc(f.label)}</b><output data-ccv-slider-out="${f.key}"></output><button type="button" class="ghost" data-ccv-slider-reset="${f.key}" title="بازنشانی">×</button></div>
          <div class="ccv-dual"><input type="range" min="0" max="${SLIDER_STEPS}" step="1" value="${a}" data-ccv-range="${f.key}" data-end="lo" aria-label="${esc(f.label)} — کف"><input type="range" min="0" max="${SLIDER_STEPS}" step="1" value="${b}" data-ccv-range="${f.key}" data-end="hi" aria-label="${esc(f.label)} — سقف"></div></div>`;
      }).join('');
    }
    for (const f of SLIDER_FIELDS) {
      const out = q(`[data-ccv-slider-out="${f.key}"]`), sc = next[f.key];
      if (!out || !sc) continue;
      const r = opts.ranges[f.key] || {};
      const active = Number.isFinite(r.lo) || Number.isFinite(r.hi);
      out.textContent = `${fieldText(f.unit, Number.isFinite(r.lo) ? r.lo : sc.lo)} تا ${fieldText(f.unit, Number.isFinite(r.hi) ? r.hi : sc.hi)}`;
      out.closest('.ccv-slider')?.classList.toggle('is-active', active);
    }
    const n = Object.values(opts.ranges).filter((r) => r && (Number.isFinite(r.lo) || Number.isFinite(r.hi))).length;
    q('.ccv-sliders-box summary').firstChild.textContent = `فیلترهای کشویی — همان لحظه اعمال می‌شوند${n ? ` · ${fmt.int(n)} فعال، ${fmt.int(keptCount)} از ${fmt.int(base.length)} قرارداد مانده` : ''} `;
  }

  // ── کنترل‌ها ────────────────────────────────────────────────────
  function paintControls(turnover) {
    host.querySelectorAll('[data-ccv-side]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ccvSide === opts.side)));
    for (const name of ['top', 'metric', 'xMode', 'sortKey', 'sortDir', 'composite', 'compositePoint', 'colorBy', 'uaSort', 'bars', 'histMetric', 'histPoint', 'histBins', 'histUnit', 'histWeight', 'histGroup', 'histTails']) {
      const el = field(name);
      if (el && document.activeElement !== el) el.value = String(opts[name]);
    }
    if (document.activeElement !== field('histWidth')) field('histWidth').value = Number(opts.histWidth) > 0 ? String(opts.histWidth) : '';
    if (document.activeElement !== field('uaSearch')) field('uaSearch').value = opts.uaSearch || '';
    for (const name of ['unusualOnly', 'clickRemove', 'robust', 'barsLog', 'histPercent', 'histLines', 'histKde', 'histCum']) field(name).checked = !!opts[name];
    const m = metricOf(opts.metric);
    field('log').checked = !!opts.log; field('log').disabled = !m.log;
    q('[data-ccv-log-wrap]').title = m.log ? '' : 'این شاخص صفر یا منفی دارد؛ محور لگاریتمی برایش معنی ندارد';
    q('[data-ccv-rank-wrap]').hidden = opts.xMode === 'moneyness';
    q('[data-ccv-dir-wrap]').hidden = opts.xMode === 'moneyness';
    q('[data-ccv-comp-point-wrap]').hidden = opts.composite === 'none' || m.shape !== 'candle';
    q('[data-ccv-barslog-wrap]').hidden = opts.bars === 'none';
    q('[data-ccv-preset]').innerHTML = `<option value="">—</option>${Object.keys(presets).map((name) => `<option>${esc(name)}</option>`).join('')}`;

    const chosen = new Set(opts.underlyings);
    const needle = String(opts.uaSearch || '').trim();
    const list = [...turnover].filter((u) => !needle || u.uaName.includes(needle) || chosen.has(u.uaIns))
      .sort((a, b) => (opts.uaSort === 'name' ? a.uaName.localeCompare(b.uaName, 'fa') : b[opts.uaSort] - a[opts.uaSort]));
    q('[data-ccv-uas]').innerHTML = list.map((u) => `<label class="ccv-chip"><input type="checkbox" data-ccv-ua-pick="${esc(u.uaIns)}"${chosen.has(u.uaIns) ? ' checked' : ''}> ${esc(u.uaName)} <small>کال ${fmt.rialText(u.callValue)} · پوت ${fmt.rialText(u.putValue)} · ${fmt.int(u.traded)} معامله‌شده</small></label>`).join('') || `<p class="empty-note">${past ? 'داده‌ای بارگذاری نشده.' : 'نمادی نیست.'}</p>`;

    const contracts = universe().contracts || [];
    const dates = [...new Set(contracts.filter((r) => !chosen.size || chosen.has(String(r.uaIns))).map((r) => String(r.endDate)))].sort();
    const pickedDates = new Set(opts.dates.map(String));
    q('[data-ccv-dates]').innerHTML = dates.map((d) => `<label class="ccv-chip"><input type="checkbox" data-ccv-date="${esc(d)}"${pickedDates.has(d) ? ' checked' : ''}> ${dateLabel(d)}</label>`).join('');
    const pickedExp = new Set(opts.expiries.map(String));
    const uaRows = turnover.filter((u) => chosen.has(u.uaIns));
    q('[data-ccv-ua-exp]').innerHTML = uaRows.length && uaRows.length <= 12 ? uaRows.map((u) => `<div class="ccv-ua-exp-row"><b>${esc(u.uaName)}</b>${u.expiries.map((d) => `<label class="ccv-chip"><input type="checkbox" data-ccv-exp="${esc(`${u.uaIns}:${d}`)}"${pickedExp.has(`${u.uaIns}:${d}`) ? ' checked' : ''}> ${dateLabel(d)}</label>`).join('')}</div>`).join('') : '';

    const legend = m.shape === 'candle'
      ? '<span><i class="ccv-l-body"></i>کال بالا/پایین</span><span><i class="ccv-l-put"></i>پوت بالا/پایین</span><span><i class="ccv-l-wick"></i>سایه: کمینه تا بیشینهٔ پنج نقطه</span><span><i class="ccv-l-close"></i>پایانی</span>'
      : m.shape === 'range' ? '<span><i class="ccv-l-box"></i>مظنه خرید تا فروش</span><span><i class="ccv-l-wick"></i>میانه</span><span><i class="ccv-l-dot"></i>آخرین معامله</span>'
        : '<span><i class="ccv-l-dot"></i>کال</span><span><i class="ccv-l-diamond"></i>پوت</span>';
    q('[data-ccv-legend]').innerHTML = `${legend}<span><i class="ccv-l-flag"></i>حاشیهٔ زرد: غیرعادی</span><small>چرخ موس: بزرگ‌نمایی افقی · نوارهای پایین و راست: بازهٔ دید · کلیک: ${opts.clickRemove ? 'حذف کندل' : 'ثابت کردن جزئیات (و دکمهٔ حذف)'}</small>`;
  }

  function paintHidden() {
    const all = new Map((universe().contracts || []).map((r) => [String(r.ins), r.name]));
    const list = opts.hidden.filter((ins) => all.has(ins));
    q('[data-ccv-hidden]').innerHTML = list.length
      ? `<span>${fmt.int(list.length)} کندل کنار گذاشته شده:</span>${list.slice(0, 40).map((ins) => `<button type="button" class="ccv-chip" data-ccv-unhide="${esc(ins)}" title="بازگرداندن">${esc(all.get(ins))} ↺</button>`).join('')}${list.length > 40 ? ' …' : ''}<button type="button" class="ghost" data-ccv-unhide-all>بازگرداندن همه</button>`
      : '';
  }

  function paintStatus(poolSize, drawn) {
    const heading = past
      ? { title: pastState.date && pastState.payload ? `کندل قیمت قراردادها — ${dateLabel(pastState.date)}` : 'کندل قیمت قراردادها در گذشته', note: '' }
      : rangeHeading(payload().session, dateLabel);
    q('[data-ccv-title]').textContent = heading.title;
    const parts = [`${fmt.int(drawn)} کندل روی نمودار از ${fmt.int(poolSize)} قرارداد معامله‌شدهٔ گزینش`];
    if (fetching) parts.push('در حال دریافت کمینه/بیشینهٔ امروز…');
    if (fetchError) parts.push(`دریافت بخشی از بازه‌ها ناموفق بود: ${faDigits(fetchError)}`);
    if (heading.note) parts.push(heading.note);
    if (opts.metric === 'iv') parts.push('تلاطم هر نقطه با قیمت پایهٔ هم‌جهت (تقریبی)');
    q('[data-ccv-status]').textContent = parts.join(' · ');
  }

  // ── جدول شاخص ترکیبی: کل گزینش و هر نماد/سررسید ──────────────
  function paintComposite(records) {
    const box = q('[data-ccv-composite]');
    const m = metricOf(opts.metric);
    const all = compositeCandle(records, m.key, opts.composite);
    if (!all) { box.innerHTML = ''; return; }
    const label = COMPOSITE_WEIGHTS.find(([k]) => k === opts.composite)?.[1] || '';
    const v = (x) => metricText(m.key, x);
    const groups = compositeByGroup(records, m.key, opts.composite).filter((g) => g.composite?.n);
    const head = m.shape === 'candle' ? '<th>کمینه</th><th>اولین</th><th>آخرین</th><th>پایانی</th><th>بیشینه</th>' : '<th>مقدار</th>';
    const cells = (c) => (m.shape === 'candle' ? ['low', 'first', 'last', 'close', 'high'].map((k) => `<td class="${k === 'last' && m.key === 'change' ? tone(c[k]) : ''}">${v(c[k])}</td>`).join('') : `<td>${v(c.mark)}</td>`);
    const weightText = (c) => (opts.composite === 'value' ? fmt.rialText(c.weightTotal) : ['equal', 'median'].includes(opts.composite) ? '—' : fmt.int(c.weightTotal));
    box.innerHTML = `<table class="ccv-stat-table ccv-comp-table"><caption>شاخص ترکیبی — ${esc(label)} روی «${esc(m.label)}»: هر نقطه، ${opts.composite === 'median' ? 'میانهٔ' : 'میانگین وزنی'} همان نقطه در کندل‌ها${all.missingWeight ? ` · ${fmt.int(all.missingWeight)} قرارداد بی‌وزن شمرده نشد` : ''}</caption>
      <thead><tr><th></th><th>قرارداد</th><th>جمع وزن</th>${head}</tr></thead>
      <tbody><tr class="is-total"><th>کل گزینش</th><td>${fmt.int(all.n)}</td><td>${weightText(all)}</td>${cells(all)}</tr>
      ${groups.slice(0, 30).map((g) => `<tr><th>${esc(g.uaName)} <small>${dateLabel(g.endDate)}</small></th><td>${fmt.int(g.composite.n)}</td><td>${weightText(g.composite)}</td>${cells(g.composite)}</tr>`).join('')}</tbody></table>
      ${groups.length > 30 ? `<p class="note">${fmt.int(groups.length - 30)} گروه دیگر در خروجی اکسل.</p>` : ''}`;
  }

  // ── کاشی‌های خلاصهٔ زیر نمودار ─────────────────────────────────
  function paintSummary(records) {
    const box = q('[data-ccv-summary]');
    if (!records.length) { box.innerHTML = ''; return; }
    const s = candleSummary(records);
    const miss = (x) => (x.missing ? `<em>${fmt.int(x.missing)} قرارداد بی‌عدد</em>` : '');
    const who = (r, text) => (r ? `<b>${esc(r.name)}</b> ${text}` : '—');
    const tile = (label, value, note = '', cls = '') => `<article class="ccv-tile ${cls}"><small>${label}</small><strong>${value}</strong>${note ? `<span>${note}</span>` : ''}</article>`;
    box.innerHTML = [
      tile('ارزش معاملات', fmt.rialText(s.value.sum), `کال ${fmt.rialText(s.callValue.sum)} · پوت ${fmt.rialText(s.putValue.sum)}${Number.isFinite(s.putCallValue) ? ` · نسبت پوت به کال ${fmt.num(s.putCallValue)}` : ''} ${miss(s.value)}`),
      tile('موقعیت باز', `${fmt.int(s.oi.sum)} قرارداد`, `کال ${fmt.int(s.callOi.sum)} · پوت ${fmt.int(s.putOi.sum)}${Number.isFinite(s.putCallOi) ? ` · نسبت ${fmt.num(s.putCallOi)}` : ''} ${miss(s.oi)}`),
      tile('تغییر موقعیت باز', Number.isFinite(s.oiChange) ? `${s.oiChange > 0 ? '+' : ''}${fmt.int(s.oiChange)}` : '—', Number.isFinite(s.oiChangePct) ? `${fmt.pct(s.oiChangePct)}٪ نسبت به روز قبل · از ${fmt.int(s.oiKnown)} قرارداد با عدد دیروز` : 'عدد روز قبل نیامد', tone(s.oiChange)),
      tile('حجم و تعداد', `${fmt.int(s.volume.sum)} قرارداد`, `${fmt.int(s.trades.sum)} معامله ${miss(s.volume)}`),
      tile('جهت روز', `<span class="gain">${fmt.int(s.up)}↑</span> <span class="loss">${fmt.int(s.down)}↓</span>`, `${fmt.int(s.flat)} بی‌تغییر · میانهٔ کال ${fmt.pct(s.medianCall)}٪ · پوت ${fmt.pct(s.medianPut)}٪`),
      tile('تغییر وزنی با ارزش', Number.isFinite(s.valueWeightedChange) ? `${fmt.pct(s.valueWeightedChange)}٪` : '—', 'جایی که پول بیشتری جابه‌جا شد، وزن بیشتر', tone(s.valueWeightedChange)),
      tile('تلاطم وزنی با ارزش', Number.isFinite(s.valueWeightedIv) ? `${fmt.pct(s.valueWeightedIv)}٪` : '—', 'تلاطم آخرین معامله، وزن ارزش'),
      tile('پرارزش‌ترین', who(s.topValue, s.topValue ? fmt.rialText(s.topValue.value) : ''), s.topValue ? `${kindLabel(s.topValue.kind)} · ${esc(s.topValue.uaName)}` : ''),
      tile('بیشترین رشد / افت', `${who(s.topGainer, s.topGainer ? `<span class="gain">${fmt.pct(s.topGainer.points.change.last)}٪</span>` : '')}`, s.topLoser ? `${esc(s.topLoser.name)} <span class="loss">${fmt.pct(s.topLoser.points.change.last)}٪</span>` : ''),
      tile('بیشترین افزایش / کاهش تعهد', who(s.topOiAdd, s.topOiAdd ? `+${fmt.int(s.topOiAdd.oiChange)}` : ''), s.topOiCut && s.topOiCut.oiChange < 0 ? `${esc(s.topOiCut.name)} ${fmt.int(s.topOiCut.oiChange)}` : ''),
      tile('پرنوسان‌ترین', who(s.widest, s.widest ? `${fmt.pct(s.widest.dayRangePct)}٪` : ''), 'کمینه تا بیشینه ÷ پایانی روز قبل'),
    ].join('');
  }

  function paintStats(records) {
    const m = metricOf(opts.metric), stats = candleStats(records, m.key);
    const cell = (s) => `<td>${fmt.int(s.count)}</td><td>${metricText(m.key, s.min)}</td><td>${metricText(m.key, s.q1)}</td><td>${metricText(m.key, s.median)}</td><td>${metricText(m.key, s.q3)}</td><td>${metricText(m.key, s.max)}</td><td class="gain">${fmt.int(s.positive)}</td><td class="loss">${fmt.int(s.negative)}</td>`;
    q('[data-ccv-stats]').innerHTML = `<table class="ccv-stat-table"><caption>${esc(m.label)}${m.shape === 'candle' ? ' — نقطهٔ آخرین' : ''}</caption><thead><tr><th></th><th>شمار</th><th>کمینه</th><th>چارک اول</th><th>میانه</th><th>چارک سوم</th><th>بیشینه</th><th>مثبت</th><th>منفی</th></tr></thead><tbody>${[['all', 'همه'], ['call', 'کال'], ['put', 'پوت']].map(([k, t]) => `<tr><th>${t}</th>${cell(stats[k])}</tr>`).join('')}</tbody></table>`;
  }

  let current = { records: [], uaDays: [] };
  function paint() {
    if (past) paintPastPicker();
    const contracts = universe().contracts || [];
    const turnover = underlyingTurnover(contracts);
    paintControls(turnover);
    const pool = filterCandles(contracts, filterOf());
    const uaDays = uaDayMap();
    let records = recordsFor(pool, uaDays);
    flags = flagUnusual(records);
    if (opts.unusualOnly) records = records.filter((r) => flags.has(r.ins));
    const ranged = applyRanges(records, opts.ranges);
    paintSliders(records, ranged.kept.length);
    const hiddenSet = new Set(opts.hidden);
    const beforeHide = ranged.kept.length;
    records = ranged.kept.filter((r) => !hiddenSet.has(r.ins));
    paintHidden();
    const m = metricOf(opts.metric);
    const withShape = records.map((r) => ({ r, s: metricShape(r, m.key) }))
      .filter(({ r, s }) => s && (s.shape !== 'candle' || r.valid)
        && Number.isFinite(toAxis(m, s.low, opts.log)) && Number.isFinite(toAxis(m, s.high, opts.log))
        && (opts.xMode !== 'moneyness' || Number.isFinite(r.moneynessPct)));
    const order = orderCandles(withShape.map((x) => x.r), { xMode: opts.xMode, sortKey: opts.sortKey, sortDir: opts.sortDir, metric: m.key });
    const shapeOf = new Map(withShape.map((x) => [x.r.ins, x.s]));
    drawable = order; shapes = order.map((r) => shapeOf.get(r.ins));
    const usedUa = [...new Set(records.map((r) => r.uaIns))].map((ins) => uaDays.get(ins)).filter(Boolean);
    current = { records, uaDays: usedUa };
    paintStatus(pool.length, drawable.length);
    const lost = records.length - drawable.length;
    const extra = [
      lost > 0 ? `${fmt.int(lost)} قرارداد برای این شاخص داده ندارد${useLog(m, opts.log) ? ' یا روی محور لگاریتمی نمی‌نشیند' : ''}` : '',
      ranged.cut ? `${fmt.int(ranged.cut)} بیرون از دستگیره‌ها` : '',
      ranged.unknown ? `${fmt.int(ranged.unknown)} بی‌عدد برای دستگیرهٔ فعال` : '',
      beforeHide - records.length ? `${fmt.int(beforeHide - records.length)} دستی کنار رفته` : '',
    ].filter(Boolean);
    q('[data-ccv-count]').textContent = `${fmt.int(drawable.length)} ${m.shape === 'point' ? 'نقطه' : 'کندل'}${extra.length ? ` · ${extra.join(' · ')}` : ''}`;
    paintStats(drawable);
    paintSummary(drawable);
    paintComposite(drawable);
    q('[data-ccv-story]').innerHTML = candleNarrative(drawable, { metric: m.key, log: opts.log, unusual: flags, uaDays: usedUa, f: fmt }).map((line) => `<li>${esc(line)}</li>`).join('');
    paintPin();
    paintMother();
    paintHist(records.filter((r) => r.valid || metricOf(opts.histMetric).shape !== 'candle'));
    paintList(records);
    ensureInfos(pool);
  }

  // ── حالت گذشته: انتخاب روز و نماد ──────────────────────────────
  function paintPastPicker() {
    const box = q('[data-ccv-past-uas]');
    if (!box || pastState.loading) return;
    q('[data-ccv-past-status]').textContent = pastState.note || '';
    if (!pastState.universe) return;
    const picked = pastState.picked;
    box.innerHTML = pastState.unders.length ? pastState.unders.map((u) => `<label class="ccv-chip"><input type="checkbox" data-ccv-past-ua="${esc(u.ins)}"${picked.has(u.ins) ? ' checked' : ''}> ${esc(u.name)} <small>${fmt.int(u.contracts)} قرارداد · ${fmt.int(u.expiries)} سررسید</small></label>`).join('') : '<p class="empty-note">برای این روز قراردادی ثبت نشده است.</p>';
    const contracts = pastState.unders.filter((u) => !picked.size || picked.has(u.ins)).reduce((a, u) => a + u.contracts, 0);
    const uas = picked.size || pastState.unders.length;
    q('[data-ccv-past-cost]').textContent = `${fmt.int(contracts)} قرارداد و ${fmt.int(uas)} نماد پایه — ${fmt.int(Math.ceil((contracts + uas) / 200))} درخواست دسته‌ای${contracts > 1500 ? ' · گزینش بزرگ است و دریافت چند دقیقه طول می‌کشد' : ''}`;
    q('[data-ccv-past-load]').disabled = !pastState.unders.length;
  }

  async function pickPastDate(date) {
    pastState = { ...pastState, date: Number(date), universe: null, unders: [], picked: new Set(), note: `در حال گرفتن فهرست قراردادهای ${dateLabel(date)}…` };
    q('[data-ccv-past-status]').textContent = pastState.note;
    q('[data-ccv-past-uas]').innerHTML = '<p class="empty-note">در حال دریافت…</p>';
    try {
      const body = await fetchPastUniverse(date);
      if (pastState.date !== Number(date)) return;
      const rows = Array.isArray(body.rows) ? body.rows : [];
      const unders = pastUnderlyings(rows);
      const fallback = body.source === 'watch' || (!body.archived && !body.fromRoster);
      pastState = { ...pastState, universe: { ...body, rows }, unders, picked: new Set(unders.slice(0, 10).map((u) => u.ins)),
        note: `${fmt.int(rows.length)} ردیف زنجیره برای ${dateLabel(date)}${body.source === 'archive' ? ' (بایگانی همان روز)' : body.fromRoster ? ' (دفتر قراردادها)' : ''}${fallback ? ' — ⚠ فهرست آن روز پیدا نشد و فهرست امروز آمد؛ قراردادهای سررسیدشده در آن نیستند' : ''}${body.note ? ` · ${faDigits(body.note)}` : ''}` };
    } catch (error) {
      pastState = { ...pastState, note: `گرفتن فهرست آن روز ناموفق بود: ${faDigits(error.message)}` };
    }
    paintPastPicker();
  }

  async function loadPast() {
    if (!pastState.universe || pastState.loading) return;
    pastState.loading = true;
    q('[data-ccv-past-load]').disabled = true;
    const date = pastState.date;
    try {
      const got = await loadPastDay({
        date, rows: pastState.universe.rows, underlyings: [...pastState.picked], settings: getSettings() || {}, today: todayCompact(),
        onProgress: ({ done, total }) => { q('[data-ccv-past-status]').textContent = `دریافت قیمت‌های ${dateLabel(date)}: ${fmt.int(done)} از ${fmt.int(total)} ابزار…`; },
      });
      if (pastState.date !== date) return;
      infoCache.clear();
      for (const [ins, info] of Object.entries(got.infos)) infoCache.set(ins, { at: Date.now(), info });
      infoVersion += 1;
      pastState.payload = got.payload;
      const c = got.coverage;
      pastState.note = `${dateLabel(date)}: قیمت ${fmt.int(c.legsPriced)} از ${fmt.int(c.legsTotal)} قرارداد آمد (بقیه آن روز معامله نداشتند یا ردیف روزانه نداشتند)${c.basesMissing ? ` · قیمت ${fmt.int(c.basesMissing)} نماد پایه نیامد` : ''}${got.failed ? ` · ${fmt.int(got.failed)} ابزار خطای دریافت داشت` : ''}`;
      // گزینش قبلی ممکن است نمادهایی داشته باشد که این روز نیستند.
      const have = new Set((got.payload.universe.contracts || []).map((r) => String(r.uaIns)));
      opts = { ...opts, underlyings: opts.underlyings.filter((u) => have.has(u)), expiries: opts.expiries.filter((k) => have.has(k.split(':')[0])), dates: [] };
    } catch (error) {
      pastState.note = `دریافت روز ناموفق بود: ${faDigits(error.message)}`;
    } finally {
      pastState.loading = false;
    }
    paint();
  }

  async function mountPastCalendar() {
    const host_ = q('[data-ccv-past-cal]');
    host_.innerHTML = '<p class="empty-note">در حال گرفتن روزهای معاملاتی…</p>';
    let dates = [];
    try {
      // روزهای معاملاتی واقعی از سری روزانهٔ پرمعامله‌ترین نماد پایه.
      const live = getPayload?.()?.universe?.underlyings || [];
      const top = [...live].sort((a, b) => (Number(b.uaValue) || 0) - (Number(a.uaValue) || 0))[0];
      if (top) dates = await historyDates(String(top.ins), 400, { includeToday: false });
    } catch { dates = []; }
    const today = todayCompact();
    if (!dates.length) {
      // نبودِ سری: روزهای کاری یک سال اخیر؛ روز تعطیل خودش «بی‌داده» می‌گوید.
      const from = Number(today) - 10000;
      dates = tradingDays(String(from), String(today));
    }
    dates = dates.filter((d) => Number(d) < Number(today));
    mountDateWheel(host_, dates, pastState.date || dates[dates.length - 1] || null, (value) => pickPastDate(value), { empty: 'روزی برای انتخاب نیست.' });
    const first = Number(host_.dataset.value);
    if (first && !pastState.date) pickPastDate(first);
  }

  // ── رویدادها ────────────────────────────────────────────────────
  host.addEventListener('click', (event) => {
    const side = event.target.closest('[data-ccv-side]');
    if (side) { set({ side: side.dataset.ccvSide }); return; }
    const ua = event.target.closest('[data-ccv-ua]');
    if (ua) {
      const act = ua.dataset.ccvUa;
      if (act === 'all') { set({ underlyings: [], expiries: [] }); return; }
      const key = act.replace('top-', '');
      const top = underlyingTurnover(universe().contracts || []).sort((a, b) => b[key] - a[key]).filter((u) => u[key] > 0).slice(0, 10).map((u) => u.uaIns);
      set({ underlyings: top, expiries: [] });
      return;
    }
    if (event.target.closest('[data-ccv-exp-clear]')) { set({ dates: [], expiries: [] }); return; }
    if (event.target.closest('[data-ccv-more]')) { listLimit += LIST_STEP; paintList(current.records); return; }
    const contract = event.target.closest('[data-lmm-range-contract]');
    if (contract) { pinned = contract.dataset.lmmRangeContract; paintPin(); q('[data-ccv-pin]')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); return; }
    const focus = event.target.closest('[data-lmm-range-focus]');
    if (focus) {
      const expanded = focus.getAttribute('aria-expanded') === 'true';
      host.querySelectorAll('[data-lmm-range-focus]').forEach((item) => item.setAttribute('aria-expanded', 'false'));
      focus.setAttribute('aria-expanded', String(!expanded));
      return;
    }
    const hideBtn = event.target.closest('[data-ccv-hide]');
    if (hideBtn) { hide(hideBtn.dataset.ccvHide); return; }
    const unhide = event.target.closest('[data-ccv-unhide]');
    if (unhide) { set({ hidden: opts.hidden.filter((ins) => ins !== unhide.dataset.ccvUnhide) }); return; }
    if (event.target.closest('[data-ccv-unhide-all]')) { set({ hidden: [] }); return; }
    if (event.target.closest('[data-ccv-auto-outliers]')) {
      const ids = outlierIds(drawable, opts.metric, { log: opts.log });
      set({ hidden: [...new Set([...opts.hidden, ...ids])] });
      return;
    }
    const sReset = event.target.closest('[data-ccv-slider-reset]');
    if (sReset) { const { [sReset.dataset.ccvSliderReset]: _gone, ...rest } = opts.ranges; sliderSig = ''; set({ ranges: rest }); return; }
    if (event.target.closest('[data-ccv-ranges-reset]')) { event.preventDefault(); sliderSig = ''; set({ ranges: {} }); return; }
    if (event.target.closest('[data-ccv-unpin]')) { pinned = ''; paintPin(); return; }
    if (event.target.closest('[data-ccv-open]')) {
      const r = drawable.find((item) => item.ins === pinned);
      if (r && onOpenContract) onOpenContract(r);
      return;
    }
    if (event.target.closest('[data-ccv-past-load]')) { loadPast(); return; }
    if (event.target.closest('[data-ccv-full]')) {
      const card = q('.ccv-mother');
      if (document.fullscreenElement) document.exitFullscreen?.();
      else card.requestFullscreen?.().catch?.(() => {});
      return;
    }
    if (event.target.closest('[data-ccv-past-all]')) { pastState.picked = new Set(pastState.unders.map((u) => u.ins)); paintPastPicker(); return; }
    if (event.target.closest('[data-ccv-past-none]')) { pastState.picked = new Set(); paintPastPicker(); return; }
    if (event.target.closest('[data-ccv-past-top]')) { pastState.picked = new Set(pastState.unders.slice(0, 10).map((u) => u.ins)); paintPastPicker(); return; }
    if (event.target.closest('[data-ccv-preset-save]')) {
      const name = (prompt('نام این گزینش؟') || '').trim();
      if (!name) return;
      presets = { ...presets, [name]: Object.fromEntries(FILTER_KEYS.map((k) => [k, opts[k]])) };
      try { localStorage.setItem(PRESETS, JSON.stringify(presets)); } catch { /* بسته */ }
      paintControls(underlyingTurnover(universe().contracts || []));
      q('[data-ccv-preset]').value = name;
      return;
    }
    if (event.target.closest('[data-ccv-preset-del]')) {
      const name = q('[data-ccv-preset]').value;
      if (!name) return;
      const { [name]: _gone, ...rest } = presets; presets = rest;
      try { localStorage.setItem(PRESETS, JSON.stringify(presets)); } catch { /* بسته */ }
      paintControls(underlyingTurnover(universe().contracts || []));
      return;
    }
    const exp = event.target.closest('[data-ccv-export]');
    if (exp) { exportData(exp.dataset.ccvExport); }
  });
  host.addEventListener('change', (event) => {
    const el = event.target;
    if (el.dataset.ccvRange) { save(); return; }
    if (el.dataset.ccvPastUa) {
      if (el.checked) pastState.picked.add(el.dataset.ccvPastUa); else pastState.picked.delete(el.dataset.ccvPastUa);
      paintPastPicker(); return;
    }
    if (el.dataset.ccvUaPick) {
      const id = el.dataset.ccvUaPick, set_ = new Set(opts.underlyings);
      if (el.checked) set_.add(id); else set_.delete(id);
      set({ underlyings: [...set_], expiries: opts.expiries.filter((k) => set_.has(k.split(':')[0])) });
      return;
    }
    if (el.dataset.ccvDate) {
      const s = new Set(opts.dates); if (el.checked) s.add(el.dataset.ccvDate); else s.delete(el.dataset.ccvDate);
      set({ dates: [...s] }); return;
    }
    if (el.dataset.ccvExp) {
      const s = new Set(opts.expiries); if (el.checked) s.add(el.dataset.ccvExp); else s.delete(el.dataset.ccvExp);
      set({ expiries: [...s] }); return;
    }
    if (el.matches('[data-ccv-preset]')) {
      const p = presets[el.value];
      if (p) { listLimit = LIST_STEP; sliderSig = ''; set({ ...p, ranges: p.ranges || {} }); }
      return;
    }
    const name = el.dataset.ccv;
    if (!name || name === 'uaSearch') return;
    if (el.type === 'checkbox') { set({ [name]: el.checked }); return; }
    if (name === 'listSort' || name === 'listDir') listLimit = LIST_STEP;
    if (['top', 'histBins'].includes(name)) { set({ [name]: Math.max(0, Number(el.value) || 0) }); return; }
    if (['histWidth', 'histTails'].includes(name)) { set({ [name]: Math.max(0, Number(el.value) || 0) }); return; }
    set({ [name]: el.value });
  });
  host.addEventListener('input', (event) => {
    const el = event.target;
    // ── دستگیره: هم‌زمان، بی ذخیره در هر حرکت ──
    if (el.dataset.ccvRange) {
      const key = el.dataset.ccvRange, sc = scales[key];
      if (!sc) return;
      const pair = host.querySelectorAll(`[data-ccv-range="${key}"]`);
      let lo = Number(pair[0].value), hi = Number(pair[1].value);
      if (lo > hi) { if (el.dataset.end === 'lo') { lo = hi; pair[0].value = String(lo); } else { hi = lo; pair[1].value = String(hi); } }
      const range = { lo: lo > 0 ? sc.toValue(lo) : null, hi: hi < SLIDER_STEPS ? sc.toValue(hi) : null };
      const ranges = { ...opts.ranges };
      if (range.lo == null && range.hi == null) delete ranges[key]; else ranges[key] = range;
      opts = { ...opts, ranges };
      paintSoon();
      return;
    }
    if (el.dataset.ccv !== 'uaSearch') return;
    opts = { ...opts, uaSearch: el.value }; save();
    paintControls(underlyingTurnover(universe().contracts || []));
  });

  async function exportData(kind) {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    if (kind === 'png') {
      if (!mother) return;
      const url = mother.instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: getComputedStyle(document.body).getPropertyValue('--panel').trim() });
      const blob = await (await fetch(url)).blob();
      saveBlob(blob, `contract-candles-${stamp}.png`);
      return;
    }
    const names = new Map((universe().underlyings || []).map((u) => [String(u.ins), u.name]));
    const rangeText = SLIDER_FIELDS.filter((f) => opts.ranges[f.key]).map((f) => `${f.label}: ${fieldText(f.unit, opts.ranges[f.key].lo ?? NaN)} تا ${fieldText(f.unit, opts.ranges[f.key].hi ?? NaN)}`).join('، ');
    const filterLines = [
      ...(past ? [`روز: ${dateLabel(pastState.date)}`] : []),
      `نوع: ${opts.side === 'all' ? 'کال و پوت' : opts.side === 'call' ? 'فقط کال' : 'فقط پوت'}`,
      `نمادها: ${opts.underlyings.length ? opts.underlyings.map((id) => names.get(id) || id).join('، ') : 'همه'}`,
      `سررسیدها: ${opts.dates.length ? opts.dates.map((d) => dateLabel(d)).join('، ') : 'همه'}${opts.expiries.length ? ` · سررسید نماد: ${opts.expiries.map((k) => `${names.get(k.split(':')[0]) || ''} ${dateLabel(k.split(':')[1])}`).join('، ')}` : ''}`,
      `N برتر: ${Number(opts.top) || 'همه'}${opts.unusualOnly ? ' · فقط غیرعادی‌ها' : ''}${rangeText ? ` · دستگیره‌ها: ${rangeText}` : ''}${opts.hidden.length ? ` · ${opts.hidden.length} کندل دستی کنار رفته` : ''}`,
      `محور: ${metricOf(opts.metric).label}${useLog(metricOf(opts.metric), opts.log) ? ' (لگاریتمی)' : ''}`,
    ];
    const narrative = candleNarrative(drawable, { metric: opts.metric, log: opts.log, unusual: flags, uaDays: current.uaDays, f: fmt });
    await downloadCandleWorkbook({ records: current.records, uaDays: current.uaDays, flags, filterLines, narrative, at: past ? pastState.date : (payload().snapshotAt || payload().at || '') }, past ? `${pastState.date}-${stamp}` : stamp);
  }

  if (past) mountPastCalendar();

  return {
    paint,
    dispose() { motherSeq += 1; histSeq += 1; mother?.dispose(); hist?.dispose(); mother = null; hist = null; },
  };
}
