// ۳۱۱. ضبط تلاطم زنده و بازسازی روز — داده‌ای که میز تلاطم رویش می‌نشیند
//
//   الف  قاب: نخستین قاب کامل، بعد فقط تغییرها، هر سی دقیقه دوباره کامل
//   ب    خواندن: لحظه فقط از قاب‌های تا همان ثانیه (آ۴)؛ زمان آخرین معامله
//        پیش از نخستین افزایشِ حجم نامعلوم است، نه «همین حالا»
//   ج    فرم انتقال: پایهٔ بی‌معاملهٔ امروز قیمت ندارد؛ ضبط و بازسازی یک شکل
//   د    صف از دامنه: روی حد = صف، درون = عادی، نامعلوم = نامعلوم؛ اعلامِ
//        بعدتر وارد لحظه نمی‌شود
//   هـ   سرتاسر: بازار بلک‌شولز ← ضبط ← فرم انتقال ← موتور = تلاطم معلوم
//   و    سرور: امروز هرگز در کش بازسازی نمی‌رود، ساخت فقط با build=1،
//        ضبط فقط در جلسهٔ باز و بی درخواستِ اضافه

import { check, group, near, readSrc } from '../harness.mjs';
import { bsPrice } from '../../core/bs.mjs';
import { defaults } from '../../core/settings.mjs';
import { volTime } from '../../core/vol-clock.mjs';
import { markAt } from '../../core/intraday-mark.mjs';
import { bookAt } from '../../core/book-history.mjs';
import {
  recordFrame, parseRecord, recordMoments, compactRecordMoments, rebuildMoments,
  queueFromLimits, limitsFrom, limitsAt, pickMoments, IV_RECORD_KEYFRAME_SEC,
} from '../../core/iv-record.mjs';
import { intradayContext, transportPoints } from '../../core/vol-intraday.mjs';

const OPEN = 32400;
const UA = '900';
const row = (over = {}) => ({
  uaInsCode: UA, strikePrice: 10000, expiryGregorian: 20261118, insCode_C: 'c1', insCode_P: 'p1',
  pDrCotVal_UA: 10000, pClosing_UA: 9900, qTotTran5J_UA: 50,
  pMeDem_C: 500, pMeOf_C: 520, pDrCotVal_C: 510, qTotTran5J_C: 0, pClosing_C: 505,
  pMeDem_P: 300, pMeOf_P: 320, pDrCotVal_P: 310, qTotTran5J_P: 0, pClosing_P: 305,
  ...over,
});

group('۳۱۱-الف. قاب‌ها');
{
  const a = recordFrame([row()], { second: OPEN + 60 });
  check('نخستین قاب کامل است، با شناسنامه و پایه', a.frame.k === 1 && a.frame.m?.c1 && a.frame.m?.p1 && a.frame.u?.[UA] && a.frame.c?.c1);
  const b = recordFrame([row({ pMeDem_C: 505 })], { second: OPEN + 120, prev: a.state });
  check('قاب بعد فقط تغییرها: فقط c1، بی شناسنامه و بی پایه', b.frame.k === 0 && Object.keys(b.frame.c || {}).join() === 'c1' && !b.frame.m && !b.frame.u);
  const c = recordFrame([row({ pMeDem_C: 505 })], { second: OPEN + 60 + IV_RECORD_KEYFRAME_SEC, prev: b.state });
  check('پس از سی دقیقه دوباره کامل', c.frame.k === 1 && c.frame.c?.p1 && c.frame.m?.c1);
  const far = recordFrame([row({ strikePrice: 20000 })], { second: OPEN + 60 });
  check('قرارداد بیرون از باند ضبط نمی‌شود', !far.frame.c && !far.frame.m && far.frame.u?.[UA]);
  const dead = recordFrame([row({ pDrCotVal_UA: 0, pClosing_UA: 0 })], { second: OPEN + 60 });
  check('پایهٔ بی‌قیمت کنار می‌رود', !dead.frame.u && !dead.frame.c);
}

