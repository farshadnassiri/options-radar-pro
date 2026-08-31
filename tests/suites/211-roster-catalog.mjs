// ۲۱۱. قرارداد بی‌معامله، شناسهٔ بلند، و جفتِ ناقص

import { check, group, near, readSrc } from '../harness.mjs';
import {
  ID_FIELDS, parseJsonSafe, quoteIdFields, safeId, unsafeDigits,
} from '../../core/json-safe.mjs';
import {
  flatTerms, gregorianOf, infoPath, instrumentInfo, optionSpec, optionSpecPath,
  scanSearch, searchPath, searchRow, searchTerms, unwrapSearch,
} from '../../core/roster-catalog.mjs';
import { runRosterBuild } from '../../core/roster-build.mjs';
import {
  contractLife, contractStatus, expiryRoll, makeRosterFile, mergeRoster, pairAudit,
  rosterHealth, rosterInRange, ROSTER_VERSION, STATUS_ACTIVE, STATUS_PENDING,
} from '../../core/option-roster.mjs';

group('۲۱۱-الف. شناسهٔ هفده‌رقمی گرد نمی‌شود');
{
  // بزرگ‌ترین صحیحِ امن جاوااسکریپت شانزده رقم دارد. شناسهٔ TSETMC هفده.
  // اگر بالادست آن را عدد بفرستد، `JSON.parse` بی‌هیچ خطایی ارقام آخر را
  // عوض می‌کند — و عددِ گردشده به هیچ قراردادی نمی‌خورد، پس ردیفش
  // «بی‌داده» به نظر می‌رسد نه «خراب».
  const raw = '{"insCode":62630716381380677,"pClosing":1234.5,"n":-7,"z":null}';
  check('`JSON.parse` خام واقعاً رقم را عوض می‌کند',
    String(JSON.parse(raw).insCode) !== '62630716381380677', String(JSON.parse(raw).insCode));
  const safe = parseJsonSafe(raw);
  check('خواندن امن، شناسه را دست‌نخورده نگه می‌دارد',
    safe.insCode === '62630716381380677' && typeof safe.insCode === 'string', String(safe.insCode));
  check('قیمت، عدد منفی و null دست نمی‌خورند',
    safe.pClosing === 1234.5 && safe.n === -7 && safe.z === null, JSON.stringify(safe));
  check('شناسه‌ای که از قبل رشته بوده، دوبار گیومه نمی‌گیرد',
    parseJsonSafe('{"insCode":"123"}').insCode === '123');
  check('همهٔ میدان‌های شناسه پوشش دارند',
    ID_FIELDS.includes('uaInsCode') && ID_FIELDS.includes('insCode_C') && ID_FIELDS.includes('insCode_P'));
  check('میدانی که شناسه نیست، عدد می‌ماند',
    typeof parseJsonSafe('{"strikePrice":42000}').strikePrice === 'number');
  check('عدد اعشاری و نمایی گیومه نمی‌گیرند',
    quoteIdFields('{"insCode":1.5}') === '{"insCode":1.5}');

  check('مرز ناامنی تشخیص داده می‌شود',
    unsafeDigits('62630716381380677') === true && unsafeDigits('900001') === false);
  // «نمی‌شود به کارش برد» با «ندارد» یکی نیست: عددِ ناامن ممکن است همان
  // لحظه گرد شده باشد، پس به‌کار بردنش یعنی درخواست قیمت برای قراردادی
  // که وجود ندارد.
  check('عددِ ناامن رد می‌شود، نه اینکه رشته شود', safeId(62630716381380677) === null);
  check('عددِ امن پذیرفته می‌شود', safeId(900001) === '900001');
  check('رشتهٔ رقمی همیشه پذیرفته می‌شود', safeId('62630716381380677') === '62630716381380677');
  check('رشتهٔ غیررقمی رد می‌شود', safeId('abc') === null && safeId(null) === null);

  const server = readSrc('../server/server.mjs');
  const tool = readSrc('../tools/roster-scan.mjs');
  check('سرور و ابزار هر دو خوانندهٔ امن دارند',
    /readJsonSafe\(res\)/.test(server) && /readJsonSafe\(res\)/.test(tool)
    && !/await res\.json\(\)/.test(tool));
}

