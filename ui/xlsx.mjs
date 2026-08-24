// نویسندهٔ xlsx واقعی — بدون هیچ وابستگی npm.
//
// چرا این فایل هست: خروجی جامع گام سوم در قالب «Excel 2003 XML» نزدیک ۳۰
// مگابایت می‌شد. آن قالب متن خام و بدون فشرده‌سازی است و برای هر خانه یک
// عنصر کامل می‌نویسد — `<Cell><Data ss:Type="Number">123</Data></Cell>` یعنی
// شصت بایت برای سه رقم. روی چند صد هزار ردیف ریزمعامله، همین سربار خودش
// ده‌ها مگابایت است.
//
// xlsx سه صرفه‌جویی هم‌زمان دارد که هیچ‌کدام داده کم نمی‌کند:
//
//   ۱. خانهٔ عددی `<c r="A1"><v>123</v></c>` است، نه سه برابر آن.
//   ۲. رشته‌ها یک بار در `sharedStrings` می‌آیند و بقیه فقط شماره‌اش را
//      دارند؛ نام یک پا که در چهارصد هزار ردیف تکرار می‌شود، یک بار ذخیره
//      می‌شود.
//   ۳. خودِ بسته zip است. XML جدولی با نسبت حدود ده به یک فشرده می‌شود.
//
// و چرا نوشتنش قاعدهٔ ۲-۱ را نمی‌شکند: فشرده‌سازی از `CompressionStream` که
// خودِ سکو دارد می‌آید، نه از کتابخانه. چیزی که ما می‌نویسیم فقط پوشش
// zip است — چند ده خط سرآیند و فهرست مرکزی. اگر سکو `CompressionStream`
// نداشت، همان zip بدون فشرده‌سازی نوشته می‌شود: فایل بزرگ‌تر، ولی سالم و
// قابل باز شدن.

import { clean } from './workbook.mjs';

// ═══════════════════ ابزار ═══════════════════

const ENCODER = new TextEncoder();

