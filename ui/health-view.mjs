// نمای سلامت داده — «امروز چه چیزی خراب بود و چقدر».
//
// ═══ قلمِ بازِ «بارِ بالادست» ═══
//
// `/api/health` از مدت‌ها پیش `byEndpoint` را می‌دهد: شمار درخواست، خطا و
// اصابتِ کش، به تفکیکِ سرویسِ بالادست. هیچ‌جای رابط نشانش نمی‌داد، پس
// گزارش‌ها همچنان «۲۰۸۲ درخواست» می‌گفتند بی آنکه معلوم باشد کدام سرویس
// آن را خورده و کدام‌یک خطا داده.
//
// تصمیم همین است: نشان دادنش. عددی که فقط در یک پاسخِ JSON زندگی می‌کند،
// برای کاربر وجود ندارد.
//
// ═══ چرا نرخ خطا و نه فقط شمار خطا ═══
//
// سرویسی که از ده هزار درخواست ده خطا داده سالم است؛ سرویسی که از ده
// درخواست ده خطا داده کاملاً خراب است. شمارِ تنها این دو را یک‌شکل نشان
// می‌دهد و مرتب‌سازی بر مبنایش، همیشه پرمصرف‌ترین را بالا می‌برد نه
// خراب‌ترین را.

import { faDigits, fmt } from './fmt.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

/** آستانه‌ای که ردیف را «خراب» رنگ می‌کند. قضاوت است، پس با نام می‌نشیند. */
export const ERROR_RATE_WARN_PCT = 5;
export const ERROR_RATE_BAD_PCT = 20;

/**
 * ردیف‌های جدولِ بار، با نرخ خطا و نرخ اصابتِ کش.
 *
 * سرویسی با صفر درخواست نرخ نمی‌گیرد — تقسیم بر صفر، صفر نیست.
 */
export function healthRows(byEndpoint = []) {
  return (Array.isArray(byEndpoint) ? byEndpoint : []).map((row) => {
    const requests = Number(row?.requests) || 0;
    const errors = Number(row?.errors) || 0;
    const cacheHits = Number(row?.cacheHits) || 0;
    const errorPct = requests > 0 ? (errors / requests) * 100 : NaN;
    return {
      family: String(row?.family || '—'),
      requests, errors, cacheHits,
      errorPct,
      cachePct: requests + cacheHits > 0 ? (cacheHits / (requests + cacheHits)) * 100 : NaN,
      tone: !Number.isFinite(errorPct) ? ''
        : (errorPct >= ERROR_RATE_BAD_PCT ? 'loss' : (errorPct >= ERROR_RATE_WARN_PCT ? 'warn' : '')),
    };
  });
}

/**
 * جمع‌بندیِ یک‌خطی.
 *
 * بدترین سرویس بر مبنای **نرخ** انتخاب می‌شود، نه شمار — و فقط از میان
 * سرویس‌هایی که دست‌کم چند درخواست داشته‌اند: یک خطا از یک درخواست، صد
 * درصد است ولی خبر نیست.
 */
export function healthVerdict(rows = [], { minRequests = 5 } = {}) {
  const totals = rows.reduce((sum, row) => ({
    requests: sum.requests + row.requests,
    errors: sum.errors + row.errors,
    cacheHits: sum.cacheHits + row.cacheHits,
  }), { requests: 0, errors: 0, cacheHits: 0 });
  const eligible = rows.filter((row) => row.requests >= minRequests && Number.isFinite(row.errorPct));
  const worst = eligible.length
    ? eligible.reduce((a, row) => (row.errorPct > a.errorPct ? row : a))
    : null;
  return {
    ...totals,
    errorPct: totals.requests > 0 ? (totals.errors / totals.requests) * 100 : NaN,
    worst: worst && worst.errors > 0 ? worst : null,
    families: rows.length,
  };
}

export function healthTableHtml(byEndpoint = []) {
  const rows = healthRows(byEndpoint);
  if (!rows.length) {
    return '<p class="note">هنوز هیچ درخواستی به بالادست نرفته، یا سرور تازه بالا آمده.</p>';
  }
  const verdict = healthVerdict(rows);
  return `
    <table class="mini">
      <thead><tr><th>سرویس بالادست</th><th>درخواست</th><th>خطا</th><th>نرخ خطا</th><th>اصابت کش</th><th>نرخ کش</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td>${esc(row.family)}</td>
          <td class="n">${fmt.int(row.requests)}</td>
          <td class="n ${row.tone}">${fmt.int(row.errors)}</td>
          <td class="n ${row.tone}">${Number.isFinite(row.errorPct) ? `${fmt.pct(row.errorPct)}٪` : '—'}</td>
          <td class="n">${fmt.int(row.cacheHits)}</td>
          <td class="n">${Number.isFinite(row.cachePct) ? `${fmt.pct(row.cachePct)}٪` : '—'}</td>
        </tr>`).join('')}</tbody>
    </table>
    <p class="note">${faDigits(verdict.families)} سرویس · ${fmt.int(verdict.requests)} درخواست · ${fmt.int(verdict.errors)} خطا
      ${Number.isFinite(verdict.errorPct) ? `(${fmt.pct(verdict.errorPct)}٪)` : ''}.
      ${verdict.worst ? `بدترین نرخ خطا: <b>${esc(verdict.worst.family)}</b> با ${fmt.pct(verdict.worst.errorPct)}٪.`
    : 'هیچ سرویسی نرخ خطای قابل اعتنایی ندارد.'}
      نرخ خطا مبنای قضاوت است نه شمار: ده خطا از ده هزار درخواست سالم است، ده خطا از ده درخواست نیست.
      این شمارنده‌ها در حافظهٔ سرورند و با راه‌اندازی دوباره صفر می‌شوند.</p>`;
}
