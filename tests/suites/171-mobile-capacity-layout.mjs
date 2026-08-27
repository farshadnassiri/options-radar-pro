// ۱۷۱. قرارداد چیدمان نوار وضعیت و پنل ظرفیت در موبایل

import { check, group, readSrc } from '../harness.mjs';

group('۱۷۱. قرارداد چیدمان نوار وضعیت و پنل ظرفیت در موبایل');
{
  const css171 = readSrc('../ui/style.css');
  const mobileStart171 = css171.indexOf('@media (max-width: 760px)');
  const mobileEnd171 = css171.indexOf('\n}', mobileStart171);
  const mobile171 = css171.slice(mobileStart171, mobileEnd171 + 2);

  check('دسکتاپ نوار sticky و پنل مطلق محدود خود را نگه می‌دارد',
    css171.includes('.top {\n  position: sticky; top: 0; z-index: 20;')
    && css171.includes('position: absolute; inset-inline-end: 0; top: calc(100% + 8px);')
    && css171.includes('width: min(560px, calc(100vw - 32px));'));
  check('در موبایل نوار در جریان می‌ماند و روی محتوای صفحه نمی‌افتد',
    mobile171.includes('.top { position: relative;')
    && mobile171.includes('.health { min-width: 0;'));
  check('details باز تمام ردیف را می‌گیرد و پنل درون جریان است',
    mobile171.includes('.capacity[open] { flex: 1 0 100%;')
    && mobile171.includes('.capacity-panel {\n    position: static; width: 100%;'));
  check('فهرست و عمل‌ها بدون حذف محتوا یک‌ستونه می‌شوند',
    mobile171.includes('.capacity-list { grid-template-columns: minmax(0, 1fr); }')
    && mobile171.includes('.capacity-actions { align-items: stretch; flex-direction: column; }')
    && mobile171.includes('.capacity-actions button { width: 100%; }'));
  check('متن بلند علت، سررسید و وضعیت عرض والد را نمی‌شکند',
    mobile171.includes('.capacity-note, .capacity-list h4, .capacity-list small,')
    && mobile171.includes('overflow-wrap: anywhere;'));
  check('هیچ داده سلامت یا ظرفیت برای جا شدن مخفی نمی‌شود',
    !/\.(?:health|metric|capacity|capacity-panel)[^{]*\{[^}]*display:\s*none/.test(mobile171));
  check('اصلاح موبایل رنگ سخت‌کدشده تازه ندارد',
    !/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/i.test(mobile171));
}
