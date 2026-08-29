// ۱۸۹. شکافِ داده در نمودار مسیر با خط پر نمی‌شود

import { check, group } from '../harness.mjs';
import { chart } from '../../ui/track-chart.mjs';

group('۱۸۹. شکاف نمودار مسیر');
{
  // میزبانِ ساختگی: `chart` بعد از نوشتن HTML سراغ svg و tip می‌رود و
  // شنونده وصل می‌کند. اینجا فقط رشتهٔ خروجی موضوع است.
  const stub = { addEventListener() {}, setAttribute() {}, querySelector: () => stub, innerHTML: '', style: {}, hidden: true };
  const render = (points) => {
    let html = '';
    const host = {
      set innerHTML(value) { html = value; },
      get innerHTML() { return html; },
      querySelector: () => stub,
      getBoundingClientRect: () => ({ width: 900, height: 348, left: 0, top: 0 }),
    };
    chart(host, points, [{ key: 'pnl', label: 'سود', color: 'var(--series-1)' }], { money: true });
    return html;
  };

  const at = (index, pnl) => ({ date: 20260521, second: 9 * 3600 + index * 1800, pnl });
  const polylines = (html) => [...String(html).matchAll(/<polyline[^>]*>/g)].map(([tag]) => tag);

  const whole189 = render([at(0, 100), at(1, 200), at(2, 300), at(3, 400)]);
  check('سری بی‌شکاف یک خط پیوسته است',
    polylines(whole189).length === 1, String(polylines(whole189).length));

  // ── ادعای اصلی ──────────────────────────────────────────────────────
  // نقطهٔ میانی داده ندارد. وصل‌کردن دو سرِ شکاف یعنی کشیدن مسیری که
  // هیچ‌وقت مشاهده نشده.
  const gapped189 = render([at(0, 100), at(1, 200), at(2, null), at(3, 400), at(4, 500)]);
  const parts189 = polylines(gapped189);
  check('شکافِ میانی خط را می‌شکند و دو خط جدا می‌سازد',
    parts189.length === 2, String(parts189.length));
  check('و هیچ خطی دو سرِ شکاف را به هم وصل نمی‌کند',
    parts189.every((tag) => {
      const xs = [...tag.matchAll(/(\d+(?:\.\d+)?),/g)].map(([, value]) => Number(value));
      // فاصلهٔ افقی هر دو نقطهٔ متوالی روی یک خط باید یک گام باشد؛ گامِ
      // دوبرابر یعنی خط از روی شکاف پریده است.
      const steps = xs.slice(1).map((value, index) => value - xs[index]);
      return steps.every((width) => Math.abs(width - steps[0]) < 1e-6);
    }), gapped189.match(/<polyline[^>]*>/g)?.join(' | ') || '');

  // ── صفرِ مشاهده‌شده با نبودِ داده یکی نیست ──────────────────────────
  // `Number(null)` صفر است. اگر نبودِ داده با آن سنجیده شود، «سود این
  // لحظه نامعلوم است» به «سود این لحظه صفر بود» تبدیل می‌شود و کاربر از
  // شکل نمودار نتیجه می‌گیرد.
  const zero189 = render([at(0, 100), at(1, 0), at(2, 300)]);
  check('صفر یک نقطهٔ واقعی است و خط را نمی‌شکند',
    polylines(zero189).length === 1 && /,\d/.test(polylines(zero189)[0]),
    String(polylines(zero189).length));
  const nulled189 = render([at(0, 100), at(1, null), at(2, 300)]);
  check('ولی نبودِ داده در همان جا، خط را می‌شکند — صفر شمرده نمی‌شود',
    polylines(nulled189).length === 0
    && [...nulled189.matchAll(/<circle[^>]*r="3"/g)].length === 2,
    String(polylines(nulled189).length));
  const blank189 = render([at(0, 100), { ...at(1, 0), pnl: '' }, at(2, 300)]);
  check('رشتهٔ خالی هم صفر نمی‌شود',
    polylines(blank189).length === 0);

  // ── نقطهٔ تنها ───────────────────────────────────────────────────────
  const lonely189 = render([at(0, 100), at(1, null), at(2, 300), at(3, null), at(4, 500)]);
  check('نقطهٔ تنها میان دو شکاف با دایره دیده می‌شود، نه اینکه ناپدید شود',
    polylines(lonely189).length === 0
    && [...lonely189.matchAll(/<circle[^>]*r="3"/g)].length === 3,
    String([...lonely189.matchAll(/<circle[^>]*r="3"/g)].length));

  // ── حالت پله‌ای ─────────────────────────────────────────────────────
  const stepped189 = (() => {
    let html = '';
    const host = {
      set innerHTML(value) { html = value; },
      get innerHTML() { return html; },
      querySelector: () => stub,
      getBoundingClientRect: () => ({ width: 900, height: 348, left: 0, top: 0 }),
    };
    chart(host, [at(0, 100), at(1, 200), at(2, null), at(3, 400), at(4, 500)],
      [{ key: 'pnl', label: 'سود', color: 'var(--series-1)' }], { money: true, step: true });
    return html;
  })();
  check('حالت پله‌ای هم شکاف را پر نمی‌کند',
    [...stepped189.matchAll(/<path[^>]*d="M /g)].length === 2,
    String([...stepped189.matchAll(/<path[^>]*d="M /g)].length));
}
