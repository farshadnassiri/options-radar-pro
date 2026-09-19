// ۲۷۳. یک زبانِ نشانه‌ای — آیکونِ خانواده به‌جای ایموجی
//
// ایموجی در رابط سه هزینه دارد که هیچ‌کدام از خواندنِ کد پیدا نمی‌شوند:
// رنگش ثابت است (پس در پوستهٔ تیره با متنِ کنارش هم‌رنگ نمی‌شود و در
// خانهٔ `.loss` قرمزِ هشدار را نمی‌گیرد)، عرضش با فونتِ سیستم عوض می‌شود
// (پس ستونِ `tabular-nums` می‌لرزد)، و کنارِ آیکونِ برداریِ همان ردیف،
// دو زبانِ نشانه‌ای در یک قاب می‌شود.
//
// عنوانِ دو تب استثناست و عمداً استثنا مانده: صاحب پروژه صریح خواست
// «اسم این تب رو بگذار آزمایشگاه آپشن (ایموجی مناسب هم بذار)» و دستهٔ ۸۶
// همان را قفل می‌کند. این دسته جاهایی را می‌گیرد که چنین خواسته‌ای
// پشتشان نیست.

import { check, group, readSrc } from '../harness.mjs';
import { STRATEGY_LINK_TARGETS } from '../../ui/handoff.mjs';
import { alertCell } from '../../ui/positions-alert-view.mjs';
import { icon } from '../../ui/icons.mjs';

// دامنه‌های ایموجی — نه فلشِ متنی و نه نویسهٔ فارسی.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{23E9}-\u{23FA}\u{FE0F}]/u;

group('۲۷۳. یک زبانِ نشانه‌ای');
{
  check('هر مقصدِ پیوند آیکونِ خانواده دارد',
    STRATEGY_LINK_TARGETS.length > 0 && STRATEGY_LINK_TARGETS.every((item) => !!item.ic));
  check('و هیچ برچسبِ مقصدی ایموجی ندارد',
    !STRATEGY_LINK_TARGETS.some((item) => EMOJI.test(item.label)),
    STRATEGY_LINK_TARGETS.filter((item) => EMOJI.test(item.label)).map((item) => item.label).join('، '));

  // `icon()` برای نامِ ناشناخته به نقطه می‌افتد و صدا هم نمی‌کند — یعنی
  // غلط‌نویسیِ نامِ آیکون یک دایرهٔ بی‌معنی می‌سازد که کسی نمی‌بیند.
  const dot = icon('dot');
  for (const item of STRATEGY_LINK_TARGETS) {
    check(`آیکون «${item.ic}» در خانواده هست، نه نقطهٔ پیش‌فرض`,
      icon(item.ic) !== dot || item.ic === 'dot');
  }

  // ── خانهٔ «شرط» در جدول موقعیت‌ها ──
  const pos = { alert: { enabled: true, pnlAbove: 1000 } };
  const firing = alertCell(pos, [{ label: 'سود از ۱٬۰۰۰ گذشت' }]);
  check('خانهٔ شرطِ برقرار آیکونِ برداری دارد نه ایموجی',
    firing.includes('<svg') && !EMOJI.test(firing), firing.slice(0, 80));
  check('و همان خانه هنوز قرمزِ زیان را می‌گیرد', /class="n loss"/.test(firing));

  const off = alertCell({ alert: { enabled: false, pnlAbove: 1000 } });
  check('شرطِ خاموش هم نشانِ برداری دارد نه ایموجی',
    off.includes('<svg') && !EMOJI.test(off), off.slice(0, 80));

  // بی‌شرط، هیچ نشانی نمی‌آید — «—» یعنی نداریم، و نشان روی آن معنی ندارد.
  const none = alertCell({ alert: {} });
  check('موقعیتِ بی‌شرط نشان نمی‌گیرد', !none.includes('<svg') && none.includes('—'));

  // آیکونِ درونِ خانه باید اندازه و جای خودش را از شیوه‌نامه بگیرد، وگرنه
  // ۲۴ پیکسلِ پیش‌فرضِ SVG ارتفاعِ ردیف را بالا می‌برد.
  const css = readSrc('../ui/style.css');
  check('شیوه‌نامه جای آیکونِ درونِ خانه را تعریف کرده',
    /\.ic-cell\s*\{[^}]*vertical-align/.test(css));
}