group('۳۱۱-ب. خواندن قاب‌ها — بی نشت، زمان معامله صادقانه');
{
  const lines = [];
  let prev = null;
  const push = (second, over) => { const r = recordFrame([row(over)], { second, prev }); prev = r.state; lines.push(JSON.stringify(r.frame)); };
  push(OPEN + 60, { qTotTran5J_C: 10, pDrCotVal_C: 510 });
  push(OPEN + 120, { qTotTran5J_C: 10, pDrCotVal_C: 510, pMeDem_C: 506 });
  push(OPEN + 180, { qTotTran5J_C: 12, pDrCotVal_C: 515, pMeDem_C: 506, qTotTran5J_UA: 60 });
  push(OPEN + 240, { qTotTran5J_C: 12, pDrCotVal_C: 515, pMeDem_C: 900, pMeOf_C: 950 });
  const parsed = parseRecord([lines[2], 'نه‌جی‌سون', lines[0], '', lines[1], lines[3]].join('\n'));
  check('خط خراب شمرده می‌شود و قاب‌ها مرتب می‌شوند', parsed.broken === 1 && parsed.frames.map((f) => f.t).join() === [60, 120, 180, 240].map((x) => OPEN + x).join());
  const [m1, m2, m3] = recordMoments(parsed.frames, UA, [OPEN + 150, OPEN + 30, OPEN + 200]);
  check('لحظهٔ پیش از نخستین قاب خالی است', m1.second === OPEN + 30 && m1.base === null && m1.contracts.length === 0);
  const c2 = m2.contracts.find((c) => c.ins === 'c1');
  check('آ۴ لحظه فقط تا قاب‌های پیش از خودش: خریدِ ۵۰۶، نه ۹۰۰', c2.record.bid === 506 && c2.record.at === OPEN + 120 && m2.frameAt === OPEN + 120);
  check('پیش از نخستین افزایشِ حجم، زمان آخرین معامله نامعلوم است', Number.isNaN(c2.record.lastAt) && Number.isNaN(m2.base.lastAt));
  const c3 = m3.contracts.find((c) => c.ins === 'c1');
  check('افزایش حجم → زمان معامله همان قاب', c3.record.lastAt === OPEN + 180 && c3.record.last === 515 && m3.base.lastAt === OPEN + 180);
  check('قاب بی‌تغییر هم تأیید است: «at» تا آخرین قاب جلو می‌رود',
    recordMoments(parsed.frames, UA, [OPEN + 240])[0].contracts.find((c) => c.ins === 'p1').record.at === OPEN + 240);
  check('کلید دیگری از پایهٔ دیگر چیزی نمی‌گیرد', recordMoments(parsed.frames, '901', [OPEN + 240])[0].contracts.length === 0);

  // قاب کامل پس از خاموشی: قراردادی که دیگر روی تابلو نیست، از لحظه می‌افتد.
  const r1 = recordFrame([row(), row({ insCode_C: 'c2', insCode_P: 'p2', strikePrice: 10500 })], { second: OPEN + 60 });
  const r2 = recordFrame([row()], { second: OPEN + 600 });
  const after = recordMoments([r1.frame, r2.frame], UA, [OPEN + 700])[0];
  check('قاب کامل حالت را از نو می‌سازد (قرارداد رفته می‌افتد)', after.contracts.map((c) => c.ins).sort().join() === 'c1,p1');
}

group('۳۱۱-ج. فرم انتقال');
{
  const noTrade = recordFrame([row({ qTotTran5J_UA: 0 })], { second: OPEN + 60 });
  const [m] = compactRecordMoments(recordMoments([noTrade.frame], UA, [OPEN + 60])).moments;
  check('پایهٔ بی‌معاملهٔ امروز قیمت ندارد (عدد تابلو پایانی دیروز است)', m[1] === null && m[3] === null);
  const traded = recordFrame([row()], { second: OPEN + 60 });
  const t = compactRecordMoments(recordMoments([traded.frame], UA, [OPEN + 60]));
  check('پایهٔ معامله‌شده قیمت دارد؛ سنِ نامعلوم null می‌ماند', t.moments[0][1] === 10000 && t.moments[0][3] === null);
  check('شناسنامهٔ قرارداد [نوع، اعمال، سررسید]', t.contracts.c1.join() === 'call,10000,20261118' && t.contracts.p1[0] === 'put');
  check('قیمت صفر = null، نه صفر', compactRecordMoments(recordMoments([recordFrame([row({ pMeOf_C: 0 })], { second: OPEN + 60 }).frame], UA, [OPEN + 60])).moments[0][4].c1[1] === null);

  const tape = [{ time: 90200, price: 100, quantity: 1 }, { time: 91000, price: 999, quantity: 1 }];
  const baseTape = [{ time: 90100, price: 10000, quantity: 1 }, { time: 90900, price: 11111, quantity: 1 }];
  const book = [{ level: 1, second: OPEN + 30, bid: 95, ask: 105, bidQty: 1, askQty: 1 }, { level: 1, second: OPEN + 500, bid: 500, ask: 600, bidQty: 1, askQty: 1 }];
  const rb = rebuildMoments({ seconds: [OPEN + 300], baseTape, tapes: { c1: tape }, books: { c1: book }, meta: { c1: ['call', 10000, 20261118] }, markAt, bookAt });
  const [sec, bp, , bLast, q] = rb.moments[0];
  check('آ۴ بازسازی: پایه و قرارداد فقط تا ثانیهٔ لحظه', sec === OPEN + 300 && bp === 10000 && bLast === OPEN + 60 && q.c1[3] === 100 && q.c1[0] === 95 && q.c1[1] === 105);
  check('بازسازی همان شکلِ ضبط را دارد', Array.isArray(rb.moments[0]) && rb.moments[0].length === 5 && rb.contracts.c1[0] === 'call');
  const none = rebuildMoments({ seconds: [OPEN + 10], baseTape, tapes: { c1: tape }, meta: { c1: ['call', 10000, 20261118] }, markAt, bookAt });
  check('پیش از نخستین معامله: هیچ', none.moments[0][1] === null && Object.keys(none.moments[0][4]).length === 0);
  const picked = pickMoments({ date: 1, moments: [[10], [20], [30]] }, [20, 30, 40]);
  check('دانهٔ درشت = نمونه از لحظه‌ها، بی ساختن لحظهٔ تازه', picked.moments.map((r) => r[0]).join() === '20,30');
}

