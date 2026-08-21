import { buildChain, legContractSize } from '/core/chain.mjs';
import { flattenActiveContracts, historyDateLabel, indexHistory, normalizeHistoryDate } from '/core/history.mjs';
import { analyzeDailyOpenView, analyzeIntradayOpenView, relationMatrix } from '/core/open-view.mjs';
import { downloadOpenViewExcel } from '/ui/open-view-export.mjs';
import { fmt, faDigits, signTone } from '/ui/fmt.mjs';

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

const SERIES_PRICE = [
  { key: 'basePrice', label: 'قیمت پایه', color: 'var(--warn)' },
  { key: 'callBreakeven', label: 'سربه‌سر وزنی کال', color: 'var(--gain)' },
  { key: 'putBreakeven', label: 'سربه‌سر وزنی پوت', color: 'var(--loss)' },
];
const SERIES_GAP = [
  { key: 'callBreakevenGapPct', label: 'فاصله تا کال', color: 'var(--gain)' },
  { key: 'callBreakevenGapPctMa5', label: 'میانگین ۵روزه فاصله کال', color: 'var(--cmp2)' },
  { key: 'putBreakevenGapPct', label: 'فاصله از پوت', color: 'var(--loss)' },
  { key: 'putBreakevenGapPctMa5', label: 'میانگین ۵روزه فاصله پوت', color: 'var(--cmp3)' },
];
const SERIES_GAP_INTRADAY = [SERIES_GAP[0], SERIES_GAP[2]];
const SERIES_IV = [
  { key: 'callIvPct', label: 'IV وزنی کال', color: 'var(--cmp1)' },
  { key: 'callIvPctMa5', label: 'میانگین ۵روزه IV کال', color: 'var(--cmp2)' },
  { key: 'putIvPct', label: 'IV وزنی پوت', color: 'var(--cmp4)' },
  { key: 'putIvPctMa5', label: 'میانگین ۵روزه IV پوت', color: 'var(--cmp3)' },
];
const SERIES_IV_INTRADAY = [SERIES_IV[0], SERIES_IV[2]];