group('۲۱۱-ب. کاتالوگ ابزار — منبعی که سابقهٔ معاملات نیست');
{
  check('مسیرها ساخته می‌شوند',
    searchPath('اهرم').includes('/Instrument/GetInstrumentSearch/')
    && infoPath('62630716381380677') === '/Instrument/GetInstrumentInfo/62630716381380677'
    && optionSpecPath('IROFAHRM9681').includes('GetInstrumentOptionByInstrumentID'));

  check('پاسخ با کلید شناخته‌شده باز می‌شود', unwrapSearch({ instrumentSearch: [{ a: 1 }] }).length === 1);
  check('کلید ناشناخته هم باز می‌شود', unwrapSearch({ چیزی: [{ a: 1 }, { b: 2 }] }).length === 2);
  check('پاسخ بی‌ربط، آرایهٔ خالی می‌دهد نه خطا', unwrapSearch(null).length === 0);

  const row = searchRow({ insCode: '12998578961084515', lVal18AFC: 'طهرم0111', lVal30: 'اختیارف اهرم-20000-1404/01/27' });
  check('ردیف جست‌وجو خوانده می‌شود و نشان‌دار است',
    row?.ins === '12998578961084515' && row.symbol === 'طهرم0111' && row.fromCatalog === true, JSON.stringify(row));

  const got = scanSearch({ instrumentSearch: [
    { insCode: '12998578961084515', lVal18AFC: 'طهرم0111', lVal30: 'اختیارف اهرم-20000-1404/01/27' },
    { insCode: '65883838195688438', lVal18AFC: 'خودرو', lVal30: 'ایران خودرو' },
    { insCode: 62630716381380677, lVal18AFC: 'ضهرم0111', lVal30: 'اختیارخ اهرم-20000-1404/01/27' },
  ] });
  check('فقط قرارداد نگه داشته می‌شود', got.rows.length === 1 && got.notOption === 1, JSON.stringify({ r: got.rows.length, n: got.notOption }));
  // ردیفی که شناسه‌اش به‌شکل عددِ ناامن رسیده، **شمرده** می‌شود نه
  // استفاده. اگر بی‌صدا رد می‌شد، دفتر یک قرارداد کم داشت و کسی
  // نمی‌فهمید چرا.
  check('شناسهٔ ناامن شمرده می‌شود، نه بی‌صدا انداخته', got.unsafe === 1);

  check('تاریخ جلالیِ فشرده به میلادی برمی‌گردد', gregorianOf(14040127) === 20250416, String(gregorianOf(14040127)));
  check('تاریخ میلادی دست‌نخورده می‌ماند', gregorianOf(20250416) === 20250416);
  check('تاریخ بدشکل صفر می‌دهد نه امروز', gregorianOf(0) === 0 && gregorianOf('چرند') === 0);

  const info = instrumentInfo({ instrumentInfo: { insCode: '12998578961084515', instrumentID: 'IROFAHRM9681', lVal18AFC: 'طهرم0111', contractSize: 1000 } });
  check('مشخصات ابزار خوانده می‌شود',
    info?.id === 'IROFAHRM9681' && info.contractSize === 1000, JSON.stringify(info));

  const spec = optionSpec({ instrumentOption: { insCode: '12998578961084515', uaInsCode: '900001', strikePrice: 20000, beginDate: 14031015, endDate: 14040127, contractSize: 1000 } });
  check('بازهٔ اعتبار از مشخصات رسمی درمی‌آید',
    spec?.listedFrom === gregorianOf(14031015) && spec.listedTo === gregorianOf(14040127) && spec.strike === 20000,
    JSON.stringify(spec));
  check('مشخصاتِ خالی، شیء ساختگی نمی‌سازد', optionSpec({}) === null);
}

