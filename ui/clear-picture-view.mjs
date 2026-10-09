// زیرتبِ «تصویر شفاف» در رصد لحظه‌ای بازار (۱۴۰۵/۰۷/۱۷).
//
// از کل به جزء: «نمای کلی» (کاشی‌ها، کال و پوت در هر سنجه، جهت)، «در طول
// روز»، «سهم اجزا» (نماد، سررسید یا قیمت اعمال، با جدول کامل)، «ترین‌ها»،
// «سربه‌سر» و «تمرکز و توزیع». دامنه همان نوار سطحِ بالای داشبورد است (کل
// بازار، نماد پایه، سررسید، قرارداد) و هر جزء با یک کلیک دامنه را یک پله
// پایین می‌برد.
//
// دور دوم (همان روز): «آیتم‌ها زیاد شد؛ برای هر کدام زیرتب بساز»، «در همه
// قسمت‌ها کال یا پوت یا هر دو قابل انتخاب باشد»، سربه‌سرها «با منطق سایر
// قسمت‌های برنامه»، و کاشی‌هایی که عدد و نوشته‌شان جا شود.
//
// عددها همه از `core/clear-picture.mjs` می‌آیند؛ اینجا فقط رسم است.

import { fmt, faDigits } from '/ui/fmt.mjs';
import { makeTable } from '/ui/table.mjs';
import { paintInto } from '/ui/morph.mjs';
import { historyDateLabel } from '/core/history.mjs';
import { breadthDonut, liveChart } from '/ui/tabs/live-market.mjs';
import {
  clearPicture, contractStanding, sampleKey, LEADER_LISTS, SIDES, sideOf, bySide, pictureTotals,
  breakevenPicture, breakevenLadder, BREAKEVEN_WEIGHTS, PREMIUM_BASES, premiumBasis, withPremium, allExpiriesBreakeven,
} from '/core/clear-picture.mjs';
import { contractBreakeven, breakevenGap, breakevenGapPct } from '/core/decision-dashboard.mjs';
import { pctVsYesterday } from '/core/price-change.mjs';
import { logError } from '/ui/errlog.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));
const dateLabel = (value) => faDigits(historyDateLabel(value));
const pctText = (value) => (Number.isFinite(value) ? `${fmt.pct(value)}٪` : '—');
const toneOf = (value) => (Number(value) > 0 ? 'gain' : Number(value) < 0 ? 'loss' : '');
const kindLabel = (kind) => (kind === 'put' ? 'پوت' : 'کال');
const SIDE_LABEL = { both: 'کال و پوت', call: 'کال', put: 'پوت' };
const LEVEL_LABEL = { market: 'کل بازار', underlying: 'نماد پایه', expiry: 'سررسید', contract: 'قرارداد' };
const PART_LABEL = { underlying: 'نماد پایه', expiry: 'سررسید', strike: 'قیمت اعمال' };
const PARTS_SHOWN = 14;
// مسیر روز هر نیم دقیقه یک بار پرسیده می‌شود؛ سرور هر دقیقه یک نمونه دارد.
const SERIES_TTL_MS = 30_000;

export const CP_TABS = [
  ['overview', 'نمای کلی'], ['intraday', 'در طول روز'], ['parts', 'سهم اجزا'],
  ['leaders', 'ترین‌ها'], ['breakeven', 'سربه‌سر'], ['spread', 'تمرکز و توزیع'],
];

const store = {
  get: (key, fallback) => { try { return globalThis.localStorage?.getItem(key) || fallback; } catch { return fallback; } },
  set: (key, value) => { try { globalThis.localStorage?.setItem(key, value); } catch { /* حافظهٔ مرورگر بسته است */ } },
};

// ── کاشی ─────────────────────────────────────────────────────────────
//
// «بعضاً اعداد و نوشته‌ها درست داخلشان جا نمی‌شود.» کاشیِ قبلی عدد و واحد را
// در یک خطِ بی‌شکست می‌گذاشت و بقیه را با «…» می‌برید. حالا عدد درشت است و
// واحد کنارش کوچک، هر دو می‌شکنند و هیچ‌چیز بریده نمی‌شود؛ سهم با یک نوار
// نازک دیده می‌شود و رنگِ هویت (کال، پوت، سود، زیان) نوارِ کناری است.
const money = (value) => {
  if (!Number.isFinite(value)) return ['—', ''];
  return Math.abs(value) >= 1e6 ? [fmt.mrial(value), 'میلیون ریال'] : [fmt.int(value), 'ریال'];
};
function tile({ label, value, unit = '', note = '', tone = '', accent = '', share = NaN }) {
  const bar = Number.isFinite(share)
    ? `<i class="cp-tile-bar" aria-hidden="true"><b style="--w:${Math.max(0, Math.min(100, share))}%"></b></i>` : '';
  return `<article class="cp-tile ${tone}"${accent ? ` data-accent="${accent}"` : ''}><small>${esc(label)}</small><p><strong>${value}</strong>${unit ? `<span>${esc(unit)}</span>` : ''}</p>${bar}${note ? `<em>${esc(note)}</em>` : ''}</article>`;
}
const moneyTile = (label, value, opts = {}) => { const [v, unit] = money(value); return tile({ label, value: v, unit, ...opts }); };

const partName = (part) => (part.level === 'underlying' ? part.uaName || '—'
  : part.level === 'expiry' ? `${part.uaName || ''} — ${dateLabel(part.endDate)}`
    : `اعمال ${fmt.money(part.strike)}`);

/** میلهٔ دوتکهٔ کال/پوت؛ پهنا نسبت به `max` (برای مقایسهٔ اجزا) یا ۱۰۰٪. سمتِ کنارگذاشته کم‌رنگ. */
function splitBar(call, put, max, side = 'both') {
  const total = (Number(call) || 0) + (Number(put) || 0);
  const scale = max > 0 ? max : total;
  if (!(scale > 0)) return '<div class="cp-bar"><i class="empty" style="--w:100%"></i></div>';
  const dim = (which) => (side !== 'both' && side !== which ? ' dim' : '');
  return `<div class="cp-bar"><i class="call${dim('call')}" style="--w:${((Number(call) || 0) / scale) * 100}%"></i><i class="put${dim('put')}" style="--w:${((Number(put) || 0) / scale) * 100}%"></i></div>`;
}

// ستون‌های جدولِ اجزا؛ ستونِ نام با سطح عوض می‌شود.
const col = (key, label, fmtName, opt = {}) => ({ key, label, fmt: fmtName, ...opt });
const partCols = (partLevel) => [
  col('title', PART_LABEL[partLevel] || 'جزء', 'text', { group: 'شناسه', base: true }),
  col('sharePct', 'سهم از ارزش دامنه ٪', 'pct', { group: 'ارزش', base: true, heat: 'gain' }),
  col('value', 'ارزش کل (میلیون ریال)', 'mrial', { group: 'ارزش', base: true, heat: 'gain' }),
  col('callValue', 'ارزش کال (میلیون ریال)', 'mrial', { group: 'ارزش', base: true }),
  col('callValuePct', 'سهم کال از ارزش ٪', 'pct', { group: 'ارزش', base: true }),
  col('putValue', 'ارزش پوت (میلیون ریال)', 'mrial', { group: 'ارزش', base: true }),
  col('putValuePct', 'سهم پوت از ارزش ٪', 'pct', { group: 'ارزش', base: true }),
  col('putCallValue', 'نسبت ارزش پوت به کال', 'num', { group: 'ارزش' }),
  col('volume', 'حجم', 'int', { group: 'گردش', base: true }),
  col('callVolumePct', 'سهم کال از حجم ٪', 'pct', { group: 'گردش' }),
  col('trades', 'تعداد معامله', 'int', { group: 'گردش', base: true }),
  col('avgTradeValue', 'میانگین ارزش هر معامله (میلیون ریال)', 'mrial', { group: 'گردش' }),
  col('contracts', 'قرارداد', 'int', { group: 'اندازه' }),
  col('traded', 'قرارداد معامله‌شده', 'int', { group: 'اندازه', base: true }),
  col('tradedPct', 'معامله‌شده ٪', 'pct', { group: 'اندازه' }),
  col('positivePct', 'مثبت ٪', 'pct', { group: 'جهت', base: true, heat: 'gain' }),
  col('negativePct', 'منفی ٪', 'pct', { group: 'جهت', base: true, heat: 'loss' }),
  col('oi', 'موقعیت باز', 'int', { group: 'تعهد انباشته' }),
  col('oiChange', 'تغییر موقعیت باز', 'int', { group: 'تعهد انباشته', heat: 'gain', sign: true }),
];

