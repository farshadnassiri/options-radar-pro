// ۲۲۹. مظنهٔ زنده — سهمیه، هم‌زمانی، و کف و سقفِ امروز
//
// ═══ گزارشی که این دسته جوابش است ═══
//
// صاحب پروژه روی `47bce1e` رصد زنده را سنجید و چهار چیز را نوشت که همه
// یک ریشه داشتند: «زنده» بی‌تعریف بود.
//
//   «سقف ۲۴ ابزار باعث پوشش ناقص می‌شود. برای ۱۳۲۰ ترکیب، فقط ۹۰۵ ترکیب
//   قیمت کامل زنده گرفتند؛ ۴۱۵ ترکیب تاریخی ماندند. کاربر امکان تعیین
//   اولویت ابزارها را ندارد.»
//
//   «اولویت ادعاشدهٔ پرمعامله‌ترین پاها اجرا نشده است. برنامه اولین ۲۴
//   شناسهٔ تولیدشده را برمی‌دارد؛ مرتب‌سازی بر حجم، ارزش معامله یا نزدیکی
//   به شرط انجام نمی‌شود.»
//
//   «منبع زنده آخرین معاملهٔ هر پا است، نه قیمت قابل اجرا. زمان معاملهٔ
//   پاها کنترل نمی‌شود … دو پا ممکن است در ساعت‌های متفاوت معامله شده
//   باشند، ولی ترکیب زنده معرفی شود.»
//
//   «کف امروز و سقف امروز در واقع کف و سقف کل بازهٔ تاریخی‌اند.»
//
// این دسته موتورشان را نگه می‌دارد. کارِ رابط در دستهٔ ۲۳۰ است.

import { check, group } from '../harness.mjs';
import {
  BOOK_INS_CAP, DEFAULT_AGE_SEC, DEFAULT_SPREAD_SEC, LIVE_INS_CAP, LIVE_PRIORITIES, LIVE_SOURCES,
  bookQuoteBook, comboBookQuote, comboLegIns, comboLiveQuote, listedOrderScore, livePriority,
  liveQuoteBook, liveSource, planLiveQuotes,
} from '../../core/live-quote.mjs';
import { makeDayRange } from '../../core/day-range.mjs';
import {
  evaluateWatch, normalizeWatchRule, ruleCoverage, ruleScopeUnion, watchSnapshot,
} from '../../core/watch-rule.mjs';

/** ترکیبِ ساختگی: دو پا، با ارزش و حجمِ نازک‌ترین پا. */
const combo = (key, a, b, { value = NaN, volume = NaN } = {}) => ({
  key,
  legs: [{ ins: a, kind: 'call' }, { ins: b, kind: 'call' }],
  metrics: { legValue: value, legVolume: volume },
});

group('۲۲۹-الف. سهمیه به ترکیب داده می‌شود، نه به پا');
{
  // ریشهٔ «۴۱۵ ترکیب تاریخی ماندند» همین بود: فهرستِ **پاها** بریده
  // می‌شد. با سقفِ سه ابزار و سه ترکیبِ دوپایی، بریدنِ پاها یعنی ترکیب
  // دوم نصفه می‌ماند — پای اولش قیمت می‌گیرد، پای دومش نه، و آن ترکیب هم
  // پوشش ندارد و سهمیه‌اش هم سوخته.
  const rows = [combo('a', '1', '2'), combo('b', '3', '4'), combo('c', '5', '6')];
  const plan = planLiveQuotes({ rows, cap: 3, priority: 'listed' });
  check('با سقفِ سه ابزار، یک ترکیبِ کامل سهمیه می‌گیرد نه یک‌ونیم ترکیب',
    plan.keys.length === 1 && plan.ins.length === 2 && plan.keys[0] === 'a');
  check('و ترکیب‌های جانشده شمرده می‌شوند تا بی‌صدا نیفتند',
    plan.dropped === 2);
  // سهمیهٔ خالی هدر است: ترکیبی که جا نشد حلقه را نمی‌شکند، چون ترکیبِ
  // بعدی ممکن است در باقی‌مانده جا شود.
  const mixed = planLiveQuotes({
    rows: [
      { key: 'big', legs: [{ ins: '1' }, { ins: '2' }, { ins: '3' }, { ins: '4' }] },
      combo('small', '5', '6'),
    ],
    cap: 3, priority: 'listed',
  });
  check('ترکیبی که جا نشد، حلقه را نمی‌شکند؛ ترکیبِ کوچک‌ترِ بعدی جا می‌گیرد',
    mixed.keys.join(',') === 'small' && mixed.dropped === 1 && mixed.ins.join(',') === '5,6');
}

