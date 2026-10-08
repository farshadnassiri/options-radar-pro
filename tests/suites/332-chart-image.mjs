// ۳۳۲. ذخیرهٔ تصویر همهٔ نمودارها، با نام یکتا و آخرین داده (۱۴۰۵/۰۷/۱۵، بازبینی ۱۴۰۵/۰۷/۱۶)
//
// «برای همهٔ نمودارهای برنامه امکان ذخیره به صورت عکس… اسامی خروجی هر بخش
// متفاوت با دیگری باشد.» و «برای نمودارهای سری زمانی، مشخصات آخرین داده
// داخل عکس باشد… روی نمودار قرار نگیرد.»

import { check, group, readSrc } from '../harness.mjs';
import { cleanNamePart, jalaliStamp, chartImageName, uniqueName, looksLikeTime, latestOfOption, sameDay, axisValueText, layoutAxisTags, parseRgb, inkOn } from '../../ui/chart-image.mjs';

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
  check('سری‌ای که آخرینش از روز دیگری است «کهنه» است، نه عدد روز آخر', l.items.find((i) => i.name === 'IV').stale === true && l.items.find((i) => i.name === 'قیمت').stale === false);
  check('شمارهٔ سری، نقطه و محور عمودی هر عدد معلوم است', l.items.find((i) => i.name === 'قیمت').seriesIndex === 1 && l.items.find((i) => i.name === 'قیمت').dataIndex === 2 && l.items[0].yAxisIndex === 0);
  const time = latestOfOption({ xAxis: { type: 'time' }, series: [{ name: 'x', data: [[1759830000000, 5], [1759840000000, 6]] }] });
  check('محور زمان: آخرین زمان و مقدار', time.kind === 'time' && time.x === 1759840000000 && time.items[0].value === 6);
  const intraday = latestOfOption({ xAxis: { type: 'time' }, series: [{ name: 'a', data: [[Date.parse('2026-10-07T06:00:00Z'), 5], [Date.parse('2026-10-07T08:55:00Z'), 6]] }, { name: 'b', data: [[Date.parse('2026-10-07T08:40:00Z'), 9]] }] });
  check('درون‌روز: خطی که چند دقیقه زودتر تمام شده هم مال روز آخر است', intraday.items.every((i) => !i.stale));
  const twoDays = latestOfOption({ xAxis: { type: 'time' }, series: [{ name: 'a', data: [[Date.parse('2026-10-07T08:55:00Z'), 6]] }, { name: 'b', data: [[Date.parse('2026-10-06T08:55:00Z'), 9]] }] });
  check('محور زمان: سریِ دیروز عدد روز آخر ندارد', twoDays.items.find((i) => i.name === 'b').stale && !twoDays.items.find((i) => i.name === 'a').stale);
  const candle = latestOfOption({ xAxis: { type: 'category', data: ['20261006', '20261007'] }, series: [{ name: 'شمع', type: 'candlestick', data: [[1, 2, 0, 3], [2, 5, 1, 6]] }] });
  check('شمع: قیمت بسته', candle.items[0].value === 5);
  check('نمودار غیرزمانی (نام قراردادها) آخرین داده ندارد', latestOfOption({ xAxis: [{ type: 'category', data: ['ضهرم1', 'ضهرم2'] }], series: [{ data: [1, 2] }] }) === null);
  check('بی عدد، چیزی ساخته نمی‌شود', latestOfOption({ xAxis: [{ type: 'category', data: ['20261006', '20261007'] }], series: [{ data: ['-', null] }] }) === null);
}

