// ۲۶۷. خالیِ بی‌شرح — شکلِ پاسخ بالادست و تفکیک مسیر
//
// گزارش نوبت پنجم صاحب پروژه: خروجی سه‌ماههٔ «موج» ۱٬۳۴۹ ابزار/روز داشت،
// ۱٬۳۱۶ تای آن از مسیر تاریخی رفتند و **هیچ‌کدام** داده نیاوردند — با صفر
// خطا — در حالی که تابلوی روزانه برای خودِ نماد پایه در همان روزها ۳۶٬۱۳۴
// معامله ثبت کرده بود. برنامه نمی‌توانست بگوید چه شد، چون «بالادست گفت
// معامله‌ای نبود» و «بالادست چیزی داد که فهرست معامله نیست» هر دو به یک
// آرایهٔ خالی تبدیل می‌شدند. این دسته همان تفاوت را قفل می‌کند.

import { check, group, readSrc } from '../harness.mjs';
import { UPSTREAM_SHAPE, upstreamShape, upstreamShapeLabel } from '../../core/upstream-shape.mjs';
import { dataExportRouteSplit } from '../../core/data-export.mjs';
import { buildDataExportSheets } from '../../ui/data-export-workbook.mjs';

group('۲۶۷. شکلِ پاسخ بالادست');
{
  // ── فهرستِ واقعاً خالی: بالادست آمد و گفت آن روز معامله‌ای نبود.
  const bare = upstreamShape([]);
  check('آرایهٔ خالی «فهرست خالی» است', bare.kind === 'emptyList' && bare.rows === 0);
  check('و آرایهٔ پر «فهرست»', upstreamShape([{ a: 1 }]).kind === 'list');
  // پاسخ واقعی TSETMC آرایه را داخل یک کلید می‌گذارد.
  check('فهرستِ تودرتوی خالی هم «فهرست خالی» است',
    upstreamShape({ tradeHistory: [] }).kind === 'emptyList');
  check('و تودرتوی پر، «فهرست» با شمارِ درست',
    upstreamShape({ tradeHistory: [1, 2, 3] }).kind === 'list'
      && upstreamShape({ tradeHistory: [1, 2, 3] }).rows === 3);

  // ── و اینجا همان چیزی است که تا امروز دیده نمی‌شد.
  const broken = upstreamShape({ Message: 'Not Found', StatusCode: 404 });
  check('پاسخِ بی‌هیچ فهرست، «پاسخ بی‌فهرست» است — نه «بدون معامله»',
    broken.kind === 'noList');
  check('و نامِ کلیدهایش را همراه می‌برد',
    broken.keys.includes('Message') && broken.keys.includes('StatusCode'));
  check('کلیدها زیاد نمی‌شوند', upstreamShape(Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [`k${i}`, i]),
  )).keys.length === 4);
  check('بی‌پاسخ و پاسخ غیرشیء هم دستهٔ خودشان را دارند',
    upstreamShape(null).kind === 'none' && upstreamShape(undefined).kind === 'none'
      && upstreamShape('<html>').kind === 'scalar');

  // ── برچسب: خواندنی، و بی عددِ ساختگی.
  check('برچسبِ فهرست خالی کلید نمی‌آورد',
    upstreamShapeLabel(bare) === UPSTREAM_SHAPE.emptyList);
  check('ولی برچسبِ پاسخ بی‌فهرست کلیدها را می‌گوید',
    upstreamShapeLabel(broken).includes('Message') && upstreamShapeLabel(broken).includes('StatusCode'));
  check('شکلِ نبوده برچسبِ خالی می‌دهد، نه متنِ ساختگی',
    upstreamShapeLabel(null) === '' && upstreamShapeLabel({}) === '');
}