group('۲۲۹-ب. اولویت، انتخابِ کاربر است');
{
  // «اولویتِ پرمعامله‌ترین پاها اجرا نشده است» — و این ادعا در متنِ کد
  // نوشته شده بود ولی در رفتار نبود. حالا ترتیبِ ورودی عمداً برعکسِ
  // ترتیبِ ارزش است تا آزمون بتواند تفاوت را ببیند.
  const rows = [
    combo('cheap', '1', '2', { value: 1e6, volume: 900 }),
    combo('rich', '3', '4', { value: 9e9, volume: 10 }),
    combo('mid', '5', '6', { value: 5e8, volume: 100 }),
  ];
  check('با اولویتِ ارزش، پرمعامله‌ترین ترکیب اول سهمیه می‌گیرد',
    planLiveQuotes({ rows, cap: 2, priority: 'value' }).keys.join(',') === 'rich');
  check('با اولویتِ حجم، پرحجم‌ترین — و این با پرارزش‌ترین یکی نیست',
    planLiveQuotes({ rows, cap: 2, priority: 'volume' }).keys.join(',') === 'cheap');
  check('با «ترتیب جدول»، ترتیبِ خودِ کاربر دست‌نخورده می‌ماند',
    planLiveQuotes({ rows, cap: 2, priority: 'listed' }).keys.join(',') === 'cheap');
  check('و امتیازِ تزریقی، اولویتِ «نزدیک‌ترین به شرط» را ممکن می‌کند',
    planLiveQuotes({ rows, cap: 2, priority: 'near', score: (row) => (row.key === 'mid' ? 1 : 0) })
      .keys.join(',') === 'mid');
  // نمادِ پایه یک خانه از بیست‌وچهار می‌گیرد: بی آن، شرطِ «قیمت نماد
  // پایه» عدد ندارد و وجه تضمین با اسپاتِ دیروز حساب می‌شود.
  const reserved = planLiveQuotes({ rows, cap: 3, priority: 'value', reserve: ['99'] });
  check('نمادِ پایه پیش از همه رزرو می‌شود',
    reserved.ins[0] === '99' && reserved.reserved.join(',') === '99' && reserved.keys.join(',') === 'rich');
  check('و سقفِ ماژول همان سقفِ سرور است، نه عددی جادویی در رابط',
    LIVE_INS_CAP === 24 && LIVE_PRIORITIES.length === 4 && livePriority('nope').id === 'value');
  check('پای پایهٔ سهام، ابزارِ اختیار شمرده نمی‌شود',
    comboLegIns([{ ins: '1', kind: 'call' }, { ins: '9', kind: 'underlying' }]).join(',') === '1');
}

