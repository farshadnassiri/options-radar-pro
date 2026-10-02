// ۳۱۵. گزارش آزمون نسخهٔ ۳۷۱۲e1a — شش یافته، هر کدام با همان ورودیِ بازتولید
//
//   ۱  پاسخ نماد قبلی زیر نام نماد تازه (میز، کارت، رتبه)
//   ۲  مقدار چند ساعت قبل به‌عنوان «IV اکنون» و ورودی هشدار
//   ۳  قرارداد رفته از عکس، مظنهٔ «تازه» می‌گرفت
//   ۴  نوار IV خرید و فروش از دفتر کهنه
//   ۵  کش زمینهٔ تلاطم: تنظیمات در کلید نبود و پاسخ ناقص می‌ماند
//   ۶  همهٔ روزها روی رشتهٔ اصلی و از نو در هر بار

import { check, group, near, readSrc } from '../harness.mjs';
import { defaults } from '../../core/settings.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { volTime } from '../../core/vol-clock.mjs';
import { intradayContext, transportPoints, contractIvAt } from '../../core/vol-intraday.mjs';
import { quoteAt } from '../../core/moment-quote.mjs';
import { recordFrame, recordMoments, compactRecordMoments } from '../../core/iv-record.mjs';
import { deskModel, deskDays, volWatchValues, clearDeskCache, deskCacheSize } from '../../core/vol-desk.mjs';
import { buildVolHistory, panelObservations } from '../../core/vol-rank.mjs';

const settings = defaults();
const ctx = intradayContext(settings, { holidaysKnown: true });
const date = 20260930, expiry = 20261118, second = 36000, S = 10000;
const years = volTime({ date, second }, expiry, { settings, calendar: ctx.calendar }).years;
const price = bsPrice('call', S, S, years, settings.rFree, 0, 0.6);
const row = { uaInsCode: '123456', strikePrice: S, expiryGregorian: expiry, insCode_C: '111111', pDrCotVal_UA: S, pClosing_UA: S, qTotTran5J_UA: 100, pMeDem_C: price * 0.99, pMeOf_C: price * 1.01, pDrCotVal_C: price, qTotTran5J_C: 10 };

group('۳۱۵-۳. قرارداد رفته از عکس');
{
  const first = recordFrame([row], { second });
  const gone = recordFrame([{ ...row, uaInsCode: '654321', insCode_C: '222222' }], { second: second + 1200, prev: first.state });
  check('قاب بعد رفته‌ها را نام می‌برد (قرارداد و پایه)', gone.frame.x?.includes('111111') && gone.frame.xu?.includes('123456'), JSON.stringify({ x: gone.frame.x, xu: gone.frame.xu }));
  const replay = recordMoments([first.frame, gone.frame], '123456', [second + 1200]);
  check('بازپخش: قرارداد رفته در لحظهٔ بعد نیست (همان ورودی گزارش)', replay[0].contracts.length === 0 && replay[0].base === null);
  const day = { date, source: 'record', limits: [[0, 9000, 11000]], ...compactRecordMoments(replay) };
  const pt = transportPoints(day, ctx)[0];
  check('هیچ IVای از مظنهٔ رفته ساخته نمی‌شود (گزارش: ۶۰٫۱۲٪)', !Number.isFinite(pt.value));
  const still = recordMoments([first.frame, gone.frame], '123456', [second + 600]);
  check('پیش از قاب رفتن، همان مظنه با زمان خودش', still[0].contracts.length === 1 && still[0].contracts[0].record.at === second);
  const back = recordFrame([row], { second: second + 1800, prev: gone.state });
  const again = recordMoments([first.frame, gone.frame, back.frame], '123456', [second + 1800]);
  check('برگشتن به تابلو: دوباره هست، با زمان قاب برگشت', again[0].contracts.length === 1 && again[0].contracts[0].record.at === second + 1800);
  const stay = recordFrame([row, { ...row, uaInsCode: '654321', insCode_C: '222222' }], { second: second + 60, prev: first.state });
  const confirmed = recordMoments([first.frame, stay.frame], '123456', [second + 60]);
  check('قاب بی‌تغییر فقط حاضرها را تأیید می‌کند', !stay.frame.x && confirmed[0].contracts[0].record.at === second + 60);
}

