// مسیر اصلی رصد لحظه‌ای: نقشهٔ بازار ← نماد پایه ← سررسید ← قرارداد.

import { fmt, faDigits } from './fmt.mjs';
import { makeTable } from './table.mjs';
import { mountChart, chartFormat } from './chart-host.mjs';
import { patchHTML } from './morph.mjs';
import { historyDateLabel } from '../core/history.mjs';
import {
  filterContractsBySide, MARKET_MAP_METRICS, marketMapRows, marketMapSummary,
  contractBreakeven, breakevenGap, breakevenGapPct, EQUAL_MAP_METRIC,
  twoSidedChain, chainSideMax, contractAnalytics,
  sortPairedChain, pairedSides, PAIRED_SORT_DEFAULT, spotRowPlacement,
} from '../core/decision-dashboard.mjs';
import { busyBlock } from './busy.mjs';
import { readVolSummary, volTileParts } from './vol-rank-store.mjs';
import { tehranDateNumber } from '../core/tehran-day.mjs';
import { dayQuote, pricePairHtml } from './price-pair.mjs';
import { mapTooltipLines } from './map-tooltip.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'\"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\"': '&quot;',
}[char]));
const dateLabel = (value) => faDigits(historyDateLabel(value));
const kindLabel = (kind) => kind === 'call' ? 'اختیار خرید' : 'اختیار فروش';
const tone = (value) => Number(value) > 0 ? 'gain' : Number(value) < 0 ? 'loss' : '';
const metricText = (info, value) => {
  const format = info.format;
  // حالت هم‌اندازه عددی ندارد و نباید بسازد؛ راهنما همین را می‌گوید.
  if (format === 'equal') return 'اندازه یکسان برای همه خانه‌ها';
  if (format === 'pct') return Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—';
  return (fmt[format] || fmt.num)(value);
};
const CONTRACT_MAP_METRICS = [
  { key: 'value', label: 'ارزش معاملات', format: 'rialText' },
  { key: 'volume', label: 'حجم معاملات', format: 'int' },
  { key: 'oi', label: 'موقعیت باز', format: 'int' },
  { key: 'changePct', label: 'درصد تغییر نسبت به پایانی دیروز', format: 'pct' },
  { key: EQUAL_MAP_METRIC, label: 'همه هم‌اندازه', format: 'equal' },
];

const stat = (label, value, note = '', className = '') => `<article class="lmm-stat ${className}">
  <small>${esc(label)}</small><strong>${value}</strong>${note ? `<span>${esc(note)}</span>` : ''}
</article>`;

function contractRow(row, greekParams = {}) {
  return {
    ...row, title: row.name, kindLabel: kindLabel(row.kind),
    expiryText: row.endDate ? dateLabel(row.endDate) : '',
    // سربه‌سر و فاصله‌اش، از همان قاعده‌ای که تابلوی پرمعامله می‌خواند.
    breakeven: contractBreakeven(row),
    breakevenGap: breakevenGap(row),
    breakevenGapPct: breakevenGapPct(row),
    // یونانی، اهرم، فرسایش و بازده سناریو — همان کاتالوگ ستونی که جدول تخت دارد.
    ...contractAnalytics(row, greekParams),
  };
}

// ── انتخابِ کاربر با یک عکسِ ناقص پاک نمی‌شود (۱۴۰۵/۰۷/۱۸) ──
//
// گزارش صاحب پروژه: «بعد از چند ثانیه نمودارها بسته می‌شود و دوباره باید
// دریافت کنم.» یکی از علت‌ها همین‌جا بود: اگر یک عکسِ خالی یا ناقص نمادِ
// انتخابی را نداشت، انتخاب بی‌صدا به «نخستین نماد» می‌پرید و نوسان ضمنی،
// رتبهٔ تلاطم و تصویر شفاف همه نمادِ تازه‌ای می‌دیدند و نمودارها را از نو
// می‌ساختند. حالا با `preserve` فقط جای خالی پر می‌شود؛ انتخابِ ناموجود در
// این عکس می‌ماند تا عکسِ بعد (یا کلیکِ خودِ کاربر) — نه نخستین ردیف.
/** انتخاب نقشه پس از عکس تازه. خالص، تا آزمون بسنجدش. */
export function normalizeMapSelection(universe, { uaIns = '', endDate = '', contractIns = '' } = {}, preserve = true) {
  const unders = universe?.underlyings || [];
  let ua = String(uaIns || ''), end = String(endDate || ''), ins = String(contractIns || '');
  if (!preserve || !ua) { ua = String(unders[0]?.ins || ''); end = ''; ins = ''; }
  if (!end) {
    const ex = (universe?.expiries || []).filter((row) => String(row.uaIns) === ua).sort((a, b) => Number(a.days) - Number(b.days));
    end = String(ex[0]?.endDate || ''); ins = '';
  }
  return { uaIns: ua, endDate: end, contractIns: ins };
}

