// ۳۰۸. رتبه و صدک تلاطم ضمنی (IV Rank / IV Percentile) و تلاطم تاریخی
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۰): IVR و IVP، مقایسه با تلاطم تاریخی، و
// نمودار و جدول تعاملیِ رابطهٔ انواع تلاطم، در تبی جدا در رصد لحظه‌ای.
//
// قاعدهٔ این دسته: بازار ساختگی با Black–Scholes و یک مسیرِ **معلوم** تلاطم
// قیمت‌گذاری می‌شود، پس شاخص باید همان مسیر را دقیق پس بدهد. ورودی از همان
// شکلِ پاسخ روزانهٔ TSETMC می‌گذرد (`panelFromDay`)، از JSON رد می‌شود و
// بعد به موتور می‌رسد — نه شیءِ دست‌سازی که مستقیم به تابع خالص داده شود.

import { check, group, near, readSrc } from '../harness.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { defaults } from '../../core/settings.mjs';
import { panelFromDay, panelSlice } from '../../core/day-panel.mjs';
import {
  ivIndexOfDay, expiryAtmIv, volRank, logReturns, rollingHv, rollingParkinson, forwardRealized,
  volCone, volRegime, panelObservations, liveObservations, buildVolHistory, volRangeFor,
  volCorrelation, pearson, quantile, VOL_REGIMES,
} from '../../core/vol-rank.mjs';
import {
  volRegimeHtml, volKpiHtml, volCompareRows, volTableRows, volStatusText, gaugeOption,
  ivHvLineOption, coneOption, termOption, distOption, correlationOption, rankBands,
} from '../../ui/vol-rank-view.mjs';

const settings = defaults();
const YEAR = settings.dayCountYear;
const r = settings.rFree;
const g = (y, m, d) => y * 10000 + m * 100 + d;
const addDays = (date, n) => {
  const t = new Date(Date.UTC(Math.trunc(date / 10000), (Math.trunc(date / 100) % 100) - 1, date % 100) + n * 86400000);
  return g(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};
const dte = (from, to) => Math.round((Date.UTC(Math.trunc(to / 10000), (Math.trunc(to / 100) % 100) - 1, to % 100)
  - Date.UTC(Math.trunc(from / 10000), (Math.trunc(from / 100) % 100) - 1, from % 100)) / 86400000);
const tokens = {
  ink: '#000', muted: '#666', line: '#ccc', lineSoft: '#eee', panel: '#fff', panel2: '#f4f4f4',
  accent: '#06c', accentSoft: '#9cf', accent2: '#c60', warn: '#c90', warnSoft: '#fd9', gain: '#090', loss: '#c00',
  series: ['#1', '#2', '#3', '#4', '#5', '#6'],
};
const latin = (html) => /[0-9]/.test(String(html).replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' '));

// ═══ بازار ساختگی ═══
//
// ۳۰۰ روز معاملاتی (شنبه تا چهارشنبه). پایه با گام‌های قطعی (بی تصادف)
// حرکت می‌کند؛ تلاطم ضمنیِ «واقعی» روز i یک موج معلوم بین ۳۰ تا ۶۰ درصد
// است و همهٔ اعمال‌ها و سررسیدها با همان σ قیمت می‌خورند، پس شاخص در پولِ
// هر روز باید دقیقاً همان σ باشد.
const days = [];
for (let d = g(2025, 6, 1); days.length < 300; d = addDays(d, 1)) {
  const wd = new Date(Date.UTC(Math.trunc(d / 10000), (Math.trunc(d / 100) % 100) - 1, d % 100)).getUTCDay();
  if (wd !== 4 && wd !== 5) days.push(d);
}
const trueIv = days.map((_, i) => 0.45 + 0.15 * Math.sin(i / 23));
const spots = [];
let px = 10000;
days.forEach((_, i) => { px *= Math.exp(0.012 * Math.sin(i * 1.7) + 0.004 * Math.cos(i * 0.31)); spots.push(Math.round(px)); });
const baseRows = days.map((date, i) => ({ date, close: spots[i], last: spots[i], high: Math.round(spots[i] * 1.01), low: Math.round(spots[i] * 0.99), vol: 1e6, trades: 500 }));

