// ۸۰. سورت و جابه‌جایی ستون جدول‌های رشته‌ای
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { cellValue as enhanceCellValue, moveTo as enhanceMoveTo } from '../../ui/table-enhance.mjs';
import { moveColumn } from '../../ui/table.mjs';


// ═════════ ۸۰. سورت و جابه‌جایی ستون روی همهٔ جدول‌ها ═════════
//
// خواسته کاربر: «هر جدولی در برنامه قابلیت sort داشته باشد و drag.»
//
// چهل‌وشش جدول با رشتهٔ قالبی ساخته می‌شوند و بازنویسی همه روی `makeTable`
// یعنی برای هر کدام قرارداد ستون و قالب و کلیک ردیف را از نو سوار کردن —
// کاری بزرگ با ریسک رگرسیون بالا برای دو رفتار کاملاً عمومی. پس رفتار روی
// جدولِ رسم‌شده می‌نشیند، همان الگویی که `attachExportsIn` دارد.
group('۸۰. سورت و جابه‌جایی ستون جدول‌های رشته‌ای');
{
  // ——— مقدار خانه ———
  check('رقم فارسی عدد خوانده می‌شود', enhanceCellValue({ textContent: '۱٬۲۳۴' }).num === 1234);
  check('اولین عدد ملاک است، نه تکهٔ دوم خانه',
    enhanceCellValue({ textContent: '۱٬۰۰۰ اثر ۵۰٪' }).num === 1000);
  check('عدد منفی و اعشاری خوانده می‌شود', enhanceCellValue({ textContent: '-۱۲٫۵' }).num === -12.5);
  check('خانهٔ «—» بی‌مقدار است، نه صفر',
    enhanceCellValue({ textContent: '—' }).empty === true && enhanceCellValue({ textContent: '' }).empty === true);
  check('متن بی‌عدد، متن می‌ماند',
    enhanceCellValue({ textContent: 'معتبر' }).text === 'معتبر' && Number.isNaN(enhanceCellValue({ textContent: 'معتبر' }).num));
  check('نشانهٔ جهت‌دهی مقدار را خراب نمی‌کند', enhanceCellValue({ textContent: '⁦۱۲⁩' }).num === 12);

  // ——— جابه‌جایی ستون، هم‌معنی با جدول مجازی‌سازی‌شده ———
  // اگر این دو یکی نباشند، کشیدن ستون در دو جور جدول دو نتیجه می‌دهد.
  const keys = ['a', 'b', 'c', 'd'];
  for (const [from, to] of [[0, 2], [3, 0], [1, 1], [2, 3]]) {
    const byIndex = enhanceMoveTo([0, 1, 2, 3], from, to).map((at) => keys[at]);
    const byKey = moveColumn(keys, keys[from], keys[to]);
    check(`جابه‌جایی ${from}→${to} با جدول مجازی‌سازی‌شده یکی است`,
      byIndex.join('') === byKey.join(''), `${byIndex.join('')} / ${byKey.join('')}`);
  }

  // ——— ماژول: قواعدی که نباید بی‌صدا عوض شوند ———
  const enh = readSrc('../ui/table-enhance.mjs');
  check('جدول مجازی‌سازی‌شده دوباره ارتقا نمی‌گیرد', enh.includes("table.closest('.tbl-wrap')"));
  check('سرستون چندسطری و خانهٔ ادغام‌شده کنار گذاشته می‌شود',
    enh.includes('heads.length !== 1') && enh.includes('c.colSpan > 1 || c.rowSpan > 1'));
  check('ماتریس متقارن ستون جابه‌جا نمی‌کند ولی سورت می‌شود',
    /const isMatrix = /.test(enh) && enh.includes('fresh && !isMatrix(table)') && enh.includes('isMatrix(hit.table)'));
  check('سورت سه حالت دارد تا ترتیب اولیه برگردد',
    enh.includes("const dir = now === 'descending' ? 1 : now === 'ascending' ? 0 : -1;"));
  check('مرتب‌سازی پایدار است', enh.includes('(a.at - b.at)'));
  check('بی‌مقدار همیشه ته می‌نشیند، در هر دو جهت',
    /if \(a\.empty\) return 1;[\s\S]*if \(b\.empty\) return -1;/.test(enh));
  check('ترتیب ستون در حافظهٔ مرورگر می‌ماند', enh.includes("const STORE = 'options-radar:cols:'"));
  check('کلید ترتیب، نام سرستون‌ها را هم در خود دارد',
    /const heads = \[\.\.\.table\.querySelectorAll\('thead th'\)\]\.map\(\(c\) => c\.textContent\.trim\(\)\)\.join\('\|'\)/.test(enh));
  check('نبود حافظه به استثنا ختم نمی‌شود',
    /const store = \(\) => \{ try \{ return window\.localStorage; \} catch \{ return null; \} \};/.test(enh));
  // شنونده روی ریشه می‌نشیند نه روی جدول: جدول با هر به‌روزرسانی نو می‌شود
  check('شنونده واگذارشده است، نه روی تک‌تک جدول‌ها',
    enh.includes("root.addEventListener('click', onClick)") && enh.includes('new MutationObserver'));
  check('صفحه‌کلید هم مرتب می‌کند', enh.includes("event.key !== 'Enter' && event.key !== ' '"));

  // ——— نصب یک‌باره در پوستهٔ برنامه ———
  const app80 = readSrc('../ui/app.mjs');
  check('پوستهٔ برنامه یک‌بار نصبش می‌کند', app80.includes("installTableEnhance(el('stage'))"));

  // ——— نشانگر جهت با ::after می‌آید، نه داخل متن خانه ———
  const css80 = readSrc('../ui/style.css');
  check('نشانگر جهت متن سرستون را آلوده نمی‌کند',
    css80.includes('th[aria-sort="ascending"]::after') && css80.includes('th[aria-sort="descending"]::after'));
  check('ستون در حال کشیدن و مقصد، نشانهٔ دیداری دارند',
    css80.includes('th.th-dragging') && css80.includes('th.th-drop'));
}
