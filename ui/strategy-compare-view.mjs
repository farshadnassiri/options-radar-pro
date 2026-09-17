// «بهترینِ هر ساختار» — مقایسهٔ ساختارها، نه ترکیب‌ها.
//
// ═══ شکافی که این نما پُر می‌کند ═══
//
// جدولِ «برترین موقعیت‌ها» ردیف‌های همهٔ ساختارها را با هم رتبه می‌کند. در
// عمل یک ساختارِ خوش‌شانس می‌تواند بیست ردیفِ اولِ جدول را پر کند، و کاربری
// که می‌پرسد «برای این نماد، کدام **ساختار** امروز بهتر است» جوابش را از آن
// فهرست نمی‌گیرد. اینجا هر ساختار دقیقاً **یک** ردیف دارد: بهترین ترکیبش.
//
// و ساختاری که هیچ ردیفی نساخته حذف نمی‌شود؛ ته جدول می‌نشیند با **علتش**.
// سطرِ غایب، تفاوتِ «امروز جواب نمی‌دهد» با «امروز قیمتی برای سنجیده‌شدن
// نداشت» را پنهان می‌کند — و آن دو، دو تصمیم کاملاً متفاوت‌اند.

import { COLUMNS } from '../core/evaluate.mjs';
import { faDigits, fmt, signTone } from './fmt.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

/** ستون‌هایی که مقایسهٔ ساختار با ساختار را ممکن می‌کنند — نه بیشتر. */
export const COMPARE_KEYS = ['retMonthPct', 'maxProfit', 'maxLoss', 'rewardRisk', 'beRoomPct', 'popPct'];

const colOf = (key) => COLUMNS.find((column) => column.key === key) || { key, label: key, fmt: 'num' };

/** یک خانهٔ عددی، با همان قالبی که ستونِ هم‌نامش در جدول اصلی دارد. */
export function compareCell(row, key) {
  const column = colOf(key);
  const value = row?.[key];
  if (value === Infinity || value === -Infinity) return 'نامحدود';
  const kind = column.fmt === 'pct' ? 'pct' : (column.fmt === 'money' ? 'money' : 'num');
  if (!Number.isFinite(value)) return '—';
  return kind === 'pct' ? `${fmt.pct(value)}٪` : fmt[kind](value);
}

/**
 * جدولِ مقایسه.
 *
 * `rankBy` فقط برای جمله‌ی زیر جدول است: کاربر باید بداند این ترتیب از کدام
 * معیار آمده، وگرنه «بهترین» یعنی «بهترین از نظر کی؟».
 */
export function strategyCompareHtml(byStrategy = [], { rankBy = 'retMonthPct', uaName = '' } = {}) {
  const list = Array.isArray(byStrategy) ? byStrategy : [];
  if (!list.length) return '<p class="note">هنوز اسکنی انجام نشده.</p>';
  const withRow = list.filter((item) => item.best);
  const without = list.filter((item) => !item.best);
  const rows = withRow.map((item) => `
    <tr data-strategy="${esc(item.id)}" style="cursor:pointer" tabindex="0" role="button"
        aria-label="بهترین ترکیب ساختار ${esc(item.name)}">
      <td>${esc(item.name)}</td>
      <td>${esc(item.best.underlying || '')}</td>
      <td>${esc(item.best.legsText || '')}</td>
      <td class="n">${fmt.int(item.count)}</td>
      ${COMPARE_KEYS.map((key) => `<td class="n ${key === rankBy ? signTone(item.best[key]) : ''}">${compareCell(item.best, key)}</td>`).join('')}
    </tr>`).join('');
  const missing = without.map((item) => `
    <tr class="mini-total">
      <td>${esc(item.name)}</td>
      <td colspan="${COMPARE_KEYS.length + 3}">${esc(item.reason)}</td>
    </tr>`).join('');
  return `
    <table class="data">
      <thead><tr>
        <th>ساختار</th><th>پایه</th><th>بهترین ترکیب</th><th>چند ترکیب</th>
        ${COMPARE_KEYS.map((key) => `<th>${esc(colOf(key).label)}</th>`).join('')}
      </tr></thead>
      <tbody>${rows}${missing}</tbody>
    </table>
    <p class="note">هر ساختار یک ردیف: بهترین ترکیبش بر مبنای «${esc(colOf(rankBy).label)}» — همان معیاری که در تنظیمات انتخاب کرده‌ای.
      ستون «چند ترکیب» می‌گوید این عدد از میان چند گزینه بیرون آمده؛ ساختاری که از دو ترکیب بهترین را داده، با ساختاری که از دویست ترکیب داده یک‌اندازه قابل اتکا نیست.
      ${without.length ? `${faDigits(without.length)} ساختار امروز هیچ ردیفی نساخت و ته جدول با علتش آمده.` : ''}
      ${uaName ? `پایه: ${esc(uaName)}.` : ''}</p>`;
}
