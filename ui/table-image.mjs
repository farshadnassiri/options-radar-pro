// ═══ تصویرِ جدول — خوانا و کامل ═══
//
// خواستهٔ صاحب پروژه (۱۴۰۵/۰۷/۱۶): «امکان گرفتن خروجی تصویر از جداول هم
// وجود داشته باشد. اگر جدول بزرگ است راه‌حلی ایجاد کن که اولاً خوانا باشد،
// ثانیاً اطلاعاتی جا نماند و کامل باشد.»
//
// عکس گرفتن از جدولِ روی صفحه هر دو را می‌شکند: جدولِ مجازی‌سازی‌شده فقط
// ردیف‌های داخل قاب را در DOM دارد، و جدولِ پهن پشت پیمایشِ افقی بریده
// می‌شود. پس تصویر از **داده** کشیده می‌شود، نه از صفحه:
//
//   • همهٔ ردیف‌ها، با ترتیب و ستون‌های روی صفحه (جدولِ مشترک از
//     `tableModelOf`، جدولِ ایستا از خودِ `<table>`).
//   • متنِ بلند در خانه می‌شکند و چندخطی می‌شود — بریده نمی‌شود.
//   • جدولِ پهن به چند بخشِ ستونی تقسیم می‌شود که زیرِ هم می‌نشینند و ستونِ
//     اول (نام ردیف) در هر بخش تکرار می‌شود تا هر خانه صاحبش را داشته باشد.
//   • جدولِ بلند، اگر در یک تصویر جا نشود، چند تصویر می‌شود و سرستون در هر
//     کدام تکرار می‌شود. پانویس می‌گوید «صفحهٔ ۱ از ۳» و شمار ردیف‌ها.
//
// بخشِ چیدمان خالص است و در نود آزموده می‌شود؛ کشیدن روی بوم در مرورگر.

import { fmt } from './fmt.mjs';

export const TABLE_IMAGE = {
  padX: 10, padY: 7, lineH: 21, headLineH: 20, fontSize: 13.5, headSize: 13,
  minCol: 48, maxCol: 280, maxWidth: 1800, maxPageHeight: 13000, margin: 16,
};

/** متن را در پهنای `maxW` می‌شکند؛ کلمهٔ بلندتر از پهنا حرف‌به‌حرف. */
export function wrapText(text, maxW, measure) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  const push = (word) => {
    if (measure(word) <= maxW) return [word];
    const parts = [];
    let part = '';
    for (const ch of word) {
      if (part && measure(part + ch) > maxW) { parts.push(part); part = ch; } else part += ch;
    }
    if (part) parts.push(part);
    return parts;
  };
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= maxW) { line = next; continue; }
    if (line) lines.push(line);
    const pieces = push(word);
    lines.push(...pieces.slice(0, -1));
    line = pieces.at(-1);
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * چیدمانِ کامل: پهنای ستون‌ها، گروه‌های ستونی، خط‌های هر خانه و بلندیِ
 * هر ردیف. `measure(text, bold)` پهنای متن را به پیکسل می‌دهد.
 *
 * هیچ ستونی و هیچ ردیفی کنار نمی‌رود: اجتماعِ گروه‌ها همهٔ ستون‌هاست و هر
 * گروه همهٔ ردیف‌ها را دارد.
 */
export function layoutTable(model, measure, options = {}) {
  const o = { ...TABLE_IMAGE, ...options };
  const columns = model?.columns || [];
  const rows = model?.rows || [];
  const n = columns.length;
  if (!n) return { groups: [], rowCount: rows.length, columnCount: 0 };
  const natural = columns.map((col, i) => {
    let w = measure(col.label || '', true);
    for (const row of rows) if (!row.note) w = Math.max(w, measure(row.cells?.[i]?.text ?? ''));
    return Math.min(o.maxCol, Math.max(o.minCol, Math.ceil(w) + o.padX * 2));
  });
  const total = natural.reduce((a, b) => a + b, 0);
  let groups;
  if (total <= o.maxWidth || n === 1) groups = [[...Array(n).keys()]];
  else {
    // ستونِ اول (نامِ ردیف) کلید است و در هر بخش تکرار می‌شود.
    groups = [];
    let current = [0], width = natural[0];
    for (let i = 1; i < n; i += 1) {
      if (current.length > 1 && width + natural[i] > o.maxWidth) { groups.push(current); current = [0]; width = natural[0]; }
      current.push(i); width += natural[i];
    }
    groups.push(current);
  }
  const textW = (w) => Math.max(8, w - o.padX * 2);
  const out = groups.map((cols) => {
    const widths = cols.map((i) => natural[i]);
    const width = widths.reduce((a, b) => a + b, 0);
    const head = cols.map((i, k) => wrapText(columns[i].label || '', textW(widths[k]), (t) => measure(t, true)));
    const headH = Math.max(...head.map((lines) => lines.length)) * o.headLineH + o.padY * 2;
    const laid = rows.map((row) => {
      if (row.note != null) {
        const lines = wrapText(row.note, textW(width), measure);
        return { note: true, lines, h: lines.length * o.lineH + o.padY * 2 };
      }
      const cells = cols.map((i, k) => {
        const cell = row.cells?.[i] || { text: '' };
        return { lines: wrapText(cell.text, textW(widths[k]), measure), tone: cell.tone || '', numeric: Boolean(columns[i].numeric || cell.numeric), bold: Boolean(cell.bold) };
      });
      return { cells, h: Math.max(...cells.map((c) => c.lines.length)) * o.lineH + o.padY * 2 };
    });
    return { cols, widths, width, head, headH, rows: laid };
  });
  return { groups: out, rowCount: rows.length, columnCount: n };
}

