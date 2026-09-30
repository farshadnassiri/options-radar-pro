// ۳۰۴. ممیزی عددی ۳۰ سپتامبر — هشت یافته روی دادهٔ رسمی TSETMC
//
// ممیزیِ مستقل (۱۷۸۰ قرارداد، ۱۲ نمونهٔ رسمی، ۳٬۰۱۶ ریزمعاملهٔ ضفزر729)
// نشان داد مسیر دیده‌بان درست است ولی هشت جای دیگر نه. شش تا را دستهٔ
// ۳۰۳ نمی‌گرفت. قاعدهٔ این دسته از خود ممیزی است: «آزمون باید از JSON
// واقعی عبور کند»، نه فقط تابع خالص با شیءِ دست‌ساز.
//
// F01 ارزش ریزمعامله بی اندازهٔ قرارداد (سنجش درون‌روزی، شمع خروجی)
// F02 نوار پایه با نام اشتباهِ پارامتر به ریزمعامله نمی‌رسید
// F03 `NaN` → JSON `null` → `Number(null)` صفر: IV نامعلوم «صفر» رسم می‌شد
// F04 میدانِ نیامده و نوارِ نرسیده، صفرِ «معامله نشد» می‌ساختند
// F05 پایانی از مظنه ساخته می‌شد
// F07 امضای ردیف `yesterdayOP` را نمی‌دید
// F08 واحد حجم و قیمت کنار کندل

import { check, group, readSrc } from '../harness.mjs';
import { markAt, applyIntradayMark } from '../../core/intraday-mark.mjs';
import { historyMarketMetrics } from '../../core/history.mjs';
import { liveOptionTape, marketBreadthSnapshot } from '../../core/live-market.mjs';
import { buildChain } from '../../core/chain.mjs';
import {
  decisionDashboardSnapshot, marketMapSummary, reviveDashboardUniverse, contractAnalytics,
} from '../../core/decision-dashboard.mjs';
import { numOrNaN } from '../../core/num.mjs';
import { WATCH_TRACK, diffWatchRows } from '../../core/watch-snapshot.mjs';
import { dataExportPairs, discoverDataExportInstruments } from '../../core/data-export.mjs';
import { buildDataExportSheets } from '../../ui/data-export-workbook.mjs';

const hms = (second) => (Math.floor(second / 3600) * 10000)
  + (Math.floor((second % 3600) / 60) * 100) + (second % 60);
const viaJson = (value) => JSON.parse(JSON.stringify(value));

// ردیف دیده‌بان هم‌شکل پاسخ واقعی (میدان‌هایی که `buildChain` می‌خواند)
const watchRow = (over = {}) => ({
  uaInsCode: 'UA1', lval30_UA: 'فزر', pDrCotVal_UA: 80000, pClosing_UA: 80100, priceYesterday_UA: 79000,
  qTotCap_UA: 0, qTotTran5J_UA: 0, zTotTran_UA: 0,
  insCode_C: '2650251901841248', lVal18AFC_C: 'ضفزر729', insCode_P: 'P729', lVal18AFC_P: 'طفزر729',
  strikePrice: 75000, remainedDay: 20, endDate: '20261020', contractSize: 1000,
  pDrCotVal_C: 76999, pClosing_C: 83493, priceYesterday_C: 66417, pMeDem_C: 76000, pMeOf_C: 77000,
  qTitMeDem_C: 5, qTitMeOf_C: 5, qTotTran5J_C: 12591, zTotTran_C: 3016, qTotCap_C: 1051266669000,
  oP_C: 12011, yesterdayOP_C: 11000,
  pDrCotVal_P: 1000, pClosing_P: 1000, priceYesterday_P: 1100, pMeDem_P: 990, pMeOf_P: 1010,
  qTitMeDem_P: 3, qTitMeOf_P: 3, qTotTran5J_P: 10, zTotTran_P: 2, qTotCap_P: 10000000,
  oP_P: 50, yesterdayOP_P: 40,
  ...over,
});

