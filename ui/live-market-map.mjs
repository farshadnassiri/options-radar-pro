// مسیر اصلی رصد لحظه‌ای: نقشهٔ بازار ← نماد پایه ← سررسید ← قرارداد.

import { fmt, faDigits } from './fmt.mjs';
import { mountCandlePoints } from './candle-points.mjs';
import { makeTable } from './table.mjs';
import { mountChart, chartFormat } from './chart-host.mjs';
import { historyDateLabel } from '../core/history.mjs';
import { filterContractsBySide, MARKET_MAP_METRICS, marketMapRows, marketMapSummary } from '../core/decision-dashboard.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'\"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;',
}[char]));
const dateLabel = (value) => faDigits(historyDateLabel(value));
const kindLabel = (kind) => kind === 'call' ? 'اختیار خرید' : 'اختیار فروش';
const tone = (value) => Number(value) > 0 ? 'gain' : Number(value) < 0 ? 'loss' : '';
const metricText = (info, value) => {
  const format = info.format;
  if (format === 'pct') return Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—';
  return (fmt[format] || fmt.num)(value);
};
const CONTRACT_MAP_METRICS = [
  { key: 'value', label: 'ارزش معاملات', format: 'money' },
  { key: 'volume', label: 'حجم معاملات', format: 'int' },
  { key: 'oi', label: 'موقعیت باز', format: 'int' },
  { key: 'changePct', label: 'درصد آخرین معامله', format: 'pct' },
];

const stat = (label, value, note = '', className = '') => `<article class="lmm-stat ${className}">
  <small>${esc(label)}</small><strong>${value}</strong>${note ? `<span>${esc(note)}</span>` : ''}
</article>`;

function contractRow(row) {
  return {
    ...row, title: row.name, kindLabel: kindLabel(row.kind),
    expiryText: row.endDate ? dateLabel(row.endDate) : '',
  };
}

