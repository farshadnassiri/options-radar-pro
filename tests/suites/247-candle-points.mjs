import { check, group } from '../harness.mjs';
import { candlePoints, nearestCandlePoint, mountCandlePoints } from '../../ui/candle-points.mjs';
import { fmt } from '../../ui/fmt.mjs';

group('۲۴۷. انتخاب نقاط کندل افقی');
for (const row of [
  { low: 80, first: 90, last: 110, close: 105, high: 120, yday: 100 },
  { low: 100, first: 100, last: 100, close: 100, high: 100, yday: 100 },
]) {
  const points = candlePoints(row);
  check('حتی قیمت‌های برابر پنج نقطه قابل تشخیص دارند', points.every((p) => nearestCandlePoint(points, p.x, p.y).key === p.key));
  const handlers = {}, readout = {};
  const nodes = points.map((p) => ({ dataset: { point: p.key }, classList: { toggle() {}, remove() {} } }));
  const button = {
    classList: { add() {} },
    querySelector: (key) => key === 'svg' ? { getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 160 }) } : readout,
    querySelectorAll: () => nodes,
    addEventListener: (event, handler) => { handlers[event] = handler; },
  };
  mountCandlePoints(button, row);
  for (const p of points) {
    handlers.pointermove({ clientX: p.x, clientY: p.y, target: { closest: () => null } });
    check(`اطلاعات نقطه ${p.label} به قیمت خودش وصل است`, readout.innerHTML.includes(`<b>${p.label}</b>`) && readout.innerHTML.includes(`<strong>${fmt.money(p.value)}</strong>`));
  }
}
