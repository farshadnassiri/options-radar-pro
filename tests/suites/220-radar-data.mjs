import { check, group, readSrc } from '../harness.mjs';
import { buildChain } from '../../core/chain.mjs';
import { defaults } from '../../core/settings.mjs';
import { byId } from '../../strategies/catalog.mjs';
import { parseJalaliRange } from '../../core/history-range.mjs';
import { buildRadarHistory, radarDataReport } from '../../core/radar-history.mjs';
import { loadHistoricalDailies } from '../../ui/history-dailies.mjs';

group('۲۲۰. رادار؛ بازه، کیفیت داده و ورود مستقیم تاریخ');
const range = { from: 20240622, to: 20240918 };
const settings = defaults();
const ua = buildChain([16000, 20000].map((strike) => ({
  uaInsCode: '7', lval30_UA: 'اهرم', pDrCotVal_UA: 18000, pClosing_UA: 18000,
  insCode_C: `c${strike}`, lVal18AFC_C: `ض${strike}`, insCode_P: `p${strike}`, lVal18AFC_P: `ط${strike}`,
  strikePrice: strike, contractSize: 1000, remainedDay: 88, endDate: 20240918,
}))).get('7');
const daily = (date, close) => ({ date, close, last: close, vol: 1000, value: 1000000 });
const seriesByIns = {
  7: [daily(20100101, 12000), daily(range.from, 18000), daily(range.to, 18000), daily(20260903, 24000)],
  c16000: [daily(range.from, 3000), daily(range.to, 2500)],
  c20000: [daily(range.from, 800), daily(range.to, 600)],
  p16000: [], p20000: [],
};
const args = { ua, range, settings, seriesByIns, defs: [byId('bull-call-spread'), byId('bear-call-spread')] };
const built = await buildRadarHistory(args);
check('قدیمی‌ترین و جدیدترین روز خارج بازه وارد ساخت نمی‌شوند',
  built.dates.join(',') === '20240622,20240918' && built.rows.length === 2);
check('نمودار فقط روزهای همان بازه را دارد', built.rows.every((row) => row.series.points.every((p) => p.t >= range.from && p.t <= range.to)));
check('دو استراتژی روی یک جفت قرارداد هویت مستقل دارند', new Set(built.rows.map((row) => row.key)).size === 2);
const missingMark = await buildRadarHistory({ ...args, seriesByIns: { ...seriesByIns, c20000: [daily(range.from, 800)] } });
check('قیمت روز ورود جانشین قیمت گمشدهٔ سنجش نمی‌شود', missingMark.rows.length === 0 && missingMark.excluded.mark === 2);
const outside = await buildRadarHistory({ ...args, range: { from: 20250101, to: 20250102 } });
check('بازهٔ بدون تاریخ پایه، محاسبهٔ بیرون از بازه نمی‌سازد', outside.rows.length === 0 && outside.dates.length === 0);
let cancelled = false;
try { await buildRadarHistory({ ...args, cancel: () => true }); } catch { cancelled = true; }
check('اجرای لغوشده نتیجه منتشر نمی‌کند', cancelled);

const report = radarDataReport({ ua, range, settings, seriesByIns: { ...seriesByIns,
  c20000: [daily(20260903, 500)], p16000: [], p20000: [] }, errors: { p20000: 'timeout' } });
check('قیمت معتبر، بیرون بازه، پاسخ خالی و خطا از هم جدا هستند',
  report.items.map((row) => `${row.ins}:${row.status}`).sort().join('|') === 'c16000:ready|c20000:outside|p16000:empty|p20000:error');
check('سرشماری فقط قراردادهای همین نماد است', report.listed === 4 && report.ready === 1 && report.failed === 1);
const blocked = radarDataReport({ ua, range, seriesByIns, settings: { ...settings, blockedExpiries: '7:20240918' } });
check('کنارگذاشته به علت سقف پر از خطای داده جداست', blocked.blocked === 4 && blocked.requested === 0 && blocked.failed === 0);

check('ورود مستقیم فارسی به تاریخ میلادی درست تبدیل می‌شود',
  JSON.stringify(parseJalaliRange('۱۴۰۳/۰۴/۰۲', '۱۴۰۳/۰۶/۲۸', 20260904).range) === JSON.stringify(range));
check('رقم عربی و لاتین هم پذیرفته می‌شوند', parseJalaliRange('١٤٠٣/٤/٢', '1403-6-28', 20260904).ok);
check('روز نامعتبر، بازه وارونه و آینده رد می‌شوند',
  !parseJalaliRange('1403/7/31', '1403/8/1').ok
  && !parseJalaliRange('1402/12/30', '1403/1/1').ok
  && !parseJalaliRange('1403/6/28', '1403/4/2').ok
  && !parseJalaliRange('1403/4/2', '1403/6/28', 20240622).ok);

const progress = [];
const failedBatch = await loadHistoricalDailies(['7', '11'], '7', async () => { throw new Error('network unavailable'); },
  { tolerateErrors: true, onProgress: (p) => progress.push(p) });
check('شکست درخواست دسته‌ای نام هر ابزار را در خطا حفظ می‌کند',
  failedBatch.errors['7'] === 'network unavailable' && failedBatch.errors['11'] === 'network unavailable');
check('پیشرفت با پاسخ ناموفق هم به پایان بررسی می‌رسد', progress[0].done === 0 && progress.at(-1).done === 2);
const incomplete = await loadHistoricalDailies(['7', '11'], '7', async () => ({ ok: true, json: async () => ({ 7: { rows: [] } }) }));
check('ابزار حذف‌شده از پاسخ، خالیِ موفق خوانده نمی‌شود', !!incomplete.errors['11'] && !incomplete.errors['7']);
const controller = new AbortController(); controller.abort();
let abortKept = false;
try { await loadHistoricalDailies(['7'], '7', async () => { throw new Error('نباید فراخوانی شود'); }, { signal: controller.signal, tolerateErrors: true }); }
catch (error) { abortKept = error.name === 'AbortError'; }
check('توقف در حالت تحمل خطا هم به پاسخ خالی تبدیل نمی‌شود', abortKept);
const src = readSrc('../ui/tabs/spread-radar.mjs');
check('رابط خطای پاها را پیش از ساخت و پاسخ دیررس را پیش از نمایش کنترل می‌کند',
  src.includes('report.base.status === \'error\' || report.failed')
  && src.includes('if (!current()) return;') && src.includes('await buildRadarHistory('));
