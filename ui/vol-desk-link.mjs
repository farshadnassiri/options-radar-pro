// پیوند به «میز تلاطم» از هر جای برنامه.
//
// نماد انتخابیِ میز در حافظهٔ مرورگر می‌ماند؛ پیوند همان را می‌نویسد و تب را
// باز می‌کند. اگر میز همین حالا باز است (نشانی عوض نمی‌شود)، رویداد
// `VOL_DESK_EVENT` نماد تازه را به آن می‌رساند. فقط انتخاب منتقل می‌شود، نه
// عدد — میز همه‌چیز را خودش از همان موتور می‌سازد.

export const VOL_DESK_UA_KEY = 'options-radar:vol-desk-ua';
export const VOL_DESK_EVENT = 'vol-desk:pick';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[ch]));

export function readDeskUa(storage) {
  try {
    const got = JSON.parse((storage || globalThis.localStorage)?.getItem(VOL_DESK_UA_KEY) || '{}');
    return { ins: String(got?.ins || ''), name: String(got?.name || '') };
  } catch { return { ins: '', name: '' }; }
}

export function writeDeskUa(ua, storage) {
  try { (storage || globalThis.localStorage)?.setItem(VOL_DESK_UA_KEY, JSON.stringify({ ins: String(ua?.ins || ''), name: String(ua?.name || '') })); }
  catch { /* حافظهٔ مرورگر در دسترس نیست */ }
}

/** دکمهٔ پیوند؛ کلیکش را `bindVolDeskLinks` می‌گیرد. */
export function volDeskLinkHtml(ua, { label = 'میز تلاطم این نماد', cls = 'ghost' } = {}) {
  if (!ua?.ins) return '';
  return `<button type="button" class="${esc(cls)}" data-vol-desk="${esc(ua.ins)}" data-vol-desk-name="${esc(ua.name || '')}">${esc(label)}</button>`;
}

export function openVolDesk(ua) {
  if (!ua?.ins) return;
  writeDeskUa(ua);
  if (String(location.hash || '').replace('#', '') === 'vol-desk') {
    document.dispatchEvent(new CustomEvent(VOL_DESK_EVENT, { detail: { ins: String(ua.ins), name: String(ua.name || '') } }));
  } else {
    location.hash = 'vol-desk';
  }
}

/** یک شنوندهٔ واگذارشده برای همهٔ دکمه‌های `data-vol-desk` زیر `root`. */
export function bindVolDeskLinks(root) {
  const onClick = (event) => {
    const button = event.target.closest?.('[data-vol-desk]');
    if (!button || !root.contains(button)) return;
    event.preventDefault();
    openVolDesk({ ins: button.dataset.volDesk, name: button.dataset.volDeskName || '' });
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
