// ۹۸. دفتر سفارش تاریخی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { tradeSecond } from '../../core/backtest.mjs';
import {
  bookAt, bookPath, bookSanity, normalizeBookEvents, quoteFromBook, secondToHms,
} from '../../core/book-history.mjs';
import { walkBook } from '../../core/exec.mjs';
import { HISTORICAL_KINDS, historicalPath, historicalTradesPath } from '../../server/guard.mjs';


// ═══════════════════ ۹۸. دفتر سفارش تاریخی ═══════════════════
//
// این گروه تنها جایی است که ادعای «در آن لحظهٔ گذشته می‌شد اجرا کرد» از آن
// بیرون می‌آید، پس بیش از درستیِ عدد، درستیِ **نگفتن** را می‌سنجد: سطحی که
// رکورد نداشته نباید ساخته شود، و بازسازیِ پشت‌ورو باید دیده شود.
group('۹۸. دفتر سفارش تاریخی');
{
  // دفتر رویدادِ یک قرارداد در یک روز. سطح ۱ تا ۵ در بازگشایی، بعد دو
  // تغییر: سطح یک در ۹:۳۵:۱۰ و سطح دو در ۱۰:۰۰:۰۰.
  const raw = [
    { hEven: 90000, refID: 5, number: 5, pMeDem: 960, qTitMeDem: 500, zOrdMeDem: 5, pMeOf: 1040, qTitMeOf: 500, zOrdMeOf: 5 },
    { hEven: 90000, refID: 1, number: 1, pMeDem: 1000, qTitMeDem: 100, zOrdMeDem: 1, pMeOf: 1010, qTitMeOf: 100, zOrdMeOf: 1 },
    { hEven: 90000, refID: 2, number: 2, pMeDem: 990, qTitMeDem: 200, zOrdMeDem: 2, pMeOf: 1020, qTitMeOf: 200, zOrdMeOf: 2 },
    { hEven: 90000, refID: 3, number: 3, pMeDem: 980, qTitMeDem: 300, zOrdMeDem: 3, pMeOf: 1030, qTitMeOf: 300, zOrdMeOf: 3 },
    { hEven: 90000, refID: 4, number: 4, pMeDem: 970, qTitMeDem: 400, zOrdMeDem: 4, pMeOf: 1035, qTitMeOf: 400, zOrdMeOf: 4 },
    { hEven: 93510, refID: 20, number: 1, pMeDem: 1005, qTitMeDem: 150, zOrdMeDem: 2, pMeOf: 1008, qTitMeOf: 90, zOrdMeOf: 1 },
    { hEven: 100000, refID: 30, number: 2, pMeDem: 995, qTitMeDem: 250, zOrdMeDem: 3, pMeOf: 1015, qTitMeOf: 180, zOrdMeOf: 2 },
  ];
  const events = normalizeBookEvents(raw);

  check('نرمال‌سازی روی خروجی ازپیش‌نرمال‌شده همانی است و دفتر را خالی نمی‌کند',
    JSON.stringify(normalizeBookEvents(events)) === JSON.stringify(events));

  check('رویدادها به ثانیه و بعد refID مرتب می‌شوند',
    events.map((e) => e.refId).join(',') === '1,2,3,4,5,20,30');
  check('ثانیه از HHMMSS درست درمی‌آید', events[0].second === 9 * 3600 && events[5].second === 9 * 3600 + 35 * 60 + 10);

  // ——— بازسازی در سه لحظه ———
  const open = bookAt(events, 9 * 3600 + 60);          // ۹:۰۱
  check('دفتر بازگشایی هر پنج سطح را دارد', open.levelsKnown === 5 && open.complete === true);
  check('بهترین تقاضا و عرضهٔ بازگشایی درست است', open.book[0].bid === 1000 && open.book[0].ask === 1010);
  check('دفتر بازگشایی یکنواخت است', open.sane === true && open.crossed === false);

  const mid = bookAt(events, 9 * 3600 + 40 * 60);      // ۹:۴۰ — بعد از تغییر سطح یک
  check('سطح تغییرکرده تازه‌ترین رکوردش را می‌گیرد', mid.book[0].bid === 1005 && mid.book[0].ask === 1008);
  check('سطح تغییرنکرده از بازگشایی حمل می‌شود', mid.book[1].bid === 990 && mid.book[4].bid === 960);
  check('سن دفتر از تازه‌ترین سطح حساب می‌شود', mid.ageSec === (9 * 3600 + 40 * 60) - (9 * 3600 + 35 * 60 + 10));
  check('سن کهنه‌ترین سطح جدا گزارش می‌شود', mid.oldestAgeSec === (9 * 3600 + 40 * 60) - 9 * 3600);

  const late = bookAt(events, 11 * 3600);
  check('هر دو تغییر تا ساعت یازده نشسته‌اند', late.book[0].bid === 1005 && late.book[1].bid === 995);

  // ——— آنچه ساخته نمی‌شود ———
  check('پیش از اولین رویداد، دفتری گزارش نمی‌شود', bookAt(events, 8 * 3600) === null);
  check('ثانیهٔ نامعتبر دفتر نمی‌سازد', bookAt(events, NaN) === null);
  {
    // سطح سه رکوردش دیر می‌آید: در ۹:۱۰ باید **نباشد**، نه اینکه صفر شود.
    const late3 = normalizeBookEvents([
      { hEven: 90000, refID: 1, number: 1, pMeDem: 1000, qTitMeDem: 100, pMeOf: 1010, qTitMeOf: 100 },
      { hEven: 90000, refID: 2, number: 2, pMeDem: 990, qTitMeDem: 200, pMeOf: 1020, qTitMeOf: 200 },
      { hEven: 95000, refID: 9, number: 3, pMeDem: 980, qTitMeDem: 300, pMeOf: 1030, qTitMeOf: 300 },
    ]);
    const early = bookAt(late3, 9 * 3600 + 600);
    check('سطحی که هنوز رکورد نداشته اصلاً در دفتر نیست',
      early.levelsKnown === 2 && early.complete === false && !early.book.some((r) => r.level === 3));
    check('ناقص بودن دفتر با شمار سطح اعلام می‌شود', early.levelsTotal === 5);
  }

  // ——— نگهبانِ بازسازی غلط ———
  check('تقاضای غیریکنواخت دیده می‌شود',
    bookSanity([{ level: 1, bid: 990, ask: 1010 }, { level: 2, bid: 1000, ask: 1020 }]).sane === false);
  check('عرضهٔ غیریکنواخت دیده می‌شود',
    bookSanity([{ level: 1, bid: 1000, ask: 1020 }, { level: 2, bid: 990, ask: 1010 }]).asksOk === false);
  check('سطح خالی یکنواختی را نمی‌شکند',
    bookSanity([{ level: 1, bid: 1000, ask: 1010 }, { level: 2, bid: 0, ask: 0 }]).sane === true);
  check('دفتر متقاطع جدا از ناسالم علامت می‌خورد', (() => {
    const s = bookSanity([{ level: 1, bid: 1020, ask: 1010 }]);
    return s.crossed === true && s.sane === true;
  })());

  // ——— مسیر سریع باید با مسیر ساده یکی دربیاید ———
  {
    const moments = [9 * 3600 + 60, 9 * 3600 + 40 * 60, 10 * 3600 + 30 * 60, 8 * 3600];
    const fast = bookPath(events, moments);
    const slow = moments.slice().sort((a, b) => a - b).map((s) => ({ second: s, snap: bookAt(events, s) }));
    const same = fast.every((row, at) => {
      const ref = slow[at].snap;
      if (!ref) return row.book === null;
      return JSON.stringify(row.book) === JSON.stringify(ref.book) && row.ageSec === ref.ageSec;
    });
    check('bookPath با bookAt در هر لحظه یکی است', same);
    check('bookPath لحظهٔ پیش از اولین رویداد را خالی می‌دهد', fast[0].book === null);
  }

  // ——— پل به موتور اجرا ———
  {
    const quote = quoteFromBook(bookAt(events, 9 * 3600 + 40 * 60));
    check('quoteFromBook بهترین سطح را بالا می‌آورد', quote.bid === 1005 && quote.ask === 1008);
    check('quoteFromBook ساعت و کهنگی را حمل می‌کند', quote.asOf === 9 * 3600 + 35 * 60 + 10 && quote.stale === 290);
    const walk = walkBook(quote.book, 200, 'buy');
    // ۹۰ تا در ۱۰۰۸، بقیه از سطح دو در ۱۰۲۰
    check('walkBook روی دفتر بازسازی‌شده عمق را می‌پیماید',
      walk.filled === 200 && Math.abs(walk.vwap - ((90 * 1008 + 110 * 1020) / 200)) < 1e-9);
    check('دفتر خالی مظنه نمی‌سازد', quoteFromBook(null) === null);
  }

  // ——— refID نبود، ولی ترتیب حفظ شد ———
  {
    const noRef = normalizeBookEvents([
      { hEven: 90000, number: 1, pMeDem: 1000, pMeOf: 1010 },
      { hEven: 90000, number: 2, pMeDem: 990, pMeOf: 1020 },
    ]);
    check('نبودن refID در خروجی علامت می‌خورد', noRef.every((e) => e.refIdKnown === false));
    check('بدون refID هم ترتیب ورود آرایه جای آن می‌نشیند', bookAt(noRef, 9 * 3600 + 10).levelsKnown === 2);
  }

  // ——— رفت و برگشت ثانیه ———
  check('secondToHms معکوس tradeSecond است',
    [0, 9 * 3600, 9 * 3600 + 35 * 60 + 10, 12 * 3600 + 30 * 60].every((s) => tradeSecond(secondToHms(s)) === s));
  check('رکورد با سطح بیرون از یک تا پنج کنار گذاشته می‌شود',
    normalizeBookEvents([{ hEven: 90000, number: 9, pMeDem: 1 }, { hEven: 90000, number: 0, pMeDem: 1 }]).length === 0);

  // ——— دروازهٔ مسیرهای تاریخ‌دار ———
  check('هشت نوع تاریخی در جدول هست',
    HISTORICAL_KINDS.length === 8 && HISTORICAL_KINDS.includes('book') && HISTORICAL_KINDS.includes('threshold'));
  check('مسیر دفتر تاریخی درست ساخته می‌شود',
    historicalPath('book', '17765240', '20260521') === '/BestLimits/17765240/20260521');
  check('مسیر تک‌معامله همان مسیر قبلی می‌ماند',
    historicalPath('trades', '17765240', '20260521') === historicalTradesPath('17765240', '20260521'));
  check('نوع ناشناخته مسیر نمی‌سازد', historicalPath('anything', '17765240', '20260521') === null);
  check('نوعِ ارث‌بری‌شده از Object مسیر نمی‌سازد',
    historicalPath('toString', '17765240', '20260521') === null
    && historicalPath('constructor', '17765240', '20260521') === null);
  check('کد یا تاریخ نامعتبر مسیر نمی‌سازد',
    historicalPath('book', '17a65240', '20260521') === null
    && historicalPath('book', '17765240', '2026052') === null
    && historicalPath('book', '17765240', '../../x') === null);
}
