// خروجی جدول‌ها برای اکسل.
//
// یک ماژول مشترک، چون تا امروز هر تب خروجی خودش را داشت و هر کدام یک قاعده:
// یکی BOM می‌گذاشت یکی نه، یکی عدد فارسی می‌فرستاد یکی انگلیسی. نتیجه این
// بود که بعضی فایل‌ها در اکسل فارسی درست باز می‌شدند و بعضی نه.
//
// دو نکته که فایلِ درست را از فایلِ به‌ظاهر درست جدا می‌کند:
//
//   BOM        بدون `﻿` اکسل ویندوزی فایل را با کدپیج محلی می‌خواند و
//              همهٔ متن فارسی به هم می‌ریزد. خودِ فایل سالم است؛ اکسل
//              اشتباه می‌خواند. یک کاراکتر، کل مسئله.
//   رقم لاتین  رابط عدد را فارسی نشان می‌دهد (`۱۲٬۳۴۵٫۶`). اکسل آن را عدد
//              نمی‌فهمد و به‌صورت متن می‌نشاند، پس جمع و مرتب‌سازی از کار
//              می‌افتد. پس در خروجی به رقم لاتین و نقطهٔ اعشار برمی‌گردد.
//
// جداکنندهٔ ستون، `,` است. اکسل فارسی گاهی `;` می‌خواهد ولی `,` با
// «Import Text» همه‌جا کار می‌کند و با ابزارهای دیگر هم می‌خواند.

import { toEnDigits } from './fmt.mjs';

/** یک خانه، آمادهٔ CSV. نقل‌قول درون متن دوبار می‌شود، طبق RFC 4180. */
/**
 * نشانه‌های جهت‌دهی دوسویه — جداساز (U+2066…U+2069)، نشانگر چپ و راست
 * (U+200E/U+200F) و بازنویسی‌های U+202A…U+202E.
 *
 * اینها فقط برای نمایش‌اند: می‌گویند «این تکه را جدا بخوان» تا نام قراردادِ
 * فارسی با رقم لاتین در متن راست‌به‌چپ جابه‌جا نشود. در فایل CSV هیچ جهتی
 * برای کنترل نیست و همان‌ها به‌صورت نویسهٔ نامرئی داخل خانه می‌نشینند —
 * «ضهرم7058» در اکسل با «ضهرم7058» برابر نمی‌شود و جست‌وجو پیدایش نمی‌کند.
 */
const BIDI_MARKS = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function csvCell(value) {
  const s = String(value ?? '').replace(BIDI_MARKS, '').replace(/\s+/g, ' ').trim();
  return `"${s.replaceAll('"', '""')}"`;
}

/**
 * خانه‌ای که باید عدد بماند.
 *
 * فقط وقتی تبدیل می‌شود که کلِ متن یک عدد باشد. «۳۰ روز» عدد نیست و باید
 * متن بماند، وگرنه واحدش را از دست می‌دهد و ۳۰ ثانیه از ۳۰ روز جدا نمی‌شود.
 */
export function numericCell(text) {
  const en = toEnDigits(String(text ?? '').replace(BIDI_MARKS, '').trim());
  if (/^-?\d+(\.\d+)?$/.test(en)) return en;
  // نشانهٔ درصد از خانه برداشته می‌شود، چون واحد در سرستون هست. با «٪» چسبیده
  // اکسل ستون را متن می‌گیرد و جمع و میانگین از کار می‌افتد. فقط وقتی که
  // باقی‌مانده یک عدد کامل باشد — «۵۰٪ تا ۶۰٪» متن می‌ماند.
  const noPct = en.replace(/\s*[٪%]\s*$/, '');
  if (noPct !== en && /^-?\d+(\.\d+)?$/.test(noPct)) return noPct;
  return csvCell(en);
}

/** آرایهٔ سطرها به متن CSV، با BOM. */
export function toCsv(rows) {
  return `﻿${rows.map((row) => row.map(numericCell).join(',')).join('\r\n')}\r\n`;
}

/**
 * فایل را به کاربر می‌دهد.
 *
 * نام فایل تاریخ می‌گیرد، وگرنه کاربری که سه جدول را پشت سر هم می‌گیرد سه
 * فایل هم‌نام دارد و مرورگر به دومی و سومی «(1)» و «(2)» می‌چسباند.
 */