group('۳۱۵-۲. «اکنون» فقط وقتی اکنون است');
{
  const points = [{ second: 33300, value: 60, price: 10000, queue: false, why: 'ok', flags: [] }, { second: 45000, value: NaN, price: 10000, queue: false, why: 'stale', flags: [] }];
  const model = deskModel({ days: [{ date, source: 'record', provisional: true, points }], today: date, ctx });
  check('ورودی گزارش: آخرین لحظه نامعتبر → زنده نیست', model.live === false && model.liveWhy === 'lastInvalid' && model.provisional === true);
  const w = volWatchValues(model);
  check('سنجهٔ «IV اکنون» دیده‌بان NaN است، نه ۶۰', Number.isNaN(w.ivNow) && Number.isNaN(w.ivChangeOpen) && w.live === false);
  check('عدد همچنان «آخرین مقدار معتبر» با سن نمایش داده می‌شود', model.now.value === 60 && model.nowAgeSec === 45000 - 33300);
  const fresh = [{ second: 36000, value: 55, price: 10000, queue: false, why: 'ok', flags: [] }];
  const at = (nowSecond) => deskModel({ days: [{ date, source: 'record', provisional: true, points: fresh }], today: date, ctx, nowSecond });
  check('تازه و درون جلسه → زنده', at(36300).live === true && volWatchValues(at(36300)).ivNow === 55);
  check('ساعت سرور از سقف کهنگی گذشت → کهنه', at(36000 + 901).live === false && at(36000 + 901).liveWhy === 'old');
  check('پس از بستن بازار → «بیرون از جلسه»', at(46000).liveWhy === 'closed' && Number.isNaN(volWatchValues(at(46000)).ivNow));
  const closedDay = deskModel({ days: [{ date, source: 'record', provisional: false, points: fresh }], today: date + 1, ctx });
  check('روز گذشته هرگز زنده نیست', closedDay.live === false && closedDay.liveWhy === 'notToday');
  // کارت «اکنون» میز با خود میز برداشته شد (۱۴۰۵/۰۷/۱۱)؛ دیده‌بان شرطی
  // همچنان از همین مدل می‌خواند و ساعت سرور را می‌دهد.
  check('دیده‌بان ساعت سرور را می‌دهد', readSrc('../ui/vol-watch.mjs').includes('compareDays: 10, nowSecond'));
}

group('۳۱۵-۴. نوار خرید و فروش فقط از دفتر سالم');
{
  const stale = quoteAt({ record: { bid: price * 0.8, ask: price * 1.2, at: second - 1800, last: price, lastAt: second }, second });
  const iv = contractIvAt({ ins: '111111', kind: 'call', strike: S, expiry, quote: stale }, { price: S }, { date, second }, ctx);
  check('ورودی گزارش: دفتر کهنه، معاملهٔ تازه → IV اصلی ۶۰٪، بی نوار', near(iv.ivPct, 60, 0.01) && Number.isNaN(iv.ivBid) && Number.isNaN(iv.ivAsk), `${iv.ivBid}/${iv.ivAsk}`);
  const crossed = quoteAt({ record: { bid: price * 1.2, ask: price * 0.8, at: second, last: price, lastAt: second }, second });
  const ivx = contractIvAt({ ins: '1', kind: 'call', strike: S, expiry, quote: crossed }, { price: S }, { date, second }, ctx);
  check('دفتر متقاطع هم نوار نمی‌سازد', Number.isNaN(ivx.ivBid) && Number.isNaN(ivx.ivAsk));
  const ok = quoteAt({ record: { bid: price * 0.99, ask: price * 1.01, at: second, last: price, lastAt: second }, second });
  const ivo = contractIvAt({ ins: '1', kind: 'call', strike: S, expiry, quote: ok }, { price: S }, { date, second }, ctx);
  check('دفتر سالم: نوار دو طرف IV', ivo.ivBid < ivo.ivPct && ivo.ivPct < ivo.ivAsk && ivo.ivMid === ivo.ivPct);
}

