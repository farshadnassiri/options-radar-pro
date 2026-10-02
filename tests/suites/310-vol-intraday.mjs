// ۳۱۰. تلاطم ضمنی درون‌روزی — مظنهٔ لحظه، شاخص لحظه، دانه‌ها و مقایسه‌ها
//
// بازار ساختگیِ بلک‌شولز با تلاطم معلوم و زمانِ معاملاتی؛ هر ادعا یکی از
// بندهای پذیرش تسک است:
//   آ۲  پرشِ خرید و فروش: تلاطمِ معامله‌محور می‌پرد، تلاطمِ میانه ثابت است
//   آ۳  صف: پایهٔ در صف شاخص نمی‌سازد؛ دامنهٔ نامعلوم «نامعلوم» است
//   آ۴  نشت: رویدادِ بعد از لحظه مظنهٔ لحظه را عوض نمی‌کند
//   آ۵  دانه‌ها: ۱۵/۳۰/۶۰ دقیقه = مقدار ۵ دقیقهٔ پایان سطل؛ تلاطم یک قرارداد
//       از موتور شاخص = موتور تلاطم پاها، با ورودی و مبنای یکسان
//   آ۶  کهنگی: مظنهٔ کهنه کنار می‌رود؛ همه کهنه → شاخص خالی با علت
//   آ۱۰ هم‌ساعت و بازگشایی: حمل حداکثر ده دقیقه با سن، بیشتر خالی

import { check, group, near, readSrc } from '../harness.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { defaults } from '../../core/settings.mjs';
import { quoteAt } from '../../core/moment-quote.mjs';
import { legIvPct } from '../../core/leg-iv.mjs';
import { fitSmile } from '../../core/chain-compare.mjs';
import { volTime } from '../../core/vol-clock.mjs';
import {
  intradayContext, contractIvAt, ivIndexAt, sampleGrain, dayClose, openPoint, valueAt, dayStats,
  sameTime, sameTimeSummary, intradayRealized, realizedSoFar, intradaySignature,
} from '../../core/vol-intraday.mjs';
import { momentsFor } from '../../core/intraday-grid.mjs';

const settings = defaults();
const OPEN = 32400, CLOSE = 45000;
const ctx = intradayContext(settings, { holidaysKnown: true });
const DATE = 20261005;                      // دوشنبه
const NEAR = 20261021, FAR = 20261118;      // ۱۲ و ۳۲ روز معاملاتی بعد
const S = 10000;
const yearsAt = (second, expiry, c = ctx) => volTime({ date: DATE, second }, expiry, {
  basis: c.params.basis, settings, calendar: c.calendar, expiryMoment: c.params.expiryMoment,
}).years;

/** زنجیرهٔ ساختگی: هر قرارداد مظنهٔ دوطرفهٔ متقارن حول قیمت نظری. */
function chain(second, { sigma = () => 0.6, spreadPct = 2, recordAt = second, spot = S, expiries = [NEAR, FAR] } = {}) {
  const out = [];
  for (const expiry of expiries) {
    const T = yearsAt(second, expiry);
    for (let K = 8500; K <= 11500; K += 500) {
      for (const kind of ['call', 'put']) {
        const mid = bsPrice(kind, spot, K, T, settings.rFree, 0, sigma(K, expiry));
        const half = (mid * spreadPct) / 200;
        out.push({
          ins: `${kind}${expiry}_${K}`, kind, strike: K, expiry,
          quote: quoteAt({ record: { at: recordAt, bid: mid - half, ask: mid + half }, second, maxAgeSec: 900 }),
        });
      }
    }
  }
  return out;
}
const base = (over = {}) => ({ price: S, priceSource: 'trade', ageSec: 0, queue: { key: 'normal', known: true }, ...over });

