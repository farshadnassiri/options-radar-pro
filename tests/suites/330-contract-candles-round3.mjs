// ۳۳۰. تب کندل، دور سوم (۱۴۰۵/۰۷/۱۵): شاخص ترکیبی از همهٔ کندل‌ها، مرتب‌سازی
// بر هر کلید، لایهٔ میله پشت کادر، و بزرگ‌نمایی محورها با کشیدن.

import { check, group, near, readSrc } from '../harness.mjs';
import {
  compositeCandle, compositeByGroup, orderCandles, sortValue, backgroundBarAxis, SORT_KEYS, COMPOSITE_WEIGHTS,
} from '../../core/contract-candles.mjs';

const rec = (ins, o = {}) => ({
  ins, name: ins, kind: 'call', strike: 100, uaIns: 'U', uaName: 'u', endDate: 'd', valid: true, value: 1, volume: 1, oi: 1,
  points: { change: { first: 0, low: -5, last: 0, close: 0, high: 5 } }, ...o,
});
const pts = (first, low, last, close, high) => ({ change: { first, low, last, close, high } });

group('۳۳۰. شاخص ترکیبی: هر نقطه میانگین وزنی همان نقطه');
{
  const rs = [
    rec('a', { value: 10, oi: 100, points: pts(1, -2, 5, 4, 8) }),
    rec('b', { value: 30, oi: 300, points: pts(-1, -12, -10, -9, 2) }),
    rec('c', { value: NaN, oi: 50, points: pts(0, -1, 20, 18, 25) }),
  ];
  const v = compositeCandle(rs, 'change', 'value');
  near('آخرینِ وزنی با ارزش', v.last, (5 * 10 - 10 * 30) / 40, 1e-12);
  near('کمینهٔ وزنی با ارزش', v.low, (-2 * 10 - 12 * 30) / 40, 1e-12);
  check('بی‌وزن شمرده نمی‌شود و شمارش جدا برمی‌گردد', v.n === 2 && v.missingWeight === 1 && v.weightTotal === 40);
  const o = compositeCandle(rs, 'change', 'oi');
  near('وزن موقعیت باز همهٔ سه را می‌شمارد', o.last, (5 * 100 - 10 * 300 + 20 * 50) / 450, 1e-12);
  check('میانگین ساده و میانه', compositeCandle(rs, 'change', 'equal').last === 5 && compositeCandle(rs, 'change', 'median').last === 5);
  check('«بدون شاخص» چیزی نمی‌سازد', compositeCandle(rs, 'change', 'none') === null);
  const point = compositeCandle([rec('p', { delta: 0.4, value: 1 }), rec('q', { delta: 0.8, value: 3 })], 'delta', 'value');
  near('شاخص نقطه‌ای (دلتا) هم وزنی است', point.mark, (0.4 + 2.4) / 4, 1e-12);
  check('خالی، عدد نمی‌سازد', Number.isNaN(compositeCandle([], 'change', 'value').last ?? NaN));
  const g = compositeByGroup([...rs, rec('z', { uaIns: 'V', uaName: 'v', value: 5, points: pts(0, 0, 3, 3, 3) })], 'change', 'value');
  check('هر نماد/سررسید شاخص خودش را دارد', g.length === 2 && g.find((x) => x.uaIns === 'V').composite.last === 3);
  check('گزینه‌های کشویی', ['value', 'volume', 'oi', 'equal', 'median'].every((k) => COMPOSITE_WEIGHTS.some(([w]) => w === k)));
}

