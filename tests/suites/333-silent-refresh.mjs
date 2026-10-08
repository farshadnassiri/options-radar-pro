// ۳۳۳. تازه‌شدنِ بی‌صدا در سراسر برنامه (۱۴۰۵/۰۷/۱۶)
//
// «وقتی دیتای جدید گرفته می‌شود برنامه و صفحه انگار ریلود می‌شود… می‌خواهم
// دریافت دیتا را کاربر اصلاً متوجه نشود و صرفاً دیتای جدید دیده شود.» و:
// «در سراسر برنامه منظورم است… هیچ وقفه‌ای نباشد و همه‌چیز روان و تازه.»
//
// سه ریشه: نمودار در هر تیک انیمیشنِ ورود را دوباره پخش می‌کرد (و نقشهٔ
// درختی انیمیشنِ سریِ خودش را داشت)، HTML و ردیف‌های جدول دور ریخته و از نو
// ساخته می‌شدند، و هر تیکِ خودکار «در حال دریافت…» می‌نوشت.

import { check, group, readSrc } from '../harness.mjs';
import { carryChartState, quiet } from '../../ui/chart-host.mjs';
import { morphChildren, fresh } from '../../ui/morph.mjs';

// ── یک DOMِ کوچک، فقط آنچه `morph` می‌خواند ──
class FakeNode {
  constructor(type, name = '', value = '') {
    this.nodeType = type; this.nodeName = name.toUpperCase(); this.tagName = this.nodeName;
    this.nodeValue = value; this.childNodes = []; this.parentNode = null; this.attrs = new Map();
    this.ownerDocument = DOC;
  }
  get attributes() { return [...this.attrs].map(([name, value]) => ({ name, value })); }
  hasAttribute(n) { return this.attrs.has(n); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map((c) => c.textContent).join(''); }
  detach() { if (this.parentNode) { const list = this.parentNode.childNodes; list.splice(list.indexOf(this), 1); this.parentNode = null; } }
  appendChild(n) { n.detach(); n.parentNode = this; this.childNodes.push(n); return n; }
  replaceChild(n, old) { n.detach(); const i = this.childNodes.indexOf(old); this.childNodes[i] = n; n.parentNode = this; old.parentNode = null; return old; }
  removeChild(n) { n.detach(); return n; }
}
const DOC = { activeElement: null };
const el = (tag, attrs = {}, ...kids) => {
  const n = new FakeNode(1, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const k of kids) n.appendChild(typeof k === 'string' ? new FakeNode(3, '#text', k) : k);
  return n;
};

group('۳۳۳. وصله، نه بازسازی (`ui/morph.mjs`)');
{
  const host = el('div', {}, el('p', { class: 'v' }, '۱۰۰'), el('span', {}, 'ثابت'));
  const keepP = host.childNodes[0], keepSpan = host.childNodes[1], keepText = keepP.childNodes[0];
  morphChildren(host, el('div', {}, el('p', { class: 'v up' }, '۱۰۱'), el('span', {}, 'ثابت')));
  check('گرهٔ موجود می‌ماند و فقط عددش عوض می‌شود',
    host.childNodes[0] === keepP && keepP.childNodes[0] === keepText && keepText.nodeValue === '۱۰۱' && host.childNodes[1] === keepSpan);
  check('ویژگیِ تازه روی همان گره می‌نشیند', keepP.getAttribute('class') === 'v up');

  morphChildren(host, el('div', {}, el('p', {}, 'تنها')));
  check('ویژگیِ حذف‌شده برداشته می‌شود و گرهٔ اضافه می‌رود',
    host.childNodes.length === 1 && host.childNodes[0] === keepP && !keepP.hasAttribute('class'));

  morphChildren(host, el('div', {}, el('table', {}, 'جدول')));
  check('گرهٔ ناهم‌جنس جایگزین می‌شود', host.childNodes[0].nodeName === 'TABLE' && host.childNodes[0] !== keepP);

  // نمودارِ ECharts مالِ خودِ کتابخانه است: بومش نباید دست بخورد.
  const chart = el('div', { _echarts_instance_: 'ec_1' }, el('canvas'));
  const canvas = chart.childNodes[0];
  const wrap = el('div', {}, chart);
  morphChildren(wrap, el('div', {}, el('div', {})));
  check('ظرفِ نمودار و بومش دست‌نخورده می‌مانند', wrap.childNodes[0] === chart && chart.childNodes[0] === canvas && chart.hasAttribute('_echarts_instance_'));

  const details = el('details', {}, 'x'); details.open = true;
  const box = el('div', {}, details);
  morphChildren(box, el('div', {}, el('details', {}, 'y')));
  check('`<details>`ی که کاربر باز کرده باز می‌ماند', box.childNodes[0] === details && details.open === true);

  const input = el('input', { value: 'قدیم' }); input.value = 'دارد تایپ می‌کند';
  const form = el('div', {}, input);
  DOC.activeElement = input;
  morphChildren(form, el('div', {}, el('input', { value: 'تازه' })));
  check('ورودیِ زیرِ دستِ کاربر بازنویسی نمی‌شود', input.value === 'دارد تایپ می‌کند');
  DOC.activeElement = null;

  const a = el('button'), b = el('button');
  const first = fresh([a, b]), second = fresh([a, b, el('button')]);
  check('شنونده یک بار به هر گره می‌چسبد، نه یک بار در هر تیک', first.length === 2 && second.length === 1);
}

