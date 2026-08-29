// ۱۹۳. مسیر سود و زیان در تب تایم‌لاین

import { check, group, readSrc } from '../harness.mjs';

const tab193 = readSrc('../ui/tabs/portfolio-time.mjs');
const css193 = readSrc('../ui/style.css');
const at = (needle) => tab193.indexOf(needle);
const code193 = tab193.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

group('۱۹۳. مسیر سود و زیان در تب');
{
  check('بخش مسیر در پنل تایم‌لاین است',
    tab193.includes('id="pt-series"')
    && at('id="pt-series"') > at('data-panel="timeline"')
    && at('id="pt-series"') < at('data-panel="strategies"'));
  check('خانه‌های نمودار، جدول، مقیاس و کلید پیوسته‌سازی هستند',
    ['pt-series-chart', 'pt-series-body', 'pt-series-scale', 'pt-series-carry',
      'pt-series-state', 'pt-series-estimated'].every((id) => tab193.includes(`id="${id}"`)));

  // ── نمودار همان نمودار مشترک است ───────────────────────────────────
  check('نمودار از کمکیِ مشترک مسیر می‌آید، نه پیاده‌سازی دوم',
    /import \{ chart as trackChart \} from '\.\.\/track-chart\.mjs'/.test(tab193)
    && /trackChart\(\$\('pt-series-chart'\), view\.chartPoints, view\.chartSeries/.test(tab193)
    && !/<svg/.test(code193.slice(at('function paintSeries'), at('function paintSeries') + 2200)));
  check('نقاط و سری‌ها از نما می‌آیند، نه ساختِ دوباره در تب',
    /portfolioTimelineView\(portfolioTimeline\(session, seriesSteps,/.test(tab193));

  // ── نقطه‌ها همان‌جا برداشته می‌شوند که از آن‌ها رد می‌شویم ─────────
  // مدرک اجراپذیریِ یک لحظهٔ گذشته فقط وقتی در دست است که جلسه روی همان
  // لحظه ایستاده باشد؛ ساختنِ بعدی‌اش یعنی عکسی که آن موقع گرفته نشد.
  check('هر گام یک نقطه به مسیر می‌افزاید',
    /captureSeriesPoint\(session\);\s*\n\s*paintSeries\(session\);/.test(tab193)
    && at('captureSeriesPoint(session)') > at('function paintProposals'));
  check('لحظهٔ تکراری یا عقب‌رفته نقطه نمی‌سازد',
    /if \(last && momentKey\(last\.at\) >= key\) return;/.test(tab193));
  check('مدرکِ هر نقطه لاغر ذخیره می‌شود، نه مدرک کامل',
    /slimTimelineEvidence\(portfolioSessionEligibility\(session\)\)/.test(tab193));
  check('و محدودیتش به کاربر گفته می‌شود — مسیرِ همین اجرا',
    /مسیرِ همین اجرا/.test(tab193));

  // ── کلید پیوسته‌سازی ───────────────────────────────────────────────
  check('کلید پیوسته‌سازی حالت موتور را عوض می‌کند',
    /mode: seriesCarry \? 'carry' : 'strict'/.test(tab193)
    && /\$\('pt-series-carry'\)\.onchange/.test(tab193));
  check('و پیش‌فرض روی شکافِ صریح است',
    /let seriesCarry = false;/.test(tab193));
  check('عددِ حمل‌شده در همان جدول علامت می‌خورد',
    /step\.estimated \? '<br><small>تخمینی<\/small>' : ''/.test(tab193)
    && /view\.estimatedNote/.test(tab193));

  // ── نبودِ مسیر، نمودار خالی نیست ───────────────────────────────────
  check('سریِ ناموفق علت می‌گوید، نه نمودار خالی',
    /\$\('pt-series-state'\)\.textContent = view\.why \|\| 'هنوز نقطه‌ای در مسیر نیست\.'/.test(tab193));

  // ── رنگ از عدد ─────────────────────────────────────────────────────
  check('ردیف جدول جهت و شدتِ رنگ خودش را از نما می‌گیرد',
    /data-tone="\$\{esc\(step\.totalTone\)\}" data-level="\$\{esc\(String\(step\.totalLevel\)\)\}"/.test(tab193));
  check('و CSS برای هر سه پلهٔ هر سمت رنگ جدا دارد',
    ['gain', 'loss'].every((tone) => [1, 2, 3]
      .every((level) => css193.includes(`tr[data-tone="${tone}"][data-level="${level}"]`))));
  check('صفر پلهٔ خودش را دارد، نه سبز یا قرمزِ کم‌رنگ',
    css193.includes('tr[data-tone="flat"]'));
  check('مقیاس رنگ کنار جدول نوشته می‌شود',
    /شدت رنگ نسبت به بزرگ‌ترین سود یا زیانِ این مسیر است/.test(tab193)
    && /هیچ پلهٔ معلومی در مسیر نیست، پس رنگ مقیاسی ندارد/.test(tab193));
}
