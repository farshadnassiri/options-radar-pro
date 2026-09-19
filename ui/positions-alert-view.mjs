// برگهٔ شرط یک موقعیت، و نوارِ هشدارش.
//
// موتورش `core/position-alert.mjs` است و اینجا فقط شکل است. یک قاعدهٔ
// صریح دارد که در همهٔ فرم‌های این تب تکرار می‌شود: **خانهٔ خالی یعنی
// «نمی‌خواهم»، نه صفر**. صفرِ ذخیره‌شده برای «سود از این عدد گذشت» شرطی
// می‌سازد که با اولین ریالِ سود می‌زند، و کاربر آن را «چرا همیشه زنگ
// می‌زند» می‌خواند.

import { POSITION_ALERTS, positionAlertSummary } from '../core/position-alert.mjs';
import { faDigits, fmt } from './fmt.mjs';
import { icon } from './icons.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

export function alertFormHtml(pos) {
  const alert = pos?.alert || {};
  return `
    <label class="check" for="al-on"><input type="checkbox" id="al-on" ${alert.enabled === false ? '' : 'checked'}>
      این شرط‌ها فعال باشند</label>
    <div class="bar" style="flex-wrap:wrap;gap:12px;margin-top:8px">
      ${POSITION_ALERTS.map((item) => `
        <div class="field"><label for="al-${esc(item.key)}">${esc(item.label)} <span class="unit">${esc(item.unit)}</span></label>
          <input type="number" step="any" id="al-${esc(item.key)}" data-alert="${esc(item.key)}"
            value="${Number.isFinite(Number(alert[item.key])) ? Number(alert[item.key]) : ''}" placeholder="—"></div>`).join('')}
    </div>
    <p class="note">خانهٔ خالی یعنی آن شرط را نمی‌خواهی. «زیان از این عدد بدتر شد» را به شکل اندازه بنویس (مثلاً ۵۰۰۰۰۰)، نه منفی.
      شرطی که سنجه‌اش وجود ندارد — مثلاً فاصلهٔ سربه‌سری برای موقعیتی که سربه‌سری ندارد — نه برقرار شمرده می‌شود نه ناقض.</p>`;
}

/** خواندن برگه؛ سنجش و پاک‌سازی کار موتور است. */
export function readAlertForm(scope) {
  if (!scope) return {};
  const out = { enabled: scope.querySelector('#al-on')?.checked !== false };
  for (const item of POSITION_ALERTS) {
    const raw = scope.querySelector(`[data-alert="${item.key}"]`)?.value;
    if (raw !== '' && raw != null) out[item.key] = Number(raw);
  }
  return out;
}

/** سلولِ ستون «شرط» در جدول موقعیت‌ها. */
export function alertCell(pos, firing = []) {
  const summary = positionAlertSummary(pos?.alert);
  if (!summary.count) return '<td class="n">—</td>';
  if (firing.length) {
    return `<td class="n loss" title="${esc(firing.map((one) => one.label).join('، '))}">${icon('bell', 'ic ic-cell')}${faDigits(firing.length)}</td>`;
  }
  return `<td class="n" title="${esc(summary.text)}">${summary.enabled ? '' : icon('pause', 'ic ic-cell')}${faDigits(summary.count)}</td>`;
}

/**
 * نوارِ هشدار بالای صفحه.
 *
 * هشدار **جمع** می‌شود نه یکی‌یکی: پنج موقعیت با شرطِ برقرار، پنج نوارِ
 * جدا یعنی صفحه‌ای که خودش هشدار است. و عددِ لحظهٔ برقرار شدن کنارِ آستانه
 * می‌آید، چون «سود از ۱ میلیون گذشت» بی دانستنِ اینکه الان چقدر است،
 * کاربر را دوباره به جدول برمی‌گرداند.
 */
export function alertBannerHtml(hits = []) {
  if (!hits.length) return '';
  return `<div class="pos-alert-bar" role="status" aria-live="polite">
    <b>${faDigits(hits.length)} شرط برقرار است</b>
    <ul>${hits.map((hit) => `<li><b>${esc(hit.title || 'موقعیت')}</b> — ${esc(hit.label)}:
      ${hit.unit === 'ریال' ? fmt.money(hit.value) : `${fmt.num(hit.value)}${esc(hit.unit)}`}
      <span class="unit">آستانه ${hit.unit === 'ریال' ? fmt.money(hit.threshold) : `${fmt.num(hit.threshold)}${esc(hit.unit)}`}</span></li>`).join('')}</ul>
  </div>`;
}
