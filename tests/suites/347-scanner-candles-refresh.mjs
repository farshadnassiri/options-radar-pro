// ۳۴۷. اسکنر، استراتژی و کندل‌ها: تازه‌سازیِ خودکار درجا (۱۴۰۵/۰۷/۱۸)
//
// همان گزارش ۳۴۴: «بعد از چند ثانیه نمودارها بسته می‌شود و دوباره باید
// دریافت اطلاعات کنم… می‌خواهم هر جا به‌روزرسانی می‌شود، نمودارها و جدول‌ها
// و همهٔ خروجی‌ها لحظه‌ای به‌روز شوند و از اول نیاز به تنظیم نباشد.»
// بازبینی سه جای دیگر را پیدا کرد: اسکنر آپشن (که در رصد لحظه‌ای هم
// نشسته)، اسکنِ خودکار استراتژی، و کندل‌های امروز و گذشته.

import { check, group, readSrc } from '../harness.mjs';

const fnBody = (src, head, end = '\n  }\n') => {
  const start = src.indexOf(head);
  return start < 0 ? '' : src.slice(start, src.indexOf(end, start));
};

group('۳۴۷. اسکنر آپشن: اسکنِ زنده صفحه را نمی‌کشد');
{
  const cs = readSrc('../ui/tabs/combo-scanner.mjs');
  const run = fnBody(cs, 'async function run(');
  const detail = fnBody(cs, 'function showDetail(');
  check('تیکِ «زنده» مسیرِ خودکار را صدا می‌زند', cs.includes('setInterval(() => run({ auto: true })') && !cs.includes('setInterval(run,'));
  check('«نمایش بیشتر» فقط با اسکنِ دستی به ۲۴ کارت برمی‌گردد',
    run.includes('if (!auto) shown = PAGE;') && !run.includes('lastAt = Date.now(); shown = PAGE;'));
  check('پیمایش فقط با انتخابِ کاربر؛ تازه‌سازی پس از اسکن آرام است',
    detail.includes("if (!quiet) host.scrollIntoView(") && run.includes('showDetail(picked.id, { quiet: true })'));
  check('بزرگ‌نماییِ نمودار و جای لغزندهٔ همان ترکیب می‌ماند',
    detail.includes('const range = same ? chart?.view?.() : null;') && detail.includes('initRange: range')
    && detail.includes("slider.dispatchEvent(new Event('input', { bubbles: true }))"));
  check('با فوکوس روی کنترلِ جزئیات، تازه‌سازی تا بیرون آمدنِ کاربر عقب می‌افتد',
    detail.includes('pendingId = id; return;') && cs.includes("$('cs-detail').addEventListener('focusout'"));
  check('ترکیبِ غایب در اسکنِ تازه بسته نمی‌شود، برچسب می‌گیرد',
    run.includes('else if (picked) markGone();') && !run.includes("$('cs-detail').hidden = true; picked = null;")
    && cs.includes('دیگر نیامد؛ عددهای زیر مال آخرین اسکنی است که در آن بود'));
  check('لغزندهٔ ترکیبِ غایب هنوز کار می‌کند',
    cs.includes('byId.get(el.dataset.csSlide) || (picked?.id === el.dataset.csSlide ? picked : null)'));
  check('اسکنِ خودکار جملهٔ «در حال…» را روی نتیجهٔ موجود نمی‌گذارد',
    run.includes("if (!quiet) $('cs-summary').textContent = 'در حال ترکیب سهم، کال و پوت…';") && run.includes('if (quiet) return;'));
  check('خطا یا پاسخِ خالیِ اسکنِ خودکار آخرین نتیجهٔ خوب را پاک نمی‌کند',
    run.includes('if (quiet && !res.groups.length && result.groups.length) {')
    && run.indexOf('if (res.error) {') < run.indexOf('result = res;')
    && run.indexOf('if (quiet && !res.groups.length') < run.indexOf('result = res;'));
  check('نوارِ فیلتر نتیجه‌ها زیرِ دستِ کاربر از نو ساخته نمی‌شود',
    cs.includes('if (html === barMarkup || (quiet && host.contains(document.activeElement))) return;')
    && run.includes('paintResultsBar({ quiet: auto });'));
  check('کارت‌ها وصله می‌شوند، نه جایگزین', fnBody(cs, 'function paintGrid(').includes('patchHTML(grid,'));
}

