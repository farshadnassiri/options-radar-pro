// ۵۷. سررسید، نام قرارداد، و هر سربه‌سری در ستون خودش
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { BE_SLOTS, COLUMNS, breakevenMetrics, evaluate } from '../../core/evaluate.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';
import { csvCell, numericCell } from '../../ui/export.mjs';
import { fmt as uiFmt } from '../../ui/fmt.mjs';


// ————————————————————————————————————————————————————————————————
group('۵۷. سررسید، نام قرارداد، و هر سربه‌سری در ستون خودش');

{
  // ——— علامت فاصله، از دید قیمت امروز ———
  //
  // خواستهٔ صریح کاربر: «اگر قیمت روز از سربه‌سری بیشتر بود مثبت، کمتر بود
  // منفی». پیش از این وارونه بود.
  const above = breakevenMetrics([90], 100);
  check('پایه بالای سربه‌سری → فاصله مثبت', near(above.beDistPct, 10), `${above.beDistPct}٪`);
  const below = breakevenMetrics([110], 100);
  check('پایه زیر سربه‌سری → فاصله منفی', near(below.beDistPct, -10), `${below.beDistPct}٪`);
  check('حاشیه امن همچنان بی‌علامت است', near(below.beRoomPct, 10));

  // ——— چند سربه‌سری، هر کدام ستون خودش ———
  const two = breakevenMetrics([94, 108], 100);
  check('سربه‌سری‌ها از پایین به بالا در ستون می‌نشینند', two.be1 === 94 && two.be2 === 108);
  check('هر ستون فاصلهٔ خودش را دارد',
    near(two.be1DistPct, 6) && near(two.be2DistPct, -8),
    `${two.be1DistPct} , ${two.be2DistPct}`);
  check('ستون‌های خالی، خالی می‌مانند نه صفر',
    !Number.isFinite(two.be3) && !Number.isFinite(two.be3DistPct));
  check('فهرست فاصله‌ها هم‌ترتیب با فهرست سربه‌سری‌هاست',
    two.beDistList.length === 2 && near(two.beDistList[0], 6) && near(two.beDistList[1], -8));

  // ورودی نامرتب هم باید مرتب بنشیند — وگرنه «سربه‌سری ۱» معنی ثابتی ندارد
  const messy = breakevenMetrics([108, 94], 100);
  check('ورودی نامرتب، مرتب‌شده در ستون می‌نشیند', messy.be1 === 94 && messy.be2 === 108);

  // ——— سرریز: بیش از ظرفیت ستون‌ها ———
  //
  // ستون‌ها چهار تاست. اگر روزی ترکیبی پنج نقطه ساخت، آن پنجمی نباید
  // بی‌صدا گم شود — ستون فهرستی همه را نگه می‌دارد.
  const many = breakevenMetrics([80, 90, 100, 110, 120], 100);
  check('ظرفیت ستون‌ها چهار است', BE_SLOTS === 4);
  check('سرریز، شمار واقعی را گزارش می‌کند', many.beCount === 5);
  check('سرریز در ستون فهرستی پنهان نمی‌شود', many.beDistList.length === 5);
  check('فقط چهار ستون پر می‌شود', Number.isFinite(many.be4) && many.be4 === 110);

  const none = breakevenMetrics([], 100);
  check('بدون سربه‌سری، همه ستون‌ها خالی‌اند',
    !Number.isFinite(none.be1) && none.beDistList.length === 0 && none.beCount === 0);
}