// قراردادها: هر ماه یک سررسید، اعمال‌های پله‌ای ۵۰۰ ریالی. نام و نماد
// همان قالب دیده‌بان، تا `contractSide` سمت را تشخیص دهد.
const expiries = [];
for (let e = g(2025, 6, 20); e < addDays(days.at(-1), 120); e = addDays(e, 30)) expiries.push(e);
const contracts = [];
for (const expiry of expiries) {
  for (let K = 6000; K <= 20000; K += 500) {
    for (const kind of ['call', 'put']) {
      contracts.push({ ins: `${kind[0]}${expiry}_${K}`, kind, strike: K, expiry, symbol: `${kind === 'call' ? 'ض' : 'ط'}پا${K}` });
    }
  }
}
const START = 50;   // روزهای پیش از این پرونده ندارند — «دادهٔ قراردادها گرفته نشده»
const payloadOf = (i) => ({
  closingPriceDailyHistoryWithInstDetails: [
    // ردیف خودِ پایه (سهم) — نباید وارد پرونده شود.
    { insCode: 'UA', instrument: { insCode: 'UA', lVal18AFC: 'پایه', lVal30: 'صندوق پایه' }, closingPriceDaily: { insCode: 'UA', pClosing: spots[i], pDrCotVal: spots[i], qTotTran5J: 1e6, zTotTran: 500 } },
    ...contracts.flatMap((c) => {
      const T = dte(days[i], c.expiry);
      if (T <= 0 || Math.abs(c.strike / spots[i] - 1) > 0.3) return [];
      const price = bsPrice(c.kind, spots[i], c.strike, T / YEAR, r, 0, trueIv[i]);
      if (!(price > 1)) return [];
      return [{
        insCode: c.ins,
        instrument: { insCode: c.ins, lVal18AFC: c.symbol, lVal30: `${c.kind === 'call' ? 'اختیارخ' : 'اختیارف'} پایه-${c.strike}-1405/01/01` },
        closingPriceDaily: { insCode: c.ins, pClosing: price, pDrCotVal: price, priceYesterday: price, priceMin: price, priceMax: price, qTotTran5J: 10, zTotTran: 2, qTotCap: price * 10000 },
      }];
    }),
  ],
});

// پرونده‌ها همان مسیر سرور را می‌روند: استخراج، برش برای این پایه، JSON.
const wanted = new Set(contracts.map((c) => c.ins));
const panels = {};
for (let i = START; i < days.length; i += 1) panels[days[i]] = panelSlice(panelFromDay(payloadOf(i), days[i]), wanted);
const api = JSON.parse(JSON.stringify({ contracts, panels }));

group('۳۰۸-الف. پروندهٔ روزانه از پاسخ «همهٔ ابزارهای یک روز»');
{
  const panel = panelFromDay(payloadOf(120), days[120]);
  check('فقط کال و پوت نگه داشته می‌شود — سهم پایه نه', !panel.prices.UA && panel.priced > 10, `${panel.priced} قرارداد`);
  check('ستون‌ها: پایانی، آخرین، حجم، تعداد، ارزش، کمینه، بیشینه',
    panel.columns.join(',') === 'close,last,vol,trades,value,low,high');
  const flat = panelFromDay([{ insCode: '9', lVal18AFC: 'ضپا1', lVal30: 'اختیارخ پایه-1000-1405/01/01', pClosing: 50, pDrCotVal: 51, qTotTran5J: 3, zTotTran: 1 }], 20260101);
  check('ردیف تخت (بی شیءِ تودرتو) هم خوانده می‌شود', flat.prices['9']?.[0] === 50 && flat.prices['9']?.[1] === 51);
  const tabaee = panelFromDay([{ insCode: '8', lVal18AFC: 'هپا1', lVal30: 'اختیارف ت پایه-1000-1405/01/01', pClosing: 50, qTotTran5J: 3 }], 20260101);
  check('اختیار تبعی بیرون می‌ماند', tabaee.priced === 0);
  const zero = panelFromDay([{ insCode: '7', lVal18AFC: 'ضپا1', lVal30: 'اختیارخ پایه-1000-1405/01/01', pClosing: 0, pDrCotVal: 0 }], 20260101);
  check('ردیفِ بی‌قیمت پرونده را پر نمی‌کند (صفر قیمت نیست)', zero.priced === 0 && zero.instruments === 1);
  check('پاسخِ ناشناخته صفر ردیف می‌دهد، نه خطا', panelFromDay({ x: 1 }, 20260101).instruments === 0);
}

