// دفترکار تب «خروجی دیتا»: یک برگ برای هر ابزار، بدون ادغام ریزمعامله‌ها.

import { DATA_EXPORT_KIND_LABEL, dataExportCoverageRows, dataExportTradeRows } from '../core/data-export.mjs';
import { tradeTimeLabel } from '../core/backtest.mjs';
import { sheet } from './xlsx.mjs';

const dateText = (value) => String(Math.trunc(Number(value) || 0));
const cancelText = (row) => row.canceledKnown ? (row.canceled ? 'باطل' : 'فعال') : 'نامعلوم';

export const DATA_EXPORT_HEADERS = [
  'تاریخ میلادی', 'ساعت', 'شماره معامله', 'قیمت (ریال)', 'حجم', 'ارزش خام (ریال)',
  'اندازه قرارداد', 'ارزش با اندازه قرارداد (ریال)', 'وضعیت ابطال', 'منبع',
];

export function buildDataExportSheets({ instruments = [], pairs = [], items = {}, range = {}, complete = false, note = '' } = {}) {
  const coverage = dataExportCoverageRows(instruments, pairs, items);
  const failed = coverage.filter((row) => row.status === 'خطا' || row.status === 'درخواست نرفت').length;
  const empty = coverage.filter((row) => row.status === 'بدون معامله').length;
  const summary = sheet('راهنما', ['شاخص', 'مقدار'], [
    ['از تاریخ', dateText(range.from)], ['تا تاریخ', dateText(range.to)],
    ['تعداد دارایی پایه', instruments.filter((item) => item.kind === 'underlying').length],
    ['تعداد قرارداد اختیار', instruments.filter((item) => item.kind !== 'underlying').length],
    ['جفت ابزار/روز', pairs.length], ['بدون معامله', empty], ['خطا یا دریافت‌نشده', failed],
    ['پوشش دفتر قراردادها', complete ? 'کامل' : 'ناقص — همه قراردادها تضمین نمی‌شود'],
    ['یادداشت منبع', note || '—'],
    ['تعریف ردیف', 'هر ردیف یک اجرای گزارش‌شده بورس است؛ یک اجرای حجمی به واحدهای منفرد شکسته نمی‌شود.'],
  ], [150, 430]);

  const coverageSheet = sheet('پوشش دریافت', [
    'نماد پایه', 'نماد ابزار', 'نوع', 'کد ابزار', 'تاریخ میلادی', 'کل ردیف',
    'فعال', 'باطل', 'وضعیت', 'منبع', 'خطا',
  ], coverage.map((row) => [
    row.baseName, row.name, DATA_EXPORT_KIND_LABEL[row.kind] || row.kind, row.ins, row.date,
    row.rows, row.active, row.canceled, row.status, row.source, row.error,
  ]), [100, 120, 95, 140, 95, 75, 65, 65, 100, 80, 260]);

  const instrumentSheets = instruments.map((instrument) => {
    const rows = dataExportTradeRows(instrument, pairs, items);
    if (rows.length > 1048575) throw new Error(`ریزمعاملهٔ ${instrument.name} از سقف یک شیت اکسل بیشتر است؛ بازه را کوتاه‌تر کن.`);
    const title = instrument.kind === 'underlying' ? `پایه ${instrument.name}` : instrument.name;
    return sheet(title, DATA_EXPORT_HEADERS, rows.map((row) => [
      row.date, tradeTimeLabel(row.time), row.sequence, row.price, row.quantity, row.rawValue,
      row.contractSize, row.contractValue, cancelText(row), row.source,
    ]), [95, 75, 85, 95, 80, 120, 95, 150, 90, 85]);
  });

  return [summary, coverageSheet, ...instrumentSheets];
}

export function dataExportFilename(range = {}) {
  return `options-data-${dateText(range.from)}-${dateText(range.to)}`;
}
