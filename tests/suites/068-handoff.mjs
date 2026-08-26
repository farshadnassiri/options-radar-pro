// ۶۷. انتقال موقعیت تحلیل تاریخی به ریز بک‌تست سریع
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { goHandoff, historyHandoffPlan } from '../../ui/handoff.mjs';



// ═══════════════════════════ ۶۷. تحلیل تاریخی → بک‌تست سریع ═══════════════════════════
group('۶۷. انتقال موقعیت تحلیل تاریخی به ریز بک‌تست سریع');
{
  const replay67 = {
    startDate: 20260502, endDate: 20260520,
    priced: [
      { kind: 'call', ins: 'c101', name: 'ضنماد۱' },
      { kind: 'put', ins: 'p099', name: 'طنماد۱' },
      { kind: 'underlying', ins: '77', name: 'نماد' },
    ],
    summary: { last: { netPnl: 999999, returnPct: 42 } },
  };
  const plan67 = historyHandoffPlan({
    ua: { ins: '77', name: 'نماد' },
    strategyId: 'short-strangle', strategyName: 'Short Strangle', replay: replay67,
    args: {
      startDate: 20260502, endDate: 20260520, entryBasis: 'CLOSE', exitBasis: 'LAST', units: 3,
      manualEntry: { 0: 1250, 1: 840, 2: 0, bad: NaN },
    },
    comboName: 'فروش استرانگل انتخاب‌شده',
  });
  check('نقشه تاریخی، قراردادهای دقیق و بازه انتخابی را منتقل می‌کند',
    plan67.from === 'history' && plan67.uaIns === '77'
    && plan67.legIns.join(',') === 'c101,p099'
    && plan67.entryDate === 20260502 && plan67.exitDate === 20260520);
  check('مبنا، تعداد واحد و قیمت دستی معتبر حفظ می‌شوند',
    plan67.entryBasis === 'CLOSE' && plan67.exitBasis === 'LAST' && plan67.units === 3
    && plan67.manualEntry['0'] === 1250 && plan67.manualEntry['1'] === 840
    && !('2' in plan67.manualEntry) && !('bad' in plan67.manualEntry));
  check('نتیجه تاریخی کپی نمی‌شود و مقصد خودش خودکار محاسبه می‌کند',
    plan67.autoRun === true && !('netPnl' in plan67) && !('returnPct' in plan67));

  const history67 = readSrc('../ui/tabs/history.mjs');
  const backtest67 = readSrc('../ui/tabs/backtest.mjs');
  check('مشخصات موقعیت تاریخی دکمه ریز بک‌تست دارد',
    history67.includes('data-history-backtest')
    && history67.includes('goHandoff(state, historyHandoffPlan({'));
  check('استراتژی مطالعه‌ای به بک‌تست اجرایی اشتباه فرستاده نمی‌شود',
    history67.includes('const backtestDisabled = !def?.feasible')
    && history67.includes('این استراتژی به فروش دارایی پایه نیاز دارد'));
  check('بک‌تست قیمت دستی تحویل‌شده را پس از بازسازی تاریخ و ترکیب می‌نشاند',
    backtest67.includes('manualEntry = Object.fromEntries(Object.entries(plan.manualEntry || {})')
    && backtest67.includes('if (Object.keys(manualEntry).length) paintSnapshots();'));
  check('موقعیت دستی که در فهرست خودکار نیست، با همان قراردادها بازسازی می‌شود',
    backtest67.includes('function exactHandoffCombo(plan, entryDate)')
    && backtest67.includes('contracts.find((contract) => String(contract.ins) === String(ins))')
    && backtest67.includes('موقعیت دقیق تحلیل تاریخی افزوده شد'));
  check('تحویل کامل خودکار اجرا می‌شود و تحویل ناقص فقط هشدار می‌دهد',
    backtest67.includes('if (!skipped.length && plan.autoRun)')
    && backtest67.includes('await runBacktest();')
    && backtest67.includes("skipped.join('؛ ')"));
}
