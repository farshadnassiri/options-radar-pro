// انتخابگر تاریخ — تقویم شمسی ماهانه.
//
// یک انتخابگر مشترک برای همه جای برنامه. تا امروز سه شکل جدا وجود داشت:
// ریل افقی بک‌تست، دو `select` بلند ماتریس، و دو نوار لغزنده بازه. حالا یکی
// است، و آن یکی تقویم است.
//
// ——— چرا تقویم، و چرا دیگر چرخ ماوس نیست ———
//
// شکل قبلی یک ستون کارت بود که با چرخ ماوس یک درجه یک روز جابه‌جا می‌شد.
// دو مشکل داشت که هر دو از خودِ ایده می‌آمدند، نه از پیاده‌سازی:
//
//   ۱. برای رفتن از مرداد به خرداد باید شصت بار چرخ می‌خورد. تقویم، ماه را
//      یک‌جا نشان می‌دهد و انتخاب، یک کلیک است.
//   ۲. چرخ ماوس، مقدار را عوض می‌کرد. کاربری که فقط می‌خواست صفحه را پایین
//      ببرد و اشاره‌گرش از روی جعبه رد می‌شد، بی‌آنکه بخواهد روز را عوض
//      می‌کرد — و چون روز ورود، فهرست ترکیب‌ها را از نو می‌سازد، ترکیب
//      انتخاب‌شده هم بی‌صدا عوض می‌شد. هیچ شنونده‌ای برای `wheel` نمانده:
//      انتخاب فقط با کلیک و صفحه‌کلید عوض می‌شود.
//
// ——— قرارداد داده ———
//
// ورودی `dates` فهرست روزهای *قابل انتخاب* است (میلادی YYYYMMDD، همان چیزی
// که `normalizeHistoryDate` می‌دهد). تقویم کل ماه را می‌کشد ولی فقط همین‌ها
// کلیک‌پذیرند — روزی که تابلو نداشته، خانهٔ خاموش است نه خانهٔ غایب، چون
// «آن روز معامله نشده» خودش اطلاعات است.

import { jalaliToGregorian, gregorianToJalali } from '/core/jalali.mjs';
import { historyDateLabel, historyDayName, dateParts } from '/core/history.mjs';
import { faDigits, fmt } from '/ui/fmt.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

const MONTH_FA = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
// هفتهٔ ایرانی از شنبه شروع می‌شود؛ ستون‌ها هم.
const WEEK_FA = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

/** میلادی YYYYMMDD → [سال، ماه، روز] شمسی. */
export function jalaliParts(date) {
  const p = dateParts(date);
  if (!p) return null;
  const [jy, jm, jd] = gregorianToJalali(p.y, p.m, p.d);
  return [jy, jm, jd];
}

/** [سال، ماه، روز] شمسی → میلادی YYYYMMDD. */
export function gregorianStamp(jy, jm, jd) {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return gy * 10000 + gm * 100 + gd;
}

/**
 * شمار روزهای یک ماه شمسی.
 *
 * از فرمول سال کبیسه استفاده نمی‌شود — همان تبدیلی که همه‌جای برنامه به آن
 * تکیه دارد، اول ماه بعد را می‌دهد و تفاضل، خودش جواب است. یک منبع حقیقت،
 * و اسفندِ کبیسه بدون قاعدهٔ جداگانه درست درمی‌آید.
 */
export function jalaliMonthDays(jy, jm) {
  const [gy1, gm1, gd1] = jalaliToGregorian(jy, jm, 1);
  const [ny, nm] = jm === 12 ? [jy + 1, 1] : [jy, jm + 1];
  const [gy2, gm2, gd2] = jalaliToGregorian(ny, nm, 1);
  const a = Date.UTC(gy1, gm1 - 1, gd1), b = Date.UTC(gy2, gm2 - 1, gd2);
  return Math.round((b - a) / 86400000);
}

/** ستون هفتگی اول ماه: شنبه صفر، جمعه شش. */
function firstColumn(jy, jm) {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, 1);
  return (new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay() + 1) % 7;
}

/**
 * تقویم شمسی را در `host` می‌نشاند.
 *
 * `host.dataset.value` همیشه تاریخ انتخاب‌شده است تا فراخوان‌ها بتوانند بدون
 * نگه‌داشتن مرجع، مقدار را بخوانند — همان قراردادی که انتخابگر قبلی داشت.
 *
 * @returns {{select: (date: number, notify?: boolean) => void, dates: number[]}}
 */
