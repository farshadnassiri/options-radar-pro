import { check, group, readSrc } from '../harness.mjs';
import { handoffRange } from '../../ui/handoff.mjs';
import { loadHistoricalDailies } from '../../ui/history-dailies.mjs';

group('۲۱۷. انتقال قرارداد سررسیدشده به آزمایشگاه');
const plan = { to: 'backtest', entryDate: 20240622, exitDate: 20240918 };
check('بازهٔ قدیمی به مقصد می‌رسد، حتی در رصد زنده',
  JSON.stringify(handoffRange({ ...plan, live: true })) === JSON.stringify({ from: 20240622, to: 20240918 }));
check('انتقال خودکار و مقصد دیگر بازهٔ ساختگی ندارند',
  handoffRange({ ...plan, entryDate: 'auto' }) === null
  && handoffRange({ ...plan, to: 'greeks-watch' }) === null
  && handoffRange({ ...plan, entryDate: 20250101 }) === null);

const baseRows = [{ date: 20240918, last: 18000 }, { date: 20240622, last: 17000 }];
const optionRows = [{ date: 20240622, last: 2500 }, { date: 20240918, last: 200 }];
const calls = [];
const fakeFetch = async (url) => {
  calls.push(url);
  const params = new URL(url, 'http://localhost').searchParams;
  return { ok: true, json: async () => Object.fromEntries(params.get('ins').split(',').map((ins) => [ins,
    ins === 'base' ? { rows: baseRows } : ins === 'broken' ? { rows: [], error: 'upstream timeout' }
      : ins === 'empty' ? { rows: [] } : { rows: params.has('asOf') ? optionRows : [] },
  ])) };
};
const loaded = await loadHistoricalDailies(['base', 'put', 'call', 'empty', 'broken'], 'base', fakeFetch);
check('قیمت ورود و خروج قرارداد سررسیدشده از منبع دوم بازسازی می‌شود',
  loaded.seriesByIns.put === optionRows && loaded.seriesByIns.call === optionRows);
check('فقط ابزار خالی با آخرین روز واقعی پایه دوباره درخواست می‌شود',
  calls.length === 2 && calls[1] === '/api/dailies?ins=put,call,empty&n=0&asOf=20240918');
check('نبود معامله و خطای دریافت جدا می‌مانند',
  loaded.seriesByIns.empty.length === 0 && !loaded.errors.empty && loaded.errors.broken === 'upstream timeout');
const fallbackFailed = await loadHistoricalDailies(['base', 'put'], 'base', async (url) => ({
  ok: true, json: async () => url.includes('asOf=')
    ? { put: { rows: [], fallbackError: 'history timeout' } } : { base: { rows: baseRows }, put: { rows: [] } },
}));
check('خرابی منبع دوم به فاقد معامله تبدیل نمی‌شود', fallbackFailed.errors.put === 'history timeout');
let withoutBaseCalls = 0;
await loadHistoricalDailies(['base', 'put'], 'base', async () => {
  withoutBaseCalls++;
  return { ok: true, json: async () => ({ base: { rows: [] }, put: { rows: [] } }) };
});
check('بدون تاریخ واقعی پایه، روز مرجع اختراع نمی‌شود', withoutBaseCalls === 1);

const destination = readSrc('../ui/tabs/backtest.mjs');
check('مقصد پیش از فهرست قراردادها بازهٔ تحویل را روی کنترل می‌نشاند',
  destination.includes('initialRange: handoffRange(state.handoff)')
  && destination.indexOf('initialRange: handoffRange(state.handoff)') < destination.indexOf('await loadUniverseForRange(rangeUi.range)'));
check('مقصد از بارگیر دارای منبع دوم و خطای پاهای الزامی استفاده می‌کند',
  destination.includes('await loadHistoricalDailies(codes, ua.ins)')
  && destination.includes('await loadHistory({ requiredIns: plan.legIns })')
  && destination.includes('loaded.errors[ins]'));
check('پای سهم در انتقال همه به‌عنوان قرارداد آپشن فرستاده نمی‌شود',
  readSrc('../ui/tabs/portfolio-backtest.mjs').includes("legIns: item.legs.filter((leg) => leg.kind !== 'underlying').map((leg) => String(leg.ins))"));