/** سوارکردن کاوشگر؛ خروجی scope فقط برای همگام‌کردن تحلیل‌های قدیمی است. */
export function mountLiveMarketMap(root, { onScopeChange = null, contractColumns = [], greekParams = () => ({}) } = {}) {
  root.innerHTML = `
    <section class="card lmm-map-card">
      <div class="section-head lmm-head"><div><p class="eyebrow">نمای اصلی رصد لحظه‌ای</p><h2 data-lmm-map-title>نقشه بازار اختیار</h2><p data-lmm-map-note>اندازه خانه از سنجه انتخابی می‌آید؛ رنگ، جهت آخرین معامله نماد پایه نسبت به پایانی دیروز است.</p></div>
        <div class="lmm-map-controls"><div class="lmm-map-modes" role="group" aria-label="سطح نقشه"><button type="button" data-lmm-map-mode="underlyings">نمادهای پایه</button><button type="button" data-lmm-map-mode="contracts">قراردادهای نماد انتخابی</button></div><div class="lmm-metrics" data-lmm-metrics role="group" aria-label="مبنای اندازه خانه‌های نقشه"></div></div>
      </div>
      <div class="lmm-map" data-lmm-map role="img" aria-label="نقشه همه نمادهای پایه">${busyBlock('در حال دریافت عکس بازار برای ساخت نقشه…', { lines: 4 })}</div>
      <div class="lmm-map-foot"><span><i class="loss"></i>منفی</span><span><i class="flat"></i>بدون تغییر</span><span><i class="gain"></i>مثبت</span><b data-lmm-selected>برای ورود به زنجیره، یک نماد را انتخاب کن.</b></div>
    </section>
    <section class="card lmm-summary" data-lmm-summary aria-label="اطلاعات کلی بازار">${busyBlock('در حال دریافت جمع‌بندی بازار…', { lines: 2 })}</section>
    <section class="card lmm-explorer" data-lmm-explorer>
      <div class="section-head"><div><p class="eyebrow">مسیر تصمیم</p><h2 data-lmm-title>یک نماد را از نقشه انتخاب کن</h2></div><span data-lmm-scope-note>نماد ← سررسید ← قرارداد</span></div>
      <div class="lmm-underlying" data-lmm-underlying>${busyBlock('در حال دریافت نمادهای پایه…', { lines: 3 })}</div>
      <div class="lmm-expiry-step" data-lmm-expiry-step hidden><div class="lmm-step-head"><h3>سررسیدها</h3><span>هر سررسید، آمار مستقل و زنجیره خودش را دارد.</span></div><div class="lmm-expiries" data-lmm-expiries></div></div>
      <div class="lmm-expiry-info" data-lmm-expiry-info></div>
      <div class="lmm-chain-step" data-lmm-chain-step hidden><div class="lmm-step-head"><div><h3>زنجیره قرارداد</h3><span data-lmm-chain-count>کال و پوت این سررسید</span></div><div class="lmm-chain-tools"><div class="lmm-chain-kind" data-lmm-chain-layout role="group" aria-label="چیدمان زنجیره"><button type="button" data-lmm-layout="paired">زنجیره دوطرفه</button><button type="button" data-lmm-layout="flat">جدول تخت</button></div><div class="lmm-chain-kind" data-lmm-chain-kind role="group" aria-label="نوع قراردادهای زنجیره"><button type="button" data-lmm-chain-side="all">هر دو</button><button type="button" data-lmm-chain-side="call">فقط کال</button><button type="button" data-lmm-chain-side="put">فقط پوت</button></div><button type="button" class="ghost tbl-cols-btn" data-lmm-paired-cols aria-expanded="false">ستون‌ها <b></b></button></div></div><p class="note" data-lmm-chain-note data-help-note></p><div class="col-panel" data-lmm-paired-panel hidden></div><div class="lmm-paired-wrap" data-lmm-paired hidden></div><div data-lmm-chain></div></div>
    </section>`;

  const mapHost = root.querySelector('[data-lmm-map]');
  const summaryHost = root.querySelector('[data-lmm-summary]');
  const underlyingHost = root.querySelector('[data-lmm-underlying]');
  const expiryStep = root.querySelector('[data-lmm-expiry-step]');
  const expiryRail = root.querySelector('[data-lmm-expiries]');
  const expiryInfo = root.querySelector('[data-lmm-expiry-info]');
  const chainStep = root.querySelector('[data-lmm-chain-step]');
  const pairedHost = root.querySelector('[data-lmm-paired]');
  const pairedPanel = root.querySelector('[data-lmm-paired-panel]');
  const pairedBtn = root.querySelector('[data-lmm-paired-cols]');
  const chainHost = root.querySelector('[data-lmm-chain]');
  let universe = { underlyings: [], expiries: [], contracts: [] };
  let mapMode = localStorage.getItem('options-radar:market-map-mode') || 'underlyings';
  if (!['underlyings', 'contracts'].includes(mapMode)) mapMode = 'underlyings';
  let baseMetric = localStorage.getItem('options-radar:market-map-metric') || 'value';
  if (!MARKET_MAP_METRICS.some((item) => item.key === baseMetric)) baseMetric = 'value';
  let contractMetric = localStorage.getItem('options-radar:contract-map-metric') || 'value';
  if (!CONTRACT_MAP_METRICS.some((item) => item.key === contractMetric)) contractMetric = 'value';
  let chainSide = localStorage.getItem('options-radar:market-map-chain-side') || 'all';
  if (!['all', 'call', 'put'].includes(chainSide)) chainSide = 'all';
  // چیدمان پیش‌فرض همان چیزی است که هر تابلوی اختیار دارد: کال و پوتِ
  // هم‌اعمال روی یک ردیف. جدول تخت برای غربال و خروجی اکسل می‌ماند.
  let chainLayout = localStorage.getItem('options-radar:market-map-chain-layout') || 'paired';
  if (!['paired', 'flat'].includes(chainLayout)) chainLayout = 'paired';
  let uaIns = '', endDate = '', contractIns = '', mapHandle = null;
  let marketContext = {};

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

  function normalizeSelection(preserve = true) {
    ({ uaIns, endDate, contractIns } = normalizeMapSelection(universe, { uaIns, endDate, contractIns }, preserve));
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
    // جمعِ نصفه ساخته نمی‌شود: اگر نوار یک پایه نرسید، جمع نامعلوم است و
    // تعدادِ کم‌آمده زیرش نوشته می‌شود — نه عددِ کم ولی کامل‌نما.
    const tapeFailed = hasBreadth ? Number(breadth.tapeFailed) || 0 : 0;
    const underlyingValue = hasBreadth ? (tapeFailed ? NaN : breadthValue) : data.underlyingValue;
    const gap = (count, unit = 'پایه') => (count > 0 ? `${fmt.int(count)} ${unit} نامعلوم` : '');
    const missing = data.missing || {};
    const positiveBases = Number.isFinite(Number(breadth.positive)) ? Number(breadth.positive) : data.positiveBases;
    const negativeBases = Number.isFinite(Number(breadth.negative)) ? Number(breadth.negative) : data.negativeBases;
    patchHTML(summaryHost, `
      <div class="section-head"><div><p class="eyebrow">کل بازار در همین عکس</p><h2>ارزش معاملات و وضعیت عمومی</h2></div><span>${fmt.int(baseTraded)} پایه معامله‌شده از ${fmt.int(data.underlyings)}</span></div>
      <div class="lmm-stat-grid">
        ${stat('جمع ارزش اختیار', fmt.rialText(data.optionValue), gap(missing.optionValue) || 'کال و پوت')}
        ${stat('ارزش کال', fmt.rialText(data.callValue), gap(missing.callValue))}
        ${stat('ارزش پوت', fmt.rialText(data.putValue), gap(missing.putValue))}
        ${stat('ارزش نمادهای پایه', fmt.rialText(underlyingValue), hasBreadth ? gap(tapeFailed) : gap(missing.underlyingValue))}
        ${stat('حجم اختیار (قرارداد)', fmt.int(data.optionVolume), gap(missing.optionVolume))}
        ${stat('موقعیت باز (قرارداد)', fmt.int(data.openInterest), gap(missing.openInterest))}
        ${stat('قرارداد معامله‌شده', fmt.int(data.tradedContracts), `از ${fmt.int(data.contracts)} قرارداد`)}
        ${stat('مظنه دوطرفه', fmt.int(data.twoSided), `${fmt.int(positiveBases)} پایه مثبت · ${fmt.int(negativeBases)} پایه منفی`)}
      </div>`);
  }

  // تیکِ پس‌زمینه (`quiet`) خروجیِ موجود را با اسکلتِ «در انتظار» یا خالی
  // عوض نمی‌کند (۱۴۰۵/۰۷/۱۸): اگر نمادِ نگه‌داشته در این عکس نیست، همان
  // آخرین نمای سالم می‌ماند تا عکسِ بعد. کلیکِ کاربر همچنان حالتِ خالی را می‌بیند.
  let shownUa = false;
  function paintUnderlying(quiet = false) {
    const ua = selectedUa();
    if (!ua) {
      if (quiet && shownUa) return;
      shownUa = false;
      root.querySelector('[data-lmm-title]').textContent = 'داده‌ای برای انتخاب نماد پایه نیست';
      root.querySelector('[data-lmm-selected]').textContent = 'هنوز عکس معتبر بازار دریافت نشده است.';
      underlyingHost.innerHTML = busyBlock('در انتظار نخستین عکس بازار؛ پس از دریافت، همه نمادهای پایه اینجا ظاهر می‌شوند.', { lines: 3 });
      expiryStep.hidden = true; chainStep.hidden = true; expiryInfo.innerHTML = ''; pairedHost.innerHTML = ''; chainTable.set([]);
      return;
    }
    shownUa = true;
    const uaQ = dayQuote(ua);
    root.querySelector('[data-lmm-title]').textContent = ua.name || ua.ins;
    patchHTML(root.querySelector('[data-lmm-selected]'), `نماد انتخاب‌شده: <strong>${esc(ua.name || ua.ins)}</strong> ${pricePairHtml(ua)}`);
    patchHTML(underlyingHost, `<div class="lmm-stat-grid">
      ${stat('آخرین معاملهٔ پایه', fmt.money(uaQ.last), Number.isFinite(uaQ.lastPct) ? `${fmt.pct(uaQ.lastPct)}٪ نسبت به پایانی دیروز` : 'امروز معامله نشده', tone(uaQ.lastPct))}
      ${stat('پایانی پایه', fmt.money(uaQ.close), Number.isFinite(uaQ.closePct) ? `${fmt.pct(uaQ.closePct)}٪ نسبت به پایانی دیروز` : 'تغییر نامعلوم', tone(uaQ.closePct))}
      ${stat('ارزش خودِ پایه', fmt.rialText(ua.uaValue))}
      ${stat('ارزش کل اختیار', fmt.rialText(ua.value), `${fmt.int(ua.contracts)} قرارداد`)}
      ${stat('ارزش کال', fmt.rialText(ua.callValue), Number.isFinite(ua.callValuePct) ? `سهم ${fmt.pct(ua.callValuePct)}٪` : '')}
      ${stat('ارزش پوت', fmt.rialText(ua.putValue), Number.isFinite(ua.putValuePct) ? `سهم ${fmt.pct(ua.putValuePct)}٪` : '')}
      ${stat('حجم اختیار', fmt.int(ua.volume), `${fmt.int(ua.callVol)} کال · ${fmt.int(ua.putVol)} پوت`)}
      ${stat('موقعیت باز', fmt.int(ua.oi), `نسبت پوت به کال ${fmt.num(ua.pcRatio)}`)}
      ${stat('ساختار زنجیره', fmt.int(ua.expiries), `${fmt.int(ua.strikes)} اعمال · ${fmt.int(ua.twoSided)} مظنه دوطرفه`)}
      ${(() => {
        // IVR و IVP آخرین باری که تب «رتبه و صدک تلاطم» برای این پایه
        // ساخت؛ کلیک همان تب را باز می‌کند.
        const [label, value, note] = volTileParts(readVolSummary(ua.ins), { today: tehranDateNumber() });
        return `<button type="button" class="lmm-stat vr-open" data-open-mode="vol-rank"><small>${esc(label)}</small><strong>${value}</strong><span>${esc(note)}</span></button>`;
      })()}
    </div>`);
    expiryStep.hidden = expiries().length === 0;
    patchHTML(expiryRail, expiries().map((row) => `<button type="button" data-lmm-expiry="${esc(row.endDate)}" aria-pressed="${String(row.endDate) === endDate}"><b>${dateLabel(row.endDate)}</b><small>${fmt.int(row.days)} روز · ارزش ${fmt.rialText(row.value)}</small></button>`).join(''));
    paintExpiry(quiet);
  }

  function paintExpiry(quiet = false) {
    const ex = selectedExpiry();
    if (!ex && quiet && !chainStep.hidden) return;
    if (!ex) { expiryInfo.innerHTML = ''; chainStep.hidden = true; pairedHost.innerHTML = ''; chainTable.set([]); return; }
    patchHTML(expiryInfo, `<div class="lmm-scope-title"><h3>سررسید ${dateLabel(ex.endDate)}</h3><span>${fmt.int(ex.days)} روز مانده</span></div><div class="lmm-stat-grid compact">
      ${stat('ارزش کل', fmt.rialText(ex.value), `${fmt.int(ex.tradedContracts)} قرارداد معامله‌شده`)}
      ${stat('ارزش کال', fmt.rialText(ex.callValue), Number.isFinite(ex.callValuePct) ? `سهم ${fmt.pct(ex.callValuePct)}٪` : '')}
      ${stat('ارزش پوت', fmt.rialText(ex.putValue), Number.isFinite(ex.putValuePct) ? `سهم ${fmt.pct(ex.putValuePct)}٪` : '')}
      ${stat('حجم', fmt.int(ex.volume), `${fmt.int(ex.trades)} معامله`)}
      ${stat('موقعیت باز', fmt.int(ex.oi), `تغییر ${fmt.int(ex.oiChange)}`)}
      ${stat('IV وزنی', Number.isFinite(ex.ivPct) ? `${fmt.pct(ex.ivPct)}٪` : '—', `میانه فاصله مظنه ${fmt.pct(ex.spreadPct)}٪`)}
    </div>`);
    chainStep.hidden = false;
    paintChain();
  }

  function paintChain() {
    const rows = visibleContracts();
    root.querySelectorAll('[data-lmm-chain-side]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.lmmChainSide === chainSide)));
    root.querySelectorAll('[data-lmm-layout]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.lmmLayout === chainLayout)));
    root.querySelector('[data-lmm-chain-count]').textContent = chainSide === 'all'
      ? `${fmt.int(rows.length)} قرارداد کال و پوت`
      : `${fmt.int(rows.length)} قرارداد ${chainSide === 'call' ? 'کال' : 'پوت'}`;
    const paired = chainLayout === 'paired';
    root.querySelector('[data-lmm-chain-note]').textContent = paired
      ? 'کال و پوتِ هر قیمت اعمال روی یک ردیف. خانه‌های پررنگ «در سود»اند، نوار زیر موقعیت باز سنگینی تعهد را نشان می‌دهد، و خط‌چین جای قیمت جاری پایه است. روی هر سرستون بزن تا با همان ستون مرتب شود — چون هر ردیف دو مقدار دارد، سرستونِ سمت کال با کال مرتب می‌کند و سمت پوت با پوت؛ خط قیمت جاری فقط در ترتیب «قیمت اعمال» معنی دارد و در بقیه نمایش داده نمی‌شود. تلاطم و دلتای «آخرین معامله» مشاهده‌ای‌اند و ممکن است با قیمت پایه هم‌زمان نباشند؛ ستون‌های «اجرایی» از میانه مظنه می‌آیند.'
      : 'روی «ستون‌ها» بزن تا هر داده‌ای را اضافه یا حذف کنی؛ روی ردیف بزن تا همان قرارداد دامنهٔ تحلیل شود.';
    pairedHost.hidden = !paired;
    chainHost.hidden = paired;
    pairedBtn.hidden = !paired;
    if (!paired) togglePairedPanel(false);
    paintPairedCount();
    if (paired) paintPairedChain(rows);
    else chainTable.set(rows.map((row) => contractRow(row, greekParams())));
  }

  // ————— زنجیرهٔ دوطرفه —————
  //
  // ستون‌ها عمداً کم‌اند و همان‌هایی که پیش از زدن یک اختیار نگاه می‌شوند:
  // موقعیت باز (کجا تعهد جمع شده)، حجم امروز، IV (گران یا ارزان)، فاصله تا
  // سربه‌سر (چقدر باید حرکت کند) و آخرین قیمت با تغییرش. بقیهٔ ۳۴ ستون در
  // جدول تخت سر جایشان‌اند.
  // ────────── ستون‌های زنجیرهٔ دوطرفه ──────────
  //
  // خواستهٔ صاحب پروژه: «امکان انتخاب ستون‌های متعدد… همه چیز در تمامی
  // موضوعات؛ چیزی جا نمونه.» پس فهرست ثابت شش‌تایی رفت و جایش **همان
  // کاتالوگ کامل جدول تخت** نشست — یک منبع ستون برای هر دو چیدمان، تا
  // ستونی که در یکی هست در دیگری نباشد.
  //
  // چند ستون از کاتالوگ کنار گذاشته می‌شوند چون در چیدمان قرینه معنی
  // ندارند یا در خود ردیف تکرارند: نام قرارداد (ستون لبهٔ هر سمت است)،
  // نوع (خودِ سمت است)، قیمت اعمال (ستون میانی است) و سررسید/نماد پایه که
  // برای کل جدول یکی‌اند.
  const PAIRED_SKIP = new Set(['title', 'kindLabel', 'strike', 'expiryText', 'uaName']);
  const PAIRED_CATALOG = contractColumns.filter((item) => !PAIRED_SKIP.has(item.key));
  // آخرین و پایانی هر دو، با درصد تغییر هر کدام نسبت به پایانی دیروز.
  const PAIRED_DEFAULT = ['oi', 'volume', 'ivPct', 'delta', 'breakevenGapPct', 'tradeLast', 'lastChangePct', 'close', 'closeChangePct'];
  const pairedByKey = new Map(PAIRED_CATALOG.map((item) => [item.key, item]));
  // ستون‌هایی که علامتشان خبر است، در هر دو سمت رنگ می‌گیرند.
  const SIGNED_KEYS = new Set(PAIRED_CATALOG.filter((item) => item.sign).map((item) => item.key));

  let pairedKeys = readPairedKeys();
  function readPairedKeys() {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem('options-radar:market-map-paired-cols') || '[]'); }
    catch { saved = []; }
    const usable = (Array.isArray(saved) ? saved : []).filter((key) => pairedByKey.has(key));
    const fallback = PAIRED_DEFAULT.filter((key) => pairedByKey.has(key));
    return usable.length ? usable : (fallback.length ? fallback : PAIRED_CATALOG.slice(0, 6).map((item) => item.key));
  }
  const savePairedKeys = () => {
    try { localStorage.setItem('options-radar:market-map-paired-cols', JSON.stringify(pairedKeys)); }
    catch { /* حافظهٔ مرورگر ممکن است بسته باشد؛ انتخاب همین نشست می‌ماند */ }
  };
  // ترتیب نمایش همیشه ترتیب کاتالوگ است، نه ترتیب تیک‌زدن: با ترتیب
  // تیک، دو بار عوض‌کردن یک ستون کل جدول را جابه‌جا می‌کرد.
  const pairedCols = () => PAIRED_CATALOG.filter((item) => pairedKeys.includes(item.key));

  const cellText = (item, row) => {
    const value = row[item.key];
    if (item.fmt === 'pct') return Number.isFinite(Number(value)) ? `${fmt.pct(value)}٪` : '—';
    return (fmt[item.fmt] || fmt.text)(value);
  };

  // ═══ ردیف‌ها **پیش از** مرتب‌سازی غنی می‌شوند ═══
  //
  // گزارش صاحب پروژه: «مرتب‌سازی درست کار نمی‌دهد؛ مثلاً ستون درصد فاصله
  // تا سربه‌سر.» علتش همین‌جا بود: ستون‌های مشتق — فاصله تا سربه‌سر، دلتا،
  // اهرم، بازده — را `contractRow` می‌ساخت و آن **حین رسم هر خانه** صدا
  // زده می‌شد، یعنی بعد از مرتب‌سازی. مرتب‌ساز روی ردیف خام می‌نشست، آن
  // کلیدها را `undefined` می‌دید، همه را «خالی» می‌شمرد و بی‌صدا به ترتیب
  // قیمت اعمال برمی‌گشت. هیچ خطایی هم نمی‌داد — فقط کاری نمی‌کرد.
  //
  // حالا یک بار برای هر قرارداد غنی می‌شود و همان ردیفِ غنی هم مرتب
  // می‌شود هم رسم. کنارش، به‌جای «تعداد خانه» بار محاسبه «تعداد قرارداد»
  // شد.
  function pairedCells(enriched, side, oiMax, itm) {
    const shade = itm ? ' is-itm' : '';
    const cols = pairedCols();
    if (!enriched) return cols.map(() => `<td class="lmm-paired-void${shade}">—</td>`).join('');
    const cells = cols.map((item) => {
      // نوار «دیوار» فقط زیر موقعیت باز می‌آید؛ روی هر ستون عددی، نوار
      // یعنی شلوغی بی‌معنی.
      const bar = item.key === 'oi';
      const share = bar && oiMax > 0 ? Math.min(1, (Number(enriched.oi) || 0) / oiMax) : 0;
      const cls = `${SIGNED_KEYS.has(item.key) ? tone(Number(enriched[item.key])) : ''}${bar ? ' lmm-paired-bar' : ''}${shade}`;
      return `<td class="${cls}"${bar ? ` style="--share:${(share * 100).toFixed(1)}%"` : ''}>${cellText(item, enriched)}</td>`;
    });
    // سمت کال از راست خوانده می‌شود و سمت پوت از چپ، پس ترتیب ستون‌های کال
    // آینه می‌شود تا ستون‌های هم‌نام دو سمت، قرینهٔ هم بنشینند.
    return (side === 'call' ? cells.reverse() : cells).join('');
  }

  // ────────── انتخابگر ستون، با همان ظاهر جدول‌های دیگر ──────────
  function buildPairedPanel() {
    const groups = [...new Set(PAIRED_CATALOG.map((item) => item.group || 'دیگر'))];
    pairedPanel.innerHTML = `
      <div class="col-panel-head">
        <span>هر ستون کاتالوگ قرارداد را می‌شود به هر دو سمت زنجیره اضافه یا از آن کم کرد. انتخاب ذخیره می‌ماند.</span>
        <span class="sp"></span>
        <input type="search" class="col-search" aria-label="جست‌وجوی ستون" placeholder="جست‌وجوی سربه‌سر، دلتا، بازده…">
        <button type="button" class="ghost" data-paired-act="base">نمای آماده</button>
        <button type="button" class="ghost" data-paired-act="all">همه</button>
        <button type="button" class="ghost" data-paired-act="close">بستن</button>
      </div>
      <div class="col-groups">${groups.map((group) => `
        <div class="col-group">
          <h5>${esc(group)}</h5>
          ${PAIRED_CATALOG.filter((item) => (item.group || 'دیگر') === group).map((item) => `
            <label class="col-opt">
              <input type="checkbox" data-paired-key="${esc(item.key)}" ${pairedKeys.includes(item.key) ? 'checked' : ''}>
              <span>${esc(item.label)}</span>
            </label>`).join('')}
        </div>`).join('')}</div>`;

    pairedPanel.querySelectorAll('[data-paired-key]').forEach((box) => box.addEventListener('change', () => {
      const key = box.dataset.pairedKey;
      if (box.checked) pairedKeys = [...new Set([...pairedKeys, key])];
      else if (pairedKeys.length === 1) { box.checked = true; return; }  // زنجیرهٔ بی‌ستون معنی ندارد
      else pairedKeys = pairedKeys.filter((item) => item !== key);
      savePairedKeys(); paintPairedCount(); paintChain();
    }));
    pairedPanel.querySelector('.col-search').addEventListener('input', (event) => {
      const needle = String(event.target.value || '').trim();
      pairedPanel.querySelectorAll('.col-opt').forEach((label) => {
        label.hidden = needle ? !label.textContent.includes(needle) : false;
      });
      pairedPanel.querySelectorAll('.col-group').forEach((group) => {
        group.hidden = [...group.querySelectorAll('.col-opt')].every((label) => label.hidden);
      });
    });
    pairedPanel.querySelectorAll('[data-paired-act]').forEach((button) => button.addEventListener('click', () => {
      const act = button.dataset.pairedAct;
      if (act === 'close') { togglePairedPanel(false); return; }
      pairedKeys = act === 'all' ? PAIRED_CATALOG.map((item) => item.key) : PAIRED_DEFAULT.filter((key) => pairedByKey.has(key));
      savePairedKeys(); buildPairedPanel(); paintPairedCount(); paintChain();
    }));
  }

  function paintPairedCount() {
    pairedBtn.querySelector('b').textContent = `${faDigits(pairedCols().length)}/${faDigits(PAIRED_CATALOG.length)}`;
  }

  function togglePairedPanel(open) {
    const next = open ?? pairedPanel.hidden;
    if (next) buildPairedPanel();
    pairedPanel.hidden = !next;
    pairedBtn.setAttribute('aria-expanded', String(next));
  }

  // ── مرتب‌سازی: حالت، و ذخیره‌اش ───────────────────────────────────
  let pairedSort = readPairedSort();
  function readPairedSort() {
    try {
      const saved = JSON.parse(localStorage.getItem('options-radar:market-map-paired-sort') || 'null');
      if (saved && typeof saved.key === 'string') return { ...PAIRED_SORT_DEFAULT, ...saved };
    } catch { /* انتخاب همین نشست می‌ماند */ }
    return { ...PAIRED_SORT_DEFAULT };
  }
  function setPairedSort(key, side) {
    const same = pairedSort.key === key && pairedSort.side === side;
    // کلیک دوم روی همان سرستون، جهت را برمی‌گرداند. ستون تازه با جهتی
    // شروع می‌شود که سؤالش را جواب می‌دهد: اعمال از کم به زیاد (نردبان)،
    // بقیه از زیاد به کم (رهبران).
    pairedSort = same
      ? { ...pairedSort, dir: pairedSort.dir < 0 ? 1 : -1 }
      : { key, side, dir: key === 'strike' ? 1 : -1 };
    try { localStorage.setItem('options-radar:market-map-paired-sort', JSON.stringify(pairedSort)); }
    catch { /* بی‌اهمیت */ }
    paintChain();
  }
  const sortMark = (key, side) => (pairedSort.key === key && pairedSort.side === side
    ? `<i class="lmm-sort-mark">${pairedSort.dir < 0 ? '▼' : '▲'}</i>` : '');
  const headCell = (label, key, side, extra = '') => `<th${extra}><button type="button" class="lmm-sort-btn" data-lmm-sort-key="${esc(key)}" data-lmm-sort-side="${side || ''}" title="${esc(label)}">${esc(label)}${sortMark(key, side)}</button></th>`;

  function paintPairedChain(rows) {
    const spot = Number(contracts().find((row) => Number(row.spot) > 0)?.spot);
    const params = greekParams();
    const chain = twoSidedChain(rows.map((row) => contractRow(row, params)), spot);
    if (!chain.rows.length) { pairedHost.innerHTML = '<p class="empty-note">برای این سررسید قرارداد معتبری در عکس بازار نیست.</p>'; return; }
    const oiMax = chainSideMax(chain.rows, 'oi');
    const cols = pairedCols();
    // ── فقط سمتی که کاربر خواسته ──────────────────────────────────────
    //
    // تا امروز در حالت «فقط کال»، ستون‌های پوت با «—» پر می‌شدند: نصف عرض
    // جدول، خرجِ چیزی که صریحاً کنار گذاشته شده بود.
    const sides = pairedSides(chainSide);
    const both = sides.length === 2;
    const width = cols.length * sides.length + sides.length + 1;
    // ── ردیف نماد پایه، متمایز از هر ردیف دیگر ───────────────────────
    //
    // خواستهٔ صاحب پروژه: «قیمت آخرین معاملهٔ نماد پایه در یک ردیف، متمایز
    // از سایر ردیف‌ها.» پیش از این فقط یک خط‌چین نازک با یک برچسب بود.
    // حالا خودِ ردیف است: نام نماد، آخرین قیمت، و تغییرش نسبت به پایانی
    // دیروز — با رنگ و وزن جدا، تا چشم بدون گشتن پیدایش کند.
    const ua = selectedUa();
    // آخرین و پایانی، هر کدام با تغییرش نسبت به پایانی دیروز (core/price-change.mjs).
    const uaQ = dayQuote(ua || {});
    const pctText = (v) => (Number.isFinite(v) ? `${fmt.pct(v)}٪` : '—');
    const spotRow = `<tr class="lmm-paired-spot"><td colspan="${width}"><span>
      <b>${esc(ua?.name || 'نماد پایه')}</b>
      <strong>${fmt.money(uaQ.last)}</strong>
      <em class="${tone(uaQ.lastPct)}">${pctText(uaQ.lastPct)}</em>
      <i>آخرین معاملهٔ نماد پایه</i>
      <strong>${fmt.money(uaQ.close)}</strong>
      <em class="${tone(uaQ.closePct)}">${pctText(uaQ.closePct)}</em>
      <i>پایانی</i>
    </span></td></tr>`;
    const ordered = sortPairedChain(chain.rows, pairedSort);
    // ── کجا بنشیند ───────────────────────────────────────────────────
    //
    // گزارش صاحب پروژه: «نماد پایه در یک ردیف در زنجیره قرارداد نمی‌آید.»
    // درست بود، و علتش این بود که این ردیف را به **جایگاهِ** خط قیمت جاری
    // گره زده بودم: فقط وقتی رسم می‌شد که ترتیب، نردبانِ اعمال باشد و
    // اعمالی هم بالاتر (یا پایین‌تر) از قیمت جاری وجود داشته باشد. پس به
    // محض مرتب‌کردن روی هر ستون دیگر — یا وقتی قیمت جاری بیرون از کل
    // نردبان بود — کلاً ناپدید می‌شد.
    //
    // ولی خواسته دو چیزِ جدا بود: «خط قیمت جاری بین دو اعمالِ در بر گیرنده»
    // یک ادعای **جایگاهی** است و فقط در نردبان معنی دارد؛ «ردیف نماد پایه
    // با آخرین قیمتش» یک ادعای **اطلاعاتی** است و همیشه باید باشد. حالا
    // ردیف همیشه رسم می‌شود و فقط جایش عوض می‌شود:
    //
    //   نردبانِ اعمال، قیمت جاری داخل نردبان → همان‌جا، بین دو اعمال
    //   نردبانِ اعمال، قیمت جاری بیرونِ آن   → انتهای همان سمت
    //   هر ترتیب دیگر                        → بالای جدول، بی ادعای جایگاه
    const place = spotRowPlacement(ordered, { spot: chain.spot, sort: pairedSort });
    const spotAt = place.at;

    const edge = (row, itm) => `<td class="lmm-paired-edge${itm ? ' is-itm' : ''}${row && String(row.ins) === contractIns ? ' is-picked' : ''}"${row ? ` data-lmm-paired-pick="${esc(row.ins)}"` : ''}>${row ? esc(row.name) : '—'}</td>`;
    const lines = ordered.map((rung, index) => {
      const lead = index === spotAt ? spotRow : '';
      const call = `${edge(rung.call, rung.callItm)}${pairedCells(rung.call, 'call', oiMax, rung.callItm)}`;
      const put = `${pairedCells(rung.put, 'put', oiMax, rung.putItm)}${edge(rung.put, rung.putItm)}`;
      const strikeCell = `<th class="lmm-paired-strike" scope="row">${fmt.money(rung.strike)}</th>`;
      const body = both ? `${call}${strikeCell}${put}`
        : sides[0] === 'call' ? `${call}${strikeCell}` : `${strikeCell}${put}`;
      return `${lead}<tr class="lmm-paired-row">${body}</tr>`;
    }).join('');
    const tableBody = `${place.head ? spotRow : ''}${lines}${place.tail ? spotRow : ''}`;

    const callHead = [`<th>قرارداد</th>`, ...[...cols].reverse().map((item) => headCell(item.label, item.key, 'call'))].join('');
    const putHead = [...cols.map((item) => headCell(item.label, item.key, 'put')), `<th>قرارداد</th>`].join('');
    const strikeHead = headCell('قیمت اعمال', 'strike', null, ' class="lmm-paired-strike"');
    const sideBanner = both
      ? `<tr class="lmm-paired-sides"><th colspan="${cols.length + 1}">اختیار خرید (کال)</th><th class="lmm-paired-strike">قیمت اعمال</th><th colspan="${cols.length + 1}">اختیار فروش (پوت)</th></tr>`
      : `<tr class="lmm-paired-sides"><th colspan="${width}">${sides[0] === 'call' ? 'اختیار خرید (کال)' : 'اختیار فروش (پوت)'} · قیمت اعمال</th></tr>`;
    const headRow = both ? `${callHead}${strikeHead}${putHead}`
      : sides[0] === 'call' ? `${callHead}${strikeHead}` : `${strikeHead}${putHead}`;

    // وصله، نه بازسازی: زنجیرهٔ دوطرفه جعبهٔ پیمایشِ افقی و عمودی دارد و
    // بازسازی‌اش در هر تیک کاربر را به ابتدای جدول برمی‌گرداند. کلیک‌ها یک
    // بار روی میزبان گرفته می‌شوند (پایین‌تر)، چون خانه‌ها حالا می‌مانند.
    patchHTML(pairedHost, `<table class="lmm-paired">
      <thead>${sideBanner}<tr>${headRow}</tr></thead>
      <tbody>${tableBody}</tbody>
    </table>`);
  }

  const currentMetrics = () => mapMode === 'contracts' ? CONTRACT_MAP_METRICS : MARKET_MAP_METRICS;
  const currentMetric = () => mapMode === 'contracts' ? contractMetric : baseMetric;

  function weightedContracts(metric) {
    const list = (universe.contracts || []).filter((row) => String(row.uaIns) === uaIns);
    if (metric === EQUAL_MAP_METRIC) return list.map((row) => ({ ...row, metricValue: NaN, sizeValue: 1, mapWeight: 1 }));
    const rows = list.map((row) => {
      const raw = Number(row[metric]);
      const metricValue = Number.isFinite(raw) ? raw : NaN;
      const sizeValue = metric === 'changePct' ? Math.abs(metricValue) : Math.max(0, metricValue);
      return { ...row, metricValue, sizeValue };
    });
    const max = Math.max(0, ...rows.map((row) => Number.isFinite(row.sizeValue) ? row.sizeValue : 0));
    const floor = max > 0 ? max * 0.002 : 1;
    return rows.map((row) => ({ ...row, mapWeight: row.sizeValue > 0 ? row.sizeValue : floor }));
  }

  // دکمه‌های سنجه فقط وقتی دوباره ساخته می‌شوند که نشانه‌گذاری‌شان عوض شده
  // (۱۴۰۵/۰۷/۱۸)؛ پیش‌تر هر تیک همه را از نو می‌ساخت و فوکوسِ صفحه‌کلید می‌پرید.
  let metricMarkup = '';
  function paintMetricControls() {
    const host = root.querySelector('[data-lmm-metrics]');
    const active = currentMetric();
    const markup = currentMetrics().map((item) => `<button type="button" data-lmm-metric="${item.key}" aria-pressed="${item.key === active}">${item.label}</button>`).join('');
    if (markup === metricMarkup) return;
    metricMarkup = markup;
    host.innerHTML = markup;
    host.querySelectorAll('[data-lmm-metric]').forEach((button) => button.addEventListener('click', () => {
      if (mapMode === 'contracts') {
        contractMetric = button.dataset.lmmMetric;
        localStorage.setItem('options-radar:contract-map-metric', contractMetric);
      } else {
        baseMetric = button.dataset.lmmMetric;
        localStorage.setItem('options-radar:market-map-metric', baseMetric);
      }
      paintMapMode(); paintMap();
    }));
  }

  function paintMapMode() {
    const ua = selectedUa();
    root.querySelectorAll('[data-lmm-map-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.lmmMapMode === mapMode)));
    root.querySelector('[data-lmm-map-title]').textContent = mapMode === 'contracts' ? `نقشه قراردادهای ${ua?.name || 'نماد انتخابی'}` : 'نقشه بازار اختیار';
    // جملهٔ زیر عنوان باید همان کاری را بگوید که نقشه دارد می‌کند. در حالت
    // هم‌اندازه «اندازه از سنجه می‌آید» دیگر درست نیست.
    const equal = currentMetric() === EQUAL_MAP_METRIC;
    root.querySelector('[data-lmm-map-note]').textContent = equal
      ? (mapMode === 'contracts'
        ? 'همه قراردادهای این نماد هم‌اندازه‌اند تا هیچ‌کدام زیر وزنِ پرمعامله‌ها گم نشود؛ رنگ، تغییر خود قرارداد است.'
        : 'همه نمادها هم‌اندازه‌اند تا کم‌معامله‌ها هم دیده و کلیک شوند؛ رنگ، جهت آخرین معامله نسبت به پایانی دیروز است.')
      : (mapMode === 'contracts'
        ? 'همه قراردادهای این نماد در همه سررسیدها؛ اندازه با سنجه انتخابی و رنگ با تغییر خود قرارداد.'
        : 'اندازه خانه از سنجه انتخابی می‌آید؛ رنگ، جهت آخرین معامله نماد پایه نسبت به پایانی دیروز است.');
    mapHost.setAttribute('aria-label', mapMode === 'contracts' ? `نقشه قراردادهای ${ua?.name || 'نماد انتخابی'}` : 'نقشه همه نمادهای پایه');
    paintMetricControls();
  }

  async function paintMap(quiet = false) {
    const metric = currentMetric();
    const info = currentMetrics().find((item) => item.key === metric) || currentMetrics()[0];
    const rows = mapMode === 'contracts' ? weightedContracts(metric) : marketMapRows(universe, metric);
    if (!rows.length) {
      // تیکِ پس‌زمینه نقشهٔ موجود را با یک عکسِ ناقص دور نمی‌ریزد.
      if (quiet && mapHandle) return;
      mapHandle?.dispose(); mapHandle = null;
      mapHost.innerHTML = `<p class="empty-note">${mapMode === 'contracts' ? 'برای نماد انتخابی قرارداد معتبری دریافت نشده است.' : 'هنوز نماد پایه‌ای برای نقشه دریافت نشده است.'}</p>`;
      return;
    }
    const build = (_echarts, tokens) => {
      const maxChange = Math.max(1, ...rows.map((row) => Math.abs(Number(row.changePct) || 0)));
      return {
        tooltip: {
          trigger: 'item', confine: true,
          // همان عددهای جدول و کاشی‌ها، هر کدام با نام خودش (`ui/map-tooltip.mjs`).
          formatter: ({ data }) => `<b>${esc(data.name)}</b><br>${mapTooltipLines(data.row, {
            mode: mapMode, metricLabel: info.label, metricKey: info.key, metricText: metricText(info, data.metricValue),
            dateText: data.endDate ? dateLabel(data.endDate) : '',
          }).map(esc).join('<br>')}`,
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
              row: {
                name: row.name, tradeLast: row.tradeLast, close: row.close, yday: row.yday,
                value: row.value, uaValue: row.uaValue, callValue: row.callValue, putValue: row.putValue,
                volume: row.volume, oi: row.oi, trades: row.trades,
              },
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
    contractIns = String(next); paintChain(); emit('contract');
  }
  function selectContractFromMap(data) {
    uaIns = String(data.uaIns); endDate = String(data.endDate); contractIns = String(data.contractIns);
    normalizeSelection(true); paintUnderlying(); emit('contract');
    root.querySelector('[data-lmm-chain-step]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  pairedBtn.addEventListener('click', () => togglePairedPanel());
  pairedHost.addEventListener('click', (event) => {
    const pick = event.target.closest('[data-lmm-paired-pick]');
    if (pick && pairedHost.contains(pick)) { selectContract(pick.dataset.lmmPairedPick); return; }
    const sort = event.target.closest('[data-lmm-sort-key]');
    if (sort && pairedHost.contains(sort)) setPairedSort(sort.dataset.lmmSortKey, sort.dataset.lmmSortSide || null);
  });
  root.querySelector('[data-lmm-chain-layout]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-lmm-layout]');
    if (!button) return;
    chainLayout = button.dataset.lmmLayout;
    localStorage.setItem('options-radar:market-map-chain-layout', chainLayout);
    paintChain();
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
      // تیکِ خودکار: بی اسکلت و بی دورریختنِ نقشه (`quiet`).
      normalizeSelection(preserve); paintSummary(); paintUnderlying(true); paintMapMode(); await paintMap(true);
    },
    selection: () => ({ uaIns, endDate, contractIns }),
    // انتخاب از بیرونِ نقشه (تب «مقایسه در زنجیره»)، بی پرش صفحه. انتخاب
    // همچنان یک منبع دارد: همین‌جا.
    pickContract(row) {
      if (!row) return;
      uaIns = String(row.uaIns); endDate = String(row.endDate); contractIns = String(row.ins);
      normalizeSelection(true); paintUnderlying(); emit('contract');
    },
    // پایین‌رفتن از «تصویر شفاف»: نماد یا سررسید، بی پرش صفحه.
    pickUnderlying(next) {
      if (!next) return;
      uaIns = String(next); endDate = ''; contractIns = '';
      normalizeSelection(true); paintUnderlying(); paintMapMode(); paintMap(); emit('underlying');
    },
    pickExpiry(nextUa, nextEnd) {
      if (!nextUa || !nextEnd) return;
      uaIns = String(nextUa); endDate = String(nextEnd); contractIns = '';
      normalizeSelection(true); paintUnderlying(); emit('expiry');
    },
    dispose() { mapHandle?.dispose(); },
  };
}