group('۳۱۰-الف. مظنهٔ لحظه');
{
  const q = quoteAt({ record: { at: OPEN + 100, bid: 100, ask: 110, last: 108, lastAt: OPEN + 50 }, second: OPEN + 200 });
  check('میانه از دفتر دوطرفه و سالم', q.mid === 105 && q.priceSource === 'mid' && q.bookAge === 100 && q.lastAge === 150);
  const one = quoteAt({ record: { at: OPEN, bid: 100, ask: 0, last: 104, lastAt: OPEN + 10 }, second: OPEN + 60 });
  check('دفتر یک‌سمته: آخرین معامله با برچسب «جایگزین»', one.health === 'oneSided' && one.price === 104 && one.priceSource === 'fallback');
  const crossed = quoteAt({ record: { at: OPEN, bid: 120, ask: 110 }, second: OPEN + 1 });
  check('دفتر متقاطع میانه نمی‌سازد', crossed.health === 'crossed' && !Number.isFinite(crossed.price));
  const old = quoteAt({ record: { at: OPEN, bid: 100, ask: 110, last: 105, lastAt: OPEN }, second: OPEN + 2000, maxAgeSec: 900 });
  check('آ۶ دفتر و معاملهٔ کهنه: هیچ قیمتی، با علت', !Number.isFinite(old.price) && old.health === 'stale' && old.why === 'stale');
  const future = quoteAt({ record: { at: OPEN + 500, bid: 100, ask: 110 }, second: OPEN + 100 });
  check('آ۴ عکسِ بعد از لحظه وارد نمی‌شود', !Number.isFinite(future.price) && future.source === '');
  const events = [
    { level: 1, second: OPEN + 10, bid: 100, ask: 110, bidQty: 5, askQty: 5, refIdKnown: true },
    { level: 1, second: OPEN + 400, bid: 200, ask: 210, bidQty: 5, askQty: 5, refIdKnown: true },
  ];
  check('آ۴ رویداد دفترِ بعد از لحظه مظنه را عوض نمی‌کند', quoteAt({ book: events, second: OPEN + 300 }).mid === 105
    && quoteAt({ book: events, second: OPEN + 400 }).mid === 205);
  const trades = [{ time: 90100, price: 101, quantity: 1 }, { time: 90900, price: 999, quantity: 1 }];
  check('معامله‌محور: آخرین معاملهٔ تا همان ثانیه', quoteAt({ trades, second: OPEN + 300, basis: 'trade' }).price === 101);
}

group('۳۱۰-ب. شاخص یک لحظه — تلاطم معلوم برمی‌گردد');
{
  const second = OPEN + 3600;
  const idx = ivIndexAt({ at: { date: DATE, second }, base: base(), observations: chain(second) }, ctx);
  check('شاخص = σ واقعی (۶۰٪)', near(idx.ivPct, 60, 1e-4), idx.ivPct?.toFixed(5));
  check('نوار خرید تا فروش دو طرف شاخص', idx.bidPct < idx.ivPct && idx.askPct > idx.ivPct, `${idx.bidPct?.toFixed(2)} تا ${idx.askPct?.toFixed(2)}`);
  check('دو سررسیدِ دو طرف افق ۲۰ روز معاملاتی', idx.expiries.length === 2 && !idx.flags.includes('nearestExpiry'), idx.expiries.join('،'));
  check('چولگی و شیب زمانی در لبخند تخت صفرند', Math.abs(idx.skewPct) < 1e-3 && Math.abs(idx.termSlope) < 1e-3);
  check('سری هر قرارداد در همان گذر ساخته می‌شود', idx.contracts.length === 28 && idx.contracts.every((c) => Number.isFinite(c.ivMid)));
  check('فاصله از لبخند در لبخند تخت صفر است', idx.contracts.filter((c) => Number.isFinite(c.smileResidual)).every((c) => Math.abs(c.smileResidual) < 1e-3));

  // چولگی ساختگی: تلاطم با فاصله از پایه بالا می‌رود.
  const smile = (K) => 0.6 + 0.8 * (K / S - 1) ** 2 + 0.2 * (K / S - 1);
  const skewed = ivIndexAt({ at: { date: DATE, second }, base: base(), observations: chain(second, { sigma: smile }) }, ctx);
  check('چولگی: تلاطم ۱۱۰٪ پایه منهای در پول، مثبت در لبخند صعودی', skewed.skewPct > 1 && near(skewed.ivPct, 60, 0.2), skewed.skewPct?.toFixed(3));
  const smileCtx = intradayContext(settings, { holidaysKnown: true, atm: 'smile' });
  const fitted = ivIndexAt({ at: { date: DATE, second }, base: base(), observations: chain(second, { sigma: smile }) }, smileCtx);
  check('روش برازش لبخند هم در پول را نزدیک ۶۰ می‌دهد', Math.abs(fitted.ivPct - 60) < 1.5, fitted.ivPct?.toFixed(3));

  // سمت خارج از پول: پایه بین دو اعمال (۱۰٬۲۰۰)، پس اعمالِ ۱۰٬۰۰۰ در
  // درون‌یابی هست. کالِ در پولِ ۱۰٬۰۰۰ با قیمتِ ۳۰٪ گران‌تر شاخص را
  // جابه‌جا می‌کرد اگر وارد می‌شد؛ پوتِ خارج از پولِ همان اعمال وارد می‌شود.
  const spot = 10200;
  const noisy = chain(second, { spot }).map((o) => {
    if (o.kind !== 'call' || o.strike !== 10000) return o;
    const mid = bsPrice('call', spot, 10000, yearsAt(second, o.expiry), settings.rFree, 0, 0.6) * 1.3;
    return { ...o, quote: quoteAt({ record: { at: second, bid: mid * 0.99, ask: mid * 1.01 }, second }) };
  });
  const otm = ivIndexAt({ at: { date: DATE, second }, base: base({ price: spot }), observations: noisy }, ctx);
  check('پیش‌فرض فقط خارج از پول: کالِ در پولِ پرت بی‌اثر است', near(otm.ivPct, 60, 1e-4), otm.ivPct?.toFixed(4));
  const both = ivIndexAt({ at: { date: DATE, second }, base: base({ price: spot }), observations: noisy }, intradayContext(settings, { holidaysKnown: true, side: 'both' }));
  check('با «هر دو سمت»، همان کالِ پرت شاخص را جابه‌جا می‌کند (آزمون دندان دارد)', Math.abs(both.ivPct - 60) > 1, both.ivPct?.toFixed(3));
  check('در پولِ پرت در سری قراردادها می‌ماند، با فاصلهٔ بزرگ از لبخند', (() => {
    const c = otm.contracts.find((row) => row.kind === 'call' && row.strike === 10000 && row.expiry === NEAR);
    return !!c && (!Number.isFinite(c.ivPct) || Math.abs(c.smileResidual) > 1);
  })());
}

