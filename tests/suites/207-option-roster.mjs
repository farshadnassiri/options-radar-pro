// ۲۰۷. دفتر قراردادهای تاریخی — قرارداد منقضی هم دیده شود

import { check, group } from '../harness.mjs';
import {
  ROSTER_VERSION, SIDE_CALL, SIDE_PUT, SIDE_TABAEE,
  STATUS_ACTIVE, STATUS_EXPIRED, STATUS_PENDING,
  compactOf, contractSide, contractStatus, daysApart, expandJalaliYear, expiryLabel,
  makeRosterFile, mergeRoster, normalizeFa, parseContractName, parseExpiry, pickUniverseSource,
  rangeSummary, rosterAt, rosterChainRows, rosterCoverage, rosterInRange,
  rosterIntake, rosterNote, rosterRow, statusLabel,
} from '../../core/option-roster.mjs';

group('۲۰۷-الف. خواندن نام قرارداد');
{
  check('نسخهٔ ساختار اعلام شده', ROSTER_VERSION === 1);

  // ── سمت، از نام و نماد ──────────────────────────────────────────────
  check('«اختیارخ» کال است', contractSide('اختیارخ ذوب-260-1405/06/18', 'ضذوب6009') === SIDE_CALL);
  check('«اختیارف» پوت است', contractSide('اختیارف اطلس-45000-14030702', 'طاطلس706') === SIDE_PUT);
  check('«اختیارف ت» تبعی است، نه پوت عادی',
    contractSide('اختیارف ت کگل-2440-06/01/08', 'هکگل601') === SIDE_TABAEE);
  check('نماد تنها هم کافی است وقتی نام سمت را نگفته',
    contractSide('اختیار روی چیزی', 'ضخودرو1') === SIDE_CALL);

  // ── سی‌ودو صندوقی که اسکریپت اولیه اختیار حسابشان کرده بود ──────────
  //
  // «طلا»، «ضمان» و «طعام» با «ط» و «ض» شروع می‌شوند و هیچ‌کدام قرارداد
  // نیستند. تشخیص بر پایهٔ حرف اولِ نماد، این سی‌ودو ردیف را وارد فهرست
  // اختیارها می‌کرد. نام حرفِ اول را می‌زند.
  check('صندوق کالای پارسیان، با نماد «طلا»، قرارداد نیست',
    contractSide('صندوق س. کالای پارسیان', 'طلا') === null);
  check('صندوق تضمین کاریزما، با نماد «ضمان»، قرارداد نیست',
    contractSide('صندوق تضمین ا.سرمایه کاریزما-م', 'ضمان') === null);
  check('مرابحهٔ طبیعت سبز قرارداد نیست', contractSide('مرابحه طبیعت سبز-کارون060710', 'طبیعت064') === null);
  check('نامِ خالی یعنی نامعلوم، نه کال', contractSide('', 'ضچیزی') === null);

  // ── سررسید، هر چهار شکلی که در دادهٔ واقعی هست ───────────────────────
  check('سال کامل با ممیز', parseExpiry('اختیارخ ذوب-260-1405/06/18') === 20260909, String(parseExpiry('اختیارخ ذوب-260-1405/06/18')));
  check('سال کامل فشرده', parseExpiry('اختیارخ فرابورس-4400-14050726') === parseExpiry('اختیارخ فرابورس-4400-1405/07/26'));
  // این دو شکل را اسکریپت اولیه نمی‌خواند و ۴۲۲ قرارداد از قلم افتاده بود.
  check('سال دورقمی با ممیز خوانده می‌شود',
    parseExpiry('اختیارخ هم تراز-24000-05/08/06') === parseExpiry('اختیارخ هم تراز-24000-1405/08/06'));
  check('سال یک‌رقمی خوانده می‌شود',
    parseExpiry('اختیارف ت کگل-2440-6/01/08') === parseExpiry('اختیارف ت کگل-2440-1406/01/08'));
  check('تاریخِ نبودن، صفر می‌دهد نه امروز', parseExpiry('اختیارخ چیزی بدون تاریخ') === 0);
  check('سال دورقمیِ نود به بالا، ۱۳۹x است', expandJalaliYear(95) === 1395 && expandJalaliYear(5) === 1405);
  check('سال سه‌رقمی نامعتبر است', expandJalaliYear(105) === 0);
  check('ماه سیزده تاریخ نمی‌سازد', parseExpiry('چیزی-100-1405/13/01') === 0);

  // ── تجزیهٔ کامل ─────────────────────────────────────────────────────
  const one = parseContractName('اختیارخ ذوب-260-1405/06/18');
  check('پایه، اعمال و سررسید با هم درمی‌آیند',
    one?.base === 'ذوب' && one?.strike === 260 && one?.expiry === 20260909, JSON.stringify(one));
  check('قیمت اعمال با جداکنندهٔ هزارگان هم خوانده می‌شود',
    parseContractName('اختیارخ اهرم-42,000-1404/04/08')?.strike === 42000);
  check('رقم فارسی هم خوانده می‌شود',
    parseContractName('اختیارخ اهرم-۴۲۰۰۰-۱۴۰۴/۰۴/۰۸')?.strike === 42000);

  // ── نامِ بریده: هیچ عددی حدس زده نمی‌شود ────────────────────────────
  //
  // TSETMC نام را حدود سی نویسه می‌برد و خطِ فاصلهٔ بین پایه و اعمال گم
  // می‌شود. آنجا نمی‌شود گفت «کیمیاتک۲۱۰۲۵» یعنی کدام پایه و کدام اعمال.
  check('نامِ بریده رد می‌شود، نه حدس', parseContractName('اختیارف ت کیمیاتک21025-6/10/27') === null);
  check('نام بدون قیمت اعمال رد می‌شود', parseContractName('اختیارخ ذوب-1405/06/18') === null);
  check('برچسب جلالی از تاریخ میلادی درمی‌آید', expiryLabel(20260909) === '1405/06/18', expiryLabel(20260909));
  check('برچسب تاریخِ نداشته «—» است، نه صفر', expiryLabel(0) === '—');
}

