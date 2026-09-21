// ۲۸۱. انتخاب منبع، و تلاشِ دوباره‌ای که ویران نمی‌کند
//
// چهار یافتهٔ آزمونِ عملیِ ۱۴۰۵/۰۶/۲۹ (F-01 تا F-04). اعدادِ این دسته
// مشاهدهٔ واقعیِ همان اجرا هستند، از بستهٔ شواهدِ ثبت‌شده.

import { check, group, readSrc } from '../harness.mjs';
import {
  chooseTape, dailyExpectation, expectationFromDailyRow, keepBetterTape,
  tapeMatchesDaily, tapeMetrics,
} from '../../core/tape-choice.mjs';
import { closingCoverage } from '../../core/daily-trust.mjs';
import { dataExportCoverageRows, sessionWindow } from '../../core/data-export.mjs';

/** نوارِ ساختگی با شمار و حجمِ خواسته‌شده — شکلش همان خروجیِ نرمال‌ساز است. */
const tape = (count, volume, canceled = 0) => {
  const rows = Array.from({ length: count }, (_, i) => ({
    sequence: i + 1, time: 90000 + i, price: 1000,
    quantity: i === 0 ? volume - (count - 1) : 1, canceled: false, canceledKnown: true,
  }));
  for (let i = 0; i < canceled; i += 1) {
    rows.push({ sequence: count + i + 1, time: 120000 + i, price: 1000, quantity: 0, canceled: true, canceledKnown: true });
  }
  return rows;
};

group('۲۸۱. F-01 — غیرخالی‌بودن معیارِ کامل‌بودن نیست');
{
  // نمونهٔ واقعیِ اهرم `17914401175772326` در `20260919`.
  const first = { variant: 'true', rows: tape(2521, 11382585), duplicates: 0, conflicts: [] };
  const alt = { variant: 'false', rows: tape(7736, 73305224), duplicates: 0, conflicts: [] };
  const expect = { known: true, trades: 7736, volume: 73305224, value: 0 };

  check('شمار و حجمِ نمونه همان چیزی است که ممیزی دید',
    tapeMetrics(first.rows).trades === 2521 && tapeMetrics(first.rows).volume === 11382585
      && tapeMetrics(alt.rows).trades === 7736 && tapeMetrics(alt.rows).volume === 73305224);

  // ═══ قلبِ F-01 ═══
  //
  // پاسخِ اول **غیرخالی** است، پس منطقِ قبلی همان را برمی‌داشت و ۵٬۲۱۵
  // معامله را دور می‌ریخت.
  check('پاسخِ اولِ غیرخالی ولی بریده، «کامل» شمرده نمی‌شود',
    chooseTape([first], expect).complete === false);
  check('و کسری‌اش با عدد گفته می‌شود',
    chooseTape([first], expect).shortfall.trades === 5215
      && chooseTape([first], expect).shortfall.volume === 61922639);

  const both = chooseTape([first, alt], expect);
  check('با هر دو پاسخ، آن‌که با تابلو می‌خواند انتخاب می‌شود',
    both.variant === 'false' && both.rows.length === 7736);
  check('و «کامل» علامت می‌خورد', both.complete === true && both.verified === true);
  // جمعِ خام ممنوع است: خودِ بالادست ردیف را دوبار می‌فرستد.
  check('دو پاسخ جمع نمی‌شوند — انتخاب می‌شود', both.rows.length === 7736);

  // وقتی هیچ‌کدام نمی‌خواند، پرحجم‌تر می‌ماند ولی ادعای کامل‌بودن نمی‌شود.
  const neither = chooseTape([first, { variant: 'false', rows: tape(3000, 20000000), duplicates: 0, conflicts: [] }], expect);
  check('وقتی هیچ‌کدام تطبیق نکرد، پرحجم‌تر می‌ماند', neither.rows.length === 3000);
  check('ولی «کامل» نمی‌شود', neither.complete === false);
  check('و هر دو تلاش در پاسخ فهرست می‌شوند', neither.tried.length === 2);

  // بی مرجع، هیچ ادعایی نمی‌شود — نه کامل، نه ناقص.
  const blind = chooseTape([first], { known: false });
  check('بی تابلوی روزانه، «تأییدنشده» است', blind.verified === false && blind.complete === false);
  check('و کسری ادعا نمی‌شود', blind.shortfall === null);

  // خالیِ هر دو مسیر، وقتی تابلو معامله ثبت کرده.
  const empty = chooseTape([{ variant: 'true', rows: [] }, { variant: 'false', rows: [] }], expect);
  check('خالیِ هر دو مسیر علامت می‌خورد', empty.emptyBoth === true);
  check('و کسری‌اش کلِ چیزی است که تابلو می‌گوید',
    empty.shortfall.trades === 7736 && empty.shortfall.volume === 73305224);
}

