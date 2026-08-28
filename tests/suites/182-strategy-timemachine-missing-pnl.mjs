// ۱۸۲. سود و زیان ناموجود در ماشین زمان استراتژی

import { check, group, readSrc } from '../harness.mjs';
import { fmt, signTone } from '../../ui/fmt.mjs';

group('۱۸۲. سود و زیان ناموجود در ماشین زمان استراتژی');
{
  const strategySrc182 = readSrc('../ui/tabs/strategy.mjs');

  check('قرارداد مشترک عدد ناموجود را بی‌رنگ و بدون صفر ساختگی نگه می‌دارد',
    fmt.money(NaN) === '—' && signTone(NaN) === '' && signTone(Infinity) === '');
  check('ردیف ماشین زمان همان سود و زیان موتور را به سلول مشترک می‌دهد',
    strategySrc182.includes('${pnlCell(x.pnl)}</tr>'));
  check('مقایسه دستی ماشین زمان با صفر حذف شده است',
    !strategySrc182.includes("x.pnl >= 0 ? 'var(--gain)' : 'var(--loss)'"));
  check('ماشین زمان برای کامل‌کردن سود و زیان fallback یا صفر نمی‌سازد',
    !/pnl\s*\?\?|pnl\s*\|\||Number\(x\.pnl\)\s*\|\|/.test(strategySrc182));
}