group('۲۰۷-ب. ردیف دفتر و ادغام');
{
  const raw = {
    InsCode: '59853138153110622', Symbol: 'ضذوب6009', Name: 'اختیارخ ذوب-260-1405/06/18',
    FirstSeenGregorian: '2026-06-30', LastSeenGregorian: '2026-08-29', InstrumentID: 'IRO9ZOBI8641',
  };
  const row = rosterRow(raw);
  check('ردیف خام کامل خوانده می‌شود',
    row?.ins === '59853138153110622' && row.side === SIDE_CALL && row.strike === 260
    && row.expiry === 20260909 && row.first === 20260630 && row.last === 20260829, JSON.stringify(row));
  check('کد ابزارِ غیرعددی رد می‌شود', rosterRow({ ...raw, InsCode: 'abc' }) === null);
  check('بدون تاریخ دیده‌شدن، ردیف ساخته نمی‌شود', rosterRow({ ...raw, FirstSeenGregorian: '' }) === null);
  check('تاریخ با خط تیره و بی‌خط تیره یکی است', compactOf('2026-06-30') === compactOf('20260630'));
  check('تاریخِ بدشکل صفر می‌دهد، نه امروز', compactOf('2026-6-3') === 0 && compactOf('') === 0);
  check('ماه سیزدهِ میلادی رد می‌شود', compactOf('20261330') === 0);

  // ── شمارشِ آنچه نیامد ───────────────────────────────────────────────
  const take = rosterIntake([
    raw,
    { InsCode: '1', Symbol: 'طلا', Name: 'صندوق س. کالای پارسیان', FirstSeenGregorian: '2025-01-01', LastSeenGregorian: '2025-01-01' },
    { InsCode: '2', Symbol: 'هکیمی610', Name: 'اختیارف ت کیمیاتک21025-6/10/27', FirstSeenGregorian: '2025-01-01', LastSeenGregorian: '2025-01-01' },
  ]);
  check('پذیرفته، غیر-اختیار و ناخوانا جدا شمرده می‌شوند',
    take.kept === 1 && take.notOption === 1 && take.unparsed === 1, JSON.stringify({ k: take.kept, n: take.notOption, u: take.unparsed }));
  check('نمونهٔ ناخوانا برای دیدن نگه داشته می‌شود', take.skipped[0]?.symbol === 'هکیمی610');

  // ── ادغام عمر را پهن می‌کند، جایگزین نمی‌کند ─────────────────────────
  //
  // اسکنِ ماهِ آخر نباید «از کِی دیده شد» را به ماه آخر عقب بکشد؛ آن‌وقت
  // قرارداد در تاریخ‌های قبل «هنوز گشایش نشده» می‌شد.
  const older = { ins: 'X', symbol: '', name: '', side: SIDE_CALL, base: 'الف', strike: 100, expiry: 20250601, first: 20250101, last: 20250201 };
  const newer = { ins: 'X', symbol: 'ضالف', name: 'اختیارخ الف-100-1404/03/11', side: SIDE_CALL, base: 'الف', strike: 100, expiry: 20250601, first: 20250401, last: 20250520 };
  const merged = mergeRoster([older], [newer]);
  check('ادغام یک ردیف می‌ماند', merged.length === 1);
  check('اولین دید عقب نمی‌رود و آخرین دید جلو می‌آید',
    merged[0].first === 20250101 && merged[0].last === 20250520, JSON.stringify(merged[0]));
  check('متادیتای خالی جای پرشده را نمی‌گیرد', merged[0].symbol === 'ضالف');
  check('ادغام دو دفتر مستقل، جمعشان می‌شود',
    mergeRoster([older], [{ ...older, ins: 'Y' }]).length === 2);

  const file = makeRosterFile([older, newer], { scannedFrom: 20250101, scannedTo: 20250520, at: 7 });
  check('پروندهٔ دفتر نسخه، شمار و بازهٔ اسکن دارد',
    file.version === 1 && file.count === 1 && file.scannedFrom === 20250101 && file.at === 7);
}