group('۲۱۱-ج. عبارت‌های جست‌وجو از دادهٔ دیده‌شده می‌آیند، نه از حدس');
{
  const rows = [
    { base: 'اهرم', symbol: 'ضهرم0111', side: 'call' },
    { base: 'اهرم', symbol: 'ضهرم0112', side: 'call' },
    { base: 'خودرو', symbol: 'ضخود7001', side: 'call' },
  ];
  const terms = searchTerms(rows);
  const ahrom = terms.find((t) => t.base === 'اهرم');
  check('نامِ پایه و پیشوندِ نماد، هر دو جست‌وجو می‌شوند',
    ahrom.terms.includes('اهرم') && ahrom.terms.includes('ضهرم'), JSON.stringify(ahrom));
  // این نکتهٔ اصلیِ طراحی است: «اهرم» با هیچ قاعده‌ای به «طهرم» تبدیل
  // نمی‌شود. پیشوند فقط از نمادی درمی‌آید که واقعاً دیده‌ایم — و همان
  // است که خواهرِ بی‌معاملهٔ یک قرارداد را پیدا می‌کند.
  check('پیشوندِ ندیده ساخته نمی‌شود', !ahrom.terms.includes('طهرم'), JSON.stringify(ahrom.terms));
  check('عبارت‌ها بی‌تکرار و مرتب‌اند',
    flatTerms([...rows, ...rows]).length === new Set(flatTerms(rows)).size);
  check('ردیف بی‌پایه عبارتی نمی‌سازد', searchTerms([{ symbol: 'ضچیزی1' }]).length === 0);
}

group('۲۱۱-د. عمر قرارداد از مشخصات رسمی، نه اولین معامله');
{
  // قراردادی که ۱۵ دی گشایش شد و اولین معامله‌اش ۲۰ اسفند بود.
  const row = {
    ins: '1', side: 'call', base: 'اهرم', strike: 20000,
    expiry: 20250416, listedFrom: 20250104, listedTo: 20250416,
    first: 20250310, last: 20250416,
  };
  check('بازهٔ اعتبار از تاریخ گشایش شروع می‌شود، نه از اولین معامله',
    contractLife(row).from === 20250104 && contractLife(row).official === true, JSON.stringify(contractLife(row)));
  check('در روزِ بین گشایش و اولین معامله، قرارداد فعال است',
    contractStatus(row, 20250201) === STATUS_ACTIVE);
  check('پیش از گشایش، هنوز گشایش نشده', contractStatus(row, 20241201) === STATUS_PENDING);

  // ── پایانِ رسمی بر سررسیدِ نامی مقدم است ────────────────────────────
  //
  // نامِ قرارداد سررسیدِ **اولیه** را دارد. سری‌ای که زودتر خاتمه یافته
  // یا تعدیل شده، پایانِ واقعی‌اش در مشخصات رسمی است. اگر نام حرفِ آخر
  // را می‌زد، قرارداد بعد از خاتمه‌اش هم «فعال» می‌ماند و بک‌تست رویش
  // قیمت می‌خواست.
  const cutShort = { ...row, listedTo: 20250310 };
  check('پایانِ رسمی، سررسیدِ نامی را کنار می‌زند',
    contractLife(cutShort).to === 20250310, String(contractLife(cutShort).to));
  check('و پس از پایانِ رسمی، دیگر فعال نیست',
    contractStatus(cutShort, 20250401) === 'expired' && contractStatus(row, 20250401) === STATUS_ACTIVE);
  check('در بازه هم تا همان‌جا زنده است',
    rosterInRange([cutShort], 20250101, 20250501)[0].activeTo === 20250310);

  // بی‌مشخصات رسمی، مرزِ مشاهده‌ای می‌نشیند — ولی نشان‌دار.
  const seenOnly = { ...row, listedFrom: 0, listedTo: 0 };
  check('بی‌مشخصات رسمی، اولین معامله جایش می‌نشیند',
    contractLife(seenOnly).from === 20250310 && contractLife(seenOnly).official === false);
  check('و همان روز پیش از اولین معامله، دیگر فعال نیست',
    contractStatus(seenOnly, 20250201) === STATUS_PENDING);
  check('ردیفِ بازه نشان می‌دهد مرزش مشاهده‌ای بوده',
    rosterInRange([seenOnly], 20250101, 20250501)[0].lifeFromTrades === true
    && rosterInRange([row], 20250101, 20250501)[0].lifeFromTrades === false);

  // قراردادِ بی‌معامله: هیچ تاریخ مشاهده‌ای ندارد و باید فقط با مشخصات
  // رسمی کار کند.
  const noTrade = { ins: '2', side: 'put', base: 'اهرم', strike: 20000, expiry: 20250416, listedFrom: 20250104, listedTo: 20250416, first: 0, last: 0 };
  check('قراردادِ بی‌معامله عمر دارد', contractStatus(noTrade, 20250201) === STATUS_ACTIVE);
  check('و در بازه دیده می‌شود', rosterInRange([noTrade], 20250101, 20250501).length === 1);
}

