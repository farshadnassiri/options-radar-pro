// ۶۵. جمع و باز کردن پنل سمت راست با یک دکمه
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';


group('۶۵. جمع و باز کردن پنل سمت راست با یک دکمه');
{
  // دکمهٔ باز کردن، `position: fixed` با `inset-inline-end` بود؛ در سندی
  // که `dir="rtl"` است، inline-end همان لبهٔ چپ است — پس دکمه در سمت
  // مقابلِ پنل می‌نشست. راه‌حل، نگه‌داشتن همان دکمهٔ خودِ ریل است.
  const indexHtml65 = readSrc('../ui/index.html');
  const cssSrc65 = readSrc('../ui/style.css');
  const appSrc65 = readSrc('../ui/app.mjs');

  check('سند راست‌به‌چپ است — پس inset-inline-end یعنی سمت چپ',
    /<html[^>]*dir="rtl"/.test(indexHtml65));
  check('دکمهٔ شناور دیگر وجود ندارد',
    !indexHtml65.includes('rail-floating') && !cssSrc65.includes('rail-floating')
    && !appSrc65.includes('rail-floating'));
  check('تنها یک دکمهٔ جمع/باز در سند هست',
    (indexHtml65.match(/rail-toggle-btn/g) || []).length === 1);
  check('و آن دکمه داخل خودِ ریل است، نه بیرونش',
    /<nav class="rail"[\s\S]*?rail-toggle-btn[\s\S]*?<\/nav>/.test(indexHtml65));
  check('همان یک دکمه هر دو جهت را می‌گیرد',
    /el\('rail-toggle-btn'\)\.addEventListener\('click', \(\) => toggleRail\(\)\);/.test(appSrc65));

  // جمع‌شده یعنی باریک، نه ناپدید: اگر عرض صفر و pointer-events هیچ شود،
  // دکمهٔ بازگشت هم با آن می‌رود.
  const collapsed = cssSrc65.match(/\.shell\[data-rail-collapsed="true"\] \.rail \{[^}]*\}/);
  check('ریل جمع‌شده عرض دارد، صفر نمی‌شود',
    Boolean(collapsed) && /width: var\(--rail-stub\)/.test(collapsed[0])
    && !/width: 0/.test(collapsed[0]));
  check('و کلیک‌پذیر می‌ماند',
    Boolean(collapsed) && !/pointer-events: none/.test(collapsed[0])
    && !/opacity: 0/.test(collapsed[0]));
  check('عرض نوار بیرون‌زده از توکن خودِ ریل می‌آید',
    /--rail-stub: \d+px;/.test(cssSrc65));
  check('در حالت جمع فقط جست‌وجو و فهرست پنهان می‌شوند، نه دکمه',
    /\.shell\[data-rail-collapsed="true"\] \.rail-search,\s*\.shell\[data-rail-collapsed="true"\] \.rail-list \{ display: none; \}/.test(cssSrc65)
    && !/\.shell\[data-rail-collapsed="true"\] \.rail-toggle \{[^}]*display: none/.test(cssSrc65));
  check('روی موبایل هم ریل جمع‌شده ناپدید نمی‌شود',
    !/\.shell\[data-rail-collapsed="true"\] \.rail \{ display: none; \}/.test(cssSrc65));

  check('نام دکمه، کارِ کلیک بعدی را می‌گوید نه حالت فعلی را',
    appSrc65.includes("isRailCollapsed ? 'باز کردن پنل استراتژی‌ها' : 'جمع کردن پنل استراتژی‌ها'")
    && appSrc65.includes("toggleBtn.setAttribute('aria-label', label)"));
  check('پیکان دکمه با حالت باز و بسته می‌چرخد',
    /\.rail-toggle\[aria-expanded="true"\] \.rail-toggle-ic \{ transform: rotate\(180deg\); \}/.test(cssSrc65));
}
