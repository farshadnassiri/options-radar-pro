// ۲۰۹. اسکن روزبه‌روز و اتصال دفتر به مسیر universe

import { check, group, readSrc } from '../harness.mjs';
import { dayPath, deepObjects, instrumentFields, scanDay, tradingDays, unwrapDay } from '../../core/roster-scan.mjs';
import { SIDE_CALL } from '../../core/option-roster.mjs';

group('۲۰۹-الف. استخراج از پاسخ یک روز');
{
  check('مسیر همان روز ساخته می‌شود',
    dayPath('2025-02-03') === '/ClosingPrice/GetInstrmentsHistoryInDay/20250203');

  // ── شکلِ پاسخ ثابت نمانده ────────────────────────────────────────────
  //
  // مسیرِ سفتِ `row.a.b.c` روزی بی‌صدا صفر ردیف می‌دهد و کسی نمی‌فهمد که
  // یک سالِ کامل از قلم افتاده. پس هر شکلی باید باز شود.
  check('آرایهٔ سرراست', unwrapDay([{ a: 1 }, { b: 2 }]).length === 2);
  check('کلید شناخته‌شده', unwrapDay({ closingPriceDailyHistoryWithInstDetails: [{ a: 1 }] }).length === 1);
  check('کلید ناشناخته هم باز می‌شود', unwrapDay({ چیزی: [{ a: 1 }, { b: 2 }] }).length === 2);
  check('پاسخ بی‌ربط، آرایهٔ خالی می‌دهد نه خطا', unwrapDay(null).length === 0 && unwrapDay(7).length === 0);

  check('شیءهای تودرتو همه دیده می‌شوند',
    [...deepObjects({ a: { b: { c: 1 } }, d: [{ e: 2 }] })].length === 4);
  check('حلقهٔ عمیق، بی‌پایان نمی‌شود', [...deepObjects({ a: 1 }, 9)].length === 0);

  // ── ادغام میدان‌ها: پرشده با خالی بازنویسی نمی‌شود ───────────────────
  const nested = {
    insCode: '37122324350938684',
    instrumentInfo: { insCode: '37122324350938684', lVal18AFC: 'ضاهرم1', lVal30: 'اختیارخ اهرم-42000-1404/04/08', instrumentID: 'IRO9AHRM4111' },
    other: { insCode: '', lVal30: '', yVal: '' },
  };
  const got = instrumentFields(nested);
  check('کد، نماد و نام از لایهٔ تودرتو درمی‌آیند',
    got.ins === '37122324350938684' && got.symbol === 'ضاهرم1' && got.name === 'اختیارخ اهرم-42000-1404/04/08', JSON.stringify(got));
  check('شیءِ کم‌محتوا نام را پاک نمی‌کند', got.name !== '');
  check('ردیف بی‌کد ابزار، ردیف نیست', instrumentFields({ lVal30: 'اختیارخ الف-1-1404/01/01' }) === null);
  // کدِ کوتاه، کدِ TSETMC نیست. رد شدنش عمدی است: ردیفِ بی‌هویت در دفتر،
  // بعداً درخواستِ قیمتی می‌شود که هرگز جواب نمی‌دهد.
  check('کد ابزارِ کوتاه پذیرفته نمی‌شود',
    scanDay({ چیزی: [{ insCode: '11', lVal18AFC: 'ضالف', lVal30: 'اختیارخ الف-1-1404/01/01' }] }, 20250629).kept === 0);

  // ── یک روز کامل ─────────────────────────────────────────────────────
  const payload = {
    closingPriceDailyHistoryWithInstDetails: [
      { insCode: '37122324350938684', lVal18AFC: 'ضاهرم1', lVal30: 'اختیارخ اهرم-42000-1404/04/08' },
      { insCode: '37122324350938685', lVal18AFC: 'طاهرم1', lVal30: 'اختیارف اهرم-42000-1404/04/08' },
      { insCode: '65883838195688438', lVal18AFC: 'خودرو', lVal30: 'ایران خودرو' },
      { insCode: '17914401175772326', lVal18AFC: 'طلا', lVal30: 'صندوق س. کالای پارسیان' },
      { insCode: '23252068339255049', lVal18AFC: 'هکیمی610', lVal30: 'اختیارف ت کیمیاتک21025-6/10/27' },
    ],
  };
  const day = scanDay(payload, '20250629');
  check('دو قرارداد از پنج ابزار', day.kept === 2, JSON.stringify({ i: day.instruments, k: day.kept }));
  check('سهم و صندوق «غیر-اختیار» شمرده می‌شوند', day.notOption === 2, String(day.notOption));
  check('نامِ بریده «ناخوانا» شمرده می‌شود، نه بی‌صدا انداخته', day.unparsed === 1, String(day.unparsed));
  check('اولین و آخرین دید، همان روزِ اسکن است',
    day.rows.every((r) => r.first === 20250629 && r.last === 20250629));
  check('سمت درست خوانده شده', day.rows[0].side === SIDE_CALL);
  check('روزِ اسکن در جواب هست', day.date === 20250629);
}