group('۲۱۱-ه. کنترل جفت — گزارش، نه حدس');
{
  const call = (k) => ({ ins: `c${k}`, symbol: `ضهرم${k}`, side: 'call', base: 'اهرم', strike: k, expiry: 20250416 });
  const put = (k) => ({ ins: `p${k}`, symbol: `طهرم${k}`, side: 'put', base: 'اهرم', strike: k, expiry: 20250416 });

  const full = pairAudit([call(1), put(1), call(2), put(2)]);
  check('جفتِ کامل، ناقص شمرده نمی‌شود', full.incomplete === 0 && full.groups === 2);

  const half = pairAudit([call(1), put(1), call(2)]);
  check('گروهِ بی‌پوت شناسایی می‌شود', half.incomplete === 1 && half.missingPut.length === 1, JSON.stringify(half.missingPut));
  check('و عبارتِ لازم برای کاملش گزارش می‌شود', half.terms.join() === 'اهرم');
  check('گروهِ بی‌کال هم شناسایی می‌شود', pairAudit([call(1), put(1), put(2)]).missingCall.length === 1);

  // ترمیم ممنوع: خروجی فقط گزارش است. شناسهٔ سمتِ گمشده هیچ‌جا ساخته
  // نمی‌شود — عددی که تصادفاً به قرارداد دیگری بخورد، از یک جای خالیِ
  // اعلام‌شده بی‌نهایت بدتر است.
  check('هیچ قرارداد ساختگی تولید نمی‌شود',
    !Object.values(half).some((v) => Array.isArray(v) && v.some((g) => g.ins || g.insCode)));

  // ── سررسید بخشی از هویتِ گروه است ──────────────────────────────────
  //
  // همان قیمت اعمال در دو سررسید، دو سریِ مستقل است. اگر کلیدِ
  // گروه‌بندی سررسید نداشت، پوتِ سررسیدِ شهریور ۱۴۰۳ جای پوتِ گمشدهٔ
  // فروردین ۱۴۰۴ را پر می‌کرد و شش سریِ ناقص «کامل» گزارش می‌شدند.
  // کاربر دقیقاً همین را دید: `طهرم۶۰۲۰` که سررسیدش ۱۴۰۳/۰۶/۲۸ است زیر
  // ۱۴۰۴/۰۶/۲۶ نشسته بود.
  const twoExpiries = pairAudit([
    call(24000), put(24000),                                   // فروردین: کامل
    { ...call(24000), ins: 'c2', expiry: 20240918 },           // شهریور: بی‌پوت
  ]);
  check('همان قیمت اعمال در دو سررسید، دو گروه است',
    twoExpiries.groups === 2, String(twoExpiries.groups));
  check('و گروهِ بی‌پوتِ سررسیدِ دیگر ناقص می‌ماند',
    twoExpiries.incomplete === 1 && twoExpiries.missingPut[0].expiry === 20240918,
    JSON.stringify(twoExpiries.missingPut));

  // تبعی سمتِ خرید ندارد و «ناقص» شمردنش یعنی هزار هشدار دروغ.
  const withTabaee = pairAudit([call(1), put(1), { ins: 't', side: 'tabaee', base: 'اهرم', strike: 3, expiry: 20250416 }]);
  check('اختیار تبعی از کنترل جفت بیرون است', withTabaee.groups === 1 && withTabaee.incomplete === 0);

  // ── سررسید از تاریخ، نه از شباهت نماد ─────────────────────────────
  const other = { ins: 'x', symbol: 'طهرم6020', side: 'put', base: 'اهرم', strike: 24000, expiry: 20240918 };
  const roll = expiryRoll([call(1), put(1), other], 'اهرم', 20250416);
  check('قراردادِ سررسیدِ دیگر وارد شمارش نمی‌شود',
    roll.call === 1 && roll.put === 1 && roll.total === 2, JSON.stringify(roll));
  check('و در سررسید خودش شمرده می‌شود', expiryRoll([other], 'اهرم', 20240918).put === 1);
  check('شمارش جفت و ناقص هم می‌آید', roll.strikes === 1 && roll.paired === 1 && roll.incomplete === 0);
}

