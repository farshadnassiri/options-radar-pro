// ۳۲۸. تب «کندل قیمت امروز قراردادها» — نمودار مادر، تلاطم کندلی، توزیع (۱۴۰۵/۰۷/۱۵)
//
// خواستهٔ صاحب پروژه: کندل امروز به تب جدا، با نمودار مادرِ همهٔ کندل‌ها
// روی یک محور قابل مقایسه (لگاریتمی)، شاخص قابل انتخاب (از جمله تلاطم ضمنی
// به‌صورت کندلی از پنج قیمت)، گزینش نماد/سررسید/کال/پوت، نمودار میله‌ای
// «چند قرارداد در هر بازه» و خروجی کامل اکسل.

import { check, group, near, readSrc } from '../harness.mjs';
import {
  pairedUnderlying, underlyingDay, candleRecord, metricShape, metricValue, filterCandles, toAxis, fromAxis,
  logTicks, histogram, flagUnusual, candleNarrative, staleInfoIds, orderCandles, groupBands, candleStats,
  underlyingTurnover, CANDLE_METRICS,
} from '../../core/contract-candles.mjs';
import { liveQuoteIvSet, liveIvAt } from '../../core/live-market.mjs';
import { buildCandleSheets, CANDLE_EXPORT_HEADERS } from '../../ui/contract-candles-export.mjs';
import { fmt } from '../../ui/fmt.mjs';

const settings = { dayCountYear: 365, rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5 };
const params = { yearDays: 365, rFree: 0.3, divYield: 0, ivLo: 0.01 };
// شکل ردیف همان `decisionDashboardSnapshot` است: `spot` = آخرین پایه، `tradeLast` فقط معامله.
const ua = { ins: 'U', name: 'اهرم', tradeLast: 10000, last: 10000, close: 9900, yday: 9800, uaTrades: 500 };
const uaInfo = { first: 9850, low: 9700, high: 10100, last: 10000, close: 9900, yday: 9800, trades: 500 };
const contract = (over = {}) => {
  const row = {
    ins: 'C1', name: 'ضهرم۱', kind: 'call', uaIns: 'U', uaName: 'اهرم', endDate: '20261120', days: 40,
    strike: 10000, size: 1000, spot: 10000, tradeLast: 600, last: 600, close: 580, yday: 500, trades: 30,
    volume: 120, value: 72e6, oi: 900, bid: 590, ask: 610, moneynessPct: 0, ...over,
  };
  return { ...row, ...liveQuoteIvSet({ ...row, last: row.tradeLast }, row.spot, settings) };
};
const info = (over = {}) => ({ first: 520, low: 480, high: 640, last: 600, close: 580, yday: 500, trades: 30, ...over });
const uaDay = underlyingDay(ua, uaInfo, 10000);

