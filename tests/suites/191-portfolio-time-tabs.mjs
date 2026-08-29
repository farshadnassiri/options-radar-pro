// ۱۹۱. پوستهٔ پنج‌تبی استودیوی سفر زمانی

import { check, group, readSrc } from '../harness.mjs';

const tab191 = readSrc('../ui/tabs/portfolio-time.mjs');
const at = (needle) => tab191.indexOf(needle);

group('۱۹۱. پنج تب استودیو');
{
  const PANELS = ['setup', 'timeline', 'strategies', 'basket', 'dossier'];
  check('هر پنج پنل در نشانه‌گذاری هستند',
    PANELS.every((id) => tab191.includes(`data-panel="${id}"`)));
  check('و ترتیبشان همان ترتیب کار کاربر است',
    PANELS.map((id) => at(`data-panel="${id}"`))
      .every((index, order, all) => order === 0 || (index > all[order - 1] && index > 0)));
  check('نوار تب از همان کمکیِ مشترک ساخته می‌شود، نه پیاده‌سازی دوم',
    /import \{ mountSubtabs \} from '\.\.\/subtabs\.mjs'/.test(tab191)
    && /mountSubtabs\(host, PT_TABS, \{ root, initial: 'timeline' \}\)/.test(tab191));
  check('فهرست تب‌ها با فهرست پنل‌ها یکی است',
    PANELS.every((id) => new RegExp(`id: '${id}', label: '`).test(tab191)));
  check('هر تب برچسب فارسی و راهنما دارد',
    (tab191.match(/\{ id: '\w+', label: '[^']+', hint: '[^']+' \}/g) || []).length === 5);

  // ── بخش‌های موجود جابه‌جا شدند، بازنویسی نشدند ──────────────────────
  // پنل‌ها از سند بیرون نمی‌روند و فقط `hidden` می‌شوند، پس هر
  // `$('pt-…')` در همین فایل مثل قبل کار می‌کند.
  for (const [panel, ids] of [
    ['timeline', ['pt-clock']],
    ['strategies', ['pt-proposals', 'pt-eligibility']],
    ['basket', ['pt-ledger', 'pt-positions']],
    ['dossier', ['pt-closeout']],
  ]) {
    const next = PANELS[PANELS.indexOf(panel) + 1];
    const end = next ? at(`data-panel="${next}"`) : tab191.indexOf('</section>\n  </div>`');
    check(`بخش‌های تب ${panel} داخل همان پنل‌اند`,
      ids.every((id) => at(`id="${id}"`) > at(`data-panel="${panel}"`)
        && (end < 0 || at(`id="${id}"`) < end)), ids.join('،'));
  }

  // ── هشدارِ قید به تب فعال بستگی ندارد ───────────────────────────────
  // اگر نوار هشدار داخل یکی از پنل‌ها بنشیند، کاربری که در تایم‌لاین جلو
  // می‌رود شکستن قید را اصلاً نمی‌بیند.
  check('نوار هشدار بیرون از هر پنل و بالای نوار تب است',
    at('id="pt-watch"') > 0 && at('id="pt-watch"') < at('id="pt-tabs"')
    && at('id="pt-watch"') < at('data-panel="setup"'));

  // ── تبِ بی‌محتوا نشان داده نمی‌شود ─────────────────────────────────
  check('تا پیش از فعال‌شدن جلسه نوار تب نمی‌آید',
    /const live = session\?\.state === 'active' \|\| session\?\.state === 'closed';/.test(tab191)
    && /host\.hidden = !live;/.test(tab191));
  check('و در آن حالت فقط پنل راه‌اندازی باز است',
    /panel\.hidden = tab\.id !== 'setup';/.test(tab191));
  check('نوار تب از همان نقطهٔ واحدِ بازنقاشی زنده صدا زده می‌شود',
    /function paintProposals\(session\) \{\s*\n\s*proposalSession = session;\s*\n\s*paintTabs\(session\);/.test(tab191));
  check('پنل مخفی از سند بیرون نمی‌رود — فقط `hidden` می‌شود',
    !/removeChild|\.remove\(\)/.test(tab191.slice(at('function paintTabs'), at('function paintTabs') + 900)));
}