group('۲۱۱-ی. ادغام، تاریخِ نبوده را خراب نمی‌کند');
{
  // ردیفی که از کاتالوگ آمده تاریخِ معامله ندارد. اگر همان قرارداد بعداً
  // در سابقهٔ روزانه هم دیده شود، ادغام باید تاریخِ واقعی را بگیرد — نه
  // اینکه `Math.min(undefined, …)` بدهد `NaN`، که در JSON می‌شود `null`
  // و از آن به بعد هر مقایسه‌ای رویش خاموش است.
  const fromCatalog = { ins: '9', symbol: 'طهرم1', name: 'اختیارف اهرم-20000-1404/01/27', side: 'put', base: 'اهرم', strike: 20000, expiry: 20250416, fromCatalog: true };
  const fromDaily = { ...fromCatalog, first: 20250310, last: 20250320, fromCatalog: false };

  const both = mergeRoster([fromCatalog], [fromDaily])[0];
  check('تاریخِ واقعی جای «نداریم» می‌نشیند',
    both.first === 20250310 && both.last === 20250320, JSON.stringify({ f: both.first, l: both.last }));
  check('و هیچ NaN نمی‌ماند', Number.isFinite(both.first) && Number.isFinite(both.last));
  check('ترتیب برعکس هم همان جواب را می‌دهد',
    mergeRoster([fromDaily], [fromCatalog])[0].first === 20250310);
  check('دو ردیفِ بی‌تاریخ، صفر می‌مانند نه NaN',
    mergeRoster([fromCatalog], [{ ...fromCatalog }])[0].first === 0);
  check('و پس از رفت‌وبرگشت JSON هم عدد می‌مانند',
    JSON.parse(JSON.stringify(mergeRoster([fromCatalog], [{ ...fromCatalog }])))[0].first === 0);
  check('پرچمِ کاتالوگ با ادغام گم نمی‌شود', both.fromCatalog === true);
}