// نویسه‌های کنترلی که XML 1.0 اصلاً نمی‌پذیرد. اگر یکی از این‌ها داخل نام
// یک قرارداد باشد، اکسل فایل را «خراب» اعلام می‌کند و کل خروجی از دست
// می‌رود — پس همین‌جا حذف می‌شوند، نه اینکه به شانس سپرده شوند.
const ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const esc = (value) => clean(value).replace(ILLEGAL, '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[char]));

/**
 * دمِ ممیز شناور را می‌چیند.
 *
 * `0.1 + 0.2` در جاوااسکریپت `0.30000000000000004` است. آن دنباله، هفده بایت
 * در فایل می‌گیرد و **هیچ** معنایی ندارد: نه قیمتی، نه یونانی‌ای و نه درصدی
 * در این برنامه ده رقم بامعنا ندارد. پس به ده رقم بامعنا گرد می‌شود.
 *
 * این خلاف قاعدهٔ ۲-۴ نیست: قاعده می‌گوید عدد نبوده را نساز. اینجا عدد
 * هست و همان عدد می‌ماند؛ فقط نویزِ نمایش دودویی که هرگز مشاهده نشده
 * نوشته نمی‌شود.
 */
export const tidy = (value) => {
  if (!Number.isFinite(value)) return NaN;
  if (value === 0) return 0;
  const rounded = Number(value.toPrecision(10));
  return Object.is(rounded, -0) ? 0 : rounded;
};

const LETTERS = [];
export function colName(index) {
  if (LETTERS[index]) return LETTERS[index];
  let n = index + 1, name = '';
  while (n > 0) { const rest = (n - 1) % 26; name = String.fromCharCode(65 + rest) + name; n = Math.floor((n - 1) / 26); }
  LETTERS[index] = name;
  return name;
}

/**
 * نام برگ را به قید اکسل می‌رساند.
 *
 * سقف ۳۱ نویسه و ممنوعیت `[]:*?/\` قید خودِ اکسل است. نام تکراری هم
 * پذیرفته نمی‌شود؛ و چون `sheetParts` برگ‌های هم‌نام می‌سازد، بی این
 * شماره‌گذاری فایل باز نمی‌شد.
 */
export function sheetName(raw, used = new Set()) {
  const base = (clean(raw) || 'برگ').replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'برگ';
  let name = base;
  for (let n = 2; used.has(name); n += 1) {
    const suffix = ` ${n}`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name);
  return name;
}

// ═══════════════════ توصیف برگ ═══════════════════
//
// برگ اینجا یک شیء ساده است نه رشتهٔ XML. دلیلش این است که همان توصیف باید
// هم به xlsx برود، هم — روزی که لازم شد — به هر قالب دیگری، بی‌آنکه سازندهٔ
// گزارش دوباره نوشته شود.

/** یک برگ. */
export function sheet(name, headers, rows, widths = []) {
  return { name, headers: headers || [], rows: rows || [], widths: widths || [] };
}

/**
 * برگ‌های پشت سر هم برای داده‌ای که از سقف یک برگ می‌گذرد.
 *
 * سقف xlsx بیش از یک میلیون ردیف است، ولی سقف را پایین‌تر — ۲۵۰ هزار —
 * نگه می‌داریم: برگی که از این بزرگ‌تر شود در اکسل عملاً باز نمی‌شود و
 * PivotTable رویش کار نمی‌کند، و هدف این فایل دقیقاً کار کردن روی آن است.
 */
export const SHEET_ROWS = 250000;
export function sheetParts(name, headers, rows, widths = []) {
  const list = rows || [];
  if (list.length <= SHEET_ROWS) return [sheet(name, headers, list, widths)];
  const groups = Array.from(
    { length: Math.ceil(list.length / SHEET_ROWS) },
    (_, index) => list.slice(index * SHEET_ROWS, (index + 1) * SHEET_ROWS),
  );
  return groups.map((group, index) => sheet(`${String(name).slice(0, 27)} ${index + 1}`, headers, group, widths));
}

// ═══════════════════ بخش‌های بستهٔ xlsx ═══════════════════

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** پهنای ستون در xlsx بر حسب نویسه است، در قالب قبلی بر حسب پونت بود. */
const widthChars = (points) => Math.max(8, Math.min(80, Math.round((Number(points) || 84) / 6)));

/**
 * یک برگ را به XML تبدیل می‌کند و رشته‌هایش را در جدول مشترک ثبت می‌کند.
 *
 * خانهٔ خالی اصلاً نوشته نمی‌شود. این هم صرفه‌جویی است و هم دقیقاً همان
 * چیزی که قاعدهٔ ۲-۴ می‌خواهد: خانهٔ نانوشته در اکسل «خالی» است، نه صفر —
 * جمع ستون رویش نمی‌افتد و میانگین هم آن را نمی‌شمارد.
 */
function sheetXml(part, strings) {
  const { headers, rows, widths } = part;
  const width = headers.length || (rows[0]?.length ?? 1);
  const cols = (widths.length ? widths : headers.map((_, index) => (index < 2 ? 92 : 84)))
    .map((points, index) => `<col min="${index + 1}" max="${index + 1}" width="${widthChars(points)}" customWidth="1"/>`).join('');

  const out = [];
  const writeRow = (values, index, style) => {
    const cells = [];
    for (let column = 0; column < values.length; column += 1) {
      const value = values[column];
      const ref = `${colName(column)}${index}`;
      const styled = style ? ` s="${style}"` : '';
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) continue;
        cells.push(`<c r="${ref}"${styled}><v>${tidy(value)}</v></c>`);
        continue;
      }
      const text = clean(value);
      if (!text) continue;
      let id = strings.map.get(text);
      if (id === undefined) { id = strings.list.length; strings.list.push(text); strings.map.set(text, id); }
      strings.count += 1;
      cells.push(`<c r="${ref}"${styled} t="s"><v>${id}</v></c>`);
    }
    out.push(`<row r="${index}">${cells.join('')}</row>`);
  };

  if (headers.length) writeRow(headers, 1, 1);
  for (let index = 0; index < rows.length; index += 1) writeRow(rows[index] || [], index + (headers.length ? 2 : 1), 0);

  const last = `${colName(Math.max(0, width - 1))}${Math.max(1, rows.length + (headers.length ? 1 : 0))}`;
  // `rightToLeft` جهت خودِ برگ است، نه جهت متن داخل خانه: بی آن، ستون اول
  // فارسی در سمت چپ می‌افتد و جدول برعکس خوانده می‌شود.
  const freeze = headers.length
    ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>' : '';
  return `${HEAD}<worksheet xmlns="${NS}" xmlns:r="${NS_REL}"><dimension ref="A1:${last}"/>`
    + `<sheetViews><sheetView rightToLeft="1" workbookViewId="0">${freeze}</sheetView></sheetViews>`
    + `<sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols>`
    + `<sheetData>${out.join('')}</sheetData>`
    + `${headers.length && rows.length ? `<autoFilter ref="A1:${last}"/>` : ''}</worksheet>`;
}

