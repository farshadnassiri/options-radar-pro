import { fmt } from './fmt.mjs';

const labels = { low: 'کمینه', first: 'اولین معامله', last: 'آخرین معامله', close: 'قیمت پایانی', high: 'بیشینه' };

// محور قیمت همواره از چپ به راست است؛ زبان صفحه جهت قیمت را عوض نمی‌کند.
export function candlePoints(row) {
  const low = Number(row.low), high = Number(row.high);
  const x = (value) => high > low ? 30 + ((value - low) / (high - low)) * 540 : 300;
  return Object.entries(labels).map(([key, label], index) => ({
    key, label, value: Number(row[key]), x: x(Number(row[key])),
    // پنج خط کوتاه همچنان قیمت‌های برابر را جدا می‌کنند، اما ارتفاع فشرده
    // است تا هر قرارداد به یک کارت بلند و کشیده تبدیل نشود.
    y: [48, 22, 70, 94, high === low ? 116 : 48][index],
  }));
}

export function nearestCandlePoint(points, x, y) {
  return points.reduce((best, point) => Math.hypot(point.x - x, point.y - y) < Math.hypot(best.x - x, best.y - y) ? point : best, points[0]);
}

export function mountCandlePoints(button, row) {
  const points = candlePoints(row), first = points[1], last = points[2];
  const left = Math.min(first.x, last.x), width = Math.max(2, Math.abs(last.x - first.x));
  button.classList.add('candle-point-track');
  button.innerHTML = `<svg viewBox="0 0 600 132" preserveAspectRatio="none" aria-hidden="true">
    <line class="candle-wick" x1="${points[0].x}" x2="${points[4].x}" y1="48" y2="48"/>
    <rect class="candle-real-body" x="${left}" y="40" width="${width}" height="16" rx="3"/>
    ${points.map((p) => `<g class="candle-price-point" data-point="${p.key}"><line x1="${p.x}" x2="${p.x}" y1="48" y2="${p.y}"/><circle cx="${p.x}" cy="${p.y}" r="4.5"/><text x="${p.x}" y="${p.y - 9}" text-anchor="${p.x < 70 ? 'start' : p.x > 530 ? 'end' : 'middle'}">${p.label}</text></g>`).join('')}
  </svg><span class="candle-point-readout" aria-live="polite">روی نقاط کندل حرکت کن · با کلیدهای جهت بین قیمت‌ها جابه‌جا شو</span>`;
  const output = button.querySelector('.candle-point-readout');
  let active = null;
  const show = (point) => {
    active = point;
    button.querySelectorAll('[data-point]').forEach((node) => node.classList.toggle('is-active', node.dataset.point === point.key));
    const change = Number(row.yday) > 0 ? ((point.value / Number(row.yday)) - 1) * 100 : NaN;
    output.innerHTML = `<b>${point.label}</b><strong>${fmt.money(point.value)}</strong><span class="${change > 0 ? 'gain' : change < 0 ? 'loss' : ''}">${fmt.pct(change)}٪ نسبت به پایانی دیروز</span>`;
  };
  button.addEventListener('pointermove', (event) => {
    const rect = button.querySelector('svg').getBoundingClientRect();
    const target = event.target.closest?.('[data-point]');
    show(points.find((p) => p.key === target?.dataset.point) || nearestCandlePoint(points, (event.clientX - rect.left) * 600 / rect.width, (event.clientY - rect.top) * 132 / rect.height));
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
    output.textContent = 'روی نقاط کندل حرکت کن · با کلیدهای جهت بین قیمت‌ها جابه‌جا شو';
  });
}