group('۳۱۰-ج. آ۲ پرشِ خرید و فروش؛ آ۳ صف؛ آ۶ کهنگی');
{
  // یک قرارداد در پول، فاصلهٔ ۵٪، معامله‌ها یک در میان روی خرید و فروش.
  // مظنه در هر لحظه با زمانِ همان لحظه قیمت می‌خورد (فرسایش واقعی)؛
  // معامله یک بار روی خرید و بار بعد روی فروش.
  const K = 10000;
  const quoteFor = (second) => {
    const mid = bsPrice('call', S, K, yearsAt(second, NEAR), settings.rFree, 0, 0.6);
    return { bid: mid * 0.975, ask: mid * 1.025 };
  };
  const ivAt = (second, side, basis) => {
    const { bid, ask } = quoteFor(second);
    return contractIvAt({
      ins: 'x', kind: 'call', strike: K, expiry: NEAR,
      quote: quoteAt({ record: { at: second, bid, ask, last: side === 'ask' ? ask : bid, lastAt: second }, second, basis }),
    }, base(), { date: DATE, second }, ctx).ivPct;
  };
  const tradeIvs = [OPEN + 3600, OPEN + 3900].map((s, i) => ivAt(s, i % 2 ? 'ask' : 'bid', 'trade'));
  const midIvs = [OPEN + 3600, OPEN + 3900].map((s, i) => ivAt(s, i % 2 ? 'ask' : 'bid', 'mid'));
  check('تلاطم معامله‌محور حدود سه واحد می‌پرد', Math.abs(tradeIvs[1] - tradeIvs[0]) > 2.5, `${(tradeIvs[1] - tradeIvs[0]).toFixed(2)} واحد`);
  check('تلاطم میانه ثابت می‌ماند', Math.abs(midIvs[1] - midIvs[0]) < 0.05, `${(midIvs[1] - midIvs[0]).toFixed(4)}`);

  const second = OPEN + 3600;
  const q = ivIndexAt({ at: { date: DATE, second }, base: base({ queue: { key: 'buyQueue', known: true } }), observations: chain(second) }, ctx);
  check('آ۳ پایه در صف خرید: شاخص خالی با علت', !Number.isFinite(q.ivPct) && q.why === 'queue');
  const u = ivIndexAt({ at: { date: DATE, second }, base: base({ queue: { key: 'buyQueue', known: false } }), observations: chain(second) }, ctx);
  check('آ۳ دامنهٔ نامعلوم: شاخص ساخته می‌شود با پرچم «نامعلوم»، نه «عادی»', Number.isFinite(u.ivPct) && u.flags.includes('queueUnknown'));
  const h = ivIndexAt({ at: { date: DATE, second }, base: base({ queue: { key: 'halted', known: true } }), observations: chain(second) }, ctx);
  check('آ۳ توقف: شاخص خالی', h.why === 'queue');
  const stale = ivIndexAt({ at: { date: DATE, second }, base: base(), observations: chain(second, { recordAt: second - 2000 }) }, ctx);
  check('آ۶ همهٔ مظنه‌ها کهنه: شاخص خالی با علت «کهنه»', !Number.isFinite(stale.ivPct) && stale.why === 'stale' && stale.flags.includes('staleDropped'));
  const staleBase = ivIndexAt({ at: { date: DATE, second }, base: base({ ageSec: 5000 }), observations: chain(second) }, ctx);
  check('قیمت پایهٔ کهنه: شاخص خالی', staleBase.why === 'staleBase');
  check('قیمت پایه از معامله علامت می‌خورد', ivIndexAt({ at: { date: DATE, second }, base: base(), observations: chain(second) }, ctx).flags.includes('baseTrade'));
}

