// ۱۰۵. رویدادهای میانی و قواعد خروج
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import {
  EXIT_RULES, NO_OPTION_STOP_NOTE, attemptClose, eventSummary, firstFiring, makeEvent, marginCallAt, ruleFires, walkMoments,
} from '../../core/bereket-events.mjs';
import { bookAt, normalizeBookEvents } from '../../core/book-history.mjs';
import { stamp } from '../../ui/export.mjs';


// ═══════════════════ ۱۰۵. رویدادهای میانی و قواعد خروج ═══════════════════
//
// مهم‌ترین ادعای این گروه یکی است: قاعده‌ای که شلیک کند ولی در مظنهٔ همان
// لحظه اجراشدنی نباشد، **خروج ثبت نمی‌کند**. سیستمی که این را رعایت نکند،
// همیشه به نفع استراتژی دروغ می‌گوید.
group('۱۰۵. رویدادهای میانی و قواعد خروج');
{
  const evt = (time, ref, level, bid, bidQty, ask, askQty) => ({
    hEven: time, refID: ref, number: level,
    pMeDem: bid, qTitMeDem: bidQty, zOrdMeDem: 1,
    pMeOf: ask, qTitMeOf: askQty, zOrdMeOf: 1,
  });
  const snap = (rows, second = 10 * 3600) => bookAt(normalizeBookEvents(rows), second);
  const fees = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };
  const marginParams = { A: 0.20, B: 0.10, C: 10000, maint: 0.70, bBasis: 'SPOT' };

  const legs = [
    { kind: 'call', side: 'buy', strike: 10_000, ratio: 1, size: 1000, ins: 'A', price: 500 },
    { kind: 'call', side: 'sell', strike: 11_000, ratio: 1, size: 1000, ins: 'B', price: 200 },
  ];
  const deepBooks = {
    A: snap([evt(90000, 1, 1, 480, 500, 500, 500), evt(90000, 2, 2, 470, 500, 510, 500)]),
    B: snap([evt(90000, 3, 1, 190, 500, 210, 500), evt(90000, 4, 2, 180, 500, 220, 500)]),
  };
  const openMeta = { A: { limitLow: 1, limitHigh: 9999 }, B: { limitLow: 1, limitHigh: 9999 } };
  // پای دوم در صف خرید قفل است: عرضه خالی و تقاضا روی سقف دامنه.
  const queuedBooks = { A: deepBooks.A, B: snap([evt(90000, 9, 1, 300, 9000, 0, 0)]) };
  const queuedMeta = { A: openMeta.A, B: { limitLow: 100, limitHigh: 300 } };

  // ——— قواعد ———
  check('فهرست قواعد خروج، حد ضرر روی قیمت قرارداد ندارد',
    !EXIT_RULES.some((rule) => /قرارداد|اختیار|پریمیوم/.test(rule.basis)));
  check('هر قاعده به قیمت پایه یا زمان یا سود موقعیت بسته است',
    EXIT_RULES.every((rule) => ['قیمت پایه', 'زمان', 'سود موقعیت', 'زیان موقعیت'].includes(rule.basis)));
  check('دلیل نبودن حد ضرر قراردادی صادر می‌شود تا رابط نشانش دهد',
    typeof NO_OPTION_STOP_NOTE === 'string' && NO_OPTION_STOP_NOTE.includes('اجرا نمی‌شود'));

  check('قاعدهٔ عبور از سطح بالا درست شلیک می‌کند',
    ruleFires({ key: 'spotAbove', value: 10_000 }, { spot: 10_500 })
    && !ruleFires({ key: 'spotAbove', value: 10_000 }, { spot: 9_500 }));
  check('قاعدهٔ عبور از سطح پایین درست شلیک می‌کند',
    ruleFires({ key: 'spotBelow', value: 10_000 }, { spot: 9_500 })
    && !ruleFires({ key: 'spotBelow', value: 10_000 }, { spot: 10_500 }));
  check('قاعدهٔ روز مانده در آستانه شلیک می‌کند',
    ruleFires({ key: 'daysLeft', value: 7 }, { daysLeft: 7 })
    && !ruleFires({ key: 'daysLeft', value: 7 }, { daysLeft: 8 }));
  check('درصد سود نسبت به بیشترین سود سنجیده می‌شود',
    ruleFires({ key: 'profitPct', value: 80 }, { pnl: 80, maxProfit: 100 })
    && !ruleFires({ key: 'profitPct', value: 80 }, { pnl: 70, maxProfit: 100 }));
  check('بدون بیشترین سود، قاعدهٔ درصد سود شلیک نمی‌کند',
    !ruleFires({ key: 'profitPct', value: 50 }, { pnl: 90, maxProfit: NaN }));
  check('قاعدهٔ درصد زیان روی سود شلیک نمی‌کند',
    !ruleFires({ key: 'lossPct', value: 50 }, { pnl: 90, maxLoss: -100 })
    && ruleFires({ key: 'lossPct', value: 50 }, { pnl: -60, maxLoss: -100 }));
  check('قاعدهٔ ناشناخته و آستانهٔ نامعتبر شلیک نمی‌کنند',
    !ruleFires({ key: 'whatever', value: 1 }, { spot: 5 })
    && !ruleFires({ key: 'spotAbove', value: NaN }, { spot: 5 }));
  check('اولین قاعدهٔ شلیک‌کننده به ترتیب فهرست کاربر برداشته می‌شود', (() => {
    const rules = [{ key: 'daysLeft', value: 1 }, { key: 'spotAbove', value: 10_000 }];
    return firstFiring(rules, { spot: 10_500, daysLeft: 30 })?.key === 'spotAbove';
  })());

  // ——— بستن ———
  check('بستن با دفتر عمیق انجام می‌شود',
    attemptClose({ legs, size: 1, books: deepBooks, meta: openMeta, fees, takePct: 100 }).closed === true);
  check('پای در صف، بستن را ناممکن می‌کند', (() => {
    const out = attemptClose({ legs, size: 1, books: queuedBooks, meta: queuedMeta, fees });
    return out.closed === false && out.kind === 'queueBlocked';
  })());
  check('عمق ناکافی یعنی بستن ناقص، نه بستن کامل', (() => {
    const thin = {
      A: snap([evt(90000, 1, 1, 480, 2, 500, 2)]),
      B: snap([evt(90000, 3, 1, 190, 2, 210, 2)]),
    };
    const out = attemptClose({ legs, size: 10, books: thin, meta: openMeta, fees, takePct: 100 });
    return out.closed === false && out.partial === true && out.filled > 0 && out.filled < 10;
  })());

  // ——— کال مارجین ———
  {
    const naked = [{ kind: 'put', side: 'sell', strike: 10_000, ratio: 1, size: 1000, ins: 'A', price: 500 }];
    const rich = marginCallAt({ legs: naked, prices: [500], spot: 10_200, equity: 1e9, params: marginParams });
    const poor = marginCallAt({ legs: naked, prices: [500], spot: 10_200, equity: 1000, params: marginParams });
    check('سرمایهٔ کافی کال مارجین نمی‌سازد', rich.called === false);
    check('سرمایهٔ کم کال مارجین می‌سازد و کسری را می‌گوید',
      poor.called === true && poor.shortfall > 0 && poor.why.length > 0);
    check('کال مارجین از وجه تضمین لازم می‌آید نه از خالص',
      poor.required > 0 && Math.abs(poor.floor - poor.required * 0.70) < 1e-6);
    check('بدون وجه تضمین، کال مارجینی هم نیست',
      marginCallAt({ legs: [{ kind: 'call', side: 'buy', strike: 1, ratio: 1, size: 1000, price: 1 }], prices: [1], spot: 10, equity: 0, params: marginParams }).called === false);
  }

  // ═══ ادعای اصلی: قاعده شلیک کرد، بازار اجازه نداد ═══
  {
    const moments = [
      { date: 20260519, second: 10 * 3600 },
      { date: 20260520, second: 10 * 3600 },
      { date: 20260521, second: 10 * 3600 },
    ];
    // روز دوم قیمت پایه از سطح رد می‌شود، ولی همان روز پای دوم در صف است.
    const feedBlocked = (at) => ({
      spot: at === 0 ? 9_500 : 10_500,
      prices: [500, 200],
      books: at === 0 ? deepBooks : queuedBooks,
      meta: at === 0 ? openMeta : queuedMeta,
      daysLeft: 60 - at, pnl: 0, equity: 1e12,
    });
    const blocked = walkMoments({
      moments, feed: feedBlocked, legs, size: 1, fees, params: marginParams,
      rules: [{ key: 'spotAbove', value: 10_000 }],
    });
    check('قاعده شلیک می‌کند و ثبت می‌شود',
      blocked.events.some((e) => e.kind === 'exitRule'));
    check('خروجِ ناممکن، «خروج انجام شد» ثبت نمی‌کند',
      !blocked.events.some((e) => e.kind === 'exitDone'));
    check('به‌جایش رویداد ناکامی ثبت می‌شود',
      blocked.events.some((e) => e.kind === 'queueBlocked' || e.kind === 'exitFailed'));
    check('موقعیت باز می‌ماند', blocked.open === true && blocked.closedAt === null);
    check('حلقه ادامه می‌دهد و هر روز دوباره امتحان می‌کند', blocked.attempts >= 2);
    check('هر رویداد مهر زمانی دقیق خودش را دارد',
      blocked.events.every((e) => /^\d{8} \d{2}:\d{2}:\d{2}$/.test(e.stamp)));

    // همان مسیر، ولی دفتر باز.
    const feedOpen = (at) => ({ ...feedBlocked(at), books: deepBooks, meta: openMeta });
    const done = walkMoments({
      moments, feed: feedOpen, legs, size: 1, fees, params: marginParams, takePct: 100,
      rules: [{ key: 'spotAbove', value: 10_000 }],
    });
    check('با دفتر باز، همان قاعده خروج را انجام می‌دهد',
      done.events.some((e) => e.kind === 'exitDone') && done.open === false);
    check('پس از بستن، حلقه می‌ایستد', done.closedAt.date === 20260520);
  }

  // ——— سررسید و توقف ———
  {
    const moments = [{ date: 20260519, second: 10 * 3600 }, { date: 20260520, second: 10 * 3600 }];
    const feed = () => ({ spot: 10_000, prices: [500, 200], books: deepBooks, meta: openMeta, daysLeft: 1, pnl: 0, equity: 1e12 });
    const expired = walkMoments({ moments, feed, legs, size: 1, fees, params: marginParams, expiryDate: 20260520 });
    check('سررسید موقعیت را می‌بندد',
      expired.events.some((e) => e.kind === 'expiry') && expired.open === false);

    const haltedFeed = (at) => ({ ...feed(at), halted: true, haltWhy: 'نماد متوقف بود' });
    const halted = walkMoments({
      moments, feed: haltedFeed, legs, size: 1, fees, params: marginParams,
      rules: [{ key: 'spotAbove', value: 1 }],
    });
    check('در توقف نماد، هیچ خروجی حتی امتحان نمی‌شود',
      halted.events.every((e) => e.kind === 'halt') && halted.attempts === 0 && halted.open === true);
  }

  // ——— خلاصهٔ آموزشی ———
  check('خلاصه، نرخ اجرای قواعد را می‌گوید', (() => {
    const s = eventSummary([
      makeEvent('exitRule', { date: 20260519, second: 36000 }),
      makeEvent('exitFailed', { date: 20260519, second: 36000 }),
      makeEvent('exitRule', { date: 20260520, second: 36000 }),
      makeEvent('exitDone', { date: 20260520, second: 36000 }),
    ]);
    return s.fired === 2 && s.failed === 1 && Math.abs(s.executedRate - 50) < 1e-9
      && s.note.includes('درسِ این جلسه');
  })());
  check('بی‌رویداد، خلاصه ادعای اضافه نمی‌کند',
    eventSummary([]).note.includes('هیچ قاعدهٔ خروجی') && Number.isNaN(eventSummary([]).executedRate));
  check('بدون بارگذار، حلقه چیزی نمی‌سازد',
    walkMoments({ moments: [{ date: 20260519, second: 36000 }], legs }).events.length === 0);
}
