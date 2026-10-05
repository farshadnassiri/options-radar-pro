// «آخرین» و «پایانی» کنار هم، هر کدام با درصد تغییر نسبت به پایانی روز قبل.
//
// هر جای رابط که قیمت یک نماد را نشان می‌دهد همین را صدا می‌زند تا شکل و
// مبنا یکی بماند. محاسبه در `core/price-change.mjs` است.

import { fmt } from './fmt.mjs';
import { dayQuote } from '../core/price-change.mjs';

const tone = (v) => (!Number.isFinite(v) ? 'flat' : v > 0 ? 'gain' : v < 0 ? 'loss' : 'flat');
const signed = (v) => (Number.isFinite(v) ? `${v > 0 ? '+' : ''}${fmt.pct(v)}٪` : '—');

/** متن ساده برای راهنمای هاور و برچسب دسترسی: «آخرین … (+۱٫۲۰٪) · پایانی … (−۰٫۵۰٪)». */
export function pricePairText(row = {}, opts = {}) {
  const q = dayQuote(row, opts);
  const money = opts.money || fmt.money;
  return `آخرین ${money(q.last)} (${signed(q.lastPct)}) · پایانی ${money(q.close)} (${signed(q.closePct)})`;
}

/** همان، به HTML با رنگ جهت. `label` پیشوند اختیاری است (مثلاً نام نماد). */
export function pricePairHtml(row = {}, opts = {}) {
  const q = dayQuote(row, opts);
  const money = opts.money || fmt.money;
  const item = (name, price, pct) => `<span class="price-pair-item"><span>${name}</span> <b>${money(price)}</b> <small class="${tone(pct)}">${signed(pct)}</small></span>`;
  return `<span class="price-pair" title="درصدها نسبت به پایانی روز قبل${Number.isFinite(q.yday) ? ` (${money(q.yday)})` : ''}">${item('آخرین', q.last, q.lastPct)}${item('پایانی', q.close, q.closePct)}</span>`;
}

export { dayQuote };