group('۳۱۰-د. آ۵ دانه‌ها و یک عدد در دو موتور');
{
  const m5 = momentsFor('m5');
  const points = m5.map((second, i) => ({ second, value: 50 + i }));
  for (const grain of ['m15', 'm30', 'm60']) {
    const sampled = sampleGrain(points, grain);
    check(`دانهٔ ${grain}: مقدار ۵ دقیقهٔ پایان هر سطل`, sampled.every((pt) => pt.value === points.find((p5) => p5.second === pt.second).value && !pt.carried));
  }
  const holes = points.filter((pt) => pt.second % 900 !== 0);      // پایان هر ربع خالی
  const carried = sampleGrain(holes, 'm15');
  check('پایانِ سطل خالی: آخرینِ درونِ همان سطل، با «حمل» و سن — نه میانگین',
    carried.every((pt) => pt.empty || (pt.carried && pt.ageSec === 300)));
  check('سطلِ تماماً خالی، خالی می‌ماند', sampleGrain([], 'm60').every((pt) => pt.empty));
  check('نقطهٔ روزانه = آخرین لحظهٔ جلسه', dayClose(points).second === CLOSE && dayClose(points).value === points.at(-1).value);

  // یک قرارداد، یک لحظه، یک قیمت: موتور شاخص با مبنای روز تقویمی = موتور پاها.
  const calCtx = intradayContext(settings, { holidaysKnown: true, volTimeBasis: 'calendarDays' });
  const price = 812.5;
  const fromIndex = contractIvAt({ ins: 'x', kind: 'call', strike: 10500, expiry: NEAR, quote: quoteAt({ record: { at: OPEN, bid: price, ask: price }, second: OPEN + 60 }) },
    base(), { date: DATE, second: OPEN + 60 }, calCtx).ivPct;
  const fromLegs = legIvPct({ kind: 'call', strike: 10500 }, { spot: S, price, days: 16 }, { rFree: settings.rFree, divYield: 0, yearDays: settings.dayCountYear, ivLo: settings.ivLo, ivHi: settings.ivHi });
  check('آ۵ تلاطم یک قرارداد: موتور شاخص = موتور پاها با مبنای یکسان', near(fromIndex, fromLegs, 1e-9), `${fromIndex?.toFixed(6)} / ${fromLegs?.toFixed(6)}`);
  check('برازش لبخند بی وزن همان رفتار پیشین است', (() => {
    const pts = [{ x: -0.1, y: 62 }, { x: 0, y: 60 }, { x: 0.05, y: 61 }, { x: 0.1, y: 63 }];
    const a = fitSmile(pts), b = fitSmile(pts.map((p) => ({ ...p, w: 1 })));
    return a.coef.every((c, i) => near(c, b.coef[i], 1e-12));
  })());
  check('امضای پارامترها با تغییر مبنای زمان عوض می‌شود', intradaySignature(ctx) !== intradaySignature(calCtx));
}

