// ۳۳۸. عنوان و تاریخِ داده در هر تصویر (۱۴۰۵/۰۷/۱۶)
//
// «در خروجی تصویر هر آیتم موارد زیر را هم اضافه کن: ۱- عنوان آیتم ۲- آن
// آیتم مربوط به چه تاریخ یا چه بازهٔ زمانی است.» تاریخِ **داده**، نه زمانِ
// ذخیره — آن را پیش‌تر خودشان برداشتند (دستهٔ ۳۳۲).

import { check, group, readSrc } from '../harness.mjs';
import { axisSpan, spanText } from '../../ui/chart-image.mjs';

const AT = Date.parse('2026-10-08T07:12:00Z'); // ۱۰:۴۲ تهران، ۱۴۰۵/۰۷/۱۶

group('۳۳۸. متنِ تاریخِ داده');
{
  check('محورِ روزانه: بازهٔ شمسی از نخستین تا واپسین روز',
    spanText(axisSpan({ xAxis: { type: 'category', data: ['20260901', '20261007'] } })) === 'بازهٔ داده: ۱۴۰۵/۰۶/۱۰ تا ۱۴۰۵/۰۷/۱۵');
  check('محورِ یک‌روزه: تاریخِ تنها', spanText(axisSpan({ xAxis: { type: 'category', data: ['20261007', '20261007'] } })) === 'تاریخ داده: ۱۴۰۵/۰۷/۱۵');
  check('محورِ ساعتِ یک جلسه: روز از زمانِ عکس، ساعت از محور',
    spanText(axisSpan({ xAxis: { type: 'category', data: ['09:00', '12:30'] } }), { at: AT }) === 'تاریخ داده: ۱۴۰۵/۰۷/۱۶، ساعت ۰۹:۰۰ تا ۱۲:۳۰');
  check('محورِ زمانِ درون‌روز: روز و ساعت از خودِ داده',
    spanText(axisSpan({ xAxis: { type: 'time' }, series: [{ data: [[Date.parse('2026-10-08T05:30:00Z'), 1], [Date.parse('2026-10-08T09:00:00Z'), 2]] }] })) === 'تاریخ داده: ۱۴۰۵/۰۷/۱۶، ساعت ۰۹:۰۰ تا ۱۲:۳۰');
  check('بی محورِ زمانی: بازهٔ گام ۱ از نیا', spanText(null, { from: 20260901, to: 20261007 }) === 'بازهٔ داده: ۱۴۰۵/۰۶/۱۰ تا ۱۴۰۵/۰۷/۱۵');
  check('دادهٔ زنده: زمانِ عکسِ بازار', spanText(null, { at: AT }) === 'عکس بازار: ۱۴۰۵/۰۷/۱۶، ساعت ۱۰:۴۲');
  check('محورِ غیرزمانی (نام قراردادها) تاریخ نمی‌سازد', axisSpan({ xAxis: { type: 'category', data: ['ضهرم1', 'ضهرم2'] } }) === null && spanText(null, {}) === '');
  check('محور بر نیا مقدم است (دادهٔ خودِ نمودار دقیق‌تر است)',
    spanText(axisSpan({ xAxis: { type: 'category', data: ['20261001', '20261007'] } }), { from: 20250101, to: 20261007 }) === 'بازهٔ داده: ۱۴۰۵/۰۷/۰۹ تا ۱۴۰۵/۰۷/۱۵');
}

group('۳۳۸. سیم‌کشی');
{
  const img = readSrc('../ui/chart-image.mjs');
  check('عنوانِ آیتم همیشه هست', img.includes('title: heading || chartTitle || label || tab,') && !img.includes("title: chartTitle ? '' : heading || label,"));
  check('زیرِ عنوان، تاریخِ داده', img.includes('subtitle: spanText(span, scopeOf(node)),') && img.includes('ctx.fillText(fitText(ctx, info.subtitle, W - 24)'));
  check('جدول هم', img.includes('drawTablePages(model, { title: info.title, subtitle: info.subtitle, theme })') && readSrc('../ui/table-image.mjs').includes('if (subtitle) {'));
  check('زمانِ ذخیره هنوز در تصویر نیست', !/fillText\(new Intl\.DateTimeFormat/.test(img));
  check('بازهٔ گام ۱ روی صحنه نشان گذاشته می‌شود', readSrc('../ui/history-range.mjs').includes('scope.dataset.spanFrom = String(range.from);'));
  const app = readSrc('../ui/app.mjs');
  check('نشانِ تبِ قبلی با تغییرِ تب پاک می‌شود؛ زمانِ دادهٔ زنده پشتوانه است',
    app.includes('delete stage.dataset.spanFrom; delete stage.dataset.spanTo; delete stage.dataset.asof;') && app.includes('document.body.dataset.asof = String(t);'));
  check('داشبورد زمانِ عکس و «نگاه باز» بازهٔ خودش را دارد',
    readSrc('../ui/tabs/live-market-dashboard.mjs').includes('root.dataset.asof = String(clock.snapshotAt);') && readSrc('../ui/tabs/open-view.mjs').includes("root.dataset.spanScope = '1';"));
  check('نمودارهای SVGِ زمانی بازهٔ خودشان را می‌گذارند',
    readSrc('../ui/track-chart.mjs').includes("svgEl?.setAttribute('data-span-from'") && readSrc('../ui/tabs/live-market.mjs').includes("svg.setAttribute('data-span-clock'"));
}
