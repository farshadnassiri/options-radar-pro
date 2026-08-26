// ۹۴. یونانی و تلاطم در تب تحلیل تاریخی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { bsGreeks, impliedVol } from '../../core/bs.mjs';
import { histVolSeries } from '../../core/hist-vol.mjs';
import { meanIvPct } from '../../core/leg-iv.mjs';


// ═══════════════════ ۹۴. یونانی و تلاطم در تحلیل تاریخی ═══════════════════
//
// خواسته: «در هر تایم‌فریمی که سود و زیان محاسبه می‌شود، این یونانی‌ها نیز
// به تفکیک گفته‌شده نمایش داده شوند». جدول روزبه‌روزِ تحلیل تاریخی همان
// جایی است که سود و زیان روزانه دیده می‌شود، پس ستون یونانی باید همان‌جا
// باشد نه در جدولی جدا — دو جدول یعنی کاربر باید تاریخ را در ذهنش تطبیق
// بدهد.
group('۹۴. یونانی و تلاطم در تب تحلیل تاریخی');
{
  const src94 = readSrc('../ui/tabs/history.mjs');
  check('تحلیل تاریخی از همان لایهٔ مشترک می‌خواند، نه محاسبهٔ خودش',
    src94.includes("from '/core/monitor.mjs'") && src94.includes('annotateReplay(replay,')
    && !src94.includes('bsGreeks(') && !src94.includes('impliedVol('));
  check('ستون یونانی و تلاطم کنار ستون سود در همان جدول روزبه‌روز است',
    src94.includes('const greekHeads = GREEKS.map(') && src94.includes('${greekCells}<td>${ivCell(r.meanIvPct)}</td>')
    && src94.includes('<th>ضمنی موقعیت</th><th>تاریخی پایه</th><th>ضمنی−تاریخی</th>'));
  check('سلول هر پا، تلاطم ضمنی و یونانی خودش را هم می‌گوید',
    src94.includes('تلاطم ${ivCell(l.ivPct)} · دلتا ${greekCell(l.greeks?.delta)}'));
  check('مهر یونانی پیش از ساخت جدول می‌نشیند، وگرنه ستون‌ها خالی می‌مانند',
    /const hv = annotateGreeks\(replay\);[\s\S]{0,200}paintDayTable\(replay\)/.test(src94));
  check('پنجرهٔ تلاطم تاریخی روی کل سری پایه بسته می‌شود',
    src94.includes('histVolSeries(baseSeries.map('));
  check('از تحلیل تاریخی می‌شود همان موقعیت را در تب رصد باز کرد',
    src94.includes("to: 'greeks-watch',") && src94.includes("}, 'greeks-watch');"));
  // شمارهٔ پا در برچسب خلاصهٔ تلاطم از رابط می‌آید نه از هسته، چون باید رقم
  // فارسی بگیرد.
  check('برچسب پا در خلاصهٔ تلاطم از رابط می‌آید',
    src94.includes("row.kind === 'leg' ? esc(legLabel(legs[row.index], row.index))"));
}
