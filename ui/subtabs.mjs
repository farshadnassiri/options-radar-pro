// نوار زیرتب — تقسیم یک تب بلند به چند بخش هم‌سطح.
//
// چرا لازم شد: بک‌تست سریع در یک صفحه، پانزده کارت پشت سر هم داشت. کاربر
// برای رسیدن از «مسیر روزانه» به «جدول سطل‌ها» چند صفحه اسکرول می‌کرد و در
// راه، هر چیزی که دنبالش نبود از جلوی چشمش رد می‌شد. تب، همان محتوا را
// نگه می‌دارد و فقط یکی را جلوی چشم می‌گذارد.
//
// چرا پنل‌ها را از DOM حذف نمی‌کنیم و فقط `hidden` می‌کنیم: کدِ رنگ‌آمیزی
// همین امروز با شناسهٔ عنصر کار می‌کند و ده‌ها جا `$('bt-…')` می‌نویسد.
// اگر پنل ناپیدا از سند بیرون برود، همهٔ آن‌ها باید بدانند مقصدشان ممکن
// است نباشد — یعنی یک بازنویسی بزرگ برای سودی که `hidden` رایگان می‌دهد.
//
// دسترس‌پذیری: این نوار `tablist` واقعی است، نه چند دکمهٔ کنار هم. جهت‌نما
// بین تب‌ها می‌چرخد، Home و End به دو سر می‌روند، و فقط تب فعال در ترتیب
// Tab صفحه‌کلید می‌ماند — همان الگویی که خواندن با صفحه‌خوان را ممکن
// می‌کند.

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

/**
 * نوار را می‌سازد و پنل‌ها را به آن گره می‌زند.
 *
 * `tabs` فهرست `{ id, label, hint }` است. هر پنل باید در سند، عنصری با
 * `data-panel="<id>"` داشته باشد. پنلی که پیدا نشود بی‌صدا نادیده گرفته
 * **نمی‌شود**: دکمه‌اش ساخته نمی‌شود، چون تبی که به جایی نمی‌رسد بدتر از
 * نبودِ تب است.
 */
export function mountSubtabs(host, tabs = [], { root = document, onChange, initial } = {}) {
  if (!host) return null;
  const items = tabs
    .map((tab) => ({ ...tab, panel: root.querySelector(`[data-panel="${tab.id}"]`) }))
    .filter((tab) => tab.panel);
  if (!items.length) return null;

  host.className = 'subtabs';
  host.setAttribute('role', 'tablist');
  host.innerHTML = items.map((tab, index) => `<button type="button" role="tab" id="tab-${esc(tab.id)}"
    data-subtab="${esc(tab.id)}" aria-controls="panel-${esc(tab.id)}"
    aria-selected="false" tabindex="-1"
    ${tab.hint ? `title="${esc(tab.hint)}"` : ''}>${esc(tab.label)}</button>`).join('');

  for (const tab of items) {
    tab.panel.id = `panel-${tab.id}`;
    tab.panel.setAttribute('role', 'tabpanel');
    tab.panel.setAttribute('aria-labelledby', `tab-${tab.id}`);
    tab.panel.tabIndex = 0;
  }

  // تب آغازین می‌تواند از بیرون بیاید: وقتی نوار پس از یک اجرا دوباره ساخته
  // می‌شود، کاربر باید روی نتیجه بنشیند نه دوباره روی فرم چیدمان.
  let current = items.some((tab) => tab.id === initial) ? initial : items[0].id;

  const show = (id, { focus = false } = {}) => {
    const found = items.find((tab) => tab.id === id);
    if (!found) return false;
    current = id;
    for (const tab of items) {
      const on = tab.id === id;
      const button = host.querySelector(`[data-subtab="${tab.id}"]`);
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
      tab.panel.hidden = !on;
      if (on && focus) button.focus();
    }
    onChange?.(id);
    return true;
  };

  // انتساب به خاصیت، نه `addEventListener`: این نوار وقتی فهرست تب‌هایش عوض
  // می‌شود دوباره ساخته می‌شود، و شنوندهٔ افزوده با جایگزینی `innerHTML` پاک
  // نمی‌شود. دو شنونده یعنی جهت‌نما دو تب جلو می‌رفت.
  host.onclick = (event) => {
    const button = event.target.closest('[data-subtab]');
    if (button) show(button.dataset.subtab);
  };

  host.onkeydown = ((event) => {
    const keys = { ArrowRight: -1, ArrowLeft: 1, Home: 'first', End: 'last' };
    const move = keys[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const at = items.findIndex((tab) => tab.id === current);
    // نوار راست‌به‌چپ است: جهت‌نمای راست به تب **قبلی** می‌رود، چون تب قبلی
    // در همین چیدمان سمت راست نشسته. عکسش، حرکتِ نشانگر را از حرکتِ چشم
    // جدا می‌کرد.
    const next = move === 'first' ? 0
      : move === 'last' ? items.length - 1
        : (at + move + items.length) % items.length;
    show(items[next].id, { focus: true });
  });

  show(current);
  return { show, get current() { return current; }, ids: items.map((tab) => tab.id) };
}
