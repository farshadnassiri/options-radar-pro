// ۸۶. نام تازهٔ تب
//
// دستهٔ مستقل آزمون. اجرا با کل مجموعه:  node tests/run.mjs

import { check, group, readSrc } from '../harness.mjs';


// ═════════ ۸۶. نام تازهٔ تب ═════════
//
// خواسته کاربر: «اسم این تب رو بگذار آزمایشگاه آپشن (ایموجی مناسب هم بذار).»
group('۸۶. نام تازهٔ تب');
{
  const app86 = readSrc('../ui/app.mjs');
  const bt86 = readSrc('../ui/tabs/backtest.mjs');
  check('تب نام تازه را در فهرست کناری دارد', app86.includes("title: '\u{1F52C} آزمایشگاه آپشن'"));
  check('عنوان خودِ صفحه هم عوض شده', bt86.includes('<h1>\u{1F52C} آزمایشگاه آپشن</h1>') || bt86.includes('آزمایشگاه آپشن</h1>'));
  check('شناسهٔ تب دست‌نخورده مانده تا نشانی‌های ذخیره‌شده نشکنند',
    app86.includes("{ id: 'backtest',"));
  check('جست‌وجوی «بک‌تست» هنوز این تب را پیدا می‌کند',
    app86.includes('alias:') && app86.includes('بک‌تست سریع backtest')
    && app86.includes('${t.alias'));
}
