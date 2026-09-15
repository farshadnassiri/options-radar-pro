// ۸۷. دامنهٔ داده تا لحظهٔ جاری
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';
import { historyPrice } from '../../core/history.mjs';
import {
  LIVE_DAY_PHASES, LIVE_DAY_SOURCES, LIVE_SOURCE_TAPE, liveDayOf, liveDayRows,
  liveTapeCodes, liveTapeDay, mergeLiveDay, tehranDateNumber,
} from '../../core/live-day.mjs';
import { applyLiveScope, liveDaySnapshot, scopeNote } from '../../ui/live-scope.mjs';


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
  // ═══ چرا این دستهٔ آزمون یک بار بازنویسی شد ═══
  //
  // ممیزی (۱۴۰۵/۰۶/۲۴) ردیف ۱۰: «آزمون‌ها سبزند ولی داده آزمایشی با پاسخ
  // واقعی متفاوت است. تست برای پایه فیلدهای `qTotTran5J_UA` و
  // `zTotTran_UA` ساختگی قرار داده، در حالی که امروز این فیلدها در هیچ‌یک
  // از ۸۰۳ ردیف واقعی وجود نداشتند.»
  //
  // درست بود، و دقیقاً همان چیزی است که این دسته را سبزِ بی‌فایده کرده
  // بود: قاعدهٔ «پایه باید حجم داشته باشد» با ورودیِ ساختگی برقرار می‌شد
  // و در بازار واقعی هرگز. پس ردیفِ آزمایشی حالا **همان** شکلِ پاسخ
  // واقعی است — بی حجم، بی تعداد و بی ارزشِ پایه.
  const board = (over = {}) => ({
    uaInsCode: 'UA1', lval30_UA: 'پایه', strikePrice: 1000, remainedDay: 30, endDate: 20260301,
    pDrCotVal_UA: 1050, pClosing_UA: 1040, priceYesterday_UA: 1020,
    insCode_C: 'C1', lVal18AFC_C: 'ضپایه۱۰۰۰',
    pDrCotVal_C: 180, pClosing_C: 175, priceYesterday_C: 160,
    qTotTran5J_C: 4200, zTotTran_C: 55, qTotCap_C: 7.4e8,
    // پای فروش امروز اصلاً معامله نشده: تابلو قیمت دیروزش را حمل می‌کند
    insCode_P: 'P1', lVal18AFC_P: 'طپایه۱۰۰۰',
    pDrCotVal_P: 90, pClosing_P: 90, priceYesterday_P: 90,
    qTotTran5J_P: 0, zTotTran_P: 0, qTotCap_P: 0,
    ...over,
  });
  // خلاصهٔ نوار معاملهٔ نماد پایه — همان شکلی که `summarizeLiveTrades`
  // می‌سازد. این تنها مدرکی است که «پایه امروز معامله شد» را ثابت می‌کند.
  const tape = (over = {}) => ({
    count: 700, volume: 900000, value: 9.4e11,
    firstPrice: 1030, lastPrice: 1050, low: 1025, high: 1060,
    ...over,
  });

  // ——— روزِ عکس ———
  for (const phase of ['open', 'after', 'ungated']) {
    check(`فاز «${phase}» عکس تابلو را به امروز می‌چسباند`,
      liveDayOf({ phase }, Date.UTC(2026, 1, 10, 8, 0), { source: 'watch' }).ok === true);
  }
  for (const [phase, why] of [['before', 'بازار باز نشده'], ['holiday', 'جمعه، روز معاملاتی نیست']]) {
    const out = liveDayOf({ phase, why }, Date.UTC(2026, 1, 10, 3, 0), { source: 'watch' });
    check(`فاز «${phase}» عکس را به امروز نمی‌چسباند`, out.ok === false && out.date === 0);
    check(`دلیل نچسبیدن «${phase}» حفظ می‌شود`, out.why === why, out.why);
  }
  check('فاز ناشناخته هم محتاطانه رد می‌شود', liveDayOf({}, Date.now(), { source: 'watch' }).ok === false);
  check('فهرست فازهای مجاز صریح است', LIVE_DAY_PHASES.join(',') === 'open,after,ungated');
  // ۲۱:۰۰ گرینویچ نهم فوریه در تهران، بامداد دهم است
  check('روز از ساعت تهران خوانده می‌شود نه گرینویچ',
    tehranDateNumber(Date.UTC(2026, 1, 9, 21, 0)) === 20260210,
    String(tehranDateNumber(Date.UTC(2026, 1, 9, 21, 0))));
  check('ساعت نامعتبر روز نمی‌سازد', tehranDateNumber(NaN) === 0);

  // ——— منبعِ عکس، نه فقط فازِ بازار ———
  //
  // ممیزی ردیف ۸: وقتی تابلوی زنده قطع است، سرور بایگانیِ روی دیسک را با
  // `source=watch-archive` سرو می‌کند — و آن اتفاق دقیقاً در فاز `open`
  // می‌افتد، یعنی همان‌جا که بررسیِ فاز سبز می‌شود. ردیفِ دیروز با مهر
  // امروز، از نبودِ ردیف امروز بدتر است.
  check('فهرست منبع‌های زنده صریح است',
    LIVE_DAY_SOURCES.join(',') === 'watch,snapshot,live-trades', LIVE_DAY_SOURCES.join(','));

  // ═══ باگی که این فهرست خودش ساخت ═══
  //
  // ممیزی (دور پنجم): «نگاه باز چندروزه» با پیام «عکس از منبع نامعلوم
  // آمد» کاملاً از کار افتاد. وقتی این فهرست سخت‌گیر شد، نوار ریزمعامله —
  // یک مصرف‌کنندهٔ کاملاً معتبر — نه در فهرست بود و نه اصلاً `source`
  // می‌فرستاد. فهرستِ سفید فقط وقتی امن است که کسی نتواند عضوی را فراموش
  // کند، و رشتهٔ خام در دو فایل دقیقاً همان فراموشی است.
  //
  // این ادعا همان مسیرِ واقعی را می‌سنجد: بدنه‌ای که سرور می‌فرستد، از
  // همان ثابتی که سرور وارد می‌کند، تا خروجیِ تصمیم.
  const tapeBody = (over = {}) => ({
    at: Date.UTC(2026, 1, 10, 8, 30), source: LIVE_SOURCE_TAPE,
    count: 3, market: { open: true, phase: 'open' }, items: {}, ...over,
  });
  check('پاسخِ نوار ریزمعامله به امروز نسبت داده می‌شود',
    liveTapeDay(tapeBody()).ok === true && liveTapeDay(tapeBody()).date === 20260210,
    JSON.stringify(liveTapeDay(tapeBody())));
  // و همان بدنه بدون منبع — یعنی پاسخِ پیش از اصلاح — رد می‌شود
  check('همان بدنه بدون منبع، همان پیام «منبع نامعلوم» را می‌دهد',
    liveTapeDay({ at: tapeBody().at, market: { phase: 'open' } }).why.includes('منبع نامعلوم'));
  check('نوار در بازار بسته هم به امروز نمی‌چسبد',
    liveTapeDay(tapeBody({ market: { phase: 'before', why: 'بازار باز نشده' } })).ok === false);
  // ورودیِ ناقص دیگر ممکن نیست: یک شیء می‌رود، نه دو فیلدِ جدا
  check('ورودیِ خالی هم پرتاب نمی‌کند', liveTapeDay().ok === false && liveTapeDay(null).ok === false);
  // و سرور واقعاً همان ثابت را می‌فرستد، نه رشته‌ای که بتواند جدا بیفتد
  const srv87 = readSrc('../server/server.mjs');
  check('سرور همان ثابتِ مشترک را وارد و ارسال می‌کند',
    srv87.includes('LIVE_SOURCE_TAPE } from \'../core/live-day.mjs\'')
    && srv87.includes('source: LIVE_SOURCE_TAPE'));
  check('و نگاه باز کلِ بدنه را می‌دهد، نه دو فیلدش',
    readSrc('../ui/tabs/open-view.mjs').includes('liveTapeDay(parts[0])'));
  check('عکس مستقیم تابلو پذیرفته می‌شود',
    liveDayOf({ phase: 'open' }, Date.UTC(2026, 1, 10, 8, 0), { source: 'snapshot' }).ok === true);
  for (const source of ['watch-archive', 'archive', 'roster', 'roster-range', '']) {
    const out = liveDayOf({ phase: 'open' }, Date.UTC(2026, 1, 10, 8, 0), { source });
    check(`منبع «${source || 'خالی'}» مهر امروز نمی‌خورد`, out.ok === false && out.date === 0);
  }
  check('بایگانیِ سرو‌شده حتی با منبع درست هم رد می‌شود',
    liveDayOf({ phase: 'open' }, Date.UTC(2026, 1, 10, 8, 0), { source: 'watch', boardUnavailable: true }).ok === false);
  check('و دلیلش را می‌گوید',
    liveDayOf({ phase: 'open' }, Date.UTC(2026, 1, 10, 8, 0), { source: 'archive' }).why.includes('archive'));

  // ——— ردیف‌های امروز ———
  //
  // ═══ ردیف ۱ ممیزی: پایه از تابلو ساخته نمی‌شود، و نباید بشود ═══
  //
  // دیده‌بان اختیار برای نماد پایه فقط قیمت می‌دهد. قیمتِ تنها نمی‌گوید
  // امروز معامله شده یا تابلو دارد قیمت دیروز را حمل می‌کند. ساختنِ ردیف
  // از رویش یعنی ادعای معامله‌ای که مشاهده نشده.
  const boardOnly = liveDayRows([board()], { date: 20260210 });
  check('۱. پایه از عکس تابلوی تنها ردیف نمی‌گیرد', boardOnly.UA1 === undefined);
  check('۱. ولی قرارداد اختیار می‌گیرد — تابلو برایش حجم می‌فرستد', !!boardOnly.C1);

  const live87 = liveDayRows([board()], { date: 20260210, tapeByIns: { UA1: tape() } });
  check('پایه با نوار معامله ردیف امروز می‌گیرد', !!live87.UA1 && !!live87.C1);
  check('پایی که امروز معامله نشده ردیف نمی‌گیرد', live87.P1 === undefined);
  check('نوارِ بی‌معامله هم ردیف نمی‌سازد',
    liveDayRows([board()], { date: 20260210, tapeByIns: { UA1: tape({ count: 0, volume: 0 }) } }).UA1 === undefined);
  check('قیمت‌های ردیف امروز از تابلو می‌آیند',
    live87.C1.last === 180 && live87.C1.close === 175 && live87.C1.yday === 160);
  check('حجم و ارزش امروز هم می‌آیند',
    live87.C1.vol === 4200 && live87.C1.trades === 55 && live87.C1.value === 7.4e8);
  check('اولین، کمترین و بیشترینِ قرارداد از تابلو ساخته نمی‌شوند',
    live87.C1.first === 0 && live87.C1.low === 0 && live87.C1.high === 0);
  check('ردیف امروز نشان‌دار است', live87.C1.live === true && live87.C1.date === 20260210);

  // ═══ ردیف ۶ ممیزی: اولین/کمترین/بیشترین از ریزمعامله می‌آید ═══
  //
  // «عکس زنجیره قیمت اولین، کمترین و بیشترین روز را نمی‌دهد… برای تقویم
  // یا محاسبه امروز با مبنای FIRST/LOW/HIGH باید ریزمعامله خلاصه شود.»
  // خلاصهٔ نوار همان سه عدد را **واقعاً** دارد، پس حدسی در کار نیست.
  check('۶. سه مبنای دیگر از نوار معامله می‌آیند، نه از حدس',
    live87.UA1.first === 1030 && live87.UA1.low === 1025 && live87.UA1.high === 1060);
  check('۶. حجم و تعداد پایه هم از نوار می‌آیند',
    live87.UA1.vol === 900000 && live87.UA1.trades === 700 && live87.UA1.value === 9.4e11);
  check('۶. «قیمت پایانی» پایه از تابلو می‌آید، نه از آخرین معاملهٔ نوار',
    live87.UA1.close === 1040 && live87.UA1.last === 1050);
  check('۶. پایانی نداشته با آخرین معامله جعل نمی‌شود',
    liveDayRows([board({ pClosing_UA: 0 })], { date: 20260210, tapeByIns: { UA1: tape() } }).UA1.close === 0);
  check('۶. منبع هر ردیف نوشته می‌شود',
    live87.UA1.liveSource === 'tape' && live87.C1.liveSource === 'board');
  // و همین یعنی مبناهای «اولین/کمترین/بیشترین» را فقط جایی پیشنهاد
  // می‌کنیم که مشاهده شده‌اند: قیمتی که مشاهده نشده، «فاقد داده» است نه
  // عددی جایگزین.
  check('مبناهای مشاهده‌نشدهٔ قرارداد «فاقد داده» می‌دهند',
    ['FIRST', 'LOW', 'HIGH'].every((basis) => !Number.isFinite(historyPrice(live87.C1, basis)))
    && historyPrice(live87.C1, 'LAST') === 180 && historyPrice(live87.C1, 'CLOSE') === 175);
  check('ولی همان مبناها روی پایهٔ مشاهده‌شده عدد می‌دهند',
    historyPrice(live87.UA1, 'FIRST') === 1030 && historyPrice(live87.UA1, 'LOW') === 1025);
  check('بدون تاریخ، هیچ ردیفی ساخته نمی‌شود',
    Object.keys(liveDayRows([board()], { date: 0, tapeByIns: { UA1: tape() } })).length === 0);
  check('حجم بدون قیمت هم ردیف نمی‌سازد',
    liveDayRows([board({ pDrCotVal_C: 0, pClosing_C: 0 })], { date: 20260210 }).C1 === undefined);
  // نوار مقدم است ولی جایگزینِ تابلو نیست: قراردادی که نوارش نیامده،
  // ردیفش را همچنان از تابلو می‌گیرد.
  check('نبودِ نوار، ردیفِ تابلویی را نمی‌خورد',
    liveDayRows([board()], { date: 20260210, tapeByIns: { UA1: tape() } }).C1.last === 180);

  // ——— چه کسی نوار می‌گیرد ———
  //
  // گرفتنِ نوارِ هر قرارداد صدها درخواست بالادست است. فهرست باید کوچک و
  // دقیق باشد، نه «همه» و نه «هیچ».
  const all88 = [board(), board(), board({ uaInsCode: 'UA2', insCode_C: 'C2', insCode_P: 'P2' })];
  check('کد پایه‌های خواسته‌شده یکتا بیرون می‌آید',
    liveTapeCodes(all88, ['UA1', 'UA2']).join(',') === 'UA1,UA2');
  check('پایه‌ای که خواسته نشده پرسیده نمی‌شود',
    liveTapeCodes(all88, ['UA1']).join(',') === 'UA1');
  check('ردیف بی‌کد پایه شمرده نمی‌شود', liveTapeCodes([{}, { uaInsCode: '  ' }], ['UA1']).length === 0);
  check('قرارداد فقط با درخواست صریح وارد می‌شود',
    liveTapeCodes([board()], ['UA1', 'C1', 'P1']).join(',') === 'UA1');
  // قراردادِ معامله‌شده کامل می‌شود؛ بی‌معامله ردیفی ندارد که کامل شود، پس
  // پرسیدنش فقط سهمیه می‌سوزاند.
  check('با درخواست صریح، قرارداد معامله‌شده اضافه می‌شود',
    liveTapeCodes([board()], ['UA1', 'C1', 'P1'], { withContracts: true }).join(',') === 'UA1,C1');
  check('قرارداد بی‌معاملهٔ امروز پرسیده نمی‌شود',
    !liveTapeCodes([board()], ['UA1', 'C1', 'P1'], { withContracts: true }).includes('P1'));

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
  // ═══ ردیف ۲ ممیزی: ناهم‌ترازی سری‌ها ═══
  // «اختیار امروز دارد، پایه تا دیروز است. این وضعیت برای IV، یونانی‌ها،
  // سودوزیان و مقایسه‌های روزانه قابل اتکا نیست.»
  check('۲. پایه و قرارداد هر دو تا یک روز می‌آیند',
    merged87.series.UA1.at(-1).date === merged87.series.C1.at(-1).date);

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
  // پایانیِ رسمی هم همین‌طور: ردیف لحظه‌ای که پایانی ندارد، نباید آن را صفر کند.
  check('پایانیِ ردیف رسمی با نبودِ پایانیِ لحظه‌ای صفر نمی‌شود',
    mergeLiveDay(withToday, { C1: { ...live87.C1, close: 0 } }, { date: 20260210 })
      .series.C1[1].close === 170);

  check('بدون روز معتبر، سری‌ها دست‌نخورده برمی‌گردند',
    mergeLiveDay(base87, live87, { date: 0 }).series.C1.length === 1);

  // ——— جملهٔ کاربر ———
  const noteOk = scopeNote(merged87, { total: 3, at: Date.UTC(2026, 1, 10, 8, 30) });
  check('جمله می‌گوید چند نماد ردیف گرفتند', noteOk.includes('۲') && noteOk.includes('۳'));
  check('جمله صریحاً می‌گوید روز بسته نشده', noteOk.includes('بسته نشده'));
  const noneNote = scopeNote({ date: 20260210, added: 0, updated: 0 }, { total: 3 });
  check('وقتی هیچ نمادی معامله نکرده، ادعای به‌روزرسانی نمی‌شود',
    noneNote.includes('معامله‌ای نداشتند') && !noneNote.includes('تازه شد'), noneNote);
  // ردیفِ ناقص هم پنهان نمی‌ماند: قرارداد اختیار «اولین/کمترین/بیشترین»
  // ندارد، پس با آن مبناها امروز پیشنهاد نمی‌شود — و علتش باید نوشته شود.
  check('ردیفِ ناقص شمرده می‌شود', merged87.partial === 1, String(merged87.partial));
  check('پایه‌ای که نوار دارد ناقص شمرده نمی‌شود',
    mergeLiveDay({ UA1: base87.UA1 }, live87, { date: 20260210 }).partial === 0);
  check('و جمله می‌گوید با کدام مبناها امروز پیشنهاد نمی‌شود',
    noteOk.includes('فقط «آخرین» و «پایانی»'), noteOk);
  check('نوارِ نرسیده در جمله پنهان نمی‌ماند',
    scopeNote(merged87, { total: 3, tapeErrors: ['شبکه'] }).includes('نوار معاملهٔ نماد پایه کامل نرسید'));

  // ——— مسیر کامل، با پاسخ ساختگی ———
  //
  // `fetcher` دو مسیر دارد چون خودِ قابلیت دو منبع دارد؛ شمارش درخواست‌ها
  // هم ثبت می‌شود تا «نوار فقط برای پایه‌های خواسته‌شده» ادعای روی کاغذ
  // نماند.
  const at87 = Date.UTC(2026, 1, 10, 8, 30);
  const router = ({ rows = [board()], market = { open: true, phase: 'open' }, source = 'watch', tapeByIns = { UA1: tape() }, tapeFails = false } = {}) => {
    const seen = [];
    const fetcher = async (url) => {
      seen.push(String(url));
      if (String(url).startsWith('/api/live-trades')) {
        if (tapeFails) throw new Error('نوار نرسید');
        const codes = new URL(url, 'http://x').searchParams.get('ins').split(',');
        return {
          ok: true,
          json: async () => ({ items: Object.fromEntries(codes.map((ins) => [ins, { ins, summary: tapeByIns[ins] || null }])) }),
        };
      }
      return { ok: true, json: async () => ({ at: at87, source, market, rows }) };
    };
    return { fetcher, seen };
  };

  const good87 = router();
  const good = await applyLiveScope(base87, { fetcher: good87.fetcher });
  check('مسیر کامل روز جاری را می‌چسباند', good.ok === true && good.series.C1.length === 2);
  check('و پایه را هم می‌چسباند، نه فقط قرارداد را',
    good.series.UA1.length === 2 && good.series.UA1.at(-1).date === 20260210);
  check('نوار دقیقاً یک بار و فقط برای پایه گرفته می‌شود',
    good87.seen.filter((url) => url.startsWith('/api/live-trades')).length === 1
    && good87.seen.some((url) => url.includes('ins=UA1')), good87.seen.join(' | '));
  // قراردادها هیچ درخواست اضافه‌ای نمی‌سازند: کدشان نباید در نوار بیاید.
  check('قرارداد اختیار درخواست نوار نمی‌سازد',
    !good87.seen.some((url) => url.includes('C1') || url.includes('P1')), good87.seen.join(' | '));

  // پایه‌ای که فراخوان نخواسته، نوارش هم گرفته نمی‌شود
  const narrow = router();
  await applyLiveScope({ C1: base87.C1 }, { fetcher: narrow.fetcher });
  check('پایهٔ خارج از درخواست، نوار نمی‌گیرد',
    narrow.seen.filter((url) => url.startsWith('/api/live-trades')).length === 0, narrow.seen.join(' | '));

  // نوارِ نرسیده: قرارداد ردیفش را می‌گیرد، پایه نه — و جمله همین را می‌گوید
  const noTape = await applyLiveScope(base87, { fetcher: router({ tapeFails: true }).fetcher });
  check('نوارِ نرسیده تحلیل را خراب نمی‌کند',
    noTape.ok === true && noTape.series.C1.length === 2 && noTape.series.UA1.length === 1);
  check('و علتش در جمله می‌آید', noTape.note.includes('نوار معاملهٔ نماد پایه کامل نرسید'), noTape.note);

  const shut = await applyLiveScope(base87, {
    fetcher: router({ market: { open: false, phase: 'holiday', why: 'جمعه، روز معاملاتی نیست' } }).fetcher,
  });
  check('روز غیرمعاملاتی، سری‌ها را دست‌نخورده برمی‌گرداند',
    shut.ok === false && shut.series === base87);
  check('و دلیلش را می‌گوید', shut.note.includes('روز معاملاتی نیست'), shut.note);

  // ممیزی ردیف ۸، از سرِ رابط: بایگانی هرگز مهر امروز نمی‌خورد
  const archived = await applyLiveScope(base87, { fetcher: router({ source: 'watch-archive' }).fetcher });
  check('۸. بایگانیِ سرو‌شده در فاز باز هم روز جاری نمی‌سازد',
    archived.ok === false && archived.series === base87);

  const broken = await applyLiveScope(base87, { fetcher: async () => { throw new Error('شبکه قطع است'); } });
  check('شکست شبکه حالت قبلی را خراب نمی‌کند',
    broken.ok === false && broken.series === base87 && broken.note.includes('شبکه قطع است'));

  // عکسِ تنها، بدون سری — مسیری که تقویم‌های تک‌نمادی از آن می‌خوانند
  const snap = await liveDaySnapshot({ wanted: ['UA1'], fetcher: router().fetcher });
  check('عکس تک‌نمادی روز و ردیف را می‌دهد',
    snap.ok === true && snap.date === 20260210 && snap.rows.UA1.last === 1050);

  // ——— ۶. مبنای «اولین/کمترین/بیشترین» برای قرارداد هم ———
  //
  // با `tapeFor: 'all'` ریزمعاملهٔ قراردادِ معامله‌شده هم خلاصه می‌شود، پس
  // ردیف امروزش دیگر ناقص نیست و روز جاری با آن مبناها هم پیشنهاد می‌شود.
  const rich = router({ tapeByIns: { UA1: tape(), C1: tape({ firstPrice: 172, lastPrice: 180, low: 168, high: 184, count: 55, volume: 4200, value: 7.4e8 }) } });
  const full = await applyLiveScope(base87, { fetcher: rich.fetcher, tapeFor: 'all' });
  check('۶. با درخواست کامل، قرارداد هم سه مبنای دیگر می‌گیرد',
    full.series.C1.at(-1).first === 172 && full.series.C1.at(-1).low === 168
    && full.series.C1.at(-1).high === 184);
  check('۶. و آن ردیف دیگر ناقص شمرده نمی‌شود', full.partial === 0, String(full.partial));
  check('۶. جملهٔ «فقط آخرین و پایانی» هم دیگر نمی‌آید',
    !full.note.includes('فقط «آخرین» و «پایانی»'), full.note);
  check('۶. پای بی‌معامله همچنان پرسیده نمی‌شود',
    rich.seen.some((url) => url.includes('ins=UA1,C1')) && !rich.seen.some((url) => url.includes('P1')),
    rich.seen.join(' | '));
  // و پیش‌فرض همچنان ارزان است: بی درخواست صریح، قرارداد پرسیده نمی‌شود.
  const cheap = router();
  await applyLiveScope(base87, { fetcher: cheap.fetcher });
  check('۶. پیش‌فرض فقط پایه را می‌پرسد',
    cheap.seen.some((url) => url.includes('ins=UA1')) && !cheap.seen.some((url) => url.includes('C1')),
    cheap.seen.join(' | '));

  // ——— سقفِ سختِ درخواست ———
  //
  // هرچقدر هم «کامل» خواسته شده باشد، چند صد درخواست بالادست بی‌صدا
  // فرستاده نمی‌شود: از سقف که گذشت، فقط پایه‌ها می‌مانند و گزارش می‌شود.
  const capped = router();
  const snapCap = await liveDaySnapshot({
    wanted: ['UA1', 'C1'], fetcher: capped.fetcher, tapeFor: 'all', tapeCap: 1,
  });
  check('سقف که رد شد، نوار قرارداد خاموش می‌شود',
    snapCap.tapeCapped === true && snapCap.taped === 1);
  check('و همان یک پایه همچنان ردیف می‌گیرد', snapCap.rows.UA1.liveSource === 'tape');
}