group('۳۰۴. F01 — سنجش درون‌روزی: ارزش با اندازهٔ همان پا');
{
  const trades = [
    { time: 90010, price: 90000, quantity: 10, canceled: false },
    { time: 100000, price: 80000, quantity: 5, canceled: false },
  ];
  const mark = markAt(trades, 10 * 3600 + 1800);
  const raw = 10 * 90000 + 5 * 80000;
  check('`markAt` جمعِ بی‌اندازه را با نام خودش می‌دهد، نه «ارزش»',
    mark.rawValue === raw && mark.value === undefined);
  const marked = applyIntradayMark({ C1: [{ date: 20260930, close: 1, vol: 1, value: 999 }] },
    { C1: mark }, { date: 20260930, second: 10 * 3600 + 1800 });
  const row = marked.series.C1.find((r) => r.date === 20260930);
  check('ردیف سنجش ادعای «ارزش رسمی» ندارد و جمع نوار جدا می‌رود',
    row.value === 0 && row.tapeValue === raw);
  const sized = historyMarketMetrics(row, { size: 1000 });
  check('ارزش پا = جمع نوار × اندازهٔ قرارداد، و برآورد نیست',
    sized.value === raw * 1000 && sized.valueEstimated === false && sized.valueKnown === true);
  const unsized = historyMarketMetrics(row, { size: 0 });
  check('اندازهٔ نامعلوم ارزش نامعلوم می‌دهد، نه عددِ هزار برابر کم',
    Number.isNaN(unsized.value) && unsized.valueKnown === false);
  check('سهم پایه با اندازهٔ ۱ همان جمع نوار است', historyMarketMetrics(row, { size: 1 }).value === raw);

  const radar = readSrc('../core/radar-metrics.mjs');
  const bt = readSrc('../ui/tabs/backtest.mjs');
  check('فیلتر ارزش رادار و کارت پای آزمایشگاه اندازهٔ قرارداد را می‌فرستند',
    radar.includes("historyMarketMetrics(rowByIns[String(leg.ins)], { size: num(leg.size, 0) || size })")
    && bt.includes("historyMarketMetrics(row, { size: leg.kind === 'underlying' ? 1 : Number(leg.size) || 0 })"));
}

group('۳۰۴. F01 — شمع خروجی: ستون «ارزش (ریال)» ارزش واقعی است');
{
  const roster = [{
    uaInsCode: 'BASE', lval30_UA: 'فزر', activeFrom: 20260901, activeTo: 20260910,
    expiryGregorian: 20260910, strikePrice: 75000, contractSize: 1000,
    insCode_C: 'CALL1', lVal18AFC_C: 'ضفزر729',
  }];
  const instruments = discoverDataExportInstruments(roster, ['BASE']);
  const pairs = dataExportPairs(instruments, [20260901]);
  const tick = (step) => ({ time: hms(9 * 3600 + step * 10), sequence: step + 1, price: 80000, quantity: 2, canceled: false, canceledKnown: true });
  const items = {
    '20260901:CALL1': { rows: Array.from({ length: 6 }, (_, s) => tick(s)), source: 'history' },
    '20260901:BASE': { rows: Array.from({ length: 6 }, (_, s) => tick(s)), source: 'history' },
  };
  const base = { instruments, pairs, items, range: { from: 20260901, to: 20260901 }, complete: true, frame: 'm5' };
  const sheet = buildDataExportSheets({ ...base, derived: true }).find((p) => p.name === 'ضفزر729');
  const col = (name) => sheet.headers.indexOf(name);
  const bar = sheet.rows[0];
  check('ستون اصلی = قیمت × حجم × ۱۰۰۰',
    bar[col('ارزش (ریال)')] === 6 * 2 * 80000 * 1000, String(bar[col('ارزش (ریال)')]));
  check('جمع بی‌اندازه فقط در ستون مشتق و با نام «خام»',
    bar[col('ارزش خام (ریال)')] === 6 * 2 * 80000 && col('ارزش با اندازه قرارداد (ریال)') < 0);
  const baseSheet = buildDataExportSheets(base).find((p) => p.name === 'پایه فزر');
  check('سهم پایه اندازهٔ ۱ دارد', baseSheet.rows[0][baseSheet.headers.indexOf('ارزش (ریال)')] === 6 * 2 * 80000);
  const noSize = buildDataExportSheets({ ...base, instruments: instruments.map((i) => (i.kind === 'underlying' ? i : { ...i, size: 0 })) })
    .find((p) => p.name === 'ضفزر729');
  check('اندازهٔ نامعلوم، ارزش شمع را خالی می‌گذارد',
    Number.isNaN(noSize.rows[0][noSize.headers.indexOf('ارزش (ریال)')]));
}

