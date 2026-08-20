import { CATALOG, GROUPS, byId } from '/strategies/catalog.mjs';
import { buildChain } from '/core/chain.mjs';
import { feesOf } from '/core/settings.mjs';
import {
  HISTORY_BASES, flattenActiveContracts, generateHistoricalCombos, historyDateLabel,
  historyMarketMetrics, historyPrice, manualPriceCheck, normalizeHistoryDate,
  replayHistory, rollingEntryMatrix, holdingPeriodProfile, strategyLegSnapshots,
} from '/core/history.mjs';
import {
  replayIntraday, summarizeIntraday, inIntradaySession,
  bucketIntradayPath, intradayHoldingSummary, timeOfDayProfile, intradayEntryExitProfile,
  INTRADAY_START_SECOND, INTRADAY_END_SECOND,
} from '/core/backtest.mjs';
import { mountDateWheel } from '/ui/datewheel.mjs';
import { fmt, faDigits, signTone, ltr } from '/ui/fmt.mjs';
import { attachExportsIn } from '/ui/export.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[c]));
const nameOf = (entity, fallback = 'بدون نام') => {
  const value = String(entity?.name || '').trim();
  return value && value !== String(entity?.ins || '') ? value : fallback;
};
const dateLabel = (value) => faDigits(historyDateLabel(value));
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, index) => list.slice(index * size, (index + 1) * size));
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const LEG_COLORS = ['var(--accent)', 'var(--cmp1)', 'var(--cmp2)', 'var(--cmp3)', 'var(--cmp4)'];
const errorText = (error, fallback) => /fetch failed|network|failed to fetch/i.test(String(error?.message || error))
  ? 'اتصال به منبع داده برقرار نشد.' : (String(error?.message || '').trim() || fallback);