function stylesXml() {
  return `${HEAD}<styleSheet xmlns="${NS}">`
    + '<fonts count="2"><font><sz val="10"/><name val="Tahoma"/></font><font><b/><sz val="10"/><name val="Tahoma"/></font></fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

function sharedXml(strings) {
  // `xml:space="preserve"` لازم است وگرنه فاصلهٔ ابتدا و انتهای رشته در
  // بازخوانی می‌افتد و «کال ۱۲۰۰ » با «کال ۱۲۰۰» یکی می‌شود.
  return `${HEAD}<sst xmlns="${NS}" count="${strings.count}" uniqueCount="${strings.list.length}">${
    strings.list.map((text) => `<si><t xml:space="preserve">${esc(text)}</t></si>`).join('')}</sst>`;
}

// ═══════════════════ zip ═══════════════════

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) c = CRC_TABLE[(c ^ bytes[index]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const pack = async (bytes, format) => new Uint8Array(await new Response(
  new Blob([bytes]).stream().pipeThrough(new CompressionStream(format)),
).arrayBuffer());

/**
 * دادهٔ zlib را به deflate خام تبدیل می‌کند.
 *
 * جریان zlib یعنی دو بایت سرآیند، بعد دقیقاً همان deflate خام، بعد چهار
 * بایت adler32. zip دومی را می‌خواهد و سرآیند و دنباله را نمی‌فهمد؛ پس
 * کنده می‌شوند.
 *
 * سرآیند بررسی می‌شود نه فرض: بایت اول باید روش deflate را بگوید و بیت
 * FDICT باید خاموش باشد، وگرنه چهار بایت شناسهٔ واژه‌نامه هم وسط است و
 * بریدنِ کورکورانه، دادهٔ خراب می‌ساخت — فایلی که باز می‌شود و محتوایش
 * آشغال است، از فایلی که باز نمی‌شود بدتر است.
 */
export function stripZlib(packed) {
  if (!packed || packed.length <= 6) return null;
  if ((packed[0] & 0x0F) !== 8) return null;
  if (packed[1] & 0x20) return null;
  return packed.slice(2, packed.length - 4);
}

/**
 * فشرده‌سازی با موتور خودِ سکو. اگر نبود، `null` یعنی «بدون فشرده‌سازی بنویس».
 *
 * دو مسیر، و مسیر دوم اضافه‌کاری نیست: `deflate-raw` تازه است — نود از
 * ۲۱٫۲ داردش، فایرفاکس از ۱۱۳، سافاری از ۱۶٫۴. روی هر چیزی قدیمی‌تر
 * استثنا می‌داد و کل فایل بی‌فشرده نوشته می‌شد؛ کاربر به‌جای پانزده برابر
 * کوچک‌تر، دو برابر کوچک‌تر می‌گرفت و هیچ‌جا هم نمی‌فهمید چرا.
 *
 * `deflate` ساده اما همه‌جا هست، و تفاوتش با `deflate-raw` فقط شش بایت
 * پوششِ zlib است که `stripZlib` برمی‌دارد. یعنی همان فشرده‌سازی، روی
 * سکوهای بسیار بیشتر.
 */
export async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const packed = await pack(bytes, 'deflate-raw');
    return packed.length < bytes.length ? packed : null;
  } catch { /* سکو این قالب را ندارد؛ مسیر دوم */ }
  try {
    const raw = stripZlib(await pack(bytes, 'deflate'));
    return raw && raw.length < bytes.length ? raw : null;
  } catch { return null; }
}

const u16 = (n) => [n & 0xFF, (n >>> 8) & 0xFF];
const u32 = (n) => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

/** بسته‌بندی zip؛ نام‌ها همه ASCII‌اند پس پرچم UTF-8 لازم نیست. */
export async function zip(files) {
  const now = new Date();
  const time = ((now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)) & 0xFFFF;
  const day = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

  const parts = [], central = [];
  let offset = 0;
  for (const file of files) {
    const raw = typeof file.data === 'string' ? ENCODER.encode(file.data) : file.data;
    const packed = await deflateRaw(raw);
    const body = packed || raw;
    const method = packed ? 8 : 0;
    const name = ENCODER.encode(file.name);
    const sum = crc32(raw);
    const head = Uint8Array.from([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method), ...u16(time), ...u16(day),
      ...u32(sum), ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...name,
    ]);
    parts.push(head, body);
    central.push(Uint8Array.from([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method), ...u16(time), ...u16(day),
      ...u32(sum), ...u32(body.length), ...u32(raw.length), ...u16(name.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name,
    ]));
    offset += head.length + body.length;
  }

  const dirSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = Uint8Array.from([
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length),
    ...u32(dirSize), ...u32(offset), ...u16(0),
  ]);

  const all = [...parts, ...central, end];
  const total = all.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const item of all) { out.set(item, at); at += item.length; }
  return out;
}

// ═══════════════════ ساخت دفترکار ═══════════════════

/** برگ‌ها را به یک بستهٔ xlsx تبدیل می‌کند. */
export async function buildXlsx(sheets) {
  const used = new Set();
  const parts = (sheets || []).filter(Boolean).map((part) => ({ ...part, name: sheetName(part.name, used) }));
  if (!parts.length) parts.push(sheet('خالی', ['—'], []));

  const strings = { list: [], map: new Map(), count: 0 };
  const bodies = parts.map((part) => sheetXml(part, strings));

  const rels = parts.map((_, index) => `<Relationship Id="rId${index + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  const types = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
    + parts.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '</Types>';

  const files = [
    { name: '[Content_Types].xml', data: types },
    {
      name: '_rels/.rels',
      data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `${HEAD}<workbook xmlns="${NS}" xmlns:r="${NS_REL}"><sheets>${
        parts.map((part, index) => `<sheet name="${esc(part.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}`
        + `<Relationship Id="rId${parts.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>`
        + `<Relationship Id="rId${parts.length + 2}" Type="${NS_REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', data: stylesXml() },
    { name: 'xl/sharedStrings.xml', data: sharedXml(strings) },
    ...bodies.map((body, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, data: body })),
  ];
  return zip(files);
}

/** فایل را به کاربر می‌دهد. */
export async function downloadXlsx(name, sheets) {
  const bytes = await buildXlsx(sheets);
  const url = URL.createObjectURL(new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return bytes.length;
}