group('۲۰۹-ب. روزهای بازه');
{
  // ۲۰۲۵/۰۶/۰۲ دوشنبه است. پنجشنبه ۰۵ و جمعهٔ ۰۶ باید بیفتند.
  const days = tradingDays(20250602, 20250608);
  check('پنجشنبه و جمعه اسکن نمی‌شوند',
    days.join(',') === '20250602,20250603,20250604,20250607,20250608', days.join(','));
  check('یک روزِ کاری، یک روز', tradingDays(20250602, 20250602).length === 1);
  check('بازهٔ وارونه خالی است', tradingDays(20250608, 20250602).length === 0);
  check('تاریخ بدشکل، بازهٔ خالی می‌دهد', tradingDays('چرند', 20250608).length === 0);
  check('دو سال حدود پانصد روزِ کاری است',
    Math.abs(tradingDays(20240901, 20260829).length - 517) < 20, String(tradingDays(20240901, 20260829).length));
}

group('۲۰۹-ج. سرور: دفتر جای فهرست امروز می‌نشیند');
{
  const src = readSrc('../server/server.mjs');

  check('مسیر دفتر هست', /p === '\/api\/history\/roster'/.test(src));
  check('دفتر با mtime تازه می‌شود، نه با ری‌استارت',
    /rosterCache\.mtime/.test(src) && /fs\.stat\(ROSTER_FILE\)/.test(src));

  // ── ترتیب سه منبع، و اینکه چرا نباید عوض شود ────────────────────────
  //
  // بایگانیِ همان روز مشاهده است و اندازهٔ قرارداد هم دارد، پس مقدم است.
  // دفتر جای **نداشتن** را می‌گیرد، نه جای مشاهده را. اگر دفتر جلو
  // می‌افتاد، روزی که هر دو بودند، ردیفِ بی‌اندازه جای ردیفِ بااندازه
  // می‌نشست.
  const universe = src.slice(src.indexOf("p === '/api/history/universe'"));
  const atArchive = universe.indexOf('readArchive(wanted)');
  const atRoster = universe.indexOf('rosterUniverse(');
  const atBoard = universe.indexOf("const upstream = '/Instrument/GetInstrumentOptionMarketWatch/0'");
  check('بایگانی پیش از دفتر خوانده می‌شود', atArchive > 0 && atRoster > atArchive);
  check('دفتر پیش از تسلیم به فهرست امروز خوانده می‌شود', atBoard > atRoster);

  // ترتیبِ متنِ منبع کافی نیست: می‌شود خواندنِ بایگانی را سرِ جایش نگه
  // داشت و نتیجه‌اش را دور ریخت، و آزمونِ ترتیب همچنان سبز می‌ماند —
  // یک جهش دقیقاً همین کار را کرد و زنده ماند. پس تصمیم باید **اجرا**
  // شود، از همان تابعِ هسته که دستهٔ ۲۰۷ رفتارش را قفل کرده.
  check('سرور سیاستِ انتخاب منبع را از هسته اجرا می‌کند، نه از خودش',
    /pickUniverseSource\(/.test(src) && /plan\.source !== 'roster'/.test(src));
  check('و بودنِ بایگانی را واقعاً به آن سیاست می‌دهد',
    /hasArchive: Boolean\(archive\)/.test(universe));

  check('پاسخِ دفتر برچسبِ منبع دارد', /source: 'roster'/.test(universe));
  check('نبودِ اندازهٔ قرارداد اعلام می‌شود', /contractSizeMissing: true/.test(universe));
  check('پایهٔ ناشناخته نام‌برده می‌شود، نه بی‌صدا انداخته', /lostBases/.test(universe));

  // نگاشتِ نام پایه به کد، وقتی شبکه نیست از بایگانی می‌آید؛ وگرنه کلِ
  // مسیر دفتر بی‌شبکه بی‌فایده بود.
  const board = src.slice(src.indexOf('async function boardRowsForIndex'), src.indexOf('async function boardRowsForIndex') + 700);
  check('نگاشت پایه سه منبع دارد و آخری بایگانی است',
    /watch\.rows/.test(board) && /GetInstrumentOptionMarketWatch/.test(board) && /archiveLastDate/.test(board));

  check('پاسخِ دفتر سقفِ ردیف دارد و بریدنش گفته می‌شود',
    /const CAP = \d+/.test(src) && /truncated/.test(src));
  check('دفترِ نساخته خطا نمی‌دهد، دستورِ ساختنش را می‌دهد',
    /howTo/.test(src) && /roster-scan\.mjs/.test(src));

  // ── ابزارها ─────────────────────────────────────────────────────────
  const scanTool = readSrc('../tools/roster-scan.mjs');
  check('اسکنر checkpoint دارد', /CHECKPOINT/.test(scanTool) && /done: \[\.\.\.done\]/.test(scanTool));
  check('روزِ نیامده شمرده و گزارش می‌شود', /failed\.push/.test(scanTool) && /روزِ نشده/.test(scanTool));
  check('دفتر خالی نوشته نمی‌شود', /پروندهٔ خالی نوشته نمی‌شود/.test(scanTool));

  const importTool = readSrc('../tools/roster-import.mjs');
  check('واردکننده شمارِ ناخوانا را چاپ می‌کند', /نامِ ناخوانا/.test(importTool));
  check('واردکننده حالت ادغام دارد', /--merge/.test(importTool) && /mergeRoster/.test(importTool));
}
