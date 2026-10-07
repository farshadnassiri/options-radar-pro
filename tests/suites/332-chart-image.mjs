// ۳۳۲. ذخیرهٔ تصویر همهٔ نمودارها، با نام یکتا و آخرین داده (۱۴۰۵/۰۷/۱۵)
//
// «برای همهٔ نمودارهای برنامه امکان ذخیره به صورت عکس… اسامی خروجی هر بخش
// متفاوت با دیگری باشد.» و «برای نمودارهای سری زمانی، مشخصات آخرین داده
// داخل عکس باشد… روی نمودار قرار نگیرد.»

import { check, group, readSrc } from '../harness.mjs';
import { cleanNamePart, jalaliStamp, chartImageName, uniqueName, looksLikeTime, latestOfOption, latestText } from '../../ui/chart-image.mjs';

group('۳۳۲. نام فایل: لاتین و یکتا برای هر بخش');
{
  // مرورگر نام فارسی را در ویژگی download به «download» برمی‌گرداند (سنجیده شد)؛
  // پس هر تکه لاتین است و تکهٔ فارسی به کدی ثابت از متن خودش تبدیل می‌شود.
  check('شناسهٔ لاتین همان می‌ماند', cleanNamePart('Live-Market') === 'live-market' && cleanNamePart('breadth pct') === 'breadth-pct');
  const h1 = cleanNamePart('همهٔ کندل‌های گزینش روی یک محور'), h2 = cleanNamePart('چند قرارداد در هر بازه');
  check('عنوان فارسی → کد لاتین ثابت و متفاوت', /^s[a-z0-9]+$/.test(h1) && h1 !== h2 && h1 === cleanNamePart('همهٔ کندل‌های گزینش روی یک محور'));
  check('هیچ نویسهٔ غیرلاتین در نام نیست', /^[a-z0-9_-]+$/.test(chartImageName(['live-market', 'candles', 'همهٔ کندل‌ها', 'mother'], '1405-07-15_190005')));
  check('مهر شمسی با رقم لاتین و منطقهٔ تهران', jalaliStamp(new Date('2026-10-07T15:30:05Z')) === '1405-07-15_190005');
  const a = chartImageName(['live-market', 'candles', '', 'mother'], 'S');
  const b = chartImageName(['live-market', 'candles', '', 'hist'], 'S');
  const c = chartImageName(['live-market', 'pulse', 'breadth-pct', 'chart-1'], 'S');
  check('دو نمودار یک تب و نمودار تب دیگر، سه نام', a === 'live-market_candles_mother_S' && a !== b && b !== c);
  check('تکهٔ تکراری یک بار و تکهٔ خالی حذف', chartImageName(['x', 'x', '', 'y'], 'S') === 'x_y_S');
  const used = new Map();
  check('ذخیرهٔ دوباره در همان ثانیه پسوند می‌گیرد', uniqueName('x', used) === 'x' && uniqueName('x', used) === 'x-2' && uniqueName('y', used) === 'y');
}

group('۳۳۲. آخرین دادهٔ نمودار زمانی');
{
  check('تاریخ و ساعت شناخته می‌شوند، نام قرارداد نه', looksLikeTime('20261007') && looksLikeTime('۱۴۰۵/۰۷/۱۵') && looksLikeTime('11:42') && !looksLikeTime('ضهرم1207'));
  const daily = { xAxis: [{ type: 'category', data: ['20261005', '20261006', '20261007'] }], series: [{ name: 'IV', type: 'line', data: [30, 31.5, '-'] }, { name: 'قیمت', type: 'line', data: [100, 101, 102] }] };
  const l = latestOfOption(daily);
  check('آخرین نقطهٔ هر سری، نه نقطهٔ بی‌عدد', l.x === '20261007' && l.items.find((i) => i.name === 'IV').value === 31.5 && l.items.find((i) => i.name === 'قیمت').value === 102);
  const text = latestText(l);
  check('سری‌ای که آخرینش از روز دیگری است، تاریخ خودش را دارد', text.includes('IV: ۳۱٫۵۰ (۱۴۰۵/۰۷/۱۴)') && text.startsWith('آخرین داده (۱۴۰۵/۰۷/۱۵)') && text.includes('قیمت: ۱۰۲'));
  const time = latestOfOption({ xAxis: { type: 'time' }, series: [{ name: 'x', data: [[1759830000000, 5], [1759840000000, 6]] }] });
  check('محور زمان: آخرین زمان و مقدار', time.kind === 'time' && time.x === 1759840000000 && time.items[0].value === 6);
  const candle = latestOfOption({ xAxis: { type: 'category', data: ['20261006', '20261007'] }, series: [{ name: 'شمع', type: 'candlestick', data: [[1, 2, 0, 3], [2, 5, 1, 6]] }] });
  check('شمع: قیمت بسته', candle.items[0].value === 5);
  check('نمودار غیرزمانی (نام قراردادها) آخرین داده ندارد', latestOfOption({ xAxis: [{ type: 'category', data: ['ضهرم1', 'ضهرم2'] }], series: [{ data: [1, 2] }] }) === null);
  check('بی عدد، چیزی ساخته نمی‌شود', latestOfOption({ xAxis: [{ type: 'category', data: ['20261006', '20261007'] }], series: [{ data: ['-', null] }] }) === null);
}

