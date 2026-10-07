// تب «کندل قیمت امروز قراردادها» در رصد لحظه‌ای.
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۵): کندل امروز از تب «نقشه و زنجیره» به
// تبی جدا آمد، با گزینش مستقل (نه از نقشه). بالای تب نمودار مادر است: همهٔ
// کندل‌های گزینش، عمودی، روی یک محور قابل مقایسه (لگاریتمی) و با شاخص
// قابل انتخاب. زیرش روایت به زبان معامله‌گر، نمودار میله‌ای توزیع، و همان
// کندل‌های افقی قبلی. منطق عددی همه در `core/contract-candles.mjs` است.

import { fmt, faDigits } from './fmt.mjs';
import { mountChart, chartBase } from './chart-host.mjs';
import { mountCandlePoints } from './candle-points.mjs';
import { fetchInfos } from './quote-intake.mjs';
import { saveBlob } from './save-file.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { rangeHeading } from '../core/range-info.mjs';
import { pctVsYesterday } from '../core/price-change.mjs';
import { IV_WHY_LABEL } from '../core/live-market.mjs';
import {
  CANDLE_POINTS, POINT_LABEL, CANDLE_METRICS, X_MODES, RANK_KEYS, metricOf, useLog, toAxis, fromAxis, logTicks,
  metricShape, candleRecord, underlyingDay, filterCandles, underlyingTurnover, orderCandles,
  groupBands, candleStats, flagUnusual, candleNarrative, staleInfoIds, histogram,
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
const COLOR_BY = [['direction', 'جهت (سبز/قرمز) · پوت توخالی'], ['kind', 'کال و پوت'], ['underlying', 'نماد پایه'], ['expiry', 'سررسید']];
const HIST_POINTS = [['last', 'آخرین'], ['close', 'پایانی'], ['first', 'اولین'], ['low', 'کمینه'], ['high', 'بیشینه'], ['range', 'طول کندل (بیشینه − کمینه)']];

const DEFAULTS = {
  side: 'all', metric: 'change', log: true, xMode: 'grouped', rankKey: 'value', colorBy: 'direction',
  underlyings: [], dates: [], expiries: [], minValueM: 0, top: 0, unusualOnly: false, uaSort: 'value', uaSearch: '',
  histMetric: 'change', histPoint: 'last', histBins: 12, histUnit: 'contract', listSort: 'value',
};
function readOpts() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    return { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch { return { ...DEFAULTS }; }
}
function readPresets() {
  try { const v = JSON.parse(localStorage.getItem(PRESETS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
const FILTER_KEYS = ['side', 'underlyings', 'dates', 'expiries', 'minValueM', 'top', 'unusualOnly', 'metric', 'log', 'xMode', 'rankKey', 'colorBy'];

/** برچسب محور: بی دنبالهٔ «٫۰۰»؛ عدد کوچک یک یا دو رقم اعشار. */
function axisText(metric, value) {
  const m = metricOf(metric);
  if (!Number.isFinite(value)) return '';
  const a = Math.abs(value), digits = a >= 10 ? 0 : a >= 1 ? 1 : 2;
  const text = faDigits(String(Number(value.toFixed(digits))).replace('-', '−').replace('.', '٫'));
  return m.unit === 'pct' ? `${text}٪` : text;
}

/** قالب نمایشی هر شاخص. */
function metricText(metric, value) {
  const m = metricOf(metric);
  if (!Number.isFinite(value)) return '—';
  return m.unit === 'pct' ? `${fmt.pct(value)}٪` : fmt.num(value);
}

/**
 * سوار کردن تب. `getPayload` همان بدنهٔ `/api/live-dashboard` است،
 * `getSettings` تنظیمات (برای حل‌گر تلاطم)، `greekParams` پارامتر یونانی‌ها.
 */
export function mountContractCandles(host, { getPayload, getSettings = () => ({}), greekParams = () => ({}), isVisible = () => true, onOpenContract = null } = {}) {
  let opts = readOpts();
  let presets = readPresets();
  const infoCache = new Map();
  let infoVersion = 0, fetching = false, fetchError = '', listLimit = LIST_STEP;
  let recordCache = { key: '', map: new Map() };
  let drawable = [], shapes = [], flags = new Map(), pinned = '', zoom = { sig: '', ranges: null };
  let mother = null, hist = null, motherSeq = 0, histSeq = 0, lastHistBars = [];

  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(opts)); } catch { /* حافظهٔ بسته؛ همین نشست می‌ماند */ } };
  const set = (patch) => { opts = { ...opts, ...patch }; save(); paint(); };

  host.innerHTML = `<div class="ccv">
    <section class="card ccv-filters">
      <div class="section-head"><div><p class="eyebrow">گزینش مستقل از نقشه</p><h2 data-ccv-title>کندل قیمت امروز قراردادها</h2></div>
        <div class="ccv-actions"><button type="button" class="ghost" data-ccv-export="xlsx">خروجی کامل اکسل</button><button type="button" class="ghost" data-ccv-export="png">تصویر نمودار مادر</button></div></div>
      <p class="note" data-ccv-status role="status"></p>
      <div class="ccv-row">
        <div class="ccv-seg" role="group" aria-label="نوع قرارداد">${[['all', 'کال و پوت'], ['call', 'فقط کال'], ['put', 'فقط پوت']].map(([v, t]) => `<button type="button" data-ccv-side="${v}">${t}</button>`).join('')}</div>
        <label>حداقل ارزش هر قرارداد (میلیون ریال)<input type="number" min="0" step="100" data-ccv="minValueM" dir="ltr"></label>
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
      <div class="section-head"><div><p class="eyebrow">نمودار مادر</p><h3>همهٔ کندل‌های گزینش روی یک محور</h3></div><span class="note" data-ccv-count></span></div>
      <div class="ccv-row">
        <label>محور عمودی<select data-ccv="metric">${CANDLE_METRICS.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}</select></label>
        <label class="check" data-ccv-log-wrap><input type="checkbox" data-ccv="log"> محور لگاریتمی</label>
        <label>محور افقی<select data-ccv="xMode">${X_MODES.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}</select></label>
        <label data-ccv-rank-wrap>رتبه بر<select data-ccv="rankKey">${RANK_KEYS.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}</select></label>
        <label>رنگ بر اساس<select data-ccv="colorBy">${COLOR_BY.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      </div>
      <div class="ccv-legend" data-ccv-legend></div>
      <div class="ccv-chart" data-ccv-chart="mother"></div>
      <div class="ccv-pin" data-ccv-pin hidden></div>
      <div class="ccv-stats" data-ccv-stats></div>
      <div class="ccv-story"><h4>این نمودار چه می‌گوید</h4><ul data-ccv-story></ul></div>
    </section>
    <section class="card ccv-hist">
      <div class="section-head"><div><p class="eyebrow">توزیع</p><h3>چند قرارداد در هر بازه</h3></div><span class="note">میله‌ها: شمار کال و پوت در هر بازهٔ شاخص؛ دو سرِ دور در «کمتر از» و «بیشتر از» جمع می‌شوند.</span></div>
      <div class="ccv-row">
        <label>شاخص<select data-ccv="histMetric">${CANDLE_METRICS.map((m) => `<option value="${m.key}">${esc(m.label)}</option>`).join('')}</select></label>
        <label data-ccv-hist-point>نقطهٔ کندل<select data-ccv="histPoint">${HIST_POINTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
        <label>شمار بازه‌ها<select data-ccv="histBins">${[6, 8, 12, 16, 24, 32].map((v) => `<option value="${v}">${fmt.int(v)}</option>`).join('')}</select></label>
        <label>واحد شمارش<select data-ccv="histUnit"><option value="contract">قرارداد</option><option value="underlying">نماد پایه (میانهٔ قراردادهایش)</option></select></label>
      </div>
      <div class="ccv-chart ccv-chart-short" data-ccv-chart="hist"></div>
      <p class="note" data-ccv-hist-note></p>
    </section>
    <section class="card ccv-list-card">
      <div class="lmm-step-head"><div><h3>کندل افقی هر قرارداد</h3><span>سایه: کمترین تا بیشترین · بدنه: اولین تا آخرین · لوزی: قیمت پایانی</span></div><div class="lmm-range-sort" data-lmm-range-sort role="group" aria-label="مرتب‌سازی نمودار کندلی روزانه"></div></div>
      <div data-lmm-range-status class="note"></div><div data-lmm-range-chart></div>
    </section>
  </div>`;

  const q = (sel) => host.querySelector(sel);
  const field = (name) => q(`[data-ccv="${name}"]`);
  const payload = () => getPayload?.() || {};
  const universe = () => payload().universe || { underlyings: [], contracts: [] };

  // ── گزینش ─────────────────────────────────────────────────────────
  const filterOf = () => ({
    side: opts.side, underlyings: opts.underlyings, dates: opts.dates, expiries: opts.expiries,
    minValue: Number(opts.minValueM) > 0 ? Number(opts.minValueM) * 1e6 : 0, top: Number(opts.top) || 0,
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
    if (recordCache.key !== key) recordCache = { key, map: new Map() };
    const settings = getSettings() || {}, params = greekParams() || {};
    return pool.map((row) => {
      let rec = recordCache.map.get(String(row.ins));
      if (!rec) {
        rec = candleRecord(row, { info: infoCache.get(String(row.ins))?.info || null, uaDay: uaDays.get(String(row.uaIns)), settings, params });
        recordCache.map.set(String(row.ins), rec);
      }
      return rec;
    });
  }

  // ── دریافت کمینه/بیشینه: فقط وقتی تب دیده می‌شود و فقط کهنه‌ها ─────
  async function ensureInfos(pool) {
    if (fetching || !isVisible()) return;
    const ids = [...pool.map((row) => String(row.ins)), ...new Set(pool.map((row) => String(row.uaIns)))];
    // ارزش بالاتر زودتر: اگر گزینش بزرگ است، کندل‌های مهم‌تر زودتر می‌رسند.
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
  function colorOf(r, s, t, groups) {
    if (opts.colorBy === 'kind') return r.kind === 'put' ? t.series[1] : t.series[0];
    if (opts.colorBy === 'underlying') return t.palette[groups.ua.get(r.uaIns) % t.palette.length];
    if (opts.colorBy === 'expiry') return t.palette[groups.exp.get(r.endDate) % t.palette.length];
    // جهت: کندل از اولین به آخرینِ همان شاخص؛ نقطه و بازه از جهت روزِ قرارداد.
    const d = s.shape === 'candle' ? s.close - s.open : r.points.change.last;
    return d > 0 ? t.gain : d < 0 ? t.loss : t.muted;
  }

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
    return `<div class="ccv-tip" dir="rtl">
      <header><b>${esc(r.name)}</b><span>${kindLabel(r.kind)} · ${esc(r.uaName)} · اعمال ${fmt.money(r.strike)} · سررسید ${dateLabel(r.endDate)} · ${fmt.int(r.days)} روز</span></header>
      ${shapeLine ? `<p class="ccv-tip-metric">${shapeLine}</p>` : ''}
      <table><thead><tr><th></th><th>قیمت</th><th>٪ دیروز</th><th>پایهٔ جفت</th><th>تلاطم</th><th>٪ پایه</th></tr></thead><tbody>${rows}</tbody></table>
      <p>پایانی دیروز ${fmt.money(r.yday)} · دامنه روز ${fmt.pct(r.dayRangePct)}٪ · جای آخرین در بازه ${fmt.pct(r.dayPositionPct)}٪ · پایه امروز <span class="${tone(r.uaChangePct)}">${fmt.pct(r.uaChangePct)}٪</span></p>
      <p>ارزش ${fmt.rialText(r.value)} · حجم ${fmt.int(r.volume)} · ${fmt.int(r.trades)} معامله · موقعیت باز ${fmt.int(r.oi)} (${fmt.pct(r.oiChangePct)}٪)</p>
      <p>مظنه ${fmt.money(r.bid)} / ${fmt.money(r.ask)} · اسپرد ${fmt.pct(r.spreadPct)}٪ · دلتا ${fmt.num(r.delta)} · اهرم مؤثر ${fmt.num(r.effectiveLeverage)} · تا سربه‌سر ${fmt.pct(r.breakevenGapPct)}٪ · فاصله اعمال ${fmt.pct(r.moneynessPct)}٪</p>
      ${r.rangeSource === 'infoLag' ? '<p class="note">کمینه/بیشینه از چند ثانیه قبل است و با آخرین قیمت عکس گسترده شد.</p>' : ''}
      ${flag ? `<p class="warn">غیرعادی نسبت به هم‌سررسیدها: ${flag.map((f) => (f === 'value' ? 'ارزش معامله' : 'دامنه روز')).join('، ')}</p>` : ''}
    </div>`;
  }

  function paintPin() {
    const box = q('[data-ccv-pin]');
    const r = drawable.find((item) => item.ins === pinned);
    box.hidden = !r;
    if (!r) { box.innerHTML = ''; return; }
    box.innerHTML = `${detailHtml(r)}<div class="ccv-pin-actions">${onOpenContract ? '<button type="button" class="ghost" data-ccv-open>دیدن در زنجیره</button>' : ''}<button type="button" class="ghost" data-ccv-unpin>بستن</button></div>`;
  }

  // ── نمودار مادر ─────────────────────────────────────────────────
  function buildMother(echarts, t) {
    if (!drawable.length) return null;
    const m = metricOf(opts.metric), L = useLog(m, opts.log), cat = opts.xMode !== 'moneyness';
    const ax = (v) => toAxis(m, v, opts.log);
    const uaIdx = new Map(), expIdx = new Map();
    for (const r of drawable) {
      if (!uaIdx.has(r.uaIns)) uaIdx.set(r.uaIns, uaIdx.size);
      if (!expIdx.has(r.endDate)) expIdx.set(r.endDate, expIdx.size);
    }
    const groups = { ua: uaIdx, exp: expIdx };
    const data = drawable.map((r, i) => {
      const s = shapes[i];
      const v = [cat ? i : r.moneynessPct, ax(s.low), ax(s.high), ax(s.open), ax(s.close), ax(s.mark), ax(s.last), i];
      return v.map((x) => (Number.isFinite(x) ? x : '-'));
    });
    const lows = data.map((d) => d[1]).filter(Number.isFinite), highs = data.map((d) => d[2]).filter(Number.isFinite);
    const ticks = L ? logTicks(m, Math.min(...lows), Math.max(...highs)) : undefined;

    const renderItem = (params, api) => {
      const i = api.value(7), r = drawable[i], s = shapes[i];
      if (!r || !s) return null;
      const x = api.value(0);
      const pLo = api.coord([x, api.value(1)]), pHi = api.coord([x, api.value(2)]);
      const cx = pLo[0];
      if (!Number.isFinite(cx) || !Number.isFinite(pLo[1]) || !Number.isFinite(pHi[1])) return null;
      const bw = cat ? Math.max(2, Math.min(14, api.size([1, 0])[0] * 0.62)) : 7;
      const color = colorOf(r, s, t, groups);
      const hollow = opts.colorBy === 'direction' && r.kind === 'put';
      const flagged = flags.has(r.ins);
      const edge = flagged ? t.warn : color, edgeW = flagged ? 2.5 : 1.2;
      const kids = [];
      const yOf = (k) => { const v = api.value(k); return Number.isFinite(v) ? api.coord([x, v])[1] : NaN; };
      if (s.shape === 'point') {
        const y = yOf(5), rad = flagged ? 5.5 : 4.5;
        if (!Number.isFinite(y)) return null;
        kids.push(r.kind === 'put'
          ? { type: 'polygon', shape: { points: [[cx, y - rad], [cx + rad, y], [cx, y + rad], [cx - rad, y]] }, style: { fill: hollow ? t.panel : color, stroke: edge, lineWidth: edgeW } }
          : { type: 'circle', shape: { cx, cy: y, r: rad }, style: { fill: color, stroke: edge, lineWidth: edgeW } });
      } else {
        kids.push({ type: 'line', shape: { x1: cx, y1: pLo[1], x2: cx, y2: pHi[1] }, style: { stroke: color, lineWidth: 1.3 } });
        if (s.shape === 'candle') {
          const o = yOf(3), c = yOf(4);
          if (Number.isFinite(o) && Number.isFinite(c)) {
            kids.push({ type: 'rect', shape: { x: cx - bw / 2, y: Math.min(o, c), width: bw, height: Math.max(1.5, Math.abs(o - c)) }, style: { fill: hollow ? t.panel : color, stroke: edge, lineWidth: edgeW } });
          }
          const mk = yOf(5);
          if (Number.isFinite(mk)) {
            const d = Math.max(2.5, Math.min(4.5, bw / 2));
            kids.push({ type: 'polygon', shape: { points: [[cx, mk - d], [cx + d, mk], [cx, mk + d], [cx - d, mk]] }, style: { fill: t.warn, stroke: t.panel, lineWidth: 0.8 } });
          }
        } else {
          const mid = yOf(5), last = yOf(6);
          kids.push({ type: 'rect', shape: { x: cx - bw / 2, y: Math.min(pLo[1], pHi[1]), width: bw, height: Math.max(1.5, Math.abs(pLo[1] - pHi[1])) }, style: { fill: 'transparent', stroke: edge, lineWidth: edgeW } });
          if (Number.isFinite(mid)) kids.push({ type: 'line', shape: { x1: cx - bw / 2 - 2, y1: mid, x2: cx + bw / 2 + 2, y2: mid }, style: { stroke: color, lineWidth: 2 } });
          if (Number.isFinite(last)) kids.push({ type: 'circle', shape: { cx, cy: last, r: 2.6 }, style: { fill: t.ink } });
        }
      }
      return { type: 'group', children: kids };
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
    const base = chartBase(t);
    const sig = zoom.sig;
    const zoomRange = (k, fallback) => (zoom.ranges && sig === zoomSig() ? zoom.ranges[k] : fallback);
    return {
      grid: { left: 58, right: 54, top: 30, bottom: cat ? 104 : 72, containLabel: false },
      tooltip: { ...base.tooltip, trigger: 'item', confine: true, enterable: false, formatter: (p) => detailHtml(drawable[p.value?.[7]] || drawable[0]), extraCssText: `${base.tooltip.extraCssText} max-width: 460px; white-space: normal;` },
      xAxis: cat
        ? { type: 'category', data: drawable.map((r) => r.name), axisLabel: { rotate: 60, fontSize: 10, color: t.muted, hideOverlap: true }, axisLine: { lineStyle: { color: t.line } } }
        : { type: 'value', scale: true, name: 'فاصله اعمال از پایه ٪', nameLocation: 'middle', nameGap: 28, axisLabel: { color: t.muted, formatter: (v) => axisText('change', v) }, splitLine: { lineStyle: { color: t.lineSoft } } },
      yAxis: {
        type: 'value', scale: true, name: m.short + (L ? ' · لگاریتمی' : ''), nameTextStyle: { color: t.muted },
        axisLabel: { color: t.muted, formatter: (v) => axisText(m.key, fromAxis(m, v, opts.log)), ...(ticks ? { customValues: ticks } : {}) },
        ...(ticks ? { axisTick: { customValues: ticks } } : {}),
        splitLine: { lineStyle: { color: t.lineSoft } },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, ...zoomRange(0, {}) },
        { type: 'slider', xAxisIndex: 0, height: 16, bottom: 8, ...zoomRange(1, {}) },
        { type: 'slider', yAxisIndex: 0, width: 14, right: 8, ...zoomRange(2, {}) },
      ],
      series: [{
        type: 'custom', renderItem, data, clip: true,
        dimensions: ['x', 'low', 'high', 'open', 'close', 'mark', 'last', 'i'],
        encode: { x: 0, y: [1, 2, 5, 6], tooltip: [] },
        markLine: refs.length ? { silent: true, symbol: 'none', lineStyle: { color: t.muted, type: 'dashed' }, label: { color: t.muted, fontSize: 10 }, data: refs } : undefined,
        markArea: bands.length > 1 ? {
          silent: true,
          data: bands.filter((_, i) => i % 2 === 0).map((b) => [
            { xAxis: b.from, itemStyle: { color: t.accentSoft, opacity: 0.35 }, label: { show: bands.length <= 30, position: 'insideTop', color: t.muted, fontSize: 10, formatter: `${b.uaName} ${dateLabel(b.endDate)}` } },
            { xAxis: b.to },
          ]),
        } : undefined,
      }],
    };
  }
  const zoomSig = () => JSON.stringify([opts.xMode, opts.metric, opts.log, opts.rankKey, drawable.length, drawable[0]?.ins]);

  async function paintMother() {
    const target = q('[data-ccv-chart="mother"]');
    if (!drawable.length) {
      mother?.dispose(); mother = null;
      target.innerHTML = `<p class="empty-note">${fetching ? 'در حال دریافت کمینه/بیشینهٔ امروز…' : 'در این گزینش قرارداد معامله‌شده‌ای با داده برای این شاخص نیست.'}</p>`;
      return;
    }
    if (mother) { mother.update(buildMother); return; }
    const seq = ++motherSeq;
    const handle = await mountChart(target, buildMother, {
      onClick: (p) => { const r = drawable[p.value?.[7]]; if (r) { pinned = r.ins; paintPin(); } },
    });
    if (seq !== motherSeq) { handle?.dispose(); return; }
    mother = handle;
    mother?.instance.on('datazoom', () => {
      const dz = mother.instance.getOption().dataZoom || [];
      zoom = { sig: zoomSig(), ranges: dz.map((z) => ({ start: z.start, end: z.end })) };
    });
  }

  // ── نمودار میله‌ای ──────────────────────────────────────────────
  function buildHist(echarts, t) {
    const bars = lastHistBars;
    if (!bars.length) return null;
    const m = metricOf(opts.histMetric);
    const label = (b) => (b.kind === 'under' ? `کمتر از ${axisText(m.key, b.to)}`
      : b.kind === 'over' ? `بیشتر از ${axisText(m.key, b.from)}`
        : `${axisText(m.key, b.from)} تا ${axisText(m.key, b.to)}`);
    const base = chartBase(t);
    const unit = opts.histUnit === 'underlying' ? 'نماد' : 'قرارداد';
    return {
      grid: { left: 48, right: 20, top: 30, bottom: 76, containLabel: false },
      legend: { top: 0, textStyle: { color: t.ink } },
      tooltip: {
        ...base.tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true,
        formatter: (ps) => {
          const b = bars[ps[0]?.dataIndex];
          if (!b) return '';
          const names = b.items.slice(0, 14).map((x) => `${esc(x.name)} <small>${metricText(m.key, x.value)}</small>`).join('، ');
          return `<div dir="rtl" class="ccv-tip"><b>${label(b)}</b><p>کال ${fmt.int(b.call)} · پوت ${fmt.int(b.put)} · جمع ${fmt.int(b.call + b.put)} ${unit}</p><p>${names}${b.items.length > 14 ? ' …' : ''}</p></div>`;
        },
        extraCssText: `${base.tooltip.extraCssText} max-width: 420px; white-space: normal;`,
      },
      xAxis: { type: 'category', data: bars.map(label), axisLabel: { rotate: 35, fontSize: 10, color: t.muted }, axisLine: { lineStyle: { color: t.line } } },
      yAxis: { type: 'value', minInterval: 1, name: `شمار ${unit}`, nameTextStyle: { color: t.muted }, axisLabel: { color: t.muted, formatter: (v) => fmt.int(v) }, splitLine: { lineStyle: { color: t.lineSoft } } },
      series: [
        { name: 'کال', type: 'bar', stack: 'n', data: bars.map((b) => b.call), itemStyle: { color: t.series[0] }, label: { show: true, position: 'inside', color: t.onAccent, fontSize: 10, formatter: (p) => (p.value ? fmt.int(p.value) : '') } },
        { name: 'پوت', type: 'bar', stack: 'n', data: bars.map((b) => b.put), itemStyle: { color: t.series[1] }, label: { show: true, position: 'inside', color: t.onAccent, fontSize: 10, formatter: (p) => (p.value ? fmt.int(p.value) : '') } },
      ],
    };
  }
  async function paintHist(records) {
    const m = metricOf(opts.histMetric);
    q('[data-ccv-hist-point]').hidden = m.shape !== 'candle';
    const h = histogram(records, { metric: m.key, point: m.shape === 'candle' ? opts.histPoint : 'last', bins: Number(opts.histBins) || 12, unit: opts.histUnit });
    lastHistBars = h.bars;
    const busiest = [...h.bars].sort((a, b) => (b.call + b.put) - (a.call + a.put))[0];
    q('[data-ccv-hist-note]').textContent = h.count
      ? `${fmt.int(h.count)} ${opts.histUnit === 'underlying' ? 'نماد (کال و پوت جدا)' : 'قرارداد'} · گام هر بازه ${axisText(m.key, h.step)}${busiest ? ` · پرجمعیت‌ترین بازه: ${fmt.int(busiest.call + busiest.put)} مورد` : ''}. موس را روی هر میله ببر تا نام‌ها را ببینی.`
      : 'برای این شاخص در گزینش فعلی عددی نیست.';
    const target = q('[data-ccv-chart="hist"]');
    if (!h.bars.length) { hist?.dispose(); hist = null; target.innerHTML = '<p class="empty-note">داده‌ای برای نمودار میله‌ای نیست.</p>'; return; }
    if (hist) { hist.update(buildHist); return; }
    const seq = ++histSeq;
    const handle = await mountChart(target, buildHist);
    if (seq !== histSeq) { handle?.dispose(); return; }
    hist = handle;
  }

  // ── کندل‌های افقی (همان نمای قبلی، روی همین گزینش) ─────────────
  function paintList(records) {
    const rangeStatus = q('[data-lmm-range-status]'), rangeChart = q('[data-lmm-range-chart]');
    const rangeSort = opts.listSort;
    const labels = { value: 'ارزش معاملات', volume: 'حجم معاملات', oi: 'موقعیت باز' };
    q('[data-lmm-range-sort]').innerHTML = Object.entries(labels).map(([id, label]) => `<button type="button" data-lmm-range-key="${id}" aria-pressed="${id === rangeSort}">${label}</button>`).join('');
    const rows = records.filter((row) => row.valid)
      .sort((a, b) => (Number(b[rangeSort]) || -1) - (Number(a[rangeSort]) || -1) || a.name.localeCompare(b.name, 'fa'));
    const lagged = rows.filter((row) => row.rangeSource === 'infoLag').length;
    const other = records.filter((row) => row.rangeSource === 'otherSession').length;
    rangeStatus.textContent = `${fmt.int(rows.length)} قرارداد دارای بازه معتبر از ${fmt.int(records.length)} قرارداد گزینش · مرتب بر ${labels[rangeSort]}`
      + ' · ارزش، حجم، موقعیت باز و قیمت‌ها همان عدد زنجیره‌اند'
      + `${lagged ? ` · کمینه/بیشینهٔ ${fmt.int(lagged)} قرارداد از چند ثانیه قبل است و با آخرین قیمت عکس گسترده شد` : ''}`
      + `${other ? ` · ${fmt.int(other)} قرارداد: پاسخ کمینه/بیشینه مال جلسهٔ دیگری بود و کنار گذاشته شد` : ''}`;
    if (!rows.length) { rangeChart.innerHTML = `<p class="empty-note">${fetching ? 'در حال دریافت…' : 'بالادست برای قراردادهای این گزینش بازه معتبر امروز برنگرداند.'}</p>`; return; }
    const shown = rows.slice(0, listLimit);
    rangeChart.innerHTML = `<div class="lmm-range-legend"><span>سایه: کمینه تا بیشینه</span><span>بدنه: اولین تا آخرین</span><span>نقاط: پنج قیمت مستقل</span><span>قیمت‌ها: ریال، برای هر واحد دارایی پایه</span><small>موس را روی هر کندل حرکت بده تا همه قیمت‌ها دیده شوند؛ کلیک، جزئیات را باز نگه می‌دارد.</small></div><div class="lmm-range-list">${shown.map((row) => {
      const low = Number(row.low), high = Number(row.high), first = Number(row.first), last = Number(row.last), close = Number(row.close);
      // هر عدد با واحدِ خودش: ارزش ریال، حجم و موقعیت باز «قرارداد» (نه سهم).
      const rankValue = rangeSort === 'value' ? fmt.rialText(row.value)
        : Number.isFinite(Number(row[rangeSort])) ? `${fmt.int(Number(row[rangeSort]))} قرارداد` : '—';
      const lastPct = pctVsYday(last, row.yday), closePct = pctVsYday(close, row.yday);
      return `<article class="${tone(last - first)}" data-lmm-range-card="${esc(row.ins)}"><header><button type="button" data-lmm-range-contract="${esc(row.ins)}"><b>${esc(row.name)}</b><small>${kindLabel(row.kind)} · ${esc(row.uaName)} · اعمال ${fmt.money(row.strike)} · ${dateLabel(row.endDate)}</small></button><div class="lmm-range-stats"><strong${rangeSort === 'value' && Number.isFinite(Number(row.value)) ? ` title="${fmt.rial(Number(row.value))} ریال"` : ''}>${rankValue}</strong><span class="${tone(lastPct)}">آخرین ${fmt.pct(lastPct)}٪</span><span class="${tone(closePct)}">پایانی ${fmt.pct(closePct)}٪</span></div></header><button type="button" class="lmm-range-track" data-lmm-range-focus="${esc(row.ins)}" aria-expanded="false" aria-label="کندل روزانه ${esc(row.name)}؛ تغییر آخرین ${fmt.pct(lastPct)} درصد و پایانی ${fmt.pct(closePct)} درصد"></button><footer><span>کمینه ${fmt.money(low)}</span><span>اولین ${fmt.money(first)}</span><span>آخرین ${fmt.money(last)}</span><span>پایانی ${fmt.money(close)}</span><span>بیشینه ${fmt.money(high)}</span></footer></article>`;
    }).join('')}</div>${rows.length > shown.length ? `<button type="button" class="ghost ccv-more" data-ccv-more>نمایش ${fmt.int(Math.min(LIST_STEP, rows.length - shown.length))} کندل دیگر (از ${fmt.int(rows.length - shown.length)} باقی‌مانده)</button>` : ''}`;
    rangeChart.querySelectorAll('[data-lmm-range-focus]').forEach((button) => {
      mountCandlePoints(button, shown.find((row) => String(row.ins) === button.dataset.lmmRangeFocus));
    });
  }

  // ── کنترل‌ها ────────────────────────────────────────────────────
  function paintControls(turnover) {
    host.querySelectorAll('[data-ccv-side]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ccvSide === opts.side)));
    for (const name of ['minValueM', 'top', 'metric', 'xMode', 'rankKey', 'colorBy', 'uaSort', 'histMetric', 'histPoint', 'histBins', 'histUnit']) {
      const el = field(name);
      if (el && document.activeElement !== el) el.value = String(opts[name]);
    }
    if (document.activeElement !== field('uaSearch')) field('uaSearch').value = opts.uaSearch || '';
    field('unusualOnly').checked = !!opts.unusualOnly;
    const m = metricOf(opts.metric);
    field('log').checked = !!opts.log; field('log').disabled = !m.log;
    q('[data-ccv-log-wrap]').title = m.log ? '' : 'این شاخص صفر یا منفی دارد؛ محور لگاریتمی برایش معنی ندارد';
    q('[data-ccv-rank-wrap]').hidden = opts.xMode !== 'ranked';
    q('[data-ccv-preset]').innerHTML = `<option value="">—</option>${Object.keys(presets).map((name) => `<option>${esc(name)}</option>`).join('')}`;

    const chosen = new Set(opts.underlyings);
    const needle = String(opts.uaSearch || '').trim();
    const list = [...turnover].filter((u) => !needle || u.uaName.includes(needle) || chosen.has(u.uaIns))
      .sort((a, b) => (opts.uaSort === 'name' ? a.uaName.localeCompare(b.uaName, 'fa') : b[opts.uaSort] - a[opts.uaSort]));
    q('[data-ccv-uas]').innerHTML = list.map((u) => `<label class="ccv-chip"><input type="checkbox" data-ccv-ua-pick="${esc(u.uaIns)}"${chosen.has(u.uaIns) ? ' checked' : ''}> ${esc(u.uaName)} <small>کال ${fmt.rialText(u.callValue)} · پوت ${fmt.rialText(u.putValue)} · ${fmt.int(u.traded)} معامله‌شده</small></label>`).join('') || '<p class="empty-note">نمادی نیست.</p>';

    const contracts = universe().contracts || [];
    const dates = [...new Set(contracts.filter((r) => !chosen.size || chosen.has(String(r.uaIns))).map((r) => String(r.endDate)))].sort();
    const pickedDates = new Set(opts.dates.map(String));
    q('[data-ccv-dates]').innerHTML = dates.map((d) => `<label class="ccv-chip"><input type="checkbox" data-ccv-date="${esc(d)}"${pickedDates.has(d) ? ' checked' : ''}> ${dateLabel(d)}</label>`).join('');
    const pickedExp = new Set(opts.expiries.map(String));
    const uaRows = turnover.filter((u) => chosen.has(u.uaIns));
    q('[data-ccv-ua-exp]').innerHTML = uaRows.length && uaRows.length <= 12 ? uaRows.map((u) => `<div class="ccv-ua-exp-row"><b>${esc(u.uaName)}</b>${u.expiries.map((d) => `<label class="ccv-chip"><input type="checkbox" data-ccv-exp="${esc(`${u.uaIns}:${d}`)}"${pickedExp.has(`${u.uaIns}:${d}`) ? ' checked' : ''}> ${dateLabel(d)}</label>`).join('')}</div>`).join('') : '';

    const legend = m.shape === 'candle'
      ? '<span><i class="ccv-l-body"></i>بدنه: اولین تا آخرین</span><span><i class="ccv-l-wick"></i>سایه: کمینه تا بیشینهٔ پنج نقطه</span><span><i class="ccv-l-close"></i>پایانی</span>'
      : m.shape === 'range' ? '<span><i class="ccv-l-box"></i>مظنه خرید تا فروش</span><span><i class="ccv-l-wick"></i>میانه</span><span><i class="ccv-l-dot"></i>آخرین معامله</span>'
        : '<span><i class="ccv-l-dot"></i>کال</span><span><i class="ccv-l-diamond"></i>پوت</span>';
    q('[data-ccv-legend]').innerHTML = `${legend}${opts.colorBy === 'direction' ? '<span><i class="ccv-l-hollow"></i>پوت توخالی</span>' : ''}<span><i class="ccv-l-flag"></i>حاشیهٔ زرد: غیرعادی</span><small>چرخ موس: بزرگ‌نمایی افقی · نوارهای پایین و راست: بازهٔ دید · کلیک: ثابت کردن جزئیات</small>`;
  }

  function paintStatus(poolSize, drawn) {
    const heading = rangeHeading(payload().session, dateLabel);
    q('[data-ccv-title]').textContent = heading.title;
    const parts = [`${fmt.int(drawn)} کندل روی نمودار از ${fmt.int(poolSize)} قرارداد معامله‌شدهٔ گزینش`];
    if (fetching) parts.push('در حال دریافت کمینه/بیشینهٔ امروز…');
    if (fetchError) parts.push(`دریافت بخشی از بازه‌ها ناموفق بود: ${faDigits(fetchError)}`);
    if (heading.note) parts.push(heading.note);
    if (opts.metric === 'iv') parts.push('تلاطم هر نقطه با قیمت پایهٔ هم‌جهت (تقریبی)');
    q('[data-ccv-status]').textContent = parts.join(' · ');
  }

  function paintStats(records) {
    const m = metricOf(opts.metric), stats = candleStats(records, m.key);
    const cell = (s) => `<td>${fmt.int(s.count)}</td><td>${metricText(m.key, s.min)}</td><td>${metricText(m.key, s.q1)}</td><td>${metricText(m.key, s.median)}</td><td>${metricText(m.key, s.q3)}</td><td>${metricText(m.key, s.max)}</td><td class="gain">${fmt.int(s.positive)}</td><td class="loss">${fmt.int(s.negative)}</td>`;
    q('[data-ccv-stats]').innerHTML = `<table class="ccv-stat-table"><caption>${esc(m.label)}${m.shape === 'candle' ? ' — نقطهٔ آخرین' : ''}</caption><thead><tr><th></th><th>شمار</th><th>کمینه</th><th>چارک اول</th><th>میانه</th><th>چارک سوم</th><th>بیشینه</th><th>مثبت</th><th>منفی</th></tr></thead><tbody>${[['all', 'همه'], ['call', 'کال'], ['put', 'پوت']].map(([k, t]) => `<tr><th>${t}</th>${cell(stats[k])}</tr>`).join('')}</tbody></table>`;
  }

  let current = { records: [], uaDays: [] };
  function paint() {
    const contracts = universe().contracts || [];
    const turnover = underlyingTurnover(contracts);
    paintControls(turnover);
    const pool = filterCandles(contracts, filterOf());
    const uaDays = uaDayMap();
    let records = recordsFor(pool, uaDays);
    flags = flagUnusual(records);
    if (opts.unusualOnly) records = records.filter((r) => flags.has(r.ins));
    const m = metricOf(opts.metric);
    const withShape = records.map((r) => ({ r, s: metricShape(r, m.key) }))
      .filter(({ r, s }) => s && (s.shape !== 'candle' || r.valid)
        && Number.isFinite(toAxis(m, s.low, opts.log)) && Number.isFinite(toAxis(m, s.high, opts.log))
        && (opts.xMode !== 'moneyness' || Number.isFinite(r.moneynessPct)));
    const order = orderCandles(withShape.map((x) => x.r), { xMode: opts.xMode, rankKey: opts.rankKey, metric: m.key });
    const shapeOf = new Map(withShape.map((x) => [x.r.ins, x.s]));
    drawable = order; shapes = order.map((r) => shapeOf.get(r.ins));
    const usedUa = [...new Set(records.map((r) => r.uaIns))].map((ins) => uaDays.get(ins)).filter(Boolean);
    current = { records, uaDays: usedUa };
    paintStatus(pool.length, drawable.length);
    const lost = records.length - drawable.length;
    q('[data-ccv-count]').textContent = `${fmt.int(drawable.length)} ${m.shape === 'point' ? 'نقطه' : 'کندل'}${lost > 0 ? ` · ${fmt.int(lost)} قرارداد برای این شاخص داده ندارد${useLog(m, opts.log) ? ' یا روی محور لگاریتمی نمی‌نشیند' : ''}` : ''}`;
    paintStats(drawable);
    q('[data-ccv-story]').innerHTML = candleNarrative(drawable, { metric: m.key, log: opts.log, unusual: flags, uaDays: usedUa, f: fmt }).map((line) => `<li>${esc(line)}</li>`).join('');
    paintPin();
    paintMother();
    paintHist(records.filter((r) => r.valid || metricOf(opts.histMetric).shape !== 'candle'));
    paintList(records);
    ensureInfos(pool);
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
    const sort = event.target.closest('[data-lmm-range-key]');
    if (sort) { listLimit = LIST_STEP; set({ listSort: sort.dataset.lmmRangeKey }); return; }
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
    if (event.target.closest('[data-ccv-unpin]')) { pinned = ''; paintPin(); return; }
    if (event.target.closest('[data-ccv-open]')) {
      const r = drawable.find((item) => item.ins === pinned);
      if (r && onOpenContract) onOpenContract(r);
      return;
    }
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
      if (p) { listLimit = LIST_STEP; set({ ...p }); }
      return;
    }
    const name = el.dataset.ccv;
    if (!name || name === 'uaSearch') return;
    if (el.type === 'checkbox') { set({ [name]: el.checked }); return; }
    if (['top', 'minValueM', 'histBins'].includes(name)) { set({ [name]: Math.max(0, Number(el.value) || 0) }); return; }
    set({ [name]: el.value });
  });
  host.addEventListener('input', (event) => {
    if (event.target.dataset.ccv !== 'uaSearch') return;
    opts = { ...opts, uaSearch: event.target.value }; save();
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
    const filterLines = [
      `نوع: ${opts.side === 'all' ? 'کال و پوت' : opts.side === 'call' ? 'فقط کال' : 'فقط پوت'}`,
      `نمادها: ${opts.underlyings.length ? opts.underlyings.map((id) => names.get(id) || id).join('، ') : 'همه'}`,
      `سررسیدها: ${opts.dates.length ? opts.dates.map((d) => dateLabel(d)).join('، ') : 'همه'}${opts.expiries.length ? ` · سررسید نماد: ${opts.expiries.map((k) => `${names.get(k.split(':')[0]) || ''} ${dateLabel(k.split(':')[1])}`).join('، ')}` : ''}`,
      `حداقل ارزش هر قرارداد: ${Number(opts.minValueM) || 0} میلیون ریال · N برتر: ${Number(opts.top) || 'همه'}${opts.unusualOnly ? ' · فقط غیرعادی‌ها' : ''}`,
      `محور: ${metricOf(opts.metric).label}${useLog(metricOf(opts.metric), opts.log) ? ' (لگاریتمی)' : ''}`,
    ];
    const narrative = candleNarrative(drawable, { metric: opts.metric, log: opts.log, unusual: flags, uaDays: current.uaDays, f: fmt });
    await downloadCandleWorkbook({ records: current.records, uaDays: current.uaDays, flags, filterLines, narrative, at: payload().snapshotAt || payload().at || '' }, stamp);
  }

  return {
    paint,
    dispose() { motherSeq += 1; histSeq += 1; mother?.dispose(); hist?.dispose(); mother = null; hist = null; },
  };
}