function chart(host, sourceRows, series, { percent = false, intraday = false, yLabel = '', extra = null } = {}) {
  const rows = sourceRows.filter((row) => series.some((item) => Number.isFinite(row[item.key])));
  if (rows.length < 2) { host.innerHTML = '<p class="empty-note">برای رسم نمودار دست‌کم دو مشاهده معتبر لازم است.</p>'; return; }
  const values = rows.flatMap((row) => series.map((item) => row[item.key]).filter(Number.isFinite));
  let low = Math.min(...values), high = Math.max(...values);
  if (!(high > low)) { low -= 1; high += 1; }
  const padding = (high - low) * 0.08; low -= padding; high += padding;
  const W = 920, H = 330, L = 96, R = 26, T = 25, B = 62;
  const x = (index) => L + (index / Math.max(1, rows.length - 1)) * (W - L - R);
  const y = (value) => T + ((high - value) / (high - low)) * (H - T - B);
  const ticks = Array.from({ length: 5 }, (_, index) => low + ((high - low) * index) / 4);
  const axis = (value) => percent ? `${fmt.pct(value)}٪` : fmt.money(value);
  const label = (row) => intraday ? `${dateLabel(row.date)} · ${clock(row.second)}` : dateLabel(row.date);
  const paths = series.map((item) => {
    let d = '', drawing = false;
    rows.forEach((row, index) => {
      const value = row[item.key];
      if (!Number.isFinite(value)) { drawing = false; return; }
      d += `${drawing ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)} `;
      drawing = true;
    });
    return `<path fill="none" stroke="${item.color}" d="${d.trim()}"/>`;
  }).join('');
  const xIndexes = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];
  host.innerHTML = `<div class="open-view-chart-legend">${series.map((item) => `<span style="--series:${item.color}"><i></i>${item.label}</span>`).join('')}</div><div class="open-view-chart-stage"><svg viewBox="0 0 ${W} ${H}" tabindex="0" aria-label="نمودار روند نگاه باز">
    ${ticks.map((value) => `<line x1="${L}" x2="${W - R}" y1="${y(value)}" y2="${y(value)}" class="portfolio-grid"/><text x="${L - 9}" y="${y(value) + 4}" text-anchor="end">${axis(value)}</text>`).join('')}
    ${xIndexes.map((index) => `<text x="${x(index)}" y="${H - 24}" text-anchor="middle">${label(rows[index])}</text>`).join('')}
    <text class="axis-title" transform="translate(16 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>
    ${paths}<g class="portfolio-cursor" hidden><line y1="${T}" y2="${H - B}"/><g></g></g><rect class="portfolio-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
  </svg><div class="backtest-tip" hidden></div></div>`;
  const svg = host.querySelector('svg'), cursor = host.querySelector('.portfolio-cursor'), tip = host.querySelector('.backtest-tip');
  svg.addEventListener('pointermove', (event) => {
    const box = svg.getBoundingClientRect(), localX = ((event.clientX - box.left) / box.width) * W;
    const index = Math.max(0, Math.min(rows.length - 1, Math.round(((localX - L) / (W - L - R)) * (rows.length - 1))));
    const row = rows[index], px = x(index);
    cursor.hidden = false;
    cursor.querySelector('line').setAttribute('x1', px); cursor.querySelector('line').setAttribute('x2', px);
    cursor.querySelector('g').innerHTML = series.map((item) => Number.isFinite(row[item.key]) ? `<circle cx="${px}" cy="${y(row[item.key])}" r="4" fill="${item.color}"/>` : '').join('');
    tip.hidden = false;
    tip.innerHTML = `<b>${label(row)}</b>${series.map((item) => `<span>${item.label}: <strong>${Number.isFinite(row[item.key]) ? axis(row[item.key]) : '—'}</strong></span>`).join('')}${extra ? extra(row) : ''}`;
    tip.style.insetInlineStart = `${Math.min(74, Math.max(2, ((px / W) * 100) - 8))}%`; tip.style.top = '8px';
  });
  svg.addEventListener('pointerleave', () => { cursor.hidden = true; tip.hidden = true; });
}

function dailyTable(rows, selectedDate) {
  if (!rows.length) return '<p class="empty-note">مشاهده معتبری در این بازه نیست.</p>';
  return `<table class="history-table open-view-daily-table"><thead><tr><th>تاریخ</th><th>پایه / تغییر</th><th>سربه‌سر کال / فاصله</th><th>میانگین ۵روزه فاصله کال</th><th>سربه‌سر پوت / فاصله</th><th>میانگین ۵روزه فاصله پوت</th><th>IV کال / میانگین ۵روزه</th><th>IV پوت / میانگین ۵روزه</th><th>ارزش کال / پوت</th><th>قرارداد معتبر</th><th>جزئیات</th></tr></thead><tbody>${[...rows].reverse().map((r) => `<tr data-day="${r.date}" tabindex="0" role="button" aria-selected="${r.date === selectedDate}" class="${r.date === selectedDate ? 'picked' : ''}"><td><b>${dateLabel(r.date)}</b></td><td>${fmt.money(r.basePrice)}<small class="${signTone(r.baseChangePct)}">${fmt.pct(r.baseChangePct)}٪</small></td><td>${fmt.money(r.callBreakeven)}<small>${fmt.pct(r.callBreakevenGapPct)}٪</small></td><td>${fmt.pct(r.callBreakevenGapPctMa5)}٪</td><td>${fmt.money(r.putBreakeven)}<small>${fmt.pct(r.putBreakevenGapPct)}٪</small></td><td>${fmt.pct(r.putBreakevenGapPctMa5)}٪</td><td>${fmt.pct(r.callIvPct)}٪<small>${fmt.pct(r.callIvPctMa5)}٪</small></td><td>${fmt.pct(r.putIvPct)}٪<small>${fmt.pct(r.putIvPctMa5)}٪</small></td><td>${fmt.money(r.callValue)}<small>${fmt.money(r.putValue)}</small></td><td>${fmt.int(r.callContracts)} کال / ${fmt.int(r.putContracts)} پوت</td><td><span class="open-view-row-action">بازکردن محاسبه</span></td></tr>`).join('')}</tbody></table>`;
}

