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
  DEFAULT_AGE_SEC, DEFAULT_SPREAD_SEC, LIVE_INS_CAP, LIVE_PRIORITIES,
  comboLegIns, comboLiveQuote, livePriority, liveQuoteBook, planLiveQuotes,
} from '../../core/live-quote.mjs';
import { makeDayRange } from '../../core/day-range.mjs';

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