group('۳۰۴. F02 — نوار پایه به ریزمعاملهٔ اختیار می‌رسد');
{
  const trades = [{ sequence: 1, time: 90500, price: 80000, quantity: 1, canceled: false, canceledKnown: true }];
  const baseTrades = [{ sequence: 1, time: 90100, price: 400000, quantity: 1, canceled: false, canceledKnown: true }];
  const contract = { ins: 'C1', kind: 'call', strike: 350000, days: 20, size: 1000 };
  const settings = { dayCountYear: 365, rFree: 0.3, divYield: 0, ivLo: 0.01, ivHi: 5 };
  const tape = liveOptionTape({ trades, baseTrades, contract, settings });
  check('با نام درست، قیمت پایهٔ هم‌زمان می‌نشیند', tape[0].basePrice === 400000);
  let threw = '';
  try { liveOptionTape({ trades, underlyingTape: baseTrades, contract, settings }); } catch (e) { threw = e.message; }
  check('نام اشتباه (همان `underlyingTape` قدیمی) بلند شکست می‌خورد، نه بی‌صدا', threw.includes('underlyingTape'));
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('داشبورد نوار خام پایه را با `baseTrades` می‌فرستد',
    dash.includes('liveOptionTape({ trades: optionRows, baseTrades: baseRows,') && !dash.includes('underlyingTape:'));
}

group('۳۰۴. F03 — نامعلوم پس از JSON نامعلوم می‌ماند');
{
  check('`numOrNaN` صفر نمی‌سازد',
    Number.isNaN(numOrNaN(null)) && Number.isNaN(numOrNaN(undefined)) && Number.isNaN(numOrNaN(''))
    && numOrNaN(0) === 0 && numOrNaN('12') === 12);
  // قرارداد روز سررسید (روز مانده صفر): IV واقعاً ندارد
  const snap = decisionDashboardSnapshot([watchRow({ remainedDay: 0 })], {});
  const before = snap.contracts.find((c) => c.name === 'ضفزر729');
  check('پیش از JSON، IV نامعلوم است', Number.isNaN(before.ivPct));
  const wire = viaJson(snap);
  check('روی سیم `null` می‌شود — همان چیزی که `Number()` صفرش می‌کرد',
    wire.contracts.find((c) => c.name === 'ضفزر729').ivPct === null);
  const revived = reviveDashboardUniverse(wire).contracts.find((c) => c.name === 'ضفزر729');
  check('مرز داشبورد `NaN` را برمی‌گرداند', Number.isNaN(revived.ivPct) && Number.isFinite(revived.strike));
  const raw = wire.contracts.find((c) => c.name === 'ضفزر729');
  const analytics = contractAnalytics(raw, { yearDays: 365 });
  check('حتی بی مرز، علت نبود تلاطم پاک نمی‌شود و یونانی روی IV صفر ساخته نمی‌شود',
    analytics.ivWhyText !== '' && !Number.isFinite(analytics.delta));
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('لبخند تلاطم و پراکنش‌ها `null` را صفر نمی‌خوانند، و پاسخ پیش از مصرف احیا می‌شود',
    dash.includes('y: numOrNaN(row.ivPct)') && dash.includes('x: numOrNaN(row[xKey]), y: numOrNaN(row[yKey])')
    && dash.includes('next.universe = reviveDashboardUniverse(next.universe);')
    && dash.includes('Number.isFinite(numOrNaN(row.oiYday))'));
}

group('۳۰۴. F04 — «داده نرسید» صفرِ «معامله نشد» نمی‌سازد');
{
  const partial = watchRow();
  delete partial.qTotCap_C; delete partial.oP_C;
  const chain = buildChain([partial]);
  const quote = chain.get('UA1').expiryList[0].strikeList[0].call;
  check('زنجیره نام میدان‌های نیامده را می‌گوید', quote.missing.includes('value') && quote.missing.includes('oi'));
  check('ردیف کامل هیچ میدانی کم ندارد',
    buildChain([watchRow()]).get('UA1').expiryList[0].strikeList[0].call.missing.length === 0);

  const snap = decisionDashboardSnapshot([partial], {});
  const c = snap.contracts.find((row) => row.name === 'ضفزر729');
  check('قرارداد: ارزش و موقعیت باز نامعلوم، حجم معلوم', Number.isNaN(c.value) && Number.isNaN(c.oi) && c.volume === 12591);
  const ex = snap.expiries[0];
  check('جمع سررسید نامعلوم است و تعداد کم‌آمده را می‌گوید',
    Number.isNaN(ex.value) && ex.missing.value === 1 && Number.isFinite(ex.volume));
  const ua = snap.underlyings[0];
  check('جمع پایه: کال نامعلوم، پوت معلوم', Number.isNaN(ua.callValue) && ua.putValue === 10000000 && Number.isNaN(ua.value));
  const summary = marketMapSummary(reviveDashboardUniverse(viaJson(snap)));
  check('جمع بازار پس از JSON هم نصفه ساخته نمی‌شود',
    Number.isNaN(summary.optionValue) && summary.missing.optionValue === 1 && summary.optionVolume === 12601);
  const full = marketMapSummary(reviveDashboardUniverse(viaJson(decisionDashboardSnapshot([watchRow()], {}))));
  check('با دادهٔ کامل همان جمع رسمی', full.optionValue === 1051266669000 + 10000000 && full.missing.optionValue === 0);

  const breadth = marketBreadthSnapshot([
    { ins: 'A', last: 100, yday: 90, volume: 5, value: 500, trades: 1 },
    { ins: 'B', last: 100, yday: 110, volume: NaN, value: NaN, trades: NaN, tapeFailed: true },
  ]);
  check('نوار نرسیده «نامعلوم» است نه «بی‌معامله»، و شمرده می‌شود',
    breadth.untraded === 0 && breadth.unknown === 1 && breadth.tapeFailed === 1 && breadth.positiveValue === 500);
  const server = readSrc('../server/server.mjs');
  check('سرور شکست نوار پایه را «نامعلوم» می‌فرستد',
    server.includes('return { ...item, volume: NaN, value: NaN, trades: NaN, tapeFailed: true };'));
  const map = readSrc('../ui/live-market-map.mjs');
  check('خلاصهٔ نقشه با نوار نرسیده جمع پایه‌ها را نامعلوم می‌گذارد',
    map.includes('(tapeFailed ? NaN : breadthValue)'));
}