// سربه‌سرِ وزنیِ هر سررسید — همان ستون‌های تابلوی پرمعامله‌ی پیشین.
const beExpiryCols = (side) => [
  col('title', 'سررسید', 'text', { group: 'شناسه', base: true }),
  col('uaName', 'نماد پایه', 'text', { group: 'شناسه', base: true }),
  col('days', 'روز مانده', 'int', { group: 'شناسه', base: true }),
  col('spot', 'قیمت جاری پایه', 'money', { group: 'شناسه', base: true }),
  ...(side !== 'put' ? [
    col('callBreakeven', 'سربه‌سر وزنی کال', 'money', { group: 'سربه‌سر', base: true }),
    col('callGapPct', 'فاصلهٔ پایه تا سربه‌سر کال ٪', 'pct', { group: 'سربه‌سر', base: true, heat: 'loss', sign: true }),
    col('callStrike', 'اعمال وزنی کال', 'money', { group: 'قیمت وزنی' }),
  ] : []),
  ...(side !== 'call' ? [
    col('putBreakeven', 'سربه‌سر وزنی پوت', 'money', { group: 'سربه‌سر', base: true }),
    col('putGapPct', 'فاصلهٔ پایه تا سربه‌سر پوت ٪', 'pct', { group: 'سربه‌سر', base: true, heat: 'loss', sign: true }),
    col('putStrike', 'اعمال وزنی پوت', 'money', { group: 'قیمت وزنی' }),
  ] : []),
  ...(side === 'both' ? [
    col('band', 'باند سربه‌سر (پوت تا کال)', 'money', { group: 'سربه‌سر', base: true }),
    col('bandPct', 'باند ٪ قیمت جاری', 'pct', { group: 'سربه‌سر', base: true }),
  ] : []),
  col('weight', 'وزن', 'money', { group: 'تمرکز' }),
  col('contracts', 'قرارداد', 'int', { group: 'تمرکز' }),
];

// نردبانِ اعمالِ یک سررسید: سربه‌سرِ هر سمت و فاصلهٔ سربه‌سرِ وزنی از اعمال.
const ladderCols = (side) => [
  col('strike', 'قیمت اعمال', 'money', { group: 'اعمال', base: true }),
  col('moneynessPct', 'فاصلهٔ اعمال از پایه ٪', 'pct', { group: 'اعمال', base: true, sign: true }),
  ...(side !== 'put' ? [
    col('callName', 'کال', 'text', { group: 'کال', base: true }),
    col('callPremium', 'پریمیوم کال', 'money', { group: 'کال' }),
    col('callBreakeven', 'سربه‌سر کال', 'money', { group: 'کال', base: true }),
    col('callGap', 'فاصلهٔ پایه تا سربه‌سر کال', 'money', { group: 'کال', sign: true }),
    col('callGapPct', 'فاصلهٔ پایه تا سربه‌سر کال ٪', 'pct', { group: 'کال', base: true, heat: 'loss', sign: true }),
    col('wCallFromStrike', 'سربه‌سر وزنی کال منهای اعمال', 'money', { group: 'وزنی', sign: true }),
    col('wCallFromStrikePct', 'فاصلهٔ سربه‌سر وزنی کال از اعمال ٪', 'pct', { group: 'وزنی', base: true, sign: true }),
  ] : []),
  ...(side !== 'call' ? [
    col('putName', 'پوت', 'text', { group: 'پوت', base: true }),
    col('putPremium', 'پریمیوم پوت', 'money', { group: 'پوت' }),
    col('putBreakeven', 'سربه‌سر پوت', 'money', { group: 'پوت', base: true }),
    col('putGap', 'فاصلهٔ پایه تا سربه‌سر پوت', 'money', { group: 'پوت', sign: true }),
    col('putGapPct', 'فاصلهٔ پایه تا سربه‌سر پوت ٪', 'pct', { group: 'پوت', base: true, heat: 'loss', sign: true }),
    col('wPutFromStrike', 'سربه‌سر وزنی پوت منهای اعمال', 'money', { group: 'وزنی', sign: true }),
    col('wPutFromStrikePct', 'فاصلهٔ سربه‌سر وزنی پوت از اعمال ٪', 'pct', { group: 'وزنی', base: true, sign: true }),
  ] : []),
  col('value', 'ارزش معامله (میلیون ریال)', 'mrial', { group: 'گردش' }),
];

/** ثانیهٔ روز از ساعتِ `HHMMSS`. */
const secondOf = (time) => {
  const raw = String(Math.trunc(Number(time) || 0)).padStart(6, '0');
  return Number(raw.slice(0, 2)) * 3600 + Number(raw.slice(2, 4)) * 60 + Number(raw.slice(4, 6));
};
const clockOf = (second) => faDigits(`${String(Math.floor(second / 3600)).padStart(2, '0')}:${String(Math.floor((second % 3600) / 60)).padStart(2, '0')}`);

/**
 * خط‌کشِ قیمت یک سررسید: قیمت جاری، سربه‌سرهای وزنی و باند میانشان، و
 * قیمت‌های اعمال به‌صورت خط‌های ریز. برچسب‌ها در سه ردیف جدا تا روی هم نیفتند.
 */
export function priceRuler({ spot, callBe, putBe, strikes = [] }) {
  const marks = [spot, callBe, putBe, ...strikes].filter((v) => Number.isFinite(v) && v > 0);
  if (marks.length < 2 || !(spot > 0)) return '<p class="empty-note">برای خط‌کش، قیمت پایه و دست‌کم یک سربه‌سر وزنی لازم است.</p>';
  let lo = Math.min(...marks), hi = Math.max(...marks);
  const pad = (hi - lo) * 0.06 || hi * 0.02;
  lo -= pad; hi += pad;
  const W = 900, L = 24, R = 24, Y = 70;
  const X = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const ticks = strikes.filter((v) => v > 0).map((v) => `<line class="cp-ruler-strike" x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${Y - 7}" y2="${Y + 7}"/>`).join('');
  const band = Number.isFinite(callBe) && Number.isFinite(putBe)
    ? `<rect class="cp-ruler-band" x="${Math.min(X(putBe), X(callBe)).toFixed(1)}" y="${Y - 12}" width="${Math.abs(X(callBe) - X(putBe)).toFixed(1)}" height="24" rx="6"/>` : '';
  const anchor = (x) => (x < 90 ? 'start' : x > W - 90 ? 'end' : 'middle');
  const mark = (v, cls, label, y) => {
    if (!Number.isFinite(v)) return '';
    const x = X(v);
    return `<line class="cp-ruler-mark ${cls}" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y - 18}" y2="${Y + 18}"/><circle class="cp-ruler-dot ${cls}" cx="${x.toFixed(1)}" cy="${Y}" r="5"/><text class="${cls}" x="${x.toFixed(1)}" y="${y}" text-anchor="${anchor(x)}">${esc(label)} ${fmt.money(v)}</text>`;
  };
  return `<div class="cp-ruler" data-chart-image><svg viewBox="0 0 ${W} 150" role="img" aria-label="خط‌کش قیمت پایه و سربه‌سرهای وزنی"><line class="cp-ruler-axis" x1="${L}" x2="${W - R}" y1="${Y}" y2="${Y}"/>${band}${ticks}${mark(spot, 'spot', 'قیمت پایه', 30)}${mark(putBe, 'put', 'سربه‌سر وزنی پوت', 114)}${mark(callBe, 'call', 'سربه‌سر وزنی کال', 138)}</svg></div>`;
}