group('۳۴۷. استراتژی: اسکنِ خودکار پانل جزئیات را نمی‌بندد');
{
  const st = readSrc('../ui/tabs/strategy.mjs');
  const detail = fnBody(st, 'function showDetail(r, { quiet = false } = {}) {', '\n  async function runTimeMachine(');
  check('اسکن، همان ردیف را با مسیرِ آرام تازه می‌کند',
    st.includes('if (picked) { const f = byId2.get(picked.id); if (f) showDetail(f, { quiet: true }); }'));
  check('با فوکوس روی کنترلِ پانل (قیمت دستی، کشویی) بازسازی نمی‌شود',
    detail.includes("if (quiet && sameRow && card.contains(document.activeElement) && document.activeElement.matches('input, select, textarea')) { pendingRow = r; return; }")
    && st.includes("root.querySelector('#detail-card').addEventListener('focusout'"));
  check('`<details>`ِ باز، مقدار کشویی و فرض‌های تغییریافته برمی‌گردند',
    st.includes("querySelectorAll('input[id], select[id], details[id]')")
    && st.includes("if (el.tagName === 'DETAILS') { el.open = v; continue; }")
    && detail.includes('const kept = sameRow ? userControls(card) : new Map();')
    && detail.indexOf('const defaults = controlState(card);') < detail.indexOf('restoreControls(card, kept);'));
  check('فقط آنچه کاربر از پیش‌فرض عوض کرده برمی‌گردد (پیش‌فرضِ تازه برای بقیه)',
    st.includes('detailDefaults.has(id) && detailDefaults.get(id) !== v') && detail.includes('detailDefaults = defaults;'));
  check('برگرداندن، شنوندهٔ همان کنترل را صدا می‌زند تا جدولش هم تازه شود',
    st.includes("el.dispatchEvent(new Event('change', { bubbles: true }));"));
  check('خروجیِ ماشین زمانِ همان ردیف پاک نمی‌شود',
    detail.includes("if (!sameRow || !tmWrap.querySelector('#tm-btn')) {") && detail.includes('runTimeMachine(tmRow,'));
}

group('۳۴۷. کندل‌ها: تیک کشویی و کندلِ باز را نمی‌بندد');
{
  const cv = readSrc('../ui/contract-candles-view.mjs');
  const controls = fnBody(cv, 'function paintControls(');
  const list = fnBody(cv, 'function paintList(');
  check('گزینه‌های پیش‌تنظیم فقط با عوض شدنِ پیش‌تنظیم‌ها ساخته می‌شوند و انتخاب می‌ماند',
    controls.includes('if (presetHtml !== presetMarkup) {') && controls.includes('presetSel.value = chosen && presets[chosen] ? chosen : \'\';')
    && !controls.includes("q('[data-ccv-preset]').innerHTML ="));
  check('فهرستِ یکسانِ کندل‌ها دوباره ساخته نمی‌شود',
    list.includes("if (sig === listMarkup && rangeChart.querySelector('.lmm-range-list')) return;")
    && list.includes('row.low, row.high, row.first, row.last, row.close, row.yday'));
  check('کندلِ باز و نقطهٔ خوانده‌شده با کلیدِ قرارداد برمی‌گردند',
    list.includes("if (k.open) button.setAttribute('aria-expanded', 'true');")
    && list.includes("point.dispatchEvent(new Event('pointermove', { bubbles: true }))")
    && list.indexOf('const keep = ') < list.indexOf('rangeChart.innerHTML = html;'));
  check('حالتِ خالی امضای فهرست را پاک می‌کند (بازگشتِ داده دوباره می‌کشد)',
    list.includes("if (!rows.length) { listMarkup = '';"));
  check('تیکِ بیرونی تبِ گذشته را بی تغییرِ ورودی نمی‌کشد',
    cv.includes('paint: paintFromTick,') && cv.includes('if (past && tickSig && tickSig === inputsSig()) return;')
    && cv.includes("tickSig = past && isVisible() ? inputsSig() : '';"));
  const sig = fnBody(cv, 'function inputsSig(');
  check('امضای تبِ گذشته همهٔ ورودی‌های نقاشی را دارد',
    ['pastState.date', 'infoVersion', 'pastState.loading', 'pastState.note', 'pinned', 'listLimit', 'JSON.stringify(opts)', 'getSettings()'].every((k) => sig.includes(k)));
}
