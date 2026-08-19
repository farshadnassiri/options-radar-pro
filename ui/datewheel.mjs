// انتخابگر تاریخ — کارت‌های عمودی با چرخ ماوس.
//
// یک انتخابگر مشترک برای همه جای برنامه. تا امروز سه شکل جدا وجود داشت:
// ریل افقی بک‌تست، دو `select` بلند ماتریس، و دو نوار لغزنده بازه. هر سه یک
// کار می‌کردند و هر سه جور دیگری. حالا یکی است.
//
// چرا عمودی: فهرست تاریخ در تقویم عمودی خوانده می‌شود و کنار هم نشستن روز و
// تاریخ در یک کارت، دو خط اطلاعات را بدون شلوغی جا می‌دهد. ریل افقی برای
// همین دو خط، هر کارت را به ۱۴۸ پیکسل عرض مجبور می‌کرد.
//
// چرا چرخ ماوس فقط وقتی جابه‌جا می‌شود که واقعاً جایی برای رفتن باشد: اگر
// روی آخرین کارت باز هم رویداد را بگیریم، کاربر داخل جعبه گیر می‌افتد و
// صفحه اسکرول نمی‌شود. در دو سر فهرست، رویداد به صفحه واگذار می‌شود.

import { historyDateLabel, historyDayName } from '/core/history.mjs';
import { faDigits, fmt } from '/ui/fmt.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

/** برچسب پیش‌فرض یک روز معاملاتی: نام روز بالا، تاریخ شمسی پایین. */
export const dateCardLabel = (date) => ({
  top: historyDayName(date),
  main: faDigits(historyDateLabel(date)),
});

/**
 * کارت‌های عمودی تاریخ را در `host` می‌نشاند.
 *
 * `host.dataset.value` همیشه تاریخ انتخاب‌شده است تا فراخوان‌ها بتوانند بدون
 * نگه‌داشتن مرجع، مقدار را بخوانند — همان قراردادی که ریل قبلی داشت.
 *
 * @returns {{select: (date: number, notify?: boolean) => void, dates: number[]}}
 */
export function mountDateWheel(host, dates = [], selected = null, onChange = () => {}, {
  label = (date) => dateCardLabel(date),
  empty = 'روزی برای انتخاب نیست.',
  note = null,
} = {}) {
  const list = dates.map(Number).filter(Number.isFinite);
  host.classList.add('date-wheel');
  host.setAttribute('role', 'listbox');
  if (!host.hasAttribute('tabindex')) host.tabIndex = 0;

  if (!list.length) {
    host.innerHTML = `<p class="date-wheel-empty">${esc(empty)}</p>`;
    host.dataset.value = '';
    return { select: () => {}, dates: list };
  }

  const cards = list.map((date, index) => {
    const card = label(date, index) || {};
    const extra = note ? note(date, index) : card.note;
    return `<button type="button" role="option" data-date="${date}" aria-selected="false">
      <small>${esc(card.top ?? '')}</small><b>${esc(card.main ?? date)}</b>${extra ? `<em>${esc(extra)}</em>` : ''}
    </button>`;
  }).join('');
  host.innerHTML = `<div class="date-wheel-track">${cards}</div><div class="date-wheel-status" aria-hidden="true"></div>`;

  const track = host.querySelector('.date-wheel-track');
  const readout = host.querySelector('.date-wheel-status');
  const buttons = new Map([...track.querySelectorAll('[data-date]')].map((button) => [Number(button.dataset.date), button]));

  const indexOfValue = () => {
    const at = list.indexOf(Number(host.dataset.value));
    return at < 0 ? 0 : at;
  };

  const select = (date, notify = true) => {
    const value = Number(date);
    if (!buttons.has(value)) return;
    host.dataset.value = String(value);
    for (const [key, button] of buttons) button.setAttribute('aria-selected', String(key === value));
    buttons.get(value).scrollIntoView({ block: 'nearest', behavior: notify ? 'smooth' : 'auto' });
    readout.textContent = `${fmt.int(list.indexOf(value) + 1)} از ${fmt.int(list.length)}`;
    if (notify) onChange(value);
  };

  /** حرکت نسبی؛ برمی‌گرداند که واقعاً جابه‌جا شد یا در انتهای فهرست ماند. */
  const step = (delta) => {
    const at = indexOfValue();
    const next = Math.max(0, Math.min(list.length - 1, at + delta));
    if (next === at) return false;
    select(list[next]);
    return true;
  };

  host.onclick = (event) => {
    const button = event.target.closest('[data-date]');
    if (button) select(button.dataset.date);
  };

  host.onkeydown = (event) => {
    const key = event.key;
    if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    if (key === 'Home') select(list[0]);
    else if (key === 'End') select(list.at(-1));
    else step(key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : key === 'PageDown' ? 5 : -5);
    buttons.get(Number(host.dataset.value))?.focus();
  };

  // چرخ ماوس یک درجه یک کارت. `passive: false` لازم است چون در وسط فهرست
  // رویداد گرفته می‌شود؛ در دو سر، عمداً رها می‌شود تا صفحه بتواند اسکرول
  // کند و کاربر داخل جعبه حبس نشود.
  let carry = 0;
  host.addEventListener('wheel', (event) => {
    if (event.ctrlKey) return;
    carry += event.deltaY;
    const notches = Math.trunc(carry / 40);
    if (!notches) { if (Math.abs(carry) > 400) carry = 0; return; }
    carry -= notches * 40;
    if (step(Math.sign(notches))) event.preventDefault();
  }, { passive: false });

  const start = list.includes(Number(selected)) ? Number(selected) : list[0];
  select(start, false);
  return { select, dates: list };
}
