// ۱۷۲. هویت تاریخچه هنگام تغییر سریع نماد پایه

import { check, group, readSrc } from '../harness.mjs';
import { createPortfolioHistoryRequestGate } from '../../ui/portfolio-history-request.mjs';
import { loadMomentContracts } from '../../ui/portfolio-snapshot-data.mjs';

const row172 = (baseIns, contractIns, name) => ({
  uaInsCode: baseIns, lval30_UA: name, pClosing_UA: 10_000,
  strikePrice: 10_000, remainedDay: 20, endDate: 20260720, contractSize: 1000,
  insCode_C: `${contractIns}-call`, lVal18AFC_C: `${name}-خرید`, pClosing_C: 50,
  insCode_P: `${contractIns}-put`, lVal18AFC_P: `${name}-فروش`, pClosing_P: 60,
});

group('۱۷۲. هویت تاریخچه هنگام تغییر سریع نماد پایه');
{
  const gate172 = createPortfolioHistoryRequestGate();
  const first172 = gate172.begin('111');
  const second172 = gate172.begin('222');
  check('پاسخ دیررس نماد اول پس از آغاز نماد دوم پذیرفته نمی‌شود',
    !gate172.accepts(first172, '222') && gate172.accepts(second172, '222'));
  check('حتی بلیت تازه برای نماد دیگری حق رنگ‌کردن تقویم ندارد',
    !gate172.accepts(second172, '333'));
  gate172.invalidate();
  check('پاک‌کردن انتخاب، آخرین پاسخ در راه را هم باطل می‌کند',
    !gate172.accepts(second172, '222'));

  const rows172 = [
    row172('111', 'one', 'نماد یک'),
    row172('222', 'two', 'نماد دو'),
    row172('333', 'three', 'نماد سه'),
  ];
  const makeGate172 = () => ({
    snapshot: async (ins) => (ins === '444' ? null : ({
      quote: { book: { bids: [{ price: 40, qty: 10 }], asks: [{ price: 41, qty: 10 }] } },
      trade: { close: ins === '222' ? 10_000 : 50 },
    })),
  });
  const session172 = { id: 'pt-multi-symbol-172', baseIns: '222' };
  const at172 = { date: 20260622, second: 36_000 };
  const loaded172 = await loadMomentContracts(session172, at172, {
    days: [at172.date], universe: async () => ({ archived: true, rows: rows172 }),
    makeGate: makeGate172,
  });
  check('snapshot از فهرست مخلوط فقط قراردادهای نماد جاری را می‌گیرد',
    loaded172.ok && loaded172.rows.length === 2
    && loaded172.rows.every((row) => row.ins.startsWith('two-')));
  const absent172 = await loadMomentContracts({ ...session172, baseIns: '444' }, at172, {
    days: [at172.date], universe: async () => ({ archived: true, rows: rows172 }),
    makeGate: makeGate172,
  });
  check('نبود نماد جاری با قرارداد نماد دیگر پر نمی‌شود',
    !absent172.ok && absent172.rows.length === 0 && absent172.spot === null);

  const tab172 = readSrc('../ui/tabs/portfolio-time.mjs');
  check('تب پاسخ را پیش از تغییر dates با نسل و هویت نماد می‌سنجد',
    tab172.indexOf('if (!historyRequests.accepts(ticket, base.value)) return;')
      < tab172.indexOf('dates = nextDates;'));
  check('تغییر نماد تاریخ‌های قبلی و draft وابسته را همان لحظه پاک می‌کند',
    /base\.onchange = \(\) => \{[\s\S]{0,220}?historyRequests\.invalidate\(\);[\s\S]{0,180}?resetHistoryDates\(\);[\s\S]{0,180}?invalidateSetupDraft\(\)/.test(tab172)
    && /function resetHistoryDates\(\)[\s\S]{0,220}?pt-start-date[\s\S]{0,120}?pt-end-date/.test(tab172));
  check('نماد تغییرنکرده درخواست تاریخ تکراری نمی‌سازد',
    /if \(!ins \|\| ins === loadedIns\) return;/.test(tab172));
  check('بستن تب پاسخ‌های در راه را باطل می‌کند',
    /return \(\) => \{\s*historyRequests\.invalidate\(\);/.test(tab172));
}