group('۲۸۱. معیارِ تطبیق، و معاملهٔ باطل');
{
  const expect = { known: true, trades: 248, volume: 2828, value: 0 };
  // حجم دقیقاً می‌خواند و اختلافِ شمار به اندازهٔ ردیف‌های باطل است.
  check('اختلافِ شمار تا اندازهٔ باطل‌ها توضیح دارد',
    tapeMatchesDaily(tapeMetrics(tape(246, 2828, 2)), expect));
  check('ولی بیشتر از آن نه',
    !tapeMatchesDaily(tapeMetrics(tape(240, 2828, 2)), expect));
  check('و اختلافِ حجم به‌تنهایی کافی است برای ردّ تطبیق',
    !tapeMatchesDaily(tapeMetrics(tape(248, 2000)), expect));
  check('بی مرجع هیچ‌چیز «تطبیق‌شده» نیست',
    !tapeMatchesDaily(tapeMetrics(tape(10, 10)), { known: false }));

  // خواندنِ مرجع از دو شکلِ ورودی، یک معنی.
  check('انتظار از پاسخ خامِ بالادست خوانده می‌شود',
    dailyExpectation({ closingPriceDaily: { zTotTran: 7736, qTotTran5J: 73305224, qTotCap: 5 } }).trades === 7736);
  check('و از ردیفِ نرمال‌شدهٔ روزانه هم',
    expectationFromDailyRow({ trades: 7736, vol: 73305224 }).volume === 73305224);
  // ═══ این ادعا پس از R3-03 وارونه شد ═══
  //
  // صفرِ **تأییدشده** هم یک مرجع است: تابلو گفت آن روز معامله‌ای نشد.
  // خواندنش به‌عنوان «مرجع نداریم» همان چیزی بود که API را با خروجی
  // ناسازگار می‌کرد — یکی `verified:false` می‌گفت و دیگری «بی‌معاملهٔ
  // تأییدشده».
  check('صفرِ تأییدشده هم مرجع است، با پرچمِ خودش',
    dailyExpectation({ x: { zTotTran: 0, qTotTran5J: 0 } }).quiet === true
      && expectationFromDailyRow({ trades: 0, vol: 0 }).quiet === true);
  check('و «مرجع داریم» علامت می‌خورد',
    dailyExpectation({ x: { zTotTran: 0, qTotTran5J: 0 } }).known === true);
  // ولی **نبودنِ میدان** با **صفر بودنش** یکی نیست.
  check('نبودِ میدانِ شمار/حجم مرجع نمی‌سازد',
    dailyExpectation({ x: { pClosing: 230 } }).known === false);
  check('و دلیلش گفته می‌شود',
    String(dailyExpectation({ x: { pClosing: 230 } }).why || '').includes('شمار یا حجم'));
}