group('۳۲۸. تلاطم کندلی: قیمت پایهٔ هم‌جهت برای هر نقطه');
{
  const rec = candleRecord(contract(), { info: info(), uaDay, settings, params });
  check('کندل معتبر از پنج قیمت', rec.valid && rec.low === 480 && rec.first === 520 && rec.last === 600 && rec.close === 580 && rec.high === 640);
  // یک عدد، دو مسیر: تلاطم نقطهٔ «آخرین» همان ستون تلاطم زنجیره است.
  near('تلاطم «آخرین» کندل = تلاطم آخرین معامله در زنجیره', rec.points.iv.last, contract().ivPct, 1e-9);
  check('کال: کمینه با کمینهٔ پایه، بیشینه با بیشینهٔ پایه', rec.ua.low === 9700 && rec.ua.high === 10100 && rec.ua.first === 9850 && rec.ua.close === 9900);
  near('تلاطم کمینه از جفت (۴۸۰، ۹۷۰۰)', rec.points.iv.low, liveIvAt({ kind: 'call', strike: 10000, days: 40 }, 9700, settings, 480).ivPct, 1e-9);
  const put = candleRecord(contract({ kind: 'put', ins: 'P1' }), { info: info(), uaDay, settings, params });
  check('پوت: کمینه با بیشینهٔ پایه، بیشینه با کمینهٔ پایه', put.ua.low === 10100 && put.ua.high === 9700);
  check('جدول جفت خالص هم همین را می‌گوید', pairedUnderlying('put', { low: 1, high: 2 }).low === 2 && pairedUnderlying('call', { low: 1, high: 2 }).low === 1);

  // پایه بی پاسخ اطلاعات: کمینه/بیشینه/اولینِ پایه نامعلوم‌اند و جایشان چیزی نمی‌نشیند.
  const blind = candleRecord(contract(), { info: info(), uaDay: underlyingDay(ua, null, 10000), settings, params });
  check('بی بازهٔ پایه، تلاطم کمینه/بیشینه/اولین ساخته نمی‌شود و علتش «قیمت پایه نامعلوم» است',
    ['low', 'high', 'first'].every((k) => Number.isNaN(blind.points.iv[k]) && blind.ivWhy[k] === 'noSpot'));
  near('ولی تلاطم آخرین همچنان هست', blind.points.iv.last, contract().ivPct, 1e-9);
  check('بی تلاطم «اولین» بدنه‌ای نیست و کندل تلاطم رسم نمی‌شود', metricShape(blind, 'iv') === null);
  const half = candleRecord(contract(), { info: info(), uaDay: underlyingDay(ua, { ...uaInfo, low: 0, high: 0 }, 10000), settings, params });
  const shape = metricShape(half, 'iv');
  check('کندل تلاطم ناقص نقطه‌های گمشده را نام می‌برد و سایه را از نقطه‌های موجود می‌سازد',
    shape && shape.missing.join() === 'low,high' && shape.low === Math.min(half.points.iv.first, half.points.iv.last, half.points.iv.close));
}

group('۳۲۸. کندل معتبر فقط با بازهٔ واقعی و معامله');
{
  check('بی پاسخ اطلاعات کندل نیست', !candleRecord(contract(), { info: null, uaDay, settings, params }).valid);
  check('قرارداد بی‌معامله کندل نیست', !candleRecord(contract({ trades: 0 }), { info: info({ trades: 0 }), uaDay, settings, params }).valid);
  check('پاسخ جلسهٔ دیگر کنار می‌رود', candleRecord(contract(), { info: info({ yday: 450 }), uaDay, settings, params }).rangeSource === 'otherSession');
  const rec = candleRecord(contract(), { info: info(), uaDay, settings, params });
  near('دامنهٔ روز = (بیشینه − کمینه) / پایانی دیروز', rec.dayRangePct, (160 / 500) * 100, 1e-9);
  near('جای آخرین در بازه', rec.dayPositionPct, (120 / 160) * 100, 1e-9);
  near('درصد تغییر آخرین', rec.points.change.last, 20, 1e-9);
  near('پریمیوم ٪ پایهٔ جفت', rec.points.premium.low, (480 / 9700) * 100, 1e-9);
  check('شاخص نقطه‌ای عدد ندارد → شکل ندارد', metricShape({ ...rec, delta: NaN }, 'delta') === null);
  check('بازهٔ تلاطم اجرایی از مظنه خرید تا فروش', (() => { const s = metricShape(rec, 'ivExec'); return s.low <= s.mark && s.mark <= s.high && s.low === Math.min(rec.ivBidPct, rec.ivAskPct); })());
  check('مقدار مرجع کندل «آخرین» است و نقطه قابل انتخاب', metricValue(rec, 'change') === rec.points.change.last && metricValue(rec, 'change', 'close') === rec.points.change.close);
}

