// سورت و جابه‌جایی ستون برای هر جدولی که با رشتهٔ قالبی ساخته شده.
//
// جدول مجازی‌سازی‌شدهٔ `table.mjs` این دو را از روز اول دارد، ولی بیشتر
// جدول‌های برنامه با `innerHTML` ساخته می‌شوند و هیچ‌کدام نداشتند. بازنویسی
// چهل‌وشش جدول روی `makeTable` یعنی برای هر کدام یک قرارداد ستون، یک قالب،
// و کلیک روی ردیف و کلاس‌های رنگی‌اش را از نو سوار کردن — کاری بزرگ با
// ریسک رگرسیون بالا، آن هم برای دو رفتاری که کاملاً عمومی‌اند.
//
// پس همان الگویی که این مخزن برای خروجی اکسل دارد (`attachExportsIn`):
// رفتار روی جدولِ *رسم‌شده* می‌نشیند، نه در سازندهٔ آن. یک شنوندهٔ واگذارشده
// و یک ناظرِ تغییر، برای کل برنامه. جدول تازه‌ای که فردا اضافه شود هم بدون
// هیچ کاری همین دو را دارد.
//
// چرا نه «کلاس بده تا فعال شود»: همان راهی است که یکی‌اش فراموش می‌شود.
// اینجا همه‌چیز پیش‌فرض روشن است و فقط جدولی که *نباید* سورت شود علامت
// می‌خورد.

import { toEnDigits } from './fmt.mjs';

const STORE = 'options-radar:cols:';

/**
 * جدولی که ساختارش با جابه‌جایی ستون به هم می‌ریزد، کنار گذاشته می‌شود.
 *
 * سه حالت: سرستون چندسطری، خانهٔ ادغام‌شده، و ردیفی که شمار خانه‌اش با
 * سرستون نمی‌خواند. در هر سه، جابه‌جا کردن ستون یعنی جابه‌جا کردن دادهٔ
 * ردیف‌های مختلف روی هم — خرابیِ بی‌صدا، که بدترین نوع است.
 */
export function enhanceable(table) {
  if (!table || table.closest('.tbl-wrap')) return false;     // جدول مجازی‌سازی‌شده، خودش دارد
  if (table.dataset.enhance === 'off') return false;
  const heads = table.querySelectorAll('thead tr');
  if (heads.length !== 1) return false;
  const cells = [...heads[0].children];
  if (!cells.length) return false;
  if (cells.some((c) => c.colSpan > 1 || c.rowSpan > 1)) return false;
  const body = [...table.querySelectorAll('tbody tr')];
  if (body.some((tr) => [...tr.children].some((c) => c.colSpan > 1 || c.rowSpan > 1))) return false;
  // ردیف «چیزی پیدا نشد» معمولاً یک خانهٔ تک‌ستونه است و نباید مانع شود
  if (body.some((tr) => tr.children.length !== cells.length && tr.children.length > 1)) return false;
  return true;
}

/**
 * ماتریس متقارن ستون جابه‌جا نمی‌کند.
 *
 * در ماتریس هم‌حرکتی یا ورود×خروج، ستون *n* و ردیف *n* یک چیزند. جابه‌جایی
 * ستون‌ها بدون جابه‌جایی ردیف‌ها، ماتریس را بی‌معنی می‌کند. سورت ردیف‌ها
 * روی یک ستون همچنان معنی دارد و باز می‌ماند.
 */
const isMatrix = (table) => table.matches('.backtest-correlation, .return-matrix, .decision-heatmap')
  || table.dataset.enhance === 'sort-only';

/** شناسهٔ پایدار جدول، برای به‌خاطر سپردن ترتیب ستون‌ها. */
function tableKey(table) {
  if (table.dataset.enhanceKey) return table.dataset.enhanceKey;
  const host = table.closest('[id]')?.id || table.id || '';
  const heads = [...table.querySelectorAll('thead th')].map((c) => c.textContent.trim()).join('|');
  // نام سرستون‌ها بخشی از کلید است: جدولی که ستون‌هایش عوض شده، جدول
  // دیگری است و ترتیب ذخیره‌شدهٔ قبلی به آن نمی‌خورد.
  let hash = 0;
  for (let i = 0; i < heads.length; i++) hash = ((hash * 31) + heads.charCodeAt(i)) | 0;
  const key = `${host}:${heads.length}:${hash.toString(36)}`;
  table.dataset.enhanceKey = key;
  return key;
}

const store = () => { try { return window.localStorage; } catch { return null; } };

function savedOrder(table) {
  const ls = store();
  if (!ls) return null;
  try {
    const raw = JSON.parse(ls.getItem(STORE + tableKey(table)) || 'null');
    return Array.isArray(raw) ? raw : null;
  } catch { return null; }
}

function saveOrder(table, order) {
  const ls = store();
  if (!ls) return;
  try { ls.setItem(STORE + tableKey(table), JSON.stringify(order)); } catch { /* حافظه پر یا بسته */ }
}