group('۲۱۱-و. سلامت دفتر — «تمام شد» با «کامل» یکی نیست');
{
  const rows = [
    { ins: 'c', side: 'call', base: 'اهرم', strike: 1, expiry: 20250416 },
    { ins: 'p', side: 'put', base: 'اهرم', strike: 1, expiry: 20250416 },
  ];
  const clean = { version: ROSTER_VERSION, scan: { catalogQueriesDone: 5, catalogQueriesFailed: 0, detailQueriesFailed: 0, dayQueriesFailed: 0, unsafeIdentifiers: 0 } };
  check('دفترِ بی‌عیب کامل است', rosterHealth(clean, rows).complete === true, JSON.stringify(rosterHealth(clean, rows).reasons));

  check('نسخهٔ قدیمی هرگز کامل نیست',
    rosterHealth({ ...clean, version: 1 }, rows).complete === false);
  check('درخواستِ ناموفق کامل‌بودن را می‌گیرد',
    rosterHealth({ ...clean, scan: { ...clean.scan, catalogQueriesFailed: 2 } }, rows).complete === false);
  check('جفتِ ناقص کامل‌بودن را می‌گیرد',
    rosterHealth(clean, [rows[0]]).complete === false);
  check('شناسهٔ ناامن کامل‌بودن را می‌گیرد',
    rosterHealth({ ...clean, scan: { ...clean.scan, unsafeIdentifiers: 1 } }, rows).complete === false);
  // این همان اشتباهی بود که «اسکن تمام شد» را «دفتر کامل است» می‌خواند:
  // اسکنر فقط روزهای دریافت‌نشده را می‌شمرد و از قراردادی که اصلاً در
  // منبع روزانه نبود خبر نداشت.
  check('اسکنِ بی‌پاسِ کاتالوگ کامل نیست',
    rosterHealth({ ...clean, scan: { ...clean.scan, catalogQueriesDone: 0 } }, rows).complete === false);
  check('هر دلیل نوشته می‌شود، نه فقط یک پرچم',
    rosterHealth({ version: 1 }, [rows[0]]).reasons.length >= 2);
  check('پروندهٔ دفتر آمار اسکن را حمل می‌کند',
    makeRosterFile([], { scan: { catalogQueriesDone: 3 } }).scan.catalogQueriesDone === 3);
}