function weightedFormula(items, kind, metric) {
  const valid = items.filter((item) => item.kind === kind && item.included && Number.isFinite(metric === 'iv' ? item.iv : item.breakeven));
  const total = valid.reduce((sum, item) => sum + item.value, 0);
  const value = total > 0 ? valid.reduce((sum, item) => sum + (metric === 'iv' ? item.iv * 100 : item.breakeven) * item.value, 0) / total : NaN;
  return { count: valid.length, total, value };
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
  root.innerHTML = `<section class="open-view-hero"><div><p class="eyebrow">نقشه انتظارات بازار اختیار</p><h1>نگاه باز</h1><p>سربه‌سر و نوسان ضمنی همه کال‌ها و پوت‌های یک نماد، جدا برای هر سررسید و با وزن ارزش معامله.</p></div><span>روزانه → جزئیات هر روز</span></section>
  <section class="card open-view-controls"><div class="section-head"><div><p class="eyebrow">مرحله اول</p><h2>نماد و دامنه تحلیل روزانه</h2></div><b id="ov-status" role="status" aria-live="polite">در حال دریافت نمادها…</b></div>
    <div class="open-view-form"><label>نماد پایه<select id="ov-base"><option value="">در حال دریافت…</option></select></label><label>مبنای روزانه<select id="ov-basis"><option value="CLOSE">قیمت پایانی</option><option value="LAST">آخرین معامله</option><option value="FIRST">اولین معامله</option></select></label><label>از تاریخ<select id="ov-from" disabled></select></label><label>تا تاریخ<select id="ov-to" disabled></select></label><label>نمای نمودار<select id="ov-expiry" disabled><option value="all">همه سررسیدها</option></select></label><button type="button" class="primary" id="ov-load">دریافت تاریخچه روزانه</button><button type="button" class="ghost" id="ov-excel" disabled>خروجی جامع Excel</button></div>
    <p class="portfolio-note">برای دیدن فرمول، وزن هر قرارداد و نمودار ریز همان روز، روی ردیف روز کلیک کن. قیمت یا ارزش گمشده با مشاهده قبلی پر نمی‌شود.</p>
  </section>
  <section id="ov-report" hidden>
    <div class="open-view-chart-grid"><section class="card"><div class="section-head"><h2>روند روزانه سربه‌سر و پایه</h2><span id="ov-daily-scope">همه سررسیدها</span></div><div id="ov-daily-price" class="open-view-chart"></div></section><section class="card"><div class="section-head"><h2>فاصله پایه از دو شاخص</h2><span>روزانه + میانگین متحرک ۵روزه</span></div><div id="ov-daily-gap" class="open-view-chart"></div></section><section class="card open-view-wide-card"><div class="section-head"><h2>نوسان ضمنی وزنی کال و پوت</h2><span>روزانه + میانگین متحرک ۵روزه</span></div><div id="ov-daily-iv" class="open-view-chart"></div></section></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">تنها جدول نمای اصلی</p><h2>خلاصه روزانه</h2></div><span>برای بازکردن محاسبه روی روز کلیک کن</span></div><div id="ov-daily-table" class="history-table-wrap"></div></section>
    <section id="ov-day-detail" class="card open-view-day-detail" hidden>
      <div class="section-head"><div><p class="eyebrow">جزئیات روز انتخاب‌شده</p><h2 id="ov-day-title">—</h2></div><span id="ov-day-base">—</span></div>
      <div id="ov-day-formulas" class="open-view-formula-grid"></div>
      <div class="section-head open-view-contract-head"><div><h3>قراردادها و سهم هرکدام در شاخص</h3><p>رنگ هر خانه متناسب با وزن همان قرارداد در سمت کال یا پوت است.</p></div><span id="ov-day-contract-count">—</span></div>
      <div id="ov-day-contracts" class="history-table-wrap"></div>
      <div class="open-view-intraday-controls"><div><p class="eyebrow">ریز همان روز</p><h3>تایم‌فریم نمودارهای روز انتخاب‌شده</h3></div><label>بازه زمانی<select id="ov-day-interval"><option value="5">۵ دقیقه</option><option value="15" selected>۱۵ دقیقه</option><option value="30">۳۰ دقیقه</option><option value="60">۶۰ دقیقه</option></select></label><button type="button" class="primary" id="ov-day-intraday">محاسبه ریز این روز</button><b id="ov-day-status" role="status" aria-live="polite">هنوز محاسبه نشده است.</b></div>
      <div class="open-view-chart-grid"><section><div class="section-head"><h3>پایه و سربه‌سر در طول روز</h3><span id="ov-day-timeframe">—</span></div><div id="ov-day-price" class="open-view-chart"><p class="empty-note">تایم‌فریم را انتخاب و محاسبه را اجرا کن.</p></div></section><section><div class="section-head"><h3>فاصله درصدی از دو شاخص</h3><span>همان سطل زمانی</span></div><div id="ov-day-gap" class="open-view-chart"><p class="empty-note">هنوز محاسبه نشده است.</p></div></section><section class="open-view-wide-card"><div class="section-head"><h3>IV وزنی در طول روز</h3><span>وزن ریزمعامله هر قرارداد</span></div><div id="ov-day-iv" class="open-view-chart"><p class="empty-note">هنوز محاسبه نشده است.</p></div></section></div>
    </section>
    <p class="history-caveat">این شاخص از معاملات مشاهده‌شده ساخته می‌شود و قیمت قابل اجرای هم‌زمان نیست. IV مدل بلک–شولز است و دامنه نوسان، توقف نماد و پرش قیمت را مدل نمی‌کند.</p>
  </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const status = $('ov-status'), baseSelect = $('ov-base');
  let chain = new Map(), ua = null, contracts = [], seriesByIns = {}, daily = null, intraday = null;
  let dailyRelations = [], intradayRelations = [], selectedDate = 0;
  const tradeCache = new Map();
  const setStatus = (text, bad = false) => { status.textContent = text; status.className = bad ? 'loss' : ''; };
  const settings = () => ({ rFree: state.settings.rFree, divYield: state.settings.divYield, yearDays: state.settings.dayCountYear || 365, ivLo: state.settings.ivLo, ivHi: state.settings.ivHi });
  const viewRows = () => $('ov-expiry').value === 'all' ? daily?.rows || [] : (daily?.expiryRows || []).filter((row) => String(row.expiry) === $('ov-expiry').value);

  function resetIntraday() {
    intraday = null; intradayRelations = [];
    $('ov-day-status').textContent = 'هنوز محاسبه نشده است.'; $('ov-day-timeframe').textContent = '—';
    $('ov-day-price').innerHTML = '<p class="empty-note">تایم‌فریم را انتخاب و محاسبه را اجرا کن.</p>';
    $('ov-day-gap').innerHTML = '<p class="empty-note">هنوز محاسبه نشده است.</p>';
    $('ov-day-iv').innerHTML = '<p class="empty-note">هنوز محاسبه نشده است.</p>';
  }

  function paintIntraday() {
    if (!intraday) return;
    const minutes = Number($('ov-day-interval').value);
    $('ov-day-timeframe').textContent = `${faDigits(minutes)} دقیقه`;
    const priceExtra = (row) => `<span>فاصله پایه تا کال: <strong>${fmt.pct(row.callBreakevenGapPct)}٪</strong></span><span>فاصله پایه از پوت: <strong>${fmt.pct(row.putBreakevenGapPct)}٪</strong></span>`;
    chart($('ov-day-price'), intraday.rows, SERIES_PRICE, { intraday: true, yLabel: 'قیمت (ریال)', extra: priceExtra });
    chart($('ov-day-gap'), intraday.rows, SERIES_GAP_INTRADAY, { percent: true, intraday: true, yLabel: 'فاصله (درصد)' });
    chart($('ov-day-iv'), intraday.rows, SERIES_IV_INTRADAY, { percent: true, intraday: true, yLabel: 'نوسان ضمنی (درصد)' });
  }

  function paintDayDetail() {
    const day = daily?.rows.find((row) => row.date === selectedDate);
    if (!day) { $('ov-day-detail').hidden = true; return; }
    const items = daily.contractRows.filter((item) => item.date === selectedDate);
    $('ov-day-detail').hidden = false; $('ov-day-title').textContent = dateLabel(selectedDate);
    $('ov-day-base').textContent = `پایه ${fmt.money(day.basePrice)} · تغییر ${fmt.pct(day.baseChangePct)}٪`;
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
    $('ov-report').hidden = false; $('ov-excel').disabled = false;
    $('ov-daily-scope').textContent = $('ov-expiry').value === 'all' ? 'همه سررسیدها' : `سررسید ${dateLabel($('ov-expiry').value)}`;
    const priceExtra = (row) => `<span>فاصله پایه تا کال: <strong>${fmt.pct(row.callBreakevenGapPct)}٪</strong></span><span>فاصله پایه از پوت: <strong>${fmt.pct(row.putBreakevenGapPct)}٪</strong></span>`;
    chart($('ov-daily-price'), rows, SERIES_PRICE, { yLabel: 'قیمت (ریال)', extra: priceExtra });
    chart($('ov-daily-gap'), rows, SERIES_GAP, { percent: true, yLabel: 'فاصله (درصد)' });
    chart($('ov-daily-iv'), rows, SERIES_IV, { percent: true, yLabel: 'نوسان ضمنی (درصد)' });
    $('ov-daily-table').innerHTML = dailyTable(daily.rows, selectedDate); paintDayDetail();
  }

  function computeDaily() {
    const from = normalizeHistoryDate($('ov-from').value), to = normalizeHistoryDate($('ov-to').value);
    if (!from || !to || from > to) { setStatus('تاریخ شروع باید پیش از تاریخ پایان یا برابر آن باشد.', true); return; }
    daily = analyzeDailyOpenView({ ua, contracts, seriesByIns, from, to, settings: settings(), basis: $('ov-basis').value });
    dailyRelations = relationMatrix(daily.rows); selectedDate = daily.rows.at(-1)?.date || 0; resetIntraday();
    const expiries = [...new Set(daily.expiryRows.map((row) => row.expiry))].sort((a, b) => a - b), previous = $('ov-expiry').value;
    $('ov-expiry').innerHTML = '<option value="all">همه سررسیدها</option>' + expiries.map((expiry) => `<option value="${expiry}">${dateLabel(expiry)}</option>`).join('');
    $('ov-expiry').disabled = false;
    if ([...$('ov-expiry').options].some((option) => option.value === previous)) $('ov-expiry').value = previous;
    paintDaily(); setStatus(`${fmt.int(daily.rows.length)} روز محاسبه شد؛ برای ریزمحاسبه روی هر روز کلیک کن.`);
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
      const codes = [String(ua.ins), ...contracts.map((contract) => String(contract.ins))]; seriesByIns = {};
      for (const group of chunks(codes, 100)) {
        const response = await fetch(`/api/dailies?ins=${encodeURIComponent(group.join(','))}&n=0`), payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
        for (const [ins, result] of Object.entries(payload)) seriesByIns[ins] = result.rows || [];
      }
      const dates = (seriesByIns[String(ua.ins)] || []).map((row) => normalizeHistoryDate(row.date)).filter(Boolean).sort((a, b) => a - b);
      if (!dates.length) throw new Error('برای نماد پایه تاریخچه‌ای دریافت نشد');
      const options = dates.map((date) => `<option value="${date}">${dateLabel(date)}</option>`).join('');
      $('ov-from').innerHTML = options; $('ov-to').innerHTML = options; $('ov-from').disabled = false; $('ov-to').disabled = false;
      $('ov-from').value = String(dates[Math.max(0, dates.length - 20)]); $('ov-to').value = String(dates.at(-1)); computeDaily();
    } catch (error) { setStatus(errorText(error, 'تاریخچه دریافت نشد.'), true); }
    finally { $('ov-load').disabled = false; }
  }

  async function loadDayIntraday() {
    if (!daily || !selectedDate) return;
    const dayStatus = $('ov-day-status'), minutes = Number($('ov-day-interval').value);
    $('ov-day-intraday').disabled = true; dayStatus.textContent = 'در حال دریافت ریزمعامله‌های همین روز…';
    try {
      let tradesByKey = tradeCache.get(selectedDate);
      if (!tradesByKey) {
        const requests = [{ ins: String(ua.ins), date: String(selectedDate) }];
        const optionIndexes = new Map(contracts.map((contract) => [String(contract.ins), indexHistory(seriesByIns[String(contract.ins)] || [])]));
        for (const contract of contracts) {
          const row = optionIndexes.get(String(contract.ins))?.get(selectedDate);
          if ((Number(row?.value) > 0 || Number(row?.vol) > 0) && contract.size > 0) requests.push({ ins: String(contract.ins), date: String(selectedDate) });
        }
        const response = await fetch('/api/trades/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) }), payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
        tradesByKey = Object.fromEntries(Object.entries(payload.items || {}).map(([key, item]) => [key, item.rows || []])); tradeCache.set(selectedDate, tradesByKey);
      }
      intraday = analyzeIntradayOpenView({ ua, contracts, dates: [selectedDate], tradesByKey, intervalMinutes: minutes, settings: settings() });
      intradayRelations = relationMatrix(intraday.rows); paintIntraday();
      dayStatus.textContent = `${fmt.int(intraday.rows.length)} سطل ${faDigits(minutes)} دقیقه‌ای ساخته شد.`;
    } catch (error) { dayStatus.textContent = errorText(error, 'ریزمعامله دریافت نشد.'); }
    finally { $('ov-day-intraday').disabled = false; }
  }

  $('ov-load').addEventListener('click', loadDaily);
  $('ov-basis').addEventListener('change', () => { if (daily) computeDaily(); });
  $('ov-from').addEventListener('change', () => { if (daily) computeDaily(); });
  $('ov-to').addEventListener('change', () => { if (daily) computeDaily(); });
  $('ov-expiry').addEventListener('change', paintDaily);
  $('ov-day-interval').addEventListener('change', resetIntraday);
  $('ov-day-intraday').addEventListener('click', loadDayIntraday);
  $('ov-daily-table').addEventListener('click', (event) => {
    const row = event.target.closest('[data-day]'); if (!row) return;
    const next = Number(row.dataset.day); if (next !== selectedDate) { selectedDate = next; resetIntraday(); paintDaily(); }
    $('ov-day-detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('ov-daily-table').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-day]'); if (!row) return; event.preventDefault(); row.click();
  });
  $('ov-excel').addEventListener('click', () => downloadOpenViewExcel({ ua, daily, intraday, dailyRelations, intradayRelations, basis: $('ov-basis').value, intervalMinutes: Number($('ov-day-interval').value) }));
  baseSelect.addEventListener('change', () => { ua = chain.get(baseSelect.value) || null; daily = null; intraday = null; selectedDate = 0; tradeCache.clear(); $('ov-report').hidden = true; $('ov-excel').disabled = true; });

  try {
    const response = await fetch('/api/history/universe'), payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
    chain = buildChain(payload.rows || []);
    const list = [...chain.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fa'));
    baseSelect.innerHTML = '<option value="">نماد پایه را انتخاب کن</option>' + list.map((item) => `<option value="${esc(item.ins)}">${esc(nameOf(item))} · ${fmt.int(item.contracts)} قرارداد · ${fmt.int(item.expiryList.length)} سررسید</option>`).join('');
    setStatus(`${fmt.int(list.length)} نماد پایه آماده است.`);
  } catch (error) { baseSelect.innerHTML = '<option value="">دریافت ناموفق</option>'; setStatus(errorText(error, 'نمادها دریافت نشد.'), true); }
}