group('۲۲۹-ج. «زنده» یعنی همهٔ پاها، هم‌زمان، و تازه');
{
  const book = liveQuoteBook({
    at: 1,
    items: {
      1: { summary: { lastPrice: 1200, lastTime: 121500, count: 4 } },
      2: { summary: { lastPrice: 800, lastTime: 121700, count: 2 } },
      3: { summary: { lastPrice: 500, lastTime: 90500, count: 1 } },
      4: { summary: { lastPrice: 0, lastTime: 121500, count: 0 } },
    },
  });
  check('دفتر، هم قیمت را می‌آورد هم زمانِ آن را به ثانیهٔ روز',
    book.prices['1'] === 1200 && book.times['1'] === 12 * 3600 + 15 * 60);
  check('و پایی که امروز معامله نشده اصلاً در دفتر نمی‌آید',
    book.prices['4'] === undefined);

  const legs = (a, b) => [{ ins: a, kind: 'call' }, { ins: b, kind: 'call' }];
  const now = 12 * 3600 + 20 * 60;
  const ok = comboLiveQuote({ legs: legs('1', '2'), book, nowSec: now });
  check('دو پا با دو دقیقه فاصله، ترکیبِ زندهٔ معتبر است',
    ok.ok === true && ok.spreadSec === 120);

  // ═══ همان چیزی که گزارش گرفت ═══
  // پای ۹:۰۵ و پای ۱۲:۱۵: تفاضلشان عددی است که هیچ لحظه‌ای در بازار
  // وجود نداشته. پیش از این، این ترکیب «زنده» معرفی می‌شد.
  const apart = comboLiveQuote({ legs: legs('1', '3'), book, nowSec: now });
  check('ولی دو پایی که ساعت‌ها از هم دور معامله شده‌اند، زنده نیستند',
    apart.ok === false && apart.priced === 2 && apart.why.includes('یک لحظه'));

  const missing = comboLiveQuote({ legs: legs('1', '4'), book, nowSec: now });
  check('و پایی که قیمت ندارد، ترکیب را باطل می‌کند — نه اینکه با عددِ روزانه پر شود',
    missing.ok === false && missing.priced === 1);

  const stale = comboLiveQuote({ legs: legs('1', '2'), book, nowSec: now + 4 * 3600 });
  check('آخرین معاملهٔ کهنه هم «اکنون» نیست',
    stale.ok === false && stale.why.includes('کهنه'));
  check('بی ساعتِ مرجع، سن سنجیده نمی‌شود ولی هم‌زمانی همچنان سنجیده می‌شود',
    comboLiveQuote({ legs: legs('1', '2'), book, nowSec: NaN }).ok === true
    && comboLiveQuote({ legs: legs('1', '3'), book, nowSec: NaN }).ok === false);
  check('سقف‌های پیش‌فرض در ماژول نوشته شده‌اند، نه در رابط',
    DEFAULT_SPREAD_SEC === 300 && DEFAULT_AGE_SEC === 1800);
  // زمانِ نداشته، قبولِ خاموش نمی‌شود: سرور زمان می‌دهد و نبودش یعنی
  // چیزی در پاسخ درست نیست.
  const timeless = liveQuoteBook({ at: 1, items: { 1: { summary: { lastPrice: 5, lastTime: 0 } },
    2: { summary: { lastPrice: 6, lastTime: 0 } } } });
  check('پاسخِ بی‌زمان، ترکیب را زنده نمی‌کند',
    comboLiveQuote({ legs: legs('1', '2'), book: timeless, nowSec: now }).ok === false);
}

group('۲۲۹-د. کف و سقفِ امروز، از خودِ امروز');
{
  const book = makeDayRange();
  check('پیش از نخستین مشاهده، عدد نداریم — و نداشتن، صفر نیست',
    !Number.isFinite(book.get('a').low) && book.get('a').count === 0);
  book.observe('a', 500, { date: 20260905 });
  book.observe('a', 300, { date: 20260905 });
  book.observe('a', 900, { date: 20260905 });
  const row = book.get('a');
  check('کف و سقف از مشاهده‌های امروز ساخته می‌شوند',
    row.low === 300 && row.high === 900 && row.first === 500 && row.last === 900 && row.count === 3);
  check('عددِ نداشته وارد نمی‌شود و کف را صفر نمی‌کند',
    book.observe('a', NaN, { date: 20260905 }) === null && book.get('a').low === 300);
  // تبی که شب باز مانده و صبح تیک می‌زند، نباید کفِ دیروز را «کف امروز»
  // بخواند.
  book.observe('a', 700, { date: 20260906 });
  check('روز که عوض شود، دفتر از نو ساخته می‌شود',
    book.get('a').low === 700 && book.get('a').high === 700 && book.date === 20260906);
  book.reset(0);
  check('و خاموش‌شدنِ رصد، دفتر را پاک می‌کند',
    book.size === 0 && !Number.isFinite(book.get('a').high));
}

