// ۲۸۳. سه یافتهٔ بازآزماییِ عملیِ دور سوم (R3-01 تا R3-03)
//
// هر سه با رکوردهای **واقعیِ** همان اجرا بازتولید شده‌اند.

import { check, group, readSrc } from '../harness.mjs';
import { chooseTape, dailyExpectation, expectationFromDailyRow, tapeMatchesDaily, tapeMetrics } from '../../core/tape-choice.mjs';
import {
  BUCKET_STATE, dataExportBlankAudit, dataExportCandles, sessionWindow,
} from '../../core/data-export.mjs';
import { buildDataExportSheets } from '../../ui/data-export-workbook.mjs';

group('۲۸۳. R3-01 — رکوردِ تاریخِ دیگر در جایگاهِ روزانه');
{
  const server = readSrc('../server/server.mjs');
  check('یک دروازهٔ مشترک برای ردیفِ تک‌رکوردیِ تاریخ‌دار هست',
    server.includes('function datedRow(row, date = 0, ins = \'\')'));
  check('و `kind=daily` از آن می‌گذرد',
    server.includes("if (kind === 'daily' || kind === 'instrument' || kind === 'clientType') {")
      && server.includes('return datedRow(firstDict(raw), date, ins);'));
  check('تاریخ و شناسه هر دو به آن می‌رسند',
    server.includes('shapeHistorical(kind, raw, date, code)'));
  // ردیفِ نامرتبط نباید در جایگاهِ `row` بنشیند — ولی خام هم حذف نشود.
  check('ردیفِ بدتاریخ `row:null` و `found:false` می‌گیرد',
    server.includes("row: null, found: false,")
      && server.includes('mismatch: row,'));
  check('و دلیلش صریح نوشته می‌شود',
    server.includes('رکوردِ همان روز در دست نیست'));
  check('رکوردِ ابزارِ دیگر هم رد می‌شود',
    server.includes('stampedIns !== String(ins)'));
}

group('۲۸۳. R3-02 — روزِ دریافت‌نشده از جدولِ پیوسته نمی‌افتد');
{
  const INS = '17914401175772326';
  const instruments = [{ ins: INS, name: 'اهرم', kind: 'underlying', baseName: 'اهرم', size: 1 }];
  const pairs = [{ key: `20260919:${INS}`, ins: INS, date: 20260919 }];
  // پاسخِ واقعیِ دور سوم: صفر ردیف، ولی تابلو ۷٬۷۳۶ معامله ثبت کرده.
  const items = { [`20260919:${INS}`]: { rows: [], source: 'history', complete: false, verified: true,
    shortfall: { trades: 7736, volume: 73305224 } } };
  const dailyByIns = { [INS]: { rows: [{ date: 20260919, trades: 7736, vol: 73305224 }] } };
  const audit = dataExportBlankAudit(pairs, items, dailyByIns);
  check('حکمِ آن روز «نیامد» است', audit[0].verdict === 'missing');

  const sheets = buildDataExportSheets({
    instruments, pairs, items, audit, frame: 'm1', continuous: true,
    window: sessionWindow('09:30', '12:30'), range: { from: 20260919, to: 20260919 },
  });
  const sheet = sheets.find((part) => part.name === 'پایه اهرم');
  // معیارِ پذیرشِ ممیزی: ۱۸۰ بازهٔ یک‌دقیقه‌ای، نه صفر ردیف.
  check('روزِ دریافت‌نشده ۱۸۰ ردیفِ یک‌دقیقه‌ای می‌گیرد', sheet.rows.length === 180);
  const at = sheet.headers.indexOf('معامله شد');
  check('و هر ۱۸۰ ردیف «دریافت نشد» خوانده می‌شوند',
    sheet.rows.every((row) => row[at] === BUCKET_STATE.missing));
  // ═══ و هیچ عددی به آن روز نسبت داده نمی‌شود ═══
  const numeric = (row) => [3, 4, 5, 6, 7, 8, 9, 10].filter((i) => Number.isFinite(row[i]));
  check('نه قیمتی، نه حجمی، نه شماری — همه خانه‌ها تهی‌اند',
    sheet.rows.every((row) => numeric(row).length === 0));

  // روزی که داده‌اش رسیده باید مثل قبل کار کند.
  const withData = { [`20260919:${INS}`]: { rows: [
    { time: 100000, quantity: 10, price: 1000, canceled: false },
  ], source: 'history' } };
  const okAudit = dataExportBlankAudit(pairs, withData,
    { [INS]: { rows: [{ date: 20260919, trades: 1, vol: 10 }] } });
  const okSheet = buildDataExportSheets({
    instruments, pairs, items: withData, audit: okAudit, frame: 'm1', continuous: true,
    window: sessionWindow('09:30', '12:30'), range: { from: 20260919, to: 20260919 },
  }).find((part) => part.name === 'پایه اهرم');
  check('روزِ دارای داده هم ۱۸۰ ردیف می‌دهد', okSheet.rows.length === 180);
  check('و سطلِ معامله‌شده «بله» است',
    okSheet.rows.filter((row) => row[at] === BUCKET_STATE.traded).length === 1);
  check('و بقیه «خیر» — چون دریافتِ آن روز تأیید شده',
    okSheet.rows.filter((row) => row[at] === BUCKET_STATE.quiet).length === 179);

  // حالتِ فشرده دست‌نخورده می‌ماند: ردیفِ ساختگی نمی‌سازد.
  check('حالت فشرده روزِ بی‌داده را ردیف نمی‌دهد',
    dataExportCandles([], 60, { dates: [20260919], verdictByDate: { 20260919: 'missing' } }).length === 0);
}

