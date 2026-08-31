// خواندن xlsx بدون هیچ وابستگی.
//
// چرا لازم شد: کاربر فهرست دو سالهٔ قراردادها را به شکل xlsx داد و قاعدهٔ
// مخزن «صفر وابستگی npm» است. نوشتن xlsx از قبل بود (`ui/xlsx.mjs`)؛
// خواندنش نبود.
//
// xlsx یک فایل zip است با چند XML تو‌ش. همان دو کار اینجا انجام می‌شود و
// نه بیشتر: هرچه لازم نیست — قالب، فرمول، نمودار، تاریخِ سریالی — خوانده
// نمی‌شود. هدف، رساندنِ «ردیف‌ها به شکل شیء» است، نه بازسازی اکسل.
//
// ═══ مرزی که عمداً رد نمی‌شود ═══
//
// عددِ تاریخِ اکسل (سریال ۱۹۰۰) به تاریخ تبدیل نمی‌شود، چون تشخیصش به
// قالبِ سلول بند است و قالب را نمی‌خوانیم. سلولِ تاریخ اگر متن باشد متن
// می‌آید و اگر عدد باشد عدد — و مصرف‌کننده که می‌داند ستونش چیست، خودش
// تصمیم می‌گیرد. حدس زدنش یعنی ساختنِ تاریخی که در فایل نبود.

import zlib from 'node:zlib';

const u16 = (buf, at) => buf.readUInt16LE(at);
const u32 = (buf, at) => buf.readUInt32LE(at);

/**
 * باز کردن zip به نگاشتِ «نام → بایت».
 *
 * از فهرست مرکزی خوانده می‌شود، نه با گشتن دنبال امضای هدرِ محلی: بایتِ
 * `PK\x03\x04` می‌تواند داخل دادهٔ فشرده هم بیفتد و آن روش گاهی فایل
 * ساختگی می‌سازد.
 */
export function unzip(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('فایل zip نیست — امضای پایانی پیدا نشد');

  const count = u16(buf, eocd + 10);
  let at = u32(buf, eocd + 16);
  const files = new Map();

  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) break;
    const method = u16(buf, at + 10);
    const compressed = u32(buf, at + 20);
    const nameLen = u16(buf, at + 28);
    const extraLen = u16(buf, at + 30);
    const commentLen = u16(buf, at + 32);
    const local = u32(buf, at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);

    if (buf.readUInt32LE(local) === 0x04034b50) {
      const start = local + 30 + u16(buf, local + 26) + u16(buf, local + 28);
      const raw = buf.subarray(start, start + compressed);
      files.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** بازگرداندن نویسه‌های فراری XML. عددیِ ده‌دهی و شانزده‌دهی هم پشتیبانی می‌شود. */
export function unescapeXml(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (all, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[body] ?? all;
  });
}

/**
 * جدول رشته‌های مشترک.
 *
 * یک `<si>` می‌تواند چند `<t>` داشته باشد (متنی که وسطش قالبش عوض شده) و
 * همه باید به هم بچسبند. اگر فقط اولی خوانده شود، نامِ قرارداد از وسط
 * قیچی می‌شود — و آن نام، منبعِ قیمت اعمال و سررسید است.
 */
export function sharedStrings(xml) {
  if (!xml) return [];
  const out = [];
  for (const m of String(xml).matchAll(/<si\b(?:[^>]*?)\s*(?:\/>|>([\s\S]*?)<\/si>)/g)) {
    const body = m[1] ?? '';
    let text = '';
    for (const t of body.matchAll(/<t\b(?:[^>]*?)\s*(?:\/>|>([\s\S]*?)<\/t>)/g)) text += unescapeXml(t[1] ?? '');
    out.push(text);
  }
  return out;
}

