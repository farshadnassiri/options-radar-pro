// خروجی چندبرگی Excel 2003 XML برای «نگاه باز»؛ بدون وابستگی npm.
// مقدارهای عددی Numeric می‌مانند تا فیلتر، جمع و نمودارسازی در اکسل کار کند.

import { historyDateLabel } from '../core/history.mjs';
import { stamp } from './export.mjs';

const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const clean = (value) => String(value ?? '').replace(BIDI, '').trim();
const xml = (value) => clean(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[char]));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const cell = (value, style = '') => {
  const numeric = finite(value);
  const shown = typeof value === 'number' && !numeric ? '' : (value ?? '');
  return `<Cell${style ? ` ss:StyleID="${style}"` : ''}><Data ss:Type="${numeric ? 'Number' : 'String'}">${xml(numeric ? value : shown)}</Data></Cell>`;
};
const row = (values, style = '') => `<Row>${values.map((value) => cell(value, style)).join('')}</Row>`;
const date = (value) => historyDateLabel(value);
const clock = (second) => {
  if (!Number.isFinite(Number(second))) return '';
  const h = Math.floor(Number(second) / 3600), m = Math.floor((Number(second) % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const METRIC_HEADERS = [
  'قیمت پایه', 'تغییر پایه ٪', 'سربه‌سر کال', 'تغییر سربه‌سر کال ٪', 'فاصله کال تا پایه', 'فاصله کال ٪', 'میانگین ۵روزه فاصله کال ٪',
  'سربه‌سر پوت', 'تغییر سربه‌سر پوت ٪', 'فاصله پایه تا پوت', 'فاصله پوت ٪', 'میانگین ۵روزه فاصله پوت ٪', 'پهنای باند سربه‌سر',
  'اعمال وزنی کال', 'اعمال وزنی پوت', 'پریمیوم وزنی کال', 'پریمیوم وزنی پوت',
  'IV وزنی کال ٪', 'میانگین ۵روزه IV کال ٪', 'تغییر IV کال (واحد درصد)', 'IV وزنی پوت ٪', 'میانگین ۵روزه IV پوت ٪', 'تغییر IV پوت (واحد درصد)',
  'ارزش کال', 'ارزش پوت', 'ارزش کال واردشده در IV', 'ارزش پوت واردشده در IV',
  'قرارداد کال', 'قرارداد پوت', 'ارزش پایه', 'حجم پایه',
];

const metricValues = (r) => [
  r.basePrice, r.baseChangePct, r.callBreakeven, r.callBreakevenChangePct, r.callBreakevenGap, r.callBreakevenGapPct, r.callBreakevenGapPctMa5,
  r.putBreakeven, r.putBreakevenChangePct, r.putBreakevenGap, r.putBreakevenGapPct, r.putBreakevenGapPctMa5, r.breakevenBand,
  r.callStrike, r.putStrike, r.callPremium, r.putPremium,
  r.callIvPct, r.callIvPctMa5, r.callIvChangePp, r.putIvPct, r.putIvPctMa5, r.putIvChangePp,
  r.callValue, r.putValue, r.callIvValue, r.putIvValue,
  r.callContracts, r.putContracts, r.baseValue, r.baseVolume,
];

function sheet(name, headers, rows, widths = []) {
  const columns = (widths.length ? widths : headers.map((_, index) => index < 2 ? 92 : 84))
    .map((width) => `<Column ss:Width="${width}"/>`).join('');
  return `<Worksheet ss:Name="${xml(name)}"><Table>${columns}${row(headers, 'Header')}${rows.map((values) => row(values)).join('')}</Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet>`;
}

function sheetParts(name, headers, rows, widths = []) {
  const size = 60000;
  const groups = rows.length ? Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size)) : [[]];
  return groups.map((group, index) => sheet(groups.length === 1 ? name : `${name.slice(0, 27)} ${index + 1}`, headers, group, widths));
}

function relationRows(matrix = []) {
  const labels = [...new Set(matrix.map((item) => item.rowLabel))];
  const header = ['متغیر', ...labels];
  const rows = labels.map((rowLabel) => [rowLabel, ...labels.map((columnLabel) => {
    const hit = matrix.find((item) => item.rowLabel === rowLabel && item.columnLabel === columnLabel);
    return hit?.value;
  })]);
  return { header, rows };
}

export function buildOpenViewWorkbook({ ua, daily, intraday, dailyRelations = [], intradayRelations = [], basis = 'CLOSE', intervalMinutes = 15, selectedExpiry = 0 } = {}) {
  const intradayRelation = relationRows(intradayRelations), dailyRelation = relationRows(dailyRelations);
  const dailyRows = (daily?.rows || []).map((r) => [date(r.date), ...metricValues(r)]);
  const dailyExpiryRows = (daily?.expiryRows || []).map((r) => [date(r.date), date(r.expiry), ...metricValues(r)]);
  const intervalRows = (intraday?.rows || []).map((r) => [date(r.date), clock(r.second), r.intervalMinutes, r.unknownCancel ? 'وضعیت ابطال برخی معاملات نامعلوم' : '', ...metricValues(r)]);
  const intervalExpiryRows = (intraday?.expiryRows || []).map((r) => [date(r.date), clock(r.second), date(r.expiry), ...metricValues(r)]);
  const contractHeaders = ['تاریخ', 'زمان', 'نماد قرارداد', 'نام قرارداد', 'نوع', 'سررسید', 'اعمال', 'پریمیوم', 'سربه‌سر', 'وزن شاخص ٪', 'IV ٪', 'وزن IV ٪', 'ارزش معامله', 'حجم', 'تعداد معامله', 'وارد شاخص شد', 'وضعیت ابطال نامعلوم'];
  const contractRow = (r) => [date(r.date), clock(r.second), r.ins, r.name, r.kind === 'call' ? 'کال' : 'پوت', date(r.expiry), r.strike, r.premium, r.breakeven, r.indexWeightPct, Number.isFinite(r.iv) ? r.iv * 100 : NaN, r.ivWeightPct, r.value, r.volume, r.trades, r.included ? 'بله' : 'خیر', r.unknownCancel ? 'بله' : 'خیر'];
  const cfg = daily?.settings || intraday?.settings || {};
  const guideRows = [
    ['موضوع', 'توضیح'],
    ['تعریف سربه‌سر کال', 'قیمت اعمال + پریمیوم مشاهده‌شده همان قرارداد. این عدد برای خرید یک قرارداد کال است.'],
    ['تعریف سربه‌سر پوت', 'قیمت اعمال − پریمیوم مشاهده‌شده همان قرارداد. این عدد برای خرید یک قرارداد پوت است.'],
    ['شاخص سربه‌سر وزنی', 'جمع (سربه‌سر هر قرارداد × ارزش معامله همان قرارداد) تقسیم بر جمع ارزش معامله قراردادهای معتبر.'],
    ['شاخص اعمال وزنی', 'همان وزن ارزش معامله، روی قیمت اعمال؛ برای جداکردن اثر جابه‌جایی تمرکز معاملات از اثر تغییر پریمیوم.'],
    ['IV وزنی', 'نوسان ضمنی بلک–شولز هر قرارداد با قیمت پایه همان مشاهده؛ وزن برابر ارزش معامله قراردادهایی است که IV معتبر دارند.'],
    ['میانگین ۵روزه', 'فقط وقتی پنج مشاهده روزانه معتبر و پیاپی وجود دارد ساخته می‌شود؛ روز گمشده با روز قدیمی‌تر جایگزین نمی‌شود.'],
    ['داده گمشده', 'قیمت یا ارزش گمشده با روز/بازه قبلی پر نشده و در محاسبه وارد نمی‌شود. خانه خالی به معنی نبود عدد معتبر است.'],
    ['وزن روزانه', 'فقط ارزش رسمی روزانه qTotCap. برآورد حجم × قیمت پایانی وارد شاخص نشده است.'],
    ['وزن درون‌روزی', 'قیمت معامله × تعداد × اندازه قرارداد در همان سطل زمانی. معامله ابطال‌شده کنار گذاشته می‌شود.'],
    ['قیمت پایه درون‌روزی', 'VWAP معاملات پایه در همان سطل؛ قیمت سطل قبلی حمل نمی‌شود.'],
    ['همبستگی', 'ضریب پیرسون روی جفت مشاهده‌های معتبر؛ همبستگی رابطه آماری است و علیت یا توصیه معامله نیست.'],
    ['محدودیت اجرا', 'قیمت‌های تاریخی و آخرین معامله، مظنه قابل اجرای هم‌زمان نیستند. این گزارش ابزار تحلیل است نه تضمین اجرا.'],
    ['نماد پایه', ua?.name || ''],
    ['کد نماد پایه', String(ua?.ins || '')],
    ['سررسید فعال هنگام خروجی', selectedExpiry ? date(selectedExpiry) : ''],
    ['مبنای قیمت روزانه', basis],
    ['تایم‌فریم درون‌روزی (دقیقه)', intervalMinutes],
    ['نرخ بدون ریسک سالانه', cfg.rFree],
    ['بازده نقدی سالانه', cfg.divYield],
    ['روز سال برای مدل', cfg.yearDays],
    ['کران پایین/بالای IV', `${cfg.ivLo ?? ''} / ${cfg.ivHi ?? ''}`],
  ];
  const summaryRows = [
    ['نماد پایه', ua?.name || ''], ['کد نماد پایه', String(ua?.ins || '')],
    ['تعداد ردیف روزانه', daily?.rows?.length || 0], ['تعداد ردیف روزانه-سررسید', daily?.expiryRows?.length || 0],
    ['تعداد مشاهده قراردادی روزانه', daily?.contractRows?.length || 0], ['تعداد ردیف بازه زمانی', intraday?.rows?.length || 0],
    ['تعداد ردیف بازه-سررسید', intraday?.expiryRows?.length || 0], ['تعداد مشاهده قراردادی درون‌روزی', intraday?.contractRows?.length || 0],
  ];

  const sheets = [
    sheet('راهنما', guideRows[0], guideRows.slice(1), [150, 560]),
    sheet('خلاصه', ['شاخص', 'مقدار'], summaryRows, [230, 180]),
    ...sheetParts('روزانه', ['تاریخ', ...METRIC_HEADERS], dailyRows),
    ...sheetParts('روزانه سررسید', ['تاریخ', 'سررسید', ...METRIC_HEADERS], dailyExpiryRows),
    ...sheetParts('قراردادهای روزانه', contractHeaders, (daily?.contractRows || []).map(contractRow)),
    ...sheetParts('بازه زمانی', ['تاریخ', 'زمان', 'دقیقه', 'هشدار داده', ...METRIC_HEADERS], intervalRows),
    ...sheetParts('بازه سررسید', ['تاریخ', 'زمان', 'سررسید', ...METRIC_HEADERS], intervalExpiryRows),
    ...sheetParts('قراردادهای بازه', contractHeaders, (intraday?.contractRows || []).map(contractRow)),
    sheet('همبستگی روزانه', dailyRelation.header, dailyRelation.rows),
    sheet('همبستگی بازه', intradayRelation.header, intradayRelation.rows),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
  <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
    <Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center" ss:ReadingOrder="RightToLeft"/><Font ss:FontName="Tahoma" ss:Size="10"/></Style><Style ss:ID="Header"><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Tahoma" ss:Size="10" ss:Bold="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style></Styles>
    ${sheets.join('')}</Workbook>`;
}

export function downloadOpenViewExcel(args) {
  const content = buildOpenViewWorkbook(args);
  const url = URL.createObjectURL(new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `negah-baz-${stamp()}.xls`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