{
  // ——— سررسید و نام قرارداد روی ردیف ———
  const s57 = defaults();
  const def57 = byId('long-straddle');
  const legs57 = buildLegs(def57, { strikes: [100000], size: 1000, days: [30] });
  legs57.forEach((l, i) => { l.name = i === 0 ? 'ضهرم7058' : 'طهرم7058'; });
  const q57 = (bid, ask) => ({ bid, bidQty: 50, ask, askQty: 50, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid * 0.9, high: ask * 1.1, state: 'A', staleSec: 10,
    book: [{ level: 1, bid, bidQty: 60, ask, askQty: 60 }] });
  const row57 = evaluate({
    legs: legs57, quotes: [q57(4800, 5200), q57(4300, 4700)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size: 1000, qty: 1, settings: s57, def: def57,
      underlying: 'اهرم', sigmaHist: 0.6, endDate: 20260420 },
  });
  check('تاریخ سررسید از سررسید تابلو ساخته می‌شود', row57.expiryLabel === '1405/01/31', row57.expiryLabel);
  check('سررسید خام هم روی ردیف می‌ماند', row57.expiry === 20260420);
  check('بدون سررسید، برچسب خالی می‌ماند نه «—»',
    evaluate({ legs: legs57, quotes: [q57(4800, 5200), q57(4300, 4700)],
      ctx: { S: 100000, Sclose: 100000, days: 30, size: 1000, qty: 1, settings: s57, def: def57, underlying: 'اهرم' } }).expiryLabel === '');
  check('نام قرارداد هر پا روی ردیف می‌آید',
    row57.legNames.length === 2 && row57.legNames[0] === 'ضهرم7058', row57.legNames.join('، '));
  check('قیمت اعمال روی ردیف هست', Array.isArray(row57.strikes) && row57.strikes.includes(100000));
  // `maxProfitPct` عمداً همان `retMaxPct` است — جای نشستنش فرق می‌کند نه مقدارش
  const capped57 = evaluate({
    legs: buildLegs(byId('bull-call-spread'), { strikes: [100000, 110000], size: 1000, days: [30] }),
    quotes: [q57(4800, 5200), q57(1800, 2200)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size: 1000, qty: 1, settings: s57,
      def: byId('bull-call-spread'), underlying: 'اهرم', sigmaHist: 0.6, endDate: 20260420 },
  });
  check('درصد بیشترین سود، همان بازده دوره است',
    near(capped57.maxProfitPct, capped57.retMaxPct, 1e-9), `${capped57.maxProfitPct}`);
  check('سود نامحدود، درصد نمی‌سازد', !Number.isFinite(row57.maxProfitPct));
}

{
  // ——— قالب‌ها ———
  //
  // نام قرارداد شناسه است: «طهرم7058» با رقم فارسی در جست‌وجوی کارگزار
  // پیدا نمی‌شود.
  const out = uiFmt.sym(['طهرم7058', 'ضهرم7059']);
  check('نام قرارداد رقم لاتینش را نگه می‌دارد', out.includes('7058') && !/[۰-۹]/.test(out), out);
  check('نام قرارداد جهتش جدا می‌شود', out.includes('\u2068') && out.includes('\u2069'));
  check('بدون نام، خط تیره می‌آید', uiFmt.sym([]) === '—' && uiFmt.sym(null) === '—');

  // درصد با گردکردن به رقم صحیح، همان تفاوتی را که ستون برایش ساخته شده گم می‌کند
  check('فهرست درصد، دو رقم اعشار نگه می‌دارد',
    uiFmt.pctList([10.2857, -10.9412]) === '۱۰٫۲۹ , −۱۰٫۹۴', uiFmt.pctList([10.2857, -10.9412]));
  check('فهرست درصد خالی، خط تیره می‌دهد', uiFmt.pctList([]) === '—');

  // نشانهٔ جهت‌دهی نامرئی است و در اکسل داخل خانه می‌ماند
  check('خروجی اکسل نشانهٔ جهت‌دهی را برمی‌دارد',
    csvCell('\u2068ضهرم7058\u2069') === '"ضهرم7058"', csvCell('\u2068ضهرم7058\u2069'));
  check('عدد سالم همچنان عدد می‌ماند', numericCell('۱۲٫۵٪') === '12.5');
}

{
  const cols57 = COLUMNS.map((c) => c.key);
  for (const k of ['expiryLabel', 'strikes', 'legNames', 'maxProfitPct', 'beDistList',
    'be1', 'be1DistPct', 'be2', 'be2DistPct', 'be3', 'be3DistPct', 'be4', 'be4DistPct']) {
    check(`ستون ${k} در قرارداد ستونی هست`, cols57.includes(k));
  }

  const scanSrc57 = readSrc('../core/scan.mjs');
  // بدون این، ستون «تاریخ سررسید» در اسکن واقعی خالی می‌ماند
  check('اسکن، سررسید را به ارزیاب می‌دهد', scanSrc57.includes('endDate: c.endDate,'));

  // خانهٔ عددی «direction: ltr» می‌گیرد؛ با «text-align: start» به چپ می‌چسبد
  // در حالی که سرستونِ راست‌به‌چپ به راست می‌چسبد — عدد زیر ستون خودش نمی‌ماند
  const css57 = readSrc('../ui/style.css');
  check('خانهٔ عددی جدول کوچک، هم‌لبهٔ سرستون است',
    /\.mini td\.n \{[^}]*text-align: end;/.test(css57));
  check('خانهٔ عددی جدول اصلی، هم‌لبهٔ سرستون است',
    /table\.data td\.n \{[^}]*text-align: end;/.test(css57));
}