group('۳۱۱-د. صف از دامنهٔ مجاز');
{
  check('روی سقف = صف خرید', queueFromLimits(110, [90, 110]).key === 'buyQueue');
  check('روی کف = صف فروش', queueFromLimits(90, [90, 110]).key === 'sellQueue');
  check('درون دامنه = عادی و معلوم', queueFromLimits(100, [90, 110]).key === 'normal' && queueFromLimits(100, [90, 110]).known);
  check('دامنهٔ نامعلوم = «نامعلوم»، نه «عادی»', queueFromLimits(100, null).key === 'unknown' && !queueFromLimits(100, null).known);
  const limits = limitsFrom([{ hEven: 103000, psGelStaMin: 80, psGelStaMax: 120 }, { hEven: 83000, psGelStaMin: 90, psGelStaMax: 110 }, { hEven: 0, psGelStaMin: 0, psGelStaMax: 5 }]);
  check('دامنه‌ها مرتب، ردیفِ ناقص کنار', limits.length === 2 && limits[0][0] === 30600 && limits[1][0] === 37800);
  check('آ۴ دامنهٔ اعلام‌شدهٔ بعدی وارد لحظهٔ پیشین نمی‌شود', limitsAt(limits, 36000).join() === '90,110' && limitsAt(limits, 38000).join() === '80,120');
  check('پیش از نخستین اعلام: نامعلوم', limitsAt(limits, 30000) === null);
}