group('۲۲۹-ه. «ترتیب جدول» یعنی ترتیبِ دیده‌شدهٔ جدول');
{
  // «پس از تغییر مرتب‌سازی، ردیف اول از Bear Put به Bull Call تغییر کرد،
  // اما هر ۲۴ شناسهٔ درخواست زنده دقیقاً ثابت ماند.» علتش این بود که
  // `listed` به ترتیبِ آرایهٔ ساخت نگاه می‌کرد، نه به دیدِ جدول.
  const rows = [combo('a', '1', '2'), combo('b', '3', '4'), combo('c', '5', '6')];
  const plain = planLiveQuotes({ rows, cap: 2, priority: 'listed' });
  check('بی دیدِ جدول، همان ترتیبِ ساخت می‌ماند',
    plain.keys.join(',') === 'a');
  // جدول روی ستونی مرتب شده و حالا «c» بالاست.
  const sorted = planLiveQuotes({ rows, cap: 2, priority: 'listed',
    score: listedOrderScore([{ key: 'c' }, { key: 'a' }, { key: 'b' }]) });
  check('با دیدِ جدول، سهمیه از بالای همان ترتیب برداشته می‌شود',
    sorted.keys.join(',') === 'c');
  // ردیفی که در دید نیست (پالایه یا صفحه‌بندی) امتیاز ندارد و ته صف است.
  const partial = planLiveQuotes({ rows, cap: 2, priority: 'listed',
    score: listedOrderScore([{ key: 'b' }]) });
  check('ردیفی که در دیدِ جدول نیست، ته صف می‌رود نه اول',
    partial.keys.join(',') === 'b');
  check('و دیدِ خالی، امتیازی نمی‌سازد تا ترتیبِ ساخت دست‌نخورده بماند',
    listedOrderScore([]) === null);
}

group('۲۲۹-و. کدام قاعده در این ساخت داده دارد');
{
  const rule = (id, baseIns, strategyIds, extra = {}) => ({
    id, enabled: true, name: id, baseIns, strategyIds, conditions: [], ...extra,
  });
  const rules = [
    rule('همین‌جا', ['1'], ['bull']),
    rule('نمادِ دیگر', ['9'], ['bull']),
    rule('استراتژیِ دیگر', ['1'], ['bear']),
    rule('بی‌قید', [], []),
    rule('نصفه', ['1', '9'], ['bull']),
    rule('خاموش', ['1'], ['bull'], { enabled: false }),
    rule('ترکیبِ نام‌برده', [], [], { comboKey: 'bull::x' }),
  ];
  const one = ruleCoverage(rules, { baseIns: ['1'], strategyIds: ['bull'], keys: ['bull::y'] });
  check('قاعده‌ای که نمادش یا استراتژی‌اش در ساخت نیست، رصد نمی‌شود',
    one.watched.map((r) => r.id).join(',') === 'همین‌جا,بی‌قید,نصفه');
  check('و علتِ هر کدام گفته می‌شود، نه اینکه بی‌صدا بیفتد',
    one.dormant.length === 4
    && one.dormant.some((d) => d.why.includes('نمادهایش'))
    && one.dormant.some((d) => d.why.includes('استراتژی‌هایش'))
    && one.dormant.some((d) => d.why === 'خاموش است')
    && one.dormant.some((d) => d.why.includes('ترکیبِ نام‌بردهٔ این قاعده')));
  check('قاعدهٔ نصفه رصد می‌شود ولی نصفه‌بودنش هم گزارش می‌شود',
    one.partial.length === 1 && one.partial[0].rule.id === 'نصفه'
    && one.partial[0].missingBases.join(',') === '9');
  // فهرستِ خالی یعنی «قید نگذاشته‌ام» — همان قاعدهٔ `inScope`.
  check('قاعدهٔ بی‌قید همه‌جا داده دارد',
    one.watched.some((r) => r.id === 'بی‌قید'));

  const union = ruleScopeUnion(rules.filter((r) => r.enabled && !r.comboKey && r.id !== 'بی‌قید'));
  check('اجتماعِ دامنه‌ها، فهرستِ چیدنی برای «همهٔ قاعده‌ها» می‌دهد',
    union.baseIns.sort().join(',') === '1,9' && union.strategyIds.sort().join(',') === 'bear,bull');
  check('و قاعدهٔ بی‌قید صریح گفته می‌شود، چون «همهٔ بازار» ساختنی نیست',
    ruleScopeUnion(rules).anyBase === true && ruleScopeUnion(rules).anyDef === true);
}

