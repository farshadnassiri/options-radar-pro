// ۸۹. مالکیت انتخاب نماد در نگاه باز
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { createOpenViewBaseSyncGate } from '../../ui/open-view-selection.mjs';


// ═════════════════ ۸۹. انتخاب کاربر در نگاه باز پایدار می‌ماند ═════════════════
group('۸۹. مالکیت انتخاب نماد در نگاه باز');
{
  const gate89 = createOpenViewBaseSyncGate();
  check('ورود نخست، نماد داشبورد را یک بار به نگاه باز می‌دهد', gate89.consume() === true);
  check('تازه‌سازی پس‌زمینه مجوز همگام‌سازی دوباره ندارد', gate89.consume() === false);
  gate89.request();
  check('تغییر صریح نماد بالای داشبورد مجوز تازه می‌سازد', gate89.consume() === true);
  check('مجوز صریح هم فقط یک بار مصرف می‌شود', gate89.consume() === false);

  const dash89 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  // انتخاب نماد از کشوی داشبورد به نقشه منتقل شد؛ مجوز همچنان فقط وقتی
  // ساخته می‌شود که نماد **واقعاً** عوض شده باشد، نه در هر رویداد نقشه.
  check('فقط عوض‌شدن نماد روی نقشه مجوز همگام‌سازی می‌خواهد',
    /if \(String\(pick\.uaIns\) !== lastUaIns\) \{[\s\S]*?openViewBaseSync\.request\(\); \}/.test(dash89)
    && (dash89.match(/openViewBaseSync\.request\(\)/g) || []).length === 1);
  check('رسم نگاه باز پیش از نوشتن انتخاب، مجوز را مصرف می‌کند',
    /if \(!openViewBaseSync\.consume\(\)\) return;[\s\S]*?base\.value = value/.test(dash89));
}