/**
 * @param {HTMLElement} host
 * @param {object} deps
 *   getScope()        دامنهٔ حل‌شده `{ level, uaIns, endDate, contractIns }`
 *   rowsAt(level)     قراردادهای همان انتخاب در سطح خواسته
 *   underlyingsAt()   ردیف نمادهای پایهٔ دامنه (برای ارزش خودِ پایه)
 *   getTape()         ریزمعاملهٔ قرارداد انتخابی (فقط در سطح قرارداد)
 *   getSession()      جلسهٔ عکس (برای برچسبِ «سررسیدشده» در روزِ تعطیل)
 *   pickUnderlying / pickExpiry / pickContract / setLevel
 *   isVisible()
 */
export function mountClearPicture(host, deps) {
  let tab = store.get('options-radar:clear-picture-tab', 'overview');
  if (!CP_TABS.some(([id]) => id === tab)) tab = 'overview';
  let side = sideOf(store.get('options-radar:clear-picture-side', 'both'));
  let beMetric = store.get('options-radar:clear-picture-be-metric', 'value');
  if (!BREAKEVEN_WEIGHTS.some(([key]) => key === beMetric)) beMetric = 'value';
  // مبنای پریمیوم: آخرین معامله یا قیمت پایانی (همان مبنای پیش‌فرضِ «نگاه باز»).
  let bePremium = premiumBasis(store.get('options-radar:clear-picture-be-premium', 'last'));

  host.innerHTML = `<div class="cp">
    <header class="cp-head"><div><p class="eyebrow">تصویر شفاف بازار — از کل به جزء</p><h2 data-cp-title>کل بازار</h2></div><nav class="cp-crumbs" data-cp-crumbs aria-label="مسیر دامنه"></nav></header>
    <div class="cp-bar-row">
      <nav class="cp-tabs" role="tablist" aria-label="بخش‌های تصویر شفاف">${CP_TABS.map(([id, label]) => `<button type="button" role="tab" data-cp-tab="${id}" aria-selected="${id === tab}">${label}</button>`).join('')}</nav>
      <div class="cp-side" role="group" aria-label="سمت">${SIDES.map(([key, label]) => `<button type="button" data-cp-side="${key}" aria-pressed="${key === side}">${label}</button>`).join('')}</div>
    </div>
    <section data-cp-panel="overview">
      <section class="card cp-section"><h3 data-cp-kpi-title>عددهای اصلی</h3><div class="cp-tiles" data-chart-image data-cp-kpis></div><p class="note" data-cp-kpi-note></p></section>
      <div class="cp-grid">
        <section class="card cp-section"><h3>کال و پوت در هر سنجه</h3><div class="cp-split" data-chart-image data-cp-sides></div></section>
        <section class="card cp-section"><h3 data-cp-breadth-title>جهت قراردادها نسبت به پایانی دیروز</h3><div data-cp-breadth></div></section>
      </div>
    </section>
    <section data-cp-panel="intraday" hidden>
      <div class="cp-grid">
        <section class="card cp-section"><h3 data-cp-line1-title>درصد قراردادهای مثبت و منفی در طول روز</h3><div data-cp-line1></div></section>
        <section class="card cp-section"><h3 data-cp-line2-title>ارزش تجمعی کال و پوت در طول روز</h3><div data-cp-line2></div></section>
      </div>
    </section>
    <section data-cp-panel="parts" hidden>
      <section class="card cp-section"><div class="section-head"><h3 data-cp-parts-title>سهم هر نماد پایه</h3><span data-cp-parts-note></span></div><div class="cp-parts" data-chart-image data-cp-parts></div></section>
      <section class="card cp-section"><h3 data-cp-table-title>جدول کامل اجزا</h3><div data-cp-table></div></section>
    </section>
    <section data-cp-panel="leaders" hidden>
      <section class="card cp-section"><h3>ترین‌ها در یک نگاه</h3><div class="cp-leaders" data-cp-leaders></div></section>
    </section>
    <section data-cp-panel="breakeven" hidden>
      <section class="card cp-section"><div class="section-head"><h3 data-cp-be-title>سربه‌سر وزنی هر سررسید</h3><div class="cp-selects"><label class="cp-select">مبنای پریمیوم<select data-cp-be-premium>${PREMIUM_BASES.map(([key, label]) => `<option value="${key}" ${key === bePremium ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="cp-select">وزن میانگین<select data-cp-be-metric>${BREAKEVEN_WEIGHTS.map(([key, label]) => `<option value="${key}" ${key === beMetric ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div></div>
        <p class="note">سربه‌سر کال = اعمال + پریمیوم و پوت = اعمال − پریمیوم. پریمیوم «آخرین معامله» یعنی آخرین معاملهٔ امروز و اگر نبود پایانی؛ «قیمت پایانی» همان مبنای پیش‌فرضِ «نگاه باز» است. فاصله از دید همان سمت است: مثبت یعنی پایه هنوز به سربه‌سر نرسیده. سربه‌سر وزنی، میانگینِ سربه‌سرِ قراردادهای همان سررسید با وزنِ انتخابی است — کال و پوت هرگز با هم میانگین نمی‌شوند.</p>
        <div class="cp-tiles" data-chart-image data-cp-be-kpis></div><div data-cp-be-visual></div></section>
      <section class="card cp-section"><h3 data-cp-be-table-title>جدول سربه‌سر</h3><div data-cp-be-table></div></section>
    </section>
    <section data-cp-panel="spread" hidden>
      <div class="cp-grid three">
        <section class="card cp-section"><h3>تمرکز ارزش</h3><div class="cp-tiles one" data-chart-image data-cp-conc></div></section>
        <section class="card cp-section"><h3>ارزش روی فاصله از پول</h3><div class="cp-split" data-chart-image data-cp-money></div></section>
        <section class="card cp-section"><h3>ارزش روی روزِ مانده تا سررسید</h3><div class="cp-split" data-chart-image data-cp-tenor></div></section>
      </div>
    </section>
  </div>`;
  const $ = (name) => host.querySelector(`[data-cp-${name}]`);
  const tables = new Map();
  let series = { key: '', at: 0, points: [], error: '' }, seriesSig = { 1: '', 2: '' };
  let lastPicture = null, lastLadder = [], lastBeExpiries = [];

  // نمونهٔ هر جدول (کلید: نوع و سمت) یک بار ساخته و نگه داشته می‌شود تا
  // مرتب‌سازی و ستون‌های کاربر با هر دریافت پاک نشود.
  function tableIn(slotName, key, cols, { sortKey = 'value', onPick = null } = {}) {
    let entry = tables.get(key);
    if (!entry) {
      const el = document.createElement('div');
      entry = { el, table: makeTable(el, cols.filter((c) => c.base), {
        all: cols, storeKey: `clear-picture:${key}`, exportName: `clear-picture-${key}`, onPick,
      }) };
      entry.table.sortBy(sortKey);
      tables.set(key, entry);
    }
    const slot = $(slotName);
    for (const child of [...slot.children]) if (child !== entry.el) child.remove();
    if (entry.el.parentElement !== slot) slot.appendChild(entry.el);
    return entry.table;
  }

  // یک پله پایین‌تر: نماد → سررسید → قرارداد. قیمت اعمال قرارداد نیست؛
  // کلیک رویش کالِ همان اعمال (اگر سمت پوت انتخاب شده، پوتش) را برمی‌گزیند.
  function drill(part) {
    if (!part) return;
    if (part.level === 'underlying') deps.pickUnderlying?.(part.uaIns);
    else if (part.level === 'expiry') deps.pickExpiry?.(part.uaIns, part.endDate);
    else if (part.level === 'strike') {
      const rows = deps.rowsAt('expiry').filter((row) => Number(row.strike) === Number(part.strike));
      const row = rows.find((r) => r.kind === (side === 'put' ? 'put' : 'call')) || rows[0];
      if (row) deps.pickContract?.(row);
    }
  }
  const pickIns = (ins) => {
    const row = deps.rowsAt('market').find((r) => String(r.ins) === String(ins));
    if (row) deps.pickContract?.(row);
  };

  host.addEventListener('click', (event) => {
    const tabButton = event.target.closest('[data-cp-tab]');
    if (tabButton) {
      tab = tabButton.dataset.cpTab; store.set('options-radar:clear-picture-tab', tab);
      paint().catch((error) => logError('تصویر شفاف', error)); return;
    }
    const sideButton = event.target.closest('[data-cp-side]');
    if (sideButton) {
      side = sideOf(sideButton.dataset.cpSide); store.set('options-radar:clear-picture-side', side);
      seriesSig = { 1: '', 2: '' };
      paint().catch((error) => logError('تصویر شفاف', error)); return;
    }
    const crumb = event.target.closest('[data-cp-level]');
    if (crumb) { deps.setLevel?.(crumb.dataset.cpLevel); return; }
    const part = event.target.closest('[data-cp-part]');
    if (part && lastPicture) { drill(lastPicture.parts.find((p) => p.key === part.dataset.cpPart)); return; }
    const beExpiry = event.target.closest('[data-cp-be-expiry]');
    if (beExpiry) {
      const row = lastBeExpiries.find((r) => r.key === beExpiry.dataset.cpBeExpiry);
      if (row) deps.pickExpiry?.(row.uaIns, row.endDate);
      return;
    }
    const pick = event.target.closest('[data-cp-ins]');
    if (pick) pickIns(pick.dataset.cpIns);
  });
  $('be-premium').addEventListener('change', (event) => {
    bePremium = premiumBasis(event.target.value); store.set('options-radar:clear-picture-be-premium', bePremium);
    paint().catch((error) => logError('تصویر شفاف', error));
  });
  $('be-metric').addEventListener('change', (event) => {
    beMetric = event.target.value; store.set('options-radar:clear-picture-be-metric', beMetric);
    paint().catch((error) => logError('تصویر شفاف', error));
  });

  async function fetchSeries(key) {
    if (series.key === key && Date.now() - series.at < SERIES_TTL_MS) return;
    try {
      const response = await fetch(`/api/live-picture?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || body.error) throw new Error(body.error || `HTTP ${response.status}`);
      // `NaN`ِ سرور پس از JSON `null` است؛ همین‌جا به نامعلوم برمی‌گردد.
      const n = (v) => (v === null || v === undefined ? NaN : Number(v));
      series = { key, at: Date.now(), error: '', points: (body.points || []).map((p) => ({
        second: n(p.second), positivePct: n(p.positivePct), negativePct: n(p.negativePct),
        callPositivePct: n(p.callPositivePct), callNegativePct: n(p.callNegativePct),
        putPositivePct: n(p.putPositivePct), putNegativePct: n(p.putNegativePct),
        callValue: n(p.callValue), putValue: n(p.putValue), value: n(p.value),
      })) };
    } catch (error) {
      series = { key, at: Date.now(), points: [], error: error.message };
      logError('مسیر روز تصویر شفاف', error);
    }
  }

  // نمودار خطی فقط وقتی دوباره کشیده می‌شود که نقطه‌اش عوض شده باشد؛ تیکِ
  // بی‌نقطهٔ تازه چیزی را جابه‌جا نمی‌کند.
  function paintLine(which, sig, draw) {
    if (seriesSig[which] === sig && host.querySelector(`[data-cp-line${which}] svg, [data-cp-line${which}] .empty-note`)) return;
    seriesSig[which] = sig;
    draw($(`line${which}`));
  }

  function paintCrumbs(scope, rows) {
    const any = rows[0] || {};
    const steps = [['market', 'کل بازار']];
    if (scope.level !== 'market') steps.push(['underlying', any.uaName || 'نماد پایه']);
    if (scope.level === 'expiry' || scope.level === 'contract') steps.push(['expiry', `سررسید ${dateLabel(scope.endDate)}`]);
    if (scope.level === 'contract') steps.push(['contract', deps.rowsAt('contract')[0]?.name || 'قرارداد']);
    paintInto($('crumbs'), (into) => {
      into.innerHTML = steps.map(([level, label], i) => (i === steps.length - 1
        ? `<b aria-current="true">${esc(label)}</b>`
        : `<button type="button" class="ghost" data-cp-level="${level}">${esc(label)}</button><span aria-hidden="true">›</span>`)).join('');
    });
    $('title').textContent = steps.at(-1)[1];
  }

  // روزِ تعطیل: قراردادی که در همان جلسهٔ نشان‌داده‌شده سررسید شد، برچسب می‌گیرد.
  const expiredBadge = (row) => {
    const session = deps.getSession?.();
    return session && !session.current && Number(row?.days) <= 0 ? '<i class="cp-badge">سررسیدشده</i>' : '';
  };

  function paintKpis(scope, picture, allTotals) {
    const t = picture.totals;
    if (scope.level === 'contract') {
      const c = deps.rowsAt('contract')[0];
      const standing = contractStanding(c, { siblings: deps.rowsAt('expiry'), family: deps.rowsAt('underlying') });
      const move = c ? pctVsYesterday(Number(c.tradeLast) > 0 ? c.tradeLast : c.last, c.yday) : NaN;
      // سربه‌سرِ کاشی با همان مبنای پریمیومِ زیرتبِ «سربه‌سر».
      const cBe = c ? withPremium([c], bePremium)[0] : null;
      const be = cBe ? contractBreakeven(cBe) : NaN;
      $('kpi-title').textContent = 'عددهای اصلیِ قرارداد';
      paintInto($('kpis'), (into) => {
        into.innerHTML = c ? [
          tile({ label: 'آخرین معامله', value: fmt.money(c.tradeLast), unit: 'ریال', note: Number.isFinite(move) ? `${pctText(move)} نسبت به پایانی دیروز` : 'امروز معامله نشده', tone: toneOf(move) }),
          moneyTile('ارزش معامله', c.value, { note: `${kindLabel(c.kind)}، اعمال ${fmt.money(c.strike)}`, accent: c.kind }),
          tile({ label: 'حجم', value: fmt.int(c.volume), unit: 'قرارداد', note: `${fmt.int(c.trades)} معامله` }),
          moneyTile('میانگین ارزش هر معامله', Number(c.trades) > 0 ? Number(c.value) / Number(c.trades) : NaN),
          tile({ label: 'سهم از ارزش سررسید', value: pctText(standing.expirySharePct), share: standing.expirySharePct, note: Number.isFinite(standing.rank) ? `رتبهٔ ${fmt.int(standing.rank)} از ${fmt.int(standing.rankOf)} قرارداد معامله‌شده` : 'بی معامله امروز' }),
          tile({ label: 'سهم از ارزش نماد پایه', value: pctText(standing.familySharePct), share: standing.familySharePct, note: 'همهٔ سررسیدهای همین پایه' }),
          tile({ label: 'سربه‌سر', value: fmt.money(be), unit: 'ریال', note: Number.isFinite(breakevenGapPct(cBe)) ? `پایه ${pctText(breakevenGapPct(cBe))} (${fmt.money(breakevenGap(cBe))} ریال) تا سربه‌سر، مبنای ${bePremium === 'close' ? 'پایانی' : 'آخرین'}` : 'پریمیوم نامعلوم', accent: c.kind }),
          tile({ label: 'موقعیت باز', value: fmt.int(c.oi), unit: 'قرارداد', note: Number.isFinite(Number(c.oiChange)) ? `تغییر ${fmt.int(c.oiChange)}` : 'تغییر نامعلوم', tone: toneOf(c.oiChange) }),
          tile({ label: 'روز مانده', value: fmt.int(c.days), unit: 'روز', note: `سررسید ${dateLabel(c.endDate)}` }),
        ].join('') : '<p class="empty-note">قرارداد انتخابی در عکس تازه نیست.</p>';
      });
      $('kpi-note').textContent = `بخش‌های دیگر همان سررسیدِ این قرارداد را از کل به جزء نشان می‌دهند${side === 'both' ? '' : ` — فقط ${SIDE_LABEL[side]}`}.`;
      return;
    }
    // ارزشِ خودِ پایه از نوارِ پایه می‌آید؛ بی هیچ عددِ رسیده، نامعلوم است نه صفر.
    const uaKnown = (deps.underlyingsAt() || []).map((row) => Number(row.uaValue)).filter(Number.isFinite);
    const uaValue = uaKnown.length ? uaKnown.reduce((sum, v) => sum + v, 0) : NaN;
    const withUa = scope.level === 'market' || scope.level === 'underlying';
    const shareOfAll = (part, whole) => (whole > 0 && Number.isFinite(part) ? (part / whole) * 100 : NaN);
    $('kpi-title').textContent = `عددهای اصلیِ ${LEVEL_LABEL[scope.level]}${side === 'both' ? '' : ` — ${SIDE_LABEL[side]}`}`;
    const sided = side === 'both' ? [
      moneyTile('ارزش کل معاملات اختیار', t.value, { note: `${fmt.int(t.traded)} از ${fmt.int(t.contracts)} قرارداد معامله شد` }),
      moneyTile('ارزش کال', t.callValue, { note: `سهم ${pctText(t.callValuePct)} از کل`, share: t.callValuePct, accent: 'call' }),
      moneyTile('ارزش پوت', t.putValue, { note: `سهم ${pctText(t.putValuePct)} از کل`, share: t.putValuePct, accent: 'put' }),
      tile({ label: 'نسبت ارزش پوت به کال', value: fmt.num(t.putCallValue), note: t.putCallValue > 1 ? 'پول بیشتری در پوت' : Number.isFinite(t.putCallValue) ? 'پول بیشتری در کال' : '' }),
      tile({ label: 'حجم', value: fmt.int(t.volume), unit: 'قرارداد', note: `کال ${pctText(t.callVolumePct)}، پوت ${pctText(t.putVolumePct)}` }),
    ] : [
      moneyTile(`ارزش ${SIDE_LABEL[side]}`, t.value, { note: `سهم ${pctText(shareOfAll(t.value, allTotals.value))} از ارزش کل`, share: shareOfAll(t.value, allTotals.value), accent: side }),
      tile({ label: `قرارداد ${SIDE_LABEL[side]} معامله‌شده`, value: fmt.int(t.traded), unit: `از ${fmt.int(t.contracts)}`, share: t.tradedPct, note: `${pctText(t.tradedPct)} معامله شد` }),
      tile({ label: `حجم ${SIDE_LABEL[side]}`, value: fmt.int(t.volume), unit: 'قرارداد', share: shareOfAll(t.volume, allTotals.volume), note: `سهم ${pctText(shareOfAll(t.volume, allTotals.volume))} از حجم کل` }),
    ];
    paintInto($('kpis'), (into) => {
      into.innerHTML = [
        ...sided,
        tile({ label: 'تعداد معامله', value: fmt.int(t.trades), note: `میانگین هر معامله ${fmt.rialText(t.avgTradeValue)}` }),
        tile({ label: 'قراردادهای مثبت', value: pctText(t.positivePct), unit: `${fmt.int(t.positive)} قرارداد`, tone: 'gain', share: t.positivePct }),
        tile({ label: 'قراردادهای منفی', value: pctText(t.negativePct), unit: `${fmt.int(t.negative)} قرارداد`, tone: 'loss', share: t.negativePct }),
        tile({ label: 'موقعیت باز', value: fmt.int(t.oi), unit: 'قرارداد', note: Number.isFinite(t.oiChange) ? `تغییر امروز ${fmt.int(t.oiChange)}` : 'تغییر نامعلوم', tone: toneOf(t.oiChange) }),
        ...(withUa ? [moneyTile('ارزش معاملات سهم پایه', uaValue, { note: uaValue > 0 ? `اختیار ${pctText((allTotals.value / uaValue) * 100)} ارزش خودِ پایه` : '' })] : []),
      ].join('');
    });
    const session = deps.getSession?.();
    const gaps = [t.missingValue ? `ارزش ${fmt.int(t.missingValue)} قرارداد از تابلو نرسید و در جمع نیست` : '',
      t.unknown ? `جهت ${fmt.int(t.unknown)} قرارداد معامله‌شده نامعلوم است (پایانی دیروز نرسید)` : '',
      session && !session.current && Number(session.expiring) > 0 ? `ارقام جلسهٔ قبل است و ${fmt.int(session.expiring)} قراردادِ سررسیدشده در همان جلسه هم در جمع هست` : ''].filter(Boolean);
    $('kpi-note').textContent = gaps.length ? `${gaps.join('؛ ')}.` : 'درصد مثبت و منفی فقط از قراردادهای امروز معامله‌شده است؛ بی‌معامله‌ها جدا شمرده می‌شوند.';
  }

  function paintSides(t) {
    const rowsOf = [
      ['ارزش معامله', t.callValue, t.putValue, fmt.rialText],
      ['حجم', t.callVolume, t.putVolume, fmt.int],
      ['تعداد معامله', t.callTrades, t.putTrades, fmt.int],
      ['موقعیت باز', t.callOi, t.putOi, fmt.int],
    ];
    paintInto($('sides'), (into) => {
      into.innerHTML = `<p class="cp-legend"><span class="call">کال</span><span class="put">پوت</span>${side === 'both' ? '' : `<small>سمتِ انتخاب‌نشده کم‌رنگ است؛ سهم ${SIDE_LABEL[side]} از کل</small>`}</p>${rowsOf.map(([label, call, put, f]) => {
        const total = (Number(call) || 0) + (Number(put) || 0);
        const share = (v) => (total > 0 ? `${fmt.pct((v / total) * 100)}٪` : '—');
        return `<article><header><b>${label}</b><span>کل ${f(total)}</span></header>${splitBar(call, put, 0, side)}<footer><span class="call">کال ${share(call)}، ${f(call)}</span><span class="put">پوت ${share(put)}، ${f(put)}</span></footer></article>`;
      }).join('')}`;
    });
  }

  function paintBreadth(t) {
    paintInto($('breadth'), (into) => breadthDonut(into, {
      positive: t.positive, negative: t.negative, flat: t.flat, traded: t.positive + t.negative + t.flat, untraded: t.untraded,
      positivePct: t.positivePct, negativePct: t.negativePct, flatPct: t.flatPct,
    }, { unit: 'قرارداد' }));
  }

  async function paintLines(scope) {
    if (scope.level === 'contract') {
      const tape = (deps.getTape() || []).filter((row) => Number(row.price) > 0);
      $('line1-title').textContent = 'قیمت معاملات قرارداد در طول روز';
      $('line2-title').textContent = 'ارزش تجمعی معاملات قرارداد';
      const sig = `${scope.contractIns}|${tape.length}|${tape.at(-1)?.time || ''}`;
      const empty = (slot) => { slot.innerHTML = '<p class="empty-note">برای این قرارداد امروز ریزمعاملهٔ معتبری نرسیده است.</p>'; };
      paintLine(1, sig, (slot) => (tape.length
        ? liveChart(slot, [{ label: 'قیمت معامله', color: 'var(--series-1)', points: tape.map((row) => ({ second: secondOf(row.time), value: Number(row.price) })) }],
          { valueFmt: fmt.money, unit: 'قیمت (ریال)', note: 'هر نقطه یک معاملهٔ واقعیِ امروز.' })
        : empty(slot)));
      paintLine(2, sig, (slot) => (tape.length
        ? liveChart(slot, [{ label: 'ارزش تجمعی', color: 'var(--series-1)', points: tape.map((row) => ({ second: secondOf(row.time), value: Number(row.cumulativeValue) })) }],
          { valueFmt: fmt.mrial, unit: 'میلیون ریال', zeroFloor: true, note: 'جمعِ ارزش معاملات از نخستین معاملهٔ امروز.' })
        : empty(slot)));
      return;
    }
    $('line1-title').textContent = side === 'both' ? 'درصد قراردادهای مثبت و منفی در طول روز' : `درصد ${SIDE_LABEL[side]}های مثبت و منفی در طول روز`;
    $('line2-title').textContent = side === 'both' ? 'ارزش تجمعی کال و پوت در طول روز' : `ارزش تجمعی ${SIDE_LABEL[side]} در طول روز`;
    const key = sampleKey(scope);
    await fetchSeries(key);
    const points = series.key === key ? series.points : [];
    const first = points[0]?.second;
    const since = Number.isFinite(first) ? `ثبت از ساعت ${clockOf(first)}؛ دقیقه‌ای که سرور روشن نبود خالی می‌ماند.` : '';
    const sig = `${key}|${side}|${points.length}|${points.at(-1)?.second || ''}|${series.error}`;
    const empty = (slot) => {
      slot.innerHTML = `<p class="empty-note">${series.error ? `مسیر روز نرسید: ${esc(series.error)}` : 'هنوز نمونه‌ای از جلسهٔ امروز ثبت نشده است. سرور در ساعت بازار هر دقیقه یک نمونه از تابلو برمی‌دارد.'}</p>`;
    };
    const pos = side === 'both' ? 'positivePct' : `${side}PositivePct`, neg = side === 'both' ? 'negativePct' : `${side}NegativePct`;
    paintLine(1, sig, (slot) => (points.length
      ? liveChart(slot, [
        { label: 'مثبت', color: 'var(--gain)', points: points.map((p) => ({ second: p.second, value: p[pos] })) },
        { label: 'منفی', color: 'var(--loss)', points: points.map((p) => ({ second: p.second, value: p[neg] })) },
      ], { valueFmt: fmt.pct, unit: 'درصد قراردادهای معامله‌شده', note: `${since}${side === 'both' ? '' : ' تفکیکِ سمت از نمونه‌های ۱۴۰۵/۰۷/۱۷ به بعد ثبت می‌شود.'}` })
      : empty(slot)));
    const valueLines = [
      ...(side !== 'put' ? [{ label: 'ارزش کال', color: 'var(--call)', points: points.map((p) => ({ second: p.second, value: p.callValue })) }] : []),
      ...(side !== 'call' ? [{ label: 'ارزش پوت', color: 'var(--put)', points: points.map((p) => ({ second: p.second, value: p.putValue })) }] : []),
    ];
    paintLine(2, sig, (slot) => (points.length
      ? liveChart(slot, valueLines, { valueFmt: fmt.mrial, unit: 'میلیون ریال', zeroFloor: true, note: since })
      : empty(slot)));
  }

  function paintParts(scope, picture) {
    const parts = picture.parts;
    const label = PART_LABEL[picture.partLevel];
    const title = scope.level === 'contract' ? 'قیمت‌های اعمالِ همین سررسید' : `سهم هر ${label} از ارزش ${LEVEL_LABEL[scope.level]}`;
    $('parts-title').textContent = `${title}${side === 'both' ? '' : ` — ${SIDE_LABEL[side]}`}`;
    $('parts-note').textContent = `${fmt.int(parts.length)} ${label}${parts.length > PARTS_SHOWN ? `، ${fmt.int(PARTS_SHOWN)} پرارزش‌تر نمایش داده شد؛ همه در جدول پایین` : ''}`;
    const shown = parts.slice(0, PARTS_SHOWN);
    const max = Math.max(0, ...shown.map((p) => p.value));
    const focusStrike = scope.level === 'contract' ? Number(deps.rowsAt('contract')[0]?.strike) : NaN;
    paintInto($('parts'), (into) => {
      into.innerHTML = shown.length ? `<p class="cp-legend"><span class="call">کال</span><span class="put">پوت</span><small>طول میله نسبت به بزرگ‌ترین جزء</small></p>${shown.map((part) => `<article class="${part.strike === focusStrike ? 'focus' : ''}">
        <header><button type="button" class="link" data-cp-part="${esc(part.key)}">${esc(partName(part))}</button><strong>${fmt.rialText(part.value)}</strong><span>${pctText(part.sharePct)} از کل</span></header>
        ${splitBar(part.callValue, part.putValue, max)}
        <footer>${side === 'both' ? `<span class="call">کال ${pctText(part.callValuePct)}</span><span class="put">پوت ${pctText(part.putValuePct)}</span>` : ''}<span class="gain">مثبت ${pctText(part.positivePct)}</span><span class="loss">منفی ${pctText(part.negativePct)}</span><span>${fmt.int(part.traded)} از ${fmt.int(part.contracts)} قرارداد معامله‌شده</span></footer>
      </article>`).join('')}` : '<p class="empty-note">در این دامنه قراردادی نیست.</p>';
    });
    const partLevel = picture.partLevel;
    const table = tableIn('table', `parts-${partLevel}`, partCols(partLevel), { onPick: (row) => drill(row) });
    $('table-title').textContent = `جدول کامل — هر ${label}`;
    table.setEmptyMessage('در این دامنه قراردادی نیست.');
    table.set(parts.map((part) => ({ ...part, title: partName(part) })));
  }

  function paintLeaders(picture) {
    const metricText = (key, row) => {
      if (key === 'gainers' || key === 'losers') return `${fmt.pct(row.metric)}٪`;
      // واحد در عنوانِ کارت است تا نامِ قرارداد کنار عدد بریده نشود.
      if (key === 'value' || key === 'avgTrade') return fmt.mrial(row.metric);
      return fmt.int(row.metric);
    };
    paintInto($('leaders'), (into) => {
      into.innerHTML = LEADER_LISTS.map(([key, title]) => {
        const list = picture.leaders[key] || [];
        const unit = key === 'value' || key === 'avgTrade' ? ' (میلیون ریال)' : key === 'gainers' || key === 'losers' ? ' (٪ نسبت به پایانی دیروز)' : '';
        return `<article data-chart-image><h4>${title}${unit}</h4>${list.length ? `<ol>${list.map((row) => `<li><button type="button" class="link" data-cp-ins="${esc(row.ins)}">${esc(row.name)}</button><b class="${key === 'gainers' || key === 'oiUp' ? 'gain' : key === 'losers' || key === 'oiDown' ? 'loss' : ''}">${metricText(key, row)}</b><small>${kindLabel(row.kind)}، ${esc(row.uaName || '')}، ${dateLabel(row.endDate)}${expiredBadge(row)}</small></li>`).join('')}</ol>` : '<p class="empty-note">موردی نیست.</p>'}</article>`;
      }).join('');
    });
  }

  // ── سربه‌سر ──────────────────────────────────────────────────────────
  function paintBreakeven(scope) {
    const deep = scope.level === 'expiry' || scope.level === 'contract';
    const rows = deps.rowsAt(deep ? 'expiry' : scope.level);
    const be = breakevenPicture(rows, { metric: beMetric, side, premium: bePremium });
    lastBeExpiries = be.expiries;
    const basisLabel = PREMIUM_BASES.find(([key]) => key === be.premium)?.[1] || '';
    const weightLabel = BREAKEVEN_WEIGHTS.find(([key]) => key === be.metric)?.[1] || '';
    if (!deep) {
      $('be-title').textContent = `سربه‌سر وزنی هر سررسید${side === 'both' ? '' : ` — ${SIDE_LABEL[side]}`}`;
      const ranked = be.expiries.filter((row) => Number.isFinite(row.callGapPct) || Number.isFinite(row.putGapPct));
      // در سطح نماد، ردیفِ «همهٔ سررسیدها» — هم‌ارزِ شاخصِ کلِ «نگاه باز».
      const all = scope.level === 'underlying' ? allExpiriesBreakeven(rows, { metric: beMetric, side, premium: bePremium }) : null;
      const shown = [...(all ? [all] : []), ...ranked.slice(0, PARTS_SHOWN)];
      const max = Math.max(1, ...shown.flatMap((row) => [Math.abs(row.callGapPct) || 0, Math.abs(row.putGapPct) || 0]));
      const gapBar = (value, cls) => (Number.isFinite(value)
        ? `<div class="cp-gap ${cls}"><i style="--w:${(Math.abs(value) / max) * 100}%"></i><b class="${value < 0 ? 'loss' : ''}">${pctText(value)}</b></div>` : `<div class="cp-gap ${cls}"><b>—</b></div>`);
      paintInto($('be-kpis'), (into) => {
        into.innerHTML = [
          tile({ label: 'سررسید با سربه‌سر وزنی', value: fmt.int(ranked.length), unit: `از ${fmt.int(be.expiries.length)}`, note: `وزن: ${weightLabel}، پریمیوم: ${basisLabel}` }),
          ...(all && side !== 'put' ? [tile({ label: 'همهٔ سررسیدها — سربه‌سر وزنی کال', value: fmt.money(all.callBreakeven), unit: 'ریال', note: Number.isFinite(all.callGapPct) ? `پایه ${pctText(all.callGapPct)} تا آن؛ ${fmt.int(all.expiries)} سررسید با هم` : '', accent: 'call' })] : []),
          ...(all && side !== 'call' ? [tile({ label: 'همهٔ سررسیدها — سربه‌سر وزنی پوت', value: fmt.money(all.putBreakeven), unit: 'ریال', note: Number.isFinite(all.putGapPct) ? `پایه ${pctText(all.putGapPct)} تا آن؛ ${fmt.int(all.expiries)} سررسید با هم` : '', accent: 'put' })] : []),
          ...(side !== 'put' ? [tile({ label: 'نزدیک‌ترین سربه‌سر کال', value: pctText(Math.min(...ranked.map((r) => r.callGapPct).filter(Number.isFinite))), note: 'کمترین فاصلهٔ پایه تا سربه‌سر وزنی کال', accent: 'call' })] : []),
          ...(side !== 'call' ? [tile({ label: 'نزدیک‌ترین سربه‌سر پوت', value: pctText(Math.min(...ranked.map((r) => r.putGapPct).filter(Number.isFinite))), note: 'کمترین فاصلهٔ پایه تا سربه‌سر وزنی پوت', accent: 'put' })] : []),
        ].join('');
      });
      paintInto($('be-visual'), (into) => {
        into.innerHTML = shown.length ? `<p class="cp-legend">${side !== 'put' ? '<span class="call">فاصله تا سربه‌سر کال</span>' : ''}${side !== 'call' ? '<span class="put">فاصله تا سربه‌سر پوت</span>' : ''}<small>با کلیک روی هر سررسید، نردبانِ اعمالش باز می‌شود</small></p><div class="cp-be-list" data-chart-image>${shown.map((row) => `<article>
          <header>${row.all ? `<b>${esc(row.uaName)} — همهٔ سررسیدها</b><span>میانگینِ ${fmt.int(row.expiries)} سررسید با هم (مثل شاخص کلِ «نگاه باز»)، پایه ${fmt.money(row.spot)}</span>` : `<button type="button" class="link" data-cp-be-expiry="${esc(row.key)}">${esc(row.uaName)} — ${dateLabel(row.endDate)}</button><span>${fmt.int(row.days)} روز، پایه ${fmt.money(row.spot)}</span>`}${side === 'both' && Number.isFinite(row.bandPct) ? `<strong>باند ${pctText(row.bandPct)}</strong>` : ''}</header>
          ${side !== 'put' ? `<div class="cp-be-row"><small>کال ${fmt.money(row.callBreakeven)}</small>${gapBar(row.callGapPct, 'call')}</div>` : ''}
          ${side !== 'call' ? `<div class="cp-be-row"><small>پوت ${fmt.money(row.putBreakeven)}</small>${gapBar(row.putGapPct, 'put')}</div>` : ''}
        </article>`).join('')}</div>` : '<p class="empty-note">در این دامنه سربه‌سر وزنی معتبری ساخته نشد (پریمیوم یا وزن نیست).</p>';
      });
      const table = tableIn('be-table', `be-expiries-${side}`, beExpiryCols(side), { sortKey: 'weight', onPick: (row) => { if (!row.all) deps.pickExpiry?.(row.uaIns, row.endDate); } });
      $('be-table-title').textContent = all ? 'جدول سربه‌سر وزنی — همهٔ سررسیدها و هر سررسید' : 'جدول سربه‌سر وزنی هر سررسید';
      table.setEmptyMessage('سربه‌سر وزنی معتبری نیست.');
      table.set([...(all ? [{ ...all, title: 'همهٔ سررسیدها (با هم)', days: NaN }] : []), ...be.expiries.map((row) => ({ ...row, title: dateLabel(row.endDate) }))]);
      return;
    }
    // سطح سررسید و قرارداد: خط‌کش و نردبانِ اعمال.
    const expiry = be.expiries[0] || null;
    const ladder = breakevenLadder(withPremium(rows, bePremium), expiry);
    lastLadder = ladder;
    const contract = scope.level === 'contract' ? deps.rowsAt('contract')[0] : null;
    const pricedContract = contract ? withPremium([contract], bePremium)[0] : null;
    $('be-title').textContent = `سربه‌سر سررسید ${dateLabel(scope.endDate)}${side === 'both' ? '' : ` — ${SIDE_LABEL[side]}`}`;
    const wBe = contract ? (contract.kind === 'put' ? expiry?.putBreakeven : expiry?.callBreakeven) : NaN;
    paintInto($('be-kpis'), (into) => {
      into.innerHTML = expiry ? [
        tile({ label: 'قیمت جاری پایه', value: fmt.money(expiry.spot), unit: 'ریال', note: `${fmt.int(expiry.days)} روز تا سررسید` }),
        ...(side !== 'put' ? [tile({ label: 'سربه‌سر وزنی کال', value: fmt.money(expiry.callBreakeven), unit: 'ریال', note: Number.isFinite(expiry.callGapPct) ? `پایه ${pctText(expiry.callGapPct)} تا آن (${fmt.money(expiry.callBreakeven - expiry.spot)} ریال)` : '', accent: 'call' })] : []),
        ...(side !== 'call' ? [tile({ label: 'سربه‌سر وزنی پوت', value: fmt.money(expiry.putBreakeven), unit: 'ریال', note: Number.isFinite(expiry.putGapPct) ? `پایه ${pctText(expiry.putGapPct)} تا آن (${fmt.money(expiry.spot - expiry.putBreakeven)} ریال)` : '', accent: 'put' })] : []),
        ...(side === 'both' ? [tile({ label: 'باند سربه‌سر', value: fmt.money(expiry.band), unit: 'ریال', note: Number.isFinite(expiry.bandPct) ? `${pctText(expiry.bandPct)} قیمت جاری، از پوت تا کال` : 'هر دو سمت لازم است' })] : []),
        ...(pricedContract ? [tile({ label: `سربه‌سر ${pricedContract.name}`, value: fmt.money(contractBreakeven(pricedContract)), unit: 'ریال', accent: pricedContract.kind,
          note: Number.isFinite(breakevenGapPct(pricedContract)) ? `پایه ${pctText(breakevenGapPct(pricedContract))} تا آن؛ ${Number.isFinite(wBe) ? `${pctText(((contractBreakeven(pricedContract) / wBe) - 1) * 100)} نسبت به سربه‌سر وزنی همین سمت` : ''}` : 'پریمیوم نامعلوم' })] : []),
        tile({ label: 'وزن میانگین', value: weightLabel, note: `پریمیوم: ${basisLabel}؛ ${fmt.int(expiry.callCount)} کال و ${fmt.int(expiry.putCount)} پوت در میانگین` }),
      ].join('') : '<p class="empty-note">سربه‌سر وزنی برای این سررسید ساخته نشد.</p>';
    });
    paintInto($('be-visual'), (into) => {
      into.innerHTML = expiry ? priceRuler({
        spot: expiry.spot, callBe: side !== 'put' ? expiry.callBreakeven : NaN, putBe: side !== 'call' ? expiry.putBreakeven : NaN,
        strikes: ladder.map((row) => row.strike),
      }) : '';
    });
    const table = tableIn('be-table', `be-ladder-${side}`, ladderCols(side), {
      sortKey: 'strike',
      onPick: (row) => { const ins = side === 'put' ? row.putIns : row.callIns || row.putIns; if (ins) pickIns(ins); },
    });
    $('be-table-title').textContent = 'نردبان اعمال: سربه‌سر هر قرارداد و فاصلهٔ سربه‌سر وزنی از هر اعمال';
    table.setEmptyMessage('اعمالی در این سررسید نیست.');
    table.set(ladder);
  }

  function paintConcentration(picture) {
    const c = picture.concentration;
    paintInto($('conc'), (into) => {
      into.innerHTML = [
        tile({ label: 'سهم پرارزش‌ترین قرارداد', value: pctText(c.top1Pct), share: c.top1Pct }),
        tile({ label: 'سهم پنج قرارداد اول', value: pctText(c.top5Pct), share: c.top5Pct }),
        tile({ label: '۸۰٪ ارزش در', value: Number.isFinite(c.n80) ? fmt.int(c.n80) : '—', unit: 'قرارداد', note: Number.isFinite(c.n80Pct) ? `${pctText(c.n80Pct)} از ${fmt.int(c.tradedCount)} قرارداد معامله‌شده` : '' }),
      ].join('');
    });
    const buckets = (slot, data, unknownNote) => paintInto(slot, (into) => {
      const max = Math.max(0, ...data.buckets.map((b) => b.value));
      into.innerHTML = `${data.buckets.map((b) => `<article><header><b>${esc(b.label)}</b><span>${fmt.rialText(b.value)}، ${pctText(b.sharePct)}</span></header>${splitBar(b.callValue, b.putValue, max)}</article>`).join('')}${data.unknown ? `<p class="note">${fmt.int(data.unknown)} قرارداد ${unknownNote}</p>` : ''}`;
    });
    buckets($('money'), picture.moneyness, 'بی قیمت پایه یا اعمال، بیرون از سطل‌ها ماند.');
    buckets($('tenor'), picture.tenor, 'بی روزِ مانده، بیرون از سطل‌ها ماند.');
  }

  async function paint() {
    if (deps.isVisible && !deps.isVisible()) return;
    host.querySelectorAll('[data-cp-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.cpTab === tab)));
    host.querySelectorAll('[data-cp-side]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cpSide === side)));
    host.querySelectorAll('[data-cp-panel]').forEach((panel) => { panel.hidden = panel.dataset.cpPanel !== tab; });
    const scope = deps.getScope();
    // در سطح قرارداد، «اجزا» همان سررسیدِ قرارداد است.
    const pictureLevel = scope.level === 'contract' ? 'expiry' : scope.level;
    const all = deps.rowsAt(pictureLevel);
    const rows = bySide(all, side);
    const picture = clearPicture(rows, { level: scope.level === 'contract' ? 'contract' : pictureLevel });
    lastPicture = picture;
    paintCrumbs(scope, all);
    if (tab === 'overview') {
      paintKpis(scope, picture, pictureTotals(all));
      paintSides(scope.level === 'contract' ? clearPicture(deps.rowsAt('contract')).totals : pictureTotals(all));
      paintBreadth(picture.totals);
      $('breadth-title').textContent = scope.level === 'contract' ? 'جهت قراردادهای همین سررسید' : `جهت ${side === 'both' ? 'قراردادها' : `${SIDE_LABEL[side]}ها`} نسبت به پایانی دیروز`;
    } else if (tab === 'intraday') await paintLines(scope);
    else if (tab === 'parts') paintParts(scope, picture);
    else if (tab === 'leaders') paintLeaders(picture);
    else if (tab === 'breakeven') paintBreakeven(scope);
    else paintConcentration(picture);
  }

  return { paint, dispose() { tables.clear(); } };
}
