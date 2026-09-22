// ۲۹۰. سه یافتهٔ اولین خروجیِ واقعاً کاملِ یک هفته (R5-11)
//
// ═══ فایلی که این دسته را ساخت ═══
//
// ۲۰۲۶۰۹۱۵ تا ۲۰۲۶۰۹۲۲، ۴۹۶ ابزار/روز، ۶۲۱٬۷۸۰ ریزمعامله. برای اولین
// بار: **نیامد صفر · سهمیه صفر · خطا صفر · هیچ شکافی در زمان**. کلِ
// هفته داخلِ سهمیه جا شد.
//
// ولی سه برچسب غلط بود، و هر سه از جنسِ «فایل چیزی می‌گوید که نیست».

import { check, group, readSrc } from '../harness.mjs';
import { tapeMatchesDaily, tapeMetrics } from '../../core/tape-choice.mjs';
import {
  coverageStatusOf, coverageVerdict, dataExportBlankAudit, EMPTY_STATUS,
} from '../../core/data-export.mjs';

group('۲۹۰. R5-11 — تابلو معاملهٔ باطل را هم می‌شمارد');
{
  // ═══ اندازه‌گیریِ قطعی، از خودِ فایل ═══
  //
  // شش ابزار/روز «ناقص» خوانده شدند. برای پنج‌تایشان کسریِ ادعاشده
  // **دقیقاً** برابرِ حجمِ ردیف‌های باطلِ همان روز بود:
  //
  //     ضهرم6045  ۲ = ۲    ضهرم6046  ۶ = ۶    ضهرم6050  ۱۹۸ = ۱۹۸
  //     طهرم7063 ۵۱ = ۵۱   ضهرم7064  ۵ = ۵
  //
  // یعنی `qTotTran5J` حجمِ باطل‌ها را در خود دارد و ما (درست) بیرونش
  // می‌گذاریم. اختلاف واقعی نبود.
  const rows = (ok, cancelledQty = []) => [
    ...Array.from({ length: ok }, () => ({ quantity: 1, canceled: false })),
    ...cancelledQty.map((q) => ({ quantity: q, canceled: true })),
  ];

  const m = tapeMetrics(rows(1101, [2]));
  check('حجمِ باطل‌ها جدا شمرده می‌شود', m.canceledVolume === 2);
  check('و در جمعِ حجم نمی‌نشیند', m.volume === 1101);
  check('شمارِ باطل هم سرِ جایش است', m.canceled === 1 && m.trades === 1101);

  // تابلو: ۱۱۰۲ معامله و ۱۱۰۳ حجم — یکی بیشتر، چون باطل را شمرده.
  check('تابلویی که باطل را شمرده، تطبیق می‌کند',
    tapeMatchesDaily(m, { known: true, quiet: false, trades: 1102, volume: 1103 }));
  check('و تابلوی دقیقاً برابر هم',
    tapeMatchesDaily(m, { known: true, quiet: false, trades: 1101, volume: 1101 }));

  // ═══ ولی کران شکستنی نیست ═══
  check('بیشتر از حجمِ باطل‌ها، هنوز «ناقص» است',
    !tapeMatchesDaily(m, { known: true, quiet: false, trades: 1102, volume: 1104 }));
  check('و تابلوی کمتر از ما تطبیق نیست — آن تضاد است',
    !tapeMatchesDaily(m, { known: true, quiet: false, trades: 1101, volume: 1100 }));
  check('اختلافِ شمار هم از تعدادِ باطل‌ها بیشتر نمی‌شود',
    !tapeMatchesDaily(m, { known: true, quiet: false, trades: 1104, volume: 1103 }));

  // نوارِ بی‌باطل همان قاعدهٔ سخت‌گیرانهٔ قبلی را دارد.
  const clean = tapeMetrics(rows(500));
  check('نوارِ بی‌باطل هیچ رواداریِ حجمی نمی‌گیرد',
    tapeMatchesDaily(clean, { known: true, quiet: false, trades: 500, volume: 500 })
      && !tapeMatchesDaily(clean, { known: true, quiet: false, trades: 500, volume: 501 }));
}

group('۲۹۰. R5-11 — «خالی» برای ردیفی که داده دارد');
{
  // `unknown` کلیدِ معتبرِ `EMPTY_STATUS` بود، پس شرطِ اول می‌گرفتش و
  // برچسبِ «**خالی**، تأییدنشده» می‌نشست حتی با هزاران ردیف. در فایلِ
  // واقعی ۶۸ ابزار/روز چنین شدند.
  check('بی مرجع ولی دارای داده، «داده آمد» است',
    coverageStatusOf('unknown', true) === 'داده آمد، تأییدنشده');
  check('و بی مرجع و بی داده، «خالی» می‌ماند',
    coverageStatusOf('unknown', false) === EMPTY_STATUS.unknown);
  check('بی هیچ حکمی هم همین‌طور',
    coverageStatusOf('', true) === 'داده آمد، تأییدنشده'
      && coverageStatusOf('', false) === EMPTY_STATUS.unknown);
  check('و حکم‌های دیگر دست‌نخورده‌اند',
    coverageStatusOf('matched', true) === EMPTY_STATUS.matched
      && coverageStatusOf('missing', false) === EMPTY_STATUS.missing);
}