group('۳۲۸. گزینش: نماد، سررسید هر نماد، نوع، حداقل ارزش، N برتر');
{
  const rows = [
    { ins: '1', uaIns: 'A', endDate: 'd1', kind: 'call', value: 10, trades: 1 },
    { ins: '2', uaIns: 'A', endDate: 'd2', kind: 'put', value: 50, trades: 1 },
    { ins: '3', uaIns: 'B', endDate: 'd1', kind: 'call', value: 30, trades: 1 },
    { ins: '4', uaIns: 'B', endDate: 'd2', kind: 'call', value: 40, trades: 0 },
  ];
  const ids = (list) => list.map((r) => r.ins).join(',');
  check('پیش‌فرض: فقط معامله‌شده‌ها', ids(filterCandles(rows)) === '1,2,3');
  check('سررسیدِ یک نماد فقط همان نماد را محدود می‌کند', ids(filterCandles(rows, { expiries: ['A:d2'] })) === '2,3');
  check('تاریخ کل بازار همه را محدود می‌کند', ids(filterCandles(rows, { dates: ['d1'] })) === '1,3');
  check('چند نماد', ids(filterCandles(rows, { underlyings: ['B'] })) === '3');
  check('فقط پوت', ids(filterCandles(rows, { side: 'put' })) === '2');
  check('حداقل ارزش', ids(filterCandles(rows, { minValue: 20 })) === '2,3');
  check('N برتر بر ارزش', ids(filterCandles(rows, { top: 2 })) === '2,3');
  const turnover = underlyingTurnover(rows);
  const a = turnover.find((u) => u.uaIns === 'A');
  check('ارزش کال و پوت هر نماد جدا جمع می‌شود', a.callValue === 10 && a.putValue === 50 && a.traded === 2 && a.expiries.join() === 'd1,d2');
}

group('۳۲۸. محور لگاریتمی: مقایسهٔ قیمت‌های ناهم‌اندازه');
{
  const up = toAxis('change', 100, true), down = toAxis('change', -50, true);
  near('+۱۰۰٪ و −۵۰٪ هم‌فاصله از صفرند', up, -down, 1e-12);
  check('صفر روی محور لگاریتمی همان صفر است', toAxis('change', 0, true) === 0);
  near('رفت و برگشت محور', fromAxis('change', toAxis('change', 37.5, true), true), 37.5, 1e-9);
  check('شاخصِ منفی‌پذیر (دلتا) لگاریتمی نمی‌شود', toAxis('delta', -0.4, true) === -0.4);
  check('صفر و منفی روی محور لگاریتمی رسم نمی‌شوند، ساخته هم نمی‌شوند', Number.isNaN(toAxis('iv', 0, true)) && Number.isNaN(toAxis('spreadPct', -1, true)));
  const ticks = logTicks('change', toAxis('change', -40, true), toAxis('change', 120, true)).map((t) => Math.round(fromAxis('change', t, true)));
  check('برچسب‌های گرد آشنا و داخل بازه', ticks.includes(0) && ticks.includes(100) && ticks.includes(-30) && !ticks.includes(200));
  check('همهٔ شاخص‌های درخواست‌شده در کاتالوگ', ['change', 'iv', 'premium', 'timeValue', 'dayRangePct', 'delta', 'effectiveLeverage', 'breakevenGapPct', 'spreadPct', 'oiChangePct', 'ivExec'].every((k) => CANDLE_METRICS.some((m) => m.key === k)));
}