group('۲۰۷-ج. سررسید یک مرزِ متحرک است، نه پرچم ثابت');
{
  // خواستهٔ چهارم صاحب پروژه: «اپشنی که هفته پیش منقضی شده در محاسبات
  // امروز نمیاد ولی اگه در بازه انتخابی دو هفته پیش تا امروز باشه در
  // قسمتی از آن میاد و در قسمتی نمیاد.»
  const row = { ins: 'A', side: SIDE_CALL, base: 'اهرم', strike: 1000, expiry: 20250601, first: 20250301, last: 20250601 };

  check('پیش از گشایش، «هنوز گشایش نشده»', contractStatus(row, 20250201) === STATUS_PENDING);
  check('روز گشایش، فعال', contractStatus(row, 20250301) === STATUS_ACTIVE);
  check('روز سررسید هنوز فعال است — آن روز معامله دارد', contractStatus(row, 20250601) === STATUS_ACTIVE);
  check('فردای سررسید، منقضی', contractStatus(row, 20250602) === STATUS_EXPIRED);
  check('همان قرارداد امروز منقضی است', contractStatus(row, 20260829) === STATUS_EXPIRED);
  check('بدون تاریخ، وضعیت معنا ندارد و «نمی‌دانیم» می‌دهد',
    contractStatus(row, 0) === null && contractStatus({ ...row, expiry: 0 }, 20250401) === null);
  check('«نمی‌دانیم» با «منقضی» یکی نیست', statusLabel(null) === 'نامعلوم' && statusLabel(STATUS_EXPIRED) === 'منقضی');
  check('برچسب هر سه وضعیت هست',
    statusLabel(STATUS_ACTIVE) === 'فعال' && statusLabel(STATUS_PENDING) === 'هنوز گشایش نشده');

  // ── فهرست یک روز ────────────────────────────────────────────────────
  const rows = [
    row,
    { ins: 'B', side: SIDE_PUT, base: 'اهرم', strike: 1000, expiry: 20250601, first: 20250301, last: 20250601 },
    { ins: 'C', side: SIDE_CALL, base: 'خودرو', strike: 200, expiry: 20250901, first: 20250501, last: 20250901 },
  ];
  check('فهرست ۱۴۰۴/۰۲/۱۲ هر سه را دارد', rosterAt(rows, 20250502).length === 3);
  check('فهرست پس از سررسید دوتای اول، فقط یکی دارد', rosterAt(rows, 20250701).length === 1);
  check('تاریخ نامعتبر فهرست خالی می‌دهد، نه همه', rosterAt(rows, 0).length === 0);

  // ── بازه: هرکس در کدام تکه زنده بود ─────────────────────────────────
  const span = rosterInRange(rows, 20250401, 20250801);
  check('هر سه در بازه زنده بوده‌اند', span.length === 3);
  const a = span.find((r) => r.ins === 'A');
  check('قراردادی که وسط بازه سررسید شد، تا همان‌جا زنده است',
    a.activeFrom === 20250401 && a.activeTo === 20250601, JSON.stringify([a.activeFrom, a.activeTo]));
  check('و «داخل بازه سررسید شد» نشان‌دار است', a.expiresInside === true && a.statusAtEnd === STATUS_EXPIRED);
  const c = span.find((r) => r.ins === 'C');
  check('قراردادی که بعد از بازه سررسید می‌شود، تا انتهای بازه زنده است',
    c.activeTo === 20250801 && c.expiresInside === false && c.statusAtEnd === STATUS_ACTIVE);
  check('و گشایشش داخل بازه بوده', c.listedInside === true && c.wholeRange === false);
  check('قرارداد بیرون از بازه اصلاً نمی‌آید', rosterInRange(rows, 20250701, 20250801).length === 1);
  check('بازهٔ وارونه خالی می‌دهد', rosterInRange(rows, 20250801, 20250401).length === 0);

  const sum = rangeSummary(rows, 20250401, 20250801);
  check('خلاصهٔ بازه سه عدد سازگار دارد',
    sum.total === 3 && sum.expiredInside === 2 && sum.activeAtEnd === 1, JSON.stringify(sum));
  check('و شمار نماد پایه را هم می‌دهد', sum.bases === 2);
}

