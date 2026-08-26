// ۶۶. ارزش معاملات هر پا
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group, readSrc } from '../harness.mjs';
import { buildChain, underlyingList } from '../../core/chain.mjs';
import {
  COLUMNS, LEG_VALUE_SLOTS, columnsForStrategy, evaluate, legValueSlots, marginPartDescriptors,
} from '../../core/evaluate.mjs';
import { defaults } from '../../core/settings.mjs';
import { buildLegs, byId } from '../../strategies/catalog.mjs';
import { fmt as uiFmt } from '../../ui/fmt.mjs';



// ═════════ ۶۶. ارزش معاملات هر پا، ستون جدا ═════════
//
// خواسته کاربر: «ارزش معاملات پایه‌ها به صورت ستون مجزا نمایش داده بشه —
// برای هر پایه یک ستون — و قابلیت اضافه و حذف شدن از جدول را داشته باشد.»
//
// تا پیش از این فقط `valueTotal` بود: یک عدد برای کل ترکیب. آن عدد نمی‌گوید
// گردش پخش است یا روی یک پا جمع شده، و همین تفاوت است که می‌گوید ردیف را
// می‌شود بست یا نه.
group('۶۶. ارزش معاملات هر پا');
{
  const size = 1000;
  const mk = (bid, ask, value) => ({
    bid, bidQty: 50, ask, askQty: 80, last: (bid + ask) / 2, close: (bid + ask) / 2,
    low: bid * 0.9, high: ask * 1.1, state: 'A', staleSec: 10,
    oi: 500, oiYday: 400, vol: 1200, trades: 30, value,
    book: [{ level: 1, bid, bidQty: 50, ask, askQty: 80 }],
  });
  const s66 = defaults();

  // ——— اسپرد دوپا: هر پا گردش خودش ———
  const spDef66 = byId('bull-call-spread');
  const sp66 = evaluate({
    legs: buildLegs(spDef66, { strikes: [95000, 105000], size, days: [30] }),
    quotes: [mk(7000, 7400, 8e6), mk(2000, 2300, 2e6)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s66, def: spDef66, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  check('ارزش معاملات هر پا جدا فهرست می‌شود',
    Array.isArray(sp66.valueList) && sp66.valueList.length === 2
    && sp66.valueList[0] === 8e6 && sp66.valueList[1] === 2e6,
    sp66.valueList.join(' , '));
  check('هر پا ستون خودش را دارد، نه یک عدد سرجمع',
    sp66.legValue1 === 8e6 && sp66.legValue2 === 2e6);
  check('و مجموعشان همان ستون قدیمی «ارزش معاملات» است',
    near(sp66.legValue1 + sp66.legValue2, sp66.valueTotal, 1e-9), uiFmt.money(sp66.valueTotal));
  // ستون پای نداشته باید «—» بدهد نه «۰». صفر یعنی «پایی هست که امروز
  // معامله نشد» و اسپرد دوپا اصلاً پای سوم ندارد.
  check('ستون پای نداشته تهی می‌ماند، صفر نمی‌شود',
    Number.isNaN(sp66.legValue3) && Number.isNaN(sp66.legValue4));

  // ——— کاوردکال: پای سهم هم خانه خودش را دارد ———
  //
  // تطبیق با ستون‌های هویت، شرط خواندن است: `legNames` و `legsText` پای سهم
  // را می‌شمارند. اگر این فهرست آن را می‌انداخت، «پای ۱» کاوردکال در یک
  // ستون سهم بود و در ستون دیگر کال.
  const ccDef66 = byId('covered-call');
  const cc66 = evaluate({
    legs: buildLegs(ccDef66, { strikes: [110000], size, days: [30] }),
    quotes: [mk(99000, 100000, 0), mk(4800, 5200, 3e6)],
    ctx: { S: 100000, Sclose: 100000, days: 30, size, qty: 1, settings: s66, def: ccDef66, underlying: 'نمونه', sigmaHist: 0.6 },
  });
  const legN66 = cc66.legPrices.length;
  check('فهرست ارزش، هم‌ترتیب با پاهاست — پای سهم هم خانه دارد',
    cc66.valueList.length === legN66 && legN66 === 2);
  // دیده‌بان اختیار گردش خودِ نماد پایه را در مظنه پا نمی‌دهد. صفر یعنی
  // «امروز معامله نشد» و این ادعا ساختگی است (قاعده ۲-۴ در AGENTS.md).
  check('خانه پای سهم بی‌داده می‌ماند، نه صفر',
    Number.isNaN(cc66.valueList[0]) && Number.isNaN(cc66.legValue1));
  check('پای اختیار کاوردکال گردش خودش را نگه می‌دارد',
    cc66.legValue2 === 3e6 && cc66.valueTotal === 3e6);

  // ——— تابع خالص ———
  check('خانه بیش از سقف ستون‌ها، در فهرست می‌ماند ولی ستون نمی‌گیرد',
    LEG_VALUE_SLOTS === 4
    && legValueSlots([1, 2, 3, 4, 5]).legValue4 === 4
    && !('legValue5' in legValueSlots([1, 2, 3, 4, 5])));
  check('ورودی نامعتبر، ستون تهی می‌دهد نه صفر',
    Number.isNaN(legValueSlots([Infinity]).legValue1)
    && Number.isNaN(legValueSlots(null).legValue1));

  // ——— قرارداد ستونی و قالب ———
  const keys66 = new Set(COLUMNS.map((c) => c.key));
  const need66 = ['valueList', 'legValue1', 'legValue2', 'legValue3', 'legValue4'];
  check('هر ستون تازه در قرارداد ستونی مشترک ثبت شده',
    need66.every((k) => keys66.has(k)), need66.filter((k) => !keys66.has(k)).join('، '));
  check('ستون هر پا، پولی است تا مرتب و رنگ شود',
    need66.slice(1).every((k) => COLUMNS.find((c) => c.key === k).fmt === 'money'));
  // فهرست مبالغ نباید از `list` رد شود: `grouped(NaN)` رشته «NaN» می‌سازد.
  check('فهرست مبالغ قالب خودش را دارد و خانه بی‌داده را «—» می‌کند',
    COLUMNS.find((c) => c.key === 'valueList').fmt === 'moneyList'
    && uiFmt.moneyList([8e6, NaN]).endsWith('—')
    && !uiFmt.moneyList([NaN]).includes('NaN'));
  // حذف خانه بی‌داده، شماره پاها را یکی جلو می‌اندازد و ستون «پای ۲» با
  // خانه دوم فهرست یکی نمی‌ماند.
  check('و خانه بی‌داده را حذف نمی‌کند، تا شماره پاها جابه‌جا نشود',
    uiFmt.moneyList([NaN, 2e6]).split(' , ').length === 2);

  // ——— جدول‌ها: نمایش پیش‌فرض و قابلیت اضافه و حذف ———
  const stratSrc66 = readSrc('../ui/tabs/strategy.mjs');
  const topSrc66 = readSrc('../ui/tabs/top.mjs');
  check('نمای خلاصه هر تب استراتژی، ستون ارزش هر پا را نشان می‌دهد',
    /'legValue1', 'legValue2', 'legValue3', 'legValue4'/.test(stratSrc66));
  check('برترین موقعیت‌ها هم همان ستون‌ها را دارد',
    topSrc66.includes("'legValue1', 'legValue2', 'legValue3', 'legValue4'"));
  check('وجه تضمین کل و اجزای پویای آن در نمای پیش‌فرض هر دو جدول دیده می‌شود',
    stratSrc66.includes("'margin', 'marginNet', 'marginPart1', 'marginPart2', 'marginPart3', 'marginPart4'")
    && topSrc66.includes("'margin', 'marginNet', 'marginPart1', 'marginPart2', 'marginPart3', 'marginPart4'"));
  // ستون «پای ۴» یک اسپرد دوپا همیشه «—» است و فقط پهنا می‌گیرد.
  check('ستون‌های پا به تعداد پاهای همان استراتژی بریده می‌شوند',
    /legValue\(\\d\+\)/.test(stratSrc66) && stratSrc66.includes('Number(m[1]) <= legCount'));
  check('ولی نمای «همه» بریده نمی‌شود',
    stratSrc66.includes("view === 'همه' ? VIEWS[view] : VIEWS[view].filter(fitsLegs)"));
  // «اضافه و حذف» همان انتخابگر ستون است: هر جدولی که `all` بگیرد پنل دارد.
  check('هر دو جدول انتخابگر ستون دارند، پس ستون‌ها اضافه و حذف می‌شوند',
    /all: colsAll, storeKey/.test(stratSrc66) && /all: COLUMNS, storeKey/.test(topSrc66));
  check('و هر چهار ستون در انتخابگر می‌مانند، حتی وقتی از نما بریده شده‌اند',
    need66.slice(1).every((k) => keys66.has(k)));

  // ——— سرستون، خودِ پا را می‌گوید نه فقط شماره‌اش ———
  //
  // خواسته کاربر با یک مثال روشن شد: «برای شورت استرانگل یک کال داریم و یک
  // پوت — ارزش معاملاتی هر کدوم». پس «پای ۲» کافی نیست؛ سرستون باید بگوید
  // کدام پا.
  const strangleCols = columnsForStrategy(byId('short-strangle'));
  const labelOf = (cols, k) => cols.find((c) => c.key === k).label;
  check('سرستون استرانگل فروش می‌گوید کدام پا پوت است و کدام کال',
    labelOf(strangleCols, 'legValue1') === 'ارزش معاملات پای ۱ — فروش پوت'
    && labelOf(strangleCols, 'legValue2') === 'ارزش معاملات پای ۲ — فروش کال',
    labelOf(strangleCols, 'legValue1'));
  check('استرانگل فروش یک ستون وجه تضمین ترکیبی دارد، نه دو ستون مستقل',
    marginPartDescriptors(byId('short-strangle')).length === 1
    && labelOf(strangleCols, 'marginPart1') === 'وجه تضمین ترکیبی — فروش کال و پوت'
    && !strangleCols.some((c) => c.key === 'marginPart2'));
  const condorCols = columnsForStrategy(byId('iron-condor'));
  check('راهبردی با دو جزء واقعی، دو ستون وجه تضمین می‌گیرد',
    marginPartDescriptors(byId('iron-condor')).length === 2
    && condorCols.some((c) => c.key === 'marginPart1')
    && condorCols.some((c) => c.key === 'marginPart2')
    && !condorCols.some((c) => c.key === 'marginPart3'));
  check('راهبرد بی‌وجه تضمین، ستون جزء ساختگی نمی‌گیرد',
    marginPartDescriptors(byId('covered-call')).length === 0
    && !columnsForStrategy(byId('covered-call')).some((c) => /^marginPart\d+$/.test(c.key)));
  // شماره پا حذف نمی‌شود: باترفلای سه پای کال دارد و بدون شماره، سه سرستون
  // هم‌نام می‌شوند و ستون سوم از ستون اول جدا نمی‌ماند.
  const flyCols = columnsForStrategy(byId('long-call-butterfly'));
  check('شماره پا می‌ماند، پس سه پای هم‌نوع باترفلای از هم جدا می‌مانند',
    new Set(['legValue1', 'legValue2', 'legValue3'].map((k) => labelOf(flyCols, k))).size === 3);
  check('نسبت پا در سرستون با رقم فارسی می‌آید',
    labelOf(flyCols, 'legValue2') === 'ارزش معاملات پای ۲ — فروش کال ×۲',
    labelOf(flyCols, 'legValue2'));
  check('پای سهم کاوردکال هم در سرستون نام دارد',
    labelOf(columnsForStrategy(byId('covered-call')), 'legValue1') === 'ارزش معاملات پای ۱ — خرید سهم');
  // ستون بی‌پا دست‌نخورده می‌ماند، وگرنه «— undefined» می‌گیرد
  check('ستون پای نداشته، برچسب خام خودش را نگه می‌دارد',
    labelOf(strangleCols, 'legValue3') === 'ارزش معاملات پای ۳'
    && labelOf(strangleCols, 'valueTotal') === labelOf(COLUMNS, 'valueTotal'));
  check('بدون تعریف استراتژی، همان قرارداد ستونی مشترک برمی‌گردد',
    columnsForStrategy(null) === COLUMNS && columnsForStrategy({ legs: [] }) === COLUMNS);
  check('تب استراتژی همین قاعده را صدا می‌زند، نه رونوشتی از خودش',
    stratSrc66.includes('columnsForStrategy(def)')
    && !/const KIND_FA/.test(stratSrc66));

  // ——— جدول دیده‌بان: گردش خودِ نماد پایه ———
  //
  // ستون «ارزش معاملات» این جدول در واقع مجموع زنجیره بود، نه گردش سهم.
  // دو عدد کاملاً متفاوت با یک نام.
  const rows66 = [{
    uaInsCode: '7', lval30_UA: 'نمونه', pDrCotVal_UA: 100000, pClosing_UA: 100000,
    qTotTran5J_UA: 5000, zTotTran_UA: 40, qTotCap_UA: 5e8,
    strikePrice: 100000, remainedDay: 30, endDate: 20260101, contractSize: 1000,
    insCode_C: 'c1', pMeDem_C: 4800, pMeOf_C: 5200, qTitMeDem_C: 50, qTitMeOf_C: 80,
    pDrCotVal_C: 5000, pClosing_C: 5000, oP_C: 500, yesterdayOP_C: 400,
    qTotTran5J_C: 1200, zTotTran_C: 30, qTotCap_C: 6e6,
    insCode_P: 'p1', pMeDem_P: 4800, pMeOf_P: 5200, qTitMeDem_P: 50, qTitMeOf_P: 80,
    pDrCotVal_P: 5000, pClosing_P: 5000, oP_P: 500, yesterdayOP_P: 400,
    qTotTran5J_P: 1200, zTotTran_P: 30, qTotCap_P: 4e6,
  }];
  const ua66 = underlyingList(buildChain(rows66))[0];
  check('گردش خودِ نماد پایه به فهرست دیده‌بان می‌رسد',
    ua66.uaValue === 5e8, uiFmt.money(ua66.uaValue));
  check('و با مجموع گردش زنجیره یکی گرفته نمی‌شود',
    ua66.value === 1e7 && ua66.value !== ua66.uaValue, uiFmt.money(ua66.value));
  const chainSrc66 = readSrc('../ui/tabs/chain.mjs');
  check('جدول دیده‌بان ستون ارزش معاملات نماد پایه دارد',
    /key: 'uaValue', label: 'ارزش معاملات نماد پایه'/.test(chainSrc66)
    && /'volume', 'value', 'uaValue'/.test(chainSrc66));
  check('و برچسب ستون زنجیره، آن را از گردش سهم جدا می‌کند',
    /key: 'value', label: 'ارزش معاملات اختیار'/.test(chainSrc66));
}
