// جدولِ «اثرِ نرخ بدون ریسک بر تلاطم این پا».
//
// موتورش `core/iv-rate-scan.mjs` است. کارِ این نما یک چیز است: ستونِ خالیِ
// تلاطم را از «نمی‌دانیم» به «می‌دانیم، و علتش یک تنظیم است» ببرد.
//
// هیچ نرخی اینجا «درست» اعلام نمی‌شود. انتخابِ نرخ تصمیمِ صاحب پروژه است و
// هنوز باز؛ آنچه این جدول می‌دهد کرانِ اندازه‌گیری‌شده است، نه توصیه.

import { highestSolvingRate, rateScanNote } from '../core/iv-rate-scan.mjs';
import { faNum, fmt, signTone } from './fmt.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

const ratePct = (rate) => `${faNum((Number(rate) * 100).toFixed(1))}٪`;

export function ivRateTableHtml(scan, { currentRate = NaN, legLabel = '' } = {}) {
  const rows = scan?.rows || [];
  if (!rows.length) return `<p class="note">${esc(scan?.reason || 'برای این پا تلاطمی سنجیده نشد.')}</p>`;
  const now = Number(currentRate);
  const top = highestSolvingRate(scan);
  return `
    <table class="mini">
      <thead><tr><th>نرخ بدون ریسک</th><th>تلاطم ضمنی</th><th>کف نظری همان نرخ</th><th>فاصلهٔ قیمت تا کف</th><th>وضعیت</th></tr></thead>
      <tbody>${rows.map((row) => {
    const isNow = Number.isFinite(now) && Math.abs(row.rate - now) < 1e-9;
    const isTop = Number.isFinite(top) && Math.abs(row.rate - top) < 1e-9;
    return `<tr${isNow ? ' class="picked"' : ''}>
          <td class="n">${ratePct(row.rate)}${isNow ? ' <span class="tag flat">نرخ فعلی</span>' : ''}${isTop && !isNow ? ' <span class="tag gain">بالاترین نرخِ حل‌شونده</span>' : ''}</td>
          <td class="n">${Number.isFinite(row.ivPct) ? `${fmt.pct(row.ivPct)}٪` : '—'}</td>
          <td class="n">${fmt.money(row.floor)}</td>
          <td class="n ${signTone(row.gap)}">${fmt.money(row.gap)}</td>
          <td>${row.why === 'ok' ? '<span class="tag gain">حل شد</span>' : `<span class="tag warn">${esc(row.whyLabel)}</span>`}</td>
        </tr>`;
  }).join('')}</tbody>
    </table>
    <p class="note">${esc(legLabel ? `${legLabel} — ` : '')}قیمت اجرای این پا ${fmt.money(scan.price)} و ارزش ذاتی‌اش ${fmt.money(scan.intrinsic)} است.
      ${esc(rateScanNote(scan, currentRate))}
      نرخ اینجا فقط برای همین جدول عوض می‌شود؛ تنظیم سراسری دست نمی‌خورد.</p>`;
}