group('۳۱۵-۵. کش زمینهٔ تلاطم');
{
  const { loadVolContext, clearVolContextCache, volContextSignature } = await import('../../ui/vol-context.mjs');
  clearVolContextCache();
  const dailyPrice = bsPrice('call', S, S, 49 / 365, settings.rFree, 0, 0.6);
  const contracts = [{ ins: '111111', kind: 'call', strike: S, expiry }];
  const panels = { [date]: { 111111: [dailyPrice, dailyPrice, 100, 10, 10000, 1, 2000] } };
  let requests = 0;
  const fetcher = async (url) => { requests += 1; return { ok: true, status: 200, json: async () => (url.startsWith('/api/dailies') ? { 123456: { rows: [{ date, close: S }] } } : { ua: '123456', contracts, panels, have: 1, days: 1, missing: 0 }) }; };
  const a = await loadVolContext('123456', { from: date, to: date, settings, fetcher });
  const same = await loadVolContext('123456', { from: date, to: date, settings, fetcher });
  check('کامل و همان تنظیمات: از کش (بی درخواست تازه)', a === same && requests === 2);
  const changed = { ...settings, rFree: 0 };
  const b = await loadVolContext('123456', { from: date, to: date, settings: changed, fetcher });
  const expected = buildVolHistory({ baseRows: [{ date, close: S }], observations: panelObservations(contracts, panels), settings: changed });
  check('ورودی گزارش: نرخ عوض شد → عدد تازه (۷۳٫۴۰٪، نه ۶۰٪)', a !== b && near(b.history.current.ivPct, expected.current.ivPct, 1e-9) && near(b.history.current.ivPct, 73.4, 0.01), `${b.history.current.ivPct}`);
  check('امضا تنظیمات موتور را دارد', volContextSignature({ rFree: 0.3 }) !== volContextSignature({ rFree: 0 }) && volContextSignature({ ivHi: 5 }) !== volContextSignature({ ivHi: 4 }));
  let ready = false;
  const later = async (url) => ({ ok: true, status: 200, json: async () => (url.startsWith('/api/dailies') ? { 456789: { rows: [{ date, close: S }] } } : { ua: '456789', contracts, panels: ready ? panels : {}, have: ready ? 1 : 0, days: 1, missing: ready ? 0 : 1 }) });
  const partial = await loadVolContext('456789', { from: date, to: date, settings, fetcher: later });
  ready = true;
  const after = await loadVolContext('456789', { from: date, to: date, settings, fetcher: later });
  check('ورودی گزارش: پاسخ ناقص نگه داشته نمی‌شود؛ پس از ساخت پرونده عدد می‌آید', partial.history.current === null && after.history.current?.ivPct > 0 && after.coverage.missing === 0);
  clearVolContextCache();
  let clock = 0;
  const first = await loadVolContext('123456', { from: date, to: date, settings, fetcher, now: () => clock });
  clock = 29 * 60000;
  const within = await loadVolContext('123456', { from: date, to: date, settings, fetcher, now: () => clock });
  clock = 31 * 60000;
  const expired = await loadVolContext('123456', { from: date, to: date, settings, fetcher, now: () => clock });
  check('پاسخ کامل نیم ساعت می‌ماند و بعد دوباره خوانده می‌شود', first === within && expired !== first);
}