group('۲۰۷-د. زنجیره از دفتر — بدون قیمت، با برچسب');
{
  const rows = [
    { ins: 'c1', symbol: 'ضاهرم1', name: 'اختیارخ اهرم-1000-1404/03/11', side: SIDE_CALL, base: 'اهرم', strike: 1000, expiry: 20250601, first: 20250301, last: 20250601 },
    { ins: 'p1', symbol: 'طاهرم1', name: 'اختیارف اهرم-1000-1404/03/11', side: SIDE_PUT, base: 'اهرم', strike: 1000, expiry: 20250601, first: 20250301, last: 20250601 },
    { ins: 'c2', symbol: 'ضاهرم2', name: 'اختیارخ اهرم-2000-1404/03/11', side: SIDE_CALL, base: 'اهرم', strike: 2000, expiry: 20250601, first: 20250301, last: 20250601 },
    { ins: 't1', symbol: 'هاهرم3', name: 'اختیارف ت اهرم-3000-1404/03/11', side: SIDE_TABAEE, base: 'اهرم', strike: 3000, expiry: 20250601, first: 20250301, last: 20250601 },
  ];
  const chain = rosterChainRows(rows, { baseIndex: new Map([['اهرم', '900001']]), at: 20250401 });
  check('کال و پوتِ هم‌قیمت یک ردیف می‌شوند', chain.length === 2, String(chain.length));
  const pair = chain.find((r) => r.strikePrice === 1000);
  check('هر دو کد در همان ردیف نشسته‌اند', pair.insCode_C === 'c1' && pair.insCode_P === 'p1');
  // تبعی را ناشر می‌فروشد و در زنجیرهٔ عادی بازار نیست. اگر راه می‌یافت،
  // روی قیمت اعمالِ خودش یک ردیفِ کاملاً تهی می‌ساخت — ردیفی که نه کال
  // دارد نه پوت، و در هر شمارشی به‌عنوان «یک قرارداد» شمرده می‌شود.
  check('تبعی وارد زنجیرهٔ عادی نمی‌شود',
    !chain.some((r) => r.strikePrice === 3000 || r.insCode_C === 't1' || r.insCode_P === 't1'),
    JSON.stringify(chain.map((r) => r.strikePrice)));
  check('کال بی‌جفت، ردیفِ بی‌پوت می‌سازد',
    chain.find((r) => r.strikePrice === 2000).insCode_P === '');
  check('کد نماد پایه از نگاشت درمی‌آید', pair.uaInsCode === '900001' && pair.baseKnown === true);
  check('پایهٔ ناشناخته کدِ ساختگی نمی‌گیرد',
    rosterChainRows(rows, { baseIndex: new Map(), at: 20250401 })[0].baseKnown === false);
  check('سررسید به شکل جلالیِ تابلو برمی‌گردد', pair.endDate === 14040311, String(pair.endDate));
  check('روز مانده از همان تاریخ حساب می‌شود', pair.remainedDay === daysApart(20250401, 20250601));

  // ── قیمت، هرگز ───────────────────────────────────────────────────────
  //
  // همان قاعدهٔ بایگانی: دفتر برای «کدام قرارداد بود» است، نه «چند بود».
  // اگر عددی می‌گذاشتیم، روزی یکی رویش حساب می‌کرد.
  const priceKeys = Object.keys(pair).filter((k) => /^p(DrCotVal|Closing|MeDem|MeOf)|^priceYesterday|^q(TotTran|TotCap|TitMe)|^zTotTran|^oP_/.test(k));
  check('همهٔ میدان‌های قیمتی صفرند', priceKeys.length >= 20 && priceKeys.every((k) => pair[k] === 0), `${priceKeys.length} میدان`);
  check('اندازهٔ قرارداد ساخته نمی‌شود، صفر می‌ماند', pair.contractSize === 0);
  check('ردیف نشان‌دار است که از دفتر آمده', pair.fromRoster === true);
  check('ترتیب بر سررسید و بعد قیمت اعمال است', chain[0].strikePrice <= chain[1].strikePrice);
}

