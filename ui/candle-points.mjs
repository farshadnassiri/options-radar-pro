import { fmt } from './fmt.mjs';

const labels = { low: 'کمینه', first: 'اولین معامله', last: 'آخرین معامله', close: 'قیمت پایانی', high: 'بیشینه' };

const VIEW_W = 640, VIEW_H = 112, PAD = 58, AXIS_Y = 46;
// سه ردیف حاشیه‌نویسی، بالا و پایینِ محور. نقطه‌ها روی خط می‌نشینند نه
// معلق در فضا — همان کاری که هر نمودار نقطه‌ای مرتب می‌کند.
//
// ارتفاعِ نقطه از همین جدول خوانده می‌شود، نه از یک فهرست موازی: با دو
// فهرست، جابه‌جاکردن یک ردیف نقطه‌ها را از روی خطشان می‌انداخت و کسی هم
// متوجه نمی‌شد.
const ROWS = [['first', 20, 'اولین'], ['last', 70, 'آخرین'], ['close', 88, 'پایانی']];
const ROW_Y = Object.fromEntries(ROWS.map(([key, y]) => [key, y]));

/** اندازهٔ viewBox، صادر می‌شود تا آزمون قاب ساختگی را از روی خودش بسازد نه
 *  از عددی که با هر تغییر طرح کهنه شود. */
export const CANDLE_VIEW = { width: VIEW_W, height: VIEW_H };

// ── دامنهٔ محور، پایانی دیروز را هم در بر می‌گیرد ──────────────────────
//
// همهٔ درصدهای این کارت نسبت به پایانی دیروز خوانده می‌شوند، ولی تا امروز
// خودِ پایانی دیروز هیچ‌جای نمودار نبود: کاربر یک بدنهٔ سبز می‌دید بدون
// اینکه بداند خطِ مرجع کجاست. حالا خط مرجع روی همان محور رسم می‌شود، و
// چون ممکن است بیرونِ بازهٔ امروز باشد (نمادی که با شکاف باز شده)، دامنه
// خودش را باز می‌کند تا خط داخل قاب بماند.
export function candleDomain(row) {
  const low = Number(row.low), high = Number(row.high), yday = Number(row.yday);
  const ends = [low, high, ...(yday > 0 ? [yday] : [])].filter((value) => Number.isFinite(value) && value > 0);
  if (!ends.length) return { lo: NaN, hi: NaN };
  return { lo: Math.min(...ends), hi: Math.max(...ends) };
}

const scaleOf = (row) => {
  const { lo, hi } = candleDomain(row);
  return (value) => (hi > lo ? PAD + ((Number(value) - lo) / (hi - lo)) * (VIEW_W - PAD * 2) : VIEW_W / 2);
};

// محور قیمت همواره از چپ به راست است؛ زبان صفحه جهت قیمت را عوض نمی‌کند.
export function candlePoints(row) {
  const x = scaleOf(row), flat = !(Number(row.high) > Number(row.low));
  return Object.entries(labels).map(([key, label]) => ({
    key, label, value: Number(row[key]), x: x(Number(row[key])),
    // پنج نقطه روی چهار ارتفاع می‌نشینند تا قیمت‌های برابر هم از هم جدا
    // بمانند؛ کمینه و بیشینه روی خود محورند مگر روزی که هر پنج قیمت یکی
    // باشد و آن‌وقت بیشینه بالا می‌رود تا زیر کمینه پنهان نشود.
    y: key === 'high' && flat ? 6 : (ROW_Y[key] ?? AXIS_Y),
  }));
}

/** هندسهٔ خود کندل: سایه، بدنه، لوزی پایانی و خط مرجع دیروز. */
export function candleGeometry(row) {
  const x = scaleOf(row);
  const first = Number(row.first), last = Number(row.last), yday = Number(row.yday);
  const left = Math.min(x(first), x(last));
  return {
    wickFrom: x(Number(row.low)), wickTo: x(Number(row.high)),
    bodyLeft: left, bodyWidth: Math.max(3, Math.abs(x(last) - x(first))),
    closeAt: x(Number(row.close)),
    ydayAt: yday > 0 ? x(yday) : NaN,
    rising: Number.isFinite(first) && Number.isFinite(last) ? last >= first : null,
  };
}

/** جای قیمت داخل بازهٔ امروز، بر حسب درصد — «کجای روز ایستاده‌ایم». */
export function dayPositionPct(row, value) {
  const low = Number(row.low), high = Number(row.high), at = Number(value);
  if (!(high > low) || !Number.isFinite(at)) return NaN;
  return ((at - low) / (high - low)) * 100;
}

