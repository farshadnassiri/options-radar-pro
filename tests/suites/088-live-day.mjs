// ۸۷. دامنهٔ داده تا لحظهٔ جاری
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { historyPrice } from '../../core/history.mjs';
import {
  LIVE_DAY_PHASES, liveDayOf, liveDayRows, mergeLiveDay, tehranDateNumber,
} from '../../core/live-day.mjs';
import { applyLiveScope, scopeNote } from '../../ui/live-scope.mjs';


// ═════════ ۸۷. از روز مبدأ تا همین لحظه ═════════
//
// خواسته کاربر: «در دو قسمت تحلیل تاریخی استراتژی و آزمون همه استراتژی‌ها
// در حال حاضر بر اساس اطلاعات تاریخی کار می‌کنند. امکان ارائه اطلاعات از
// روز مبدا تا دیتای لحظه‌ای حال حاضر را نیز علاوه بر حالت قبلی فراهم کن.»
//
// «علاوه بر حالت قبلی» قید اصلی است: حالت بسته‌شده باید بدون کوچک‌ترین
// تغییر سر جایش بماند، و روز جاری فقط وقتی اضافه شود که واقعاً مشاهده شده
// باشد.
group('۸۷. دامنهٔ داده تا لحظهٔ جاری');
{
  const board = (over = {}) => ({
    uaInsCode: 'UA1', lval30_UA: 'پایه', strikePrice: 1000, remainedDay: 30, endDate: 20260301,
    pDrCotVal_UA: 1050, pClosing_UA: 1040, priceYesterday_UA: 1020,
    qTotTran5J_UA: 900000, zTotTran_UA: 700, qTotCap_UA: 9.4e11,
    insCode_C: 'C1', lVal18AFC_C: 'ضپایه۱۰۰۰',
    pDrCotVal_C: 180, pClosing_C: 175, priceYesterday_C: 160,
    qTotTran5J_C: 4200, zTotTran_C: 55, qTotCap_C: 7.4e8,
    // پای فروش امروز اصلاً معامله نشده: تابلو قیمت دیروزش را حمل می‌کند
    insCode_P: 'P1', lVal18AFC_P: 'طپایه۱۰۰۰',
    pDrCotVal_P: 90, pClosing_P: 90, priceYesterday_P: 90,
    qTotTran5J_P: 0, zTotTran_P: 0, qTotCap_P: 0,
    ...over,
  });

  // ——— روزِ عکس ———
  for (const phase of ['open', 'after', 'ungated']) {
    check(`فاز «${phase}» عکس تابلو را به امروز می‌چسباند`,
      liveDayOf({ phase }, Date.UTC(2026, 1, 10, 8, 0)).ok === true);
  }
  for (const [phase, why] of [['before', 'بازار باز نشده'], ['holiday', 'جمعه، روز معاملاتی نیست']]) {
    const out = liveDayOf({ phase, why }, Date.UTC(2026, 1, 10, 3, 0));
    check(`فاز «${phase}» عکس را به امروز نمی‌چسباند`, out.ok === false && out.date === 0);
    check(`دلیل نچسبیدن «${phase}» حفظ می‌شود`, out.why === why, out.why);
  }
  check('فاز ناشناخته هم محتاطانه رد می‌شود', liveDayOf({}, Date.now()).ok === false);
  check('فهرست فازهای مجاز صریح است', LIVE_DAY_PHASES.join(',') === 'open,after,ungated');
  // ۲۱:۰۰ گرینویچ نهم فوریه در تهران، بامداد دهم است
  check('روز از ساعت تهران خوانده می‌شود نه گرینویچ',
    tehranDateNumber(Date.UTC(2026, 1, 9, 21, 0)) === 20260210,
    String(tehranDateNumber(Date.UTC(2026, 1, 9, 21, 0))));
  check('ساعت نامعتبر روز نمی‌سازد', tehranDateNumber(NaN) === 0);

  // ——— ردیف‌های امروز ———
  const live87 = liveDayRows([board()], { date: 20260210 });
  check('پایه و پای معامله‌شده ردیف امروز می‌گیرند', !!live87.UA1 && !!live87.C1);
  check('پایی که امروز معامله نشده ردیف نمی‌گیرد', live87.P1 === undefined);
  check('قیمت‌های ردیف امروز از تابلو می‌آیند',
    live87.C1.last === 180 && live87.C1.close === 175 && live87.C1.yday === 160);
  check('حجم و ارزش امروز هم می‌آیند',
    live87.C1.vol === 4200 && live87.C1.trades === 55 && live87.C1.value === 7.4e8);
  check('اولین، کمترین و بیشترین ساخته نمی‌شوند',
    live87.C1.first === 0 && live87.C1.low === 0 && live87.C1.high === 0);
  check('ردیف امروز نشان‌دار است', live87.C1.live === true && live87.C1.date === 20260210);
  // و همین یعنی مبناهای «اولین/کمترین/بیشترین» روز جاری را اصلاً پیشنهاد
  // نمی‌کنند: قیمتی که مشاهده نشده، «فاقد داده» است نه عددی جایگزین.
  check('مبناهای مشاهده‌نشده روی روز جاری «فاقد داده» می‌دهند',
    ['FIRST', 'LOW', 'HIGH'].every((basis) => !Number.isFinite(historyPrice(live87.C1, basis)))
    && historyPrice(live87.C1, 'LAST') === 180 && historyPrice(live87.C1, 'CLOSE') === 175);
  check('بدون تاریخ، هیچ ردیفی ساخته نمی‌شود',
    Object.keys(liveDayRows([board()], { date: 0 })).length === 0);
  check('حجم بدون قیمت هم ردیف نمی‌سازد',
    liveDayRows([board({ pDrCotVal_C: 0, pClosing_C: 0 })], { date: 20260210 }).C1 === undefined);

  // ——— چسباندن روی سری‌های روزانه ———
  const base87 = {
    UA1: [{ date: 20260208, close: 1000, last: 1005, first: 990, low: 985, high: 1010, vol: 5e5, trades: 400, value: 5e11 }],
    C1: [{ date: 20260208, close: 150, last: 152, first: 148, low: 146, high: 155, vol: 3000, trades: 40, value: 4.5e8 }],
    P1: [{ date: 20260208, close: 95, last: 96, first: 94, low: 93, high: 98, vol: 1000, trades: 12, value: 9.5e7 }],
  };
  const merged87 = mergeLiveDay(base87, live87, { date: 20260210 });
  check('روز جاری به سری اضافه می‌شود', merged87.series.C1.length === 2 && merged87.added === 2);
  check('پای بی‌معاملهٔ امروز دست‌نخورده می‌ماند',
    merged87.series.P1.length === 1 && merged87.untouched === 1);
  check('ورودی دست نمی‌خورد', base87.C1.length === 1);
  check('سری مرتب می‌ماند',
    merged87.series.C1.map((row) => row.date).join(',') === '20260208,20260210');
  check('روز بسته‌شدهٔ قبلی تغییر نمی‌کند', merged87.series.C1[0].low === 146);

  // ردیف رسمی همان روز اگر بود، تازه می‌شود ولی کمترین/بیشترینش نمی‌پرد
  const withToday = {
    C1: [
      { date: 20260208, close: 150, last: 152, first: 148, low: 146, high: 155, vol: 3000, trades: 40, value: 4.5e8 },
      { date: 20260210, close: 170, last: 171, first: 165, low: 163, high: 178, vol: 3900, trades: 51, value: 6.8e8 },
    ],
  };
  const over87 = mergeLiveDay(withToday, live87, { date: 20260210 });
  check('ردیف امروزِ موجود جایگزین می‌شود نه دوتا',
    over87.series.C1.length === 2 && over87.updated === 1 && over87.added === 0);
  check('قیمت‌های تازه‌تر تابلو می‌نشینند',
    over87.series.C1[1].last === 180 && over87.series.C1[1].vol === 4200);
  check('کمترین و بیشترینِ ردیف رسمی از دست نمی‌رود',
    over87.series.C1[1].low === 163 && over87.series.C1[1].high === 178 && over87.series.C1[1].first === 165);

  check('بدون روز معتبر، سری‌ها دست‌نخورده برمی‌گردند',
    mergeLiveDay(base87, live87, { date: 0 }).series.C1.length === 1);

  // ——— جملهٔ کاربر ———
  const noteOk = scopeNote(merged87, { total: 3, at: Date.UTC(2026, 1, 10, 8, 30) });
  check('جمله می‌گوید چند نماد ردیف گرفتند', noteOk.includes('۲') && noteOk.includes('۳'));
  check('جمله صریحاً می‌گوید روز بسته نشده', noteOk.includes('بسته نشده'));
  const noneNote = scopeNote({ date: 20260210, added: 0, updated: 0 }, { total: 3 });
  check('وقتی هیچ نمادی معامله نکرده، ادعای به‌روزرسانی نمی‌شود',
    noneNote.includes('معامله‌ای نداشتند') && !noneNote.includes('تازه شد'), noneNote);

  // ——— مسیر کامل، با پاسخ ساختگی ———
  const fakeFetch = (payload, ok = true) => async () => ({ ok, json: async () => payload });
  const at87 = Date.UTC(2026, 1, 10, 8, 30);
  const good = await applyLiveScope(base87, {
    fetcher: fakeFetch({ at: at87, market: { open: true, phase: 'open' }, rows: [board()] }),
  });
  check('مسیر کامل روز جاری را می‌چسباند', good.ok === true && good.series.C1.length === 2);

  const shut = await applyLiveScope(base87, {
    fetcher: fakeFetch({ at: at87, market: { open: false, phase: 'holiday', why: 'جمعه، روز معاملاتی نیست' }, rows: [board()] }),
  });
  check('روز غیرمعاملاتی، سری‌ها را دست‌نخورده برمی‌گرداند',
    shut.ok === false && shut.series === base87);
  check('و دلیلش را می‌گوید', shut.note.includes('روز معاملاتی نیست'), shut.note);

  const broken = await applyLiveScope(base87, { fetcher: async () => { throw new Error('شبکه قطع است'); } });
  check('شکست شبکه حالت قبلی را خراب نمی‌کند',
    broken.ok === false && broken.series === base87 && broken.note.includes('شبکه قطع است'));
}
