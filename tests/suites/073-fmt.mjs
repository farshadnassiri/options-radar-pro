// ۷۲. جدول‌های داشبورد رصد لحظه‌ای
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { fmt as uiFmt } from '../../ui/fmt.mjs';



// ═════════ ۷۲. جدول‌های رصد لحظه‌ای: مرتب‌شونده، صادرشونده، هم‌قد دامنه ═════════
//
// دو خواسته کاربر، یک ریشه:
//
//   «همه جدول‌های رصد لحظه‌ای قابلیت سرت کردن و خروجی اکسل داشته باشند»
//   «اطلاعاتی که از کل نماد می‌گیریم با اطلاعات یک سررسید یا یک قرارداد
//    متفاوت است — لازم نیست بیست تب شبیه هم باشند»
//
// ریشه، یک `innerHTML` خام دوازده‌ستونه بود که برای هر سطحی یک قالب داشت:
// نه مرتب می‌شد، نه خروجی داشت، و ردیف نماد پایه ستون «سررسید» می‌گرفت که
// همیشه «—» بود.
//
// بازچینیِ ۱۴۰۵/۰۷/۱۷: جدول‌های نماد/سررسید/گروه/ریزمعامله با پنج زیرتب رفتند؛
// جدولِ «تصویر شفاف» (یک جدول، ستونِ نامش با سطح عوض می‌شود) همان قاعده‌ها را
// نگه می‌دارد: جدول مشترک، انتخابگر ستون، خروجی، و نمونهٔ ماندگار.
group('۷۲. جدول‌های داشبورد رصد لحظه‌ای');
{
  const dash72 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const cp72 = readSrc('../ui/clear-picture-view.mjs');
  const setOf = (name) => {
    const block = new RegExp(`const ${name} = \\[((?:.|\\n)*?)\\n\\];`).exec(dash72)?.[1] || '';
    return [...block.matchAll(/col\('(\w+)'/g)].map((m) => m[1]);
  };
  const contract = setOf('COLS_CONTRACT');
  const parts = [...cp72.matchAll(/col\('(\w+)'/g)].map((m) => m[1]);

  check('جدول‌ها از جدول مشترک می‌آیند، نه از innerHTML خام',
    cp72.includes("import { makeTable } from '/ui/table.mjs'")
    && !cp72.includes('<table') && !dash72.includes('<table class="history-table decision-table"'));
  check('جدولِ اجزا انتخابگر ستون و نام خروجی می‌گیرد',
    cp72.includes('all: cols, storeKey: `clear-picture:${partLevel}`, exportName: `clear-picture-${partLevel}`'));
  check('و نمونهٔ هر سطح نگه داشته می‌شود تا مرتب‌سازی کاربر با هر دریافت پاک نشود',
    cp72.includes('const tables = new Map()') && cp72.includes('tables.set(partLevel, entry)'));
  check('جدول سطحِ دیگر از DOM جدا می‌شود، نه فقط پنهان',
    cp72.includes('if (child !== entry.el) child.remove()') && !cp72.includes('el.hidden = true'));
  check('ستون نام با سطح عوض می‌شود؛ ستون‌های قرارداد به جدول اجزا نشت نمی‌کنند',
    cp72.includes("col('title', PART_LABEL[partLevel] || 'جزء', 'text'")
    && !parts.includes('strike') && !parts.includes('kindLabel') && contract.includes('strike'));
  check('جدولِ اجزا سهم کال و پوت و جهت را دارد',
    ['sharePct', 'callValue', 'callValuePct', 'putValue', 'putValuePct', 'positivePct', 'negativePct'].every((k) => parts.includes(k)));
  const fmts = [...`${dash72}\n${cp72}`.matchAll(/col\('\w+', [^,]+, '(\w+)'/g)].map((m) => m[1]);
  check('قالب هر ستون داشبورد در ui/fmt.mjs تعریف شده',
    fmts.length > 0 && fmts.every((f) => typeof uiFmt[f] === 'function'),
    [...new Set(fmts.filter((f) => typeof uiFmt[f] !== 'function'))].join('، '));
}
