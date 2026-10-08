// ═══ وصله‌زدنِ DOM به‌جای جایگزینی ═══
//
// گزارش صاحب پروژه (۱۴۰۵/۰۷/۱۶): «وقتی دیتای جدید گرفته می‌شود برنامه و
// صفحه انگار ریلود می‌شود… در سراسر برنامه می‌خواهم هیچ وقفه‌ای نباشد و
// کاربر متوجه نشود.»
//
// `host.innerHTML = …` در هر تیک، همهٔ گره‌ها را دور می‌ریزد و از نو
// می‌سازد: جای پیمایشِ هر جعبهٔ پیمایش‌دار صفر می‌شود، فوکوس و هاور و
// متنِ انتخاب‌شده می‌پرد، و `<details>`ِ باز بسته می‌شود — همان حسِ
// «ریلود». این ماژول همان HTML را می‌گیرد ولی فقط تفاوت را روی گره‌های
// موجود می‌نشاند: عددی که عوض شده عوض می‌شود و بقیهٔ صفحه دست نمی‌خورد.
//
// عمداً ساده و بی‌کلید است (هم‌ترازی با جایگاه): ردیف‌های این برنامه
// جایگاهِ پایدار دارند و هزینهٔ اشتباهِ هم‌ترازی فقط یک بازنویسیِ متن است،
// نه دادهٔ غلط. صفر وابستگی (AGENTS.md §۲-۱).

/** گره‌ای که مالِ کتابخانهٔ دیگری است (نمودار ECharts) یا صریحاً قفل شده. */
const owned = (el) => el.nodeType === 1 && (el.hasAttribute('_echarts_instance_') || el.hasAttribute('data-morph-skip'));

function syncAttributes(a, b) {
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
}

/** مقدارِ کنترلِ فرم فقط وقتی کاربر رویش نیست؛ نوشتنِ زیرِ دستِ کاربر یعنی پریدنِ مکان‌نما. */
function syncFormState(a, b) {
  if (a === a.ownerDocument?.activeElement) return;
  if (a.tagName === 'INPUT') {
    const value = b.getAttribute('value') ?? '';
    if (a.value !== value) a.value = value;
    const checked = b.hasAttribute('checked');
    if (a.checked !== checked) a.checked = checked;
  } else if (a.tagName === 'TEXTAREA') {
    if (a.value !== b.textContent) a.value = b.textContent;
  } else if (a.tagName === 'SELECT') {
    const chosen = [...b.options].find((option) => option.hasAttribute('selected')) || b.options[0];
    if (chosen && a.value !== chosen.value) a.value = chosen.value;
  }
}

function morphNode(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
  if (a.nodeType === 3 || a.nodeType === 8) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return true;
  }
  if (a.nodeType !== 1) return false;
  if (owned(a)) return true;
  // `open`ِ details را کاربر باز کرده؛ HTMLِ تازه از آن خبر ندارد.
  const wasOpen = a.tagName === 'DETAILS' ? a.open : null;
  syncAttributes(a, b);
  if (wasOpen !== null && a.open !== wasOpen) a.open = wasOpen;
  morphChildren(a, b);
  syncFormState(a, b);
  return true;
}

/**
 * فرزندانِ `target` را هم‌شکلِ فرزندانِ `source` می‌کند. گرهِ ناهم‌جنس
 * جایگزین می‌شود و گرهِ هم‌جنس وصله. `source` پس از این مصرف شده است.
 */
export function morphChildren(target, source) {
  const next = [...source.childNodes];
  let i = 0;
  for (; i < next.length; i += 1) {
    const have = target.childNodes[i];
    if (!have) { target.appendChild(next[i]); continue; }
    if (!morphNode(have, next[i])) target.replaceChild(next[i], have);
  }
  while (target.childNodes.length > i) target.removeChild(target.lastChild);
}

/** همان `host.innerHTML = html`، ولی با وصله: پیمایش، فوکوس و هاور می‌مانند. */
export function patchHTML(host, html) {
  if (!host) return;
  const template = host.ownerDocument.createElement('template');
  template.innerHTML = html;
  morphChildren(host, template.content);
}

/**
 * سازنده‌ای که در `host.innerHTML` می‌نویسد، در یک ظرفِ جدا اجرا می‌شود و
 * نتیجه وصله می‌شود. برای نقاشانی که HTML می‌سازند ولی شنونده نمی‌چسبانند.
 * خروجیِ خودِ سازنده برگردانده می‌شود.
 */
export function paintInto(host, paint) {
  const scratch = host.ownerDocument.createElement(host.tagName === 'TBODY' ? 'tbody' : 'div');
  const out = paint(scratch);
  if (out !== false) morphChildren(host, scratch);
  return out;
}

/**
 * همان `el.innerHTML = …` به‌صورت وصله، برای کدی که ساختارش انتساب است:
 * `patched(el).innerHTML = html`.
 */
export const patched = (el) => ({ set innerHTML(html) { patchHTML(el, html); } });

const wired = new WeakSet();
/**
 * فقط گره‌هایی که هنوز شنونده نگرفته‌اند. گره‌ها حالا از تیکی به تیکِ بعد
 * می‌مانند؛ بی این، هر تیک یک شنوندهٔ دیگر کنارِ قبلی می‌چسباند و یک کلیک
 * چند بار اجرا می‌شد. شنونده باید دادهٔ گره را **هنگامِ کلیک** بخواند
 * (`dataset`)، نه هنگامِ چسباندن.
 */
export function fresh(nodes) {
  return [...nodes].filter((node) => !wired.has(node) && wired.add(node));
}
