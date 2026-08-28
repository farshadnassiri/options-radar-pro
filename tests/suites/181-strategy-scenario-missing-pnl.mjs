// ۱۸۱. سود و زیان ناموجود در شبکه شوک استراتژی

import { check, group, readSrc } from '../harness.mjs';
import { fmt, signTone } from '../../ui/fmt.mjs';

group('۱۸۱. سود و زیان ناموجود در شبکه شوک استراتژی');
{
  const strategySrc181 = readSrc('../ui/tabs/strategy.mjs');

  check('قرارداد مشترک برای رنگ عددهای متناهی به کار می‌رود',
    signTone(1) === 'gain' && signTone(0) === 'gain' && signTone(-1) === 'loss');
  check('عدد ناموجود «—» و بدون رنگ سود یا زیان می‌ماند',
    fmt.money(NaN) === '—' && fmt.money(Infinity) === '∞'
    && signTone(NaN) === '' && signTone(Infinity) === '');
  check('سلول سود و زیان شبکه از fmt و signTone مشترک ساخته می‌شود',
    strategySrc181.includes('const pnlCell = (pnl) => `<td class="n ${signTone(pnl)}">${fmt.money(pnl)}</td>`'));
  check('سناریوی شوک و تصویر احتمالاتی هر دو همان سلول را می‌خوانند',
    strategySrc181.includes('${pnlCell(g.pnl)}</tr>')
    && strategySrc181.includes('${pnlCell(x.pnl)}</tr>'));
  check('مقایسه دستیِ ناموجود با صفر برای رنگ‌گذاری باقی نمانده است',
    !strategySrc181.includes("g.pnl >= 0 ? 'var(--gain)' : 'var(--loss)'"));
}
