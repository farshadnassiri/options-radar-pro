import { buildChain, legContractSize } from '/core/chain.mjs';
import { flattenActiveContracts, historyDateLabel, indexHistory, normalizeHistoryDate } from '/core/history.mjs';
import {
  OPEN_VIEW_RELATIONS, analyzeDailyOpenView, analyzeIntradayOpenView, relationMatrix,
} from '/core/open-view.mjs';
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
const SERIES_IV = [
  { key: 'callIvPct', label: 'IV وزنی کال', color: 'var(--cmp1)' },
  { key: 'putIvPct', label: 'IV وزنی پوت', color: 'var(--cmp4)' },
];
const SERIES_CHANGE = [
  { key: 'baseChangePct', label: 'تغییر پایه', color: 'var(--warn)' },
  { key: 'callBreakevenChangePct', label: 'تغییر سربه‌سر کال', color: 'var(--gain)' },
  { key: 'putBreakevenChangePct', label: 'تغییر سربه‌سر پوت', color: 'var(--loss)' },
  { key: 'callIvChangePp', label: 'تغییر IV کال', color: 'var(--cmp1)' },
  { key: 'putIvChangePp', label: 'تغییر IV پوت', color: 'var(--cmp4)' },
];

function chart(host, sourceRows, series, { percent = false, intraday = false, yLabel = '' } = {}) {
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
  const axis = (value) => percent ? fmt.pct(value) : fmt.money(value);
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
    tip.innerHTML = `<b>${label(row)}</b>${series.map((item) => `<span>${item.label}: <strong>${Number.isFinite(row[item.key]) ? axis(row[item.key]) : '—'}</strong></span>`).join('')}`;
    tip.style.insetInlineStart = `${Math.min(74, Math.max(2, ((px / W) * 100) - 8))}%`; tip.style.top = '8px';
  });
  svg.addEventListener('pointerleave', () => { cursor.hidden = true; tip.hidden = true; });
}