group('۲۲۹-ز. شرطِ «قیمت نماد پایه»، سرتاسر');
{
  // «شرط ترکیبیِ پرشدگی ≥ ۳۰٪ و قیمت پایه ≥ ۰ در پیش‌نمایش ۲۴۴ نتیجه
  // داشت، اما پس از شروع رصد هیچ نتیجه‌ای به شمار زنده اضافه نکرد.»
  // ریشه: نماد پایه در سهمیهٔ زنده رزرو نمی‌شد، پس `basePrice` در عکسِ
  // زنده `NaN` می‌ماند و شرطِ «≥ ۰» — که همیشه برقرار است — هرگز
  // برقرار نمی‌شد. این گروه همان زنجیره را می‌سازد.
  const baseIns = '77';
  const rows = [combo('a', '1', '2'), combo('b', '3', '4')];
  const rule = normalizeWatchRule({
    name: 'ترکیبی', baseIns: [baseIns], strategyIds: [],
    conditions: [
      { metric: 'coveragePct', op: 'ge', value: 30, ref: 'abs' },
      { metric: 'basePrice', op: 'ge', value: 0, ref: 'abs' },
    ],
  });
  check('قاعدهٔ ترکیبی ساخته می‌شود', rule.ok === true);

  const plan = planLiveQuotes({ rows, cap: 6, priority: 'listed', reserve: [baseIns] });
  check('نمادِ پایه در فهرستِ درخواستِ زنده هست',
    plan.ins.includes(baseIns) && plan.keys.length === 2);

  const items = { [baseIns]: { summary: { lastPrice: 111012, lastTime: 121500 } } };
  for (const ins of ['1', '2', '3', '4']) items[ins] = { summary: { lastPrice: 900, lastTime: 121500 } };
  const book = liveQuoteBook({ at: 1, items });

  const snapshot = (withBase) => watchSnapshot({
    key: 'a', def: { id: 'bull', name: 'Bull Call' }, strikes: [1, 2],
    gap: { current: 900, coveragePct: 45, daysLeft: 30 }, metrics: {}, verdict: {},
    series: { points: [] },
  }, { baseIns, baseName: 'اهرم', basePrice: withBase ? book.prices[baseIns] : NaN });

  const withBase = snapshot(true);
  check('و قیمتش به عکسِ شرط می‌رسد — همان عددی که نوار وضعیت می‌گوید',
    withBase.basePrice === 111012);
  check('پس شرطِ ترکیبی برقرار می‌شود',
    evaluateWatch({ rules: [rule.rule], snapshots: [withBase], prev: {}, nowMs: 1000 })
      .matched.get(rule.rule.id).length === 1);
  // و همان زنجیره بی رزروِ پایه، همان شکستِ گزارش‌شده را می‌دهد.
  check('ولی بی رزروِ پایه، همان شرط صفر نتیجه می‌دهد — همان چیزی که گزارش دید',
    evaluateWatch({ rules: [rule.rule], snapshots: [snapshot(false)], prev: {}, nowMs: 1000 })
      .matched.get(rule.rule.id).length === 0);
}

group('۲۲۹-ح. چرخشِ سهمیه — تا ترکیبی برای همیشه بیرون نماند');
{
  // «سقف ۲۴ ابزار هنوز بدون چرخش است؛ در آزمون ۴۲۰ ترکیب، فقط ۲۸۲
  // ترکیب سهمیه گرفتند و ۱۳۸ ترکیب با اولویت ثابت می‌توانند دائماً خارج
  // از رصد بمانند.» «دائماً» کلمهٔ درستی بود.
  const rows = [...Array(7)].map((_, at) => combo(`k${at}`, String(at * 2 + 1), String(at * 2 + 2)));
  const noRotate = [];
  for (let tick = 0; tick < 4; tick += 1) {
    noRotate.push(planLiveQuotes({ rows, cap: 4, priority: 'listed', startAt: 0 }).keys.join(','));
  }
  check('بی چرخش، هر تیک همان دو ترکیبِ اول — و بقیه هیچ‌وقت',
    new Set(noRotate).size === 1 && noRotate[0] === 'k0,k1');

  const seen = new Set();
  let cursor = 0, ticks = 0, cycle = 0;
  while (ticks < 12 && seen.size < rows.length) {
    const plan = planLiveQuotes({ rows, cap: 4, priority: 'listed', startAt: cursor });
    for (const key of plan.keys) seen.add(key);
    cycle = plan.cycleTicks;
    cursor = plan.nextStart;
    ticks += 1;
  }
  check('با چرخش، هر ترکیب بالاخره نوبت می‌گیرد',
    seen.size === rows.length, `${ticks} تیک`);
  check('و طولِ دورِ چرخش گفته می‌شود، تا کاربر بداند هر ترکیب هر چند تیک تازه می‌شود',
    cycle === Math.ceil(rows.length / 2));
  // صف نباید قفل شود: ترکیبی که هیچ‌وقت جا نمی‌شود، مکان‌نما را نگه ندارد.
  const stuck = planLiveQuotes({
    rows: [{ key: 'huge', legs: [...Array(9)].map((_, at) => ({ ins: `x${at}` })) }],
    cap: 3, priority: 'listed', startAt: 0,
  });
  check('ترکیبی که هرگز جا نمی‌شود، صف را قفل نمی‌کند',
    stuck.keys.length === 0 && stuck.nextStart === 0 && stuck.covered === 0);
}

