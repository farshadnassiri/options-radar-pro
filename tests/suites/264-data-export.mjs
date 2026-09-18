// ۲۶۴. خروجی دیتای ریزمعاملات

import { check, group, readSrc } from '../harness.mjs';
import {
  dataExportCoverageRows, dataExportPairBatches, dataExportPairs,
  dataExportTradeRows, discoverDataExportInstruments, dataExportContractGroups,
} from '../../core/data-export.mjs';
import { buildDataExportSheets } from '../../ui/data-export-workbook.mjs';

group('۲۶۴. خروجی دیتای ریزمعاملات');
{
  const roster = [
    {
      uaInsCode: 'BASE', lval30_UA: 'اهرم', activeFrom: 20260101, activeTo: 20260103,
      expiryGregorian: 20260103, strikePrice: 1000, contractSize: 1000,
      insCode_C: 'CALL1', lVal18AFC_C: 'ضهرم۱', insCode_P: 'PUT1', lVal18AFC_P: 'طهرم۱',
    },
    {
      uaInsCode: 'BASE', lval30_UA: 'اهرم', activeFrom: 20260102, activeTo: 20260103,
      expiryGregorian: 20260103, strikePrice: 1100, contractSize: 1000,
      insCode_C: 'CALL2', lVal18AFC_C: 'ضهرم۲', insCode_P: 'PUT2', lVal18AFC_P: 'طهرم۲',
    },
    { uaInsCode: 'OTHER', lval30_UA: 'دیگر', insCode_C: 'NOPE' },
  ];
  const instruments = discoverDataExportInstruments(roster, ['BASE']);
  check('پایه و همه قراردادهای کال و پوتِ بازه کشف می‌شوند',
    instruments.length === 5
      && instruments.filter((item) => item.kind === 'call').length === 2
      && instruments.filter((item) => item.kind === 'put').length === 2);
  check('نماد پایهٔ انتخاب‌نشده وارد خروجی نمی‌شود', !instruments.some((item) => item.ins === 'OTHER'));
  check('اندازه رسمی قرارداد نگه داشته می‌شود', instruments.find((item) => item.ins === 'CALL1').size === 1000);
  const grouped = dataExportContractGroups(instruments, 'BASE');
  check('شمار کال و پوت هر سررسید جدا و واقعی گزارش می‌شود',
    grouped.length === 1 && grouped[0].callCount === 2 && grouped[0].putCount === 2);

  const splitLife = discoverDataExportInstruments([{
    uaInsCode: 'BASE', lval30_UA: 'اهرم', activeFrom: 20260101, activeTo: 20260103,
    activeFrom_C: 20260102, activeTo_C: 20260103, listingKnown_C: true,
    activeFrom_P: 20260101, activeTo_P: 20260103, listingKnown_P: false,
    expiryGregorian: 20260103, strikePrice: 1200,
    insCode_C: 'CALL3', lVal18AFC_C: 'ضهرم۳', insCode_P: 'PUT3', lVal18AFC_P: 'طهرم۳',
  }], ['BASE']);
  check('عمر و شاهدِ عرضهٔ کال و پوت جدا می‌ماند',
    splitLife.find((item) => item.ins === 'CALL3').activeFrom === 20260102
      && splitLife.find((item) => item.ins === 'CALL3').listingKnown === true
      && splitLife.find((item) => item.ins === 'PUT3').listingKnown === false);

  const dates = [20251231, 20260101, 20260102, 20260103, 20260104];
  const pairs = dataExportPairs(instruments, dates);
  check('دارایی پایه برای تمام روزهای درخواستی جفت می‌شود', pairs.filter((item) => item.ins === 'BASE').length === 5);
  check('اختیار فقط در عمر ثبت‌شدهٔ خودش درخواست می‌شود',
    pairs.filter((item) => item.ins === 'CALL2').map((item) => item.date).join(',') === '20260102,20260103');
  check('درخواست‌های حجیم مطابق سقف تکه می‌شوند', dataExportPairBatches(pairs, 3).every((part) => part.length <= 3));

  const callPair = pairs.find((item) => item.ins === 'CALL1' && item.date === 20260101);
  const emptyPair = pairs.find((item) => item.ins === 'PUT1' && item.date === 20260101);
  const items = {
    [callPair.key]: { source: 'history', rows: [
      { time: 101530, sequence: 7, price: 25, quantity: 2, canceled: false, canceledKnown: true },
      { time: 101531, sequence: 8, price: 30, quantity: 1, canceled: true, canceledKnown: true },
    ] },
    [emptyPair.key]: { source: 'history', rows: [] },
  };
  const trades = dataExportTradeRows(instruments.find((item) => item.ins === 'CALL1'), pairs, items);
  check('هر اجرای گزارش‌شده یک ردیف مستقل می‌ماند', trades.length === 2 && trades[0].sequence === 7);
  check('ارزش خام و قراردادی هر اجرا درست است', trades[0].rawValue === 50 && trades[0].contractValue === 50000);
  check('معاملهٔ باطل حذف نمی‌شود و نشانش حفظ می‌شود', trades[1].canceled === true);
  const coverage = dataExportCoverageRows(instruments, pairs, items);
  // ممیزی: خالیِ بی‌تأییدِ تابلوی روزانه دیگر «بدون معامله» خوانده نمی‌شود —
  // آن یک ادعای بازار است و ما فقط می‌دانیم ریزمعامله‌ای نیامد.
  check('خالیِ تأییدنشده از روز دریافت‌نشده تفکیک می‌شود',
    coverage.find((row) => row.ins === 'PUT1' && row.date === 20260101).status === 'خالی، تأییدنشده'
      && coverage.some((row) => row.status === 'درخواست نرفت'));

  const sheets = buildDataExportSheets({ instruments, pairs, items, range: { from: 20260101, to: 20260103 }, complete: true });
  check('برای هر ابزار دقیقاً یک شیت مستقل ساخته می‌شود', sheets.length === instruments.length + 2);
  check('قرارداد بی‌معامله هم شیت خالی خودش را دارد', sheets.find((item) => item.name === 'ضهرم۲')?.rows.length === 0);
  check('شیت پوشش و راهنما کنار شیت‌های ابزار هستند', sheets[0].name === 'راهنما' && sheets[1].name === 'پوشش دریافت');

  const app = readSrc('../ui/app.mjs');
  const tab = readSrc('../ui/tabs/data-export.mjs');
  check('تب مستقل خروجی دیتا در مسیریاب ثبت شده', app.includes("id: 'data-export'") && app.includes("title: 'خروجی دیتا'"));
  check('تب از مسیر دسته‌ای تاریخی و نوار زنده استفاده می‌کند', tab.includes('/api/trades/batch') && tab.includes('/api/live-trades'));
  check('سرور مرز و شاهدِ عرضهٔ هر سمت را جدا می‌فرستد',
    readSrc('../server/server.mjs').includes('listingKnown_C:')
      && readSrc('../server/server.mjs').includes('listingKnown_P:'));
  check('ناقص‌بودن دفتر، آماده‌سازی خروجی را قفل نمی‌کند',
    tab.includes('runBtn.disabled = !universe ||') && !tab.includes("if (!universe?.complete)"));
  check('دکمه مستقل خروجی Excel پس از آماده‌سازی فعال می‌شود',
    tab.includes('id="de-export"') && tab.includes("exportBtn.addEventListener('click', exportPrepared)"));
  check('خروجی واقعی xlsx فقط از دادهٔ آماده‌شده دانلود می‌شود',
    tab.includes('if (!prepared) { setStatus(\'اول ریزمعاملات را آماده کنید.\', true); return; }')
      && tab.includes('await downloadXlsx(dataExportFilename(prepared.range, frame), sheets)'));
}