function metricTable(rows, intraday = false, withExpiry = false) {
  if (!rows.length) return '<p class="empty-note">مشاهده معتبری در این بازه نیست.</p>';
  return `<table class="history-table open-view-table"><thead><tr><th>تاریخ</th>${intraday ? '<th>زمان</th>' : ''}${withExpiry ? '<th>سررسید</th>' : ''}<th>پایه</th><th>تغییر پایه</th><th>سربه‌سر کال</th><th>تغییر کال</th><th>فاصله کال</th><th>IV کال</th><th>ارزش کال</th><th>سربه‌سر پوت</th><th>تغییر پوت</th><th>فاصله پوت</th><th>IV پوت</th><th>ارزش پوت</th><th>اعمال وزنی کال / پوت</th><th>قرارداد معتبر</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${dateLabel(r.date)}</td>${intraday ? `<td>${clock(r.second)}</td>` : ''}${withExpiry ? `<td>${dateLabel(r.expiry)}</td>` : ''}<td>${fmt.money(r.basePrice)}</td><td class="${signTone(r.baseChangePct)}">${fmt.pct(r.baseChangePct)}٪</td><td>${fmt.money(r.callBreakeven)}</td><td class="${signTone(r.callBreakevenChangePct)}">${fmt.pct(r.callBreakevenChangePct)}٪</td><td>${fmt.money(r.callBreakevenGap)} · ${fmt.pct(r.callBreakevenGapPct)}٪</td><td>${fmt.pct(r.callIvPct)}٪</td><td>${fmt.money(r.callValue)}</td><td>${fmt.money(r.putBreakeven)}</td><td class="${signTone(r.putBreakevenChangePct)}">${fmt.pct(r.putBreakevenChangePct)}٪</td><td>${fmt.money(r.putBreakevenGap)} · ${fmt.pct(r.putBreakevenGapPct)}٪</td><td>${fmt.pct(r.putIvPct)}٪</td><td>${fmt.money(r.putValue)}</td><td>${fmt.money(r.callStrike)} / ${fmt.money(r.putStrike)}</td><td>${fmt.int(r.callContracts)} / ${fmt.int(r.putContracts)}</td></tr>`).join('')}</tbody></table>`;
}

function correlationTable(matrix) {
  const defs = OPEN_VIEW_RELATIONS, find = (a, b) => matrix.find((item) => item.rowKey === a && item.columnKey === b);
  return `<table class="history-table backtest-correlation open-view-correlation"><thead><tr><th>متغیر</th>${defs.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${defs.map(([rowKey, rowLabel]) => `<tr><th>${rowLabel}</th>${defs.map(([columnKey]) => {
    const item = find(rowKey, columnKey), value = item?.value;
    return `<td data-correlation="${Number.isFinite(value) ? Math.abs(value).toFixed(2) : ''}" title="${fmt.int(item?.samples || 0)} جفت معتبر" class="${signTone(value)}">${fmt.num(value)}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`;
}

export async function mount(root, { state }) {
  root.innerHTML = `<section class="open-view-hero"><div><p class="eyebrow">نقشه انتظارات بازار اختیار</p><h1>نگاه باز</h1><p>سربه‌سر و نوسان ضمنی همه کال‌ها و پوت‌های یک نماد، جدا برای هر سررسید و با وزن ارزش معامله.</p></div><span>روزانه + درون‌روزی چندروزه</span></section>
  <section class="card open-view-controls"><div class="section-head"><div><p class="eyebrow">مرحله اول</p><h2>نماد و دامنه تحلیل</h2></div><b id="ov-status" role="status" aria-live="polite">در حال دریافت نمادها…</b></div>
    <div class="open-view-form"><label>نماد پایه<select id="ov-base"><option value="">در حال دریافت…</option></select></label><label>مبنای روزانه<select id="ov-basis"><option value="CLOSE">قیمت پایانی</option><option value="LAST">آخرین معامله</option><option value="FIRST">اولین معامله</option></select></label><label>از تاریخ<select id="ov-from" disabled></select></label><label>تا تاریخ<select id="ov-to" disabled></select></label><label>نمای نمودار<select id="ov-expiry" disabled><option value="all">همه سررسیدها</option></select></label><label>تایم‌فریم<select id="ov-interval"><option value="5">۵ دقیقه</option><option value="15" selected>۱۵ دقیقه</option><option value="30">۳۰ دقیقه</option><option value="60">۶۰ دقیقه</option></select></label><button type="button" class="primary" id="ov-load">دریافت تاریخچه روزانه</button><button type="button" class="primary" id="ov-intraday" disabled>محاسبه بازه‌های زمانی</button><button type="button" class="ghost" id="ov-excel" disabled>خروجی جامع Excel</button></div>
    <p class="portfolio-note">شاخص سربه‌سر کال = میانگین وزنی «اعمال + پریمیوم» و شاخص پوت = میانگین وزنی «اعمال − پریمیوم». وزن روزانه فقط ارزش رسمی معامله است؛ درون‌روزی از ارزش دقیق ریزمعامله همان سطل استفاده می‌کند.</p>
  </section>
  <section id="ov-report" hidden>
    <div class="backtest-kpis" id="ov-kpis"></div>
    <div class="open-view-chart-grid"><section class="card"><div class="section-head"><h2>روند روزانه سربه‌سر و پایه</h2><span id="ov-daily-scope">همه سررسیدها</span></div><div id="ov-daily-price" class="open-view-chart"></div></section><section class="card"><div class="section-head"><h2>روند روزانه نوسان ضمنی</h2><span>وزن ارزش معامله</span></div><div id="ov-daily-iv" class="open-view-chart"></div></section></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">نمای کلی روزانه</p><h2>پایه، سربه‌سر، IV و جریان ارزش</h2></div><span>بدون پرکردن روزهای ناقص</span></div><div id="ov-daily-table" class="history-table-wrap"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">تفکیک سررسید</p><h2>هر تاریخ × هر سررسید</h2></div><span>کال و پوت مستقل</span></div><div id="ov-expiry-table" class="history-table-wrap"></div></section>
    <div class="open-view-chart-grid"><section class="card"><div class="section-head"><h2>روند چندروزه در تایم‌فریم انتخابی</h2><span id="ov-interval-label">۱۵ دقیقه</span></div><div id="ov-intraday-price" class="open-view-chart"><p class="empty-note">برای دریافت ریزمعامله، «محاسبه بازه‌های زمانی» را بزن.</p></div></section><section class="card"><div class="section-head"><h2>رابطه تغییرات پایه، سربه‌سر و IV</h2><span>تغییر هر سطل نسبت به سطل قبلی</span></div><div id="ov-intraday-change" class="open-view-chart"><p class="empty-note">هنوز محاسبه نشده است.</p></div></section></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">ریز بازه</p><h2>جدول چندروزه تایم‌فریم</h2></div><span id="ov-intraday-count">—</span></div><div id="ov-intraday-table" class="history-table-wrap"><p class="empty-note">هنوز محاسبه نشده است.</p></div></section>
    <div class="open-view-chart-grid"><section class="card"><div class="section-head"><h2>همبستگی روزانه</h2><span>پیرسون · فقط جفت‌های معتبر</span></div><div id="ov-daily-correlation" class="history-table-wrap"></div></section><section class="card"><div class="section-head"><h2>همبستگی تایم‌فریم</h2><span>پیرسون · رابطه، نه علیت</span></div><div id="ov-intraday-correlation" class="history-table-wrap"><p class="empty-note">هنوز محاسبه نشده است.</p></div></section></div>
    <p class="history-caveat">این شاخص از معاملات مشاهده‌شده ساخته می‌شود و قیمت قابل اجرای هم‌زمان نیست. IV مدل بلک–شولز است و دامنه نوسان، توقف نماد و پرش قیمت را مدل نمی‌کند.</p>
  </section>`;

  const $ = (id) => root.querySelector(`#${id}`);
  const status = $('ov-status'), baseSelect = $('ov-base');
  let chain = new Map(), ua = null, contracts = [], seriesByIns = {}, daily = null, intraday = null;
  let dailyRelations = [], intradayRelations = [];
  const setStatus = (text, bad = false) => { status.textContent = text; status.className = bad ? 'loss' : ''; };
  const settings = () => ({
    rFree: state.settings.rFree, divYield: state.settings.divYield,
    yearDays: state.settings.dayCountYear || 365, ivLo: state.settings.ivLo, ivHi: state.settings.ivHi,
  });
  const chosenDates = () => {
    const from = normalizeHistoryDate($('ov-from').value), to = normalizeHistoryDate($('ov-to').value);
    return (seriesByIns[String(ua?.ins)] || []).map((row) => normalizeHistoryDate(row.date)).filter((date) => date && date >= from && date <= to).sort((a, b) => a - b);
  };
  const viewRows = (kind) => {
    const data = kind === 'daily' ? daily : intraday, expiry = $('ov-expiry').value;
    if (!data) return [];
    return expiry === 'all' ? data.rows : data.expiryRows.filter((row) => String(row.expiry) === expiry);
  };
  const resetIntradayView = () => {
    intraday = null; intradayRelations = [];
    $('ov-intraday-price').innerHTML = '<p class="empty-note">برای دریافت ریزمعامله، «محاسبه بازه‌های زمانی» را بزن.</p>';
    $('ov-intraday-change').innerHTML = '<p class="empty-note">هنوز محاسبه نشده است.</p>';
    $('ov-intraday-table').innerHTML = '<p class="empty-note">هنوز محاسبه نشده است.</p>';
    $('ov-intraday-correlation').innerHTML = '<p class="empty-note">هنوز محاسبه نشده است.</p>';
    $('ov-intraday-count').textContent = '—';
  };

  function paint() {
    if (!daily) return;
    const rows = viewRows('daily'), last = rows.at(-1) || {};
    $('ov-report').hidden = false; $('ov-excel').disabled = false; $('ov-intraday').disabled = false;
    $('ov-daily-scope').textContent = $('ov-expiry').value === 'all' ? 'همه سررسیدها' : `سررسید ${dateLabel($('ov-expiry').value)}`;
    $('ov-kpis').innerHTML = [
      ['پایه آخر', fmt.money(last.basePrice), `${fmt.pct(last.baseChangePct)}٪`, signTone(last.baseChangePct)],
      ['سربه‌سر کال', fmt.money(last.callBreakeven), `فاصله ${fmt.pct(last.callBreakevenGapPct)}٪`, 'gain'],
      ['سربه‌سر پوت', fmt.money(last.putBreakeven), `فاصله ${fmt.pct(last.putBreakevenGapPct)}٪`, 'loss'],
      ['IV کال / پوت', `${fmt.pct(last.callIvPct)}٪ / ${fmt.pct(last.putIvPct)}٪`, 'وزن ارزش معامله', ''],
      ['ارزش کال / پوت', `${fmt.money(last.callValue)} / ${fmt.money(last.putValue)}`, `${fmt.int(last.totalContracts)} قرارداد معتبر`, ''],
    ].map(([label, value, note, tone]) => `<article class="${tone}"><span>${label}</span><b>${value}</b><small>${note}</small></article>`).join('');
    chart($('ov-daily-price'), rows, SERIES_PRICE, { yLabel: 'قیمت (ریال)' });
    chart($('ov-daily-iv'), rows, SERIES_IV, { percent: true, yLabel: 'نوسان ضمنی (درصد)' });
    $('ov-daily-table').innerHTML = metricTable(daily.rows);
    $('ov-expiry-table').innerHTML = metricTable(daily.expiryRows, false, true);
    $('ov-daily-correlation').innerHTML = correlationTable(dailyRelations);
    if (intraday) {
      const intervalRows = viewRows('intraday');
      $('ov-interval-label').textContent = `${faDigits($('ov-interval').value)} دقیقه`;
      $('ov-intraday-count').textContent = `${fmt.int(intraday.rows.length)} سطل · ${fmt.int(intraday.contractRows.length)} مشاهده قراردادی`;
      chart($('ov-intraday-price'), intervalRows, SERIES_PRICE, { intraday: true, yLabel: 'قیمت (ریال)' });
      chart($('ov-intraday-change'), intervalRows, SERIES_CHANGE, { percent: true, intraday: true, yLabel: 'تغییر (درصد / واحد درصد)' });
      $('ov-intraday-table').innerHTML = metricTable(intraday.rows, true);
      $('ov-intraday-correlation').innerHTML = correlationTable(intradayRelations);
    }
  }

  function computeDaily() {
    const from = normalizeHistoryDate($('ov-from').value), to = normalizeHistoryDate($('ov-to').value);
    if (!from || !to || from > to) { setStatus('تاریخ شروع باید پیش از تاریخ پایان یا برابر آن باشد.', true); return; }
    daily = analyzeDailyOpenView({
      ua, contracts, seriesByIns, from, to,
      settings: settings(), basis: $('ov-basis').value,
    });
    resetIntradayView();
    dailyRelations = relationMatrix(daily.rows);
    const expiries = [...new Set(daily.expiryRows.map((row) => row.expiry))].sort((a, b) => a - b);
    const previous = $('ov-expiry').value;
    $('ov-expiry').innerHTML = '<option value="all">همه سررسیدها</option>' + expiries.map((expiry) => `<option value="${expiry}">${dateLabel(expiry)}</option>`).join('');
    $('ov-expiry').disabled = false;
    if ([...$('ov-expiry').options].some((option) => option.value === previous)) $('ov-expiry').value = previous;
    paint();
    setStatus(`${fmt.int(daily.rows.length)} روز و ${fmt.int(daily.expiryRows.length)} ردیف سررسید محاسبه شد.`);
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
      const codes = [String(ua.ins), ...contracts.map((contract) => String(contract.ins))];
      seriesByIns = {};
      for (const group of chunks(codes, 100)) {
        const response = await fetch(`/api/dailies?ins=${encodeURIComponent(group.join(','))}&n=0`);
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
        for (const [ins, result] of Object.entries(payload)) seriesByIns[ins] = result.rows || [];
      }
      const dates = (seriesByIns[String(ua.ins)] || []).map((row) => normalizeHistoryDate(row.date)).filter(Boolean).sort((a, b) => a - b);
      if (!dates.length) throw new Error('برای نماد پایه تاریخچه‌ای دریافت نشد');
      const options = dates.map((date) => `<option value="${date}">${dateLabel(date)}</option>`).join('');
      $('ov-from').innerHTML = options; $('ov-to').innerHTML = options;
      $('ov-from').disabled = false; $('ov-to').disabled = false;
      $('ov-from').value = String(dates[Math.max(0, dates.length - 20)]); $('ov-to').value = String(dates.at(-1));
      computeDaily();
    } catch (error) { setStatus(errorText(error, 'تاریخچه دریافت نشد.'), true); }
    finally { $('ov-load').disabled = false; }
  }

  async function loadIntraday() {
    if (!daily) return;
    const dates = chosenDates(), requests = [], seen = new Set();
    const add = (ins, date) => { const key = `${date}:${ins}`; if (!seen.has(key)) { seen.add(key); requests.push({ ins: String(ins), date: String(date) }); } };
    const optionIndexes = new Map(contracts.map((contract) => [String(contract.ins), indexHistory(seriesByIns[String(contract.ins)] || [])]));
    for (const date of dates) {
      add(ua.ins, date);
      for (const contract of contracts) {
        const row = optionIndexes.get(String(contract.ins))?.get(date);
        if ((Number(row?.value) > 0 || Number(row?.vol) > 0) && contract.size > 0) add(contract.ins, date);
      }
    }
    if (!requests.length) { setStatus('در این بازه ریزمعامله فعالی برای محاسبه پیدا نشد.', true); return; }
    if (requests.length > 1200) { setStatus(`این بازه ${fmt.int(requests.length)} قرارداد/روز دارد؛ بازه تاریخ را کوتاه‌تر کن (سقف ${fmt.int(1200)}).`, true); return; }
    setStatus(`در حال دریافت ${fmt.int(requests.length)} قرارداد/روز ریزمعامله…`); $('ov-intraday').disabled = true;
    try {
      const response = await fetch('/api/trades/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
      const tradesByKey = Object.fromEntries(Object.entries(payload.items || {}).map(([key, item]) => [key, item.rows || []]));
      intraday = analyzeIntradayOpenView({ ua, contracts, dates, tradesByKey, intervalMinutes: Number($('ov-interval').value), settings: settings() });
      intradayRelations = relationMatrix(intraday.rows);
      paint();
      const failed = Object.values(payload.items || {}).filter((item) => item.error).length;
      setStatus(`${fmt.int(intraday.rows.length)} سطل زمانی ساخته شد${failed ? `؛ ${fmt.int(failed)} درخواست فاقد داده بود` : ''}.`, !!failed);
    } catch (error) { setStatus(errorText(error, 'ریزمعامله دریافت نشد.'), true); }
    finally { $('ov-intraday').disabled = false; }
  }

  $('ov-load').addEventListener('click', loadDaily);
  $('ov-intraday').addEventListener('click', loadIntraday);
  $('ov-basis').addEventListener('change', () => { if (daily) computeDaily(); });
  $('ov-from').addEventListener('change', () => { if (daily) computeDaily(); });
  $('ov-to').addEventListener('change', () => { if (daily) computeDaily(); });
  $('ov-expiry').addEventListener('change', paint);
  $('ov-interval').addEventListener('change', () => { resetIntradayView(); paint(); });
  $('ov-excel').addEventListener('click', () => downloadOpenViewExcel({ ua, daily, intraday, dailyRelations, intradayRelations, basis: $('ov-basis').value, intervalMinutes: Number($('ov-interval').value) }));
  baseSelect.addEventListener('change', () => { ua = chain.get(baseSelect.value) || null; daily = null; intraday = null; $('ov-report').hidden = true; $('ov-excel').disabled = true; $('ov-intraday').disabled = true; });

  try {
    const response = await fetch('/api/history/universe'), payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || `HTTP ${response.status}`);
    chain = buildChain(payload.rows || []);
    const list = [...chain.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fa'));
    baseSelect.innerHTML = '<option value="">نماد پایه را انتخاب کن</option>' + list.map((item) => `<option value="${esc(item.ins)}">${esc(nameOf(item))} · ${fmt.int(item.contracts)} قرارداد · ${fmt.int(item.expiryList.length)} سررسید</option>`).join('');
    setStatus(`${fmt.int(list.length)} نماد پایه آماده است.`);
  } catch (error) { baseSelect.innerHTML = '<option value="">دریافت ناموفق</option>'; setStatus(errorText(error, 'نمادها دریافت نشد.'), true); }
}
