// ۳۲۹. تب کندل، دور دوم (۱۴۰۵/۰۷/۱۵): دستگیره‌ها، پرت‌ها، توزیع دقیق، خلاصه،
// سربه‌سر وزنی زنجیره، و تب «کندل بازار در گذشته».

import { check, group, near, readSrc } from '../harness.mjs';
import {
  sliderScale, applyRanges, outlierIds, robustExtent, histogram, stepDecimals, describe, moneynessClass,
  candleSummary, sumKnown, chainBreakevens, chainKey, candleRecord, SLIDER_STEPS,
} from '../../core/contract-candles.mjs';
import { contractBreakeven } from '../../core/decision-dashboard.mjs';
import { daysBack, pastUnderlyings, buildPastDay, loadPastDay } from '../../ui/contract-candles-past.mjs';

group('۳۲۹. دستگیرهٔ کشویی: مقیاس لگاریتمی با جای صفر');
{
  const sc = sliderScale([0, 10, 1000, 1e6, 1e9], true);
  check('صفرِ واقعی در جای ۰ و کوچک‌ترین مثبت بلافاصله پس از آن', sc.toPos(0) === 0 && sc.toPos(10) === 1 && sc.toValue(0) === 0);
  check('دو سر مسیر همان کمینه و بیشینه', sc.toValue(SLIDER_STEPS) === 1e9 && sc.toPos(1e9) === SLIDER_STEPS);
  const mid = sc.toValue(sc.toPos(1e6));
  check('رفت‌وبرگشت در دقت یک گام دستگیره (لگاریتمی)', Math.abs(Math.log10(mid) - 6) < 0.02);
  const pos = [0, 100, 300, 600, 900, 1000].map((p) => sc.toValue(p));
  check('مقیاس یکنوا است', pos.every((v, i) => i === 0 || v >= pos[i - 1]));
  const lin = sliderScale([-20, 0, 30], false);
  check('میدان منفی‌پذیر خطی می‌ماند', !lin.log && lin.toValue(500) === 5);
  check('بی عدد، دستگیره نمی‌سازد', sliderScale([NaN, null], true) === null);
}

group('۳۲۹. بازهٔ دستگیره‌ها: «نمی‌دانیم» در بازه نیست');
{
  const recs = [{ ins: 'a', value: 5, oi: 1 }, { ins: 'b', value: 50, oi: NaN }, { ins: 'c', value: 500, oi: 3 }];
  const r = applyRanges(recs, { value: { lo: 10, hi: null } });
  check('کف ارزش', r.kept.map((x) => x.ins).join() === 'b,c' && r.cut === 1 && r.unknown === 0);
  const u = applyRanges(recs, { oi: { lo: 0, hi: 2 } });
  check('بی‌عدد کنار می‌رود و جدا شمرده می‌شود', u.kept.map((x) => x.ins).join() === 'a' && u.unknown === 1 && u.cut === 1);
  check('بی دستگیرهٔ فعال همه می‌مانند', applyRanges(recs, { value: { lo: null, hi: null } }).kept.length === 3);
}

group('۳۲۹. کندل پرت: حذف خودکار و مقیاس مقاوم');
{
  const recs = Array.from({ length: 30 }, (_, i) => ({
    ins: String(i), kind: 'call', valid: true,
    points: { change: { first: 0, last: i - 15, low: i - 18, high: i - 12, close: i - 15 } },
  }));
  recs.push({ ins: 'X', kind: 'call', valid: true, points: { change: { first: 0, last: 900, low: 0, high: 1200, close: 900 } } });
  check('کندل +۱۲۰۰٪ پرت است و بقیه نه', outlierIds(recs, 'change', { log: true }).join() === 'X');
  check('کمتر از هشت کندل، حصاری ساخته نمی‌شود', outlierIds(recs.slice(0, 5), 'change').length === 0);
  const ext = robustExtent(recs, 'change', { log: false });
  check('مقیاس مقاوم کندل پرت را بیرون می‌گذارد ولی بقیه را نه', ext.hi < 900 && ext.hi >= 17 && ext.lo <= -18);
}