/**
 * تقسیم به صفحه‌های تصویر. هر صفحه چند «تکه» دارد؛ هر تکه یک گروهِ ستونی و
 * بازه‌ای از ردیف‌هایش، با سرستونِ خودش. بلندیِ هر صفحه از `maxPageHeight`
 * نمی‌گذرد مگر یک ردیفِ تنها از آن بلندتر باشد.
 */
export function paginateTable(layout, options = {}) {
  const o = { ...TABLE_IMAGE, ...options };
  const banner = layout.groups.length > 1 ? o.headLineH + 10 : 0;
  const pages = [];
  let page = { blocks: [], height: 0 };
  const close = () => { if (page.blocks.length) pages.push(page); page = { blocks: [], height: 0 }; };
  layout.groups.forEach((group, gi) => {
    let start = 0;
    const fixed = banner + group.headH;
    if (page.height && page.height + fixed + (group.rows[0]?.h || 0) > o.maxPageHeight) close();
    let blockH = fixed;
    for (let r = 0; r < group.rows.length; r += 1) {
      const h = group.rows[r].h;
      if (r > start && page.height + blockH + h > o.maxPageHeight) {
        page.blocks.push({ group: gi, from: start, to: r, height: blockH });
        page.height += blockH;
        close();
        start = r; blockH = fixed;
      }
      blockH += h;
    }
    page.blocks.push({ group: gi, from: start, to: group.rows.length, height: blockH });
    page.height += blockH;
  });
  close();
  return pages;
}

// ═══ مدلِ جدولِ ایستا از DOM ═══

const cellText = (cell) => String(cell.innerText ?? cell.textContent ?? '')
  .replace(/\s*\n+\s*/g, ' — ').replace(/\s+/g, ' ').trim();
const toneOf = (cell) => {
  const cls = `${cell.className || ''} ${cell.parentElement?.className || ''}`;
  if (/\b(neg|loss|down)\b/.test(cls)) return 'neg';
  if (/\b(pos|gain|up)\b/.test(cls)) return 'pos';
  return '';
};
const looksNumeric = (text) => /^[−\-+]?[\d۰-۹٫٬,.\s٪%×]+$/.test(text) && /[\d۰-۹]/.test(text);
const visible = (el) => !el.hidden && (typeof getComputedStyle !== 'function' || getComputedStyle(el).display !== 'none');

/** `<table>` → همان مدلِ جدولِ مشترک. سرستونِ چندردیفه با «—» تخت می‌شود. */
export function domTableModel(table) {
  const headRows = [...(table.tHead?.rows || [])].filter(visible);
  const bodyRows = [...table.tBodies].flatMap((tb) => [...tb.rows])
    .filter((tr) => visible(tr) && !/\b(tbl-spacer|skel-row)\b/.test(tr.className || ''));
  if (!headRows.length && bodyRows[0] && [...bodyRows[0].cells].every((c) => c.tagName === 'TH')) headRows.push(bodyRows.shift());
  const width = Math.max(0, ...[...headRows, ...bodyRows].map((tr) => [...tr.cells].reduce((n, c) => n + (c.colSpan || 1), 0)));
  const labels = Array.from({ length: width }, () => []);
  for (const tr of headRows) {
    let at = 0;
    for (const cell of tr.cells) {
      const text = cellText(cell);
      for (let k = 0; k < (cell.colSpan || 1); k += 1) {
        if (text && labels[at + k] && labels[at + k].at(-1) !== text) labels[at + k].push(text);
      }
      at += cell.colSpan || 1;
    }
  }
  const numericCols = Array(width).fill(true);
  const rows = bodyRows.map((tr) => {
    const cells = [...tr.cells];
    if (cells.length === 1 && (cells[0].colSpan || 1) >= width && width > 1) return { note: cellText(cells[0]) };
    const out = [];
    for (const cell of cells) {
      const text = cellText(cell);
      const span = cell.colSpan || 1;
      for (let k = 0; k < span; k += 1) out.push({ text: k ? '' : text, tone: toneOf(cell), bold: cell.tagName === 'TH' });
    }
    while (out.length < width) out.push({ text: '' });
    out.forEach((c, i) => { if (c.text && !looksNumeric(c.text)) numericCols[i] = false; });
    return { cells: out.slice(0, width) };
  });
  return { columns: labels.map((parts, i) => ({ label: parts.join(' — '), numeric: numericCols[i] && rows.some((r) => r.cells?.[i]?.text) })), rows };
}

