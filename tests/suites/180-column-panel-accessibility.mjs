// ۱۸۰. اعلام باز و بسته بودن پنل انتخاب ستون

import { check, group, readSrc } from '../harness.mjs';

group('۱۸۰. اعلام باز و بسته بودن پنل انتخاب ستون');
{
  const tableSrc180 = readSrc('../ui/table.mjs');

  check('دکمه ستون‌ها در شروع بسته بودن پنل را اعلام می‌کند',
    tableSrc180.includes('class="ghost tbl-cols-btn" aria-expanded="false"'));
  check('هر نمونه جدول شناسه تازه‌ای برای پنل ستون می‌سازد',
    tableSrc180.includes('let tableA11ySeq = 0')
    && tableSrc180.includes('`table-columns-${++tableA11ySeq}`'));
  check('دکمه و پنل با aria-controls و id به همان شناسه وصل‌اند',
    tableSrc180.includes('aria-controls="${columnPanelId}"')
    && tableSrc180.includes('class="col-panel" id="${columnPanelId}"'));
  check('هر باز و بسته شدن aria-expanded را هم‌زمان می‌کند',
    tableSrc180.includes("colsBtn?.setAttribute('aria-expanded', open ? 'true' : 'false')")
    && tableSrc180.includes("panel.toggleAttribute('hidden', !open)"));
  check('معنای کلید روشن و خاموش از دکمه پنل حذف شده است',
    !tableSrc180.includes("colsBtn?.setAttribute('aria-pressed'")
    && !/tbl-cols-btn[^>]*aria-pressed/.test(tableSrc180));
  check('بستن مستقیم، کلیک بیرون و Escape همگی از مسیر همگام عبور می‌کنند',
    tableSrc180.includes("[data-act=\"close\"]').addEventListener('click', togglePanel)")
    && /function closeOnOutside\([^)]+\)[\s\S]*?togglePanel\(\)/.test(tableSrc180)
    && /function closeOnEscape\([^)]+\)[\s\S]*?togglePanel\(\)/.test(tableSrc180));
}
