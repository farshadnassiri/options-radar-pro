// ۷. دفتر سفارش و حجم
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, near, group } from '../harness.mjs';
import { bookCapacity, resolvePrice, walkBook } from '../../core/exec.mjs';


// ═══════════════════════════ ۷. لایه اجرا ═══════════════════════════
group('۷. دفتر سفارش و حجم');
{
  const book = [
    { level: 1, bid: 100, bidQty: 5, ask: 105, askQty: 4 },
    { level: 2, bid: 98, bidQty: 10, ask: 107, askQty: 10 },
    { level: 3, bid: 95, bidQty: 20, ask: 110, askQty: 20 },
  ];
  const w1 = walkBook(book, 5, 'sell');
  check('فروش ۵ در سطح اول جا می‌شود', w1.full && w1.vwap === 100 && w1.levels === 1);

  const w2 = walkBook(book, 12, 'sell');
  check('فروش ۱۲ باید دو سطح مصرف کند', w2.levels === 2 && near(w2.vwap, (5 * 100 + 7 * 98) / 12, 1e-9),
    `میانگین ${w2.vwap.toFixed(2)}`);
  check('افت مظنه در فروش عمیق منفی است', w2.slipPct < 0, `${w2.slipPct.toFixed(2)}٪`);

  const w3 = walkBook(book, 100, 'buy');
  check('حجم بزرگ‌تر از عمق، کمبود را گزارش می‌کند', !w3.full && w3.short === 66, `کمبود ${w3.short}`);

  const cons = walkBook(book, 4, 'buy', 1);
  check('حالت محافظه‌کار سطح اول را نادیده می‌گیرد', cons.vwap === 107);

  check('ظرفیت دفتر، مستقل از حجم درخواستی است',
    bookCapacity(book, 'sell') === 35 && bookCapacity(book, 'buy') === 34,
    `فروش ${bookCapacity(book, 'sell')} | خرید ${bookCapacity(book, 'buy')}`);
  check('سقف افت مظنه، سطوح دور را کنار می‌گذارد',
    bookCapacity(book, 'sell', 0, 3) === 15, `${bookCapacity(book, 'sell', 0, 3)}`);
  const rp = resolvePrice({ bid: 100, ask: 105, book }, 'sell', { basis: 'BOOK', qty: 2 });
  check('سقف قرارداد از ظرفیت می‌آید نه از حجم پرشده',
    rp.filled === 2 && rp.capacity === 35, `پرشده ${rp.filled} | ظرفیت ${rp.capacity}`);

  const q = { bid: 100, bidQty: 5, ask: 105, askQty: 4, last: 102, close: 101, low: 96, high: 108, book };
  check('مبنای دفتر، ادعای اجرا دارد', resolvePrice(q, 'sell', { basis: 'BOOK', qty: 5 }).executable);
  check('مبنای پایانی، ادعای اجرا ندارد', !resolvePrice(q, 'sell', { basis: 'CLOSE', qty: 5 }).executable);
  check('کمترین قیمت روز، ناهم‌زمان علامت می‌خورد',
    resolvePrice(q, 'sell', { basis: 'LOW', qty: 5 }).simultaneous === false);
  check('میانه مظنه، ادعای اجرا ندارد',
    resolvePrice(q, 'sell', { basis: 'BOOK', execMode: 'MID', qty: 5 }).price === 102.5
    && !resolvePrice(q, 'sell', { basis: 'BOOK', execMode: 'MID', qty: 5 }).executable);
  check('بی‌مظنه، قیمت صفر و کیفیت هیچ',
    resolvePrice({ bid: 0, ask: 0, book: [] }, 'sell', { basis: 'BOOK', qty: 1 }).quality === 'none');
}
