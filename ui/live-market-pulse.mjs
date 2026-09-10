// هفت نمودار فشردهٔ نبض بازار برای صفحهٔ رصد لحظه‌ای.
// روندهای اختیار از اختلاف عکس‌های واقعی همین جلسه ساخته می‌شوند؛ دادهٔ
// گمشده خط خالی می‌ماند و به صفر تبدیل نمی‌شود.

import { fmt, faDigits } from '/ui/fmt.mjs';
import { liveChart } from '/ui/tabs/live-market.mjs';
import { appendMarketPulseHistory, marketPulseSnapshot } from '/core/live-market-pulse.mjs';

const SERIES = Array.from({ length: 6 }, (_, index) => `var(--series-${index + 1})`);
const STORE_KEY = 'options-radar:live-market-pulse';
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
const tone = (value) => Number(value) > 0 ? 'gain' : Number(value) < 0 ? 'loss' : '';

function tehranClock(at) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(value.hour) || 0, minute = Number(value.minute) || 0, second = Number(value.second) || 0;
  return { second: hour * 3600 + minute * 60 + second, time: hour * 10000 + minute * 100 + second };
}

function restoreHistory() {
  try {
    const value = JSON.parse(sessionStorage.getItem(STORE_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function saveHistory(history) {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(history)); } catch { /* نمودار بدون ماندگاری هم معتبر است */ }
}

function seriesOf(history, key) {
  return history.map((row) => ({ second: row.second, time: row.time, value: row[key] }));
}

function stat(label, value, note = '', className = '') {
  return `<article class="pulse-stat ${className}"><small>${label}</small><strong>${value}</strong>${note ? `<span>${note}</span>` : ''}</article>`;
}

function paintPriceRange(host, rows) {
  const usable = [...rows].filter((row) => Number.isFinite(row.changePct));
  if (!usable.length) { host.innerHTML = '<p class="empty-note">تغییر معتبر برای نمادهای پایه نرسیده است.</p>'; return; }
  const bound = Math.max(1, ...usable.map((row) => Math.abs(row.changePct)));
  const ordered = usable.sort((a, b) => a.changePct - b.changePct);
  const at = (value) => 4 + ((value + bound) / (2 * bound)) * 92;
  host.innerHTML = `<div class="pulse-price-range" style="--range-bound:${bound}">
    <div class="pulse-range-axis"><span>${fmt.pct(-bound)}٪</span><b>۰٪</b><span>${fmt.pct(bound)}٪</span></div>
    <div class="pulse-range-field" role="group" aria-label="محدوده تغییر آخرین معامله نمادهای پایه">
      <i class="pulse-range-zero"></i>
      ${ordered.map((row, index) => `<button type="button" class="${tone(row.changePct)}" data-pulse-range="${esc(row.ins)}" style="--range-at:${at(row.changePct).toFixed(2)}%;--range-lane:${index % 4}" aria-label="${esc(row.name)}، ${fmt.pct(row.changePct)} درصد"><span></span></button>`).join('')}
    </div>
    <div class="pulse-range-readout" data-pulse-range-readout></div>
  </div>`;
  const readout = host.querySelector('[data-pulse-range-readout]');
  const show = (row) => {
    readout.innerHTML = `<b>${esc(row.name)}</b><strong class="${tone(row.changePct)}">${fmt.pct(row.changePct)}٪</strong><span>ارزش اختیار ${fmt.money(row.value)}</span><span>حجم اختیار ${fmt.int(row.volume)}</span>`;
    host.querySelectorAll('[data-pulse-range]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.pulseRange === row.ins)));
  };
  const first = [...usable].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0];
  show(first);
  host.querySelectorAll('[data-pulse-range]').forEach((button) => {
    const row = usable.find((item) => item.ins === button.dataset.pulseRange);
    for (const event of ['pointerenter', 'focus', 'click']) button.addEventListener(event, () => show(row));
  });
}

function paintOiBalance(host, point) {
  const total = Math.max(0, Number(point.callOi) || 0) + Math.max(0, Number(point.putOi) || 0);
  const width = (value) => total > 0 ? Math.max(2, (value / total) * 100) : 0;
  host.innerHTML = `<div class="pulse-oi-balance">
    <div class="pulse-oi-rail" aria-label="سهم موقعیت باز کال و پوت"><i class="call" style="--share:${width(point.callOi)}%"></i><i class="put" style="--share:${width(point.putOi)}%"></i></div>
    <div class="pulse-oi-sides">
      ${stat('موقعیت باز کال', fmt.int(point.callOi), `تغییر امروز ${fmt.int(point.callOiChange)}`, tone(point.callOiChange))}
      ${stat('موقعیت باز پوت', fmt.int(point.putOi), `تغییر امروز ${fmt.int(point.putOiChange)}`, tone(point.putOiChange))}
    </div>
  </div>`;
}

function paintIntensity(host, history, point) {
  host.innerHTML = `<div class="pulse-intensity-summary">
    ${stat('قرارداد معامله‌شده', fmt.int(point.tradedContracts), `از ${fmt.int(point.contracts)} قرارداد`)}
    ${stat('ارزش کال', fmt.money(point.callValue), '', 'call')}
    ${stat('ارزش پوت', fmt.money(point.putValue), '', 'put')}
    ${stat('جمع امروز', fmt.money(point.optionValue))}
  </div><div data-pulse-intensity-chart></div>`;
  liveChart(host.querySelector('[data-pulse-intensity-chart]'), [
    { label: 'شدت ارزش کال', color: 'var(--call)', points: seriesOf(history, 'callIntensityValue') },
    { label: 'شدت ارزش پوت', color: 'var(--put)', points: seriesOf(history, 'putIntensityValue') },
  ], { valueFmt: fmt.money, unit: 'ارزش افزوده‌شده میان دو عکس', zeroFloor: true, note: 'هر نقطه اختلاف دو عکس معتبر متوالی است؛ نقطهٔ نخست شدت ساختگی ندارد.' });
}

export function mountLiveMarketPulse(root) {
  root.innerHTML = `<section class="market-pulse-shell">
    <div class="section-head pulse-head"><div><p class="eyebrow">برگرفته از منطق نبض بازار، با داده رادار آپشن</p><h2>نبض زنده بازار</h2></div><span data-pulse-status>در انتظار عکس معتبر…</span></div>
    <div class="market-pulse-grid">
      <section class="card pulse-card"><div class="section-head"><h3>محدوده قیمتی آخرین معاملات</h3><span>هر نقطه یک نماد پایه</span></div><div data-pulse-price-range></div></section>
      <section class="card pulse-card"><div class="section-head"><h3>روند ارزش سفارش‌های خرید و فروش</h3><span data-pulse-base-coverage>پنج ردیف اول سفارش پایه‌ها</span></div><div data-pulse-base-orders></div></section>
      <section class="card pulse-card"><div class="section-head"><h3>روند نمادهای مثبت و منفی</h3><span>فقط نمادهای معامله‌شده</span></div><div data-pulse-breadth></div></section>
      <section class="card pulse-card"><div class="section-head"><h3>موقعیت باز کال و پوت</h3><span>عکس فعلی و تغییر نسبت به دیروز</span></div><div data-pulse-oi-balance></div></section>
      <section class="card pulse-card pulse-wide"><div class="section-head"><h3>شدت معاملات اختیار</h3><span>اختلاف ارزش تجمعی میان دو عکس</span></div><div data-pulse-intensity></div></section>
      <section class="card pulse-card"><div class="section-head"><h3>روند ارزش سفارش‌های اختیار</h3><span>به تفکیک کال، پوت، خرید و فروش</span></div><div data-pulse-option-orders></div></section>
      <section class="card pulse-card"><div class="section-head"><h3>روند موقعیت‌های باز سهام</h3><span>کال و پوت بازار اختیار سهام</span></div><div data-pulse-oi-trend></div></section>
    </div>
  </section>`;
  let history = restoreHistory();

  function update(payload = {}, baseBooks = {}) {
    const pulse = marketPulseSnapshot(payload.universe, baseBooks);
    const fallback = tehranClock(payload.at || Date.now());
    const clock = payload.timeline?.at(-1);
    const point = {
      ...pulse, at: Number(payload.at) || Date.now(),
      second: Number(clock?.second) || fallback.second,
      time: Number(clock?.time) || fallback.time,
    };
    history = appendMarketPulseHistory(history, point);
    saveHistory(history);
    root.querySelector('[data-pulse-status]').textContent = `${faDigits(history.length)} عکس معتبر در این جلسه`;
    paintPriceRange(root.querySelector('[data-pulse-price-range]'), pulse.priceChanges);

    const coverage = root.querySelector('[data-pulse-base-coverage]');
    coverage.textContent = pulse.baseBookCovered === pulse.baseBookTotal && pulse.baseBookTotal > 0
      ? `پنج ردیف اول ${fmt.int(pulse.baseBookTotal)} نماد پایه`
      : `پوشش دفتر ${fmt.int(pulse.baseBookCovered)} از ${fmt.int(pulse.baseBookTotal)} پایه`;
    liveChart(root.querySelector('[data-pulse-base-orders]'), [
      { label: 'سفارش خرید پایه', color: 'var(--gain)', points: seriesOf(history, 'baseBuyOrders') },
      { label: 'سفارش فروش پایه', color: 'var(--loss)', points: seriesOf(history, 'baseSellOrders') },
    ], { valueFmt: fmt.money, unit: 'ارزش پنج ردیف اول سفارش‌ها', zeroFloor: true, note: 'فقط عکس‌هایی رسم می‌شوند که دفتر همه نمادهای پایه را کامل داشته باشند.' });

    liveChart(root.querySelector('[data-pulse-breadth]'), [
      { label: 'مثبت', color: 'var(--gain)', points: (payload.timeline || []).map((row) => ({ ...row, value: row.positive })) },
      { label: 'منفی', color: 'var(--loss)', points: (payload.timeline || []).map((row) => ({ ...row, value: row.negative })) },
    ], { valueFmt: fmt.int, unit: 'تعداد نماد پایه', zeroFloor: true, note: 'نماد بی‌معامله وارد مثبت، منفی یا بدون‌تغییر نمی‌شود.' });

    paintOiBalance(root.querySelector('[data-pulse-oi-balance]'), point);
    paintIntensity(root.querySelector('[data-pulse-intensity]'), history, point);
    liveChart(root.querySelector('[data-pulse-option-orders]'), [
      { label: 'خرید کال', color: SERIES[0], points: seriesOf(history, 'callBuyOrders') },
      { label: 'فروش کال', color: SERIES[1], points: seriesOf(history, 'callSellOrders') },
      { label: 'خرید پوت', color: SERIES[2], points: seriesOf(history, 'putBuyOrders') },
      { label: 'فروش پوت', color: SERIES[3], points: seriesOf(history, 'putSellOrders') },
    ], { valueFmt: fmt.money, unit: 'ارزش بهترین سفارش هر قرارداد', zeroFloor: true, note: 'قیمت × تعداد × اندازه همان قرارداد؛ اندازه گمشده جمع کل را نامعلوم نگه می‌دارد.' });
    liveChart(root.querySelector('[data-pulse-oi-trend]'), [
      { label: 'موقعیت باز کال', color: 'var(--call)', points: seriesOf(history, 'callOi') },
      { label: 'موقعیت باز پوت', color: 'var(--put)', points: seriesOf(history, 'putOi') },
    ], { valueFmt: fmt.int, unit: 'قرارداد باز', zeroFloor: true, note: 'تاریخچه فقط از عکس‌های واقعی همین جلسه مرورگر ساخته می‌شود.' });
  }

  return { update, clear: () => { history = []; saveHistory(history); } };
}
