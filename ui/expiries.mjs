// سررسیدهایی که سقف موقعیت بازشان پر است.
//
// روی برخی نمادها — امروز «اهرم» — سقف موقعیت باز یک سررسید پر می‌شود. از آن
// لحظه اخذ موقعیت فزاینده تازه ممکن نیست و فقط می‌شود موقعیت قبلی را آفست
// کرد. این وضعیت در تابلو نیست؛ کارگزار اعلامش می‌کند. پس ورودی دستی است و
// جایش نوار بالای برنامه است، نه ته تب تنظیمات: روی همه تب‌های استراتژی اثر
// می‌گذارد و باید همان‌جا که هست دیده و عوض شود.
//
// چرا در تنظیمات ذخیره می‌شود و نه در حافظه مرورگر: این کلید وارد محاسبه
// می‌شود (`core/scan.mjs` ترکیب‌های آن سررسید را نمی‌سازد)، و هر چیزی که در
// محاسبه اثر دارد طبق قرارداد پروژه در `data/settings.json` می‌نشیند.

import { buildChain } from '/core/chain.mjs';
import { blockedExpirySet } from '/core/scan.mjs';
import { fmt, faDigits } from '/ui/fmt.mjs';
import { historyDateLabel, normalizeHistoryDate } from '/core/history.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

const expiryKey = (uaIns, endDate) => `${uaIns}:${endDate}`;
const expiryLabel = (endDate) => faDigits(historyDateLabel(normalizeHistoryDate(endDate)) || String(endDate));

/**
 * نوار انتخاب سررسیدهای پرشده را در `host` (یک `<details>`) می‌نشاند.
 *
 * زنجیره فقط لحظه‌ای که کاربر نوار را باز می‌کند گرفته می‌شود. قاعده «تب
 * بسته هیچ هزینه‌ای ندارد» برای این نوار هم می‌ارزد: تا کسی بازش نکند،
 * هیچ درخواستی نمی‌رود.
 */
export function mountCapacityPicker(host, { getSettings, putSettings }) {
  const summary = host.querySelector('[data-capacity-summary]');
  const panel = host.querySelector('[data-capacity-panel]');
  let chain = null, loading = false, error = '';

  const blocked = () => blockedExpirySet(getSettings().blockedExpiries);

  const paintSummary = () => {
    const count = blocked().size;
    summary.textContent = count ? `سقف پر: ${fmt.int(count)} سررسید` : 'سقف سررسید';
    summary.dataset.active = count ? '1' : '0';
    summary.title = count
      ? 'برای این سررسیدها هیچ استراتژی‌ای پیشنهاد نمی‌شود، چون موقعیت فزاینده تازه ممکن نیست.'
      : 'سررسیدهایی که سقف موقعیت بازشان پر شده را اینجا علامت بزن.';
  };

  const paintPanel = () => {
    if (loading) { panel.innerHTML = '<p class="capacity-note">در حال گرفتن زنجیره…</p>'; return; }
    if (error) { panel.innerHTML = `<p class="capacity-note" data-error="true">${esc(error)}</p>`; return; }
    const set = blocked();
    const list = [...(chain?.values() || [])]
      .filter((ua) => ua.expiryList?.length)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa'));
    if (!list.length) { panel.innerHTML = '<p class="capacity-note">زنجیره‌ای دریافت نشد.</p>'; return; }
    panel.innerHTML = `<p class="capacity-note">سررسیدی که سقف موقعیت بازش پر شده را علامت بزن. برای آن سررسید هیچ ترکیبی ساخته و پیشنهاد نمی‌شود؛ موقعیت‌های قبلی همچنان در تب موقعیت‌های من ارزش‌گذاری می‌شوند.</p>
      <div class="capacity-list">${list.map((ua) => `<section><h4>${esc(ua.name)}</h4>${ua.expiryList.map((expiry) => {
        const key = expiryKey(ua.ins, expiry.endDate);
        return `<label><input type="checkbox" data-expiry="${esc(key)}"${set.has(key) ? ' checked' : ''}><span>${expiryLabel(expiry.endDate)}</span><small>${fmt.int(expiry.days)} روز · ${fmt.int(expiry.strikeList?.length || 0)} قیمت اعمال</small></label>`;
      }).join('')}</section>`).join('')}</div>
      <div class="capacity-actions"><button type="button" class="ghost" data-capacity-clear>پاک کردن همه</button><span data-capacity-status role="status"></span></div>`;
  };

  async function loadChain() {
    if (chain || loading) return;
    loading = true; error = ''; paintPanel();
    try {
      const response = await fetch('/api/watch');
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'زنجیره دریافت نشد');
      chain = buildChain(payload.rows || []);
    } catch (e) {
      error = `زنجیره دریافت نشد: ${e.message}`;
    } finally {
      loading = false; paintPanel();
    }
  }

  async function save(next) {
    const status = panel.querySelector('[data-capacity-status]');
    if (status) status.textContent = 'در حال ذخیره…';
    try {
      await putSettings({ ...getSettings(), blockedExpiries: [...next].join(',') });
      paintSummary();
      if (status) status.textContent = 'ذخیره شد. اسکن بعدی این سررسیدها را نمی‌سازد.';
    } catch (e) {
      // اگر ذخیره نشد، تیک باید برگردد به وضعیت واقعی — وگرنه رابط چیزی را
      // نشان می‌دهد که در محاسبه اثر ندارد.
      paintPanel();
      if (panel.querySelector('[data-capacity-status]')) panel.querySelector('[data-capacity-status]').textContent = `ذخیره نشد: ${e.message}`;
    }
  }

  host.addEventListener('toggle', () => { if (host.open) loadChain(); });
  panel.addEventListener('change', (event) => {
    const input = event.target.closest('[data-expiry]');
    if (!input) return;
    const next = blocked();
    if (input.checked) next.add(input.dataset.expiry); else next.delete(input.dataset.expiry);
    save(next);
  });
  panel.addEventListener('click', (event) => {
    if (!event.target.closest('[data-capacity-clear]')) return;
    panel.querySelectorAll('[data-expiry]').forEach((input) => { input.checked = false; });
    save(new Set());
  });

  paintSummary();
  return { refresh: paintSummary };
}