group('۳۰۸-ب. شاخص یک روز: همان تلاطمی که قیمت‌ها با آن ساخته شدند');
{
  const obs = panelObservations(api.contracts, api.panels, 'close');
  const i = 200;
  const one = ivIndexOfDay({ date: days[i], spot: spots[i], observations: obs.get(days[i]) }, {}, settings);
  check('افق ثابت ۳۰ روزه = σ واقعیِ آن روز', near(one.ivPct, trueIv[i] * 100, 1e-6), `${one.ivPct?.toFixed(4)} در برابر ${(trueIv[i] * 100).toFixed(4)}`);
  check('دو سررسیدِ دو طرف افق به کار رفت', one.expiries.length === 2 && one.method === 'cm' && one.flags.length === 0, one.expiries.join('،'));
  const front = ivIndexOfDay({ date: days[i], spot: spots[i], observations: obs.get(days[i]) }, { method: 'front' }, settings);
  check('روش نزدیک‌ترین سررسید هم همان σ را می‌دهد', near(front.ivPct, trueIv[i] * 100, 1e-6) && front.dte >= 7);
  check('ساختار زمانیِ همان روز ساخته می‌شود', one.term.length >= 3 && one.term.every((row) => near(row.ivPct, trueIv[i] * 100, 1e-6)));

  // درون‌یابی واریانس×زمان، با دو تلاطمِ متفاوت در دو سررسید.
  const S = 1000, day = 20260926, e1 = 20261016, e2 = 20261116;
  const chain = [[e1, 20, 0.4], [e2, 51, 0.5]].flatMap(([e, t, sig]) => [900, 1000, 1100].flatMap((K) => ['call', 'put'].map((kind) => ({
    kind, strike: K, expiry: e, price: bsPrice(kind, S, K, t / YEAR, r, 0, sig), traded: true,
  }))));
  const cm = ivIndexOfDay({ date: day, spot: S, observations: chain }, { targetDays: 30 }, settings);
  const v1 = 0.16 * 20, v2 = 0.25 * 51, vT = v1 + ((v2 - v1) * 10) / 31;
  check('افق ۳۰ روزه بین ۲۰ و ۵۱ روز: درون‌یابی واریانس×زمان', near(cm.ivPct, Math.sqrt(vT / 30) * 100, 1e-6), cm.ivPct?.toFixed(4));
  const far = ivIndexOfDay({ date: day, spot: S, observations: chain }, { targetDays: 90 }, settings);
  check('افق بیرون از سررسیدها: نزدیک‌ترین سررسید، با پرچم', near(far.ivPct, 50, 1e-6) && far.flags.includes('nearestExpiry'));

  // قراردادِ معامله‌نشده با پایانیِ کهنه نباید شاخص را عوض کند.
  const stale = chain.map((o) => (o.strike === 1000 && o.expiry === e1 ? { ...o, price: o.price * 3, traded: false } : o));
  const skip = ivIndexOfDay({ date: day, spot: S, observations: stale }, { targetDays: 30 }, settings);
  check('پایانیِ روزِ بی‌معامله وارد شاخص نمی‌شود', near(skip.ivPct, cm.ivPct, 1e-6));
  const near7 = ivIndexOfDay({ date: day, spot: S, observations: chain.map((o) => ({ ...o, expiry: 20260930 })) }, {}, settings);
  check('سررسیدِ کمتر از یک هفته کنار می‌رود (تلاطم ناپایدار)، با علت خودش', !Number.isFinite(near7.ivPct) && near7.why === 'nearExpiry');
  const atm = expiryAtmIv([{ strike: 1100, ivPct: 40, kind: 'call' }], 1000, 15);
  check('فقط یک سمتِ پایه: همان اعمال، با پرچم یک‌طرفه', atm.ivPct === 40 && atm.oneSided);
  check('بیرون از باند در پول: نامعلوم، نه عدد', !Number.isFinite(expiryAtmIv([{ strike: 1500, ivPct: 40 }], 1000, 15).ivPct));
}