group('۳۰۴. F05 — پایانی و آخرین از مظنه ساخته نمی‌شوند');
{
  const noPrice = watchRow({ pDrCotVal_C: 0, pClosing_C: 0, pMeDem_C: 123, pMeOf_C: 130 });
  const quote = buildChain([noPrice]).get('UA1').expiryList[0].strikeList[0].call;
  check('بی پایانی رسمی، پایانی صفر (نیامد) است نه تقاضای ۱۲۳', quote.close === 0 && quote.bid === 123);
  const c = decisionDashboardSnapshot([noPrice], {}).contracts.find((row) => row.name === 'ضفزر729');
  check('داشبورد «آخرین» را نامعلوم می‌گذارد و منشأ ندارد',
    Number.isNaN(c.last) && c.lastSource === '' && Number.isNaN(c.changePct));
  const closeOnly = decisionDashboardSnapshot([watchRow({ pDrCotVal_C: 0 })], {}).contracts.find((row) => row.name === 'ضفزر729');
  check('اگر معامله نبود ولی پایانی رسمی بود، منشأ «پایانی» صریح است',
    closeOnly.last === 83493 && closeOnly.lastSource === 'close' && Number.isNaN(closeOnly.tradeLast));
  const traded = decisionDashboardSnapshot([watchRow()], {}).contracts.find((row) => row.name === 'ضفزر729');
  check('و با معامله، آخرین همان معامله است', traded.last === 76999 && traded.lastSource === 'trade');
}

group('۳۰۴. F07 — امضای ردیف هر میدانی را که زنجیره می‌خواند می‌بیند');
{
  const chainSrc = readSrc('../core/chain.mjs');
  const sided = [...chainSrc.matchAll(/r\[`([A-Za-z0-9]+)_\$\{sfx\}`\]/g)].map((m) => m[1]).filter((f) => f !== 'insCode');
  const ua = [...chainSrc.matchAll(/r\.([A-Za-z0-9]+_UA)\b/g)].map((m) => m[1]);
  const missing = [...new Set([...sided.flatMap((f) => [`${f}_C`, `${f}_P`]), ...ua])].filter((k) => !WATCH_TRACK.includes(k));
  check('هیچ میدانِ خوانده‌شده‌ای بیرون از امضا نیست', sided.length >= 12 && missing.length === 0, missing.join(', '));
  const row = watchRow();
  const first = diffWatchRows([row]);
  for (const key of ['yesterdayOP_C', 'qTotCap_C', 'zTotTran_C', 'priceYesterday_P']) {
    check(`تغییر تنهای ${key} رویداد می‌سازد`, diffWatchRows([{ ...row, [key]: Number(row[key]) + 1 }], first.byKey).changed.length === 1);
  }
}

group('۳۰۴. F08 — واحد هر عدد کنار کندل');
{
  const map = readSrc('../ui/live-market-map.mjs');
  check('حجم و موقعیت باز کندل «قرارداد» دارند',
    map.includes('`${fmt.int(Number(row[rangeSort]))} قرارداد`'));
  check('واحد قیمت‌های کندل گفته می‌شود', map.includes('قیمت‌ها: ریال، برای هر واحد دارایی پایه'));
  check('آمار کل بازار واحد شمارش دارد',
    map.includes("stat('حجم اختیار (قرارداد)'") && map.includes("stat('موقعیت باز (قرارداد)'"));
}
