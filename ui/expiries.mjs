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

import { buildChain } from '../core/chain.mjs';
import { blockedExpirySet } from '../core/scan.mjs';
import { fmt, faDigits, humanizeUpstreamError } from './fmt.mjs';
import { historyDateLabel, normalizeHistoryDate } from '../core/history.mjs';

const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[char]));

/**
 * کلیدهای علامت‌خورده‌ای که زنجیره پوششان نمی‌دهد.
 *
 * دو حالت به اینجا می‌رسد: زنجیره نیامده (بازار بسته یا بالادست خاموش)، یا آن
 * سررسید گذشته و دیگر قراردادی ندارد. در هر دو حالت کلید همچنان در تنظیمات
 * نشسته و همچنان روی محاسبه اثر دارد، پس باید دیده و برداشته‌شدنی باشد.
 */
export function strandedKeys(blocked, chain) {
  const covered = new Set();
  for (const ua of chain?.values() || []) {
    for (const expiry of ua.expiryList || []) covered.add(`${ua.ins}:${expiry.endDate}`);
  }
  return [...blocked].filter((key) => !covered.has(key)).sort();
}

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
  let chain = null, loading = false, error = '', errorRaw = '';

  const blocked = () => blockedExpirySet(getSettings().blockedExpiries);

  const paintSummary = () => {
    const count = blocked().size;
    summary.textContent = count ? `سقف پر: ${fmt.int(count)} سررسید` : 'سقف سررسید';
    summary.dataset.active = count ? '1' : '0';
    summary.title = count
      ? 'برای این سررسیدها هیچ استراتژی‌ای پیشنهاد نمی‌شود، چون موقعیت فزاینده تازه ممکن نیست.'
      : 'سررسیدهایی که سقف موقعیت بازشان پر شده را اینجا علامت بزن.';
  };

  // نام نماد فقط از زنجیره می‌آید. اگر زنجیره نیامده باشد کد `ins` نشان داده
  // می‌شود، نه نامی حدسی — نامِ ساخته‌شده بدتر از کدِ خام است.
  const uaName = (ins) => {
    for (const ua of chain?.values() || []) if (String(ua.ins) === String(ins)) return ua.name;
    return '';
  };

  const chainSections = (set) => {
    const list = [...(chain?.values() || [])]
      .filter((ua) => ua.expiryList?.length)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'fa'));
    return list.map((ua) => `<section><h4>${esc(ua.name)}</h4>${ua.expiryList.map((expiry) => {
      const key = expiryKey(ua.ins, expiry.endDate);
      return `<label><input type="checkbox" data-expiry="${esc(key)}"${set.has(key) ? ' checked' : ''}><span>${expiryLabel(expiry.endDate)}</span><small>${fmt.int(expiry.days)} روز · ${fmt.int(expiry.strikeList?.length || 0)} قیمت اعمال</small></label>`;
    }).join('')}</section>`).join('');
  };

  const strandedSection = (set) => {
    const rest = strandedKeys(set, chain);
    if (!rest.length) return '';
    return `<section data-capacity-stranded><h4>علامت‌خورده‌های بیرون از زنجیره</h4>${rest.map((key) => {
      const [ins, endDate] = String(key).split(':');
      const name = uaName(ins);
      return `<label><input type="checkbox" data-expiry="${esc(key)}" checked><span>${expiryLabel(endDate)}</span><small>${esc(name || `کد ${faDigits(ins)}`)}</small></label>`;
    }).join('')}</section>`;
  };

  const retry = '<button type="button" class="ghost" data-capacity-retry>تلاش دوباره</button>';

  const stateNote = () => {
    if (loading) return '<p class="capacity-note">در حال گرفتن زنجیره…</p>';
    if (error) return `<p class="capacity-note" data-error="true" title="${esc(errorRaw)}">${esc(error)} ${retry}</p>`;
    if (chain && !chain.size) {
      return `<p class="capacity-note" data-error="true">هیچ قرارداد فعالی از بالادست نرسید، پس فهرست سررسیدها ساخته نشد. علامت‌های فعلی دست‌نخورده‌اند و اثرشان در محاسبه برقرار است. ${retry}</p>`;
    }
    return '';
  };

  const paintPanel = () => {
    const set = blocked();
    const html = chainSections(set);
    const stranded = strandedSection(set);
    const body = html || stranded ? `<div class="capacity-list">${stranded}${html}</div>` : '';
    panel.innerHTML = `<p class="capacity-note">سررسیدی که سقف موقعیت بازش پر شده را علامت بزن. برای آن سررسید هیچ ترکیبی ساخته و پیشنهاد نمی‌شود؛ موقعیت‌های قبلی همچنان در تب موقعیت‌های من ارزش‌گذاری می‌شوند.</p>
      ${stateNote()}${body}
      <div class="capacity-actions"><button type="button" class="ghost" data-capacity-clear${set.size ? '' : ' disabled'}>پاک کردن همه</button><span data-capacity-status role="status"></span></div>`;
  };

  async function loadChain(force = false) {
    if (loading) return;
    // زنجیره خالی کش نمی‌شود. اگر شود، یک بارِ ناموفق تا بارگذاری دوباره صفحه
    // پنل را خالی نگه می‌دارد و باز کردن دوباره هیچ تلاشی نمی‌کند.
    if (chain?.size && !force) return;
    loading = true; error = ''; errorRaw = ''; paintPanel();
    try {
      // چرا `history/universe` و نه `watch`: حلقه دیده‌بان بیرون از ساعت بازار
      // عمداً پارک می‌شود و `/api/watch` آن‌وقت آرایه خالی برمی‌گرداند — با کد
      // ۲۰۰ و بدون خطا، یعنی خرابیِ بی‌صدا. سقف موقعیت را کارگزار معمولاً پس
      // از بسته‌شدن بازار اعلام می‌کند، یعنی دقیقاً همان ساعتی که این نوار باید
      // کار کند. `history/universe` برای همین ساخته شده و شب و روز پاسخ می‌دهد.
      const response = await fetch('/api/history/universe');
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error || 'زنجیره دریافت نشد');
      chain = buildChain(payload.rows || []);
    } catch (e) {
      chain = null;
      // متن خام بالادست در `title` می‌ماند: پیام فارسی برای تصمیم، متن خام
      // برای عیب‌یابی. یکی از این دو بدون دیگری کم است.
      errorRaw = String(e.message || e);
      error = `فهرست سررسیدها گرفته نشد — ${humanizeUpstreamError(errorRaw) || errorRaw}.`;
    } finally {
      loading = false; paintPanel();
    }
  }

  // پیام وضعیت پس از هر بازکشی دوباره خوانده می‌شود، چون `paintPanel` گره را
  // نو می‌کند و ارجاع قدیمی به گرهی می‌نویسد که دیگر روی صفحه نیست.
  const say = (msg) => { const node = panel.querySelector('[data-capacity-status]'); if (node) node.textContent = msg; };

  async function save(next) {
    say('در حال ذخیره…');
    try {
      await putSettings({ ...getSettings(), blockedExpiries: [...next].join(',') });
      paintSummary();
      // اینجا عمداً بازکشی کامل نمی‌شود. تیک‌زدن نباید فهرست را از نو بسازد،
      // وگرنه تمرکز صفحه‌کلید هر بار به بالای فهرست می‌پرد و انتخاب چند
      // سررسید پشت سر هم غیرممکن می‌شود. فقط چیزی که به مجموعه وابسته است
      // تازه می‌شود. ردیفِ تیک‌برداشته در بخش «بیرون از زنجیره» تا باز شدن
      // بعدی می‌ماند — که خوب است: کلیک اشتباه برگشت‌پذیر می‌ماند.
      const clear = panel.querySelector('[data-capacity-clear]');
      if (clear) clear.disabled = !next.size;
      say('ذخیره شد. اسکن بعدی این سررسیدها را نمی‌سازد.');
    } catch (e) {
      // اگر ذخیره نشد، تیک باید برگردد به وضعیت واقعی — وگرنه رابط چیزی را
      // نشان می‌دهد که در محاسبه اثر ندارد.
      paintPanel();
      say(`ذخیره نشد: ${e.message}`);
    }
  }

  // نخست بازکشی، بعد گرفتن زنجیره. باز شدن نوار باید بی‌درنگ نشان دهد چه چیزی
  // الان علامت خورده است؛ منتظر ماندن برای شبکه یعنی چند لحظه پنلِ خالی، و
  // پنل خالی از نگاه کاربر یعنی «کار نمی‌کند».
  host.addEventListener('toggle', () => { if (host.open) { paintPanel(); loadChain(); } });
  panel.addEventListener('change', (event) => {
    const input = event.target.closest('[data-expiry]');
    if (!input) return;
    const next = blocked();
    if (input.checked) next.add(input.dataset.expiry); else next.delete(input.dataset.expiry);
    save(next);
  });
  panel.addEventListener('click', (event) => {
    if (event.target.closest('[data-capacity-retry]')) { loadChain(true); return; }
    if (!event.target.closest('[data-capacity-clear]')) return;
    panel.querySelectorAll('[data-expiry]').forEach((input) => { input.checked = false; });
    save(new Set());
  });

  paintSummary();
  return { refresh: paintSummary };
}