group('۳۰۸-ج. IVR و IVP');
{
  const x = volRank([10, 20, 30, NaN, 15], 4, { lookback: 5, minSamples: 3 });
  check('IVR = (امروز − کمینه) ÷ (بیشینه − کمینه)', near(x.ivr, 25, 1e-12));
  check('IVP فقط روی روزهای پیش از امروز: یک از سه', near(x.ivp, 100 / 3, 1e-12));
  check('بازه بر حسب روز معاملاتی است و روزِ خالی پوشش را کم می‌کند', x.span === 5 && x.samples === 4 && near(x.coverage, 80, 1e-12));
  const few = volRank([10, 20, 30], 2, { lookback: 5, minSamples: 5 });
  check('کمتر از حداقل مشاهده: رتبه ساخته نمی‌شود و علتش گفته می‌شود', !Number.isFinite(few.ivr) && few.why.includes('۳'));
  check('بازهٔ کوتاه‌تر از خواسته علامت می‌خورد', few.full === false);
  const flat = volRank([20, 20, 20, 20, 20], 4, { lookback: 5, minSamples: 3 });
  check('بازهٔ تخت: IVR نامعلوم، IVP صفر', !Number.isFinite(flat.ivr) && flat.ivp === 0);
  const windowed = volRank([5, 50, 10, 20, 30], 4, { lookback: 3, minSamples: 2 });
  check('کمینه و بیشینه فقط از درون بازه (۵ و ۵۰ بیرون‌اند)', windowed.min === 10 && windowed.max === 30 && near(windowed.ivr, 100, 1e-12));
}