group('۳۳۲. عدد روز آخر روی محور عمودی، بی‌هم‌پوشانی (۱۴۰۵/۰۷/۱۶)');
{
  // «اعداد روز آخر را روی محور عمودی بنویس… مواظب باش ارقام و نوشته‌ها درهم نروند.»
  check('روز: تاریخ ۸رقمی، تاریخ شمسی با رقم فارسی، ساعتِ یک جلسه', sameDay('20261007', '20261007') && !sameDay('20261006', '20261007') && sameDay('۱۴۰۵/۰۷/۱۵', '1405/7/15') && sameDay('09:15', '12:29') && !sameDay('', ''));
  check('روز در منطقهٔ تهران: ۲۳:۰۰ UTC روزِ بعدِ تهران است', !sameDay(Date.parse('2026-10-06T20:00:00Z'), Date.parse('2026-10-06T21:00:00Z'), 'time') && sameDay(Date.parse('2026-10-06T21:00:00Z'), Date.parse('2026-10-07T10:00:00Z'), 'time'));
  check('عدد دقیق با رقم فارسی، نه گردشدهٔ برچسب محور', axisValueText({ axisLabel: { formatter: (v) => String(Math.round(v)) } }, 12.345) === '۱۲٫۳۵' && axisValueText({}, 1234567) === '۱,۲۳۴,۵۶۷');
  check('محور درصد → نشانهٔ ٪ کنار عدد', axisValueText({ axisLabel: { formatter: (v) => `${v}٪` } }, 3.5) === '۳٫۵۰٪' && axisValueText({ axisLabel: { formatter: '{value}%' } }, 2) === '۲٪');
  check('فرمت‌دهندهٔ شکسته، برچسب را نمی‌شکند', axisValueText({ axisLabel: { formatter: () => { throw new Error('x'); } } }, 7) === '۷');
  const size = 22, gap = 3;
  const packed = layoutAxisTags([{ y: 100 }, { y: 104 }, { y: 101 }, { y: 300 }], { top: 0, bottom: 400, size, gap });
  const noOverlap = (list) => list.every((t, k) => k === 0 || t.at - list[k - 1].at >= size + gap - 1e-9);
  check('سه عددِ نزدیک به هم روی هم نمی‌افتند', packed.length === 4 && noOverlap(packed));
  check('برچسبِ تنها روی ارتفاعِ خودِ عددش می‌ماند', packed.find((t) => t.y === 300).at === 300 && packed[0].at === 100);
  const bottomHeavy = layoutAxisTags([{ y: 395 }, { y: 398 }, { y: 399 }], { top: 0, bottom: 400, size, gap });
  check('ته نمودار: برچسب‌ها رو به بالا جمع می‌شوند و بیرون نمی‌زنند', noOverlap(bottomHeavy) && bottomHeavy.every((t) => t.at - size / 2 >= 0 && t.at + size / 2 <= 400));
  const crowd = layoutAxisTags(Array.from({ length: 12 }, (_, k) => ({ y: 50 + k })), { top: 0, bottom: 100, size, gap });
  check('بیش از جای نمودار: اضافه کنار می‌رود، نه روی هم', crowd.length === 4 && noOverlap(crowd) && crowd.every((t) => t.at - size / 2 >= 0 && t.at + size / 2 <= 100));
  check('رنگ: hex و rgb خوانده می‌شوند', JSON.stringify(parseRgb('#0a0')) === '[0,170,0]' && JSON.stringify(parseRgb('rgba(10, 20, 30, 0.5)')) === '[10,20,30]' && parseRgb('oklch(1 0 0)') === null);
  check('متن برچسب بیشترین تضاد را با رنگ سری دارد', inkOn('#ffd400', ['#15171b', '#ffffff']) === '#15171b' && inkOn('#1d4ed8', ['#15171b', '#ffffff']) === '#ffffff');
}