group('۳۲۹. توزیع دقیق: لبه‌های گرد، [از، تا)، همه شمرده');
{
  check('رقم اعشار گام', stepDecimals(2.5) === 1 && stepDecimals(0.25) === 2 && stepDecimals(10) === 0 && stepDecimals(0.1) === 1);
  const mk = (v, i, extra = {}) => ({ ins: String(i), name: `c${i}`, kind: i % 2 ? 'put' : 'call', uaIns: 'U', uaName: 'u', endDate: 'd', value: 10 + i, moneynessPct: i - 10, points: { change: { first: 0, last: v, low: v, high: v, close: v } }, ...extra });
  const recs = [0, 2.5, 2.5, 5, 7.4, 7.5, 9.9].map((v, i) => mk(v, i));
  const h = histogram(recs, { bins: 4, tails: 0, kde: false });
  check('گام ۲٫۵ و لبه‌ها بی خطای ممیز شناور', h.step === 2.5 && h.bars.every((b) => Number(b.from.toFixed(1)) === b.from));
  const bar = (v) => h.bars.find((b) => b.kind === 'bin' && v >= b.from && v < b.to);
  check('عددِ روی لبه به بازهٔ بالایی می‌رود', bar(2.5).items.length === 2 && bar(2.5).from === 2.5 && bar(7.5).items.some((x) => x.value === 7.5));
  check('جمع همهٔ میله‌ها = شمار', h.bars.reduce((a, b) => a + b.total, 0) === recs.length && h.count === recs.length);
  const w = histogram(recs, { bins: 4, tails: 0, weight: 'value', kde: false });
  check('وزن ارزش: جمع میله‌ها = جمع ارزش', w.total === recs.reduce((a, r) => a + r.value, 0) && w.bars.reduce((a, b) => a + b.total, 0) === w.total);
  check('میانگین وزنی کنار میانگین ساده', Number.isFinite(w.stats.wMean) && w.stats.wMean !== w.stats.mean);
  const g = histogram(recs, { bins: 4, tails: 0, groupBy: 'moneyness', kde: false });
  check('گروه در/به/خارج از پول', g.groups.every((x) => ['در سود', 'به پول (±۲٪)', 'خارج از پول'].includes(x.label)));
  check('رده‌بندی پول از دید دارنده', moneynessClass({ kind: 'call', moneynessPct: -10 }) === 'itm' && moneynessClass({ kind: 'put', moneynessPct: -10 }) === 'otm' && moneynessClass({ kind: 'put', moneynessPct: 1 }) === 'atm');
  const many = Array.from({ length: 60 }, (_, i) => mk(Math.sin(i) * 10, i));
  const k = histogram(many, { bins: 10, tails: 0 });
  const area = k.kde.reduce((a, [, y], i, arr) => (i ? a + ((y + arr[i - 1][1]) / 2) * (arr[i][0] - arr[i - 1][0]) : a), 0) / k.step;
  check('چگالی هم‌مقیاس میله‌هاست (سطح زیر منحنی ≈ شمار)', Math.abs(area - 60) < 6);
  const d = describe([1, 2, 3, 4, 100]);
  check('آمار توصیفی', d.median === 3 && d.n === 5 && d.skew > 1 && d.q1 === 2 && d.q3 === 4);
  check('پهنای دستی بازه', histogram(recs, { binWidth: 1, tails: 0, kde: false }).step === 1);
  const cut = histogram([...many, mk(500, 99)], { bins: 10, tails: 0.02, kde: false });
  check('برش دنباله: پرت در میلهٔ لبه می‌ماند، گم نمی‌شود', cut.outside >= 1 && cut.bars.reduce((a, b) => a + b.total, 0) === 61);
}

group('۳۲۹. خلاصهٔ زیر نمودار: جمعِ نصفه با نام کمبود');
{
  const recs = [
    { kind: 'call', name: 'a', value: 10, oi: 100, oiChange: 20, ivPct: 30, volume: 5, trades: 2, points: { change: { last: 5 } } },
    { kind: 'put', name: 'b', value: 30, oi: 50, oiChange: -10, ivPct: 40, volume: 7, trades: 3, points: { change: { last: -2 } } },
    { kind: 'put', name: 'c', value: NaN, oi: NaN, points: { change: { last: 1 } } },
  ];
  const s = candleSummary(recs);
  check('جمع ارزش فقط از موجودها، با شمار جاافتاده', s.value.sum === 40 && s.value.missing === 1);
  check('تغییر موقعیت باز نسبت به دیروز همان قراردادها', s.oiChange === 10 && Math.abs(s.oiChangePct - (10 / 140) * 100) < 1e-9);
  check('نسبت پوت به کال ارزش', s.putCallValue === 3);
  check('بیشترین رشد و افت', s.topGainer.name === 'a' && s.topLoser.name === 'b');
  near('تغییر وزنی با ارزش', s.valueWeightedChange, (5 * 10 - 2 * 30) / 40, 1e-12);
  check('بی هیچ عدد، جمع نامعلوم است نه صفر', Number.isNaN(sumKnown([{ value: NaN }], 'value').sum));
}