group('۳۰۸-د. تلاطم تاریخی، پارکینسون، تحقق‌یافتهٔ بعدی، مخروط');
{
  const closes = [100, 101, 99, 102, 103, 101, 104, 60, 61, 62];
  const { returns, jumps } = logReturns(closes, 0.2);
  check('جهشِ تعدیلی (۱۰۴ → ۶۰) کنار می‌رود و شمرده می‌شود', jumps === 1 && !Number.isFinite(returns[7]) && Number.isFinite(returns[8]));
  const hv = rollingHv(returns, 5, 240);
  const slice = returns.slice(2, 7);
  const m = slice.reduce((a, b) => a + b, 0) / 5;
  const manual = Math.sqrt(slice.reduce((a, b) => a + (b - m) ** 2, 0) / 4) * Math.sqrt(240) * 100;
  check('HV = انحراف معیار نمونه‌ای سالانه‌شده', near(hv[6], manual, 1e-12), hv[6]?.toFixed(4));
  check('پنجرهٔ پرنشده نامعلوم است، نه پنجرهٔ کوتاه‌تر', !Number.isFinite(hv[4]));
  const ranges = [1.10, 1.05, 1.03, 1.02, 1.04, 1.06];
  const prow = ranges.map((x) => ({ high: 100 * x, low: 100 }));
  prow.splice(3, 0, { high: 0, low: 0 });               // روزِ بی‌دامنه، وسط پنجره
  const park = rollingParkinson(prow, 6, 240);
  const used = [1.05, 1.03, 1.02, 1.04, 1.06];
  const pk = Math.sqrt((used.reduce((a, x) => a + Math.log(x) ** 2, 0) / used.length / (4 * Math.LN2)) * 240) * 100;
  check('پارکینسون از دامنهٔ روز؛ روزِ بی‌دامنه کنار می‌رود (۵ از ۶ معتبر)', near(park[6], pk, 1e-12), park[6]?.toFixed(4));
  check('کمتر از ۸۰٪ روزِ معتبر: نامعلوم', !Number.isFinite(rollingParkinson([{ high: 0, low: 0 }, { high: 0, low: 0 }, { high: 2, low: 1 }], 3, 240)[2]));
  const fwd = forwardRealized(returns, 3, 240);
  check('تحقق‌یافتهٔ بعدی از فردا شروع می‌شود و انتهای سری نامعلوم است', Number.isFinite(fwd[1]) && !Number.isFinite(fwd[closes.length - 2]));
  const cone = volCone(logReturns(spots).returns, [10, 20], 240);
  check('مخروط: کمینه ≤ چارک ≤ میانه ≤ چارک ≤ بیشینه', cone.every((c) => c.min <= c.p25 && c.p25 <= c.p50 && c.p50 <= c.p75 && c.p75 <= c.max));
  check('جای امروز در مخروط صدک دارد', cone.every((c) => Number.isFinite(c.current) && c.currentPct >= 0 && c.currentPct <= 100));
  check('چندک با درون‌یابی خطی', quantile([1, 2, 3, 4], 0.5) === 2.5 && quantile([], 0.5) !== quantile([], 0.5));
}