group('۲۰۷-و. کدام منبع جواب می‌دهد');
{
  const cov = { count: 100, from: 20250101, to: 20260101 };

  check('بایگانی همیشه مقدم است — عکس واقعی و بااندازه',
    pickUniverseSource({ hasArchive: true, coverage: cov, wanted: 20250601 }).source === 'archive');
  check('بی‌بایگانی، دفترِ پوشش‌دار جواب می‌دهد',
    pickUniverseSource({ hasArchive: false, coverage: cov, wanted: 20250601 }).source === 'roster');
  check('بیرونِ پوشش دفتر، فهرست امروز می‌نشیند',
    pickUniverseSource({ hasArchive: false, coverage: cov, wanted: 20240101 }).source === 'board');
  check('بی‌دفتر هم فهرست امروز',
    pickUniverseSource({ hasArchive: false, coverage: { count: 0 }, wanted: 20250601 }).source === 'board');

  // ── سوگیری بقا فقط یک‌جاست، و برچسبش هم همان‌جاست ───────────────────
  //
  // اگر دفتر «سوگیری‌دار» علامت می‌خورد، کاربر به فهرستِ درست هم شک
  // می‌کرد؛ و اگر تابلو بی‌علامت می‌ماند، فهرستِ ناقص را کامل می‌پنداشت.
  check('بایگانی و دفتر سوگیری بقا ندارند',
    pickUniverseSource({ hasArchive: true, wanted: 20250601 }).survivalBias === false
    && pickUniverseSource({ hasArchive: false, coverage: cov, wanted: 20250601 }).survivalBias === false);
  check('فهرست امروز، سوگیری بقا دارد و می‌گوید',
    pickUniverseSource({ hasArchive: false, coverage: cov, wanted: 20240101 }).survivalBias === true);
  check('هر انتخاب دلیلِ خواندنی دارد',
    ['archive', 'roster', 'board'].every((want) => {
      const plan = want === 'archive'
        ? pickUniverseSource({ hasArchive: true, wanted: 20250601 })
        : want === 'roster'
          ? pickUniverseSource({ coverage: cov, wanted: 20250601 })
          : pickUniverseSource({ coverage: cov, wanted: 20240101 });
      return plan.source === want && plan.reason.length > 20;
    }));
  check('مرزهای پوشش، تو هستند',
    pickUniverseSource({ coverage: cov, wanted: 20250101 }).source === 'roster'
    && pickUniverseSource({ coverage: cov, wanted: 20260101 }).source === 'roster'
    && pickUniverseSource({ coverage: cov, wanted: 20251231 }).source === 'roster');
  check('تاریخِ نداشته، دفتر را انتخاب نمی‌کند',
    pickUniverseSource({ coverage: cov, wanted: 0 }).source === 'board');
}