group('۳۲۹. سربه‌سر و سربه‌سر وزنی زنجیره');
{
  const rows = [
    { ins: '1', uaIns: 'U', endDate: 'd', kind: 'call', strike: 100, last: 10, value: 3, spot: 105, trades: 1 },
    { ins: '2', uaIns: 'U', endDate: 'd', kind: 'call', strike: 120, last: 5, value: 1, spot: 105, trades: 1 },
    { ins: '3', uaIns: 'U', endDate: 'd', kind: 'call', strike: 130, last: 2, value: 0, spot: 105, trades: 0 },
    { ins: '4', uaIns: 'U', endDate: 'd', kind: 'put', strike: 100, last: 4, value: 2, spot: 105, trades: 1 },
  ];
  const chains = chainBreakevens(rows);
  const call = chains.get('U:d:call');
  // همان وزن ارزش؛ قرارداد بی‌معامله وزن ندارد.
  near('سربه‌سر وزنی کال = (۱۱۰×۳ + ۱۲۵×۱) / ۴', call.value, (110 * 3 + 125 * 1) / 4, 1e-12);
  check('بی‌معامله وزن ندارد و سمت پوت جداست', call.count === 2 && chains.get('U:d:put').value === 96);
  const rec = candleRecord(rows[0], { chainBe: chains.get(chainKey(rows[0])) });
  check('سربه‌سر قرارداد همان قاعدهٔ زنجیره', rec.breakeven === contractBreakeven(rows[0]) && rec.breakeven === 110);
  // پیش از این ستون «تا سربه‌سر» از ردیف عکس خوانده می‌شد که آن را ندارد.
  near('فاصله تا سربه‌سر از خود ردیف ساخته می‌شود', rec.breakevenGapPct, ((110 - 105) / 105) * 100, 1e-9);
  near('فاصله از سربه‌سر وزنی', rec.beVsChain, 110 - call.value, 1e-12);
  near('همان به درصد', rec.beVsChainPct, (110 / call.value - 1) * 100, 1e-12);
}