group('۳۰۸-ه. سرهم: تاریخچهٔ کامل از پرونده‌ها');
{
  const history = buildVolHistory({
    baseRows, observations: panelObservations(api.contracts, api.panels, 'close'),
    from: days[START], params: { lookback: 120, minSamples: 20 }, settings,
  });
  const recovered = history.rows.filter((row) => Number.isFinite(row.ivPct));
  const worst = Math.max(...recovered.map((row) => Math.abs(row.ivPct - trueIv[days.indexOf(row.date)] * 100)));
  // خطا در حدِ رواداریِ حل‌گر تلاطم (۱e-۶ روی قیمت)، بر حسب واحد درصد.
  check('شاخص هر روزِ دارای پرونده همان σ واقعی است', recovered.length === days.length - START && worst < 1e-4, `${recovered.length} روز · بیشینهٔ خطا ${worst.toExponential(2)}`);
  check('روزِ بی‌پرونده «گرفته نشده» است، نه «معامله نشد»', history.rows[10].why === 'noPanel' || history.rows[10].why === 'outOfRange');
  const series = history.rows.map((row) => row.ivPct);
  const direct = volRank(series, series.length - 1, { lookback: 120, minSamples: 20 });
  check('IVR و IVP امروز همان محاسبهٔ مستقیم', near(history.rank.ivr, direct.ivr, 1e-12) && near(history.rank.ivp, direct.ivp, 1e-12),
    `IVR ${history.rank.ivr?.toFixed(2)} · IVP ${history.rank.ivp?.toFixed(2)}`);
  const lastIv = trueIv.at(-1) * 100;
  const windowIv = trueIv.slice(-120).map((v) => v * 100);
  check('و با مسیرِ واقعی تلاطم هم می‌خواند', near(history.rank.ivr, ((lastIv - Math.min(...windowIv)) / (Math.max(...windowIv) - Math.min(...windowIv))) * 100, 1e-4));
  check('وضعیت از صدک ساخته می‌شود', history.regime.id === VOL_REGIMES.find((row) => history.rank.ivp < row.max).id);
  check('HV هم‌افق کنار IV و فاصله‌شان', Number.isFinite(history.current.hvMatch) && near(history.current.spread, history.current.ivPct - history.current.hvMatch, 1e-12));
  check('مسیر IVR برای هر روز (نمودار)', history.rows.filter((row) => Number.isFinite(row.ivr)).length > 100);
  check('صرف تلاطم گذشته (IV در برابر تحقق‌یافتهٔ بعدی) شمرده می‌شود', history.stats.fwdSamples > 100 && Number.isFinite(history.stats.fwdRichPct));
  check('پوشش بازه: همهٔ روزهای دارای پرونده', near(history.stats.coverage, 100, 1e-9) && history.stats.ivDays === days.length - START);

  // «امروز» از تابلوی زنده، فقط وقتی داده شود.
  const today = addDays(days.at(-1), 3);
  const liveContracts = api.contracts.filter((c) => dte(today, c.expiry) > 7 && Math.abs(c.strike / spots.at(-1) - 1) < 0.2).map((c) => ({
    ins: c.ins, kind: c.kind, strike: c.strike, endDate: c.expiry, uaIns: 'UA', volume: 5, tradeLast: NaN,
    close: bsPrice(c.kind, spots.at(-1), c.strike, dte(today, c.expiry) / YEAR, r, 0, 0.9),
  }));
  const live = { date: today, spot: spots.at(-1), observations: liveObservations(liveContracts, 'UA', 'close') };
  const withLive = buildVolHistory({ baseRows, observations: panelObservations(api.contracts, api.panels), live, from: days[START], params: { lookback: 120 }, settings });
  check('ردیف زنده آخرین ردیف است و شاخصش از قیمت امروز', withLive.current.live && near(withLive.current.ivPct, 90, 1e-5));
  check('تلاطمِ بالاتر از کل بازه: IVR و IVP صد', near(withLive.rank.ivr, 100, 1e-9) && near(withLive.rank.ivp, 100, 1e-9) && withLive.regime.id === 'very-high');
  check('قرارداد پایهٔ دیگر وارد مشاهدهٔ زنده نمی‌شود',
    liveObservations([...liveContracts, { ...liveContracts[0], uaIns: 'OTHER' }], 'UA').length === liveContracts.length);
  check('بی جلسهٔ زنده، ردیف امروز ساخته نمی‌شود', !history.rows.some((row) => row.live));

  const corr = volCorrelation(history.rows.filter((row) => row.date >= days[START]));
  check('ماتریس همبستگی متقارن با قطر یک', corr.matrix.every((row, i) => near(row[i].r, 1, 1e-9) || !Number.isFinite(row[i].r))
    && near(corr.matrix[0][1].r, corr.matrix[1][0].r, 1e-12));
  check('پیرسون با کمتر از ۵ جفت نامعلوم است', !Number.isFinite(pearson([1, 2, 3], [1, 2, 3]).r));
  check('بازهٔ دریافت برای ۲۴۰ روز معاملاتی بیش از یک سال تقویمی است', (() => {
    const range = volRangeFor(240, 20261002);
    return range.to === 20261002 && dte(range.from, range.to) >= 360;
  })());

  // ═══ رابط: سازنده‌های خالص ═══
  history.rangeFrom = days[START];
  const regimeHtml = volRegimeHtml(history);
  check('کارت وضعیت نام پله و متن خوانش را دارد', regimeHtml.includes(history.regime.label) && regimeHtml.includes('aria-current="true"'));
  const divergent = volRegime(50, 10);
  check('اختلاف بزرگ IVR و IVP توضیح داده می‌شود', divergent.divergence.includes('جهش'));
  check('صدک نامعلوم: وضعیت نامعلوم، نه «میانه»', volRegime(NaN).id === 'unknown');
  const kpi = volKpiHtml(history);
  check('کاشی‌ها رقم لاتین ندارند', !latin(kpi), kpi.replace(/<[^>]*>/g, ' ').match(/[0-9]+/)?.[0] || '');
  const compare = volCompareRows(history);
  check('جدول مقایسه: IV امروز، HV هر پنجره، پارکینسون و دامنهٔ بازه', compare.length === 2 + history.cone.length + 3
    && near(compare[0].value, history.current.ivPct, 1e-12));
  check('ستون «IV منهای این» برای HV ۲۰ همان فاصله است', near(compare.find((row) => row.label.includes('۲۰'))?.vsIv,
    history.current.ivPct - history.rows.at(-1).hv[20], 1e-9));
  const table = volTableRows(history);
  check('جدول روزانه: فقط بازه، تازه‌ترین بالا', table.length === days.length - START && table[0].id === String(days.at(-1)));
  const early = buildVolHistory({ baseRows, observations: panelObservations(api.contracts, api.panels), from: days[0], params: { lookback: 120 }, settings });
  early.rangeFrom = days[0];
  check('ستون وضعیت علتِ نبودِ شاخص را می‌گوید', volTableRows(early).at(-1).whyText.includes('گرفته نشده'));
  check('خط وضعیت شمار روزهای دارای پرونده را می‌گوید',
    volStatusText({ api: { have: 10, days: 12, missing: 2, contracts: [1, 2], build: { running: false } }, history, baseRows: 300 }).includes('۱۰ از ۱۲'));
  check('عقربه بی‌مقدار «—» نشان می‌دهد و عقربه ندارد', (() => {
    const option = gaugeOption({ value: NaN, title: 'IVR', tokens, bands: rankBands(tokens) });
    return option.series[0].detail.formatter() === '—' && option.series[0].pointer.show === false;
  })());
  check('پله‌های رنگیِ عقربه پنج‌تاست و از توکن', rankBands(tokens).length === 5 && rankBands(tokens).at(-1)[1] === tokens.warn);
  const line = ivHvLineOption(history, tokens);
  check('نمودار IV و HV: سری IV و HVها و پارکینسون، فقط روی بازه', line.series[0].name === 'IV شاخص'
    && line.series.some((s) => s.name === 'پارکینسون') && line.xAxis.data.length === days.length - START);
  check('مخروط و ساختار زمانی و توزیع ساخته می‌شوند', !!coneOption(history, tokens) && !!termOption(history, tokens) && !!distOption(history, tokens));
  check('بی داده، نمودار null است تا پیام «دادهٔ کافی نیست» بیاید',
    ivHvLineOption({ rows: [], params: history.params }, tokens) === null && termOption({ term: [] }, tokens) === null);
  check('نقشهٔ حرارتی همبستگی هر خانه را دارد', correlationOption(corr, tokens).series[0].data.length === corr.keys.length ** 2);
}

