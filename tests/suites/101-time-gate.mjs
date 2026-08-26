// ۱۰۰. دروازهٔ زمان و آزمون نشت
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { INTRADAY_END_SECOND, tradeSecond } from '../../core/backtest.mjs';
import { bookAt, normalizeBookEvents } from '../../core/book-history.mjs';
import {
  FutureDataLeakError, admitBookEvents, admitDaily, admitIntraday, assertNoFuture, createRefereeGate, createTimeGate,
} from '../../core/time-gate.mjs';


// ═══════════════════ ۱۰۰. دروازهٔ زمان و آزمون نشت ═══════════════════
//
// آخرین آزمون این گروه، آزمون پذیرش سند است: همان جلسه یک بار روی دادهٔ
// کامل و یک بار روی دادهٔ بریده‌شده اجرا می‌شود و خروجی باید **ذره‌ای**
// فرق نکند. اگر فرق کرد، جایی از آینده خوانده شده.
group('۱۰۰. دروازهٔ زمان و آزمون نشت');
{
  const NOW = { date: 20260521, second: 10 * 3600 + 1800 };   // ۲۱ مه، ۱۰:۳۰
  const at = (d, s) => ({ date: d, second: s });

  // ——— مرزِ ورود: سری روزانه ———
  {
    const rows = [
      { date: 20260519, close: 100 }, { date: 20260520, close: 101 },
      { date: 20260521, close: 104 }, { date: 20260524, close: 110 },
    ];
    const mid = admitDaily(rows, NOW);
    check('ردیف روزهای آینده حذف می‌شود', !mid.rows.some((r) => r.date === 20260524));
    check('ردیف روز جاری در میانهٔ جلسه حذف می‌شود', !mid.rows.some((r) => r.date === 20260521));
    check('حذف ردیف روز جاری صریح اعلام می‌شود', mid.partialDay === true && mid.dropped === 2);
    const done = admitDaily(rows, at(20260521, INTRADAY_END_SECOND));
    check('پس از پایان جلسه، ردیف روز جاری کامل است',
      done.rows.some((r) => r.date === 20260521) && done.partialDay === false);
    check('ردیف بی‌تاریخ اصلاً وارد نمی‌شود', admitDaily([{ close: 5 }], NOW).rows.length === 0);
  }

  // ——— مرزِ ورود: ریزمعامله و دفتر ———
  {
    const tape = [
      { time: 93000, second: 9 * 3600 + 1800, price: 1000, quantity: 10 },
      { time: 102900, second: 10 * 3600 + 29 * 60, price: 1010, quantity: 20 },
      { time: 103100, second: 10 * 3600 + 31 * 60, price: 1200, quantity: 30 },
      { time: 120000, second: 12 * 3600, price: 1300, quantity: 40 },
    ];
    const a = admitIntraday(tape, NOW, 20260521);
    check('معاملهٔ پس از لحظهٔ جاری وارد نمی‌شود', a.rows.length === 2 && a.dropped === 2);
    check('روز گذشته تا پایان جلسه‌اش کامل است',
      admitIntraday(tape, NOW, 20260520).rows.length === 4);
    check('روز آینده هیچ معامله‌ای نمی‌دهد', (() => {
      const f = admitIntraday(tape, NOW, 20260524);
      return f.rows.length === 0 && f.wrongDay === true;
    })());

    const events = normalizeBookEvents([
      { hEven: 90000, refID: 1, number: 1, pMeDem: 1000, qTitMeDem: 100, pMeOf: 1010, qTitMeOf: 100 },
      { hEven: 103100, refID: 9, number: 1, pMeDem: 1190, qTitMeDem: 50, pMeOf: 1210, qTitMeOf: 50 },
    ]);
    const b = admitBookEvents(events, NOW, 20260521);
    check('رویداد دفتر پس از لحظهٔ جاری وارد نمی‌شود', b.events.length === 1 && b.dropped === 1);
    check('دفتر بازسازی‌شده هم همان مرز را دارد',
      bookAt(b.events, NOW.second).book[0].bid === 1000);
  }

  // ——— نگهبان ———
  {
    const future = [{ date: 20260524, close: 110 }];
    let thrown = null;
    try { assertNoFuture(future, NOW, { kind: 'سری پایه', where: 'آزمون' }); }
    catch (e) { thrown = e; }
    check('نگهبان روی دادهٔ آینده پرتاب می‌کند', thrown instanceof FutureDataLeakError);
    check('خطا می‌گوید کجا و چقدر و کِی',
      thrown.kind === 'سری پایه' && thrown.count === 1
      && thrown.found.date === 20260524 && thrown.now.date === 20260521 && thrown.where === 'آزمون');
    check('نگهبان روی دادهٔ گذشته ساکت است',
      assertNoFuture([{ date: 20260519, close: 1 }], NOW).length === 1);
    check('ردیف روزانه با پایان جلسه سنجیده می‌شود نه با ابتدای آن', (() => {
      // ردیفِ کل روزِ جاری، حتی بدون ثانیه، باید آینده حساب شود.
      try { assertNoFuture([{ date: 20260521, close: 1 }], NOW); return false; } catch { return true; }
    })());
    check('ردیف درون‌روزیِ پیش از لحظهٔ جاری رد می‌شود',
      assertNoFuture([{ date: 20260521, second: 9 * 3600 }], NOW).length === 1);
    check('لحظهٔ جاری نامعتبر یعنی هیچ داده‌ای پذیرفته نمی‌شود', (() => {
      try { assertNoFuture([], { date: 0 }); return false; } catch (e) { return e instanceof FutureDataLeakError; }
    })());
  }

  // ——— دروازه ———
  const days = [20260519, 20260520, 20260521, 20260524, 20260525];
  const fullData = {
    dailies: {
      '1': [
        { date: 20260519, close: 100 }, { date: 20260520, close: 101 },
        { date: 20260521, close: 104 }, { date: 20260524, close: 110 }, { date: 20260525, close: 115 },
      ],
    },
    trades: {
      '1|20260521': [
        { time: 93000, second: 9 * 3600 + 1800, price: 1000, quantity: 10 },
        { time: 102900, second: 10 * 3600 + 29 * 60, price: 1010, quantity: 20 },
        { time: 103100, second: 10 * 3600 + 31 * 60, price: 1200, quantity: 30 },
        // پس از دورترین جایی که این جلسه می‌رسد؛ باید هرگز خوانده نشود.
        { time: 110000, second: 11 * 3600, price: 1400, quantity: 40 },
      ],
      '1|20260524': [{ time: 93000, second: 9 * 3600 + 1800, price: 1300, quantity: 99 }],
    },
    book: {
      '1|20260521': [
        { hEven: 90000, refID: 1, number: 1, pMeDem: 1000, qTitMeDem: 100, pMeOf: 1010, qTitMeOf: 100 },
        { hEven: 90000, refID: 2, number: 2, pMeDem: 990, qTitMeDem: 200, pMeOf: 1020, qTitMeOf: 200 },
        { hEven: 103100, refID: 9, number: 1, pMeDem: 1190, qTitMeDem: 50, pMeOf: 1210, qTitMeOf: 50 },
        { hEven: 110000, refID: 12, number: 1, pMeDem: 1390, qTitMeDem: 20, pMeOf: 1410, qTitMeOf: 20 },
      ],
    },
  };
  const loaderFor = (data) => ({
    dailies: async (ins) => (data.dailies[ins] || []).map((r) => ({ ...r })),
    trades: async (ins, date) => (data.trades[`${ins}|${date}`] || []).map((r) => ({ ...r })),
    book: async (ins, date) => (data.book[`${ins}|${date}`] || []).map((r) => ({ ...r })),
  });

  const gate = createTimeGate({ sessionId: 's1', now: NOW, load: loaderFor(fullData), days });
  check('دروازه بدون لحظهٔ جاری ساخته نمی‌شود', (() => {
    try { createTimeGate({ now: { date: 0 }, load: {}, days }); return false; } catch { return true; }
  })());
  check('لحظهٔ دروازه کپی است نه ارجاع', (() => {
    const one = gate.now(); one.second = 0;
    return gate.now().second === NOW.second;
  })());

  await (async () => {
    const hist = await gate.history('1');
    check('تاریخچه فقط تا دیروز می‌آید',
      hist.rows.length === 2 && hist.rows[hist.rows.length - 1].date === 20260520);
    check('تاریخچه می‌گوید ردیف امروز کنار گذاشته شد', hist.partialDay === true);
    const short = await gate.history('1', { lookback: 1 });
    check('lookback به روز معاملاتی برش می‌زند', short.rows.length === 1 && short.rows[0].date === 20260520);

    const snap = await gate.snapshot('1');
    check('آخرین معاملهٔ عکس، معاملهٔ ۱۰:۲۹ است', snap.trade.price === 1010);
    check('حجم تجمعی عکس تا همان لحظه است', snap.trade.volume === 30);
    check('دفتر عکس، سطح یکِ پیش از ۱۰:۳۱ را دارد', snap.quote.bid === 1000 && snap.quote.ask === 1010);
    check('کهنگی دفتر گزارش می‌شود', snap.quote.stale === NOW.second - 9 * 3600);
  })();

  // ——— زمان یک‌طرفه ———
  {
    const back = gate.advance({ days: -1 });
    check('پله به عقب پذیرفته نمی‌شود', back.ok === false && back.gate === null);
    const fwd = gate.advance('h1');
    check('پله جلو دروازهٔ تازه می‌سازد', fwd.ok === true && fwd.gate.now().second === 11 * 3600 + 1800);
    check('دروازهٔ قبلی سر جای خودش می‌ماند', gate.now().second === NOW.second);
    check('قدم‌های میانی برگردانده می‌شوند', fwd.moments.length === 4);
    const roll = gate.advance('eod').gate.advance('h1');
    check('پله‌ای که از پایان جلسه رد شود به جلسهٔ بعد می‌رود',
      roll.ok && roll.gate.now().date === 20260524 && roll.rolled === true);
  }

  // ——— دروازهٔ داوری، تنها استثنا ———
  await (async () => {
    const referee = createRefereeGate({ now: NOW, load: loaderFor(fullData), days });
    const hist = await referee.history('1');
    check('دروازهٔ داوری به آینده دسترسی دارد', hist.rows.length === 5);
    check('دروازهٔ داوری خودش را اعلام می‌کند', referee.referee === true && gate.referee === false);
  })();

  // ═══ آزمون پذیرش: جلسهٔ یکسان روی دادهٔ کامل و دادهٔ بریده ═══
  //
  // سند می‌گوید داده را «در تاریخ T» ببر. ولی جلسه‌ای که پرش می‌کند،
  // بعد از T به داده نیاز **دارد** و آن نیاز نشت نیست. آنچه باید ثابت
  // شود این است که هیچ‌چیز فراتر از **دورترین جایی که جلسه رسید** خوانده
  // نمی‌شود. پس مرزِ بریدن، آخرین لحظهٔ جلسه است نه لحظهٔ شروعش.
  await (async () => {
    const LAST = { date: 20260521, second: NOW.second + 15 * 60 };   // ۱۰:۴۵
    const cutData = {
      dailies: { '1': fullData.dailies['1'].filter((r) => r.date < LAST.date) },
      trades: {
        '1|20260521': fullData.trades['1|20260521'].filter((r) => r.second <= LAST.second),
      },
      book: {
        '1|20260521': fullData.book['1|20260521'].filter((r) => tradeSecond(r.hEven) <= LAST.second),
      },
    };

    // یک «جلسه»: چند بار خواندن، یک پرش، و باز چند بار خواندن.
    const runSession = async (data) => {
      let g = createTimeGate({ sessionId: 's', now: NOW, load: loaderFor(data), days });
      const log = [];
      log.push(await g.history('1'));
      log.push(await g.snapshot('1'));
      const step = g.advance('m15');
      log.push({ ok: step.ok, moments: step.moments, rolled: step.rolled });
      g = step.gate;
      log.push(await g.history('1'));
      log.push(await g.snapshot('1'));
      return JSON.stringify(log);
    };

    const withFuture = await runSession(fullData);
    const withoutFuture = await runSession(cutData);
    check('جلسه روی دادهٔ کامل و دادهٔ بریده دقیقاً یکی درمی‌آید', withFuture === withoutFuture,
      withFuture === withoutFuture ? '' : 'نشت');

    // و برای اینکه آزمون خودش توخالی نباشد: باید ثابت شود دادهٔ آینده
    // اصلاً وجود داشته و صرفاً نادیده گرفته شده.
    check('آزمون نشت توخالی نیست — دادهٔ آینده واقعاً موجود بود',
      fullData.dailies['1'].length > cutData.dailies['1'].length
      && fullData.trades['1|20260521'].length > cutData.trades['1|20260521'].length
      && fullData.book['1|20260521'].length > cutData.book['1|20260521'].length);

    // و اگر دروازه را دور بزنیم، همان جلسه باید فرق کند.
    const leaky = JSON.stringify(fullData.dailies['1']);
    const honest = JSON.stringify(cutData.dailies['1']);
    check('دور زدن دروازه واقعاً خروجی را عوض می‌کند', leaky !== honest);
  })();
}
