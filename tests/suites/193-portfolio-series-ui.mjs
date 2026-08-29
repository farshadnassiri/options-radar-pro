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

group('۱۹۳ب. تفکیک استراتژی در مسیر');
{
  check('جدول تفکیک استراتژی و انتخابگر لحظه هستند',
    ['pt-series-strategies', 'pt-series-pick'].every((id) => tab193.includes(`id="${id}"`))
    && at('id="pt-series-strategies"') > at('id="pt-series-body"')
    && at('id="pt-series-strategies"') < at('data-panel="strategies"'));

  // ── لحظه انتخابی است، نه همیشه آخری ────────────────────────────────
  // کاربر روی نمودار یک قله می‌بیند و می‌خواهد بداند کدام استراتژی آن را
  // ساخته؛ نشان‌دادن همیشگیِ آخرین لحظه یعنی آن سؤال بی‌جواب می‌ماند.
  check('لحظهٔ جدول تفکیک از انتخابگر خوانده می‌شود',
    /const step = view\.ok \? view\.steps\[Number\(pick\.value\) \|\| 0\] : null;/.test(tab193)
    && /\$\('pt-series-pick'\)\.onchange/.test(tab193));
  check('و انتخابِ کاربر با هر گام به آخر برنمی‌گردد',
    /if \(pick\.dataset\.keys !== keys\.join\('\|'\)\) \{/.test(tab193)
    && /const keep = pick\.value;/.test(tab193));

  // ── هر ستون از نما می‌آید ──────────────────────────────────────────
  const rows193 = tab193.slice(at('function paintSeriesStrategies'),
    at("$('pt-series-pick').onchange"));
  check('ستون‌ها همه از مدل نمایش می‌آیند، نه حساب تازه در تب',
    ['row.label', 'row.familyText', 'row.openQtyText', 'row.pnlText',
      'row.pnlPctText', 'row.realizedText', 'row.unrealizedText'].every((key) => rows193.includes(key))
    && !/[+\-*/]\s*10\b/.test(rows193));
  check('درصد هر استراتژی مبنایش را در سرستون می‌گوید',
    tab193.includes('<th>بازده روی سرمایهٔ خودش</th>'));

  // ── سه وضعیت داده، سه متن ──────────────────────────────────────────
  check('نامعلوم، تخمینی و مشاهده‌شده سه متن جدا دارند',
    rows193.includes('نامعلوم') && rows193.includes('تخمینی')
    && rows193.includes('مشاهده‌شده'));
  check('نامعلوم علتش را می‌برد و تخمینی لحظهٔ منبعش را',
    /<b>نامعلوم<\/b><br><small>\$\{esc\(row\.why\)\}/.test(rows193)
    && /<b>تخمینی<\/b><br><small>\$\{esc\(row\.estimatedText\)\}/.test(rows193));
  check('لحظهٔ بی‌استراتژی جمله می‌گیرد، نه جدول خالی',
    /در این لحظه استراتژی‌ای در سبد نبود/.test(rows193));
  check('و ردیف هر استراتژی هم رنگِ عددِ خودش را می‌گیرد',
    /data-tone="\$\{esc\(row\.tone\)\}" data-level="\$\{esc\(String\(row\.level\)\)\}"/.test(rows193));
  check('جدول تفکیک در هر دو مسیرِ موفق و ناموفق رسم می‌شود',
    (tab193.match(/paintSeriesStrategies\(view\);/g) || []).length === 2);
}