group('۳۰۸-و. سیم‌کشی: سرور، تب جدا، دفتر');
{
  const server = readSrc('../server/server.mjs');
  check('مسیر /api/vol/history هست', server.includes("if (p === '/api/vol/history') {"));
  check('پروندهٔ امروز نوشته نمی‌شود (جلسهٔ باز)', /if \(!\(day > 0\) \|\| day >= tehranDateNumber\(\)\) return null;/.test(server));
  check('ساخت دفتر قراردادها پرونده‌های قیمت همان روزها را هم ذخیره می‌کند',
    server.includes('const day = panelDayOf(path);') && server.includes('if (day) await savePanel(day, data)'));
  check('پروندهٔ بی‌قیمت نوشته نمی‌شود و علتش ثبت می‌شود', server.includes('if (!panel.priced) {'));
  check('روزِ پاسخ‌خالی (تعطیل یا سهمیه) شش ساعت دوباره پرسیده نمی‌شود، و دائمی «خالی» هم نمی‌شود',
    server.includes('const PANEL_EMPTY_RETRY_MS = 6 * 3600 * 1000;') && server.includes('for (const day of days) if (!panelResting(day)) panelQueue.add(day);')
    && server.includes('else panelEmptyAt.set(day, Date.now());'));
  check('خط وضعیت روزهای پاسخ‌خالی را جدا می‌گوید', volStatusText({ api: { have: 5, days: 7, missing: 2, contracts: [], build: { running: false, resting: 2 } } }).includes('تعطیل رسمی یا سهمیهٔ بالادست'));
  check('data/day-panels از گیت بیرون است', readSrc('../.gitignore').includes('data/day-panels/'));
  const dash = readSrc('../ui/tabs/live-market-dashboard.mjs');
  check('تب جدای «رتبه و صدک تلاطم» در رصد لحظه‌ای', dash.includes("{ id: 'vol-rank', title: 'رتبه و صدک تلاطم'") && dash.includes('if (mode?.volRank) { volRank().paint(); return; }'));
  check('انتخاب نماد از همان نقشه می‌آید و «امروز» از جلسهٔ زنده', dash.includes('getSelection: () => marketExplorer.selection(),')
    && readSrc('../ui/vol-rank-view.mjs').includes('if (!session?.current || !(session.date > 0)) return null;'));
}

