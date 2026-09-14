// نشانهٔ «در حال دریافت»، یک‌جا برای همهٔ صفحه‌ها.
//
// خواستهٔ صاحب پروژه: «در زمان لود شدن دیتا چون طول می‌کشد به کاربر اعلام
// بشه در حال لود شدنه.»
//
// ═══ چرا یک ماژول، نه چند `innerHTML` ═══
//
// در مخزن از قبل یک `<div class="skeleton">` نوشته شده بود که **هیچ
// قاعدهٔ CSS نداشت** — یعنی سال‌ها یک عنصر نامرئی رسم می‌شد و کسی متوجه
// نشد. نشانهٔ انتظار اگر پراکنده باشد دقیقاً همین‌طور می‌پوسد.
//
// دو چیز جدا لازم است و هر دو اینجاست:
//   ۱. **جای خالیِ اسکلت** — وقتی هنوز هیچ چیزی نداریم و باید بگوییم
//      «اینجا چیزی می‌آید»، نه اینکه صفحه خالی بماند.
//   ۲. **نوار در جریان** — وقتی محتوا هست و فقط دارد تازه می‌شود؛ نباید
//      محتوای موجود را پاک کند.
//
// متن همیشه همراه اسکلت می‌آید: مستطیل خاکستریِ بی‌متن می‌گوید «چیزی
// هست»، نمی‌گوید «منتظر چه هستیم».

/** بلوک اسکلت با پیام — جای محتوایی که هنوز نرسیده. */
export function busyBlock(message, { lines = 3, height = 0 } = {}) {
  const bars = Array.from({ length: Math.max(1, lines) }, (_, index) =>
    `<i class="skeleton-bar" style="--w:${[92, 74, 84, 62, 78][index % 5]}%"></i>`).join('');
  return `<div class="busy-block" role="status" aria-live="polite"${height ? ` style="min-height:${height}px"` : ''}>
    <p class="busy-note"><span class="busy-spin" aria-hidden="true"></span>${escape_(message)}</p>
    <div class="skeleton" aria-hidden="true">${bars}</div>
  </div>`;
}

/**
 * نوار باریکِ «در جریان» بالای یک بخش، بدون پاک‌کردن محتوای موجود.
 *
 * `host` باید ظرفی باشد که `position: relative` دارد یا می‌گیرد؛ نوار روی
 * لبهٔ بالایی‌اش می‌نشیند. `busy(false)` همان نوار را برمی‌دارد، نه بیشتر.
 */
export function attachBusyBar(host, { label = 'در حال دریافت داده…' } = {}) {
  if (!host) return { busy() {}, dispose() {} };
  const bar = document.createElement('div');
  bar.className = 'busy-bar';
  bar.hidden = true;
  bar.setAttribute('role', 'status');
  bar.innerHTML = `<i aria-hidden="true"></i><span></span>`;
  host.classList.add('busy-host');
  host.prepend(bar);
  const text = bar.querySelector('span');
  return {
    busy(on, message = label) {
      bar.hidden = !on;
      text.textContent = on ? message : '';
    },
    dispose() { bar.remove(); },
  };
}

const escape_ = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));
