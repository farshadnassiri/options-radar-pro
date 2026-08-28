// ۱۸۳. سود و زیان ناموجود در مقایسه تسویه

import { check, group, readSrc } from '../harness.mjs';
import { fmt, signTone } from '../../ui/fmt.mjs';

group('۱۸۳. سود و زیان ناموجود در مقایسه تسویه');
{
  const src183 = readSrc('../ui/tabs/strategy.mjs');
  check('مقدار ناموجود تسویه «—» و بی‌رنگ می‌ماند',
    fmt.money(NaN) === '—' && signTone(NaN) === '');
  check('تسویه آخرین معامله از قرارداد مشترک رنگ می‌گیرد',
    src183.includes('class="${signTone(r.settleLastPnl)}">${fmt.money(r.settleLastPnl)}'));
  check('تسویه قیمت پایانی از قرارداد مشترک رنگ می‌گیرد',
    src183.includes('class="${signTone(r.settleClosePnl)}">${fmt.money(r.settleClosePnl)}'));
  check('مقایسه دستی دو مقدار تسویه با صفر حذف شده است',
    !/settle(?:Last|Close)Pnl\s*>=\s*0/.test(src183));
}