/** «BC12» → ۵۴ (صفر-مبنا). ستون‌های دو و سه حرفی هم درست می‌شوند. */
export function columnIndex(ref) {
  const letters = String(ref).match(/^[A-Z]+/i);
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters[0].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * ردیف‌های یک برگه، به شکل آرایهٔ آرایه.
 *
 * سلولِ خالی در xlsx اصلاً نوشته نمی‌شود، پس جای هر سلول از `r` خودش
 * درمی‌آید نه از ترتیب. بدون این، یک ستونِ خالی همهٔ ستون‌های بعدی را یک
 * خانه جابه‌جا می‌کند و ستونِ «قیمت اعمال» می‌شود ستونِ «سررسید».
 */
export function sheetRows(xml, strings = []) {
  const rows = [];
  for (const rowMatch of String(xml || '').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    // ویژگی‌ها **تنبل** خوانده می‌شوند، و این تزیین نیست: با `[^>]*`
    // حریص، در `<c r="J2" t="inlineStr" />` خودِ `/` هم داخل ویژگی‌ها
    // می‌افتاد، شاخهٔ خودبسته رد می‌شد و `([\s\S]*?)<\/c>` تا `</c>`
    // سلولِ **بعدی** جلو می‌رفت. نتیجه‌اش در فایل واقعی کاربر دیده شد:
    // سه سلولِ خالی بلعیده شدند و آدرس TSETMC داخل ستون CIsin نشست.
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)\s*(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] || '', body = c[2] ?? '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/i) || [])[1] || '';
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || 'n';
      let value = null;
      if (type === 'inlineStr') {
        // سلولِ `<c t="inlineStr"/>` هیچ متنی ندارد — خالی است، نه رشتهٔ
        // خالی. تفاوتش را نگه می‌داریم چون «نداشت» با «داشت و تهی بود»
        // یکی نیست.
        for (const t of body.matchAll(/<t\b(?:[^>]*?)\s*(?:\/>|>([\s\S]*?)<\/t>)/g)) {
          value = (value ?? '') + unescapeXml(t[1] ?? '');
        }
      } else {
        const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        if (v) {
          const text = unescapeXml(v[1]);
          if (type === 's') value = strings[Number(text)] ?? '';
          else if (type === 'b') value = text === '1';
          else if (type === 'n') { const n = Number(text); value = Number.isFinite(n) ? n : text; }
          else value = text;
        }
      }
      const at = ref ? columnIndex(ref) : cells.length;
      cells[at >= 0 ? at : cells.length] = value;
    }
    rows.push([...cells].map((v) => (v === undefined ? null : v)));
  }
  return rows;
}

/** نام برگه‌ها به ترتیب کتاب، همراه مسیر XML هرکدام. */
export function sheetIndex(files) {
  const workbook = files.get('xl/workbook.xml')?.toString('utf8') || '';
  const relsXml = files.get('xl/_rels/workbook.xml.rels')?.toString('utf8') || '';
  const rels = new Map();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = (m[0].match(/Id="([^"]+)"/) || [])[1];
    const target = (m[0].match(/Target="([^"]+)"/) || [])[1];
    if (id && target) rels.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }
  const out = [];
  let n = 0;
  for (const m of workbook.matchAll(/<sheet\b[^>]*\/>/g)) {
    n += 1;
    const name = unescapeXml((m[0].match(/name="([^"]*)"/) || [])[1] || `Sheet${n}`);
    const rid = (m[0].match(/r:id="([^"]+)"/) || [])[1] || '';
    out.push({ name, path: rels.get(rid) || `xl/worksheets/sheet${n}.xml` });
  }
  return out;
}

/**
 * یک برگه به شکل آرایهٔ شیء، با سرستون‌های سطر اول.
 *
 * `sheet` می‌تواند نام باشد یا شماره؛ نبودنش خطا می‌دهد و با برگهٔ اول
 * جایگزین **نمی‌شود** — کسی که نام برگه را اشتباه نوشته، بهتر است بفهمد
 * تا اینکه بی‌صدا دادهٔ برگهٔ دیگری بگیرد.
 */
export function readXlsx(buffer, sheet = 0) {
  const files = unzip(buffer);
  const sheets = sheetIndex(files);
  if (!sheets.length) throw new Error('این کتاب هیچ برگه‌ای ندارد');
  const picked = typeof sheet === 'number' ? sheets[sheet] : sheets.find((s) => s.name === sheet);
  if (!picked) throw new Error(`برگهٔ «${sheet}» نیست. برگه‌ها: ${sheets.map((s) => s.name).join('، ')}`);

  const strings = sharedStrings(files.get('xl/sharedStrings.xml')?.toString('utf8'));
  const rows = sheetRows(files.get(picked.path)?.toString('utf8'), strings);
  if (!rows.length) return { sheet: picked.name, sheets: sheets.map((s) => s.name), header: [], rows: [] };

  const header = rows[0].map((h) => String(h ?? '').trim());
  const body = rows.slice(1).map((cells) => {
    const obj = {};
    for (let i = 0; i < header.length; i += 1) if (header[i]) obj[header[i]] = cells[i] ?? null;
    return obj;
  });
  return { sheet: picked.name, sheets: sheets.map((s) => s.name), header, rows: body };
}