group('۳۳۲. سیم‌کشی');
{
  const app = readSrc('../ui/app.mjs');
  const mod = readSrc('../ui/chart-image.mjs');
  const track = readSrc('../ui/track-chart.mjs');
  const candles = readSrc('../ui/contract-candles-view.mjs');
  check('یک بار در app.mjs نصب می‌شود (همهٔ تب‌ها، نمودار تازهٔ فردا هم)', app.includes("import { installChartImageSaver } from '/ui/chart-image.mjs';") && app.includes('installChartImageSaver();'));
  check('هر سه گونهٔ نمودار: ECharts، SVG، میله‌ای HTML', mod.includes('const CHART_SELECTOR = `[_echarts_instance_], svg, ${HTML_CHARTS}`;') && ['.decision-bars', '.live-breadth-bars', '.live-mover-bars', '.market-bars', '.vr-gauges'].every((c) => mod.includes(c)) && mod.includes('getDataURL(') && mod.includes('<foreignObject'));
  check('آیکون‌ها و دکمه‌ها نمودار شمرده نمی‌شوند', mod.includes("node.closest('.chart-cam, button, .ic, .tab-btn, header, nav')") && mod.includes('box.width >= MIN_W && box.height >= MIN_H'));
  check('آخرین داده در نوار زیرِ نمودار، نه رویش', mod.includes('const y0 = headH + legendH + shot.height;') && mod.includes('canvas.height = (shot.height + headH + legendH + footH) * ratio;'));
  check('نمودار SVGِ زمانی آخرین نقطه‌اش را می‌گذارد', track.includes("setAttribute('data-chart-latest', latestNote)") && readSrc('../ui/tabs/live-market.mjs').includes("svg.setAttribute('data-chart-latest',"));
  check('راهنمای رنگِ بیرون از SVG در تصویر می‌آید', mod.includes('/legend/.test(String(c.className') && mod.includes('const legendH = info.legend?.length ? 22 : 0;'));
  check('بوم آلوده: SVG ذخیره می‌شود، نه شکست بی‌صدا', mod.includes("saveBlob(new Blob([shot.svgText], { type: 'image/svg+xml' }), `${name}.svg`);"));
  check('دکمه‌های تب کندل هم از همین مسیر', candles.includes('await saveChartImage(q(') && !candles.includes('contract-${kind'));
  // «برنامه درست کار نمی‌کند، آیکون عکس رفته آن بالا»: نشانهٔ نصب روی body همان
  // ویژگیِ شناسایی نمودار HTML بود و کل صفحه «نمودار» شد.
  check('نشانهٔ نصب با گزینشگر نمودار یکی نیست', mod.includes("root.dataset.chartCam = 'on';") && !mod.includes("root.dataset.chartImage = 'installed'") && !/CHART_SELECTOR[^\n]*chart-cam/.test(mod));
  check('صفحه، body و ظرف‌های بزرگ هرگز نمودار نیستند', mod.includes("node === document.body || node === document.documentElement") && mod.includes("node.id === 'stage'"));
  check('ظرف HTMLِ بزرگ تصویر نمی‌شود (قفل مرورگر)', mod.includes("node.querySelectorAll('*').length > 1500"));
}