group('۳۱۱-هـ. سرتاسر: بازار ← ضبط ← موتور');
{
  const settings = defaults();
  const ctx = intradayContext(settings, { holidaysKnown: true });
  const DATE = 20261005, NEAR = 20261021, FAR = 20261118, S = 10000, SIG = 0.55;
  const years = (second, expiry) => volTime({ date: DATE, second }, expiry, {
    basis: ctx.params.basis, settings, calendar: ctx.calendar, expiryMoment: ctx.params.expiryMoment,
  }).years;
  const board = (second, vol) => {
    const rows = [];
    for (const expiry of [NEAR, FAR]) {
      for (let K = 8500; K <= 11500; K += 500) {
        const c = bsPrice('call', S, K, years(second, expiry), settings.rFree, 0, SIG);
        const p = bsPrice('put', S, K, years(second, expiry), settings.rFree, 0, SIG);
        rows.push(row({
          strikePrice: K, expiryGregorian: expiry, insCode_C: `c${expiry}${K}`, insCode_P: `p${expiry}${K}`,
          pDrCotVal_UA: S, qTotTran5J_UA: vol,
          pMeDem_C: c * 0.99, pMeOf_C: c * 1.01, pDrCotVal_C: c, qTotTran5J_C: vol,
          pMeDem_P: p * 0.99, pMeOf_P: p * 1.01, pDrCotVal_P: p, qTotTran5J_P: vol,
        }));
      }
    }
    return rows;
  };
  let prev = null;
  const frames = [];
  for (let i = 1; i <= 12; i += 1) {
    const r = recordFrame(board(OPEN + i * 300, 100 + i), { second: OPEN + i * 300, prev });
    prev = r.state;
    frames.push(JSON.parse(JSON.stringify(r.frame)));
  }
  const seconds = [OPEN + 900, OPEN + 1800, OPEN + 3600];
  const day = { date: DATE, source: 'record', limits: [[30000, 9000, 11000]], ...compactRecordMoments(recordMoments(frames, UA, seconds)) };
  const pts = transportPoints(day, ctx);
  check('هر سه لحظه شاخص دارند', pts.length === 3 && pts.every((pt) => pt.why === 'ok'), pts.map((pt) => pt.why).join());
  check('شاخص = تلاطم معلوم بازار (۵۵٪)', pts.every((pt) => near(pt.value, 55, 0.3)), pts.map((pt) => pt.value?.toFixed(2)).join());
  check('نوار خرید تا فروش دو طرف شاخص', pts.every((pt) => pt.bid < pt.value && pt.value < pt.ask));
  check('صف معلوم و عادی؛ بی پرچمِ «نامعلوم»', pts.every((pt) => pt.queueKey === 'normal' && pt.queue === false && !pt.flags.includes('queueUnknown')));

  const queued = transportPoints({ ...day, limits: [[30000, 9000, S]] }, ctx);
  check('آ۳ پایه روی سقف دامنه → لحظه خالی با علت «صف»', queued.every((pt) => !Number.isFinite(pt.value) && pt.why === 'queue' && pt.queue === true));
  const unknown = transportPoints({ ...day, limits: [] }, ctx);
  check('دامنهٔ نامعلوم: شاخص هست، پرچم «صف نامعلوم» هم', unknown.every((pt) => Number.isFinite(pt.value) && pt.flags.includes('queueUnknown')));
  check('ضبط برچسب «بازسازی» نمی‌گیرد', pts.every((pt) => !pt.flags.includes('rebuilt')));

  // همان بازار، بازسازی از ریزمعامله (معامله روی میانه): همان عدد، با برچسب.
  const tapes = {}, meta = {};
  for (const [ins, m] of Object.entries(day.contracts)) {
    meta[ins] = m;
    tapes[ins] = seconds.map((second) => {
      const price = bsPrice(m[0], S, m[1], years(second, m[2]), settings.rFree, 0, SIG);
      const hms = Number([Math.floor(second / 3600), Math.floor(second / 60) % 60, second % 60].map((x) => String(x).padStart(2, '0')).join(''));
      return { time: hms, price, quantity: 1 };
    });
  }
  const baseTape = seconds.map((second) => ({ time: Number([Math.floor(second / 3600), Math.floor(second / 60) % 60, 0].map((x) => String(x).padStart(2, '0')).join('')), price: S, quantity: 1 }));
  const rebuilt = transportPoints({ date: DATE, source: 'trades', limits: day.limits, ...rebuildMoments({ seconds, baseTape, tapes, meta, markAt, bookAt }) }, ctx);
  check('بازسازی از معامله همان تلاطم را می‌دهد', rebuilt.every((pt, i) => near(pt.value, pts[i].value, 0.3)), rebuilt.map((pt) => pt.value?.toFixed(2)).join());
  check('بازسازی برچسب «بازسازی» و «جایگزین» می‌گیرد', rebuilt.every((pt) => pt.flags.includes('rebuilt') && pt.flags.includes('fallback')));
}

group('۳۱۱-و. سرور');
{
  const src = readSrc('../server/server.mjs');
  const build = src.slice(src.indexOf('async function buildIvDay'), src.indexOf('function queueIvBuild'));
  check('امروز هرگز بازسازی و ذخیره نمی‌شود', /if \(!\(day < tehranDateNumber\(\)\)\) return null;/.test(build));
  const rec = src.slice(src.indexOf('async function recordIv('), src.indexOf('const ivRecStatus'));
  check('ضبط فقط در جلسهٔ باز و درون ساعت جلسه', rec.includes('!gate.open') && rec.includes('second >= session.open && second <= session.close'));
  check('ضبط هیچ درخواستی به بالادست نمی‌زند', !/\bget\(|getFresh\(|fetchHistorical/.test(rec));
  const ep = src.slice(src.indexOf("p === '/api/vol/intraday'"), src.indexOf("p === '/api/history/universe'"));
  check('ساخت فقط با build=1، و هزینه پیش از آن گزارش می‌شود', ep.includes("get('build') === '1'") && ep.includes('cost:'));
  check('امروز «موقت» است و فقط تا آخرین قاب و حالا', ep.includes('provisional: isToday') && ep.includes('Math.min(nowSecond, lastFrame)'));
  check('روز امروزِ بی‌ضبط از کش بازسازی خوانده نمی‌شود', ep.indexOf('if (day === today)') < ep.indexOf('readIvBuild('));
  const ignore = readSrc('../.gitignore');
  check('پرونده‌های ضبط و بازسازی در مخزن نمی‌روند', ignore.includes('data/iv-live/') && ignore.includes('data/iv-intraday/'));
}