group('۲۶۷. تفکیک مسیر در خروجی دیتا');
{
  // بازسازیِ دقیقِ همان فایل: مسیر تاریخی همه خالی، دادهٔ موجود فقط از نوار.
  const pairs = [
    ...Array.from({ length: 5 }, (_, i) => ({ ins: 'B', date: 20260620 + i, key: `${20260620 + i}:B` })),
    { ins: 'B', date: 20260916, key: '20260916:B' },
    { ins: 'C', date: 20260916, key: '20260916:C' },
  ];
  const items = {};
  for (const pair of pairs.slice(0, 5)) {
    items[pair.key] = { rows: [], source: 'history', variant: 'both', upstream: 'فهرست خالی' };
  }
  items['20260916:B'] = { rows: [{ time: 90000 }, { time: 90001 }], source: 'live' };
  items['20260916:C'] = { rows: [], source: 'live' };

  const route = dataExportRouteSplit(pairs, items);
  check('مسیر تاریخی شمرده می‌شود و صفرِ داده‌اش دیده می‌شود',
    route.history.total === 5 && route.history.ok === 0 && route.history.empty === 5);
  check('نوار زنده جدا شمرده می‌شود',
    route.live.total === 2 && route.live.ok === 1 && route.live.trades === 2);
  check('جمع دو مسیر همان شمار جفت‌هاست', route.total === pairs.length);
  // جفتی که اصلاً درخواست نرفته نه تاریخی است نه زنده، و پنهان هم نمی‌شود.
  const orphan = dataExportRouteSplit([{ ins: 'X', date: 1, key: '1:X' }], {});
  check('جفتِ درخواست‌نرفته در دستهٔ نامعلوم می‌نشیند و شکست شمرده می‌شود',
    orphan.unknown.total === 1 && orphan.unknown.failed === 1
      && orphan.history.total === 0 && orphan.live.total === 0);

  // ── برگ راهنما و پوشش باید همین را بنویسند.
  const instruments = [
    { ins: 'B', name: 'موج', baseName: 'موج', kind: 'underlying', size: 1 },
    { ins: 'C', name: 'ضموج725', baseName: 'موج', kind: 'call', size: 1000 },
  ];
  const sheets = buildDataExportSheets({
    instruments, pairs, items, range: { from: 20260620, to: 20260916 }, complete: true,
  });
  const guide = sheets.find((part) => part.name === 'راهنما');
  const routeLine = (guide.rows.find((row) => row[0] === 'تفکیک مسیر') || [])[1] || '';
  check('راهنما تفکیک مسیر را در یک خط می‌گوید',
    routeLine.includes('تاریخی') && routeLine.includes('نوار زنده'));
  check('و وقتی کلِ مسیر تاریخی صفر آورده، صریح می‌گوید',
    routeLine.includes('هیچ روزِ بسته‌شده‌ای داده نیاورد'));

  const coverage = sheets.find((part) => part.name === 'پوشش دریافت');
  const at = coverage.headers.indexOf('پاسخ بالادست');
  check('برگ پوشش ستون «پاسخ بالادست» دارد', at > 0);
  check('و برای خالیِ تاریخی، شکلِ خامِ پاسخ را می‌نویسد',
    coverage.rows.filter((row) => row[at] === 'فهرست خالی').length === 5);
  // ادعا با نامِ سرستون، نه شماره: ستونِ تازه نباید ادعای بی‌ربط را بشکند.
  const dateAt = coverage.headers.indexOf('تاریخ میلادی');
  check('برای ردیفی که داده آورده چیزی ننوشته — جای خالی صادق است',
    coverage.rows.filter((row) => row[dateAt] === 20260916).every((row) => !row[at]));
  check('و برگ پوشش تاریخ شمسی را کنار میلادی دارد',
    coverage.headers.indexOf('تاریخ شمسی') === dateAt + 1
      && coverage.rows.some((row) => row[dateAt + 1] === '1405/06/25'));

  // دو مسیرِ متفاوت باید هر دو دیده شوند، نه یکی.
  const twoShapes = buildDataExportSheets({
    instruments, pairs,
    items: { ...items, '20260620:B': { rows: [], source: 'history', variant: 'both', upstream: 'فهرست خالی', upstreamAlt: 'پاسخ بی‌فهرست (Message)' } },
    range: { from: 20260620, to: 20260916 }, complete: true,
  }).find((part) => part.name === 'پوشش دریافت');
  check('وقتی دو پرچم دو پاسخِ متفاوت دادند، هر دو نوشته می‌شوند',
    twoShapes.rows.some((row) => String(row[at]).includes('فهرست خالی / پاسخ بی‌فهرست')));
}

group('۲۶۷. مصرف در سرور و تب');
{
  const server = readSrc('../server/server.mjs');
  check('سرور شکلِ پاسخ را فقط برای خالیِ هر دو پرچم همراه می‌کند',
    server.includes('upstream: upstreamShapeLabel(first.shape)')
      && server.includes('upstreamAlt: upstreamShapeLabel(alt.shape)'));
  check('و خطا همچنان خطا می‌ماند، نه خالیِ بی‌شرح',
    server.includes('return [key, { rows: [], error: `${e.name}: ${e.message}` }];'));

  const tab = readSrc('../ui/tabs/data-export.mjs');
  // ═══ چرا `n=0` ═══
  //
  // این تب تنها جایی بود که به `/api/dailies` شمارِ روز می‌داد؛ برای
  // قراردادِ منقضی تابلوی روزانه‌اش نمی‌آمد و راست‌آزماییِ خالی‌ها برای
  // ۸۴۷ ابزار/روز کور می‌شد — دقیقاً همان‌جا که لازمش داشتیم.
  check('تابلوی روزانه با کلِ تاریخِ موجود خواسته می‌شود',
    tab.includes("/api/dailies?ins=${codes.join(',')}&n=0")
      && !tab.includes('n=${span + 10}'));
  check('و صفرِ یک مسیرِ کامل در جملهٔ وضعیت خبرِ اول است',
    tab.includes('const deadRoute =') && tab.includes('هیچ خطایی هم نداد'));
}