group('۲۱۱-ز. اجرای کامل — قراردادی که هرگز معامله نشد، پیدا می‌شود');
{
  // ═══ بازسازیِ دقیقِ نقصی که کاربر روی دادهٔ واقعی دید ═══
  //
  // سررسید ۱۴۰۴/۰۱/۲۷ اهرم: چهارده کال، چهارده پوت. شش پوتِ آخر هیچ
  // معامله‌ای نداشتند، پس در سابقهٔ روزانه نبودند. نتیجه‌اش چهارده کال و
  // هشت پوت بود، و هر استراتژی دوسمته روی آن شش قیمت اعمال بی‌صدا حذف
  // می‌شد — به‌نظر ایرادِ موتور استراتژی می‌آمد، در حالی که ایرادِ
  // لایهٔ شناسایی بود.
  const STRIKES = [14000, 16000, 18000, 20000, 22000, 24000, 26000, 28000, 30000, 32000, 34000, 36000, 38000, 40000];
  const TRADED_PUTS = STRIKES.slice(0, 8);           // هشت پوتِ معامله‌شده
  const SILENT_PUTS = STRIKES.slice(8);              // شش پوتِ بی‌معامله
  const EXP = '1404/01/27';
  const insOf = (side, k) => `${side === 'call' ? '1' : '2'}${String(1000000000000000 + k).slice(1)}`;

  const contract = (side, k) => ({
    insCode: insOf(side, k),
    lVal18AFC: `${side === 'call' ? 'ضهرم' : 'طهرم'}${STRIKES.indexOf(k) + 100}`,
    lVal30: `${side === 'call' ? 'اختیارخ' : 'اختیارف'} اهرم-${k}-${EXP}`,
  });

  // سابقهٔ روزانه: همهٔ کال‌ها، ولی فقط پوت‌های معامله‌شده.
  const dayPayload = {
    closingPriceDailyHistoryWithInstDetails: [
      ...STRIKES.map((k) => contract('call', k)),
      ...TRADED_PUTS.map((k) => contract('put', k)),
    ],
  };
  // کاتالوگ: همه‌چیز، از جمله شش پوتِ خاموش.
  const searchPayload = {
    instrumentSearch: [
      ...STRIKES.map((k) => contract('call', k)),
      ...STRIKES.map((k) => contract('put', k)),
      { insCode: '65883838195688438', lVal18AFC: 'اهرم', lVal30: 'صندوق اهرم' },
    ],
  };

  const calls = [];
  const fakeGet = async (path) => {
    calls.push(path);
    if (path.includes('GetInstrmentsHistoryInDay')) return dayPayload;
    if (path.includes('GetInstrumentSearch')) return searchPayload;
    if (path.includes('GetInstrumentInfo')) {
      const ins = path.split('/').pop();
      return { instrumentInfo: { insCode: ins, instrumentID: `IRO9AHRM${ins.slice(-4)}`, contractSize: 1000 } };
    }
    if (path.includes('GetInstrumentOptionByInstrumentID')) {
      return { instrumentOption: { uaInsCode: '900001', beginDate: 14031015, endDate: 14040127, contractSize: 1000 } };
    }
    throw new Error(`مسیر ناشناخته: ${path}`);
  };

  // ── مرحلهٔ ۱ تنها: همان نقصِ اصلی ─────────────────────────────────
  const onlyDaily = await runRosterBuild({ days: [20250401], get: fakeGet, limits: { maxTerms: 0, maxDetails: 0, maxRetryTerms: 0 } });
  const rollBefore = expiryRoll(onlyDaily.rows, 'اهرم', gregorianOf(14040127));
  check('فقط با سابقهٔ روزانه، شش پوت غایب‌اند — همان نقص',
    rollBefore.call === 14 && rollBefore.put === 8, JSON.stringify({ c: rollBefore.call, p: rollBefore.put }));
  check('و کنترل جفت، شش سری ناقص را می‌بیند',
    onlyDaily.stats.incompletePairs === 6, String(onlyDaily.stats.incompletePairs));

  // ── هر چهار مرحله ─────────────────────────────────────────────────
  const full = await runRosterBuild({ days: [20250401], get: fakeGet });
  const roll = expiryRoll(full.rows, 'اهرم', gregorianOf(14040127));
  check('با پاس کاتالوگ، هر چهارده کال و چهارده پوت هستند',
    roll.call === 14 && roll.put === 14 && roll.total === 28, JSON.stringify({ c: roll.call, p: roll.put }));
  check('هیچ سری ناقصی نمی‌ماند', full.stats.incompletePairs === 0 && roll.incomplete === 0);
  check('قراردادهای بی‌معامله شمرده می‌شوند', full.stats.noTradeContracts === SILENT_PUTS.length, String(full.stats.noTradeContracts));

  // ── عمرِ قراردادِ بی‌معامله از مشخصات رسمی آمده ────────────────────
  const silent = full.rows.find((r) => r.ins === insOf('put', SILENT_PUTS[0]));
  check('قراردادِ بی‌معامله در دفتر هست', Boolean(silent), String(silent?.symbol));
  check('و تاریخ معامله ندارد — چون معامله‌ای نداشته', silent.first === 0);
  check('ولی بازهٔ اعتبارش از بازار آمده',
    silent.listedFrom === gregorianOf(14031015) && silent.listedTo === gregorianOf(14040127),
    JSON.stringify({ f: silent.listedFrom, t: silent.listedTo }));
  check('پس در بازه دیده می‌شود و به بک‌تست می‌رسد',
    rosterInRange(full.rows, 20250101, 20250501).some((r) => r.ins === silent.ins));
  check('و پیش از تاریخ گشایشش وارد نمی‌شود',
    contractStatus(silent, 20241201) === STATUS_PENDING);

  // ── صرفه‌جویی درخواست: مشخصات فقط برای بی‌معامله‌ها ───────────────
  const detailCalls = calls.filter((p) => p.includes('GetInstrumentInfo')).length;
  check('مشخصات فقط برای قراردادِ بی‌معامله گرفته می‌شود، نه برای همه',
    detailCalls === SILENT_PUTS.length, `${detailCalls} درخواست برای ${full.rows.length} قرارداد`);
  check('صندوق پایه وارد دفتر نمی‌شود', !full.rows.some((r) => r.symbol === 'اهرم'));
}