export function nearestCandlePoint(points, x, y) {
  return points.reduce((best, point) => Math.hypot(point.x - x, point.y - y) < Math.hypot(best.x - x, best.y - y) ? point : best, points[0]);
}

export function mountCandlePoints(button, row) {
  const points = candlePoints(row), geo = candleGeometry(row);
  const last = points[2];
  const anchor = (x) => x < PAD + 40 ? 'start' : x > VIEW_W - PAD - 40 ? 'end' : 'middle';
  button.classList.add('candle-point-track');
  button.innerHTML = `<svg viewBox="0 0 ${VIEW_W} ${VIEW_H}" preserveAspectRatio="none" aria-hidden="true">
    <line class="candle-baseline" x1="${PAD - 12}" x2="${VIEW_W - PAD + 12}" y1="${AXIS_Y}" y2="${AXIS_Y}"/>
    ${ROWS.map(([, y, short]) => `<g class="candle-row"><line x1="${PAD - 12}" x2="${VIEW_W - PAD + 12}" y1="${y}" y2="${y}"/><text x="4" y="${y + 3}">${short}</text></g>`).join('')}
    ${Number.isFinite(geo.ydayAt) ? `<g class="candle-yday"><line x1="${geo.ydayAt}" x2="${geo.ydayAt}" y1="4" y2="${VIEW_H - 14}"/><text x="${geo.ydayAt}" y="${VIEW_H - 2}" text-anchor="${anchor(geo.ydayAt)}">پایانی دیروز</text></g>` : ''}
    <line class="candle-wick" x1="${geo.wickFrom}" x2="${geo.wickTo}" y1="${AXIS_Y}" y2="${AXIS_Y}"/>
    <line class="candle-cap" x1="${geo.wickFrom}" x2="${geo.wickFrom}" y1="${AXIS_Y - 10}" y2="${AXIS_Y + 10}"/>
    <line class="candle-cap" x1="${geo.wickTo}" x2="${geo.wickTo}" y1="${AXIS_Y - 10}" y2="${AXIS_Y + 10}"/>
    <rect class="candle-real-body" x="${geo.bodyLeft}" y="${AXIS_Y - 11}" width="${geo.bodyWidth}" height="22" rx="7"/>
    <path class="candle-close-mark" d="M${geo.closeAt} ${AXIS_Y - 18} l6.5 6.5 l-6.5 6.5 l-6.5 -6.5 Z"/>
    ${points.map((p) => `<g class="candle-price-point" data-point="${p.key}"><line x1="${p.x}" x2="${p.x}" y1="${AXIS_Y}" y2="${p.y}"/><circle cx="${p.x}" cy="${p.y}" r="4"/><text x="${p.x}" y="${p.y < AXIS_Y ? p.y - 8 : p.y + 12}" text-anchor="${anchor(p.x)}">${p.label}</text></g>`).join('')}
  </svg><span class="candle-point-readout" aria-live="polite">روی کندل حرکت کن · با کلیدهای جهت بین قیمت‌ها جابه‌جا شو</span>`;
  const output = button.querySelector('.candle-point-readout');
  let active = null;
  const show = (point) => {
    active = point;
    button.querySelectorAll('[data-point]').forEach((node) => node.classList.toggle('is-active', node.dataset.point === point.key));
    const change = Number(row.yday) > 0 ? ((point.value / Number(row.yday)) - 1) * 100 : NaN;
    const seat = dayPositionPct(row, point.value);
    output.innerHTML = `<b>${point.label}</b><strong>${fmt.money(point.value)}</strong><span class="${change > 0 ? 'gain' : change < 0 ? 'loss' : ''}">${fmt.pct(change)}٪ نسبت به پایانی دیروز</span>${Number.isFinite(seat) ? `<small>${fmt.pct(seat)}٪ بازه امروز</small>` : ''}`;
  };
  button.addEventListener('pointermove', (event) => {
    const rect = button.querySelector('svg').getBoundingClientRect();
    const target = event.target.closest?.('[data-point]');
    show(points.find((p) => p.key === target?.dataset.point) || nearestCandlePoint(points, (event.clientX - rect.left) * VIEW_W / rect.width, (event.clientY - rect.top) * VIEW_H / rect.height));
  });
  button.addEventListener('focus', () => show(active || last));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
    show(points[(points.indexOf(active || last) + step + points.length) % points.length]);
  });
  button.addEventListener('pointerleave', () => {
    if (button.getAttribute('aria-expanded') === 'true' || button === document.activeElement) return;
    button.querySelectorAll('[data-point]').forEach((node) => node.classList.remove('is-active'));
    output.textContent = 'روی کندل حرکت کن · با کلیدهای جهت بین قیمت‌ها جابه‌جا شو';
  });
}