/**
 * مقدار قابل مقایسهٔ یک خانه.
 *
 * متن خانه ممکن است چند تکه باشد («۱٬۲۳۴» بعلاوهٔ یک `<small>` با درصد).
 * اولین عدد ملاک است، چون همان چیزی است که خانه در وهلهٔ اول می‌گوید. اگر
 * عددی نبود، متن مقایسه می‌شود.
 *
 * خانهٔ بی‌مقدار («—» یا خالی) همیشه ته فهرست می‌نشیند، در هر دو جهت: «نداریم»
 * نه بزرگ‌ترین است نه کوچک‌ترین، و اگر مثل صفر رفتار کند، ردیف‌های بی‌داده
 * بالای جدول جمع می‌شوند و جای ردیف‌های واقعی را می‌گیرند.
 */
export function cellValue(cell) {
  const text = toEnDigits(String(cell?.textContent ?? '')).replace(/[‎‏‪-‮⁦-⁩]/g, '').trim();
  if (!text || text === '—' || text === '-') return { empty: true, num: NaN, text: '' };
  const match = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (match) return { empty: false, num: Number(match[0]), text };
  return { empty: false, num: NaN, text };
}

function compare(a, b, dir) {
  if (a.empty && b.empty) return 0;
  if (a.empty) return 1;                      // بی‌مقدار همیشه ته، مستقل از جهت
  if (b.empty) return -1;
  if (Number.isFinite(a.num) && Number.isFinite(b.num)) return (a.num - b.num) * dir;
  return a.text.localeCompare(b.text, 'fa') * dir;
}

/** ترتیب اولیهٔ ردیف‌ها را نگه می‌دارد تا حالت سوم سورت به آن برگردد. */
function baseline(tbody) {
  if (!tbody.__baseline || tbody.__baselineLen !== tbody.children.length) {
    tbody.__baseline = [...tbody.children];
    tbody.__baselineLen = tbody.children.length;
  }
  return tbody.__baseline;
}

export function sortRowsBy(table, index, dir) {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  const rows = baseline(tbody);
  if (!dir) {
    for (const tr of rows) tbody.appendChild(tr);
    return;
  }
  const decorated = rows.map((tr, at) => ({ tr, at, value: cellValue(tr.children[index]) }));
  // مرتب‌سازی پایدار: ردیف‌های هم‌ارزش ترتیب اولیه‌شان را نگه می‌دارند،
  // وگرنه هر کلیک روی ستونی با مقدارهای تکراری، ردیف‌ها را می‌پراند.
  decorated.sort((a, b) => compare(a.value, b.value, dir) || (a.at - b.at));
  for (const item of decorated) tbody.appendChild(item.tr);
}

/** ترتیب ذخیره‌شدهٔ ستون‌ها را روی جدول می‌نشاند. */
export function applyOrder(table, order) {
  const heads = [...table.querySelectorAll('thead th')];
  if (!order || order.length !== heads.length) return false;
  if (order.every((at, i) => at === i)) return true;              // همان ترتیب فعلی
  for (const tr of table.querySelectorAll('thead tr, tbody tr')) {
    const cells = [...tr.children];
    if (cells.length !== order.length) continue;
    for (const at of order) tr.appendChild(cells[at]);
  }
  return true;
}

/**
 * ستون را از `from` برمی‌دارد و در `to` می‌نشاند.
 *
 * دقیقاً همان معنای `moveColumn` در `table.mjs`: جای هدف در فهرستِ
 * *کوتاه‌شده* حساب می‌شود. اگر این دو یکی نبودند، کشیدن ستون در جدول
 * مجازی‌سازی‌شده و جدول معمولی دو نتیجهٔ متفاوت می‌داد و کاربر نمی‌فهمید
 * چرا.
 */
export function moveTo(order, from, to) {
  if (from === to) return [...order];
  const next = [...order];
  const [taken] = next.splice(from, 1);
  next.splice(to, 0, taken);
  return next;
}

const currentOrder = (table) => [...table.querySelectorAll('thead th')].map((_, i) => i);

function markHeads(table) {
  const heads = [...table.querySelectorAll('thead th')];
  const movable = !isMatrix(table);
  heads.forEach((th, index) => {
    th.dataset.col = String(index);
    if (!th.hasAttribute('tabindex')) th.tabIndex = 0;
    if (!th.getAttribute('role')) th.setAttribute('role', 'columnheader');
    if (!th.getAttribute('aria-sort')) th.setAttribute('aria-sort', 'none');
    th.draggable = movable;
    if (movable && !th.title) th.title = 'کلیک: مرتب‌سازی · کشیدن: جابه‌جایی ستون';
    else if (!movable && !th.title) th.title = 'کلیک: مرتب‌سازی';
  });
  table.dataset.enhanced = '1';
}

/**
 * جدول را آماده می‌کند: نشانه‌گذاری سرستون‌ها و بازگرداندن ترتیب ذخیره‌شده.
 *
 * بی‌اثر است اگر دوباره صدا زده شود؛ ناظرِ تغییر هر بار پس از رسم دوباره
 * صدایش می‌زند و نباید هر بار چیزی را از نو بسازد.
 */