group('۳۲۸. محور افقی و آمار');
{
  const recs = [
    { ins: '1', name: 'ب', uaIns: 'B', uaName: 'ب', endDate: 'd1', kind: 'call', strike: 2, moneynessPct: 5, value: 1 },
    { ins: '2', name: 'الف', uaIns: 'A', uaName: 'الف', endDate: 'd2', kind: 'put', strike: 1, moneynessPct: -5, value: 9 },
    { ins: '3', name: 'الف۲', uaIns: 'A', uaName: 'الف', endDate: 'd2', kind: 'call', strike: 3, moneynessPct: 0, value: 5 },
  ];
  check('گروهی: نماد ← سررسید ← کال پیش از پوت', orderCandles(recs, { xMode: 'grouped' }).map((r) => r.ins).join() === '3,2,1');
  check('فاصله اعمال', orderCandles(recs, { xMode: 'moneyness' }).map((r) => r.ins).join() === '2,3,1');
  check('رتبه بر ارزش', orderCandles(recs, { xMode: 'ranked', rankKey: 'value' }).map((r) => r.ins).join() === '2,3,1');
  const bands = groupBands(orderCandles(recs, { xMode: 'grouped' }));
  check('نوار گروه‌ها', bands.length === 2 && bands[0].from === 0 && bands[0].to === 1 && bands[1].from === 2);
  const stats = candleStats([
    { kind: 'call', points: { change: { first: 0, last: 10 } } }, { kind: 'call', points: { change: { first: 0, last: -20 } } },
    { kind: 'put', points: { change: { first: 0, last: 30 } } },
  ], 'change');
  check('آمار جدا برای کال و پوت', stats.call.count === 2 && stats.put.count === 1 && stats.all.positive === 2 && stats.all.negative === 1);
  check('آمار خالی عدد نمی‌سازد', Number.isNaN(candleStats([], 'change').all.median));
}

group('۳۲۸. نمودار میله‌ای: چند قرارداد در هر بازه');
{
  const recs = Array.from({ length: 40 }, (_, i) => ({
    ins: String(i), name: `c${i}`, kind: i % 2 ? 'put' : 'call', uaIns: `U${i % 4}`, uaName: `u${i % 4}`,
    points: { change: { first: 0, last: i * 3 - 30 + (i === 39 ? 500 : 0), low: -40, high: 60, close: 1 } },
  }));
  const h = histogram(recs, { metric: 'change', bins: 12 });
  const total = h.bars.reduce((s, b) => s + b.call + b.put, 0);
  check('هر قرارداد دقیقاً یک بار شمرده می‌شود', total === 40 && h.count === 40);
  check('دادهٔ پرت به سطل «بیشتر از» می‌رود و بازه‌ها را باز نمی‌کند', h.bars[h.bars.length - 1].kind === 'over' && h.bars[h.bars.length - 1].items[0].value > 400 && h.step <= 10);
  check('بازه‌ها گرد و پیوسته‌اند', h.bars.filter((b) => b.kind === 'bin').every((b, i, a) => i === 0 || b.from === a[i - 1].to));
  const u = histogram(recs, { metric: 'change', unit: 'underlying' });
  check('واحد نماد: هر نماد یک بار برای کال و یک بار برای پوت', u.count === 4);
  check('بی داده، میله‌ای ساخته نمی‌شود', histogram([], {}).bars.length === 0);
}

group('۳۲۸. غیرعادی نسبت به هم‌گروهان');
{
  const mk = (i, range) => ({ ins: String(i), uaIns: 'A', endDate: 'd', kind: 'call', dayRangePct: range, value: 10 });
  const group5 = [mk(1, 10), mk(2, 11), mk(3, 12), mk(4, 10), mk(5, 11), mk(6, 90)];
  check('دامنهٔ بیرون از حصار علامت می‌خورد', flagUnusual(group5).get('6')?.includes('dayRangePct') && !flagUnusual(group5).has('1'));
  check('گروه کمتر از پنج عضو حصار ندارد', flagUnusual(group5.slice(2)).size === 0);
}