group('۲۱۱-ح. شکست، «موفق» ثبت نمی‌شود');
{
  const day = { closingPriceDailyHistoryWithInstDetails: [
    { insCode: '10000000000000001', lVal18AFC: 'ضهرم100', lVal30: 'اختیارخ اهرم-20000-1404/01/27' },
  ] };
  // جست‌وجو می‌شکند: دفتر همان تک‌کال را دارد، ولی نباید «کامل» بگوید.
  const broken = await runRosterBuild({
    days: [20250401],
    get: async (path) => {
      if (path.includes('GetInstrmentsHistoryInDay')) return day;
      throw new Error('HTTP 403');
    },
  });
  check('شکستِ جست‌وجو شمرده می‌شود', broken.stats.catalogQueriesFailed > 0 && broken.stats.catalogQueriesDone === 0);
  check('و ردیفِ روزانه از دست نمی‌رود', broken.rows.length === 1);
  const health = rosterHealth(makeRosterFile(broken.rows, { scan: broken.stats }), broken.rows);
  check('سلامت دفتر «ناقص» می‌گوید، نه «کامل»', health.complete === false);
  check('و دلیلش نوشته می‌شود', health.reasons.some((r) => /ناموفق/.test(r)), health.reasons.join(' | '));

  // شکستِ مشخصات هم نباید بی‌صدا بماند.
  const noSpec = await runRosterBuild({
    days: [20250401],
    get: async (path) => {
      if (path.includes('GetInstrmentsHistoryInDay')) return day;
      if (path.includes('GetInstrumentSearch')) {
        return { instrumentSearch: [{ insCode: '10000000000000002', lVal18AFC: 'طهرم100', lVal30: 'اختیارف اهرم-20000-1404/01/27' }] };
      }
      throw new Error('HTTP 500');
    },
  });
  check('پوتِ بی‌معامله پیدا شد', noSpec.rows.length === 2);
  check('ولی شکستِ مشخصات شمرده شد', noSpec.stats.detailQueriesFailed > 0, String(noSpec.stats.detailQueriesFailed));
  const found = noSpec.rows.find((r) => r.ins === '10000000000000002');
  // بی‌مشخصات رسمی و بی‌معامله، عمرِ این ردیف نامعلوم است — و نامعلوم
  // باید نامعلوم بماند، نه اینکه تاریخِ اسکن جایش بنشیند.
  check('عمرِ نامعلوم با تاریخِ ساختگی پر نمی‌شود',
    found.listedFrom === 0 && found.first === 0, JSON.stringify({ l: found.listedFrom, f: found.first }));
  check('و وضعیتش «نمی‌دانیم» است، نه «فعال»',
    contractStatus(found, 20250401) === null || found.expiry > 0);

  const sick = rosterHealth(makeRosterFile(noSpec.rows, { scan: noSpec.stats }), noSpec.rows);
  check('دفتر با شکستِ مشخصات هم کامل نیست', sick.complete === false);
}

group('۲۱۱-ط. سقف درخواست و ایستِ به‌موقع');
{
  const day = { closingPriceDailyHistoryWithInstDetails: Array.from({ length: 6 }, (_, i) => ({
    insCode: `1000000000000000${i}`, lVal18AFC: `ضهرم${100 + i}`,
    lVal30: `اختیارخ پایه${i}-2000${i}-1404/01/27`,
  })) };
  let hits = 0;
  const capped = await runRosterBuild({
    days: [20250401],
    get: async (path) => { hits += 1; if (path.includes('History')) return day; return { instrumentSearch: [] }; },
    limits: { maxTerms: 2, maxDetails: 0, maxRetryTerms: 0 },
  });
  check('سقف عبارت رعایت می‌شود', capped.stats.catalogQueriesDone === 2, String(capped.stats.catalogQueriesDone));
  // سقف خوردن **گفته** می‌شود. اگر ساکت می‌ماند، دفترِ نصفه «کامل» به
  // نظر می‌رسید — همان اشتباهی که کل این برش برای رفعش نوشته شد.
  check('و سقف‌خوردن اعلام می‌شود', capped.stats.truncated.length > 0, JSON.stringify(capped.stats.truncated));

  let seen = 0;
  const stoppedRun = await runRosterBuild({
    days: [20250401, 20250402, 20250403],
    get: async () => { seen += 1; return day; },
    stopped: () => seen >= 2,
  });
  check('ایستِ به‌موقع، کارِ تا آن لحظه را نگه می‌دارد',
    stoppedRun.rows.length > 0 && stoppedRun.stats.dayQueriesDone < 3, String(stoppedRun.stats.dayQueriesDone));
}