group('۳۳۳. نمودار: بی انیمیشنِ ورود، با وضعیتِ کاربر');
{
  const option = { legend: { data: ['کال', 'پوت'] }, dataZoom: [{ type: 'inside', start: 0, end: 100 }], series: [{ type: 'treemap', data: [] }] };
  const prev = { legend: [{ selected: { 'کال': true, 'پوت': false } }], dataZoom: [{ start: 40, end: 80 }] };
  const carried = carryChartState(prev, option);
  check('سریِ خاموش‌شده در راهنما خاموش می‌ماند', carried.legend.selected['پوت'] === false && !('کال' in carried.legend.selected));
  check('پنجرهٔ بزرگ‌نمایی می‌ماند', carried.dataZoom[0].start === 40 && carried.dataZoom[0].end === 80);
  check('گزینهٔ سازنده دست نمی‌خورد', option.dataZoom[0].start === 0 && !option.legend.selected);
  const untouched = carryChartState({ dataZoom: [{ start: 0, end: 100 }] }, { dataZoom: [{ startValue: 5 }] });
  check('بی بزرگ‌نماییِ کاربر، پنجرهٔ سازنده می‌ماند', untouched.dataZoom[0].startValue === 5);

  const q = quiet(option);
  check('تازه‌شدن بی انیمیشن است — هم سراسری هم روی هر سری (نقشهٔ درختی پیش‌فرضِ خودش را دارد)',
    q.animation === false && q.series[0].animation === false && option.series[0].animation === undefined);
  check('سریِ تکی (نه آرایه) هم خاموش می‌شود', quiet({ series: { type: 'line' } }).series.animation === false);
}

group('۳۳۳. سیم‌کشی در سراسر برنامه');
{
  const host = readSrc('../ui/chart-host.mjs');
  check('سوارکردنِ دوباره روی همان ظرف، همان نمودار را به‌روز می‌کند',
    host.includes('const reuse = liveHandles.get(host);') && host.includes('if (reuse.update(build)) return reuse;'));
  check('تازه‌شدن از `quiet` و `carryChartState` می‌گذرد', host.includes('if (painted) option = quiet(carryChartState(instance.getOption(), option));'));
  check('گروهِ نمودار ظرفِ یکسان را دور نمی‌ریزد', host.includes('if (prev && prev.host !== host) prev.dispose();'));
  check('رتبهٔ تلاطم هم', readSrc('../ui/vol-rank-view.mjs').includes('if (prev && prev.host !== el) prev.dispose();'));

  const table = readSrc('../ui/table.mjs');
  check('جدول ردیف‌ها را وصله می‌کند و یک شنونده دارد',
    table.includes('morphChildren(tbody, out);') && table.includes("tbody.addEventListener('click', (event) => {")
    && !table.includes("tr.addEventListener('click', () => { activeIdx = i; opts.onPick?.(r); });"));

  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('تیکِ خودکار «در حال دریافت» نمی‌نویسد و نوارِ درجریان را روشن نمی‌کند',
    dash.includes('const manual = Boolean(event?.type);') && /if \(manual\) \{\s*\$\('dd-refresh'\)\.disabled = true; \$\('dd-status'\)\.textContent = 'در حال دریافت عکس تازه بازار…';/.test(dash)
    && dash.includes('if (manual) busyBar?.busy(false);'));
  check('نماهای HTML وصله می‌شوند، پاک نمی‌شوند',
    dash.includes('paintInto(host, (into) => barChart') === false && dash.includes("paintInto(host, (into) => { into.innerHTML = barChart(ranked(view, scoped, 16), view[4]); });")
    && !dash.includes("if (!tabular) { for (const entry of tables.values()) entry.el.remove(); host.innerHTML = ''; }"));

  const map = readSrc('../ui/live-market-map.mjs');
  check('نقشه: جمع‌بندی، نماد، سررسید و زنجیره وصله می‌شوند',
    ['patchHTML(summaryHost,', 'patchHTML(underlyingHost,', 'patchHTML(expiryRail,', 'patchHTML(expiryInfo,', 'patchHTML(pairedHost,'].every((x) => map.includes(x)));
  check('زنجیره کلیک‌هایش را یک بار روی میزبان می‌گیرد',
    map.includes("pairedHost.addEventListener('click', (event) => {") && !map.includes("pairedHost.querySelectorAll('[data-lmm-paired-pick]').forEach"));

  const positions = readSrc('../ui/tabs/positions.mjs');
  check('موقعیت‌ها: فهرست وصله می‌شود و شنونده‌ها تکراری نمی‌شوند',
    positions.includes("patched(root.querySelector('#list')).innerHTML =") && positions.includes("for (const b of fresh(root.querySelectorAll('[data-del]'))) {")
    && positions.includes("for (const tr of fresh(root.querySelectorAll('#list tbody tr[data-i]'))) {"));
  check('رول، زنجیره و دفتر خطاها هم',
    readSrc('../ui/tabs/roll.mjs').includes("for (const tr of fresh(root.querySelectorAll('#cand tbody tr'))) {")
    && readSrc('../ui/tabs/chain.mjs').includes("patched(root.querySelector('#flow')).innerHTML =")
    && readSrc('../ui/tabs/logs.mjs').includes("patched($('log-kpis')).innerHTML ="));
}