group('۲۸۱. F-04 — تلاشِ دوباره دادهٔ موجود را پاک نمی‌کند');
{
  // بازتولیدِ ثبت‌شده: ۲٬۵۲۱ ردیف در دست، و پاسخِ تازه صفر.
  const previous = { rows: tape(2521, 11382585), source: 'history', variant: 'true' };
  const expect = { known: true, trades: 7736, volume: 73305224, value: 0 };
  const emptied = keepBetterTape(previous, { rows: [], source: 'history', retried: true }, expect);

  check('پاسخِ خالیِ تازه جای ۲٬۵۲۱ ردیف را نمی‌گیرد', emptied.rows.length === 2521);
  check('و صریح علامت می‌خورد که تلاش بدتر بود',
    emptied.retryWorse === true && emptied.retryEmptied === true);
  check('و جایگزینی انجام نشد', emptied.replaced === false);

  // خطای تلاشِ تازه هم دادهٔ قبلی را نمی‌برد.
  const failed = keepBetterTape(previous, { rows: [], error: 'دروازه', source: 'history' }, expect);
  check('خطای تلاشِ تازه هم ردیف‌های قبلی را نگه می‌دارد', failed.rows.length === 2521);
  check('ولی متنِ خطا حمل می‌شود، نه اینکه بلعیده شود',
    failed.retryFailed === true && failed.retryError.includes('دروازه'));

  // ═══ و آنچه **باید** جایگزین شود ═══
  const better = keepBetterTape(previous, { rows: tape(7736, 73305224), source: 'history' }, expect);
  check('پاسخی که با تابلو می‌خواند جایگزین می‌شود',
    better.rows.length === 7736 && better.replaced === true);
  check('دورِ اولِ بی‌دادهٔ قبلی همیشه می‌نشیند',
    keepBetterTape(undefined, { rows: tape(5, 5) }, expect).rows.length === 5);
  // برابر که بودند، قبلی می‌ماند: تازگی دلیلِ عوض‌کردنِ دادهٔ سالم نیست.
  check('پاسخِ هم‌اندازه جای قبلی را نمی‌گیرد',
    keepBetterTape(previous, { rows: tape(2521, 11382585) }, expect).replaced === false);

  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('تب همهٔ نشستن‌ها را از همین دروازه رد می‌کند',
    (tab.match(/keepBetterTape\(/g) || []).length === 3);
  // ═══ R5-06: ادعا گسترده‌تر شد، نه ضعیف‌تر ═══
  //
  // پیش از این مرجع فقط از تابلوی یکجا گرفته‌شدهٔ خودِ تب می‌آمد. برای
  // قراردادِ منقضی آن endpoint خالی برمی‌گردد، پس `keepBetterTape` در
  // دورهای بعد بی‌مرجع می‌ماند و به «پرحجم‌تر می‌ماند» برمی‌گشت. حالا
  // مرجعی که سرور پیدا کرده هم شمرده می‌شود — ولی **پس از** مرجعِ خودِ
  // تب، نه به‌جایش.
  check('و مرجعِ سنجش را از تابلوی روزانهٔ گرفته‌شده می‌سازد',
    tab.includes('const own = expectationFromDailyRow(')
      && tab.includes('dailyIndex.set('));
  check('و اگر آن نبود، از مرجعی که سرور برگردانده',
    tab.includes('if (own.known) return own;')
      && tab.includes('referenceIndex.set(String(pair.key), hit.reference)'));
}

group('۲۸۱. F-02 — پنجرهٔ انتخابی ستونِ خودش را دارد');
{
  const instruments = [{ ins: 'B', name: 'اهرم', kind: 'underlying', baseName: 'اهرم' }];
  const pairs = [{ key: '20260919:B', ins: 'B', date: 20260919 }];
  // سه ردیف: ۱۰:۰۰ (داخل هر دو)، ۹:۱۵ (داخل جلسهٔ بازار ولی بیرونِ
  // پنجرهٔ ۹:۳۰)، ۱۲:۳۵ (بیرونِ هر دو).
  const items = { '20260919:B': { rows: [
    { time: 100000, quantity: 1, price: 1 }, { time: 91500, quantity: 1, price: 1 },
    { time: 123500, quantity: 1, price: 1 },
  ], source: 'history' } };

  const wide = dataExportCoverageRows(instruments, pairs, items, [])[0];
  check('بی پنجرهٔ انتخابی، هر دو ستون یک عدد می‌دهند',
    wide.outside === 1 && wide.outsideWindow === 1);

  const narrow = dataExportCoverageRows(instruments, pairs, items, [], sessionWindow('09:30', '12:30'))[0];
  check('«خارج از جلسهٔ بازار» به پنجره وابسته نیست', narrow.outside === 1);
  check('ولی «خارج از پنجرهٔ انتخابی» آن را می‌بیند', narrow.outsideWindow === 2);
  check('و «کل ردیف» سرِ جایش می‌ماند', narrow.rows === 3);
}

group('۲۸۱. F-03 — پاسخِ closing وضعیتِ پوشش می‌گوید');
{
  // نمونهٔ واقعیِ اهرم/۲۰۲۶۰۹۱۹: یک رکوردِ ۰۶:۱۲:۰۶ با صفر معامله.
  const lone = closingCoverage(
    [{ dEven: 0, hEven: 61206, pClosing: 75064, zTotTran: 0, qTotTran5J: 0 }],
    { known: true, trades: 7736, volume: 73305224 },
  );
  check('رکوردِ تکِ پیش‌جلسه «کامل» نیست', lone.complete === false);
  check('و صریح «عکسِ پیش‌جلسه» خوانده می‌شود',
    lone.preSessionOnly === true && lone.note.includes('پیش‌جلسه'));

  // ═══ و نمونهٔ سالم، که همان‌قدر مهم است ═══
  //
  // ضهرم۶۰۴۰/۲۰۲۶۰۹۱۶: ۲۱۰ رکورد، همه با `dEven:0`، ولی رکوردِ ۱۲:۲۹:۴۴
  // با ۲۴۶ معامله و ۲٬۸۲۸ حجم دقیقاً با تابلو می‌خواند. پس تاریخِ داخلیِ
  // صفر قراردادِ این endpoint است، نه نشانهٔ نقص.
  const healthy = closingCoverage([
    { dEven: 0, hEven: 122944, zTotTran: 246, qTotTran5J: 2828 },
    { dEven: 0, hEven: 61107, zTotTran: 0, qTotTran5J: 0 },
  ], { known: true, trades: 246, volume: 2828 });
  check('پاسخِ پوشش‌دار «کامل» است، با وجود dEven صفر', healthy.complete === true);
  check('و «پیش‌جلسه» خوانده نمی‌شود', healthy.preSessionOnly === false);
  check('بیشینهٔ شمار و حجم گزارش می‌شود',
    healthy.maxTrades === 246 && healthy.maxVolume === 2828);
  check('و ساعتِ اول و آخرِ رکوردها هم',
    healthy.firstSecond === (6 * 3600) + (11 * 60) + 7
      && healthy.lastSecond === (12 * 3600) + (29 * 60) + 44);

  check('بی تابلو، ادعای کامل‌بودن نمی‌شود',
    closingCoverage([{ hEven: 122944, zTotTran: 246, qTotTran5J: 2828 }], { known: false }).complete === false);
  check('و همان‌جا گفته می‌شود که سنجیده نشد',
    closingCoverage([{ hEven: 122944 }], { known: false }).note.includes('سنجیده نشد'));
  check('پاسخِ بی‌رکورد هم وضعیتِ خودش را دارد',
    closingCoverage([], { known: true, trades: 5, volume: 5 }).note.includes('هیچ رکوردی'));

  const server = readSrc('../server/server.mjs');
  check('سرور وضعیتِ پوشش را همراه پاسخِ closing می‌فرستد',
    server.includes("if (kind === 'closing')") && server.includes('coverage: closingCoverage(rows, expect)'));
  check('و رکوردِ خام را حذف نمی‌کند',
    server.includes('rows, count: rows.length, coverage:'));
}

group('۲۸۱. مصرف در سرور');
{
  const server = readSrc('../server/server.mjs');
  check('دریافت‌کنندهٔ مشترک مرجعِ روزانه را می‌گیرد',
    server.includes("dailyExpectation(await get(historicalPath('daily', code, date)"));
  check('و آن را هم‌زمان با مسیر اول می‌گیرد، نه پس از آن',
    server.includes('Promise.all([pull(historicalTradesPath(code, date)), reference()])'));
  check('فقط تطبیقِ کامل جلوی مسیر دوم را می‌گیرد',
    server.includes('if (decided.complete) return withUpstream(decided, first, null);'));
  check('نبودِ مرجع اجرا را نمی‌اندازد',
    /catch \{\s*return \{ known: false/.test(server));
}