group('۳۲۸. روایت به زبان معامله‌گر');
{
  const rec = candleRecord(contract(), { info: info(), uaDay, settings, params });
  const lines = candleNarrative([rec], { metric: 'iv', uaDays: [uaDay], f: fmt });
  check('روایت از گزینش خالی چیزی نمی‌سازد', candleNarrative([], { f: fmt }).length === 1);
  check('بی پوت، از تلاطم پوت عددی نمی‌گوید', lines.every((l) => !l.includes('پوت‌ها —')) && !lines.join(' ').includes('NaN'));
  check('رابطه با پایه گفته می‌شود', lines.some((l) => l.includes('نماد پایه اهرم')));
  check('قاعدهٔ جفت پایه و تقریبی بودن تلاطم کندلی گفته می‌شود', lines.some((l) => l.includes('هم‌جهت') && l.includes('تقریبی')));
  check('رقم‌ها فارسی‌اند', !/[0-9]/.test(lines.join(' ').replace(/ضهرم۱/g, '')));
}

group('۳۲۸. دریافت کمینه/بیشینه فقط برای کهنه‌ها');
{
  const cache = new Map([['a', { at: 1000 }], ['b', { at: 0 }]]);
  check('در مهلت فقط نیامده گرفته می‌شود', staleInfoIds(['a', 'b', 'c', 'a'], cache, 30_000, 60_000).join() === 'c');
  check('پس از مهلت کهنه‌ها هم', staleInfoIds(['a', 'b', 'c'], cache, 60_500, 60_000).join() === 'b,c');
  check('در مهلت، هیچ', staleInfoIds(['a'], cache, 2000, 60_000).length === 0);
  check('تکراری یک بار', staleInfoIds(['x', 'x'], new Map(), 0).length === 1);
}

group('۳۲۸. خروجی اکسل');
{
  const rec = candleRecord(contract(), { info: info(), uaDay, settings, params });
  const blind = candleRecord(contract({ ins: 'C2' }), { info: null, uaDay, settings, params });
  const sheets = buildCandleSheets({ records: [rec, blind], uaDays: [uaDay], filterLines: ['نوع: همه'], narrative: ['x'], at: 't' });
  check('چهار برگ', sheets.map((s) => s.name).join('|') === 'کندل قراردادها|آمار شاخص‌ها|نمادهای پایه|راهنما');
  check('هر ردیف هم‌اندازهٔ سرستون‌ها', sheets[0].rows.every((r) => r.length === CANDLE_EXPORT_HEADERS.length));
  const lowCol = CANDLE_EXPORT_HEADERS.indexOf('کمینه (ریال)');
  check('عدد نامعلوم خالی می‌ماند، نه صفر', sheets[0].rows[1][lowCol] === '' && sheets[0].rows[0][lowCol] === 480);
  check('آمار برای هر شاخص سه ردیف', sheets[1].rows.length === CANDLE_METRICS.length * 3);
}

group('۳۲۸. سیم‌کشی رابط');
{
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const view = readSrc('../ui/contract-candles-view.mjs');
  const map = readSrc('../ui/live-market-map.mjs');
  check('تب جدا با همین نام، پس از «نقشه و زنجیره»', /id: 'explorer'[\s\S]{0,400}id: 'candles', title: 'کندل قیمت امروز قراردادها'/.test(dash) && dash.includes('if (mode?.candles) { candles().paint(); return; }'));
  check('گزینش مستقل از نقشه', !view.includes('getSelection') && view.includes("data-ccv-ua=\"top-callValue\"") && view.includes("data-ccv-ua=\"top-putValue\""));
  check('کال، پوت یا هر دو', ['all', 'call', 'put'].every((v) => view.includes(`['${v}',`)));
  check('محور لگاریتمی پیش‌فرض است', /log: true/.test(view));
  check('نقشه و زنجیره دیگر کندل نمی‌گیرد', !map.includes('fetchInfos') && !map.includes('mountCandlePoints'));
  check('خروجی اکسل و تصویر', view.includes('data-ccv-export="xlsx"') && view.includes('data-ccv-export="png"'));
  check('رنگ نمودار فقط از توکن', !/#[0-9a-fA-F]{3,6}\b|rgba?\(/.test(view));
}
