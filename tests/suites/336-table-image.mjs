// ۳۳۶. تصویرِ جدول — خوانا و کامل (۱۴۰۵/۰۷/۱۶)
//
// «امکان گرفتن خروجی تصویر از جداول هم وجود داشته باشد. اگر جدول بزرگ است
// راه‌حلی ایجاد کن که اولاً خوانا باشد ثانیاً اطلاعاتی جا نماند.» و «هر
// دیتای نموداری، جدولی، نقشه و … باید قابلیت خروجی تصویر داشته باشد.»

import { check, group, readSrc } from '../harness.mjs';
import { wrapText, layoutTable, paginateTable, domTableModel, TABLE_IMAGE } from '../../ui/table-image.mjs';

const measure = (text, bold) => String(text).length * (bold ? 8 : 7); // پهنای ساختگیِ قطعی

group('۳۳۶. متنِ بلند می‌شکند، بریده نمی‌شود');
{
  const lines = wrapText('ضهرم۱۲۰۷ قرارداد اختیار خرید اهرم با نام طولانی', 100, measure);
  check('چند خط و هیچ کلمه‌ای گم نشده', lines.length > 1 && lines.join(' ') === 'ضهرم۱۲۰۷ قرارداد اختیار خرید اهرم با نام طولانی');
  check('هیچ خطی از پهنا نمی‌گذرد', lines.every((l) => measure(l) <= 100));
  const long = wrapText('الفبپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی', 70, measure);
  check('کلمهٔ بلندتر از پهنا حرف‌به‌حرف می‌شکند و کامل می‌ماند', long.join('') === 'الفبپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی' && long.every((l) => measure(l) <= 70));
  check('خانهٔ خالی یک خطِ خالی است', JSON.stringify(wrapText('', 50, measure)) === '[""]');
}

const bigModel = (rows, cols) => ({
  columns: [{ label: 'نام قرارداد' }, ...Array.from({ length: cols - 1 }, (_, i) => ({ label: `ستون ${i + 1} با عنوان بلند`, numeric: true }))],
  rows: Array.from({ length: rows }, (_, r) => ({ cells: [{ text: `ضهرم${r}` }, ...Array.from({ length: cols - 1 }, (_, i) => ({ text: String(r * i), tone: i % 2 ? 'neg' : '' }))] })),
});

group('۳۳۶. جدولِ پهن: بخش‌های ستونی، ستونِ اول در همه');
{
  const model = bigModel(30, 40);
  const layout = layoutTable(model, measure, { maxWidth: 900 });
  const covered = new Set(layout.groups.flatMap((g) => g.cols));
  check('بیش از یک بخش', layout.groups.length > 1);
  check('هیچ ستونی جا نمانده', covered.size === 40 && [...Array(40).keys()].every((i) => covered.has(i)));
  check('ستونِ اول در هر بخش تکرار شده', layout.groups.every((g) => g.cols[0] === 0));
  check('پهنای هر بخش از سقف نمی‌گذرد', layout.groups.every((g) => g.width <= 900));
  check('هر بخش همهٔ ردیف‌ها را دارد', layout.groups.every((g) => g.rows.length === 30));
  check('پهنای ستون در کف و سقف', layout.groups.every((g) => g.widths.every((w) => w >= TABLE_IMAGE.minCol && w <= TABLE_IMAGE.maxCol)));
  const narrow = layoutTable(bigModel(5, 4), measure);
  check('جدولِ کم‌ستون یک بخش است', narrow.groups.length === 1 && narrow.groups[0].cols.length === 4);
}

