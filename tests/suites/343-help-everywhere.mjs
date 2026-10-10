// ۳۴۳. «؟» برای همهٔ بخش‌ها و پنهان‌شدنِ توضیحِ ایستا (۱۴۰۵/۰۷/۱۸)
//
// خواستهٔ صاحب پروژه: «توضیحات این مدلی (هر جدول و نمودار از عکس واقعی
// بازار… ساخته می‌شود) را از سراسر برنامه حذف کن؛ فقط توضیحات مهمی که کاربر
// باید بداند بماند. توضیحات کامل را در آیکون علامت سؤال برای همهٔ بخش‌ها
// بساز… با زبان ساده برای یک تریدر و مثال عددی.»

import { check, group, readSrc } from '../harness.mjs';
import { isExplanatory, headingText } from '../../ui/help.mjs';
import { helpFor, normalizeTitle, HELP_COUNT } from '../../ui/help-texts.mjs';
import live from '../../ui/help-texts/live.mjs';
import analysis from '../../ui/help-texts/analysis.mjs';
import portfolio from '../../ui/help-texts/portfolio.mjs';
import tools from '../../ui/help-texts/tools.mjs';

// عنصرِ ساختگیِ کمینه، به‌اندازهٔ آنچه `isExplanatory` می‌خواند.
const el = ({ text = 'این بخش نشان می‌دهد که هر جدول از عکس واقعی بازار ساخته می‌شود.', attrs = {}, classes = [], controls = false, inside = '' } = {}) => ({
  textContent: text,
  id: attrs.id || '',
  attributes: Object.entries(attrs).filter(([k]) => k !== 'id').map(([name, value]) => ({ name, value })),
  hasAttribute: (k) => k in attrs,
  getAttribute: (k) => attrs[k] ?? null,
  classList: { contains: (c) => classes.includes(c) },
  querySelector: () => (controls ? {} : null),
  closest: (sel) => (inside && sel.includes(inside) ? {} : null),
});

group('۳۴۳. کدام یادداشت پنهان می‌شود');
{
  check('توضیحِ ایستای بلند پنهان می‌شود', isExplanatory(el()));
  check('وضعیت و عددِ زنده می‌ماند (شناسه، data-*، role، aria-live)', !isExplanatory(el({ attrs: { id: 'x' } }))
    && !isExplanatory(el({ attrs: { 'data-ccv-status': '' } })) && !isExplanatory(el({ attrs: { role: 'status' } })) && !isExplanatory(el({ attrs: { 'aria-live': 'polite' } })));
  check('یادداشتِ پویای توضیحی با `data-help-note` پذیرفته است', isExplanatory(el({ attrs: { 'data-help-note': '', 'data-lmm-chain-note': '' } })));
  check('هشدار، زیان، سود و `data-keep` می‌مانند', !isExplanatory(el({ classes: ['loss'] })) && !isExplanatory(el({ classes: ['warn'] }))
    && !isExplanatory(el({ text: '⚠ داده کهنه است و این عدد ممکن است مال دیروز باشد.' })) && !isExplanatory(el({ attrs: { 'data-keep': '' } })));
  check('یادداشتِ کوتاه یا دارای کنترل می‌ماند', !isExplanatory(el({ text: '۱۰ نماد پایه' })) && !isExplanatory(el({ controls: true })));
  check('درونِ خودِ پنجرهٔ راهنما دست نمی‌خورد', !isExplanatory(el({ inside: '.g-help-pop' })));
}

group('۳۴۳. پیدا کردنِ توضیحِ هر عنوان');
{
  check('شکلک و فاصلهٔ اضافه در جست‌وجو اثر ندارد', normalizeTitle(' 🔬  آزمایشگاه   آپشن ') === 'آزمایشگاه آپشن');
  const h = { cloneNode: () => ({ querySelectorAll: () => [], textContent: ' نقشه بازار اختیار ' }) };
  check('متنِ عنوان بی آیکون', headingText(h) === 'نقشه بازار اختیار');
  check('عنوانِ ناشناخته توضیح ندارد', helpFor('عنوانی که نیست') === null && helpFor('') === null);
}

group('۳۴۳. متن‌ها: ساده، با مثال عددی');
{
  const all = [live, analysis, portfolio, tools].flatMap((g) => Object.entries(g || {}));
  check('چهار گروه پر شده‌اند و صدها بخش توضیح دارند', [live, analysis, portfolio, tools].every((g) => Object.keys(g).length >= 20) && HELP_COUNT() >= 150, HELP_COUNT());
  check('هر مدخل شرح دارد', all.every(([, e]) => typeof e.body === 'string' && e.body.trim().length >= 20));
  const withExample = all.filter(([, e]) => typeof e.example === 'string' && /[۰-۹]/.test(e.example));
  check('بیشترِ مدخل‌ها مثالِ عددی با رقم فارسی دارند', withExample.length >= all.length * 0.85, `${withExample.length}/${all.length}`);
  const dotted = all.filter(([, e]) => /[۰-۹0-9]\s*·|·\s*[۰-۹0-9]/.test(`${e.body} ${e.example || ''}`));
  check('«·» کنارِ رقم نیست (با «۰» یکی دیده می‌شود)', dotted.length === 0, dotted.map(([k]) => k).slice(0, 3).join('، '));
  const long = all.filter(([, e]) => `${e.body}${e.example || ''}`.length > 700);
  check('هیچ مدخلی دراز نیست', long.length === 0, long.map(([k]) => k).slice(0, 3).join('، '));
  check('مثالِ خواستهٔ صاحب پروژه: داشبورد لحظه‌ای توضیح دارد', Boolean(helpFor('داشبورد معاملاتی لحظه‌ای')));
  // عنوانِ مشترک بینِ دو گروه فقط متنِ گروهِ اول را نشان می‌دهد؛ دومی مرده است.
  const keys = all.map(([k]) => normalizeTitle(k));
  const twice = keys.filter((k, i) => keys.indexOf(k) !== i);
  check('هیچ عنوانی در دو گروه تکرار نشده', twice.length === 0, twice.slice(0, 3).join('، '));
}

group('۳۴۳. سیم‌کشی');
{
  const app = readSrc('../ui/app.mjs'), css = readSrc('../ui/style.css'), help = readSrc('../ui/help.mjs');
  check('برنامه لایهٔ راهنما را یک بار سوار می‌کند', app.includes("import { installHelp } from '/ui/help.mjs';") && app.includes('installHelp();'));
  check('یادداشتِ جابه‌جاشده پنهان است و آیکون متن ندارد (تصویرِ ذخیره‌شده «؟» نمی‌گیرد)',
    css.includes('[data-help-moved] { display: none !important; }') && css.includes('.g-help::before { content: "؟"; }'));
  check('هر رسمِ تازه دوباره سنجیده می‌شود و متن از خودِ عنصر خوانده می‌شود',
    help.includes('new MutationObserver(soon).observe(stage, { childList: true, subtree: true });') && help.includes(".map((n) => n.textContent.replace(/\\s+/g, ' ').trim())"));
  check('«؟»ِ قدیمیِ استرانگل و اسکنر پر می‌شود، دوتا نمی‌شود', help.includes("const legacy = heading?.querySelector('[data-help]');"));
  check('پنجره با کلیک بیرون و Esc بسته می‌شود', help.includes("if (event.key === 'Escape' && !pop.hidden) close();"));
  check('«نمایش»ِ ردیف‌های جدول «؟»ِ تنظیمات نمی‌گیرد', help.includes("h.closest('.g-help-pop, table')"));
}
