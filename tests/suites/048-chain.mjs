// ۴۷. نوار سقف سررسید، وقتی زنجیره نیست
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { buildChain } from '../../core/chain.mjs';
import { archiveNote } from '../../core/watch-archive.mjs';
import { strandedKeys } from '../../ui/expiries.mjs';
import { humanizeUpstreamError } from '../../ui/fmt.mjs';


// ═══════════════════════════ ۴۷. نوار «سقف سررسید» — وقتی زنجیره نیست ═══════════════════════════
group('۴۷. نوار سقف سررسید، وقتی زنجیره نیست');
{
  // این نوار روی `/api/watch` بسته شده بود. حلقه دیده‌بان بیرون از ساعت بازار
  // عمداً پارک می‌شود، پس آن نقطه پایانی شب‌ها آرایه خالی می‌دهد — با کد ۲۰۰ و
  // بدون هیچ خطایی. نتیجه: کاربر دکمه را می‌زد و پنل عملاً خالی بود. بدتر از
  // آن، سررسیدهای علامت‌خورده هم دیده نمی‌شدند، یعنی چیزی که روی همه محاسبات
  // اثر داشت راه خاموش‌کردن نداشت.
  const mkRow47 = (strike, days, ua = '1', uaName = 'نمونه', endDate = 20260101) => ({
    uaInsCode: ua, lval30_UA: uaName, pDrCotVal_UA: 100000, pClosing_UA: 100000,
    insCode_C: `c${ua}_${strike}_${days}`, lVal18AFC_C: `ض${strike}`,
    insCode_P: `p${ua}_${strike}_${days}`, lVal18AFC_P: `ط${strike}`,
    strikePrice: strike, contractSize: 1000, remainedDay: days, endDate,
    pMeDem_C: 900, qTitMeDem_C: 10, pMeOf_C: 1000, qTitMeOf_C: 10,
    pDrCotVal_C: 950, pClosing_C: 950, oP_C: 5, qTotTran5J_C: 5,
    pMeDem_P: 800, qTitMeDem_P: 10, pMeOf_P: 900, qTitMeOf_P: 10,
    pDrCotVal_P: 850, pClosing_P: 850, oP_P: 5, qTotTran5J_P: 5,
  });
  const chain47 = buildChain([
    mkRow47(100000, 30, '1', 'نمونه', 20260101),
    mkRow47(100000, 90, '1', 'نمونه', 20260301),
  ]);
  const live47 = '1:20260101';
  const gone47 = '1:20251201';   // سررسید گذشته، دیگر قراردادی ندارد
  const other47 = '2:20260101';  // نمادی که اصلاً در زنجیره نیست

  check('کلیدی که زنجیره پوشش می‌دهد جدا نمی‌افتد',
    strandedKeys(new Set([live47]), chain47).length === 0);
  check('کلید سررسید گذشته جدا می‌افتد و دیده می‌شود',
    strandedKeys(new Set([live47, gone47]), chain47).join('|') === gone47);
  // مهم‌ترین حالت: بازار بسته است و زنجیره‌ای در کار نیست. اگر اینجا فهرست خالی
  // برگردد، کاربر با تنظیمی می‌ماند که راه برداشتنش را ندارد.
  check('بدون زنجیره، هر کلید علامت‌خورده جدا می‌افتد',
    strandedKeys(new Set([live47, other47]), null).length === 2);
  check('زنجیره خالی هم مثل نبودِ زنجیره است',
    strandedKeys(new Set([live47]), new Map()).join('|') === live47);
  check('فهرست جداافتاده‌ها مرتب است', 
    strandedKeys(new Set([other47, gone47]), chain47).join('|') === [gone47, other47].sort().join('|'));

  const src47 = readSrc('../ui/expiries.mjs');
  // `history/universe` تنها نقطه‌ای است که فهرست قرارداد فعال را بیرون از ساعت
  // بازار هم می‌دهد؛ خودِ سرور همین را در توضیحش نوشته است.
  check('نوار، فهرست را از نقطه‌ای می‌گیرد که شب و روز پاسخ می‌دهد',
    src47.includes("fetch('/api/history/universe')") && !src47.includes("fetch('/api/watch')"));
  const serverSrc47 = readSrc('../server/server.mjs');
  check('چرا `watch` مناسب نبود: حلقه دیده‌بان پشت ساعت بازار می‌ایستد',
    /if \(!gate\.open\) return true;/.test(serverSrc47));
  // ادعا عوض نشده، فقط شکل کد: شاخهٔ جایگزینیِ بایگانی که زیرش نشست،
  // ترکیب سه‌تایی را به `if/else` باز کرد. وقتی عکس لحظه‌ای خالی است، همین
  // نقطه هنوز خودش از بالادست می‌گیرد.
  //
  // پیش از این، فاصله شمرده می‌شد (`{0,3000}`) و همان عدد یک بار شکست:
  // شاخهٔ دفتر قراردادهای تاریخی وسط نشست و ادعا — که هنوز درست بود —
  // قرمز شد. حالا بدنهٔ خودِ همان نقطه بریده می‌شود، پس رشدِ بعدی‌اش
  // ادعای سالم را نمی‌شکند.
  const universe47 = serverSrc47.slice(
    serverSrc47.indexOf("p === '/api/history/universe'"),
    serverSrc47.indexOf("p === '/api/stream'"),
  );
  check('`history/universe` وقتی عکس لحظه‌ای خالی است خودش از بالادست می‌گیرد',
    universe47.includes('fromWatch = watch.rows.length > 0')
    && universe47.includes('rows = firstList(await get(upstream')
    && universe47.indexOf('rows = firstList(await get(upstream') > universe47.indexOf('fromWatch = watch.rows.length > 0'));
  check('نسخهٔ تاریخ‌دار فهرست، پیش از بازگشت به عکس امروز امتحان می‌شود',
    /history\/universe[\s\S]{0,1200}readArchive\(wanted\)[\s\S]{0,600}source: 'archive'/.test(serverSrc47));
  check('نبودن بایگانی برای آن تاریخ، بی‌صدا به عکس امروز برنمی‌گردد',
    /wanted \? archiveNote\(\{ wanted: Number\(wanted\), found: false, firstDate \}\) : ''/.test(serverSrc47)
    && /archived: false,[\s\S]{0,200}note,/.test(serverSrc47));
  // زنجیره خالی نباید کش شود، وگرنه یک بارِ ناموفق تا بارگذاری دوباره صفحه
  // ادامه پیدا می‌کند و باز کردن دوباره هیچ تلاشی نمی‌کند.
  check('زنجیره خالی کش نمی‌شود', src47.includes('if (chain?.size && !force) return;'));
  check('دکمه تلاش دوباره وجود دارد و بار را با اجبار می‌گیرد',
    src47.includes('data-capacity-retry') && src47.includes('loadChain(true)'));
  // پیش از این هر سه خروجیِ زودهنگام `paintPanel` پنل را با یک جمله جایگزین
  // می‌کردند، پس «پاک کردن همه» هم در حالت بی‌زنجیره در دسترس نبود.
  check('کنش‌ها همیشه رسم می‌شوند، حتی وقتی زنجیره نیامده',
    src47.includes('data-capacity-clear') && !/paintPanel = \(\) => \{\n\s+if \(loading\)/.test(src47));
  check('خطای بالادست به فارسی ترجمه می‌شود و متن خام در `title` می‌ماند',
    src47.includes('humanizeUpstreamError(errorRaw)') && src47.includes('title="${esc(errorRaw)}"'));
}