group('۳۳۶. جدولِ بلند: چند صفحه، سرستون در هر صفحه');
{
  const model = bigModel(500, 6);
  const layout = layoutTable(model, measure);
  const pages = paginateTable(layout, { maxPageHeight: 3000 });
  const seen = pages.flatMap((p) => p.blocks).filter((b) => b.group === 0).reduce((n, b) => n + (b.to - b.from), 0);
  check('چند صفحه', pages.length > 1);
  check('هر ردیف دقیقاً یک بار آمده — نه جا مانده نه تکراری', seen === 500
    && pages.flatMap((p) => p.blocks).every((b, i, all) => i === 0 || all[i - 1].group !== b.group || all[i - 1].to === b.from));
  check('هیچ صفحه‌ای از سقفِ بلندی نمی‌گذرد', pages.every((p) => p.height <= 3000));
  check('هر تکهٔ هر صفحه سرستونِ خودش را دارد', pages.every((p) => p.blocks.every((b) => b.height >= layout.groups[b.group].headH)));
  const small = paginateTable(layoutTable(bigModel(10, 3), measure));
  check('جدولِ کوچک یک تصویر است', small.length === 1);
}

group('۳۳۶. جدولِ ایستا از DOM: سرستونِ چندردیفه، یادداشت، رنگ');
{
  const cell = (text, { span = 1, tag = 'TD', cls = '' } = {}) => ({ innerText: text, colSpan: span, tagName: tag, className: cls, parentElement: { className: '' } });
  const row = (cells, cls = '') => ({ cells, className: cls, hidden: false });
  const table = {
    tHead: { rows: [row([cell('کال', { span: 2, tag: 'TH' }), cell('قیمت اعمال', { tag: 'TH' }), cell('پوت', { span: 2, tag: 'TH' })]), row([cell('قرارداد', { tag: 'TH' }), cell('آخرین', { tag: 'TH' }), cell('', { tag: 'TH' }), cell('آخرین', { tag: 'TH' }), cell('قرارداد', { tag: 'TH' })])] },
    tBodies: [{ rows: [
      row([cell('ضهرم۱۲۰۷'), cell('−۱,۲۳۰', { cls: 'n neg' }), cell('۲,۰۰۰'), cell('۳۴۰', { cls: 'n' }), cell('طهرم۱۲۰۷')]),
      row([cell('ردیفِ پنهان')], 'tbl-spacer'),
      row([cell('یادداشتِ\nبلند', { span: 5 })]),
    ] }],
  };
  const m = domTableModel(table);
  check('سرستونِ دوردیفه تخت شده و هیچ سرستونی گم نشده',
    JSON.stringify(m.columns.map((c) => c.label)) === JSON.stringify(['کال — قرارداد', 'کال — آخرین', 'قیمت اعمال', 'پوت — آخرین', 'پوت — قرارداد']));
  check('رنگِ منفی از کلاسِ خانه', m.rows[0].cells[1].tone === 'neg');
  check('ستونِ عددی شناخته می‌شود، ستونِ نام نه', m.columns[1].numeric && m.columns[2].numeric && !m.columns[0].numeric);
  check('ردیفِ فاصله‌گذار بیرون می‌ماند', m.rows.length === 2);
  check('خانهٔ تمام‌عرض یادداشت است و خط‌هایش با «—» به هم می‌پیوندند، نه «·» که با صفرِ فارسی یکی دیده می‌شود',
    m.rows[1].note === 'یادداشتِ — بلند');
}

group('۳۳۶. سیم‌کشی');
{
  const img = readSrc('../ui/chart-image.mjs');
  const table = readSrc('../ui/table.mjs');
  check('جدول‌ها و کاشی‌های عدد هم دکمهٔ تصویر می‌گیرند',
    img.includes("const TABLES = '.tbl-wrap, table';") && img.includes('${HTML_CHARTS}, ${TABLES}') && img.includes('.lmm-stat-grid'));
  check('جدولِ مشترک از داده کشیده می‌شود (همهٔ ردیف‌ها، نه فقط قاب)',
    img.includes('const model = tableModelOf(host) || domTableModel(') && table.includes('rows: view.map((r) => ({'));
  check('جدولِ مشترک دکمهٔ «تصویر» کنار «خروجی اکسل» دارد', table.includes('class="ghost tbl-image-btn"'));
  check('چند تصویر با مکث میانشان، تا نشانیِ قبلی پیش از دانلود باطل نشود', img.includes('if (i) await pause(1200);'));
  check('پانویس شمار ردیف و ستون را می‌گوید، با «،»', readSrc('../ui/table-image.mjs').includes('ردیف، ${faNum(layout.columnCount)} ستون'));
}