export function downloadCsv(name, rows) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * یک `<table>` رسم‌شده را به سطر تبدیل می‌کند.
 *
 * سرستون‌های چندسطری (`thead` با دو `tr`) با هم می‌آیند تا گروه‌بندی گم
 * نشود. `colspan` با تکرار عنوان پر می‌شود، نه با خانهٔ خالی — خانهٔ خالی
 * ستون‌ها را جابه‌جا می‌کند و جدول اکسل با جدول صفحه نمی‌خواند.
 */
export function tableToRows(table) {
  if (!table) return [];
  const out = [];
  for (const tr of table.querySelectorAll('thead tr')) {
    const row = [];
    for (const cell of tr.children) {
      const span = Math.max(1, Number(cell.getAttribute('colspan')) || 1);
      for (let i = 0; i < span; i++) row.push(cell.textContent);
    }
    out.push(row);
  }
  for (const tr of table.querySelectorAll('tbody tr')) {
    // ردیف فاصله‌گذارِ مجازی‌سازی، ردیف داده نیست
    if (tr.children.length === 1 && !tr.children[0].textContent.trim()) continue;
    out.push([...tr.children].map((cell) => cell.textContent));
  }
  return out;
}

/**
 * دکمهٔ خروجی را کنار یک جدول می‌نشاند.
 *
 * `getRows` اختیاری است: اگر ندهی، همان جدولِ رسم‌شده خوانده می‌شود. برای
 * جدول مجازی‌سازی‌شده باید بدهی — آن‌جا فقط ردیف‌های داخل قاب در DOM هستند
 * و خروجیِ DOM-خوان، بی‌صدا ناقص می‌شود.
 */
export function attachExport(host, { name, getRows, label = 'خروجی اکسل' } = {}) {
  if (!host) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ghost export-btn';
  btn.textContent = label;
  btn.addEventListener('click', () => {
    const rows = getRows ? getRows() : tableToRows(host.querySelector('table'));
    if (!rows.length) { btn.textContent = 'چیزی برای خروجی نیست'; setTimeout(() => { btn.textContent = label; }, 1800); return; }
    downloadCsv(`${name}-${stamp()}`, rows);
  });
  return btn;
}

/** مهر زمانی کوتاه برای نام فایل. رقم لاتین، تا نام فایل در هر سیستمی سالم بماند. */
export function stamp(at = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}`;
}

/**
 * دکمهٔ خروجی را روی هر جدولِ رشته‌ای زیر `root` می‌نشاند.
 *
 * چرا جاروی خودکار و نه دکمه‌گذاری دستی در هر تب: جدول‌های این برنامه با
 * رشتهٔ قالبی ساخته می‌شوند و هر بار که داده عوض می‌شود `innerHTML` از نو
 * نوشته می‌شود. دکمه‌ای که داخل همان ظرف باشد هر بار پاک می‌شود، و دکمه‌ای
 * که دستی بیرونش گذاشته شود باید در بیست جا تکرار شود و یکی‌شان فراموش شود.
 *
 * پس دکمه در یک نوار *خواهرِ* ظرف می‌نشیند — بیرون از چیزی که بازنویسی
 * می‌شود — و خواندن هم لحظهٔ کلیک انجام می‌شود، از همان جدولی که آن لحظه
 * روی صفحه است.
 *
 * جدول مجازی‌سازی‌شده کنار گذاشته می‌شود: خودش خروجیِ داده‌محور دارد و
 * خروجیِ DOM-خوانش ناقص می‌شد.
 */
export function attachExportsIn(root, prefix = 'table') {
  if (!root) return;
  const wraps = root.querySelectorAll('.history-table-wrap, .scroll');
  let n = 0;
  for (const wrap of wraps) {
    if (wrap.closest('.tbl-wrap')) continue;              // جدول مجازی‌سازی‌شده
    if (wrap.previousElementSibling?.classList?.contains('export-bar')) continue;
    const name = wrap.id || wrap.getAttribute('data-export') || `${prefix}-${++n}`;
    const bar = document.createElement('div');
    bar.className = 'export-bar';
    const btn = attachExport(wrap, { name: `${prefix}-${name}`, label: 'خروجی اکسل' });
    if (!btn) continue;
    bar.appendChild(btn);
    wrap.parentNode.insertBefore(bar, wrap);
  }
}
