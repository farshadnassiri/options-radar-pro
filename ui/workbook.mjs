// دفترکار چندبرگی Excel 2003 XML — بدون هیچ وابستگی npm.
//
// این تکه‌ها تا امروز داخل `open-view-export.mjs` خصوصی بودند. با آمدن
// خروجی جامع بک‌تست، دو نسخه از یک قالب لازم می‌شد و دو نسخه با هم از هم
// دور می‌افتند: یکی BOM را عوض می‌کند، یکی عرض ستون را، و بعد دو فایل که
// باید هم‌شکل باشند در اکسل دو جور باز می‌شوند. پس یک پیاده‌سازی، دو
// مصرف‌کننده.
//
// چرا Excel 2003 XML و نه CSV: CSV یک برگ دارد. گزارش جامع، ده‌ها بخش دارد
// که ریختنشان در یک برگ با ردیف‌های جداکننده، فایلی می‌سازد که نه فیلتر
// می‌شود نه نمودار. و چرا نه xlsx واقعی: فرمتش zip است و بدون کتابخانه
// ساختنش یعنی نوشتن یک zip writer — که قاعدهٔ ۲-۱ را دور می‌زند نه رعایت.

const BIDI = /[‎‏‪-‮⁦-⁩]/g;

/**
 * نشانه‌های جهت‌دهی از خانه برداشته می‌شوند.
 *
 * آن‌ها فقط برای نمایش‌اند: می‌گویند «این تکه را جدا بخوان». در فایل اکسل
 * هیچ جهتی برای کنترل نیست و همان‌ها نویسهٔ نامرئی داخل خانه می‌مانند —
 * جست‌وجوی «ضهرم۷۰۵۸» دیگر پیدایش نمی‌کند.
 */
export const clean = (value) => String(value ?? '').replace(BIDI, '').trim();

export const xmlText = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[char]));

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * یک خانه.
 *
 * عددِ نبوده (NaN) خانهٔ **خالی** می‌شود، نه صفر و نه «NaN». قاعدهٔ ۲-۴ تا
 * داخل فایل ادامه دارد: کسی که ستون را در اکسل جمع می‌زند نباید صفرهایی را
 * بشمارد که هرگز مشاهده نشده‌اند.
 */
export const cell = (value, style = '') => {
  const numeric = finite(value);
  const shown = typeof value === 'number' && !numeric ? '' : (value ?? '');
  return `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="${numeric ? 'Number' : 'String'}">${xmlText(numeric ? value : shown)}</Data></Cell>`;
};

export const row = (values, style = '') => `<Row>${values.map((value) => cell(value, style)).join('')}</Row>`;

/** یک برگ، با سرستون منجمد تا پیمایش هزار ردیف، عنوان ستون را گم نکند. */
export function sheet(name, headers, rows, widths = []) {
  const columns = (widths.length ? widths : headers.map((_, index) => (index < 2 ? 92 : 84)))
    .map((width) => `<Column ss:Width="${width}"/>`).join('');
  return `<Worksheet ss:Name="${xmlText(name)}"><Table>${columns}${row(headers, 'Header')}${rows.map((values) => row(values)).join('')}</Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet>`;
}

/**
 * برگ‌های پشت سر هم برای داده‌ای که از سقف یک برگ می‌گذرد.
 *
 * اکسل ۲۰۰۳ در هر برگ ۶۵۵۳۶ ردیف جا دارد. ریزمعاملهٔ چند روز به‌راحتی از
 * این می‌گذرد و بی این تکه، ردیف‌های بعدی بی‌صدا می‌افتادند — بدترین حالت،
 * چون فایل باز می‌شود و سالم به‌نظر می‌رسد.
 */
export function sheetParts(name, headers, rows, widths = []) {
  const size = 60000;
  const groups = rows.length
    ? Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size))
    : [[]];
  return groups.map((group, index) => sheet(
    groups.length === 1 ? name : `${name.slice(0, 27)} ${index + 1}`, headers, group, widths,
  ));
}

/** برگ‌ها را در یک دفترکار می‌بندد. */
export function workbook(sheets) {
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center" ss:ReadingOrder="RightToLeft"/><Font ss:FontName="Tahoma" ss:Size="10"/></Style><Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style></Styles>
    ${sheets.join('')}</Workbook>`;
}

/** فایل را به کاربر می‌دهد. */
export function downloadWorkbook(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.xls`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
