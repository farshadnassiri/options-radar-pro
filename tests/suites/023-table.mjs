// ۲۲. چیدمان ستون
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group } from '../harness.mjs';
import { changedIds, insertColumn, moveColumn } from '../../ui/table.mjs';


// ═══════════════ ۲۲. چیدمان ستون: جابه‌جایی و افزودن ═══════════════
group('۲۲. چیدمان ستون');
{
  const K = ['a', 'b', 'c', 'd'];
  const ORDER = ['a', 'b', 'c', 'd', 'e', 'f'];

  check('ستون به جای مقصد می‌نشیند، رو به جلو',
        moveColumn(K, 'a', 'c').join('') === 'bcad', moveColumn(K, 'a', 'c').join(''));
  check('و رو به عقب هم همان‌طور',
        moveColumn(K, 'd', 'b').join('') === 'adbc', moveColumn(K, 'd', 'b').join(''));
  check('جابه‌جایی با خودش، چیزی را عوض نمی‌کند', moveColumn(K, 'b', 'b').join('') === 'abcd');
  check('کلید ناموجود، فهرست را دست‌نخورده برمی‌گرداند',
        moveColumn(K, 'z', 'b').join('') === 'abcd' && moveColumn(K, 'b', 'z').join('') === 'abcd');
  check('ورودی دست‌کاری نمی‌شود', (moveColumn(K, 'a', 'd'), K.join('') === 'abcd'));
  check('طول همیشه حفظ می‌شود', moveColumn(K, 'a', 'd').length === 4);

  // افزودن، وقتی کاربر چیزی جابه‌جا نکرده: جای قراردادی
  check('ستون تازه سر جای قراردادی می‌نشیند',
        insertColumn(['a', 'c', 'e'], 'b', ORDER).join('') === 'abce',
        insertColumn(['a', 'c', 'e'], 'b', ORDER).join(''));
  check('ستونی که از همه بعدتر است، ته صف می‌رود',
        insertColumn(['a', 'b'], 'f', ORDER).join('') === 'abf');
  check('ستونی که از همه جلوتر است، سر صف می‌رود',
        insertColumn(['c', 'd'], 'a', ORDER).join('') === 'acd');

  // افزودن، وقتی چیدمان دستی شده: نباید به کار کاربر دست بزند
  const manual = ['d', 'a', 'c'];
  const after = insertColumn(manual, 'b', ORDER);
  check('چیدمان دستی با افزودن ستون خراب نمی‌شود',
        after.slice(0, 3).join('') === 'dac' && after[3] === 'b', after.join(''));
  check('ستون تکراری دوباره اضافه نمی‌شود',
        insertColumn(['a', 'b'], 'b', ORDER).join('') === 'ab');
  check('افزودن هم ورودی را دست‌کاری نمی‌کند',
        (insertColumn(manual, 'b', ORDER), manual.join('') === 'dac'));

  // رفت و برگشت: جابه‌جایی و برگرداندن، به همان نقطه اول می‌رسد
  const moved = moveColumn(K, 'a', 'c');
  check('جابه‌جایی برگشت‌پذیر است', moveColumn(moved, 'a', 'a').join('') === moved.join(''));

  // نشان «تغییر کرد» اسکن پیوسته (پ-۶ بک‌لاگ): rowClass از قبل r.__flash
  // را می‌خواند ولی هیچ‌جا نوشته نمی‌شد — changedIds همان نویسنده است.
  const prev = [{ id: 'x', v: 10 }, { id: 'y', v: 20 }, { id: 'z', v: 30 }];
  check('اولین اسکن (بدون prevRows)، چیزی فلش نمی‌گیرد',
        changedIds(null, prev, 'v').size === 0);
  const next = [{ id: 'x', v: 10 }, { id: 'y', v: 25 }, { id: 'z', v: 30 }, { id: 'w', v: 5 }];
  check('فقط ردیفی که مقدارش واقعاً عوض شده فلش می‌گیرد',
        [...changedIds(prev, next, 'v')].join('') === 'y');
  check('ردیف تازه (بدون سابقه در prevRows) فلش نمی‌گیرد',
        !changedIds(prev, next, 'v').has('w'));
  check('تغییر ناچیز کف شناوری، فلش نمی‌گیرد',
        changedIds([{ id: 'x', v: 10 }], [{ id: 'x', v: 10 + 1e-12 }], 'v').size === 0);
  check('کلید نامعتبر یا نبود، مجموعه خالی می‌دهد',
        changedIds(prev, next, null).size === 0 && changedIds(prev, next, undefined).size === 0);
  check('مقدار غیرعددی در هیچ سمتی، فلش نمی‌گیرد',
        changedIds([{ id: 'x', v: NaN }], [{ id: 'x', v: 10 }], 'v').size === 0);
}