group('۳۳۰. مرتب‌سازی بر هر کلید؛ نامعلوم همیشه ته صف');
{
  const rs = [
    rec('a', { value: 10, oi: 5, points: pts(0, 0, 3, 3, 3) }),
    rec('b', { value: NaN, oi: 9, points: pts(0, 0, -4, -4, 0) }),
    rec('c', { value: 30, oi: NaN, points: pts(0, 0, 9, 9, 9) }),
  ];
  const ids = (o) => orderCandles(rs, o).map((r) => r.ins).join();
  check('ارزش نزولی، نامعلوم آخر', ids({ xMode: 'ranked', sortKey: 'value' }) === 'c,a,b');
  check('ارزش صعودی، نامعلوم باز هم آخر', ids({ xMode: 'ranked', sortKey: 'value', sortDir: 'asc' }) === 'a,c,b');
  check('موقعیت باز', ids({ xMode: 'ranked', sortKey: 'oi' }) === 'b,a,c');
  check('درصد تغییر از نقطهٔ آخرین', ids({ xMode: 'ranked', sortKey: 'change' }) === 'c,a,b' && sortValue(rs[1], 'change') === -4);
  const grouped = orderCandles([...rs, rec('x', { uaIns: 'A', uaName: 'الف', value: 1 })], { xMode: 'grouped', sortKey: 'value' });
  check('در چیدمان گروهی، درون هر گروه مرتب می‌شود', grouped.map((r) => r.ins).join() === 'x,c,a,b');
  check('نام قدیمی rankKey هنوز کار می‌کند', ids({ xMode: 'ranked', rankKey: 'value' }) === 'c,a,b');
  check('کلیدهای خواسته‌شده در فهرست', ['value', 'volume', 'oi', 'trades', 'oiChange', 'change', 'ivPct'].every((k) => SORT_KEYS.some((s) => s.key === k)));
}

group('۳۳۰. لایهٔ میله پشت کندل‌ها');
{
  const lin = backgroundBarAxis([0, 50, 100], { log: false, share: 0.3 });
  near('خطی: بلندترین میله ۳۰٪ کادر', 100 / lin.max, 0.3, 1e-12);
  const lg = backgroundBarAxis([10, 1000, 1e6], { log: true, share: 0.3 });
  near('لگاریتمی: بلندترین میله ۳۰٪ کادر', Math.log(1e6 / lg.min) / Math.log(lg.max / lg.min), 0.3, 1e-9);
  check('کوچک‌ترین میله هم دیده می‌شود (بالای کف محور)', lg.min < 10);
  check('بی عدد، محوری نمی‌سازد', backgroundBarAxis([NaN, 0], { log: true }) === null);
}

group('۳۳۰. سیم‌کشی رابط');
{
  const view = readSrc('../ui/contract-candles-view.mjs');
  check('میله در همان شبکه، محور دوم پنهان، بی‌واکنش و پشت کندل', view.includes("grid: [{ left: 64, right: 54, top: 30, bottom: bottomPad }]") && view.includes('show: false, name: barLabel') && view.includes('silent: true, z: 1') && !view.includes('gridIndex: 1'));
  check('کشیدن روی محور، بزرگ‌نمایی همان محور؛ دوبار کلیک برمی‌گرداند', view.includes('function attachAxisDrag(chart)') && view.includes("dataZoomIndex: axis === 'y' ? 2 : 0") && view.includes("zr.on('dblclick'"));
  // دور پنجم: «کندل نباشد، همان خط افقی باشد… صرفاً یک خط، نه نوار.»
  check('شاخص ترکیبی فقط یک خط افقی است: نه کندل، نه نوار، نه خط هر گروه', view.includes('data-ccv="composite"') && view.includes('refs.push({ yAxis: ax(value), lineStyle: { color: t.accent') && !view.includes('renderComposite') && !view.includes('compAreas') && !view.includes("'شاخص ترکیبی'] : []") && !view.includes('compositeCandle(drawable.slice(b.from'));
  check('نقطهٔ خط شاخص از منوی کشویی', view.includes('data-ccv="compositePoint"') && view.includes("const point = m.shape === 'candle' ? opts.compositePoint : 'mark';"));
  check('جزئیات هاور در پنل کنار نمودار، راهنمای شناور یک خط', view.includes('<aside class="ccv-side" data-ccv-pin') && view.includes('formatter: (p) => shortTip(p)') && view.includes("mother.instance.on('mouseover'"));
  check('جدول شاخص هر گروه سر جایش', view.includes('function paintComposite('));
  check('مرتب‌سازی قراردادها و جهت', view.includes('data-ccv="sortKey"') && view.includes('data-ccv="sortDir"') && view.includes('data-ccv="listSort"'));
}