/** سوارکردن کاوشگر؛ خروجی scope فقط برای همگام‌کردن تحلیل‌های قدیمی است. */
export function mountLiveMarketMap(root, { onScopeChange = null, contractColumns = [] } = {}) {
  root.innerHTML = `
    <section class="card lmm-map-card">
      <div class="section-head lmm-head"><div><p class="eyebrow">نمای اصلی رصد لحظه‌ای</p><h2 data-lmm-map-title>نقشه بازار اختیار</h2><p data-lmm-map-note>اندازه خانه از سنجه انتخابی می‌آید؛ رنگ، جهت آخرین معامله نماد پایه نسبت به پایانی دیروز است.</p></div>
        <div class="lmm-map-controls"><div class="lmm-map-modes" role="group" aria-label="سطح نقشه"><button type="button" data-lmm-map-mode="underlyings">نمادهای پایه</button><button type="button" data-lmm-map-mode="contracts">قراردادهای نماد انتخابی</button></div><div class="lmm-metrics" data-lmm-metrics role="group" aria-label="مبنای اندازه خانه‌های نقشه"></div></div>
      </div>
      <div class="lmm-map" data-lmm-map role="img" aria-label="نقشه همه نمادهای پایه"></div>
      <div class="lmm-map-foot"><span><i class="loss"></i>منفی</span><span><i class="flat"></i>بدون تغییر</span><span><i class="gain"></i>مثبت</span><b data-lmm-selected>برای ورود به زنجیره، یک نماد را انتخاب کن.</b></div>
    </section>
    <section class="card lmm-summary" data-lmm-summary aria-label="اطلاعات کلی بازار"></section>
    <section class="card lmm-explorer" data-lmm-explorer>
      <div class="section-head"><div><p class="eyebrow">مسیر تصمیم</p><h2 data-lmm-title>یک نماد را از نقشه انتخاب کن</h2></div><span data-lmm-scope-note>نماد ← سررسید ← قرارداد</span></div>
      <div class="lmm-underlying" data-lmm-underlying></div>
      <div class="lmm-expiry-step" data-lmm-expiry-step hidden><div class="lmm-step-head"><h3>سررسیدها</h3><span>هر سررسید، آمار مستقل و زنجیره خودش را دارد.</span></div><div class="lmm-expiries" data-lmm-expiries></div></div>
      <div class="lmm-expiry-info" data-lmm-expiry-info></div>
      <section class="lmm-day-range" data-lmm-day-range hidden><div class="lmm-step-head"><div><h3>کندل قیمت امروز قراردادها</h3><span>سایه: کمترین تا بیشترین · بدنه: اولین تا آخرین · لوزی: قیمت پایانی</span></div><div class="lmm-range-sort" data-lmm-range-sort role="group" aria-label="مرتب‌سازی نمودار کندلی روزانه"></div></div><div data-lmm-range-status class="note"></div><div data-lmm-range-chart></div></section>
      <div class="lmm-chain-step" data-lmm-chain-step hidden><div class="lmm-step-head"><div><h3>زنجیره قرارداد</h3><span data-lmm-chain-count>کال و پوت این سررسید</span></div><div class="lmm-chain-kind" data-lmm-chain-kind role="group" aria-label="نوع قراردادهای زنجیره"><button type="button" data-lmm-chain-side="all">هر دو</button><button type="button" data-lmm-chain-side="call">فقط کال</button><button type="button" data-lmm-chain-side="put">فقط پوت</button></div></div><p class="note">روی «ستون‌ها» بزن تا هر داده‌ای را اضافه یا حذف کنی؛ روی ردیف بزن تا جزئیات قرارداد باز شود.</p><div data-lmm-chain></div></div>
      <div class="lmm-contract-detail" data-lmm-contract-detail></div>
    </section>`;

  const mapHost = root.querySelector('[data-lmm-map]');
  const summaryHost = root.querySelector('[data-lmm-summary]');
  const underlyingHost = root.querySelector('[data-lmm-underlying]');
  const expiryStep = root.querySelector('[data-lmm-expiry-step]');
  const expiryRail = root.querySelector('[data-lmm-expiries]');
  const expiryInfo = root.querySelector('[data-lmm-expiry-info]');
  const rangeSection = root.querySelector('[data-lmm-day-range]');
  const rangeStatus = root.querySelector('[data-lmm-range-status]');
  const rangeChart = root.querySelector('[data-lmm-range-chart]');
  const chainStep = root.querySelector('[data-lmm-chain-step]');
  const detailHost = root.querySelector('[data-lmm-contract-detail]');
  const chainHost = root.querySelector('[data-lmm-chain]');
  let universe = { underlyings: [], expiries: [], contracts: [] };
  let mapMode = localStorage.getItem('options-radar:market-map-mode') || 'underlyings';
  if (!['underlyings', 'contracts'].includes(mapMode)) mapMode = 'underlyings';
  let baseMetric = localStorage.getItem('options-radar:market-map-metric') || 'value';
  if (!MARKET_MAP_METRICS.some((item) => item.key === baseMetric)) baseMetric = 'value';
  let contractMetric = localStorage.getItem('options-radar:contract-map-metric') || 'value';
  if (!CONTRACT_MAP_METRICS.some((item) => item.key === contractMetric)) contractMetric = 'value';
  let rangeSort = localStorage.getItem('options-radar:day-range-sort') || 'value';
  if (!['value', 'volume', 'oi'].includes(rangeSort)) rangeSort = 'value';
  let chainSide = localStorage.getItem('options-radar:market-map-chain-side') || 'all';
  if (!['all', 'call', 'put'].includes(chainSide)) chainSide = 'all';
  let uaIns = '', endDate = '', contractIns = '', mapHandle = null, rangeRequest = 0;
  let marketContext = {};
  const rangeCache = new Map();

  const chainTable = makeTable(chainHost, contractColumns.filter((item) => item.base), {
    all: contractColumns,
    storeKey: 'dashboard:market-map-chain',
    exportName: 'live-market-chain',
    sortKey: 'value',
    onPick: (row) => selectContract(row.ins),
  });
  chainTable.setEmptyMessage('برای این سررسید قرارداد معتبری در عکس بازار نیست.');

  const underlyings = () => universe.underlyings || [];
  const expiries = () => (universe.expiries || []).filter((row) => String(row.uaIns) === uaIns).sort((a, b) => Number(a.days) - Number(b.days));
  const contracts = () => (universe.contracts || []).filter((row) => String(row.uaIns) === uaIns && String(row.endDate) === endDate);
  const visibleContracts = () => filterContractsBySide(contracts(), chainSide);
  const selectedUa = () => underlyings().find((row) => String(row.ins) === uaIns);
  const selectedExpiry = () => expiries().find((row) => String(row.endDate) === endDate);
  const selectedContract = () => contracts().find((row) => String(row.ins) === contractIns);

  function normalizeSelection(preserve = true) {
    if (!preserve || !underlyings().some((row) => String(row.ins) === uaIns)) {
      uaIns = String(underlyings()[0]?.ins || ''); endDate = ''; contractIns = '';
    }
    const ex = expiries();
    if (!ex.some((row) => String(row.endDate) === endDate)) { endDate = String(ex[0]?.endDate || ''); contractIns = ''; }
    if (!contracts().some((row) => String(row.ins) === contractIns)) contractIns = '';
  }

  function paintSummary() {
    const data = marketMapSummary(universe);
    const breadth = marketContext.snapshot || {};
    const hasBreadth = Number.isFinite(Number(breadth.traded));
    const baseTraded = hasBreadth ? Number(breadth.traded) : data.baseTraded;
    const breadthValue = ['positiveValue', 'negativeValue', 'flatValue'].reduce((total, key) => {
      const value = Number(breadth[key]);
      return total + (Number.isFinite(value) ? value : 0);
    }, 0);
    const underlyingValue = hasBreadth ? breadthValue : data.underlyingValue;
    const positiveBases = Number.isFinite(Number(breadth.positive)) ? Number(breadth.positive) : data.positiveBases;
    const negativeBases = Number.isFinite(Number(breadth.negative)) ? Number(breadth.negative) : data.negativeBases;
    summaryHost.innerHTML = `
      <div class="section-head"><div><p class="eyebrow">کل بازار در همین عکس</p><h2>ارزش معاملات و وضعیت عمومی</h2></div><span>${fmt.int(baseTraded)} پایه معامله‌شده از ${fmt.int(data.underlyings)}</span></div>
      <div class="lmm-stat-grid">
        ${stat('جمع ارزش اختیار', fmt.money(data.optionValue), 'کال و پوت')}
        ${stat('ارزش کال', fmt.money(data.callValue))}
        ${stat('ارزش پوت', fmt.money(data.putValue))}
        ${stat('ارزش نمادهای پایه', fmt.money(underlyingValue))}
        ${stat('حجم اختیار', fmt.int(data.optionVolume))}
        ${stat('موقعیت باز', fmt.int(data.openInterest))}
        ${stat('قرارداد معامله‌شده', fmt.int(data.tradedContracts), `از ${fmt.int(data.contracts)} قرارداد`)}
        ${stat('مظنه دوطرفه', fmt.int(data.twoSided), `${fmt.int(positiveBases)} پایه مثبت · ${fmt.int(negativeBases)} پایه منفی`)}
      </div>`;
  }

  function paintUnderlying() {
    const ua = selectedUa();
    if (!ua) {
      root.querySelector('[data-lmm-title]').textContent = 'داده‌ای برای انتخاب نماد پایه نیست';
      root.querySelector('[data-lmm-selected]').textContent = 'هنوز عکس معتبر بازار دریافت نشده است.';
      underlyingHost.innerHTML = '<p class="empty-note">پس از دریافت عکس بازار، همه نمادهای پایه اینجا ظاهر می‌شوند.</p>';
      expiryStep.hidden = true; chainStep.hidden = true; expiryInfo.innerHTML = ''; detailHost.innerHTML = ''; chainTable.set([]);
      return;
    }
    const change = Number(ua.changePct);
    root.querySelector('[data-lmm-title]').textContent = ua.name || ua.ins;
    root.querySelector('[data-lmm-selected]').innerHTML = `نماد انتخاب‌شده: <strong>${esc(ua.name || ua.ins)}</strong> <span class="${tone(change)}">${Number.isFinite(change) ? `${fmt.pct(change)}٪` : '—'}</span>`;
    underlyingHost.innerHTML = `<div class="lmm-stat-grid">
      ${stat('آخرین پایه', fmt.money(ua.last), Number.isFinite(change) ? `تغییر ${fmt.pct(change)}٪` : 'تغییر نامعلوم', tone(change))}
      ${stat('ارزش خودِ پایه', fmt.money(ua.uaValue))}
      ${stat('ارزش کل اختیار', fmt.money(ua.value), `${fmt.int(ua.contracts)} قرارداد`)}
      ${stat('ارزش کال', fmt.money(ua.callValue), Number.isFinite(ua.callValuePct) ? `سهم ${fmt.pct(ua.callValuePct)}٪` : '')}
      ${stat('ارزش پوت', fmt.money(ua.putValue), Number.isFinite(ua.putValuePct) ? `سهم ${fmt.pct(ua.putValuePct)}٪` : '')}
      ${stat('حجم اختیار', fmt.int(ua.volume), `${fmt.int(ua.callVol)} کال · ${fmt.int(ua.putVol)} پوت`)}
      ${stat('موقعیت باز', fmt.int(ua.oi), `نسبت پوت به کال ${fmt.num(ua.pcRatio)}`)}
      ${stat('ساختار زنجیره', fmt.int(ua.expiries), `${fmt.int(ua.strikes)} اعمال · ${fmt.int(ua.twoSided)} مظنه دوطرفه`)}
    </div>`;
    expiryStep.hidden = expiries().length === 0;
    expiryRail.innerHTML = expiries().map((row) => `<button type="button" data-lmm-expiry="${esc(row.endDate)}" aria-pressed="${String(row.endDate) === endDate}"><b>${dateLabel(row.endDate)}</b><small>${fmt.int(row.days)} روز · ارزش ${fmt.money(row.value)}</small></button>`).join('');
    paintExpiry();
  }

  function paintExpiry() {
    const ex = selectedExpiry();
    if (!ex) { expiryInfo.innerHTML = ''; rangeSection.hidden = true; chainStep.hidden = true; detailHost.innerHTML = ''; chainTable.set([]); return; }
    expiryInfo.innerHTML = `<div class="lmm-scope-title"><h3>سررسید ${dateLabel(ex.endDate)}</h3><span>${fmt.int(ex.days)} روز مانده</span></div><div class="lmm-stat-grid compact">
      ${stat('ارزش کل', fmt.money(ex.value), `${fmt.int(ex.tradedContracts)} قرارداد معامله‌شده`)}
      ${stat('ارزش کال', fmt.money(ex.callValue), Number.isFinite(ex.callValuePct) ? `سهم ${fmt.pct(ex.callValuePct)}٪` : '')}
      ${stat('ارزش پوت', fmt.money(ex.putValue), Number.isFinite(ex.putValuePct) ? `سهم ${fmt.pct(ex.putValuePct)}٪` : '')}
      ${stat('حجم', fmt.int(ex.volume), `${fmt.int(ex.trades)} معامله`)}
      ${stat('موقعیت باز', fmt.int(ex.oi), `تغییر ${fmt.int(ex.oiChange)}`)}
      ${stat('IV وزنی', Number.isFinite(ex.ivPct) ? `${fmt.pct(ex.ivPct)}٪` : '—', `میانه فاصله مظنه ${fmt.pct(ex.spreadPct)}٪`)}
    </div>`;
    chainStep.hidden = false;
    paintChain();
    paintContract();
    loadDailyRanges();
  }

  function paintChain() {
    const rows = visibleContracts();
    root.querySelectorAll('[data-lmm-chain-side]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.lmmChainSide === chainSide)));
    root.querySelector('[data-lmm-chain-count]').textContent = chainSide === 'all'
      ? `${fmt.int(rows.length)} قرارداد کال و پوت`
      : `${fmt.int(rows.length)} قرارداد ${chainSide === 'call' ? 'کال' : 'پوت'}`;
    chainTable.set(rows.map(contractRow));
  }

  function paintContract() {
    const row = selectedContract();
    if (!row) {
      detailHost.innerHTML = '<p class="lmm-contract-prompt">برای دیدن اطلاعات کامل یک قرارداد، روی ردیف آن در زنجیره کلیک کن.</p>';
      return;
    }
    const change = Number(row.changePct);
    detailHost.innerHTML = `<div class="lmm-scope-title"><div><p class="eyebrow">جزئیات قرارداد انتخابی</p><h3>${esc(row.name)}</h3></div><span>${kindLabel(row.kind)} · اعمال ${fmt.money(row.strike)}</span></div><div class="lmm-stat-grid compact">
      ${stat('آخرین', fmt.money(row.last), Number.isFinite(change) ? `تغییر ${fmt.pct(change)}٪` : 'تغییر نامعلوم', tone(change))}
      ${stat('تقاضا / عرضه', `${fmt.money(row.bid)} / ${fmt.money(row.ask)}`, `فاصله ${fmt.pct(row.spreadPct)}٪`)}
      ${stat('حجم', fmt.int(row.volume), `${fmt.int(row.trades)} معامله`)}
      ${stat('ارزش معامله', fmt.money(row.value))}
      ${stat('موقعیت باز', fmt.int(row.oi), `تغییر ${fmt.int(row.oiChange)}`)}
      ${stat('تلاطم ضمنی', Number.isFinite(row.ivPct) ? `${fmt.pct(row.ivPct)}٪` : '—')}
      ${stat('ارزش ذاتی', fmt.money(row.intrinsic), `ارزش زمانی ${fmt.money(row.timeValue)}`)}
      ${stat('فاصله اعمال از پایه', Number.isFinite(row.moneynessPct) ? `${fmt.pct(row.moneynessPct)}٪` : '—', `پایه ${fmt.money(row.spot)}`)}
    </div>`;
  }

  const currentMetrics = () => mapMode === 'contracts' ? CONTRACT_MAP_METRICS : MARKET_MAP_METRICS;
  const currentMetric = () => mapMode === 'contracts' ? contractMetric : baseMetric;

  function weightedContracts(metric) {
    const rows = (universe.contracts || []).filter((row) => String(row.uaIns) === uaIns).map((row) => {
      const raw = Number(row[metric]);
      const metricValue = Number.isFinite(raw) ? raw : NaN;
      const sizeValue = metric === 'changePct' ? Math.abs(metricValue) : Math.max(0, metricValue);
      return { ...row, metricValue, sizeValue };
    });
    const max = Math.max(0, ...rows.map((row) => Number.isFinite(row.sizeValue) ? row.sizeValue : 0));
    const floor = max > 0 ? max * 0.002 : 1;
    return rows.map((row) => ({ ...row, mapWeight: row.sizeValue > 0 ? row.sizeValue : floor }));
  }

  function paintMetricControls() {
    const host = root.querySelector('[data-lmm-metrics]');
    const active = currentMetric();
    host.innerHTML = currentMetrics().map((item) => `<button type="button" data-lmm-metric="${item.key}" aria-pressed="${item.key === active}">${item.label}</button>`).join('');
    host.querySelectorAll('[data-lmm-metric]').forEach((button) => button.addEventListener('click', () => {
      if (mapMode === 'contracts') {
        contractMetric = button.dataset.lmmMetric;
        localStorage.setItem('options-radar:contract-map-metric', contractMetric);
      } else {
        baseMetric = button.dataset.lmmMetric;
        localStorage.setItem('options-radar:market-map-metric', baseMetric);
      }
      paintMetricControls(); paintMap();
    }));
  }

  function paintMapMode() {
    const ua = selectedUa();
    root.querySelectorAll('[data-lmm-map-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.lmmMapMode === mapMode)));
    root.querySelector('[data-lmm-map-title]').textContent = mapMode === 'contracts' ? `نقشه قراردادهای ${ua?.name || 'نماد انتخابی'}` : 'نقشه بازار اختیار';
    root.querySelector('[data-lmm-map-note]').textContent = mapMode === 'contracts'
      ? 'همه قراردادهای این نماد در همه سررسیدها؛ اندازه با سنجه انتخابی و رنگ با تغییر خود قرارداد.'
      : 'اندازه خانه از سنجه انتخابی می‌آید؛ رنگ، جهت آخرین معامله نماد پایه نسبت به پایانی دیروز است.';
    mapHost.setAttribute('aria-label', mapMode === 'contracts' ? `نقشه قراردادهای ${ua?.name || 'نماد انتخابی'}` : 'نقشه همه نمادهای پایه');
    paintMetricControls();
  }

  async function paintMap() {
    const metric = currentMetric();
    const info = currentMetrics().find((item) => item.key === metric) || currentMetrics()[0];
    const rows = mapMode === 'contracts' ? weightedContracts(metric) : marketMapRows(universe, metric);
    if (!rows.length) {
      mapHandle?.dispose(); mapHandle = null;
      mapHost.innerHTML = `<p class="empty-note">${mapMode === 'contracts' ? 'برای نماد انتخابی قرارداد معتبری دریافت نشده است.' : 'هنوز نماد پایه‌ای برای نقشه دریافت نشده است.'}</p>`;
      return;
    }
    const build = (_echarts, tokens) => {
      const maxChange = Math.max(1, ...rows.map((row) => Math.abs(Number(row.changePct) || 0)));
      return {
        tooltip: {
          trigger: 'item', confine: true,
          formatter: ({ data }) => `<b>${esc(data.name)}</b><br>${esc(info.label)}: ${metricText(info, data.metricValue)}<br>${mapMode === 'contracts' ? 'تغییر قرارداد' : 'تغییر پایه'}: ${chartFormat.pct(data.changePct)}<br>${mapMode === 'contracts' ? `سررسید: ${dateLabel(data.endDate)}<br>` : ''}ارزش معامله: ${chartFormat.money(data.optionValue)}`,
        },
        series: [{
          type: 'treemap', roam: false, nodeClick: false, breadcrumb: { show: false },
          top: 2, right: 2, bottom: 2, left: 2, sort: 'desc', visibleMin: 1,
          label: {
            show: true, position: 'inside', overflow: 'truncate',
            formatter: ({ data }) => `{name|${faDigits(data.name)}}\n{change|${chartFormat.pct(data.changePct)}}`,
            rich: {
              name: { color: tokens.onAccent, fontSize: 15, fontWeight: 900, lineHeight: 22 },
              change: { color: tokens.onAccent, fontSize: 12, fontWeight: 800, lineHeight: 18 },
            },
          },
          itemStyle: { borderColor: tokens.panel, borderWidth: 2, gapWidth: 2 },
          emphasis: { itemStyle: { borderColor: tokens.accent, borderWidth: 4 } },
          data: rows.map((row) => {
            const change = Number(row.changePct);
            const intensity = Math.sqrt(Math.min(1, Math.abs(change || 0) / maxChange));
            return {
              name: row.name || row.ins, value: row.mapWeight,
              uaIns: mapMode === 'contracts' ? String(row.uaIns) : String(row.ins),
              contractIns: mapMode === 'contracts' ? String(row.ins) : '', endDate: row.endDate || '',
              metricValue: row.metricValue, changePct: row.changePct, optionValue: row.value,
              itemStyle: {
                color: change > 0 ? tokens.gain : change < 0 ? tokens.loss : tokens.muted,
                opacity: 0.52 + intensity * 0.43,
              },
            };
          }),
        }],
      };
    };
    if (mapHandle) mapHandle.update(build);
    else mapHandle = await mountChart(mapHost, build, {
      empty: 'هنوز نماد پایه‌ای برای نقشه دریافت نشده است.',
      onClick: (event) => {
        if (event?.data?.contractIns) selectContractFromMap(event.data);
        else if (event?.data?.uaIns) selectUnderlying(event.data.uaIns);
      },
    });
  }

  const pctVsYday = (value, yday) => Number(value) > 0 && Number(yday) > 0 ? ((Number(value) / Number(yday)) - 1) * 100 : NaN;

  function paintDailyRanges() {
    const key = `${uaIns}:${endDate}`;
    const cached = rangeCache.get(key);
    const labels = { value: 'ارزش معاملات', volume: 'حجم معاملات', oi: 'موقعیت باز' };
    root.querySelector('[data-lmm-range-sort]').innerHTML = Object.entries(labels).map(([id, label]) => `<button type="button" data-lmm-range-key="${id}" aria-pressed="${id === rangeSort}">${label}</button>`).join('');
    root.querySelectorAll('[data-lmm-range-key]').forEach((button) => button.addEventListener('click', () => {
      rangeSort = button.dataset.lmmRangeKey;
      localStorage.setItem('options-radar:day-range-sort', rangeSort);
      paintDailyRanges();
    }));
    if (!cached?.items) return;
    const rows = contracts().map((row) => ({ ...row, ...(cached.items[row.ins] || {}) }))
      .filter((row) => Number(row.first) > 0 && Number(row.low) > 0 && Number(row.high) > 0 && Number(row.last) > 0 && Number(row.close) > 0)
      .sort((a, b) => Number(b[rangeSort]) - Number(a[rangeSort]) || a.name.localeCompare(b.name, 'fa'));
    rangeStatus.textContent = `${fmt.int(rows.length)} قرارداد دارای بازه معتبر از ${fmt.int(contracts().length)} قرارداد · مرتب بر ${labels[rangeSort]}`;
    if (!rows.length) { rangeChart.innerHTML = '<p class="empty-note">بالادست برای قراردادهای این سررسید بازه معتبر امروز برنگرداند.</p>'; return; }
    rangeChart.innerHTML = `<div class="lmm-range-legend"><span>سایه: کمینه تا بیشینه</span><span>بدنه: اولین تا آخرین</span><span>نقاط: پنج قیمت مستقل</span><small>موس را روی هر کندل حرکت بده تا همه قیمت‌ها دیده شوند؛ کلیک، جزئیات را باز نگه می‌دارد.</small></div><div class="lmm-range-list">${rows.map((row) => {
      const low = Number(row.low), high = Number(row.high), first = Number(row.first), last = Number(row.last), close = Number(row.close);
      const rankValue = rangeSort === 'value' ? fmt.money(row.value) : fmt.int(row[rangeSort]);
      const lastPct = pctVsYday(last, row.yday), closePct = pctVsYday(close, row.yday);
      return `<article class="${tone(last - first)}" data-lmm-range-card="${esc(row.ins)}"><header><button type="button" data-lmm-range-contract="${esc(row.ins)}"><b>${esc(row.name)}</b><small>${kindLabel(row.kind)} · اعمال ${fmt.money(row.strike)}</small></button><div class="lmm-range-stats"><strong>${rankValue}</strong><span class="${tone(lastPct)}">آخرین ${fmt.pct(lastPct)}٪</span><span class="${tone(closePct)}">پایانی ${fmt.pct(closePct)}٪</span></div></header><button type="button" class="lmm-range-track" data-lmm-range-focus="${esc(row.ins)}" aria-expanded="false" aria-label="کندل روزانه ${esc(row.name)}؛ تغییر آخرین ${fmt.pct(lastPct)} درصد و پایانی ${fmt.pct(closePct)} درصد"></button><footer><span>کمینه ${fmt.money(low)}</span><span>اولین ${fmt.money(first)}</span><span>آخرین ${fmt.money(last)}</span><span>پایانی ${fmt.money(close)}</span><span>بیشینه ${fmt.money(high)}</span></footer></article>`;
    }).join('')}</div>`;
    rangeChart.querySelectorAll('[data-lmm-range-contract]').forEach((button) => button.addEventListener('click', () => selectContract(button.dataset.lmmRangeContract)));
    rangeChart.querySelectorAll('[data-lmm-range-focus]').forEach((button) => button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      rangeChart.querySelectorAll('[data-lmm-range-focus]').forEach((item) => item.setAttribute('aria-expanded', 'false'));
      button.setAttribute('aria-expanded', String(!expanded));
    }));
    rangeChart.querySelectorAll('[data-lmm-range-focus]').forEach((button) => {
      mountCandlePoints(button, rows.find((row) => String(row.ins) === button.dataset.lmmRangeFocus));
    });
  }

  async function loadDailyRanges() {
    const key = `${uaIns}:${endDate}`, list = contracts(), ids = list.map((row) => String(row.ins)).filter(Boolean);
    rangeSection.hidden = !ids.length;
    if (!ids.length) return;
    paintDailyRanges();
    const cached = rangeCache.get(key);
    if (cached?.items && Date.now() - cached.at < 30000) { paintDailyRanges(); return; }
    const request = ++rangeRequest;
    rangeStatus.textContent = `در حال دریافت بازه واقعی امروز برای ${fmt.int(ids.length)} قرارداد…`;
    rangeChart.innerHTML = '<div class="skeleton" style="height:180px"></div>';
    try {
      const chunks = [];
      for (let index = 0; index < ids.length; index += 180) chunks.push(ids.slice(index, index + 180));
      const parts = await Promise.all(chunks.map(async (chunk) => {
        const response = await fetch(`/api/infos?ins=${encodeURIComponent(chunk.join(','))}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
        return data;
      }));
      if (request !== rangeRequest || key !== `${uaIns}:${endDate}`) return;
      rangeCache.set(key, { at: Date.now(), items: Object.assign({}, ...parts) });
      paintDailyRanges();
    } catch (error) {
      if (request !== rangeRequest) return;
      rangeStatus.textContent = `دریافت بازه روزانه ناموفق بود: ${faDigits(error.message)}`;
      rangeChart.innerHTML = '<p class="empty-note">جدول زنجیره همچنان از عکس بازار در دسترس است.</p>';
    }
  }

  function emit(level) {
    onScopeChange?.({ level, uaIns, endDate, contractIns });
  }
  function selectUnderlying(next) {
    uaIns = String(next); endDate = ''; contractIns = ''; normalizeSelection(true); paintUnderlying(); paintMapMode(); paintMap(); emit('underlying');
    root.querySelector('[data-lmm-explorer]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function selectExpiry(next) {
    endDate = String(next); contractIns = ''; normalizeSelection(true); paintUnderlying(); emit('expiry');
  }
  function selectContract(next) {
    contractIns = String(next); paintContract(); emit('contract');
  }
  function selectContractFromMap(data) {
    uaIns = String(data.uaIns); endDate = String(data.endDate); contractIns = String(data.contractIns);
    normalizeSelection(true); paintUnderlying(); emit('contract');
    root.querySelector('[data-lmm-contract-detail]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  root.querySelectorAll('[data-lmm-map-mode]').forEach((button) => button.addEventListener('click', () => {
    mapMode = button.dataset.lmmMapMode;
    localStorage.setItem('options-radar:market-map-mode', mapMode);
    paintMapMode(); paintMap();
  }));
  expiryRail.addEventListener('click', (event) => {
    const button = event.target.closest('[data-lmm-expiry]');
    if (button) selectExpiry(button.dataset.lmmExpiry);
  });
  root.querySelector('[data-lmm-chain-kind]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-lmm-chain-side]');
    if (!button) return;
    chainSide = button.dataset.lmmChainSide;
    localStorage.setItem('options-radar:market-map-chain-side', chainSide);
    paintChain();
  });

  return {
    async setUniverse(next, preserve = true, context = {}) {
      universe = next || { underlyings: [], expiries: [], contracts: [] };
      marketContext = context || {};
      normalizeSelection(preserve); paintSummary(); paintUnderlying(); paintMapMode(); await paintMap();
    },
    selection: () => ({ uaIns, endDate, contractIns }),
    dispose() { mapHandle?.dispose(); },
  };
}