// ═══ کشیدن روی بوم ═══

/**
 * صفحه‌های تصویر را می‌سازد و بوم‌ها را برمی‌گرداند.
 * `theme`: { font, bg, panel2, line, ink, muted, gain, loss }
 */
export function drawTablePages(model, { title = '', theme, ratio = 2, options = {} } = {}) {
  const o = { ...TABLE_IMAGE, ...options };
  const probe = document.createElement('canvas').getContext('2d');
  const fontOf = (bold, size = o.fontSize) => `${bold ? 700 : 400} ${size}px ${theme.font}`;
  const measure = (text, bold) => { probe.font = fontOf(bold, bold ? o.headSize : o.fontSize); return probe.measureText(String(text)).width; };
  const layout = layoutTable(model, measure, o);
  const pages = paginateTable(layout, o);
  const titleH = title ? 40 : 0, footH = 30;
  return pages.map((page, pi) => {
    const W = Math.max(...page.blocks.map((b) => layout.groups[b.group].width)) + o.margin * 2;
    const H = titleH + page.height + footH + o.margin;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(W * ratio); canvas.height = Math.ceil(H * ratio);
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.fillStyle = theme.bg; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'top';
    if (title) {
      ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = theme.ink; ctx.font = fontOf(true, 16);
      ctx.fillText(title, W - o.margin, 12);
    }
    let y = titleH;
    for (const block of page.blocks) {
      const group = layout.groups[block.group];
      const right = W - o.margin, left = right - group.width;
      if (layout.groups.length > 1) {
        ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = theme.muted; ctx.font = fontOf(true, 12.5);
        ctx.fillText(`بخش ${faNum(block.group + 1)} از ${faNum(layout.groups.length)} ستون‌ها — ستونِ اول در هر بخش تکرار می‌شود`, right, y + 4);
        y += o.headLineH + 10;
      }
      // سرستون
      ctx.fillStyle = theme.panel2; ctx.fillRect(left, y, group.width, group.headH);
      let x = right;
      group.cols.forEach((_, k) => {
        const w = group.widths[k];
        ctx.fillStyle = theme.muted; ctx.font = fontOf(true, o.headSize); ctx.direction = 'rtl'; ctx.textAlign = 'right';
        group.head[k].forEach((line, li) => ctx.fillText(line, x - o.padX, y + o.padY + li * o.headLineH));
        x -= w;
      });
      y += group.headH;
      for (let r = block.from; r < block.to; r += 1) {
        const row = group.rows[r];
        if ((r - block.from) % 2 === 1) { ctx.globalAlpha = 0.55; ctx.fillStyle = theme.panel2; ctx.fillRect(left, y, group.width, row.h); ctx.globalAlpha = 1; }
        ctx.fillStyle = theme.line; ctx.fillRect(left, y + row.h - 1, group.width, 1);
        if (row.note) {
          ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = theme.muted; ctx.font = fontOf(false);
          row.lines.forEach((line, li) => ctx.fillText(line, right - o.padX, y + o.padY + li * o.lineH));
        } else {
          let cx = right;
          row.cells.forEach((cell, k) => {
            const w = group.widths[k];
            ctx.fillStyle = cell.tone === 'neg' ? theme.loss : cell.tone === 'pos' ? theme.gain : theme.ink;
            ctx.font = fontOf(cell.bold || (k === 0 && !cell.numeric));
            cell.lines.forEach((line, li) => {
              const ty = y + o.padY + li * o.lineH;
              if (cell.numeric) { ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.fillText(line, cx - w + o.padX, ty); }
              else { ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillText(line, cx - o.padX, ty); }
            });
            cx -= w;
          });
        }
        y += row.h;
      }
      y += 0;
    }
    ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = theme.muted; ctx.font = fontOf(false, 12);
    // جداکننده «،» است نه «·»: نقطهٔ میانی کنار رقم فارسی با صفرِ فارسی (۰)
    // یکی دیده می‌شد — «۲ ردیف · ۵ ستون» خوانده می‌شد «۲ ردیف ۰ ۵ ستون».
    const foot = `${faNum(layout.rowCount)} ردیف، ${faNum(layout.columnCount)} ستون${pages.length > 1 ? `، صفحهٔ ${faNum(pi + 1)} از ${faNum(pages.length)}` : ''}`;
    ctx.fillText(foot, W - o.margin, y + 9);
    return canvas;
  });
}

const faNum = (n) => fmt.int(n);