group('۳۱۰-ه. آ۱۰ بازگشایی، هم‌ساعت، آمار روز');
{
  const day = (offset, skip = []) => momentsFor('m5').filter((s) => !skip.includes(s)).map((second, i) => ({ second, value: 40 + offset + i * 0.1 }));
  const today = day(10);
  check('بازگشایی پس از ۱۵ دقیقهٔ اول', openPoint(today, { skipSec: 900 }).second === OPEN + 900 + 300 || openPoint(today, { skipSec: 900 }).second === OPEN + 900);
  check('تنظیم دقایق اول، بازگشایی را جابه‌جا می‌کند', openPoint(today, { skipSec: 0 }).second === OPEN + 300 && openPoint(today, { skipSec: 1800 }).second === OPEN + 1800);
  const gap = day(0, [OPEN + 3600, OPEN + 3900, OPEN + 4200, OPEN + 4500]);
  check('هم‌ساعتِ بی‌مقدار تا ده دقیقه حمل می‌شود، با سن', valueAt(gap, OPEN + 3900).ageSec === 600 && valueAt(gap, OPEN + 3900).carried);
  check('بیشتر از ده دقیقه: خالی', valueAt(gap, OPEN + 4200) === null);
  const short = momentsFor('m5').filter((s) => s <= OPEN + 7200).map((second) => ({ second, value: 45 }));
  const st = sameTime([{ date: 20261003, points: day(0) }, { date: 20261004, points: short }], OPEN + 3600);
  check('روزِ جلسهٔ کوتاه علامت می‌خورد', !st[0].shortSession && st[1].shortSession);
  const summary = sameTimeSummary([40, 42, 44, 46, 48], 47);
  check('صدک هم‌ساعت: اکنون میان روزهای قبل', summary.n === 5 && summary.median === 44 && summary.percentile === 80);
  const stats = dayStats(today, { skipSec: 900 });
  check('آمار روز: باز، آخر، سقف، کف و جای اکنون در دامنه', stats.high === today.at(-1).value && stats.low === today[0].value && stats.nowPct === 100 && stats.change > 0);
}

group('۳۱۰-و. تحقق‌یافتهٔ درون‌روزی، با جزء شبانه');
{
  const path = (start, moves) => moves.reduce((acc, r, i) => [...acc, { second: OPEN + 300 * (i + 1), price: acc.length ? acc.at(-1).price * Math.exp(r) : start }], []);
  const moves = Array.from({ length: 42 }, (_, i) => (i % 2 ? 0.004 : -0.004));
  const d1 = path(10000, moves), d2 = path(d1.at(-1).price * Math.exp(0.02), moves);
  const rv = intradayRealized([{ date: 1, points: d1 }, { date: 2, points: d2 }], { stepSec: 300, tradingDaysYr: 240, sessionLength: 12600 });
  const perDay = 41 * 0.004 ** 2 * (12600 / (41 * 300));
  check('واریانس جلسه از بازده‌های ۵ دقیقه‌ای، بسط به کل جلسه', near(rv.days[0].intradayVar, perDay, 1e-9));
  check('بازده شبانه جزء جداست و حذف نمی‌شود', near(rv.days[1].overnightVar, 0.0004, 1e-9) && !Number.isFinite(rv.days[0].overnightVar));
  check('سهم واریانس شبانه گزارش می‌شود', near(rv.overnightShare, (0.0004 / (perDay + 0.0004)) * 100, 1e-6), rv.overnightShare?.toFixed(2));
  const queued = d1.map((pt, i) => (i === 10 ? { ...pt, queue: true } : pt));
  check('لحظهٔ صف کنار می‌رود و روز «بریده» علامت می‌خورد', intradayRealized([{ date: 1, points: queued }]).days[0].cut === true);
  check('تحقق‌یافتهٔ امروز تا اکنون', Number.isFinite(realizedSoFar(d1.slice(0, 10)).rvPct) && realizedSoFar(d1.slice(0, 10)).returns === 9);
}

group('۳۱۰-ز. مرز مسیر');
{
  const src = readSrc('../core/vol-intraday.mjs');
  check('موتور درون‌روزی از همان تکه‌های شاخص روزانه می‌خواند', src.includes("import { expiryAtmIv, interpolateVariance, quantile, percentileOf } from './vol-rank.mjs';"));
  check('دانهٔ درشت میانگین نمی‌گیرد', !/mean\(.*sampleGrain|reduce\(\(a, b\) => a \+ b.*\/ list\.length.*grain/.test(src) && src.includes('آخرین مقدار معتبرِ همان'));
}
