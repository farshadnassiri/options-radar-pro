// ۲۷۸. پاسخِ نیمه‌کامل موفق نیست
//
// بند ۳ ممیزیِ ۱۴۰۵/۰۶/۲۹. بازتولیدِ گزارش‌شده: تابلوی روزانه ۱٬۰۰۰ معامله
// و ۱۰٬۰۰۰ حجم می‌گفت و نوار **یک** معامله در ۱۰:۳۰ با حجم ۱۰ داشت —
// `dataExportBlankAudit` هیچ ایرادی برنمی‌گرداند و برگ پوشش «داده آمد»
// می‌نوشت. علت: بازبینی فقط برای پاسخ‌های کاملاً خالی اجرا می‌شد.
//
// معیار پذیرشِ ۵: نوار یک‌ردیفی در برابر روزانهٔ هزارمعامله‌ای موفق/کامل
// تلقی نشود.

import { check, group, readSrc } from '../harness.mjs';
import {
  BLANK_VERDICT_LABEL, EMPTY_STATUS, blankAuditSummary, coverageStatusOf, coverageVerdict,
  dataExportBlankAudit, dataExportCoverageRows,
} from '../../core/data-export.mjs';

const instruments = [{ ins: 'B', name: 'اهرم', kind: 'underlying', baseName: 'اهرم' }];
const pair = (date) => ({ key: `${date}:B`, ins: 'B', date });
const daily = (date, trades, vol) => ({ B: { rows: [{ date, trades, vol }] } });
const tick = (time, quantity, price = 1000, canceled = false) => ({ time, quantity, price, canceled });

group('۲۷۸. بازتولیدِ نمونهٔ ممیزی');
{
  const pairs = [pair(20260919)];
  const items = { '20260919:B': { rows: [tick(103000, 10)], source: 'history' } };
  const audit = dataExportBlankAudit(pairs, items, daily(20260919, 1000, 10000));

  check('ابزار/روزِ دارای داده هم حالا بازبینی می‌شود', audit.length === 1);
  check('و حکمش «ناقص» است، نه «داده آمد»', audit[0].verdict === 'partial');
  check('شمارِ جامانده گفته می‌شود', audit[0].tradeGap === 999);
  check('و حجمِ جامانده هم', audit[0].volumeGap === 9990);
  check('عددِ خودِ نوار هم در ردیف هست، نه فقط عددِ تابلو',
    audit[0].tapeTrades === 1 && audit[0].tapeVolume === 10);

  const rows = dataExportCoverageRows(instruments, pairs, items, audit);
  check('برگ پوشش «داده آمد» نمی‌نویسد', rows[0].status !== 'داده آمد');
  check('و صریح «ناقص» می‌گوید', rows[0].status === EMPTY_STATUS.partial);

  const summary = blankAuditSummary(audit);
  check('جمع‌بندی ناقص را جدا می‌شمارد', summary.partial === 1 && summary.matched === 0);
  check('و بدترین پاسخِ ناقص را نام می‌برد',
    summary.worstPartial && summary.worstPartial.volumeGap === 9990);
}

