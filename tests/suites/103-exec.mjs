// ۱۰۲. اجراپذیری در لحظهٔ گذشته
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { executableAt, queueState } from '../../core/bereket-exec.mjs';
import { bookAt, normalizeBookEvents } from '../../core/book-history.mjs';
import { bookCapacity, walkBook } from '../../core/exec.mjs';


// ═══════════════════ ۱۰۲. اجراپذیری در لحظهٔ گذشته ═══════════════════
//
// سند این را «قید اصلی» می‌نامد نه فیلتر جانبی. پس آنچه سنجیده می‌شود
// فقط عددِ سقف نیست؛ این است که وقتی سقف صفر می‌شود، **دلیلش** درست
// گفته شود — «صف بود» و «مظنه نبود» دو چیز متفاوت‌اند و درمانشان هم.
group('۱۰۲. اجراپذیری در لحظهٔ گذشته');
{
  const evt = (time, ref, level, bid, bidQty, ask, askQty) => ({
    hEven: time, refID: ref, number: level,
    pMeDem: bid, qTitMeDem: bidQty, zOrdMeDem: 1,
    pMeOf: ask, qTitMeOf: askQty, zOrdMeOf: 1,
  });
  const snapshot = (rows, second = 10 * 3600) => bookAt(normalizeBookEvents(rows), second);

  // ——— سقف مصرف عمق ———
  {
    const book = [
      { level: 1, bid: 1000, bidQty: 100, ask: 1010, askQty: 100 },
      { level: 2, bid: 990, bidQty: 100, ask: 1020, askQty: 100 },
    ];
    const full = walkBook(book, 150, 'buy');
    const capped = walkBook(book, 150, 'buy', 0, 0.3);
    check('بدون سقف، همان رفتار قبلی می‌ماند', full.filled === 150 && full.full === true);
    check('سقف سی درصد، حجم پرشده را کم می‌کند', capped.filled === 60 && capped.full === false);
    check('سقف روی ظرفیت هم می‌نشیند',
      bookCapacity(book, 'buy') === 200 && Math.abs(bookCapacity(book, 'buy', 0, Infinity, 0.3) - 60) < 1e-9);
    check('سقف بالای یک به یک بریده می‌شود', walkBook(book, 150, 'buy', 0, 5).filled === 150);
    check('سقف صفر یعنی هیچ', walkBook(book, 150, 'buy', 0, 0).filled === 0);
    check('قیمت میانگین با سقف هم از عمق واقعی می‌آید',
      Math.abs(capped.vwap - ((30 * 1010 + 30 * 1020) / 60)) < 1e-9);
  }

  // ——— صف ———
  {
    const healthy = [{ level: 1, bid: 1000, bidQty: 500, ask: 1010, askQty: 400 }];
    check('دفتر دوطرفه عادی است', queueState(healthy, { limitLow: 900, limitHigh: 1100 }).key === 'normal');
    check('عرضهٔ خالی روی سقف دامنه، صف خرید است',
      queueState([{ level: 1, bid: 1100, bidQty: 9999, ask: 0, askQty: 0 }], { limitLow: 900, limitHigh: 1100 }).key === 'buyQueue');
    check('تقاضای خالی روی کف دامنه، صف فروش است',
      queueState([{ level: 1, bid: 0, bidQty: 0, ask: 900, askQty: 9999 }], { limitLow: 900, limitHigh: 1100 }).key === 'sellQueue');
    check('یک سمت خالی ولی دور از دامنه، صف نیست بلکه بی‌مظنه است',
      queueState([{ level: 1, bid: 1000, bidQty: 10, ask: 0, askQty: 0 }], { limitLow: 900, limitHigh: 1100 }).key === 'noBook');
    check('بدون دامنهٔ آن روز، صف «تأییدنشده» علامت می‌خورد', (() => {
      const q = queueState([{ level: 1, bid: 1000, bidQty: 10, ask: 0, askQty: 0 }], {});
      return q.key === 'buyQueue' && q.known === false && q.tradable === false;
    })());
    check('نماد نامجاز پیش از هر چیز دیگری دیده می‌شود',
      queueState(healthy, { limitLow: 900, limitHigh: 1100, state: 'I' }).key === 'halted');
    check('دفتر خالی، صف نیست', queueState([], {}).key === 'noBook');
    check('هیچ حالت صفی قابل معامله نیست',
      ['buyQueue', 'sellQueue', 'noBook', 'halted'].every((key) => {
        const map = {
          buyQueue: queueState([{ level: 1, bid: 1100, bidQty: 9, ask: 0, askQty: 0 }], { limitLow: 900, limitHigh: 1100 }),
          sellQueue: queueState([{ level: 1, bid: 0, bidQty: 0, ask: 900, askQty: 9 }], { limitLow: 900, limitHigh: 1100 }),
          noBook: queueState([], {}),
          halted: queueState([{ level: 1, bid: 1, bidQty: 1, ask: 2, askQty: 1 }], { state: 'I' }),
        };
        return map[key].tradable === false;
      }));
  }

  // ——— کل ساختار ———
  {
    const legs = [
      { kind: 'call', side: 'buy', strike: 1000, ratio: 1, size: 1000, ins: 'A' },
      { kind: 'call', side: 'sell', strike: 1100, ratio: 1, size: 1000, ins: 'B' },
    ];
    const deep = [
      evt(90000, 1, 1, 480, 200, 500, 200), evt(90000, 2, 2, 470, 300, 510, 300),
      evt(90000, 3, 3, 460, 400, 520, 400),
    ];
    const thin = [evt(90000, 4, 1, 190, 30, 210, 30)];
    const books = { A: snapshot(deep), B: snapshot(thin) };
    const meta = { A: { limitLow: 1, limitHigh: 9999 }, B: { limitLow: 1, limitHigh: 9999 } };
    const fees = { buyStock: 0.003712, sellStock: 0.0088, option: 0.00103, exercise: 0.0005 };

    const r = executableAt({ legs, books, meta, fees, takePct: 100 });
    check('ساختار با دفتر دوطرفه اجراپذیر است', r.ok === true && r.max > 0);
    check('قید مقیدکننده نام دارد', typeof r.binding === 'string' && r.binding.length > 0);
    check('پای نازک قید می‌شود نه پای عمیق', r.binding.includes('۱۱۰۰') || r.binding.includes('1100'));
    check('هزینهٔ اجرا تفکیک‌شده می‌آید',
      r.cost.rows.length === 2 && r.cost.commission > 0 && Number.isFinite(r.cost.total));

    const capped = executableAt({ legs, books, meta, fees, takePct: 30 });
    check('سقف مصرف عمق، سقف قرارداد را کم می‌کند', capped.max < r.max && capped.max > 0);
    check('سقف مصرف در خروجی گزارش می‌شود', capped.takePct === 30);

    // ——— صفر شدن، با دلیل ———
    const noBookFor = executableAt({ legs, books: { A: books.A }, meta, fees });
    check('پای بی‌دفتر، کل ساختار را صفر می‌کند', noBookFor.max === 0 && noBookFor.ok === false);
    check('دلیل بی‌دفتری نام پا را می‌گوید',
      noBookFor.missing.length === 1 && noBookFor.why.includes('دفتری نبود'));

    const queued = executableAt({
      legs,
      books: { A: books.A, B: snapshot([evt(90000, 9, 1, 300, 5000, 0, 0)]) },
      meta: { A: meta.A, B: { limitLow: 100, limitHigh: 300 } },
      fees,
    });
    check('پای در صف، کل ساختار را صفر می‌کند', queued.max === 0 && queued.ok === false);
    check('دلیل صف از دلیل بی‌مظنه جدا گفته می‌شود',
      queued.why.includes('صف خرید') && !queued.why.includes('دفتری نبود'));
    check('صف تأییدنشده جدا علامت می‌خورد', (() => {
      const unverified = executableAt({
        legs,
        books: { A: books.A, B: snapshot([evt(90000, 9, 1, 300, 5000, 0, 0)]) },
        meta: { A: meta.A, B: {} },
        fees,
      });
      return unverified.unverifiedQueue === true;
    })());

    check('اسپرد و میانهٔ هر پا در خروجی هست',
      r.spreadPctByLeg.every(Number.isFinite) && r.midByLeg.every((v) => v > 0));
    check('کیفیت ردیف اعلام می‌شود', ['exact', 'approx', 'unexecutable'].includes(r.quality.level));
  }
}