export function mountDateWheel(host, dates = [], selected = null, onChange = () => {}, {
  empty = 'روزی برای انتخاب نیست.',
  note = null,
} = {}) {
  const list = [...new Set(dates.map(Number).filter((date) => Number.isFinite(date) && dateParts(date)))]
    .sort((a, b) => a - b);
  host.classList.add('date-cal');
  host.classList.remove('date-wheel');

  if (!list.length) {
    host.innerHTML = `<p class="date-cal-empty">${esc(empty)}</p>`;
    host.dataset.value = '';
    return { select: () => {}, dates: list };
  }

  const usable = new Set(list);
  // ماه‌هایی که دست‌کم یک روز قابل انتخاب دارند — مبنای فعال/غیرفعال بودن
  // دکمه‌های جابه‌جایی ماه. پرش به ماهی که هیچ روزی ندارد، بن‌بست است.
  const monthsWithDays = [...new Set(list.map((date) => {
    const [jy, jm] = jalaliParts(date);
    return jy * 12 + (jm - 1);
  }))].sort((a, b) => a - b);
  const firstMonth = monthsWithDays[0], lastMonth = monthsWithDays.at(-1);

  let view = null;                 // ماه در حال نمایش: jy*12 + (jm-1)

  const dayFor = (monthKey, jd) => gregorianStamp(Math.floor(monthKey / 12), (monthKey % 12) + 1, jd);

  const paint = () => {
    const jy = Math.floor(view / 12), jm = (view % 12) + 1;
    const total = jalaliMonthDays(jy, jm);
    const lead = firstColumn(jy, jm);
    const value = Number(host.dataset.value);
    const prev = monthsWithDays.filter((key) => key < view).at(-1);
    const next = monthsWithDays.find((key) => key > view);

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span class="date-cal-pad"></span>');
    for (let jd = 1; jd <= total; jd++) {
      const stamp = dayFor(view, jd);
      const on = usable.has(stamp);
      const extra = on && note ? note(stamp) : '';
      cells.push(on
        ? `<button type="button" role="option" data-date="${stamp}" aria-selected="${stamp === value}"${extra ? ` title="${esc(extra)}"` : ''}>${faDigits(String(jd))}</button>`
        : `<span class="date-cal-off" aria-hidden="true">${faDigits(String(jd))}</span>`);
    }

    host.innerHTML = `<div class="date-cal-head">
        <button type="button" class="date-cal-nav" data-jump="prev"${prev == null ? ' disabled' : ''} aria-label="ماه قبل">‹</button>
        <b>${esc(MONTH_FA[jm - 1])} ${faDigits(String(jy))}</b>
        <button type="button" class="date-cal-nav" data-jump="next"${next == null ? ' disabled' : ''} aria-label="ماه بعد">›</button>
      </div>
      <div class="date-cal-week" aria-hidden="true">${WEEK_FA.map((day) => `<span>${day}</span>`).join('')}</div>
      <div class="date-cal-grid" role="listbox">${cells.join('')}</div>
      <div class="date-cal-status">${value
        ? `${esc(historyDayName(value))} ${faDigits(historyDateLabel(value))} · ${fmt.int(list.indexOf(value) + 1)} از ${fmt.int(list.length)}`
        : `${fmt.int(list.length)} روز قابل انتخاب`}</div>`;
  };

  const select = (date, notify = true) => {
    const value = Number(date);
    if (!usable.has(value)) return;
    host.dataset.value = String(value);
    const [jy, jm] = jalaliParts(value);
    view = jy * 12 + (jm - 1);
    paint();
    if (notify) onChange(value);
  };

  /** حرکت نسبی روی روزهای *قابل انتخاب*، نه روی خانه‌های تقویم. */
  const step = (delta) => {
    const at = list.indexOf(Number(host.dataset.value));
    const next = Math.max(0, Math.min(list.length - 1, (at < 0 ? 0 : at) + delta));
    if (next === at) return;
    select(list[next]);
    host.querySelector('[aria-selected="true"]')?.focus();
  };

  host.onclick = (event) => {
    const jump = event.target.closest('[data-jump]');
    if (jump) {
      // جابه‌جایی ماه، انتخاب را عوض نمی‌کند — فقط نگاه را. کاربر باید بتواند
      // ماه دیگری را ببیند بی‌آنکه روزِ انتخاب‌شده‌اش از دست برود.
      const target = jump.dataset.jump === 'prev'
        ? monthsWithDays.filter((key) => key < view).at(-1)
        : monthsWithDays.find((key) => key > view);
      if (target != null) { view = target; paint(); }
      return;
    }
    const button = event.target.closest('[data-date]');
    if (button) select(button.dataset.date);
  };

  host.onkeydown = (event) => {
    const key = event.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowRight', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    if (key === 'Home') select(list[0]);
    else if (key === 'End') select(list.at(-1));
    // در راست‌به‌راست، «راست» یعنی عقب‌تر در زمان.
    else if (key === 'ArrowRight') step(-1);
    else if (key === 'ArrowLeft') step(1);
    else step(key === 'ArrowDown' ? 7 : key === 'ArrowUp' ? -7 : key === 'PageDown' ? 30 : -30);
    host.querySelector('[aria-selected="true"]')?.focus();
  };

  const start = usable.has(Number(selected)) ? Number(selected) : list[0];
  select(start, false);
  return { select, dates: list };
}
