import { buildChain, legContractSize } from '/core/chain.mjs';
import { flattenActiveContracts, historyDateLabel, normalizeHistoryDate } from '/core/history.mjs';
import { analyzeDailyOpenView, analyzeIntradayOpenView, liveTradeBatch, relationMatrix } from '/core/open-view.mjs';
import { liveDayOf } from '/core/live-day.mjs';
import { downloadOpenViewExcel } from '/ui/open-view-export.mjs';
import { fmt, faDigits, signTone, toEnDigits } from '/ui/fmt.mjs';
import { baseAfterRange, loadRange, mountHistoryRange } from '/ui/history-range.mjs';
import { applyLiveScope, scopeOptionsMarkup, SCOPE_LIVE } from '/ui/live-scope.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const nameOf = (entity, fallback = 'بدون نام') => {
  const name = String(entity?.name || '').trim();
  return name && name !== String(entity?.ins || '') ? name : fallback;
};
const dateLabel = (value) => faDigits(historyDateLabel(value));
const clock = (second) => {
  const h = Math.floor(Number(second) / 3600), m = Math.floor((Number(second) % 3600) / 60);
  return faDigits(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
};
const chunks = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
const errorText = (error, fallback = 'خطای نامعلوم') => /fetch failed|network|failed to fetch/i.test(String(error?.message || error))
  ? 'اتصال به منبع داده برقرار نشد.' : (String(error?.message || '').trim() || fallback);

// دو تصمیم رنگی، هر دو از یک قاعده: رنگ، هویت را می‌گوید نه ردیف را.
//
//   کال و پوت    یک جفت ثابت‌اند و رنگ معنایی می‌گیرند (`--call`/`--put`).
//                پیش از این «سربه‌سر کال» سبز بود و «IV کال» بنفش — یک
//                موجودیت، دو رنگ، در دو نمودارِ کنار هم.
//   میانگین ۵روزه  همان سری است، هموارشده — نه موجودیتی تازه. پس هم‌فامِ
//                خودش می‌ماند و با خط‌چین از آن جدا می‌شود. با رنگ چهارم،
//                نمودار IV چهار رنگ داشت برای دو چیز، و دوتاشان شبیه هم.
const SERIES_PRICE = [
  { key: 'basePrice', label: 'قیمت پایه', color: 'var(--series-3)' },
  { key: 'callBreakeven', label: 'سربه‌سر وزنی کال', color: 'var(--call)' },
  { key: 'putBreakeven', label: 'سربه‌سر وزنی پوت', color: 'var(--put)' },
];
const SERIES_GAP = [
  { key: 'callBreakevenGapPct', label: 'فاصله تا کال', color: 'var(--call)', kind: 'bar' },
  { key: 'callBreakevenGapPctMa5', label: 'میانگین ۵روزه فاصله کال', color: 'var(--call)', dashed: true, toggleable: true },
  { key: 'putBreakevenGapPct', label: 'فاصله از پوت', color: 'var(--put)', kind: 'bar' },
  { key: 'putBreakevenGapPctMa5', label: 'میانگین ۵روزه فاصله پوت', color: 'var(--put)', dashed: true, toggleable: true },
];
const SERIES_GAP_INTRADAY = [SERIES_GAP[0], SERIES_GAP[2]];
// شاخص اعمال وزنی و پریمیوم وزنی، هر دو را موتور از روز اول می‌ساخت
// (`callStrike`/`putStrike`/`callPremium`/`putPremium` در `aggregate`) ولی
// وقتی این تب روزمحور شد، نمودارشان جا ماند و هیچ‌جای رابط نمی‌آمدند.
//
// چرا هر دو لازم‌اند: سربه‌سر = اعمال + پریمیوم. وقتی سربه‌سر جابه‌جا
// می‌شود، این دو می‌گویند کدام نیمه‌اش تکان خورده — تمرکز معاملات روی
// اعمال دورتر، یا گران‌تر شدن پریمیومِ همان اعمال‌ها.
const SERIES_STRIKE = [
  { key: 'basePrice', label: 'قیمت پایه', color: 'var(--series-3)' },
  { key: 'callStrike', label: 'اعمال وزنی کال', color: 'var(--call)' },
  { key: 'putStrike', label: 'اعمال وزنی پوت', color: 'var(--put)' },
];
const SERIES_STRIKE_GAP = [
  { key: 'callStrikeGapPct', label: 'فاصله اعمال کال از پایه', color: 'var(--call)', kind: 'bar' },
  { key: 'callStrikeGapPctMa5', label: 'میانگین ۵روزه اعمال کال', color: 'var(--call)', dashed: true, toggleable: true },
  { key: 'putStrikeGapPct', label: 'فاصله اعمال پوت از پایه', color: 'var(--put)', kind: 'bar' },
  { key: 'putStrikeGapPctMa5', label: 'میانگین ۵روزه اعمال پوت', color: 'var(--put)', dashed: true, toggleable: true },
];
const SERIES_STRIKE_INTRADAY = [SERIES_STRIKE[0], SERIES_STRIKE[1], SERIES_STRIKE[2]];
const SERIES_PREMIUM = [
  { key: 'callPremiumPct', label: 'پریمیوم وزنی کال ٪ پایه', color: 'var(--call)' },
  { key: 'callPremiumPctMa5', label: 'میانگین ۵روزه پریمیوم کال', color: 'var(--call)', dashed: true, toggleable: true },
  { key: 'putPremiumPct', label: 'پریمیوم وزنی پوت ٪ پایه', color: 'var(--put)' },
  { key: 'putPremiumPctMa5', label: 'میانگین ۵روزه پریمیوم پوت', color: 'var(--put)', dashed: true, toggleable: true },
];
const SERIES_PREMIUM_INTRADAY = [SERIES_PREMIUM[0], SERIES_PREMIUM[2]];
const SERIES_IV = [
  { key: 'callIvPct', label: 'IV وزنی کال', color: 'var(--call)' },
  { key: 'callIvPctMa5', label: 'میانگین ۵روزه IV کال', color: 'var(--call)', dashed: true, toggleable: true },
  { key: 'putIvPct', label: 'IV وزنی پوت', color: 'var(--put)' },
  { key: 'putIvPctMa5', label: 'میانگین ۵روزه IV پوت', color: 'var(--put)', dashed: true, toggleable: true },
];
const SERIES_IV_INTRADAY = [SERIES_IV[0], SERIES_IV[2]];

function chart(host, sourceRows, series, {
  percent = false, intraday = false, yLabel = '', extra = null, hiddenSeries = new Set(), onToggle = null,
} = {}) {
  const visible = series.filter((item) => !hiddenSeries.has(item.key));
  const rows = sourceRows.filter((row) => visible.some((item) => Number.isFinite(row[item.key])));
  if (!rows.length) { host.innerHTML = '<p class="empty-note">هنوز مشاهده معتبر برای رسم نمودار نرسیده است.</p>'; return; }
  const bars = visible.filter((item) => item.kind === 'bar'), lines = visible.filter((item) => item.kind !== 'bar');
  const values = rows.flatMap((row) => visible.map((item) => row[item.key]).filter(Number.isFinite));
  let low = Math.min(...values), high = Math.max(...values);
  if (bars.length) { low = Math.min(low, 0); high = Math.max(high, 0); }
  if (!(high > low)) { low -= 1; high += 1; }
  const padding = (high - low) * 0.08; low -= padding; high += padding;
  const W = 920, H = 330, L = 96, R = 26, T = 25, B = 62;
  const plotWidth = W - L - R;
  const x = (index) => bars.length || rows.length === 1
    ? L + ((index + 0.5) / rows.length) * plotWidth
    : L + (index / (rows.length - 1)) * plotWidth;
  const y = (value) => T + ((high - value) / (high - low)) * (H - T - B);
  const ticks = Array.from({ length: 5 }, (_, index) => low + ((high - low) * index) / 4);
  const axis = (value) => percent ? `${fmt.pct(value)}٪` : fmt.money(value);
  const label = (row) => intraday ? `${dateLabel(row.date)} · ${clock(row.second)}` : dateLabel(row.date);
  const groupWidth = bars.length ? Math.min(36, (plotWidth / rows.length) * 0.72) : 0;
  const barWidth = bars.length ? groupWidth / bars.length : 0;
  const columns = bars.map((item, barIndex) => rows.map((row, index) => {
    const value = row[item.key];
    if (!Number.isFinite(value)) return '';
    const top = Math.min(y(value), y(0)), height = Math.max(1, Math.abs(y(value) - y(0)));
    const left = x(index) - (groupWidth / 2) + (barIndex * barWidth);
    return `<rect class="open-view-chart-bar" x="${left.toFixed(1)}" y="${top.toFixed(1)}" width="${Math.max(1, barWidth - 1).toFixed(1)}" height="${height.toFixed(1)}" fill="${item.color}"/>`;
  }).join('')).join('');
  const paths = lines.map((item) => {
    let d = '', drawing = false;
    rows.forEach((row, index) => {
      const value = row[item.key];
      if (!Number.isFinite(value)) { drawing = false; return; }
      d += `${drawing ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)} `;
      drawing = true;
    });
    return `<path fill="none" stroke="${item.color}"${item.dashed ? ' stroke-dasharray="7 5"' : ''} d="${d.trim()}"/>`;
  }).join('');
  // اولین سطل یک مسیر خطی نمی‌سازد، اما خودش داده معتبر است. نقطهٔ مستقل
  // باعث می‌شود نمودار از اولین معامله واقعاً دیده شود، نه از سطل دوم.
  const pointMarks = rows.length === 1 ? lines.map((item) => Number.isFinite(rows[0][item.key])
    ? `<circle class="open-view-single-point" cx="${x(0)}" cy="${y(rows[0][item.key])}" r="5" fill="${item.color}"/>`
    : '').join('') : '';
  const xIndexes = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
  const legend = series.map((item) => {
    const off = hiddenSeries.has(item.key);
    const content = `<i></i>${item.label}${item.toggleable ? `<small>${off ? 'نمایش' : 'حذف'}</small>` : ''}`;
    // نشان راهنما هم باید خط‌چین را بگوید، وگرنه دو سریِ هم‌فام در راهنما
    // یک‌شکل‌اند و تفکیکشان فقط روی خودِ نمودار دیده می‌شود.
    const cls = [off ? 'is-off' : '', item.dashed ? 'is-dashed' : ''].filter(Boolean).join(' ');
    return item.toggleable
      ? `<button type="button" data-series-toggle="${item.key}" aria-pressed="${!off}" class="${cls}" style="--series:${item.color}">${content}</button>`
      : `<span class="${cls}" style="--series:${item.color}">${content}</span>`;
  }).join('');
  host.innerHTML = `<div class="open-view-chart-legend">${legend}</div><div class="open-view-chart-stage"><svg viewBox="0 0 ${W} ${H}" tabindex="0" aria-label="نمودار روند نگاه باز">
    ${ticks.map((value) => `<line x1="${L}" x2="${W - R}" y1="${y(value)}" y2="${y(value)}" class="portfolio-grid"/><text x="${L - 9}" y="${y(value) + 4}" text-anchor="end">${axis(value)}</text>`).join('')}
    ${xIndexes.map((index) => `<text x="${x(index)}" y="${H - 24}" text-anchor="middle">${label(rows[index])}</text>`).join('')}
    <text class="axis-title" transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>
    ${columns}${paths}${pointMarks}<g class="portfolio-cursor" hidden><line y1="${T}" y2="${H - B}"/><g></g></g><rect class="portfolio-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
  </svg><div class="backtest-tip" hidden></div></div>`;
  const svg = host.querySelector('svg'), cursor = host.querySelector('.portfolio-cursor'), tip = host.querySelector('.backtest-tip');
  svg.addEventListener('pointermove', (event) => {
    const box = svg.getBoundingClientRect(), localX = ((event.clientX - box.left) / box.width) * W;
    const index = Math.max(0, Math.min(rows.length - 1, Math.round(((localX - L) / (W - L - R)) * (rows.length - 1))));
    const row = rows[index], px = x(index);
    cursor.hidden = false;
    cursor.querySelector('line').setAttribute('x1', px); cursor.querySelector('line').setAttribute('x2', px);
    cursor.querySelector('g').innerHTML = lines.map((item) => Number.isFinite(row[item.key]) ? `<circle cx="${px}" cy="${y(row[item.key])}" r="4" fill="${item.color}"/>` : '').join('');
    tip.hidden = false;
    tip.innerHTML = `<b>${label(row)}</b>${visible.map((item) => `<span>${item.label}: <strong>${Number.isFinite(row[item.key]) ? axis(row[item.key]) : '—'}</strong></span>`).join('')}${extra ? extra(row) : ''}`;
    tip.style.insetInlineStart = `${Math.min(74, Math.max(2, ((px / W) * 100) - 8))}%`; tip.style.top = '8px';
  });
  svg.addEventListener('pointerleave', () => { cursor.hidden = true; tip.hidden = true; });
  host.querySelectorAll('[data-series-toggle]').forEach((button) => button.addEventListener('click', () => onToggle?.(button.dataset.seriesToggle)));
}

function dailyTable(rows, selectedDate) {
  if (!rows.length) return '<p class="empty-note">مشاهده معتبری در این بازه نیست.</p>';
  return `<table class="history-table open-view-daily-table"><thead><tr><th>تاریخ</th><th>پایه / تغییر</th><th>سربه‌سر کال / فاصله</th><th>میانگین ۵روزه فاصله کال</th><th>سربه‌سر پوت / فاصله</th><th>میانگین ۵روزه فاصله پوت</th><th>اعمال وزنی کال / فاصله</th><th>اعمال وزنی پوت / فاصله</th><th>پریمیوم وزنی کال / پوت ٪</th><th>IV کال / میانگین ۵روزه</th><th>IV پوت / میانگین ۵روزه</th><th>ارزش کال / پوت</th><th>قرارداد معتبر</th><th>جزئیات</th></tr></thead><tbody>${[...rows].reverse().map((r) => `<tr data-day="${r.date}" tabindex="0" role="button" aria-selected="${r.date === selectedDate}" class="${r.date === selectedDate ? 'picked' : ''}"><td><b>${dateLabel(r.date)}</b></td><td>${fmt.money(r.basePrice)}<small class="${signTone(r.baseChangePct)}">${fmt.pct(r.baseChangePct)}٪</small></td><td>${fmt.money(r.callBreakeven)}<small>${fmt.pct(r.callBreakevenGapPct)}٪</small></td><td>${fmt.pct(r.callBreakevenGapPctMa5)}٪</td><td>${fmt.money(r.putBreakeven)}<small>${fmt.pct(r.putBreakevenGapPct)}٪</small></td><td>${fmt.pct(r.putBreakevenGapPctMa5)}٪</td><td>${fmt.money(r.callStrike)}<small>${fmt.pct(r.callStrikeGapPct)}٪</small></td><td>${fmt.money(r.putStrike)}<small>${fmt.pct(r.putStrikeGapPct)}٪</small></td><td>${fmt.pct(r.callPremiumPct)}٪<small>${fmt.pct(r.putPremiumPct)}٪</small></td><td>${fmt.pct(r.callIvPct)}٪<small>${fmt.pct(r.callIvPctMa5)}٪</small></td><td>${fmt.pct(r.putIvPct)}٪<small>${fmt.pct(r.putIvPctMa5)}٪</small></td><td>${fmt.money(r.callValue)}<small>${fmt.money(r.putValue)}</small></td><td>${fmt.int(r.callContracts)} کال / ${fmt.int(r.putContracts)} پوت</td><td><span class="open-view-row-action">بازکردن محاسبه</span></td></tr>`).join('')}</tbody></table>`;
}

function weightedFormula(items, kind, metric) {
  const valid = items.filter((item) => item.kind === kind && item.included && Number.isFinite(metric === 'iv' ? item.iv : item.breakeven));
  const total = valid.reduce((sum, item) => sum + item.value, 0);
  const value = total > 0 ? valid.reduce((sum, item) => sum + (metric === 'iv' ? item.iv * 100 : item.breakeven) * item.value, 0) / total : NaN;
  return { count: valid.length, total, value };
}

function scopedWeights(items) {
  const out = items.map((item) => ({ ...item }));
  for (const kind of ['call', 'put']) {
    const side = out.filter((item) => item.kind === kind);
    const indexTotal = side.reduce((sum, item) => sum + (item.included ? item.value : 0), 0);
    const ivTotal = side.reduce((sum, item) => sum + (item.included && Number.isFinite(item.iv) ? item.value : 0), 0);
    for (const item of side) {
      item.indexWeightPct = item.included && indexTotal > 0 ? (item.value / indexTotal) * 100 : NaN;
      item.ivWeightPct = item.included && Number.isFinite(item.iv) && ivTotal > 0 ? (item.value / ivTotal) * 100 : NaN;
    }
  }
  return out;
}

function contractTable(items) {
  if (!items.length) return '<p class="empty-note">برای این روز قرارداد تاریخی موجود نیست.</p>';
  const sorted = [...items].sort((a, b) => a.kind.localeCompare(b.kind) || (b.indexWeightPct || 0) - (a.indexWeightPct || 0));
  return `<table class="history-table open-view-contract-table"><thead><tr><th>قرارداد</th><th>نوع</th><th>سررسید</th><th>اعمال</th><th>پریمیوم</th><th>سربه‌سر</th><th>ارزش معامله</th><th>وزن شاخص</th><th>IV</th><th>وزن IV</th><th>حجم / معامله</th><th>وضعیت</th></tr></thead><tbody>${sorted.map((item) => {
    const tone = item.kind === 'call' ? 'call' : 'put';
    const status = item.included ? (Number.isFinite(item.iv) ? 'وارد هر دو شاخص' : 'فقط شاخص سربه‌سر؛ IV نامعتبر') : item.premium > 0 ? 'ارزش رسمی ندارد' : 'قیمت ندارد';
    return `<tr class="open-view-contract-${tone}"><td><b>${esc(nameOf(item, 'قرارداد اختیار'))}</b></td><td>${item.kind === 'call' ? 'کال' : 'پوت'}</td><td>${dateLabel(item.expiry)}</td><td>${fmt.money(item.strike)}</td><td>${fmt.money(item.premium)}</td><td>${fmt.money(item.breakeven)}</td><td>${fmt.money(item.value)}</td><td class="open-view-weight-cell" style="--weight:${Number.isFinite(item.indexWeightPct) ? Math.min(100, item.indexWeightPct) : 0}%">${fmt.pct(item.indexWeightPct)}٪</td><td>${Number.isFinite(item.iv) ? `${fmt.pct(item.iv * 100)}٪` : '—'}</td><td class="open-view-weight-cell open-view-iv-weight" style="--weight:${Number.isFinite(item.ivWeightPct) ? Math.min(100, item.ivWeightPct) : 0}%">${fmt.pct(item.ivWeightPct)}٪</td><td>${fmt.int(item.volume)} / ${fmt.int(item.trades)}</td><td>${status}</td></tr>`;
  }).join('')}</tbody></table>`;
}

export async function mount(root, { state }) {
  const initialModel = {
    rFreePct: (Number.isFinite(state.settings.rFree) ? state.settings.rFree : 0.30) * 100,
    divYieldPct: (Number.isFinite(state.settings.divYield) ? state.settings.divYield : 0) * 100,
    yearDays: Number.isFinite(state.settings.dayCountYear) ? state.settings.dayCountYear : 365,
    ivLoPct: (Number.isFinite(state.settings.ivLo) ? state.settings.ivLo : 0.01) * 100,
    ivHiPct: (Number.isFinite(state.settings.ivHi) ? state.settings.ivHi : 5) * 100,
  };
  root.innerHTML = `<section class="open-view-hero"><div><p class="eyebrow">نقشه انتظارات بازار اختیار</p><h1>نگاه باز</h1><p>سربه‌سر و نوسان ضمنی همه کال‌ها و پوت‌های یک نماد، جدا برای هر سررسید و با وزن ارزش معامله.</p></div><span>چندروزه ← درون‌روزی ← لحظه‌ای</span></section>
  <section class="card open-view-controls"><div class="section-head"><div><p class="eyebrow">مرحله اول</p><h2>نماد و دامنه تحلیل روزانه</h2></div><b id="ov-status" role="status" aria-live="polite">در حال دریافت نمادها…</b></div>
    <div id="ov-range" class="step-first" data-step="۱"></div>
    <div class="open-view-form"><label class="step-next" data-step="۲">نماد پایه<select id="ov-base" disabled><option value="">اول بازه را انتخاب کن</option></select></label><label>دامنه داده<select id="ov-scope">${scopeOptionsMarkup()}</select></label><label>مبنای روزانه<select id="ov-basis"><option value="CLOSE">قیمت پایانی</option><option value="LAST">آخرین معامله</option><option value="FIRST">اولین معامله</option></select></label><label>از تاریخ<select id="ov-from" disabled></select></label><label>تا تاریخ<select id="ov-to" disabled></select></label><label>سررسید انتخابی<select id="ov-expiry" disabled><option value="">پس از دریافت انتخاب می‌شود</option></select></label><button type="button" class="primary" id="ov-load">ساخت نگاه چندروزه</button><button type="button" class="ghost" id="ov-excel" disabled>خروجی جامع Excel</button></div>
    <p id="ov-live-note" class="note">حالت بسته فقط روزهای نهایی را می‌سازد؛ حالت «تا همین لحظه» ردیف امروز را فقط در جلسه معتبر بازار اضافه می‌کند.</p>
    <div class="open-view-model-settings"><div><p class="eyebrow">فرض‌های مدل بلک–شولز</p><h3>پارامترهای محاسبه نوسان ضمنی</h3><small id="ov-iv-current">—</small></div><div class="open-view-model-grid"><label>نرخ بدون ریسک سالانه ٪<input id="ov-rfree" type="number" min="0" max="200" step="0.1" value="${initialModel.rFreePct}"></label><label>بازده نقدی سالانه ٪<input id="ov-divyield" type="number" min="0" max="100" step="0.1" value="${initialModel.divYieldPct}"></label><label>روزهای سال<input id="ov-year-days" type="number" min="1" max="1000" step="1" value="${initialModel.yearDays}"></label><label>کمینه IV ٪<input id="ov-iv-lo" type="number" min="0.01" max="999" step="0.1" value="${initialModel.ivLoPct}"></label><label>بیشینه IV ٪<input id="ov-iv-hi" type="number" min="0.02" max="1000" step="1" value="${initialModel.ivHiPct}"></label></div><button type="button" class="ghost" id="ov-apply-iv">اعمال پارامترها</button></div>
    <p class="portfolio-note">برای دیدن فرمول، وزن هر قرارداد و نمودار ریز همان روز، روی ردیف روز کلیک کن. قیمت یا ارزش گمشده با مشاهده قبلی پر نمی‌شود.</p>
  </section>
  <section id="ov-report" hidden>
    <div class="open-view-chart-grid"><section class="card"><div class="section-head"><h2>روند روزانه سربه‌سر و پایه</h2><span id="ov-daily-scope">سررسید انتخابی</span></div><div id="ov-daily-price" class="open-view-chart"></div></section><section class="card"><div class="section-head"><h2>فاصله پایه از دو شاخص</h2><span>ستونی؛ میانگین‌ها از راهنما خاموش می‌شوند</span></div><div id="ov-daily-gap" class="open-view-chart"></div></section><section class="card"><div class="section-head"><h2>شاخص اعمال وزنی و پایه</h2><span>وزن ارزش معامله هر قرارداد</span></div><div id="ov-daily-strike" class="open-view-chart"></div></section><section class="card"><div class="section-head"><h2>فاصله اعمال وزنی از پایه</h2><span>ستونی؛ میانگین‌ها از راهنما خاموش می‌شوند</span></div><div id="ov-daily-strike-gap" class="open-view-chart"></div></section><section class="card open-view-wide-card"><div class="section-head"><h2>نوسان ضمنی وزنی کال و پوت</h2><span>میانگین‌ها از راهنمای نمودار خاموش می‌شوند</span></div><div id="ov-daily-iv" class="open-view-chart"></div></section><section class="card open-view-wide-card"><div class="section-head"><h2>پریمیوم وزنی کال و پوت</h2><span>درصدی از قیمت پایه، تا روزهای با پایه متفاوت قابل مقایسه بمانند</span></div><div id="ov-daily-premium" class="open-view-chart"></div></section></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">تنها جدول نمای اصلی</p><h2>خلاصه روزانه</h2></div><span>برای بازکردن محاسبه روی روز کلیک کن</span></div><div id="ov-daily-table" class="history-table-wrap"></div></section>
    <section id="ov-day-detail" class="card open-view-day-detail" hidden>
      <div class="section-head"><div><p class="eyebrow">جزئیات روز انتخاب‌شده</p><h2 id="ov-day-title">—</h2></div><span id="ov-day-base">—</span></div>
      <div id="ov-day-formulas" class="open-view-formula-grid"></div>
      <div class="section-head open-view-contract-head"><div><h3>قراردادها و سهم هرکدام در شاخص</h3><p>رنگ هر خانه متناسب با وزن همان قرارداد در سمت کال یا پوت است.</p></div><span id="ov-day-contract-count">—</span></div>
      <div id="ov-day-contracts" class="history-table-wrap"></div>
      <div class="open-view-intraday-controls"><div><p class="eyebrow">درون‌روزی و لحظه‌ای</p><h3>ساخت نمودار از ریزمعامله واقعی</h3></div><label>منبع زمان<select id="ov-day-source"><option value="live" selected>امروز؛ از اولین معامله تا اکنون</option><option value="history">روز تاریخی انتخاب‌شده</option></select></label><label>بازه زمانی<select id="ov-day-interval"><option value="5">۵ دقیقه</option><option value="15" selected>۱۵ دقیقه</option><option value="30">۳۰ دقیقه</option><option value="60">۶۰ دقیقه</option></select></label><button type="button" class="primary" id="ov-day-intraday">به‌روزرسانی لحظه‌ای</button><b id="ov-day-status" role="status" aria-live="polite">پس از دریافت تاریخچه، نوار امروز خودکار ساخته می‌شود.</b></div>
      <div class="open-view-chart-grid"><section><div class="section-head"><h3>پایه و سربه‌سر در طول روز</h3><span id="ov-day-timeframe">—</span></div><div id="ov-day-price" class="open-view-chart"><p class="empty-note">تایم‌فریم را انتخاب و محاسبه را اجرا کن.</p></div></section><section><div class="section-head"><h3>فاصله درصدی از دو شاخص</h3><span>همان سطل زمانی</span></div><div id="ov-day-gap" class="open-view-chart"><p class="empty-note">هنوز محاسبه نشده است.</p></div></section><section><div class="section-head"><h3>شاخص اعمال وزنی در طول روز</h3><span>همان سطل زمانی</span></div><div id="ov-day-strike" class="open-view-chart"><p class="empty-note">هنوز محاسبه نشده است.</p></div></section><section><div class="section-head"><h3>پریمیوم وزنی در طول روز</h3><span>درصدی از قیمت پایه</span></div><div id="ov-day-premium" class="open-view-chart"><p class="empty-note">هنوز محاسبه نشده است.</p></div></section><section class="open-view-wide-card"><div class="section-head"><h3>IV وزنی در طول روز</h3><span>وزن ریزمعامله هر قرارداد</span></div><div id="ov-day-iv" class="open-view-chart"><p class="empty-note">هنوز محاسبه نشده است.</p></div></section></div>
    </section>
    <p class="history-caveat">این شاخص از معاملات مشاهده‌شده ساخته می‌شود و قیمت قابل اجرای هم‌زمان نیست. IV مدل بلک–شولز است و دامنه نوسان، توقف نماد و پرش قیمت را مدل نمی‌کند.</p>
  </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const status = $('ov-status'), baseSelect = $('ov-base');
  let chain = new Map(), ua = null, contracts = [], closedSeriesByIns = {}, seriesByIns = {}, daily = null, intraday = null;
  let dailyRelations = [], intradayRelations = [], selectedDate = 0, intradayRequest = 0;
  let liveRefreshBusy = false, lastLiveRefreshAt = 0, disposed = false;
  const tradeCache = new Map(), hiddenSeries = new Set();
  const setStatus = (text, bad = false) => { status.textContent = text; status.className = bad ? 'loss' : ''; };
  const inputNumber = (id) => Number(toEnDigits($(id).value));
  const settings = (reportError = true) => {
    const value = {
      rFree: inputNumber('ov-rfree') / 100, divYield: inputNumber('ov-divyield') / 100,
      yearDays: inputNumber('ov-year-days'), ivLo: inputNumber('ov-iv-lo') / 100, ivHi: inputNumber('ov-iv-hi') / 100,
    };
    const valid = Number.isFinite(value.rFree) && value.rFree >= 0 && value.rFree <= 2
      && Number.isFinite(value.divYield) && value.divYield >= 0 && value.divYield <= 1
      && Number.isInteger(value.yearDays) && value.yearDays >= 1 && value.yearDays <= 1000
      && value.ivLo >= 0.0001 && value.ivHi > value.ivLo && value.ivHi <= 10;
    if (!valid) { if (reportError) setStatus('پارامترهای IV معتبر نیستند؛ بیشینه IV باید از کمینه بزرگ‌تر باشد.', true); return null; }
    $('ov-iv-current').textContent = `نرخ ${fmt.pct(value.rFree * 100)}٪ · بازده نقدی ${fmt.pct(value.divYield * 100)}٪ · سال ${fmt.int(value.yearDays)} روز · دامنه IV از ${fmt.pct(value.ivLo * 100)}٪ تا ${fmt.pct(value.ivHi * 100)}٪`;
    return value;
  };
  const selectedExpiry = () => normalizeHistoryDate($('ov-expiry').value);
  const viewRows = () => (daily?.expiryRows || []).filter((row) => row.expiry === selectedExpiry());
  const contractsInView = () => contracts.filter((contract) => normalizeHistoryDate(contract.expiry) === selectedExpiry());
  const toggleSeries = (key) => { if (hiddenSeries.has(key)) hiddenSeries.delete(key); else hiddenSeries.add(key); paintDaily(); };
  settings(false);

  function resetIntraday() {
    intradayRequest += 1;
    intraday = null; intradayRelations = [];
    $('ov-day-status').textContent = 'هنوز محاسبه نشده است.'; $('ov-day-timeframe').textContent = '—';
    $('ov-day-price').innerHTML = '<p class="empty-note">تایم‌فریم را انتخاب و محاسبه را اجرا کن.</p>';
    $('ov-day-gap').innerHTML = '<p class="empty-note">هنوز محاسبه نشده است.</p>';
    $('ov-day-iv').innerHTML = '<p class="empty-note">هنوز محاسبه نشده است.</p>';
    $('ov-day-strike').innerHTML = '<p class="empty-note">هنوز محاسبه نشده است.</p>';
    $('ov-day-premium').innerHTML = '<p class="empty-note">هنوز محاسبه نشده است.</p>';
  }

  function paintIntraday() {
    if (!intraday) return;
    const minutes = Number($('ov-day-interval').value);
    $('ov-day-timeframe').textContent = $('ov-day-source').value === 'live'
      ? `${faDigits(minutes)} دقیقه · قیمت آخرین معامله هر سطل`
      : `${faDigits(minutes)} دقیقه · میانگین موزون معاملات هر سطل`;
    const priceExtra = (row) => `<span>فاصله پایه تا کال: <strong>${fmt.pct(row.callBreakevenGapPct)}٪</strong></span><span>فاصله پایه از پوت: <strong>${fmt.pct(row.putBreakevenGapPct)}٪</strong></span>`;
    chart($('ov-day-price'), intraday.rows, SERIES_PRICE, { intraday: true, yLabel: 'قیمت (ریال)', extra: priceExtra });
    chart($('ov-day-gap'), intraday.rows, SERIES_GAP_INTRADAY, { percent: true, intraday: true, yLabel: 'فاصله (درصد)' });
    chart($('ov-day-strike'), intraday.rows, SERIES_STRIKE_INTRADAY, { intraday: true, yLabel: 'قیمت اعمال (ریال)' });
    chart($('ov-day-premium'), intraday.rows, SERIES_PREMIUM_INTRADAY, { percent: true, intraday: true, yLabel: 'پریمیوم (٪ پایه)' });
    chart($('ov-day-iv'), intraday.rows, SERIES_IV_INTRADAY, { percent: true, intraday: true, yLabel: 'نوسان ضمنی (درصد)' });
  }

  function paintLiveDetail(date) {
    const row = intraday?.rows?.at(-1);
    if (!row) {
      $('ov-day-title').textContent = 'امروز تا همین لحظه';
      $('ov-day-base').textContent = 'هنوز معامله معتبری برای ساخت سطل زنده نرسیده است.';
      $('ov-day-formulas').innerHTML = '<p class="empty-note">بدون معامله واقعی، شاخص لحظه‌ای ساخته نمی‌شود.</p>';
      $('ov-day-contract-count').textContent = '۰ قرارداد در تازه‌ترین سطل';
      $('ov-day-contracts').innerHTML = '<p class="empty-note">قرارداد معامله‌شده‌ای در این تایم‌فریم نیست.</p>';
      return;
    }
    const items = intraday.contractRows.filter((item) => item.date === date && item.second === row.second && item.expiry === selectedExpiry());
    $('ov-day-title').textContent = `امروز تا ${clock(row.second)}`;
    $('ov-day-base').innerHTML = `تازه‌ترین سطل زنده · پایه ${fmt.money(row.basePrice)} · تغییر <span class="${signTone(row.baseChangePct)}">${fmt.pct(row.baseChangePct)}٪</span>`;
    const cards = [
      ['سربه‌سر کال', weightedFormula(items, 'call', 'breakeven'), 'gain'],
      ['سربه‌سر پوت', weightedFormula(items, 'put', 'breakeven'), 'loss'],
      ['IV کال', weightedFormula(items, 'call', 'iv'), 'cmp1'],
      ['IV پوت', weightedFormula(items, 'put', 'iv'), 'cmp4'],
    ];
    $('ov-day-formulas').innerHTML = cards.map(([label, result, tone], index) => `<article class="open-view-formula ${tone}"><span>${label}</span><b>${index < 2 ? fmt.money(result.value) : `${fmt.pct(result.value)}٪`}</b><code>تازه‌ترین قیمت معامله × وزن ارزش واقعی</code><small>${fmt.int(result.count)} قرارداد · مجموع ارزش ${fmt.money(result.total)}</small></article>`).join('');
    $('ov-day-contract-count').textContent = `${fmt.int(items.length)} قرارداد در تازه‌ترین سطل`;
    $('ov-day-contracts').innerHTML = contractTable(items);
  }

  function paintDayDetail() {
    const day = viewRows().find((row) => row.date === selectedDate);
    if (!day) { $('ov-day-detail').hidden = true; return; }
    const items = scopedWeights(daily.contractRows.filter((item) => item.date === selectedDate && item.expiry === selectedExpiry()));
    $('ov-day-detail').hidden = false; $('ov-day-title').textContent = dateLabel(selectedDate);
    $('ov-day-base').textContent = `سررسید ${dateLabel(selectedExpiry())} · پایه ${fmt.money(day.basePrice)} · تغییر ${fmt.pct(day.baseChangePct)}٪`;
    const cards = [
      ['سربه‌سر کال', 'Σ(سربه‌سر × ارزش) ÷ Σارزش', weightedFormula(items, 'call', 'breakeven'), 'gain'],
      ['سربه‌سر پوت', 'Σ(سربه‌سر × ارزش) ÷ Σارزش', weightedFormula(items, 'put', 'breakeven'), 'loss'],
      ['IV کال', 'Σ(IV × ارزش) ÷ Σارزش معتبر IV', weightedFormula(items, 'call', 'iv'), 'cmp1'],
      ['IV پوت', 'Σ(IV × ارزش) ÷ Σارزش معتبر IV', weightedFormula(items, 'put', 'iv'), 'cmp4'],
    ];
    $('ov-day-formulas').innerHTML = cards.map(([label, formula, result, tone], index) => `<article class="open-view-formula ${tone}"><span>${label}</span><b>${index < 2 ? fmt.money(result.value) : `${fmt.pct(result.value)}٪`}</b><code>${formula}</code><small>${fmt.int(result.count)} قرارداد · مجموع ارزش ${fmt.money(result.total)}</small></article>`).join('');
    $('ov-day-contract-count').textContent = `${fmt.int(items.length)} قرارداد`;
    $('ov-day-contracts').innerHTML = contractTable(items);
  }

  function paintDaily() {
    if (!daily) return;
    const rows = viewRows();
    if (!rows.some((row) => row.date === selectedDate)) selectedDate = rows.at(-1)?.date || 0;
    $('ov-report').hidden = false; $('ov-excel').disabled = false;
    $('ov-daily-scope').textContent = `سررسید ${dateLabel(selectedExpiry())}`;
    const priceExtra = (row) => `<span>فاصله پایه تا کال: <strong>${fmt.pct(row.callBreakevenGapPct)}٪</strong></span><span>فاصله پایه از پوت: <strong>${fmt.pct(row.putBreakevenGapPct)}٪</strong></span>`;
    chart($('ov-daily-price'), rows, SERIES_PRICE, { yLabel: 'قیمت (ریال)', extra: priceExtra });
    chart($('ov-daily-gap'), rows, SERIES_GAP, { percent: true, yLabel: 'فاصله (درصد)', hiddenSeries, onToggle: toggleSeries });
    chart($('ov-daily-strike'), rows, SERIES_STRIKE, { yLabel: 'قیمت اعمال (ریال)', extra: priceExtra });
    chart($('ov-daily-strike-gap'), rows, SERIES_STRIKE_GAP, { percent: true, yLabel: 'فاصله (درصد)', hiddenSeries, onToggle: toggleSeries });
    chart($('ov-daily-iv'), rows, SERIES_IV, { percent: true, yLabel: 'نوسان ضمنی (درصد)', hiddenSeries, onToggle: toggleSeries });
    chart($('ov-daily-premium'), rows, SERIES_PREMIUM, { percent: true, yLabel: 'پریمیوم (٪ پایه)', hiddenSeries, onToggle: toggleSeries });
    $('ov-daily-table').innerHTML = dailyTable(rows, selectedDate); paintDayDetail();
  }

  function computeDaily() {
    const from = normalizeHistoryDate($('ov-from').value), to = normalizeHistoryDate($('ov-to').value);
    if (!from || !to || from > to) { setStatus('تاریخ شروع باید پیش از تاریخ پایان یا برابر آن باشد.', true); return; }
    const model = settings(); if (!model) return;
    daily = analyzeDailyOpenView({ ua, contracts, seriesByIns, from, to, settings: model, basis: $('ov-basis').value });
    resetIntraday();
    const expiries = [...new Set(daily.expiryRows.map((row) => row.expiry))].sort((a, b) => a - b), previous = $('ov-expiry').value;
    $('ov-expiry').innerHTML = expiries.map((expiry) => `<option value="${expiry}">${dateLabel(expiry)}</option>`).join('');
    $('ov-expiry').disabled = !expiries.length;
    if (!expiries.length) { selectedDate = 0; $('ov-report').hidden = true; setStatus('در این بازه برای هیچ سررسیدی قرارداد معتبر پیدا نشد.', true); return; }
    if (expiries.some((expiry) => String(expiry) === previous)) $('ov-expiry').value = previous;
    selectedDate = viewRows().at(-1)?.date || 0;
    dailyRelations = relationMatrix(viewRows());
    paintDaily(); setStatus(`${fmt.int(viewRows().length)} روز برای سررسید ${dateLabel(selectedExpiry())} محاسبه شد؛ برای ریزمحاسبه روی هر روز کلیک کن.`);
  }

  async function applySelectedScope() {
    seriesByIns = closedSeriesByIns;
    if ($('ov-scope').value !== SCOPE_LIVE) {
      $('ov-live-note').textContent = 'فقط روزهای بسته‌شده و نهایی در نمودار چندروزه هستند.';
      return;
    }
    $('ov-live-note').textContent = 'در حال افزودن عکس معتبر امروز به نمودار چندروزه…';
    const result = await applyLiveScope(closedSeriesByIns);
    seriesByIns = result.series;
    $('ov-live-note').textContent = result.note;
  }

  async function loadDaily() {
    ua = chain.get(baseSelect.value);
    if (!ua) { setStatus('ابتدا نماد پایه را انتخاب کن.', true); return; }
    setStatus('در حال دریافت تاریخچه همه قراردادها…'); $('ov-load').disabled = true;
    try {
      contracts = flattenActiveContracts(ua, state.settings.blockedExpiries).map((contract) => {
        const sized = legContractSize(contract.size, state.settings.contractSize);
        return { ...contract, size: sized.size, sizeAssumed: sized.assumed };
      });
      const codes = [String(ua.ins), ...contracts.map((contract) => String(contract.ins))]; closedSeriesByIns = {};
      for (const group of chunks(codes, 100)) {
        const response = await fetch(`/api/dailies?ins=${encodeURIComponent(group.join(','))}&n=0`), payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
        for (const [ins, result] of Object.entries(payload)) closedSeriesByIns[ins] = result.rows || [];
      }
      await applySelectedScope();
      const dates = (seriesByIns[String(ua.ins)] || []).map((row) => normalizeHistoryDate(row.date)).filter(Boolean).sort((a, b) => a - b);
      if (!dates.length) throw new Error('برای نماد پایه تاریخچه‌ای دریافت نشد');
      const options = dates.map((date) => `<option value="${date}">${dateLabel(date)}</option>`).join('');
      $('ov-from').innerHTML = options; $('ov-to').innerHTML = options; $('ov-from').disabled = false; $('ov-to').disabled = false;
      $('ov-from').value = String(dates[Math.max(0, dates.length - 20)]); $('ov-to').value = String(dates.at(-1)); computeDaily();
      if ($('ov-day-source').value === 'live') await loadDayIntraday();
    } catch (error) { setStatus(errorText(error, 'تاریخچه دریافت نشد.'), true); }
    finally { $('ov-load').disabled = false; }
  }

  async function loadDayIntraday() {
    if (!daily || !selectedDate) { $('ov-day-status').textContent = 'ابتدا تاریخچه نماد و یک سررسید را آماده کن.'; return; }
    const dayStatus = $('ov-day-status'), minutes = Number($('ov-day-interval').value), viewContracts = contractsInView();
    const live = $('ov-day-source').value === 'live';
    const cacheKey = `${selectedDate}:${selectedExpiry()}`;
    const request = ++intradayRequest, requestedExpiry = selectedExpiry();
    let marketCoverage = null;
    const model = settings(); if (!model) return;
    $('ov-day-intraday').disabled = true;
    dayStatus.textContent = live ? 'در حال دریافت همه ریزمعامله‌های امروز تا این لحظه…' : 'در حال دریافت ریزمعامله‌های همین روز…';
    try {
      let analysisDate = selectedDate, tradesByKey = live ? null : tradeCache.get(cacheKey);
      if (live) {
        const ids = [String(ua.ins), ...viewContracts.map((contract) => String(contract.ins))];
        const parts = await Promise.all(chunks(ids, 24).map(async (group) => {
          const response = await fetch(`/api/live-trades?ins=${encodeURIComponent(group.join(','))}`, { cache: 'no-store' });
          const payload = await response.json();
          if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
          return payload;
        }));
        const day = liveDayOf(parts[0]?.market, parts[0]?.at);
        if (!day.ok) throw new Error(`عکس بازار به امروز قابل انتساب نیست${day.why ? `؛ ${day.why}` : ''}`);
        analysisDate = day.date;
        const items = Object.assign({}, ...parts.map((part) => part.items || {}));
        const batch = liveTradeBatch(items, analysisDate, ua.ins);
        if (batch.baseFailed) throw new Error('ریزمعامله نماد پایه دریافت نشد؛ نمودارهای وابسته به پایه قابل ساخت نیستند.');
        tradesByKey = batch.tradesByKey;
        if (request !== intradayRequest || requestedExpiry !== selectedExpiry() || $('ov-day-source').value !== 'live') return;
        marketCoverage = {
          failed: batch.failed, trades: batch.trades,
          tradedInstruments: batch.tradedInstruments, requested: ids.length, first: batch.first, last: batch.last,
        };
      } else if (!tradesByKey) {
        const requests = [{ ins: String(ua.ins), date: String(selectedDate) }];
        for (const contract of viewContracts) {
          // داده روزانه ناقص، دلیل حذف درخواست ریزمعامله نیست.
          if (contract.size > 0 && normalizeHistoryDate(contract.expiry) >= selectedDate) requests.push({ ins: String(contract.ins), date: String(selectedDate) });
        }
        const response = await fetch('/api/trades/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) }), payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
        if (Object.values(payload.items || {}).some((item) => item.error)) throw new Error('دریافت ریزمعامله برخی نمادها ناموفق بود؛ این وضعیت به معنی نبود معامله نیست.');
        tradesByKey = Object.fromEntries(Object.entries(payload.items || {}).map(([key, item]) => [key, item.rows || []]));
        if (Object.values(tradesByKey).some((rows) => rows.length)) tradeCache.set(cacheKey, tradesByKey);
      }
      if (request !== intradayRequest || requestedExpiry !== selectedExpiry()) return;
      intraday = analyzeIntradayOpenView({
        ua, contracts: viewContracts, dates: [analysisDate], tradesByKey, intervalMinutes: minutes,
        settings: model, priceBasis: live ? 'latest' : 'vwap',
      });
      intradayRelations = relationMatrix(intraday.rows); paintIntraday();
      if (live) paintLiveDetail(analysisDate);
      const coverage = live && marketCoverage
        ? ` · ${fmt.int(marketCoverage.trades)} ریزمعامله در ${fmt.int(marketCoverage.tradedInstruments)} از ${fmt.int(marketCoverage.requested)} ابزار${Number.isFinite(marketCoverage.first) ? ` · ${clock(marketCoverage.first)} تا ${clock(marketCoverage.last)}` : ''}${marketCoverage.failed ? ` · خطای ${fmt.int(marketCoverage.failed)} ابزار` : ''}`
        : '';
      dayStatus.textContent = !intraday.rows.length
        ? 'برای این تاریخ و سررسید ریزمعامله معتبر دریافت نشد؛ تاریخ، سررسید و وضعیت منبع داده را بررسی کن.'
        : live
        ? `${fmt.int(intraday.rows.length)} سطل زنده ${faDigits(minutes)} دقیقه‌ای از اولین معامله تا اکنون ساخته شد${coverage}.`
        : `${fmt.int(intraday.rows.length)} سطل ${faDigits(minutes)} دقیقه‌ای ساخته شد.`;
    } catch (error) { if (request === intradayRequest) dayStatus.textContent = errorText(error, 'ریزمعامله دریافت نشد.'); }
    finally { if (request === intradayRequest) $('ov-day-intraday').disabled = false; }
  }

  async function refreshLiveViews() {
    if (disposed || liveRefreshBusy || !daily) return;
    if ($('ov-scope').value !== SCOPE_LIVE && $('ov-day-source').value !== 'live') return;
    liveRefreshBusy = true;
    try {
      if ($('ov-scope').value === SCOPE_LIVE) { await applySelectedScope(); computeDaily(); }
      if ($('ov-day-source').value === 'live') await loadDayIntraday();
      lastLiveRefreshAt = Date.now();
    } finally { liveRefreshBusy = false; }
  }

  $('ov-load').addEventListener('click', loadDaily);
  $('ov-scope').addEventListener('change', async () => {
    if (!Object.keys(closedSeriesByIns).length) return;
    await applySelectedScope(); computeDaily();
  });
  $('ov-basis').addEventListener('change', () => { if (daily) computeDaily(); });
  $('ov-from').addEventListener('change', () => { if (daily) computeDaily(); });
  $('ov-to').addEventListener('change', () => { if (daily) computeDaily(); });
  $('ov-expiry').addEventListener('change', async () => {
    selectedDate = viewRows().at(-1)?.date || 0; dailyRelations = relationMatrix(viewRows()); resetIntraday(); paintDaily();
    if ($('ov-day-source').value === 'live') await loadDayIntraday();
  });
  $('ov-apply-iv').addEventListener('click', () => { const model = settings(); if (!model) return; if (daily) computeDaily(); else setStatus('پارامترهای IV ثبت شد؛ پس از دریافت تاریخچه اعمال می‌شود.'); });
  $('ov-day-interval').addEventListener('change', async () => {
    resetIntraday();
    if ($('ov-day-source').value === 'live') await loadDayIntraday();
  });
  $('ov-day-source').addEventListener('change', async () => {
    resetIntraday();
    const live = $('ov-day-source').value === 'live';
    $('ov-day-intraday').textContent = live ? 'به‌روزرسانی لحظه‌ای' : 'محاسبه ریز این روز';
    if (live) await loadDayIntraday(); else paintDayDetail();
  });
  $('ov-day-intraday').addEventListener('click', loadDayIntraday);
  $('ov-daily-table').addEventListener('click', (event) => {
    const row = event.target.closest('[data-day]'); if (!row) return;
    const next = Number(row.dataset.day); if (next !== selectedDate) { selectedDate = next; resetIntraday(); paintDaily(); }
    if ($('ov-day-source').value === 'live') void loadDayIntraday();
    $('ov-day-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('ov-daily-table').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-day]'); if (!row) return; event.preventDefault(); row.click();
  });
  $('ov-excel').addEventListener('click', () => downloadOpenViewExcel({ ua, daily, intraday, dailyRelations, intradayRelations, basis: $('ov-basis').value, intervalMinutes: Number($('ov-day-interval').value), selectedExpiry: selectedExpiry() }));
  baseSelect.addEventListener('change', () => { ua = chain.get(baseSelect.value) || null; daily = null; intraday = null; selectedDate = 0; closedSeriesByIns = {}; seriesByIns = {}; tradeCache.clear(); $('ov-report').hidden = true; $('ov-excel').disabled = true; });

  // ——— فهرست قراردادها از **بازه** می‌آید، نه از تابلوی امروز ———
  //
  // پیش از این `/api/history/universe` بی‌تاریخ صدا می‌شد، پس هر تحلیلِ
  // گذشته فقط قراردادهای زندهٔ امروز را می‌دید و آن‌هایی که داخل بازهٔ
  // بررسی سررسید شده بودند اصلاً در فهرست نبودند.
  let rangeUi = null, rangeJob = null;
  const baseGate = baseAfterRange(baseSelect);

  function fillBases(payload) {
    const keep = baseSelect.value;
    chain = buildChain(payload.rows || []);
    baseGate.ready(chain.size);
    const list = [...chain.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fa'));
    baseSelect.innerHTML = '<option value="">نماد پایه را انتخاب کن</option>' + list.map((item) => `<option value="${esc(item.ins)}">${esc(nameOf(item))} · ${fmt.int(item.contracts)} قرارداد · ${fmt.int(item.expiryList.length)} سررسید</option>`).join('');
    if (keep && chain.has(keep)) baseSelect.value = keep;
    const expired = payload.summary?.expiredInside || 0;
    setStatus(`${fmt.int(list.length)} نماد پایه در این بازه؛ ${fmt.int(payload.rosterContracts || 0)} قرارداد که ${fmt.int(expired)} تای آن‌ها داخل همین بازه سررسید شده‌اند.`);
  }

  async function loadUniverseForRange(range) {
    rangeJob?.stop();
    baseGate.loading();
    rangeJob = loadRange(range, rangeUi, { onUpdate: fillBases });
    try { fillBases(await rangeJob.first); }
    catch (error) { baseGate.failed(); setStatus(errorText(error, 'فهرست قراردادهای این بازه دریافت نشد.'), true); }
  }

  rangeUi = mountHistoryRange($('ov-range'), { onApply: (range) => loadUniverseForRange(range) });
  await loadUniverseForRange(rangeUi.range);
  return {
    updateLive() {
      if (Date.now() - lastLiveRefreshAt < 12_000 || root.offsetParent === null) return;
      refreshLiveViews();
    },
    dispose() { disposed = true; rangeJob?.stop(); },
  };
}