const clockLabel = (second) => {
  const value = Math.max(0, Math.trunc(Number(second) || 0));
  return `${String(Math.floor(value / 3600)).padStart(2, '0')}:${String(Math.floor((value % 3600) / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};
const ageLabel = (second) => Number.isFinite(Number(second)) ? `${fmt.int(second)} ثانیه` : '—';

function intradayChartRows(points, date) {
  return points.map((point) => {
    const row = { ...point, date, granularity: 'trade' };
    point.perLeg.forEach((leg, index) => {
      row[`legPnl${index}`] = leg.netPnl;
      row[`legPrice${index}`] = leg.pricePct;
      row[`legVolume${index}`] = leg.cumulativeVolume;
    });
    return row;
  });
}

function basisRail(id, selected = 'LAST') {
  return `<div class="backtest-basis" id="${id}" role="radiogroup" aria-label="مبنای قیمت">${HISTORY_BASES.map(([value, label]) => `<button type="button" data-basis="${value}" role="radio" aria-checked="${value === selected}">${label}</button>`).join('')}</div>`;
}

function setRail(host, value) {
  host.dataset.value = value;
  host.querySelectorAll('[data-basis]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.basis === value)));
}

function marketSnapshot(snapshots, selectedBasis, scope, manual = {}) {
  if (!snapshots?.length) return '<p class="empty-note">ابتدا یک ترکیب معتبر انتخاب کن.</p>';
  return `<div class="backtest-leg-markets">${snapshots.map((snapshot) => {
    const kind = snapshot.kind === 'call' ? 'اختیار خرید' : snapshot.kind === 'put' ? 'اختیار فروش' : 'نماد پایه';
    const prices = HISTORY_BASES.map(([basis, label]) => `<div data-active="${basis === selectedBasis}"><span>${label}</span><b>${fmt.money(snapshot.prices[basis])}</b></div>`).join('');
    const value = manual[snapshot.index];
    return `<article><div class="backtest-leg-market-head"><div><small>پای ${fmt.int(snapshot.index + 1)} · ${snapshot.side === 'buy' ? 'خرید' : 'فروش'} ${kind}</small><b>${esc(nameOf(snapshot, `پای ${snapshot.index + 1}`))}</b></div><span>${snapshot.kind === 'underlying' ? 'دارایی پایه' : `اعمال ${fmt.int(snapshot.strike)}`}</span></div><div class="backtest-price-grid">${prices}</div><div class="backtest-market-strip"><span>حجم <b>${fmt.int(snapshot.market.volume)}</b></span><span>معامله <b>${fmt.int(snapshot.market.trades)}</b></span><span>ارزش ${snapshot.market.valueEstimated ? 'تقریبی' : 'رسمی'} <b>${fmt.money(snapshot.market.value)}</b></span></div><label class="backtest-manual-price">قیمت دستی این پا<input type="number" min="0" step="any" inputmode="decimal" data-manual="${scope}" data-leg="${snapshot.index}" value="${value == null ? '' : esc(value)}" placeholder="خالی بماند = همان مبنای بالا"></label><p class="backtest-manual-note" data-manual-note="${scope}-${snapshot.index}"></p></article>`;
  }).join('')}</div>`;
}

/**
 * عنوان محور، افقی و عمودی.
 *
 * برچسب عددی و عنوان محور دو کار جدا می‌کنند: عدد را می‌خوانی، عنوان را یک
 * بار می‌بینی و می‌فهمی واحد چیست. بدون عنوان، «۱۲٬۵۰۰» می‌تواند ریال باشد
 * یا قرارداد یا درصد — و نمودار بی‌واحد، نموداری است که باید حدس بزنی.
 *
 * عنوان عمودی چرخانده می‌شود چون در قاب باریکِ سمت چپ افقی جا نمی‌شود؛
 * زاویه ‎−۹۰‎ است تا از پایین به بالا خوانده شود، همان قراردادی که همه‌جا هست.
 */
function axisTitles(xLabel, yLabel, geo) {
  const { W, H, L, R, T, B } = geo;
  const cx = L + (W - L - R) / 2;
  const cy = T + (H - T - B) / 2;
  return `${xLabel ? `<text class="axis-title" x="${cx}" y="${H - 6}" text-anchor="middle">${xLabel}</text>` : ''}
    ${yLabel ? `<text class="axis-title" x="${16}" y="${cy}" text-anchor="middle" transform="rotate(-90 16 ${cy})">${yLabel}</text>` : ''}`;
}

function chart(host, points, series, { money = false, count = false, timeScale = false, step = false, xLabel, yLabel } = {}) {
  const rows = points.filter((point) => series.some((item) => Number.isFinite(Number(point[item.key]))));
  if (rows.length < 2) { host.innerHTML = '<p class="empty-note">برای نمودار دست‌کم دو نقطه معتبر لازم است.</p>'; return; }
  const W = 900, H = 348, L = 104, R = 28, T = 28, B = 68;
  const values = rows.flatMap((row) => series.map((item) => Number(row[item.key])).filter(Number.isFinite));
  let lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  if (Math.abs(hi - lo) < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo = count ? 0 : lo - pad; hi += pad;
  const x = (row, index) => timeScale
    ? L + ((Math.max(INTRADAY_START_SECOND, Math.min(INTRADAY_END_SECOND, Number(row.second))) - INTRADAY_START_SECOND) / (INTRADAY_END_SECOND - INTRADAY_START_SECOND)) * (W - L - R)
    : L + (index / Math.max(1, rows.length - 1)) * (W - L - R);
  const y = (value) => T + ((hi - value) / (hi - lo)) * (H - T - B);
  const label = (value) => money ? fmt.money(value) : count ? fmt.int(value) : fmt.pct(value);
  const ticks = Array.from({ length: 5 }, (_, index) => lo + ((hi - lo) * index) / 4);
  // یک خط منطقی می‌تواند بین دو نام میدان تقسیم شده باشد (سطر روزانه
  // `baseCumulativePct`، سطر ریزمعامله `basePct`). آن‌ها هم‌رنگ‌اند چون یک
  // چیزند؛ پس راهنما هم باید یک چیپ نشان دهد، نه دو چیپ هم‌رنگ با دو نام.
  const legend = series.filter((item, index) => series.findIndex((other) => other.label === item.label) === index);
  // برچسب سری تا امروز رشته ثابتِ خودِ کد بود؛ حالا نام قرارداد بالادست هم
  // درونش می‌نشیند. هر جای دیگر این فایل نام را با esc می‌نویسد. اینجا هم
  // باید — و در خودِ chart، تا فراخوان بعدی نتواند دوباره فراموشش کند.
  const seriesLabel = (item) => esc(item.label);

  const timeTicks = timeScale ? [9 * 3600, 10 * 3600, 11 * 3600, 12 * 3600, INTRADAY_END_SECOND] : [];
  const seriesShape = (item) => {
    const values = rows.map((row, index) => Number.isFinite(Number(row[item.key])) ? { x: x(row, index), y: y(Number(row[item.key])) } : null).filter(Boolean);
    if (!values.length) return '';
    if (!step) return `<polyline fill="none" stroke="${item.color}" points="${values.map((point) => `${point.x},${point.y}`).join(' ')}"/>`;
    const d = values.slice(1).reduce((path, point) => `${path} H ${point.x} V ${point.y}`, `M ${values[0].x} ${values[0].y}`);
    return `<path fill="none" stroke="${item.color}" d="${d}"/>`;
  };

  host.innerHTML = `<div class="backtest-chart-legend">${legend.map((item) => `<span style="--series:${item.color}"><i></i>${seriesLabel(item)}</span>`).join('')}</div><div class="backtest-chart-stage"><svg viewBox="0 0 ${W} ${H}" tabindex="0" aria-label="نمودار تعاملی بک‌تست">
    ${ticks.map((value) => `<line x1="${L}" x2="${W - R}" y1="${y(value)}" y2="${y(value)}" class="backtest-grid"/><text x="${L - 10}" y="${y(value) + 4}" text-anchor="end">${label(value)}</text>`).join('')}
    ${timeTicks.map((second) => `<line x1="${x({ second }, 0)}" x2="${x({ second }, 0)}" y1="${T}" y2="${H - B}" class="backtest-time-grid"/><text x="${x({ second }, 0)}" y="${H - B + 22}" text-anchor="middle">${faDigits(clockLabel(second).slice(0, 5))}</text>`).join('')}
    <line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="backtest-zero"/>
    ${axisTitles(
      xLabel ?? (timeScale ? 'ساعت جلسه — ۹:۰۰ تا ۱۲:۳۰' : 'مسیر زمانی'),
      yLabel ?? (money ? 'ریال' : count ? 'تعداد' : 'درصد'),
      { W, H, L, R, T, B })}
    ${series.map(seriesShape).join('')}
    <g class="backtest-cursor" hidden><line y1="${T}" y2="${H - B}"/><g></g></g>
    <rect class="backtest-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}"/>
  </svg><div class="backtest-tip" hidden></div></div>`;
  const svg = host.querySelector('svg'), cursor = host.querySelector('.backtest-cursor'), tip = host.querySelector('.backtest-tip');
  const show = (index, clientX, clientY) => {
    const row = rows[index], px = x(row, index);
    cursor.hidden = false;
    cursor.querySelector('line').setAttribute('x1', px); cursor.querySelector('line').setAttribute('x2', px);
    cursor.querySelector('g').innerHTML = series.map((item) => Number.isFinite(Number(row[item.key])) ? `<circle cx="${px}" cy="${y(Number(row[item.key]))}" r="4" fill="${item.color}"/>` : '').join('');
    const when = row.granularity === 'trade' ? `${dateLabel(row.date)} · ${faDigits(row.timeLabel)}` : faDigits(row.dateLabel || historyDateLabel(row.date));
    tip.innerHTML = `<b>${when}</b>${series.map((item) => Number.isFinite(Number(row[item.key])) ? `<span style="--series:${item.color}"><i></i>${seriesLabel(item)}: <strong class="${signTone(row[item.key])}">${label(row[item.key])}</strong></span>` : '').join('')}`;
    tip.hidden = false;
    const box = host.getBoundingClientRect();
    tip.style.left = `${Math.max(8, Math.min(box.width - 190, clientX - box.left + 12))}px`;
    tip.style.top = `${Math.max(8, clientY - box.top - 75)}px`;
  };
  const move = (event) => {
    const rect = svg.getBoundingClientRect();
    const ux = ((event.clientX - rect.left) / rect.width) * W;
    let index;
    if (timeScale) {
      const target = INTRADAY_START_SECOND + ((ux - L) / (W - L - R)) * (INTRADAY_END_SECOND - INTRADAY_START_SECOND);
      let low = 0, high = rows.length - 1;
      while (low < high) { const middle = Math.floor((low + high) / 2); if (rows[middle].second < target) low = middle + 1; else high = middle; }
      index = low > 0 && Math.abs(rows[low - 1].second - target) < Math.abs(rows[low].second - target) ? low - 1 : low;
    } else index = Math.round(((ux - L) / (W - L - R)) * (rows.length - 1));
    index = Math.max(0, Math.min(rows.length - 1, index));
    show(index, event.clientX, event.clientY);
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', () => { cursor.hidden = true; tip.hidden = true; });
}

export async function mount(root, { state }) {
  root.innerHTML = `<section class="backtest-hero"><div><p class="eyebrow">بعد از ماتریس‌ها · آزمون یک مسیر مشخص</p><h1>بک‌تست سریع</h1><p>یک استراتژی را با قیمت مشاهده‌شده روز ورود بچین، مسیر روزانه را ببین و روز سنجش را با ریزمعامله‌های واقعی همان روز بازپخش کن.</p></div><span>بدون قیمت ساختگی</span></section>
  <section class="card backtest-setup"><div class="section-head"><div><p class="eyebrow">گام اول</p><h2>انتخاب سناریو</h2></div><b id="bt-status" role="status">در حال دریافت نمادها…</b></div>
    <div class="backtest-form"><label>نماد پایه<select id="bt-base"><option value="">در حال دریافت…</option></select></label><label>استراتژی<select id="bt-strategy"></select></label><label>تعداد واحد<input id="bt-units" type="number" min="1" max="10000" step="1" value="${Math.max(1, state.settings.qtyDefault || 1)}"></label><button type="button" class="primary" id="bt-load">دریافت روزهای قابل اجرا</button></div>
  </section>
  <section id="bt-work" hidden>
    <div class="backtest-date-grid"><section class="card"><div class="section-head"><div><p class="eyebrow">روز ایجاد</p><h2>تاریخ ورود</h2></div><span>فقط روز دارای ترکیب معتبر</span></div><div id="bt-entry-date"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">روز سنجش</p><h2>تاریخ خروج آزمایشی</h2></div><span>فقط روز دارای قیمت همه پاها</span></div><div id="bt-exit-date"></div></section></div>
    <section class="card"><div class="section-head"><div><p class="eyebrow">قراردادهای واقعی</p><h2>ترکیب استراتژی</h2></div><span id="bt-combo-count">—</span></div><label class="backtest-combo">ترکیب قراردادها<select id="bt-combo"></select></label><div id="bt-legs" class="backtest-legs"></div></section>
    <div class="backtest-date-grid"><section class="card"><div class="section-head"><div><p class="eyebrow">دکمه ریلی ورود</p><h2>قیمت پاها در روز ایجاد</h2></div><span>هر کارت یک پای استراتژی</span></div>${basisRail('bt-entry-basis', 'LAST')}<div id="bt-entry-market"></div></section>
    <section class="card"><div class="section-head"><div><p class="eyebrow">دکمه ریلی سنجش</p><h2>قیمت پاها در روز خروج</h2></div><span>همان قراردادهای ترکیب</span></div>${basisRail('bt-exit-basis', 'LAST')}<div id="bt-exit-market"></div></section></div>
    <section class="card backtest-runbar"><p id="bt-run-note">برای هر ثانیهٔ معامله بین ۹:۰۰ تا ۱۲:۳۰، آخرین قیمت مشاهده‌شده تمام پاها روی یک خط زمانی مشترک قرار می‌گیرد. این ارزش‌گذاری مشاهده‌ای است و تضمین اجرای هم‌زمان نیست.</p><button type="button" class="primary" id="bt-run">اجرای بک‌تست</button></section>
    <section id="bt-result" hidden>
      <section class="card backtest-overview"><div class="section-head"><div><p class="eyebrow">گام اول نتیجه</p><h2>عملکرد کلی این بازه</h2></div><span id="bt-overview-range">—</span></div>
        <div class="backtest-kpis" id="bt-kpis"></div>
        <div class="backtest-chart-grid"><section><div class="section-head"><h3>سود و زیان مبلغی</h3><span>ریال</span></div><div id="bt-money-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>بازده و تغییر نماد پایه</h3><span>درصد</span></div><div id="bt-return-chart" class="backtest-chart"></div></section></div>
      </section>

      <section class="card"><div class="section-head"><div><p class="eyebrow">گام دوم · از روز ورود تا روز خروج</p><h2>مسیر روزبه‌روز</h2></div><span id="bt-days-count">—</span></div>
        <p class="backtest-table-note">روی هر ردیف کلیک کن تا ریزمعامله‌های همان روز در کوچک‌ترین تایم‌فریم — ثانیه‌به‌ثانیه — با همان نمودارها و جدول‌ها باز شود.</p>
        <div id="bt-days-table" class="history-table-wrap"></div>
      </section>

      <section class="card backtest-intraday-panel"><div class="section-head"><div><p class="eyebrow">خط زمانی مشترک همه پاها</p><h2 id="bt-intraday-title">تحلیل درون‌روزی ۹:۰۰ تا ۱۲:۳۰</h2></div><div class="backtest-head-actions"><span id="bt-intraday-source">—</span><button type="button" id="bt-export-intraday">خروجی همه نقاط</button></div></div><div id="bt-intraday-kpis" class="backtest-kpis"></div>
        <div class="backtest-chart-grid"><section><div class="section-head"><h3>ارزش مشاهده‌شدهٔ موقعیت</h3><span>ریال · مرجع، نه قابل آفست</span></div><div id="bt-intraday-pnl-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>اثر خالص هر پا</h3><span>تفکیک ریالی</span></div><div id="bt-intraday-leg-chart" class="backtest-chart"></div></section></div>
        <div class="backtest-chart-grid"><section><div class="section-head"><h3>حرکت قیمت هر پا</h3><span>نسبت به اولین معامله همان پا</span></div><div id="bt-intraday-price-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>حجم تجمعی هر پا</h3><span>قرارداد</span></div><div id="bt-intraday-volume-chart" class="backtest-chart"></div></section></div>
        <div class="backtest-analysis-grid"><section><div class="section-head"><h3>پنجره‌های ۱۵ دقیقه‌ای</h3><span>دامنه و جریان آفست</span></div><div id="bt-interval-table" class="history-table-wrap"></div></section><section><div class="section-head"><h3>ماتریس هم‌حرکتی اثر پاها</h3><span>تغییرات نقطه‌به‌نقطه</span></div><div id="bt-correlation-table" class="history-table-wrap"></div><p id="bt-correlation-note" class="backtest-table-note"></p></section></div>
        <section class="backtest-tape"><div class="section-head"><div><h3>نوار مشترک قیمت و حجم</h3><p>نمودارها همه نقاط را دارند؛ جدول برای حفظ سرعت حداکثر ۳۰۰ نقطه را با فاصله یکنواخت نشان می‌دهد.</p></div><span id="bt-tape-count">—</span></div><div id="bt-tape-table" class="history-table-wrap"></div></section>
      </section>

      <section class="card backtest-timeframe"><div class="section-head"><div><p class="eyebrow">گام سوم · کل بازه روی تایم‌فریم دلخواه</p><h2>عملکرد کلی و به تفکیک پاها</h2></div><div class="backtest-head-actions"><label class="backtest-tf-field">تایم‌فریم<select id="bt-tf-size"><option value="60">۱ دقیقه</option><option value="300">۵ دقیقه</option><option value="900" selected>۱۵ دقیقه</option><option value="1800">۳۰ دقیقه</option><option value="3600">۶۰ دقیقه</option></select></label><button type="button" class="primary" id="bt-tf-run">تحلیل کل بازه</button></div></div>
        <p id="bt-tf-note" class="backtest-table-note">برای هر روز بازه، ریزمعامله همه پاها و نماد پایه جداگانه گرفته می‌شود؛ این یعنی چند ده درخواست. نتیجه فقط از ثانیه‌هایی ساخته می‌شود که هر پا دست‌کم یک معامله داشته باشد.</p>
        <p class="backtest-table-note">این مسیر از <b>آخرین معاملهٔ مشاهده‌شدهٔ هر پا</b> ساخته می‌شود، نه از مظنه تقاضا و عرضهٔ هم‌زمان. یعنی «ارزش موقعیت در آن لحظه»، نه «سودی که در آن لحظه می‌شد گرفت»: آفست واقعی، خرید روی عرضه و فروش روی تقاضاست و اسپرد هر دو پا را می‌پردازد. تابلو دفتر سفارش تاریخی نمی‌دهد، پس عدد اجرایی از این داده ساختنی نیست.</p>
        <div id="bt-tf-body" hidden>
          <div class="backtest-kpis" id="bt-tf-kpis"></div>
          <div class="backtest-chart-grid"><section><div class="section-head"><h3>آفست موقعیت در کل بازه</h3><span>ریال · هر نقطه یک سطل</span></div><div id="bt-tf-pnl-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>اثر خالص هر پا</h3><span>تفکیک ریالی</span></div><div id="bt-tf-leg-chart" class="backtest-chart"></div></section></div>
          <div class="backtest-chart-grid"><section><div class="section-head"><h3>بازده استراتژی و نماد پایه</h3><span>درصد</span></div><div id="bt-tf-return-chart" class="backtest-chart"></div></section><section><div class="section-head"><h3>قیمت نماد پایه</h3><span>ریال</span></div><div id="bt-tf-base-chart" class="backtest-chart"></div></section></div>
          <div class="backtest-analysis-grid"><section><div class="section-head"><h3>چه مدت در سود، چه مدت در زیان</h3><span>ثانیه مشاهده‌شده</span></div><div id="bt-tf-holding" class="history-table-wrap"></div></section><section><div class="section-head"><h3>رفتار هر بازه از روز</h3><span>تجمیع همه روزها</span></div><div id="bt-tf-timeofday" class="history-table-wrap"></div></section></div>
          <section class="backtest-tape"><div class="section-head"><div><h3>کِی وارد شوی و کِی خارج</h3><p id="bt-tf-matrix-note"></p></div><span id="bt-tf-matrix-best">—</span></div><div id="bt-tf-matrix" class="history-table-wrap"></div></section>
          <section class="backtest-tape"><div class="section-head"><div><h3>جدول سطل‌ها</h3><p>هر ردیف یک سطل زمانی با مشاهده واقعی. سطل بی‌معامله ساخته نشده است.</p></div><span id="bt-tf-count">—</span></div><div id="bt-tf-table" class="history-table-wrap"></div></section>
        </div>
      </section>

      <section class="card"><div class="section-head"><div><p class="eyebrow">اثر هر پایه</p><h2>جزئیات پاهای استراتژی در روز سنجش</h2></div><span id="bt-final-source">—</span></div><div id="bt-leg-table" class="history-table-wrap"></div></section>
      <section class="card backtest-matrix-link"><div class="section-head"><div><p class="eyebrow">رابطه با ماتریس ورود × خروج</p><h2>اعتبارسنجی افق کوتاه</h2></div></div><div id="bt-matrix-idea"></div></section>
    </section>
  </section>`;


  // هر ظرف جدول، دکمهٔ خروجی خودش را می‌گیرد. ظرف‌ها در همین قالب‌اند حتی
  // وقتی خالی‌اند، و خواندن لحظهٔ کلیک انجام می‌شود — پس یک بار کافی است.
  attachExportsIn(root, 'backtest');
  const $ = (id) => root.querySelector(`#${id}`);
  const status = $('bt-status'), baseSelect = $('bt-base'), strategySelect = $('bt-strategy');
  const entryRail = $('bt-entry-basis'), exitRail = $('bt-exit-basis');
  let chain = new Map(), ua = null, contracts = [], seriesByIns = {}, entryDates = [], combos = [], legs = null;
  let replay = null, intraday = [], intradayDate = null, exitDates = [];
  // ریزمعامله هر روز یک درخواست به‌ازای هر نماد است. کاربر می‌تواند بین
  // روزهای مسیر بالا و پایین برود، پس هر روزِ گرفته‌شده نگه داشته می‌شود؛
  // وگرنه هر کلیک همان درخواست‌ها را دوباره می‌فرستد.
  const tradesCache = new Map();
  // آخرین دریافتی که کش نشد — نتیجهٔ ناقص عمداً کش نمی‌شود، ولی پیام خطا
  // باید بداند چه شد.
  let lastDayFetch = null;
  let timeframeDays = [], timeframeSeconds = 900;
  // قیمت دستی به یک قرارداد و یک روز مشخص تعلق دارد. با عوض‌شدن ترکیب یا
  // تاریخ، عددی که کاربر وارد کرده دیگر مال آن قرارداد و آن روز نیست، پس
  // نگه‌داشتنش یعنی نسبت‌دادن یک قیمت به جایی که هرگز آنجا نبوده.
  let manualEntry = {}, manualExit = {};
  let entryWheel = null, exitWheel = null;
  const setStatus = (text, error = false) => { status.textContent = text; status.toggleAttribute('data-error', error); };

  for (const [group, title] of Object.entries(GROUPS)) {
    const optgroup = document.createElement('optgroup'); optgroup.label = title;
    for (const def of CATALOG.filter((item) => item.group === group && item.feasible)) {
      const option = document.createElement('option'); option.value = def.id; option.textContent = ltr(def.name); optgroup.appendChild(option);
    }
    strategySelect.appendChild(optgroup);
  }
  strategySelect.value = 'short-strangle';

  const rowAt = (ins, date) => (seriesByIns[String(ins)] || []).find((row) => normalizeHistoryDate(row.date) === Number(date));
  const comboLabel = (combo) => `${combo.legs.map((leg) => nameOf(leg, 'قرارداد')).join(' + ')} · اعمال ${combo.strikes.map((strike) => fmt.int(strike)).join(' / ')} · سررسید ${combo.expiries.map(dateLabel).join(' / ')}`;

  function renderCombo() {
    const index = Number($('bt-combo').value);
    manualEntry = {}; manualExit = {};
    legs = combos[index]?.legs || null;
    if (!legs) { $('bt-legs').innerHTML = '<p class="empty-note">ترکیب معتبری برای این روز و مبنای قیمت نیست.</p>'; return; }
    const entryDate = Number($('bt-entry-date').dataset.value), basis = entryRail.dataset.value || 'LAST';
    $('bt-legs').innerHTML = legs.map((leg, index) => {
      const row = rowAt(leg.ins, entryDate), market = historyMarketMetrics(row);
      return `<article><span>${faDigits(index + 1)} · ${leg.side === 'buy' ? 'خرید' : 'فروش'} ${leg.kind === 'call' ? 'اختیار خرید' : leg.kind === 'put' ? 'اختیار فروش' : 'نماد پایه'}</span><b>${esc(nameOf(leg, 'پایه'))}</b><small>اعمال ${leg.kind === 'underlying' ? '—' : fmt.int(leg.strike)} · نسبت ${fmt.num(leg.ratio)} · اندازه ${fmt.int(leg.size)}</small><small>قیمت ورود ${fmt.money(historyPrice(row, basis))} · حجم ${fmt.int(market.volume)} · ارزش ${fmt.money(market.value)}</small></article>`;
    }).join('');
    refreshExitDates();
  }

  function refreshCombos() {
    const entryDate = Number($('bt-entry-date').dataset.value);
    if (!entryDate) return;
    const generated = generateHistoricalCombos({ def: byId(strategySelect.value), ua, seriesByIns, startDate: entryDate, entryBasis: entryRail.dataset.value || 'LAST', settings: state.settings, filtered: true });
    combos = generated.combos || [];
    $('bt-combo').innerHTML = combos.length ? combos.slice(0, 1000).map((combo, index) => `<option value="${index}">${esc(comboLabel(combo))}</option>`).join('') : '<option value="">ترکیب معتبر پیدا نشد</option>';
    $('bt-combo-count').textContent = `${fmt.int(combos.length)} ترکیب قابل اجرا`;
    renderCombo();
  }

  function refreshExitDates() {
    if (!legs) return;
    const entryDate = Number($('bt-entry-date').dataset.value);
    const allBaseDates = (seriesByIns[String(ua.ins)] || []).map((row) => normalizeHistoryDate(row.date)).filter((date) => date >= entryDate);
    const maxDate = Math.min(Math.max(...allBaseDates), ...legs.filter((leg) => leg.kind !== 'underlying').map((leg) => normalizeHistoryDate(leg.expiry)));
    const result = replayHistory({ legs, seriesByIns, baseIns: String(ua.ins), startDate: entryDate, endDate: maxDate, entryBasis: entryRail.dataset.value || 'LAST', exitBasis: exitRail.dataset.value || 'LAST', units: 1, fees: feesOf(state.settings), settings: state.settings });
    exitDates = result.ok ? result.rows.filter((row) => row.status === 'ok').map((row) => row.date) : [];
    const selected = exitDates.includes(Number($('bt-exit-date').dataset.value)) ? Number($('bt-exit-date').dataset.value) : exitDates[Math.min(exitDates.length - 1, 4)];
    exitWheel = mountDateWheel($('bt-exit-date'), exitDates, selected, () => { manualExit = {}; paintSnapshots(); }, { empty: 'روز دارای قیمت همه پاها پیدا نشد.' });
    paintSnapshots();
  }

  function paintSnapshots() {
    const entry = Number($('bt-entry-date').dataset.value), exit = Number($('bt-exit-date').dataset.value);
    $('bt-entry-market').innerHTML = marketSnapshot(strategyLegSnapshots(legs, seriesByIns, entry), entryRail.dataset.value || 'LAST', 'entry', manualEntry);
    $('bt-exit-market').innerHTML = marketSnapshot(strategyLegSnapshots(legs, seriesByIns, exit), exitRail.dataset.value || 'LAST', 'exit', manualExit);
    paintManualNotes();
  }

  const manualStore = (scope) => (scope === 'entry' ? manualEntry : manualExit);
  const manualDate = (scope) => Number($(scope === 'entry' ? 'bt-entry-date' : 'bt-exit-date').dataset.value);

  /**
   * پیام بازه برای هر قیمت دستی.
   *
   * بیرون بودن از کمترین تا بیشترین آن روز جلوی اجرا را نمی‌گیرد — کاربر حق
   * دارد سناریوی «اگر با این قیمت می‌بستم» را بسنجد. ولی بی‌صدا هم نمی‌ماند:
   * عددی که آن روز معامله نشده، ادعای اجراپذیری ندارد.
   */
  function paintManualNotes() {
    for (const scope of ['entry', 'exit']) {
      const date = manualDate(scope), store = manualStore(scope);
      for (const input of root.querySelectorAll(`[data-manual="${scope}"]`)) {
        const index = Number(input.dataset.leg);
        const note = root.querySelector(`[data-manual-note="${scope}-${index}"]`);
        if (!note) continue;
        const raw = store[index];
        const check = manualPriceCheck(rowAt(legs?.[index]?.ins, date), raw);
        note.dataset.state = check.status;
        note.textContent = check.status === 'empty' ? ''
          : check.status === 'unknown' ? 'کمترین و بیشترین آن روز برای این قرارداد موجود نیست، پس نمی‌دانیم این قیمت در بازه بوده یا نه.'
            : check.status === 'inside' ? `در بازه روز است (${fmt.money(check.low)} تا ${fmt.money(check.high)}).`
              : `در بازه روز نیست؛ بازه معامله‌شده ${fmt.money(check.low)} تا ${fmt.money(check.high)} بود. محاسبه با همین عدد ادامه می‌یابد.`;
      }
    }
  }

  function onManualInput(event) {
    const input = event.target.closest('[data-manual]');
    if (!input) return;
    const store = manualStore(input.dataset.manual), index = Number(input.dataset.leg);
    const raw = input.value.trim();
    if (raw === '' || !(Number(raw) > 0)) delete store[index]; else store[index] = Number(raw);
    paintManualNotes();
  }

  async function findExecutableDates() {
    const def = byId(strategySelect.value), basis = entryRail.dataset.value || 'LAST';
    const baseDates = (seriesByIns[String(ua.ins)] || []).map((row) => normalizeHistoryDate(row.date)).filter(Boolean);
    const found = [];
    for (let index = 0; index < baseDates.length; index++) {
      const date = baseDates[index];
      const generated = generateHistoricalCombos({ def, ua, seriesByIns, startDate: date, entryBasis: basis, settings: { ...state.settings, maxRows: 1 }, filtered: true });
      if (generated.combos.length) found.push(date);
      if (index % 10 === 0) { setStatus(`سنجش روزهای قابل اجرا: ${fmt.int(index + 1)} از ${fmt.int(baseDates.length)}`); await nextFrame(); }
    }
    return found;
  }

  async function loadHistory() {
    ua = chain.get(baseSelect.value);
    if (!ua) { setStatus('ابتدا نماد پایه را انتخاب کن.', true); return; }
    contracts = flattenActiveContracts(ua, state.settings.blockedExpiries);
    const codes = [...new Set([String(ua.ins), ...contracts.map((contract) => String(contract.ins))])];
    $('bt-load').disabled = true; setStatus(`دریافت تاریخچه ${fmt.int(codes.length)} نماد…`);
    try {
      const payloads = await Promise.all(chunks(codes, 70).map(async (part) => {
        const response = await fetch(`/api/dailies?ins=${part.join(',')}&n=0`), payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error || 'تاریخچه دریافت نشد');
        return payload;
      }));
      seriesByIns = {};
      for (const payload of payloads) for (const [ins, value] of Object.entries(payload)) seriesByIns[ins] = value.rows || [];
      entryDates = await findExecutableDates();
      if (!entryDates.length) throw new Error('با این نماد و استراتژی روز قابل‌اجرایی پیدا نشد');
      $('bt-work').hidden = false;
      const selected = entryDates[Math.max(0, entryDates.length - 10)];
      entryWheel = mountDateWheel($('bt-entry-date'), entryDates, selected, () => refreshCombos(), { empty: 'روز قابل‌اجرا پیدا نشد.' });
      refreshCombos(); setStatus(`${fmt.int(entryDates.length)} روز قابل اجرا آماده است.`);
    } catch (error) { setStatus(errorText(error, 'تاریخچه دریافت نشد.'), true); } finally { $('bt-load').disabled = false; }
  }

  async function fetchTrades(ins, date) {
    const response = await fetch(`/api/trades?ins=${encodeURIComponent(ins)}&date=${date}`), payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'ریزمعامله دریافت نشد');
    return payload.rows || [];
  }

  /**
   * ریزمعامله یک روز را برای همه پاها و نماد پایه می‌گیرد.
   *
   * پایی که پاسخش نیامده، «بدون معامله» فرض نمی‌شود: نامش برمی‌گردد تا
   * فراخوان بتواند بگوید کدام پا داده ندارد. تفاوت «معامله نشده» با «نگرفتیم»
   * دقیقاً همان چیزی است که یک آفست دروغین می‌سازد.
   */
  async function fetchDayTrades(date, { force = false } = {}) {
    if (!force && tradesCache.has(date)) return tradesCache.get(date);
    const codes = [...new Set([...legs.map((leg) => String(leg.ins)), String(ua.ins)])];
    const fetched = await Promise.allSettled(codes.map(async (ins) => [ins, await fetchTrades(ins, date)]));
    const byIns = Object.fromEntries(fetched.filter((item) => item.status === 'fulfilled').map((item) => item.value));
    const failed = fetched.map((item, index) => item.status === 'rejected' ? codes[index] : null).filter(Boolean);
    const result = { byIns, failed, date };
    // نتیجهٔ ناقص کش نمی‌شود.
    //
    // پیش از این هر نتیجه‌ای کش می‌شد، حتی وقتی درخواستِ یکی از پاها شکست
    // خورده بود. یعنی یک خطای گذرای بالادست — سهمیه، مهلت، ۵۰۲ — آن روز را
    // تا پایان نشست قفل می‌کرد: هر بار باز کردنش همان نتیجهٔ خرابِ کش‌شده
    // را برمی‌گرداند و کاربر می‌دید روزی وسط مسیر خالی است در حالی که روز
    // قبل و بعدش سالم‌اند. دقیقاً همان چیزی که گزارش شد.
    lastDayFetch = result;
    if (!requiredMissing(failed).length) tradesCache.set(date, result);
    return result;
  }

  /**
   * کدام پا در بازهٔ جلسه اصلاً معامله نشده.
   *
   * این با «دریافت نشد» یکی نیست و پیام باید فرقشان را بگوید: یکی واقعیت
   * بازار است (قرارداد بی‌رمق)، دیگری خرابی ماست. تا امروز هر دو یک جملهٔ
   * واحد می‌گرفتند و کاربر نمی‌دانست باید دوباره تلاش کند یا نه.
   */
  function legsWithoutTrades(byIns) {
    const out = [];
    legs.forEach((leg, index) => {
      const rows = byIns[String(leg.ins)] || [];
      const inSession = rows.filter((t) => !t.canceled && Number(t.price) > 0 && inIntradaySession(t.time));
      if (!inSession.length) out.push(nameOf(leg, `پای ${faDigits(index + 1)}`));
    });
    return out;
  }

  const requiredMissing = (failed) => {
    const required = new Set(legs.map((leg) => String(leg.ins)));
    return failed.filter((ins) => required.has(ins));
  };

  function tradeWarningText({ byIns, failed }) {
    const missing = requiredMissing(failed);
    if (missing.length) return `ریزمعامله ${fmt.int(missing.length)} پای استراتژی دریافت نشد`;
    if (failed.length) return 'ریزمعامله نماد پایه دریافت نشد';
    return Object.values(byIns).some((rows) => rows.length) ? '' : 'برای این روز هیچ ریزمعامله‌ای برنگشت';
  }

  /** ریزمعامله یک روز از مسیر را باز می‌کند و پنل درون‌روزی را روی همان روز می‌نشاند. */
  async function openDayIntraday(date, { scroll = true } = {}) {
    if (!replay?.ok || !legs) return;
    setStatus(`دریافت ریزمعامله ${dateLabel(date)}…`);
    try {
      const day = await fetchDayTrades(date);
      intradayDate = date;
      intraday = replayIntraday({ replay, tradesByIns: day.byIns, baseTrades: day.byIns[String(ua.ins)] || [], fees: feesOf(state.settings) });
      const warning = tradeWarningText(day);
      paintIntradayAnalysis();
      paintDayTable();
      setStatus(warning
        ? `ریزمعامله ${dateLabel(date)}: ${warning}.`
        : `${fmt.int(intraday.length)} نقطه مشترک درون‌روزی برای ${dateLabel(date)} ساخته شد.`, Boolean(warning));
      if (scroll) $('bt-intraday-title').closest('section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setStatus(errorText(error, 'ریزمعامله دریافت نشد.'), true); }
  }

  /** جدول روزبه‌روز مسیر؛ هر ردیف دروازه ورود به ریزمعامله همان روز است. */
  function paintDayTable() {
    const rows = replay.rows;
    const legHeads = replay.priced.map((leg, index) => `<th>${faDigits(index + 1)} · ${esc(nameOf(leg, `پای ${index + 1}`))}</th>`).join('');
    $('bt-days-count').textContent = `${fmt.int(rows.filter((row) => row.status === 'ok').length)} روز معتبر از ${fmt.int(rows.length)} روز`;
    $('bt-days-table').innerHTML = `<table class="history-table"><thead><tr><th>روز</th><th>پایانی پایه</th><th>تغییر روز</th><th>تغییر از ورود</th>${legHeads}<th>سود ناخالص</th><th>کارمزد</th><th>سود خالص</th><th>تغییر روز</th><th>بازده</th><th>افت از قله</th><th>وجه تضمین خالص</th><th>وضعیت</th></tr></thead><tbody>${rows.map((row) => {
      const legCells = row.perLeg.map((leg) => `<td><b>${Number.isFinite(leg.exitPrice) ? fmt.money(leg.exitPrice) : '—'}</b><small class="${signTone(leg.netPnl)}">اثر ${Number.isFinite(leg.netPnl) ? fmt.money(leg.netPnl) : '—'}</small><small>حجم ${fmt.int(leg.volume)}</small></td>`).join('');
      const statusText = row.status === 'ok' ? 'معتبر'
        : row.status === 'liquidity' ? 'حذف نقدشوندگی'
          : `فاقد داده · پای ${faDigits((row.missingLegs || []).map((index) => index + 1).join('،'))}`;
      return `<tr data-day="${row.date}" tabindex="0" aria-selected="${row.date === intradayDate}" class="${row.status === 'missing' ? 'history-missing' : row.status === 'liquidity' ? 'history-liquidity' : ''}">
        <td><b>${esc(row.dayName)}</b><small>${dateLabel(row.date)} · روز ${fmt.int(row.holdingDays)}</small></td>
        <td>${fmt.money(row.baseClose)}</td><td class="${signTone(row.baseDailyPct)}">${fmt.pct(row.baseDailyPct)}٪</td><td class="${signTone(row.baseCumulativePct)}">${fmt.pct(row.baseCumulativePct)}٪</td>
        ${legCells}
        <td>${Number.isFinite(row.grossPnl) ? fmt.money(row.grossPnl) : '—'}</td><td>${Number.isFinite(row.totalFees) ? fmt.money(row.totalFees) : '—'}</td>
        <td class="${signTone(row.netPnl)}">${Number.isFinite(row.netPnl) ? fmt.money(row.netPnl) : '—'}</td><td class="${signTone(row.pnlDelta)}">${Number.isFinite(row.pnlDelta) ? fmt.money(row.pnlDelta) : '—'}</td>
        <td class="${signTone(row.returnPct)}">${Number.isFinite(row.returnPct) ? fmt.pct(row.returnPct) : '—'}٪</td><td class="${signTone(row.drawdown)}">${Number.isFinite(row.drawdown) ? fmt.money(row.drawdown) : '—'}</td>
        <td>${row.marginNet > 0 ? fmt.money(row.marginNet) : 'ندارد'}</td><td>${esc(statusText)}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  /**
   * چرا این روز خط زمانی مشترک ندارد.
   *
   * سه علت کاملاً متفاوت به یک نتیجه می‌رسند و تا امروز هر سه یک جملهٔ واحد
   * می‌گرفتند: «قیمت تمام پاها کامل نشده است». آن جمله برای دو تای اول
   * دروغ است — خرابیِ ما را به‌عنوان واقعیتِ بازار گزارش می‌کرد.
   */
  function intradayGap(day) {
    if (!day) return null;
    const missing = requiredMissing(day.failed || []);
    if (missing.length) {
      return { kind: 'fetch', text: `ریزمعاملهٔ ${fmt.int(missing.length)} پا از بالادست دریافت نشد. این خرابیِ دریافت است، نه نبودِ معامله.` };
    }
    if (day.failed?.length) {
      return { kind: 'fetch-base', text: 'ریزمعاملهٔ نماد پایه دریافت نشد؛ تغییر پایه در این نما نمی‌آید.' };
    }
    const quiet = legsWithoutTrades(day.byIns || {});
    if (quiet.length) {
      return { kind: 'quiet', text: `در بازهٔ ۹:۰۰ تا ۱۲:۳۰ این روز، ${quiet.map((n) => `«${esc(n)}»` ).join(' و ')} هیچ معامله‌ای نداشت. خط زمانی مشترک وقتی ساخته می‌شود که هر پا دست‌کم یک معامله داشته باشد.` };
    }
    return { kind: 'partial', text: 'معامله‌ها هست ولی هیچ ثانیه‌ای پیدا نشد که قیمت همهٔ پاها با هم مشاهده شده باشد.' };
  }

  function paintIntradayAnalysis() {
    const summary = summarizeIntraday(intraday);
    // عنوان باید بگوید کدام روز؛ کاربر می‌تواند هر روز مسیر را باز کند و
    // بدون تاریخ، همه این نمودارها شبیه هم‌اند.
    $('bt-intraday-title').textContent = intradayDate
      ? `ریزمعامله ${dateLabel(intradayDate)} · ۹:۰۰ تا ۱۲:۳۰`
      : 'تحلیل درون‌روزی ۹:۰۰ تا ۱۲:۳۰';
    const hosts = ['bt-intraday-pnl-chart', 'bt-intraday-leg-chart', 'bt-intraday-price-chart', 'bt-intraday-volume-chart', 'bt-interval-table', 'bt-correlation-table', 'bt-tape-table'];
    if (!summary.points) {
      const gap = intradayGap(tradesCache.get(intradayDate) || lastDayFetch);
      const retry = gap && gap.kind.startsWith('fetch')
        ? '<button type="button" class="ghost" id="bt-intraday-retry">تلاش دوباره</button>' : '';
      $('bt-intraday-source').textContent = gap?.kind === 'quiet' ? 'پای بی‌معامله' : 'فاقد خط زمانی کامل';
      $('bt-intraday-kpis').innerHTML = '';
      $('bt-tape-count').textContent = '—';
      $('bt-correlation-note').textContent = '';
      const msg = `<p class="empty-note">${gap?.text || 'برای این روز خط زمانی مشترکی ساخته نشد.'} ${retry}</p>`;
      hosts.forEach((id) => { $(id).innerHTML = id === hosts[0] ? msg : `<p class="empty-note">${gap?.text || 'داده‌ای برای رسم نیست.'}</p>`; });
      $('bt-intraday-retry')?.addEventListener('click', () => {
        tradesCache.delete(intradayDate);
        openDayIntraday(intradayDate, { scroll: false });
      });
      return;
    }

    const rows = intradayChartRows(intraday, replay.endDate);
    const legSeries = summary.legs.map((leg, index) => ({ key: `legPnl${index}`, label: `${faDigits(index + 1)} · ${nameOf(leg, 'پا')}`, color: LEG_COLORS[index % LEG_COLORS.length] }));
    const priceSeries = [
      { key: 'returnPct', label: 'بازده استراتژی از ورود', color: 'var(--gain)' },
      ...summary.legs.map((leg, index) => ({ key: `legPrice${index}`, label: `قیمت ${faDigits(index + 1)} · ${nameOf(leg, 'پا')}`, color: LEG_COLORS[index % LEG_COLORS.length] })),
    ];
    const volumeSeries = summary.legs.map((leg, index) => ({ key: `legVolume${index}`, label: `${faDigits(index + 1)} · ${nameOf(leg, 'پا')}`, color: LEG_COLORS[index % LEG_COLORS.length] }));
    $('bt-intraday-source').textContent = `${fmt.int(summary.points)} نقطه · ${faDigits(summary.first.timeLabel)} تا ${faDigits(summary.last.timeLabel)} · پنجره ${fmt.pct(summary.coveragePct)}٪ جلسه`;
    const cards = [
      ['آفست پایان مشاهده', fmt.money(summary.last.netPnl), signTone(summary.last.netPnl)],
      ['بازده پایان مشاهده', `${fmt.pct(summary.last.returnPct)}٪`, signTone(summary.last.returnPct)],
      ['بهترین لحظه', `${fmt.money(summary.best.netPnl)} · ${faDigits(summary.best.timeLabel)}`, 'gain'],
      ['بدترین لحظه', `${fmt.money(summary.worst.netPnl)} · ${faDigits(summary.worst.timeLabel)}`, 'loss'],
      ['بیشترین افت از قله', fmt.money(summary.maxDrawdown), signTone(summary.maxDrawdown)],
      ['زمان مشاهده‌شده در سود', `${fmt.pct(summary.positiveTimePct)}٪`, signTone(summary.positiveTimePct)],
      ['زمان با تازگی همه پاها', `${fmt.pct(summary.freshTimePct)}٪`, ''],
      ['بیشترین سن پا در پایان', ageLabel(summary.last.maxAgeSec), summary.last.allFresh ? 'gain' : 'loss'],
    ];
    $('bt-intraday-kpis').innerHTML = cards.map(([label, value, tone]) => `<article class="${tone}"><span>${label}</span><b>${value}</b></article>`).join('');
    chart($('bt-intraday-pnl-chart'), rows, [{ key: 'netPnl', label: 'سود و زیان خالص کل', color: 'var(--accent)' }], { money: true, timeScale: true, step: true });
    chart($('bt-intraday-leg-chart'), rows, legSeries, { money: true, timeScale: true, step: true });
    chart($('bt-intraday-price-chart'), rows, priceSeries, { timeScale: true, step: true });
    chart($('bt-intraday-volume-chart'), rows, volumeSeries, { count: true, timeScale: true, step: true });

    $('bt-interval-table').innerHTML = `<table class="history-table backtest-compact-table"><thead><tr><th>بازه</th><th>ابتدا</th><th>انتها</th><th>بیشینه</th><th>کمینه</th><th>تغییر</th><th>حجم پاها</th><th>نقاط تازه</th></tr></thead><tbody>${summary.intervals.map((row) => `<tr><td>${faDigits(clockLabel(row.startSecond).slice(0, 5))}–${faDigits(clockLabel(row.endSecond).slice(0, 5))}</td><td class="${signTone(row.openPnl)}">${fmt.money(row.openPnl)}</td><td class="${signTone(row.closePnl)}">${fmt.money(row.closePnl)}</td><td class="gain">${fmt.money(row.highPnl)}</td><td class="loss">${fmt.money(row.lowPnl)}</td><td class="${signTone(row.changePnl)}">${fmt.money(row.changePnl)}</td><td>${row.observations ? `${fmt.int(row.volume)} · ${fmt.int(row.trades)} معامله` : 'فاقد مشاهده'}</td><td>${row.observations ? `${fmt.pct(row.freshPct)}٪` : '—'}</td></tr>`).join('')}</tbody></table>`;

    const legHeads = summary.legs.map((leg, index) => `<th>${faDigits(index + 1)} · ${esc(nameOf(leg, 'پا'))}</th>`).join('');
    $('bt-correlation-table').innerHTML = `<table class="history-table backtest-correlation"><thead><tr><th>پا</th>${legHeads}</tr></thead><tbody>${summary.legs.map((leg, row) => `<tr><th>${faDigits(row + 1)} · ${esc(nameOf(leg, 'پا'))}</th>${summary.correlation[row].map((value) => `<td data-correlation="${Number.isFinite(value) ? Math.abs(value).toFixed(2) : ''}" class="${signTone(value)}">${fmt.num(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    // توضیح ماتریس بیرون از جعبه پیمایش می‌نشیند. اگر داخلش باشد با جدول
    // ۹۲۰ پیکسلی افقی کشیده و از دید کاربر بیرون می‌رود — و این جمله دقیقاً
    // همان چیزی است که «مقدار نامعلوم» را از «همبستگی صفر» جدا می‌کند.
    $('bt-correlation-note').textContent = 'همبستگی از تغییر اثر خالص پاها بین نقاط پیاپی محاسبه می‌شود؛ مقدار نامعلوم یعنی تغییر مشترک کافی وجود نداشته است.';

    const maxTape = 300, stride = Math.max(1, Math.ceil(intraday.length / maxTape));
    const tape = intraday.filter((_, index) => index % stride === 0 || index === intraday.length - 1);
    $('bt-tape-count').textContent = `${fmt.int(tape.length)} از ${fmt.int(intraday.length)} نقطه`;
    const tapeHeads = summary.legs.map((leg, index) => `<th>قیمت پای ${faDigits(index + 1)}</th><th>حجم ثانیه/تجمعی</th><th>سن</th>`).join('');
    $('bt-tape-table').innerHTML = `<table class="history-table backtest-tape-table"><thead><tr><th>زمان</th><th>آفست</th><th>بازده</th><th>قیمت پایه</th><th>سن بیشینه</th>${tapeHeads}</tr></thead><tbody>${tape.map((row) => `<tr data-fresh="${row.allFresh}"><td>${faDigits(row.timeLabel)}</td><td class="${signTone(row.netPnl)}">${fmt.money(row.netPnl)}</td><td class="${signTone(row.returnPct)}">${fmt.pct(row.returnPct)}٪</td><td>${fmt.money(row.basePrice)}</td><td>${ageLabel(row.maxAgeSec)}</td>${row.perLeg.map((leg) => `<td>${fmt.money(leg.exitPrice)}</td><td>${fmt.int(leg.secondVolume)} / ${fmt.int(leg.cumulativeVolume)}</td><td>${ageLabel(leg.ageSec)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function exportIntraday() {
    if (!intraday.length || !replay) return;
    const headers = ['زمان', 'سود و زیان خالص', 'بازده درصد', 'قیمت نماد پایه', 'تغییر نماد پایه درصد', 'بیشترین سن ثانیه'];
    replay.priced.forEach((leg, index) => headers.push(`پای ${index + 1} قیمت`, `پای ${index + 1} حجم ثانیه`, `پای ${index + 1} حجم تجمعی`, `پای ${index + 1} اثر خالص`, `پای ${index + 1} سن ثانیه`));
    const lines = [headers, ...intraday.map((row) => {
      const values = [row.timeLabel, row.netPnl, row.returnPct, row.basePrice, row.basePct, row.maxAgeSec];
      row.perLeg.forEach((leg) => values.push(leg.exitPrice, leg.secondVolume, leg.cumulativeVolume, leg.netPnl, leg.ageSec));
      return values;
    })].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(','));
    const href = URL.createObjectURL(new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = href; link.download = `intraday-${intradayDate || replay.endDate}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }

  /**
   * عملکرد کل بازه، در تفکیک روزانه.
   *
   * این بخش عمداً ریزمعامله را وارد نمی‌کند. قبلاً یک کشوی «نمای مسیر» سه
   * حالت داشت و حالت پیش‌فرضش روزهای پیش از روزِ بازشده را با ثانیه‌های
   * همان روز می‌چسباند. دو ایراد داشت که هر دو بی‌صدا بودند:
   *
   *   ۱. محور افقی بر پایه اندیس است. چند صد نقطه ریزمعامله در کنار چند ده
   *      روز، بخش روزانه را به یک نوار باریک تبدیل می‌کرد و شیب دو طرف مرز
   *      اصلاً با هم قابل مقایسه نبود.
   *   ۲. مسیر روی روزِ بازشده بریده می‌شد. پس «بهترین نقطه» و «بدترین نقطه»
   *      و «سود/زیان نهایی» با کلیک روی هر ردیف جدول روزبه‌روز عوض می‌شدند —
   *      در بخشی که عنوانش «عملکرد کلی این بازه» است.
   *
   * حالا این بخش همیشه کل بازه را در تفکیک روز نشان می‌دهد و به اینکه کدام
   * روز باز است کاری ندارد. لحظه‌به‌لحظهٔ یک روز کار پنل درون‌روزی است، که
   * همان داده را با محور ساعت و مسیر پله‌ای رسم می‌کند.
   */
  function paintOverview() {
    const path = replay.rows.filter((row) => row.status === 'ok').map((row) => ({ ...row, granularity: 'day' }));
    const final = replay.summary.last;
    const firstProfit = path.find((point) => point.netPnl > 0);
    const best = path.filter((point) => Number.isFinite(point.netPnl)).reduce((a, point) => !a || point.netPnl > a.netPnl ? point : a, null);
    const worst = path.filter((point) => Number.isFinite(point.netPnl)).reduce((a, point) => !a || point.netPnl < a.netPnl ? point : a, null);
    const firstLabel = firstProfit ? `${faDigits(firstProfit.dateLabel)} · روز ${fmt.int(firstProfit.holdingDays)}` : 'در این بازه رخ نداد';
    const cards = [
      ['سود/زیان نهایی', fmt.money(final?.netPnl), signTone(final?.netPnl)], ['بازده نهایی', fmt.pct(final?.returnPct), signTone(final?.returnPct)],
      ['تغییر نماد پایه', fmt.pct(final?.baseCumulativePct), signTone(final?.baseCumulativePct)], ['کوتاه‌ترین زمان سود', firstLabel, firstProfit ? 'gain' : ''],
      ['بهترین نقطه', best ? `${fmt.money(best.netPnl)} · ${fmt.pct(best.returnPct)}` : '—', 'gain'], ['بدترین نقطه', worst ? `${fmt.money(worst.netPnl)} · ${fmt.pct(worst.returnPct)}` : '—', 'loss'],
    ];
    $('bt-kpis').innerHTML = cards.map(([label, value, tone]) => `<article class="${tone}"><span>${label}</span><b>${value}</b></article>`).join('');
    chart($('bt-money-chart'), path, [{ key: 'netPnl', label: 'سود و زیان خالص', color: 'var(--accent)' }], { money: true });
    chart($('bt-return-chart'), path, [{ key: 'returnPct', label: 'بازده استراتژی', color: 'var(--accent)' }, { key: 'basePct', label: 'تغییر پایه', color: 'var(--cmp1)' }, { key: 'baseCumulativePct', label: 'تغییر پایه', color: 'var(--cmp1)' }]);
    $('bt-overview-range').textContent = `${dateLabel(replay.startDate)} تا ${dateLabel(replay.endDate)} · ${fmt.int(replay.summary.validDays)} روز معتبر`;
  }

  function paintResult() {
    paintOverview();
    paintDayTable();
    paintIntradayAnalysis();
    const lastDaily = replay.summary.last, lastTick = intraday.at(-1);
    const finalLegs = lastTick?.perLeg || lastDaily?.perLeg || [];
    const manualExitCount = Object.keys(replay.manualExit || {}).length;
    $('bt-final-source').textContent = lastTick
      ? `آخرین ریزمعامله کامل در ${faDigits(lastTick.timeLabel)}`
      : manualExitCount ? `قیمت روزانه انتخاب‌شده، با قیمت دستی ${fmt.int(manualExitCount)} پا` : 'قیمت روزانه انتخاب‌شده';
    $('bt-leg-table').innerHTML = `<table class="history-table"><thead><tr><th>پا</th><th>جهت</th><th>قیمت ورود</th><th>قیمت سنجش</th><th>اثر ناخالص</th><th>کارمزد</th><th>اثر خالص</th><th>حجم/ارزش روز</th></tr></thead><tbody>${finalLegs.map((leg, index) => {
      const dailyLeg = lastDaily?.perLeg?.[index];
      const activity = lastTick ? `حجم ${fmt.int(leg.cumulativeVolume)} · ${fmt.int(leg.tradeCount)} معامله · سن ${ageLabel(leg.ageSec)}` : `حجم ${fmt.int(dailyLeg?.volume)} · ارزش ${fmt.money(dailyLeg?.value)}`;
      return `<tr><td>${faDigits(index + 1)} · ${esc(nameOf(leg, `پای ${index + 1}`))}</td><td>${replay.priced[index]?.side === 'buy' ? 'خرید' : 'فروش'}</td><td>${fmt.money(leg.entryPrice)}</td><td>${fmt.money(leg.exitPrice)}</td><td class="${signTone(leg.grossPnl)}">${fmt.money(leg.grossPnl)}</td><td>${fmt.money((leg.entryFee || 0) + (leg.exitFee || 0))}</td><td class="${signTone(leg.netPnl)}">${fmt.money(leg.netPnl)}</td><td>${activity}</td></tr>`;
    }).join('')}</tbody></table>`;

    const args = { legs, seriesByIns, baseIns: String(ua.ins), startDate: entryDates[0], endDate: Number($('bt-exit-date').dataset.value), entryBasis: entryRail.dataset.value, exitBasis: exitRail.dataset.value, units: Math.max(1, Math.trunc(Number($('bt-units').value) || 1)), fees: feesOf(state.settings), settings: state.settings };
    const matrix = rollingEntryMatrix(args), profile = holdingPeriodProfile(matrix), recommended = profile.best;
    const selectedDays = Math.max(0, replay.rows.findIndex((row) => row.date === replay.endDate));
    $('bt-matrix-idea').innerHTML = recommended ? `<div class="backtest-matrix-kpis"><article><span>افق مقاوم ماتریس</span><b>${fmt.int(recommended.holdingTradingDays)} روز معاملاتی</b></article><article><span>میانه بازده آن افق</span><b class="${signTone(recommended.medianReturn)}">${fmt.pct(recommended.medianReturn)}</b></article><article><span>درصد نمونه‌های سودده</span><b>${fmt.pct(recommended.winPct)}</b></article><article><span>افق انتخابی این بک‌تست</span><b>${fmt.int(selectedDays)} روز معاملاتی</b></article></div><p>ماتریس فقط افق پرتکرار و کم‌پراکندگی را پیشنهاد می‌کند؛ این بک‌تست قرارداد، قیمت ورود، حجم و مسیر واقعی انتخاب‌شده را جداگانه می‌سنجد. یک خانه سبز به‌تنهایی «بهینه» نیست و ممکن است حاصل انتخاب پس‌نگر باشد.</p>` : '<p>برای این ترکیب نمونه کافی جهت پیشنهاد افق مقاوم ماتریس وجود ندارد؛ نتیجه همین مسیر را می‌بینی، بدون ادعای بهینه‌بودن.</p>';
  }

  // ═══════════ تحلیل کل بازه روی تایم‌فریم انتخابی ═══════════

  const TIMEFRAME_DAY_CAP = 45;
  const rangeLabel = (row) => `${faDigits(clockLabel(row.startSecond).slice(0, 5))}–${faDigits(clockLabel(row.endSecond).slice(0, 5))}`;

  /**
   * ریزمعامله همه روزهای معتبر مسیر را می‌گیرد.
   *
   * هر روز یک درخواست به‌ازای هر نماد است، پس پیشرفت گزارش می‌شود و سقفی
   * هست. روزی که برای همه پاها نقطه مشترک نساخته، اصلاً وارد تحلیل نمی‌شود
   * و تعدادش جدا گفته می‌شود — نه اینکه با صفر پر شود.
   */
  async function loadTimeframeDays() {
    const dates = replay.rows.filter((row) => row.status === 'ok').map((row) => row.date);
    const wanted = dates.slice(-TIMEFRAME_DAY_CAP);
    const out = [];
    let empty = 0;
    for (let index = 0; index < wanted.length; index++) {
      setStatus(`دریافت ریزمعامله ${fmt.int(index + 1)} از ${fmt.int(wanted.length)} روز…`);
      await nextFrame();
      const day = await fetchDayTrades(wanted[index]);
      const points = replayIntraday({ replay, tradesByIns: day.byIns, baseTrades: day.byIns[String(ua.ins)] || [], fees: feesOf(state.settings) });
      if (points.length) out.push({ date: wanted[index], points }); else empty += 1;
    }
    return { days: out, empty, skipped: dates.length - wanted.length };
  }

  function paintTimeframe(loaded) {
    const seconds = timeframeSeconds;
    const buckets = bucketIntradayPath(timeframeDays, { bucketSeconds: seconds });
    if (!buckets.length) {
      $('bt-tf-body').hidden = true;
      $('bt-tf-note').textContent = 'در هیچ روزی از این بازه، ثانیه‌ای پیدا نشد که همه پاها در آن قیمت مشاهده‌شده داشته باشند.';
      return;
    }
    $('bt-tf-body').hidden = false;
    const holding = intradayHoldingSummary(timeframeDays);
    const clock = timeOfDayProfile(timeframeDays, { bucketSeconds: seconds });
    const matrix = intradayEntryExitProfile(timeframeDays, { legs: replay.priced, bucketSeconds: seconds, fees: feesOf(state.settings) });

    $('bt-tf-note').textContent = `${fmt.int(timeframeDays.length)} روز با نقطه مشترک`
      + `${loaded?.empty ? ` · ${fmt.int(loaded.empty)} روز بدون نقطه مشترک کنار گذاشته شد` : ''}`
      + `${loaded?.skipped ? ` · ${fmt.int(loaded.skipped)} روز قدیمی‌تر به‌خاطر سقف ${fmt.int(TIMEFRAME_DAY_CAP)} روز بررسی نشد` : ''}`
      + ' · هر عدد فقط از معاملات واقعی همان سطل ساخته شده و هیچ قیمتی درون‌یابی نشده است.';

    const hours = (value) => `${fmt.num(value / 3600)} ساعت`;
    const cards = [
      ['زمان مشاهده‌شده', hours(holding.observedSeconds), ''],
      ['زمان در سود', `${fmt.pct(holding.positivePct)}٪ · ${hours(holding.positiveSeconds)}`, 'gain'],
      ['زمان در زیان', `${fmt.pct(holding.negativePct)}٪ · ${hours(holding.negativeSeconds)}`, 'loss'],
      ['روز سودده / زیان‌ده', `${fmt.int(holding.positiveDays)} / ${fmt.int(holding.negativeDays)}`, holding.positiveDays >= holding.negativeDays ? 'gain' : 'loss'],
      ['بهترین سطل', `${fmt.money(Math.max(...buckets.map((row) => row.highPnl)))}`, 'gain'],
      ['بدترین سطل', `${fmt.money(Math.min(...buckets.map((row) => row.lowPnl)))}`, 'loss'],
      ['بهترین بازه ورود', matrix.bestEntry ? `${faDigits(clockLabel(matrix.bestEntry.second).slice(0, 5))} · میانه ${fmt.money(matrix.bestEntry.medianPnl)}` : 'نمونه کافی نیست', matrix.bestEntry ? 'gain' : ''],
      ['بهترین بازه خروج', matrix.bestExit ? `${faDigits(clockLabel(matrix.bestExit.second).slice(0, 5))} · میانه ${fmt.money(matrix.bestExit.medianPnl)}` : 'نمونه کافی نیست', matrix.bestExit ? 'gain' : ''],
    ];
    $('bt-tf-kpis').innerHTML = cards.map(([label, value, tone]) => `<article class="${tone}"><span>${label}</span><b>${value}</b></article>`).join('');

    // نقاط نمودار: هر سطل یک نقطه. محور بر پایه اندیس است چون سطل‌ها چند روز
    // را پشت هم می‌چینند و ساعت واقعی در روز دوم دوباره از ۹:۰۰ شروع می‌شود.
    const points = buckets.map((row) => ({
      ...row, granularity: 'trade', timeLabel: rangeLabel(row),
      netPnl: row.closePnl, returnPct: row.returnPct,
      ...Object.fromEntries(row.perLeg.flatMap((leg, index) => [[`legPnl${index}`, leg.netPnl], [`legPrice${index}`, leg.price]])),
    }));
    const legSeries = replay.priced.map((leg, index) => ({ key: `legPnl${index}`, label: `${faDigits(index + 1)} · ${nameOf(leg, 'پا')}`, color: LEG_COLORS[index % LEG_COLORS.length] }));
    chart($('bt-tf-pnl-chart'), points, [{ key: 'netPnl', label: 'آفست موقعیت', color: 'var(--accent)' }], { money: true, step: true });
    chart($('bt-tf-leg-chart'), points, legSeries, { money: true, step: true });
    chart($('bt-tf-return-chart'), points, [{ key: 'returnPct', label: 'بازده استراتژی', color: 'var(--accent)' }, { key: 'basePct', label: 'تغییر نماد پایه', color: 'var(--cmp1)' }], { step: true });
    chart($('bt-tf-base-chart'), points, [{ key: 'basePrice', label: 'قیمت نماد پایه', color: 'var(--cmp2)' }], { money: true, step: true });

    $('bt-tf-holding').innerHTML = `<table class="history-table backtest-compact-table"><thead><tr><th>روز</th><th>نقطه</th><th>مشاهده‌شده</th><th>در سود</th><th>درصد در سود</th><th>باز</th><th>بسته</th><th>بیشینه</th><th>کمینه</th><th>بازده پایان</th><th>تغییر پایه</th></tr></thead><tbody>${holding.days.map((row) => `<tr><td>${dateLabel(row.date)}</td><td>${fmt.int(row.points)}</td><td>${hours(row.observedSeconds)}</td><td>${hours(row.positiveSeconds)}</td><td class="${signTone(row.positivePct - 50)}">${fmt.pct(row.positivePct)}٪</td><td class="${signTone(row.openPnl)}">${fmt.money(row.openPnl)}</td><td class="${signTone(row.closePnl)}">${fmt.money(row.closePnl)}</td><td class="gain">${fmt.money(row.bestPnl)}</td><td class="loss">${fmt.money(row.worstPnl)}</td><td class="${signTone(row.closeReturnPct)}">${fmt.pct(row.closeReturnPct)}٪</td><td class="${signTone(row.basePct)}">${fmt.pct(row.basePct)}٪</td></tr>`).join('')}</tbody></table>`;

    $('bt-tf-timeofday').innerHTML = `<table class="history-table backtest-compact-table"><thead><tr><th>بازه روز</th><th>روز</th><th>صعودی</th><th>نزولی</th><th>میانگین تغییر</th><th>میانه تغییر</th><th>یکنواختی جهت</th><th>میانگین حجم</th></tr></thead><tbody>${clock.map((row) => `<tr><td>${rangeLabel(row)}</td><td>${fmt.int(row.days)}</td><td class="gain">${fmt.int(row.upDays)}</td><td class="loss">${fmt.int(row.downDays)}</td><td class="${signTone(row.meanChange)}">${fmt.money(row.meanChange)}</td><td class="${signTone(row.medianChange)}">${fmt.money(row.medianChange)}</td><td>${fmt.pct(row.consistencyPct)}٪</td><td>${fmt.int(row.meanVolume)}</td></tr>`).join('')}</tbody></table>`;

    if (!matrix.cells.length) {
      $('bt-tf-matrix').innerHTML = '<p class="empty-note">برای ماتریس ورود×خروج، دست‌کم یک روز با دو بازه دارای معامله لازم است.</p>';
      $('bt-tf-matrix-best').textContent = '—';
      $('bt-tf-matrix-note').textContent = '';
    } else {
      const slots = matrix.slots;
      const byKey = new Map(matrix.cells.map((cell) => [`${cell.entrySecond}|${cell.exitSecond}`, cell]));
      const bound = Math.max(1, ...matrix.cells.map((cell) => Math.abs(cell.medianPnl)));
      $('bt-tf-matrix').innerHTML = `<table class="history-table backtest-correlation backtest-tf-matrix"><thead><tr><th>ورود \ خروج</th>${slots.map((second) => `<th>${faDigits(clockLabel(second).slice(0, 5))}</th>`).join('')}</tr></thead><tbody>${slots.map((entry) => `<tr><th>${faDigits(clockLabel(entry).slice(0, 5))}</th>${slots.map((exit) => {
        const cell = byKey.get(`${entry}|${exit}`);
        if (!cell) return '<td></td>';
        return `<td class="${signTone(cell.medianPnl)}" style="--weight:${Math.min(1, Math.abs(cell.medianPnl) / bound)}" title="میانه ${fmt.money(cell.medianPnl)} · میانگین ${fmt.money(cell.meanPnl)} · سودده ${fmt.pct(cell.winPct)}٪ · ${fmt.int(cell.samples)} روز">${fmt.money(cell.medianPnl)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
      $('bt-tf-matrix-best').textContent = matrix.best
        ? `بهترین جفت: ورود ${faDigits(clockLabel(matrix.best.entrySecond).slice(0, 5))} و خروج ${faDigits(clockLabel(matrix.best.exitSecond).slice(0, 5))} · میانه ${fmt.money(matrix.best.medianPnl)} روی ${fmt.int(matrix.best.samples)} روز`
        : '—';
      $('bt-tf-matrix-note').textContent = `هر خانه یعنی «اگر در بازه ردیف می‌ساختی و در بازه ستون می‌بستی»، با قیمت مشاهده‌شده هر دو سر و کارمزد هر دو سمت؛ رتبه‌بندی با میانه است تا یک روز استثنایی برنده نشود.`
        + (matrix.bucketSeconds !== matrix.requestedBucketSeconds ? ` این ماتریس روی سطل ${fmt.int(matrix.bucketSeconds / 60)} دقیقه‌ای ساخته شده، نه ${fmt.int(matrix.requestedBucketSeconds / 60)} دقیقه، چون تعداد جفت‌ها با سطل ریزتر از کنترل خارج می‌شود.` : '')
        + ' این توصیف گذشته است، نه پیشنهاد اجرا.';
    }

    const legHeads = replay.priced.map((leg, index) => `<th>قیمت ${faDigits(index + 1)}</th><th>اثر ${faDigits(index + 1)}</th>`).join('');
    const shown = buckets.slice(-400);
    $('bt-tf-count').textContent = `${fmt.int(shown.length)} از ${fmt.int(buckets.length)} سطل`;
    $('bt-tf-table').innerHTML = `<table class="history-table backtest-tape-table"><thead><tr><th>روز</th><th>بازه</th><th>مشاهده</th><th>باز</th><th>بسته</th><th>بیشینه</th><th>کمینه</th><th>تغییر سطل</th><th>تغییر پیاپی</th><th>بازده</th><th>پایه</th><th>حجم پاها</th>${legHeads}</tr></thead><tbody>${shown.map((row) => `<tr><td>${dateLabel(row.date)}</td><td>${rangeLabel(row)}</td><td>${fmt.int(row.observations)}</td><td class="${signTone(row.openPnl)}">${fmt.money(row.openPnl)}</td><td class="${signTone(row.closePnl)}">${fmt.money(row.closePnl)}</td><td class="gain">${fmt.money(row.highPnl)}</td><td class="loss">${fmt.money(row.lowPnl)}</td><td class="${signTone(row.changePnl)}">${fmt.money(row.changePnl)}</td><td class="${signTone(row.stepPnl)}">${Number.isFinite(row.stepPnl) ? fmt.money(row.stepPnl) : '—'}</td><td class="${signTone(row.returnPct)}">${fmt.pct(row.returnPct)}٪</td><td>${fmt.money(row.basePrice)}</td><td>${fmt.int(row.volume)}</td>${row.perLeg.map((leg) => `<td>${fmt.money(leg.price)}</td><td class="${signTone(leg.netPnl)}">${fmt.money(leg.netPnl)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  async function runTimeframe() {
    if (!replay?.ok) return;
    timeframeSeconds = Math.max(60, Number($('bt-tf-size').value) || 900);
    $('bt-tf-run').disabled = true;
    try {
      const loaded = await loadTimeframeDays();
      timeframeDays = loaded.days;
      if (!timeframeDays.length) { setStatus('در هیچ روز این بازه، ریزمعامله کامل همه پاها پیدا نشد.', true); $('bt-tf-body').hidden = true; return; }
      paintTimeframe(loaded);
      setStatus(`تحلیل ${fmt.int(timeframeDays.length)} روز روی سطل ${fmt.int(timeframeSeconds / 60)} دقیقه‌ای آماده شد.`);
      $('bt-tf-body').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setStatus(errorText(error, 'تحلیل تایم‌فریم کامل نشد.'), true); }
    finally { $('bt-tf-run').disabled = false; }
  }

  /** متن نوار اجرا: از چه چیزی ساخته شد و چه چیزی نامعلوم ماند. */
  function paintRunNote(day) {
    const allTrades = Object.values(day.byIns).flat();
    const cancelUnknown = allTrades.length > 0 && allTrades.some((trade) => trade.canceledKnown === false);
    // اگر بالادست وضعیت ابطال را نفرستد، ما نمی‌دانیم معامله‌ای باطل شده یا
    // نه. سکوت در این حالت یعنی ادعای ضمنی «هیچ‌کدام باطل نشده» — پس صریح
    // گفته می‌شود که نمی‌دانیم.
    const base = !allTrades.length
      ? 'برای این روز ریزمعامله‌ای دریافت نشد؛ مسیر روزانه معتبر است و عدد درون‌روزی ساخته نمی‌شود.'
      : cancelUnknown
        ? 'خط زمانی مشترک فقط از معاملات ۹:۰۰ تا ۱۲:۳۰ ساخته می‌شود؛ قیمت هر پا آخرین مشاهده تا همان ثانیه است و سن آن جدا نمایش داده می‌شود. منبع داده وضعیت ابطال را اعلام نکرده، پس ابطال احتمالی نامعلوم است.'
        : 'خط زمانی مشترک فقط از معاملات ۹:۰۰ تا ۱۲:۳۰ ساخته می‌شود؛ قیمت، حجم و سن هر پا در هر ثانیه نگه داشته شده و معامله باطل‌شده کنار گذاشته شده است. این مسیر تضمین اجرای هم‌زمان نیست.';
    const manualUsed = [
      Object.keys(manualEntry).length ? `ورود ${fmt.int(Object.keys(manualEntry).length)} پا` : '',
      Object.keys(manualExit).length ? `خروج ${fmt.int(Object.keys(manualExit).length)} پا` : '',
    ].filter(Boolean);
    $('bt-run-note').textContent = manualUsed.length
      ? `${base} قیمت دستی برای ${manualUsed.join(' و ')} به‌کار رفت؛ قیمت دستی خروج فقط روی همان روز سنجش می‌نشیند و مسیر ریزمعامله را عوض نمی‌کند، چون آن مسیر از معامله‌های واقعی همان روز ساخته می‌شود.`
      : base;
  }

  async function runBacktest() {
    const startDate = Number($('bt-entry-date').dataset.value), endDate = Number($('bt-exit-date').dataset.value);
    if (!legs || !startDate || !endDate) { setStatus('تاریخ و ترکیب معتبر را انتخاب کن.', true); return; }
    $('bt-run').disabled = true; setStatus('در حال محاسبه مسیر و دریافت ریزمعامله روز سنجش…');
    try {
      replay = replayHistory({ legs, seriesByIns, baseIns: String(ua.ins), startDate, endDate, entryBasis: entryRail.dataset.value, exitBasis: exitRail.dataset.value, manualEntry, manualExit, units: Math.max(1, Math.trunc(Number($('bt-units').value) || 1)), fees: feesOf(state.settings), settings: state.settings });
      if (!replay.ok) throw new Error(replay.error);
      // ترکیب یا بازه عوض شده؛ ریزمعامله‌های کش‌شده مال بازپخش قبلی‌اند.
      tradesCache.clear(); timeframeDays = []; $('bt-tf-body').hidden = true;
      const day = await fetchDayTrades(endDate);
      paintRunNote(day);
      intradayDate = endDate;
      intraday = replayIntraday({ replay, tradesByIns: day.byIns, baseTrades: day.byIns[String(ua.ins)] || [], fees: feesOf(state.settings) });
      $('bt-result').hidden = false; paintResult();
      const warning = tradeWarningText(day);
      if (intraday.length) setStatus(`${fmt.int(replay.summary.validDays)} روز و ${fmt.int(intraday.length)} نقطه مشترک درون‌روزی محاسبه شد${warning ? `؛ ${warning}` : ''}.`, Boolean(warning));
      else setStatus(`${fmt.int(replay.summary.validDays)} روز آماده شد؛ ${warning || 'در روز سنجش ریزمعامله کامل برای همه پاها پیدا نشد'}.`, Boolean(warning));
      $('bt-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setStatus(errorText(error, 'بک‌تست اجرا نشد.'), true); } finally { $('bt-run').disabled = false; }
  }

  /**
   * موقعیتی که تب «آزمون همه استراتژی‌ها» فرستاده را اینجا می‌چیند.
   *
   * هر چیزی که برداشته نشد، صریح گفته می‌شود. مثلاً اگر همان ترکیب قرارداد
   * در روز ورود انتخابی، ترکیب معتبری برای این استراتژی نباشد، بی‌صدا ترکیب
   * دیگری انتخاب نمی‌شود — کاربر باید بداند دارد چه چیزی را می‌بیند.
   */
  async function applyHandoff(plan) {
    const skipped = [];
    if (!chain.has(String(plan.uaIns))) { setStatus(`نماد پایه «${plan.uaName}» در فهرست این تب نیست.`, true); return; }
    baseSelect.value = String(plan.uaIns);
    if ([...strategySelect.options].some((option) => option.value === plan.strategyId)) strategySelect.value = plan.strategyId;
    else skipped.push(`استراتژی «${plan.strategyName}» در این تب فقط برای ترکیب‌های قابل اجرا فهرست می‌شود`);
    $('bt-units').value = String(plan.units);
    setRail(entryRail, plan.entryBasis); setRail(exitRail, plan.exitBasis);

    await loadHistory();
    if (!entryDates.length) return;
    // «خودکار» یعنی ردیف زنده تاریخ نداشت. بلندترین بازهٔ موجودِ همین ترکیب
    // برداشته می‌شود: قدیمی‌ترین روزِ دارای ترکیب معتبر. حدس‌زدن یک بازهٔ
    // ثابت از تب مبدأ، بازه‌ای می‌ساخت که ممکن است برای این قرارداد وجود
    // نداشته باشد.
    const wantEntry = plan.entryDate === 'auto' ? entryDates[0] : plan.entryDate;
    if (entryDates.includes(wantEntry)) entryWheel.select(wantEntry);
    else skipped.push(`روز ورود ${dateLabel(plan.entryDate)} برای این استراتژی ترکیب قابل اجرا ندارد`);

    const wanted = [...plan.legIns].sort().join('|');
    const index = combos.findIndex((combo) => combo.legs.map((leg) => String(leg.ins)).sort().join('|') === wanted);
    if (index >= 0) { $('bt-combo').value = String(index); renderCombo(); }
    else skipped.push(`ترکیب «${plan.comboName}» بین ترکیب‌های این روز نبود`);

    const wantExit = plan.exitDate === 'auto' ? exitDates.at(-1) : plan.exitDate;
    if (exitDates.includes(wantExit)) exitWheel.select(wantExit);
    else skipped.push(`روز سنجش ${dateLabel(plan.exitDate)} برای همه پاها قیمت کامل ندارد`);

    setStatus(skipped.length
      ? `موقعیت از آزمون همه استراتژی‌ها آمد، ولی ${skipped.join('؛ ')}.`
      : 'موقعیت از آزمون همه استراتژی‌ها چیده شد؛ دکمه اجرای بک‌تست را بزن.', skipped.length > 0);
    $('bt-work').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  entryRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(entryRail, button.dataset.basis); if (entryDates.length) refreshCombos(); } });
  exitRail.addEventListener('click', (event) => { const button = event.target.closest('[data-basis]'); if (button) { setRail(exitRail, button.dataset.basis); refreshExitDates(); } });
  $('bt-combo').addEventListener('change', renderCombo);
  $('bt-load').addEventListener('click', loadHistory); $('bt-run').addEventListener('click', runBacktest);
  $('bt-export-intraday').addEventListener('click', exportIntraday);
  $('bt-days-table').addEventListener('click', (event) => {
    const row = event.target.closest('[data-day]');
    if (row) openDayIntraday(Number(row.dataset.day));
  });
  $('bt-days-table').addEventListener('keydown', (event) => {
    const row = event.target.closest('[data-day]');
    if (row && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openDayIntraday(Number(row.dataset.day)); }
  });
  $('bt-tf-run').addEventListener('click', runTimeframe);
  $('bt-tf-size').addEventListener('change', () => {
    // تایم‌فریم فقط سطل‌بندی را عوض می‌کند، نه داده را. اگر روزها گرفته شده‌اند
    // دوباره درخواستی نمی‌رود.
    timeframeSeconds = Math.max(60, Number($('bt-tf-size').value) || 900);
    if (timeframeDays.length) paintTimeframe(null);
  });
  $('bt-entry-market').addEventListener('input', onManualInput);
  $('bt-exit-market').addEventListener('input', onManualInput);
  baseSelect.addEventListener('change', () => { $('bt-work').hidden = true; $('bt-result').hidden = true; });
  strategySelect.addEventListener('change', () => { $('bt-work').hidden = true; $('bt-result').hidden = true; });

  try {
    const response = await fetch('/api/history/universe'), payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error || 'فهرست دریافت نشد');
    chain = buildChain(payload.rows || []); baseSelect.innerHTML = '<option value="">نماد پایه را انتخاب کن</option>';
    for (const item of [...chain.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'fa'))) {
      const option = document.createElement('option'); option.value = item.ins; option.textContent = `${nameOf(item, 'نماد پایه')} · ${fmt.int(item.contracts)} قرارداد`; baseSelect.appendChild(option);
    }
    setStatus(`${fmt.int(chain.size)} نماد پایه آماده است.`);
  } catch (error) { setStatus(errorText(error, 'فهرست نمادها دریافت نشد.'), true); }

  // تحویل عمر یک کلیک دارد: همین‌جا برداشته و پاک می‌شود تا باز کردن دوباره
  // این تب، دوباره همان چیدمان را روی انتخاب تازه کاربر ننشاند.
  if (state.handoff?.to === 'backtest') {
    const plan = state.handoff;
    state.handoff = null;
    if (chain.size) await applyHandoff(plan);
  }

  return () => {};
}