group('۲۰۷-ه. پوشش و جملهٔ صداقت');
{
  const rows = [
    { ins: 'A', side: SIDE_CALL, base: 'اهرم', strike: 1, expiry: 20250601, first: 20250101, last: 20250601 },
    { ins: 'B', side: SIDE_PUT, base: 'خودرو', strike: 2, expiry: 20250901, first: 20250301, last: 20250901 },
  ];
  const cov = rosterCoverage(rows);
  check('پوشش از اولین و آخرین دید درمی‌آید',
    cov.count === 2 && cov.from === 20250101 && cov.to === 20250901 && cov.bases === 2, JSON.stringify(cov));
  check('دفتر خالی، پوششِ صفر می‌دهد نه خطا', rosterCoverage([]).count === 0);

  check('دفترِ نساخته صریح گفته می‌شود',
    /ساخته نشده/.test(rosterNote({ coverage: rosterCoverage([]) })));
  // حالت خطرناک: بازه بیرون پوشش است و اگر بی‌صدا بماند، کاربر فهرست را
  // کامل می‌پندارد در حالی که نیمهٔ گمشده‌اش همان سررسیدشده‌هاست.
  check('بازهٔ پیش از پوشش، سوگیری بقا را اعلام می‌کند',
    /سوگیری بقا/.test(rosterNote({ coverage: cov, from: 20240101, to: 20250601 })));
  check('بازهٔ پس از پوشش، «هنوز اسکن نشده» می‌گوید',
    /اسکن نشده/.test(rosterNote({ coverage: cov, from: 20250201, to: 20260101 })));
  const inside = rosterNote({ coverage: cov, from: 20250201, to: 20250801, summary: rangeSummary(rows, 20250201, 20250801) });
  check('بازهٔ داخل پوشش، شمار سررسیدشده را می‌گوید',
    /داخل پوشش/.test(inside) && /سررسید شده/.test(inside), inside);
  check('یکسان‌سازی «ي» عربی و «ی» فارسی', normalizeFa('اختيار') === 'اختیار');
}
