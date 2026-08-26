// ۶۴. نگاه باز — سربه‌سر، وزن ارزش، IV و بازه زمانی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import {
  analyzeDailyOpenView, analyzeIntradayOpenView, movingAverage, optionBreakeven, pearson, relationMatrix, weightedMean,
} from '../../core/open-view.mjs';
import { toEnDigits } from '../../ui/fmt.mjs';
import { buildOpenViewWorkbook } from '../../ui/open-view-export.mjs';


// ═══════════════════════════ ۶۴. نگاه باز ═══════════════════════════
group('۶۴. نگاه باز — سربه‌سر، وزن ارزش، IV و بازه زمانی');
{
  check('سربه‌سر کال = اعمال + پریمیوم', near(optionBreakeven('call', 100, 12), 112));
  check('سربه‌سر پوت = اعمال − پریمیوم', near(optionBreakeven('put', 100, 7), 93));
  const weighted = weightedMean([{ v: 10, w: 1 }, { v: 20, w: 3 }, { v: 999, w: 0 }], (r) => r.v, (r) => r.w);
  check('میانگین وزنی، وزن صفر را وارد شاخص نمی‌کند', near(weighted.value, 17.5) && weighted.count === 2 && weighted.weight === 4);
  const ma64 = movingAverage([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }, { v: 6 }], 'v', 5);
  check('میانگین متحرک فقط از مشاهده پنجم ساخته می‌شود', ma64.slice(0, 4).every((v) => !Number.isFinite(v)) && near(ma64[4], 3) && near(ma64[5], 4));
  check('میانگین متحرک از روی مشاهده گمشده نمی‌پرد', !Number.isFinite(movingAverage([{ v: 1 }, { v: 2 }, { v: NaN }, { v: 4 }, { v: 5 }], 'v', 5)[4]));

  const expiry = 20240630;
  const ua64 = { ins: '1', name: 'پایه آزمایشی' };
  const contracts64 = [
    { ins: '11', name: 'کال ۱۰۰', kind: 'call', strike: 100, expiry, size: 1000 },
    { ins: '12', name: 'کال ۱۲۰', kind: 'call', strike: 120, expiry, size: 1000 },
    { ins: '21', name: 'پوت ۱۰۰', kind: 'put', strike: 100, expiry, size: 1000 },
  ];
  const series64 = {
    1: [
      { date: 20240101, close: 100, value: 1000000, vol: 10000 },
      { date: 20240102, close: 105, value: 1200000, vol: 11000 },
    ],
    11: [
      { date: 20240101, close: 10, value: 100, vol: 10, trades: 2 },
      { date: 20240102, close: 12, value: 200, vol: 20, trades: 3 },
    ],
    12: [
      { date: 20240101, close: 5, value: 300, vol: 30, trades: 4 },
      // ارزش رسمی صفر: قیمت دیده می‌شود ولی حق ندارد وزن شاخص شود.
      { date: 20240102, close: 6, value: 0, vol: 10, trades: 1 },
    ],
    21: [
      { date: 20240101, close: 8, value: 200, vol: 20, trades: 3 },
      { date: 20240102, close: 7, value: 400, vol: 40, trades: 5 },
    ],
  };
  const daily64 = analyzeDailyOpenView({ ua: ua64, contracts: contracts64, seriesByIns: series64, from: 20240101, to: 20240102, settings: { rFree: 0.2, yearDays: 365 } });
  check('شاخص روزانه کال با ارزش رسمی وزن می‌گیرد', near(daily64.rows[0].callBreakeven, 121.25), daily64.rows[0].callBreakeven);
  check('قرارداد با ارزش رسمی صفر از شاخص روزانه کنار می‌رود', near(daily64.rows[1].callBreakeven, 112) && daily64.rows[1].callContracts === 1);
  check('شاخص پوت جدا ساخته می‌شود', near(daily64.rows[0].putBreakeven, 92));
  check('تغییر پایه روز دوم محاسبه می‌شود', near(daily64.rows[1].baseChangePct, 5));
  check('تفکیک تاریخ×سررسید موجود است', daily64.expiryRows.length === 2 && daily64.expiryRows.every((r) => r.expiry === expiry));
  check('IV قراردادهای معتبر بدون ساخت عدد برای نامعتبرها ثبت می‌شود', daily64.contractRows.some((r) => Number.isFinite(r.iv)));
  check('وزن هر قرارداد در سمت خودش ثبت می‌شود', near(daily64.contractRows.find((r) => r.date === 20240101 && r.ins === '11').indexWeightPct, 25)
    && near(daily64.contractRows.find((r) => r.date === 20240101 && r.ins === '12').indexWeightPct, 75));

  const maSeries64 = {
    1: [1, 2, 3, 4, 5].map((day) => ({ date: 20240100 + day, close: 100, value: 1000, vol: 10 })),
    11: [1, 2, 3, 4, 5].map((day) => ({ date: 20240100 + day, close: 10, value: 100, vol: 10 })),
    21: [1, 2, 3, 4, 5].map((day) => ({ date: 20240100 + day, close: 5, value: 100, vol: 10 })),
  };
  const maDaily64 = analyzeDailyOpenView({ ua: ua64, contracts: [contracts64[0], contracts64[2]], seriesByIns: maSeries64, settings: { rFree: 0.2, yearDays: 365 } });
  check('فاصله کال و پوت، میانگین ۵روزه مستقل دارند', near(maDaily64.rows[4].callBreakevenGapPctMa5, 10) && near(maDaily64.rows[4].putBreakevenGapPctMa5, 5));
  check('IV کال و پوت نیز میانگین ۵روزه مستقل دارند', Number.isFinite(maDaily64.rows[4].callIvPctMa5) && Number.isFinite(maDaily64.rows[4].putIvPctMa5));

  const trade = (time, price, quantity, canceledKnown = true) => ({ time, price, quantity, canceled: false, canceledKnown });
  const intraday64 = analyzeIntradayOpenView({
    ua: ua64, contracts: contracts64, dates: [20240101], intervalMinutes: 15,
    tradesByKey: {
      '20240101:1': [trade(90100, 100, 100), trade(91000, 110, 100)],
      '20240101:11': [trade(90200, 10, 2), trade(92000, 11, 1)],
      '20240101:12': [trade(90600, 5, 6)],
      '20240101:21': [trade(90400, 8, 1, false)],
    }, settings: { rFree: 0.2, yearDays: 365 },
  });
  check('پایه در همان سطل با VWAP ساخته می‌شود', intraday64.rows.length === 2 && near(intraday64.rows[0].basePrice, 105));
  check('قیمت پایه به سطل بی‌معامله بعدی حمل نمی‌شود', !Number.isFinite(intraday64.rows[1].basePrice));
  check('ارزش ریزمعامله × اندازه قرارداد وزن کال است', near(intraday64.rows[0].callBreakeven, 119));
  check('وزن قرارداد در سطل زمانی هم ثبت می‌شود', near(intraday64.contractRows.find((r) => r.second === 32400 && r.ins === '11').indexWeightPct, 40));
  check('ابهام وضعیت ابطال تا خروجی حفظ می‌شود', intraday64.rows[0].unknownCancel === true);
  check('ریز هر قرارداد و هر سررسید برای حسابرسی نگه داشته می‌شود', intraday64.contractRows.length === 4 && intraday64.expiryRows.length === 2);
  check('میانگین ۵روزه با پنج سطل درون‌روزی اشتباه نمی‌شود', !('callBreakevenGapPctMa5' in intraday64.expiryRows[0]));

  const corr = pearson([{ a: 1, b: 2 }, { a: 2, b: 4 }, { a: 3, b: 6 }], 'a', 'b');
  check('همبستگی پیرسون همراه تعداد نمونه محاسبه می‌شود', near(corr.value, 1) && corr.samples === 3);
  check('ماتریس رابطه همه متغیرها مربع است', relationMatrix(daily64.rows).length === 49);

  const workbook64 = buildOpenViewWorkbook({ ua: ua64, daily: daily64, intraday: intraday64, dailyRelations: relationMatrix(daily64.rows), intradayRelations: relationMatrix(intraday64.rows) });
  check('اکسل جامع، راهنما و برگه‌های روزانه/بازه/همبستگی دارد',
    workbook64.includes('ss:Name="راهنما"') && workbook64.includes('ss:Name="روزانه سررسید"')
    && workbook64.includes('ss:Name="قراردادهای بازه"') && workbook64.includes('ss:Name="همبستگی روزانه"'));
  check('عددهای اکسل Numeric می‌مانند', workbook64.includes('<Data ss:Type="Number">121.25</Data>'));
  check('اکسل میانگین‌های ۵روزه و وزن‌های مستقل قرارداد را صادر می‌کند',
    workbook64.includes('میانگین ۵روزه فاصله کال ٪') && workbook64.includes('میانگین ۵روزه IV پوت ٪')
    && workbook64.includes('وزن شاخص ٪') && workbook64.includes('وزن IV ٪'));
  check('خانه نامعتبر اکسل خالی می‌ماند، نه متن NaN', !workbook64.includes('>NaN<'));
  check('اکسل سررسید فعال هنگام خروجی را در راهنما ثبت می‌کند', workbook64.includes('سررسید فعال هنگام خروجی'));

  const app64 = readSrc('../ui/app.mjs'), server64 = readSrc('../server/server.mjs'), ui64 = readSrc('../ui/tabs/open-view.mjs');
  const liveDashboard64 = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('نگاه باز از ریل اصلی حذف و داخل داشبورد تنبل شده است',
    !app64.includes("id: 'open-view'") && liveDashboard64.includes("import('/ui/tabs/open-view.mjs')"));
  check('ریزمعامله دسته‌ای سقف صریح دارد', server64.includes("p === '/api/trades/batch'") && server64.includes('raw.length > 1200'));
  check('رابط بازه، تایم‌فریم روز و خروجی جامع دارد', ui64.includes('ov-from') && ui64.includes('ov-day-interval') && ui64.includes('downloadOpenViewExcel'));
  check('دکمه تایم‌فریم از بالای صفحه حذف و داخل جزئیات روز نشسته', !ui64.includes('id="ov-intraday"') && ui64.includes('id="ov-day-intraday"'));
  check('نمای اصلی فقط جدول روزانه دارد و جدول سررسید/همبستگی حذف شده', ui64.includes('open-view-daily-table') && !ui64.includes('ov-expiry-table') && !ui64.includes('correlationTable'));
  check('تولتیپ قیمت، فاصله درصدی هر دو شاخص را می‌گوید', ui64.includes('فاصله پایه تا کال') && ui64.includes('فاصله پایه از پوت'));
  check('جدول قرارداد، وزن سربه‌سر و IV را جدا رنگ می‌کند', ui64.includes('indexWeightPct') && ui64.includes('ivWeightPct') && ui64.includes('open-view-weight-cell'));
  check('نمودار فاصله، کال و پوت را ستونی رسم می‌کند', ui64.includes("kind: 'bar'") && ui64.includes('open-view-chart-bar'));
  check('میانگین‌های فاصله و IV از راهنمای نمودار قابل خاموش‌کردن‌اند', ui64.includes('data-series-toggle') && ui64.includes('hiddenSeries') && ui64.includes('aria-pressed'));
  check('گزینه همه سررسیدها حذف شده و فقط سررسید واقعی انتخاب می‌شود', !ui64.includes('value="all"') && ui64.includes('selectedExpiry'));
  check('جدول روزانه و جزئیات روز از ردیف‌های همان سررسید می‌خوانند', ui64.includes('dailyTable(rows, selectedDate)') && ui64.includes('item.expiry === selectedExpiry()'));
  check('ریزمعامله فقط قراردادهای سررسید انتخابی را دریافت می‌کند', ui64.includes('contractsInView()') && ui64.includes('contracts: viewContracts'));
  check('پارامترهای مدل IV در خود نگاه باز قابل تنظیم‌اند', ['ov-rfree', 'ov-divyield', 'ov-year-days', 'ov-iv-lo', 'ov-iv-hi', 'ov-apply-iv'].every((id) => ui64.includes(id)) && ui64.includes('toEnDigits'));
}