export function enhanceTable(table) {
  if (!enhanceable(table)) return false;
  const fresh = table.dataset.enhanced !== '1';
  markHeads(table);
  if (fresh && !isMatrix(table)) applyOrder(table, savedOrder(table));
  return true;
}

/** همهٔ جدول‌های زیر یک ریشه. */
export function enhanceTablesIn(root) {
  let n = 0;
  for (const table of root?.querySelectorAll?.('table') || []) if (enhanceTable(table)) n += 1;
  return n;
}

/**
 * یک‌بار برای کل برنامه نصب می‌شود.
 *
 * شنوندهٔ واگذارشده روی ریشه می‌نشیند، نه روی هر جدول: جدول‌ها با هر
 * به‌روزرسانی از نو ساخته می‌شوند و شنوندهٔ روی خودشان با آن‌ها پاک می‌شد.
 * ناظرِ تغییر همان نقش را برای نشانه‌گذاری بازی می‌کند.
 */
export function installTableEnhance(root = document.body) {
  if (!root || root.dataset?.tableEnhance === '1') return () => {};
  if (root.dataset) root.dataset.tableEnhance = '1';

  const headOf = (event) => {
    const th = event.target.closest('th');
    const table = th?.closest('table');
    return th && table && table.dataset.enhanced === '1' && th.closest('thead') ? { th, table } : null;
  };

  const onClick = (event) => {
    const hit = headOf(event);
    if (!hit) return;
    const { th, table } = hit;
    const index = [...th.parentElement.children].indexOf(th);
    // سه حالت: نزولی، صعودی، ترتیب اولیه. حالت سوم لازم است چون ترتیب
    // اولیهٔ خیلی از این جدول‌ها خودش معنی دارد (زمان، تاریخ، رتبه) و
    // بدون آن کاربر راهی برای برگشتن ندارد جز بازسازی کل تب.
    const now = th.getAttribute('aria-sort');
    const dir = now === 'descending' ? 1 : now === 'ascending' ? 0 : -1;
    for (const other of table.querySelectorAll('thead th')) other.setAttribute('aria-sort', 'none');
    th.setAttribute('aria-sort', dir === -1 ? 'descending' : dir === 1 ? 'ascending' : 'none');
    sortRowsBy(table, index, dir);
  };

  const onKey = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!headOf(event)) return;
    event.preventDefault();
    onClick(event);
  };

  let dragging = null;
  const onDragStart = (event) => {
    const hit = headOf(event);
    if (!hit || isMatrix(hit.table)) return;
    dragging = { table: hit.table, from: [...hit.th.parentElement.children].indexOf(hit.th) };
    hit.th.classList.add('th-dragging');
    try { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', ''); } catch { /* بعضی مرورگرها */ }
  };
  const onDragOver = (event) => {
    const hit = headOf(event);
    if (!dragging || !hit || hit.table !== dragging.table) return;
    event.preventDefault();
    for (const th of dragging.table.querySelectorAll('thead th')) th.classList.remove('th-drop');
    hit.th.classList.add('th-drop');
  };
  const onDrop = (event) => {
    const hit = headOf(event);
    if (!dragging || !hit || hit.table !== dragging.table) return;
    event.preventDefault();
    const to = [...hit.th.parentElement.children].indexOf(hit.th);
    if (to !== dragging.from) {
      const order = moveTo(currentOrder(dragging.table), dragging.from, to);
      applyOrder(dragging.table, order);
      // ترتیب ذخیره‌شده باید نسبت به *ساختار اولیه* باشد نه نسبت به
      // چیدمان فعلی، وگرنه هر بار رسم دوباره یک جابه‌جایی روی جابه‌جایی
      // قبلی سوار می‌شود و ستون‌ها می‌چرخند.
      const before = savedOrder(dragging.table) || currentOrder(dragging.table);
      saveOrder(dragging.table, order.map((at) => before[at]));
    }
    endDrag();
  };
  const endDrag = () => {
    if (!dragging) return;
    for (const th of dragging.table.querySelectorAll('thead th')) th.classList.remove('th-dragging', 'th-drop');
    dragging = null;
  };

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  root.addEventListener('dragstart', onDragStart);
  root.addEventListener('dragover', onDragOver);
  root.addEventListener('drop', onDrop);
  root.addEventListener('dragend', endDrag);

  enhanceTablesIn(root);
  const observer = typeof MutationObserver === 'function'
    ? new MutationObserver(() => enhanceTablesIn(root))
    : null;
  observer?.observe(root, { childList: true, subtree: true });

  return () => {
    observer?.disconnect();
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKey);
    root.removeEventListener('dragstart', onDragStart);
    root.removeEventListener('dragover', onDragOver);
    root.removeEventListener('drop', onDrop);
    root.removeEventListener('dragend', endDrag);
    if (root.dataset) delete root.dataset.tableEnhance;
  };
}