group('۲۲۹-ط. مظنهٔ قابل اجرا — سمتِ درستِ هر پا');
{
  // «منبع فعلی آخرین معامله است، نه bid/ask قابل اجرا.» دفترِ سفارش
  // هست: `/api/books` همان `BestLimits` را تا ۲۰۰ ابزار می‌دهد.
  const book = bookQuoteBook({
    1: { book: [{ level: 1, bid: 900, ask: 1000, bidQty: 50, askQty: 40 }] },
    2: { book: [{ level: 1, bid: 300, ask: 340, bidQty: 20, askQty: 10 }] },
    3: { book: [{ level: 1, bid: 0, ask: 500, bidQty: 0, askQty: 5 }] },
    4: { error: 'x' },
  });
  check('دفتر، هر دو سمتِ سطح اول را با حجمشان می‌آورد',
    book.books['1'].ask === 1000 && book.books['1'].bidQty === 50
    && book.books['4'] === undefined);

  const legs = [
    { ins: '1', kind: 'call', side: 'buy', ratio: 1 },
    { ins: '2', kind: 'call', side: 'sell', ratio: 1 },
  ];
  const quote = comboBookQuote({ legs, book });
  // پای خریدنی از **عرضه** و پای فروختنی از **تقاضا** — یعنی بهای
  // بازکردنِ همین موقعیت در همین جهت. سمتِ اشتباه، عددی می‌سازد که فقط
  // در جهتِ عکس اجرا می‌شود.
  check('پای خریدنی با بهترین عرضه و پای فروختنی با بهترین تقاضا قیمت می‌خورد',
    quote.ok === true && quote.prices['1'] === 1000 && quote.prices['2'] === 300);
  check('و عمقِ قابل اجرا از کوچک‌ترین سمتِ لازم می‌آید',
    quote.units === 20);
  check('پهنای دفتر هم گزارش می‌شود، چون سطح اولِ پهن، «قیمت» نیست',
    Math.abs(quote.spreadPct - 12.5) < 1e-9);
  check('قیدِ عمق، ترکیبی را که سطح اولش کم‌حجم است رد می‌کند',
    comboBookQuote({ legs, book, minUnits: 30 }).ok === false);
  // پایی که یک سمتش خالی است، در آن جهت اجرا نمی‌شود.
  check('پایی که تقاضایی برای فروختن ندارد، ترکیب را باطل می‌کند',
    comboBookQuote({ legs: [{ ins: '3', kind: 'call', side: 'sell', ratio: 1 }], book }).ok === false);
  check('ولی همان پا در جهتِ خرید اجرا می‌شود',
    comboBookQuote({ legs: [{ ins: '3', kind: 'call', side: 'buy', ratio: 1 }], book }).ok === true);
  check('و پایی که اصلاً در سهمیهٔ دفتر نبود، ترکیب را باطل می‌کند',
    comboBookQuote({ legs: [{ ins: '4', kind: 'call', side: 'buy', ratio: 1 }], book }).why.includes('سهمیهٔ دفتر'));
  check('سقفِ دفتر بزرگ‌تر از سقفِ معامله است، چون یک درخواست بیشتر می‌گیرد',
    BOOK_INS_CAP > LIVE_INS_CAP && LIVE_SOURCES.length === 2 && liveSource('nope').id === 'trade');
}
