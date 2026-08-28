// ۱۸۴. سود و زیان ناموجود تسویه در برترین موقعیت‌ها

import { check, group, readSrc } from '../harness.mjs';
import { fmt, signTone } from '../../ui/fmt.mjs';

group('۱۸۴. سود و زیان ناموجود تسویه در برترین موقعیت‌ها');
{
  const src184 = readSrc('../ui/tabs/top.mjs');
  check('مقدار ناموجود «—» و بی‌رنگ می‌ماند', fmt.money(NaN) === '—' && signTone(NaN) === '');
  check('دو مبنای تسویه از signTone مشترک استفاده می‌کنند',
    src184.includes('signTone(r.settleLastPnl)') && src184.includes('signTone(r.settleClosePnl)'));
  check('مقایسه دستی دو مقدار با صفر حذف شده است',
    !/settle(?:Last|Close)Pnl\s*>=\s*0/.test(src184));
}
