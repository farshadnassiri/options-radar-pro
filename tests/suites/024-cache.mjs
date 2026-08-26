// ۲۳. کش سرور، سقف ورودی
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { evictOldest } from '../../server/cache.mjs';


// ═══════════════ ۲۳. کش سرور: سقف ورودی ═══════════════
group('۲۳. کش سرور، سقف ورودی');
{
  const fresh = () => new Map([['a', 1], ['b', 2], ['c', 3], ['d', 4], ['e', 5]]);

  const under = fresh();
  evictOldest(under, 10);
  check('زیر سقف، دست‌نخورده می‌ماند', under.size === 5 && under.has('a'));

  const exact = fresh();
  evictOldest(exact, 5);
  check('دقیقاً هم‌اندازه سقف، چیزی حذف نمی‌شود', exact.size === 5);

  const over = fresh();
  evictOldest(over, 3);
  check('بالای سقف، قدیمی‌ترین‌ها حذف می‌شوند', over.size === 3,
        [...over.keys()].join(''));
  check('آنچه می‌ماند، تازه‌ترین‌هاست',
        !over.has('a') && !over.has('b') && over.has('c') && over.has('d') && over.has('e'));

  const toOne = fresh();
  evictOldest(toOne, 1);
  check('سقف یک، فقط تازه‌ترین می‌ماند', toOne.size === 1 && toOne.has('e'));

  const growing = new Map();
  for (let i = 0; i < 20; i++) { growing.set(`k${i}`, i); evictOldest(growing, 5); }
  check('افزودن پیاپی هرگز از سقف رد نمی‌شود', growing.size === 5);
  check('بعد از رشد پیاپی، فقط پنج‌تای آخر می‌ماند',
        growing.has('k19') && growing.has('k15') && !growing.has('k14'),
        [...growing.keys()].join(','));
}