group('۳۲۹. کندل بازار در گذشته');
{
  check('شمار روز برای فهرست روزانه', daysBack(20260901, 20261007) === 46 && daysBack(20261008, 20261007) === 0);
  // ردیف هم‌شکل `/api/history/universe` و ردیف روزانه هم‌شکل `/api/dailies`.
  const D = 20260915;
  const rows = [{
    uaInsCode: 'U', lval30_UA: 'اهرم', strikePrice: 10000, remainedDay: 30, endDate: 20261015, expiryGregorian: 20261015, contractSize: 1000,
    insCode_C: 'C', lVal18AFC_C: 'ضهرم۱', insCode_P: 'P', lVal18AFC_P: 'طهرم۱',
  }];
  const day = (o) => ({ date: D, hEven: 0, first: 0, low: 0, high: 0, last: 0, close: 0, yday: 0, vol: 0, trades: 0, value: 0, ...o });
  const dailies = {
    U: { rows: [day({ date: D - 1, close: 9000, last: 9000 }), day({ first: 9900, low: 9800, high: 10200, last: 10000, close: 10050, yday: 9800, vol: 1e6, trades: 500, value: 1e10 })] },
    C: { rows: [day({ first: 520, low: 480, high: 640, last: 600, close: 590, yday: 500, vol: 120, trades: 30, value: 72e6 })] },
    P: { rows: [] },
  };
  const built = buildPastDay(rows, dailies, D, { dayCountYear: 365, rFree: 0.3, ivLo: 0.01, ivHi: 5 });
  const c = built.payload.universe.contracts.find((r) => r.ins === 'C');
  check('ردیف همان روز (نه روز دیگر) قیمت قرارداد را می‌دهد', c && c.tradeLast === 600 && c.close === 590 && c.yday === 500 && c.value === 72e6);
  check('اولین/کمینه/بیشینه از همان ردیف روزانه', built.infos.C.low === 480 && built.infos.C.high === 640 && built.infos.U.high === 10200);
  check('قرارداد بی ردیف آن روز، قیمتی نمی‌گیرد', !built.infos.P && built.coverage.legsPriced === 1);
  check('روز تاریخی «امروز» خوانده نمی‌شود', built.payload.session.current === false && built.payload.historyDate === D);
  const rec = candleRecord(c, { info: built.infos.C, settings: { dayCountYear: 365, rFree: 0.3, ivLo: 0.01, ivHi: 5 } });
  check('کندل همان روز معتبر است و پاسخ هم‌جلسه پذیرفته می‌شود', rec.valid && rec.rangeSource === 'info' && rec.low === 480);
  check('فهرست نمادهای آن روز', pastUnderlyings(rows)[0].name === 'اهرم' && pastUnderlyings(rows)[0].contracts === 2);

  const urls = [];
  const fetcher = async (url) => { urls.push(url); return { ok: true, json: async () => dailies }; };
  const got = await loadPastDay({ date: D, rows, underlyings: ['U'], today: 20261007, fetcher, settings: {} });
  check('درخواست روزانه منبع تک‌روزهٔ همان تاریخ را هم می‌خواهد', urls.length === 1 && urls[0].includes(`asOf=${D}`) && urls[0].includes('n=32'));
  check('نتیجهٔ بارگذاری همان ساختار', got.requested === 3 && got.failed === 0 && got.infos.C.first === 520);
  const failing = async () => { throw new Error('قطع'); };
  const bad = await loadPastDay({ date: D, rows, today: 20261007, fetcher: failing, settings: {} });
  check('خطای دسته شمرده می‌شود و چیزی ساخته نمی‌شود', bad.failed === 3 && Object.keys(bad.infos).length === 0);
}

group('۳۲۹. سیم‌کشی رابط');
{
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  const view = readSrc('../ui/contract-candles-view.mjs');
  const css = readSrc('../ui/style.css');
  check('تب «کندل بازار در گذشته» با حالت past', dash.includes("id: 'candles-past', title: 'کندل بازار در گذشته'") && dash.includes("mode: 'past'") && dash.includes('if (mode?.candlesPast) { candlesPast().paint(); return; }'));
  check('پوت توخالی نیست و رنگ جدا از توکن دارد', !view.includes('hollow') && view.includes("'--candle-put-up'") && /--candle-put-up: var\(--cmp1\);[\s\S]*--candle-put-up: var\(--cmp1\);/.test(css));
  check('دستگیره‌ها هم‌زمان اعمال می‌شوند (رویداد input، یک بار در فریم)', view.includes("if (el.dataset.ccvRange) {") && view.includes('paintSoon();'));
  check('کلیک = حذف، حذف خودکار، بازگرداندن', view.includes('if (opts.clickRemove) { hide(r.ins); return; }') && view.includes('data-ccv-auto-outliers') && view.includes('data-ccv-unhide-all'));
  // دور سوم: میله دیگر شبکهٔ جدا ندارد، لایهٔ پشت همان کادر است (آزمون ۳۳۰).
  check('میله با همان بزرگ‌نمایی کندل‌ها', view.includes("renderItem: renderBar") && view.includes("xAxisIndex: [0]"));
  check('آیکون ذخیرهٔ تصویر و تمام‌صفحه بالای نمودار مادر', view.includes("icon('camera')") && view.includes("icon('expand')"));
  // دور سوم: «ارتفاع نمودار» و «کندل در هر نما» به خواستهٔ صاحب پروژه برداشته شد.
  check('ارتفاع و کندل در هر نما دیگر نیست', !view.includes('data-ccv="perView"') && !view.includes('data-ccv="height"'));
  check('سربه‌سر وزنی زنجیره در راهنمای هاور', view.includes('سربه‌سر وزنی زنجیره') && view.includes('فاصله از سربه‌سر وزنی'));
  check('حالت گذشته هیچ‌وقت /api/infos نمی‌زند', view.includes('if (past || fetching || !isVisible()) return;'));
}