group('۲۷۸. هفت حکم، و مرزهایشان');
{
  // تطبیقِ کامل: همان نمونهٔ واقعیِ اهرم در ۲۰۲۶۰۹۱۹ (معیار پذیرشِ ۳).
  const full = dataExportBlankAudit(
    [pair(20260919)],
    { '20260919:B': { rows: [tick(90105, 73305224)], source: 'history' } },
    daily(20260919, 1, 73305224),
  );
  check('حجم و شمارِ برابر یعنی «تطبیق‌شده»', full[0].verdict === 'matched');

  // ═══ معاملهٔ باطل، و چرا حجم معیارِ اول است ═══
  //
  // بالادست برای ردیفِ باطل حجم صفر می‌فرستد و ما نمی‌دانیم تابلو آن را
  // شمرده یا نه. وقتی حجم دقیقاً می‌خواند، اختلافِ شمار تا اندازهٔ همان
  // ردیف‌ها توضیح دارد.
  const canceled = dataExportBlankAudit(
    [pair(20260919)],
    { '20260919:B': { rows: [tick(90000, 500), tick(90001, 0, 1000, true)], source: 'history' } },
    daily(20260919, 2, 500),
  );
  check('اختلافِ شمار به اندازهٔ ردیفِ باطل، «تطبیق‌شده» می‌ماند',
    canceled[0].verdict === 'matched' && canceled[0].tapeCanceled === 1);
  check('ولی اختلافِ بیشتر از باطل‌ها توضیح ندارد',
    coverageVerdict({ daily: true, dailyTrades: 5, dailyVolume: 500,
      tapeTrades: 1, tapeCanceled: 1, tapeVolume: 500 }) === 'partial');
  check('و اختلافِ حجم به‌تنهایی هم «ناقص» است',
    coverageVerdict({ daily: true, dailyTrades: 1, dailyVolume: 900,
      tapeTrades: 1, tapeCanceled: 0, tapeVolume: 500 }) === 'partial');

  // حکم‌های قدیمی نباید عوض شده باشند.
  const empties = dataExportBlankAudit(
    [pair(20241225), pair(20241226), pair(20241227)],
    {
      '20241225:B': { rows: [], source: 'history' },
      '20241226:B': { rows: [], source: 'history' },
      '20241227:B': { rows: [], source: 'history' },
    },
    { B: { rows: [{ date: 20241225, trades: 30540, vol: 9 }, { date: 20241226, trades: 0, vol: 0 }] } },
  );
  check('خالیِ تکذیب‌شده هنوز «نیامد» است', empties[0].verdict === 'missing');
  check('خالیِ تأییدشده هنوز «بی‌معامله» است', empties[1].verdict === 'quiet');
  check('خالیِ بی‌تابلو هنوز «نامعلوم» است', empties[2].verdict === 'unknown');

  // تضاد: نوار داده دارد و تابلو صفر می‌گوید. این هیچ‌کدام از آن سه نیست.
  check('نوارِ پرداده در برابر تابلوی صفر، «تضاد» است',
    coverageVerdict({ daily: true, dailyTrades: 0, dailyVolume: 0,
      tapeTrades: 3, tapeVolume: 30 }) === 'surplus');

  // ═══ جلسه‌ای که تمام نشده ═══
  //
  // تابلوی روزانهٔ روزِ جاری لحظه‌ای است و نوار هنوز پر می‌شود؛ «ناقص»
  // خواندنش ادعای غلط است.
  const openDay = dataExportBlankAudit(
    [pair(20260920)],
    { '20260920:B': { rows: [tick(100000, 10)], source: 'live' } },
    daily(20260920, 1000, 10000),
    [20260920],
  );
  check('روزِ جلسهٔ باز «ناقص» خوانده نمی‌شود', openDay[0].verdict === 'open');
  check('و همان روز با جلسهٔ بسته، دوباره سنجیده می‌شود',
    dataExportBlankAudit([pair(20260920)],
      { '20260920:B': { rows: [tick(100000, 10)], source: 'live' } },
      daily(20260920, 1000, 10000), [])[0].verdict === 'partial');

  check('هر هفت حکم برچسب فارسی دارند',
    ['matched', 'partial', 'missing', 'quiet', 'surplus', 'open', 'unknown']
      .every((verdict) => Boolean(BLANK_VERDICT_LABEL[verdict])));
  check('و هر هفت‌تا وضعیتِ برگ پوشش دارند',
    ['matched', 'partial', 'missing', 'quiet', 'surplus', 'open', 'unknown']
      .every((verdict) => Boolean(EMPTY_STATUS[verdict])));
  // حکمی که بازبینی نداده، «کامل» نیست.
  check('دادهٔ بی‌حکم «تأییدنشده» است', coverageStatusOf('', true) === 'داده آمد، تأییدنشده');
  check('و خالیِ بی‌حکم «تأییدنشده»', coverageStatusOf('', false) === EMPTY_STATUS.unknown);
}

group('۲۷۸. مصرف در تب و فایل');
{
  const tab = readSrc('../ui/tabs/data-export.mjs');
  // پاسخِ بریده یک دریافتِ شکست‌خورده است، فقط با ظاهرِ موفق.
  check('ناقص هم مثل نیامده یک دورِ بی‌کش می‌گیرد',
    tab.includes("row.verdict === 'missing' || row.verdict === 'partial'"));
  check('جملهٔ وضعیت ناقص را نام می‌برد',
    tab.includes('blanks.partial') && tab.includes('پاسخِ بریده، نه بازارِ کم‌معامله'));
  check('و ناقص جمله را هشداری می‌کند', tab.includes('blanks.partial > 0'));
  check('روزِ جلسهٔ باز به بازبینی داده می‌شود',
    tab.includes("String(resolved.payload?.market?.phase || '') === 'open'")
      && tab.includes('dataExportBlankAudit(pairs, items, dailyByIns, openDates)'));

  const book = readSrc('../ui/data-export-workbook.mjs');
  check('برگ راهنما هر هفت شمار را می‌نویسد',
    book.includes('blanks.matched') && book.includes('blanks.partial')
      && book.includes('blanks.surplus') && book.includes('blanks.open'));
  check('و معیارِ کامل‌بودن را صریح می‌گوید', book.includes("['معیار کامل‌بودن'"));
  // شمارشِ «خالی» نباید از متنِ وضعیت بیاید، وگرنه ناقص خالی شمرده می‌شود.
  check('شمارِ خالی از شکلِ پاسخ می‌آید نه از برچسب',
    book.includes('coverage.filter((row) => row.rows === 0)'));
}