group('۲۹۰. R5-11 — روزِ نوارِ زنده تابلوی نهایی ندارد');
{
  // تابلوی روزِ جاری تا تسویه نهایی نمی‌شود. تا امروز این فقط وقتی
  // فهمیده می‌شد که فازِ بازار `open` باشد؛ کسی که پس از بسته‌شدن خروجی
  // می‌گرفت همان روز را «نامعلوم» می‌دید — در فایلِ واقعی هر ۸۵ ابزار/روزِ
  // امروز.
  const pairs = [{ key: '20260922:A', ins: 'A', date: 20260922 }];
  const tape = (k) => Array.from({ length: k }, () => ({ quantity: 1, canceled: false }));

  const live = dataExportBlankAudit(pairs,
    { '20260922:A': { rows: tape(68), source: 'live' } }, {}, []);
  check('روزِ نوارِ زنده بی تابلو «روزِ جاری» می‌شود، نه «نامعلوم»',
    live[0].verdict === 'open');
  check('و برچسبش تابلوی نهایی‌نشده را می‌گوید',
    EMPTY_STATUS.open.includes('نهایی نشده'));

  // ولی اگر تابلوی همان روز **در دست باشد**، سنجیده می‌شود.
  const settled = dataExportBlankAudit(pairs,
    { '20260922:A': { rows: tape(68), source: 'live' } },
    { A: { rows: [{ date: 20260922, trades: 68, vol: 68 }] } }, []);
  check('تابلوی در دست، روزِ زنده را هم سنجیدنی می‌کند',
    settled[0].verdict === 'matched');

  // و روزِ تاریخیِ بی‌تابلو همچنان «نامعلوم» است — این تغییر فقط مالِ
  // نوارِ زنده است.
  const hist = dataExportBlankAudit([{ key: '20260919:A', ins: 'A', date: 20260919 }],
    { '20260919:A': { rows: tape(10), source: 'history' } }, {}, []);
  check('روزِ تاریخیِ بی‌تابلو همچنان «نامعلوم» است', hist[0].verdict === 'unknown');
}

group('۲۹۰. R5-12 — یک قاعده، و این‌بار در هر دو جا');
{
  // ═══ چرا این دسته لازم شد ═══
  //
  // `tapeMatchesDaily` رواداریِ حجمِ باطل‌ها را گرفت، ولی `coverageVerdict`
  // نگرفت — دو پیاده‌سازی از یک مفهوم. نتیجه در خروجیِ واقعی: سرور شش
  // ابزار/روز را «کامل» می‌دانست و بازبینی همان‌ها را «ناقص» می‌خواند، و
  // پس از اصلاحِ اولی عدد ۶ تکان نخورد.
  //
  // درسش از قبل در `NEXT.md` بود: «عددی که در دو جا به دو راه حساب
  // می‌شود، آزمونی می‌خواهد که همان دو راه را کنار هم بگذارد.»
  const board = { daily: true, dailyTrades: 1102, dailyVolume: 1103 };
  const tape = { tapeTrades: 1101, tapeVolume: 1101, tapeCanceled: 1, tapeCanceledVolume: 2 };

  check('حکمِ بازبینی هم رواداریِ حجمِ باطل‌ها را دارد',
    coverageVerdict({ ...board, ...tape }) === 'matched');
  check('و بیشتر از آن همچنان «ناقص» است',
    coverageVerdict({ ...board, dailyVolume: 1104, ...tape }) === 'partial');
  check('و تابلوی کمتر از ما هنوز تطبیق نیست',
    coverageVerdict({ ...board, dailyVolume: 1100, ...tape }) !== 'matched');
  check('نوارِ بی‌باطل هیچ رواداری نمی‌گیرد',
    coverageVerdict({ daily: true, dailyTrades: 500, dailyVolume: 501,
      tapeTrades: 500, tapeVolume: 500, tapeCanceled: 0, tapeCanceledVolume: 0 }) === 'partial');

  // ═══ و کسریِ گزارش‌شده هم نباید باطل‌ها را «کم‌داشته» بنویسد ═══
  const pairs = [{ key: '20260915:A', ins: 'A', date: 20260915 }];
  const rows = [
    ...Array.from({ length: 1101 }, () => ({ quantity: 1, canceled: false })),
    { quantity: 2, canceled: true },
  ];
  const audit = dataExportBlankAudit(pairs, { '20260915:A': { rows, source: 'history' } },
    { A: { rows: [{ date: 20260915, trades: 1102, vol: 1103 }] } }, []);
  check('ابزار/روزِ دارای باطل «تطبیق‌شده» می‌شود', audit[0].verdict === 'matched');
  check('و کسریِ ساختگی گزارش نمی‌شود',
    audit[0].tradeGap === 0 && audit[0].volumeGap === 0);
  check('حجمِ باطل‌ها جدا حمل می‌شود', audit[0].tapeCanceledVolume === 2);

  // کسریِ واقعی همچنان گزارش می‌شود.
  const short = dataExportBlankAudit(pairs, { '20260915:A': { rows, source: 'history' } },
    { A: { rows: [{ date: 20260915, trades: 1200, vol: 1300 }] } }, []);
  check('کسریِ واقعی همچنان دیده می‌شود',
    short[0].verdict === 'partial' && short[0].volumeGap === 197);

  const tool = readSrc('../tools/verify-export.mjs');
  check('ابزارِ کنترل روزِ جاری را از مخرجِ پوشش بیرون می‌گذارد',
    tool.includes("const openDay = count('روزِ جاری')")
      && tool.includes('const judged = Math.max(0, total - openDay)'));
}