group('۳۳۲. سیم‌کشی');
{
  const app = readSrc('../ui/app.mjs');
  const mod = readSrc('../ui/chart-image.mjs');
  const track = readSrc('../ui/track-chart.mjs');
  const candles = readSrc('../ui/contract-candles-view.mjs');
  check('یک بار در app.mjs نصب می‌شود (همهٔ تب‌ها، نمودار تازهٔ فردا هم)', app.includes("import { installChartImageSaver } from '/ui/chart-image.mjs';") && app.includes('installChartImageSaver();'));
  check('هر گونهٔ نمایش داده: ECharts، SVG، میله‌ای HTML و جدول', mod.includes('const CHART_SELECTOR = `[_echarts_instance_], svg, ${HTML_CHARTS}, ${TABLES}`;') && ['.decision-bars', '.live-breadth-bars', '.live-mover-bars', '.market-bars', '.vr-gauges'].every((c) => mod.includes(c)) && mod.includes('getDataURL(') && mod.includes('<foreignObject'));
  check('آیکون‌ها و دکمه‌ها نمودار شمرده نمی‌شوند', mod.includes("node.closest('.chart-cam, button, .ic, .tab-btn, header, nav')") && mod.includes('box.width >= MIN_W && box.height >= MIN_H'));
  // «مسیر عکس و تاریخ و ساعت را ننویس» (۱۴۰۵/۰۷/۱۶).
  check('بالای تصویر نه مسیر تب است نه زمان ذخیره', !mod.includes("].filter(Boolean).join(' › ')") && !/fillText\(new Intl\.DateTimeFormat/.test(mod) && mod.includes("title: chartTitle ? '' : heading || label,"));
  check('عنوان بلند کوتاه می‌شود، فشرده و له نمی‌شود', mod.includes('fillText(fitText(ctx, info.title, W - 24), W - 12, 9)') && !mod.includes('9, W - 24)') && !mod.includes('shot.width - 24)'));
  check('نوار متنیِ «آخرین داده» با تاریخ دیگر نیست', !mod.includes('آخرین داده (') && !mod.includes('footLines'));
  check('برچسب عدد در حاشیهٔ کنار محور، بیرون از تصویرِ نمودار', mod.includes('const W = leftG + shot.width + rightG;') && mod.includes('ctx.drawImage(img, leftG, chartY, shot.width, shot.height);') && mod.includes('layoutAxisTags(marks,'));
  check('ارتفاع عدد ECharts از خودِ محور (convertToPixel)', mod.includes('chart.convertToPixel({ yAxisIndex: it.yAxisIndex }, it.value)') && mod.includes('it.stale || it.stacked'));
  const live = readSrc('../ui/tabs/live-market.mjs');
  check('نمودار SVGِ زمانی عدد روز آخرش را با ارتفاعش می‌دهد', track.includes("setAttribute('data-chart-marks', JSON.stringify({ side: 'left', top: T, bottom: H - B, marks }))") && live.includes("svg.setAttribute('data-chart-marks', JSON.stringify({") && !track.includes('data-chart-latest') && !live.includes('data-chart-latest'));
  check('راهنمای رنگِ بیرون از SVG در تصویر می‌آید', mod.includes('/legend/.test(String(c.className') && mod.includes('const legendH = info.legend?.length ? 24 : 0;'));
  // «فونت‌های فارسی را زیبا کن… ارقام ناخواناست.» توکنِ `--font` تعریف نشده بود.
  const css = readSrc('../ui/style.css');
  check('توکن --font تعریف شده و به وزیرمتن می‌رسد', /--font:\s*var\(--sans\);/.test(css) && /--sans:\s*Vazirmatn/.test(css));
  check('ECharts بی --font هم وزیرمتن می‌گیرد', readSrc('../ui/chart-host.mjs').includes("font: cssVar(style, '--font') || cssVar(style, '--sans'),"));
  check('SVG تصویر فونت را درون خودش دارد و دوبرابر کشیده می‌شود', mod.includes('@font-face{font-family:${face.family}') && mod.includes("clone.setAttribute('width', String(width * 2));") && mod.includes('await fontsReady(font);'));
  check('بوم آلوده: SVG ذخیره می‌شود، نه شکست بی‌صدا', mod.includes("saveBlob(new Blob([shot.svgText], { type: 'image/svg+xml' }), `${name}.svg`);"));
  check('دکمه‌های تب کندل هم از همین مسیر', candles.includes('await saveChartImage(q(') && !candles.includes('contract-${kind'));
  // «برنامه درست کار نمی‌کند، آیکون عکس رفته آن بالا»: نشانهٔ نصب روی body همان
  // ویژگیِ شناسایی نمودار HTML بود و کل صفحه «نمودار» شد.
  check('نشانهٔ نصب با گزینشگر نمودار یکی نیست', mod.includes("root.dataset.chartCam = 'on';") && !mod.includes("root.dataset.chartImage = 'installed'") && !/CHART_SELECTOR[^\n]*chart-cam/.test(mod));
  check('صفحه، body و ظرف‌های بزرگ هرگز نمودار نیستند', mod.includes("node === document.body || node === document.documentElement") && mod.includes("node.id === 'stage'"));
  check('ظرف HTMLِ بزرگ تصویر نمی‌شود (قفل مرورگر)', mod.includes("node.querySelectorAll('*').length > 1500"));
}
