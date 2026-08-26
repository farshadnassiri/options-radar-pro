// ۳۶. قیمت دستی پاها در بک‌تست سریع
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { manualPriceCheck, replayHistory, strategyLegSnapshots } from '../../core/history.mjs';
import { defaults } from '../../core/settings.mjs';


// ═══════════════════════════ ۳۶. قیمت دستی پاها در بک‌تست سریع ═══════════════════════════
group('۳۶. قیمت دستی پاها در بک‌تست سریع');
{
  const base36 = [
    { date: 20260801, close: 100, last: 100, low: 98, high: 102 },
    { date: 20260802, close: 110, last: 110, low: 105, high: 112 },
    { date: 20260803, close: 105, last: 105, low: 103, high: 108 },
  ];
  const put36 = [
    { date: 20260801, close: 8, last: 9, low: 7, high: 10 },
    { date: 20260802, close: 5, last: 4, low: 3, high: 6 },
    { date: 20260803, close: 4, last: 3, low: 2, high: 5 },
  ];
  const call36 = [
    { date: 20260801, close: 10, last: 11, low: 9, high: 12 },
    { date: 20260802, close: 7, last: 6, low: 5, high: 8 },
    { date: 20260803, close: 6, last: 5, low: 4, high: 7 },
  ];
  const args36 = {
    legs: [
      { ins: '11', name: 'پوت', kind: 'put', side: 'sell', ratio: 1, size: 1000, strike: 90, expiry: 20260820 },
      { ins: '12', name: 'کال', kind: 'call', side: 'sell', ratio: 1, size: 1000, strike: 110, expiry: 20260820 },
    ],
    baseIns: '1', startDate: 20260801, endDate: 20260803,
    entryBasis: 'CLOSE', exitBasis: 'LAST', units: 1,
    seriesByIns: { 1: base36, 11: put36, 12: call36 },
    fees: { buyStock: 0, sellStock: 0, option: 0, exercise: 0 },
    settings: defaults(),
  };

  // ——— بازه روز: پیام می‌دهد، جلو را نمی‌گیرد ———
  check('قیمت داخل بازه روز، «در بازه» گزارش می‌شود', manualPriceCheck(put36[0], 8).status === 'inside');
  check('قیمت بیرون بازه روز، «بیرون از بازه» گزارش می‌شود', manualPriceCheck(put36[0], 25).status === 'outside');
  // نبودن کمترین و بیشترین یعنی نمی‌دانیم، نه اینکه در بازه بوده.
  check('بدون کمترین و بیشترین روز، وضعیت نامعلوم می‌ماند',
    manualPriceCheck({ close: 8 }, 8).status === 'unknown' && manualPriceCheck(null, 8).status === 'unknown');
  check('ورودی خالی یا نامعتبر پیامی نمی‌سازد',
    manualPriceCheck(put36[0], NaN).status === 'empty' && manualPriceCheck(put36[0], 0).status === 'empty');
  const bounds36 = manualPriceCheck(put36[0], 25);
  check('پیام بازه، همان کمترین و بیشترین همان روز را حمل می‌کند', bounds36.low === 7 && bounds36.high === 10);

  // ——— قیمت دستی خروج ———
  const plain36 = replayHistory(args36);
  const manualExit36 = replayHistory({ ...args36, manualExit: { 0: 1, 1: 1 } });
  check('قیمت دستی خروج در روز سنجش اثر می‌گذارد',
    manualExit36.ok && manualExit36.rows.at(-1).perLeg[0].exitPrice === 1 && manualExit36.rows.at(-1).perLeg[1].exitPrice === 1);
  check('قیمت دستی خروج فقط روی روز سنجش می‌نشیند، نه روزهای مسیر',
    manualExit36.rows[1].perLeg[0].exitPrice === plain36.rows[1].perLeg[0].exitPrice
    && manualExit36.rows[1].perLeg[1].exitPrice === plain36.rows[1].perLeg[1].exitPrice);
  // ۱۸۰۰۰ دریافتی ورود منهای ۲۰۰۰ هزینه بستن دو پا با قیمت ۱
  check('سود روز سنجش با قیمت دستی خروج درست حساب می‌شود',
    manualExit36.rows.at(-1).netPnl === 16000, manualExit36.rows.at(-1).netPnl);
  // بیرون از بازه روز باید محاسبه شود، نه رد. این دقیقاً خواسته کاربر است.
  const wild36 = replayHistory({ ...args36, manualExit: { 0: 500, 1: 500 } });
  check('قیمت دستی بیرون از بازه روز جلوی محاسبه را نمی‌گیرد',
    wild36.ok && wild36.rows.at(-1).status === 'ok' && wild36.rows.at(-1).netPnl === -982000, wild36.rows.at(-1).netPnl);
  // روزی که یک پا اصلاً قیمت ندارد، با قیمت دستی قابل سنجش می‌شود.
  const gapSeries36 = { ...args36.seriesByIns, 12: call36.slice(0, 2) };
  check('روز فاقد قیمت یک پا، بدون قیمت دستی همچنان فاقد داده می‌ماند',
    replayHistory({ ...args36, seriesByIns: gapSeries36 }).rows.at(-1).status === 'missing');
  check('همان روز با قیمت دستی همان پا معتبر می‌شود',
    replayHistory({ ...args36, seriesByIns: gapSeries36, manualExit: { 1: 3 } }).rows.at(-1).status === 'ok');
  check('بازپخش، قیمت‌های دستی به‌کاررفته را همراه نتیجه برمی‌گرداند',
    manualExit36.manualExit[0] === 1 && Object.keys(plain36.manualExit).length === 0);

  // ——— رابط ———
  const backtestSource36 = readSrc('../ui/tabs/backtest.mjs');
  check('رابط بک‌تست برای هر پا در هر دو روز ورودی قیمت دستی می‌سازد',
    backtestSource36.includes('data-manual="${scope}"')
    && backtestSource36.includes("marketSnapshot(strategyLegSnapshots(legs, seriesByIns, entry), entryRail.dataset.value || 'LAST', 'entry', manualEntry)")
    && backtestSource36.includes("marketSnapshot(strategyLegSnapshots(legs, seriesByIns, exit), exitRail.dataset.value || 'LAST', 'exit', manualExit)"));
  check('رابط بک‌تست قیمت دستی هر دو سمت را به موتور می‌دهد',
    /replayHistory\(\{[^}]*manualEntry, manualExit,/.test(backtestSource36));
  // قیمت دستی به یک قرارداد و یک روز تعلق دارد؛ ماندنش پس از تعویض ترکیب
  // یا تاریخ یعنی نسبت‌دادن قیمتی به جایی که هرگز آنجا نبوده.
  check('تعویض ترکیب یا تاریخ خروج، قیمت‌های دستی را پاک می‌کند',
    /function renderCombo\(\) \{[\s\S]{0,200}?manualEntry = \{\}; manualExit = \{\};/.test(backtestSource36)
    && backtestSource36.includes('() => { manualExit = {}; paintSnapshots(); }'));
}