group('۳۱۵-۱. پاسخ فقط مال انتخاب خودش');
{
  // میز برداشته شد؛ همان نگهبان در تب «نوسان ضمنی» (هر دو دریافتش).
  const view = readSrc('../ui/iv-charts-view.mjs');
  const daily = view.slice(view.indexOf('async function loadDaily() {'), view.indexOf('const uaName = () =>'));
  check('نوسان ضمنی (روزانه): شماره، لغو، و رد پاسخ کهنه یا مال نماد دیگر', daily.includes('const my = ++dailySeq;') && daily.includes('dailyCtrl?.abort();')
    && daily.includes('if (my !== dailySeq || want !== ua) return;') && daily.includes('if (String(body.ua) !== want) return;') && !daily.includes('if (loading) return;'));
  check('نوسان ضمنی (روزانه): با عوض‌شدن نماد، دادهٔ قبلی همان لحظه کنار می‌رود', daily.includes('if (want !== ua) {') && daily.includes('data = null;'));
  const rng = view.slice(view.indexOf('async function loadRange('), view.indexOf('function paintRange() {'));
  check('نوسان ضمنی (بازه): همان نگهبان، با قرارداد هم', rng.includes('const my = ++rangeSeq;') && rng.includes('if (my !== rangeSeq || want !== ua) return;') && rng.includes("if (String(body.ua) !== want) throw new Error("));
  const rank = readSrc('../ui/vol-rank-view.mjs');
  const rload = rank.slice(rank.indexOf('async function load(force = false) {'), rank.indexOf('  function paint() {'));
  check('رتبه: همان نگهبان، تا خلاصهٔ نماد الف به‌نام ب ذخیره نشود', rload.includes('if (my !== loadSeq || want !== ua) return;') && rload.includes('if (String(body.ua) !== want) return;') && !rload.includes('if (loading) return;'));
  check('سرور ua را در پاسخ تلاطم تاریخی و درون‌روزی می‌فرستد', /return sendJson\(res, 200, \{[\s\S]{0,40}ua, from:/.test(readSrc('../server/server.mjs')) && readSrc('../server/server.mjs').includes('ua, ins: insWanted, grain, mode, today, nowSecond, days: out,'));
}

group('۳۱۵-۶. سرعت: کش روزها و ریسه');
{
  clearDeskCache();
  const fixture = (count, day) => {
    const contracts = {}, moments = [];
    for (let i = 0; i < count; i += 1) contracts[String(i)] = [i % 2 ? 'put' : 'call', 9000 + (i % 21) * 100, expiry];
    for (let j = 0; j < 43; j += 1) {
      const t = 32400 + j * 300, q = {};
      const T = volTime({ date: day, second: t }, expiry, { settings, calendar: ctx.calendar }).years;
      for (const [ins, [kind, K]] of Object.entries(contracts)) { const p = bsPrice(kind, S, K, T, settings.rFree, 0, 0.6); q[ins] = [p * 0.99, p * 1.01, t, p, t]; }
      moments.push([t, S, t, t, q]);
    }
    return { date: day, source: 'record', limits: [[0, 9000, 11000]], contracts, moments };
  };
  const api = { ua: '1', days: [fixture(40, 20260929), fixture(40, 20260930)] };
  const first = deskDays(api, ctx);
  const plain = deskDays(api, ctx, { cache: false });
  check('کش همان نقطه‌ها را می‌دهد که محاسبهٔ بی‌کش', first.every((d, i) => d.points.every((pt, j) => pt.value === plain[i].points[j].value || (Number.isNaN(pt.value) && Number.isNaN(plain[i].points[j].value)))));
  const t0 = Date.now();
  const second2 = deskDays(api, ctx);
  check('بار دوم روزهای بسته از کش (همان شیء)', second2[0].points === first[0].points && Date.now() - t0 < 200 && deskCacheSize().days === 2);
  const changedCtx = intradayContext({ ...settings, rFree: 0.2 }, { holidaysKnown: true });
  check('پارامتر عوض شد → از نو (امضا در کلید)', deskDays(api, changedCtx)[0].points !== first[0].points);
  const edited = { ua: '1', days: [{ ...api.days[0], moments: api.days[0].moments.slice(0, 40) }, api.days[1]] };
  check('دادهٔ عوض‌شده هرگز نقطهٔ کهنه نمی‌گیرد', deskDays(edited, ctx)[0].points !== first[0].points && deskDays(edited, ctx)[0].points.length === 40);
  const today = { ...api.days[1], date: 20261001, provisional: true };
  const t1 = deskDays({ ua: '1', days: [today] }, ctx)[0].points;
  const grown = { ...today, moments: [...today.moments, [45000, S, 45000, 45000, today.moments[0][4]]] };
  const t2 = deskDays({ ua: '1', days: [grown] }, ctx)[0].points;
  check('امروز: لحظه‌های قبلی از کش، فقط لحظهٔ تازه حساب می‌شود', t2.length === t1.length + 1 && t2.slice(0, t1.length).every((pt, i) => pt === t1[i]));
  const view = readSrc('../ui/iv-charts-view.mjs');
  check('نمودار بازه محاسبهٔ شاخص را به ریسه می‌سپارد', view.includes('await computeDeskDays(api, settings, calendar)') && !view.includes('deskDays(api, ctx)'));
  const compute = readSrc('../ui/vol-desk-compute.mjs');
  check('ریسه با جایگزینِ همان‌جا وقتی Worker نیست', compute.includes("new Worker('/worker/vol-desk-worker.mjs', { type: 'module' })") && compute.includes("typeof Worker === 'undefined'"));
  const { computeDeskDays } = await import('../../ui/vol-desk-compute.mjs');
  const viaFallback = await computeDeskDays(api, settings, { known: true, holidays: [] });
  check('بی Worker همان خروجی (با raw)', viaFallback.length === 2 && viaFallback[0].raw === api.days[0] && viaFallback[0].points.length === 43);
}