group('۳۰۸-ز. خلاصه برای جاهای دیگر: انتخابگر نماد، نقشهٔ بازار');
{
  const store = (() => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; })();
  const { volSummaryOf, saveVolSummary, readVolSummary, volChipHtml, volTileParts, volSummaryStale } = await import('../../ui/vol-rank-store.mjs');
  const history = buildVolHistory({ baseRows, observations: panelObservations(api.contracts, api.panels), from: days[START], params: { lookback: 120 }, settings });
  const summary = volSummaryOf(history, { ua: 'UA', lookback: 120 });
  check('خلاصه همان IVR و IVP و پلهٔ تب است', near(summary.ivr, history.rank.ivr, 1e-12) && summary.regimeId === history.regime.id && summary.date === history.current.date);
  check('بی شاخصِ امروز خلاصه‌ای نیست', volSummaryOf({ current: null }, { ua: 'UA' }) === null);
  saveVolSummary(summary, store);
  check('ذخیره و خواندن در حافظهٔ مرورگر', near(readVolSummary('UA', store)?.ivp, summary.ivp, 1e-12) && readVolSummary('X', store) === null);
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  check('حافظهٔ قفل‌شده: بی خطا، بی نشان', (() => { saveVolSummary(summary, broken); return readVolSummary('UA', broken) === null; })());
  const chip = volChipHtml(summary, { today: addDays(summary.date, 2) });
  check('نشان کنار نام: IVR و IVP با رقم فارسی', chip.includes('IVR') && !latin(chip) && !chip.includes('data-stale'));
  check('دادهٔ بیش از یک هفته کهنه علامت می‌خورد', volSummaryStale(summary, addDays(summary.date, 10)) && volChipHtml(summary, { today: addDays(summary.date, 10) }).includes('data-stale="true"'));
  check('بی خلاصه: نشان خالی، نه «—» در هر ردیف', volChipHtml(null) === '');
  check('کاشی نقشه بی خلاصه راهِ ساختنش را می‌گوید', volTileParts(null)[2].includes('رتبه و صدک تلاطم'));
  const picker = readSrc('../ui/picker.mjs');
  check('انتخابگر مشترکِ تب‌های استراتژی نشان را دارد', picker.includes('${volChipHtml(readVolSummary(u.ins), { today })}'));
  const map = readSrc('../ui/live-market-map.mjs');
  check('کاشی نقشه تب رتبهٔ تلاطم را باز می‌کند', map.includes('data-open-mode="vol-rank"')
    && readSrc('../ui/tabs/live-market-dashboard.mjs').includes("const link = event.target.closest('[data-open-mode]');"));
  check('تب پس از هر ساخت خلاصه را ذخیره می‌کند', readSrc('../ui/vol-rank-view.mjs').includes('saveVolSummary(volSummaryOf(history, { ua, lookback: opts.lookback }));'));
}