group('۲۸۳. R3-03 — صفرِ تأییدشده، یک حکم در همهٔ لایه‌ها');
{
  // رکوردِ واقعیِ طهرم۷۰۵۰ در `20260728`.
  const raw = { closingPriceDaily: {
    insCode: '68991773475135927', dEven: 20260728, hEven: 61021,
    pClosing: 230, yClose: true, zTotTran: 0, qTotTran5J: 0, qTotCap: 0,
  } };
  const expect = dailyExpectation(raw, 20260728);
  check('مرجع «داریم» است', expect.known === true);
  check('و می‌گوید «هیچ»', expect.quiet === true);

  const decided = chooseTape([{ variant: 'true', rows: [] }, { variant: 'false', rows: [] }], expect);
  check('نوارِ خالی روبه‌روی تابلوی صفر «کامل» است', decided.complete === true);
  check('و «تأییدشده»', decided.verified === true && decided.quiet === true);
  check('و هیچ کسری‌ای ادعا نمی‌شود', decided.shortfall === null);

  // همان حکم در لایهٔ خروجی.
  const pairs = [{ key: '20260728:P', ins: 'P', date: 20260728 }];
  const audit = dataExportBlankAudit(pairs, { '20260728:P': { rows: [], source: 'history' } },
    { P: { rows: [{ date: 20260728, trades: 0, vol: 0 }] } });
  check('ممیزیِ خروجی هم «بی‌معاملهٔ تأییدشده» می‌گوید', audit[0].verdict === 'quiet');
  check('پس API و فایل یک حکم دارند',
    (decided.complete && decided.quiet) === (audit[0].verdict === 'quiet'));

  // ═══ و آنچه صفرِ تأییدشده **نیست** ═══
  check('نبودِ میدانِ شمار/حجم مرجع نمی‌سازد',
    dailyExpectation({ x: { insCode: 'P', dEven: 20260728, pClosing: 230 } }, 20260728).known === false);
  check('رکوردِ تاریخِ دیگر هم نه',
    dailyExpectation({ x: { dEven: 20260921, zTotTran: 0, qTotTran5J: 0 } }, 20260728).known === false);
  check('ردیفِ نرمال‌شدهٔ صفر هم صفرِ تأییدشده است',
    expectationFromDailyRow({ trades: 0, vol: 0 }).quiet === true);

  // نوارِ پر روبه‌روی تابلوی صفر تطبیق نیست — تضاد است.
  const tape = [{ sequence: 1, time: 100000, price: 1000, quantity: 5, canceled: false }];
  check('نوارِ پر با تابلوی صفر تطبیق نمی‌شود',
    !tapeMatchesDaily(tapeMetrics(tape), expect));
  const clash = chooseTape([{ variant: 'true', rows: tape }], expect);
  check('و «تضاد» علامت می‌خورد، نه «کامل»',
    clash.surplus === true && clash.complete === false && clash.verified === true);
  check('و ردیف‌هایش دور ریخته نمی‌شوند', clash.rows.length === 1);
}
